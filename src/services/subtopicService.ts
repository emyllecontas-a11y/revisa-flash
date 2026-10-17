// src/services/subtopicService.ts
// Serviço de subtópicos + revisões D1-D5 dos subtópicos.
// Mesmo padrão dos outros services do app.

import { getDb } from '@/lib/db';
import { uid } from '@/utils/helpers';
import { enviarOuEnfileirar } from '@/services/syncHelpers';

export type SubtopicoStatus = 'nao_estudado' | 'estudando' | 'revisado' | 'dominado';

export interface Subtopico {
  id: string;
  user_id: string;
  topico_id: string;
  name: string;
  status: SubtopicoStatus;
  order: number;
  createdAt: string;
  updated_at: string;
  isDeleted?: boolean;
}

export interface RevisaoSubtopicoView {
  id: string;
  topicName: string;
  review_level: number;
  nextReviewDate: string;
  completedAt: string | null;
  kind: 'subtopico';
}

const T_SUB = 'subtopicos';
const T_REV = 'revisoes_subtopico';
const DIAS_NIVEL = [1, 7, 15, 30, 60];

function somarDias(base: Date, dias: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

// ============================================================
// SUBTÓPICOS
// ============================================================

export async function listarSubtopicos(topicoId: string, userId: string): Promise<Subtopico[]> {
  const db = await getDb();
  const docs = await db.subtopicos
    .find({ selector: { user_id: userId, topico_id: topicoId, isDeleted: { $ne: true } } })
    .exec();
  return docs
    .map((d: any) => d.toJSON() as Subtopico)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function criarSubtopicos(
  topicoId: string,
  userId: string,
  nomes: string[],
): Promise<Subtopico[]> {
  const limpos = nomes.map(n => n.trim()).filter(n => n.length > 0);
  if (limpos.length === 0) return [];

  const db = await getDb();
  const existentes = await listarSubtopicos(topicoId, userId);
  let proximaOrdem = existentes.length > 0
    ? Math.max(...existentes.map(s => s.order ?? 0)) + 1
    : 0;

  const now = new Date().toISOString();
  const novos: Subtopico[] = limpos.map(name => ({
    id: uid(),
    user_id: userId,
    topico_id: topicoId,
    name,
    status: 'nao_estudado',
    order: proximaOrdem++,
    createdAt: now,
    updated_at: now,
    isDeleted: false,
  }));

  for (const novo of novos) await db.subtopicos.insert(novo);
  await enviarOuEnfileirar(T_SUB, 'create', novos);
  return novos;
}

export async function moverSubtopico(lista: Subtopico[], id: string, direcao: 'up' | 'down') {
  const idx = lista.findIndex(s => s.id === id);
  if (idx === -1) return;
  const novoIdx = direcao === 'up' ? idx - 1 : idx + 1;
  if (novoIdx < 0 || novoIdx >= lista.length) return;

  const copia = [...lista];
  const [movido] = copia.splice(idx, 1);
  copia.splice(novoIdx, 0, movido);

  const db = await getDb();
  const now = new Date().toISOString();
  const alteracoes: any[] = [];
  for (let i = 0; i < copia.length; i++) {
    if ((copia[i].order ?? -1) === i) continue;
    const doc = await db.subtopicos.findOne({ selector: { id: copia[i].id } }).exec();
    if (doc) {
      await doc.patch({ order: i, updated_at: now });
      alteracoes.push({ id: copia[i].id, order: i, updated_at: now });
    }
  }
  await enviarOuEnfileirar(T_SUB, 'update', alteracoes);
}

// ============================================================
// STATUS DO TÓPICO
// ============================================================

export async function recalcularStatusDoTopico(topicoId: string, userId: string) {
  const subs = await listarSubtopicos(topicoId, userId);
  if (subs.length === 0) return;

  let novo: string;
  if (subs.every(s => s.status === 'dominado')) novo = 'dominado';
  else if (subs.every(s => s.status === 'revisado' || s.status === 'dominado')) novo = 'revisado';
  else if (subs.some(s => s.status !== 'nao_estudado')) novo = 'estudando';
  else novo = 'nao_estudado';

  const db = await getDb();
  const doc = await db.topics.findOne({ selector: { id: topicoId } }).exec();
  if (!doc || doc.get('status') === novo) return;
  const now = new Date().toISOString();
  await doc.patch({ status: novo, updated_at: now });
  await enviarOuEnfileirar('topics', 'update', [{ id: topicoId, status: novo, updated_at: now }]);
}

// ============================================================
// REVISÕES D1–D5 DO SUBTÓPICO
// ============================================================

async function ajustarRevisoes(sub: Subtopico, status: SubtopicoStatus) {
  const db = await getDb();
  const topicoDoc = await db.topics.findOne({ selector: { id: sub.topico_id } }).exec();
  const topico = topicoDoc ? topicoDoc.toJSON() : null;
  const discDoc = topico
    ? await db.disciplines.findOne({ selector: { id: topico.discipline_id } }).exec()
    : null;

  const nomeRevisao = `${topico?.name ?? 'Tópico'} › ${sub.name}`;
  const disciplina = discDoc ? discDoc.get('name') : 'Disciplina';

  const existentes = await db.revisoes_subtopico
    .find({ selector: { user_id: sub.user_id, subtopico_id: sub.id, isDeleted: { $ne: true } } })
    .exec();

  const agora = new Date();
  const now = agora.toISOString();
  const novas: any[] = [];
  const alteradas: any[] = [];

  const criar = async (nivel: number) => {
    const linha = {
      id: uid(),
      user_id: sub.user_id,
      subtopico_id: sub.id,
      topicName: nomeRevisao,
      discipline: disciplina,
      review_level: nivel,
      nextReviewDate: somarDias(agora, DIAS_NIVEL[nivel - 1]),
      lastStudyDate: now,
      completedAt: null,
      createdAt: now,
      updated_at: now,
      isDeleted: false,
    };
    await db.revisoes_subtopico.insert(linha);
    novas.push(linha);
  };

  if (status === 'estudando') {
    if (!existentes.some((d: any) => d.get('review_level') === 1)) await criar(1);
  } else if (status === 'revisado') {
    for (const d of existentes) {
      await d.patch({ isDeleted: true, updated_at: now });
      alteradas.push({ id: d.get('id'), isDeleted: true, updated_at: now });
    }
    for (let n = 1; n <= 5; n++) await criar(n);
  } else if (status === 'dominado') {
    for (const d of existentes) {
      if (!d.get('completedAt')) {
        await d.patch({ completedAt: now, updated_at: now });
        alteradas.push({ id: d.get('id'), completedAt: now, updated_at: now });
      }
    }
  }

  await enviarOuEnfileirar(T_REV, 'update', alteradas);
  await enviarOuEnfileirar(T_REV, 'create', novas);
}

export async function atualizarStatusSubtopico(id: string, status: SubtopicoStatus) {
  const db = await getDb();
  const doc = await db.subtopicos.findOne({ selector: { id } }).exec();
  if (!doc) return;
  const sub = doc.toJSON() as Subtopico;
  if (sub.status === status) return;

  const now = new Date().toISOString();
  await doc.patch({ status, updated_at: now });
  await enviarOuEnfileirar(T_SUB, 'update', [{ id, status, updated_at: now }]);

  await ajustarRevisoes({ ...sub, status }, status);
  await recalcularStatusDoTopico(sub.topico_id, sub.user_id);
}

export async function listarRevisoesSubtopico(userId: string): Promise<RevisaoSubtopicoView[]> {
  const db = await getDb();
  const docs = await db.revisoes_subtopico
    .find({ selector: { user_id: userId, isDeleted: { $ne: true } } })
    .exec();
  return docs.map((d: any) => {
    const j = d.toJSON();
    return {
      id: j.id,
      topicName: j.topicName,
      review_level: j.review_level || 1,
      nextReviewDate: j.nextReviewDate,
      completedAt: j.completedAt || null,
      kind: 'subtopico' as const,
    };
  });
}

export async function concluirRevisaoSubtopico(revisaoId: string, userId: string) {
  const db = await getDb();
  const doc = await db.revisoes_subtopico.findOne({ selector: { id: revisaoId } }).exec();
  if (!doc) return;

  const rev = doc.toJSON();
  const nivel = rev.review_level || 1;
  const agora = new Date();
  const now = agora.toISOString();

  await doc.patch({ completedAt: now, updated_at: now });
  await enviarOuEnfileirar(T_REV, 'update', [{ id: revisaoId, completedAt: now, updated_at: now }]);

  const todas = await db.revisoes_subtopico
    .find({ selector: { subtopico_id: rev.subtopico_id, isDeleted: { $ne: true } } })
    .exec();

  if (nivel < 5 && !todas.some((d: any) => d.get('review_level') === nivel + 1)) {
    const nova = {
      id: uid(),
      user_id: userId,
      subtopico_id: rev.subtopico_id,
      topicName: rev.topicName,
      discipline: rev.discipline,
      review_level: nivel + 1,
      nextReviewDate: somarDias(agora, DIAS_NIVEL[nivel]),
      lastStudyDate: now,
      completedAt: null,
      createdAt: now,
      updated_at: now,
      isDeleted: false,
    };
    await db.revisoes_subtopico.insert(nova);
    await enviarOuEnfileirar(T_REV, 'create', [nova]);
  }

  const subDoc = await db.subtopicos.findOne({ selector: { id: rev.subtopico_id } }).exec();
  if (!subDoc) return;
  const sub = subDoc.toJSON() as Subtopico;

  const atuais = await db.revisoes_subtopico
    .find({ selector: { subtopico_id: rev.subtopico_id, isDeleted: { $ne: true } } })
    .exec();
  const concluidas = atuais.filter((d: any) => !!d.get('completedAt')).length;

  let novoStatus: SubtopicoStatus = sub.status;
  if (concluidas >= 1 && (sub.status === 'estudando' || sub.status === 'nao_estudado')) {
    novoStatus = 'revisado';
  }
  if (atuais.length === 5 && concluidas === 5) novoStatus = 'dominado';

  if (novoStatus !== sub.status) {
    await subDoc.patch({ status: novoStatus, updated_at: now });
    await enviarOuEnfileirar(T_SUB, 'update', [{ id: sub.id, status: novoStatus, updated_at: now }]);
    await recalcularStatusDoTopico(sub.topico_id, sub.user_id);
  }
}

// ============================================================
// EXCLUSÕES
// ============================================================

async function excluirRevisoesDoSubtopico(subtopicoId: string) {
  const db = await getDb();
  const docs = await db.revisoes_subtopico
    .find({ selector: { subtopico_id: subtopicoId, isDeleted: { $ne: true } } })
    .exec();
  const now = new Date().toISOString();
  const alteradas: any[] = [];
  for (const d of docs) {
    await d.patch({ isDeleted: true, updated_at: now });
    alteradas.push({ id: d.get('id'), isDeleted: true, updated_at: now });
  }
  await enviarOuEnfileirar(T_REV, 'update', alteradas);
}

export async function excluirSubtopico(id: string) {
  const db = await getDb();
  const doc = await db.subtopicos.findOne({ selector: { id } }).exec();
  if (!doc) return;
  const sub = doc.toJSON() as Subtopico;
  const now = new Date().toISOString();
  await doc.patch({ isDeleted: true, updated_at: now });
  await enviarOuEnfileirar(T_SUB, 'update', [{ id, isDeleted: true, updated_at: now }]);
  await excluirRevisoesDoSubtopico(id);
  await recalcularStatusDoTopico(sub.topico_id, sub.user_id);
}

export async function excluirSubtopicosDoTopico(topicoId: string) {
  const db = await getDb();
  const docs = await db.subtopicos
    .find({ selector: { topico_id: topicoId, isDeleted: { $ne: true } } })
    .exec();
  const now = new Date().toISOString();
  for (const d of docs) {
    const id = d.get('id');
    await d.patch({ isDeleted: true, updated_at: now });
    await enviarOuEnfileirar(T_SUB, 'update', [{ id, isDeleted: true, updated_at: now }]);
    await excluirRevisoesDoSubtopico(id);
  }
}