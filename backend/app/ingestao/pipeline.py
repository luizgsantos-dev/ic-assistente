"""Ingestão: arquivo → texto → trechos → embeddings → banco."""

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
from .trechos import MIN_CHARS_SECAO, gerar_trechos

Transcritor = Callable[[Path], list[Bloco]]


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


def titulo_do_arquivo(caminho: Path) -> str:
    return re.sub(r"[_\-]+", " ", caminho.stem).strip()


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
    sha = hashlib.sha256(caminho.read_bytes()).hexdigest()
    doc = session.scalar(select(Documento).where(Documento.sha256 == sha))
    if doc is not None and doc.status == "pronto" and not forcar:
        return ResultadoIngestao(doc, novo=False, avisos=[])

    if doc is None:
        doc = Documento(
            titulo=titulo or titulo_do_arquivo(caminho), arquivo=caminho.name, sha256=sha
        )
        session.add(doc)
    doc.status, doc.erro = "processando", None
    session.commit()

    try:
        avisos = _processar(
            session,
            doc,
            caminho,
            embedder,
            settings,
            titulo=titulo,
            categoria=categoria,
            data_documento=data_documento,
            transcritor=transcritor,
        )
    except Exception as e:
        session.rollback()
        doc.status, doc.erro = "erro", str(e)
        session.commit()
        raise
    return ResultadoIngestao(doc, novo=True, avisos=avisos)


def _processar(
    session: Session,
    doc: Documento,
    caminho: Path,
    embedder: Embedder,
    settings: Settings,
    *,
    titulo: str | None,
    categoria: str,
    data_documento: date | None,
    transcritor: Transcritor | None,
) -> list[str]:
    avisos: list[str] = []
    lido = ler_documento(caminho)
    blocos = lido.blocos
    if lido.escaneado:
        if transcritor is None:
            raise ErroIngestao(
                "o PDF parece escaneado (sem texto); configure ANTHROPIC_API_KEY para transcrever"
            )
        blocos = transcritor(caminho)
        avisos.append("PDF escaneado: texto transcrito pelo Claude, vale conferir")

    gerados = gerar_trechos(
        blocos,
        settings.chunk_max_chars,
        settings.chunk_overlap_chars,
        min_chars_secao=MIN_CHARS_SECAO if caminho.suffix.lower() == ".pdf" else 0,
    )
    if not gerados:
        raise ErroIngestao("nenhum texto foi extraído do arquivo")

    doc.titulo = titulo or lido.titulo or doc.titulo
    doc.categoria = categoria
    doc.data_documento = data_documento or lido.data
    if data_documento is None:
        avisos.append(
            f"data {doc.data_documento:%d/%m/%Y} tirada dos metadados do arquivo; confira"
            if doc.data_documento
            else "documento sem data; ele perde para qualquer outro em caso de conflito"
        )
    doc.paginas = lido.paginas
    doc.transcrito_por_ia = lido.escaneado

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
    return avisos


def substituir(session: Session, antigo_id: int, novo_id: int) -> None:
    if antigo_id == novo_id:
        raise ErroIngestao("um documento não pode substituir a si mesmo")
    antigo, novo = session.get(Documento, antigo_id), session.get(Documento, novo_id)
    if antigo is None or novo is None:
        raise ErroIngestao("documento não encontrado")
    antigo.substituido_por_id = novo.id
    session.commit()
