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
  criada_em: string;
};

export type ConversaDetalhe = ConversaResumo & { mensagens: MensagemApi[] };

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
  ) {
    super(mensagem);
  }
}

async function lerErro(r: Response): Promise<ErroApi> {
  let mensagem = "Algo deu errado. Tente de novo.";
  try {
    const dados = await r.json();
    if (typeof dados.detail === "string") mensagem = dados.detail;
    // Erro de validação do FastAPI vem como lista e em inglês; o formulário já valida antes.
    else if (Array.isArray(dados.detail)) mensagem = "Confira os dados informados.";
  } catch {
    // resposta sem JSON: fica a mensagem genérica
  }
  return new ErroApi(r.status, mensagem);
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
