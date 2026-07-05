// src/services/topicService.ts

import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { uid, gerenciarRevisao } from '@/utils/helpers';
import { enqueueOperation } from './queueService';

/**
 * Atualiza o status de um tópico e gerencia as revisões (DSM-30)
 * Todas as operações são enfileiradas para garantir sincronização offline.
 */
export async function updateTopicStatusAndRevisions(
  topicId: string,
  newStatus: string,
  userId: string
) {
  console.log('🔍 [topicService] Iniciando com:', { topicId, newStatus, userId });

  if (!topicId || !userId) {
    console.error('❌ [topicService] Parâmetros inválidos');
    return;
  }

  try {
    const db = await getDb();
    console.log('📦 [topicService] Banco obtido.');

    // 1. Buscar tópico
    const doc = await db.topics.findOne({ selector: { id: topicId } }).exec();
    if (!doc) {
      console.error('❌ [topicService] Tópico não encontrado');
      return;
    }
    const topicoData = doc.toJSON();
    console.log('📄 [topicService] Tópico encontrado:', topicoData);

    const now = new Date().toISOString();

    // 2. ATUALIZAR STATUS NO RxDB (SEMPRE)
    await doc.incrementalPatch({
      status: newStatus,
      updatedAt: now,
    });
    console.log(`✅ [topicService] Status atualizado localmente para "${newStatus}"`);

    // 🔥 ENFILEIRA ATUALIZAÇÃO DO TÓPICO
    try {
      await enqueueOperation('update', 'topics', {
        id: topicId,
        status: newStatus,
        updatedAt: now,
      });
      console.log('📦 [topicService] Atualização do tópico enfileirada.');
    } catch (queueError) {
      console.warn('⚠️ [topicService] Erro ao enfileirar atualização do tópico:', queueError);
    }

    // 4. GERENCIAR REVISÕES (SEMPRE LOCAL)
    const disciplinaName = topicoData.discipline_id
      ? await getDisciplineNameById(topicoData.discipline_id, userId)
      : 'Disciplina';

    // Buscar revisões existentes
    let existingRevisoes: any[] = [];
    try {
      const existingDocs = await db.revisoes.find({
        selector: { user_id: userId, topico_id: topicId },
      }).exec();
      existingRevisoes = existingDocs.map((d: any) => d.toJSON());
    } catch (findError) {
      console.warn('⚠️ Erro ao buscar revisões existentes, continuando sem elas:', findError);
      existingRevisoes = [];
    }

    // Aplicar lógica DSM-30 (sempre local)
    const novasRevisoes = gerenciarRevisao(
      topicId,
      topicoData.name,
      disciplinaName,
      newStatus,
      existingRevisoes
    );

    // Remover revisões antigas que não estão mais na lista
    const novosIds = novasRevisoes.map((r: any) => r.id);
    const existingDocs = await db.revisoes.find({
      selector: { user_id: userId, topico_id: topicId },
    }).exec();
    for (const doc of existingDocs) {
      if (!novosIds.includes(doc.id)) {
        await doc.remove();
        // 🔥 ENFILEIRA REMOÇÃO DA REVISÃO
        try {
          await enqueueOperation('delete', 'revisoes', { id: doc.id });
          console.log(`📦 [topicService] Remoção da revisão ${doc.id} enfileirada.`);
        } catch (queueError) {
          console.warn('⚠️ [topicService] Erro ao enfileirar remoção de revisão:', queueError);
        }
      }
    }

    // Salvar revisões no RxDB (sempre) e enfileirar cada uma
    const revisoesParaSalvar: any[] = [];
    for (const rev of novasRevisoes) {
      const topicoIdFinal = rev.topicoId || topicId;
      const topicNameFinal = rev.topicoNome || topicoData.name;
      const disciplineFinal = rev.disciplina || disciplinaName;
      const reviewLevelFinal = rev.reviewLevel || 1;
      const nextReviewDateFinal = rev.nextReviewDate || new Date(Date.now() + 86400000).toISOString();
      const lastStudyDateFinal = rev.lastStudyDate || now;

      const existingDoc = existingDocs.find((d: any) => d.id === rev.id);
      if (existingDoc) {
        await existingDoc.incrementalPatch({
          review_level: reviewLevelFinal,
          nextReviewDate: nextReviewDateFinal,
          lastStudyDate: lastStudyDateFinal,
          completedAt: rev.completedAt || null,
          updatedAt: now,
        });
        // 🔥 ENFILEIRA ATUALIZAÇÃO DA REVISÃO
        try {
          await enqueueOperation('update', 'revisoes', {
            id: rev.id,
            review_level: reviewLevelFinal,
            nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal,
            completedAt: rev.completedAt || null,
            updatedAt: now,
          });
          console.log(`📦 [topicService] Atualização da revisão ${rev.id} enfileirada.`);
        } catch (queueError) {
          console.warn('⚠️ [topicService] Erro ao enfileirar atualização de revisão:', queueError);
        }
      } else {
        const newRevisao = {
          id: rev.id,
          user_id: userId,
          topico_id: topicoIdFinal,
          topicName: topicNameFinal,
          discipline: disciplineFinal,
          review_level: reviewLevelFinal,
          nextReviewDate: nextReviewDateFinal,
          lastStudyDate: lastStudyDateFinal,
          completedAt: rev.completedAt || null,
          createdAt: rev.createdAt || now,
          updatedAt: now,
        };
        await db.revisoes.insert(newRevisao);
        // 🔥 ENFILEIRA CRIAÇÃO DA REVISÃO
        try {
          await enqueueOperation('create', 'revisoes', newRevisao);
          console.log(`📦 [topicService] Criação da revisão ${rev.id} enfileirada.`);
        } catch (queueError) {
          console.warn('⚠️ [topicService] Erro ao enfileirar criação de revisão:', queueError);
        }
      }
      revisoesParaSalvar.push({
        id: rev.id,
        user_id: userId,
        topico_id: topicoIdFinal,
        topicName: topicNameFinal,
        discipline: disciplineFinal,
        review_level: reviewLevelFinal,
        nextReviewDate: nextReviewDateFinal,
        lastStudyDate: lastStudyDateFinal,
        completedAt: rev.completedAt || null,
        createdAt: rev.createdAt || now,
        updatedAt: now,
      });
    }

    console.log(`✅ [topicService] ${revisoesParaSalvar.length} revisões salvas localmente e enfileiradas.`);

    console.log('✅ [topicService] Tópico e revisões atualizados com sucesso (localmente e fila)');

  } catch (error) {
    console.error('❌ [topicService] Erro geral:', error);
    // Não relançar o erro para não interromper o fluxo principal
  }
}

/**
 * Busca o nome da disciplina pelo ID (apenas local)
 */
async function getDisciplineNameById(disciplineId: string, userId: string): Promise<string> {
  try {
    const db = await getDb();
    const doc = await db.disciplines.findOne({ selector: { id: disciplineId, user_id: userId } }).exec();
    if (doc) {
      const data = doc.toJSON();
      return data.name || 'Disciplina';
    }
  } catch (e) {
    console.warn('⚠️ Erro ao buscar nome da disciplina:', e);
  }
  return 'Disciplina';
}