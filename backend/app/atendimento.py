"""Regras do chat: limite diário, histórico da conversa e reescrita da pergunta."""

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings
from .llm import opcoes_fallback
from .models import VINCULOS, Mensagem, Usuario

# Respostas anteriores muito longas são cortadas no histórico; o começo basta para dar contexto.
MAX_CHARS_HISTORICO = 1500

PROMPT_REESCRITA = """\
Você prepara perguntas para a busca em documentos do Instituto de Computação da UFMT. Recebe o \
histórico recente de uma conversa, quem está perguntando e a nova mensagem. Reescreva a nova \
mensagem como uma pergunta completa, que dê para entender sem o histórico, trazendo dele o que \
faltar (assunto, curso, disciplina, período). Se a mensagem já se entende sozinha, devolva-a \
como está. Não responda à pergunta. Responda só com a pergunta, em uma linha."""


def inicio_do_dia(settings: Settings) -> datetime:
    fuso = ZoneInfo(settings.fuso_horario)
    return datetime.combine(datetime.now(fuso).date(), time.min, tzinfo=fuso).astimezone(UTC)


def perguntas_restantes(db: Session, usuario: Usuario, settings: Settings) -> int | None:
    """Quantas perguntas o usuário ainda pode fazer hoje. None = sem limite (admin)."""
    if usuario.papel == "admin":
        return None
    feitas = db.scalar(
        select(func.count(Mensagem.id)).where(
            Mensagem.usuario_id == usuario.id,
            Mensagem.papel == "usuario",
            Mensagem.criada_em >= inicio_do_dia(settings),
        )
    )
    return max(settings.limite_diario_perguntas - (feitas or 0), 0)


def descrever_perfil(usuario: Usuario) -> str:
    vinculo = VINCULOS.get(usuario.vinculo, usuario.vinculo)
    return f"{vinculo} do curso de {usuario.curso}" if usuario.curso else vinculo


def carregar_historico(db: Session, conversa_id: int, antes_de: int, limite: int) -> list[dict]:
    """Últimas mensagens da conversa antes da mensagem `antes_de`, no formato da API."""
    mensagens = db.scalars(
        select(Mensagem)
        .where(
            Mensagem.conversa_id == conversa_id,
            Mensagem.id < antes_de,
            Mensagem.motivo.is_distinct_from("erro"),
        )
        .order_by(Mensagem.id.desc())
        .limit(limite)
    ).all()
    historico = [
        {
            "role": "user" if m.papel == "usuario" else "assistant",
            "content": m.conteudo[:MAX_CHARS_HISTORICO],
        }
        for m in reversed(mensagens)
    ]
    # A API exige que a conversa comece pelo usuário.
    while historico and historico[0]["role"] != "user":
        historico.pop(0)
    return historico


def reescrever_pergunta(
    historico: list[dict], pergunta: str, perfil: str, cliente, settings: Settings
) -> str:
    """Transforma "e para SI?" em uma pergunta que a busca entende sozinha."""
    if not historico:
        return pergunta
    linhas = [
        f"{'Usuário' if m['role'] == 'user' else 'Assistente'}: {m['content']}" for m in historico
    ]
    conteudo = (
        "<historico>\n" + "\n".join(linhas) + "\n</historico>\n\n"
        f"<quem_pergunta>{perfil}</quem_pergunta>\n\n"
        f"<nova_mensagem>{pergunta}</nova_mensagem>"
    )
    resp = cliente.beta.messages.create(
        model=settings.reescrita_model,
        max_tokens=4000,
        system=PROMPT_REESCRITA,
        messages=[{"role": "user", "content": conteudo}],
        output_config={"effort": "low"},
        **opcoes_fallback(settings.reescrita_model),
    )
    if resp.stop_reason == "refusal":
        return pergunta
    texto = "".join(b.text for b in resp.content if b.type == "text").strip().strip('"')
    return texto or pergunta
