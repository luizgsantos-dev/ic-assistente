import { ChartColumn, Table2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Aviso, Botao, Selecao } from "@/components/ui";
import { api, ErroApi, type Uso as DadosUso, type UsoDia } from "@/lib/api";
import { dataCurta, diaMes, dolares, numero, porcentagem } from "@/lib/formatos";
import { cn } from "@/lib/utils";

export function Uso() {
  const [dias, setDias] = useState(30);
  const [uso, setUso] = useState<DadosUso | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<DadosUso>(`/painel/uso?dias=${dias}`)
      .then((u) => {
        setUso(u);
        setErro("");
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar."));
  }, [dias]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Uso do assistente</h2>
        <Selecao aria-label="Período" className="w-40" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </Selecao>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!uso ? (
        !erro && <p className="text-sm text-texto-suave">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Perguntas" valor={numero(uso.perguntas)} destaque
              detalhe={`${numero(uso.usuarios_ativos)} de ${numero(uso.usuarios_total)} pessoas perguntaram`} />
            <Indicador rotulo="Sem resposta" valor={numero(uso.sem_resposta)}
              detalhe={`${porcentagem(uso.sem_resposta, uso.perguntas)} das perguntas`} />
            <Indicador rotulo="Avaliações" valor={`👍 ${numero(uso.positivas)} · 👎 ${numero(uso.negativas)}`}
              detalhe={uso.erros ? `${numero(uso.erros)} falha(s) ao responder` : "Nenhuma falha ao responder"} />
            <Indicador rotulo="Custo estimado da API" valor={dolares(uso.custo_estimado_usd)}
              detalhe={`${numero(uso.documentos_prontos)} documentos ativos`} />
          </div>
          <GraficoPerguntas dias={uso.dias} />
        </>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-4">
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p className={cn("mt-1 font-semibold", destaque ? "text-3xl" : "text-2xl")}>{valor}</p>
      <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>
    </div>
  );
}

/** Topo "redondo" do eixo: 1, 2, 5 × 10^n, nunca menos que 4. */
function topoDoEixo(maximo: number) {
  if (maximo <= 4) return 4;
  const base = 10 ** Math.floor(Math.log10(maximo));
  for (const passo of [1, 2, 5, 10]) if (passo * base >= maximo) return passo * base;
  return 10 * base;
}

function GraficoPerguntas({ dias }: { dias: UsoDia[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [comoTabela, setComoTabela] = useState(false);
  const topo = topoDoEixo(Math.max(0, ...dias.map((d) => d.perguntas)));
  const marcas = [0, topo / 2, topo];
  // Rótulos do eixo X espaçados para não se sobreporem (cerca de 6 ao todo).
  const passoRotulo = Math.max(1, Math.ceil(dias.length / 6));
  const total = dias.reduce((s, d) => s + d.perguntas, 0);

  return (
    <section className="rounded-xl border border-borda bg-superficie p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Perguntas por dia</h3>
          <div className="mt-1 flex gap-4 text-xs text-texto-suave">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-serie-1" aria-hidden />
              Respondidas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-serie-2" aria-hidden />
              Sem resposta
            </span>
          </div>
        </div>
        <Botao variante="secundaria" tamanho="pequeno" onClick={() => setComoTabela((t) => !t)}>
          {comoTabela ? <ChartColumn className="size-4" /> : <Table2 className="size-4" />}
          {comoTabela ? "Ver gráfico" : "Ver tabela"}
        </Botao>
      </div>

      {comoTabela ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th className="py-1.5 font-medium">Dia</th>
                <th className="py-1.5 text-right font-medium">Perguntas</th>
                <th className="py-1.5 text-right font-medium">Sem resposta</th>
                <th className="py-1.5 text-right font-medium">👍</th>
                <th className="py-1.5 text-right font-medium">👎</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda tabular-nums">
              {[...dias].reverse().map((d) => (
                <tr key={d.dia}>
                  <td className="py-1.5">{dataCurta(d.dia)}</td>
                  <td className="py-1.5 text-right">{d.perguntas}</td>
                  <td className="py-1.5 text-right">{d.sem_resposta}</td>
                  <td className="py-1.5 text-right">{d.positivas}</td>
                  <td className="py-1.5 text-right">{d.negativas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Eixo Y */}
          <div className="relative h-48 w-8 shrink-0 text-right text-xs text-texto-suave tabular-nums">
            {marcas.map((m) => (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(m / topo) * 100}%` }}>
                {numero(m)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="relative h-48"
              role="img"
              aria-label={`Gráfico de perguntas por dia: ${total} perguntas em ${dias.length} dias. Use "Ver tabela" para os valores.`}
            >
              {/* Linhas de grade (finas e discretas) */}
              {marcas.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-borda" style={{ bottom: `${(m / topo) * 100}%` }} aria-hidden />
              ))}

              <div className="absolute inset-0 flex">
                {dias.map((d, i) => {
                  const semResposta = Math.min(d.sem_resposta, d.perguntas);
                  const respondidas = d.perguntas - semResposta;
                  return (
                    <div
                      key={d.dia}
                      tabIndex={0}
                      aria-label={`${dataCurta(d.dia)}: ${d.perguntas} perguntas, ${semResposta} sem resposta`}
                      onMouseEnter={() => setAtivo(i)}
                      onMouseLeave={() => setAtivo(null)}
                      onFocus={() => setAtivo(i)}
                      onBlur={() => setAtivo(null)}
                      className={cn(
                        "flex h-full min-w-0 flex-1 cursor-default flex-col justify-end px-[1px] outline-none",
                        ativo === i && "bg-superficie-2",
                      )}
                    >
                      {/* Coluna: no máximo 24 px; 2 px de folga entre os segmentos; ponta arredondada. */}
                      <div className="mx-auto flex w-full max-w-6 flex-col gap-[2px]">
                        {semResposta > 0 && (
                          <div className="rounded-t-[4px] bg-serie-2" style={{ height: `${(semResposta / topo) * 192}px` }} />
                        )}
                        {respondidas > 0 && (
                          <div
                            className={cn("bg-serie-1", semResposta === 0 && "rounded-t-[4px]")}
                            style={{ height: `${(respondidas / topo) * 192}px` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {ativo !== null && <Dica dia={dias[ativo]} indice={ativo} total={dias.length} />}
            </div>

            {/* Eixo X */}
            <div className="mt-1.5 flex text-xs text-texto-suave">
              {dias.map((d, i) => (
                <span key={d.dia} className="min-w-0 flex-1 text-center">
                  {(i % passoRotulo === 0 || i === dias.length - 1) && diaMes(d.dia)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Dica({ dia, indice, total }: { dia: UsoDia; indice: number; total: number }) {
  const semResposta = Math.min(dia.sem_resposta, dia.perguntas);
  // Perto das bordas a dica encosta para dentro em vez de centralizar e cortar.
  const posicao = (indice + 0.5) / total;
  const deslocamento = posicao < 0.15 ? "0%" : posicao > 0.85 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-borda bg-superficie px-3 py-2 text-xs shadow-md"
      style={{ left: `${posicao * 100}%`, transform: `translateX(${deslocamento})` }}
      role="status"
    >
      <p className="mb-1 font-medium">{dataCurta(dia.dia)}</p>
      <LinhaDica cor="bg-serie-1" valor={dia.perguntas - semResposta} rotulo="respondidas" />
      <LinhaDica cor="bg-serie-2" valor={semResposta} rotulo="sem resposta" />
      {(dia.positivas > 0 || dia.negativas > 0) && (
        <p className="mt-1 text-texto-suave">👍 {dia.positivas} · 👎 {dia.negativas}</p>
      )}
    </div>
  );
}

function LinhaDica({ cor, valor, rotulo }: { cor: string; valor: number; rotulo: string }) {
  return (
    <p className="flex items-center gap-1.5">
      <span className={cn("h-0.5 w-3 rounded-full", cor)} aria-hidden />
      <strong className="tabular-nums">{valor}</strong>
      <span className="text-texto-suave">{rotulo}</span>
    </p>
  );
}
