import { ArrowLeft, ChartColumn, CircleHelp, FileText, Users } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useOutletContext } from "react-router";

import { AvisoDeErro, EsqueletoLinhas, estiloLink } from "@/components/ui";
import { carregarConfig, type Config } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGINAS = [
  { para: "documentos", rotulo: "Documentos", Icone: FileText },
  { para: "pendencias", rotulo: "Pendências", Icone: CircleHelp },
  { para: "uso", rotulo: "Uso", Icone: ChartColumn },
  { para: "usuarios", rotulo: "Usuários", Icone: Users },
];

type ContextoPainel = Pick<Config, "categorias" | "vinculos">;

export const useContextoPainel = () => useOutletContext<ContextoPainel>();

export function Painel() {
  const { pathname } = useLocation();
  const [config, setConfig] = useState<ContextoPainel>({ categorias: {}, vinculos: {} });
  const [erro, setErro] = useState<unknown>(null);

  const carregar = useCallback(() => {
    carregarConfig()
      .then((c) => {
        setConfig(c);
        setErro(null);
      })
      .catch(setErro);
  }, []);

  useEffect(carregar, [carregar]);

  // Ao trocar de página, o teclado e o leitor de tela recomeçam pelo conteúdo novo.
  const anterior = useRef(pathname);
  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    document.getElementById("conteudo")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-borda bg-superficie px-4 md:px-6">
        <div className="flex flex-wrap items-center gap-x-6">
          <p className="mr-auto text-base font-semibold md:mr-0">Painel da secretaria</p>
          <Link to="/" className={cn(estiloLink, "min-h-14 gap-2 text-sm md:order-last")}>
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao chat
          </Link>
          <nav aria-label="Páginas do painel" className="-mx-2 flex w-full md:mx-0 md:mr-auto md:w-auto">
            {PAGINAS.map(({ para, rotulo, Icone }) => (
              <NavLink
                key={para}
                to={para}
                className={({ isActive }) =>
                  cn(
                    "-mb-px inline-flex min-h-11 min-w-11 items-center justify-center gap-2 border-b-2 px-2 text-sm font-medium whitespace-nowrap md:min-h-14 md:px-3",
                    isActive ? "border-primaria text-texto" : "border-transparent text-texto-suave hover:text-texto",
                  )
                }
              >
                <Icone className="hidden size-4 xl:block" aria-hidden />
                {rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-pagina space-y-6 px-4 py-6 md:px-6 md:py-8">
        {erro !== null && <AvisoDeErro erro={erro} aoTentar={carregar} />}
        <Suspense fallback={<EsqueletoLinhas linhas={4} />}>
          <Outlet context={config} />
        </Suspense>
      </main>
    </div>
  );
}
