import {
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  Eye,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Dialogo } from "@/components/Dialogo";
import { Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import {
  api,
  enviarDocumentos,
  ErroApi,
  type Documento,
  type TrechoDocumento,
} from "@/lib/api";
import { dataCurta, tamanho } from "@/lib/formatos";
import { cn } from "@/lib/utils";

const EXTENSOES = [".pdf", ".docx", ".md", ".markdown", ".txt"];

function mensagemDeErro(e: unknown) {
  return e instanceof ErroApi ? e.message : "Não foi possível falar com o servidor.";
}

export function Documentos({ categorias }: { categorias: Record<string, string> }) {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState({ texto: "", categoria: "", status: "" });
  const [editando, setEditando] = useState<Documento | null>(null);
  const [vendoTrechos, setVendoTrechos] = useState<Documento | null>(null);

  const carregar = useCallback(() => {
    api<Documento[]>("/painel/documentos")
      .then((d) => {
        setDocumentos(d);
        setErro("");
      })
      .catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  useEffect(carregar, [carregar]);

  // Enquanto algum documento estiver na fila, a lista se atualiza sozinha.
  const emAndamento = documentos?.some((d) => d.status === "pendente" || d.status === "processando");
  useEffect(() => {
    if (!emAndamento) return;
    const intervalo = setInterval(carregar, 3000);
    return () => clearInterval(intervalo);
  }, [emAndamento, carregar]);

  async function reprocessar(doc: Documento) {
    try {
      await api(`/painel/documentos/${doc.id}/reprocessar`, { metodo: "POST" });
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function apagar(doc: Documento) {
    if (!window.confirm(`Apagar "${doc.titulo}"? O assistente deixa de usar este documento.`)) return;
    try {
      await api(`/painel/documentos/${doc.id}`, { metodo: "DELETE" });
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  const texto = filtro.texto.trim().toLowerCase();
  const visiveis = (documentos ?? []).filter(
    (d) =>
      (!texto || d.titulo.toLowerCase().includes(texto) || d.arquivo.toLowerCase().includes(texto)) &&
      (!filtro.categoria || d.categoria === filtro.categoria) &&
      (!filtro.status || d.status === filtro.status),
  );

  return (
    <div className="space-y-6">
      <EnvioDocumentos categorias={categorias} aoEnviar={carregar} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="mr-auto font-semibold">
            Documentos{documentos && <span className="font-normal text-texto-suave"> ({documentos.length})</span>}
          </h2>
          <Entrada
            aria-label="Buscar documento"
            placeholder="Buscar pelo título…"
            className="w-56"
            value={filtro.texto}
            onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
          />
          <Selecao
            aria-label="Filtrar por categoria"
            className="w-48"
            value={filtro.categoria}
            onChange={(e) => setFiltro((f) => ({ ...f, categoria: e.target.value }))}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(categorias).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Selecao>
          <Selecao
            aria-label="Filtrar por situação"
            className="w-40"
            value={filtro.status}
            onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todas as situações</option>
            <option value="pronto">Prontos</option>
            <option value="pendente">Na fila</option>
            <option value="processando">Processando</option>
            <option value="erro">Com erro</option>
          </Selecao>
        </div>

        {erro && <Aviso>{erro}</Aviso>}

        {documentos === null ? (
          <p className="text-sm text-texto-suave">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="rounded-xl border border-dashed border-borda px-4 py-8 text-center text-sm text-texto-suave">
            {documentos.length === 0 ? "Nenhum documento enviado ainda." : "Nenhum documento com esses filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda text-xs text-texto-suave">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Documento</th>
                  <th className="px-3 py-2.5 font-medium">Categoria</th>
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Situação</th>
                  <th className="px-3 py-2.5 text-right font-medium">Trechos</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {visiveis.map((d) => (
                  <LinhaDocumento
                    key={d.id}
                    documento={d}
                    categoria={categorias[d.categoria] ?? d.categoria}
                    aoEditar={() => setEditando(d)}
                    aoVerTrechos={() => setVendoTrechos(d)}
                    aoReprocessar={() => reprocessar(d)}
                    aoApagar={() => apagar(d)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialogo aberto={editando !== null} titulo="Editar documento" aoFechar={() => setEditando(null)}>
        {editando && (
          <EdicaoDocumento
            documento={editando}
            outros={(documentos ?? []).filter((d) => d.id !== editando.id)}
            categorias={categorias}
            aoSalvar={() => {
              setEditando(null);
              carregar();
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        aberto={vendoTrechos !== null}
        titulo={vendoTrechos ? `Trechos de "${vendoTrechos.titulo}"` : ""}
        aoFechar={() => setVendoTrechos(null)}
        largo
      >
        {vendoTrechos && <TrechosDocumento documento={vendoTrechos} />}
      </Dialogo>
    </div>
  );
}

function LinhaDocumento({
  documento: d,
  categoria,
  aoEditar,
  aoVerTrechos,
  aoReprocessar,
  aoApagar,
}: {
  documento: Documento;
  categoria: string;
  aoEditar: () => void;
  aoVerTrechos: () => void;
  aoReprocessar: () => void;
  aoApagar: () => void;
}) {
  const ocupado = d.status === "pendente" || d.status === "processando";
  return (
    <tr className={cn("align-top", d.substituido_por_id && "opacity-60")}>
      <td className="max-w-md px-3 py-2.5">
        <p className="font-medium">{d.titulo}</p>
        <p className="text-xs text-texto-suave">
          {d.arquivo} · {tamanho(d.tamanho_bytes)}
          {d.paginas ? ` · ${d.paginas} páginas` : ""}
        </p>
        {d.substituido_por_titulo && (
          <p className="mt-1 text-xs text-texto-suave">Substituído por: {d.substituido_por_titulo}</p>
        )}
        {d.status === "erro" && d.erro && <p className="mt-1 text-xs text-perigo">{d.erro}</p>}
        {d.avisos.map((a) => (
          <p key={a} className="mt-1 flex items-start gap-1 text-xs text-texto-suave">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
            {a}
          </p>
        ))}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">{categoria}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {dataCurta(d.data_documento)}
        {d.data_origem === "metadados" && <span className="block text-xs text-texto-suave">conferir</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Situacao status={d.status} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{d.status === "pronto" ? d.trechos : "—"}</td>
      <td className="px-2 py-1.5">
        <div className="flex justify-end">
          <BotaoAcao rotulo="Editar" aoClicar={aoEditar}><Pencil /></BotaoAcao>
          <BotaoAcao rotulo="Ver trechos" aoClicar={aoVerTrechos} desabilitado={d.status !== "pronto"}><Eye /></BotaoAcao>
          <a
            href={`/api/painel/documentos/${d.id}/arquivo`}
            download
            className={estiloAcao}
            aria-label="Baixar o original"
            title="Baixar o original"
          >
            <Download />
          </a>
          <BotaoAcao rotulo="Processar de novo" aoClicar={aoReprocessar} desabilitado={ocupado}><RefreshCw /></BotaoAcao>
          <BotaoAcao rotulo="Apagar" aoClicar={aoApagar} perigo><Trash2 /></BotaoAcao>
        </div>
      </td>
    </tr>
  );
}

const estiloAcao =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-texto-suave " +
  "hover:bg-superficie-2 hover:text-texto disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

function BotaoAcao({
  rotulo,
  aoClicar,
  desabilitado,
  perigo,
  children,
}: {
  rotulo: string;
  aoClicar: () => void;
  desabilitado?: boolean;
  perigo?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-label={rotulo}
      title={rotulo}
      className={cn(estiloAcao, perigo && "hover:text-perigo")}
    >
      {children}
    </button>
  );
}

function Situacao({ status }: { status: Documento["status"] }) {
  const mapa = {
    pronto: { Icone: CircleCheck, rotulo: "Pronto", classe: "text-texto" },
    processando: { Icone: LoaderCircle, rotulo: "Processando", classe: "text-texto-suave [&_svg]:animate-spin" },
    pendente: { Icone: Clock, rotulo: "Na fila", classe: "text-texto-suave" },
    erro: { Icone: CircleAlert, rotulo: "Erro", classe: "text-perigo" },
  } as const;
  const { Icone, rotulo, classe } = mapa[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5", classe)}>
      <Icone className="size-4" aria-hidden />
      {rotulo}
    </span>
  );
}

function EnvioDocumentos({
  categorias,
  aoEnviar,
}: {
  categorias: Record<string, string>;
  aoEnviar: () => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [categoria, setCategoria] = useState("geral");
  const [data, setData] = useState("");
  const [titulo, setTitulo] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const todos = [...lista];
    const aceitos = todos.filter((f) => EXTENSOES.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setArquivos((atuais) => [...atuais, ...aceitos.filter((a) => !atuais.some((b) => b.name === a.name))]);
    setResultado(
      aceitos.length < todos.length
        ? { tipo: "erro", texto: `${todos.length - aceitos.length} arquivo(s) ignorado(s): use PDF, DOCX, Markdown ou TXT.` }
        : null,
    );
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    adicionar(e.dataTransfer.files);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!arquivos.length) return;
    setEnviando(true);
    setResultado(null);
    try {
      const docs = await enviarDocumentos(arquivos, {
        categoria,
        data_documento: data,
        titulo: arquivos.length === 1 ? titulo : "",
      });
      const repetidos = docs.filter((d) => d.ja_existia).length;
      const novos = docs.length - repetidos;
      setResultado({
        tipo: "sucesso",
        texto:
          (novos ? `${novos} documento(s) na fila de processamento.` : "") +
          (repetidos ? ` ${repetidos} já estava(m) cadastrado(s) e não foi(ram) enviado(s) de novo.` : ""),
      });
      setArquivos([]);
      setTitulo("");
      if (entrada.current) entrada.current.value = "";
      aoEnviar();
    } catch (e) {
      setResultado({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-xl border border-borda bg-superficie p-4">
      <h2 className="mb-3 font-semibold">Enviar documentos</h2>
      <form onSubmit={enviar} className="space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltar}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center",
            arrastando ? "border-foco bg-destaque" : "border-borda hover:bg-superficie-2",
          )}
        >
          <Upload className="size-5 text-texto-suave" aria-hidden />
          <span className="text-sm font-medium">Arraste os arquivos aqui ou clique para escolher</span>
          <span className="text-xs text-texto-suave">PDF, DOCX, Markdown ou TXT, até 30 MB cada</span>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={EXTENSOES.join(",")}
            className="sr-only"
            onChange={(e) => adicionar(e.target.files)}
          />
        </label>

        {arquivos.length > 0 && (
          <ul className="space-y-1">
            {arquivos.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-1.5 text-sm">
                <span className="truncate">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-texto-suave">
                  {tamanho(a.size)}
                  <button
                    type="button"
                    onClick={() => setArquivos((atuais) => atuais.filter((b) => b !== a))}
                    aria-label={`Tirar ${a.name}`}
                    className="cursor-pointer rounded p-0.5 hover:text-texto"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Categoria" id="categoria">
            <Selecao id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {Object.entries(categorias).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Data do documento" id="data" dica="Publicação ou vigência. O mais novo vale em caso de conflito.">
            <Entrada id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Título (opcional)" id="titulo" dica={arquivos.length > 1 ? "Só para um arquivo por vez." : "Se vazio, usa o nome do arquivo."}>
            <Entrada id="titulo" value={titulo} disabled={arquivos.length > 1} onChange={(e) => setTitulo(e.target.value)} />
          </Campo>
        </div>

        {resultado && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}

        <Botao type="submit" disabled={!arquivos.length || enviando}>
          <Upload className="size-4" aria-hidden />
          {enviando ? "Enviando…" : arquivos.length > 1 ? `Enviar ${arquivos.length} arquivos` : "Enviar"}
        </Botao>
      </form>
    </section>
  );
}

function EdicaoDocumento({
  documento,
  outros,
  categorias,
  aoSalvar,
}: {
  documento: Documento;
  outros: Documento[];
  categorias: Record<string, string>;
  aoSalvar: () => void;
}) {
  const [titulo, setTitulo] = useState(documento.titulo);
  const [categoria, setCategoria] = useState(documento.categoria);
  const [data, setData] = useState(documento.data_documento ?? "");
  const [substituto, setSubstituto] = useState(documento.substituido_por_id?.toString() ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    // Só vai o que mudou: mandar a mesma data de novo apagaria o aviso "tirada dos metadados".
    const mudancas: Record<string, unknown> = {};
    if (titulo.trim() !== documento.titulo) mudancas.titulo = titulo.trim();
    if (categoria !== documento.categoria) mudancas.categoria = categoria;
    if (data !== (documento.data_documento ?? "")) mudancas.data_documento = data || null;
    if (substituto !== (documento.substituido_por_id?.toString() ?? ""))
      mudancas.substituido_por_id = substituto ? Number(substituto) : null;
    if (Object.keys(mudancas).length === 0) return aoSalvar();

    setSalvando(true);
    setErro("");
    try {
      await api(`/painel/documentos/${documento.id}`, { metodo: "PATCH", corpo: mudancas });
      aoSalvar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="Título" id="ed-titulo">
        <Entrada id="ed-titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo rotulo="Categoria" id="ed-categoria">
        <Selecao id="ed-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {Object.entries(categorias).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>{rotulo}</option>
          ))}
        </Selecao>
      </Campo>
      <Campo
        rotulo="Data do documento"
        id="ed-data"
        dica={documento.data_origem === "metadados" ? "Esta data veio dos metadados do arquivo. Confira." : undefined}
      >
        <Entrada id="ed-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Campo
        rotulo="Substituído por"
        id="ed-substituto"
        dica="Quando um documento mais novo vale no lugar deste, este sai das respostas."
      >
        <Selecao id="ed-substituto" value={substituto} onChange={(e) => setSubstituto(e.target.value)}>
          <option value="">Nenhum (continua valendo)</option>
          {[...outros]
            .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
                {d.data_documento ? ` (${dataCurta(d.data_documento)})` : ""}
              </option>
            ))}
        </Selecao>
      </Campo>
      <div className="flex justify-end gap-2">
        <Botao type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Botao>
      </div>
    </form>
  );
}

function TrechosDocumento({ documento }: { documento: Documento }) {
  const [trechos, setTrechos] = useState<TrechoDocumento[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<TrechoDocumento[]>(`/painel/documentos/${documento.id}/trechos`)
      .then(setTrechos)
      .catch((e) => setErro(mensagemDeErro(e)));
  }, [documento.id]);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!trechos) return <p className="text-sm text-texto-suave">Carregando…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-suave">
        É isto que o assistente consegue ler deste documento. Se algo estiver faltando ou embaralhado
        (comum em PDF escaneado ou com tabelas), corrija o arquivo e envie de novo.
      </p>
      <ol className="space-y-3">
        {trechos.map((t) => (
          <li key={t.id} className="rounded-lg border border-borda p-3">
            <p className="mb-1 text-xs text-texto-suave">
              Trecho {t.ordem + 1}
              {t.pagina_inicio != null &&
                ` · p. ${t.pagina_inicio}${t.pagina_fim && t.pagina_fim !== t.pagina_inicio ? `–${t.pagina_fim}` : ""}`}
              {t.secao && ` · ${t.secao}`}
            </p>
            <p className="text-sm whitespace-pre-wrap">{t.conteudo}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
