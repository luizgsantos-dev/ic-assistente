import threading
from collections.abc import Sequence
from typing import Protocol


class Embedder(Protocol):
    def embed_documentos(self, textos: Sequence[str]) -> list[list[float]]: ...

    def embed_consulta(self, texto: str) -> list[float]: ...


class EmbedderLocal:
    """Modelo do sentence-transformers rodando na CPU. Carrega só no primeiro uso (~2 GB)."""

    def __init__(self, modelo: str, dim: int):
        self._nome = modelo
        self._dim = dim
        self._modelo = None
        # No servidor várias requisições podem chegar antes de o modelo terminar de carregar.
        self._trava = threading.Lock()

    def _carregar(self):
        with self._trava:
            if self._modelo is None:
                from sentence_transformers import SentenceTransformer

                modelo = SentenceTransformer(self._nome, device="cpu")
                # Os trechos têm ~1500 caracteres; limitar o tamanho evita estourar memória.
                modelo.max_seq_length = 1024
                self._modelo = modelo
        return self._modelo

    def embed_documentos(self, textos: Sequence[str]) -> list[list[float]]:
        if not textos:
            return []
        vetores = self._carregar().encode(
            list(textos),
            batch_size=16,
            normalize_embeddings=True,
            show_progress_bar=len(textos) > 32,
        )
        if vetores.shape[1] != self._dim:
            raise ValueError(
                f"{self._nome} gera vetores de {vetores.shape[1]} dimensões; "
                f"o banco espera {self._dim}"
            )
        return vetores.tolist()

    def embed_consulta(self, texto: str) -> list[float]:
        return self.embed_documentos([texto])[0]
