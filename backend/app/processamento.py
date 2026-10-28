"""Fila que processa, em segundo plano, os documentos enviados pelo painel."""

import logging
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings
from .embeddings import Embedder
from .ingestao.pipeline import processar_documento
from .ingestao.transcricao import transcrever_pdf
from .models import Documento

log = logging.getLogger(__name__)


class FilaProcessamento:
    """Um documento por vez: o modelo de embeddings e a transcrição já usam bastante memória.

    Com `sincrona=True` (testes) processa na hora, sem thread.
    """

    def __init__(
        self,
        fabrica_sessao: sessionmaker[Session],
        embedder: Embedder,
        settings: Settings,
        obter_cliente: Callable[[], object | None],
        sincrona: bool = False,
    ):
        self._fabrica = fabrica_sessao
        self._embedder = embedder
        self._settings = settings
        self._obter_cliente = obter_cliente
        self._executor = None if sincrona else ThreadPoolExecutor(1, thread_name_prefix="ingestao")

    def enfileirar(self, documento_id: int) -> Future | None:
        if self._executor is None:
            self._processar(documento_id)
            return None
        return self._executor.submit(self._processar, documento_id)

    def retomar_pendentes(self) -> None:
        """Na subida do servidor: o que ficou pela metade (queda, reinício) volta para a fila."""
        with self._fabrica() as s:
            ids = s.scalars(
                select(Documento.id).where(Documento.status.in_(("pendente", "processando")))
            ).all()
        for documento_id in ids:
            self.enfileirar(documento_id)

    def encerrar(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)

    def _processar(self, documento_id: int) -> None:
        cliente = self._obter_cliente()
        transcritor = (
            (lambda caminho: transcrever_pdf(caminho, cliente, self._settings)) if cliente else None
        )
        with self._fabrica() as s:
            try:
                processar_documento(s, documento_id, self._embedder, self._settings, transcritor)
            except Exception:
                # O erro já ficou registrado no documento; aqui só vai para o log.
                log.exception("falha ao processar o documento %s", documento_id)
