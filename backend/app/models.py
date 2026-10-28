from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Computed, DateTime, ForeignKey, Index, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 1024

# Configuração de busca textual criada na migração: português + remoção de acentos,
# para "calendario" achar "calendário".
TS_CONFIG = "pt_unaccent"


CATEGORIAS = {
    "calendario": "Calendário",
    "ppc": "Cursos e PPC",
    "processo": "Processos acadêmicos",
    "docente": "Docentes e técnicos",
    "institucional": "Institucional",
    "pesquisa": "Pesquisa e extensão",
    "evento": "Eventos",
    "servicos": "Serviços ao estudante",
    "contatos": "Contatos",
    "faq": "Perguntas frequentes",
    "geral": "Geral",
}


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
    # "informada" (por quem enviou) ou "metadados" (tirada do arquivo, vale conferir).
    data_origem: Mapped[str | None] = mapped_column(String(20))
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    # Nome da cópia dentro de settings.pasta_arquivos.
    caminho_arquivo: Mapped[str | None] = mapped_column(Text)
    tamanho_bytes: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), default="pendente")
    erro: Mapped[str | None] = mapped_column(Text)
    avisos: Mapped[list | None] = mapped_column(JSONB)
    paginas: Mapped[int | None]
    transcrito_por_ia: Mapped[bool] = mapped_column(default=False)
    # Preenchido quando um documento mais novo substitui este; ele sai da busca.
    substituido_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL")
    )
    enviado_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL")
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


VINCULOS = {
    "aluno": "Aluno",
    "docente": "Docente",
    "tecnico": "Técnico administrativo",
    "outro": "Outro",
}


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(Text)
    # Sempre em minúsculas; a comparação no login também é feita em minúsculas.
    email: Mapped[str] = mapped_column(Text, unique=True)
    senha_hash: Mapped[str] = mapped_column(Text)
    vinculo: Mapped[str] = mapped_column(String(20))
    curso: Mapped[str | None] = mapped_column(Text)
    # "usuario" ou "admin" (secretaria). Admin não tem limite diário e acessa o painel.
    papel: Mapped[str] = mapped_column(String(20), default="usuario")
    ativo: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_acesso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Sessao(Base):
    __tablename__ = "sessoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    # Guarda só o hash do token do cookie; quem tiver acesso ao banco não consegue se logar.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    usuario: Mapped[Usuario] = relationship()


class TokenSenha(Base):
    """Link de "esqueci minha senha": vale uma vez, por pouco tempo."""

    __tablename__ = "tokens_senha"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Conversa(Base):
    __tablename__ = "conversas"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    titulo: Mapped[str] = mapped_column(Text)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizada_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    mensagens: Mapped[list["Mensagem"]] = relationship(
        back_populates="conversa",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Mensagem.id",
    )


class Mensagem(Base):
    __tablename__ = "mensagens"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversa_id: Mapped[int] = mapped_column(
        ForeignKey("conversas.id", ondelete="CASCADE"), index=True
    )
    # Repetido aqui para contar o limite diário sem juntar com conversas.
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    papel: Mapped[str] = mapped_column(String(20))  # "usuario" ou "assistente"
    conteudo: Mapped[str] = mapped_column(Text)
    # Pergunta reescrita para ser entendida sem o histórico (é ela que vai para a busca).
    pergunta_busca: Mapped[str | None] = mapped_column(Text)
    fundamentada: Mapped[bool | None]
    # ok, sem_trechos, sem_citacoes, recusa, max_tokens ou erro
    motivo: Mapped[str | None] = mapped_column(String(20))
    citacoes: Mapped[list | None] = mapped_column(JSONB)
    trechos: Mapped[list | None] = mapped_column(JSONB)
    modelo: Mapped[str | None] = mapped_column(Text)
    uso: Mapped[dict | None] = mapped_column(JSONB)
    # 👍 = 1, 👎 = -1, sem avaliação = None. Só em respostas do assistente.
    avaliacao: Mapped[int | None] = mapped_column(SmallInteger)
    avaliada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversa: Mapped[Conversa] = relationship(back_populates="mensagens")

    __table_args__ = (Index("ix_mensagens_usuario_data", "usuario_id", "criada_em"),)
