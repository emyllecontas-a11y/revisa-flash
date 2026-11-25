// src/utils/date.ts
// Datas locais do Study Rats (America/Fortaleza no dispositivo da usuária).
// NUNCA usar toISOString() aqui: ele converte para UTC e pode voltar um dia.

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data local no formato YYYY-MM-DD (com zero à esquerda). */
export function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Hora local no formato HH:MM:SS (aceito pela coluna study_time). */
export function localTimeStr(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** Primeiro e último dia (YYYY-MM-DD) de um mês local. `month` vai de 1 a 12. */
export function localMonthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

/** Prefixo YYYY-MM-DD de um mês local, para comparações de string. `month` de 1 a 12. */
export function localMonthPrefix(year: number, month: number): string {
  return `${year}-${pad2(month)}-`;
}

/** O dia `dateStr` (YYYY-MM-DD) pertence ao mês local informado? */
export function isDateInMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  return typeof dateStr === 'string' && dateStr.startsWith(localMonthPrefix(year, month));
}
