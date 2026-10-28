import { ArrowLeft, ChartColumn, CircleHelp, FileText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Documentos } from "@/components/painel/Documentos";
import { Pendencias } from "@/components/painel/Pendencias";
import { Uso } from "@/components/painel/Uso";
import { Usuarios } from "@/components/painel/Usuarios";
import { carregarConfig, type Config } from "@/lib/api";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "documentos", rotulo: "Documentos", Icone: FileText },
  { id: "pendencias", rotulo: "Pendências", Icone: CircleHelp },
  { id: "uso", rotulo: "Uso", Icone: ChartColumn },
  { id: "usuarios", rotulo: "Usuários", Icone: Users },
] as const;

type IdAba = (typeof ABAS)[number]["id"];

export function Painel() {
  const [parametros, setParametros] = useSearchParams();
  const aba = (ABAS.find((a) => a.id === parametros.get("aba"))?.id ?? "documentos") as IdAba;
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    carregarConfig().then(setConfig).catch(() => undefined);
  }, []);

  return (
    <div className="min-h-full">
      <header className="border-b border-borda bg-superficie">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-4">
          <div>
            <h1 className="text-lg font-semibold">Painel da secretaria</h1>
            <p className="text-sm text-texto-suave">Documentos, pendências e uso do IC-Assistant</p>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primaria hover:underline">
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao chat
          </Link>
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto px-4" role="tablist">
          {ABAS.map(({ id, rotulo, Icone }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setParametros({ aba: id }, { replace: true })}
              className={cn(
                "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                aba === id
                  ? "border-primaria text-texto"
                  : "border-transparent text-texto-suave hover:text-texto",
              )}
            >
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6" role="tabpanel">
        {aba === "documentos" && <Documentos categorias={config?.categorias ?? {}} />}
        {aba === "pendencias" && <Pendencias />}
        {aba === "uso" && <Uso />}
        {aba === "usuarios" && <Usuarios vinculos={config?.vinculos ?? {}} />}
      </main>
    </div>
  );
}
