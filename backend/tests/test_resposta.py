from datetime import date
from types import SimpleNamespace

import pytest

from app.busca import TrechoRecuperado, fundir_rrf
from app.resposta import interpretar, montar_mensagens, responder


def _trecho(i: int, conteudo: str = "O semestre termina em 12/12/2026.") -> TrechoRecuperado:
    return TrechoRecuperado(
        trecho_id=i,
        documento_id=10 + i,
        titulo=f"Calendário {i}",
        categoria="calendario",
        data_documento=date(2026, 1, 15),
        pagina_inicio=2,
        pagina_fim=3,
        secao="Datas",
        conteudo=conteudo,
        score=0.03,
        similaridade=0.8,
        achado_por_texto=True,
    )


def _resposta_api(conteudo, stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        model="claude-opus-5-5",
        usage=SimpleNamespace(
            input_tokens=1200,
            output_tokens=150,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        ),
        content=conteudo,
    )


class ClienteFalso:
    def __init__(self, resposta=None):
        self.chamadas: list[dict] = []
        self._resposta = resposta
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.chamadas.append(kwargs)
        return self._resposta


def test_rrf_premia_quem_aparece_nas_duas_listas():
    scores = fundir_rrf([[1, 2, 3], [3, 4]])
    assert max(scores, key=scores.get) == 3
    assert scores[1] > scores[2]


def test_mensagem_tem_resultados_de_busca_data_e_pergunta():
    trechos = [_trecho(1, "Primeiro parágrafo.\n\nSegundo parágrafo."), _trecho(2)]
    [msg] = montar_mensagens("quando acaba o semestre?", trechos, date(2026, 10, 23))
    assert msg["role"] == "user"
    *resultados, pedido = msg["content"]
    assert [r["type"] for r in resultados] == ["search_result", "search_result"]
    assert resultados[0]["citations"] == {"enabled": True}
    assert [b["text"] for b in resultados[0]["content"]] == [
        "Primeiro parágrafo.",
        "Segundo parágrafo.",
    ]
    assert "data do documento: 15/01/2026" in resultados[0]["title"]
    assert "p. 2–3" in resultados[0]["title"]
    assert pedido == {
        "type": "text",
        "text": "Data de hoje: 23/10/2026 (sexta-feira).\n\nPergunta: quando acaba o semestre?",
    }


def test_sem_trechos_nao_chama_a_api(settings):
    cliente = ClienteFalso()
    r = responder("qual o telefone da cantina?", [], cliente, settings)
    assert cliente.chamadas == []
    assert not r.fundamentada
    assert r.motivo == "sem_trechos"
    assert settings.contato_fallback in r.texto


def test_parametros_da_chamada(settings):
    cliente = ClienteFalso(_resposta_api([]))
    responder("pergunta", [_trecho(1)], cliente, settings, hoje=date(2026, 10, 23))
    [kw] = cliente.chamadas
    assert kw["model"] == "claude-opus-5-5"
    assert kw["fallbacks"] == "default"
    assert kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert kw["output_config"] == {"effort": "medium"}
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert settings.contato_fallback in kw["system"][0]["text"]
    # A API de 2026-10-21 rejeita parâmetros de amostragem.
    assert not {"temperature", "top_p", "top_k"} & kw.keys()


def test_haiku_vai_sem_fallback(settings):
    settings.llm_model = "claude-haiku-5-5"
    cliente = ClienteFalso(_resposta_api([]))
    responder("pergunta", [_trecho(1)], cliente, settings)
    assert "fallbacks" not in cliente.chamadas[0]


def test_resposta_com_citacoes_e_fundamentada(settings):
    trechos = [_trecho(1), _trecho(2)]
    resp = _resposta_api(
        [
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text="O semestre termina ", citations=None),
            SimpleNamespace(
                type="text",
                text="em 12/12/2026.",
                citations=[
                    SimpleNamespace(
                        type="search_result_location",
                        search_result_index=1,
                        cited_text="O semestre termina em 12/12/2026.",
                    ),
                    SimpleNamespace(
                        type="search_result_location",
                        search_result_index=1,
                        cited_text="O semestre termina em 12/12/2026.",
                    ),
                ],
            ),
        ]
    )
    r = interpretar(resp, trechos, settings)
    assert r.texto == "O semestre termina em 12/12/2026."
    assert r.fundamentada and r.motivo == "ok"
    assert len(r.citacoes) == 1
    assert (r.citacoes[0].documento_id, r.citacoes[0].paginas) == (12, "p. 2–3")
    assert r.uso["entrada"] == 1200


def test_resposta_sem_citacoes_nao_e_fundamentada(settings):
    resp = _resposta_api([SimpleNamespace(type="text", text="Não encontrei.", citations=None)])
    r = interpretar(resp, [_trecho(1)], settings)
    assert not r.fundamentada
    assert r.motivo == "sem_citacoes"


@pytest.mark.parametrize("stop_reason", ["refusal"])
def test_recusa_vira_mensagem_com_contato(settings, stop_reason):
    r = interpretar(_resposta_api([], stop_reason=stop_reason), [_trecho(1)], settings)
    assert r.motivo == "recusa"
    assert settings.contato_fallback in r.texto
