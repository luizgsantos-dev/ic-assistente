"""Testes do painel da secretaria e da avaliação 👍/👎."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.app import criar_app
from app.models import Trecho, Usuario
from tests.fakes import ClienteFalso, citacao
from tests.test_api import SENHA, cadastrar, perguntar
from tests.test_banco import GUIA

pytestmark = pytest.mark.db

AJAX = {"X-Requested-With": "fetch"}


@pytest.fixture
def llm():
    return ClienteFalso()


@pytest.fixture
def app(engine_teste, sessao_db, embedder, settings, llm):
    return criar_app(
        settings=settings,
        embedder=embedder,
        cliente=llm,
        engine=engine_teste,
        processamento_sincrono=True,
    )


@pytest.fixture
def secretaria(app, sessao_db):
    with TestClient(app) as cliente:
        cadastrar(
            cliente, email="secretaria@ufmt.br", nome="Secretaria", vinculo="tecnico", curso=None
        )
        sessao_db.scalar(
            select(Usuario).where(Usuario.email == "secretaria@ufmt.br")
        ).papel = "admin"
        sessao_db.commit()
        yield cliente


@pytest.fixture
def aluno(app):
    with TestClient(app) as cliente:
        cadastrar(cliente, email="aluno@ufmt.br", nome="Aluno")
        yield cliente


def enviar(cliente, nome="guia_ic.md", conteudo=GUIA, **campos):
    dados = {"categoria": "faq", "data_documento": "2026-03-01", **campos}
    return cliente.post(
        "/api/painel/documentos",
        files=[("arquivos", (nome, conteudo.encode("utf-8"), "text/markdown"))],
        data=dados,
        headers=AJAX,
    )


# --- acesso ---


def test_painel_so_para_secretaria(app, aluno):
    assert aluno.get("/api/painel/documentos").status_code == 403
    with TestClient(app) as anonimo:
        assert anonimo.get("/api/painel/documentos").status_code == 401


# --- documentos ---


def test_envio_processa_e_guarda_o_original(secretaria, settings):
    r = enviar(secretaria)
    assert r.status_code == 202, r.text
    [doc] = r.json()
    assert doc["status"] == "pronto"
    assert doc["trechos"] == 3
    assert doc["categoria"] == "faq"
    assert doc["data_documento"] == "2026-03-01" and doc["data_origem"] == "informada"
    assert doc["enviado_por"] == "Secretaria"
    assert not doc["ja_existia"]

    original = secretaria.get(f"/api/painel/documentos/{doc['id']}/arquivo")
    assert original.content.decode("utf-8") == GUIA
    trechos = secretaria.get(f"/api/painel/documentos/{doc['id']}/trechos").json()
    assert [t["secao"] for t in trechos] == [
        "Calendário Acadêmico",
        "Semana Acadêmica",
        "Aproveitamento de Estudos",
    ]

    # Mesmo arquivo de novo: não duplica.
    [repetido] = enviar(secretaria).json()
    assert repetido["id"] == doc["id"] and repetido["ja_existia"]
    # Sobrou só o arquivo guardado (nada de temporário).
    guardados = [p for p in Path(settings.pasta_arquivos).iterdir() if p.is_file()]
    assert len(guardados) == 1


def test_envio_recusado(secretaria, settings):
    r = secretaria.post(
        "/api/painel/documentos",
        files=[("arquivos", ("guia.md", b"x", "text/markdown"))],
        data={"categoria": "faq"},
    )
    assert r.status_code == 415  # sem o cabeçalho X-Requested-With
    assert enviar(secretaria, nome="planilha.xlsx").status_code == 400
    assert enviar(secretaria, categoria="inventada").status_code == 400
    settings.tamanho_maximo_mb = 0
    assert enviar(secretaria).status_code == 413


def test_editar_documento(secretaria, sessao_db):
    [antigo] = enviar(
        secretaria,
        nome="calendario_2025.md",
        conteudo="# Calendário\n\nO semestre termina em 13/12/2025.",
    ).json()
    [novo] = enviar(
        secretaria,
        nome="calendario_2026.md",
        conteudo="# Calendário\n\nO semestre termina em 12/12/2026.",
    ).json()
    url = f"/api/painel/documentos/{antigo['id']}"

    r = secretaria.patch(url, json={"titulo": "Calendário 2025", "data_documento": None})
    assert r.json()["titulo"] == "Calendário 2025"
    assert r.json()["data_documento"] is None and r.json()["data_origem"] is None
    contexto = sessao_db.scalar(select(Trecho.contexto).where(Trecho.documento_id == antigo["id"]))
    assert contexto.startswith("Calendário 2025")

    r = secretaria.patch(url, json={"substituido_por_id": novo["id"]})
    assert r.json()["substituido_por_titulo"] == novo["titulo"]
    assert (
        secretaria.patch(
            f"/api/painel/documentos/{novo['id']}", json={"substituido_por_id": antigo["id"]}
        ).status_code
        == 400
    )
    assert secretaria.patch(url, json={"substituido_por_id": antigo["id"]}).status_code == 400
    assert secretaria.patch(url, json={"categoria": "inventada"}).status_code == 400
    assert (
        secretaria.patch(url, json={"substituido_por_id": None}).json()["substituido_por_id"]
        is None
    )


def test_reprocessar_e_apagar(secretaria, settings):
    [doc] = enviar(secretaria).json()
    r = secretaria.post(f"/api/painel/documentos/{doc['id']}/reprocessar", json={})
    assert r.status_code == 202 and r.json()["status"] == "pronto"

    assert secretaria.delete(f"/api/painel/documentos/{doc['id']}").status_code == 204
    assert secretaria.get("/api/painel/documentos").json() == []
    assert not [p for p in Path(settings.pasta_arquivos).iterdir() if p.is_file()]


# --- avaliação, pendências e uso ---


def test_avaliar_resposta(aluno, llm, secretaria):
    enviar(secretaria)
    llm.programar_resposta(["Termina em 12/12/2026."], citacoes=[citacao(0, "12 de dezembro")])
    ev = perguntar(aluno, "quando acaba o semestre?")
    mensagem_id = ev[-1][1]["mensagem_id"]
    url = f"/api/mensagens/{mensagem_id}/avaliacao"

    assert aluno.post(url, json={"valor": 1}).json() == {"avaliacao": 1}
    conversa = aluno.get(f"/api/conversas/{ev[0][1]['conversa_id']}").json()
    assert conversa["mensagens"][1]["avaliacao"] == 1
    assert aluno.post(url, json={"valor": 0}).json() == {"avaliacao": None}
    assert aluno.post(url, json={"valor": 2}).status_code == 422
    # A secretaria (ou qualquer outra pessoa) não avalia resposta dos outros.
    assert secretaria.post(url, json={"valor": -1}).status_code == 404


def test_pendencias_sem_identificar_quem_perguntou(aluno, llm, secretaria):
    perguntar(aluno, "qual o telefone da cantina?")  # sem documentos: sem resposta
    enviar(secretaria)
    llm.programar_resposta(["Resposta errada."], citacoes=[citacao(0, "12 de dezembro")])
    ev = perguntar(aluno, "quando acaba o semestre?")
    aluno.post(f"/api/mensagens/{ev[-1][1]['mensagem_id']}/avaliacao", json={"valor": -1})

    todas = secretaria.get("/api/painel/pendencias").json()
    assert [p["pergunta"] for p in todas] == [
        "quando acaba o semestre?",
        "qual o telefone da cantina?",
    ]
    assert set(todas[0]) == {
        "mensagem_id",
        "pergunta",
        "resposta",
        "motivo",
        "avaliacao",
        "criada_em",
    }

    negativas = secretaria.get("/api/painel/pendencias?tipo=negativas").json()
    assert [p["resposta"] for p in negativas] == ["Resposta errada."]
    sem_resposta = secretaria.get("/api/painel/pendencias?tipo=sem_resposta").json()
    assert [p["motivo"] for p in sem_resposta] == ["sem_trechos"]
    assert aluno.get("/api/painel/pendencias").status_code == 403


def test_uso(aluno, llm, secretaria):
    enviar(secretaria)
    perguntar(aluno, "qual o telefone da cantina?")
    llm.programar_resposta(["Em 12/12/2026."], citacoes=[citacao(0, "12 de dezembro")])
    conversa_id = perguntar(aluno, "quando acaba o semestre?")[0][1]["conversa_id"]
    llm.programar_reescrita("Quando termina o semestre 2026/2?")
    llm.programar_resposta(["Em 12/12/2026."], citacoes=[citacao(0, "12 de dezembro")])
    perguntar(aluno, "e o 2026/2?", conversa_id)

    uso = secretaria.get("/api/painel/uso").json()
    assert len(uso["dias"]) == 30
    assert uso["dias"][-1]["perguntas"] == 3
    assert (uso["perguntas"], uso["sem_resposta"], uso["erros"]) == (3, 1, 0)
    assert uso["usuarios_total"] == 2 and uso["usuarios_ativos"] == 1
    assert uso["documentos_prontos"] == 1
    # Duas respostas e uma reescrita, cada uma com 1200 tokens de entrada e 150 de saída no
    # Opus 5.5 (US$ 4 / 20 por milhão): 3 × (0,0048 + 0,003) = 0,0234.
    assert uso["custo_estimado_usd"] == pytest.approx(0.0234)


# --- usuários ---


def test_gerenciar_usuarios(secretaria, aluno, settings):
    usuarios = secretaria.get("/api/painel/usuarios").json()
    assert {u["email"] for u in usuarios} == {"secretaria@ufmt.br", "aluno@ufmt.br"}
    assert [u["email"] for u in secretaria.get("/api/painel/usuarios?q=alu").json()] == [
        "aluno@ufmt.br"
    ]
    aluno_id = next(u["id"] for u in usuarios if u["email"] == "aluno@ufmt.br")
    proprio_id = next(u["id"] for u in usuarios if u["email"] == "secretaria@ufmt.br")

    assert (
        secretaria.patch(f"/api/painel/usuarios/{proprio_id}", json={"ativo": False}).status_code
        == 400
    )

    r = secretaria.patch(f"/api/painel/usuarios/{aluno_id}", json={"ativo": False})
    assert r.json()["ativo"] is False
    assert aluno.get("/api/auth/eu").status_code == 401  # sessão derrubada

    secretaria.patch(f"/api/painel/usuarios/{aluno_id}", json={"ativo": True})
    link = secretaria.post(f"/api/painel/usuarios/{aluno_id}/link-senha", json={}).json()["link"]
    assert link.startswith(f"{settings.url_publica}/redefinir-senha?token=")
    token = link.split("token=")[1]
    assert (
        aluno.post(
            "/api/auth/redefinir-senha", json={"token": token, "senha": "senha-nova-123"}
        ).status_code
        == 204
    )
    assert (
        aluno.post("/api/auth/login", json={"email": "aluno@ufmt.br", "senha": SENHA}).status_code
        == 401
    )
    assert (
        aluno.post(
            "/api/auth/login", json={"email": "aluno@ufmt.br", "senha": "senha-nova-123"}
        ).status_code
        == 200
    )


def test_config_traz_as_categorias(aluno):
    categorias = aluno.get("/api/config").json()["categorias"]
    assert categorias["calendario"] == "Calendário"
