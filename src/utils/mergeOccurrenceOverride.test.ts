// src/utils/mergeOccurrenceOverride.test.ts
// Testes unitários para mergeOccurrenceOverride (ETAPA 6)

import { describe, it, expect } from 'vitest';
import {
  mergeOccurrenceOverride,
  type BaseOccurrenceInput,
} from './mergeOccurrenceOverride';
import type { StudyPlanEvent } from '@/types/study-plan';

function createBaseEvent(overrides: Partial<BaseOccurrenceInput> = {}): BaseOccurrenceInput {
  return {
    id: 'event-1',
    sourceType: 'block',
    sourceId: 'block-123',
    date: '2026-11-23',
    startTime: '19:00',
    endTime: '21:00',
    taskId: 'task-456',
    taskName: 'Teoria - Cardiologia',
    taskColor: '#EF4444',
    activityType: 'theory',
    theme: 'Arritmias',
    status: 'pending',
    ...overrides,
  };
}

describe('mergeOccurrenceOverride', () => {
  it('retorna a ocorrência base intacta quando não há mudanças', () => {
    const base = createBaseEvent();
    const result = mergeOccurrenceOverride(base);

    expect(result.id).toBe('event-1');
    expect(result.date).toBe('2026-11-23');
    expect(result.startTime).toBe('19:00');
    expect(result.endTime).toBe('21:00');
    expect(result.status).toBe('pending');
    expect(result.theme).toBe('Arritmias');
    expect(result.taskName).toBe('Teoria - Cardiologia');
    expect(result.taskColor).toBe('#EF4444');
    expect(result.isOverride).toBe(false);
  });

  it('aplica toggle de status (pending -> done)', () => {
    const base = createBaseEvent();
    const result = mergeOccurrenceOverride(base, { status: 'done' });

    expect(result.status).toBe('done');
    expect(result.isOverride).toBe(true);
  });

  it('aplica override de horário (startTime / endTime)', () => {
    const base = createBaseEvent();
    const result = mergeOccurrenceOverride(base, {
      start_time: '20:00',
      end_time: '22:00',
    });

    expect(result.startTime).toBe('20:00');
    expect(result.endTime).toBe('22:00');
    expect(result.isOverride).toBe(true);
  });

  it('aplica override_theme substituindo o tema resolvido por P1', () => {
    const base = createBaseEvent({ theme: 'Tema P1 Inicial' });
    const result = mergeOccurrenceOverride(base, {
      override_theme: 'Tema Customizado',
    });

    expect(result.theme).toBe('Tema Customizado');
    expect(result.isOverride).toBe(true);
  });

  it('override_theme com string vazia ou whitespace faz fallback para o tema base P1', () => {
    const base = createBaseEvent({ theme: 'Tema P1 Resolvido' });
    const result = mergeOccurrenceOverride(base, {
      override_theme: '   ',
    });

    expect(result.theme).toBe('Tema P1 Resolvido');
  });

  it('preserva os campos denormalizados da tarefa intactos', () => {
    const base = createBaseEvent({
      taskId: 't-100',
      taskName: 'Questões - Português',
      taskColor: '#3B82F6',
      activityType: 'questions',
    });

    const result = mergeOccurrenceOverride(base, {
      status: 'missed',
      start_time: '14:00',
    });

    expect(result.taskId).toBe('t-100');
    expect(result.taskName).toBe('Questões - Português');
    expect(result.taskColor).toBe('#3B82F6');
    expect(result.activityType).toBe('questions');
  });

  it('sinaliza isExtra=true quando a fonte é extra', () => {
    const base = createBaseEvent({ sourceType: 'extra' });
    const result = mergeOccurrenceOverride(base);

    expect(result.isExtra).toBe(true);
  });
});
