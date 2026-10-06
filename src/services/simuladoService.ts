// src/services/simuladoService.ts

import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import {
  Simulado,
  Questao,
  Alternativa,
  ProgressoSimulado,
  SimuladoImport,
  QuestaoPlayer,
  SimuladoPlayer,
  ProgressoPlayer,
  ResultadoSimulado,
} from '@/lib/simulados-types';

// ============================================================
// HELPERS
// ============================================================

function nowIso(): string {
  return new Date().toISOString();
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Serializa escritas por chave (evita race no RxDB)
const saveQueues = new Map<string, Promise<any>>();
function serializar<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const anterior = saveQueues.get(key) || Promise.resolve();
  const proxima = anterior.then(() => fn()).catch((e) => {
    console.warn('⚠️ Erro na fila serializada:', e);
    return undefined as any;
  });
  saveQueues.set(key, proxima);
  // Limpa quando terminar para não vazar memória
  proxima.finally(() => {
    if (saveQueues.get(key) === proxima) saveQueues.delete(key);
  });
  return proxima;
}

// ============================================================
// 1. LISTAR SIMULADOS
// ============================================================

export async function getSimulados(): Promise<{ success: boolean; data?: Simulado[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.simulados.find({ selector: { isdeleted: false } }).exec();
    let simulados: Simulado[] = docs.map((d: any) => d.toJSON());

    if (simulados.length === 0 && isOnline()) {
      try {
        const client = await getSupabaseWithToken();
        const { data } = await client.from('simulados').select('*').eq('isdeleted', false);
        for (const doc of data || []) {
          const ex = await db.simulados.findOne({ selector: { id: doc.id } }).exec();
          if (!ex) await db.simulados.insert(doc).catch(() => {});
        }
        simulados = (data || []) as Simulado[];
      } catch (e) {
        console.warn('⚠️ Fallback getSimulados falhou:', e);
      }
    }

    const questoes = await db.questoes.find({ selector: {} }).exec();
    const contagemPorSimulado: Record<string, number> = {};
    for (const q of questoes) {
      const j: any = q.toJSON();
      if (j.isdeleted) continue;
      contagemPorSimulado[j.simulado_id] = (contagemPorSimulado[j.simulado_id] || 0) + 1;
    }

    simulados = simulados.map((s) => ({
      ...s,
      questoes_count: contagemPorSimulado[s.id] || 0,
    }));
    simulados.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return { success: true, data: simulados };
  } catch (error: any) {
    console.error('Erro ao buscar simulados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 2. BUSCAR SIMULADO COMPLETO
// ============================================================

export async function getSimuladoCompleto(
  simuladoId: string
): Promise<{ success: boolean; data?: SimuladoPlayer; error?: string }> {
  try {
    const db = await getDb();

    let simDoc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    let qDocs = await db.questoes.find({
      selector: { simulado_id: simuladoId, isdeleted: false },
    }).exec();

    const precisaBuscar = (!simDoc || qDocs.length === 0);
    if (precisaBuscar && isOnline()) {
      try {
        const client = await getSupabaseWithToken();

        if (!simDoc) {
          const { data: sim } = await client
            .from('simulados')
            .select('*')
            .eq('id', simuladoId)
            .eq('isdeleted', false)
            .maybeSingle();
          if (sim) await db.simulados.insert(sim).catch(() => {});
        }

        const { data: qs } = await client
          .from('questoes')
          .select('*')
          .eq('simulado_id', simuladoId)
          .eq('isdeleted', false);

        for (const q of qs || []) {
          const ex = await db.questoes.findOne({ selector: { id: q.id } }).exec();
          if (!ex) await db.questoes.insert(q).catch(() => {});
        }

        const qIds = (qs || []).map((q: any) => q.id);
        for (const chunk of chunkArray(qIds, 100)) {
          const { data: alts } = await client
            .from('alternativas')
            .select('*')
            .in('questao_id', chunk)
            .eq('isdeleted', false);
          for (const a of alts || []) {
            const ex = await db.alternativas.findOne({ selector: { id: a.id } }).exec();
            if (!ex) await db.alternativas.insert(a).catch(() => {});
          }
        }

        simDoc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
        qDocs = await db.questoes.find({
          selector: { simulado_id: simuladoId, isdeleted: false },
        }).exec();
      } catch (e) {
        console.warn('⚠️ Fallback online do simulado falhou:', e);
      }
    }

    if (!simDoc) return { success: false, error: 'Simulado não encontrado' };
    const simulado: any = simDoc.toJSON();

    if (qDocs.length === 0) {
      if (!isOnline()) {
        return {
          success: false,
          error: 'Este simulado ainda não foi baixado. Conecte-se à internet uma vez para baixá-lo.',
        };
      }
      return { success: false, error: 'Este simulado não possui questões cadastradas.' };
    }

    const questoes = qDocs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (a.numero || 0) - (b.numero || 0));

    const questoesComAlt: QuestaoPlayer[] = [];
    for (const q of questoes) {
      const altDocs = await db.alternativas.find({
        selector: { questao_id: q.id, isdeleted: false },
      }).exec();
      const alternativas: Alternativa[] = altDocs
        .map((d: any) => d.toJSON())
        .sort((a: any, b: any) => (a.letra || '').localeCompare(b.letra || ''));
      questoesComAlt.push({ ...q, alternativas });
    }

    return { success: true, data: { ...simulado, questoes: questoesComAlt } };
  } catch (error: any) {
    console.error('Erro ao buscar simulado completo:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 3. BUSCAR PROGRESSO
// ============================================================

export async function getProgresso(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; data?: ProgressoSimulado; error?: string }> {
  try {
    const db = await getDb();
    let doc = await db.progresso_simulado.findOne({
      selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
    }).exec();

    if (!doc && isOnline()) {
      try {
        const client = await getSupabaseWithToken();
        const { data } = await client
          .from('progresso_simulado')
          .select('*')
          .eq('simulado_id', simuladoId)
          .eq('user_id', userId)
          .eq('isdeleted', false)
          .maybeSingle();
        if (data) {
          await db.progresso_simulado.insert(data).catch(() => {});
          doc = await db.progresso_simulado.findOne({ selector: { id: data.id } }).exec();
        }
      } catch (e) {
        console.warn('⚠️ Fallback getProgresso falhou:', e);
      }
    }

    return { success: true, data: doc ? (doc.toJSON() as ProgressoSimulado) : undefined };
  } catch (error: any) {
    console.error('Erro ao buscar progresso:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 4. SALVAR PROGRESSO — serializado + merge seguro
// ============================================================

export async function salvarProgresso(
  simuladoId: string,
  userId: string,
  progresso: Partial<Omit<ProgressoSimulado, 'id' | 'simulado_id' | 'user_id' | 'created_at'>>
): Promise<{ success: boolean; data?: ProgressoSimulado; error?: string }> {
  const lockKey = `progresso_simulado:${simuladoId}:${userId}`;

  return serializar(lockKey, async () => {
    try {
      const db = await getDb();
      const now = nowIso();

      // SEMPRE lê o doc atual antes de tocar (evita usar state velho)
      const existing = await db.progresso_simulado.findOne({
        selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
      }).exec();

      // Regra de proteção: nunca sobrescrever com dados vazios se já tem dados
      const existingRespostas: any = existing?.get('respostas') || {};
      const existingMarcadas: any = existing?.get('marcadas') || [];
      const existingTempo: number = existing?.get('tempo_decorrido') || 0;

      const novasRespostas = progresso.respostas ?? existingRespostas;
      const novasMarcadas = progresso.marcadas ?? existingMarcadas;
      const novoTempo = progresso.tempo_decorrido ?? existingTempo;

      // Se a chamada veio com TUDO vazio mas já tem dados no banco, ignora
      const veioVazio =
        Object.keys(progresso.respostas || {}).length === 0 &&
        (progresso.marcadas || []).length === 0 &&
        (progresso.tempo_decorrido || 0) === 0;
      const jaTemDados =
        Object.keys(existingRespostas).length > 0 ||
        existingMarcadas.length > 0 ||
        existingTempo > 0;

      if (veioVazio && jaTemDados) {
        console.log('⏭️ Ignorando save com dados vazios (já tem progresso)');
        return {
          success: true,
          data: existing ? (existing.toJSON() as ProgressoSimulado) : undefined,
        };
      }

      if (existing) {
        const patch = {
          respostas: novasRespostas,
          eliminadas: progresso.eliminadas ?? existing.get('eliminadas') ?? {},
          marcadas: novasMarcadas,
          tempo_decorrido: novoTempo,
          status: progresso.status ?? existing.get('status') ?? 'em-andamento',
          updated_at: now,
        };
        await existing.patch(patch);
        await enqueueOperation('update', 'progresso_simulado', {
          id: existing.get('id'), ...patch,
        });
        const updated: any = (await db.progresso_simulado.findOne({
          selector: { id: existing.get('id') },
        }).exec())?.toJSON();
        return { success: true, data: updated };
      } else {
        const doc = {
          id: crypto.randomUUID(),
          simulado_id: simuladoId,
          user_id: userId,
          respostas: progresso.respostas || {},
          eliminadas: progresso.eliminadas || {},
          marcadas: progresso.marcadas || [],
          tempo_decorrido: progresso.tempo_decorrido || 0,
          status: progresso.status || 'em-andamento',
          created_at: now,
          updated_at: now,
          isdeleted: false,
        };
        await db.progresso_simulado.insert(doc);
        await enqueueOperation('create', 'progresso_simulado', doc);
        return { success: true, data: doc as any };
      }
    } catch (error: any) {
      console.error('Erro ao salvar progresso:', error);
      return { success: false, error: error.message };
    }
  });
}

// ============================================================
// 5. FINALIZAR SIMULADO
// ============================================================

export async function finalizarSimulado(
  simuladoId: string,
  userId: string,
  resultado: { acertos: number; erros: number; naoRespondidas: number; tempoDecorrido: number },
  respostas: Record<number, string>,
  areas: Record<number, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    const totalQuestoes = resultado.acertos + resultado.erros + resultado.naoRespondidas;
    const porcentagem = totalQuestoes > 0 ? Math.round((resultado.acertos / totalQuestoes) * 100) : 0;

    const progDoc = await db.progresso_simulado.findOne({
      selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
    }).exec();
    if (progDoc) {
      await progDoc.patch({ status: 'concluido', updated_at: now });
      await enqueueOperation('update', 'progresso_simulado', {
        id: progDoc.get('id'), status: 'concluido', updated_at: now,
      });
    }

    const simDoc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    const sim: any = simDoc ? simDoc.toJSON() : { titulo: 'Simulado', area: 'Não categorizada' };

    const today = new Date().toISOString().split('T')[0];
    const studyRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      date: today,
      type: 'pratico',
      discipline: sim.area || 'Não categorizada',
      topic: sim.titulo || 'Simulado',
      duration: Math.round(resultado.tempoDecorrido / 60),
      material: null,
      questionsCount: totalQuestoes,
      correctCount: resultado.acertos,
      wrongCount: resultado.erros,
      source: 'simulado',
      observations: `Simulado finalizado: ${sim.titulo || ''}`,
      createdAt: now,
      updated_at: now,
      isDeleted: false,
    };
    await db.study_records.insert(studyRecord).catch((e) => {
      console.warn('⚠️ Erro ao inserir study_record local:', e);
    });

    const resultadoDoc = {
      id: crypto.randomUUID(),
      simulado_id: simuladoId,
      user_id: userId,
      total_questoes: totalQuestoes,
      acertos: resultado.acertos,
      erros: resultado.erros,
      nao_respondidas: resultado.naoRespondidas,
      porcentagem,
      tempo_segundos: resultado.tempoDecorrido,
      respostas: respostas || {},
      areas: areas || {},
      comentarios_gerais: null,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };
    await db.resultados_simulado.insert(resultadoDoc);
    await enqueueOperation('create', 'resultados_simulado', resultadoDoc);

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao finalizar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 6. IMPORTAR SIMULADO
// ============================================================

export async function importarSimulado(
  dados: SimuladoImport,
  userId: string
): Promise<{ success: boolean; simuladoId?: string; error?: string }> {
  try {
    if (!userId) return { success: false, error: 'Usuário não autenticado' };
    if (!isOnline()) {
      return {
        success: false,
        error: 'Você está offline. A importação de simulados precisa de conexão com a internet.',
      };
    }

    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();
    const simuladoId = crypto.randomUUID();

    const questoesFormatadas = dados.questoes.map((q, index) => {
      const alternativas = q.alternativas.map(a => ({
        letra: a.letra || String.fromCharCode(65 + (q.alternativas.indexOf(a) % 5)),
        texto: a.texto || '',
        correta: a.correta || false,
        comentario: a.comentario || null,
      }));
      return {
        numero: q.numero || index + 1,
        enunciado: q.enunciado || '',
        area: q.area || null,
        comentario_geral: q.comentario_geral || null,
        alternativas,
      };
    });

    const { data, error } = await supabaseClient
      .rpc('importar_simulado', {
        p_id: simuladoId,
        p_titulo: dados.titulo,
        p_descricao: dados.descricao || null,
        p_area: dados.area,
        p_nivel: dados.nivel,
        p_banca: dados.banca,
        p_ano: dados.ano,
        p_tempo_total: dados.tempo_total,
        p_created_by: userIdStr,
        p_questoes: questoesFormatadas,
      });

    if (error) throw error;

    if (data && data.success === true) {
      import('@/lib/db').then(({ syncWithSupabase }) => {
        syncWithSupabase(userId).catch(() => {});
      });
      return { success: true, simuladoId };
    }
    return { success: false, error: data?.error || 'Erro desconhecido na RPC' };
  } catch (error: any) {
    console.error('Erro ao importar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 7. EXCLUIR SIMULADO
// ============================================================

export async function excluirSimulado(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    const progs = await db.progresso_simulado.find({
      selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
    }).exec();
    for (const p of progs) {
      await p.patch({ isdeleted: true, updated_at: now });
      await enqueueOperation('update', 'progresso_simulado', {
        id: p.get('id'), isdeleted: true, updated_at: now,
      });
    }

    const results = await db.resultados_simulado.find({
      selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
    }).exec();
    for (const r of results) {
      await r.patch({ isdeleted: true, updated_at: now });
      await enqueueOperation('update', 'resultados_simulado', {
        id: r.get('id'), isdeleted: true, updated_at: now,
      });
    }

    const simDoc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    if (simDoc) await simDoc.patch({ isdeleted: true, updated_at: now });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao excluir simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 8. ATUALIZAR SIMULADO
// ============================================================

export async function atualizarSimulado(
  simuladoId: string,
  userId: string,
  dados: {
    titulo: string;
    descricao: string | null;
    area: string;
    nivel: 'Básico' | 'Intermediário' | 'Avançado';
    banca: string;
    ano: number;
    tempo_total: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();
    const patch = { ...dados, updated_at: now };

    const doc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    if (!doc) return { success: false, error: 'Simulado não encontrado' };
    await doc.patch(patch);
    await enqueueOperation('update', 'simulados', { id: simuladoId, ...patch });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 9. SALVAR RESULTADO
// ============================================================

export async function salvarResultadoSimulado(
  simuladoId: string,
  userId: string,
  resultado: {
    totalQuestoes: number;
    acertos: number;
    erros: number;
    naoRespondidas: number;
    porcentagem: number;
    tempoDecorrido: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc = {
      id: crypto.randomUUID(),
      simulado_id: simuladoId,
      user_id: userId,
      total_questoes: resultado.totalQuestoes,
      acertos: resultado.acertos,
      erros: resultado.erros,
      nao_respondidas: resultado.naoRespondidas,
      porcentagem: resultado.porcentagem,
      tempo_segundos: resultado.tempoDecorrido,
      respostas: {},
      areas: {},
      comentarios_gerais: null,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };
    await db.resultados_simulado.insert(doc);
    await enqueueOperation('create', 'resultados_simulado', doc);
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao salvar resultado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 10. BUSCAR RESULTADO
// ============================================================

export async function buscarResultadoSimulado(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.resultados_simulado.find({
      selector: { simulado_id: simuladoId, user_id: userId, isdeleted: false },
    }).exec();
    if (docs.length === 0) return { success: true, data: undefined };

    const sorted = docs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { success: true, data: sorted[0] };
  } catch (error: any) {
    console.error('Erro ao buscar resultado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 11. BUSCAR TODOS OS RESULTADOS DO USUÁRIO
// ============================================================

export async function buscarResultadosDoUsuario(
  userId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.resultados_simulado.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    const data = docs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar resultados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 12. BUSCAR HISTÓRICO COMPLETO
// ============================================================

export async function buscarHistoricoCompleto(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.resultados_simulado.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    const all = docs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    const slice = all.slice(offset, offset + limit);
    return { success: true, data: { total: all.length, resultados: slice } };
  } catch (error: any) {
    console.error('Erro ao buscar histórico:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 13. SALVAR COMENTÁRIO GERAL
// ============================================================

export async function salvarComentarioGeral(
  resultadoId: string,
  userId: string,
  comentario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc = await db.resultados_simulado.findOne({
      selector: { id: resultadoId, user_id: userId },
    }).exec();
    if (!doc) return { success: false, error: 'Resultado não encontrado' };

    await doc.patch({ comentarios_gerais: comentario, updated_at: now });
    await enqueueOperation('update', 'resultados_simulado', {
      id: resultadoId, comentarios_gerais: comentario, updated_at: now,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao salvar comentário geral:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 14. SALVAR COMENTÁRIO DE QUESTÃO
// ============================================================

export async function salvarComentarioQuestao(
  resultadoId: string,
  questaoNumero: number,
  comentario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();
    const doc = await db.resultados_simulado.findOne({
      selector: { id: resultadoId },
    }).exec();
    if (!doc) return { success: false, error: 'Resultado não encontrado' };

    const respostas: any = doc.get('respostas') || {};
    respostas[`__comentario_q_${questaoNumero}`] = comentario;

    await doc.patch({ respostas, updated_at: now });
    await enqueueOperation('update', 'resultados_simulado', {
      id: resultadoId, respostas, updated_at: now,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao salvar comentário da questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 15. BUSCAR COMENTÁRIOS
// ============================================================

export async function buscarComentariosResultado(
  resultadoId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.resultados_simulado.findOne({
      selector: { id: resultadoId },
    }).exec();
    if (!doc) return { success: true, data: [] };

    const respostas: any = doc.get('respostas') || {};
    const comentarios: any[] = [];
    for (const key of Object.keys(respostas)) {
      if (key.startsWith('__comentario_q_')) {
        const num = Number(key.replace('__comentario_q_', ''));
        comentarios.push({ questao_numero: num, comentario: respostas[key] });
      }
    }
    return { success: true, data: comentarios };
  } catch (error: any) {
    console.error('Erro ao buscar comentários:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 16. CALCULAR RESULTADO
// ============================================================

export function calcularResultado(
  questoes: QuestaoPlayer[],
  respostas: Record<number, string>
): ResultadoSimulado {
  const total = questoes.length;
  let acertos = 0;
  let erros = 0;
  let naoRespondidas = 0;

  for (const q of questoes) {
    const resposta = respostas[q.numero];
    if (!resposta) { naoRespondidas++; continue; }
    const correta = q.alternativas.find(a => a.correta)?.letra;
    if (resposta === correta) acertos++;
    else erros++;
  }

  const respondidas = acertos + erros;
  const porcentagem = total > 0 ? Math.round((acertos / total) * 100) : 0;

  return {
    simuladoId: questoes[0]?.simulado_id || '',
    totalQuestoes: total,
    respondidas,
    acertos,
    erros,
    naoRespondidas,
    porcentagem,
    tempoDecorrido: 0,
  };
}