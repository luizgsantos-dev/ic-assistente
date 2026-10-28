import { AlertCircle, ChevronDown, FileText, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citacao } from "@/lib/api";
import { cn } from "@/lib/utils";

export type MensagemTela = {
  chave: string;
  /** id no servidor; só existe depois que a resposta foi salva */
  id?: number;
  papel: "usuario" | "assistente";
  conteudo: string;
  citacoes?: Citacao[];
  avaliacao?: number | null;
  estado: "pronta" | "escrevendo" | "erro";
};

type Props = {
  mensagem: MensagemTela;
  aoAvaliar?: (mensagem: MensagemTela, valor: 1 | -1 | 0) => void;
};

export function Mensagem({ mensagem, aoAvaliar }: Props) {
  const [fontesAbertas, setFontesAbertas] = useState(false);

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

  const grupos = agruparFontes(mensagem.citacoes ?? []);
  const pronta = mensagem.estado === "pronta";

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

      {pronta && (grupos.length > 0 || (mensagem.id && aoAvaliar)) && (
        <div className="mt-2 flex items-center gap-1">
          {grupos.length > 0 && (
            <button
              type="button"
              onClick={() => setFontesAbertas((a) => !a)}
              aria-expanded={fontesAbertas}
              className={botaoDiscreto}
            >
              <FileText className="size-3.5" aria-hidden />
              Fontes ({grupos.length})
              <ChevronDown className={cn("size-3.5 transition-transform", fontesAbertas && "rotate-180")} aria-hidden />
            </button>
          )}
          {mensagem.id && aoAvaliar && (
            <div className="flex items-center" role="group" aria-label="Avaliar a resposta">
              <BotaoAvaliacao
                ativo={mensagem.avaliacao === 1}
                rotulo="Resposta útil"
                aoClicar={() => aoAvaliar(mensagem, mensagem.avaliacao === 1 ? 0 : 1)}
              >
                <ThumbsUp className="size-3.5" />
              </BotaoAvaliacao>
              <BotaoAvaliacao
                ativo={mensagem.avaliacao === -1}
                rotulo="Resposta errada ou incompleta"
                aoClicar={() => aoAvaliar(mensagem, mensagem.avaliacao === -1 ? 0 : -1)}
              >
                <ThumbsDown className="size-3.5" />
              </BotaoAvaliacao>
            </div>
          )}
        </div>
      )}

      {pronta && fontesAbertas && (
        <ul className="mt-1.5 space-y-2 border-l-2 border-borda pl-3">
          {grupos.map((g) => (
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

const botaoDiscreto =
  "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium " +
  "text-texto-suave hover:bg-superficie-2 hover:text-texto";

function BotaoAvaliacao({
  ativo,
  rotulo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  rotulo: string;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      aria-label={rotulo}
      title={rotulo}
      className={cn(botaoDiscreto, "px-2", ativo && "bg-destaque text-texto")}
    >
      {children}
    </button>
  );
}

/** Uma entrada por documento + páginas, com os trechos citados dele. */
function agruparFontes(citacoes: Citacao[]) {
  const grupos = new Map<string, { titulo: string; paginas: string | null; trechos: string[] }>();
  for (const c of citacoes) {
    const chave = `${c.documento_id}|${c.paginas ?? ""}`;
    const grupo = grupos.get(chave) ?? { titulo: c.titulo, paginas: c.paginas, trechos: [] };
    grupo.trechos.push(c.texto_citado);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}
