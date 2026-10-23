from app.ingestao.leitura import Bloco
from app.ingestao.trechos import gerar_trechos


def _paragrafo(n: int, tamanho: int = 300) -> str:
    base = f"Parágrafo {n} sobre o processo. "
    return (base * (tamanho // len(base) + 1))[:tamanho].strip()


def test_blocos_pequenos_da_mesma_secao_viram_um_trecho_com_intervalo_de_paginas():
    blocos = [Bloco("Primeira parte.", 1, "Calendário"), Bloco("Segunda parte.", 2, "Calendário")]
    trechos = gerar_trechos(blocos)
    assert len(trechos) == 1
    assert trechos[0].conteudo == "Primeira parte.\n\nSegunda parte."
    assert (trechos[0].pagina_inicio, trechos[0].pagina_fim) == (1, 2)
    assert trechos[0].secao == "Calendário"


def test_respeita_tamanho_maximo_e_sobrepoe_o_fim_do_trecho_anterior():
    texto = "\n\n".join(_paragrafo(i, 200) for i in range(10))
    trechos = gerar_trechos([Bloco(texto, 1, "Seção")], max_chars=700, overlap_chars=250)
    assert len(trechos) > 1
    assert all(len(t.conteudo) <= 700 for t in trechos)
    for anterior, seguinte in zip(trechos, trechos[1:], strict=False):
        ultimo_paragrafo = anterior.conteudo.split("\n\n")[-1]
        assert seguinte.conteudo.startswith(ultimo_paragrafo)


def test_paragrafo_gigante_e_dividido_por_frases():
    frase = "Esta é uma frase do regimento com várias palavras. "
    trechos = gerar_trechos([Bloco(frase * 100, 1, None)], max_chars=500, overlap_chars=0)
    assert len(trechos) > 1
    assert all(len(t.conteudo) <= 500 for t in trechos)
    assert all(t.conteudo.endswith(".") for t in trechos)


def test_tabela_grande_repete_cabecalho_em_cada_pedaco():
    linhas = ["| Disciplina | Carga |", "|---|---|"]
    linhas += [f"| Disciplina número {i} do curso | 64h |" for i in range(60)]
    trechos = gerar_trechos([Bloco("\n".join(linhas), 5, "Grade")], max_chars=600, overlap_chars=0)
    assert len(trechos) > 1
    for t in trechos:
        assert t.conteudo.startswith("| Disciplina | Carga |\n|---|---|")
        assert len(t.conteudo) <= 600


def test_secao_pequena_e_juntada_com_a_seguinte_sem_perder_o_titulo():
    blocos = [
        Bloco("Texto curto.", 1, "Cap > A"),
        Bloco("Outro texto curto.", 1, "Cap > B"),
        Bloco("Continuação de B.", 1, "Cap > B"),
    ]
    trechos = gerar_trechos(blocos)
    assert len(trechos) == 1
    assert trechos[0].conteudo == "Texto curto.\n\n### B\nOutro texto curto.\n\nContinuação de B."


def test_sem_minimo_cada_secao_vira_um_trecho():
    blocos = [Bloco("Curto.", 1, "A"), Bloco("Também curto.", 1, "B")]
    assert [t.secao for t in gerar_trechos(blocos, min_chars_secao=0)] == ["A", "B"]


def test_secao_grande_nao_se_mistura_com_a_proxima():
    blocos = [Bloco(_paragrafo(1, 600), 1, "A"), Bloco("Texto de B.", 2, "B")]
    trechos = gerar_trechos(blocos)
    assert [t.secao for t in trechos] == ["A", "B"]
