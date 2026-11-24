import { LayoutDashboard, LogOut, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";

import { AvisoDeErro, Botao, BotaoIcone, EsqueletoLinhas } from "@/components/ui";
import type { ConversaResumo, Usuario } from "@/lib/api";
import { useTelaEstreita } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

type Props = {
  usuario: Usuario;
  vinculo: string;
  /** null enquanto a lista não chega */
  conversas: ConversaResumo[] | null;
  erro: unknown;
  conversaAtual: number | null;
  aberta: boolean;
  aoFechar: () => void;
  aoIniciar: () => void;
  aoApagar: (conversa: ConversaResumo) => void;
  aoRecarregar: () => void;
  aoSair: () => void;
};

export function BarraLateral({
  usuario,
  vinculo,
  conversas,
  erro,
  conversaAtual,
  aberta,
  aoFechar,
  aoIniciar,
  aoApagar,
  aoRecarregar,
  aoSair,
}: Props) {
  const estreita = useTelaEstreita();
  const barra = useRef<HTMLElement>(null);

  // Gaveta do celular: leva o foco para dentro e fecha com Esc.
  useEffect(() => {
    if (!estreita || !aberta) return;
    barra.current?.focus();
    function teclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) aoFechar();
    }
    document.addEventListener("keydown", teclar);
    return () => document.removeEventListener("keydown", teclar);
  }, [estreita, aberta, aoFechar]);

  return (
    <>
      {/* No celular a barra vira uma gaveta por cima do chat. */}
      {estreita && aberta && (
        <div className="fixed inset-0 z-20 animate-aparece bg-black/40" onClick={aoFechar} aria-hidden />
      )}
      <aside
        ref={barra}
        tabIndex={-1}
        // Fechada, a gaveta sai também do teclado e do leitor de tela.
        inert={estreita && !aberta}
        aria-label="Conversas"
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-borda bg-superficie transition-transform duration-200",
          "md:static md:translate-x-0 md:transition-none",
          aberta ? "translate-x-0 ease-entrada" : "-translate-x-full ease-saida",
        )}
      >
        <div className="flex min-h-16 items-center justify-between gap-2 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-2">
            <div aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primaria text-xs font-semibold text-primaria-texto">
              IC
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">IC-Assistant</p>
              <p className="truncate text-xs text-texto-suave">Instituto de Computação</p>
            </div>
          </div>
          <BotaoIcone rotulo="Fechar conversas" className="md:hidden" onClick={aoFechar}>
            <X />
          </BotaoIcone>
        </div>

        <div className="space-y-1 px-2">
          <Botao id="iniciar-conversa" variante="secundaria" className="w-full justify-start px-2" onClick={aoIniciar}>
            <Plus className="size-4" aria-hidden />
            Iniciar conversa
          </Botao>
          {usuario.papel === "admin" && (
            <Link
              to="/painel"
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-texto-suave hover:bg-superficie-2 hover:text-texto"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Painel da secretaria
            </Link>
          )}
        </div>

        <nav aria-label="Conversas anteriores" className="mt-4 flex-1 overflow-y-auto px-2 pb-2">
          <ListaConversas {...{ conversas, erro, conversaAtual, aoFechar, aoApagar, aoRecarregar }} />
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-borda py-2 pr-2 pl-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{usuario.nome}</p>
            <p className="truncate text-xs text-texto-suave">
              {vinculo}
              {usuario.curso && ` · ${usuario.curso}`}
            </p>
          </div>
          <BotaoIcone rotulo="Sair da conta" onClick={aoSair}>
            <LogOut />
          </BotaoIcone>
        </div>
      </aside>
    </>
  );
}

function ListaConversas({
  conversas,
  erro,
  conversaAtual,
  aoFechar,
  aoApagar,
  aoRecarregar,
}: Pick<Props, "conversas" | "erro" | "conversaAtual" | "aoFechar" | "aoApagar" | "aoRecarregar">): ReactNode {
  if (erro) return <AvisoDeErro erro={erro} aoTentar={aoRecarregar} />;
  if (conversas === null) return <EsqueletoLinhas linhas={4} className="h-9" />;
  if (conversas.length === 0) {
    return <p className="px-2 py-4 text-sm text-texto-suave">Nenhuma conversa ainda. A primeira pergunta cria uma.</p>;
  }
  return (
    <ul className="space-y-1">
      {conversas.map((c) => {
        const atual = c.id === conversaAtual;
        return (
          <li key={c.id} className="linha relative">
            <Link
              to={`/c/${c.id}`}
              onClick={aoFechar}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg pr-12 pl-2 text-sm hover:bg-superficie-2",
                atual && "bg-destaque font-medium",
              )}
            >
              <MessageSquare className="size-4 shrink-0 text-texto-suave" aria-hidden />
              <span className="truncate">{c.titulo}</span>
            </Link>
            <span className="so-ao-apontar absolute inset-y-0 right-0">
              <BotaoIcone rotulo={`Apagar conversa “${c.titulo}”`} className="hover:text-perigo" onClick={() => aoApagar(c)}>
                <Trash2 />
              </BotaoIcone>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
