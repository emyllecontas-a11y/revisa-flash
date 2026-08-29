// src/services/simuladoService.ts

import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
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
// 1. BUSCAR TODOS OS SIMULADOS (público - cliente anônimo)
// ============================================================

export async function getSimulados(): Promise<{ success: boolean; data?: Simulado[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('simulados')
      .select(`
        *,
        questoes:questoes(count)
      `)
      .eq('isdeleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const simuladosComContagem = data?.map((s: any) => ({
      ...s,
      questoes_count: s.questoes?.[0]?.count || 0,
    })) || [];

    return { success: true, data: simuladosComContagem };
  } catch (error: any) {
    console.error('Erro ao buscar simulados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 2. BUSCAR SIMULADO COMPLETO (público - questões e alternativas)
// ============================================================

export async function getSimuladoCompleto(
  simuladoId: string
): Promise<{ success: boolean; data?: SimuladoPlayer; error?: string }> {
  try {
    console.log('🔍 Buscando simulado:', simuladoId);
    
    const { data: simulado, error: simuladoError } = await supabase
      .from('simulados')
      .select('*')
      .eq('id', simuladoId)
      .eq('isdeleted', false)
      .single();

    if (simuladoError) {
      console.error('❌ Erro ao buscar simulado:', simuladoError);
      throw simuladoError;
    }
    if (!simulado) throw new Error('Simulado não encontrado');

    console.log('✅ Simulado encontrado:', simulado.titulo);

    const { data: questoes, error: questoesError } = await supabase
      .from('questoes')
      .select('*')
      .eq('simulado_id', simuladoId)
      .eq('isdeleted', false)
      .order('numero', { ascending: true });

    if (questoesError) {
      console.error('❌ Erro ao buscar questoes:', questoesError);
      throw questoesError;
    }

    console.log(`📝 Encontradas ${questoes?.length || 0} questões para o simulado`);

    const questoesComAlternativas: QuestaoPlayer[] = [];
    for (const q of questoes || []) {
      const { data: alternativas, error: altError } = await supabase
        .from('alternativas')
        .select('*')
        .eq('questao_id', q.id)
        .eq('isdeleted', false)
        .order('letra', { ascending: true });

      if (altError) {
        console.error('❌ Erro ao buscar alternativas:', altError);
        throw altError;
      }

      questoesComAlternativas.push({
        ...q,
        alternativas: alternativas || [],
      });
    }

    console.log(`✅ Simulado ${simulado.titulo} carregado com ${questoesComAlternativas.length} questões`);

    return {
      success: true,
      data: {
        ...simulado,
        questoes: questoesComAlternativas,
      },
    };
  } catch (error: any) {
    console.error('❌ Erro ao buscar simulado completo:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 3. BUSCAR PROGRESSO DO USUÁRIO (via RPC)
// ============================================================

export async function getProgresso(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; data?: ProgressoSimulado; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();
    
    console.log(`🔍 Buscando progresso via RPC - simulado: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('buscar_progresso_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
      });

    if (error) {
      console.error('❌ Erro na RPC buscar_progresso_simulado:', error);
      throw error;
    }

    console.log('✅ Progresso encontrado:', data ? 'Sim' : 'Não');

    return { success: true, data: data || undefined };
  } catch (error: any) {
    console.error('Erro ao buscar progresso:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 4. SALVAR PROGRESSO (via RPC)
// ============================================================

export async function salvarProgresso(
  simuladoId: string,
  userId: string,
  progresso: Partial<Omit<ProgressoSimulado, 'id' | 'simulado_id' | 'user_id' | 'created_at'>>
): Promise<{ success: boolean; data?: ProgressoSimulado; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`💾 Salvando progresso via RPC - simulado: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('salvar_progresso_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
        p_respostas: progresso.respostas || {},
        p_eliminadas: progresso.eliminadas || {},
        p_marcadas: progresso.marcadas || [],
        p_tempo_decorrido: progresso.tempo_decorrido || 0,
        p_status: progresso.status || 'em-andamento',
      });

    if (error) {
      console.error('❌ Erro na RPC salvar_progresso_simulado:', error);
      throw error;
    }

    console.log('✅ Progresso salvo via RPC');
    return { success: true, data: data || undefined };
  } catch (error: any) {
    console.error('Erro ao salvar progresso:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 5. FINALIZAR SIMULADO (via RPC) - COM ÁREAS
// ============================================================

export async function finalizarSimulado(
  simuladoId: string,
  userId: string,
  resultado: {
    acertos: number;
    erros: number;
    naoRespondidas: number;
    tempoDecorrido: number;
  },
  respostas: Record<number, string>,
  areas: Record<number, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🏁 Finalizando simulado via RPC - simulado: ${simuladoId}, user: ${userIdStr}`);

    // 1. Finalizar progresso via RPC
    const { error: rpcError } = await supabaseClient
      .rpc('finalizar_progresso_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
      });

    if (rpcError) {
      console.error('❌ Erro na RPC finalizar_progresso_simulado:', rpcError);
      throw rpcError;
    }

    console.log('✅ Progresso finalizado via RPC');

    // 2. Buscar o simulado para obter título e área
    const { data: simulado, error: simError } = await supabase
      .from('simulados')
      .select('titulo, area')
      .eq('id', simuladoId)
      .eq('isdeleted', false)
      .single();

    if (simError) {
      console.error('❌ Erro ao buscar simulado:', simError);
      throw simError;
    }

    // 3. Salvar StudyRecord via RPC
    const totalQuestoes = resultado.acertos + resultado.erros + resultado.naoRespondidas;
    const today = new Date().toISOString().split('T')[0];

    console.log(`📝 Salvando StudyRecord via RPC - user: ${userIdStr}, topic: ${simulado.titulo}`);

    const { error: recordError } = await supabaseClient
      .rpc('salvar_study_record', {
        p_user_id: userIdStr,
        p_date: today,
        p_type: 'pratico',
        p_discipline: simulado.area,
        p_topic: simulado.titulo,
        p_duration: Math.round(resultado.tempoDecorrido / 60),
        p_questions_count: totalQuestoes,
        p_correct_count: resultado.acertos,
        p_wrong_count: resultado.erros,
        p_observations: `Simulado finalizado: ${simulado.titulo}`,
      });

    if (recordError) {
      console.error('❌ Erro na RPC salvar_study_record:', recordError);
      throw recordError;
    }

    // 4. Salvar resultado na tabela resultados_simulado (COM RESPOSTAS E ÁREAS)
    const porcentagem = totalQuestoes > 0 ? Math.round((resultado.acertos / totalQuestoes) * 100) : 0;
    const respostasJson = respostas || {};
    const areasJson = areas || {};

    console.log(`💾 Salvando resultado com ${Object.keys(respostasJson).length} respostas e ${Object.keys(areasJson).length} áreas`);

    const { error: resultError } = await supabaseClient
      .rpc('salvar_resultado_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
        p_total_questoes: totalQuestoes,
        p_acertos: resultado.acertos,
        p_erros: resultado.erros,
        p_nao_respondidas: resultado.naoRespondidas,
        p_porcentagem: porcentagem,
        p_tempo_segundos: resultado.tempoDecorrido,
        p_respostas: respostasJson,
        p_areas: areasJson,
      });

    if (resultError) {
      console.error('❌ Erro na RPC salvar_resultado_simulado:', resultError);
    } else {
      console.log('✅ Resultado salvo com sucesso!');
    }

    console.log('✅ Simulado finalizado com sucesso!');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro ao finalizar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 6. IMPORTAÇÃO DE SIMULADO (via RPC)
// ============================================================

export async function importarSimulado(
  dados: SimuladoImport,
  userId: string
): Promise<{ success: boolean; simuladoId?: string; error?: string }> {
  try {
    if (!userId) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();
    const simuladoId = crypto.randomUUID();

    console.log('📦 Importando simulado via RPC:', dados.titulo);
    console.log('👤 Usuário ID:', userIdStr);
    console.log('🆔 Simulado ID:', simuladoId);
    console.log('📝 Número de questões:', dados.questoes.length);

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
        alternativas: alternativas,
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

    console.log('📤 RPC - Data:', data);
    console.log('📤 RPC - Error:', error);

    if (error) {
      console.error('❌ Erro ao importar simulado via RPC:', error);
      throw error;
    }

    if (data && data.success === true) {
      console.log(`✅ Simulado importado com sucesso! Questões inseridas: ${data.questoes_inseridas || 0}`);
      return { success: true, simuladoId };
    } else {
      console.error('❌ RPC retornou erro:', data);
      throw new Error(data?.error || 'Erro desconhecido na RPC');
    }
  } catch (error: any) {
    console.error('❌ Erro ao importar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 7. EXCLUIR SIMULADO (via RPC)
// ============================================================

export async function excluirSimulado(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🗑️ Excluindo simulado via RPC - simulado: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('excluir_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
      });

    if (error) {
      console.error('❌ Erro na RPC excluir_simulado:', error);
      throw error;
    }

    if (data && data.success === true) {
      console.log('✅ Simulado excluído com sucesso!');
      return { success: true };
    } else {
      const errorMsg = data?.error || 'Erro desconhecido ao excluir';
      console.error('❌ Erro ao excluir simulado:', errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('❌ Erro ao excluir simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 8. ATUALIZAR SIMULADO (via RPC)
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
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`✏️ Atualizando simulado via RPC - simulado: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('atualizar_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
        p_titulo: dados.titulo,
        p_descricao: dados.descricao || null,
        p_area: dados.area,
        p_nivel: dados.nivel,
        p_banca: dados.banca,
        p_ano: dados.ano,
        p_tempo_total: dados.tempo_total,
      });

    if (error) {
      console.error('❌ Erro na RPC atualizar_simulado:', error);
      throw error;
    }

    if (data && data.success === true) {
      console.log('✅ Simulado atualizado com sucesso!');
      return { success: true };
    } else {
      const errorMsg = data?.error || 'Erro desconhecido ao atualizar';
      console.error('❌ Erro ao atualizar simulado:', errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('❌ Erro ao atualizar simulado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 9. SALVAR RESULTADO DO SIMULADO (via RPC)
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
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`💾 Salvando resultado do simulado via RPC: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('salvar_resultado_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
        p_total_questoes: resultado.totalQuestoes,
        p_acertos: resultado.acertos,
        p_erros: resultado.erros,
        p_nao_respondidas: resultado.naoRespondidas,
        p_porcentagem: resultado.porcentagem,
        p_tempo_segundos: resultado.tempoDecorrido,
        p_respostas: {},
        p_areas: {},
      });

    if (error) {
      console.error('❌ Erro na RPC salvar_resultado_simulado:', error);
      throw error;
    }

    console.log('✅ Resultado salvo com sucesso!');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro ao salvar resultado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 10. BUSCAR RESULTADO DO SIMULADO (via RPC)
// ============================================================

export async function buscarResultadoSimulado(
  simuladoId: string,
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🔍 Buscando resultado do simulado via RPC: ${simuladoId}, user: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('buscar_resultado_simulado', {
        p_simulado_id: simuladoId,
        p_user_id: userIdStr,
      });

    if (error) {
      console.error('❌ Erro na RPC buscar_resultado_simulado:', error);
      throw error;
    }

    console.log('✅ Resultado encontrado:', data ? 'Sim' : 'Não');
    return { success: true, data: data || undefined };
  } catch (error: any) {
    console.error('❌ Erro ao buscar resultado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 11. BUSCAR TODOS OS RESULTADOS DO USUÁRIO (via RPC)
// ============================================================

export async function buscarResultadosDoUsuario(
  userId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🔍 Buscando todos os resultados do usuário: ${userIdStr}`);

    const { data, error } = await supabaseClient
      .rpc('buscar_resultados_do_usuario', {
        p_user_id: userIdStr,
      });

    if (error) {
      console.error('❌ Erro na RPC buscar_resultados_do_usuario:', error);
      throw error;
    }

    console.log(`✅ Encontrados ${data?.length || 0} resultados`);
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('❌ Erro ao buscar resultados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 12. BUSCAR HISTÓRICO COMPLETO (com paginação e filtros)
// ============================================================

export async function buscarHistoricoCompleto(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🔍 Buscando histórico completo - user: ${userIdStr}, limit: ${limit}, offset: ${offset}`);

    const { data, error } = await supabaseClient
      .rpc('buscar_historico_completo', {
        p_user_id: userIdStr,
        p_limit: limit,
        p_offset: offset,
      });

    if (error) {
      console.error('❌ Erro na RPC buscar_historico_completo:', error);
      throw error;
    }

    console.log(`✅ Histórico encontrado: ${data?.total || 0} registros`);
    return { success: true, data: data || { total: 0, resultados: [] } };
  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 13. SALVAR COMENTÁRIO GERAL DO SIMULADO
// ============================================================

export async function salvarComentarioGeral(
  resultadoId: string,
  userId: string,
  comentario: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userIdStr = String(userId);
    const supabaseClient = await getSupabaseWithToken();

    console.log(`💾 Salvando comentário geral - resultado: ${resultadoId}`);

    const { data: resultado, error: checkError } = await supabaseClient
      .from('resultados_simulado')
      .select('user_id')
      .eq('id', resultadoId)
      .single();

    if (checkError) throw checkError;
    if (resultado.user_id !== userIdStr) {
      throw new Error('Você não tem permissão para editar este resultado');
    }

    const { error } = await supabaseClient
      .from('resultados_simulado')
      .update({
        comentarios_gerais: comentario,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resultadoId);

    if (error) throw error;
    console.log('✅ Comentário geral salvo!');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro ao salvar comentário geral:', error);
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
    const supabaseClient = await getSupabaseWithToken();

    console.log(`💾 Salvando comentário da questão ${questaoNumero} - resultado: ${resultadoId}`);

    const { data, error } = await supabaseClient
      .rpc('salvar_comentario_questao', {
        p_resultado_id: resultadoId,
        p_questao_numero: questaoNumero,
        p_comentario: comentario,
      });

    if (error) {
      console.error('❌ Erro na RPC salvar_comentario_questao:', error);
      throw error;
    }

    console.log('✅ Comentário da questão salvo!');
    return { success: true, data };
  } catch (error: any) {
    console.error('❌ Erro ao salvar comentário da questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 15. BUSCAR COMENTÁRIOS DE UM RESULTADO
// ============================================================

export async function buscarComentariosResultado(
  resultadoId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const supabaseClient = await getSupabaseWithToken();

    console.log(`🔍 Buscando comentários - resultado: ${resultadoId}`);

    const { data, error } = await supabaseClient
      .rpc('buscar_comentarios_resultado', {
        p_resultado_id: resultadoId,
      });

    if (error) {
      console.error('❌ Erro na RPC buscar_comentarios_resultado:', error);
      throw error;
    }

    console.log(`✅ ${data?.length || 0} comentários encontrados`);
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('❌ Erro ao buscar comentários:', error);
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
    if (!resposta) {
      naoRespondidas++;
      continue;
    }

    const correta = q.alternativas.find(a => a.correta)?.letra;
    if (resposta === correta) {
      acertos++;
    } else {
      erros++;
    }
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