"""Painel da secretaria: documentos, pendências, uso e usuários. Só para admins.

As conversas das pessoas não aparecem aqui. As pendências mostram só o par pergunta/resposta,
sem nada que identifique quem perguntou.
"""

import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, aliased

from ..atendimento import inicio_do_dia
from ..config import Settings
from ..ingestao.leitura import EXTENSOES_SUPORTADAS
from ..ingestao.pipeline import apagar_arquivos, caminho_guardado, registrar_documento
from ..llm import custo_estimado
from ..models import CATEGORIAS, Documento, Mensagem, Sessao, Trecho, Usuario
from ..resposta import hoje_local
from ..seguranca import VALIDADE_TOKEN_SENHA, agora, criar_token_senha
from .deps import Admin, Config, Db, protecao_csrf
from .esquemas import (
    DocumentoEdicao,
    DocumentoSaida,
    LinkSenhaSaida,
    PendenciaSaida,
    TrechoSaida,
    UsoDia,
    UsoSaida,
    UsuarioAdminSaida,
    UsuarioEdicao,
)

router = APIRouter(prefix="/api/painel", tags=["painel"], dependencies=[Depends(protecao_csrf)])

MOTIVOS_SEM_RESPOSTA = ("sem_trechos", "sem_citacoes")


# --- documentos ---


def _listar(db: Session, ids: list[int] | None = None) -> list[DocumentoSaida]:
    contagem = (
        select(Trecho.documento_id, func.count().label("n"))
        .group_by(Trecho.documento_id)
        .subquery()
    )
    substituto = aliased(Documento)
    consulta = (
        select(Documento, func.coalesce(contagem.c.n, 0), substituto.titulo, Usuario.nome)
        .outerjoin(contagem, contagem.c.documento_id == Documento.id)
        .outerjoin(substituto, substituto.id == Documento.substituido_por_id)
        .outerjoin(Usuario, Usuario.id == Documento.enviado_por_id)
        .order_by(Documento.criado_em.desc(), Documento.id.desc())
        # O processamento roda em outra sessão; sem isso viria o status antigo.
        .execution_options(populate_existing=True)
    )
    if ids is not None:
        consulta = consulta.where(Documento.id.in_(ids))
    return [
        DocumentoSaida(
            id=d.id,
            titulo=d.titulo,
            arquivo=d.arquivo,
            categoria=d.categoria,
            data_documento=d.data_documento,
            data_origem=d.data_origem,
            status=d.status,
            erro=d.erro,
            avisos=d.avisos or [],
            paginas=d.paginas,
            trechos=n,
            transcrito_por_ia=d.transcrito_por_ia,
            substituido_por_id=d.substituido_por_id,
            substituido_por_titulo=titulo_substituto,
            tamanho_bytes=d.tamanho_bytes,
            enviado_por=nome,
            criado_em=d.criado_em,
        )
        for d, n, titulo_substituto, nome in db.execute(consulta)
    ]


def _documento(db: Session, documento_id: int) -> Documento:
    doc = db.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "Documento não encontrado.")
    return doc


def _validar_categoria(categoria: str) -> None:
    if categoria not in CATEGORIAS:
        raise HTTPException(400, f"Categoria desconhecida: {categoria}.")


@router.get("/documentos")
def listar_documentos(_: Admin, db: Db) -> list[DocumentoSaida]:
    return _listar(db)


@router.post("/documentos", status_code=202)
def enviar_documentos(
    request: Request,
    admin: Admin,
    db: Db,
    settings: Config,
    arquivos: Annotated[list[UploadFile], File()],
    categoria: Annotated[str, Form()] = "geral",
    data_documento: Annotated[date | None, Form()] = None,
    titulo: Annotated[str | None, Form()] = None,
) -> list[DocumentoSaida]:
    """Guarda os arquivos e coloca na fila; o processamento continua em segundo plano."""
    _validar_categoria(categoria)
    if titulo and len(arquivos) > 1:
        raise HTTPException(400, "O título só pode ser informado quando vai um arquivo só.")

    enviados: list[tuple[int, bool]] = []
    for arquivo in arquivos:
        nome = Path(arquivo.filename or "arquivo").name
        if Path(nome).suffix.lower() not in EXTENSOES_SUPORTADAS:
            raise HTTPException(400, f"{nome}: formato não suportado (use PDF, DOCX, MD ou TXT).")
        temporario = _salvar_temporario(arquivo, nome, settings)
        try:
            doc, novo = registrar_documento(
                db,
                temporario,
                settings,
                nome_original=nome,
                titulo=titulo,
                categoria=categoria,
                data_documento=data_documento,
                enviado_por_id=admin.id,
            )
        finally:
            temporario.unlink(missing_ok=True)
        if novo:
            request.app.state.fila.enfileirar(doc.id)
        enviados.append((doc.id, not novo))

    por_id = {d.id: d for d in _listar(db, [i for i, _ in enviados])}
    return [por_id[i].model_copy(update={"ja_existia": ja}) for i, ja in enviados]


def _salvar_temporario(arquivo: UploadFile, nome: str, settings: Settings) -> Path:
    limite = settings.tamanho_maximo_mb * 1024 * 1024
    pasta = Path(settings.pasta_arquivos) / "envios"
    pasta.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=pasta, suffix=Path(nome).suffix, delete=False) as tmp:
        caminho = Path(tmp.name)
        total = 0
        while bloco := arquivo.file.read(1024 * 1024):
            total += len(bloco)
            if total > limite:
                break
            tmp.write(bloco)
    if total > limite:
        caminho.unlink(missing_ok=True)
        raise HTTPException(413, f"{nome} passa de {settings.tamanho_maximo_mb} MB.")
    return caminho


@router.patch("/documentos/{documento_id}")
def editar_documento(
    documento_id: int, edicao: DocumentoEdicao, _: Admin, db: Db
) -> DocumentoSaida:
    doc = _documento(db, documento_id)
    dados = edicao.model_dump(exclude_unset=True)

    if dados.get("titulo"):
        novo, antigo = dados["titulo"].strip(), doc.titulo
        if novo != antigo:
            # O título entra no contexto de cada trecho (busca por palavra). O embedding só
            # pega o título novo se o documento for reprocessado.
            for t in db.scalars(select(Trecho).where(Trecho.documento_id == doc.id)):
                if t.contexto.startswith(antigo):
                    t.contexto = novo + t.contexto[len(antigo) :]
            doc.titulo = novo
    if "categoria" in dados:
        _validar_categoria(dados["categoria"] or "")
        doc.categoria = dados["categoria"]
    if "data_documento" in dados:
        doc.data_documento = dados["data_documento"]
        doc.data_origem = "informada" if doc.data_documento else None
        doc.avisos = [
            a
            for a in doc.avisos or []
            if not (a.startswith("data ") or a.startswith("documento sem data"))
        ]
    if "substituido_por_id" in dados:
        alvo = dados["substituido_por_id"]
        if alvo is not None:
            outro = db.get(Documento, alvo)
            if outro is None or alvo == doc.id:
                raise HTTPException(400, "Escolha outro documento como substituto.")
            if outro.substituido_por_id == doc.id:
                raise HTTPException(400, "Os dois documentos não podem substituir um ao outro.")
        doc.substituido_por_id = alvo
    db.commit()
    return _listar(db, [doc.id])[0]


@router.post("/documentos/{documento_id}/reprocessar", status_code=202)
def reprocessar_documento(documento_id: int, request: Request, _: Admin, db: Db) -> DocumentoSaida:
    doc = _documento(db, documento_id)
    if doc.status in ("pendente", "processando"):
        raise HTTPException(409, "Este documento já está na fila.")
    doc.status, doc.erro = "pendente", None
    db.commit()
    request.app.state.fila.enfileirar(doc.id)
    return _listar(db, [doc.id])[0]


@router.delete("/documentos/{documento_id}", status_code=204)
def apagar_documento(documento_id: int, _: Admin, db: Db, settings: Config) -> None:
    doc = _documento(db, documento_id)
    apagar_arquivos(doc, settings)
    db.delete(doc)
    db.commit()


@router.get("/documentos/{documento_id}/trechos")
def trechos_do_documento(documento_id: int, _: Admin, db: Db) -> list[TrechoSaida]:
    _documento(db, documento_id)
    trechos = db.scalars(
        select(Trecho).where(Trecho.documento_id == documento_id).order_by(Trecho.ordem)
    )
    return [TrechoSaida.model_validate(t) for t in trechos]


@router.get("/documentos/{documento_id}/arquivo")
def baixar_original(documento_id: int, _: Admin, db: Db, settings: Config) -> FileResponse:
    doc = _documento(db, documento_id)
    caminho = caminho_guardado(doc, settings)
    if not doc.caminho_arquivo or not caminho.exists():
        raise HTTPException(404, "O arquivo original não está guardado.")
    return FileResponse(caminho, filename=doc.arquivo)


# --- pendências e uso ---


def _desde(settings: Settings, dias: int) -> datetime:
    return inicio_do_dia(settings) - timedelta(days=dias - 1)


@router.get("/pendencias")
def pendencias(
    _: Admin,
    db: Db,
    settings: Config,
    tipo: Literal["todas", "sem_resposta", "negativas"] = "todas",
    dias: Annotated[int, Query(ge=1, le=365)] = 30,
) -> list[PendenciaSaida]:
    pergunta = aliased(Mensagem)
    texto_pergunta = (
        select(pergunta.conteudo)
        .where(
            pergunta.conversa_id == Mensagem.conversa_id,
            pergunta.id < Mensagem.id,
            pergunta.papel == "usuario",
        )
        .order_by(pergunta.id.desc())
        .limit(1)
        .correlate(Mensagem)
        .scalar_subquery()
    )
    sem_resposta = Mensagem.motivo.in_(MOTIVOS_SEM_RESPOSTA)
    negativa = Mensagem.avaliacao == -1
    filtro = {
        "sem_resposta": sem_resposta,
        "negativas": negativa,
        "todas": or_(sem_resposta, negativa),
    }[tipo]
    linhas = db.execute(
        select(
            Mensagem.id,
            texto_pergunta,
            Mensagem.conteudo,
            Mensagem.motivo,
            Mensagem.avaliacao,
            Mensagem.criada_em,
        )
        .where(Mensagem.papel == "assistente", Mensagem.criada_em >= _desde(settings, dias), filtro)
        .order_by(Mensagem.id.desc())
        .limit(300)
    ).all()
    return [
        PendenciaSaida(mensagem_id=i, pergunta=p, resposta=r, motivo=m, avaliacao=a, criada_em=c)
        for i, p, r, m, a, c in linhas
    ]


@router.get("/uso")
def uso(
    _: Admin, db: Db, settings: Config, dias: Annotated[int, Query(ge=1, le=365)] = 30
) -> UsoSaida:
    desde = _desde(settings, dias)
    no_periodo = Mensagem.criada_em >= desde
    dia = func.date(func.timezone(settings.fuso_horario, Mensagem.criada_em)).label("dia")
    linhas = db.execute(
        select(
            dia,
            func.count().filter(Mensagem.papel == "usuario"),
            func.count().filter(Mensagem.motivo.in_(MOTIVOS_SEM_RESPOSTA)),
            func.count().filter(Mensagem.avaliacao == 1),
            func.count().filter(Mensagem.avaliacao == -1),
        )
        .where(no_periodo)
        .group_by(dia)
    ).all()
    por_dia = {
        d: UsoDia(dia=d, perguntas=p, sem_resposta=s, positivas=po, negativas=n)
        for d, p, s, po, n in linhas
    }
    hoje = hoje_local(settings)
    serie = []
    for atras in range(dias - 1, -1, -1):
        d = hoje - timedelta(days=atras)
        serie.append(
            por_dia.get(d) or UsoDia(dia=d, perguntas=0, sem_resposta=0, positivas=0, negativas=0)
        )

    custo = 0.0
    for modelo, gasto in db.execute(
        select(Mensagem.modelo, Mensagem.uso).where(no_periodo, Mensagem.papel == "assistente")
    ):
        # Resposta sem chamada à API (sem trecho relevante) fica com uso vazio (JSON null).
        if not gasto:
            continue
        custo += custo_estimado(modelo or settings.llm_model, gasto) or 0
        if reescrita := gasto.get("reescrita"):
            modelo_reescrita = reescrita.get("modelo", settings.reescrita_model)
            custo += custo_estimado(modelo_reescrita, reescrita) or 0

    return UsoSaida(
        dias=serie,
        perguntas=sum(d.perguntas for d in serie),
        sem_resposta=sum(d.sem_resposta for d in serie),
        positivas=sum(d.positivas for d in serie),
        negativas=sum(d.negativas for d in serie),
        erros=db.scalar(select(func.count()).where(no_periodo, Mensagem.motivo == "erro")) or 0,
        custo_estimado_usd=round(custo, 4),
        usuarios_total=db.scalar(select(func.count(Usuario.id))) or 0,
        usuarios_ativos=db.scalar(
            select(func.count(func.distinct(Mensagem.usuario_id))).where(
                no_periodo, Mensagem.papel == "usuario"
            )
        )
        or 0,
        documentos_prontos=db.scalar(
            select(func.count(Documento.id)).where(
                Documento.status == "pronto", Documento.substituido_por_id.is_(None)
            )
        )
        or 0,
    )


# --- usuários ---


def _usuario(db: Session, usuario_id: int, admin: Usuario) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(404, "Usuário não encontrado.")
    if usuario.id == admin.id:
        raise HTTPException(400, "Você não pode alterar a sua própria conta por aqui.")
    return usuario


@router.get("/usuarios")
def listar_usuarios(
    _: Admin, db: Db, q: Annotated[str | None, Query(max_length=100)] = None
) -> list[UsuarioAdminSaida]:
    consulta = select(Usuario).order_by(Usuario.criado_em.desc()).limit(200)
    if q:
        termo = f"%{q.strip()}%"
        consulta = consulta.where(or_(Usuario.nome.ilike(termo), Usuario.email.ilike(termo)))
    return [UsuarioAdminSaida.model_validate(u) for u in db.scalars(consulta)]


@router.patch("/usuarios/{usuario_id}")
def editar_usuario(
    usuario_id: int, edicao: UsuarioEdicao, admin: Admin, db: Db
) -> UsuarioAdminSaida:
    usuario = _usuario(db, usuario_id, admin)
    if edicao.papel is not None:
        usuario.papel = edicao.papel
    if edicao.ativo is not None:
        usuario.ativo = edicao.ativo
        if not edicao.ativo:
            db.execute(delete(Sessao).where(Sessao.usuario_id == usuario.id))
    db.commit()
    return UsuarioAdminSaida.model_validate(usuario)


@router.post("/usuarios/{usuario_id}/link-senha")
def gerar_link_senha(usuario_id: int, admin: Admin, db: Db, settings: Config) -> LinkSenhaSaida:
    """Link de redefinição para entregar à pessoa por outro meio (útil sem SMTP)."""
    usuario = _usuario(db, usuario_id, admin)
    token = criar_token_senha(db, usuario)
    return LinkSenhaSaida(
        link=f"{settings.url_publica}/redefinir-senha?token={token}",
        expira_em=agora() + VALIDADE_TOKEN_SENHA,
    )
