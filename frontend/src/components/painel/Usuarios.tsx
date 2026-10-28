import { Copy, KeyRound, Shield, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Dialogo } from "@/components/Dialogo";
import { Aviso, Botao, Entrada } from "@/components/ui";
import { api, ErroApi, type UsuarioAdmin } from "@/lib/api";
import { useAutenticacao } from "@/lib/auth";
import { dataHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";

function mensagemDeErro(e: unknown) {
  return e instanceof ErroApi ? e.message : "Não foi possível falar com o servidor.";
}

export function Usuarios({ vinculos }: { vinculos: Record<string, string> }) {
  const { usuario: eu } = useAutenticacao();
  const [busca, setBusca] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [erro, setErro] = useState("");
  const [link, setLink] = useState<{ nome: string; link: string } | null>(null);

  useEffect(() => {
    // Espera a pessoa parar de digitar antes de buscar.
    const espera = setTimeout(() => {
      const q = busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : "";
      api<UsuarioAdmin[]>(`/painel/usuarios${q}`)
        .then((u) => {
          setUsuarios(u);
          setErro("");
        })
        .catch((e) => setErro(mensagemDeErro(e)));
    }, 300);
    return () => clearTimeout(espera);
  }, [busca]);

  async function alterar(u: UsuarioAdmin, mudanca: Partial<Pick<UsuarioAdmin, "papel" | "ativo">>, confirmacao: string) {
    if (!window.confirm(confirmacao)) return;
    try {
      const atualizado = await api<UsuarioAdmin>(`/painel/usuarios/${u.id}`, { metodo: "PATCH", corpo: mudanca });
      setUsuarios((lista) => lista?.map((x) => (x.id === u.id ? atualizado : x)) ?? null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function gerarLink(u: UsuarioAdmin) {
    try {
      const r = await api<{ link: string }>(`/painel/usuarios/${u.id}/link-senha`, { metodo: "POST" });
      setLink({ nome: u.nome, link: r.link });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Usuários{usuarios && <span className="font-normal text-texto-suave"> ({usuarios.length})</span>}
        </h2>
        <Entrada
          aria-label="Buscar usuário"
          placeholder="Buscar por nome ou e-mail…"
          className="w-64"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {!usuarios ? (
        !erro && <p className="text-sm text-texto-suave">Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borda text-xs text-texto-suave">
              <tr>
                <th className="px-3 py-2.5 font-medium">Pessoa</th>
                <th className="px-3 py-2.5 font-medium">Vínculo</th>
                <th className="px-3 py-2.5 font-medium">Acesso</th>
                <th className="px-3 py-2.5 font-medium">Último acesso</th>
                <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {usuarios.map((u) => {
                const souEu = u.id === eu?.id;
                const admin = u.papel === "admin";
                return (
                  <tr key={u.id} className={cn(!u.ativo && "opacity-60")}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">
                        {u.nome}
                        {souEu && <span className="font-normal text-texto-suave"> (você)</span>}
                      </p>
                      <p className="text-xs text-texto-suave">{u.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {vinculos[u.vinculo] ?? u.vinculo}
                      {u.curso && <span className="block text-xs text-texto-suave">{u.curso}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {admin ? "Secretaria" : "Usuário"}
                      {!u.ativo && <span className="block text-xs text-perigo">Desativado</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-texto-suave">{dataHora(u.ultimo_acesso)}</td>
                    <td className="px-2 py-1.5">
                      {!souEu && (
                        <div className="flex justify-end">
                          <Acao
                            rotulo={admin ? "Tirar acesso de secretaria" : "Dar acesso de secretaria"}
                            aoClicar={() =>
                              alterar(
                                u,
                                { papel: admin ? "usuario" : "admin" },
                                admin
                                  ? `Tirar o acesso de secretaria de ${u.nome}?`
                                  : `Dar acesso de secretaria a ${u.nome}? A pessoa passa a ver este painel.`,
                              )
                            }
                          >
                            {admin ? <ShieldOff /> : <Shield />}
                          </Acao>
                          <Acao
                            rotulo={u.ativo ? "Desativar conta" : "Reativar conta"}
                            aoClicar={() =>
                              alterar(
                                u,
                                { ativo: !u.ativo },
                                u.ativo
                                  ? `Desativar a conta de ${u.nome}? A pessoa sai na hora e não consegue mais entrar.`
                                  : `Reativar a conta de ${u.nome}?`,
                              )
                            }
                          >
                            {u.ativo ? <UserX /> : <UserCheck />}
                          </Acao>
                          <Acao rotulo="Gerar link para nova senha" aoClicar={() => gerarLink(u)}>
                            <KeyRound />
                          </Acao>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo aberto={link !== null} titulo={`Nova senha para ${link?.nome ?? ""}`} aoFechar={() => setLink(null)}>
        {link && <LinkSenha link={link.link} />}
      </Dialogo>
    </div>
  );
}

function Acao({ rotulo, aoClicar, children }: { rotulo: string; aoClicar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={rotulo}
      title={rotulo}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function LinkSenha({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-suave">
        Envie este link para a pessoa por um canal seguro. Ele vale por 1 hora e só pode ser usado
        uma vez; ao criar a senha nova, as sessões abertas dela são encerradas.
      </p>
      <div className="flex gap-2">
        <Entrada readOnly value={link} aria-label="Link para nova senha" onFocus={(e) => e.target.select()} />
        <Botao
          variante="secundaria"
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopiado(true))}
        >
          <Copy className="size-4" aria-hidden />
          {copiado ? "Copiado" : "Copiar"}
        </Botao>
      </div>
    </div>
  );
}
