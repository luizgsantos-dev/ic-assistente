export type Usuario = {
  id: number;
  nome: string;
  email: string;
  vinculo: string;
  curso: string | null;
  papel: string;
  /** null = sem limite (secretaria) */
  perguntas_restantes: number | null;
  limite_diario: number;
};

export type Config = {
  cursos: string[];
  vinculos: Record<string, string>;
  categorias: Record<string, string>;
  limite_diario: number;
  contato: string;
};

export type Citacao = {
  documento_id: number;
  titulo: string;
  paginas: string | null;
  texto_citado: string;
};

export type ConversaResumo = { id: number; titulo: string; atualizada_em: string };

export type MensagemApi = {
  id: number;
  papel: "usuario" | "assistente";
  conteudo: string;
  fundamentada: boolean | null;
  motivo: string | null;
  citacoes: Citacao[] | null;
  avaliacao: number | null;
  criada_em: string;
};

export type ConversaDetalhe = ConversaResumo & { mensagens: MensagemApi[] };

// --- painel da secretaria ---

export type Documento = {
  id: number;
  titulo: string;
  arquivo: string;
  categoria: string;
  data_documento: string | null;
  data_origem: "informada" | "metadados" | null;
  status: "pendente" | "processando" | "pronto" | "erro";
  erro: string | null;
  avisos: string[];
  paginas: number | null;
  trechos: number;
  transcrito_por_ia: boolean;
  substituido_por_id: number | null;
  substituido_por_titulo: string | null;
  tamanho_bytes: number | null;
  enviado_por: string | null;
  criado_em: string;
  ja_existia: boolean;
};

export type TrechoDocumento = {
  id: number;
  ordem: number;
  pagina_inicio: number | null;
  pagina_fim: number | null;
  secao: string | null;
  conteudo: string;
};

export type Pendencia = {
  mensagem_id: number;
  pergunta: string | null;
  resposta: string;
  motivo: string | null;
  avaliacao: number | null;
  criada_em: string;
};

export type UsoDia = {
  dia: string;
  perguntas: number;
  sem_resposta: number;
  positivas: number;
  negativas: number;
};

export type Uso = {
  dias: UsoDia[];
  perguntas: number;
  sem_resposta: number;
  positivas: number;
  negativas: number;
  erros: number;
  custo_estimado_usd: number;
  usuarios_total: number;
  usuarios_ativos: number;
  documentos_prontos: number;
};

export type UsuarioAdmin = {
  id: number;
  nome: string;
  email: string;
  vinculo: string;
  curso: string | null;
  papel: string;
  ativo: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
};

/** Envio de arquivos (multipart). O cabeçalho X-Requested-With é exigido pela API contra CSRF. */
export async function enviarDocumentos(
  arquivos: File[],
  campos: { categoria: string; data_documento: string; titulo: string },
): Promise<Documento[]> {
  const dados = new FormData();
  for (const arquivo of arquivos) dados.append("arquivos", arquivo);
  dados.append("categoria", campos.categoria);
  if (campos.data_documento) dados.append("data_documento", campos.data_documento);
  if (campos.titulo.trim()) dados.append("titulo", campos.titulo.trim());
  const r = await fetch("/api/painel/documentos", {
    method: "POST",
    headers: { "X-Requested-With": "fetch" },
    body: dados,
  });
  if (!r.ok) throw await lerErro(r);
  return r.json();
}

/** Baixa um arquivo da API. Se falhar, dá erro aqui em vez de abrir uma página de erro crua. */
export async function baixar(caminho: string, nome: string) {
  const r = await fetch(`/api${caminho}`);
  if (!r.ok) throw await lerErro(r);
  const endereco = URL.createObjectURL(await r.blob());
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

export type EventoChat =
  | { tipo: "inicio"; conversa_id: number; titulo: string; mensagem_id: number }
  | { tipo: "texto"; t: string }
  | {
      tipo: "fim";
      mensagem_id: number;
      texto: string;
      fundamentada: boolean;
      motivo: string;
      citacoes: Citacao[];
      perguntas_restantes: number | null;
    }
  | { tipo: "erro"; mensagem: string; perguntas_restantes: number | null };

export class ErroApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
    public rota = "",
  ) {
    super(mensagem);
  }
}

async function lerErro(r: Response): Promise<ErroApi> {
  const rota = new URL(r.url, window.location.origin).pathname;
  let mensagem = "Algo deu errado do nosso lado. Tente de novo em instantes.";
  // Falha do servidor (5xx) nunca mostra o texto técnico que veio dele.
  if (r.status < 500) {
    try {
      const dados = await r.json();
      if (typeof dados.detail === "string") mensagem = dados.detail;
      // Erro de validação do FastAPI vem como lista e em inglês; o formulário já valida antes.
      else if (Array.isArray(dados.detail)) mensagem = "Confira os campos e tente de novo.";
    } catch {
      // resposta sem JSON: fica a mensagem genérica
    }
  }
  return new ErroApi(r.status, mensagem, rota);
}

/** Texto para a pessoa: o que aconteceu e o que fazer. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApi) return e.message;
  return "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";
}

/** Falha que a pessoa não resolve sozinha: vale oferecer os detalhes para o suporte. */
export function erroTecnico(e: unknown): boolean {
  return !(e instanceof ErroApi) || e.status >= 500;
}

/** Detalhes para o suporte, sem nada do conteúdo digitado. */
export function detalhesDoErro(e: unknown): string {
  return JSON.stringify(
    {
      codigo: e instanceof ErroApi ? e.status : "FALHA_DE_REDE",
      rota: e instanceof ErroApi ? e.rota : undefined,
      pagina: window.location.pathname,
      momento: new Date().toISOString(),
    },
    null,
    2,
  );
}

export async function api<T>(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST" | "PATCH" | "DELETE"; corpo?: unknown } = {},
): Promise<T> {
  const metodo = opcoes.metodo ?? "GET";
  const comCorpo = metodo === "POST" || metodo === "PATCH";
  const r = await fetch(`/api${caminho}`, {
    method: metodo,
    // A API só aceita JSON em POST/PATCH (proteção contra CSRF), mesmo sem dados.
    headers: comCorpo ? { "Content-Type": "application/json" } : undefined,
    body: comCorpo ? JSON.stringify(opcoes.corpo ?? {}) : undefined,
  });
  if (!r.ok) throw await lerErro(r);
  // Respostas 204 vêm sem corpo (mas com content-type JSON), então não dá para chamar r.json().
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Envia a pergunta e chama `aoEvento` a cada evento do streaming (server-sent events). */
export async function enviarPergunta(
  pergunta: string,
  conversaId: number | null,
  aoEvento: (evento: EventoChat) => void,
  sinal?: AbortSignal,
) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta, conversa_id: conversaId }),
    signal: sinal,
  });
  if (!r.ok || !r.body) throw await lerErro(r);

  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendente = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    pendente += value;
    let fim: number;
    while ((fim = pendente.indexOf("\n\n")) >= 0) {
      const bloco = pendente.slice(0, fim);
      pendente = pendente.slice(fim + 2);
      let nome = "";
      let dados = "";
      for (const linha of bloco.split("\n")) {
        if (linha.startsWith("event: ")) nome = linha.slice(7);
        else if (linha.startsWith("data: ")) dados += linha.slice(6);
      }
      if (nome) aoEvento({ tipo: nome, ...JSON.parse(dados) } as EventoChat);
    }
  }
}

let configCache: Promise<Config> | null = null;

export function carregarConfig() {
  configCache ??= api<Config>("/config").catch((e) => {
    configCache = null;
    throw e;
  });
  return configCache;
}
