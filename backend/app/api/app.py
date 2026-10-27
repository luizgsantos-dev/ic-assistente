"""Aplicação web do IC-Assistant. Em produção roda com `ic servidor` (uvicorn)."""

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import sessionmaker

from ..config import Settings, get_settings
from ..embeddings import Embedder, EmbedderLocal
from ..models import VINCULOS
from ..seguranca import LimitadorTentativas
from . import rotas_auth, rotas_conversas
from .deps import Config
from .esquemas import ConfigSaida


def criar_app(
    settings: Settings | None = None,
    embedder: Embedder | None = None,
    cliente=None,
    engine: Engine | None = None,
) -> FastAPI:
    """Os parâmetros existem para os testes trocarem banco, embeddings e cliente da API."""
    settings = settings or get_settings()
    engine = engine or create_engine(
        settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=20
    )
    embedder = embedder or EmbedderLocal(settings.embedding_model, settings.embedding_dim)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        if isinstance(embedder, EmbedderLocal):
            # Carrega o modelo em segundo plano para a primeira pergunta não esperar ~20 s.
            threading.Thread(
                target=embedder.embed_consulta, args=("aquecimento",), daemon=True
            ).start()
        yield
        engine.dispose()

    app = FastAPI(
        title="IC-Assistant",
        lifespan=ciclo_de_vida,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.fabrica_sessao = sessionmaker(engine, expire_on_commit=False)
    app.state.embedder = embedder
    app.state.cliente = cliente
    app.state.limitador_login = LimitadorTentativas()

    app.include_router(rotas_auth.router)
    app.include_router(rotas_conversas.router)

    @app.get("/api/config", tags=["geral"])
    def config(settings: Config) -> ConfigSaida:
        return ConfigSaida(
            cursos=settings.cursos,
            vinculos=VINCULOS,
            limite_diario=settings.limite_diario_perguntas,
            contato=settings.contato_fallback,
        )

    @app.get("/api/saude", tags=["geral"])
    def saude() -> dict:
        return {"ok": True}

    return app
