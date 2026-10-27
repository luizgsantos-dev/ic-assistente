from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Vinculo = Literal["aluno", "docente", "tecnico", "outro"]


class CadastroEntrada(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    email: EmailStr
    senha: str = Field(min_length=8, max_length=128)
    vinculo: Vinculo
    curso: str | None = Field(default=None, max_length=120)


class LoginEntrada(BaseModel):
    email: EmailStr
    senha: str = Field(max_length=128)


class EsqueciSenhaEntrada(BaseModel):
    email: EmailStr


class RedefinirSenhaEntrada(BaseModel):
    token: str = Field(max_length=200)
    senha: str = Field(min_length=8, max_length=128)


class UsuarioSaida(BaseModel):
    id: int
    nome: str
    email: str
    vinculo: str
    curso: str | None
    papel: str
    # None = sem limite (admin)
    perguntas_restantes: int | None
    limite_diario: int


class ConfigSaida(BaseModel):
    cursos: list[str]
    vinculos: dict[str, str]
    limite_diario: int
    contato: str


class ConversaResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    titulo: str
    atualizada_em: datetime


class MensagemSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    papel: str
    conteudo: str
    fundamentada: bool | None
    motivo: str | None
    citacoes: list[dict] | None
    criada_em: datetime


class ConversaDetalhe(ConversaResumo):
    mensagens: list[MensagemSaida]


class RenomearEntrada(BaseModel):
    titulo: str = Field(min_length=1, max_length=120)


class PerguntaEntrada(BaseModel):
    pergunta: str = Field(min_length=1, max_length=2000)
    conversa_id: int | None = None
