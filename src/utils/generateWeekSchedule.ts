// src/utils/generateWeekSchedule.ts
// Motor de geração da semana (ETAPA 3) — FUNÇÃO PURA, sem I/O
// Regras documentadas conforme especificação da ETAPA 3

import type {
  StudyTask,
  StudyThemeTimeline,
  StudyWeeklyBlock,
  StudyExtraEvent,
  StudyOccurrence,
  StudyPlanPause,
  ActivityType,
  ThemeRule,
  PeriodType,
  OccurrenceStatus,
  SourceType,
  Weekday,
  WeekSchedule,
  DaySchedule,
  StudyPlanEvent,
} from '@/types/study-plan';

/**
 * Input para o motor de geração da semana
 */
export interface GenerateWeekScheduleInput {
  weekStart: string; // ISO date (segunda-feira da semana)
  blocks: StudyWeeklyBlock[];
  extras: StudyExtraEvent[];
  timelines: StudyThemeTimeline[];
  tasks: StudyTask[];
  occurrences: StudyOccurrence[]; // overrides individuais (status, override_theme, exclusão)
  pauses?: StudyPlanPause[]; // pausas do plano (ETAPA 7) - suprime ocorrências no intervalo
  topics?: Map<string, string>; // topic_id -> topic_name (opcional, para resolver nome do tópico)
}

/**
 * Resolve o tema para uma ocorrência baseado na theme_rule da task
 * Reutiliza a lógica do service (decisão P1: tema persistido NÃO é fonte de verdade)
 */
function resolveThemeForOccurrence(
  task: StudyTask,
  occurrenceDate: string,
  themeTimelines: StudyThemeTimeline[]
): string {
  const { theme_rule } = task;

  if (theme_rule === 'none') return '';
  if (theme_rule === 'all') {
    // União ordenada e deduplicada de todos os temas de todas as timelines
    const allThemes = themeTimelines.flatMap((t) => t.themes);
    return [...new Set(allThemes)].join(', ');
  }

  // theme_rule === 'period'
  const occDate = new Date(occurrenceDate + 'T12:00:00');

  // Prioridade: semana > mês (period_start == segunda da semana tem prioridade sobre mês da data)
  let matchedThemes: string[] = [];

  // 1. Procurar timeline de semana que corresponda
  for (const timeline of themeTimelines) {
    if (timeline.period_type !== 'week') continue;
    const periodStart = new Date(timeline.period_start + 'T12:00:00');
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);

    if (occDate >= periodStart && occDate <= periodEnd) {
      matchedThemes = timeline.themes;
      break; // Semana tem prioridade, para aqui
    }
  }

  // 2. Se não achou semana, procurar timeline de mês
  if (matchedThemes.length === 0) {
    for (const timeline of themeTimelines) {
      if (timeline.period_type !== 'month') continue;
      const periodStart = new Date(timeline.period_start + 'T12:00:00');
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(periodEnd.getDate() - 1);

      if (occDate >= periodStart && occDate <= periodEnd) {
        matchedThemes = timeline.themes;
        break;
      }
    }
  }

  return matchedThemes.join(', ');
}

/**
 * Resolve o topic_id para uma ocorrência baseado na timeline correspondente
 * Retorna o primeiro topic_id da timeline que corresponder ao período, ou null
 */
function resolveTopicIdForOccurrence(
  occurrenceDate: string,
  themeTimelines: StudyThemeTimeline[]
): string | null {
  const occDate = new Date(occurrenceDate + 'T12:00:00');

  // Prioridade: semana > mês (period_start == segunda da semana tem prioridade sobre mês da data)
  
  // 1. Procurar timeline de semana que corresponda
  for (const timeline of themeTimelines) {
    if (timeline.period_type !== 'week') continue;
    const periodStart = new Date(timeline.period_start + 'T12:00:00');
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);

    if (occDate >= periodStart && occDate <= periodEnd) {
      if (timeline.topic_ids && timeline.topic_ids.length > 0) {
        return timeline.topic_ids[0];
      }
      return null;
    }
  }

  // 2. Se não achou semana, procurar timeline de mês
  for (const timeline of themeTimelines) {
    if (timeline.period_type !== 'month') continue;
    const periodStart = new Date(timeline.period_start + 'T12:00:00');
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    if (occDate >= periodStart && occDate <= periodEnd) {
      if (timeline.topic_ids && timeline.topic_ids.length > 0) {
        return timeline.topic_ids[0];
      }
      return null;
    }
  }

  return null;
}

/**
 * Verifica se um bloco semanal vale para uma data específica
 * Nova convenção: bloco vale no dia d se !is_deleted && effective_from <= d && (effective_until == null || d <= effective_until) && weekday === d.getDay()
 */
function blockAppliesOnDate(block: StudyWeeklyBlock, date: Date): boolean {
  if (block.isDeleted) return false;

  // weekday: 0=Dom..6=Sáb (getDay() do JS)
  const weekday = date.getDay();
  if (block.weekday !== weekday) return false;

  // effective_from <= data (comparar apenas a data, sem horário)
  const effectiveFrom = new Date(block.effective_from + 'T00:00:00');
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly < effectiveFrom) return false;

  // effective_until: se definido, data deve ser <= effective_until
  if (block.effective_until) {
    const effectiveUntil = new Date(block.effective_until + 'T00:00:00');
    if (dateOnly > effectiveUntil) return false;
  }

  return true;
}

/**
 * Verifica se um evento extra vale para uma data específica
 */
function extraAppliesOnDate(extra: StudyExtraEvent, date: Date): boolean {
  if (extra.isDeleted) return false;

  const weekday = date.getDay() as Weekday;
  if (!extra.weekdays.includes(weekday)) return false;

  // week_starts contém a segunda-feira da semana da data
  const weekStart = getWeekStart(date);
  const weekStartStr = weekStart.toISOString().split('T')[0];

  if (!extra.week_starts.includes(weekStartStr)) return false;

  return true;
}

/**
 * Retorna a segunda-feira (início da semana ISO) de uma data
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day; // Dom -> -6, Seg -> 0, Ter -> -1, etc.
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Converte HH:MM para minutos desde meia-noite
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converte minutos para HH:MM
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calcula duração em minutos, lidando com cruzamento de meia-noite
 * Se end_time <= start_time, assume que termina no dia seguinte
 */
function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) {
    end += 24 * 60; // dia seguinte
  }
  return end - start;
}

/**
 * Determina o turno baseado no horário de início
 * Manhã < 12:00; Tarde 12:00–17:59; Noite ≥ 18:00
 */
function getShift(startTime: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(startTime.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Resolve o nome do tópico a partir do topic_id usando o mapa de topics
 */
function resolveTopicName(topicId: string | null | undefined, topics: Map<string, string> | undefined): string | null {
  if (!topicId || !topics) return null;
  return topics.get(topicId) ?? null;
}

/**
 * Cria um evento de estudo planificado a partir de uma ocorrência base + overrides
 */
function createStudyPlanEvent(
  baseOccurrence: StudyOccurrence,
  task: StudyTask,
  overrideOccurrence: StudyOccurrence | undefined,
  occurrenceDate: string,
  topics: Map<string, string> | undefined
): StudyPlanEvent {
  // Aplicar overrides da ocorrência individual (se houver)
  const finalStartTime = overrideOccurrence?.start_time ?? baseOccurrence.start_time;
  const finalEndTime = overrideOccurrence?.end_time ?? baseOccurrence.end_time;
  const finalStatus = overrideOccurrence?.status ?? baseOccurrence.status;
  const finalTheme = overrideOccurrence?.override_theme ?? baseOccurrence.theme;
  const finalTopicId = overrideOccurrence?.topic_id ?? baseOccurrence.topic_id;

  // Override REAL: há diferença efetiva em relação ao padrão da série
  // (override_theme preenchido, horário alterado, ou status done/missed)
  const hasRealOverride = !!(
    overrideOccurrence &&
    (overrideOccurrence.override_theme ||
      overrideOccurrence.start_time !== baseOccurrence.start_time ||
      overrideOccurrence.end_time !== baseOccurrence.end_time ||
      overrideOccurrence.status !== baseOccurrence.status)
  );

  const shift = getShift(finalStartTime);

  return {
    id: overrideOccurrence?.id ?? baseOccurrence.id,
    date: occurrenceDate,
    startTime: finalStartTime,
    endTime: finalEndTime,
    taskId: baseOccurrence.task_id,
    taskName: baseOccurrence.task_name,
    taskColor: baseOccurrence.task_color,
    activityType: baseOccurrence.task_activity_type,
    theme: finalTheme,
    status: finalStatus,
    sourceType: baseOccurrence.source_type,
    sourceId: baseOccurrence.source_id,
    isOverride: hasRealOverride,
    isExtra: baseOccurrence.source_type === 'extra',
    topicId: finalTopicId,
    topicName: resolveTopicName(finalTopicId, topics),
  };
}

/**
 * Verifica se uma ocorrência deve ser suprimida por pausa.
 * NÃO suprime se:
 * - status === 'done' ou 'missed' (histórico preservado)
 * - isOverride === true (tem override salvo)
 * - isDeleted === true (já excluída individualmente)
 */
function shouldSuppressByPause(
  event: { date: string; status: OccurrenceStatus; isOverride?: boolean; isDeleted?: boolean },
  pauses: StudyPlanPause[] | undefined
): boolean {
  if (!pauses || pauses.length === 0) return false;

  const date = new Date(event.date + 'T12:00:00');
  date.setHours(0, 0, 0, 0);

  for (const pause of pauses) {
    const start = new Date(pause.start_date + 'T00:00:00');
    const end = new Date(pause.end_date + 'T00:00:00');
    if (date >= start && date <= end) {
      // Histórico preservado: done, missed, overrides, exclusões individuais
      if (event.status === 'done' || event.status === 'missed') return false;
      if (event.isOverride) return false;
      if (event.isDeleted) return false;
      return true;
    }
  }
  return false;
}

/**
 * Função principal: gera a agenda da semana organizada em 7 dias × 4 turnos
 * FUNÇÃO PURA — sem efeitos colaterais, sem I/O
 */
export function generateWeekSchedule(input: GenerateWeekScheduleInput): WeekSchedule {
  const { weekStart, blocks, extras, timelines, tasks, occurrences, pauses } = input;

  const weekStartDate = new Date(weekStart + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Mapas para lookup rápido
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const overridesByKey = new Map<string, StudyOccurrence>();
  for (const occ of occurrences) {
    // IMPORTANTE: incluir overrides com isDeleted=true para poder excluir ocorrências
    const key = `${occ.source_type}|${occ.source_id}|${occ.occurrence_date}`;
    overridesByKey.set(key, occ);
  }

  // Gerar ocorrências base para cada dia da semana
  const days: DaySchedule[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    const weekday = date.getDay(); // 0=Dom..6=Sáb

    const events: StudyPlanEvent[] = [];

    // 1. Blocos semanais recorrentes
    for (const block of blocks) {
      if (!blockAppliesOnDate(block, date)) continue;

      const task = tasksById.get(block.task_id);
      if (!task) continue;

      const theme = resolveThemeForOccurrence(task, dateStr, timelines);
      const topic_id = resolveTopicIdForOccurrence(dateStr, timelines);

      // Criar ocorrência base
      const baseOccurrence: StudyOccurrence = {
        id: `block-${block.id}-${dateStr}`,
        user_id: '',
        source_type: 'block',
        source_id: block.id,
        occurrence_date: dateStr,
        start_time: block.start_time,
        end_time: block.end_time,
        task_id: task.id,
        task_name: task.name,
        task_color: task.color,
        task_activity_type: task.activity_type,
        theme,
        status: 'pending',
        topic_id,
        created_at: '',
        updated_at: '',
        isDeleted: false,
      };

      // Verificar override individual
      const overrideKey = `block|${block.id}|${dateStr}`;
      const override = overridesByKey.get(overrideKey);
      if (override?.isDeleted) continue; // Excluído individualmente

      const event = createStudyPlanEvent(baseOccurrence, task, override, dateStr, input.topics);
      if (!shouldSuppressByPause(event, pauses)) {
        events.push(event);
      }
    }

    // 2. Eventos extras
    for (const extra of extras) {
      if (!extraAppliesOnDate(extra, date)) continue;

      const task = tasksById.get(extra.task_id);
      if (!task) continue;

      const theme = resolveThemeForOccurrence(task, dateStr, timelines);
      const topic_id = resolveTopicIdForOccurrence(dateStr, timelines);

      const baseOccurrence: StudyOccurrence = {
        id: `extra-${extra.id}-${dateStr}`,
        user_id: '',
        source_type: 'extra',
        source_id: extra.id,
        occurrence_date: dateStr,
        start_time: extra.start_time,
        end_time: extra.end_time,
        task_id: task.id,
        task_name: task.name,
        task_color: task.color,
        task_activity_type: task.activity_type,
        theme,
        status: 'pending',
        topic_id,
        created_at: '',
        updated_at: '',
        isDeleted: false,
      };

      const overrideKey = `extra|${extra.id}|${dateStr}`;
      const override = overridesByKey.get(overrideKey);
      if (override?.isDeleted) continue; // Excluído individualmente

      const event = createStudyPlanEvent(baseOccurrence, task, override, dateStr, input.topics);
      if (!shouldSuppressByPause(event, pauses)) {
        events.push(event);
      }
    }

    // Ordenar eventos por horário de início
    events.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    // Agrupar por turno (3 turnos: manhã, tarde, noite)
    const morning = events.filter((e) => getShift(e.startTime) === 'morning');
    const afternoon = events.filter((e) => getShift(e.startTime) === 'afternoon');
    const evening = events.filter((e) => getShift(e.startTime) === 'evening');

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    days.push({
      date: dateStr,
      dayName: dayNames[weekday],
      dayNumber: date.getDate(),
      isToday: dateStr === today.toISOString().split('T')[0],
      isPast: date < today,
      isFuture: date > today,
      morning,
      afternoon,
      evening,
    });
  }

  return {
    weekStart,
    days,
  };
}

// Re-export types for consumers
export type { WeekSchedule, DaySchedule, StudyPlanEvent };