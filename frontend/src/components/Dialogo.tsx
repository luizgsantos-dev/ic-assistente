import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Botao } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Janela modal com o <dialog> nativo: foco preso, Esc fecha, fundo escurecido. */
export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  children,
  largo = false,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      // Clique no fundo (fora da caixa) também fecha.
      onClick={(e) => e.target === ref.current && aoFechar()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-borda bg-superficie p-0 text-texto shadow-xl backdrop:bg-black/40",
        largo ? "max-w-3xl" : "max-w-lg",
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-borda px-5 py-3">
        <h2 className="truncate font-semibold">{titulo}</h2>
        <Botao variante="fantasma" tamanho="icone" onClick={aoFechar} aria-label="Fechar">
          <X className="size-4" />
        </Botao>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{aberto && children}</div>
    </dialog>
  );
}
