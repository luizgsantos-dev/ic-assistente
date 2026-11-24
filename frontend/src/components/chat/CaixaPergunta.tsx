import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { useRascunho } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

const MAX_CARACTERES = 2000;
/** A partir daqui a contagem aparece. */
const AVISO_CARACTERES = 1800;

type Props = {
  ref: Ref<HTMLTextAreaElement>;
  /** Por que ainda não dá para enviar (dá para ir digitando). */
  espera?: string;
  /** Sem perguntas hoje: o porquê aparece logo acima da caixa. */
  semPerguntas: boolean;
  aoEnviar: (pergunta: string) => void;
};

export function CaixaPergunta({ ref, espera, semPerguntas, aoEnviar }: Props) {
  // O que está sendo digitado sobrevive a recarregar a página e a trocar de conversa.
  const { valor: texto, setValor: setTexto, descartar } = useRascunho("pergunta", "");
  const [recado, setRecado] = useState("");
  const campo = useRef<HTMLTextAreaElement | null>(null);

  // A caixa cresce com o texto até umas 8 linhas.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [texto]);

  // O recado de espera some assim que der para enviar.
  useEffect(() => setRecado(""), [espera]);

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    const pergunta = texto.trim();
    if (semPerguntas) return setRecado("As perguntas de hoje acabaram. Amanhã o limite recomeça.");
    if (espera) return setRecado(espera);
    if (!pergunta) {
      campo.current?.focus();
      return setRecado("Escreva a pergunta antes de enviar.");
    }
    setRecado("");
    descartar();
    aoEnviar(pergunta);
  }

  function teclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  const apoio =
    recado || (texto.length >= AVISO_CARACTERES ? `${texto.length} de ${MAX_CARACTERES} caracteres` : "");

  return (
    <form onSubmit={enviar} noValidate>
      <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
        <label htmlFor="pergunta" className="shrink-0 font-medium">Sua pergunta</label>
        <p id="pergunta-apoio" role="status" className={cn("text-right", recado ? "text-perigo" : "text-texto-suave")}>
          {apoio}
        </p>
      </div>
      <div className="flex items-end gap-2 rounded-xl border border-borda-campo bg-superficie p-1 shadow-suave focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foco">
        <textarea
          id="pergunta"
          ref={(el) => {
            campo.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          rows={1}
          maxLength={MAX_CARACTERES}
          value={texto}
          aria-describedby="pergunta-apoio"
          onChange={(e) => {
            setTexto(e.target.value);
            setRecado("");
          }}
          onKeyDown={teclar}
          placeholder="Ex.: prazo de matrícula"
          // O anel de foco fica na caixa inteira. Os 10 px de cima e de baixo centram uma linha em 44 px.
          className="max-h-52 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base focus-visible:outline-none placeholder:text-texto-suave"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primaria px-4 text-sm font-medium text-primaria-texto transition-colors duration-150 hover:bg-primaria-hover"
        >
          <ArrowUp className="size-4" aria-hidden />
          Enviar
        </button>
      </div>
    </form>
  );
}
