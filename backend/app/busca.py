"""Busca híbrida: vetorial (significado) + textual (palavras), fundidas por RRF."""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import Text, and_, cast, func, literal_column, select
from sqlalchemy.dialects.postgresql import TSQUERY
from sqlalchemy.orm import Session

from .config import Settings
from .embeddings import Embedder
from .models import TS_CONFIG, Documento, Trecho

RRF_K = 60


@dataclass
class TrechoRecuperado:
    trecho_id: int
    documento_id: int
    titulo: str
    categoria: str
    data_documento: date | None
    pagina_inicio: int | None
    pagina_fim: int | None
    secao: str | None
    conteudo: str
    score: float
    similaridade: float | None
    achado_por_texto: bool

    @property
    def paginas(self) -> str | None:
        if self.pagina_inicio is None:
            return None
        if self.pagina_fim in (None, self.pagina_inicio):
            return f"p. {self.pagina_inicio}"
        return f"p. {self.pagina_inicio}–{self.pagina_fim}"


def fundir_rrf(rankings: list[list[int]], k: int = RRF_K) -> dict[int, float]:
    """Reciprocal Rank Fusion: soma 1/(k + posição) de cada lista em que o item aparece."""
    scores: dict[int, float] = {}
    for ranking in rankings:
        for posicao, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + posicao)
    return scores


def _tsquery_ou(texto: str):
    # plainto_tsquery junta os termos com E (&); para perguntas em linguagem natural isso é
    # restritivo demais, então troca por OU (|) e deixa o ranking ordenar.
    consulta = func.plainto_tsquery(literal_column(f"'{TS_CONFIG}'::regconfig"), texto)
    return cast(func.replace(cast(consulta, Text), "&", "|"), TSQUERY)


def buscar(
    session: Session, pergunta: str, embedder: Embedder, settings: Settings
) -> list[TrechoRecuperado]:
    ativos = and_(Documento.status == "pronto", Documento.substituido_por_id.is_(None))
    n = settings.retrieval_candidates

    distancia = Trecho.embedding.cosine_distance(embedder.embed_consulta(pergunta))
    por_vetor = session.execute(
        select(Trecho.id, distancia.label("distancia"))
        .join(Documento)
        .where(ativos)
        .order_by(distancia)
        .limit(n)
    ).all()

    tsq = _tsquery_ou(pergunta)
    rank = func.ts_rank_cd(Trecho.busca, tsq)
    por_texto = (
        session.execute(
            select(Trecho.id)
            .join(Documento)
            .where(ativos, Trecho.busca.op("@@")(tsq))
            .order_by(rank.desc())
            .limit(n)
        )
        .scalars()
        .all()
    )

    similaridade = {linha.id: 1.0 - linha.distancia for linha in por_vetor}
    ids_texto = set(por_texto)
    scores = fundir_rrf([[linha.id for linha in por_vetor], list(por_texto)])
    escolhidos = [
        i
        for i in sorted(scores, key=scores.__getitem__, reverse=True)
        # O que só a busca vetorial achou precisa ser parecido o bastante; ela sempre
        # devolve "os mais próximos", mesmo quando nada tem a ver com a pergunta.
        if i in ids_texto or similaridade.get(i, 0.0) >= settings.min_similarity
    ][: settings.retrieval_top_k]
    if not escolhidos:
        return []

    linhas = session.execute(
        select(Trecho, Documento).join(Documento).where(Trecho.id.in_(escolhidos))
    ).all()
    por_id = {trecho.id: (trecho, doc) for trecho, doc in linhas}
    resultado = []
    for i in escolhidos:
        trecho, doc = por_id[i]
        resultado.append(
            TrechoRecuperado(
                trecho_id=trecho.id,
                documento_id=doc.id,
                titulo=doc.titulo,
                categoria=doc.categoria,
                data_documento=doc.data_documento,
                pagina_inicio=trecho.pagina_inicio,
                pagina_fim=trecho.pagina_fim,
                secao=trecho.secao,
                conteudo=trecho.conteudo,
                score=scores[i],
                similaridade=similaridade.get(i),
                achado_por_texto=i in ids_texto,
            )
        )
    return resultado
