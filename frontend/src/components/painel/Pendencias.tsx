import { Inbox, ThumbsDown } from "lucide-react";
import { useEffect, useState } from "react";

import { Aviso, Selecao } from "@/components/ui";
import { api, ErroApi, type Pendencia } from "@/lib/api";
import { dataHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";

const TIPOS = [
  { id: "todas", rotulo: "Todas" },
  { id: "sem_resposta", rotulo: "Sem resposta" },
  { id: "negativas", rotulo: "Marcadas com 👎" },
] as const;

const MOTIVOS: Record<string, string> = {
  sem_trechos: "Não achou nos documentos",
  sem_citacoes: "Respondeu sem citar fonte",
};

export function Pendencias() {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("todas");
  const [dias, setDias] = useState(30);
  const [itens, setItens] = useState<Pendencia[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setItens(null);
    api<Pendencia[]>(`/painel/pendencias?tipo=${tipo}&dias=${dias}`)
      .then((r) => {
        setItens(r);
        setErro("");
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar."));
  }, [tipo, dias]);

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-texto-suave">
        Perguntas que o assistente não soube responder e respostas marcadas como erradas. Elas
        mostram o que falta ou está confuso nos documentos. Por privacidade, não aparece quem perguntou.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-borda bg-superficie p-0.5" role="group" aria-label="Tipo">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tipo === t.id}
              onClick={() => setTipo(t.id)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-sm",
                tipo === t.id ? "bg-destaque font-medium text-texto" : "text-texto-suave hover:text-texto",
              )}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        <Selecao aria-label="Período" className="w-40" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </Selecao>
        {itens && <span className="text-sm text-texto-suave">{itens.length} no período</span>}
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {itens === null && !erro ? (
        <p className="text-sm text-texto-suave">Carregando…</p>
      ) : itens?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borda px-4 py-10 text-sm text-texto-suave">
          <Inbox className="size-6" aria-hidden />
          Nada pendente neste período.
        </div>
      ) : (
        <ul className="space-y-2">
          {itens?.map((p) => (
            <li key={p.mensagem_id} className="rounded-xl border border-borda bg-superficie p-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                {p.motivo && MOTIVOS[p.motivo] && (
                  <span className="rounded-full bg-superficie-2 px-2 py-0.5">{MOTIVOS[p.motivo]}</span>
                )}
                {p.avaliacao === -1 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-superficie-2 px-2 py-0.5">
                    <ThumbsDown className="size-3" aria-hidden />
                    Marcada como errada
                  </span>
                )}
                <span>{dataHora(p.criada_em)}</span>
              </div>
              <p className="font-medium">{p.pergunta ?? "(pergunta não encontrada)"}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-texto-suave hover:text-texto">Ver a resposta dada</summary>
                <p className="mt-2 whitespace-pre-wrap text-texto-suave">{p.resposta}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
