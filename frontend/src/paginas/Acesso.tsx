import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { api, carregarConfig, ErroApi, type Config, type Usuario } from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";

const SENHA_MINIMA = 8;

function mensagemDeErro(e: unknown) {
  return e instanceof ErroApi ? e.message : "Não foi possível falar com o servidor.";
}

function Moldura({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primaria text-base font-bold text-primaria-texto">
            IC
          </div>
          <p className="text-sm text-texto-suave">IC-Assistant · Instituto de Computação · UFMT</p>
        </div>
        <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm">
          <h1 className="mb-5 text-xl font-semibold">{titulo}</h1>
          {children}
        </div>
        {rodape && <div className="mt-4 text-center text-sm text-texto-suave">{rodape}</div>}
      </div>
    </main>
  );
}

const estiloLink = "font-medium text-primaria hover:underline";

export function Entrar() {
  const { definirUsuario } = useAutenticacao();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      definirUsuario(await api<Usuario>("/auth/login", { metodo: "POST", corpo: { email, senha } }));
      navegar("/", { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura
      titulo="Entrar"
      rodape={
        <>
          Ainda não tem conta? <Link to="/cadastro" className={estiloLink}>Criar conta</Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="E-mail" id="email">
          <Entrada id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" id="senha">
          <Entrada id="senha" type="password" autoComplete="current-password" required value={senha}
            onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Botao type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>
        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className={estiloLink}>Esqueci minha senha</Link>
        </p>
      </form>
    </Moldura>
  );
}

export function Cadastro() {
  const { definirUsuario } = useAutenticacao();
  const navegar = useNavigate();
  const [config, setConfig] = useState<Config | null>(null);
  const [dados, setDados] = useState({ nome: "", email: "", senha: "", vinculo: "aluno", curso: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    carregarConfig().then(setConfig).catch(() => undefined);
  }, []);

  const alterar = (campo: keyof typeof dados) => (valor: string) =>
    setDados((d) => ({ ...d, [campo]: valor }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (dados.senha.length < SENHA_MINIMA) {
      setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    setEnviando(true);
    try {
      const corpo = { ...dados, curso: dados.curso.trim() || null };
      definirUsuario(await api<Usuario>("/auth/cadastro", { metodo: "POST", corpo }));
      navegar("/", { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const vinculos = config?.vinculos ?? {
    aluno: "Aluno",
    docente: "Docente",
    tecnico: "Técnico administrativo",
    outro: "Outro",
  };
  const ehAluno = dados.vinculo === "aluno";

  return (
    <Moldura
      titulo="Criar conta"
      rodape={
        <>
          Já tem conta? <Link to="/entrar" className={estiloLink}>Entrar</Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nome" id="nome">
          <Entrada id="nome" autoComplete="name" required minLength={2} value={dados.nome}
            onChange={(e) => alterar("nome")(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail" id="email">
          <Entrada id="email" type="email" autoComplete="email" required value={dados.email}
            onChange={(e) => alterar("email")(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" id="senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
          <Entrada id="senha" type="password" autoComplete="new-password" required value={dados.senha}
            onChange={(e) => alterar("senha")(e.target.value)} />
        </Campo>
        <Campo rotulo="Você é" id="vinculo">
          <Selecao id="vinculo" value={dados.vinculo} onChange={(e) => alterar("vinculo")(e.target.value)}>
            {Object.entries(vinculos).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          rotulo={ehAluno ? "Curso" : "Curso (opcional)"}
          id="curso"
          dica="Ajuda o assistente a responder com as regras do seu curso."
        >
          <Entrada id="curso" list="cursos" required={ehAluno} value={dados.curso}
            onChange={(e) => alterar("curso")(e.target.value)} />
          <datalist id="cursos">
            {config?.cursos.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Campo>
        <Botao type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Criando conta…" : "Criar conta"}
        </Botao>
      </form>
    </Moldura>
  );
}

export function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>("/auth/esqueci-senha", { metodo: "POST", corpo: { email } });
      setMensagem(r.mensagem);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Esqueci minha senha" rodape={<Link to="/entrar" className={estiloLink}>Voltar para o login</Link>}>
      {mensagem ? (
        <Aviso tipo="sucesso">{mensagem}</Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {erro && <Aviso>{erro}</Aviso>}
          <p className="text-sm text-texto-suave">
            Informe o e-mail da sua conta. Enviaremos um link para criar uma senha nova.
          </p>
          <Campo rotulo="E-mail" id="email">
            <Entrada id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Botao type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar link"}
          </Botao>
        </form>
      )}
    </Moldura>
  );
}

export function RedefinirSenha() {
  const [parametros] = useSearchParams();
  const token = parametros.get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (senha !== confirmacao) return setErro("As senhas não são iguais.");
    setEnviando(true);
    try {
      await api("/auth/redefinir-senha", { metodo: "POST", corpo: { token, senha } });
      setPronto(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Criar senha nova" rodape={<Link to="/entrar" className={estiloLink}>Voltar para o login</Link>}>
      {!token ? (
        <Aviso>Link incompleto. Abra o link exatamente como chegou no e-mail.</Aviso>
      ) : pronto ? (
        <Aviso tipo="sucesso">
          Senha alterada. <Link to="/entrar" className={estiloLink}>Entre com a senha nova</Link>.
        </Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="Senha nova" id="senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
            <Entrada id="senha" type="password" autoComplete="new-password" required value={senha}
              onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Campo rotulo="Repita a senha" id="confirmacao">
            <Entrada id="confirmacao" type="password" autoComplete="new-password" required value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} />
          </Campo>
          <Botao type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar senha"}
          </Botao>
        </form>
      )}
    </Moldura>
  );
}
