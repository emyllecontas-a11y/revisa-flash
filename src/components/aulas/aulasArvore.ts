// src/components/aulas/aulasArvore.ts
//
// Lógica PURA da árvore de aulas (sem React): formatação, ordenação e achatamento.
// Fica separada da página para poder ser testada sem renderizar a interface.
//
// Hierarquia: disciplina > assunto > subassunto (opcional) > aulas.

import type { Aula } from "@/services/aulaService";
import type { AulaTone } from "./aulas-data";

export type AulaBase = {
  disciplina: string;
  assunto: string;
  subassunto: string | null;
  assunto_ordem: number | null;
  ordem: number;
  created_at: string;
};

export type AulaFormatada = AulaBase & {
  id: string;
  numero: number;
  modulo: string;
  titulo: string;
  descricao: string;
  duracao: string;
  tone: AulaTone;
  terabox_url?: string;
};

export type AulaItem = AulaFormatada & {
  concluida: boolean;
  favorita: boolean;
  progresso: number;
};

export interface Subgrupo<T> {
  nome: string;
  menorOrdem: number;
  aulas: T[];
}

export interface AssuntoNode<T> {
  nome: string;
  ordem: number | null;
  semSubassunto: T[];
  subassuntos: Subgrupo<T>[];
}

export interface DisciplinaNode<T> {
  nome: string;
  assuntos: AssuntoNode<T>[];
}

// Único ponto de mapeamento aula do banco -> item da tela.
export function formatarAula(aula: Aula, index: number): AulaFormatada {
  const subassunto = aula.subassunto?.trim();
  return {
    id: aula.id,
    numero: aula.ordem ?? (index + 1),
    modulo: aula.disciplina || "Geral",
    titulo: aula.titulo,
    descricao: aula.descricao || "Aula em vídeo",
    duracao: "--:--",
    tone: index % 2 === 0 ? "laranja" : "rosa",
    terabox_url: aula.terabox_url,
    disciplina: aula.disciplina || "Outras Disciplinas",
    assunto: aula.assunto || "Geral",
    subassunto: subassunto ? subassunto : null,
    assunto_ordem: aula.assunto_ordem ?? null,
    ordem: aula.ordem ?? (index + 1),
    created_at: aula.created_at,
  };
}

// Aulas de um mesmo grupo: menor ordem primeiro; empate cai no created_at (ordem de cadastro).
function compararAulas<T extends AulaBase>(x: T, y: T): number {
  if (x.ordem !== y.ordem) return x.ordem - y.ordem;
  return x.created_at.localeCompare(y.created_at);
}

const compararNomes = (x: string, y: string) => x.localeCompare(y, "pt-BR", { numeric: true });

// Monta a árvore já ordenada, sem depender da ordem em que o banco devolve as aulas.
export function construirArvore<T extends AulaBase>(aulas: T[]): DisciplinaNode<T>[] {
  const disciplinas = new Map<string, T[]>();
  for (const aula of aulas) {
    const atual = disciplinas.get(aula.disciplina);
    if (atual) atual.push(aula);
    else disciplinas.set(aula.disciplina, [aula]);
  }

  return [...disciplinas.entries()]
    .sort(([a], [b]) => compararNomes(a, b))
    .map(([nomeDisciplina, aulasDaDisciplina]) => {
      const assuntosMap = new Map<string, T[]>();
      for (const aula of aulasDaDisciplina) {
        const atual = assuntosMap.get(aula.assunto);
        if (atual) atual.push(aula);
        else assuntosMap.set(aula.assunto, [aula]);
      }

      const assuntos: AssuntoNode<T>[] = [...assuntosMap.entries()].map(([nomeAssunto, aulasDoAssunto]) => {
        const semSubassunto = aulasDoAssunto.filter((aula) => !aula.subassunto).sort(compararAulas);

        const subassuntosMap = new Map<string, T[]>();
        for (const aula of aulasDoAssunto) {
          if (!aula.subassunto) continue;
          const atual = subassuntosMap.get(aula.subassunto);
          if (atual) atual.push(aula);
          else subassuntosMap.set(aula.subassunto, [aula]);
        }

        // Assunto com assunto_ordem preenchido em parte das aulas usa o menor valor do grupo.
        const ordens = aulasDoAssunto
          .map((aula) => aula.assunto_ordem)
          .filter((ordem): ordem is number => ordem !== null);

        return {
          nome: nomeAssunto,
          ordem: ordens.length > 0 ? Math.min(...ordens) : null,
          semSubassunto,
          subassuntos: [...subassuntosMap.entries()]
            .map(([nomeSubassunto, aulasDoSubassunto]) => ({
              nome: nomeSubassunto,
              menorOrdem: Math.min(...aulasDoSubassunto.map((aula) => aula.ordem)),
              aulas: [...aulasDoSubassunto].sort(compararAulas),
            }))
            .sort((x, y) => x.menorOrdem - y.menorOrdem || compararNomes(x.nome, y.nome)),
        };
      });

      // Assuntos: assunto_ordem crescente (null no fim), depois nome.
      assuntos.sort((x, y) => {
        const ordemX = x.ordem ?? Number.POSITIVE_INFINITY;
        const ordemY = y.ordem ?? Number.POSITIVE_INFINITY;
        if (ordemX !== ordemY) return ordemX - ordemY;
        return compararNomes(x.nome, y.nome);
      });

      return { nome: nomeDisciplina, assuntos };
    });
}

// Lista plana na ordem exata em que a árvore aparece na tela (usada por Próxima/Anterior).
export function achatarArvore<T>(arvore: DisciplinaNode<T>[]): T[] {
  return arvore.flatMap((disciplina) =>
    disciplina.assuntos.flatMap((assunto) => [
      ...assunto.semSubassunto,
      ...assunto.subassuntos.flatMap((subassunto) => subassunto.aulas),
    ])
  );
}

export function primeiraAulaId<T extends { id: string }>(arvore: DisciplinaNode<T>[]): string | null {
  return achatarArvore(arvore)[0]?.id ?? null;
}