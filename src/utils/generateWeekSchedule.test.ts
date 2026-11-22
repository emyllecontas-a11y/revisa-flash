// src/utils/generateWeekSchedule.test.ts
// Testes Vitest para o motor de geração da semana (ETAPA 3)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateWeekSchedule,
  type GenerateWeekScheduleInput,
} from './generateWeekSchedule';
import type {
  StudyTask,
  StudyThemeTimeline,
  StudyWeeklyBlock,
  StudyExtraEvent,
  StudyOccurrence,
} from '@/types/study-plan';

// ============================================================
// HELPERS DE TESTE
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

describe('generateWeekSchedule', () => {
  describe('Estrutura básica', () => {
    it('retorna semana com 7 dias (Seg→Dom)', () => {
      const result = generateWeekSchedule(baseInput());
      expect(result.days).toHaveLength(7);
      expect(result.days[0].dayName).toBe('Seg');
      expect(result.days[6].dayName).toBe('Dom');
    });

    it('weekStart é a segunda-feira informada', () => {
      const result = generateWeekSchedule(baseInput({ weekStart: '2026-11-16' }));
      expect(result.weekStart).toBe('2026-11-16');
    });

    it('cada dia tem 3 turnos (morning, afternoon, evening)', () => {
      const result = generateWeekSchedule(baseInput());
      for (const day of result.days) {
        expect(day.morning).toBeDefined();
        expect(day.afternoon).toBeDefined();
        expect(day.evening).toBeDefined();
        // night não deve existir (apenas 3 turnos)
        expect(day).not.toHaveProperty('night');
      }
    });

    it('dias têm flags isToday, isPast, isFuture', () => {
      const result = generateWeekSchedule(baseInput());
      for (const day of result.days) {
        expect(typeof day.isToday).toBe('boolean');
        expect(typeof day.isPast).toBe('boolean');
        expect(typeof day.isFuture).toBe('boolean');
      }
    });
  });

  describe('Semana que cruza dois meses', () => {
    it('semana de 2026-11-30 a 2026-12-06 usa timeline de novembro para dias de novembro', () => {
      // Timeline de novembro
      const novTimeline = createTimeline({
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Tema Novembro'],
      });
      // Timeline de dezembro
      const decTimeline = createTimeline({
        id: 'timeline-2',
        period_type: 'month',
        period_start: '2026-12-01',
        themes: ['Tema Dezembro'],
      });

      // Bloco na terça-feira (2026-12-01) - deve usar tema de dezembro
      const block = createBlock({
        weekday: 2, // Terça
        start_time: '19:00',
        end_time: '21:00',
      });

      const result = generateWeekSchedule(
        baseInput({
          weekStart: '2026-11-30', // Segunda 30/11
          blocks: [block],
          timelines: [novTimeline, decTimeline],
        })
      );

      // 30/11 (Seg) - sem bloco
      // 01/12 (Ter) - bloco deve ter tema de dezembro
      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca).toBeDefined();
      expect(terca!.afternoon).toHaveLength(0); // 19:00 é evening
      expect(terca!.evening).toHaveLength(1);
      expect(terca!.evening[0].theme).toBe('Tema Dezembro');
    });

    it('semana de 2026-11-30 a 2026-12-06 usa timeline de novembro para dias de novembro', () => {
      const novTimeline = createTimeline({
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Tema Novembro'],
      });
      const decTimeline = createTimeline({
        id: 'timeline-2',
        period_type: 'month',
        period_start: '2026-12-01',
        themes: ['Tema Dezembro'],
      });

      // Bloco na segunda-feira (2026-11-30) - deve usar tema de novembro
      const block = createBlock({
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
      });

      const result = generateWeekSchedule(
        baseInput({
          weekStart: '2026-11-30',
          blocks: [block],
          timelines: [novTimeline, decTimeline],
        })
      );

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda).toBeDefined();
      expect(segunda!.evening[0].theme).toBe('Tema Novembro');
    });
  });

  describe('Bloco cruzando meia-noite', () => {
    it('bloco 22:00-02:00 pertence ao dia de início e tem duração correta', () => {
      const block = createBlock({
        weekday: 1, // Segunda
        start_time: '22:00',
        end_time: '02:00',
      });

      const result = generateWeekSchedule(baseInput({ blocks: [block] }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda).toBeDefined();
      // 22:00 >= 18:00 → evening
      expect(segunda!.evening).toHaveLength(1);
      expect(segunda!.evening[0].startTime).toBe('22:00');
      expect(segunda!.evening[0].endTime).toBe('02:00');

      // Terça não deve ter o evento (pertence à segunda)
      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca!.morning).toHaveLength(0);
    });
  });

  describe('effective_from impedindo efeito no passado', () => {
    it('bloco com effective_from futura não aparece em dias anteriores', () => {
      // Bloco de SEXTA-FEIRA (weekday: 5) com effective_from na sexta 20/11
      const block = createBlock({
        weekday: 5, // Sexta
        start_time: '19:00',
        end_time: '21:00',
        effective_from: '2026-11-20', // Sexta-feira
      });

      // Semana 16/11 a 22/11
      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
      }));

      // Sexta 20/11 DEVE ter (effective_from é 20/11, mesmo dia)
      const sexta = result.days.find((d) => d.dayName === 'Sex');
      expect(sexta!.evening).toHaveLength(1);

      // Sábado 21/11 NÃO deve ter (bloco é só sexta)
      const sabado = result.days.find((d) => d.dayName === 'Sáb');
      expect(sabado!.evening).toHaveLength(0);
    });

    it('bloco com effective_from no dia aparece nesse dia', () => {
      const block = createBlock({
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
        effective_from: '2026-11-16', // Segunda da semana
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(1);
    });
  });

  describe('Extra somando ocorrências nas semanas marcadas', () => {
    it('extra aparece apenas nas week_starts especificadas', () => {
      const extra = createExtra({
        weekdays: [2], // Terça
        start_time: '14:00',
        end_time: '16:00',
        week_starts: ['2026-11-16', '2026-11-30'], // Apenas semanas de 16/11 e 30/11
      });

      // Semana 16/11 - deve ter o extra
      const result1 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        extras: [extra],
      }));
      const terca1 = result1.days.find((d) => d.dayName === 'Ter');
      expect(terca1!.afternoon).toHaveLength(1);

      // Semana 23/11 - NÃO deve ter (não está em week_starts)
      const result2 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-23',
        extras: [extra],
      }));
      const terca2 = result2.days.find((d) => d.dayName === 'Ter');
      expect(terca2!.afternoon).toHaveLength(0);
    });

    it('extra em múltiplos dias da semana aparece em todos', () => {
      const extra = createExtra({
        weekdays: [1, 3], // Segunda e Quarta
        start_time: '14:00',
        end_time: '16:00',
        week_starts: ['2026-11-16'],
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        extras: [extra],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      const quarta = result.days.find((d) => d.dayName === 'Qua');
      expect(segunda!.afternoon).toHaveLength(1);
      expect(quarta!.afternoon).toHaveLength(1);
    });
  });

  describe('Extra excluindo ocorrências (isDeleted no override)', () => {
    it('override com isDeleted=true remove a ocorrência', () => {
      const block = createBlock({
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
      });

      const override = createOccurrence({
        id: 'override-1',
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        isDeleted: true,
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(0);
    });

    it('override com isDeleted=false mantém a ocorrência', () => {
      const block = createBlock({
        weekday: 1,
        start_time: '19:00',
        end_time: '21:00',
      });

      const override = createOccurrence({
        id: 'override-1',
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        isDeleted: false,
        status: 'done',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(1);
      expect(segunda!.evening[0].status).toBe('done');
    });
  });

  describe('Overrides de status, override_theme e horários', () => {
    it('override de status aplica-se sobre a ocorrência', () => {
      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });
      const override = createOccurrence({
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        status: 'done',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].status).toBe('done');
    });

    it('override_theme substitui tema resolvido', () => {
      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });
      const override = createOccurrence({
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        override_theme: 'Tema Personalizado',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].theme).toBe('Tema Personalizado');
    });

    it('override de horários substitui horários base', () => {
      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });
      const override = createOccurrence({
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        start_time: '20:00',
        end_time: '22:00',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].startTime).toBe('20:00');
      expect(segunda!.evening[0].endTime).toBe('22:00');
    });

    it('override de extra também funciona', () => {
      const extra = createExtra({
        weekdays: [2],
        start_time: '14:00',
        end_time: '16:00',
        week_starts: ['2026-11-16'],
      });
      const override = createOccurrence({
        source_type: 'extra',
        source_id: 'extra-1',
        occurrence_date: '2026-11-17',
        start_time: '14:00',
        end_time: '16:00',
        status: 'missed',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        extras: [extra],
        occurrences: [override],
      }));

      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca!.afternoon[0].status).toBe('missed');
    });
  });

  describe('Prioridade semana > mês na regra period', () => {
    it('timeline de semana tem prioridade sobre timeline de mês na mesma data', () => {
      const weekTimeline = createTimeline({
        id: 'week-tl',
        period_type: 'week',
        period_start: '2026-11-16', // Segunda da semana
        themes: ['Tema Semana'],
      });
      const monthTimeline = createTimeline({
        id: 'month-tl',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Tema Mês'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [monthTimeline, weekTimeline], // ordem não importa
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].theme).toBe('Tema Semana');
    });
  });

  describe('Regras all/none', () => {
    it('theme_rule=all retorna união deduplicada de todos os temas', () => {
      const task = createTask({ theme_rule: 'all' });
      const timeline1 = createTimeline({ themes: ['A', 'B'] });
      const timeline2 = createTimeline({ id: 'tl2', themes: ['B', 'C'] });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        tasks: [task],
        timelines: [timeline1, timeline2],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // Ordem: A, B, C (deduplicado)
      expect(segunda!.evening[0].theme).toBe('A, B, C');
    });

    it('theme_rule=none retorna string vazia', () => {
      const task = createTask({ theme_rule: 'none' });
      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        tasks: [task],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].theme).toBe('');
    });
  });

  describe('Agrupamento por turno e ordenação por horário', () => {
    it('eventos são agrupados corretamente por turno (3 turnos: manhã, tarde, noite)', () => {
      const blocks = [
        createBlock({ id: 'b1', weekday: 1, start_time: '08:00', end_time: '10:00' }), // morning
        createBlock({ id: 'b2', weekday: 1, start_time: '14:00', end_time: '16:00' }), // afternoon
        createBlock({ id: 'b3', weekday: 1, start_time: '19:00', end_time: '21:00' }), // evening
        createBlock({ id: 'b4', weekday: 1, start_time: '22:00', end_time: '23:00' }), // evening (≥18:00)
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks,
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.morning).toHaveLength(1);
      expect(segunda!.afternoon).toHaveLength(1);
      // 19:00 e 22:00 ambos caem em evening (noite)
      expect(segunda!.evening).toHaveLength(2);
      // night não deve existir (apenas 3 turnos)
      expect(segunda!).not.toHaveProperty('night');
    });

    it('evento às 23:00 cai no turno Noite (evening)', () => {
      const block = createBlock({
        id: 'b1',
        weekday: 1,
        start_time: '23:00',
        end_time: '00:30',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // 23:00 >= 18:00 → evening
      expect(segunda!.evening).toHaveLength(1);
      expect(segunda!.evening[0].startTime).toBe('23:00');
    });

    it('eventos no mesmo turno são ordenados por horário de início', () => {
      const blocks = [
        createBlock({ id: 'b1', weekday: 1, start_time: '10:00', end_time: '11:00' }),
        createBlock({ id: 'b2', weekday: 1, start_time: '08:00', end_time: '09:00' }),
        createBlock({ id: 'b3', weekday: 1, start_time: '09:00', end_time: '10:00' }),
      ];

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks,
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.morning[0].startTime).toBe('08:00');
      expect(segunda!.morning[1].startTime).toBe('09:00');
      expect(segunda!.morning[2].startTime).toBe('10:00');
    });

    it('bloco e extra no mesmo horário coexistem (séries diferentes)', () => {
      const block = createBlock({
        id: 'block-1',
        weekday: 1,
        start_time: '19:00',
        end_time: '21:00',
      });
      const extra = createExtra({
        id: 'extra-1',
        weekdays: [1],
        start_time: '19:00',
        end_time: '21:00',
        week_starts: ['2026-11-16'],
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        extras: [extra],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(2);
      // Um é sourceType=block, outro sourceType=extra
      const sourceTypes = segunda!.evening.map((e) => e.sourceType).sort();
      expect(sourceTypes).toEqual(['block', 'extra']);
    });
  });

  describe('Determinismo', () => {
    it('mesma entrada produz mesma saída', () => {
      const input = baseInput({
        weekStart: '2026-11-16',
        blocks: [createBlock({ id: 'b1' }), createBlock({ id: 'b2', weekday: 3 })],
        extras: [createExtra({ id: 'e1' })],
        timelines: [createTimeline()],
        tasks: [createTask()],
      });

      const result1 = generateWeekSchedule(input);
      const result2 = generateWeekSchedule(input);

      expect(result1).toEqual(result2);
    });

    it('ordem de arrays de entrada não afeta saída', () => {
      const input1 = baseInput({
        blocks: [createBlock({ id: 'b1' }), createBlock({ id: 'b2', weekday: 3 })],
      });
      const input2 = baseInput({
        blocks: [createBlock({ id: 'b2', weekday: 3 }), createBlock({ id: 'b1' })],
      });

      const result1 = generateWeekSchedule(input1);
      const result2 = generateWeekSchedule(input2);

      expect(result1).toEqual(result2);
    });
  });

  describe('Anti-duplicidade', () => {
    it('não cria duas ocorrências do mesmo (source_type, source_id, data)', () => {
      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });
      // Mesmo override duas vezes - deve aparecer apenas uma vez
      const override1 = createOccurrence({
        id: 'o1',
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        status: 'done',
      });
      const override2 = createOccurrence({
        id: 'o2',
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        status: 'missed',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        occurrences: [override1, override2],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // Deve ter apenas 1 evento (o último override vence, mas não duplica)
      expect(segunda!.evening).toHaveLength(1);
    });
  });

  describe('effective_until - encerramento de série', () => {
    it('bloco com effective_until não aparece em semanas posteriores', () => {
      // Bloco de SEGUNDA (weekday: 1) com effective_until na sexta 20/11
      const block = createBlock({
        id: 'block-1',
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
        effective_from: '2026-11-02', // Segunda 02/11
        effective_until: '2026-11-20', // Sexta 20/11
      });

      // Semana 02/11 a 08/11 - DEVE ter (effective_from é 02/11, before until)
      const result1 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-02',
        blocks: [block],
      }));
      const segunda1 = result1.days.find((d) => d.dayName === 'Seg');
      expect(segunda1!.evening).toHaveLength(1);

      // Semana 16/11 a 22/11 - DEVE ter (20/11 é dentro do range)
      const result2 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
      }));
      const segunda2 = result2.days.find((d) => d.dayName === 'Seg');
      expect(segunda2!.evening).toHaveLength(1);

      // Semana 23/11 a 29/11 - NÃO deve ter (após effective_until de 20/11)
      const result3 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-23',
        blocks: [block],
      }));
      const segunda3 = result3.days.find((d) => d.dayName === 'Seg');
      expect(segunda3!.evening).toHaveLength(0);
    });

    it('bloco sem effective_until continua aparecendo indefinidamente', () => {
      const block = createBlock({
        id: 'block-1',
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
        effective_from: '2026-11-02',
        // effective_until = null (padrão)
      });

      // Semana 02/11
      const result1 = generateWeekSchedule(baseInput({
        weekStart: '2026-11-02',
        blocks: [block],
      }));
      const segunda1 = result1.days.find((d) => d.dayName === 'Seg');
      expect(segunda1!.evening).toHaveLength(1);

      // Semana muito futura 2027 - ainda deve aparecer
      const result2 = generateWeekSchedule(baseInput({
        weekStart: '2027-06-14',
        blocks: [block],
      }));
      const segunda2 = result2.days.find((d) => d.dayName === 'Seg');
      expect(segunda2!.evening).toHaveLength(1);
    });

    it('bloco com effective_until no mesmo dia effective_from aparece apenas nesse dia', () => {
      const block = createBlock({
        id: 'block-1',
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
        effective_from: '2026-11-16', // Segunda
        effective_until: '2026-11-16', // Segunda (mesmo dia)
      });

      // Semana 16/11 a 22/11
      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening).toHaveLength(1);

      // Terça não deve ter (weekday é 1 = Segunda)
      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca!.evening).toHaveLength(0);
    });

    it('edição "a partir de hoje": bloco antigo encerrado ontem + novo bloco a partir de hoje', () => {
      const hoje = '2026-11-20'; // Sexta
      const ontem = '2026-11-19'; // Quinta
      const segundaPassada = '2026-11-16'; // Segunda

      // Bloco ORIGINAL: vale a partir de 16/11 até ONTEM (19/11)
      const blockAntigo = createBlock({
        id: 'block-1',
        weekday: 1, // Segunda
        start_time: '19:00',
        end_time: '21:00',
        effective_from: segundaPassada,
        effective_until: ontem,
      });

      // Bloco NOVO: vale a partir de HOJE (20/11) sem fim
      const blockNovo = createBlock({
        id: 'block-2',
        weekday: 1, // Segunda (mesmo dia da semana)
        start_time: '20:00', // Novo horário
        end_time: '22:00',
        effective_from: hoje, // 20/11
        // effective_until = null
      });

      // Semana 16/11 a 22/11 (semana atual) - DEVE ter o bloco ANTIGO na segunda 16/11
      const resultSemanaAtual = generateWeekSchedule(baseInput({
        weekStart: segundaPassada,
        blocks: [blockAntigo, blockNovo],
      }));
      const segundaAtual = resultSemanaAtual.days.find((d) => d.dayName === 'Seg');
      expect(segundaAtual!.evening).toHaveLength(1);
      expect(segundaAtual!.evening[0].startTime).toBe('19:00'); // Horário antigo

      // Semana 23/11 a 29/11 - DEVE ter o bloco NOVO na segunda 23/11
      const resultSemanaProxima = generateWeekSchedule(baseInput({
        weekStart: '2026-11-23',
        blocks: [blockAntigo, blockNovo],
      }));
      const segundaProxima = resultSemanaProxima.days.find((d) => d.dayName === 'Seg');
      expect(segundaProxima!.evening).toHaveLength(1);
      expect(segundaProxima!.evening[0].startTime).toBe('20:00'); // Novo horário

      // Semana 09/11 a 15/11 (semana PASSADA, antes do effective_from) - NÃO deve ter nada
      const resultSemanaPassada = generateWeekSchedule(baseInput({
        weekStart: '2026-11-09',
        blocks: [blockAntigo, blockNovo],
      }));
      const segundaPassadaCheck = resultSemanaPassada.days.find((d) => d.dayName === 'Seg');
      expect(segundaPassadaCheck!.evening).toHaveLength(0);
    });
  });

  describe('Propagação de topic_id (Integração Conteúdos)', () => {
    it('propaga topic_id da timeline para ocorrências de bloco', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional'],
        topic_ids: ['topic-uuid-123', 'topic-uuid-456'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda).toBeDefined();
      expect(segunda!.evening).toHaveLength(1);
      // Deve propagar o primeiro topic_id da timeline
      expect(segunda!.evening[0].topicId).toBe('topic-uuid-123');
    });

    it('propaga topic_id da timeline para ocorrências de extra', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Administrativo'],
        topic_ids: ['topic-uuid-789'],
      });

      const extra = createExtra({
        weekdays: [2], // Terça
        start_time: '14:00',
        end_time: '16:00',
        week_starts: ['2026-11-16'],
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        extras: [extra],
        timelines: [timeline],
      }));

      const terca = result.days.find((d) => d.dayName === 'Ter');
      expect(terca).toBeDefined();
      expect(terca!.afternoon).toHaveLength(1);
      expect(terca!.afternoon[0].topicId).toBe('topic-uuid-789');
    });

    it('timeline sem topic_ids resulta em topicId null', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional'],
        topic_ids: [], // vazio
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].topicId).toBeNull();
    });

    it('timeline com topic_ids undefined resulta em topicId null', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional'],
        // topic_ids undefined (não passado)
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].topicId).toBeNull();
    });

    it('prioridade semana > mês também se aplica ao topic_id', () => {
      const weekTimeline = createTimeline({
        id: 'week-tl',
        period_type: 'week',
        period_start: '2026-11-16', // Segunda da semana
        themes: ['Tema Semana'],
        topic_ids: ['topic-week-uuid'],
      });
      const monthTimeline = createTimeline({
        id: 'month-tl',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Tema Mês'],
        topic_ids: ['topic-month-uuid'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [monthTimeline, weekTimeline], // ordem não importa
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // Deve usar topic_id da timeline de semana (prioridade)
      expect(segunda!.evening[0].topicId).toBe('topic-week-uuid');
      // Tema também deve vir da timeline de semana
      expect(segunda!.evening[0].theme).toBe('Tema Semana');
    });

    it('tema string continua sendo resolvido corretamente (compatibilidade UI legada)', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional', 'Direito Administrativo'],
        topic_ids: ['topic-uuid-123'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // Tema resolvido pela string (para UI legada e OccurrenceModal)
      expect(segunda!.evening[0].theme).toBe('Direito Constitucional, Direito Administrativo');
      // topic_id também propagado
      expect(segunda!.evening[0].topicId).toBe('topic-uuid-123');
    });

    it('override de occurrence preserva topic_id do base', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional'],
        topic_ids: ['topic-uuid-123'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      // Override sem topic_id (deve herdar do base)
      const override = createOccurrence({
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        status: 'done',
        start_time: '20:00',
        end_time: '22:00',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      expect(segunda!.evening[0].topicId).toBe('topic-uuid-123');
      expect(segunda!.evening[0].startTime).toBe('20:00');
    });

    it('override com topic_id próprio sobrescreve o do base', () => {
      const timeline = createTimeline({
        id: 'timeline-1',
        period_type: 'month',
        period_start: '2026-11-01',
        themes: ['Direito Constitucional'],
        topic_ids: ['topic-base-uuid'],
      });

      const block = createBlock({ weekday: 1, start_time: '19:00', end_time: '21:00' });

      // Override COM topic_id próprio
      const override = createOccurrence({
        source_type: 'block',
        source_id: 'block-1',
        occurrence_date: '2026-11-16',
        status: 'done',
        topic_id: 'topic-override-uuid',
      });

      const result = generateWeekSchedule(baseInput({
        weekStart: '2026-11-16',
        blocks: [block],
        timelines: [timeline],
        occurrences: [override],
      }));

      const segunda = result.days.find((d) => d.dayName === 'Seg');
      // Deve usar topic_id do override
      expect(segunda!.evening[0].topicId).toBe('topic-override-uuid');
    });
  });
});