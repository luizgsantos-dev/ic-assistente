import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Botao, BotaoIcone } from "@/components/ui";

/** Fecha ao clicar no fundo, mas só se o clique também começou nele (selecionar texto não fecha). */
function useCliqueFora(aoFechar: () => void) {
  const comecouFora = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      comecouFora.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (comecouFora.current && e.target === e.currentTarget) aoFechar();
    },
  };
}

/**
 * Gaveta lateral para tarefas rápidas, sem sair da página. Usa o <dialog> nativo: prende o foco,
 * Esc fecha e o foco volta para o botão que abriu. No celular ocupa a tela toda.
 */
export function Gaveta({
  aberta,
  titulo,
  aoFechar,
  children,
}: {
  aberta: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloGaveta = useRef<HTMLHeadingElement>(null);
  const idTitulo = useId();
  const cliqueFora = useCliqueFora(aoFechar);

  useEffect(() => {
    const janela = ref.current;
    if (!janela) return;
    if (aberta && !janela.open) {
      janela.showModal();
      // Vai direto ao primeiro campo; no toque, ao título, para o teclado não cobrir o formulário.
      const campo = janela.querySelector<HTMLElement>("input, select, textarea");
      const comMouse = window.matchMedia("(hover: hover)").matches;
      (comMouse && campo ? campo : tituloGaveta.current)?.focus();
    }
    if (!aberta && janela.open) janela.close();
  }, [aberta]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClose={aoFechar}
      {...cliqueFora}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-none animate-gaveta border-l border-borda bg-superficie p-0 text-texto shadow-flutuante backdrop:animate-aparece backdrop:bg-black/40 md:w-[30rem]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-borda py-2 pr-2 pl-4">
          <h2 ref={tituloGaveta} id={idTitulo} tabIndex={-1} className="truncate text-lg font-semibold">{titulo}</h2>
          <BotaoIcone rotulo="Fechar painel" onClick={aoFechar}>
            <X />
          </BotaoIcone>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{aberta && children}</div>
      </div>
    </dialog>
  );
}

// --- confirmação ---

type Pedido = {
  /** Verbo + item pelo nome, ex.: Apagar o documento “Calendário 2026”? */
  titulo: string;
  /** O que acontece e se dá para desfazer. */
  texto: string;
  /** Verbo + item, ex.: Apagar documento */
  acao: string;
  perigo?: boolean;
};

const ContextoConfirmar = createContext<((pedido: Pedido) => Promise<boolean>) | null>(null);

/**
 * Pergunta antes de uma ação difícil de desfazer. Cancelar vem primeiro porque é no primeiro botão
 * que o <dialog> põe o foco.
 */
export function ProvedorConfirmacao({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const responder = useRef<(sim: boolean) => void>(() => undefined);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const cliqueFora = useCliqueFora(() => encerrar(false));

  const confirmar = useCallback((novo: Pedido) => {
    setPedido(novo);
    return new Promise<boolean>((resolver) => {
      responder.current = resolver;
    });
  }, []);

  useEffect(() => {
    if (pedido && ref.current && !ref.current.open) ref.current.showModal();
  }, [pedido]);

  function encerrar(sim: boolean) {
    responder.current(sim);
    responder.current = () => undefined;
    ref.current?.close();
    setPedido(null);
  }

  return (
    <ContextoConfirmar.Provider value={confirmar}>
      {children}
      <dialog
        ref={ref}
        role="alertdialog"
        aria-labelledby="titulo-confirmacao"
        aria-describedby="texto-confirmacao"
        // Esc e clique fora valem como Cancelar.
        onClose={() => encerrar(false)}
        {...cliqueFora}
        className="m-auto w-[calc(100%-2rem)] max-w-md animate-aparece rounded-xl border border-borda bg-superficie p-0 text-texto shadow-flutuante backdrop:bg-black/40"
      >
        {pedido && (
          <div className="p-6">
            <h2 id="titulo-confirmacao" className="text-lg font-semibold [overflow-wrap:anywhere]">{pedido.titulo}</h2>
            <p id="texto-confirmacao" className="mt-2 text-sm text-texto-suave">{pedido.texto}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Botao variante="secundaria" onClick={() => encerrar(false)}>Cancelar</Botao>
              <Botao variante={pedido.perigo === false ? "primaria" : "perigo"} onClick={() => encerrar(true)}>
                {pedido.acao}
              </Botao>
            </div>
          </div>
        )}
      </dialog>
    </ContextoConfirmar.Provider>
  );
}

export function useConfirmar() {
  const confirmar = useContext(ContextoConfirmar);
  if (!confirmar) throw new Error("useConfirmar fora do ProvedorConfirmacao");
  return confirmar;
}

// --- avisos rápidos ---

type Recado = { id: number; texto: string };

const ContextoAvisar = createContext<((texto: string) => void) | null>(null);

/** Recado curto do que acabou de acontecer; some sozinho e é lido por leitor de tela. */
export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [recados, setRecados] = useState<Recado[]>([]);
  const proximo = useRef(1);

  const avisar = useCallback((texto: string) => {
    const id = proximo.current++;
    setRecados((r) => [...r, { id, texto }]);
    setTimeout(() => setRecados((r) => r.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <ContextoAvisar.Provider value={avisar}>
      {children}
      <div
        role="status"
        aria-live="polite"
        // Acima da caixa de pergunta do chat e do rodapé dos formulários.
        className="pointer-events-none fixed inset-x-4 bottom-32 z-50 flex flex-col items-center gap-2"
      >
        {recados.map((r) => (
          <p key={r.id} className="max-w-md animate-aparece rounded-lg bg-texto px-4 py-3 text-sm text-superficie shadow-flutuante">
            {r.texto}
          </p>
        ))}
      </div>
    </ContextoAvisar.Provider>
  );
}

export function useAvisar() {
  const avisar = useContext(ContextoAvisar);
  if (!avisar) throw new Error("useAvisar fora do ProvedorAvisos");
  return avisar;
}
