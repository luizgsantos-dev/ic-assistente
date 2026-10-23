"""Leitura de PDF, DOCX, Markdown e TXT em blocos de texto com página e seção."""

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

EXTENSOES_SUPORTADAS = {".pdf", ".docx", ".md", ".markdown", ".txt"}

# Página com menos caracteres que isso conta como "sem texto" (imagem escaneada). Fica baixo
# porque página escaneada costuma ter zero ou só o número da página; capa curta não é scan.
MIN_CHARS_PAGINA = 20
# Se mais da metade das páginas não tem texto, o PDF inteiro vai para transcrição.
FRACAO_PAGINAS_VAZIAS_ESCANEADO = 0.5

_RE_TITULO_MD = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_RE_DATA_PDF = re.compile(r"D:(\d{4})(\d{2})(\d{2})")
_RE_TITULO_DOCX = re.compile(r"(?:heading|t[ií]tulo)\s*(\d)", re.IGNORECASE)


@dataclass
class Bloco:
    texto: str
    pagina: int | None = None
    secao: str | None = None


@dataclass
class DocumentoLido:
    blocos: list[Bloco]
    paginas: int | None = None
    titulo: str | None = None
    data: date | None = None
    escaneado: bool = False


class FormatoNaoSuportado(ValueError):
    pass


def ler_documento(caminho: Path) -> DocumentoLido:
    ext = caminho.suffix.lower()
    if ext == ".pdf":
        return _ler_pdf(caminho)
    if ext == ".docx":
        return _ler_docx(caminho)
    if ext in {".md", ".markdown"}:
        return DocumentoLido(blocos=dividir_markdown(_ler_texto(caminho)))
    if ext == ".txt":
        texto = _ler_texto(caminho).strip()
        return DocumentoLido(blocos=[Bloco(texto)] if texto else [])
    raise FormatoNaoSuportado(f"formato não suportado: {ext}")


def dividir_markdown(
    texto: str, pagina: int | None = None, pilha: list[tuple[int, str]] | None = None
) -> list[Bloco]:
    """Divide Markdown em blocos por seção.

    `pilha` guarda os títulos abertos (nível, texto). Passar a mesma lista para páginas
    seguintes faz a seção continuar de uma página para a outra.
    """
    pilha = [] if pilha is None else pilha
    blocos: list[Bloco] = []
    linhas: list[str] = []

    def fechar() -> None:
        conteudo = "\n".join(linhas).strip()
        if conteudo:
            blocos.append(Bloco(conteudo, pagina, _caminho_secao(pilha)))
        linhas.clear()

    for linha in texto.splitlines():
        m = _RE_TITULO_MD.match(linha.strip())
        if m:
            titulo = _limpar_titulo(m.group(2))
            if titulo:
                fechar()
                nivel = len(m.group(1))
                while pilha and pilha[-1][0] >= nivel:
                    pilha.pop()
                pilha.append((nivel, titulo))
                continue
        linhas.append(linha)
    fechar()
    return blocos


def _caminho_secao(pilha: list[tuple[int, str]]) -> str | None:
    if not pilha:
        return None
    return " > ".join(t for _, t in pilha[-3:])


def _limpar_titulo(titulo: str) -> str:
    return re.sub(r"\s+", " ", titulo.replace("*", "").replace("_", " ")).strip()


def _ler_texto(caminho: Path) -> str:
    dados = caminho.read_bytes()
    try:
        return dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Arquivos salvos no Bloco de Notas antigo costumam vir em Windows-1252.
        return dados.decode("cp1252")


def _ler_pdf(caminho: Path) -> DocumentoLido:
    import pymupdf4llm

    paginas = pymupdf4llm.to_markdown(str(caminho), page_chunks=True)
    pilha: list[tuple[int, str]] = []
    blocos: list[Bloco] = []
    vazias = 0
    for pagina in paginas:
        texto = pagina["text"]
        if len(texto.strip()) < MIN_CHARS_PAGINA:
            vazias += 1
        blocos += dividir_markdown(texto, pagina=pagina["metadata"].get("page_number"), pilha=pilha)

    meta = paginas[0]["metadata"] if paginas else {}
    total = meta.get("page_count") or len(paginas)
    escaneado = total > 0 and vazias / total > FRACAO_PAGINAS_VAZIAS_ESCANEADO
    return DocumentoLido(
        blocos=[] if escaneado else blocos,
        paginas=total,
        titulo=_titulo_util(meta.get("title")),
        data=_data_pdf(meta.get("creationDate")),
        escaneado=escaneado,
    )


def _data_pdf(valor: str | None) -> date | None:
    m = _RE_DATA_PDF.match(valor or "")
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _titulo_util(titulo: str | None) -> str | None:
    """Descarta títulos de metadados que não ajudam ("Microsoft Word - x.docx", "untitled")."""
    if not titulo:
        return None
    titulo = re.sub(r"^Microsoft Word\s*-\s*", "", titulo.strip())
    titulo = re.sub(r"\.(docx?|odt|pdf)$", "", titulo, flags=re.IGNORECASE).strip()
    if len(titulo) < 4 or titulo.lower() in {"untitled", "sem título", "documento"}:
        return None
    return titulo


def _ler_docx(caminho: Path) -> DocumentoLido:
    import docx
    from docx.table import Table

    d = docx.Document(str(caminho))
    partes: list[str] = []
    for item in d.iter_inner_content():
        if isinstance(item, Table):
            partes.append(_tabela_markdown(item))
            continue
        texto = item.text.strip()
        if not texto:
            continue
        m = _RE_TITULO_DOCX.search(item.style.name if item.style is not None else "")
        partes.append(f"{'#' * int(m.group(1))} {texto}" if m else texto)

    props = d.core_properties
    return DocumentoLido(
        blocos=dividir_markdown("\n\n".join(partes)),
        titulo=_titulo_util(props.title),
        data=props.created.date() if props.created else None,
    )


def _tabela_markdown(tabela) -> str:
    linhas = []
    for i, linha in enumerate(tabela.rows):
        celulas = [c.text.strip().replace("\n", " ").replace("|", "/") for c in linha.cells]
        linhas.append("| " + " | ".join(celulas) + " |")
        if i == 0:
            linhas.append("|" + "---|" * len(celulas))
    return "\n".join(linhas)
