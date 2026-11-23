// src/components/aulas-redesign/topicosUtils.ts
//
// Lógica PURA dos tópicos (sem React): slug na URL, contagem de aulas estudadas
// e porcentagem de cada tópico/subtópico.
//
// Na tela "tópico" = assunto do banco; "subtópico" = subassunto do banco.

import type { AssuntoNode, AulaItem } from "../aulas/aulasArvore";

export interface ProgressoResumo {
  total: number;
  concluidas: number;
  /** 0 a 100 */
  percentual: number;
}

export interface SubtopicoResumo extends ProgressoResumo {
  slug: string;
  nome: string;
  aulas: AulaItem[];
}

export interface TopicoResumo extends ProgressoResumo {
  slug: string;
  nome: string;
  /** Aulas do tópico que NÃO pertencem a nenhum subtópico. */
  aulasSoltas: AulaItem[];
  subtopicos: SubtopicoResumo[];
}

/** "Fonética e Fonologia" -> "fonetica-e-fonologia" (usado na URL). */
export function slugTexto(nome: string): string {
  const slug = (nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "geral";
}

// Nomes que gerariam o mesmo endereço ganham um sufixo (-2, -3...), para nunca se misturarem.
function slugUnico(nome: string, usados: Set<string>): string {
  const base = slugTexto(nome);
  let slug = base;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  usados.add(slug);
  return slug;
}

export function calcularProgresso(aulas: AulaItem[]): ProgressoResumo {
  const total = aulas.length;
  const concluidas = aulas.filter((a) => a.concluida).length;
  return {
    total,
    concluidas,
    percentual: total === 0 ? 0 : Math.round((concluidas / total) * 100),
  };
}

/** Transforma os assuntos de uma disciplina em tópicos prontos para a tela. */
export function resumirTopicos(assuntos: AssuntoNode<AulaItem>[]): TopicoResumo[] {
  const slugsTopicos = new Set<string>();
  return assuntos.map((assunto) => {
    const slugsSub = new Set<string>();
    const subtopicos: SubtopicoResumo[] = assunto.subassuntos.map((sub) => ({
      slug: slugUnico(sub.nome, slugsSub),
      nome: sub.nome,
      aulas: sub.aulas,
      ...calcularProgresso(sub.aulas),
    }));
    const todas = [...assunto.semSubassunto, ...assunto.subassuntos.flatMap((s) => s.aulas)];
    return {
      slug: slugUnico(assunto.nome, slugsTopicos),
      nome: assunto.nome,
      aulasSoltas: assunto.semSubassunto,
      subtopicos,
      ...calcularProgresso(todas),
    };
  });
}

/** Acha em qual tópico/subtópico uma aula está (para o botão "voltar" da tela da aula). */
export function localizarAula(
  topicos: TopicoResumo[],
  aula: Pick<AulaItem, "id">,
): { topico: TopicoResumo; subtopico: SubtopicoResumo | null } | null {
  for (const topico of topicos) {
    if (topico.aulasSoltas.some((a) => a.id === aula.id)) return { topico, subtopico: null };
    for (const subtopico of topico.subtopicos) {
      if (subtopico.aulas.some((a) => a.id === aula.id)) return { topico, subtopico };
    }
  }
  return null;
}
