import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAvisar, useConfirmar } from "@/components/Janelas";
import { api, baixar, type Documento } from "@/lib/api";
import { cn } from "@/lib/utils";

const INTERVALO_ATUALIZACAO = 3000;

export const SITUACOES: Record<Documento["status"], string> = {
  pronto: "Pronto",
  pendente: "Na fila",
  processando: "Processando",
  erro: "Com erro",
};

const ICONES = { pronto: CircleCheck, pendente: Clock, processando: LoaderCircle, erro: CircleAlert };

export const naFila = (d: Documento) => d.status === "pendente" || d.status === "processando";

export function Situacao({ status }: { status: Documento["status"] }) {
  const Icone = ICONES[status];
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", status === "erro" && "text-perigo")}>
      <Icone className={cn("size-4 shrink-0", status === "processando" && "animate-spin")} aria-hidden />
      {SITUACOES[status]}
    </span>
  );
}

/** Lista completa; enquanto algo estiver na fila, atualiza sozinha. */
export function useDocumentos() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  const carregar = useCallback(async () => {
    try {
      setDocumentos(await api<Documento[]>("/painel/documentos"));
      setErro(null);
    } catch (e) {
      setErro(e);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const emAndamento = documentos?.some(naFila);
  useEffect(() => {
    if (!emAndamento) return;
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO);
    return () => clearInterval(intervalo);
  }, [emAndamento, carregar]);

  return { documentos, erro, carregar };
}

/** Ações de um documento, iguais na lista e na página dele. Devolvem se deu certo. */
export function useAcoesDocumento(aoErro: (erro: unknown) => void) {
  const confirmar = useConfirmar();
  const avisar = useAvisar();

  async function tentar(acao: () => Promise<unknown>, recado?: string) {
    aoErro(null);
    try {
      await acao();
      if (recado) avisar(recado);
      return true;
    } catch (e) {
      aoErro(e);
      return false;
    }
  }

  return {
    baixarOriginal: (d: Documento) => tentar(() => baixar(`/painel/documentos/${d.id}/arquivo`, d.arquivo)),
    reprocessar: (d: Documento) =>
      tentar(() => api(`/painel/documentos/${d.id}/reprocessar`, { metodo: "POST" }), "O documento voltou para a fila."),
    apagar: async (d: Documento) => {
      const sim = await confirmar({
        titulo: `Apagar documento “${d.titulo}”?`,
        texto: "O assistente deixa de usá-lo e o arquivo guardado some. Não dá para desfazer.",
        acao: "Apagar documento",
      });
      return sim && tentar(() => api(`/painel/documentos/${d.id}`, { metodo: "DELETE" }), "Documento apagado.");
    },
  };
}
