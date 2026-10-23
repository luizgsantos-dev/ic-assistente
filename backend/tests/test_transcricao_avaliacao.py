from datetime import date

from app.avaliacao import carregar_casos
from app.ingestao.transcricao import dividir_paginas_transcritas


def test_transcricao_dividida_por_pagina_com_secao_continuando():
    texto = (
        "<!-- página 1 -->\n# Resolução 05/2024\n\nArt. 1 O aproveitamento...\n\n"
        "<!-- pagina 2 -->\nParágrafo único. Continua.\n"
    )
    blocos = dividir_paginas_transcritas(texto)
    assert [(b.pagina, b.secao) for b in blocos] == [
        (1, "Resolução 05/2024"),
        (2, "Resolução 05/2024"),
    ]


def test_transcricao_sem_marcas_vira_markdown_simples():
    blocos = dividir_paginas_transcritas("# Título\n\nTexto.")
    assert blocos[0].pagina is None and blocos[0].secao == "Título"


def test_carregar_casos_pula_os_sem_resposta(tmp_path):
    arquivo = tmp_path / "p.yaml"
    arquivo.write_text(
        "- id: a\n  pergunta: quando acaba?\n  hoje: 2026-10-23\n  esperado: 12/12/2026\n"
        "- id: b\n  pergunta: e a outra?\n  esperado: PREENCHER\n"
        "- id: c\n  pergunta: copa?\n  deve_recusar: true\n",
        encoding="utf-8",
    )
    casos, pendentes = carregar_casos(arquivo)
    assert [c.id for c in casos] == ["a", "c"]
    assert pendentes == ["b"]
    assert casos[0].hoje == date(2026, 10, 23)
    assert casos[1].deve_recusar


def test_arquivo_de_perguntas_do_repositorio_e_valido():
    from app.config import RAIZ_REPO

    casos, pendentes = carregar_casos(RAIZ_REPO / "evals" / "perguntas.yaml")
    assert len(casos) + len(pendentes) >= 5
