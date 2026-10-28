"""Cadastro, login, logout e recuperação de senha."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..atendimento import perguntas_restantes
from ..config import Settings
from ..correio import enviar_email
from ..models import Usuario
from ..seguranca import (
    criar_sessao,
    criar_token_senha,
    encerrar_sessao,
    gerar_hash_senha,
    senha_confere,
    usar_token_senha,
)
from .deps import COOKIE_SESSAO, Config, Db, UsuarioAtual, protecao_csrf
from .esquemas import (
    CadastroEntrada,
    EsqueciSenhaEntrada,
    LoginEntrada,
    RedefinirSenhaEntrada,
    UsuarioSaida,
)

router = APIRouter(prefix="/api/auth", tags=["autenticação"], dependencies=[Depends(protecao_csrf)])


def _saida(db: Session, usuario: Usuario, settings: Settings) -> UsuarioSaida:
    return UsuarioSaida(
        id=usuario.id,
        nome=usuario.nome,
        email=usuario.email,
        vinculo=usuario.vinculo,
        curso=usuario.curso,
        papel=usuario.papel,
        perguntas_restantes=perguntas_restantes(db, usuario, settings),
        limite_diario=settings.limite_diario_perguntas,
    )


def _abrir_sessao(response: Response, db: Session, usuario: Usuario, settings: Settings) -> None:
    response.set_cookie(
        COOKIE_SESSAO,
        criar_sessao(db, usuario, settings.sessao_dias),
        max_age=settings.sessao_dias * 24 * 3600,
        httponly=True,
        secure=settings.cookie_seguro,
        samesite="lax",
    )


@router.post("/cadastro", status_code=201)
def cadastrar(dados: CadastroEntrada, response: Response, db: Db, settings: Config) -> UsuarioSaida:
    email = dados.email.lower()
    if db.scalar(select(Usuario.id).where(Usuario.email == email)):
        raise HTTPException(409, "Já existe uma conta com este e-mail.")
    usuario = Usuario(
        nome=dados.nome.strip(),
        email=email,
        senha_hash=gerar_hash_senha(dados.senha),
        vinculo=dados.vinculo,
        curso=(dados.curso or "").strip() or None,
        papel="usuario",
        ativo=True,
    )
    db.add(usuario)
    db.commit()
    _abrir_sessao(response, db, usuario, settings)
    return _saida(db, usuario, settings)


@router.post("/login")
def entrar(
    dados: LoginEntrada, request: Request, response: Response, db: Db, settings: Config
) -> UsuarioSaida:
    email = dados.email.lower()
    limitador = request.app.state.limitador_login
    if limitador.bloqueado(email):
        raise HTTPException(429, "Muitas tentativas. Espere alguns minutos e tente de novo.")
    usuario = db.scalar(select(Usuario).where(Usuario.email == email))
    if not senha_confere(dados.senha, usuario.senha_hash if usuario else None) or not (
        usuario and usuario.ativo
    ):
        limitador.registrar_falha(email)
        raise HTTPException(401, "E-mail ou senha incorretos.")
    limitador.zerar(email)
    _abrir_sessao(response, db, usuario, settings)
    return _saida(db, usuario, settings)


@router.post("/sair", status_code=204)
def sair(request: Request, response: Response, db: Db) -> None:
    token = request.cookies.get(COOKIE_SESSAO)
    if token:
        encerrar_sessao(db, token)
    response.delete_cookie(COOKIE_SESSAO)


@router.get("/eu")
def eu(usuario: UsuarioAtual, db: Db, settings: Config) -> UsuarioSaida:
    return _saida(db, usuario, settings)


@router.post("/esqueci-senha", status_code=202)
def esqueci_senha(
    dados: EsqueciSenhaEntrada, tarefas: BackgroundTasks, db: Db, settings: Config
) -> dict:
    # A resposta é a mesma exista ou não a conta, para não revelar quem está cadastrado.
    usuario = db.scalar(select(Usuario).where(Usuario.email == dados.email.lower()))
    if usuario is not None and usuario.ativo:
        link = f"{settings.url_publica}/redefinir-senha?token={criar_token_senha(db, usuario)}"
        corpo = (
            f"Olá, {usuario.nome}.\n\n"
            "Recebemos um pedido para redefinir a sua senha no IC-Assistant. Para criar uma "
            f"senha nova, abra o link abaixo (ele vale por 1 hora):\n\n{link}\n\n"
            "Se você não pediu isso, ignore este e-mail; sua senha continua a mesma."
        )
        tarefas.add_task(enviar_email, settings, usuario.email, "Redefinição de senha", corpo)
    return {"mensagem": "Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha."}


@router.post("/redefinir-senha", status_code=204)
def redefinir_senha(dados: RedefinirSenhaEntrada, db: Db) -> None:
    if not usar_token_senha(db, dados.token, dados.senha):
        raise HTTPException(400, "Este link é inválido ou já expirou. Peça um novo.")
