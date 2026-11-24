import { Download, RefreshCw, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";

import { naFila, Situacao, SITUACOES, useAcoesDocumento, useDocumentos } from "@/components/painel/documentosComum";
import { MenuAcoes, type ItemMenu } from "@/components/Suspenso";
import {
  BotaoFiltros,
  CampoBusca,
  ColunaOrdenavel,
  estiloCabecalho,
  FiltrosAtivos,
  Moldura,
  Paginacao,
  useLista,
} from "@/components/tabela";
import { AvisoDeErro, Botao, CabecalhoPagina, EsqueletoLinhas, EstadoVazio, estiloBotao } from "@/components/ui";
import type { Documento } from "@/lib/api";
import { dataCurta } from "@/lib/formatos";
import { useAtalhoBusca, useRascunho, useTitulo } from "@/lib/ganchos";
import { cn } from "@/lib/utils";
import { useContextoPainel } from "@/paginas/painel/Painel";

type Coluna = "titulo" | "categoria" | "data" | "situacao" | "envio";

const SEM_FILTRO = { texto: "", categoria: "", situacao: "" };

// Alinha com a primeira linha do título, que tem 44 px de altura.
const celula = "px-4 py-2 align-top leading-11";
// Do celular ao tablet só cabem algumas colunas; o resto desce para baixo do título.
const DO_TABLET = "hidden md:table-cell";
const DA_TELA_LARGA = "hidden xl:table-cell";

export function Documentos() {
  useTitulo("Documentos");
  const { categorias } = useContextoPainel();
  const { documentos, erro, carregar } = useDocumentos();
  const [erroAcao, setErroAcao] = useState<unknown>(null);
  const acoes = useAcoesDocumento(setErroAcao);
  const busca = useAtalhoBusca();
  // Guardado na aba: abrir um documento e voltar não desfaz a busca.
  const { valor: filtro, setValor: setFiltro } = useRascunho("filtro-documentos", SEM_FILTRO);

  const nomeCategoria = useCallback((d: Documento) => categorias[d.categoria] ?? d.categoria, [categorias]);

  const filtrados = useMemo(() => {
    const texto = filtro.texto.trim().toLowerCase();
    return (documentos ?? []).filter(
      (d) =>
        (!texto || d.titulo.toLowerCase().includes(texto) || d.arquivo.toLowerCase().includes(texto)) &&
        (!filtro.categoria || d.categoria === filtro.categoria) &&
        (!filtro.situacao || d.status === filtro.situacao),
    );
  }, [documentos, filtro]);

  const valorDe = useCallback(
    (d: Documento, coluna: Coluna) =>
      ({
        titulo: d.titulo,
        categoria: nomeCategoria(d),
        data: d.data_documento ?? "",
        situacao: SITUACOES[d.status],
        envio: d.criado_em,
      })[coluna],
    [nomeCategoria],
  );

  const lista = useLista<Documento, Coluna>("documentos", filtrados, valorDe, { coluna: "envio", crescente: false });

  function filtrar(mudanca: Partial<typeof SEM_FILTRO>) {
    setFiltro({ ...filtro, ...mudanca });
    lista.voltarAoInicio();
  }

  const filtros = [
    { id: "categoria", rotulo: "Categoria", valor: filtro.categoria, opcoes: categorias, aoMudar: (categoria: string) => filtrar({ categoria }) },
    { id: "situacao", rotulo: "Situação", valor: filtro.situacao, opcoes: SITUACOES, aoMudar: (situacao: string) => filtrar({ situacao }) },
  ];

  function itensDoMenu(d: Documento): ItemMenu[] {
    const itens: ItemMenu[] = [
      { rotulo: "Baixar original", Icone: Download, aoEscolher: () => acoes.baixarOriginal(d) },
    ];
    if (!naFila(d)) {
      itens.push({
        rotulo: "Processar de novo",
        Icone: RefreshCw,
        aoEscolher: async () => {
          if (await acoes.reprocessar(d)) carregar();
        },
      });
    }
    itens.push({
      rotulo: "Apagar documento",
      Icone: Trash2,
      perigo: true,
      aoEscolher: async () => {
        if (!(await acoes.apagar(d))) return;
        await carregar();
        // A linha que tinha o foco sumiu.
        document.getElementById("conteudo")?.focus({ preventScroll: true });
      },
    });
    return itens;
  }

  const enviar = (
    <Link to="/painel/documentos/enviar" className={estiloBotao()}>
      <Upload className="size-4" aria-hidden />
      Enviar documentos
    </Link>
  );

  const ordenavel = { ordem: lista.ordem, aoOrdenar: lista.ordenarPor };

  return (
    <>
      <CabecalhoPagina titulo="Documentos" texto="O que o assistente lê para responder." acoes={enviar} />

      {erroAcao !== null && <AvisoDeErro erro={erroAcao} />}
      {erro !== null && documentos !== null && <AvisoDeErro erro={erro} aoTentar={carregar} />}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <CampoBusca
            ref={busca}
            rotulo="Buscar documento"
            exemplo="Ex.: calendário"
            valor={filtro.texto}
            aoMudar={(texto) => filtrar({ texto })}
          />
          <BotaoFiltros filtros={filtros} />
        </div>
        <FiltrosAtivos filtros={filtros} aoLimpar={() => filtrar({ categoria: "", situacao: "" })} />

        <Moldura rodape={<Paginacao {...lista.paginacao} semDados={documentos === null} />}>
          {documentos === null ? (
            erro !== null ? (
              <div className="p-4"><AvisoDeErro erro={erro} aoTentar={carregar} /></div>
            ) : (
              <EsqueletoLinhas linhas={6} />
            )
          ) : documentos.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum documento ainda"
              texto="O assistente só responde com base no que estiver aqui. Comece pelo calendário acadêmico e pelos projetos de curso."
              acao={enviar}
            />
          ) : filtrados.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum documento com essa busca"
              texto="Os documentos que existem não combinam com a busca e os filtros escolhidos."
              acao={<Botao variante="secundaria" onClick={() => filtrar(SEM_FILTRO)}>Limpar busca e filtros</Botao>}
            />
          ) : (
            <table className="w-full text-left text-sm md:table-fixed">
              <thead>
                <tr>
                  <ColunaOrdenavel coluna="titulo" {...ordenavel}>Documento</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="categoria" {...ordenavel} className={cn(DA_TELA_LARGA, "w-44")}>Categoria</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="data" {...ordenavel} className={cn(DO_TABLET, "w-32")}>Data</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="situacao" {...ordenavel} className={cn(DO_TABLET, "w-40")}>Situação</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="envio" {...ordenavel} className={cn(DA_TELA_LARGA, "w-32")}>Envio</ColunaOrdenavel>
                  <th scope="col" className={cn(estiloCabecalho, "w-14")}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.visiveis.map((d) => (
                  <tr key={d.id} className="relative hover:bg-superficie-2">
                    <td className="px-4 py-2 align-top">
                      {/* O link cobre a linha inteira; o menu fica por cima. */}
                      <Link
                        to={`/painel/documentos/${d.id}`}
                        className="inline-flex min-h-11 items-center font-medium text-primaria [overflow-wrap:anywhere] after:absolute after:inset-0 hover:underline"
                      >
                        {d.titulo}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-texto-suave xl:hidden">
                        <span>{nomeCategoria(d)}</span>
                        {d.data_documento && <span className="md:hidden">· {dataCurta(d.data_documento)}</span>}
                        <span className="md:hidden"><Situacao status={d.status} /></span>
                      </div>
                      {d.substituido_por_titulo && (
                        <p className="pb-1 text-texto-suave">Substituído por “{d.substituido_por_titulo}”</p>
                      )}
                      {d.avisos.length > 0 && (
                        <p className="flex items-center gap-2 pb-1 text-texto-suave">
                          <TriangleAlert className="size-4 shrink-0" aria-hidden />
                          {d.avisos.length === 1 ? "1 ponto para conferir" : `${d.avisos.length} pontos para conferir`}
                        </p>
                      )}
                    </td>
                    <td className={cn(celula, DA_TELA_LARGA, "truncate")}>{nomeCategoria(d)}</td>
                    <td className={cn(celula, DO_TABLET, "tabular-nums")}>{dataCurta(d.data_documento)}</td>
                    <td className={cn(celula, DO_TABLET)}><Situacao status={d.status} /></td>
                    <td className={cn(celula, DA_TELA_LARGA, "tabular-nums")}>{dataCurta(d.criado_em)}</td>
                    <td className="py-2 pr-2 align-top">
                      <span className="relative z-1 flex justify-end">
                        <MenuAcoes rotulo={`Abrir ações de “${d.titulo}”`} itens={itensDoMenu(d)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Moldura>
      </div>
    </>
  );
}
