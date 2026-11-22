// src/types/study-plan.ts
// Tipos TypeScript para o Plano de Estudos Inteligente (4 camadas)

// ============================================================
// ENUMS
// ============================================================

export type ActivityType = 'theory' | 'questions' | 'review' | 'cards' | 'exam' | 'break' | 'other';

export type ThemeRule = 'period' | 'all' | 'none';

export type PeriodType = 'month' | 'week';

export type OccurrenceStatus = 'pending' | 'done' | 'missed';

export type SourceType = 'block' | 'extra';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 6 = Sábado

export type EditScope = 'single' | 'series_from_today';

// ============================================================
// TIPOS BASE (correspondem aos schemas RxDB e tabelas Supabase)
// ============================================================

/**
 * Tarefa de estudo (biblioteca de atividades)
 * Ex: "Teoria - Direito Constitucional", "Questões - Português", "Revisão - Flashcards"
 */
export interface StudyTask {
  id: string;
  user_id: string;
  name: string;
  activity_type: ActivityType;
  color: string; // hex color, ex: "#FE7802"
  theme_rule: ThemeRule;
  default_duration_min: number;
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

/**
 * Linha do tempo de temas (Camada 1)
 * Define quais temas estão vigentes em cada mês/semana
 */
export interface StudyThemeTimeline {
  id: string;
  user_id: string;
  period_type: PeriodType; // 'month' ou 'week'
  period_start: string; // ISO date (início do período, ex: "2026-11-01")
  themes: string[]; // array de nomes de temas, ex: ["Direito Constitucional", "Português"]
  topic_ids?: string[]; // array de UUIDs dos tópicos (integração com Conteúdos)
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

/**
 * Blocos semanais recorrentes (Camada 3 - Padrão)
 * Ex: "Segunda-feira 19h-21h: Teoria - Direito Constitucional"
 */
export interface StudyWeeklyBlock {
  id: string;
  user_id: string;
  task_id: string; // referência à StudyTask
  weekday: Weekday; // 0-6 (Dom-Sáb)
  start_time: string; // HH:MM (ex: "19:00")
  end_time: string; // HH:MM (ex: "21:00")
  effective_from: string; // ISO date (a partir de quando este padrão vale)
  effective_until?: string | null; // ISO date (até quando este padrão vale, inclusive). Null = sem fim definido.
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

/**
 * Eventos extras / exceções (Camada 4)
 * Ex: "Semana de 2026-11-16: adicionar simulado na quarta-feira"
 */
export interface StudyExtraEvent {
  id: string;
  user_id: string;
  task_id: string; // referência à StudyTask
  weekdays: Weekday[]; // dias da semana que este evento ocorre
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  week_starts: string[]; // array de ISO dates (inícios de semana onde este extra vale)
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

/**
 * Ocorrências individuais (geradas pelo motor)
 * Cada linha = um evento específico num dia/hora específicos
 */
export interface StudyOccurrence {
  id: string;
  user_id: string;
  source_type: SourceType; // 'block' (padrão) ou 'extra' (exceção)
  source_id: string; // ID do weekly_block ou extra_event que gerou esta ocorrência
  occurrence_date: string; // ISO date (ex: "2026-11-23")
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  task_id: string; // referência à StudyTask (denormalizado para queries rápidas)
  task_name: string; // denormalizado
  task_color: string; // denormalizado
  task_activity_type: ActivityType; // denormalizado
  theme: string; // tema resolvido (baseado na theme_rule e theme_timeline)
  status: OccurrenceStatus; // 'pending' | 'done' | 'missed'
  override_theme?: string | null; // override manual do tema (opcional)
  topic_id?: string | null; // ID do tópico vinculado (integração com Conteúdos)
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

/**
 * Pausa do Plano de Estudos (ETAPA 7)
 * Suprime ocorrências no intervalo [start_date, end_date], exceto as que já têm
 * status done/missed ou overrides salvos (histórico nunca some).
 */
export interface StudyPlanPause {
  id: string;
  user_id: string;
  start_date: string; // ISO date
  end_date: string; // ISO date
  reason?: string | null;
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

// ============================================================
// TIPOS PARA UI / COMPONENTES
// ============================================================

/**
 * Evento achatado para renderização no calendário/semana
 */
export interface StudyPlanEvent {
  id: string;
  date: string; // ISO date
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  taskId: string;
  taskName: string;
  taskColor: string;
  activityType: ActivityType;
  theme: string;
  status: OccurrenceStatus;
  sourceType: SourceType;
  sourceId: string;
  isOverride?: boolean;
  isExtra?: boolean;
  topicId?: string | null; // ID do tópico vinculado (integração com Conteúdos)
  topicName?: string | null; // Nome legível do tópico (resolvido via topics table)
}

/**
 * Semana agrupada por dia e turno (manhã/tarde/noite)
 */
export interface WeekSchedule {
  weekStart: string; // ISO date (segunda-feira da semana)
  days: DaySchedule[];
}

export interface DaySchedule {
  date: string; // ISO date
  dayName: string; // "Seg", "Ter", etc.
  dayNumber: number; // 1-31
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  morning: StudyPlanEvent[];
  afternoon: StudyPlanEvent[];
  evening: StudyPlanEvent[];
}

/**
 * Dados para o modal de edição de ocorrência
 */
export interface OccurrenceEditData {
  occurrenceId: string;
  occurrenceDate: string;
  taskId: string;
  taskName: string;
  taskColor: string;
  activityType: ActivityType;
  startTime: string;
  endTime: string;
  theme: string;
  status: OccurrenceStatus;
  sourceType: SourceType;
  sourceId: string;
}

// ============================================================
// MAPEAMENTO DE INTEGRAÇÕES FUTURAS (ETAPA 7)
// ============================================================

/**
 * Mapeia activity_type para rotas do Una Vox
 * Usado para futuros botões "Iniciar" / "Continuar" nas ocorrências
 */
export const ACTIVITY_TYPE_ROUTE_MAP: Record<ActivityType, string | null> = {
  theory: '/aulas', // ou rota de teoria futura
  questions: '/erros', // Banco de Questões / Fixação
  review: '/flashcards', // Revisões -> Flashcards (rota /revisoes não existe)
  cards: '/flashcards', // Flashcards
  exam: '/simulados', // Simulados
  break: null, // Pausa não tem rota
  other: null, // Outro não tem rota definida
};

/**
 * Rótulos amigáveis para os tipos de atividade
 */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  theory: 'Teoria',
  questions: 'Questões',
  review: 'Revisão',
  cards: 'Flashcards',
  exam: 'Simulado',
  break: 'Pausa',
  other: 'Outro',
};

/**
 * Cores padrão para cada tipo de atividade
 */
export const ACTIVITY_TYPE_DEFAULT_COLORS: Record<ActivityType, string> = {
  theory: '#3B82F6', // azul
  questions: '#EF4444', // vermelho
  review: '#8B5CF6', // roxo
  cards: '#F59E0B', // âmbar
  exam: '#EC4899', // rosa
  break: '#6B7280', // cinza
  other: '#14B8A6', // teal
};

/**
 * Rótulos para ThemeRule
 */
export const THEME_RULE_LABELS: Record<ThemeRule, string> = {
  period: 'Tema do período',
  all: 'Todos os temas',
  none: 'Sem tema',
};

/**
 * Rótulos para PeriodType
 */
export const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
  month: 'Por mês',
  week: 'Por semana',
};

/**
 * Rótulos para status de ocorrência
 */
export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  pending: 'Pendente',
  done: 'Feita',
  missed: 'Não fiz',
};

/**
 * Rótulos para escopo de edição
 */
export const EDIT_SCOPE_LABELS: Record<EditScope, string> = {
  single: 'Somente este evento',
  series_from_today: 'Toda a série a partir de hoje',
};

// ============================================================
// REGISTRO DE ESTUDOS (FASE 3 - M1 / FASE 4 - M2)
// ============================================================

export type StudyType = 'teorico' | 'pratico';

export interface StudyRecord {
  id: string;
  user_id: string;
  date: string;
  type: StudyType;
  discipline: string;
  topic: string;
  duration: number;
  material?: string;
  questionsCount?: number;
  correctCount?: number;
  wrongCount?: number;
  source?: string;
  observations?: string;
  createdAt: string;
  updated_at?: string;
  isDeleted?: boolean;
  // Novos campos para ligação automática Plano→Agenda
  occurrenceSourceType?: 'block' | 'extra' | null;
  occurrenceSourceId?: string | null;
  occurrenceDate?: string | null;
  autoGenerated?: boolean;
}

// ============================================================
// ESTATÍSTICAS (FASE 4 - M2)
// ============================================================

export interface StudyStatistics {
  plannedMinutes: number;
  effectiveMinutes: number;
  adherence: number;
  daysWithActivity: number;
  plannedCount: number;
  effectiveCount: number;
}

// ============================================================
// HELPERS DE TEMPO
// ============================================================

export const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAY_NAMES_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function getDayPeriod(startTime: string): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = parseInt(startTime.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

export function formatTimeForDisplay(time: string): string {
  return time.slice(0, 5); // HH:MM
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}