import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, ErroApi, type Usuario } from "./api";
import { apagarRascunhos } from "./ganchos";

type Autenticacao = {
  usuario: Usuario | null;
  carregando: boolean;
  /** Falha ao descobrir quem está logado (rede ou servidor), diferente de "não está logado". */
  erro: unknown;
  verificar: () => void;
  definirUsuario: (usuario: Usuario | null) => void;
  atualizarRestantes: (restantes: number | null) => void;
  sair: () => Promise<void>;
};

const Contexto = createContext<Autenticacao | null>(null);

export function ProvedorAutenticacao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<unknown>(null);

  const verificar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    api<Usuario>("/auth/eu")
      .then(setUsuario)
      .catch((e) => {
        if (!(e instanceof ErroApi && e.status === 401)) setErro(e);
      })
      .finally(() => setCarregando(false));
  }, []);

  useEffect(verificar, [verificar]);

  const atualizarRestantes = useCallback((restantes: number | null) => {
    setUsuario((u) => (u ? { ...u, perguntas_restantes: restantes } : u));
  }, []);

  // Se o servidor não confirmar a saída a sessão continua valendo, então a tela não finge que saiu.
  const sair = useCallback(async () => {
    await api("/auth/sair", { metodo: "POST" });
    apagarRascunhos();
    setUsuario(null);
  }, []);

  return (
    <Contexto.Provider
      value={{ usuario, carregando, erro, verificar, definirUsuario: setUsuario, atualizarRestantes, sair }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useAutenticacao() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useAutenticacao fora do ProvedorAutenticacao");
  return contexto;
}
