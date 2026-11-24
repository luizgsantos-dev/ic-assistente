import { ArrowDown, Menu } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router";

import { BarraLateral } from "@/components/chat/BarraLateral";
import { CaixaPergunta } from "@/components/chat/CaixaPergunta";
import { Mensagem, type MensagemTela } from "@/components/chat/Mensagem";
import { useAvisar, useConfirmar } from "@/components/Janelas";
import { Aviso, AvisoDeErro, Botao, BotaoIcone, EsqueletoLinhas, EstadoVazio } from "@/components/ui";
import {
  api,
  carregarConfig,
  enviarPergunta,
  ErroApi,
  mensagemDeErro,
  type Config,
  type ConversaDetalhe,
  type ConversaResumo,
  type MensagemApi,
} from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";
import { useTelaEstreita, useTitulo } from "@/lib/ganchos";
import { primeiroNome } from "@/lib/utils";

const SUGESTOES = [
  "Quando acaba o semestre?",
  "Qual vai ser a matéria de verão?",
  "O que é a semana acadêmica?",
];

/** Quem desce até esta distância do fim (px) volta a acompanhar a resposta. */
const NO_FIM = 8;
/** A partir desta distância aparece o "Ir para o fim". */
const LONGE_DO_FIM = 80;

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
  const confirmar = useConfirmar();
  const avisar = useAvisar();
  const estreita = useTelaEstreita();

  const [config, setConfig] = useState<Config | null>(null);
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [erroConversas, setErroConversas] = useState<unknown>(null);
  const [mensagens, setMensagens] = useState<MensagemTela[]>([]);
  const [erroConversa, setErroConversa] = useState<unknown>(null);
  const [erroAcao, setErroAcao] = useState<unknown>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [menuAberto, setMenuAberto] = useState(false);
  const [longeDoFim, setLongeDoFim] = useState(false);
  /** Lido por leitor de tela quando a resposta começa e termina. */
  const [anuncio, setAnuncio] = useState("");

  // Conversa que acabou de ser criada pelo envio em andamento: ao trocar a URL para ela,
  // as mensagens já estão na tela e não precisam ser buscadas.
  const recemCriada = useRef<number | null>(null);
  const envioAtual = useRef<AbortController | null>(null);
  const areaMensagens = useRef<HTMLDivElement>(null);
  const botaoMenu = useRef<HTMLDivElement>(null);
  const campoPergunta = useRef<HTMLTextAreaElement>(null);
  /** Acompanhando a resposta que chega; qualquer movimento para cima solta. */
  const colado = useRef(true);
  const ultimoTopo = useRef(0);

  const recarregarConversas = useCallback(() => {
    api<ConversaResumo[]>("/conversas")
      .then((c) => {
        setConversas(c);
        setErroConversas(null);
      })
      .catch(setErroConversas);
  }, []);

  useEffect(() => {
    recarregarConversas();
    // Sem a configuração só o nome do vínculo fica abreviado.
    carregarConfig().then(setConfig).catch(() => undefined);
  }, [recarregarConversas]);

  useEffect(() => {
    if (conversaId !== null && recemCriada.current === conversaId) {
      recemCriada.current = null;
      return;
    }
    envioAtual.current?.abort();
    setErroConversa(null);
    setErroAcao(null);
    colado.current = true;
    ultimoTopo.current = 0;
    setLongeDoFim(false);
    if (conversaId === null) {
      setMensagens([]);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    api<ConversaDetalhe>(`/conversas/${conversaId}`)
      .then((c) => !cancelado && setMensagens(c.mensagens.map(paraTela)))
      .catch((e) => {
        if (cancelado) return;
        setMensagens([]);
        setErroConversa(e);
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [conversaId, tentativa]);

  // Acompanha a resposta, a menos que a pessoa tenha subido para ler algo. Antes da pintura, para o
  // texto novo não aparecer por um quadro fora do lugar.
  useLayoutEffect(() => {
    // O pedaço novo pode chegar antes do evento de rolagem: confere aqui também se ela subiu.
    observarRolagem();
    if (colado.current) irParaOFim();
  }, [mensagens, carregando]);

  function irParaOFim() {
    const el = areaMensagens.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    ultimoTopo.current = el.scrollTop;
    colado.current = true;
    setLongeDoFim(false);
  }

  function observarRolagem() {
    const el = areaMensagens.current;
    if (!el) return;
    const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (el.scrollTop < ultimoTopo.current - 1 && distancia > 1) colado.current = false;
    else if (el.scrollTop > ultimoTopo.current && distancia < NO_FIM) colado.current = true;
    ultimoTopo.current = el.scrollTop;
    setLongeDoFim(!colado.current && distancia >= LONGE_DO_FIM);
  }

  const fecharMenu = useCallback(() => {
    // Na hora: enquanto a gaveta está aberta o resto da tela não aceita foco.
    flushSync(() => setMenuAberto(false));
    botaoMenu.current?.querySelector("button")?.focus();
  }, []);

  async function enviar(pergunta: string) {
    const chaveResposta = crypto.randomUUID();
    colado.current = true;
    setErroAcao(null);
    setAnuncio("Procurando nos documentos do IC.");
    setMensagens((ms) => [
      ...ms,
      { chave: crypto.randomUUID(), papel: "usuario", conteudo: pergunta, estado: "pronta" },
      { chave: chaveResposta, papel: "assistente", conteudo: "", estado: "escrevendo" },
    ]);
    const atualizar = (f: (m: MensagemTela) => MensagemTela) =>
      setMensagens((ms) => ms.map((m) => (m.chave === chaveResposta ? f(m) : m)));
    const falhar = (texto: string) => atualizar((m) => ({ ...m, conteudo: texto, estado: "erro" }));

    const controle = new AbortController();
    envioAtual.current = controle;
    setRespondendo(true);
    let terminou = false;
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
              terminou = true;
              atualizar((m) => ({
                ...m,
                id: evento.mensagem_id,
                conteudo: evento.texto,
                citacoes: evento.citacoes,
                avaliacao: null,
                estado: "pronta",
              }));
              atualizarRestantes(evento.perguntas_restantes);
              setAnuncio("Resposta pronta.");
              break;
            case "erro":
              terminou = true;
              falhar(evento.mensagem);
              atualizarRestantes(evento.perguntas_restantes);
              setAnuncio("");
              break;
          }
        },
        controle.signal,
      );
      // A conexão caiu no meio: sem isto a resposta ficaria "escrevendo" para sempre.
      if (!terminou && !controle.signal.aborted) {
        falhar("A resposta parou no meio. Tente de novo.");
        setAnuncio("");
      }
    } catch (e) {
      if (controle.signal.aborted) return;
      if (e instanceof ErroApi && e.status === 401) {
        definirUsuario(null);
        return;
      }
      falhar(mensagemDeErro(e));
      setAnuncio("");
    } finally {
      if (envioAtual.current === controle) {
        envioAtual.current = null;
        setRespondendo(false);
      }
      recarregarConversas();
    }
  }

  /** Tira da tela a pergunta que falhou e manda de novo. */
  function tentarDeNovo() {
    const pergunta = mensagens.filter((m) => m.papel === "usuario").at(-1)?.conteudo;
    if (!pergunta) return;
    setMensagens((ms) => ms.slice(0, -2));
    enviar(pergunta);
  }

  async function avaliar(mensagem: MensagemTela, valor: 1 | -1 | 0) {
    const definir = (avaliacao: number | null | undefined) =>
      setMensagens((ms) => ms.map((m) => (m.chave === mensagem.chave ? { ...m, avaliacao } : m)));
    // Atualiza na hora e volta atrás se o servidor recusar.
    definir(valor || null);
    setErroAcao(null);
    try {
      await api(`/mensagens/${mensagem.id}/avaliacao`, { metodo: "POST", corpo: { valor } });
    } catch (e) {
      definir(mensagem.avaliacao);
      setErroAcao(e);
    }
  }

  async function apagar(conversa: ConversaResumo) {
    const sim = await confirmar({
      titulo: `Apagar conversa “${conversa.titulo}”?`,
      texto: "As perguntas e respostas dela somem de vez. Não dá para desfazer.",
      acao: "Apagar conversa",
    });
    if (!sim) return;
    setErroAcao(null);
    try {
      await api(`/conversas/${conversa.id}`, { metodo: "DELETE" });
    } catch (e) {
      setErroAcao(e);
      if (estreita) fecharMenu();
      return;
    }
    setConversas((cs) => cs?.filter((c) => c.id !== conversa.id) ?? null);
    if (conversa.id === conversaId) navegar("/");
    avisar("Conversa apagada.");
    // O botão que estava com o foco sumiu junto com a linha.
    document.getElementById("iniciar-conversa")?.focus();
  }

  async function sairDaConta() {
    setErroAcao(null);
    try {
      await sair();
    } catch (e) {
      setErroAcao(e);
      if (estreita) fecharMenu();
    }
  }

  const titulo = conversas?.find((c) => c.id === conversaId)?.titulo;
  useTitulo(titulo ?? "");

  if (!usuario) return null;

  const restantes = usuario.perguntas_restantes;
  const semPerguntas = restantes === 0;
  const vinculo = config?.vinculos[usuario.vinculo] ?? usuario.vinculo;
  const ultima = mensagens.at(-1);

  return (
    <div className="flex h-dvh">
      <BarraLateral
        usuario={usuario}
        vinculo={vinculo}
        conversas={conversas}
        erro={erroConversas}
        conversaAtual={conversaId}
        aberta={menuAberto}
        aoFechar={fecharMenu}
        aoIniciar={() => {
          flushSync(() => setMenuAberto(false));
          navegar("/");
          campoPergunta.current?.focus();
        }}
        aoApagar={apagar}
        aoRecarregar={recarregarConversas}
        aoSair={sairDaConta}
      />

      <main
        id="conteudo"
        tabIndex={-1}
        inert={estreita && menuAberto}
        className="flex min-w-0 flex-1 flex-col"
      >
        {/* No computador o cabeçalho só existe para leitor de tela: a barra lateral já situa. */}
        <header className="flex min-h-14 items-center gap-2 border-b border-borda px-2 md:sr-only">
          <div ref={botaoMenu} className="md:hidden">
            <BotaoIcone rotulo="Abrir conversas" aria-expanded={menuAberto} onClick={() => setMenuAberto(true)}>
              <Menu />
            </BotaoIcone>
          </div>
          <h1 className="truncate text-base leading-tight font-semibold">{titulo ?? (conversaId === null ? "Nova conversa" : "Conversa")}</h1>
        </header>

        {/* Sem o ajuste automático do navegador, que pareceria a pessoa descendo. */}
        <div
          ref={areaMensagens}
          onScroll={observarRolagem}
          className="relative flex-1 overflow-y-auto [overflow-anchor:none]"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {erroConversa ? (
              erroConversa instanceof ErroApi && erroConversa.status === 404 ? (
                <EstadoVazio
                  titulo="Conversa não encontrada"
                  texto="Ela pode ter sido apagada ou ser de outra conta."
                  acao={<Botao onClick={() => navegar("/")}>Iniciar conversa</Botao>}
                />
              ) : (
                <AvisoDeErro erro={erroConversa} aoTentar={() => setTentativa((t) => t + 1)} />
              )
            ) : carregando ? (
              <EsqueletoLinhas linhas={3} className="h-20" />
            ) : mensagens.length === 0 ? (
              <BoasVindas nome={primeiroNome(usuario.nome)} aoEscolher={semPerguntas ? undefined : enviar} />
            ) : (
              <div className="space-y-6">
                {mensagens.map((m) => (
                  <Mensagem
                    key={m.chave}
                    mensagem={m}
                    aoAvaliar={avaliar}
                    aoTentarDeNovo={m === ultima && !respondendo && !semPerguntas ? tentarDeNovo : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-3xl space-y-2 px-4 pt-2 pb-4">
          {longeDoFim && (
            <div className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center">
              <Botao
                variante="secundaria"
                className="pointer-events-auto shadow-flutuante"
                onClick={() => {
                  irParaOFim();
                  campoPergunta.current?.focus();
                }}
              >
                <ArrowDown className="size-4" aria-hidden />
                Ir para o fim
              </Botao>
            </div>
          )}
          {erroAcao !== null && <AvisoDeErro erro={erroAcao} />}
          {semPerguntas && (
            <Aviso tipo="info">As {usuario.limite_diario} perguntas de hoje foram usadas. O limite recomeça amanhã.</Aviso>
          )}
          {/* Sem a conversa na tela, a pergunta iria para um lugar que não dá para ver. */}
          {!erroConversa && (
            <>
              <CaixaPergunta
                ref={campoPergunta}
                espera={
                  respondendo
                    ? "Espere a resposta terminar para enviar outra pergunta."
                    : carregando
                      ? "Espere a conversa abrir para enviar a pergunta."
                      : undefined
                }
                semPerguntas={semPerguntas}
                aoEnviar={enviar}
              />
              <p className="text-center text-xs text-texto-suave">
                Respostas baseadas nos documentos oficiais do IC
                {restantes !== null &&
                  ` · ${restantes} ${restantes === 1 ? "pergunta restante" : "perguntas restantes"} hoje`}
              </p>
            </>
          )}
        </div>
        <p role="status" className="sr-only">{anuncio}</p>
      </main>
    </div>
  );
}

function BoasVindas({ nome, aoEscolher }: { nome: string; aoEscolher?: (pergunta: string) => void }) {
  return (
    <div className="pt-[10vh] text-center">
      <h2 className="text-2xl font-semibold">Olá, {nome}! Como posso ajudar?</h2>
      <p className="mx-auto mt-2 max-w-md text-base text-texto-suave">
        Respondo com base nos documentos oficiais do Instituto de Computação: calendário,
        cursos, regulamentos, processos e eventos.
      </p>
      {aoEscolher && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SUGESTOES.map((s) => (
            <Botao key={s} variante="secundaria" onClick={() => aoEscolher(s)}>{s}</Botao>
          ))}
        </div>
      )}
    </div>
  );
}
