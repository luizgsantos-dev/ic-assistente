"""Conversas e o chat em si (resposta em streaming, via server-sent events)."""

import json
import logging
from collections.abc import Iterator
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..atendimento import (
    carregar_historico,
    descrever_perfil,
    perguntas_restantes,
    reescrever_pergunta,
)
from ..busca import buscar
from ..models import Conversa, Mensagem, Usuario
from ..resposta import Resposta, responder_em_partes
from ..seguranca import agora
from .deps import Config, Db, UsuarioAtual, cliente_llm, exigir_json
from .esquemas import ConversaDetalhe, ConversaResumo, PerguntaEntrada, RenomearEntrada

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["conversas"], dependencies=[Depends(exigir_json)])

MAX_CHARS_TITULO = 60


class SemChaveApi(RuntimeError):
    pass


def _conversa_do_usuario(db: Session, conversa_id: int, usuario: Usuario) -> Conversa:
    conversa = db.get(Conversa, conversa_id)
    # 404 também para conversa de outra pessoa, para não revelar que ela existe.
    if conversa is None or conversa.usuario_id != usuario.id:
        raise HTTPException(404, "Conversa não encontrada.")
    return conversa


def _titulo(pergunta: str) -> str:
    texto = " ".join(pergunta.split())
    if len(texto) <= MAX_CHARS_TITULO:
        return texto
    corte = texto.rfind(" ", 0, MAX_CHARS_TITULO)
    return texto[: corte if corte > 20 else MAX_CHARS_TITULO] + "…"


@router.get("/conversas")
def listar_conversas(usuario: UsuarioAtual, db: Db) -> list[ConversaResumo]:
    conversas = db.scalars(
        select(Conversa)
        .where(Conversa.usuario_id == usuario.id)
        .order_by(Conversa.atualizada_em.desc())
        .limit(100)
    ).all()
    return [ConversaResumo.model_validate(c) for c in conversas]


@router.get("/conversas/{conversa_id}")
def abrir_conversa(conversa_id: int, usuario: UsuarioAtual, db: Db) -> ConversaDetalhe:
    return ConversaDetalhe.model_validate(_conversa_do_usuario(db, conversa_id, usuario))


@router.patch("/conversas/{conversa_id}")
def renomear_conversa(
    conversa_id: int, dados: RenomearEntrada, usuario: UsuarioAtual, db: Db
) -> ConversaResumo:
    conversa = _conversa_do_usuario(db, conversa_id, usuario)
    conversa.titulo = dados.titulo.strip()
    db.commit()
    return ConversaResumo.model_validate(conversa)


@router.delete("/conversas/{conversa_id}", status_code=204)
def apagar_conversa(conversa_id: int, usuario: UsuarioAtual, db: Db) -> None:
    db.delete(_conversa_do_usuario(db, conversa_id, usuario))
    db.commit()


@router.post("/chat")
def conversar(
    dados: PerguntaEntrada, request: Request, usuario: UsuarioAtual, db: Db, settings: Config
) -> StreamingResponse:
    restantes = perguntas_restantes(db, usuario, settings)
    if restantes == 0:
        raise HTTPException(
            429,
            f"Você chegou ao limite de {settings.limite_diario_perguntas} perguntas por hoje. "
            "O limite renova amanhã.",
        )
    pergunta = dados.pergunta.strip()
    if not pergunta:
        raise HTTPException(422, "Escreva uma pergunta.")

    if dados.conversa_id is not None:
        conversa = _conversa_do_usuario(db, dados.conversa_id, usuario)
    else:
        conversa = Conversa(usuario_id=usuario.id, titulo=_titulo(pergunta))
        db.add(conversa)
        db.flush()
    conversa.atualizada_em = agora()
    mensagem = Mensagem(
        conversa_id=conversa.id, usuario_id=usuario.id, papel="usuario", conteudo=pergunta
    )
    db.add(mensagem)
    db.commit()

    eventos = _responder(
        request.app.state,
        conversa_id=conversa.id,
        titulo=conversa.titulo,
        mensagem_id=mensagem.id,
        usuario_id=usuario.id,
        pergunta=pergunta,
        perfil=descrever_perfil(usuario),
        restantes=None if restantes is None else restantes - 1,
    )
    return StreamingResponse(
        eventos,
        media_type="text/event-stream",
        # X-Accel-Buffering: o Nginx não pode segurar os pedaços da resposta.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _evento(nome: str, dados: dict) -> str:
    return f"event: {nome}\ndata: {json.dumps(dados, ensure_ascii=False, default=str)}\n\n"


def _responder(
    estado,
    *,
    conversa_id: int,
    titulo: str,
    mensagem_id: int,
    usuario_id: int,
    pergunta: str,
    perfil: str,
    restantes: int | None,
) -> Iterator[str]:
    """Busca, chama o Claude e salva a resposta, emitindo os eventos para o navegador.

    A conexão com o banco fica aberta só na busca e no salvamento, não durante a geração,
    que pode levar dezenas de segundos.
    """
    settings = estado.settings
    yield _evento(
        "inicio", {"conversa_id": conversa_id, "titulo": titulo, "mensagem_id": mensagem_id}
    )
    resposta: Resposta | None = None
    pergunta_busca = pergunta
    try:
        cliente = cliente_llm(estado)
        with estado.fabrica_sessao() as db:
            historico = carregar_historico(
                db, conversa_id, mensagem_id, settings.historico_mensagens
            )
            if historico:
                if cliente is None:
                    raise SemChaveApi
                pergunta_busca = reescrever_pergunta(historico, pergunta, perfil, cliente, settings)
            trechos = buscar(db, pergunta_busca, estado.embedder, settings)
        if trechos and cliente is None:
            raise SemChaveApi

        for parte in responder_em_partes(
            pergunta, trechos, cliente, settings, historico=historico, perfil=perfil
        ):
            if isinstance(parte, Resposta):
                resposta = parte
            else:
                yield _evento("texto", {"t": parte})
    except Exception as e:
        if isinstance(e, SemChaveApi):
            texto = "O assistente ainda não está configurado (falta a chave da API)."
        else:
            log.exception("erro ao responder a mensagem %s", mensagem_id)
            texto = "Não consegui responder agora. Tente de novo em instantes."
        _salvar(
            estado,
            conversa_id,
            usuario_id,
            mensagem_id,
            pergunta,
            pergunta_busca,
            Resposta(texto, fundamentada=False, motivo="erro"),
        )
        yield _evento("erro", {"mensagem": texto, "perguntas_restantes": restantes})
        return

    salva_id = _salvar(
        estado, conversa_id, usuario_id, mensagem_id, pergunta, pergunta_busca, resposta
    )
    yield _evento(
        "fim",
        {
            "mensagem_id": salva_id,
            # O texto final pode ser diferente do que foi transmitido (ex.: recusa).
            "texto": resposta.texto,
            "fundamentada": resposta.fundamentada,
            "motivo": resposta.motivo,
            "citacoes": [asdict(c) for c in resposta.citacoes],
            "perguntas_restantes": restantes,
        },
    )


def _salvar(
    estado,
    conversa_id: int,
    usuario_id: int,
    mensagem_id: int,
    pergunta: str,
    pergunta_busca: str,
    resposta: Resposta,
) -> int:
    with estado.fabrica_sessao() as db:
        if pergunta_busca != pergunta:
            db.get(Mensagem, mensagem_id).pergunta_busca = pergunta_busca
        salva = Mensagem(
            conversa_id=conversa_id,
            usuario_id=usuario_id,
            papel="assistente",
            conteudo=resposta.texto,
            fundamentada=resposta.fundamentada,
            motivo=resposta.motivo,
            citacoes=[asdict(c) for c in resposta.citacoes],
            trechos=[t.trecho_id for t in resposta.trechos],
            modelo=resposta.modelo,
            uso=resposta.uso or None,
        )
        db.add(salva)
        db.get(Conversa, conversa_id).atualizada_em = agora()
        db.commit()
        return salva.id
