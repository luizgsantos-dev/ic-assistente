import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

export function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
