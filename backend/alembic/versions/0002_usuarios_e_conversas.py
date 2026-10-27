"""usuários, sessões e conversas

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nome", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("senha_hash", sa.Text, nullable=False),
        sa.Column("vinculo", sa.String(20), nullable=False),
        sa.Column("curso", sa.Text),
        sa.Column("papel", sa.String(20), nullable=False),
        sa.Column("ativo", sa.Boolean, nullable=False),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("ultimo_acesso", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "sessoes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer,
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "criada_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessoes_usuario_id", "sessoes", ["usuario_id"])

    op.create_table(
        "tokens_senha",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer,
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_tokens_senha_usuario_id", "tokens_senha", ["usuario_id"])

    op.create_table(
        "conversas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer,
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("titulo", sa.Text, nullable=False),
        sa.Column(
            "criada_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "atualizada_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_conversas_usuario_id", "conversas", ["usuario_id"])

    op.create_table(
        "mensagens",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "conversa_id",
            sa.Integer,
            sa.ForeignKey("conversas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "usuario_id",
            sa.Integer,
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("papel", sa.String(20), nullable=False),
        sa.Column("conteudo", sa.Text, nullable=False),
        sa.Column("pergunta_busca", sa.Text),
        sa.Column("fundamentada", sa.Boolean),
        sa.Column("motivo", sa.String(20)),
        sa.Column("citacoes", JSONB),
        sa.Column("trechos", JSONB),
        sa.Column("modelo", sa.Text),
        sa.Column("uso", JSONB),
        sa.Column(
            "criada_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_mensagens_conversa_id", "mensagens", ["conversa_id"])
    op.create_index("ix_mensagens_usuario_data", "mensagens", ["usuario_id", "criada_em"])


def downgrade() -> None:
    op.drop_table("mensagens")
    op.drop_table("conversas")
    op.drop_table("tokens_senha")
    op.drop_table("sessoes")
    op.drop_table("usuarios")
