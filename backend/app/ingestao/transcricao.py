"""Transcrição de PDFs escaneados com o próprio Claude, feita uma única vez na ingestão."""

import base64
import re
from pathlib import Path

from ..config import Settings
from ..llm import opcoes_fallback
from .leitura import Bloco, dividir_markdown

LIMITE_BYTES = 30 * 1024 * 1024  # a API aceita até 32 MB por requisição

PROMPT_TRANSCRICAO = """\
Transcreva este PDF para Markdown, de forma fiel e completa, sem resumir, corrigir ou \
acrescentar nada. Antes do conteúdo de cada página, escreva uma linha exatamente assim: \
<!-- página N --> (N é o número da página no PDF, começando em 1). Use # e ## para os títulos \
do documento e tabelas Markdown para tabelas. Se um trecho estiver ilegível, escreva [ilegível]. \
Responda só com a transcrição."""

_RE_MARCA_PAGINA = re.compile(r"^<!--\s*p[áa]gina\s+(\d+)\s*-->\s*$", re.IGNORECASE | re.MULTILINE)


class ErroTranscricao(RuntimeError):
    pass


def transcrever_pdf(caminho: Path, cliente, settings: Settings) -> list[Bloco]:
    dados = caminho.read_bytes()
    if len(dados) > LIMITE_BYTES:
        raise ErroTranscricao(f"{caminho.name} tem mais de 30 MB; divida o PDF antes de enviar")

    documento = {
        "type": "document",
        "source": {
            "type": "base64",
            "media_type": "application/pdf",
            "data": base64.standard_b64encode(dados).decode(),
        },
    }
    with cliente.beta.messages.stream(
        model=settings.transcription_model,
        max_tokens=64000,
        messages=[
            {"role": "user", "content": [documento, {"type": "text", "text": PROMPT_TRANSCRICAO}]}
        ],
        output_config={"effort": "low"},
        **opcoes_fallback(settings.transcription_model),
    ) as stream:
        msg = stream.get_final_message()

    if msg.stop_reason == "refusal":
        raise ErroTranscricao(f"o modelo recusou transcrever {caminho.name}")
    if msg.stop_reason == "max_tokens":
        raise ErroTranscricao(f"{caminho.name} é longo demais para transcrever de uma vez")
    texto = "".join(b.text for b in msg.content if b.type == "text")
    return dividir_paginas_transcritas(texto)


def dividir_paginas_transcritas(texto: str) -> list[Bloco]:
    marcas = list(_RE_MARCA_PAGINA.finditer(texto))
    if not marcas:
        return dividir_markdown(texto)
    pilha: list[tuple[int, str]] = []
    blocos: list[Bloco] = []
    for i, marca in enumerate(marcas):
        fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        blocos += dividir_markdown(
            texto[marca.end() : fim], pagina=int(marca.group(1)), pilha=pilha
        )
    return blocos
