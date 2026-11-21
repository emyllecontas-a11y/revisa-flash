// src/utils/generateWeekSchedule.pause.test.ts
// Testes Vitest para supressão de ocorrências por pausa (ETAPA 7)

import { describe, it, expect } from "vitest";
import {
  generateWeekSchedule,
  type GenerateWeekScheduleInput,
} from "./generateWeekSchedule";
import type {
  StudyTask,
  StudyThemeTimeline,
  StudyWeeklyBlock,
  StudyExtraEvent,
  StudyOccurrence,
  StudyPlanPause,
} from "@/types/study-plan";

// ============================================================
// HELPERS DE TESTE - REUTILIZANDO OS MESMOS BUILDERS DO ARQUIVO BASE (generateWeekSchedule.test.ts)
// ============================================================

function createTask(overrides: Partial<StudyTask> = {}): StudyTask {
  return {
    id: 'task-1',
    user_id: 'user-1',
    name: 'Teoria - Direito Constitucional',
    activity_type: 'theory',
    color: '#3B82F6',
    theme_rule: 'period',
    default_duration_min: 90,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function createTimeline(overrides: Partial<StudyThemeTimeline> = {}): StudyThemeTimeline {
  return {
    id: 'timeline-1',
    user_id: 'user-1',
    period_type: 'month',
    period_start: '2026-11-01',
    themes: ['Direito Constitucional', 'Direito Administrativo'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function createBlock(overrides: Partial<StudyWeeklyBlock> = {}): StudyWeeklyBlock {
  return {
    id: 'block-1',
    user_id: 'user-1',
    task_id: 'task-1',
    weekday: 1, // Segunda
    start_time: '19:00',
    end_time: '21:00',
    effective_from: '2026-11-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function createExtra(overrides: Partial<StudyExtraEvent> = {}): StudyExtraEvent {
  return {
    id: 'extra-1',
    user_id: 'user-1',
    task_id: 'task-1',
    weekdays: [2], // Terça
    start_time: '14:00',
    end_time: '16:00',
    week_starts: ['2026-11-16'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function createOccurrence(overrides: Partial<StudyOccurrence> = {}): StudyOccurrence {
  return {
    id: 'occ-1',
    user_id: 'user-1',
    source_type: 'block',
    source_id: 'block-1',
    occurrence_date: '2026-11-16',
    start_time: '19:00',
    end_time: '21:00',
    task_id: 'task-1',
    task_name: 'Teoria - Direito Constitucional',
    task_color: '#3B82F6',
    task_activity_type: 'theory',
    theme: 'Direito Constitucional',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function createPause(overrides: Partial<StudyPlanPause> = {}): StudyPlanPause {
  return {
    id: 'pause-1',
    user_id: 'user-1',
    start_date: '2026-11-20',
    end_date: '2026-11-26',
    reason: 'Viagem',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<GenerateWeekScheduleInput> = {}): GenerateWeekScheduleInput {
  return {
    weekStart: '2026-11-16', // Segunda-feira
    blocks: [],
    extras: [],
    timelines: [createTimeline()],
    tasks: [createTask()],
    occurrences: [],
    ...overrides,
  };
}

// ============================================================
// TESTES
// ============================================================

describe('generateWeekSchedule - supressão por pausa (ETAPA 7)', () => {
  const weekStart = '2026-11-16'; // Segunda 16/11 a Domingo 22/11

  describe('Supressão básica dentro da janela de pausa', () => {
    it('suprime ocorrências em dias dentro do intervalo de pausa', () => {
      // Pausa de 20/11 (sexta) a 26/11 (quinta) - afeta Sex 20/11, Sáb 21/11, Dom 22/11
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      // Blocos para todos os dias da semana (Seg-Dom)
      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }), // Seg 16/11
        createBlock({ id: 'b2', weekday: 2 }), // Ter 17/11
        createBlock({ id: 'b3', weekday: 3 }), // Qua 18/11
        createBlock({ id: 'b4', weekday: 4 }), // Qui 19/11
        createBlock({ id: 'b5', weekday: 5 }), // Sex 20/11
        createBlock({ id: 'b6', weekday: 6 }), // Sáb 21/11
        createBlock({ id: 'b7', weekday: 0 }), // Dom 22/11
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
      }));

      // Segunda 16/11 a Quinta 19/11: devem ter evento
      const segunda = result.days.find((d) => d.dayName === 'Seg');
      const terca = result.days.find((d) => d.dayName === 'Ter');
      const quarta = result.days.find((d) => d.dayName === 'Qua');
      const quinta = result.days.find((d) => d.dayName === 'Qui');
      expect(segunda!.evening).toHaveLength(1);
      expect(terca!.evening).toHaveLength(1);
      expect(quarta!.evening).toHaveLength(1);
      expect(quinta!.evening).toHaveLength(1);

      // Sexta 20/11 a Domingo 22/11: devem estar suprimidos
      const sexta = result.days.find((d) => d.dayName === 'Sex');
      const sabado = result.days.find((d) => d.dayName === 'Sáb');
      const domingo = result.days.find((d) => d.dayName === 'Dom');
      expect(sexta!.evening).toHaveLength(0);
      expect(sabado!.evening).toHaveLength(0);
      expect(domingo!.evening).toHaveLength(0);
    });

    it('não suprime dias fora do intervalo de pausa', () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }),
        createBlock({ id: 'b2', weekday: 2 }),
        createBlock({ id: 'b3', weekday: 3 }),
        createBlock({ id: 'b4', weekday: 4 }),
        createBlock({ id: 'b5', weekday: 5 }),
        createBlock({ id: 'b6', weekday: 6 }),
        createBlock({ id: 'b7', weekday: 0 }),
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-02', // Semana anterior (02/11 a 08/11)
        blocks,
        pauses: [pause],
      }));

      // Todos os dias devem ter evento (pausa é semana seguinte)
      for (const day of result.days) {
        expect(day.evening).toHaveLength(1);
      }
    });
  });

  describe('Histórico preservado: status done/missed não são suprimidos', () => {
    it("ocorrência com status 'done' dentro da pausa NÃO é suprimida", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })]; // Sex 20/11

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20', // Sexta dentro da pausa
        status: 'done',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(1);
      expect(sexta!.evening[0].status).toBe('done');
    });

    it("ocorrência com status 'missed' dentro da pausa NÃO é suprimida", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })];

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20',
        status: 'missed',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(1);
      expect(sexta!.evening[0].status).toBe('missed');
    });

    it("ocorrência com status 'pending' dentro da pausa É suprimida", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })];

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20',
        status: 'pending',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(0);
    });
  });

  describe('Overrides manuais não são suprimidos', () => {
    it("ocorrência com isOverride=true (horário alterado) NÃO é suprimida", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })];

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20',
        start_time: '20:00', // Override de horário
        end_time: '22:00',
        status: 'pending',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(1);
      expect(sexta!.evening[0].startTime).toBe('20:00');
    });

    it("ocorrência com override_theme NÃO é suprimida", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })];

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20',
        override_theme: 'Tema Customizado',
        status: 'pending',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(1);
      expect(sexta!.evening[0].theme).toBe('Tema Customizado');
    });
  });

  describe('Ocorrências já excluídas individualmente (isDeleted) não são suprimidas (já não existem)', () => {
    it("ocorrência com isDeleted=true não aparece (já filtrada antes)", () => {
      const pause = createPause({
        start_date: '2026-11-20',
        end_date: '2026-11-26',
      });

      const blocks = [createBlock({ id: 'b5', weekday: 5 })];

      const override = createOccurrence({
        source_type: 'block',
        source_id: 'b5',
        occurrence_date: '2026-11-20',
        isDeleted: true,
      });

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pause],
        occurrences: [override],
      }));

      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(0); // isDeleted já remove antes da pausa
    });
  });

  describe('Múltiplas pausas', () => {
    it('aplica a pausa que engloba a data', () => {
      const pausa1 = createPause({
        id: 'pause-1',
        start_date: '2026-11-10',
        end_date: '2026-11-12',
      });
      const pausa2 = createPause({
        id: 'pause-2',
        start_date: '2026-11-20',
        end_date: '2026-11-22',
      });

      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }),
        createBlock({ id: 'b2', weekday: 2 }),
        createBlock({ id: 'b3', weekday: 3 }),
        createBlock({ id: 'b4', weekday: 4 }),
        createBlock({ id: 'b5', weekday: 5 }),
        createBlock({ id: 'b6', weekday: 6 }),
        createBlock({ id: 'b7', weekday: 0 }),
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [pausa1, pausa2],
      }));

      // Pausa 1 não afeta esta semana (16-22/11)
      // Pausa 2 afeta Sex 20/11, Sáb 21/11, Dom 22/11
      const sexta = result.days.find((d) => d.dayName === 'Sex');
      const sabado = result.days.find((d) => d.dayName === 'Sáb');
      const domingo = result.days.find((d) => d.dayName === 'Dom');
      expect(sexta!.evening).toHaveLength(0);
      expect(sabado!.evening).toHaveLength(0);
      expect(domingo!.evening).toHaveLength(0);

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(1);
    });
  });

  describe('Sem pausa (array vazio ou undefined)', () => {
    it('funciona normalmente sem pausas', () => {
      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }),
        createBlock({ id: 'b2', weekday: 2 }),
        createBlock({ id: 'b3', weekday: 3 }),
        createBlock({ id: 'b4', weekday: 4 }),
        createBlock({ id: 'b5', weekday: 5 }),
        createBlock({ id: 'b6', weekday: 6 }),
        createBlock({ id: 'b7', weekday: 0 }),
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: [],
      }));

      for (const day of result.days) {
        expect(day.evening).toHaveLength(1);
      }
    });

    it('funciona normalmente com pauses undefined', () => {
      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }),
        createBlock({ id: 'b2', weekday: 2 }),
        createBlock({ id: 'b3', weekday: 3 }),
        createBlock({ id: 'b4', weekday: 4 }),
        createBlock({ id: 'b5', weekday: 5 }),
        createBlock({ id: 'b6', weekday: 6 }),
        createBlock({ id: 'b7', weekday: 0 }),
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        pauses: undefined,
      }));

      for (const day of result.days) {
        expect(day.evening).toHaveLength(1);
      }
    });
  });

  describe('Eventos extras também são suprimidos', () => {
    it('extra event dentro da pausa é suprimido', () => {
      const pause = createPause({
        start_date: '2026-11-17', // Terça
        end_date: '2026-11-19',   // Quinta
      });

      const extra = createExtra({
        id: 'extra-1',
        weekdays: [2], // Terça
        start_time: '14:00',
        end_time: '16:00',
        week_starts: ['2026-11-16'],
      });

      const blocks = [
        createBlock({ id: 'b1', weekday: 1 }), // Segunda
        createBlock({ id: 'b2', weekday: 3 }), // Quarta
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart,
        blocks,
        extras: [extra],
        pauses: [pause],
      }));

      // Extra é na terça (weekday 2), que está na pausa
      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca!.afternoon).toHaveLength(0);

      // Quarta também está na pausa
      const quarta = result.days.find((d) => d.dayName === 'Qua');
      expect(quarta!.afternoon).toHaveLength(0); // não há extra na quarta, mas bloco de quarta é evening

      // Segunda não está na pausa
      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(1);
    });
  });
});