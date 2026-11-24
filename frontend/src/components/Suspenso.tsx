import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Dica } from "@/components/Dica";
import { cn } from "@/lib/utils";

const MARGEM = 8;

/**
 * Painel que abre encostado em um botão. Usa o popover nativo: fica por cima de tudo, fecha com
 * Esc ou clique fora e devolve o foco ao botão.
 */
function usePainelSuspenso() {
  const id = useId();
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  function posicionar() {
    const g = gatilho.current?.getBoundingClientRect();
    const p = painel.current;
    if (!g || !p) return;
    const r = p.getBoundingClientRect();
    const cabeEmbaixo = g.bottom + MARGEM + r.height < window.innerHeight;
    p.style.top = `${cabeEmbaixo ? g.bottom + MARGEM / 2 : Math.max(MARGEM, g.top - r.height - MARGEM / 2)}px`;
    p.style.left = `${Math.max(MARGEM, Math.min(g.right - r.width, window.innerWidth - r.width - MARGEM))}px`;
  }

  // O painel é fixo na tela: se a página rola ou muda de tamanho, ele acompanha o botão.
  useEffect(() => {
    function acompanhar() {
      if (painel.current?.matches(":popover-open")) posicionar();
    }
    window.addEventListener("scroll", acompanhar, true);
    window.addEventListener("resize", acompanhar);
    return () => {
      window.removeEventListener("scroll", acompanhar, true);
      window.removeEventListener("resize", acompanhar);
    };
  }, []);

  /** Posiciona e leva o foco ao primeiro controle de dentro. */
  function aoAbrir(seletor: string) {
    posicionar();
    painel.current?.querySelector<HTMLElement>(seletor)?.focus({ preventScroll: true });
  }

  return { id, gatilho, painel, aoAbrir, fechar: () => painel.current?.hidePopover() };
}

const estiloPainel =
  "fixed m-0 rounded-lg border border-borda bg-superficie text-texto shadow-flutuante [inset:auto]";

export type ItemMenu = {
  rotulo: string;
  Icone: LucideIcon;
  aoEscolher: () => void;
  perigo?: boolean;
};

/** Menu "⋯" com as ações de uma linha. Setas andam pelos itens. */
export function MenuAcoes({ rotulo, itens }: { rotulo: string; itens: ItemMenu[] }) {
  const { id, gatilho, painel, aoAbrir, fechar } = usePainelSuspenso();

  function andar(e: KeyboardEvent) {
    const botoes = [...(painel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
    const destino =
      e.key === "ArrowDown" ? (atual + 1) % botoes.length
      : e.key === "ArrowUp" ? (atual - 1 + botoes.length) % botoes.length
      : e.key === "Home" ? 0
      : e.key === "End" ? botoes.length - 1
      : -1;
    if (destino < 0) return;
    e.preventDefault();
    botoes[destino]?.focus();
  }

  return (
    <>
      <Dica texto={rotulo}>
        <button
          ref={gatilho}
          type="button"
          popoverTarget={id}
          aria-haspopup="menu"
          aria-label={rotulo}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-texto-suave transition-colors duration-150 hover:bg-superficie-2 hover:text-texto"
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
      </Dica>
      <div
        ref={painel}
        id={id}
        popover="auto"
        role="menu"
        aria-label={rotulo}
        onKeyDown={andar}
        onToggle={(e) => e.newState === "open" && aoAbrir('[role="menuitem"]')}
        className={cn(estiloPainel, "min-w-56 p-1")}
      >
        {itens.map(({ rotulo: texto, Icone, aoEscolher, perigo }) => (
          <button
            key={texto}
            type="button"
            role="menuitem"
            onClick={() => {
              fechar();
              aoEscolher();
            }}
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-superficie-2",
              perigo && "text-perigo",
            )}
          >
            <Icone className="size-4 shrink-0" aria-hidden />
            {texto}
          </button>
        ))}
      </div>
    </>
  );
}

/** Botão que abre um painel com campos (usado nos filtros). */
export function PainelSuspenso({
  rotulo,
  Icone,
  className,
  children,
}: {
  rotulo: string;
  Icone: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  const { id, gatilho, painel, aoAbrir } = usePainelSuspenso();
  return (
    <>
      <button ref={gatilho} type="button" popoverTarget={id} aria-haspopup="dialog" className={className}>
        <Icone className="size-4" aria-hidden />
        {rotulo}
      </button>
      <div
        ref={painel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={rotulo}
        onToggle={(e) => e.newState === "open" && aoAbrir("select, input, button")}
        className={cn(estiloPainel, "w-80 max-w-[calc(100vw-1rem)] p-4")}
      >
        {children}
      </div>
    </>
  );
}
