// src/utils/mergeOccurrenceOverride.ts
// Helper puro para fusão de ocorrências geradas com seus overrides manuais (ETAPA 6)
// Regra P1: 'theme' persistido em study_occurrences é cache inativo;
// O tema exibido é override_theme ?? tema resolvido pelas timelines.

import type {
  StudyOccurrence,
  StudyPlanEvent,
  OccurrenceStatus,
  SourceType,
} from '@/types/study-plan';

export interface BaseOccurrenceInput {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  date: string;
  startTime: string;
  endTime: string;
  taskId: string;
  taskName: string;
  taskColor: string;
  activityType: any;
  theme: string;
  status: OccurrenceStatus;
}

export interface OccurrenceChanges {
  status?: OccurrenceStatus;
  override_theme?: string | null;
  start_time?: string;
  end_time?: string;
  is_deleted?: boolean;
}

/**
 * Função pura que aplica overrides sobre uma ocorrência base gerada pelo motor.
 * Preserva os campos denormalizados da tarefa (task_id, task_name, task_color, task_activity_type).
 */
export function mergeOccurrenceOverride(
  base: BaseOccurrenceInput | StudyPlanEvent,
  changes?: OccurrenceChanges
): StudyPlanEvent {
  const isEvent = 'date' in base;

  const date = isEvent ? base.date : (base as any).date;
  const startTime = changes?.start_time ?? (isEvent ? base.startTime : (base as any).startTime);
  const endTime = changes?.end_time ?? (isEvent ? base.endTime : (base as any).endTime);
  const status = changes?.status ?? base.status;

  // Regra P1: Se override_theme fornecido e não vazio, ele se sobrepõe ao tema base
  const overrideTheme = changes?.override_theme;
  const finalTheme = (overrideTheme !== undefined && overrideTheme !== null && overrideTheme.trim() !== '')
    ? overrideTheme
    : base.theme;

  const hasOverride = !!changes && (
    changes.status !== undefined ||
    changes.override_theme !== undefined ||
    changes.start_time !== undefined ||
    changes.end_time !== undefined ||
    changes.is_deleted !== undefined
  );

  return {
    id: base.id,
    date,
    startTime,
    endTime,
    taskId: base.taskId,
    taskName: base.taskName,
    taskColor: base.taskColor,
    activityType: base.activityType,
    theme: finalTheme,
    status,
    sourceType: base.sourceType,
    sourceId: base.sourceId,
    isOverride: hasOverride,
    isExtra: base.sourceType === 'extra',
  };
}
