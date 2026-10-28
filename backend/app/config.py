"""Configuração lida do arquivo .env na raiz do repositório (ou de variáveis de ambiente)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_REPO = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ_REPO / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://ic:ic@127.0.0.1:5433/ic_assistant"

    # Sem chave aqui, o SDK procura ANTHROPIC_API_KEY no ambiente.
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5-5"
    llm_effort: str = "medium"
    llm_max_tokens: int = 16000
    # Modelos separados para o juiz da avaliação e para transcrever PDFs escaneados,
    # para dar para trocar por um mais barato depois de medir.
    judge_model: str = "claude-opus-5-5"
    transcription_model: str = "claude-opus-5-5"

    # Trocar o modelo de embedding com outra dimensão exige nova migração (coluna vector).
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024

    chunk_max_chars: int = 1500
    chunk_overlap_chars: int = 250

    retrieval_candidates: int = 30
    retrieval_top_k: int = 8
    # Trecho que só aparece na busca vetorial precisa de pelo menos esta similaridade (cosseno).
    min_similarity: float = 0.40

    contato_fallback: str = "cacomp@ic.ufmt.br"
    fuso_horario: str = "America/Cuiaba"

    # Cópia de cada documento ingerido (para reprocessar e baixar o original pelo painel).
    pasta_arquivos: Path = RAIZ_REPO / "armazenamento"
    tamanho_maximo_mb: int = 30

    # Chat
    limite_diario_perguntas: int = 30
    # Quantas mensagens anteriores da conversa entram como contexto.
    historico_mensagens: int = 6
    reescrita_model: str = "claude-opus-5-5"
    # Sugestões no campo "curso" do cadastro, em JSON: CURSOS='["Curso A", "Curso B"]'
    cursos: list[str] = []

    # Sessão e e-mail
    sessao_dias: int = 30
    # Em produção (HTTPS) precisa ser true, senão o navegador manda o cookie sem criptografia.
    cookie_seguro: bool = False
    # Endereço do site, usado nos links enviados por e-mail.
    url_publica: str = "http://localhost:5173"
    # Sem SMTP_HOST os e-mails só aparecem no log do servidor.
    smtp_host: str | None = None
    smtp_porta: int = 587
    smtp_usuario: str | None = None
    smtp_senha: str | None = None
    smtp_remetente: str = "IC-Assistant <nao-responda@ic.ufmt.br>"
    # starttls (porta 587), ssl (porta 465) ou nenhum
    smtp_seguranca: str = "starttls"


@lru_cache
def get_settings() -> Settings:
    return Settings()
