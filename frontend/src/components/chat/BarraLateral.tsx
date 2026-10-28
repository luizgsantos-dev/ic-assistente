import { LayoutDashboard, LogOut, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { Link } from "react-router";

import { Botao } from "@/components/ui";
import type { ConversaResumo, Usuario } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  usuario: Usuario;
  vinculo: string;
  conversas: ConversaResumo[];
  conversaAtual: number | null;
  aberta: boolean;
  aoFechar: () => void;
  aoNovaConversa: () => void;
  aoApagar: (id: number) => void;
  aoSair: () => void;
};

export function BarraLateral({
  usuario,
  vinculo,
  conversas,
  conversaAtual,
  aberta,
  aoFechar,
  aoNovaConversa,
  aoApagar,
  aoSair,
}: Props) {
  return (
    <>
      {/* No celular a barra vira uma gaveta por cima do chat. */}
      {aberta && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={aoFechar} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-borda bg-superficie transition-transform",
          "md:static md:translate-x-0",
          aberta ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Conversas"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primaria text-xs font-bold text-primaria-texto">
              IC
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">IC-Assistant</p>
              <p className="text-xs text-texto-suave">Instituto de Computação</p>
            </div>
          </div>
          <Botao variante="fantasma" tamanho="icone" className="md:hidden" onClick={aoFechar} aria-label="Fechar menu">
            <X className="size-4" />
          </Botao>
        </div>

        <div className="space-y-1 px-3">
          <Botao variante="secundaria" className="w-full justify-start" onClick={aoNovaConversa}>
            <Plus className="size-4" aria-hidden />
            Nova conversa
          </Botao>
          {usuario.papel === "admin" && (
            <Link
              to="/painel"
              className="flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-texto-suave hover:bg-superficie-2 hover:text-texto"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Painel da secretaria
            </Link>
          )}
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
          {conversas.length === 0 ? (
            <p className="px-2 py-4 text-sm text-texto-suave">Suas conversas aparecem aqui.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversas.map((c) => (
                <li key={c.id} className="group relative">
                  <Link
                    to={`/c/${c.id}`}
                    onClick={aoFechar}
                    aria-current={c.id === conversaAtual ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg py-2 pr-9 pl-2.5 text-sm hover:bg-superficie-2",
                      c.id === conversaAtual && "bg-destaque font-medium",
                    )}
                  >
                    <MessageSquare className="size-4 shrink-0 text-texto-suave" aria-hidden />
                    <span className="truncate">{c.titulo}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => aoApagar(c.id)}
                    aria-label={`Apagar a conversa ${c.titulo}`}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-texto-suave opacity-0 hover:bg-superficie hover:text-perigo focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-borda px-4 py-3">
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{usuario.nome}</p>
            <p className="truncate text-xs text-texto-suave">
              {vinculo}
              {usuario.curso && ` · ${usuario.curso}`}
            </p>
          </div>
          <Botao variante="fantasma" tamanho="icone" onClick={aoSair} aria-label="Sair" title="Sair">
            <LogOut className="size-4" />
          </Botao>
        </div>
      </aside>
    </>
  );
}
