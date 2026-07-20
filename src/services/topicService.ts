// src/services/topicService.ts

import { getDb } from '@/lib/db';
import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid, gerenciarRevisao } from '@/utils/helpers';
import { enqueueOperation } from './queueService';

/**
 * Atualiza o status de um tópico e gerencia as revisões (DSM-30)
 * Agora aceita studyDate para calcular as revisões a partir da data informada.
 */
export async function updateTopicStatusAndRevisions(
  topicId: string,
  newStatus: string,
  userId: string,
  studyDate?: string // 🔥 NOVO: data do estudo (formato YYYY-MM-DD ou ISO)
) {
  console.log('🔍 [topicService] Iniciando com:', { topicId, newStatus, userId, studyDate });

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

    // 🔥 Define a data base: se studyDate for fornecido, usa ela; senão, usa hoje
    const baseDate = studyDate ? new Date(studyDate) : new Date();
    const now = baseDate.toISOString();
    console.log(`📅 [topicService] Data base para revisões: ${now}`);

    // 2. ATUALIZAR STATUS NO RxDB (SEMPRE)
    await doc.patch({
      status: newStatus,
      updated_at: now,
    });
    console.log(`✅ [topicService] Status atualizado localmente para "${newStatus}"`);

    // 3. Buscar nome da disciplina
    const disciplinaName = topicoData.discipline_id
      ? await getDisciplineNameById(topicoData.discipline_id, userId)
      : 'Disciplina';

    // 4. GERENCIAR REVISÕES (SEMPRE LOCAL)
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

    // 🔥 Passa a data base para o gerenciador
    const novasRevisoes = gerenciarRevisao(
      topicId,
      topicoData.name,
      disciplinaName,
      newStatus,
      existingRevisoes,
      baseDate // <-- data base para cálculos
    );

    // Remover revisões antigas que não estão mais na lista (local)
    const novosIds = novasRevisoes.map((r: any) => r.id);
    const existingDocs = await db.revisoes.find({
      selector: { user_id: userId, topico_id: topicId },
    }).exec();
    for (const doc of existingDocs) {
      if (!novosIds.includes(doc.id)) {
        await doc.remove();
        console.log(`🗑️ [topicService] Revisão ${doc.id} removida localmente.`);
      }
    }

    // Salvar revisões no RxDB (sempre)
    const revisoesParaSalvar: any[] = [];
    for (const rev of novasRevisoes) {
      const topicoIdFinal = rev.topicoId || topicId;
      const topicNameFinal = rev.topicoNome || topicoData.name;
      const disciplineFinal = rev.disciplina || disciplinaName;
      const reviewLevelFinal = rev.reviewLevel || 1;
      const nextReviewDateFinal = rev.nextReviewDate || new Date(baseDate.getTime() + 86400000).toISOString();
      const lastStudyDateFinal = rev.lastStudyDate || now;

      const existingDoc = existingDocs.find((d: any) => d.id === rev.id);
      if (existingDoc) {
        await existingDoc.patch({
          review_level: reviewLevelFinal,
          nextReviewDate: nextReviewDateFinal,
          lastStudyDate: lastStudyDateFinal,
          completedAt: rev.completedAt || null,
          updated_at: now,
        });
        console.log(`✏️ [topicService] Revisão ${rev.id} atualizada localmente.`);
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
          updated_at: now,
        };
        await db.revisoes.insert(newRevisao);
        console.log(`➕ [topicService] Revisão ${rev.id} criada localmente.`);
        revisoesParaSalvar.push(newRevisao);
      }
    }

    console.log(`✅ [topicService] ${revisoesParaSalvar.length} revisões salvas localmente.`);

    // ============================================================
    // 🔥 PUSH DIRETO PARA SUPABASE (tenta primeiro)
    // ============================================================
    let supabaseSuccess = false;
    try {
      const supabaseClient = await getSupabaseWithToken();

      // Atualiza status do tópico
      await supabaseClient
        .from('topics')
        .update({ status: newStatus, updated_at: now })
        .eq('id', topicId);

      // Para cada revisão, insere ou atualiza
      for (const rev of novasRevisoes) {
        const reviewData = {
          id: rev.id,
          user_id: userId,
          topico_id: rev.topicoId || topicId,
          topicName: rev.topicoNome || topicoData.name,
          discipline: rev.disciplina || disciplinaName,
          review_level: rev.reviewLevel || 1,
          nextReviewDate: rev.nextReviewDate || new Date(baseDate.getTime() + 86400000).toISOString(),
          lastStudyDate: rev.lastStudyDate || now,
          completedAt: rev.completedAt || null,
          createdAt: rev.createdAt || now,
          updated_at: now,
        };

        // Verifica se já existe no Supabase
        const { data: existing } = await supabaseClient
          .from('revisoes')
          .select('id')
          .eq('id', rev.id)
          .maybeSingle();

        if (existing) {
          await supabaseClient
            .from('revisoes')
            .update(reviewData)
            .eq('id', rev.id);
        } else {
          await supabaseClient
            .from('revisoes')
            .insert(reviewData);
        }
      }

      // Remover revisões que foram deletadas (que não estão em novosIds)
      for (const doc of existingDocs) {
        if (!novosIds.includes(doc.id)) {
          await supabaseClient
            .from('revisoes')
            .delete()
            .eq('id', doc.id);
        }
      }

      console.log('✅ [topicService] Tópico e revisões sincronizados diretamente com Supabase.');
      supabaseSuccess = true;

    } catch (supabaseError) {
      console.warn('⚠️ [topicService] Falha ao sincronizar diretamente, enfileirando operações.');
      // 🔥 Se falhar, enfileira tudo (offline)
      try {
        await enqueueOperation('update', 'topics', {
          id: topicId,
          status: newStatus,
          updated_at: now,
        });

        for (const rev of novasRevisoes) {
          const reviewData = {
            id: rev.id,
            user_id: userId,
            topico_id: rev.topicoId || topicId,
            topicName: rev.topicoNome || topicoData.name,
            discipline: rev.disciplina || disciplinaName,
            review_level: rev.reviewLevel || 1,
            nextReviewDate: rev.nextReviewDate || new Date(baseDate.getTime() + 86400000).toISOString(),
            lastStudyDate: rev.lastStudyDate || now,
            completedAt: rev.completedAt || null,
            createdAt: rev.createdAt || now,
            updated_at: now,
          };
          const existingDoc = existingDocs.find((d: any) => d.id === rev.id);
          if (existingDoc) {
            await enqueueOperation('update', 'revisoes', {
              id: rev.id,
              ...reviewData,
            });
          } else {
            await enqueueOperation('create', 'revisoes', reviewData);
          }
        }

        for (const doc of existingDocs) {
          if (!novosIds.includes(doc.id)) {
            await enqueueOperation('delete', 'revisoes', { id: doc.id });
          }
        }
        console.log('📦 [topicService] Todas as operações enfileiradas (modo offline).');
      } catch (queueError) {
        console.error('❌ [topicService] Erro ao enfileirar operações:', queueError);
      }
    }

    console.log('✅ [topicService] Tópico e revisões atualizados com sucesso!');

  } catch (error) {
    console.error('❌ [topicService] Erro geral:', error);
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