import { CircleHelp, ThumbsDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { Moldura, Paginacao, usePaginas } from "@/components/tabela";
import {
  AvisoDeErro,
  Botao,
  CabecalhoPagina,
  EsqueletoLinhas,
  EstadoVazio,
  estiloBotao,
  Selecao,
} from "@/components/ui";
import { api, type Pendencia } from "@/lib/api";
import { dataHora } from "@/lib/formatos";
import { usePreferencia, useTitulo } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

const TIPOS = [
  { id: "todas", rotulo: "Todas" },
  { id: "sem_resposta", rotulo: "Sem resposta" },
  { id: "negativas", rotulo: "Marcadas como erradas" },
] as const;

type Tipo = (typeof TIPOS)[number]["id"];

const MOTIVOS: Record<string, string> = {
  sem_trechos: "Não achou nos documentos",
  sem_citacoes: "Respondeu sem citar fonte",
};

const PERIODO_MAXIMO = 90;
/** A API devolve no máximo isto; acima, ficam só as mais recentes. */
const LIMITE_API = 300;

export function Pendencias() {
  useTitulo("Pendências");
  const [tipo, setTipo] = usePreferencia<Tipo>("pendencias-tipo", "todas");
  const [dias, setDias] = usePreferencia("pendencias-dias", 30);
  const [itens, setItens] = useState<Pendencia[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [tentativa, setTentativa] = useState(0);
  const { visiveis, paginacao } = usePaginas(itens ?? []);
  const { irPara } = paginacao;

  useEffect(() => {
    let cancelado = false;
    setItens(null);
    setErro(null);
    irPara(1);
    api<Pendencia[]>(`/painel/pendencias?tipo=${tipo}&dias=${dias}`)
      .then((r) => !cancelado && setItens(r))
      .catch((e) => !cancelado && setErro(e));
    return () => {
      cancelado = true;
    };
  }, [tipo, dias, tentativa, irPara]);

  const tentar = useCallback(() => setTentativa((t) => t + 1), []);

  return (
    <>
      <CabecalhoPagina
        titulo="Pendências"
        texto="Perguntas que o assistente não soube responder e respostas marcadas como erradas: o que falta ou está confuso nos documentos. Por privacidade, não aparece quem perguntou."
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div role="group" aria-label="Tipo de pendência" className="flex flex-wrap gap-1">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tipo === t.id}
                onClick={() => setTipo(t.id)}
                className={cn(
                  "min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                  tipo === t.id ? "bg-destaque text-texto" : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                )}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          <div className="w-full space-y-1 md:w-48">
            <label htmlFor="periodo" className="block text-sm font-medium">Período</label>
            <Selecao id="periodo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={PERIODO_MAXIMO}>Últimos {PERIODO_MAXIMO} dias</option>
            </Selecao>
          </div>
        </div>

        <Moldura rodape={<Paginacao {...paginacao} semDados={itens === null} />}>
          {erro !== null ? (
            <div className="p-4"><AvisoDeErro erro={erro} aoTentar={tentar} /></div>
          ) : itens === null ? (
            <EsqueletoLinhas linhas={5} className="h-16" />
          ) : itens.length === 0 ? (
            <Vazio {...{ tipo, dias, setTipo, setDias }} />
          ) : (
            <ul className="divide-y divide-borda">
              {visiveis.map((p) => (
                <li key={p.mensagem_id} className="px-4 pt-4 pb-1">
                  <p className="max-w-leitura font-medium [overflow-wrap:anywhere]">{p.pergunta ?? "(pergunta não encontrada)"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-texto-suave">
                    {p.motivo && MOTIVOS[p.motivo] && (
                      <span className="inline-flex items-center gap-2">
                        <CircleHelp className="size-4" aria-hidden />
                        {MOTIVOS[p.motivo]}
                      </span>
                    )}
                    {p.avaliacao === -1 && (
                      <span className="inline-flex items-center gap-2">
                        <ThumbsDown className="size-4" aria-hidden />
                        Marcada como errada
                      </span>
                    )}
                    <time dateTime={p.criada_em}>{dataHora(p.criada_em)}</time>
                  </div>
                  <details className="text-sm">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg font-medium text-primaria underline-offset-4 hover:underline">
                      Ver resposta dada
                    </summary>
                    <p className="max-w-leitura pb-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{p.resposta}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Moldura>
        {itens?.length === LIMITE_API && (
          <p className="text-sm text-texto-suave">Só as {LIMITE_API} mais recentes do período aparecem aqui.</p>
        )}
      </div>
    </>
  );
}

/** Vazio por causa do filtro oferece afrouxar o filtro; vazio de verdade é boa notícia. */
function Vazio({
  tipo,
  dias,
  setTipo,
  setDias,
}: {
  tipo: Tipo;
  dias: number;
  setTipo: (t: Tipo) => void;
  setDias: (d: number) => void;
}) {
  if (tipo !== "todas") {
    return (
      <EstadoVazio
        titulo="Nenhuma pendência desse tipo"
        texto={`Nada nos últimos ${dias} dias.`}
        acao={<Botao variante="secundaria" onClick={() => setTipo("todas")}>Mostrar todas</Botao>}
      />
    );
  }
  if (dias < PERIODO_MAXIMO) {
    return (
      <EstadoVazio
        titulo="Nada pendente"
        texto={`Nos últimos ${dias} dias o assistente respondeu tudo e nenhuma resposta foi marcada como errada.`}
        acao={
          <Botao variante="secundaria" onClick={() => setDias(PERIODO_MAXIMO)}>Ver últimos {PERIODO_MAXIMO} dias</Botao>
        }
      />
    );
  }
  return (
    <EstadoVazio
      titulo="Nada pendente"
      texto="Quando faltar resposta para alguma pergunta, ela aparece aqui para você saber que documento enviar."
      acao={<Link to="/painel/documentos" className={estiloBotao({ variante: "secundaria" })}>Ver documentos</Link>}
    />
  );
}
