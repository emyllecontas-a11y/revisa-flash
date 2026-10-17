// src/services/planoService.ts
import { getDb } from '@/lib/db';
import { uid } from '@/utils/helpers';
import { enviarOuEnfileirar } from '@/services/syncHelpers';
import {
  gerarSemanasEnare,
  NOME_PLANO_ENARE,
  type PlanoSemana,
  type PlanoBloco,
} from '@/lib/planoEnareData';

export type { PlanoSemana, PlanoBloco };

export interface Plano {
  id: string;
  user_id: string;
  nome: string;
  data_inicio: string;
  ativo: boolean;
  semanas: PlanoSemana[];
  createdAt: string;
  updated_at: string;
  isDeleted?: boolean;
}

export const DATA_INICIO_PADRAO = '2026-09-21';
const T_PLANOS = 'planos';
const T_FEITOS = 'plano_feitos';

export const ROTULOS_DIA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function utcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function chaveBloco(semana: number, dow: number, k: string): string {
  return `${semana}-${dow}-${k}`;
}

export type ResolucaoDia =
  | { tipo: 'antes'; inicio: string }
  | { tipo: 'depois' }
  | { tipo: 'dia'; semana: PlanoSemana; dow: number; total: number; rotulo: string; blocos: PlanoBloco[] };

export function resolverDia(plano: Plano, dataISO: string): ResolucaoDia {
  const diff = Math.round((utcMs(dataISO) - utcMs(plano.data_inicio)) / 86400000);
  if (diff < 0) return { tipo: 'antes', inicio: plano.data_inicio };

  const idx = Math.floor(diff / 7);
  const dow = diff % 7;
  const semana = plano.semanas[idx];
  if (!semana) return { tipo: 'depois' };

  let blocos: PlanoBloco[] = [];
  if (dow <= 4) {
    blocos = semana.dias[dow] || [];
  } else if (dow === 5) {
    blocos = [{
      k: 'REV',
      t: 'Revisão geral da semana',
      d: 'Feynman + flashcards atrasados + revisão farol + simulado/questões. Fechamento do Caderno de Erros.',
    }];
  }
  return { tipo: 'dia', semana, dow, total: plano.semanas.length, rotulo: ROTULOS_DIA[dow], blocos };
}

export async function obterPlanoAtivo(userId: string): Promise<Plano | null> {
  const db = await getDb();
  const docs = await db.planos
    .find({ selector: { user_id: userId, isDeleted: { $ne: true } } })
    .exec();
  const planos = docs.map((d: any) => d.toJSON() as Plano);
  if (planos.length === 0) return null;
  return planos.find(p => p.ativo) ?? planos[0];
}

export async function importarPlanoEnare(userId: string, dataInicio: string): Promise<Plano> {
  const db = await getDb();
  const now = new Date().toISOString();

  const ativos = await db.planos
    .find({ selector: { user_id: userId, ativo: true, isDeleted: { $ne: true } } })
    .exec();
  const desativados: any[] = [];
  for (const d of ativos) {
    await d.patch({ ativo: false, updated_at: now });
    desativados.push({ id: d.get('id'), ativo: false, updated_at: now });
  }
  await enviarOuEnfileirar(T_PLANOS, 'update', desativados);

  const plano: Plano = {
    id: uid(),
    user_id: userId,
    nome: NOME_PLANO_ENARE,
    data_inicio: dataInicio,
    ativo: true,
    semanas: gerarSemanasEnare(),
    createdAt: now,
    updated_at: now,
    isDeleted: false,
  };
  await db.planos.insert(plano);
  await enviarOuEnfileirar(T_PLANOS, 'create', [plano]);
  return plano;
}

export async function definirDataInicio(planoId: string, dataInicio: string) {
  const db = await getDb();
  const doc = await db.planos.findOne({ selector: { id: planoId } }).exec();
  if (!doc) return;
  const now = new Date().toISOString();
  await doc.patch({ data_inicio: dataInicio, updated_at: now });
  await enviarOuEnfileirar(T_PLANOS, 'update', [{ id: planoId, data_inicio: dataInicio, updated_at: now }]);
}

export async function excluirPlano(planoId: string) {
  const db = await getDb();
  const doc = await db.planos.findOne({ selector: { id: planoId } }).exec();
  if (!doc) return;
  const now = new Date().toISOString();
  await doc.patch({ isDeleted: true, ativo: false, updated_at: now });
  await enviarOuEnfileirar(T_PLANOS, 'update', [{ id: planoId, isDeleted: true, ativo: false, updated_at: now }]);
}

export async function listarFeitos(planoId: string, userId: string): Promise<Set<string>> {
  const db = await getDb();
  const docs = await db.plano_feitos
    .find({ selector: { user_id: userId, plano_id: planoId, isDeleted: { $ne: true } } })
    .exec();
  return new Set(docs.map((d: any) => d.get('chave') as string));
}

export async function alternarFeito(planoId: string, userId: string, chave: string, feito: boolean) {
  const db = await getDb();
  const id = `${planoId}_${chave}`;
  const now = new Date().toISOString();
  const doc = await db.plano_feitos.findOne({ selector: { id } }).exec();

  let linha: any;
  if (doc) {
    await doc.patch({ isDeleted: !feito, concluidoEm: feito ? now : doc.get('concluidoEm'), updated_at: now });
    linha = { ...doc.toJSON() };
  } else if (feito) {
    linha = {
      id, user_id: userId, plano_id: planoId, chave,
      concluidoEm: now, updated_at: now, isDeleted: false,
    };
    await db.plano_feitos.insert(linha);
  } else {
    return;
  }
  await enviarOuEnfileirar(T_FEITOS, 'upsert', [linha]);
}
// ADICIONE ESTA FUNÇÃO NO FINAL DO SEU src/services/planoService.ts

export async function salvarPlanoCustomizado(
  userId: string, 
  nome: string, 
  dataInicio: string, 
  semanas: PlanoSemana[]
): Promise<Plano> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Desativa planos antigos
  const ativos = await db.planos
    .find({ selector: { user_id: userId, ativo: true, isDeleted: { $ne: true } } })
    .exec();
  const desativados: any[] = [];
  for (const d of ativos) {
    await d.patch({ ativo: false, updated_at: now });
    desativados.push({ id: d.get('id'), ativo: false, updated_at: now });
  }
  await enviarOuEnfileirar(T_PLANOS, 'update', desativados);

  const plano: Plano = {
    id: uid(),
    user_id: userId,
    nome,
    data_inicio: dataInicio,
    ativo: true,
    semanas,
    createdAt: now,
    updated_at: now,
    isDeleted: false,
  };
  
  await db.planos.insert(plano);
  await enviarOuEnfileirar(T_PLANOS, 'create', [plano]);
  return plano;
}
export async function atualizarSemanasPlano(planoId: string, semanas: PlanoSemana[]) {
  const db = await getDb();
  const doc = await db.planos.findOne({ selector: { id: planoId } }).exec();
  if (!doc) return;
  const now = new Date().toISOString();
  await doc.patch({ semanas, updated_at: now });
  await enviarOuEnfileirar('planos', 'update', [{ id: planoId, semanas, updated_at: now }]);
}
// Adicione esta função no final do seu src/services/planoService.ts
export function obterDataDoBloco(dataInicioStr: string, semanaN: number, dow: number): string {
  const data = new Date(dataInicioStr + "T12:00:00");
  const diasPassados = (semanaN - 1) * 7 + dow;
  data.setDate(data.getDate() + diasPassados);
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}