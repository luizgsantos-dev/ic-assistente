import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, ErroApi, type Usuario } from "./api";

type Autenticacao = {
  usuario: Usuario | null;
  carregando: boolean;
  definirUsuario: (usuario: Usuario | null) => void;
  atualizarRestantes: (restantes: number | null) => void;
  sair: () => Promise<void>;
};

const Contexto = createContext<Autenticacao | null>(null);

export function ProvedorAutenticacao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api<Usuario>("/auth/eu")
      .then(setUsuario)
      .catch((e) => {
        if (!(e instanceof ErroApi && e.status === 401)) console.error(e);
      })
      .finally(() => setCarregando(false));
  }, []);

  const atualizarRestantes = useCallback((restantes: number | null) => {
    setUsuario((u) => (u ? { ...u, perguntas_restantes: restantes } : u));
  }, []);

  const sair = useCallback(async () => {
    await api("/auth/sair", { metodo: "POST" }).catch(() => undefined);
    setUsuario(null);
  }, []);

  return (
    <Contexto.Provider
      value={{ usuario, carregando, definirUsuario: setUsuario, atualizarRestantes, sair }}
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
