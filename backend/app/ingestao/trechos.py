"""Divide os blocos de um documento em trechos do tamanho certo para busca."""

import re
from dataclasses import dataclass

from .leitura import Bloco

# Seção menor que isso é juntada com a próxima em vez de virar um trecho sozinha. Serve para
# PDFs, onde a conversão cria títulos quase vazios; em Markdown e DOCX os títulos foram
# escritos por alguém (ex.: uma pergunta de FAQ) e cada seção vira seu próprio trecho.
MIN_CHARS_SECAO = 150

_RE_FIM_FRASE = re.compile(r"(?<=[.!?;])\s+")
_RE_SEPARADOR_TABELA = re.compile(r"^\|[\s:\-|]+\|$")


@dataclass
class TrechoGerado:
    conteudo: str
    secao: str | None
    pagina_inicio: int | None
    pagina_fim: int | None


@dataclass
class _Unidade:
    texto: str
    pagina: int | None
    secao: str | None


def gerar_trechos(
    blocos: list[Bloco],
    max_chars: int = 1500,
    overlap_chars: int = 250,
    min_chars_secao: int = MIN_CHARS_SECAO,
) -> list[TrechoGerado]:
    unidades = [
        _Unidade(pedaco, bloco.pagina, bloco.secao)
        for bloco in blocos
        for paragrafo in re.split(r"\n\s*\n", bloco.texto)
        if paragrafo.strip()
        for pedaco in _dividir_paragrafo(paragrafo.strip(), max_chars)
    ]

    trechos: list[TrechoGerado] = []
    atual: list[_Unidade] = []

    def tamanho(us: list[_Unidade]) -> int:
        return sum(len(u.texto) + 2 for u in us)

    def fechar() -> None:
        if atual:
            trechos.append(_montar(atual))

    ultima_secao: str | None = None
    for u in unidades:
        mudou_secao = bool(atual) and u.secao != ultima_secao
        if mudou_secao and tamanho(atual) >= min_chars_secao:
            fechar()
            atual = []
        elif atual and tamanho(atual) + len(u.texto) > max_chars:
            fechar()
            # Repete o fim do trecho anterior (mesma seção) para não cortar contexto no meio.
            atual = [] if mudou_secao else _sobreposicao(atual, overlap_chars)
            if atual and tamanho(atual) + len(u.texto) > max_chars:
                atual = []
        ultima_secao = u.secao
        if mudou_secao and atual and u.secao:
            # Seção pequena juntada com a seguinte: o título entra no texto para não se perder.
            u = _Unidade(f"### {_ultimo_nivel(u.secao)}\n{u.texto}", u.pagina, u.secao)
        atual.append(u)
    fechar()
    return trechos


def _montar(unidades: list[_Unidade]) -> TrechoGerado:
    paginas = [u.pagina for u in unidades if u.pagina is not None]
    return TrechoGerado(
        conteudo="\n\n".join(u.texto for u in unidades),
        secao=unidades[0].secao,
        pagina_inicio=min(paginas) if paginas else None,
        pagina_fim=max(paginas) if paginas else None,
    )


def _sobreposicao(unidades: list[_Unidade], limite: int) -> list[_Unidade]:
    resultado: list[_Unidade] = []
    total = 0
    for u in reversed(unidades):
        total += len(u.texto)
        if total > limite:
            break
        resultado.insert(0, u)
    # Sobrepor o trecho inteiro não acrescenta nada.
    return resultado if len(resultado) < len(unidades) else []


def _ultimo_nivel(secao: str) -> str:
    return secao.rsplit(" > ", 1)[-1]


def _dividir_paragrafo(paragrafo: str, max_chars: int) -> list[str]:
    if len(paragrafo) <= max_chars:
        return [paragrafo]
    if _eh_tabela(paragrafo):
        return _dividir_tabela(paragrafo, max_chars)
    return _empacotar(_RE_FIM_FRASE.split(paragrafo), max_chars, " ")


def _eh_tabela(paragrafo: str) -> bool:
    linhas = paragrafo.splitlines()
    return len(linhas) >= 2 and all(linha.lstrip().startswith("|") for linha in linhas)


def _dividir_tabela(tabela: str, max_chars: int) -> list[str]:
    """Divide uma tabela Markdown por linhas, repetindo o cabeçalho em cada pedaço."""
    linhas = tabela.splitlines()
    n_cabecalho = 2 if _RE_SEPARADOR_TABELA.match(linhas[1].strip()) else 1
    cabecalho, corpo = linhas[:n_cabecalho], linhas[n_cabecalho:]
    espaco = max(max_chars - len("\n".join(cabecalho)) - 1, max_chars // 2)
    return ["\n".join(cabecalho + [p]) for p in _empacotar(corpo, espaco, "\n")]


def _empacotar(partes: list[str], max_chars: int, sep: str) -> list[str]:
    pedacos: list[str] = []
    atual = ""
    for parte in partes:
        for sub in _cortar(parte, max_chars):
            if atual and len(atual) + len(sep) + len(sub) > max_chars:
                pedacos.append(atual)
                atual = sub
            else:
                atual = f"{atual}{sep}{sub}" if atual else sub
    if atual:
        pedacos.append(atual)
    return pedacos


def _cortar(texto: str, max_chars: int) -> list[str]:
    """Último recurso para uma frase gigante: corta no espaço mais próximo do limite."""
    pedacos = []
    while len(texto) > max_chars:
        corte = texto.rfind(" ", 0, max_chars)
        corte = corte if corte > max_chars // 2 else max_chars
        pedacos.append(texto[:corte].strip())
        texto = texto[corte:].strip()
    if texto:
        pedacos.append(texto)
    return pedacos
