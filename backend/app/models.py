from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Computed, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 1024

# Configuração de busca textual criada na migração: português + remoção de acentos,
# para "calendario" achar "calendário".
TS_CONFIG = "pt_unaccent"


class Base(DeclarativeBase):
    pass


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(Text)
    arquivo: Mapped[str] = mapped_column(Text)
    categoria: Mapped[str] = mapped_column(String(50), default="geral")
    # Data de publicação/vigência. É o que decide qual documento vale em caso de conflito.
    data_documento: Mapped[date | None]
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pendente")
    erro: Mapped[str | None] = mapped_column(Text)
    paginas: Mapped[int | None]
    transcrito_por_ia: Mapped[bool] = mapped_column(default=False)
    # Preenchido quando um documento mais novo substitui este; ele sai da busca.
    substituido_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL")
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    trechos: Mapped[list["Trecho"]] = relationship(
        back_populates="documento", cascade="all, delete-orphan", passive_deletes=True
    )


class Trecho(Base):
    __tablename__ = "trechos"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE"), index=True
    )
    ordem: Mapped[int]
    pagina_inicio: Mapped[int | None]
    pagina_fim: Mapped[int | None]
    secao: Mapped[str | None] = mapped_column(Text)
    # Título do documento + seção; entra no embedding e pesa mais na busca textual.
    contexto: Mapped[str] = mapped_column(Text)
    conteudo: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    busca: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            f"setweight(to_tsvector('{TS_CONFIG}'::regconfig, contexto), 'A') || "
            f"setweight(to_tsvector('{TS_CONFIG}'::regconfig, conteudo), 'B')",
            persisted=True,
        ),
    )

    documento: Mapped[Documento] = relationship(back_populates="trechos")

    __table_args__ = (
        Index("ix_trechos_busca", "busca", postgresql_using="gin"),
        Index(
            "ix_trechos_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )
