"""Testes da API web: autenticação, chat em streaming, histórico, limite e isolamento."""

import json
import re
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.app import criar_app
from app.api.rotas_conversas import _titulo
from app.atendimento import inicio_do_dia, reescrever_pergunta
from app.ingestao.pipeline import ingerir_arquivo
from app.models import Mensagem, Usuario
from tests.fakes import ClienteFalso, citacao
from tests.test_banco import GUIA

pytestmark = pytest.mark.db

SENHA = "senha-forte-1"


@pytest.fixture
def llm():
    return ClienteFalso()


@pytest.fixture
def api(engine_teste, sessao_db, embedder, settings, llm):
    # sessao_db entra só para limpar as tabelas ao fim de cada teste.
    app = criar_app(settings=settings, embedder=embedder, cliente=llm, engine=engine_teste)
    with TestClient(app) as cliente:
        yield cliente


@pytest.fixture
def com_guia(sessao_db, embedder, settings, tmp_path):
    caminho = tmp_path / "guia_ic.md"
    caminho.write_text(GUIA, encoding="utf-8")
    ingerir_arquivo(sessao_db, caminho, embedder, settings, data_documento=date(2026, 3, 1))


def cadastrar(
    api, email="ana@ufmt.br", nome="Ana", vinculo="aluno", curso="Sistemas de Informação"
):
    r = api.post(
        "/api/auth/cadastro",
        json={
            "nome": nome,
            "email": email,
            "senha": SENHA,
            "vinculo": vinculo,
            "curso": curso,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def eventos(resposta) -> list[tuple[str, dict]]:
    lista = []
    for bloco in resposta.text.strip().split("\n\n"):
        campos = dict(linha.split(": ", 1) for linha in bloco.splitlines())
        lista.append((campos["event"], json.loads(campos["data"])))
    return lista


def perguntar(api, pergunta, conversa_id=None):
    r = api.post("/api/chat", json={"pergunta": pergunta, "conversa_id": conversa_id})
    assert r.status_code == 200, r.text
    return eventos(r)


# --- autenticação ---


def test_cadastro_login_e_sair(api):
    usuario = cadastrar(api)
    assert usuario["email"] == "ana@ufmt.br"
    assert usuario["perguntas_restantes"] == 30
    assert api.get("/api/auth/eu").status_code == 200

    assert api.post("/api/auth/sair", json={}).status_code == 204
    assert api.get("/api/auth/eu").status_code == 401

    assert (
        api.post("/api/auth/login", json={"email": "ana@ufmt.br", "senha": "errada"}).status_code
        == 401
    )
    r = api.post("/api/auth/login", json={"email": "ANA@UFMT.BR", "senha": SENHA})
    assert r.status_code == 200
    assert r.json()["nome"] == "Ana"


def test_email_repetido_e_senha_curta(api):
    cadastrar(api)
    assert (
        api.post(
            "/api/auth/cadastro",
            json={
                "nome": "Outra",
                "email": "Ana@UFMT.br",
                "senha": SENHA,
                "vinculo": "docente",
            },
        ).status_code
        == 409
    )
    assert (
        api.post(
            "/api/auth/cadastro",
            json={
                "nome": "Beto",
                "email": "beto@ufmt.br",
                "senha": "123",
                "vinculo": "aluno",
            },
        ).status_code
        == 422
    )


def test_login_trava_depois_de_varias_senhas_erradas(api):
    cadastrar(api)
    api.post("/api/auth/sair", json={})
    for _ in range(5):
        assert (
            api.post("/api/auth/login", json={"email": "ana@ufmt.br", "senha": "x"}).status_code
            == 401
        )
    r = api.post("/api/auth/login", json={"email": "ana@ufmt.br", "senha": SENHA})
    assert r.status_code == 429


def test_esqueci_a_senha(api, monkeypatch):
    enviados = []
    monkeypatch.setattr(
        "app.api.rotas_auth.enviar_email",
        lambda settings, para, assunto, corpo: enviados.append((para, corpo)),
    )
    cadastrar(api)
    cookie_antigo = api.cookies.get("ic_sessao")

    assert api.post("/api/auth/esqueci-senha", json={"email": "ninguem@ufmt.br"}).status_code == 202
    assert enviados == []
    assert api.post("/api/auth/esqueci-senha", json={"email": "ana@ufmt.br"}).status_code == 202
    [(para, corpo)] = enviados
    assert para == "ana@ufmt.br"
    token = re.search(r"token=([\w-]+)", corpo).group(1)

    nova = "outra-senha-forte"
    assert (
        api.post("/api/auth/redefinir-senha", json={"token": token, "senha": nova}).status_code
        == 204
    )
    # O link vale uma vez só, e as sessões abertas caem.
    assert (
        api.post("/api/auth/redefinir-senha", json={"token": token, "senha": nova}).status_code
        == 400
    )
    api.cookies.set("ic_sessao", cookie_antigo)
    assert api.get("/api/auth/eu").status_code == 401
    assert (
        api.post("/api/auth/login", json={"email": "ana@ufmt.br", "senha": nova}).status_code == 200
    )


def test_post_que_nao_e_json_e_recusado(api):
    r = api.post(
        "/api/auth/login",
        content="email=a&senha=b",
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 415


def test_config_publica(api, settings):
    settings.cursos = ["Sistemas de Informação"]
    dados = api.get("/api/config").json()
    assert dados["cursos"] == ["Sistemas de Informação"]
    assert dados["contato"] == "cacomp@ic.ufmt.br"
    assert "aluno" in dados["vinculos"]


# --- chat ---


def test_sem_documentos_responde_sem_chamar_a_api(api, llm):
    cadastrar(api)
    ev = perguntar(api, "Quem ganhou a copa?")
    assert [nome for nome, _ in ev] == ["inicio", "texto", "fim"]
    fim = ev[-1][1]
    assert fim["motivo"] == "sem_trechos"
    assert fim["perguntas_restantes"] == 29
    assert "cacomp@ic.ufmt.br" in fim["texto"]
    assert llm.chamadas_stream == [] and llm.chamadas_create == []

    [conversa] = api.get("/api/conversas").json()
    assert conversa["titulo"] == "Quem ganhou a copa?"
    detalhe = api.get(f"/api/conversas/{conversa['id']}").json()
    assert [m["papel"] for m in detalhe["mensagens"]] == ["usuario", "assistente"]


def test_resposta_em_partes_com_citacoes_e_perfil(api, llm, com_guia):
    llm.programar_resposta(
        ["O semestre termina ", "em 12 de dezembro de 2026."],
        citacoes=[citacao(0, "O semestre letivo 2026/2 termina em 12 de dezembro de 2026.")],
    )
    cadastrar(api)
    ev = perguntar(api, "quando acaba o semestre?")

    assert "".join(d["t"] for nome, d in ev if nome == "texto") == (
        "O semestre termina em 12 de dezembro de 2026."
    )
    fim = ev[-1][1]
    assert fim["fundamentada"] and fim["motivo"] == "ok"
    assert fim["citacoes"][0]["titulo"] == "guia ic"

    [chamada] = llm.chamadas_stream
    pedido = chamada["messages"][-1]["content"][-1]["text"]
    assert "Quem pergunta: Aluno do curso de Sistemas de Informação." in pedido
    assert chamada["fallbacks"] == "default"
    assert "temperature" not in chamada

    conversa_id = ev[0][1]["conversa_id"]
    salva = api.get(f"/api/conversas/{conversa_id}").json()["mensagens"][1]
    assert salva["citacoes"][0]["texto_citado"].startswith("O semestre letivo")


def test_continuacao_usa_historico_e_reescreve_a_pergunta(api, llm, com_guia, sessao_db):
    cadastrar(api)
    llm.programar_resposta(["É um evento anual."], citacoes=[citacao(0, "evento anual")])
    conversa_id = perguntar(api, "o que é a semana acadêmica?")[0][1]["conversa_id"]

    llm.programar_reescrita("Quem organiza a Semana Acadêmica da Computação?")
    llm.programar_resposta(["O centro acadêmico."], citacoes=[citacao(0, "centro acadêmico")])
    ev = perguntar(api, "e quem organiza?", conversa_id)
    assert ev[-1][0] == "fim"

    [reescrita] = llm.chamadas_create
    assert "o que é a semana acadêmica?" in reescrita["messages"][0]["content"]
    assert "e quem organiza?" in reescrita["messages"][0]["content"]

    mensagens = llm.chamadas_stream[1]["messages"]
    assert [m["role"] for m in mensagens] == ["user", "assistant", "user"]
    assert mensagens[1]["content"] == "É um evento anual."

    pergunta = sessao_db.scalar(select(Mensagem).where(Mensagem.conteudo == "e quem organiza?"))
    assert pergunta.pergunta_busca == "Quem organiza a Semana Acadêmica da Computação?"


def test_limite_diario_e_admin_sem_limite(api, settings, sessao_db):
    settings.limite_diario_perguntas = 2
    cadastrar(api)
    perguntar(api, "primeira")
    perguntar(api, "segunda")
    r = api.post("/api/chat", json={"pergunta": "terceira"})
    assert r.status_code == 429
    assert "limite de 2 perguntas" in r.json()["detail"]
    assert api.get("/api/auth/eu").json()["perguntas_restantes"] == 0

    sessao_db.scalar(select(Usuario)).papel = "admin"
    sessao_db.commit()
    assert api.get("/api/auth/eu").json()["perguntas_restantes"] is None
    assert perguntar(api, "terceira")[-1][0] == "fim"


def test_conversa_de_outra_pessoa_e_invisivel(api):
    cadastrar(api, email="ana@ufmt.br")
    conversa_id = perguntar(api, "pergunta da Ana")[0][1]["conversa_id"]
    api.post("/api/auth/sair", json={})

    cadastrar(api, email="beto@ufmt.br", nome="Beto")
    assert api.get("/api/conversas").json() == []
    assert api.get(f"/api/conversas/{conversa_id}").status_code == 404
    assert api.delete(f"/api/conversas/{conversa_id}").status_code == 404
    r = api.post("/api/chat", json={"pergunta": "oi", "conversa_id": conversa_id})
    assert r.status_code == 404


def test_renomear_e_apagar_conversa(api):
    cadastrar(api)
    conversa_id = perguntar(api, "pergunta")[0][1]["conversa_id"]
    r = api.patch(f"/api/conversas/{conversa_id}", json={"titulo": "Matrícula"})
    assert r.json()["titulo"] == "Matrícula"
    assert api.delete(f"/api/conversas/{conversa_id}").status_code == 204
    assert api.get("/api/conversas").json() == []


def test_falha_na_api_vira_evento_de_erro_e_sai_do_historico(api, llm, com_guia):
    cadastrar(api)
    llm.programar_resposta(["O seme"], erro=RuntimeError("conexão caiu"))
    ev = perguntar(api, "quando acaba o semestre?")
    assert [nome for nome, _ in ev] == ["inicio", "texto", "erro"]
    assert "Tente de novo" in ev[-1][1]["mensagem"]
    conversa_id = ev[0][1]["conversa_id"]
    detalhe = api.get(f"/api/conversas/{conversa_id}").json()
    assert detalhe["mensagens"][1]["motivo"] == "erro"

    llm.programar_reescrita("Quando termina o semestre?")
    llm.programar_resposta(["Em 12 de dezembro."], citacoes=[citacao(0, "12 de dezembro")])
    perguntar(api, "tenta de novo: quando acaba o semestre?", conversa_id)
    # A resposta que falhou não volta como contexto.
    assert [m["role"] for m in llm.chamadas_stream[1]["messages"]] == ["user", "user"]


def test_sem_chave_da_api(engine_teste, sessao_db, embedder, settings, com_guia, monkeypatch):
    for variavel in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(variavel, raising=False)
    app = criar_app(settings=settings, embedder=embedder, cliente=None, engine=engine_teste)
    with TestClient(app) as api:
        cadastrar(api)
        ev = perguntar(api, "quando acaba o semestre?")
        assert ev[-1][0] == "erro"
        assert "chave da API" in ev[-1][1]["mensagem"]
        # Sem trecho relevante não precisa da API.
        assert perguntar(api, "quem ganhou a copa do mundo?")[-1][1]["motivo"] == "sem_trechos"


# --- funções auxiliares ---


def test_titulo_da_conversa():
    assert _titulo("  quando   acaba o semestre? ") == "quando acaba o semestre?"
    longo = _titulo(
        "como faço para pedir aproveitamento de uma disciplina cursada em outra universidade?"
    )
    assert longo.endswith("…") and len(longo) <= 61


def test_sem_historico_nao_reescreve(settings):
    assert reescrever_pergunta([], "quando acaba?", "Aluno", object(), settings) == "quando acaba?"


def test_dia_comeca_a_meia_noite_de_cuiaba(settings):
    assert inicio_do_dia(settings).hour == 4  # UTC-4
