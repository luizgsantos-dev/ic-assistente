import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from "react-router";

import { ProvedorAvisos, ProvedorConfirmacao } from "@/components/Janelas";
import { AvisoDeErro, EsqueletoLinhas } from "@/components/ui";
import { ProvedorAutenticacao, useAutenticacao } from "@/lib/auth";
import { Cadastro, Entrar, RecuperarSenha, RedefinirSenha } from "@/paginas/Acesso";
import { Chat } from "@/paginas/Chat";

// O painel só é baixado por quem abre (a secretaria); o chat fica mais leve para o resto.
const Painel = lazy(() => import("@/paginas/painel/Painel").then((m) => ({ default: m.Painel })));
const Documentos = lazy(() => import("@/paginas/painel/Documentos").then((m) => ({ default: m.Documentos })));
const Documento = lazy(() => import("@/paginas/painel/Documento").then((m) => ({ default: m.Documento })));
const EnviarDocumentos = lazy(() =>
  import("@/paginas/painel/EnviarDocumentos").then((m) => ({ default: m.EnviarDocumentos })),
);
const Pendencias = lazy(() => import("@/paginas/painel/Pendencias").then((m) => ({ default: m.Pendencias })));
const Uso = lazy(() => import("@/paginas/painel/Uso").then((m) => ({ default: m.Uso })));
const Usuarios = lazy(() => import("@/paginas/painel/Usuarios").then((m) => ({ default: m.Usuarios })));

function Raiz() {
  return (
    <ProvedorAutenticacao>
      <ProvedorAvisos>
        <ProvedorConfirmacao>
          <a
            href="#conteudo"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("conteudo")?.focus();
            }}
            className="sr-only rounded-lg bg-primaria text-sm font-medium text-primaria-texto focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:px-4"
          >
            Ir para o conteúdo
          </a>
          <Outlet />
          <ScrollRestoration />
        </ProvedorConfirmacao>
      </ProvedorAvisos>
    </ProvedorAutenticacao>
  );
}

/** Espera saber quem está logado. Falha de rede ou do servidor não vira "faça login". */
function QuandoSouber({ children }: { children: ReactNode }) {
  const { carregando, erro, verificar } = useAutenticacao();
  if (carregando) {
    return (
      <main className="mx-auto max-w-formulario px-4 py-12">
        <EsqueletoLinhas linhas={3} />
      </main>
    );
  }
  if (erro) {
    return (
      <main className="mx-auto max-w-formulario px-4 py-12">
        <AvisoDeErro erro={erro} aoTentar={verificar} />
      </main>
    );
  }
  return children;
}

function SoLogado() {
  const { usuario } = useAutenticacao();
  return <QuandoSouber>{usuario ? <><Chat /><Outlet /></> : <Navigate to="/entrar" replace />}</QuandoSouber>;
}

function SoSecretaria() {
  const { usuario } = useAutenticacao();
  return (
    <QuandoSouber>
      {!usuario ? (
        <Navigate to="/entrar" replace />
      ) : usuario.papel !== "admin" ? (
        <Navigate to="/" replace />
      ) : (
        <Suspense fallback={<EsqueletoLinhas linhas={4} />}>
          <Painel />
        </Suspense>
      )}
    </QuandoSouber>
  );
}

function SoVisitante() {
  const { usuario } = useAutenticacao();
  return <QuandoSouber>{usuario ? <Navigate to="/" replace /> : <Outlet />}</QuandoSouber>;
}

const rotas = createBrowserRouter([
  {
    element: <Raiz />,
    children: [
      {
        element: <SoVisitante />,
        children: [
          { path: "/entrar", element: <Entrar /> },
          { path: "/cadastro", element: <Cadastro /> },
        ],
      },
      { path: "/esqueci-senha", element: <RecuperarSenha /> },
      { path: "/redefinir-senha", element: <RedefinirSenha /> },
      {
        path: "/painel",
        element: <SoSecretaria />,
        children: [
          { index: true, element: <Navigate to="documentos" replace /> },
          { path: "documentos", element: <Documentos /> },
          { path: "documentos/enviar", element: <EnviarDocumentos /> },
          { path: "documentos/:id", element: <Documento /> },
          { path: "pendencias", element: <Pendencias /> },
          { path: "uso", element: <Uso /> },
          { path: "usuarios", element: <Usuarios /> },
          { path: "*", element: <Navigate to="/painel/documentos" replace /> },
        ],
      },
      {
        // Rota-mãe única: o chat não é recriado ao trocar de conversa, o que cortaria a resposta
        // que está chegando.
        element: <SoLogado />,
        children: [
          { index: true, element: null },
          { path: "c/:id", element: null },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={rotas} />;
}
