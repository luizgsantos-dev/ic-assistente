import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";

import { useAutenticacao, ProvedorAutenticacao } from "@/lib/auth";
import { Cadastro, Entrar, EsqueciSenha, RedefinirSenha } from "@/paginas/Acesso";
import { Chat } from "@/paginas/Chat";

function Carregando() {
  return <div className="flex h-full items-center justify-center text-sm text-texto-suave">Carregando…</div>;
}

function SoLogado({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAutenticacao();
  if (carregando) return <Carregando />;
  return usuario ? children : <Navigate to="/entrar" replace />;
}

function SoVisitante({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAutenticacao();
  if (carregando) return <Carregando />;
  return usuario ? <Navigate to="/" replace /> : children;
}

export function App() {
  return (
    <BrowserRouter>
      <ProvedorAutenticacao>
        <Routes>
          <Route path="/entrar" element={<SoVisitante><Entrar /></SoVisitante>} />
          <Route path="/cadastro" element={<SoVisitante><Cadastro /></SoVisitante>} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          {/* Rota-mãe única: o chat não é recriado ao trocar de conversa, o que cortaria a
              resposta que está chegando. */}
          <Route element={<SoLogado><Chat /><Outlet /></SoLogado>}>
            <Route index element={null} />
            <Route path="c/:id" element={null} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProvedorAutenticacao>
    </BrowserRouter>
  );
}
