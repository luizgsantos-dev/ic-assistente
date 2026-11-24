import { Download, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Gaveta, useAvisar } from "@/components/Janelas";
import { naFila, Situacao, useAcoesDocumento, useDocumentos } from "@/components/painel/documentosComum";
import { MenuAcoes, type ItemMenu } from "@/components/Suspenso";
import { Moldura, Paginacao, usePaginas } from "@/components/tabela";
import {
  Aviso,
  AvisoDeErro,
  Botao,
  CabecalhoPagina,
  Campo,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
  estiloBotao,
  estiloLink,
  Selecao,
} from "@/components/ui";
import { api, type Documento as DadosDocumento, type TrechoDocumento } from "@/lib/api";
import { dataCurta, dataHora, numero, tamanho } from "@/lib/formatos";
import { useRascunho, useTitulo, useValidacao } from "@/lib/ganchos";
import { useContextoPainel } from "@/paginas/painel/Painel";

export function Documento() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { categorias } = useContextoPainel();
  const { documentos, erro, carregar } = useDocumentos();
  const [erroAcao, setErroAcao] = useState<unknown>(null);
  const [editando, setEditando] = useState(false);
  const acoes = useAcoesDocumento(setErroAcao);

  const doc = documentos?.find((d) => d.id === Number(id));
  useTitulo(doc?.titulo ?? "Documento");

  if (documentos === null) {
    return erro !== null ? <AvisoDeErro erro={erro} aoTentar={carregar} /> : <EsqueletoLinhas linhas={5} />;
  }
  if (!doc) {
    return (
      <EstadoVazio
        titulo="Documento não encontrado"
        texto="Ele pode ter sido apagado."
        acao={<Link to="/painel/documentos" className={estiloBotao()}>Ver documentos</Link>}
      />
    );
  }

  const reprocessar = async () => {
    if (await acoes.reprocessar(doc)) carregar();
  };

  const itensDoMenu: ItemMenu[] = [
    { rotulo: "Baixar original", Icone: Download, aoEscolher: () => acoes.baixarOriginal(doc) },
  ];
  if (!naFila(doc)) itensDoMenu.push({ rotulo: "Processar de novo", Icone: RefreshCw, aoEscolher: reprocessar });
  itensDoMenu.push({
    rotulo: "Apagar documento",
    Icone: Trash2,
    perigo: true,
    aoEscolher: async () => {
      if (await acoes.apagar(doc)) navegar("/painel/documentos", { replace: true });
    },
  });

  return (
    <>
      <div>
        <nav aria-label="Trilha" className="flex items-center gap-2 text-sm text-texto-suave">
          <Link to="/painel/documentos" className={estiloLink}>Documentos</Link>
          <span aria-hidden>›</span>
          <span aria-current="page" className="min-w-0 truncate">{doc.titulo}</span>
        </nav>
        <CabecalhoPagina
          titulo={doc.titulo}
          texto={
            <p className="flex flex-wrap items-center gap-x-2">
              <Situacao status={doc.status} />
              <span>· {categorias[doc.categoria] ?? doc.categoria}</span>
              <span>· {doc.data_documento ? `de ${dataCurta(doc.data_documento)}` : "sem data"}</span>
            </p>
          }
          acoes={
            <>
              <Botao onClick={() => setEditando(true)}>
                <Pencil className="size-4" aria-hidden />
                Editar dados
              </Botao>
              <MenuAcoes rotulo="Abrir mais ações" itens={itensDoMenu} />
            </>
          }
        />
      </div>

      {erroAcao !== null && <AvisoDeErro erro={erroAcao} />}
      {erro !== null && <AvisoDeErro erro={erro} aoTentar={carregar} />}
      {doc.status === "erro" && (
        <Aviso acoes={<Botao variante="secundaria" onClick={reprocessar}>Processar de novo</Botao>}>
          O assistente não conseguiu ler este documento{doc.erro ? `: ${doc.erro}` : ""}.
        </Aviso>
      )}
      {doc.avisos.length > 0 && (
        <Aviso tipo="info">
          <p className="font-medium">Para conferir</p>
          <ul>
            {doc.avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Aviso>
      )}

      <dl className="grid gap-x-8 gap-y-4 rounded-xl border border-borda bg-superficie p-4 text-sm shadow-suave md:grid-cols-4">
        <Dado rotulo="Arquivo">{doc.arquivo} ({tamanho(doc.tamanho_bytes)})</Dado>
        <Dado rotulo="Páginas">
          {doc.paginas ? numero(doc.paginas) : "—"}
          {doc.transcrito_por_ia && " (texto transcrito por IA)"}
        </Dado>
        <Dado rotulo="Envio">
          {dataHora(doc.criado_em)}
          {doc.enviado_por && `, por ${doc.enviado_por}`}
        </Dado>
        <Dado rotulo="Validade">
          {doc.substituido_por_id ? (
            <>
              Substituído por{" "}
              <Link to={`/painel/documentos/${doc.substituido_por_id}`} className={estiloLink}>
                {doc.substituido_por_titulo}
              </Link>
            </>
          ) : (
            "Em uso nas respostas"
          )}
        </Dado>
      </dl>

      {doc.status === "pronto" && <Trechos key={doc.id} documento={doc} />}

      <Gaveta aberta={editando} titulo="Editar dados do documento" aoFechar={() => setEditando(false)}>
        <Edicao
          documento={doc}
          outros={documentos.filter((d) => d.id !== doc.id)}
          categorias={categorias}
          aoSalvar={() => {
            setEditando(false);
            carregar();
          }}
        />
      </Gaveta>
    </>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className="mt-1 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Trechos({ documento }: { documento: DadosDocumento }) {
  const [trechos, setTrechos] = useState<TrechoDocumento[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const { visiveis, paginacao } = usePaginas(trechos ?? []);

  const carregar = useCallback(() => {
    setErro(null);
    api<TrechoDocumento[]>(`/painel/documentos/${documento.id}/trechos`).then(setTrechos).catch(setErro);
  }, [documento.id]);

  useEffect(carregar, [carregar]);

  return (
    <section aria-labelledby="titulo-trechos" className="space-y-4">
      <div>
        <h2 id="titulo-trechos" className="text-lg font-semibold">O que o assistente lê</h2>
        <p className="mt-1 max-w-leitura text-sm text-texto-suave">
          Se algo estiver faltando ou embaralhado (comum em PDF escaneado ou com tabelas), corrija o
          arquivo e envie de novo.
        </p>
      </div>
      <Moldura rodape={<Paginacao {...paginacao} semDados={trechos === null} />}>
        {erro !== null ? (
          <div className="p-4"><AvisoDeErro erro={erro} aoTentar={carregar} /></div>
        ) : trechos === null ? (
          <EsqueletoLinhas linhas={3} className="h-24" />
        ) : (
          <ol className="divide-y divide-borda">
            {visiveis.map((t) => (
              <li key={t.id} className="p-4">
                <p className="text-sm text-texto-suave">
                  Trecho {t.ordem + 1}
                  {t.pagina_inicio != null &&
                    ` · p. ${t.pagina_inicio}${t.pagina_fim && t.pagina_fim !== t.pagina_inicio ? `–${t.pagina_fim}` : ""}`}
                  {t.secao && ` · ${t.secao}`}
                </p>
                <p className="mt-1 max-w-leitura whitespace-pre-wrap [overflow-wrap:anywhere]">{t.conteudo}</p>
              </li>
            ))}
          </ol>
        )}
      </Moldura>
    </section>
  );
}

function Edicao({
  documento,
  outros,
  categorias,
  aoSalvar,
}: {
  documento: DadosDocumento;
  outros: DadosDocumento[];
  categorias: Record<string, string>;
  aoSalvar: () => void;
}) {
  const avisar = useAvisar();
  const original = {
    titulo: documento.titulo,
    categoria: documento.categoria,
    data_documento: documento.data_documento ?? "",
    substituido_por_id: documento.substituido_por_id?.toString() ?? "",
  };
  // Fechar a gaveta sem querer não perde o que foi digitado.
  const { valor: dados, setValor, restaurado, descartar } = useRascunho(`documento-${documento.id}`, original);
  const [erro, setErro] = useState<unknown>(null);
  const [salvando, setSalvando] = useState(false);
  const { campo, validarTudo } = useValidacao("edicao", dados, {
    titulo: (v) => (v.trim() ? null : "Escreva um título para o documento."),
  });
  const alterar = (mudanca: Partial<typeof dados>) => setValor({ ...dados, ...mudanca });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !validarTudo()) return;
    // Só vai o que mudou: mandar a mesma data de novo apagaria o aviso "tirada dos metadados".
    const mudancas: Record<string, unknown> = {};
    if (dados.titulo.trim() !== original.titulo) mudancas.titulo = dados.titulo.trim();
    if (dados.categoria !== original.categoria) mudancas.categoria = dados.categoria;
    if (dados.data_documento !== original.data_documento) mudancas.data_documento = dados.data_documento || null;
    if (dados.substituido_por_id !== original.substituido_por_id)
      mudancas.substituido_por_id = dados.substituido_por_id ? Number(dados.substituido_por_id) : null;

    setErro(null);
    setSalvando(true);
    try {
      if (Object.keys(mudancas).length) {
        await api(`/painel/documentos/${documento.id}`, { metodo: "PATCH", corpo: mudancas });
        avisar("Alterações salvas.");
      }
      descartar();
      aoSalvar();
    } catch (e) {
      setErro(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="space-y-3">
      {restaurado && (
        <Aviso tipo="info" acoes={<Botao variante="fantasma" onClick={descartar}>Descartar rascunho</Botao>}>
          Recuperamos alterações que não tinham sido salvas.
        </Aviso>
      )}
      {erro !== null && <AvisoDeErro erro={erro} />}
      <Campo rotulo="Título" {...campo("titulo")}>
        {(a) => (
          <Entrada {...a} maxLength={200} value={dados.titulo} onChange={(e) => alterar({ titulo: e.target.value })} />
        )}
      </Campo>
      <Campo rotulo="Categoria" {...campo("categoria")}>
        {(a) => (
          <Selecao {...a} value={dados.categoria} onChange={(e) => alterar({ categoria: e.target.value })}>
            {Object.entries(categorias).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo
        rotulo="Data do documento"
        opcional
        dica={
          documento.data_origem === "metadados"
            ? "Esta data veio do arquivo. Confira antes de salvar."
            : "Se dois documentos se contradizem, vale o mais novo."
        }
        {...campo("data_documento")}
      >
        {(a) => (
          <Entrada {...a} type="date" value={dados.data_documento}
            onChange={(e) => alterar({ data_documento: e.target.value })} />
        )}
      </Campo>
      <Campo rotulo="Substituído por" opcional dica="Um documento substituído sai das respostas." {...campo("substituido_por_id")}>
        {(a) => (
          <Selecao {...a} value={dados.substituido_por_id}
            onChange={(e) => alterar({ substituido_por_id: e.target.value })}>
            <option value="">Nenhum (continua valendo)</option>
            {[...outros]
              .sort((x, y) => x.titulo.localeCompare(y.titulo, "pt-BR"))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titulo}
                  {d.data_documento ? ` (${dataCurta(d.data_documento)})` : ""}
                </option>
              ))}
          </Selecao>
        )}
      </Campo>
      <Botao type="submit" className="w-full" ocupado={salvando}>Salvar alterações</Botao>
    </form>
  );
}
