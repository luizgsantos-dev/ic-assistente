import { AlertCircle, ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citacao } from "@/lib/api";
import { cn } from "@/lib/utils";

export type MensagemTela = {
  chave: string;
  papel: "usuario" | "assistente";
  conteudo: string;
  citacoes?: Citacao[];
  estado: "pronta" | "escrevendo" | "erro";
};

export function Mensagem({ mensagem }: { mensagem: MensagemTela }) {
  if (mensagem.papel === "usuario") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primaria px-4 py-2.5 text-[15px] text-primaria-texto">
          {mensagem.conteudo}
        </div>
      </div>
    );
  }

  if (mensagem.estado === "erro") {
    return (
      <div className="flex max-w-[85%] gap-2 rounded-2xl bg-perigo-fundo px-4 py-3 text-sm text-perigo" role="alert">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{mensagem.conteudo}</p>
      </div>
    );
  }

  if (mensagem.estado === "escrevendo" && !mensagem.conteudo) {
    return (
      <p className="flex items-center gap-2 text-sm text-texto-suave" role="status">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((atraso) => (
            <span key={atraso} className="size-1.5 animate-bounce rounded-full bg-texto-suave"
              style={{ animationDelay: `${atraso}ms` }} />
          ))}
        </span>
        Procurando nos documentos do IC…
      </p>
    );
  }

  return (
    <div className="max-w-full">
      <div
        className={cn(
          "prose prose-sm max-w-none text-[15px] text-texto dark:prose-invert",
          "prose-p:my-2 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-4",
          "prose-a:text-primaria prose-strong:text-texto",
          mensagem.estado === "escrevendo" && "after:ml-0.5 after:inline-block after:animate-pulse after:content-['▍']",
        )}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{mensagem.conteudo}</Markdown>
      </div>
      {mensagem.estado === "pronta" && mensagem.citacoes && mensagem.citacoes.length > 0 && (
        <Fontes citacoes={mensagem.citacoes} />
      )}
    </div>
  );
}

function Fontes({ citacoes }: { citacoes: Citacao[] }) {
  const [aberto, setAberto] = useState(false);
  // Uma linha por documento + páginas, com os trechos citados dele.
  const grupos = new Map<string, { titulo: string; paginas: string | null; trechos: string[] }>();
  for (const c of citacoes) {
    const chave = `${c.documento_id}|${c.paginas ?? ""}`;
    const grupo = grupos.get(chave) ?? { titulo: c.titulo, paginas: c.paginas, trechos: [] };
    grupo.trechos.push(c.texto_citado);
    grupos.set(chave, grupo);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-texto-suave hover:bg-superficie-2 hover:text-texto"
      >
        <FileText className="size-3.5" aria-hidden />
        Fontes ({grupos.size})
        <ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto && (
        <ul className="mt-1.5 space-y-2 border-l-2 border-borda pl-3">
          {[...grupos.values()].map((g) => (
            <li key={`${g.titulo}${g.paginas}`} className="text-xs">
              <p className="font-medium text-texto">
                {g.titulo}
                {g.paginas && <span className="font-normal text-texto-suave"> · {g.paginas}</span>}
              </p>
              {g.trechos.map((t, i) => (
                <p key={i} className="mt-0.5 line-clamp-3 italic text-texto-suave">“{t}”</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
