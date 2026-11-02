// src/services/gerarSimuladoErrosService.ts
import { getDb, syncWithSupabase } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import type { ErrorRecord } from '@/contexts/ErrorContext';

export interface GerarSimuladoParams {
  userId: string;
  disciplineId: string;
  errosIds: string[];
  titulo: string;
  nivel: 'Básico' | 'Intermediário' | 'Avançado';
  area: string;
  banca: string;
  ano: number;
  tempoTotal: number;
  onProgress?: (info: { current: number; total: number; label: string }) => void;
}

export interface GerarSimuladoResult {
  success: boolean;
  simuladoId?: string;
  questoesIncluidas?: number;
  questoesPuladas?: number;
  error?: string;
}

/**
 * Um erro "tem dados completos" quando dá para reconstruir a questão inteira:
 * - múltipla escolha: precisa ter `alternativas` (>= 2) e pelo menos uma marcada como correta
 * - certo/errado: precisa ter `gabarito_ce` (boolean)
 */
export function erroTemDadosCompletos(e: ErrorRecord): boolean {
  if (!e.tipo_questao) return false;
  if (e.tipo_questao === 'multipla_escolha') {
    if (!Array.isArray(e.alternativas) || e.alternativas.length < 2) return false;
    return e.alternativas.some((a) => !!a.correta);
  }
  if (e.tipo_questao === 'certo_errado') {
    return typeof e.gabarito_ce === 'boolean';
  }
  return false;
}

export async function gerarSimuladoDosErros(
  params: GerarSimuladoParams,
): Promise<GerarSimuladoResult> {
  const {
    userId, disciplineId, errosIds, titulo, nivel, area, banca, ano, tempoTotal, onProgress,
  } = params;

  if (!userId) return { success: false, error: 'Usuário não autenticado.' };
  if (!errosIds.length) return { success: false, error: 'Nenhum erro selecionado.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, error: 'Você está offline. Precisa de conexão para gerar o simulado.' };
  }

  try {
    const db = await getDb();

    onProgress?.({ current: 0, total: errosIds.length, label: 'Lendo erros do caderno...' });

    // Busca os erros pelos IDs informados
    const docs = await db.errors.find({ selector: { id: { $in: errosIds } } }).exec();
    const erros = docs.map((d: any) => d.toJSON() as ErrorRecord);

    // Só os que têm dados completos e pertencem à disciplina
    const completos: ErrorRecord[] = [];
    let pulados = 0;
    for (const e of erros) {
      const pertence = String(e.discipline_id || '') === String(disciplineId);
      if (!pertence) { pulados++; continue; }
      if (erroTemDadosCompletos(e)) completos.push(e);
      else pulados++;
    }

    if (completos.length === 0) {
      return {
        success: false,
        error: 'Nenhum erro selecionado tem dados completos para gerar o simulado.',
      };
    }

    // Monta as questões no formato aceito pela RPC importar_simulado
    const questoes: any[] = [];
    for (let i = 0; i < completos.length; i++) {
      const e = completos[i];
      onProgress?.({
        current: i + 1,
        total: completos.length,
        label: `Preparando questão ${i + 1} de ${completos.length}...`,
      });

      const tipo = e.tipo_questao!;
      const item: any = {
        numero: i + 1,
        tipo,
        enunciado: e.question,
        area: e.topic || area || null,
        comentario_geral: e.comentario_geral ?? null,
        imagem_url: e.imagem_url ?? null,
        sublinhados_enunciado: e.sublinhados_enunciado ?? null,
        sublinhados_comentario: e.sublinhados_comentario ?? null,
        negritos_enunciado: e.negritos_enunciado ?? null,
        negritos_comentario: e.negritos_comentario ?? null,
        italicos_enunciado: e.italicos_enunciado ?? null,
        italicos_comentario: e.italicos_comentario ?? null,
      };

      if (tipo === 'multipla_escolha') {
        item.alternativas = (e.alternativas || []).map((a: any) => ({
          letra: a.letra,
          texto: a.texto,
          correta: !!a.correta,
          comentario: a.comentario ?? null,
          sublinhados: a.sublinhados ?? null,
          negritos: a.negritos ?? null,
          italicos: a.italicos ?? null,
        }));
      } else {
        item.correta = e.gabarito_ce === true;
      }

      questoes.push(item);
    }

    onProgress?.({ current: completos.length, total: completos.length, label: 'Criando simulado...' });

    const supabaseClient = await getSupabaseWithToken();
    const novoSimuladoId = crypto.randomUUID();

    const { data, error } = await supabaseClient.rpc('importar_simulado', {
      p_id: novoSimuladoId,
      p_titulo: titulo,
      p_descricao: `Gerado do caderno de erros (${completos.length} questão(ões))`,
      p_area: area,
      p_nivel: nivel,
      p_banca: banca || null,
      p_ano: ano,
      p_tempo_total: tempoTotal,
      p_created_by: userId,
      p_questoes: questoes,
    });

    if (error) throw error;
    if (!data || data.success !== true) {
      return { success: false, error: data?.error || 'Erro desconhecido na RPC.' };
    }

    onProgress?.({ current: completos.length, total: completos.length, label: 'Sincronizando...' });

    // Fire-and-forget: o simulado já existe no servidor. Na tela do simulado,
    // o getSimuladoCompleto busca do Supabase se ainda não tiver no RxDB.
    syncWithSupabase(userId).catch(() => {});

    onProgress?.({ current: completos.length, total: completos.length, label: 'Concluído!' });

    return {
      success: true,
      simuladoId: novoSimuladoId,
      questoesIncluidas: completos.length,
      questoesPuladas: pulados,
    };
  } catch (e: any) {
    console.error('❌ [gerarSimuladoErros] Erro:', e);
    return { success: false, error: e?.message || 'Erro ao gerar simulado.' };
  }
}