import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCronogramaExcel, validateCronograma, buildImportPreview } from './cronogramaImporter';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn()
}));

import { getDb } from '@/lib/db';

function createMockExcelFile(rotinaExtra: any[][] = [], temasExtra: any[][] = [], tarefasExtra: any[][] = []): File {
  const wb = XLSX.utils.book_new();
  const rotinaData = [
    ['Instrução: Preencha sua rotina semanal'],
    ['Dia', 'Início', 'Fim', 'Disciplina', 'Tópico', 'Atividade', 'Cor'],
    ['Segunda', '07:15', '08:45', 'Português', 'Sílaba', 'theory', '#3B82F6'],
    ['Domingo', '19:30', '20:30', 'Revisão', 'Geral', 'review', '#F59E0B'],
    ...rotinaExtra
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rotinaData), 'Rotina');
  const temasData = [
    ['Instrução: Defina quais assuntos estudar'],
    ['Período início', 'Período fim', 'Tipo', 'Disciplina', 'Tópico'],
    ['2026-09-21', '2026-09-27', 'semana', 'Português', 'Sílaba'],
    ...temasExtra
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(temasData), 'Temas');
  const tarefasData = [
    ['Instrução: Opcional'],
    ['Nome', 'Tipo', 'Duração', 'Cor', 'Regra'],
    ['Teoria', 'theory', '90', '#3B82F6', 'period'],
    ...tarefasExtra
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tarefasData), 'Tarefas');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return new File([blob], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

describe('parseCronogramaExcel', () => {
  it('deve parsear Excel válido com 3 abas e dados corretos', async () => {
    const file = createMockExcelFile();
    const result = await parseCronogramaExcel(file);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].weekday).toBe(1);
    expect(result.blocks[0].start_time).toBe('07:15:00');
    expect(result.blocks[1].weekday).toBe(0);
    expect(result.timelines).toHaveLength(1);
    expect(result.timelines[0].period_type).toBe('week');
    expect(result.timelines[0].period_start).toBe('2026-09-21');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].name).toBe('Teoria');
    expect(result.errors).toHaveLength(0);
  });

  it('deve gerar erro para dia inválido', async () => {
    const file = createMockExcelFile([['Segundax', '07:15', '08:45', 'Português', '', 'theory', '']]);
    const result = await parseCronogramaExcel(file);
    expect(result.errors.some(e => e.includes('dia inválido'))).toBe(true);
  });

  it('deve gerar erro para horário inválido', async () => {
    const file = createMockExcelFile([['Segunda', '25:99', '08:45', 'Português', '', 'theory', '']]);
    const result = await parseCronogramaExcel(file);
    expect(result.errors.some(e => e.toLowerCase().includes('horário inválido'))).toBe(true);
  });

  it('deve gerar warning para disciplina ausente', async () => {
    const file = createMockExcelFile([['Segunda', '07:15', '08:45', '', '', 'theory', '']]);
    const result = await parseCronogramaExcel(file);
    expect(result.warnings.some(w => w.includes('obrigatório'))).toBe(true);
  });
});

describe('validateCronograma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve fazer match de tópicos case-insensitive', async () => {
    const mockDb = {
      topics: {
        find: () => ({
          exec: async () => [
            { toJSON: () => ({ id: '1', name: 'Direitos Fundamentais', user_id: 'u1', isDeleted: false }) },
            { toJSON: () => ({ id: '2', name: 'Interpretação de Textos', user_id: 'u1', isDeleted: false }) }
          ]
        })
      }
    };
    (getDb as any).mockResolvedValue(mockDb);
    const data = {
      tasks: [],
      timelines: [
        { period_type: 'month' as const, period_start: '2026-11-01', discipline: 'Direito Constitucional', topic: 'direitos fundamentais' },
        { period_type: 'month' as const, period_start: '2026-11-01', discipline: 'Português', topic: 'INTERPRETAÇÃO DE TEXTOS' }
      ],
      blocks: [],
      warnings: [],
      errors: []
    };
    const result = await validateCronograma(data, 'u1');
    expect(result.topicMatches.size).toBe(2);
    expect(result.topicMisses).toHaveLength(0);
  });

  it('deve registrar tópicos não encontrados', async () => {
    const mockDb = {
      topics: {
        find: () => ({
          exec: async () => [
            { toJSON: () => ({ id: '1', name: 'Direitos Fundamentais', user_id: 'u1', isDeleted: false }) }
          ]
        })
      }
    };
    (getDb as any).mockResolvedValue(mockDb);
    const data = {
      tasks: [],
      timelines: [
        { period_type: 'month' as const, period_start: '2026-11-01', discipline: 'Direito Constitucional', topic: 'Direitos Fundamentais' },
        { period_type: 'month' as const, period_start: '2026-11-01', discipline: 'Português', topic: 'Gramática' }
      ],
      blocks: [],
      warnings: [],
      errors: []
    };
    const result = await validateCronograma(data, 'u1');
    expect(result.topicMatches.size).toBe(1);
    expect(result.topicMisses).toContain('Gramática');
    expect(result.warnings.some(w => w.includes('não encontrado'))).toBe(true);
  });
});

describe('buildImportPreview', () => {
  it('deve gerar preview com contagens corretas', () => {
    const validated = {
      tasks: [{ name: 'Teoria', activity_type: 'theory', duration_min: 90, color: '#3B82F6', theme_rule: 'period' }],
      timelines: [{ period_type: 'week' as const, period_start: '2026-09-21', discipline: 'Português', topic: 'Sílaba' }],
      blocks: [{ weekday: 1, start_time: '07:15:00', end_time: '08:45:00', discipline: 'Português', activity_type: 'theory' }],
      warnings: ['Aviso 1'],
      errors: [],
      topicMatches: new Map([['Sílaba', 'uuid-1']]),
      topicMisses: ['Gramática']
    };
    const preview = buildImportPreview(validated);
    expect(preview.taskCount).toBe(1);
    expect(preview.timelineCount).toBe(1);
    expect(preview.blockCount).toBe(1);
    expect(preview.topicMatchCount).toBe(1);
    expect(preview.topicMissCount).toBe(1);
    expect(preview.warnings).toHaveLength(1);
  });

  it('deve lidar com arrays vazios', () => {
    const validated = {
      tasks: [], timelines: [], blocks: [],
      warnings: [], errors: [],
      topicMatches: new Map(), topicMisses: []
    };
    const preview = buildImportPreview(validated);
    expect(preview.taskCount).toBe(0);
    expect(preview.timelineCount).toBe(0);
    expect(preview.blockCount).toBe(0);
  });
});