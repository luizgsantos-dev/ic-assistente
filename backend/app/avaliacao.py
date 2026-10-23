"""Avaliação automática: perguntas com resposta conhecida, para medir acertos e invenções."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .busca import buscar
from .config import Settings
from .embeddings import Embedder
from .llm import opcoes_fallback
from .resposta import Resposta, responder

MARCA_PREENCHER = "PREENCHER"

PROMPT_JUIZ = """\
Você avalia as respostas de um assistente que deve responder perguntas sobre o Instituto de \
Computação da UFMT usando apenas os trechos de documentos que recebeu.

Você recebe a pergunta, uma referência escrita por quem conhece os documentos (ou o aviso de \
que a pergunta não tem resposta nos documentos), os trechos que o assistente recebeu e a \
resposta dele. Julgue o conteúdo, não o estilo:
- acertou: a resposta traz a informação essencial da referência sem contradizê-la; detalhes \
extras corretos não atrapalham. Se a pergunta não tem resposta nos documentos, acertou \
significa que o assistente disse que não encontrou a informação, sem oferecer uma resposta \
inventada no lugar.
- inventou: a resposta afirma algum fato (data, prazo, nome, regra, número) que não está nos \
trechos nem na referência. Orientar a pessoa a procurar um contato não conta como invenção.
- recusou: o assistente disse que não encontrou ou não sabe a resposta."""


class Veredito(BaseModel):
    acertou: bool
    inventou: bool
    recusou: bool
    justificativa: str = Field(description="Uma ou duas frases explicando o julgamento.")


@dataclass
class Caso:
    id: str
    pergunta: str
    esperado: str | None
    deve_recusar: bool
    hoje: date | None = None


@dataclass
class ResultadoCaso:
    caso: Caso
    resposta: Resposta
    veredito: Veredito
    uso_juiz: dict[str, int]

    @property
    def passou(self) -> bool:
        return self.veredito.acertou and not self.veredito.inventou


def carregar_casos(caminho: Path) -> tuple[list[Caso], list[str]]:
    """Lê o YAML de perguntas. Devolve os casos prontos e os ids ainda sem resposta esperada."""
    itens = yaml.safe_load(caminho.read_text(encoding="utf-8")) or []
    casos: list[Caso] = []
    pendentes: list[str] = []
    for item in itens:
        deve_recusar = bool(item.get("deve_recusar", False))
        esperado = item.get("esperado")
        if not deve_recusar and (not esperado or MARCA_PREENCHER in str(esperado)):
            pendentes.append(item["id"])
            continue
        casos.append(
            Caso(
                id=item["id"],
                pergunta=item["pergunta"],
                esperado=esperado,
                deve_recusar=deve_recusar,
                hoje=item.get("hoje"),
            )
        )
    return casos, pendentes


def julgar(
    caso: Caso, resposta: Resposta, cliente, settings: Settings
) -> tuple[Veredito, dict[str, int]]:
    referencia = (
        "Esta pergunta não tem resposta nos documentos. O certo é o assistente dizer que não "
        "encontrou a informação."
        if caso.deve_recusar
        else caso.esperado
    )
    trechos = (
        "\n\n".join(
            f"[{i}] {t.titulo} ({t.paginas or 'sem página'})\n{t.conteudo}"
            for i, t in enumerate(resposta.trechos)
        )
        or "(nenhum trecho foi recuperado)"
    )
    conteudo = (
        f"<pergunta>\n{caso.pergunta}\n</pergunta>\n\n"
        f"<referencia>\n{referencia}\n</referencia>\n\n"
        f"<trechos>\n{trechos}\n</trechos>\n\n"
        f"<resposta_do_assistente>\n{resposta.texto}\n</resposta_do_assistente>"
    )
    r = cliente.beta.messages.parse(
        model=settings.judge_model,
        max_tokens=8000,
        system=PROMPT_JUIZ,
        messages=[{"role": "user", "content": conteudo}],
        output_format=Veredito,
        **opcoes_fallback(settings.judge_model),
    )
    if r.parsed_output is None:
        raise RuntimeError(f"o juiz não devolveu um veredito para {caso.id} ({r.stop_reason})")
    return r.parsed_output, {"entrada": r.usage.input_tokens, "saida": r.usage.output_tokens}


def rodar(
    casos: list[Caso],
    session: Session,
    embedder: Embedder,
    cliente,
    settings: Settings,
    ao_concluir: Callable[[ResultadoCaso], None] | None = None,
) -> list[ResultadoCaso]:
    resultados = []
    for caso in casos:
        trechos = buscar(session, caso.pergunta, embedder, settings)
        resposta = responder(caso.pergunta, trechos, cliente, settings, hoje=caso.hoje)
        veredito, uso_juiz = julgar(caso, resposta, cliente, settings)
        resultado = ResultadoCaso(caso, resposta, veredito, uso_juiz)
        resultados.append(resultado)
        if ao_concluir:
            ao_concluir(resultado)
    return resultados
