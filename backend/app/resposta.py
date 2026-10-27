"""Geração da resposta com Claude, presa aos trechos recuperados por meio de citações."""

import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from .busca import TrechoRecuperado
from .config import Settings
from .llm import opcoes_fallback

DIAS_SEMANA = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
]

PROMPT_SISTEMA = """\
Você é o assistente virtual do Instituto de Computação (IC) da Universidade Federal de Mato \
Grosso (UFMT). Você atende alunos, professores e técnicos administrativos com dúvidas sobre o \
IC: processos e requerimentos, grade curricular, calendário acadêmico, eventos e o \
funcionamento do instituto.

Cada pergunta chega acompanhada de trechos de documentos oficiais do IC, na forma de \
resultados de busca. O título de cada resultado traz o nome do documento, a categoria, a data \
do documento e as páginas.

Como responder:
- Use somente as informações desses trechos. Não complete lacunas com conhecimento geral sobre \
a UFMT, sobre outras universidades ou sobre legislação, mesmo que pareça óbvio: quem pergunta \
vai agir com base na resposta, e um prazo ou procedimento errado causa prejuízo real.
- Se os trechos não respondem à pergunta, ou respondem só em parte, diga isso com clareza e \
oriente a pessoa a entrar em contato pelo e-mail {contato}. Dizer que não encontrou é sempre \
melhor do que adivinhar.
- Quando dois documentos tratarem do mesmo assunto de formas diferentes, siga o de data mais \
recente. Se a diferença importar para a pessoa, avise que existe uma versão anterior com outra \
informação.
- A data de hoje vem junto com a pergunta. Use-a para interpretar "este semestre", "o próximo \
prazo", "já passou?" e afins, comparando com as datas que aparecem nos documentos.
- As mensagens anteriores da conversa servem para entender a pergunta atual ("e para SI?"). Os \
fatos da resposta vêm dos trechos enviados junto com a pergunta atual.
- A pergunta pode trazer quem está perguntando (vínculo e curso). Use isso para escolher a \
informação certa, como as regras do curso da pessoa, sem supor mais nada sobre ela.
- Escreva em português do Brasil, de forma direta e cordial. Comece pela resposta e depois dê \
os detalhes que ajudarem. Para processos, use passos numerados.
- Não mencione nomes de arquivos, números de página nem "os trechos" na resposta, a menos que a \
pessoa peça a fonte; a interface mostra as fontes quando for preciso. Se pedirem, informe o \
documento e a página.
- Se a pergunta não tiver relação com o IC ou com a vida acadêmica, explique com gentileza que \
você só responde sobre o IC."""


@dataclass
class Citacao:
    documento_id: int
    titulo: str
    paginas: str | None
    texto_citado: str


@dataclass
class Resposta:
    texto: str
    # Sem nenhuma citação, a resposta não está apoiada nos documentos (em geral é um
    # "não encontrei"). É o que vai alimentar a lista de perguntas sem resposta do painel.
    fundamentada: bool
    motivo: str
    citacoes: list[Citacao] = field(default_factory=list)
    trechos: list[TrechoRecuperado] = field(default_factory=list)
    modelo: str | None = None
    uso: dict[str, int] = field(default_factory=dict)


def hoje_local(settings: Settings) -> date:
    return datetime.now(ZoneInfo(settings.fuso_horario)).date()


def prompt_sistema(settings: Settings) -> str:
    return PROMPT_SISTEMA.format(contato=settings.contato_fallback)


def _titulo_resultado(t: TrechoRecuperado) -> str:
    data = t.data_documento.strftime("%d/%m/%Y") if t.data_documento else "data não informada"
    partes = [t.titulo, f"categoria: {t.categoria}", f"data do documento: {data}"]
    if t.paginas:
        partes.append(t.paginas)
    if t.secao:
        partes.append(f"seção: {t.secao}")
    return " | ".join(partes)


def montar_mensagens(
    pergunta: str,
    trechos: list[TrechoRecuperado],
    hoje: date,
    historico: list[dict] | None = None,
    perfil: str | None = None,
) -> list[dict]:
    """`historico` são as mensagens anteriores só com texto ({"role", "content"}); os trechos
    vão apenas na pergunta atual, para não pagar de novo por eles a cada mensagem."""
    resultados = [
        {
            "type": "search_result",
            "source": f"documento:{t.documento_id}/trecho:{t.trecho_id}",
            "title": _titulo_resultado(t),
            # Um bloco por parágrafo: a citação aponta para blocos inteiros, então blocos
            # menores deixam a fonte mais precisa.
            "content": [
                {"type": "text", "text": p.strip()}
                for p in re.split(r"\n\s*\n", t.conteudo)
                if p.strip()
            ],
            "citations": {"enabled": True},
        }
        for t in trechos
    ]
    pedido = f"Data de hoje: {hoje.strftime('%d/%m/%Y')} ({DIAS_SEMANA[hoje.weekday()]}).\n"
    if perfil:
        pedido += f"Quem pergunta: {perfil}.\n"
    pedido += f"\nPergunta: {pergunta}"
    atual = {"role": "user", "content": [*resultados, {"type": "text", "text": pedido}]}
    return [*(historico or []), atual]


def mensagem_sem_resposta(settings: Settings) -> str:
    return (
        "Não encontrei essa informação nos documentos do IC. Para esse assunto, entre em "
        f"contato pelo e-mail {settings.contato_fallback}."
    )


def _parametros(
    pergunta: str,
    trechos: list[TrechoRecuperado],
    settings: Settings,
    hoje: date | None,
    historico: list[dict] | None,
    perfil: str | None,
) -> dict:
    return {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "system": [
            {
                "type": "text",
                "text": prompt_sistema(settings),
                "cache_control": {"type": "ephemeral"},
            }
        ],
        "messages": montar_mensagens(
            pergunta, trechos, hoje or hoje_local(settings), historico, perfil
        ),
        "output_config": {"effort": settings.llm_effort},
        **opcoes_fallback(settings.llm_model),
    }


def responder(
    pergunta: str,
    trechos: list[TrechoRecuperado],
    cliente,
    settings: Settings,
    hoje: date | None = None,
    historico: list[dict] | None = None,
    perfil: str | None = None,
) -> Resposta:
    if not trechos:
        # Nada relevante nos documentos: não vale gastar uma chamada (nem arriscar invenção).
        return Resposta(mensagem_sem_resposta(settings), fundamentada=False, motivo="sem_trechos")

    resp = cliente.beta.messages.create(
        **_parametros(pergunta, trechos, settings, hoje, historico, perfil)
    )
    return interpretar(resp, trechos, settings)


def responder_em_partes(
    pergunta: str,
    trechos: list[TrechoRecuperado],
    cliente,
    settings: Settings,
    hoje: date | None = None,
    historico: list[dict] | None = None,
    perfil: str | None = None,
) -> Iterator[str | Resposta]:
    """Versão em streaming de `responder`: gera os pedaços de texto conforme chegam e, por
    último, a `Resposta` completa (que pode trocar o texto, por exemplo numa recusa)."""
    if not trechos:
        texto = mensagem_sem_resposta(settings)
        yield texto
        yield Resposta(texto, fundamentada=False, motivo="sem_trechos")
        return

    with cliente.beta.messages.stream(
        **_parametros(pergunta, trechos, settings, hoje, historico, perfil)
    ) as stream:
        yield from stream.text_stream
        final = stream.get_final_message()
    yield interpretar(final, trechos, settings)


def interpretar(resp, trechos: list[TrechoRecuperado], settings: Settings) -> Resposta:
    uso = {
        "entrada": resp.usage.input_tokens or 0,
        "saida": resp.usage.output_tokens or 0,
        "cache_leitura": getattr(resp.usage, "cache_read_input_tokens", None) or 0,
        "cache_escrita": getattr(resp.usage, "cache_creation_input_tokens", None) or 0,
    }
    if resp.stop_reason == "refusal":
        return Resposta(
            "Não consigo responder a essa pergunta. Se for sobre o IC, entre em contato pelo "
            f"e-mail {settings.contato_fallback}.",
            fundamentada=False,
            motivo="recusa",
            trechos=trechos,
            modelo=resp.model,
            uso=uso,
        )

    partes: list[str] = []
    citacoes: list[Citacao] = []
    vistos: set[tuple[int, str]] = set()
    for bloco in resp.content:
        if bloco.type != "text":
            continue
        partes.append(bloco.text)
        for c in bloco.citations or []:
            if c.type != "search_result_location" or not 0 <= c.search_result_index < len(trechos):
                continue
            t = trechos[c.search_result_index]
            chave = (t.trecho_id, c.cited_text)
            if chave not in vistos:
                vistos.add(chave)
                citacoes.append(Citacao(t.documento_id, t.titulo, t.paginas, c.cited_text))

    texto = "".join(partes).strip()
    motivo = "ok" if citacoes else "sem_citacoes"
    if resp.stop_reason == "max_tokens":
        motivo = "max_tokens"
    return Resposta(
        texto or mensagem_sem_resposta(settings),
        fundamentada=bool(citacoes),
        motivo=motivo,
        citacoes=citacoes,
        trechos=trechos,
        modelo=resp.model,
        uso=uso,
    )
