// src/utils/dateHelpers.ts

// ============================================================
// 📅 HELPERS DE DATA PARA CADERNO SEMANAL
// ============================================================
// Fuso horário: local do usuário (Brasil UTC-3).
// Semana de erros: segunda 00:00 a sexta 23:59:59.999
// Janela de resolução: sábado 06:00 a domingo 23:59:59.999
// Erros feitos no sábado/domingo pertencem à semana seguinte.
// ============================================================

/**
 * Hora de abertura do caderno semanal (sábado 06:00 local)
 * Definida como constante para uso em UI e lógica.
 */
export const WEEKLY_NOTEBOOK_OPENING_HOUR = 6; // 06:00

/**
 * Retorna o início (segunda 00:00:00.000) e fim (sexta 23:59:59.999)
 * da janela de erros da semana que contém a data de referência.
 * A referência pode ser qualquer dia; a função calcula a seg-sex daquela semana.
 * @param refDate Data de referência (qualquer dia da semana)
 * @returns { weekStart: Date, weekEnd: Date } em timezone local
 */
export function getErrorWindow(refDate: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(refDate);
  const day = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb

  // Calcular quantos dias voltar para chegar na segunda-feira
  // Se domingo (0), volta 6 dias; se segunda (1), volta 0; se sábado (6), volta 5
  const daysToMonday = (day + 6) % 7;

  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4); // sexta = segunda + 4
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Verifica se a janela de resolução do caderno semanal está aberta.
 * Aberta de sábado 06:00 até domingo 23:59:59.999 (timezone local).
 * @param now Data/hora atual (padrão: new Date())
 * @returns true se dentro da janela de resolução
 */
export function isNotebookWindowOpen(now: Date = new Date()): boolean {
  const d = new Date(now);
  const day = d.getDay(); // 0=Dom, 6=Sáb
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  const ms = d.getMilliseconds();

  if (day === 6) { // Sábado
    // Aberto a partir de 06:00:00.000
    return hour > WEEKLY_NOTEBOOK_OPENING_HOUR ||
      (hour === WEEKLY_NOTEBOOK_OPENING_HOUR && (minute > 0 || second > 0 || ms > 0));
  }

  if (day === 0) { // Domingo
    // Aberto até 23:59:59.999
    return true;
  }

  return false; // Segunda a sexta: fechado
}

/**
 * Calcula o week_start (segunda-feira) do caderno que estaria aberto em `now`.
 * - Se agora está na janela de resolução (sáb 06h - dom 23:59): retorna a segunda da semana que acabou (seg-sex anterior).
 * - Se agora está fora da janela (seg-sex): retorna a segunda da semana atual (a que está em andamento).
 * @param now Data/hora atual (padrão: new Date())
 * @returns Date representando a segunda-feira 00:00:00.000 local
 */
export function getNotebookWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);

  if (isNotebookWindowOpen(d)) {
    // Estamos na janela de resolução (sáb/dom): o caderno aberto representa a semana anterior (seg-sex)
    // Voltar para a sexta-feira anterior e depois para a segunda
    const day = d.getDay(); // 0=Dom, 6=Sáb
    let daysBack = 0;
    if (day === 6) daysBack = 1; // Sábado -> voltar 1 dia para sexta
    if (day === 0) daysBack = 2; // Domingo -> voltar 2 dias para sexta

    const friday = new Date(d);
    friday.setDate(d.getDate() - daysBack);
    friday.setHours(23, 59, 59, 999);

    // Agora pegar a segunda dessa semana
    const { weekStart } = getErrorWindow(friday);
    return weekStart;
  }

  // Fora da janela (seg-sex): o caderno da semana atual ainda não foi gerado/aberto
  // Retorna a segunda da semana atual
  const { weekStart } = getErrorWindow(d);
  return weekStart;
}

/**
 * Retorna o week_start como string 'YYYY-MM-DD' (segunda-feira local).
 * @param now Data/hora atual (padrão: new Date())
 * @returns string no formato 'YYYY-MM-DD'
 */
export function getNotebookWeekStartString(now: Date = new Date()): string {
  const weekStart = getNotebookWeekStart(now);
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const day = String(weekStart.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna o week_end (sexta-feira) como Date para o week_start fornecido.
 * @param weekStart Date da segunda-feira 00:00:00.000
 * @returns Date da sexta-feira 23:59:59.999
 */
export function getWeekEndFromStart(weekStart: Date): Date {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

/**
 * Verifica se uma data/hora (created_at de um erro) cai dentro da janela de erros
 * de uma semana específica (segunda a sexta).
 * @param errorDate Data do erro (ISO string ou Date)
 * @param weekStart Date da segunda-feira da semana
 * @returns true se o erro pertence a essa semana
 */
export function isErrorInWeek(errorDate: string | Date, weekStart: Date): boolean {
  const errDate = errorDate instanceof Date ? errorDate : new Date(errorDate);
  const { weekStart: ws, weekEnd: we } = getErrorWindow(weekStart);
  return errDate >= ws && errDate <= we;
}

/**
 * Formata uma Date como 'YYYY-MM-DD' (apenas data, sem hora/timezone).
 * Útil para armazenar week_start/week_end no banco.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parseia 'YYYY-MM-DD' para Date à meia-noite local.
 */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Retorna o início (segunda 00:00:00.000) e fim (sexta 23:59:59.999)
 * da semana mais recente cujo "sábado 06:00" já passou (fuso local).
 *
 * - Sábado antes das 06:00 → semana anterior (ex.: sábado 05:59 de 28/11 → semana de 16/11)
 * - Sábado 06:00 até próximo sábado 06:00 → semana atual (ex.: sábado 06:00 de 28/11 até sábado 06:00 de 05/12 → semana 23/11 a 27/11)
 * - Erros de sábado/domingo pertencem à semana seguinte (já tratado em isErrorInWeek)
 *
 * @param now Data/hora atual (padrão: new Date())
 * @returns { weekStart: Date, weekEnd: Date } em timezone local
 */
export function getLastClosedWeek(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const d = new Date(now);
  const day = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  const ms = d.getMilliseconds();

  // Verificar se o "sábado 06:00" da semana atual já passou
  let saturdayPassed = false;
  if (day === 6) { // Sábado
    saturdayPassed = hour > 6 || (hour === 6 && (minute > 0 || second > 0 || ms > 0));
  } else if (day === 0) { // Domingo
    saturdayPassed = true; // Sábado 06:00 já passou
  } else {
    // Segunda a sexta: o sábado 06:00 desta semana ainda não chegou
    saturdayPassed = false;
  }

  // Se o sábado 06:00 já passou, a semana fechada é a desta semana (seg-sex atual)
  // Se não passou, a semana fechada é a anterior
  let targetMonday: Date;
  if (saturdayPassed) {
    // Semana atual: encontrar a segunda-feira desta semana
    const daysToMonday = (day + 6) % 7; // 0=Dom→6, 1=Seg→0, ..., 6=Sáb→5
    targetMonday = new Date(d);
    targetMonday.setDate(d.getDate() - daysToMonday);
  } else {
    // Semana anterior: encontrar a segunda-feira da semana passada
    const daysToMonday = (day + 6) % 7;
    const thisMonday = new Date(d);
    thisMonday.setDate(d.getDate() - daysToMonday);
    targetMonday = new Date(thisMonday);
    targetMonday.setDate(thisMonday.getDate() - 7);
  }

  targetMonday.setHours(0, 0, 0, 0);

  const weekEnd = new Date(targetMonday);
  weekEnd.setDate(targetMonday.getDate() + 4); // sexta = segunda + 4
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart: targetMonday, weekEnd };
}

/**
 * Formata uma Date como 'DD/MM' (dia/mês).
 * Útil para exibição no nome do caderno semanal.
 * @param date Data a formatar
 * @returns string no formato 'DD/MM'
 */
export function formatDDMM(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}