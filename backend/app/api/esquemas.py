from datetime import date, datetime
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
    categorias: dict[str, str]
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
    avaliacao: int | None
    criada_em: datetime


class ConversaDetalhe(ConversaResumo):
    mensagens: list[MensagemSaida]


class RenomearEntrada(BaseModel):
    titulo: str = Field(min_length=1, max_length=120)


class PerguntaEntrada(BaseModel):
    pergunta: str = Field(min_length=1, max_length=2000)
    conversa_id: int | None = None


class AvaliacaoEntrada(BaseModel):
    # 1 = 👍, -1 = 👎, 0 = desfazer
    valor: Literal[1, -1, 0]


# --- painel da secretaria ---


class DocumentoSaida(BaseModel):
    id: int
    titulo: str
    arquivo: str
    categoria: str
    data_documento: date | None
    data_origem: str | None
    status: str
    erro: str | None
    avisos: list[str]
    paginas: int | None
    trechos: int
    transcrito_por_ia: bool
    substituido_por_id: int | None
    substituido_por_titulo: str | None
    tamanho_bytes: int | None
    enviado_por: str | None
    criado_em: datetime
    # Só no envio: o mesmo arquivo já estava cadastrado.
    ja_existia: bool = False


class DocumentoEdicao(BaseModel):
    """Só os campos enviados mudam; `null` em data ou substituído limpa o valor."""

    model_config = ConfigDict(extra="forbid")

    titulo: str | None = Field(default=None, min_length=1, max_length=200)
    categoria: str | None = None
    data_documento: date | None = None
    substituido_por_id: int | None = None


class TrechoSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ordem: int
    pagina_inicio: int | None
    pagina_fim: int | None
    secao: str | None
    conteudo: str


class PendenciaSaida(BaseModel):
    """Pergunta sem resposta ou resposta com 👎. Sem nada que identifique quem perguntou."""

    mensagem_id: int
    pergunta: str | None
    resposta: str
    motivo: str | None
    avaliacao: int | None
    criada_em: datetime


class UsoDia(BaseModel):
    dia: date
    perguntas: int
    sem_resposta: int
    positivas: int
    negativas: int


class UsoSaida(BaseModel):
    dias: list[UsoDia]
    perguntas: int
    sem_resposta: int
    positivas: int
    negativas: int
    erros: int
    custo_estimado_usd: float
    usuarios_total: int
    usuarios_ativos: int
    documentos_prontos: int


class UsuarioAdminSaida(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    vinculo: str
    curso: str | None
    papel: str
    ativo: bool
    criado_em: datetime
    ultimo_acesso: datetime | None


class UsuarioEdicao(BaseModel):
    model_config = ConfigDict(extra="forbid")

    papel: Literal["usuario", "admin"] | None = None
    ativo: bool | None = None


class LinkSenhaSaida(BaseModel):
    link: str
    expira_em: datetime
