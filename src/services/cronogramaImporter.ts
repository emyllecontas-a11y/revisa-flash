import * as XLSX from 'xlsx';
import { getDb } from '@/lib/db';

export interface CronogramaTask {
  name: string;
  activity_type: string;
  duration_min: number;
  color: string;
  theme_rule: string;
}

export interface CronogramaTimeline {
  period_type: 'week' | 'month';
  period_start: string;
  discipline: string;
  topic: string;
}

export interface CronogramaBlock {
  weekday: number;
  start_time: string;
  end_time: string;
  discipline: string;
  topic?: string;
  activity_type: string;
  color?: string;
}

export interface CronogramaImportado {
  tasks: CronogramaTask[];
  timelines: CronogramaTimeline[];
  blocks: CronogramaBlock[];
  warnings: string[];
  errors: string[];
}

export interface ValidationResult {
  tasks: CronogramaTask[];
  timelines: CronogramaTimeline[];
  blocks: CronogramaBlock[];
  warnings: string[];
  errors: string[];
  topicMatches: Map<string, string>;
  topicMisses: string[];
}

export interface ImportPreview {
  taskCount: number;
  timelineCount: number;
  blockCount: number;
  topicMatchCount: number;
  topicMissCount: number;
  warnings: string[];
  errors: string[];
}

export interface ImportResult {
  created: { tasks: number; timelines: number; blocks: number };
  updated: { tasks: number; timelines: number; blocks: number };
  skipped: { tasks: number; timelines: number; blocks: number };
  errors: string[];
}

const DIA_TO_WEEKDAY: Record<string, number> = {
  'domingo': 0, 'segunda': 1, 'segunda-feira': 1,
  'terca': 2, 'terça': 2, 'terca-feira': 2, 'terça-feira': 2,
  'quarta': 3, 'quarta-feira': 3, 'quinta': 4, 'quinta-feira': 4,
  'sexta': 5, 'sexta-feira': 5, 'sabado': 6, 'sábado': 6,
};

const VALID_ACTIVITY_TYPES = new Set(['theory', 'questions', 'review', 'cards', 'exam', 'break', 'other']);
const VALID_THEME_RULES = new Set(['period', 'all', 'none']);

async function readExcelFile(file: File): Promise<{ rotina: any[][]; temas: any[][]; tarefas: any[][] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const rotinaSheet = workbook.Sheets['Rotina'];
  const temasSheet = workbook.Sheets['Temas'];
  const tarefasSheet = workbook.Sheets['Tarefas'];

  if (!rotinaSheet || !temasSheet || !tarefasSheet) {
    throw new Error('Template inválido: faltam abas "Rotina", "Temas" ou "Tarefas"');
  }

  return {
    rotina: XLSX.utils.sheet_to_json(rotinaSheet, { header: 1 }) as any[][],
    temas: XLSX.utils.sheet_to_json(temasSheet, { header: 1 }) as any[][],
    tarefas: XLSX.utils.sheet_to_json(tarefasSheet, { header: 1 }) as any[][]
  };
}

function normalizeTime(time: string): string {
  if (!time) return '';
  const str = String(time).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Horário inválido: "${time}". Use formato HH:MM ou HH:MM:SS`);
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;
  if (h > 23 || m > 59 || s > 59) {
    throw new Error(`Horário inválido: "${time}". Use formato HH:MM ou HH:MM:SS`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function normalizeDate(date: any): string {
  if (!date) return '';
  if (typeof date === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const actualDate = new Date(excelEpoch.getTime() + date * 86400000);
    return actualDate.toISOString().split('T')[0];
  }
  const str = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  throw new Error(`Data inválida: "${date}". Use formato YYYY-MM-DD ou DD/MM/YYYY`);
}

function normalizePeriodType(v: string): 'week' | 'month' | null {
  const lower = String(v).toLowerCase().trim();
  if (lower === 'week' || lower === 'semana') return 'week';
  if (lower === 'month' || lower === 'mês' || lower === 'mes') return 'month';
  return null;
}

export async function parseCronogramaExcel(file: File): Promise<CronogramaImportado> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tasks: CronogramaTask[] = [];
  const timelines: CronogramaTimeline[] = [];
  const blocks: CronogramaBlock[] = [];

  try {
    const { rotina, temas, tarefas } = await readExcelFile(file);

    for (let i = 2; i < rotina.length; i++) {
      const row = rotina[i];
      if (!row || row.length === 0) continue;
      const [dia, inicio, fim, disciplina, topico, atividade, cor] = row;

      if (!dia || !inicio || !fim || !disciplina) {
        warnings.push(`Linha ${i + 1} da aba Rotina: campos obrigatórios faltando`);
        continue;
      }

      const diaLower = String(dia).toLowerCase().trim();
      const weekday = DIA_TO_WEEKDAY[diaLower];
      if (weekday === undefined) {
        errors.push(`Linha ${i + 1} da aba Rotina: dia inválido "${dia}".`);
        continue;
      }

      const activityType = String(atividade || 'theory').toLowerCase().trim();
      if (!VALID_ACTIVITY_TYPES.has(activityType)) {
        errors.push(`Linha ${i + 1} da aba Rotina: atividade inválida "${atividade}".`);
        continue;
      }

      try {
        blocks.push({
          weekday,
          start_time: normalizeTime(inicio),
          end_time: normalizeTime(fim),
          discipline: String(disciplina).trim(),
          topic: topico ? String(topico).trim() : undefined,
          activity_type: activityType,
          color: cor ? String(cor).trim() : undefined,
        });
      } catch (err: any) {
        errors.push(`Linha ${i + 1} da aba Rotina: ${err.message}`);
      }
    }

    for (let i = 2; i < temas.length; i++) {
      const row = temas[i];
      if (!row || row.length === 0) continue;
      const [periodoInicio, periodoFim, tipo, disciplina, topico] = row;

      if (!periodoInicio || !tipo || !disciplina || !topico) {
        warnings.push(`Linha ${i + 1} da aba Temas: campos obrigatórios faltando`);
        continue;
      }

      const periodType = normalizePeriodType(String(tipo).toLowerCase().trim());
      if (!periodType) {
        errors.push(`Linha ${i + 1} da aba Temas: tipo inválido "${tipo}". Use: semana ou mês`);
        continue;
      }

      try {
        timelines.push({
          period_type: periodType,
          period_start: normalizeDate(periodoInicio),
          discipline: String(disciplina).trim(),
          topic: String(topico).trim(),
        });
      } catch (err: any) {
        errors.push(`Linha ${i + 1} da aba Temas: ${err.message}`);
      }
    }

    for (let i = 2; i < tarefas.length; i++) {
      const row = tarefas[i];
      if (!row || row.length === 0) continue;
      const [nome, tipo, duracao, cor, regraTema] = row;

      if (!nome || !tipo || !duracao) {
        warnings.push(`Linha ${i + 1} da aba Tarefas: campos obrigatórios faltando`);
        continue;
      }

      const activityType = String(tipo).toLowerCase().trim();
      if (!VALID_ACTIVITY_TYPES.has(activityType)) {
        errors.push(`Linha ${i + 1} da aba Tarefas: tipo inválido "${tipo}".`);
        continue;
      }

      const themeRule = String(regraTema || 'period').toLowerCase().trim();
      if (!VALID_THEME_RULES.has(themeRule)) {
        errors.push(`Linha ${i + 1} da aba Tarefas: regra de tema inválida "${regraTema}".`);
        continue;
      }

      const durationMin = Number(duracao);
      if (isNaN(durationMin) || durationMin <= 0) {
        errors.push(`Linha ${i + 1} da aba Tarefas: duração inválida "${duracao}".`);
        continue;
      }

      tasks.push({
        name: String(nome).trim(),
        activity_type: activityType,
        duration_min: durationMin,
        color: cor ? String(cor).trim() : '#3B82F6',
        theme_rule: themeRule,
      });
    }
  } catch (err: any) {
    errors.push(`Erro ao ler arquivo: ${err.message}`);
  }

  return { tasks, timelines, blocks, warnings, errors };
}

export async function validateCronograma(data: CronogramaImportado, userId: string): Promise<ValidationResult> {
  const warnings = [...data.warnings];
  const errors = [...data.errors];
  const topicMatches = new Map<string, string>();
  const topicMisses: string[] = [];

  const topicNames = new Set<string>();
  data.blocks.forEach(b => { if (b.topic) topicNames.add(b.topic); });
  data.timelines.forEach(t => topicNames.add(t.topic));

  try {
    const db = await getDb();
    const topicsResult = await db.topics.find({
      selector: { user_id: userId, isDeleted: { $ne: true } }
    }).exec();
    const topics = topicsResult.map((doc: any) => doc.toJSON());

    topicNames.forEach(name => {
      const nameLower = name.toLowerCase().trim();
      const match = topics.find(t =>
        t.name.toLowerCase().trim() === nameLower ||
        t.name.toLowerCase().trim().includes(nameLower) ||
        nameLower.includes(t.name.toLowerCase().trim())
      );
      if (match) {
        topicMatches.set(name, match.id);
      } else {
        topicMisses.push(name);
        warnings.push(`Tópico "${name}" não encontrado na aba Conteúdos → será texto livre`);
      }
    });
  } catch (err: any) {
    errors.push(`Erro ao buscar tópicos: ${err.message}`);
  }

  return { tasks: data.tasks, timelines: data.timelines, blocks: data.blocks, warnings, errors, topicMatches, topicMisses };
}

export function buildImportPreview(validated: ValidationResult): ImportPreview {
  return {
    taskCount: validated.tasks.length,
    timelineCount: validated.timelines.length,
    blockCount: validated.blocks.length,
    topicMatchCount: validated.topicMatches.size,
    topicMissCount: validated.topicMisses.length,
    warnings: validated.warnings,
    errors: validated.errors,
  };
}