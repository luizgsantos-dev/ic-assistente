import anthropic

from .config import Settings

BETA_FALLBACK = "server-side-fallback-2026-07-01"

# US$ por milhão de tokens (entrada, saída, leitura de cache), preços de outubro/2026.
# Só para estimar custo nos relatórios; confira em platform.claude.com/pricing.
PRECOS = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


def criar_cliente(settings: Settings) -> anthropic.Anthropic:
    if settings.anthropic_api_key:
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return anthropic.Anthropic()


def opcoes_fallback(modelo: str) -> dict:
    """Se o modelo recusar por política, a API refaz o pedido em outro modelo na mesma chamada.

    O Haiku não tem fallback do lado do servidor, então não manda nada para ele.
    """
    if "haiku" in modelo:
        return {}
    return {"betas": [BETA_FALLBACK], "fallbacks": "default"}


def custo_estimado(modelo: str, uso: dict[str, int]) -> float | None:
    precos = next((p for nome, p in PRECOS.items() if modelo.startswith(nome)), None)
    if precos is None:
        return None
    entrada, saida, cache_leitura = precos
    return (
        uso.get("entrada", 0) * entrada
        + uso.get("cache_escrita", 0) * entrada * 1.25
        + uso.get("cache_leitura", 0) * cache_leitura
        + uso.get("saida", 0) * saida
    ) / 1_000_000
