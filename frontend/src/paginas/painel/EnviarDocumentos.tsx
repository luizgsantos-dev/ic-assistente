import { Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useBlocker, useNavigate } from "react-router";

import { useAvisar, useConfirmar } from "@/components/Janelas";
import {
  Aviso,
  AvisoDeErro,
  Botao,
  BotaoIcone,
  CabecalhoPagina,
  Campo,
  Entrada,
  estiloBotao,
  estiloLink,
  Selecao,
} from "@/components/ui";
import { enviarDocumentos, type Documento } from "@/lib/api";
import { tamanho } from "@/lib/formatos";
import { usePreferencia, useRascunho, useTitulo } from "@/lib/ganchos";
import { cn } from "@/lib/utils";
import { useContextoPainel } from "@/paginas/painel/Painel";

const EXTENSOES = [".pdf", ".docx", ".md", ".markdown", ".txt"];
const MAX_MB = 30;

const naFilaTexto = (n: number) =>
  n === 1 ? "1 documento na fila de processamento." : `${n} documentos na fila de processamento.`;

export function EnviarDocumentos() {
  useTitulo("Enviar documentos");
  const { categorias } = useContextoPainel();
  const navegar = useNavigate();
  const avisar = useAvisar();
  const confirmar = useConfirmar();

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [categoria, setCategoria] = usePreferencia("categoria-envio", "geral");
  const { valor: dados, setValor, descartar } = useRascunho("envio", { data: "", titulo: "" });
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroArquivos, setErroArquivos] = useState("");
  const [erro, setErro] = useState<unknown>(null);
  const [repetidos, setRepetidos] = useState<{ documentos: Documento[]; novos: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Arquivos escolhidos não dá para guardar como rascunho: avisa antes de sair da página.
  const sairLiberado = useRef(false);
  const temArquivos = arquivos.length > 0;
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      temArquivos && !sairLiberado.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (bloqueio.state !== "blocked") return;
    confirmar({
      titulo: arquivos.length === 1 ? `Sair sem enviar “${arquivos[0].name}”?` : `Sair sem enviar ${arquivos.length} arquivos?`,
      texto: "Os arquivos escolhidos não ficam guardados. A data e o título, sim.",
      acao: "Sair sem enviar",
    }).then((sim) => (sim ? bloqueio.proceed() : bloqueio.reset()));
    // Só reage à mudança de estado do bloqueio.
  }, [bloqueio.state]);

  useEffect(() => {
    if (!temArquivos) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [temArquivos]);

  function adicionar(lista: FileList | null) {
    if (!lista?.length) return;
    const recusados: string[] = [];
    const aceitos: File[] = [];
    for (const f of lista) {
      if (!EXTENSOES.some((ext) => f.name.toLowerCase().endsWith(ext))) recusados.push(`${f.name} (formato)`);
      else if (f.size > MAX_MB * 1024 * 1024) recusados.push(`${f.name} (mais de ${MAX_MB} MB)`);
      else if (!arquivos.some((a) => a.name === f.name)) aceitos.push(f);
    }
    setArquivos([...arquivos, ...aceitos]);
    setErroArquivos(
      recusados.length ? `Ficou de fora: ${recusados.join(", ")}. Use PDF, DOCX, Markdown ou TXT de até ${MAX_MB} MB.` : "",
    );
    setRepetidos(null);
    // Permite escolher o mesmo arquivo de novo depois de tirá-lo da lista.
    if (entrada.current) entrada.current.value = "";
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    adicionar(e.dataTransfer.files);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!temArquivos) {
      setErroArquivos("Escolha pelo menos um arquivo para enviar.");
      entrada.current?.focus();
      return;
    }
    setErro(null);
    setErroArquivos("");
    setEnviando(true);
    try {
      const docs = await enviarDocumentos(arquivos, {
        categoria,
        data_documento: dados.data,
        titulo: arquivos.length === 1 ? dados.titulo : "",
      });
      const jaExistiam = docs.filter((d) => d.ja_existia);
      const novos = docs.length - jaExistiam.length;
      descartar();
      setArquivos([]);
      if (jaExistiam.length) {
        // Fica na página para dizer quais já estavam lá.
        setRepetidos({ documentos: jaExistiam, novos });
      } else {
        avisar(naFilaTexto(novos));
        sairLiberado.current = true;
        navegar("/painel/documentos");
      }
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-formulario">
      <nav aria-label="Trilha" className="flex items-center gap-2 text-sm text-texto-suave">
        <Link to="/painel/documentos" className={estiloLink}>Documentos</Link>
        <span aria-hidden>›</span>
        <span aria-current="page">Enviar documentos</span>
      </nav>
      <CabecalhoPagina
        titulo="Enviar documentos"
        texto="O assistente lê os arquivos em segundo plano e passa a usá-los quando ficam prontos."
      />

      <form onSubmit={enviar} noValidate className="mt-6 space-y-3">
        {repetidos && (
          <Aviso
            tipo="info"
            acoes={<Link to="/painel/documentos" className={estiloBotao({ variante: "secundaria" })}>Ver documentos</Link>}
          >
            {repetidos.novos > 0 && <p>{naFilaTexto(repetidos.novos)}</p>}
            <p>
              Já {repetidos.documentos.length === 1 ? "estava cadastrado" : "estavam cadastrados"}, sem mudança:{" "}
              {repetidos.documentos.map((d) => `“${d.titulo}”`).join(", ")}.
            </p>
          </Aviso>
        )}
        {erro !== null && <AvisoDeErro erro={erro} />}

        <div className="space-y-1">
          <span id="rotulo-arquivos" className="block text-sm font-medium">Arquivos</span>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco",
              arrastando
                ? "border-foco bg-destaque"
                : erroArquivos && !temArquivos
                  ? "border-perigo bg-superficie"
                  : "border-borda-campo bg-superficie hover:bg-superficie-2",
            )}
          >
            <Upload className="size-6 text-texto-suave" aria-hidden />
            <span className="text-base font-medium">Escolha os arquivos ou arraste para cá</span>
            <span className="text-sm text-texto-suave">PDF, DOCX, Markdown ou TXT, até {MAX_MB} MB cada</span>
            <input
              ref={entrada}
              type="file"
              multiple
              accept={EXTENSOES.join(",")}
              aria-labelledby="rotulo-arquivos"
              aria-describedby="apoio-arquivos"
              aria-invalid={erroArquivos && !temArquivos ? true : undefined}
              className="sr-only"
              onChange={(e) => adicionar(e.target.files)}
            />
          </label>
          <p id="apoio-arquivos" role="alert" className="min-h-[1.5em] text-sm text-perigo [overflow-wrap:anywhere]">
            {erroArquivos}
          </p>
        </div>

        {temArquivos && (
          <ul aria-label="Arquivos escolhidos" className="divide-y divide-borda rounded-xl border border-borda bg-superficie">
            {arquivos.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-2 py-1 pr-1 pl-4 text-sm">
                <span className="min-w-0 truncate">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-texto-suave">
                  {tamanho(a.size)}
                  <BotaoIcone
                    rotulo={`Tirar ${a.name}`}
                    onClick={() => {
                      setArquivos(arquivos.filter((b) => b !== a));
                      entrada.current?.focus();
                    }}
                  >
                    <X />
                  </BotaoIcone>
                </span>
              </li>
            ))}
          </ul>
        )}

        <Campo rotulo="Categoria" id="envio-categoria" className={temArquivos ? "pt-4" : undefined}>
          {(a) => (
            <Selecao {...a} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {Object.entries(categorias).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Data do documento"
          id="envio-data"
          opcional
          dica="De publicação ou vigência. Se dois documentos se contradizem, vale o mais novo."
        >
          {(a) => (
            <Entrada {...a} type="date" value={dados.data} onChange={(e) => setValor({ ...dados, data: e.target.value })} />
          )}
        </Campo>
        {arquivos.length < 2 && (
          <Campo rotulo="Título" id="envio-titulo" opcional dica="Em branco, fica o nome do arquivo.">
            {(a) => (
              <Entrada {...a} maxLength={200} value={dados.titulo} onChange={(e) => setValor({ ...dados, titulo: e.target.value })} />
            )}
          </Campo>
        )}

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-borda bg-fundo px-4 py-4">
          <Link to="/painel/documentos" className={estiloBotao({ variante: "secundaria" })}>Cancelar</Link>
          <Botao type="submit" ocupado={enviando}>
            <Upload className="size-4" aria-hidden />
            {arquivos.length > 1 ? `Enviar ${arquivos.length} arquivos` : "Enviar documento"}
          </Botao>
        </div>
      </form>
    </div>
  );
}
