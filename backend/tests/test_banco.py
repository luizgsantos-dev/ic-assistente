"""Testes de integração com o Postgres (pgvector + busca em português)."""

from datetime import date

import pytest
from sqlalchemy import select

from app.busca import buscar
from app.ingestao.leitura import Bloco
from app.ingestao.pipeline import ErroIngestao, ingerir_arquivo, substituir
from app.models import Documento, Trecho
from tests.pdfs import criar_pdf, criar_pdf_sem_texto

pytestmark = pytest.mark.db

GUIA = """\
# Calendário Acadêmico

O semestre letivo 2026/2 termina em 12 de dezembro de 2026. As aulas começaram em 10 de agosto
e o prazo para trancamento de disciplinas vai até 30 de setembro.

# Semana Acadêmica

A Semana Acadêmica da Computação é um evento anual com palestras, minicursos e maratona de
programação, organizado pelo centro acadêmico.

# Aproveitamento de Estudos

O pedido de aproveitamento de disciplinas cursadas em outra instituição é feito na secretaria,
com histórico escolar e ementas.
"""


@pytest.fixture
def guia(tmp_path):
    caminho = tmp_path / "guia_ic.md"
    caminho.write_text(GUIA, encoding="utf-8")
    return caminho


def _ingerir(sessao_db, caminho, embedder, settings, **kw):
    return ingerir_arquivo(sessao_db, caminho, embedder, settings, **kw)


def test_ingere_markdown_e_encontra_a_secao_certa(sessao_db, guia, embedder, settings):
    r = _ingerir(
        sessao_db, guia, embedder, settings, categoria="faq", data_documento=date(2026, 3, 1)
    )
    assert r.novo and r.documento.status == "pronto"
    assert len(r.documento.trechos) == 3

    trechos = buscar(sessao_db, "quando acaba o semestre?", embedder, settings)
    assert trechos[0].secao == "Calendário Acadêmico"
    assert "12 de dezembro" in trechos[0].conteudo

    trechos = buscar(sessao_db, "o que é a semana acadêmica", embedder, settings)
    assert trechos[0].secao == "Semana Acadêmica"


def test_busca_textual_ignora_acentos(sessao_db, guia, embedder, settings):
    _ingerir(sessao_db, guia, embedder, settings)
    settings.min_similarity = 1.1  # desliga a busca vetorial sozinha: só sobra a textual
    trechos = buscar(sessao_db, "calendario academico", embedder, settings)
    assert trechos and trechos[0].secao == "Calendário Acadêmico"
    assert trechos[0].achado_por_texto


def test_pergunta_sem_relacao_nao_traz_nada(sessao_db, guia, embedder, settings):
    _ingerir(sessao_db, guia, embedder, settings)
    assert buscar(sessao_db, "quem ganhou a copa do mundo de futebol?", embedder, settings) == []


def test_documento_substituido_sai_da_busca(sessao_db, tmp_path, embedder, settings):
    antigo = tmp_path / "calendario_2025.md"
    antigo.write_text(
        "# Calendário\n\nO semestre termina em 13 de dezembro de 2025.", encoding="utf-8"
    )
    novo = tmp_path / "calendario_2026.md"
    novo.write_text(
        "# Calendário\n\nO semestre termina em 12 de dezembro de 2026.", encoding="utf-8"
    )
    d_antigo = _ingerir(
        sessao_db, antigo, embedder, settings, data_documento=date(2025, 2, 1)
    ).documento
    d_novo = _ingerir(
        sessao_db, novo, embedder, settings, data_documento=date(2026, 2, 1)
    ).documento

    assert {t.documento_id for t in buscar(sessao_db, "semestre termina", embedder, settings)} == {
        d_antigo.id,
        d_novo.id,
    }
    substituir(sessao_db, d_antigo.id, d_novo.id)
    assert {t.documento_id for t in buscar(sessao_db, "semestre termina", embedder, settings)} == {
        d_novo.id,
    }


def test_mesmo_arquivo_nao_e_ingerido_duas_vezes(sessao_db, guia, embedder, settings):
    primeiro = _ingerir(sessao_db, guia, embedder, settings)
    segundo = _ingerir(sessao_db, guia, embedder, settings)
    assert not segundo.novo
    assert segundo.documento.id == primeiro.documento.id
    assert (
        sessao_db.scalar(select(Trecho.id).where(Trecho.documento_id != primeiro.documento.id))
        is None
    )


def test_pdf_guarda_paginas_e_data_dos_metadados(sessao_db, tmp_path, embedder, settings):
    caminho = criar_pdf(
        tmp_path / "ppc.pdf",
        [
            [
                ("Projeto Pedagógico do Curso", 18),
                ("O curso tem 8 semestres e funciona no período", 11),
                (
                    "integral, com disciplinas obrigatórias, optativas e atividades complementares",
                    11,
                ),
                ("distribuídas ao longo de quatro anos.", 11),
            ],
            [
                ("Estágio", 18),
                ("O estágio supervisionado tem 300 horas e pode ser feito", 11),
                ("a partir do sexto semestre, em empresa conveniada com a universidade.", 11),
            ],
        ],
        data_criacao="D:20240510120000",
    )
    r = _ingerir(sessao_db, caminho, embedder, settings, categoria="ppc")
    assert r.documento.data_documento == date(2024, 5, 10)
    assert any("metadados" in a for a in r.avisos)
    trechos = buscar(sessao_db, "quantas horas de estágio", embedder, settings)
    assert trechos[0].pagina_inicio == 2


def test_pdf_escaneado_sem_api_vira_erro_registrado(sessao_db, tmp_path, embedder, settings):
    caminho = criar_pdf_sem_texto(tmp_path / "portaria.pdf")
    with pytest.raises(ErroIngestao, match="escaneado"):
        _ingerir(sessao_db, caminho, embedder, settings)
    doc = sessao_db.scalar(select(Documento))
    assert doc.status == "erro" and "escaneado" in doc.erro


def test_pdf_escaneado_usa_o_transcritor(sessao_db, tmp_path, embedder, settings):
    caminho = criar_pdf_sem_texto(tmp_path / "portaria.pdf")

    def transcritor(_):
        return [Bloco("A matrícula de verão vai de 5 a 9 de janeiro.", 1, "Portaria 01/2026")]

    r = _ingerir(sessao_db, caminho, embedder, settings, transcritor=transcritor)
    assert r.documento.transcrito_por_ia
    assert any("transcrito" in a for a in r.avisos)
    assert (
        buscar(sessao_db, "matrícula de verão", embedder, settings)[0].secao == "Portaria 01/2026"
    )
