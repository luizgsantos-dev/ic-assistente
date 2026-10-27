import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const estiloBotao = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
    "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variante: {
        primaria: "bg-primaria text-primaria-texto hover:bg-primaria-hover",
        secundaria: "border border-borda bg-superficie text-texto hover:bg-superficie-2",
        fantasma: "text-texto-suave hover:bg-superficie-2 hover:text-texto",
      },
      tamanho: {
        normal: "h-10 px-4",
        pequeno: "h-8 px-3",
        icone: "size-9",
      },
    },
    defaultVariants: { variante: "primaria", tamanho: "normal" },
  },
);

export function Botao({
  className,
  variante,
  tamanho,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof estiloBotao>) {
  return <button className={cn(estiloBotao({ variante, tamanho }), className)} {...props} />;
}

const estiloCampo =
  "h-10 w-full rounded-lg border border-borda bg-superficie px-3 text-sm text-texto " +
  "placeholder:text-texto-suave focus-visible:outline-2 focus-visible:outline-foco " +
  "focus-visible:border-transparent";

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(estiloCampo, className)} {...props} />;
}

export function Selecao({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(estiloCampo, "pr-8", className)} {...props} />;
}

export function Campo({
  rotulo,
  id,
  dica,
  children,
}: {
  rotulo: string;
  id: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {dica && <p className="text-xs text-texto-suave">{dica}</p>}
    </div>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "sucesso"; children: ReactNode }) {
  const Icone = tipo === "erro" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2.5 text-sm",
        tipo === "erro" ? "bg-perigo-fundo text-perigo" : "bg-destaque text-texto",
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
