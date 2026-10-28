"""Dependências das rotas: banco, configuração, usuário logado e cliente da API do Claude."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import Settings
from ..llm import criar_cliente
from ..models import Usuario
from ..seguranca import usuario_da_sessao

COOKIE_SESSAO = "ic_sessao"
METODOS_COM_CORPO = {"POST", "PUT", "PATCH"}


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _db(request: Request) -> Iterator[Session]:
    with request.app.state.fabrica_sessao() as s:
        yield s


Config = Annotated[Settings, Depends(_settings)]
Db = Annotated[Session, Depends(_db)]


def protecao_csrf(request: Request) -> None:
    """Contra CSRF: um formulário de outro site não consegue enviar JSON, nem um cabeçalho
    próprio, sem passar pelo CORS, que esta API não libera para ninguém. Envio de arquivo
    (multipart) só é aceito com o cabeçalho X-Requested-With."""
    if request.method not in METODOS_COM_CORPO:
        return
    tipo = request.headers.get("content-type", "")
    if tipo.startswith("application/json"):
        return
    if tipo.startswith("multipart/form-data") and request.headers.get("x-requested-with"):
        return
    raise HTTPException(415, "Envie os dados em JSON.")


def _usuario_atual(request: Request, db: Db) -> Usuario:
    token = request.cookies.get(COOKIE_SESSAO)
    usuario = usuario_da_sessao(db, token) if token else None
    if usuario is None:
        raise HTTPException(401, "Faça login para continuar.")
    return usuario


UsuarioAtual = Annotated[Usuario, Depends(_usuario_atual)]


def _exigir_admin(usuario: UsuarioAtual) -> Usuario:
    if usuario.papel != "admin":
        raise HTTPException(403, "Acesso restrito à secretaria.")
    return usuario


Admin = Annotated[Usuario, Depends(_exigir_admin)]


def tem_credencial(cliente) -> bool:
    return bool(
        getattr(cliente, "api_key", None)
        or getattr(cliente, "auth_token", None)
        or getattr(cliente, "credentials", None)
    )


def cliente_llm(estado) -> object | None:
    """Cliente da API do Claude, criado no primeiro uso. None se não houver chave configurada."""
    if estado.cliente is None:
        cliente = criar_cliente(estado.settings)
        if not tem_credencial(cliente):
            return None
        estado.cliente = cliente
    return estado.cliente
