import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Posicao = { x: number; y: number; acima: boolean; alvo: Element };

/**
 * Dica de um botão só com ícone: aparece ao passar o mouse e também ao chegar pelo teclado.
 * É só reforço visual; o nome para leitor de tela é o `aria-label` do próprio botão.
 */
export function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  const envoltorio = useRef<HTMLSpanElement>(null);
  const [posicao, setPosicao] = useState<Posicao | null>(null);

  function abrir() {
    const el = envoltorio.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const acima = r.bottom + 44 > window.innerHeight;
    setPosicao({
      // Perto das bordas a dica encosta para dentro em vez de cortar.
      x: Math.min(Math.max(r.left + r.width / 2, 80), window.innerWidth - 80),
      y: acima ? r.top - 8 : r.bottom + 8,
      acima,
      // Dentro de uma janela modal o portal precisa ficar nela, senão aparece por baixo.
      alvo: el.closest("dialog") ?? document.body,
    });
  }
  const fechar = () => setPosicao(null);

  return (
    <span
      ref={envoltorio}
      className="inline-flex"
      onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
      onPointerLeave={fechar}
      onPointerDown={fechar}
      onFocus={(e) => e.target.matches(":focus-visible") && abrir()}
      onBlur={fechar}
      onKeyDown={(e) => e.key === "Escape" && fechar()}
    >
      {children}
      {posicao &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-50 w-max max-w-40 animate-aparece rounded-lg bg-texto px-2 py-1 text-center text-xs text-superficie"
            style={{
              left: posicao.x,
              top: posicao.y,
              transform: `translate(-50%, ${posicao.acima ? "-100%" : "0"})`,
            }}
          >
            {texto}
          </span>,
          posicao.alvo,
        )}
    </span>
  );
}
