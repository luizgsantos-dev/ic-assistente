import hashlib
import math
import os
import re
import unicodedata
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import EMBEDDING_DIM

PASTA_BACKEND = Path(__file__).resolve().parents[1]
URL_TESTE = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://ic:ic@127.0.0.1:5433/ic_assistant_test"
)


class EmbedderFalso:
    """Saco de palavras com hash: determinístico, sem baixar modelo, e com alguma noção de
    semelhança (textos com palavras em comum ficam próximos)."""

    def _vetor(self, texto: str) -> list[float]:
        sem_acento = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
        v = [0.0] * EMBEDDING_DIM
        for palavra in re.findall(r"[a-z0-9]{3,}", sem_acento):
            v[int(hashlib.md5(palavra.encode()).hexdigest(), 16) % EMBEDDING_DIM] += 1.0
        norma = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norma for x in v]

    def embed_documentos(self, textos):
        return [self._vetor(t) for t in textos]

    def embed_consulta(self, texto):
        return self._vetor(texto)


@pytest.fixture
def embedder():
    return EmbedderFalso()


@pytest.fixture
def settings(tmp_path):
    # Com o embedder falso as similaridades são baixas; o limite real é calibrado com o bge-m3.
    return Settings(
        _env_file=None,
        min_similarity=0.15,
        anthropic_api_key=None,
        pasta_arquivos=tmp_path / "armazenamento",
    )


@pytest.fixture(scope="session")
def engine_teste():
    url = make_url(URL_TESTE)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
            c.execute(text(f'CREATE DATABASE "{url.database}"'))
    except OperationalError:
        pytest.skip("Postgres não está rodando (docker compose up -d db)")
    finally:
        admin.dispose()

    cfg = Config(str(PASTA_BACKEND / "alembic.ini"))
    cfg.attributes["database_url"] = URL_TESTE
    command.upgrade(cfg, "head")
    engine = create_engine(URL_TESTE)
    yield engine
    engine.dispose()


@pytest.fixture
def sessao_db(engine_teste):
    with Session(engine_teste, expire_on_commit=False) as s:
        yield s
    tabelas = "trechos, documentos, mensagens, conversas, tokens_senha, sessoes, usuarios"
    with engine_teste.begin() as c:
        c.execute(text(f"TRUNCATE {tabelas} RESTART IDENTITY CASCADE"))
