// src/services/bancoQuestoesService.ts
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import type { QuestaoParsed } from '@/services/pdfBancoParser';

export interface QuestaoBanco {
  id: string;
  user_id: string;
  banca: string;
  ano: number | null;
  concurso: string | null;
  cargo: string | null;
  disciplina: string;
  assunto: string | null;
  subassunto: string | null;
  tipo_questao: 'multipla_escolha' | 'certo_errado';
  enunciado: string;
  alternativas: { letra: string; texto: string; correta: boolean }[] | null;
  gabarito_letra: string | null;
  gabarito_ce: boolean | null;
  comentario: string | null;
  imagem_url: string | null;
  hash_dedup: string;
  url_origem: string | null;
  arquivo_origem: string | null;
  importado_em: string;
  created_at: string;
  updated_at: string;
  isdeleted: boolean;
}

export interface ResultadoImportacao {
  success: boolean;
  novas: number;
  jaExistentes: number;
  erros: number;
  idsInseridos: string[];
  error?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function importarQuestoesNoBanco(
  questoes: QuestaoParsed[],
  userId: string
): Promise<ResultadoImportacao> {
  if (!userId) return { success: false, novas: 0, jaExistentes: 0, erros: 0, idsInseridos: [], error: 'Usuário não autenticado.' };
  if (questoes.length === 0) return { success: true, novas: 0, jaExistentes: 0, erros: 0, idsInseridos: [] };

  let novas = 0;
  let jaExistentes = 0;
  let erros = 0;
  const idsInseridos: string[] = [];

  try {
    const db = await getDb();
    const agora = nowIso();

    for (const q of questoes) {
      try {
        // Verifica hash global (sem filtro de user_id) para não duplicar
        const existente = await db.banco_questoes.findOne({
          selector: { hash_dedup: q.hash_dedup, isdeleted: false },
        }).exec();

        if (existente) {
          jaExistentes++;
          continue;
        }

        const nova: QuestaoBanco = {
          id: crypto.randomUUID(),
          user_id: userId,
          banca: q.banca,
          ano: q.ano,
          concurso: q.concurso,
          cargo: q.cargo,
          disciplina: q.disciplina,
          assunto: q.assunto,
          subassunto: q.subassunto,
          tipo_questao: q.tipo_questao,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          gabarito_letra: q.gabarito_letra,
          gabarito_ce: q.gabarito_ce,
          comentario: q.comentario,
          imagem_url: q.imagem_url,
          hash_dedup: q.hash_dedup,
          url_origem: q.url_origem,
          arquivo_origem: q.arquivo_origem,
          importado_em: agora,
          created_at: agora,
          updated_at: agora,
          isdeleted: false,
        };

        await db.banco_questoes.insert(nova);
        await enqueueOperation('create', 'banco_questoes', nova);
        idsInseridos.push(nova.id);
        novas++;
      } catch (e) {
        console.warn('[bancoQuestoes] Erro ao inserir questão:', e);
        erros++;
      }
    }

    // PUSH PÓS-IMPORTAÇÃO: garante que as questões estão na nuvem imediatamente
    if (novas > 0 && idsInseridos.length > 0) {
      try {
        const { getSupabaseWithToken } = await import('@/lib/supabaseClient');
        const supabaseClient = await getSupabaseWithToken();

        const novasQuestoes: any[] = [];
        const BATCH_BUSCA = 100;
        for (let i = 0; i < idsInseridos.length; i += BATCH_BUSCA) {
          const chunk = idsInseridos.slice(i, i + BATCH_BUSCA);
          const docs = await db.banco_questoes.find({ selector: { id: { $in: chunk } } }).exec();
          docs.forEach((d: any) => novasQuestoes.push(d.toJSON()));
        }

        const BATCH_UPSERT = 200;
        let upsertOk = 0;
        let upsertErr = 0;
        for (let i = 0; i < novasQuestoes.length; i += BATCH_UPSERT) {
          const chunk = novasQuestoes.slice(i, i + BATCH_UPSERT);
          const { error: upsertError } = await supabaseClient
            .from('banco_questoes')
            .upsert(chunk, { onConflict: 'id' });

          if (upsertError) {
            console.error(`[bancoQuestoes] Erro no push pós-import (lote ${Math.floor(i / BATCH_UPSERT) + 1}):`, upsertError);
            upsertErr += chunk.length;
          } else {
            upsertOk += chunk.length;
          }
        }
        console.log(`[bancoQuestoes] Push pós-import: ${upsertOk} enviadas à nuvem, ${upsertErr} com erro.`);
      } catch (pushErr) {
        console.error('[bancoQuestoes] Erro no push pós-importação (a fila de sync vai tentar depois):', pushErr);
      }
    }

    return { success: true, novas, jaExistentes, erros, idsInseridos };
  } catch (e: any) {
    console.error('[bancoQuestoes] Erro ao importar lote:', e);
    return { success: false, novas, jaExistentes, erros, idsInseridos, error: e?.message || 'Erro ao importar.' };
  }
}

export async function getQuestoesDoBanco(
  userId: string,
  filtros?: {
    banca?: string;
    disciplina?: string;
    ano?: number;
    tipo_questao?: 'multipla_escolha' | 'certo_errado';
    busca?: string;
  }
): Promise<{ success: boolean; data?: QuestaoBanco[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.banco_questoes.find({ selector: { isdeleted: false } }).exec();
    let data: QuestaoBanco[] = docs.map((d: any) => d.toJSON() as QuestaoBanco);

    if (filtros?.banca) data = data.filter((q) => q.banca === filtros.banca);
    if (filtros?.disciplina) data = data.filter((q) => q.disciplina === filtros.disciplina);
    if (filtros?.ano) data = data.filter((q) => q.ano === filtros.ano);
    if (filtros?.tipo_questao) data = data.filter((q) => q.tipo_questao === filtros.tipo_questao);
    if (filtros?.busca && filtros.busca.trim()) {
      const termo = filtros.busca.toLowerCase().trim();
      data = data.filter((q) => q.enunciado.toLowerCase().includes(termo) || (q.assunto || '').toLowerCase().includes(termo) || (q.cargo || '').toLowerCase().includes(termo));
    }

    data.sort((a, b) => (b.importado_em || '').localeCompare(a.importado_em || ''));
    return { success: true, data };
  } catch (e: any) {
    console.error('[bancoQuestoes] Erro ao listar:', e);
    return { success: false, error: e?.message || 'Erro ao listar.' };
  }
}

export async function getEstatisticasBanco(
  userId: string
): Promise<{
  success: boolean;
  data?: { total: number; porBanca: Record<string, number>; porDisciplina: Record<string, number>; porAno: Record<number, number>; porTipo: Record<string, number> };
  error?: string;
}> {
  try {
    const db = await getDb();
    const docs = await db.banco_questoes.find({ selector: { isdeleted: false } }).exec();
    const porBanca: Record<string, number> = {};
    const porDisciplina: Record<string, number> = {};
    const porAno: Record<number, number> = {};
    const porTipo: Record<string, number> = {};

    for (const d of docs) {
      const q: any = d.toJSON();
      porBanca[q.banca] = (porBanca[q.banca] || 0) + 1;
      porDisciplina[q.disciplina] = (porDisciplina[q.disciplina] || 0) + 1;
      if (q.ano) porAno[q.ano] = (porAno[q.ano] || 0) + 1;
      porTipo[q.tipo_questao] = (porTipo[q.tipo_questao] || 0) + 1;
    }
    return { success: true, data: { total: docs.length, porBanca, porDisciplina, porAno, porTipo } };
  } catch (e: any) {
    console.error('[bancoQuestoes] Erro ao calcular estatísticas:', e);
    return { success: false, error: e?.message || 'Erro ao calcular estatísticas.' };
  }
}

export async function excluirQuestaoDoBanco(questaoId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };
  try {
    const db = await getDb();
    const doc = await db.banco_questoes.findOne({ selector: { id: questaoId } }).exec();
    if (!doc || doc.get('user_id') !== userId) return { success: false, error: 'Você só pode excluir questões que você mesmo criou.' };

    const agora = nowIso();
    await doc.patch({ isdeleted: true, updated_at: agora });
    await enqueueOperation('update', 'banco_questoes', { id: questaoId, isdeleted: true, updated_at: agora });
    return { success: true };
  } catch (e: any) {
    console.error('[bancoQuestoes] Erro ao excluir:', e);
    return { success: false, error: e?.message || 'Erro ao excluir.' };
  }
}

export async function salvarTentativaAvulsa(
  userId: string,
  questaoId: string,
  resposta: string | null,
  acertou: boolean,
  tempoSegundos: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const agora = nowIso();
    const tentativa = {
      id: crypto.randomUUID(),
      user_id: userId,
      questao_banco_id: questaoId,
      resposta,
      acertou,
      tempo_segundos: tempoSegundos,
      contexto: 'avulso',
      caderno_resultado_id: null,
      created_at: agora,
      updated_at: agora,
    };
    await db.banco_tentativas.insert(tentativa);
    await enqueueOperation('create', 'banco_tentativas', tentativa);
    return { success: true };
  } catch (e: any) {
    console.error('[bancoQuestoes] Erro ao salvar tentativa avulsa:', e);
    return { success: false, error: e?.message || 'Erro ao salvar tentativa.' };
  }
}

export async function limparDuplicatasLocais(userId: string): Promise<void> {
  try {
    const db = await getDb();
    const docs = await db.banco_questoes.find({ selector: { isdeleted: false } }).exec();
    
    const vistos = new Set<string>();
    for (const doc of docs) {
      const hash = doc.get('hash_dedup');
      if (vistos.has(hash)) {
        if (doc.get('user_id') === userId) {
          const agora = nowIso();
          await doc.patch({ isdeleted: true, updated_at: agora });
          await enqueueOperation('update', 'banco_questoes', { id: doc.get('id'), isdeleted: true, updated_at: agora });
        }
      } else {
        vistos.add(hash);
      }
    }
  } catch (e) {
    console.error('[bancoQuestoes] Erro ao limpar duplicatas:', e);
  }
}

// ============================================================
// COMENTÁRIO SOB DEMANDA (v16)
// ============================================================
// O pull em lote NÃO traz comentário (campo grande). Quando o
// usuário abre uma questão sem comentário local, buscamos SÓ
// aquela coluna no Supabase. Fica salva localmente e nunca
// mais é buscada neste dispositivo.
export async function buscarComentarioSobDemanda(
  questaoId: string
): Promise<{ success: boolean; comentario: string | null; error?: string }> {
  if (!questaoId) return { success: false, comentario: null, error: 'ID vazio' };

  try {
    const db = await getDb();
    const doc = await db.banco_questoes.findOne({ selector: { id: questaoId } }).exec();

    if (!doc) {
      return { success: false, comentario: null, error: 'Questão não encontrada localmente' };
    }

    // 1) Já tem local? Retorna direto (caminho rápido, sem rede)
    const comentarioLocal = doc.get('comentario');
    if (comentarioLocal && typeof comentarioLocal === 'string' && comentarioLocal.trim()) {
      return { success: true, comentario: comentarioLocal };
    }

    // 2) Não tem local → busca SÓ o comentário no Supabase
    console.log(`📥 Buscando comentário sob demanda: ${questaoId}`);
    const { getSupabaseWithToken } = await import('@/lib/supabaseClient');
    const supabaseClient = await getSupabaseWithToken();

    const { data, error } = await supabaseClient
      .from('banco_questoes')
      .select('comentario')
      .eq('id', questaoId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar comentário:', error);
      return { success: false, comentario: null, error: error.message };
    }

    const comentarioRemoto = data?.comentario ?? null;
    if (!comentarioRemoto) {
      return { success: true, comentario: null };
    }

    // 3) Salva local (sem enqueueOperation — já existe na nuvem, é só cache)
    try {
      await doc.patch({ comentario: comentarioRemoto });
    } catch (patchErr) {
      console.warn('⚠️ Falha ao salvar comentário localmente:', patchErr);
    }

    return { success: true, comentario: comentarioRemoto };
  } catch (e: any) {
    console.error('❌ Falha no buscarComentarioSobDemanda:', e);
    return { success: false, comentario: null, error: e?.message || 'Erro inesperado' };
  }
}