import { useCallback, useEffect, useRef, useState } from "react";

/** Título da aba do navegador. */
export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · IC-Assistant` : "IC-Assistant";
  }, [titulo]);
}

/** Fica `true` só depois de `ms` esperando, para carga rápida não piscar na tela. */
export function useAtraso(esperando: boolean, ms = 100) {
  const [passou, setPassou] = useState(false);
  useEffect(() => {
    if (!esperando) {
      setPassou(false);
      return;
    }
    const t = setTimeout(() => setPassou(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return esperando && passou;
}

/** Tela de celular (menos de 768 px). */
export function useTelaEstreita() {
  const consulta = "(max-width: 767.98px)";
  const [estreita, setEstreita] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const midia = window.matchMedia(consulta);
    const mudar = () => setEstreita(midia.matches);
    midia.addEventListener("change", mudar);
    return () => midia.removeEventListener("change", mudar);
  }, []);
  return estreita;
}

/** A tecla "/" leva o foco ao campo de busca da página. */
export function useAtalhoBusca() {
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function teclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (alvo.closest("input, textarea, select, dialog[open], [contenteditable]")) return;
      e.preventDefault();
      campo.current?.focus();
    }
    document.addEventListener("keydown", teclar);
    return () => document.removeEventListener("keydown", teclar);
  }, []);
  return campo;
}

// --- rascunhos e preferências ---

const PREFIXO_RASCUNHO = "rascunho:";

function ler<T>(armazem: Storage, chave: string): T | null {
  try {
    const texto = armazem.getItem(chave);
    return texto === null ? null : (JSON.parse(texto) as T);
  } catch {
    return null;
  }
}

function gravar(armazem: Storage, chave: string, valor: unknown) {
  try {
    if (valor === null) armazem.removeItem(chave);
    else armazem.setItem(chave, JSON.stringify(valor));
  } catch {
    // armazenamento bloqueado (janela anônima, por exemplo): segue sem guardar
  }
}

/**
 * Estado que sobrevive a recarregar a página. Fica em sessionStorage, que some ao fechar a aba,
 * porque o site também é usado em computadores de laboratório. Nunca use para senha.
 */
export function useRascunho<T>(chave: string, inicial: T) {
  const completa = PREFIXO_RASCUNHO + chave;
  const [valor, setValor] = useState<T>(() => ler<T>(sessionStorage, completa) ?? inicial);
  const [restaurado, setRestaurado] = useState(() => ler(sessionStorage, completa) !== null);
  const textoInicial = useRef(JSON.stringify(inicial));

  useEffect(() => {
    const igual = JSON.stringify(valor) === textoInicial.current;
    gravar(sessionStorage, completa, igual ? null : valor);
  }, [completa, valor]);

  const descartar = useCallback(() => {
    setValor(JSON.parse(textoInicial.current) as T);
    setRestaurado(false);
    gravar(sessionStorage, completa, null);
  }, [completa]);

  return { valor, setValor, restaurado, descartar };
}

/** Ao sair da conta: o próximo a usar o computador não vê o que ficou digitado. */
export function apagarRascunhos() {
  try {
    for (const chave of Object.keys(sessionStorage)) {
      if (chave.startsWith(PREFIXO_RASCUNHO)) sessionStorage.removeItem(chave);
    }
  } catch {
    // armazenamento bloqueado: não há o que apagar
  }
}

/** Preferência que fica para a próxima visita (último período, última categoria…). */
export function usePreferencia<T>(chave: string, inicial: T) {
  const completa = `preferencia:${chave}`;
  const [valor, setValor] = useState<T>(() => ler<T>(localStorage, completa) ?? inicial);
  const mudar = useCallback(
    (novo: T) => {
      setValor(novo);
      gravar(localStorage, completa, novo);
    },
    [completa],
  );
  return [valor, mudar] as const;
}

// --- validação de formulário ---

type Regras<T> = { [K in keyof T]?: (valor: string) => string | null };

/**
 * Valida ao sair do campo e limpa o erro assim que a pessoa volta a mexer nele. O botão de
 * enviar fica sempre clicável: `validarTudo` mostra os erros e leva o foco ao primeiro.
 * O id de cada campo na tela precisa ser `${prefixo}-${nome}`.
 */
export function useValidacao<T extends Record<string, string>>(prefixo: string, valores: T, regras: Regras<T>) {
  const [erros, setErros] = useState<Partial<Record<keyof T, string>>>({});

  const aoSair = (campo: keyof T) => {
    const erro = regras[campo]?.(valores[campo]);
    setErros((e) => ({ ...e, [campo]: erro ?? undefined }));
  };

  const limpar = (campo: keyof T) => setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));

  function validarTudo() {
    const novos: Partial<Record<keyof T, string>> = {};
    for (const campo of Object.keys(regras) as (keyof T)[]) {
      const erro = regras[campo]?.(valores[campo]);
      if (erro) novos[campo] = erro;
    }
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) document.getElementById(`${prefixo}-${primeiro}`)?.focus();
    return primeiro === undefined;
  }

  /** Propriedades de um campo: id, erro e os eventos que validam e limpam. */
  const campo = (nome: keyof T & string) => ({
    id: `${prefixo}-${nome}`,
    erro: erros[nome],
    aoSair: () => aoSair(nome),
    aoMexer: () => limpar(nome),
  });

  return { erros, campo, validarTudo };
}

export const REGRA_EMAIL = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Escreva um e-mail como nome@exemplo.com.";

export const SENHA_MINIMA = 8;

export const REGRA_SENHA_NOVA = (v: string) =>
  v.length >= SENHA_MINIMA ? null : `Use pelo menos ${SENHA_MINIMA} caracteres.`;
