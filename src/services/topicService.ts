// src/services/topicService.ts

import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { uid, gerenciarRevisao } from '@/utils/helpers';

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

    // 3. TENTAR ATUALIZAR NO SUPABASE (SE FALHAR, NÃO REVERTER)
    try {
      const { error: topicError } = await supabase
        .from('topics')
        .update({ status: newStatus, updatedAt: now })
        .eq('id', topicId);
      if (topicError) {
        console.warn('⚠️ [topicService] Erro ao atualizar Supabase (offline?):', topicError.message);
      } else {
        console.log('✅ [topicService] Status atualizado no Supabase.');
      }
    } catch (e) {
      console.warn('⚠️ [topicService] Supabase indisponível (offline), continuando local.');
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
      }
    }

    // Salvar revisões no RxDB (sempre)
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
      } else {
        await db.revisoes.insert({
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

    console.log(`✅ [topicService] ${revisoesParaSalvar.length} revisões salvas localmente.`);

    // 5. TENTAR SINCRONIZAR REVISÕES COM SUPABASE (SE FALHAR, NÃO REVERTER)
    if (revisoesParaSalvar.length > 0) {
      try {
        const mapped = revisoesParaSalvar.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          topico_id: r.topico_id,
          topicName: r.topicName,
          discipline: r.discipline,
          review_level: r.review_level,
          nextReviewDate: r.nextReviewDate,
          lastStudyDate: r.lastStudyDate,
          completedAt: r.completedAt || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
        const { error } = await supabase.from('revisoes').upsert(mapped, { onConflict: 'id' });
        if (error) {
          console.warn('⚠️ [topicService] Erro ao sincronizar revisões (offline?):', error.message);
        } else {
          console.log('✅ [topicService] Revisões sincronizadas com Supabase.');
        }
      } catch (e) {
        console.warn('⚠️ [topicService] Supabase indisponível para revisões (offline), continuando.');
      }
    }

    console.log('✅ [topicService] Tópico e revisões atualizados com sucesso (localmente)');

  } catch (error) {
    console.error('❌ [topicService] Erro geral:', error);
    // Não relançar o erro para não interromper o fluxo principal
  }
}

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