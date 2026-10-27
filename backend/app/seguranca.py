"""Senhas, sessões e tokens de redefinição de senha."""

import hashlib
import secrets
import threading
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import Sessao, TokenSenha, Usuario

_hasher = PasswordHasher()

# Calculado uma vez: no login com e-mail inexistente a verificação roda contra ele, para o tempo
# de resposta não revelar quais e-mails têm conta.
_HASH_FALSO = _hasher.hash("senha-que-ninguem-usa")

VALIDADE_TOKEN_SENHA = timedelta(hours=1)


def agora() -> datetime:
    return datetime.now(UTC)


def gerar_hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def senha_confere(senha: str, senha_hash: str | None) -> bool:
    try:
        return _hasher.verify(senha_hash or _HASH_FALSO, senha) and senha_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def criar_sessao(db: Session, usuario: Usuario, dias: int) -> str:
    """Cria a sessão e devolve o token que vai no cookie (só o hash fica no banco)."""
    token = secrets.token_urlsafe(32)
    db.add(
        Sessao(
            usuario_id=usuario.id,
            token_hash=_hash_token(token),
            expira_em=agora() + timedelta(days=dias),
        )
    )
    usuario.ultimo_acesso = agora()
    db.commit()
    return token


def usuario_da_sessao(db: Session, token: str) -> Usuario | None:
    sessao = db.scalar(select(Sessao).where(Sessao.token_hash == _hash_token(token)))
    if sessao is None or sessao.expira_em <= agora() or not sessao.usuario.ativo:
        return None
    return sessao.usuario


def encerrar_sessao(db: Session, token: str) -> None:
    db.execute(delete(Sessao).where(Sessao.token_hash == _hash_token(token)))
    db.commit()


class LimitadorTentativas:
    """Trava o login de um e-mail depois de várias senhas erradas seguidas.

    Fica na memória do processo: com mais de um worker cada um conta separado, o que ainda
    deixa um ataque de força bruta inviável.
    """

    def __init__(self, maximo: int = 5, janela: timedelta = timedelta(minutes=15)):
        self._maximo = maximo
        self._janela = janela
        self._falhas: dict[str, deque[datetime]] = defaultdict(deque)
        self._trava = threading.Lock()

    def _limpar_antigas(self, chave: str) -> deque[datetime]:
        falhas = self._falhas[chave]
        while falhas and falhas[0] < agora() - self._janela:
            falhas.popleft()
        return falhas

    def bloqueado(self, chave: str) -> bool:
        with self._trava:
            return len(self._limpar_antigas(chave)) >= self._maximo

    def registrar_falha(self, chave: str) -> None:
        with self._trava:
            self._limpar_antigas(chave).append(agora())

    def zerar(self, chave: str) -> None:
        with self._trava:
            self._falhas.pop(chave, None)


def criar_token_senha(db: Session, usuario: Usuario) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        TokenSenha(
            usuario_id=usuario.id,
            token_hash=_hash_token(token),
            expira_em=agora() + VALIDADE_TOKEN_SENHA,
        )
    )
    db.commit()
    return token


def usar_token_senha(db: Session, token: str, nova_senha: str) -> bool:
    """Troca a senha se o token for válido. Derruba todas as sessões abertas do usuário."""
    registro = db.scalar(select(TokenSenha).where(TokenSenha.token_hash == _hash_token(token)))
    if registro is None or registro.usado_em is not None or registro.expira_em <= agora():
        return False
    usuario = db.get(Usuario, registro.usuario_id)
    if usuario is None or not usuario.ativo:
        return False
    registro.usado_em = agora()
    usuario.senha_hash = gerar_hash_senha(nova_senha)
    db.execute(delete(Sessao).where(Sessao.usuario_id == usuario.id))
    db.commit()
    return True
