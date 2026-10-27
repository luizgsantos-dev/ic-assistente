"""Linha de comando do IC-Assistant (Fase 1: ingestão, busca, perguntas e avaliação)."""

import json
from dataclasses import asdict
from datetime import date, datetime
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table
from sqlalchemy import func, select

from .config import RAIZ_REPO, Settings, get_settings
from .db import sessao

app = typer.Typer(
    help="IC-Assistant: assistente do Instituto de Computação da UFMT.", no_args_is_help=True
)
console = Console()

PASTA_BACKEND = Path(__file__).resolve().parents[1]


def _data(valor: str | None) -> date | None:
    if not valor:
        return None
    for formato in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(valor, formato).date()
        except ValueError:
            pass
    raise typer.BadParameter(f"data inválida: {valor} (use dd/mm/aaaa)")


def _embedder(settings: Settings):
    from .embeddings import EmbedderLocal

    return EmbedderLocal(settings.embedding_model, settings.embedding_dim)


def _cliente(settings: Settings):
    from .llm import criar_cliente

    cliente = criar_cliente(settings)
    # O SDK só reclama da falta de credencial na primeira chamada; melhor avisar antes.
    if not (cliente.api_key or cliente.auth_token or cliente.credentials):
        console.print("[red]Não achei a chave da API da Anthropic.[/]")
        console.print("Defina ANTHROPIC_API_KEY no arquivo .env na raiz do repositório.")
        raise typer.Exit(1)
    return cliente


@app.command()
def migrar() -> None:
    """Cria ou atualiza as tabelas do banco."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(PASTA_BACKEND / "alembic.ini")), "head")
    console.print("[green]Banco atualizado.[/]")


@app.command()
def servidor(
    host: Annotated[str, typer.Option(help="Use 0.0.0.0 para aceitar conexões de fora.")] = (
        "127.0.0.1"
    ),
    porta: Annotated[int, typer.Option()] = 8000,
    recarregar: Annotated[bool, typer.Option(help="Reinicia ao salvar o código.")] = False,
) -> None:
    """Sobe a API web."""
    import uvicorn

    uvicorn.run("app.api.app:criar_app", factory=True, host=host, port=porta, reload=recarregar)


@app.command()
def admin(
    email: str,
    remover: Annotated[bool, typer.Option(help="Tira o acesso de admin.")] = False,
) -> None:
    """Dá (ou tira) acesso de secretaria a um usuário já cadastrado."""
    from .models import Usuario

    with sessao() as s:
        usuario = s.scalar(select(Usuario).where(Usuario.email == email.lower()))
        if usuario is None:
            raise typer.BadParameter(f"nenhum usuário com o e-mail {email}")
        usuario.papel = "usuario" if remover else "admin"
        s.commit()
    console.print(f"[green]{email} agora é {usuario.papel}.[/]")


@app.command()
def ingerir(
    caminhos: Annotated[list[Path], typer.Argument(exists=True, help="Arquivos ou pastas.")],
    categoria: Annotated[
        str, typer.Option(help="calendario, ppc, resolucao, edital, evento, faq, geral...")
    ] = "geral",
    data: Annotated[str | None, typer.Option(help="Data do documento (dd/mm/aaaa).")] = None,
    titulo: Annotated[str | None, typer.Option(help="Título (só para um arquivo).")] = None,
    forcar: Annotated[bool, typer.Option(help="Reprocessa mesmo se já foi ingerido.")] = False,
) -> None:
    """Lê documentos e adiciona ao banco."""
    from .ingestao.pipeline import ingerir_arquivo, listar_arquivos
    from .ingestao.transcricao import transcrever_pdf

    settings = get_settings()
    arquivos = listar_arquivos(caminhos)
    if titulo and len(arquivos) > 1:
        raise typer.BadParameter("--titulo só pode ser usado com um arquivo")
    data_documento = _data(data)
    embedder = _embedder(settings)
    cliente = None

    def transcritor(caminho: Path):
        nonlocal cliente
        cliente = cliente or _cliente(settings)
        console.print(f"  [dim]transcrevendo {caminho.name} com o Claude...[/]")
        return transcrever_pdf(caminho, cliente, settings)

    falhas = 0
    with sessao() as s:
        for caminho in arquivos:
            try:
                r = ingerir_arquivo(
                    s,
                    caminho,
                    embedder,
                    settings,
                    titulo=titulo,
                    categoria=categoria,
                    data_documento=data_documento,
                    transcritor=transcritor,
                    forcar=forcar,
                )
            except Exception as e:
                falhas += 1
                console.print(f"[red]✗[/] {caminho.name}: {e}")
                continue
            if not r.novo:
                console.print(f"[dim]= {caminho.name} já estava no banco (id {r.documento.id})[/]")
                continue
            n = len(r.documento.trechos)
            console.print(f"[green]✓[/] {caminho.name} → id {r.documento.id}, {n} trechos")
            for aviso in r.avisos:
                console.print(f"  [yellow]![/] {aviso}")
    if falhas:
        raise typer.Exit(1)


@app.command()
def documentos() -> None:
    """Lista os documentos no banco."""
    from .models import Documento, Trecho

    with sessao() as s:
        linhas = s.execute(
            select(Documento, func.count(Trecho.id))
            .outerjoin(Trecho)
            .group_by(Documento.id)
            .order_by(Documento.categoria, Documento.data_documento.desc().nulls_last())
        ).all()
    tabela = Table("id", "título", "categoria", "data", "status", "trechos", "substituído por")
    for doc, n in linhas:
        tabela.add_row(
            str(doc.id),
            doc.titulo,
            doc.categoria,
            doc.data_documento.strftime("%d/%m/%Y") if doc.data_documento else "—",
            doc.status if doc.status != "erro" else f"[red]erro: {doc.erro}[/]",
            str(n),
            str(doc.substituido_por_id or ""),
        )
    console.print(tabela)


@app.command()
def substituir(antigo: int, novo: int) -> None:
    """Marca que o documento NOVO substitui o ANTIGO (o antigo sai da busca)."""
    from .ingestao.pipeline import substituir as marcar

    with sessao() as s:
        marcar(s, antigo, novo)
    console.print(f"[green]Documento {antigo} agora é substituído pelo {novo}.[/]")


@app.command()
def remover(
    documento_id: int,
    sim: Annotated[bool, typer.Option("--sim", help="Não pede confirmação.")] = False,
) -> None:
    """Apaga um documento e seus trechos do banco."""
    from .models import Documento

    with sessao() as s:
        doc = s.get(Documento, documento_id)
        if doc is None:
            raise typer.BadParameter(f"documento {documento_id} não existe")
        if not sim and not typer.confirm(f"Apagar '{doc.titulo}'?"):
            raise typer.Abort()
        s.delete(doc)
        s.commit()
    console.print("[green]Removido.[/]")


@app.command()
def buscar(pergunta: str) -> None:
    """Mostra os trechos que a busca encontra, sem chamar o Claude (não tem custo)."""
    from .busca import buscar as buscar_trechos

    settings = get_settings()
    with sessao() as s:
        trechos = buscar_trechos(s, pergunta, _embedder(settings), settings)
    if not trechos:
        console.print("[yellow]Nenhum trecho relevante.[/]")
    for i, t in enumerate(trechos, start=1):
        sim = f"{t.similaridade:.2f}" if t.similaridade is not None else "—"
        console.rule(
            f"{i}. {t.titulo} {t.paginas or ''} | rrf {t.score:.4f} | cosseno {sim} | "
            f"texto {'sim' if t.achado_por_texto else 'não'}"
        )
        if t.secao:
            console.print(f"[dim]{t.secao}[/]")
        console.print(t.conteudo[:600] + ("…" if len(t.conteudo) > 600 else ""))


@app.command()
def perguntar(
    pergunta: str,
    fontes: Annotated[bool, typer.Option(help="Mostra os trechos citados.")] = False,
    hoje: Annotated[
        str | None, typer.Option(help="Simula outra data de hoje (dd/mm/aaaa).")
    ] = None,
) -> None:
    """Responde uma pergunta usando os documentos."""
    from .busca import buscar as buscar_trechos
    from .llm import custo_estimado
    from .resposta import responder

    settings = get_settings()
    cliente = _cliente(settings)
    with sessao() as s:
        trechos = buscar_trechos(s, pergunta, _embedder(settings), settings)
    r = responder(pergunta, trechos, cliente, settings, hoje=_data(hoje))
    console.print(Markdown(r.texto))
    if fontes:
        for c in r.citacoes:
            console.print(
                f"[cyan]• {c.titulo} {c.paginas or ''}[/]: [dim]{c.texto_citado[:200]}[/]"
            )
    custo = custo_estimado(r.modelo or settings.llm_model, r.uso) if r.uso else None
    rodape = f"{r.motivo} | {len(trechos)} trechos | {len(r.citacoes)} citações"
    if custo is not None:
        rodape += f" | ~US$ {custo:.4f}"
    console.print(f"[dim]{rodape}[/]")


@app.command()
def avaliar(
    arquivo: Annotated[Path, typer.Option(exists=True)] = RAIZ_REPO / "evals" / "perguntas.yaml",
) -> None:
    """Roda as perguntas de teste e mede acertos e invenções. Tem custo de API."""
    from .avaliacao import carregar_casos, rodar
    from .llm import custo_estimado

    settings = get_settings()
    casos, pendentes = carregar_casos(arquivo)
    if pendentes:
        console.print(
            f"[yellow]{len(pendentes)} perguntas sem resposta esperada, puladas:[/] "
            + ", ".join(pendentes)
        )
    if not casos:
        console.print("Nenhuma pergunta pronta para avaliar.")
        raise typer.Exit(1)

    def mostrar(r) -> None:
        marca = "[green]✓[/]" if r.passou else "[red]✗[/]"
        extra = " [red](inventou)[/]" if r.veredito.inventou else ""
        console.print(f"{marca} {r.caso.id}{extra}: [dim]{r.veredito.justificativa}[/]")

    with sessao() as s:
        resultados = rodar(casos, s, _embedder(settings), _cliente(settings), settings, mostrar)

    passou = sum(r.passou for r in resultados)
    inventou = sum(r.veredito.inventou for r in resultados)
    custo = sum(
        (custo_estimado(settings.llm_model, r.resposta.uso) or 0)
        + (custo_estimado(settings.judge_model, r.uso_juiz) or 0)
        for r in resultados
    )
    console.rule()
    console.print(
        f"[bold]{passou}/{len(resultados)} certas[/] | {inventou} com invenção | "
        f"~US$ {custo:.2f} | modelo {settings.llm_model}"
    )

    pasta = RAIZ_REPO / "evals" / "resultados"
    pasta.mkdir(parents=True, exist_ok=True)
    saida = pasta / f"{datetime.now():%Y-%m-%d_%H%M%S}.json"
    saida.write_text(
        json.dumps(
            {
                "modelo": settings.llm_model,
                "certas": passou,
                "total": len(resultados),
                "com_invencao": inventou,
                "custo_estimado_usd": round(custo, 4),
                "casos": [
                    {
                        "id": r.caso.id,
                        "pergunta": r.caso.pergunta,
                        "passou": r.passou,
                        "veredito": r.veredito.model_dump(),
                        "resposta": r.resposta.texto,
                        "motivo": r.resposta.motivo,
                        "citacoes": [asdict(c) for c in r.resposta.citacoes],
                        "trechos": [t.trecho_id for t in r.resposta.trechos],
                    }
                    for r in resultados
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    console.print(f"[dim]Detalhes em {saida}[/]")
