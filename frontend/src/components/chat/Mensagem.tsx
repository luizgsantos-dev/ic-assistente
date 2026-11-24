import { ChevronDown, FileText, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useId, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Aviso, Botao, BotaoIcone } from "@/components/ui";
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
  aoAvaliar: (mensagem: MensagemTela, valor: 1 | -1 | 0) => void;
  /** Só na última resposta, quando ela falhou. */
  aoTentarDeNovo?: () => void;
};

export function Mensagem({ mensagem, aoAvaliar, aoTentarDeNovo }: Props) {
  const [fontesAbertas, setFontesAbertas] = useState(false);
  const idFontes = useId();

  if (mensagem.papel === "usuario") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primaria px-4 py-2 whitespace-pre-wrap text-primaria-texto [overflow-wrap:anywhere]">
          <span className="sr-only">Pergunta: </span>
          {mensagem.conteudo}
        </div>
      </div>
    );
  }

  if (mensagem.estado === "erro") {
    return (
      <Aviso
        acoes={
          aoTentarDeNovo && (
            <Botao variante="secundaria" onClick={aoTentarDeNovo}>
              <RefreshCw className="size-4" aria-hidden />
              Tentar de novo
            </Botao>
          )
        }
      >
        {mensagem.conteudo}
      </Aviso>
    );
  }

  if (mensagem.estado === "escrevendo" && !mensagem.conteudo) {
    return (
      <p className="flex items-center gap-2 text-sm text-texto-suave">
        <span className="flex gap-1" aria-hidden>
          {[0, 200, 400].map((atraso) => (
            <span key={atraso} className="size-2 animate-respira rounded-full bg-texto-suave" style={{ animationDelay: `${atraso}ms` }} />
          ))}
        </span>
        Procurando nos documentos do IC…
      </p>
    );
  }

  const grupos = agruparFontes(mensagem.citacoes ?? []);
  const pronta = mensagem.estado === "pronta";
  const { avaliacao } = mensagem;

  return (
    <div>
      <div
        className={cn(
          "prose max-w-leitura leading-[1.6] text-texto [overflow-wrap:anywhere] dark:prose-invert",
          "prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-lg prose-headings:leading-tight prose-headings:font-semibold",
          "prose-p:my-2 prose-a:text-primaria prose-strong:font-semibold prose-strong:text-texto prose-li:my-1",
        )}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{mensagem.conteudo}</Markdown>
      </div>

      {pronta && (
        <div className="mt-2 -ml-2 flex flex-wrap items-center">
          {grupos.length > 0 && (
            <Botao
              variante="fantasma"
              className="px-2"
              aria-expanded={fontesAbertas}
              aria-controls={idFontes}
              onClick={() => setFontesAbertas((a) => !a)}
            >
              <FileText className="size-4" aria-hidden />
              {fontesAbertas ? "Ocultar fontes" : `Ver fontes (${grupos.length})`}
              <ChevronDown className={cn("size-4 transition-transform duration-150", fontesAbertas && "rotate-180")} aria-hidden />
            </Botao>
          )}
          {mensagem.id && (
            <div className="flex items-center" role="group" aria-label="Avaliar a resposta">
              <BotaoIcone
                rotulo="Marcar como útil"
                aria-pressed={avaliacao === 1}
                className={cn(avaliacao === 1 && "text-primaria [&_svg]:fill-destaque")}
                onClick={() => aoAvaliar(mensagem, avaliacao === 1 ? 0 : 1)}
              >
                <ThumbsUp />
              </BotaoIcone>
              <BotaoIcone
                rotulo="Marcar como errada"
                aria-pressed={avaliacao === -1}
                className={cn(avaliacao === -1 && "text-primaria [&_svg]:fill-destaque")}
                onClick={() => aoAvaliar(mensagem, avaliacao === -1 ? 0 : -1)}
              >
                <ThumbsDown />
              </BotaoIcone>
              {/* O estado também aparece escrito, não só pela cor do ícone. */}
              {avaliacao ? (
                <span className="text-sm text-texto-suave">
                  {avaliacao === 1 ? "Marcada como útil" : "Marcada como errada"}
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}

      <ul id={idFontes} hidden={!pronta || !fontesAbertas} className="mt-2 space-y-4 rounded-lg border border-borda bg-superficie p-4">
        {grupos.map((g) => (
          <li key={`${g.titulo}${g.paginas}`} className="max-w-leitura text-sm">
            <p className="font-medium">
              {g.titulo}
              {g.paginas && <span className="font-normal text-texto-suave"> · {g.paginas}</span>}
            </p>
            {g.trechos.map((t, i) => (
              <p key={i} className="mt-1 line-clamp-4 text-texto-suave">“{t}”</p>
            ))}
          </li>
        ))}
      </ul>
    </div>
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
