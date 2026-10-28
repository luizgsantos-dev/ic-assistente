"""Ingestão: arquivo → texto → trechos → embeddings → banco.

Em duas etapas: `registrar_documento` guarda uma cópia do arquivo e cria o documento como
pendente (rápido, feito na hora do envio); `processar_documento` lê, divide e gera os
embeddings (lento, feito em segundo plano pelo painel ou na hora pela linha de comando).
"""

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..embeddings import Embedder
from ..models import Documento, Trecho
from .leitura import EXTENSOES_SUPORTADAS, Bloco, ler_documento
from .transcricao import dividir_paginas_transcritas
from .trechos import MIN_CHARS_SECAO, gerar_trechos

# Recebe o PDF escaneado e devolve a transcrição em Markdown, com marcas de página.
Transcritor = Callable[[Path], str]


class ErroIngestao(RuntimeError):
    pass


@dataclass
class ResultadoIngestao:
    documento: Documento
    novo: bool
    # Avisos para quem está ingerindo conferir (ex.: data tirada dos metadados do PDF).
    avisos: list[str]


def listar_arquivos(caminhos: list[Path]) -> list[Path]:
    arquivos: list[Path] = []
    for caminho in caminhos:
        if caminho.is_dir():
            arquivos += sorted(
                p
                for p in caminho.rglob("*")
                if p.is_file() and p.suffix.lower() in EXTENSOES_SUPORTADAS
            )
        else:
            arquivos.append(caminho)
    return arquivos


def titulo_do_arquivo(nome: str) -> str:
    return re.sub(r"[_\-]+", " ", Path(nome).stem).strip()


def caminho_guardado(doc: Documento, settings: Settings) -> Path:
    return Path(settings.pasta_arquivos) / (doc.caminho_arquivo or "")


def _caminho_transcricao(arquivo: Path) -> Path:
    return arquivo.with_name(arquivo.name + ".transcricao.md")


def registrar_documento(
    session: Session,
    origem: Path,
    settings: Settings,
    *,
    nome_original: str | None = None,
    titulo: str | None = None,
    categoria: str = "geral",
    data_documento: date | None = None,
    enviado_por_id: int | None = None,
) -> tuple[Documento, bool]:
    """Guarda a cópia do arquivo e cria o documento como pendente.

    Devolve (documento, novo). Se o mesmo arquivo já existe, devolve o que já estava lá.
    """
    nome = nome_original or origem.name
    dados = origem.read_bytes()
    sha = hashlib.sha256(dados).hexdigest()
    existente = session.scalar(select(Documento).where(Documento.sha256 == sha))
    if existente is not None:
        return existente, False

    pasta = Path(settings.pasta_arquivos)
    pasta.mkdir(parents=True, exist_ok=True)
    nome_guardado = f"{sha}{Path(nome).suffix.lower()}"
    destino = pasta / nome_guardado
    if not destino.exists():
        destino.write_bytes(dados)

    doc = Documento(
        titulo=(titulo or "").strip() or titulo_do_arquivo(nome),
        arquivo=nome,
        categoria=categoria,
        data_documento=data_documento,
        data_origem="informada" if data_documento else None,
        sha256=sha,
        caminho_arquivo=nome_guardado,
        tamanho_bytes=len(dados),
        status="pendente",
        enviado_por_id=enviado_por_id,
    )
    session.add(doc)
    session.commit()
    return doc, True


def processar_documento(
    session: Session,
    documento_id: int,
    embedder: Embedder,
    settings: Settings,
    transcritor: Transcritor | None = None,
) -> Documento:
    doc = session.get(Documento, documento_id)
    if doc is None:
        raise ErroIngestao(f"documento {documento_id} não existe")
    doc.status, doc.erro = "processando", None
    session.commit()
    try:
        _processar(session, doc, embedder, settings, transcritor)
    except Exception as e:
        session.rollback()
        doc.status, doc.erro = "erro", str(e)
        session.commit()
        raise
    return doc


def ingerir_arquivo(
    session: Session,
    caminho: Path,
    embedder: Embedder,
    settings: Settings,
    *,
    titulo: str | None = None,
    categoria: str = "geral",
    data_documento: date | None = None,
    transcritor: Transcritor | None = None,
    forcar: bool = False,
) -> ResultadoIngestao:
    """Registra e processa na hora (usado pela linha de comando)."""
    doc, novo = registrar_documento(
        session,
        caminho,
        settings,
        titulo=titulo,
        categoria=categoria,
        data_documento=data_documento,
    )
    if not novo:
        if doc.status == "pronto" and not forcar:
            return ResultadoIngestao(doc, novo=False, avisos=[])
        doc.categoria = categoria
        if titulo:
            doc.titulo = titulo
        if data_documento:
            doc.data_documento, doc.data_origem = data_documento, "informada"
    processar_documento(session, doc.id, embedder, settings, transcritor)
    return ResultadoIngestao(doc, novo=True, avisos=doc.avisos or [])


def _processar(
    session: Session,
    doc: Documento,
    embedder: Embedder,
    settings: Settings,
    transcritor: Transcritor | None,
) -> None:
    arquivo = caminho_guardado(doc, settings)
    if not doc.caminho_arquivo or not arquivo.exists():
        raise ErroIngestao("o arquivo original não está mais guardado; envie de novo")

    avisos: list[str] = []
    lido = ler_documento(arquivo)
    blocos = lido.blocos
    if lido.escaneado:
        blocos = _transcrever(arquivo, transcritor)
        avisos.append("PDF escaneado: texto transcrito pelo Claude, vale conferir")

    gerados = gerar_trechos(
        blocos,
        settings.chunk_max_chars,
        settings.chunk_overlap_chars,
        min_chars_secao=MIN_CHARS_SECAO if arquivo.suffix.lower() == ".pdf" else 0,
    )
    if not gerados:
        raise ErroIngestao("nenhum texto foi extraído do arquivo")

    # Título dos metadados só substitui o tirado do nome do arquivo, nunca um digitado.
    if lido.titulo and doc.titulo == titulo_do_arquivo(doc.arquivo):
        doc.titulo = lido.titulo
    if doc.data_documento is None and lido.data:
        doc.data_documento, doc.data_origem = lido.data, "metadados"
    if doc.data_origem == "metadados":
        data = f"{doc.data_documento:%d/%m/%Y}"
        avisos.append(f"data {data} tirada dos metadados do arquivo; confira")
    elif doc.data_documento is None:
        avisos.append("documento sem data; ele perde para qualquer outro em caso de conflito")
    doc.paginas = lido.paginas
    doc.transcrito_por_ia = lido.escaneado
    doc.avisos = avisos

    contextos = [f"{doc.titulo} — {g.secao}" if g.secao else doc.titulo for g in gerados]
    vetores = embedder.embed_documentos(
        [f"{ctx}\n\n{g.conteudo}" for ctx, g in zip(contextos, gerados, strict=True)]
    )

    session.execute(delete(Trecho).where(Trecho.documento_id == doc.id))
    session.add_all(
        Trecho(
            documento_id=doc.id,
            ordem=i,
            pagina_inicio=g.pagina_inicio,
            pagina_fim=g.pagina_fim,
            secao=g.secao,
            contexto=ctx,
            conteudo=g.conteudo,
            embedding=vetor,
        )
        for i, (g, ctx, vetor) in enumerate(zip(gerados, contextos, vetores, strict=True))
    )
    doc.status = "pronto"
    session.commit()


def _transcrever(arquivo: Path, transcritor: Transcritor | None) -> list[Bloco]:
    """Transcrição de PDF escaneado, guardada ao lado do arquivo para não pagar duas vezes."""
    cache = _caminho_transcricao(arquivo)
    if cache.exists():
        texto = cache.read_text(encoding="utf-8")
    elif transcritor is None:
        raise ErroIngestao(
            "o PDF parece escaneado (sem texto); configure ANTHROPIC_API_KEY para transcrever"
        )
    else:
        texto = transcritor(arquivo)
        cache.write_text(texto, encoding="utf-8")
    return dividir_paginas_transcritas(texto)


def apagar_arquivos(doc: Documento, settings: Settings) -> None:
    if not doc.caminho_arquivo:
        return
    arquivo = caminho_guardado(doc, settings)
    for caminho in (arquivo, _caminho_transcricao(arquivo)):
        caminho.unlink(missing_ok=True)


def substituir(session: Session, antigo_id: int, novo_id: int) -> None:
    if antigo_id == novo_id:
        raise ErroIngestao("um documento não pode substituir a si mesmo")
    antigo, novo = session.get(Documento, antigo_id), session.get(Documento, novo_id)
    if antigo is None or novo is None:
        raise ErroIngestao("documento não encontrado")
    if novo.substituido_por_id == antigo.id:
        raise ErroIngestao("os dois documentos não podem substituir um ao outro")
    antigo.substituido_por_id = novo.id
    session.commit()
