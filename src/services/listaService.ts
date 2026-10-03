// src/services/listaService.ts

import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import {
  Lista,
  QuestaoLista,
  QuestaoListaPlayer,
  ResultadoLista,
  ListaImport,
  ListaPlayer,
  ResultadoListaCalc,
  AcertosPorArea,
  TipoQuestaoLista,
  AlternativaLista,
} from '@/lib/listas-types';

// ============================================================
// HELPERS
// ============================================================

/**
 * Converte um File (imagem selecionada pelo usuário) em string base64
 * no formato "data:image/jpeg;base64,..." — o mesmo formato que a
 * função de upload já espera.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Erro ao ler arquivo ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ============================================================
// 1. LISTAR AS LISTAS DO USUÁRIO
// ============================================================

export async function getListas(
  userId: string
): Promise<{ success: boolean; data?: Lista[]; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { data, error } = await client
      .from('listas')
      .select(`
        *,
        questoes:listas_questoes(count)
      `)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const listasComContagem = (data || []).map((l: any) => ({
      ...l,
      questoes_count: l.questoes?.[0]?.count || 0,
    }));

    return { success: true, data: listasComContagem };
  } catch (error: any) {
    console.error('Erro ao buscar listas:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 2. BUSCAR LISTA COMPLETA (com questões)
// ============================================================

export async function getListaCompleta(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: ListaPlayer; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { data: lista, error: listaError } = await client
      .from('listas')
      .select('*')
      .eq('id', listaId)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .single();

    if (listaError) throw listaError;
    if (!lista) throw new Error('Lista não encontrada');

    const { data: links, error: linksError } = await client
      .from('listas_questoes')
      .select(`
        ordem,
        questao:questoes_lista(*)
      `)
      .eq('lista_id', listaId)
      .order('ordem', { ascending: true });

    if (linksError) throw linksError;

    const questoes: QuestaoListaPlayer[] = (links || [])
      .filter((l: any) => l.questao && !l.questao.isdeleted)
      .map((l: any) => ({
        ...l.questao,
        numero: l.ordem,
      }));

    return {
      success: true,
      data: {
        ...lista,
        questoes,
      },
    };
  } catch (error: any) {
    console.error('Erro ao buscar lista completa:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 3. UPLOAD DE IMAGEM (base64 -> Storage)
// ============================================================

export async function uploadImagemQuestao(
  base64: string,
  userId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const match = base64.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (!match) {
      return { success: false, error: 'Formato de imagem inválido' };
    }

    const formato = match[1];
    const dados = match[2];
    const extensao = formato === 'jpeg' ? 'jpg' : formato;

    const tamanhoBytes = Math.ceil((dados.length * 3) / 4);
    if (tamanhoBytes > 2 * 1024 * 1024) {
      return { success: false, error: 'Imagem maior que 2 MB' };
    }

    const binario = atob(dados);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: `image/${formato}` });

    const nomeArquivo = `${userId}/${crypto.randomUUID()}.${extensao}`;

    const { error: uploadError } = await client.storage
      .from('questoes-imagens')
      .upload(nomeArquivo, blob, {
        contentType: `image/${formato}`,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage
      .from('questoes-imagens')
      .getPublicUrl(nomeArquivo);

    return { success: true, url: urlData.publicUrl };
  } catch (error: any) {
    console.error('Erro no upload de imagem:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 4. IMPORTAR LISTA (JSON -> RPC)
// ============================================================

export async function importarLista(
  dados: ListaImport,
  userId: string,
  disciplineId: string,
  imagensFiles?: File[]
): Promise<{ success: boolean; listaId?: string; error?: string }> {
  try {
    if (!userId) return { success: false, error: 'Usuário não autenticado' };
    if (!disciplineId) return { success: false, error: 'Disciplina é obrigatória' };

    const client = await getSupabaseWithToken();
    const listaId = crypto.randomUUID();

    const arquivosMap = new Map<string, File>();
    (imagensFiles || []).forEach((f) => {
      arquivosMap.set(f.name.toLowerCase(), f);
    });

    const faltando: string[] = [];
    dados.questoes.forEach((q, i) => {
      if (q.imagem && !q.imagem_base64) {
        const key = q.imagem.toLowerCase();
        if (!arquivosMap.has(key)) {
          faltando.push(`Questão ${q.numero || i + 1}: "${q.imagem}"`);
        }
      }
    });
    if (faltando.length > 0) {
      return {
        success: false,
        error:
          `As seguintes imagens não foram encontradas nos arquivos selecionados:\n` +
          faltando.join('\n') +
          `\n\nSelecione esses arquivos junto com o JSON e tente de novo.`,
      };
    }

    const questoesFormatadas = [];
    for (let i = 0; i < dados.questoes.length; i++) {
      const q = dados.questoes[i];
      let imagemUrl: string | null = null;

      let base64Final: string | null = null;

      if (q.imagem && !q.imagem_base64) {
        const arquivo = arquivosMap.get(q.imagem.toLowerCase());
        if (arquivo) {
          try {
            base64Final = await fileToBase64(arquivo);
          } catch (err: any) {
            return {
              success: false,
              error: `Erro ao ler imagem da questão ${q.numero || i + 1}: ${err.message}`,
            };
          }
        }
      } else if (q.imagem_base64) {
        base64Final = q.imagem_base64;
      }

      if (base64Final) {
        const upload = await uploadImagemQuestao(base64Final, userId);
        if (!upload.success) {
          return {
            success: false,
            error: `Erro na imagem da questão ${q.numero || i + 1}: ${upload.error}`,
          };
        }
        imagemUrl = upload.url || null;
      }

      const questaoFormatada: any = {
        numero: q.numero || i + 1,
        tipo: q.tipo,
        enunciado: q.enunciado,
        area: q.area || null,
        imagem_url: imagemUrl,
        comentario_geral: q.comentario_geral || null,
      };

      if (q.tipo === 'multipla_escolha') {
        questaoFormatada.alternativas = q.alternativas || [];
      } else if (q.tipo === 'certo_errado') {
        questaoFormatada.correta = q.correta === true;
      }

      questoesFormatadas.push(questaoFormatada);
    }

    const { data, error } = await client.rpc('importar_lista', {
      p_lista_id: listaId,
      p_user_id: userId,
      p_discipline_id: disciplineId,
      p_titulo: dados.titulo,
      p_descricao: dados.descricao || null,
      p_questoes: questoesFormatadas,
    });

    if (error) throw error;

    if (data && data.success === true) {
      return { success: true, listaId };
    }
    return { success: false, error: data?.error || 'Erro desconhecido na RPC' };
  } catch (error: any) {
    console.error('Erro ao importar lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 5. EXCLUIR LISTA (soft delete — também marca resultados)
// ============================================================

export async function excluirLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    // 1. Marca a lista como excluída
    const { error: listaError } = await client
      .from('listas')
      .update({ isdeleted: true, updated_at: new Date().toISOString() })
      .eq('id', listaId)
      .eq('user_id', userId);

    if (listaError) throw listaError;

    // 2. Marca os resultados dessa lista como excluídos também
    const { error: resultadosError } = await client
      .from('resultados_lista')
      .update({ isdeleted: true })
      .eq('lista_id', listaId)
      .eq('user_id', userId);

    if (resultadosError) throw resultadosError;

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao excluir lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 6. SALVAR RESULTADO DA LISTA (histórico — sempre INSERT)
// ============================================================

export async function salvarResultadoLista(
  listaId: string,
  userId: string,
  resultado: ResultadoListaCalc,
  respostas: Record<number, string>,
  areas: Record<number, string>,
  acertosPorArea: AcertosPorArea
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { error } = await client.from('resultados_lista').insert({
      id: crypto.randomUUID(),
      lista_id: listaId,
      user_id: userId,
      total_questoes: resultado.totalQuestoes,
      acertos: resultado.acertos,
      erros: resultado.erros,
      nao_respondidas: resultado.naoRespondidas,
      porcentagem: resultado.porcentagem,
      tempo_segundos: resultado.tempoDecorrido,
      respostas,
      areas,
      acertos_por_area: acertosPorArea,
    });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao salvar resultado:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 7. BUSCAR HISTÓRICO DE UMA LISTA
// ============================================================

export async function buscarResultadosLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: ResultadoLista[]; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { data, error } = await client
      .from('resultados_lista')
      .select('*')
      .eq('lista_id', listaId)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Erro ao buscar resultados da lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 8. BUSCAR TODOS OS RESULTADOS DO USUÁRIO
// ============================================================

export async function buscarTodosResultados(
  userId: string
): Promise<{ success: boolean; data?: ResultadoLista[]; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { data, error } = await client
      .from('resultados_lista')
      .select('*')
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Erro ao buscar resultados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 9. CALCULAR RESULTADO (em memória, durante o player)
// ============================================================

export function calcularResultadoLista(
  questoes: QuestaoListaPlayer[],
  respostas: Record<number, string>
): ResultadoListaCalc {
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

    let correta: string | null = null;
    if (q.tipo === 'multipla_escolha') {
      correta = q.alternativas?.find((a) => a.correta)?.letra || null;
    } else if (q.tipo === 'certo_errado') {
      correta = q.gabarito_ce ? 'C' : 'E';
    }

    if (resposta === correta) acertos++;
    else erros++;
  }

  const porcentagem = total > 0 ? Math.round((acertos / total) * 100) : 0;

  return {
    listaId: '',
    totalQuestoes: total,
    respondidas: acertos + erros,
    acertos,
    erros,
    naoRespondidas,
    porcentagem,
    tempoDecorrido: 0,
  };
}

// ============================================================
// 10. CALCULAR ACERTOS POR ÁREA (para estatísticas)
// ============================================================

export function calcularAcertosPorArea(
  questoes: QuestaoListaPlayer[],
  respostas: Record<number, string>
): AcertosPorArea {
  const mapa: AcertosPorArea = {};
  for (const q of questoes) {
    const area = q.area || 'Não categorizada';
    if (!mapa[area]) mapa[area] = { acertos: 0, total: 0 };
    mapa[area].total++;

    const resposta = respostas[q.numero];
    if (!resposta) continue;

    let correta: string | null = null;
    if (q.tipo === 'multipla_escolha') {
      correta = q.alternativas?.find((a) => a.correta)?.letra || null;
    } else if (q.tipo === 'certo_errado') {
      correta = q.gabarito_ce ? 'C' : 'E';
    }

    if (resposta === correta) mapa[area].acertos++;
  }
  return mapa;
}

// ============================================================
// 11. EDITAR METADADOS DA LISTA (título, descrição)
// ============================================================

export async function atualizarLista(
  listaId: string,
  userId: string,
  dados: { titulo: string; descricao: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!dados.titulo || dados.titulo.trim().length === 0) {
      return { success: false, error: 'Título é obrigatório' };
    }

    const client = await getSupabaseWithToken();

    const { error } = await client
      .from('listas')
      .update({
        titulo: dados.titulo.trim(),
        descricao: dados.descricao?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listaId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 12. REMOVER QUESTÃO DA LISTA
// ============================================================
//
// Remove o vínculo entre a questão e esta lista.
// Se a questão não estiver em NENHUMA outra lista depois disso,
// ela também é marcada como excluída (soft delete).

export async function removerQuestaoDALista(
  listaId: string,
  questaoId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    // 1. Confirma que a lista é do usuário
    const { data: lista, error: listaError } = await client
      .from('listas')
      .select('id')
      .eq('id', listaId)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .single();

    if (listaError || !lista) {
      return { success: false, error: 'Lista não encontrada' };
    }

    // 2. Remove o vínculo
    const { error: linkError } = await client
      .from('listas_questoes')
      .delete()
      .eq('lista_id', listaId)
      .eq('questao_id', questaoId);

    if (linkError) throw linkError;

    // 3. Verifica se a questão ainda está em outra lista
    const { data: outrosVinculos, error: checkError } = await client
      .from('listas_questoes')
      .select('id')
      .eq('questao_id', questaoId)
      .limit(1);

    if (checkError) throw checkError;

    // 4. Se não está mais em nenhuma lista, marca como excluída
    if (!outrosVinculos || outrosVinculos.length === 0) {
      const { error: softError } = await client
        .from('questoes_lista')
        .update({ isdeleted: true })
        .eq('id', questaoId)
        .eq('user_id', userId);

      if (softError) throw softError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao remover questão da lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 13. BUSCAR QUESTÕES DE UMA LISTA (para o modal de gerenciar)
// ============================================================

export async function buscarQuestoesDaLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: QuestaoListaPlayer[]; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    // Confirma que a lista é do usuário
    const { data: lista, error: listaError } = await client
      .from('listas')
      .select('id')
      .eq('id', listaId)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .single();

    if (listaError || !lista) {
      return { success: false, error: 'Lista não encontrada' };
    }

    const { data: links, error: linksError } = await client
      .from('listas_questoes')
      .select(`
        ordem,
        questao:questoes_lista(*)
      `)
      .eq('lista_id', listaId)
      .order('ordem', { ascending: true });

    if (linksError) throw linksError;

    const questoes: QuestaoListaPlayer[] = (links || [])
      .filter((l: any) => l.questao && !l.questao.isdeleted)
      .map((l: any) => ({
        ...l.questao,
        numero: l.ordem,
      }));

    return { success: true, data: questoes };
  } catch (error: any) {
    console.error('Erro ao buscar questões da lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 14. ADICIONAR QUESTÃO A UMA LISTA
// ============================================================

export async function criarQuestaoNaLista(
  listaId: string,
  userId: string,
  disciplineId: string,
  dados: {
    tipo: TipoQuestaoLista;
    enunciado: string;
    area: string | null;
    imagem_url: string | null;
    comentario_geral: string | null;
    alternativas: AlternativaLista[] | null;
    gabarito_ce: boolean | null;
  }
): Promise<{ success: boolean; questaoId?: string; error?: string }> {
  try {
    if (!dados.enunciado || dados.enunciado.trim().length === 0) {
      return { success: false, error: 'Enunciado é obrigatório' };
    }
    if (dados.tipo === 'multipla_escolha') {
      if (!dados.alternativas || dados.alternativas.length < 2) {
        return { success: false, error: 'Múltipla escolha precisa de pelo menos 2 alternativas' };
      }
      const corretas = dados.alternativas.filter(a => a.correta).length;
      if (corretas !== 1) {
        return { success: false, error: 'Marque exatamente uma alternativa como correta' };
      }
    }

    const client = await getSupabaseWithToken();
    const questaoId = crypto.randomUUID();

    // 1. Insere a questão
    const { error: qError } = await client
      .from('questoes_lista')
      .insert({
        id: questaoId,
        user_id: userId,
        discipline_id: disciplineId,
        tipo: dados.tipo,
        enunciado: dados.enunciado.trim(),
        area: dados.area?.trim() || null,
        imagem_url: dados.imagem_url,
        comentario_geral: dados.comentario_geral?.trim() || null,
        alternativas: dados.tipo === 'multipla_escolha' ? dados.alternativas : null,
        gabarito_ce: dados.tipo === 'certo_errado' ? dados.gabarito_ce : null,
      });

    if (qError) throw qError;

    // 2. Descobre a próxima ordem na lista
    const { data: ultima, error: ordemError } = await client
      .from('listas_questoes')
      .select('ordem')
      .eq('lista_id', listaId)
      .order('ordem', { ascending: false })
      .limit(1);

    if (ordemError) throw ordemError;

    const proximaOrdem = (ultima?.[0]?.ordem || 0) + 1;

    // 3. Vincula à lista
    const { error: linkError } = await client
      .from('listas_questoes')
      .insert({
        lista_id: listaId,
        questao_id: questaoId,
        ordem: proximaOrdem,
      });

    if (linkError) throw linkError;

    return { success: true, questaoId };
  } catch (error: any) {
    console.error('Erro ao criar questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 15. ATUALIZAR QUESTÃO EXISTENTE
// ============================================================

export async function atualizarQuestaoLista(
  questaoId: string,
  userId: string,
  dados: {
    tipo: TipoQuestaoLista;
    enunciado: string;
    area: string | null;
    imagem_url: string | null;
    comentario_geral: string | null;
    alternativas: AlternativaLista[] | null;
    gabarito_ce: boolean | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!dados.enunciado || dados.enunciado.trim().length === 0) {
      return { success: false, error: 'Enunciado é obrigatório' };
    }
    if (dados.tipo === 'multipla_escolha') {
      if (!dados.alternativas || dados.alternativas.length < 2) {
        return { success: false, error: 'Múltipla escolha precisa de pelo menos 2 alternativas' };
      }
      const corretas = dados.alternativas.filter(a => a.correta).length;
      if (corretas !== 1) {
        return { success: false, error: 'Marque exatamente uma alternativa como correta' };
      }
    }

    const client = await getSupabaseWithToken();

    const { error } = await client
      .from('questoes_lista')
      .update({
        tipo: dados.tipo,
        enunciado: dados.enunciado.trim(),
        area: dados.area?.trim() || null,
        imagem_url: dados.imagem_url,
        comentario_geral: dados.comentario_geral?.trim() || null,
        alternativas: dados.tipo === 'multipla_escolha' ? dados.alternativas : null,
        gabarito_ce: dados.tipo === 'certo_errado' ? dados.gabarito_ce : null,
      })
      .eq('id', questaoId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 16. BUSCAR UMA QUESTÃO POR ID
// ============================================================

export async function buscarQuestao(
  questaoId: string,
  userId: string
): Promise<{ success: boolean; data?: QuestaoLista; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const { data, error } = await client
      .from('questoes_lista')
      .select('*')
      .eq('id', questaoId)
      .eq('user_id', userId)
      .eq('isdeleted', false)
      .single();

    if (error) throw error;
    return { success: true, data: data as QuestaoLista };
  } catch (error: any) {
    console.error('Erro ao buscar questão:', error);
    return { success: false, error: error.message };
  }
}