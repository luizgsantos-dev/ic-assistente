import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Copy, Eye, EyeOff, LoaderCircle, RefreshCw } from "lucide-react";
import {
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { Dica } from "@/components/Dica";
import { detalhesDoErro, erroTecnico, mensagemDeErro } from "@/lib/api";
import { useAtraso } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

// --- botões ---

// 44 px de altura: alvo mínimo de toque.
export const estiloBotao = cva(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium " +
    "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variante: {
        primaria: "bg-primaria text-primaria-texto hover:bg-primaria-hover",
        secundaria: "border border-borda-campo bg-superficie text-texto hover:bg-superficie-2",
        fantasma: "text-texto-suave hover:bg-superficie-2 hover:text-texto",
        perigo: "bg-perigo text-perigo-texto hover:opacity-90",
      },
    },
    defaultVariants: { variante: "primaria" },
  },
);

type PropsBotao = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof estiloBotao> & {
    /** Trabalhando: mostra o giro e ignora novos cliques, sem desabilitar o botão. */
    ocupado?: boolean;
  };

export function Botao({ className, variante, ocupado, onClick, type = "button", children, ...props }: PropsBotao) {
  const mostrarGiro = useAtraso(Boolean(ocupado));
  return (
    <button
      type={type}
      aria-busy={ocupado || undefined}
      onClick={(e) => {
        if (ocupado) return e.preventDefault();
        onClick?.(e);
      }}
      className={cn(estiloBotao({ variante }), className)}
      {...props}
    >
      {mostrarGiro && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Botão quadrado só com ícone: nome para leitor de tela e dica ao passar o mouse ou focar. */
export function BotaoIcone({
  rotulo,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <Dica texto={rotulo}>
      <button
        type="button"
        aria-label={rotulo}
        className={cn(
          "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-texto-suave",
          "transition-colors duration-150 hover:bg-superficie-2 hover:text-texto [&_svg]:size-4",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Dica>
  );
}

export const estiloLink =
  "inline-flex min-h-11 min-w-11 items-center font-medium text-primaria underline-offset-4 hover:underline";

// --- campos ---

// 16 px: abaixo disso o iPhone dá zoom na página ao focar o campo.
const estiloCampo =
  "min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 text-base text-texto " +
  "placeholder:text-texto-suave aria-invalid:border-perigo";

export function Entrada({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(estiloCampo, className)} {...props} />;
}

export function Selecao({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(estiloCampo, "cursor-pointer pr-8", className)} {...props} />;
}

type AtributosCampo = {
  id: string;
  required: boolean;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
  onBlur: (() => void) | undefined;
  onInput: (() => void) | undefined;
};

/**
 * Rótulo sempre visível; a dica dá lugar ao erro, no mesmo espaço. A linha de apoio fica reservada
 * para o formulário não pular (nem o clique errar o botão) quando um erro aparece.
 */
export function Campo({
  rotulo,
  id,
  dica,
  erro,
  opcional = false,
  aoSair,
  aoMexer,
  className,
  children,
}: {
  rotulo: string;
  id: string;
  dica?: string;
  erro?: string;
  opcional?: boolean;
  aoSair?: () => void;
  aoMexer?: () => void;
  className?: string;
  children: (atributos: AtributosCampo) => ReactNode;
}) {
  const idApoio = `${id}-apoio`;
  const apoio = erro ?? dica;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}
        {opcional && <span className="font-normal text-texto-suave"> (opcional)</span>}
      </label>
      {children({
        id,
        required: !opcional,
        "aria-invalid": erro ? true : undefined,
        "aria-describedby": apoio ? idApoio : undefined,
        onBlur: aoSair,
        onInput: aoMexer,
      })}
      <p id={idApoio} role={erro ? "alert" : undefined} className={cn("min-h-[1.5em] text-sm", erro ? "text-perigo" : "text-texto-suave")}>
        {apoio}
      </p>
    </div>
  );
}

/** Senha com botão de mostrar: dispensa o campo "repita a senha". */
export function EntradaSenha(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <Entrada {...props} type={visivel ? "text" : "password"} className="pr-12" />
      <div className="absolute inset-y-0 right-0 flex items-center">
        <BotaoIcone rotulo={visivel ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visivel} onClick={() => setVisivel((v) => !v)}>
          {visivel ? <EyeOff /> : <Eye />}
        </BotaoIcone>
      </div>
    </div>
  );
}

// --- avisos ---

export function Aviso({
  tipo = "erro",
  children,
  acoes,
}: {
  tipo?: "erro" | "sucesso" | "info";
  children: ReactNode;
  acoes?: ReactNode;
}) {
  const Icone = tipo === "sucesso" ? CircleCheck : CircleAlert;
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-lg px-4 py-3 text-sm",
        tipo === "erro" ? "bg-perigo-fundo text-perigo" : "bg-destaque text-texto",
      )}
    >
      {/* 2 px: alinha o ícone com a altura das maiúsculas da primeira linha. */}
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="max-w-leitura">{children}</div>
        {acoes && <div className="mt-2 flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  );
}

/** Erro de carga ou de ação: diz o que fazer, deixa tentar de novo e copiar os detalhes. */
export function AvisoDeErro({ erro, aoTentar }: { erro: unknown; aoTentar?: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Aviso
      acoes={
        (aoTentar || erroTecnico(erro)) && (
          <>
            {aoTentar && (
              <Botao variante="secundaria" onClick={aoTentar}>
                <RefreshCw className="size-4" aria-hidden />
                Tentar de novo
              </Botao>
            )}
            {erroTecnico(erro) && (
              <Botao
                variante="fantasma"
                onClick={() => navigator.clipboard.writeText(detalhesDoErro(erro)).then(() => setCopiado(true))}
              >
                <Copy className="size-4" aria-hidden />
                {copiado ? "Detalhes copiados" : "Copiar detalhes do erro"}
              </Botao>
            )}
          </>
        )
      }
    >
      {mensagemDeErro(erro)}
    </Aviso>
  );
}

// --- vazio e carregando ---

export function EstadoVazio({ titulo, texto, acao }: { titulo: string; texto: string; acao: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="mt-2 max-w-md text-sm text-texto-suave">{texto}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{acao}</div>
    </div>
  );
}

/** Bloco cinza no lugar do conteúdo que ainda vem. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("animate-respira rounded-lg bg-superficie-2", className)} aria-hidden />;
}

/** Linhas de esqueleto, só depois de 100 ms (carga rápida não pisca). */
export function EsqueletoLinhas({ linhas, className = "h-12" }: { linhas: number; className?: string }) {
  const mostrar = useAtraso(true);
  return (
    <div role="status" className="space-y-2 p-4">
      <span className="sr-only">Carregando…</span>
      {mostrar && Array.from({ length: linhas }, (_, i) => <Esqueleto key={i} className={className} />)}
    </div>
  );
}

// --- cabeçalho de página ---

export function CabecalhoPagina({ titulo, texto, acoes }: { titulo: string; texto: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{titulo}</h1>
        <div className="mt-1 max-w-leitura text-sm text-texto-suave">{texto}</div>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}
