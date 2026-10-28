import { Menu } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { BarraLateral } from "@/components/chat/BarraLateral";
import { CaixaPergunta } from "@/components/chat/CaixaPergunta";
import { Mensagem, type MensagemTela } from "@/components/chat/Mensagem";
import { Botao } from "@/components/ui";
import {
  api,
  carregarConfig,
  enviarPergunta,
  ErroApi,
  type Config,
  type ConversaDetalhe,
  type ConversaResumo,
  type MensagemApi,
} from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";
import { primeiroNome } from "@/lib/utils";

const SUGESTOES = [
  "Quando acaba o semestre?",
  "Qual vai ser a matéria de verão?",
  "O que é a semana acadêmica?",
];

function paraTela(m: MensagemApi): MensagemTela {
  return {
    chave: String(m.id),
    id: m.id,
    papel: m.papel,
    conteudo: m.conteudo,
    citacoes: m.citacoes ?? undefined,
    avaliacao: m.avaliacao,
    estado: m.motivo === "erro" ? "erro" : "pronta",
  };
}

export function Chat() {
  const { usuario, sair, atualizarRestantes, definirUsuario } = useAutenticacao();
  const { id } = useParams();
  const conversaId = id ? Number(id) : null;
  const navegar = useNavigate();

  const [config, setConfig] = useState<Config | null>(null);
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [mensagens, setMensagens] = useState<MensagemTela[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  // Conversa que acabou de ser criada pelo envio em andamento: ao trocar a URL para ela,
  // as mensagens já estão na tela e não precisam ser buscadas.
  const recemCriada = useRef<number | null>(null);
  const envioAtual = useRef<AbortController | null>(null);
  const areaMensagens = useRef<HTMLDivElement>(null);

  const recarregarConversas = useCallback(() => {
    api<ConversaResumo[]>("/conversas").then(setConversas).catch(() => undefined);
  }, []);

  useEffect(() => {
    recarregarConversas();
    carregarConfig().then(setConfig).catch(() => undefined);
  }, [recarregarConversas]);

  useEffect(() => {
    if (conversaId !== null && recemCriada.current === conversaId) {
      recemCriada.current = null;
      return;
    }
    envioAtual.current?.abort();
    if (conversaId === null) {
      setMensagens([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    api<ConversaDetalhe>(`/conversas/${conversaId}`)
      .then((c) => !cancelado && setMensagens(c.mensagens.map(paraTela)))
      .catch(() => !cancelado && navegar("/", { replace: true }))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [conversaId, navegar]);

  // Desce até a última mensagem enquanto a resposta chega.
  useEffect(() => {
    const el = areaMensagens.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens]);

  async function enviar(pergunta: string) {
    const chaveResposta = crypto.randomUUID();
    setMensagens((ms) => [
      ...ms,
      { chave: crypto.randomUUID(), papel: "usuario", conteudo: pergunta, estado: "pronta" },
      { chave: chaveResposta, papel: "assistente", conteudo: "", estado: "escrevendo" },
    ]);
    const atualizar = (f: (m: MensagemTela) => MensagemTela) =>
      setMensagens((ms) => ms.map((m) => (m.chave === chaveResposta ? f(m) : m)));

    const controle = new AbortController();
    envioAtual.current = controle;
    setEnviando(true);
    try {
      await enviarPergunta(
        pergunta,
        conversaId,
        (evento) => {
          switch (evento.tipo) {
            case "inicio":
              if (conversaId === null) {
                recemCriada.current = evento.conversa_id;
                navegar(`/c/${evento.conversa_id}`, { replace: true });
              }
              break;
            case "texto":
              atualizar((m) => ({ ...m, conteudo: m.conteudo + evento.t }));
              break;
            case "fim":
              atualizar((m) => ({
                ...m,
                id: evento.mensagem_id,
                conteudo: evento.texto,
                citacoes: evento.citacoes,
                avaliacao: null,
                estado: "pronta",
              }));
              atualizarRestantes(evento.perguntas_restantes);
              break;
            case "erro":
              atualizar((m) => ({ ...m, conteudo: evento.mensagem, estado: "erro" }));
              atualizarRestantes(evento.perguntas_restantes);
              break;
          }
        },
        controle.signal,
      );
    } catch (e) {
      if (controle.signal.aborted) return;
      if (e instanceof ErroApi && e.status === 401) {
        definirUsuario(null);
        return;
      }
      const texto = e instanceof ErroApi ? e.message : "Não foi possível falar com o servidor. Verifique sua conexão.";
      atualizar((m) => ({ ...m, conteudo: texto, estado: "erro" }));
    } finally {
      if (envioAtual.current === controle) {
        envioAtual.current = null;
        setEnviando(false);
      }
      recarregarConversas();
    }
  }

  async function avaliar(mensagem: MensagemTela, valor: 1 | -1 | 0) {
    const definir = (avaliacao: number | null | undefined) =>
      setMensagens((ms) => ms.map((m) => (m.chave === mensagem.chave ? { ...m, avaliacao } : m)));
    // Atualiza na hora e volta atrás se o servidor recusar.
    definir(valor || null);
    try {
      await api(`/mensagens/${mensagem.id}/avaliacao`, { metodo: "POST", corpo: { valor } });
    } catch {
      definir(mensagem.avaliacao);
    }
  }

  async function apagar(idApagar: number) {
    if (!window.confirm("Apagar esta conversa? Não dá para desfazer.")) return;
    await api(`/conversas/${idApagar}`, { metodo: "DELETE" }).catch(() => undefined);
    setConversas((cs) => cs.filter((c) => c.id !== idApagar));
    if (idApagar === conversaId) navegar("/");
  }

  if (!usuario) return null;

  const restantes = usuario.perguntas_restantes;
  const titulo = conversas.find((c) => c.id === conversaId)?.titulo;
  const vinculo = config?.vinculos[usuario.vinculo] ?? usuario.vinculo;

  return (
    <div className="flex h-full">
      <BarraLateral
        usuario={usuario}
        vinculo={vinculo}
        conversas={conversas}
        conversaAtual={conversaId}
        aberta={menuAberto}
        aoFechar={() => setMenuAberto(false)}
        aoNovaConversa={() => {
          setMenuAberto(false);
          navegar("/");
        }}
        aoApagar={apagar}
        aoSair={sair}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-borda px-3 md:hidden">
          <Botao variante="fantasma" tamanho="icone" onClick={() => setMenuAberto(true)} aria-label="Abrir conversas">
            <Menu className="size-5" />
          </Botao>
          <p className="truncate text-sm font-medium">{titulo ?? "IC-Assistant"}</p>
        </header>

        <div ref={areaMensagens} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {carregando ? (
              <p className="text-sm text-texto-suave">Carregando conversa…</p>
            ) : mensagens.length === 0 ? (
              <BoasVindas nome={primeiroNome(usuario.nome)} aoEscolher={enviar} bloqueado={restantes === 0} />
            ) : (
              <div className="space-y-6">
                {mensagens.map((m) => (
                  <Mensagem key={m.chave} mensagem={m} aoAvaliar={avaliar} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <CaixaPergunta
            desabilitada={enviando}
            motivoBloqueio={restantes === 0 ? "Você usou todas as perguntas de hoje. Volte amanhã." : undefined}
            aoEnviar={enviar}
          />
          <p className="mt-2 text-center text-xs text-texto-suave">
            Respostas baseadas nos documentos oficiais do IC
            {restantes !== null && ` · ${restantes} ${restantes === 1 ? "pergunta restante" : "perguntas restantes"} hoje`}
          </p>
        </div>
      </main>
    </div>
  );
}

function BoasVindas({
  nome,
  aoEscolher,
  bloqueado,
}: {
  nome: string;
  aoEscolher: (pergunta: string) => void;
  bloqueado: boolean;
}) {
  return (
    <div className="pt-[12vh] text-center">
      <h1 className="text-2xl font-semibold">Olá, {nome}! Como posso ajudar?</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-texto-suave">
        Respondo com base nos documentos oficiais do Instituto de Computação: calendário,
        cursos, regulamentos, processos e eventos.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {SUGESTOES.map((s) => (
          <Botao key={s} variante="secundaria" tamanho="pequeno" disabled={bloqueado} onClick={() => aoEscolher(s)}>
            {s}
          </Botao>
        ))}
      </div>
    </div>
  );
}
