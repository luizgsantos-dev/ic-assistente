import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { AvisoDeErro, Botao, CabecalhoPagina, Esqueleto, EstadoVazio, Selecao } from "@/components/ui";
import { api, type Uso as DadosUso, type UsoDia } from "@/lib/api";
import { dataCurta, diaMes, dolares, numero, porcentagem } from "@/lib/formatos";
import { useAtraso, usePreferencia, useTitulo } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

const PERIODOS = [7, 30, 90];

export function Uso() {
  useTitulo("Uso");
  const [dias, setDias] = usePreferencia("uso-dias", 30);
  const [uso, setUso] = useState<DadosUso | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setUso(null);
    setErro(null);
    api<DadosUso>(`/painel/uso?dias=${dias}`)
      .then((u) => !cancelado && setUso(u))
      .catch((e) => !cancelado && setErro(e));
    return () => {
      cancelado = true;
    };
  }, [dias, tentativa]);

  return (
    <>
      <CabecalhoPagina titulo="Uso" texto="Quanto o assistente foi usado, quanto deixou de responder e quanto custou." />

      <div className="w-full space-y-1 md:w-48">
        <label htmlFor="periodo" className="block text-sm font-medium">Período</label>
        <Selecao id="periodo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {PERIODOS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
        </Selecao>
      </div>

      {erro !== null ? (
        <AvisoDeErro erro={erro} aoTentar={() => setTentativa((t) => t + 1)} />
      ) : uso === null ? (
        <Carregando />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Indicador
              rotulo="Perguntas"
              valor={numero(uso.perguntas)}
              detalhe={`${numero(uso.usuarios_ativos)} de ${numero(uso.usuarios_total)} pessoas perguntaram`}
            />
            <Indicador
              rotulo="Sem resposta"
              valor={numero(uso.sem_resposta)}
              detalhe={uso.perguntas ? `${porcentagem(uso.sem_resposta, uso.perguntas)} das perguntas` : "Nenhuma pergunta ainda"}
            />
            <Indicador
              rotulo="Avaliações"
              valor={
                <span className="flex flex-wrap gap-x-4">
                  <Avaliacao Icone={ThumbsUp} valor={uso.positivas} nome="úteis" />
                  <Avaliacao Icone={ThumbsDown} valor={uso.negativas} nome="erradas" />
                </span>
              }
              detalhe={
                uso.erros === 0
                  ? "Nenhuma falha ao responder"
                  : uso.erros === 1 ? "1 falha ao responder" : `${numero(uso.erros)} falhas ao responder`
              }
            />
            <Indicador
              rotulo="Custo estimado"
              valor={dolares(uso.custo_estimado_usd)}
              detalhe={`API do Claude, com ${numero(uso.documentos_prontos)} documentos em uso`}
            />
          </div>

          <section aria-labelledby="titulo-grafico" className="rounded-xl border border-borda bg-superficie p-4 shadow-suave">
            <h2 id="titulo-grafico" className="text-lg font-semibold">Perguntas por dia</h2>
            {uso.perguntas === 0 ? (
              <EstadoVazio
                titulo="Nenhuma pergunta no período"
                texto="O gráfico aparece quando alguém usar o assistente."
                acao={
                  dias < 90 && <Botao variante="secundaria" onClick={() => setDias(90)}>Ver últimos 90 dias</Botao>
                }
              />
            ) : (
              <>
                <Legenda />
                <Grafico key={dias} dias={uso.dias} total={uso.perguntas} />
                <TabelaPorDia dias={uso.dias} />
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Carregando() {
  const mostrar = useAtraso(true);
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Carregando…</span>
      {mostrar && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Esqueleto key={i} className="h-28" />)}
          </div>
          <Esqueleto className="h-80" />
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe: string }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-4 shadow-suave">
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-sm text-texto-suave">{detalhe}</p>
    </div>
  );
}

function Avaliacao({ Icone, valor, nome }: { Icone: typeof ThumbsUp; valor: number; nome: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icone className="size-5 text-texto-suave" aria-hidden />
      {numero(valor)}
      <span className="sr-only"> {nome}</span>
    </span>
  );
}

function Legenda() {
  return (
    <ul className="mt-1 mb-4 flex gap-4 text-sm text-texto-suave">
      <li className="inline-flex items-center gap-2">
        <span className="size-3 rounded-sm bg-serie-1" aria-hidden />
        Respondidas
      </li>
      <li className="inline-flex items-center gap-2">
        <span className="size-3 rounded-sm bg-serie-2" aria-hidden />
        Sem resposta
      </li>
    </ul>
  );
}

// --- gráfico ---

const ALTURA = 192;
/** Abaixo disto a coluna some; em tela estreita a área do gráfico rola de lado. */
const LARGURA_MINIMA_DIA = 7;

/** Topo "redondo" do eixo, sempre par, para a marca do meio ser um número inteiro. */
function topoDoEixo(maximo: number) {
  if (maximo <= 4) return 4;
  if (maximo <= 10) return 10;
  const base = 10 ** Math.floor(Math.log10(maximo));
  return [1, 2, 3, 4, 6, 8, 10].map((passo) => passo * base).find((topo) => topo >= maximo) ?? 10 * base;
}

function separar(d: UsoDia) {
  const semResposta = Math.min(d.sem_resposta, d.perguntas);
  return { semResposta, respondidas: d.perguntas - semResposta };
}

function Grafico({ dias, total }: { dias: UsoDia[]; total: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const topo = topoDoEixo(Math.max(0, ...dias.map((d) => d.perguntas)));
  const marcas = [0, topo / 2, topo];
  // Rótulos do eixo X espaçados para não se sobreporem (cerca de 6 ao todo).
  const passoRotulo = Math.max(1, Math.ceil(dias.length / 6));

  // Se não couber inteiro, começa pelos dias mais recentes.
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Um ponto de foco só: as setas andam pelos dias.
  function teclar(e: KeyboardEvent) {
    const atual = ativo ?? dias.length - 1;
    const destino =
      e.key === "ArrowLeft" ? Math.max(0, atual - 1)
      : e.key === "ArrowRight" ? Math.min(dias.length - 1, atual + 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? dias.length - 1
      : null;
    if (e.key === "Escape") return setAtivo(null);
    if (destino === null) return;
    e.preventDefault();
    setAtivo(destino);
  }

  const diaAtivo = ativo === null ? null : dias[ativo];

  return (
    <div className="flex gap-2">
      <div className="relative w-8 shrink-0 text-right text-xs text-texto-suave tabular-nums" style={{ height: ALTURA }} aria-hidden>
        {marcas.map((m) => (
          <span key={m} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(m / topo) * 100}%` }}>
            {numero(m)}
          </span>
        ))}
      </div>

      {/* A folga em volta deixa o anel de foco e o rótulo de cima aparecerem. */}
      <div ref={rolagem} className="-m-2 min-w-0 flex-1 overflow-x-auto p-2">
        <div style={{ minWidth: dias.length * LARGURA_MINIMA_DIA }}>
          <div
            tabIndex={0}
            role="group"
            aria-label={`Gráfico: ${numero(total)} perguntas em ${dias.length} dias. Use as setas para ler dia a dia.`}
            onFocus={(e) => e.target.matches(":focus-visible") && setAtivo(dias.length - 1)}
            onBlur={() => setAtivo(null)}
            onKeyDown={teclar}
            onPointerLeave={() => setAtivo(null)}
            className="relative rounded-sm"
            style={{ height: ALTURA }}
          >
            {marcas.map((m) => (
              <div key={m} className="absolute inset-x-0 border-t border-borda" style={{ bottom: `${(m / topo) * 100}%` }} aria-hidden />
            ))}

            <div className="absolute inset-0 flex" aria-hidden>
              {dias.map((d, i) => {
                const { semResposta, respondidas } = separar(d);
                return (
                  <div
                    key={d.dia}
                    onPointerEnter={() => setAtivo(i)}
                    onPointerDown={() => setAtivo(i)}
                    className={cn("flex h-full min-w-0 flex-1 flex-col justify-end px-px", ativo === i && "bg-superficie-2")}
                  >
                    {/* Coluna: no máximo 24 px; 2 px de folga entre os segmentos; ponta arredondada. */}
                    <div className="mx-auto flex w-full max-w-6 flex-col gap-0.5">
                      {semResposta > 0 && (
                        <div className="rounded-t-sm bg-serie-2" style={{ height: (semResposta / topo) * ALTURA }} />
                      )}
                      {respondidas > 0 && (
                        <div
                          className={cn("bg-serie-1", semResposta === 0 && "rounded-t-sm")}
                          style={{ height: (respondidas / topo) * ALTURA }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {diaAtivo && ativo !== null && <DicaDoDia dia={diaAtivo} posicao={(ativo + 0.5) / dias.length} />}
            <p role="status" className="sr-only">
              {diaAtivo &&
                `${dataCurta(diaAtivo.dia)}: ${diaAtivo.perguntas} perguntas, ${separar(diaAtivo).semResposta} sem resposta`}
            </p>
          </div>

          <div className="mt-2 flex text-xs text-texto-suave" aria-hidden>
            {dias.map((d, i) => (
              <span key={d.dia} className="relative h-4 min-w-0 flex-1">
                {/* O último dia sempre aparece; o rótulo anterior some se ficar colado nele. */}
                {(i === dias.length - 1 || (i % passoRotulo === 0 && dias.length - 1 - i >= passoRotulo / 2)) && (
                  <span
                    className={cn(
                      "absolute top-0 whitespace-nowrap",
                      i === 0 ? "left-0" : i === dias.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    {diaMes(d.dia)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DicaDoDia({ dia, posicao }: { dia: UsoDia; posicao: number }) {
  const { semResposta, respondidas } = separar(dia);
  // Perto das bordas a dica encosta para dentro em vez de centralizar e cortar.
  const deslocamento = posicao < 0.2 ? "0%" : posicao > 0.8 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm shadow-flutuante"
      style={{ left: `${posicao * 100}%`, transform: `translateX(${deslocamento})` }}
      aria-hidden
    >
      <p className="font-medium">{dataCurta(dia.dia)}</p>
      <LinhaDica cor="bg-serie-1" valor={respondidas} rotulo="respondidas" />
      <LinhaDica cor="bg-serie-2" valor={semResposta} rotulo="sem resposta" />
      {(dia.positivas > 0 || dia.negativas > 0) && (
        <p className="text-texto-suave">{dia.positivas} úteis, {dia.negativas} erradas</p>
      )}
    </div>
  );
}

function LinhaDica({ cor, valor, rotulo }: { cor: string; valor: number; rotulo: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={cn("size-2 rounded-sm", cor)} aria-hidden />
      <span className="font-semibold tabular-nums">{valor}</span>
      <span className="text-texto-suave">{rotulo}</span>
    </p>
  );
}

function TabelaPorDia({ dias }: { dias: UsoDia[] }) {
  return (
    <details className="mt-4 border-t border-borda">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg text-sm font-medium text-primaria underline-offset-4 hover:underline">
        Ver tabela por dia
      </summary>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de perguntas por dia">
        <table className="w-full text-right text-sm tabular-nums">
          <thead className="text-texto-suave">
            <tr className="border-b border-borda">
              <th scope="col" className="py-2 pr-4 text-left font-medium">Dia</th>
              <th scope="col" className="px-2 py-2 font-medium">Perguntas</th>
              <th scope="col" className="px-2 py-2 font-medium">Sem resposta</th>
              <th scope="col" className="px-2 py-2 font-medium">Úteis</th>
              <th scope="col" className="py-2 pl-2 font-medium">Erradas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {[...dias].reverse().map((d) => (
              <tr key={d.dia}>
                <th scope="row" className="py-2 pr-4 text-left font-normal">{dataCurta(d.dia)}</th>
                <td className="px-2 py-2">{d.perguntas}</td>
                <td className="px-2 py-2">{d.sem_resposta}</td>
                <td className="px-2 py-2">{d.positivas}</td>
                <td className="py-2 pl-2">{d.negativas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
