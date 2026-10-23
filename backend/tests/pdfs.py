"""PDFs gerados na hora para os testes, sem depender de arquivos reais."""

from pathlib import Path

import pymupdf


def criar_pdf(
    caminho: Path,
    paginas: list[list[tuple[str, int]]],
    titulo: str | None = None,
    data_criacao: str | None = None,
) -> Path:
    """Cada página é uma lista de (texto, tamanho da fonte). Fonte grande vira título."""
    doc = pymupdf.open()
    for linhas in paginas:
        pagina = doc.new_page()
        y = 72
        for texto, tamanho in linhas:
            pagina.insert_text((72, y), texto, fontsize=tamanho, fontname="helv")
            y += tamanho * 2
    meta = {}
    if titulo:
        meta["title"] = titulo
    if data_criacao:
        meta["creationDate"] = data_criacao
    if meta:
        doc.set_metadata(meta)
    doc.save(caminho)
    return caminho


def criar_pdf_sem_texto(caminho: Path, n_paginas: int = 3) -> Path:
    """Simula um PDF escaneado: páginas só com desenho, sem camada de texto."""
    doc = pymupdf.open()
    for _ in range(n_paginas):
        pagina = doc.new_page()
        pagina.draw_rect(pymupdf.Rect(72, 72, 400, 300), fill=(0.8, 0.8, 0.8))
    doc.save(caminho)
    return caminho
