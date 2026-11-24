import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode, type Ref } from "react";

import { PainelSuspenso } from "@/components/Suspenso";
import { Botao, Entrada, estiloBotao, Selecao } from "@/components/ui";
import { useRascunho } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

// --- ordenação e páginas ---

export type Ordem<C extends string> = { coluna: C; crescente: boolean };

/** Ordena e fatia a lista. A ordem e a página ficam guardadas: voltar do detalhe não perde o lugar. */
export function useLista<T, C extends string>(
  chave: string,
  itens: T[],
  valorDe: (item: T, coluna: C) => string | number,
  inicial: Ordem<C>,
  porPagina = 10,
) {
  const { valor: lugar, setValor: setLugar } = useRascunho(`lista-${chave}`, { ordem: inicial, pagina: 1 });
  const { ordem, pagina } = lugar;

  const ordenados = useMemo(() => {
    const sinal = ordem.crescente ? 1 : -1;
    return [...itens].sort((a, b) => {
      const [x, y] = [valorDe(a, ordem.coluna), valorDe(b, ordem.coluna)];
      const comparacao =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return comparacao * sinal;
    });
  }, [itens, ordem, valorDe]);

  const paginas = Math.max(1, Math.ceil(ordenados.length / porPagina));
  // Se a lista encolheu (filtro, exclusão), fica na última página que existe.
  const atual = Math.min(pagina, paginas);
  const inicio = (atual - 1) * porPagina;

  return {
    visiveis: ordenados.slice(inicio, inicio + porPagina),
    ordem,
    ordenarPor: (coluna: C) =>
      setLugar({ ordem: { coluna, crescente: ordem.coluna === coluna ? !ordem.crescente : true }, pagina: 1 }),
    paginacao: {
      atual,
      paginas,
      total: ordenados.length,
      de: ordenados.length ? inicio + 1 : 0,
      ate: Math.min(inicio + porPagina, ordenados.length),
      irPara: (nova: number) => setLugar({ ordem, pagina: nova }),
    },
    voltarAoInicio: () => setLugar({ ordem, pagina: 1 }),
  };
}

/** Fatia uma lista que já vem na ordem certa (fila, trechos). */
export function usePaginas<T>(itens: T[], porPagina = 10) {
  const [pagina, setPagina] = useState(1);
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(pagina, paginas);
  const inicio = (atual - 1) * porPagina;
  return {
    visiveis: itens.slice(inicio, inicio + porPagina),
    paginacao: {
      atual,
      paginas,
      total: itens.length,
      de: itens.length ? inicio + 1 : 0,
      ate: Math.min(inicio + porPagina, itens.length),
      irPara: setPagina,
    },
  };
}

type PropsPaginacao = {
  atual: number;
  paginas: number;
  total: number;
  de: number;
  ate: number;
  irPara: (pagina: number) => void;
  /** Enquanto a lista não chega (ou se falhou), não diz que está vazia. */
  semDados?: boolean;
};

/** Sempre na tela, mesmo com uma página só. */
export function Paginacao({ atual, paginas, total, de, ate, irPara, semDados }: PropsPaginacao) {
  return (
    <nav aria-label="Páginas da lista" className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-4 py-2">
      <p className="text-sm text-texto-suave tabular-nums" role="status">
        {semDados ? "" : total === 0 ? "Nenhum item" : `${de} a ${ate} de ${total}`}
      </p>
      <div className="flex gap-2">
        <Botao variante="secundaria" disabled={atual <= 1} onClick={() => irPara(atual - 1)}>Ver anteriores</Botao>
        <Botao variante="secundaria" disabled={atual >= paginas} onClick={() => irPara(atual + 1)}>Ver próximos</Botao>
      </div>
    </nav>
  );
}

/** Em telas largas o cabeçalho da tabela acompanha a rolagem da página. */
export const estiloCabecalho = "border-b border-borda bg-superficie font-medium first:rounded-tl-xl last:rounded-tr-xl md:sticky md:top-0 md:z-10";

export function ColunaOrdenavel<C extends string>({
  coluna,
  ordem,
  aoOrdenar,
  className,
  children,
}: {
  coluna: C;
  ordem: Ordem<C>;
  aoOrdenar: (coluna: C) => void;
  className?: string;
  children: ReactNode;
}) {
  const ativa = ordem.coluna === coluna;
  const Icone = !ativa ? ArrowUpDown : ordem.crescente ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.crescente ? "ascending" : "descending") : undefined}
      className={cn(estiloCabecalho, "px-2", className)}
    >
      <button
        type="button"
        onClick={() => aoOrdenar(coluna)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-texto-suave hover:text-texto"
      >
        {children}
        <Icone className={cn("size-3.5", !ativa && "opacity-50")} aria-hidden />
      </button>
    </th>
  );
}

// --- busca e filtros ---

export function CampoBusca({
  ref,
  rotulo,
  exemplo,
  valor,
  aoMudar,
}: {
  ref: Ref<HTMLInputElement>;
  rotulo: string;
  exemplo: string;
  valor: string;
  aoMudar: (valor: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1 md:max-w-sm">
      <label htmlFor="busca" className="flex items-center justify-between text-sm font-medium">
        {rotulo}
        <kbd className="hidden rounded border border-borda px-1 font-sans text-xs font-normal text-texto-suave md:inline" aria-hidden>
          /
        </kbd>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-suave" aria-hidden />
        <Entrada
          ref={ref}
          id="busca"
          type="search"
          aria-keyshortcuts="/"
          placeholder={exemplo}
          className="pl-10"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      </div>
    </div>
  );
}

export type Filtro = {
  id: string;
  rotulo: string;
  valor: string;
  opcoes: Record<string, string>;
  aoMudar: (valor: string) => void;
};

/** Um botão só para todos os filtros. */
export function BotaoFiltros({ filtros }: { filtros: Filtro[] }) {
  const ativos = filtros.filter((f) => f.valor).length;
  return (
    <PainelSuspenso
      rotulo={ativos ? `Filtrar (${ativos})` : "Filtrar"}
      Icone={ListFilter}
      className={cn(estiloBotao({ variante: "secundaria" }), "self-end")}
    >
      <div className="space-y-4">
        {filtros.map((f) => (
          <div key={f.id} className="space-y-1">
            <label htmlFor={`filtro-${f.id}`} className="block text-sm font-medium">{f.rotulo}</label>
            <Selecao id={`filtro-${f.id}`} value={f.valor} onChange={(e) => f.aoMudar(e.target.value)}>
              <option value="">Mostrar tudo</option>
              {Object.entries(f.opcoes).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Selecao>
          </div>
        ))}
      </div>
    </PainelSuspenso>
  );
}

/** Filtros ligados, cada um com um X, e o "limpar tudo". */
export function FiltrosAtivos({ filtros, aoLimpar }: { filtros: Filtro[]; aoLimpar: () => void }) {
  const ativos = filtros.filter((f) => f.valor);
  if (!ativos.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ativos.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => f.aoMudar("")}
          aria-label={`Tirar o filtro ${f.rotulo}: ${f.opcoes[f.valor]}`}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-borda-campo bg-superficie px-3 text-sm hover:bg-superficie-2"
        >
          <span className="text-texto-suave">{f.rotulo}:</span>
          {f.opcoes[f.valor]}
          <X className="size-4" aria-hidden />
        </button>
      ))}
      <Botao variante="fantasma" onClick={aoLimpar}>Limpar filtros</Botao>
    </div>
  );
}

/** Moldura de lista: superfície, contorno e divisórias. No celular a rolagem de lado fica só aqui dentro. */
export function Moldura({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie shadow-suave">
      <div className="overflow-x-auto md:overflow-visible">{children}</div>
      {rodape}
    </div>
  );
}
