"""Cliente falso da API do Claude: devolve respostas prontas e guarda o que recebeu."""

from types import SimpleNamespace


def resposta_api(blocos, stop_reason="end_turn", modelo="claude-opus-5-5"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        model=modelo,
        usage=SimpleNamespace(
            input_tokens=1200,
            output_tokens=150,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        ),
        content=blocos,
    )


def texto(t, citacoes=None):
    return SimpleNamespace(type="text", text=t, citations=citacoes)


def citacao(indice, texto_citado):
    return SimpleNamespace(
        type="search_result_location", search_result_index=indice, cited_text=texto_citado
    )


class _StreamFalso:
    def __init__(self, partes, final, erro=None):
        self._partes, self._final, self._erro = partes, final, erro

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def text_stream(self):
        yield from self._partes
        if self._erro:
            raise self._erro

    def get_final_message(self):
        return self._final


class ClienteFalso:
    """`create` atende a reescrita da pergunta; `stream` atende a resposta."""

    api_key = "chave-de-teste"

    def __init__(self):
        self.chamadas_create: list[dict] = []
        self.chamadas_stream: list[dict] = []
        self._creates: list = []
        self._streams: list = []
        self.beta = SimpleNamespace(
            messages=SimpleNamespace(create=self._create, stream=self._stream)
        )

    def programar_reescrita(self, pergunta: str) -> None:
        self._creates.append(resposta_api([texto(pergunta)]))

    def programar_resposta(
        self, partes: list[str], citacoes=None, stop_reason="end_turn", erro=None
    ) -> None:
        final = resposta_api([texto("".join(partes), citacoes)], stop_reason=stop_reason)
        self._streams.append((partes, final, erro))

    def _create(self, **kwargs):
        self.chamadas_create.append(kwargs)
        return self._creates.pop(0)

    def _stream(self, **kwargs):
        self.chamadas_stream.append(kwargs)
        return _StreamFalso(*self._streams.pop(0))
