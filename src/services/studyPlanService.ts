// src/services/studyPlanService.ts
// Serviço base para o Plano de Estudos Inteligente (4 camadas)
// Usa RxDB local (reativo via .subscribe()) e sincroniza com Supabase via enqueueOperation

import { getDb } from '@/lib/db';
import { enqueueOperation } from './queueService';
import { uid } from '@/utils/helpers';
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
} from '@/types/study-plan';

// Re-export types for consumers
export type {
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
};

// ============================================================
// HELPERS
// ============================================================

function nowISO(): string {
  return new Date().toISOString();
}

function getCurrentUserId(): string | null {
  try {
    return localStorage.getItem('revisaflash_user_id');
  } catch {
    return null;
  }
}

async function assertUserId(): Promise<string> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Usuário não autenticado');
  return userId;
}

// ============================================================
// STUDY TASKS (Camada 2 - Biblioteca)
// ============================================================

export async function createStudyTask(data: Omit<StudyTask, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyTask> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const task: StudyTask = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_tasks.insert(task);
  await enqueueOperation('create', 'study_tasks', task);
  return task;
}

export async function updateStudyTask(id: string, data: Partial<Omit<StudyTask, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_tasks.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Tarefa não encontrada');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_tasks', updated);
}

export async function deleteStudyTask(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_tasks.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Tarefa não encontrada');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  await enqueueOperation('delete', 'study_tasks', { id });
}

export async function getStudyTasks(userId?: string): Promise<StudyTask[]> {
  const uid = userId || (await assertUserId());
  const db = await getDb();

  const docs = await db.study_tasks.find({
    selector: { user_id: uid, isDeleted: { $ne: true } },
  }).exec();

  return docs.map(d => d.toJSON() as StudyTask);
}

export function subscribeStudyTasks(userId: string, callback: (tasks: StudyTask[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_tasks) return;

    // Initial load
    const initial = await db.study_tasks.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyTask));

    // Subscribe to changes
    const subscription = db.collections.study_tasks.$.subscribe(() => {
      db.study_tasks.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyTask));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

// ============================================================
// STUDY THEME TIMELINES (Camada 1 - Linha do Tempo)
// ============================================================

export async function createStudyThemeTimeline(data: Omit<StudyThemeTimeline, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyThemeTimeline> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const timeline: StudyThemeTimeline = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_theme_timelines.insert(timeline);
  await enqueueOperation('create', 'study_theme_timelines', timeline);
  return timeline;
}

export async function updateStudyThemeTimeline(id: string, data: Partial<Omit<StudyThemeTimeline, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_theme_timelines.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Linha do tempo não encontrada');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_theme_timelines', updated);
}

export async function upsertStudyThemeTimeline(data: Omit<StudyThemeTimeline, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyThemeTimeline> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  // Try to find existing
  const existing = await db.study_theme_timelines.findOne({
    selector: { user_id: userId, period_type: data.period_type, period_start: data.period_start, isDeleted: { $ne: true } },
  }).exec();

  if (existing) {
    const updated = { ...existing.toJSON(), ...data, themes: data.themes, updated_at: now };
    await existing.patch(updated);
    await enqueueOperation('update', 'study_theme_timelines', updated);
    return updated as StudyThemeTimeline;
  }

  // Create new
  const timeline: StudyThemeTimeline = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_theme_timelines.insert(timeline);
  await enqueueOperation('create', 'study_theme_timelines', timeline);
  return timeline;
}

export async function deleteStudyThemeTimeline(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_theme_timelines.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Linha do tempo não encontrada');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  await enqueueOperation('delete', 'study_theme_timelines', { id });
}

export async function getStudyThemeTimelines(userId?: string): Promise<StudyThemeTimeline[]> {
  const uid = userId || (await assertUserId());
  const db = await getDb();

  const docs = await db.study_theme_timelines.find({
    selector: { user_id: uid, isDeleted: { $ne: true } },
  }).exec();

  return docs.map(d => d.toJSON() as StudyThemeTimeline);
}

export function subscribeStudyThemeTimelines(userId: string, callback: (timelines: StudyThemeTimeline[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_theme_timelines) return;

    const initial = await db.study_theme_timelines.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyThemeTimeline));

    const subscription = db.collections.study_theme_timelines.$.subscribe(() => {
      db.study_theme_timelines.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyThemeTimeline));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

// ============================================================
// STUDY WEEKLY BLOCKS (Camada 3 - Padrão Semanal)
// ============================================================

export async function createStudyWeeklyBlock(data: Omit<StudyWeeklyBlock, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyWeeklyBlock> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const block: StudyWeeklyBlock = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_weekly_blocks.insert(block);
  await enqueueOperation('create', 'study_weekly_blocks', block);
  return block;
}

export async function updateStudyWeeklyBlock(id: string, data: Partial<Omit<StudyWeeklyBlock, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_weekly_blocks.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Bloco semanal não encontrado');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_weekly_blocks', updated);
}

export async function deleteStudyWeeklyBlock(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_weekly_blocks.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Bloco semanal não encontrado');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  await enqueueOperation('delete', 'study_weekly_blocks', { id });
}

/**
 * Atualiza uma série de blocos semanais "a partir de hoje" (semântica da seção 5 da ETAPA 4).
 * - A versão antiga recebe effective_until = ontem
 * - Uma NOVA versão é criada com os novos valores e effective_from = hoje
 * - Ocorrências passadas (status/overrides) continuam vinculadas ao source_id antigo
 */
export async function updateWeeklyBlockSeriesFromToday(
  blockId: string,
  cambios: Partial<Omit<StudyWeeklyBlock, 'id' | 'user_id' | 'created_at' | 'effective_from' | 'effective_until'>>
): Promise<StudyWeeklyBlock> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  // Buscar bloco original
  const originalDoc = await db.study_weekly_blocks.findOne({ selector: { id: blockId, user_id: userId } }).exec();
  if (!originalDoc) throw new Error('Bloco semanal não encontrado');
  const original = originalDoc.toJSON() as StudyWeeklyBlock;

  // Data de hoje (sem horário)
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = hoje.toISOString().split('T')[0];

  // Ontem
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toISOString().split('T')[0];

  // 1. Encerrar versão antiga: definir effective_until = ontem
  const oldUpdated = { ...original, effective_until: ontemStr, updated_at: now };
  await originalDoc.patch(oldUpdated);
  await enqueueOperation('update', 'study_weekly_blocks', oldUpdated);

  // 2. Criar NOVA versão com effective_from = hoje e os cambios
  const novoBloco: StudyWeeklyBlock = {
    id: uid(),
    user_id: userId,
    task_id: cambios.task_id ?? original.task_id,
    weekday: cambios.weekday ?? original.weekday,
    start_time: cambios.start_time ?? original.start_time,
    end_time: cambios.end_time ?? original.end_time,
    effective_from: hojeStr,
    effective_until: null,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_weekly_blocks.insert(novoBloco);
  await enqueueOperation('create', 'study_weekly_blocks', novoBloco);

  return novoBloco;
}

/**
 * Encerra uma série de blocos semanais "a partir de hoje" (exclusão de série preservando passado).
 * - A versão antiga recebe effective_until = ontem + isDeleted = true
 * - Ocorrências passadas permanecem intactas vinculadas ao source_id antigo
 */
export async function closeWeeklyBlockSeriesFromToday(blockId: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  // Buscar bloco original
  const originalDoc = await db.study_weekly_blocks.findOne({ selector: { id: blockId, user_id: userId } }).exec();
  if (!originalDoc) throw new Error('Bloco semanal não encontrado');
  const original = originalDoc.toJSON() as StudyWeeklyBlock;

  // Data de hoje (sem horário)
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = hoje.toISOString().split('T')[0];

  // Ontem
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toISOString().split('T')[0];

  // Encerrar versão antiga: effective_until = ontem + isDeleted = true
  const closedVersion = { ...original, effective_until: ontemStr, isDeleted: true, updated_at: now };
  await originalDoc.patch(closedVersion);
  await enqueueOperation('update', 'study_weekly_blocks', closedVersion);
}

export async function getStudyWeeklyBlocks(userId?: string): Promise<StudyWeeklyBlock[]> {
  const uid = userId || (await assertUserId());
  const db = await getDb();

  const docs = await db.study_weekly_blocks.find({
    selector: { user_id: uid, isDeleted: { $ne: true } },
  }).exec();

  return docs.map(d => d.toJSON() as StudyWeeklyBlock);
}

export function subscribeStudyWeeklyBlocks(userId: string, callback: (blocks: StudyWeeklyBlock[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_weekly_blocks) return;

    const initial = await db.study_weekly_blocks.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyWeeklyBlock));

    const subscription = db.collections.study_weekly_blocks.$.subscribe(() => {
      db.study_weekly_blocks.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyWeeklyBlock));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

// ============================================================
// STUDY EXTRA EVENTS (Camada 4 - Exceções)
// ============================================================

export async function createStudyExtraEvent(data: Omit<StudyExtraEvent, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyExtraEvent> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const event: StudyExtraEvent = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_extra_events.insert(event);
  await enqueueOperation('create', 'study_extra_events', event);
  return event;
}

export async function updateStudyExtraEvent(id: string, data: Partial<Omit<StudyExtraEvent, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_extra_events.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Evento extra não encontrado');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_extra_events', updated);
}

export async function deleteStudyExtraEvent(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_extra_events.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Evento extra não encontrado');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  await enqueueOperation('delete', 'study_extra_events', { id });
}

export async function getStudyExtraEvents(userId?: string): Promise<StudyExtraEvent[]> {
  const uid = userId || (await assertUserId());
  const db = await getDb();

  const docs = await db.study_extra_events.find({
    selector: { user_id: uid, isDeleted: { $ne: true } },
  }).exec();

  return docs.map(d => d.toJSON() as StudyExtraEvent);
}

export function subscribeStudyExtraEvents(userId: string, callback: (events: StudyExtraEvent[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_extra_events) return;

    const initial = await db.study_extra_events.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyExtraEvent));

    const subscription = db.collections.study_extra_events.$.subscribe(() => {
      db.study_extra_events.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyExtraEvent));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

// ============================================================
// STUDY OCCURRENCES (Motor - Ocorrências Geradas)
// ============================================================

export async function createStudyOccurrence(data: Omit<StudyOccurrence, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyOccurrence> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const occurrence: StudyOccurrence = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_occurrences.insert(occurrence);
  await enqueueOperation('create', 'study_occurrences', occurrence);
  return occurrence;
}

export async function bulkCreateStudyOccurrences(occurrences: Omit<StudyOccurrence, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>[]): Promise<StudyOccurrence[]> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const toInsert = occurrences.map(o => ({
    ...o,
    id: uid(),
    user_id: userId,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  }));

  await db.study_occurrences.bulkInsert(toInsert);
  for (const occ of toInsert) {
    await enqueueOperation('create', 'study_occurrences', occ);
  }

  return toInsert;
}

export async function updateStudyOccurrence(id: string, data: Partial<Omit<StudyOccurrence, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_occurrences.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Ocorrência não encontrada');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_occurrences', updated);
}

export async function updateStudyOccurrenceStatus(id: string, status: OccurrenceStatus): Promise<void> {
  await updateStudyOccurrence(id, { status });
}

export async function deleteStudyOccurrence(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_occurrences.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Ocorrência não encontrada');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  await enqueueOperation('delete', 'study_occurrences', { id });
}

export async function getStudyOccurrencesForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<StudyOccurrence[]> {
  const db = await getDb();

  const docs = await db.study_occurrences.find({
    selector: {
      user_id: userId,
      occurrence_date: { $gte: startDate, $lte: endDate },
      isDeleted: { $ne: true },
    },
  }).exec();

  return docs.map(d => d.toJSON() as StudyOccurrence);
}

export async function getStudyOccurrencesForWeek(userId: string, weekStart: string): Promise<StudyOccurrence[]> {
  const db = await getDb();

  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  return getStudyOccurrencesForDateRange(userId, startStr, endStr);
}

export function subscribeStudyOccurrences(userId: string, callback: (occurrences: StudyOccurrence[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_occurrences) return;

    const initial = await db.study_occurrences.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyOccurrence));

    const subscription = db.collections.study_occurrences.$.subscribe(() => {
      db.study_occurrences.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyOccurrence));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

// ============================================================
// OCORRÊNCIAS: OVERRIDES E EDICÃO INDIVIDUAL (ETAPA 6)
// ============================================================

export interface GeneratedOccurrenceInput {
  source_type?: SourceType;
  sourceType?: SourceType;
  source_id?: string;
  sourceId?: string;
  occurrence_date?: string;
  date?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  task_id?: string;
  taskId?: string;
  task_name?: string;
  taskName?: string;
  task_color?: string;
  taskColor?: string;
  task_activity_type?: ActivityType;
  activityType?: ActivityType;
  theme?: string;
  status?: OccurrenceStatus;
  topic_id?: string | null;
  topicId?: string | null;
}

/**
 * Procura linha existente por (user_id, source_type, source_id, occurrence_date).
 * Se existe, atualiza; se não existe, cria preenchendo todos os campos a partir da gerada + mudanças.
 * NUNCA duplica linha.
 */
export async function upsertOccurrenceOverride(
  userId: string,
  generatedOccurrence: GeneratedOccurrenceInput,
  changes: {
    status?: OccurrenceStatus;
    override_theme?: string | null;
    start_time?: string;
    end_time?: string;
    is_deleted?: boolean;
  }
): Promise<StudyOccurrence> {
  const db = await getDb();
  const now = nowISO();

  const sourceType = generatedOccurrence.source_type ?? generatedOccurrence.sourceType ?? 'block';
  const sourceId = generatedOccurrence.source_id ?? generatedOccurrence.sourceId ?? '';
  const occDate = generatedOccurrence.occurrence_date ?? generatedOccurrence.date ?? '';

  const existing = await db.study_occurrences.findOne({
    selector: {
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      occurrence_date: occDate,
    },
  }).exec();

  if (existing) {
    const patchData: Record<string, any> = { updated_at: now };
    if (changes.status !== undefined) patchData.status = changes.status;
    if (changes.override_theme !== undefined) patchData.override_theme = changes.override_theme;
    if (changes.start_time !== undefined) patchData.start_time = changes.start_time;
    if (changes.end_time !== undefined) patchData.end_time = changes.end_time;
    if (changes.is_deleted !== undefined) patchData.isDeleted = changes.is_deleted;

    await existing.patch(patchData);
    const updated = existing.toJSON() as StudyOccurrence;
    await enqueueOperation('update', 'study_occurrences', updated);
    return updated;
  }

  const newOcc: StudyOccurrence = {
    id: uid(),
    user_id: userId,
    source_type: sourceType,
    source_id: sourceId,
    occurrence_date: occDate,
    start_time: changes.start_time ?? generatedOccurrence.start_time ?? generatedOccurrence.startTime ?? '08:00',
    end_time: changes.end_time ?? generatedOccurrence.end_time ?? generatedOccurrence.endTime ?? '09:00',
    task_id: generatedOccurrence.task_id ?? generatedOccurrence.taskId ?? '',
    task_name: generatedOccurrence.task_name ?? generatedOccurrence.taskName ?? '',
    task_color: generatedOccurrence.task_color ?? generatedOccurrence.taskColor ?? '#3B82F6',
    task_activity_type: generatedOccurrence.task_activity_type ?? generatedOccurrence.activityType ?? 'other',
    theme: generatedOccurrence.theme ?? '',
    status: changes.status ?? generatedOccurrence.status ?? 'pending',
    override_theme: changes.override_theme !== undefined ? changes.override_theme : null,
    topic_id: generatedOccurrence.topic_id ?? generatedOccurrence.topicId ?? null,
    created_at: now,
    updated_at: now,
    isDeleted: changes.is_deleted ?? false,
  };

  await db.study_occurrences.insert(newOcc);
  await enqueueOperation('create', 'study_occurrences', newOcc);
  return newOcc;
}

// ============================================================
// REGISTRO AUTOMÁTICO PLANO→AGENDA (FASE 3 - M1)
// ============================================================

/**
 * Verifica se existe registro manual (autoGenerated=false) com mesmo user_id, date e discipline.
 * Comparação de discipline sem caixa e sem espaços extras.
 */
async function hasManualRecordForDateAndDiscipline(
  userId: string,
  date: string,
  discipline: string
): Promise<boolean> {
  const db = await getDb();
  const normalizedDiscipline = discipline.trim().toLowerCase();

  const docs = await db.study_records.find({
    selector: {
      user_id: userId,
      date: date,
      isDeleted: { $ne: true },
      autoGenerated: { $ne: true },
    },
  }).exec();

  return docs.some((doc) => {
    const record = doc.toJSON() as any;
    return (record.discipline || '').trim().toLowerCase() === normalizedDiscipline;
  });
}

/**
 * Cria ou atualiza registro de estudo automático a partir de uma ocorrência marcada como "done".
 * Idempotente pela chave composta (user_id, occurrenceSourceType, occurrenceSourceId, occurrenceDate).
 */
export async function createAutoStudyRecord(
  userId: string,
  occurrence: GeneratedOccurrenceInput & { override_theme?: string | null }
): Promise<void> {
  const db = await getDb();

  // Não gerar registro para break/other
  const activityType = occurrence.task_activity_type ?? occurrence.activityType ?? 'other';
  if (activityType === 'break' || activityType === 'other') {
    return;
  }

  const sourceType = occurrence.source_type ?? occurrence.sourceType ?? 'block';
  const sourceId = occurrence.source_id ?? occurrence.sourceId ?? '';
  const occDate = occurrence.occurrence_date ?? occurrence.date ?? '';

  if (!sourceId || !occDate) {
    console.warn('[createAutoStudyRecord] sourceId ou occurrenceDate ausentes', occurrence);
    return;
  }

  // Verificar se já existe registro manual para mesmo date + discipline (regra "manual vence")
  const discipline = occurrence.override_theme ?? occurrence.theme ?? '';
  if (discipline && await hasManualRecordForDateAndDiscipline(userId, occDate, discipline)) {
    console.log('[createAutoStudyRecord] Registro manual já existe para', occDate, discipline, '- pulando automático');
    return;
  }

  // Calcular duração em minutos com regra de meia-noite
  const startTime = occurrence.start_time ?? occurrence.startTime ?? '08:00';
  const endTime = occurrence.end_time ?? occurrence.endTime ?? '09:00';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // cruzou meia-noite
  const duration = endMin - startMin;

  const now = nowISO();
  const type = activityType === 'theory' ? 'teorico' : 'pratico';

  // Buscar registro automático existente pela chave composta
  const existing = await db.study_records.findOne({
    selector: {
      user_id: userId,
      occurrenceSourceType: sourceType,
      occurrenceSourceId: sourceId,
      occurrenceDate: occDate,
      autoGenerated: true,
    },
  }).exec();

  const recordData = {
    id: existing ? existing.toJSON().id : uid(),
    user_id: userId,
    date: occDate,
    type,
    discipline: discipline,
    topic: occurrence.task_name ?? occurrence.taskName ?? '',
    duration,
    material: '',
    questionsCount: 0,
    correctCount: 0,
    wrongCount: 0,
    source: 'plano_automatico',
    observations: 'Gerado automaticamente pelo Plano de Estudos',
    createdAt: existing ? existing.toJSON().createdAt : now,
    updated_at: now,
    isDeleted: false,
    occurrenceSourceType: sourceType,
    occurrenceSourceId: sourceId,
    occurrenceDate: occDate,
    autoGenerated: true,
  };

  if (existing) {
    await existing.patch(recordData);
    await enqueueOperation('update', 'study_records', recordData);
  } else {
    await db.study_records.insert(recordData);
    await enqueueOperation('create', 'study_records', recordData);
  }
}

/**
 * Remove (soft delete) registro automático vinculado a uma ocorrência.
 * Remove SOMENTE registros com autoGenerated=true dessa ocorrência específica.
 */
export async function removeAutoStudyRecord(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
  occurrenceDate: string
): Promise<void> {
  const db = await getDb();

  const existing = await db.study_records.findOne({
    selector: {
      user_id: userId,
      occurrenceSourceType: sourceType,
      occurrenceSourceId: sourceId,
      occurrenceDate: occurrenceDate,
      autoGenerated: true,
    },
  }).exec();

  if (existing) {
    const record = existing.toJSON();
    const deletedRecord = { ...record, isDeleted: true, updated_at: nowISO() };
    await existing.patch(deletedRecord);
    await enqueueOperation('update', 'study_records', deletedRecord);
  }
}

/**
 * Atalho para alternar ou definir status de uma ocorrência.
 * - Entrar em "done" → createAutoStudyRecord
 * - Sair de "done" → removeAutoStudyRecord
 */
export async function setOccurrenceStatus(
  userId: string,
  generatedOccurrence: GeneratedOccurrenceInput,
  status: OccurrenceStatus
): Promise<StudyOccurrence> {
  const updated = await upsertOccurrenceOverride(userId, generatedOccurrence, { status });

  // Integração automática Plano→Agenda
  const sourceType = generatedOccurrence.source_type ?? generatedOccurrence.sourceType ?? 'block';
  const sourceId = generatedOccurrence.source_id ?? generatedOccurrence.sourceId ?? '';
  const occDate = generatedOccurrence.occurrence_date ?? generatedOccurrence.date ?? '';

  if (status === 'done') {
    await createAutoStudyRecord(userId, { ...generatedOccurrence, override_theme: updated.override_theme });
  } else if (sourceId && occDate) {
    // Saiu de "done" (para pending ou missed) → remove o automático
    await removeAutoStudyRecord(userId, sourceType, sourceId, occDate);
  }

  return updated;
}

/**
 * Exclui individualmente uma instância de ocorrência (is_deleted: true naquele dia). A série continua.
 */
export async function deleteOccurrenceInstance(
  userId: string,
  generatedOccurrence: GeneratedOccurrenceInput
): Promise<StudyOccurrence> {
  return upsertOccurrenceOverride(userId, generatedOccurrence, { is_deleted: true });
}

/**
 * Remove a linha de override local e remota, fazendo o dia voltar ao padrão da série.
 */
export async function resetOccurrenceOverride(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
  occurrenceDate: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.study_occurrences.findOne({
    selector: {
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      occurrence_date: occurrenceDate,
    },
  }).exec();

  if (existing) {
    const docId = existing.toJSON().id;
    await existing.remove();
    await enqueueOperation('delete', 'study_occurrences', { id: docId });
  }
}

// ============================================================
// RESOLUÇÃO DE TEMA (Helper para o Motor - ETAPA 3)
// ============================================================

/**
 * Resolve o tema para uma data específica baseado na theme_rule da task
 * e na theme_timeline vigente.
 */
export function resolveThemeForOccurrence(
  task: StudyTask,
  occurrenceDate: string,
  themeTimelines: StudyThemeTimeline[]
): string {
  const { theme_rule } = task;

  if (theme_rule === 'none') return '';
  if (theme_rule === 'all') return themeTimelines.flatMap(t => t.themes).join(', ');

  // theme_rule === 'period'
  const occDate = new Date(occurrenceDate + 'T12:00:00');

  // Find matching timeline
  for (const timeline of themeTimelines) {
    if (timeline.period_type === 'month') {
      const periodStart = new Date(timeline.period_start + 'T12:00:00');
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(periodEnd.getDate() - 1);

      if (occDate >= periodStart && occDate <= periodEnd) {
        return timeline.themes.join(', ');
      }
    } else if (timeline.period_type === 'week') {
      const periodStart = new Date(timeline.period_start + 'T12:00:00');
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);

      if (occDate >= periodStart && occDate <= periodEnd) {
        return timeline.themes.join(', ');
      }
    }
  }

  return '';
}

// ============================================================
// PAUSAS DO PLANO DE ESTUDOS (ETAPA 7)
// ============================================================

/**
 * Converte campos camelCase do RxDB para snake_case esperado pelo SQL (salvar_study_plan_pauses_batch).
 */
function toPauseSyncPayload(pause: StudyPlanPause): Record<string, any> {
  return {
    id: pause.id,
    user_id: pause.user_id,
    start_date: pause.start_date,
    end_date: pause.end_date,
    reason: pause.reason,
    created_at: pause.created_at,
    updated_at: pause.updated_at,
    is_deleted: pause.isDeleted,
  };
}

/**
 * Cria uma pausa no plano de estudos.
 * Validação: start_date >= hoje (feita na UI).
 */
export async function createStudyPlanPause(data: Omit<StudyPlanPause, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'isDeleted'>): Promise<StudyPlanPause> {
  const userId = await assertUserId();
  const db = await getDb();
  const now = nowISO();

  const pause: StudyPlanPause = {
    id: uid(),
    user_id: userId,
    ...data,
    created_at: now,
    updated_at: now,
    isDeleted: false,
  };

  await db.study_plan_pauses.insert(pause);
  await enqueueOperation('create', 'study_plan_pauses', toPauseSyncPayload(pause));
  return pause;
}

/**
 * Atualiza uma pausa existente.
 */
export async function updateStudyPlanPause(id: string, data: Partial<Omit<StudyPlanPause, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_plan_pauses.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Pausa não encontrada');

  const updated = { ...doc.toJSON(), ...data, updated_at: nowISO() };
  await doc.patch(updated);
  await enqueueOperation('update', 'study_plan_pauses', toPauseSyncPayload(updated));
}

/**
 * Exclui uma pausa (soft delete).
 */
export async function deleteStudyPlanPause(id: string): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();

  const doc = await db.study_plan_pauses.findOne({ selector: { id, user_id: userId } }).exec();
  if (!doc) throw new Error('Pausa não encontrada');

  await doc.patch({ isDeleted: true, updated_at: nowISO() });
  // Para delete, o SQL usa apenas { id }, mas mantemos consistência
  await enqueueOperation('delete', 'study_plan_pauses', { id });
}

/**
 * Busca todas as pausas do usuário (não deletadas).
 */
export async function getStudyPlanPauses(userId?: string): Promise<StudyPlanPause[]> {
  const uid = userId || (await assertUserId());
  const db = await getDb();

  const docs = await db.study_plan_pauses.find({
    selector: { user_id: uid, isDeleted: { $ne: true } },
  }).exec();

  return docs.map(d => d.toJSON() as StudyPlanPause);
}

/**
 * Subscribe reativo às pausas do usuário.
 */
export function subscribeStudyPlanPauses(userId: string, callback: (pauses: StudyPlanPause[]) => void): () => void {
  let unsub: (() => void) | null = null;

  (async () => {
    const db = await getDb();
    if (!db.collections?.study_plan_pauses) return;

    const initial = await db.study_plan_pauses.find({
      selector: { user_id: userId, isDeleted: { $ne: true } },
    }).exec();
    callback(initial.map(d => d.toJSON() as StudyPlanPause));

    const subscription = db.collections.study_plan_pauses.$.subscribe(() => {
      db.study_plan_pauses.find({
        selector: { user_id: userId, isDeleted: { $ne: true } },
      }).exec().then(docs => {
        callback(docs.map(d => d.toJSON() as StudyPlanPause));
      });
    });

    unsub = () => subscription.unsubscribe();
  })();

  return () => { if (unsub) unsub(); };
}

/**
 * "Retomar agora" = define end_date da pausa ativa como ontem.
 * Se houver múltiplas pausas ativas, atualiza a que começou mais recentemente.
 */
export async function resumeStudyPlanNow(): Promise<void> {
  const userId = await assertUserId();
  const db = await getDb();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toISOString().split('T')[0];

  const pausas = await db.study_plan_pauses.find({
    selector: {
      user_id: userId,
      isDeleted: { $ne: true },
      start_date: { $lte: hoje.toISOString().split('T')[0] },
      end_date: { $gte: hoje.toISOString().split('T')[0] },
    },
  }).exec();

  if (pausas.length === 0) return;

  // Atualiza a pausa mais recente (maior start_date)
  const pausaAtiva = pausas.reduce((latest, current) => {
    return current.start_date > latest.start_date ? current : latest;
  });

  await pausaAtiva.patch({ end_date: ontemStr, updated_at: nowISO() });
  await enqueueOperation('update', 'study_plan_pauses', toPauseSyncPayload(pausaAtiva.toJSON()));
}

/**
 * Verifica se uma data está dentro de uma pausa ativa.
 * Retorna a pausa se a data estiver no intervalo, senão null.
 */
export function getActivePauseForDate(pauses: StudyPlanPause[], dateStr: string): StudyPlanPause | null {
  const date = new Date(dateStr + 'T12:00:00');
  date.setHours(0, 0, 0, 0);

  for (const pause of pauses) {
    const start = new Date(pause.start_date + 'T00:00:00');
    const end = new Date(pause.end_date + 'T00:00:00');
    if (date >= start && date <= end) {
      return pause;
    }
  }
  return null;
}

/**
 * Verifica se uma ocorrência deve ser suprimida por pausa.
 * NÃO suprime se:
 * - status === 'done' ou 'missed' (histórico preservado)
 * - isOverride === true (tem override salvo)
 * - isDeleted === true (já excluída individualmente)
 */
export function shouldSuppressByPause(
  event: { date: string; status: OccurrenceStatus; isOverride?: boolean; isDeleted?: boolean },
  pauses: StudyPlanPause[]
): boolean {
  const pause = getActivePauseForDate(pauses, event.date);
  if (!pause) return false;

  // Histórico preservado: done, missed, overrides, exclusões individuais
  if (event.status === 'done' || event.status === 'missed') return false;
  if (event.isOverride) return false;
  if (event.isDeleted) return false;

  return true;
}

// ============================================================
// ESTATÍSTICAS: HORAS PLANEJADAS VS EFETIVAS (FASE 4 - M2)
// ============================================================

export interface StudyStatistics {
  plannedMinutes: number;
  effectiveMinutes: number;
  adherence: number; // 0 se planned=0, sem cap (>100% possível)
  daysWithActivity: number;
  plannedCount: number;
  effectiveCount: number;
}

/**
 * Calcula estatísticas de aderência: horas planejadas vs horas efetivas.
 * - plannedMinutes: soma das durações das ocorrências NÃO suprimidas por pausa e não is_deleted
 *   (INDEPENDENTE do status: missed também foi planejado)
 * - effectiveMinutes: soma dos study_records (manuais + auto, isDeleted=false) no período
 * - adherence: effective/planned (0 se planned=0, sem cap)
 * - daysWithActivity: dias com ≥1 registro efetivo
 * - plannedCount: número de ocorrências planejadas
 * - effectiveCount: número de registros efetivos
 */
export async function getStudyStatistics(
  userId: string,
  startDate: string,
  endDate: string
): Promise<StudyStatistics> {
  const db = await getDb();

  // 1. Buscar pausas do usuário para excluir ocorrências suprimidas
  const pauses = await db.study_plan_pauses.find({
    selector: { user_id: userId, isDeleted: { $ne: true } },
  }).exec();
  const pausesList = pauses.map((d) => d.toJSON() as StudyPlanPause);

  // 2. Buscar ocorrências planejadas no período (não isDeleted)
  const occDocs = await db.study_occurrences.find({
    selector: {
      user_id: userId,
      occurrence_date: { $gte: startDate, $lte: endDate },
      isDeleted: { $ne: true },
    },
  }).exec();

  let plannedMinutes = 0;
  let plannedCount = 0;

  for (const doc of occDocs) {
    const occ = doc.toJSON() as StudyOccurrence;

    // Verificar se está suprimida por pausa
    const suppressed = shouldSuppressByPause(
      { date: occ.occurrence_date, status: occ.status, isOverride: !!occ.override_theme, isDeleted: occ.isDeleted },
      pausesList
    );

    if (suppressed) continue;

    // Calcular duração da ocorrência
    const [sh, sm] = occ.start_time.split(':').map(Number);
    const [eh, em] = occ.end_time.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;

    plannedMinutes += endMin - startMin;
    plannedCount++;
  }

  // 3. Buscar registros de estudo efetivos no período (manuais + auto, não deletados)
  const recordDocs = await db.study_records.find({
    selector: {
      user_id: userId,
      date: { $gte: startDate, $lte: endDate },
      isDeleted: { $ne: true },
    },
  }).exec();

  let effectiveMinutes = 0;
  let effectiveCount = 0;
  const daysWithActivitySet = new Set<string>();

  for (const doc of recordDocs) {
    const record = doc.toJSON() as any;
    effectiveMinutes += record.duration || 0;
    effectiveCount++;
    if (record.date) daysWithActivitySet.add(record.date);
  }

  const adherence = plannedMinutes > 0 ? effectiveMinutes / plannedMinutes : 0;

  return {
    plannedMinutes,
    effectiveMinutes,
    adherence,
    daysWithActivity: daysWithActivitySet.size,
    plannedCount,
    effectiveCount,
  };
}

/**
 * Hook reativo para estatísticas de estudo via subscriptions existentes.
 * Usa subscribeStudyOccurrences + subscribeStudyPlanPauses + listener de study_records.
 */
export function useStudyStatistics(
  userId: string,
  startDate: string,
  endDate: string,
  callback: (stats: StudyStatistics) => void
): () => void {
  let unsubOccurrences: (() => void) | null = null;
  let unsubPauses: (() => void) | null = null;
  let unsubRecords: (() => void) | null = null;
  let isActive = true;

  const recalc = async () => {
    if (!isActive) return;
    try {
      const stats = await getStudyStatistics(userId, startDate, endDate);
      callback(stats);
    } catch (e) {
      console.warn('[useStudyStatistics] Erro ao recalcular:', e);
    }
  };

  (async () => {
    // Initial load
    await recalc();

    // Subscribe to occurrences
    unsubOccurrences = subscribeStudyOccurrences(userId, recalc);

    // Subscribe to pauses
    unsubPauses = subscribeStudyPlanPauses(userId, recalc);

    // Subscribe to study_records changes
    try {
      const db = await getDb();
      if (db.collections?.study_records) {
        const sub = db.collections.study_records.$.subscribe(recalc);
        unsubRecords = () => sub.unsubscribe();
      }
    } catch (e) {
      console.warn('[useStudyStatistics] Erro ao subscrever study_records:', e);
    }
  })();

  return () => {
    isActive = false;
    if (unsubOccurrences) unsubOccurrences();
    if (unsubPauses) unsubPauses();
    if (unsubRecords) unsubRecords();
  };
}

// ============================================================
// EXPORT ALL
// ============================================================

export const studyPlanService = {
  // Tasks
  createStudyTask,
  updateStudyTask,
  deleteStudyTask,
  getStudyTasks,
  subscribeStudyTasks,

  // Theme Timelines
  createStudyThemeTimeline,
  updateStudyThemeTimeline,
  upsertStudyThemeTimeline,
  deleteStudyThemeTimeline,
  getStudyThemeTimelines,
  subscribeStudyThemeTimelines,

  // Weekly Blocks
  createStudyWeeklyBlock,
  updateStudyWeeklyBlock,
  deleteStudyWeeklyBlock,
  updateWeeklyBlockSeriesFromToday,
  closeWeeklyBlockSeriesFromToday,
  getStudyWeeklyBlocks,
  subscribeStudyWeeklyBlocks,

  // Extra Events
  createStudyExtraEvent,
  updateStudyExtraEvent,
  deleteStudyExtraEvent,
  getStudyExtraEvents,
  subscribeStudyExtraEvents,

  // Occurrences
  createStudyOccurrence,
  bulkCreateStudyOccurrences,
  updateStudyOccurrence,
  updateStudyOccurrenceStatus,
  deleteStudyOccurrence,
  getStudyOccurrencesForDateRange,
  getStudyOccurrencesForWeek,
  subscribeStudyOccurrences,
  upsertOccurrenceOverride,
  setOccurrenceStatus,
  deleteOccurrenceInstance,
  resetOccurrenceOverride,

  // Registro Automático (FASE 3 - M1)
  createAutoStudyRecord,
  removeAutoStudyRecord,

  // Pausas (ETAPA 7)
  createStudyPlanPause,
  updateStudyPlanPause,
  deleteStudyPlanPause,
  getStudyPlanPauses,
  subscribeStudyPlanPauses,
  resumeStudyPlanNow,
  getActivePauseForDate,
  shouldSuppressByPause,

  // Helpers
  resolveThemeForOccurrence,

  // Estatísticas (FASE 4 - M2)
  getStudyStatistics,
  useStudyStatistics,
};