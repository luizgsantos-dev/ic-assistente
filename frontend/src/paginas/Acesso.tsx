import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Aviso, AvisoDeErro, Botao, Campo, Entrada, EntradaSenha, estiloBotao, estiloLink, Selecao } from "@/components/ui";
import { api, carregarConfig, ErroApi, type Config, type Usuario } from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";
import { REGRA_EMAIL, REGRA_SENHA_NOVA, SENHA_MINIMA, useRascunho, useTitulo, useValidacao } from "@/lib/ganchos";
import { cn } from "@/lib/utils";

const VINCULOS_PADRAO = {
  aluno: "Aluno",
  docente: "Docente",
  tecnico: "Técnico administrativo",
  outro: "Outro",
};

function Cartao({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape: ReactNode }) {
  useTitulo(titulo);
  return (
    <main id="conteudo" tabIndex={-1} className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primaria text-base font-semibold text-primaria-texto"
          >
            IC
          </div>
          <p className="text-sm text-texto-suave">IC-Assistant · Instituto de Computação · UFMT</p>
        </div>
        <div className="rounded-xl border border-borda bg-superficie p-6 shadow-suave">
          <h1 className="mb-4 text-xl font-semibold">{titulo}</h1>
          {children}
        </div>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-sm text-texto-suave">{rodape}</p>
      </div>
    </main>
  );
}

const VoltarAoLogin = () => <Link to="/entrar" className={estiloLink}>Voltar para o login</Link>;

export function Entrar() {
  const { definirUsuario } = useAutenticacao();
  const navegar = useNavigate();
  const [dados, setDados] = useState({ email: "", senha: "" });
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const { campo, validarTudo } = useValidacao("entrar", dados, {
    email: REGRA_EMAIL,
    senha: (v) => (v ? null : "Escreva a senha da conta."),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !validarTudo()) return;
    setErro(null);
    setEnviando(true);
    try {
      definirUsuario(await api<Usuario>("/auth/login", { metodo: "POST", corpo: dados }));
      navegar("/", { replace: true });
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao
      titulo="Entrar"
      rodape={<>Ainda não tem conta? <Link to="/cadastro" className={estiloLink}>Criar conta</Link></>}
    >
      <form onSubmit={enviar} noValidate className="space-y-3">
        {erro !== null && <AvisoDeErro erro={erro} />}
        <Campo rotulo="E-mail" {...campo("email")}>
          {(a) => (
            <Entrada {...a} type="email" autoComplete="username" inputMode="email" value={dados.email}
              onChange={(e) => setDados({ ...dados, email: e.target.value })} />
          )}
        </Campo>
        <Campo rotulo="Senha" {...campo("senha")}>
          {(a) => (
            <EntradaSenha {...a} autoComplete="current-password" value={dados.senha}
              onChange={(e) => setDados({ ...dados, senha: e.target.value })} />
          )}
        </Campo>
        <Botao type="submit" className="w-full" ocupado={enviando}>Entrar</Botao>
        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className={estiloLink}>Recuperar senha</Link>
        </p>
      </form>
    </Cartao>
  );
}

export function Cadastro() {
  const { definirUsuario } = useAutenticacao();
  const navegar = useNavigate();
  const [config, setConfig] = useState<Config | null>(null);
  // O rascunho guarda tudo, menos a senha.
  const rascunho = useRascunho("cadastro", { nome: "", email: "", vinculo: "aluno", curso: "" });
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const dados = { ...rascunho.valor, senha };
  const ehAluno = dados.vinculo === "aluno";
  const { campo, validarTudo } = useValidacao("cadastro", dados, {
    nome: (v) => (v.trim().length >= 2 ? null : "Escreva seu nome."),
    email: REGRA_EMAIL,
    senha: REGRA_SENHA_NOVA,
    curso: (v) => (!ehAluno || v.trim() ? null : "Escolha ou escreva o curso."),
  });

  useEffect(() => {
    // Sem a configuração o formulário continua funcionando, só sem a lista de cursos.
    carregarConfig().then(setConfig).catch(() => undefined);
  }, []);

  const alterar = (mudanca: Partial<typeof rascunho.valor>) => rascunho.setValor({ ...rascunho.valor, ...mudanca });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !validarTudo()) return;
    setErro(null);
    setEnviando(true);
    try {
      const corpo = { ...dados, curso: dados.curso.trim() || null };
      const usuario = await api<Usuario>("/auth/cadastro", { metodo: "POST", corpo });
      rascunho.descartar();
      definirUsuario(usuario);
      navegar("/", { replace: true });
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  const emailRepetido = erro instanceof ErroApi && erro.status === 409;

  return (
    <Cartao
      titulo="Criar conta"
      rodape={<>Já tem conta? <Link to="/entrar" className={estiloLink}>Entrar</Link></>}
    >
      <form onSubmit={enviar} noValidate className="space-y-3">
        {rascunho.restaurado && (
          <Aviso tipo="info" acoes={<Botao variante="fantasma" onClick={rascunho.descartar}>Descartar rascunho</Botao>}>
            Recuperamos o que estava escrito aqui.
          </Aviso>
        )}
        {emailRepetido ? (
          <Aviso acoes={<Link to="/entrar" className={estiloBotao({ variante: "secundaria" })}>Entrar com esse e-mail</Link>}>
            {erro.message}
          </Aviso>
        ) : (
          erro !== null && <AvisoDeErro erro={erro} />
        )}
        <Campo rotulo="Nome" {...campo("nome")}>
          {(a) => (
            <Entrada {...a} autoComplete="name" maxLength={120} value={dados.nome}
              onChange={(e) => alterar({ nome: e.target.value })} />
          )}
        </Campo>
        <Campo rotulo="E-mail" {...campo("email")}>
          {(a) => (
            <Entrada {...a} type="email" autoComplete="username" inputMode="email" value={dados.email}
              onChange={(e) => alterar({ email: e.target.value })} />
          )}
        </Campo>
        <Campo rotulo="Senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`} {...campo("senha")}>
          {(a) => (
            <EntradaSenha {...a} autoComplete="new-password" maxLength={128} value={senha}
              onChange={(e) => setSenha(e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Vínculo com o IC" {...campo("vinculo")}>
          {(a) => (
            <Selecao {...a} value={dados.vinculo} onChange={(e) => alterar({ vinculo: e.target.value })}>
              {Object.entries(config?.vinculos ?? VINCULOS_PADRAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Curso"
          opcional={!ehAluno}
          dica="As respostas seguem as regras do seu curso."
          {...campo("curso")}
        >
          {(a) => (
            <>
              <Entrada {...a} list="cursos" maxLength={120} value={dados.curso}
                onChange={(e) => alterar({ curso: e.target.value })} />
              <datalist id="cursos">
                {config?.cursos.map((c) => <option key={c} value={c} />)}
              </datalist>
            </>
          )}
        </Campo>
        <Botao type="submit" className="w-full" ocupado={enviando}>Criar conta</Botao>
      </form>
    </Cartao>
  );
}

export function RecuperarSenha() {
  const [dados, setDados] = useState({ email: "" });
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const { campo, validarTudo } = useValidacao("recuperar", dados, { email: REGRA_EMAIL });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !validarTudo()) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>("/auth/esqueci-senha", { metodo: "POST", corpo: dados });
      setMensagem(r.mensagem);
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Recuperar senha" rodape={<VoltarAoLogin />}>
      {mensagem ? (
        <Aviso tipo="sucesso">{mensagem}</Aviso>
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-3">
          {erro !== null && <AvisoDeErro erro={erro} />}
          <Campo rotulo="E-mail" dica="O link para criar uma senha nova chega nele." {...campo("email")}>
            {(a) => (
              <Entrada {...a} type="email" autoComplete="username" inputMode="email" value={dados.email}
                onChange={(e) => setDados({ email: e.target.value })} />
            )}
          </Campo>
          <Botao type="submit" className="w-full" ocupado={enviando}>Enviar link</Botao>
        </form>
      )}
    </Cartao>
  );
}

export function RedefinirSenha() {
  const [parametros] = useSearchParams();
  const token = parametros.get("token") ?? "";
  const [dados, setDados] = useState({ senha: "" });
  const [erro, setErro] = useState<unknown>(null);
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { campo, validarTudo } = useValidacao("redefinir", dados, { senha: REGRA_SENHA_NOVA });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !validarTudo()) return;
    setErro(null);
    setEnviando(true);
    try {
      await api("/auth/redefinir-senha", { metodo: "POST", corpo: { token, senha: dados.senha } });
      setPronto(true);
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  const pedirOutro = (
    <Link to="/esqueci-senha" className={estiloBotao({ variante: "secundaria" })}>Pedir outro link</Link>
  );
  const linkVencido = erro instanceof ErroApi && erro.status === 400;

  return (
    <Cartao titulo="Criar senha nova" rodape={<VoltarAoLogin />}>
      {!token ? (
        <Aviso acoes={pedirOutro}>O link chegou incompleto. Abra o endereço inteiro que está no e-mail ou peça outro.</Aviso>
      ) : pronto ? (
        <div className="space-y-4">
          <Aviso tipo="sucesso">Senha alterada.</Aviso>
          <Link to="/entrar" className={cn(estiloBotao(), "w-full")}>Entrar com a senha nova</Link>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-3">
          {linkVencido ? <Aviso acoes={pedirOutro}>{erro.message}</Aviso> : erro !== null && <AvisoDeErro erro={erro} />}
          <Campo rotulo="Senha nova" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`} {...campo("senha")}>
            {(a) => (
              <EntradaSenha {...a} autoComplete="new-password" maxLength={128} value={dados.senha}
                onChange={(e) => setDados({ senha: e.target.value })} />
            )}
          </Campo>
          <Botao type="submit" className="w-full" ocupado={enviando}>Salvar senha nova</Botao>
        </form>
      )}
    </Cartao>
  );
}
