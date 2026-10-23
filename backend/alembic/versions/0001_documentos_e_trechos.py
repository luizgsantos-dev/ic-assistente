"""documentos e trechos

Revision ID: 0001
Revises:
Create Date: 2026-10-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import TSVECTOR

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    # Português com remoção de acentos: "calendario" acha "calendário" e vice-versa.
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
                CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
                ALTER TEXT SEARCH CONFIGURATION pt_unaccent
                    ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
            END IF;
        END $$;
    """)

    op.create_table(
        "documentos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("titulo", sa.Text, nullable=False),
        sa.Column("arquivo", sa.Text, nullable=False),
        sa.Column("categoria", sa.String(50), nullable=False),
        sa.Column("data_documento", sa.Date),
        sa.Column("sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("erro", sa.Text),
        sa.Column("paginas", sa.Integer),
        sa.Column("transcrito_por_ia", sa.Boolean, nullable=False),
        sa.Column(
            "substituido_por_id",
            sa.Integer,
            sa.ForeignKey("documentos.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "atualizado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "trechos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "documento_id",
            sa.Integer,
            sa.ForeignKey("documentos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordem", sa.Integer, nullable=False),
        sa.Column("pagina_inicio", sa.Integer),
        sa.Column("pagina_fim", sa.Integer),
        sa.Column("secao", sa.Text),
        sa.Column("contexto", sa.Text, nullable=False),
        sa.Column("conteudo", sa.Text, nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.Column(
            "busca",
            TSVECTOR,
            sa.Computed(
                "setweight(to_tsvector('pt_unaccent'::regconfig, contexto), 'A') || "
                "setweight(to_tsvector('pt_unaccent'::regconfig, conteudo), 'B')",
                persisted=True,
            ),
        ),
    )
    op.create_index("ix_trechos_documento_id", "trechos", ["documento_id"])
    op.create_index("ix_trechos_busca", "trechos", ["busca"], postgresql_using="gin")
    op.create_index(
        "ix_trechos_embedding",
        "trechos",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_table("trechos")
    op.drop_table("documentos")
    op.execute("DROP TEXT SEARCH CONFIGURATION IF EXISTS pt_unaccent")
