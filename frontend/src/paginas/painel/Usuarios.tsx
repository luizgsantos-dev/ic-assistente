import { Copy, KeyRound, Shield, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Gaveta, useAvisar, useConfirmar } from "@/components/Janelas";
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
import { AvisoDeErro, Botao, CabecalhoPagina, Entrada, EsqueletoLinhas, EstadoVazio } from "@/components/ui";
import { api, type UsuarioAdmin } from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";
import { dataHora } from "@/lib/formatos";
import { useAtalhoBusca, useTitulo } from "@/lib/ganchos";
import { cn } from "@/lib/utils";
import { useContextoPainel } from "@/paginas/painel/Painel";

type Coluna = "nome" | "vinculo" | "acesso" | "situacao" | "ultimo";

const ACESSOS = { admin: "Secretaria", usuario: "Usuário" };
const SITUACOES = { ativa: "Ativa", desativada: "Desativada" };
const SEM_FILTRO = { acesso: "", situacao: "" };

/** A API devolve no máximo isto; para achar o resto, só buscando. */
const LIMITE_API = 200;

const acessoDe = (u: UsuarioAdmin) => (u.papel === "admin" ? ACESSOS.admin : ACESSOS.usuario);
const situacaoDe = (u: UsuarioAdmin) => (u.ativo ? SITUACOES.ativa : SITUACOES.desativada);

const celula = "px-4 py-3";
// Do celular ao tablet só cabem algumas colunas; o resto desce para baixo do nome.
const DO_TABLET = "hidden md:table-cell";
const DA_TELA_LARGA = "hidden xl:table-cell";

export function Usuarios() {
  useTitulo("Usuários");
  const { vinculos } = useContextoPainel();
  const { usuario: eu } = useAutenticacao();
  const confirmar = useConfirmar();
  const avisar = useAvisar();
  const campoBusca = useAtalhoBusca();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState(SEM_FILTRO);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [erroAcao, setErroAcao] = useState<unknown>(null);
  const [tentativa, setTentativa] = useState(0);
  const [link, setLink] = useState<{ nome: string; link: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Espera a pessoa parar de digitar antes de buscar.
    const espera = setTimeout(() => {
      const q = busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : "";
      api<UsuarioAdmin[]>(`/painel/usuarios${q}`)
        .then((u) => {
          if (cancelado) return;
          setUsuarios(u);
          setErro(null);
        })
        .catch((e) => !cancelado && setErro(e));
    }, busca ? 300 : 0);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [busca, tentativa]);

  const filtrados = useMemo(
    () =>
      (usuarios ?? []).filter(
        (u) =>
          (!filtro.acesso || (u.papel === "admin" ? "admin" : "usuario") === filtro.acesso) &&
          (!filtro.situacao || (u.ativo ? "ativa" : "desativada") === filtro.situacao),
      ),
    [usuarios, filtro],
  );

  const nomeVinculo = useCallback((u: UsuarioAdmin) => vinculos[u.vinculo] ?? u.vinculo, [vinculos]);

  const valorDe = useCallback(
    (u: UsuarioAdmin, coluna: Coluna) =>
      ({
        nome: u.nome,
        vinculo: nomeVinculo(u),
        acesso: acessoDe(u),
        situacao: situacaoDe(u),
        ultimo: u.ultimo_acesso ?? "",
      })[coluna],
    [nomeVinculo],
  );

  const lista = useLista<UsuarioAdmin, Coluna>("usuarios", filtrados, valorDe, { coluna: "nome", crescente: true });

  function filtrar(mudanca: Partial<typeof SEM_FILTRO>) {
    setFiltro({ ...filtro, ...mudanca });
    lista.voltarAoInicio();
  }

  function buscar(texto: string) {
    setBusca(texto);
    lista.voltarAoInicio();
  }

  async function alterar(
    u: UsuarioAdmin,
    mudanca: Partial<Pick<UsuarioAdmin, "papel" | "ativo">>,
    pedido: { titulo: string; texto: string; acao: string; perigo: boolean },
    recado: string,
  ) {
    if (!(await confirmar(pedido))) return;
    setErroAcao(null);
    try {
      const atualizado = await api<UsuarioAdmin>(`/painel/usuarios/${u.id}`, { metodo: "PATCH", corpo: mudanca });
      setUsuarios((l) => l?.map((x) => (x.id === u.id ? atualizado : x)) ?? null);
      avisar(recado);
    } catch (e) {
      setErroAcao(e);
    }
  }

  async function gerarLink(u: UsuarioAdmin) {
    setErroAcao(null);
    try {
      const r = await api<{ link: string }>(`/painel/usuarios/${u.id}/link-senha`, { metodo: "POST" });
      setLink({ nome: u.nome, link: r.link });
    } catch (e) {
      setErroAcao(e);
    }
  }

  function itensDoMenu(u: UsuarioAdmin): ItemMenu[] {
    return [
      { rotulo: "Gerar link para nova senha", Icone: KeyRound, aoEscolher: () => gerarLink(u) },
      u.papel === "admin"
        ? {
            rotulo: "Tirar acesso de secretaria",
            Icone: ShieldOff,
            perigo: true,
            aoEscolher: () =>
              alterar(u, { papel: "usuario" }, {
                titulo: `Tirar acesso de secretaria de ${u.nome}?`,
                texto: "A pessoa deixa de ver este painel e continua usando o chat.",
                acao: "Tirar acesso",
                perigo: true,
              }, "Acesso de secretaria retirado."),
          }
        : {
            rotulo: "Dar acesso de secretaria",
            Icone: Shield,
            aoEscolher: () =>
              alterar(u, { papel: "admin" }, {
                titulo: `Dar acesso de secretaria a ${u.nome}?`,
                texto: "A pessoa passa a ver este painel: documentos, pendências, uso e usuários.",
                acao: "Dar acesso",
                perigo: false,
              }, "Acesso de secretaria liberado."),
          },
      u.ativo
        ? {
            rotulo: "Desativar conta",
            Icone: UserX,
            perigo: true,
            aoEscolher: () =>
              alterar(u, { ativo: false }, {
                titulo: `Desativar conta de ${u.nome}?`,
                texto: "A pessoa sai na hora e não entra mais. Dá para reativar depois.",
                acao: "Desativar conta",
                perigo: true,
              }, "Conta desativada."),
          }
        : {
            rotulo: "Reativar conta",
            Icone: UserCheck,
            aoEscolher: () =>
              alterar(u, { ativo: true }, {
                titulo: `Reativar conta de ${u.nome}?`,
                texto: "A pessoa volta a entrar com a senha que já tinha.",
                acao: "Reativar conta",
                perigo: false,
              }, "Conta reativada."),
          },
    ];
  }

  const filtros = [
    { id: "acesso", rotulo: "Acesso", valor: filtro.acesso, opcoes: ACESSOS, aoMudar: (acesso: string) => filtrar({ acesso }) },
    { id: "situacao", rotulo: "Situação", valor: filtro.situacao, opcoes: SITUACOES, aoMudar: (situacao: string) => filtrar({ situacao }) },
  ];

  const ordenavel = { ordem: lista.ordem, aoOrdenar: lista.ordenarPor };
  const tentar = () => setTentativa((t) => t + 1);

  return (
    <>
      <CabecalhoPagina titulo="Usuários" texto="Quem tem conta no assistente e quem acessa este painel. As conversas não aparecem aqui." />

      {erroAcao !== null && <AvisoDeErro erro={erroAcao} />}
      {erro !== null && usuarios !== null && <AvisoDeErro erro={erro} aoTentar={tentar} />}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <CampoBusca
            ref={campoBusca}
            rotulo="Buscar pessoa"
            exemplo="Ex.: maria@ufmt.br"
            valor={busca}
            aoMudar={buscar}
          />
          <BotaoFiltros filtros={filtros} />
        </div>
        <FiltrosAtivos filtros={filtros} aoLimpar={() => filtrar(SEM_FILTRO)} />

        <Moldura rodape={<Paginacao {...lista.paginacao} semDados={usuarios === null} />}>
          {usuarios === null ? (
            erro !== null ? (
              <div className="p-4"><AvisoDeErro erro={erro} aoTentar={tentar} /></div>
            ) : (
              <EsqueletoLinhas linhas={6} />
            )
          ) : filtrados.length === 0 ? (
            <EstadoVazio
              titulo="Ninguém com essa busca"
              texto="Nenhuma conta combina com a busca e os filtros escolhidos."
              acao={
                <Botao
                  variante="secundaria"
                  onClick={() => {
                    buscar("");
                    setFiltro(SEM_FILTRO);
                  }}
                >
                  Limpar busca e filtros
                </Botao>
              }
            />
          ) : (
            <table className="w-full text-left text-sm md:table-fixed">
              <thead>
                <tr>
                  <ColunaOrdenavel coluna="nome" {...ordenavel}>Pessoa</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="vinculo" {...ordenavel} className={cn(DA_TELA_LARGA, "w-56")}>Vínculo</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="acesso" {...ordenavel} className={cn(DO_TABLET, "w-32")}>Acesso</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="situacao" {...ordenavel} className={cn(DO_TABLET, "w-36")}>Situação</ColunaOrdenavel>
                  <ColunaOrdenavel coluna="ultimo" {...ordenavel} className={cn(DA_TELA_LARGA, "w-48")}>Último acesso</ColunaOrdenavel>
                  <th scope="col" className={cn(estiloCabecalho, "w-14")}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.visiveis.map((u) => (
                  <tr key={u.id}>
                    <td className={cn(celula, "[overflow-wrap:anywhere]")}>
                      <p className="font-medium">
                        {u.nome}
                        {u.id === eu?.id && <span className="font-normal text-texto-suave"> (você)</span>}
                      </p>
                      <p className="text-texto-suave">{u.email}</p>
                      <p className="text-texto-suave xl:hidden">
                        {nomeVinculo(u)}
                        <span className="md:hidden"> · {acessoDe(u)} · <SituacaoConta usuario={u} /></span>
                      </p>
                    </td>
                    <td className={cn(celula, DA_TELA_LARGA)}>
                      {nomeVinculo(u)}
                      {u.curso && <span className="block text-texto-suave">{u.curso}</span>}
                    </td>
                    <td className={cn(celula, DO_TABLET)}>{acessoDe(u)}</td>
                    <td className={cn(celula, DO_TABLET)}><SituacaoConta usuario={u} /></td>
                    <td className={cn(celula, DA_TELA_LARGA, "text-texto-suave tabular-nums")}>{dataHora(u.ultimo_acesso)}</td>
                    <td className="py-2 pr-2">
                      {u.id !== eu?.id && (
                        <span className="flex justify-end">
                          <MenuAcoes rotulo={`Abrir ações de ${u.nome}`} itens={itensDoMenu(u)} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Moldura>
        {usuarios?.length === LIMITE_API && (
          <p className="text-sm text-texto-suave">
            Aparecem só as {LIMITE_API} contas mais recentes. Para achar outra, busque pelo nome ou e-mail.
          </p>
        )}
      </div>

      <Gaveta aberta={link !== null} titulo={`Nova senha de ${link?.nome ?? ""}`} aoFechar={() => setLink(null)}>
        {link && <LinkSenha link={link.link} />}
      </Gaveta>
    </>
  );
}

function SituacaoConta({ usuario }: { usuario: UsuarioAdmin }) {
  return <span className={cn(!usuario.ativo && "text-perigo")}>{situacaoDe(usuario)}</span>;
}

function LinkSenha({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-suave">
        Envie este link para a pessoa por um canal seguro. Ele vale por 1 hora e só pode ser usado uma
        vez. Quando a senha muda, as sessões abertas dela são encerradas.
      </p>
      <div className="space-y-1">
        <label htmlFor="link-senha" className="block text-sm font-medium">Link para nova senha</label>
        <Entrada id="link-senha" readOnly value={link} onFocus={(e) => e.target.select()} />
      </div>
      <Botao className="w-full" onClick={() => navigator.clipboard.writeText(link).then(() => setCopiado(true))}>
        <Copy className="size-4" aria-hidden />
        {copiado ? "Copiado" : "Copiar link"}
      </Botao>
    </div>
  );
}
