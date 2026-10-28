"""arquivos guardados, avisos de ingestão e avaliação das respostas

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documentos", sa.Column("data_origem", sa.String(20)))
    op.add_column("documentos", sa.Column("caminho_arquivo", sa.Text))
    op.add_column("documentos", sa.Column("tamanho_bytes", sa.Integer))
    op.add_column("documentos", sa.Column("avisos", JSONB))
    op.add_column(
        "documentos",
        sa.Column("enviado_por_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="SET NULL")),
    )
    op.add_column("mensagens", sa.Column("avaliacao", sa.SmallInteger))
    op.add_column("mensagens", sa.Column("avaliada_em", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("mensagens", "avaliada_em")
    op.drop_column("mensagens", "avaliacao")
    op.drop_column("documentos", "enviado_por_id")
    op.drop_column("documentos", "avisos")
    op.drop_column("documentos", "tamanho_bytes")
    op.drop_column("documentos", "caminho_arquivo")
    op.drop_column("documentos", "data_origem")
