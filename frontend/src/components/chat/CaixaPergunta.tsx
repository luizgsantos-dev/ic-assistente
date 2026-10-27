import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Botao } from "@/components/ui";

const MAX_CARACTERES = 2000;

type Props = {
  desabilitada: boolean;
  motivoBloqueio?: string;
  aoEnviar: (pergunta: string) => void;
};

export function CaixaPergunta({ desabilitada, motivoBloqueio, aoEnviar }: Props) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);

  // A caixa cresce com o texto até umas 8 linhas.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [texto]);

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || desabilitada) return;
    aoEnviar(pergunta);
    setTexto("");
  }

  function teclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  const bloqueada = Boolean(motivoBloqueio);

  return (
    <form
      onSubmit={enviar}
      className="flex items-end gap-2 rounded-2xl border border-borda bg-superficie p-2 shadow-sm focus-within:border-foco"
    >
      <label htmlFor="pergunta" className="sr-only">Sua pergunta</label>
      <textarea
        id="pergunta"
        ref={campo}
        rows={1}
        maxLength={MAX_CARACTERES}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={teclar}
        disabled={bloqueada}
        placeholder={motivoBloqueio ?? "Pergunte sobre o IC…"}
        className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-texto-suave disabled:cursor-not-allowed"
      />
      <Botao
        type="submit"
        tamanho="icone"
        className="shrink-0 rounded-xl"
        disabled={desabilitada || bloqueada || !texto.trim()}
        aria-label="Enviar pergunta"
      >
        <ArrowUp className="size-4" />
      </Botao>
    </form>
  );
}
