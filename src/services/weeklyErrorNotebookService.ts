import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import { criarCadernoComIdFixo } from '@/services/cadernoService';
import { getLastClosedWeek, formatDDMM } from '@/utils/dateHelpers';
import { generateWeeklyErrorNotebookId, generateCadernoQuestaoLinkId } from '@/utils/helpers';

// ============================================================
// 🔒 CONCORRÊNCIA: proteção contra chamadas simultâneas no mesmo dispositivo
// ============================================================

// Mapa de promessas em andamento por chave userId+weekStart
const inProgress = new Map<string, Promise<{ created: boolean; count: number; reason?: string }>>();

/**
 * Gera o caderno semanal de erros se necessário.
 *
 * @param userId ID do usuário (Clerk sub)
 * @param now Data/hora atual (padrão: new Date()) - permite testes com tempo fixo
 * @returns { created: boolean; count: number; reason?: string }
 *  - created: true se caderno foi criado agora
 *  - count: número de questões de erro incluídas
 *  - reason: 'exists' | 'no-errors' | undefined (se created=true)
 */
export async function generateWeeklyErrorNotebookIfNeeded(
  userId: string,
  now: Date = new Date()
): Promise<{ created: boolean; count: number; reason?: string }> {
  // 1. Calcular a semana fechada mais recente
  const { weekStart, weekEnd } = getLastClosedWeek(now);
  const weekStartStr = weekStart.toISOString().split('T')[0]; // 'YYYY-MM-DD'

  // 2. Chave de concorrência: userId + weekStart
  const concurrencyKey = `${userId}:${weekStartStr}`;

  // 3. Se já há uma geração em andamento para esta chave, aguarda ela
  const existingPromise = inProgress.get(concurrencyKey);
  if (existingPromise) {
    return existingPromise;
  }

  // 4. Criar promessa e registrar no mapa
  const promise = (async () => {
    try {
      // a) Gerar ID determinístico do caderno
      const cadernoId = await generateWeeklyErrorNotebookId(userId, weekStartStr);

      // b) Verificar se já existe no banco local (INCLUINDO isdeleted=true)
      const db = await getDb();
      const existing = await db.cadernos.findOne({ selector: { id: cadernoId } }).exec();
      if (existing) {
        return { created: false, count: 0, reason: 'exists' };
      }

      // c) Buscar erros em banco_tentativas na semana (segunda a sexta)
      // created_at entre weekStart e weekEnd (comparar instantes, converter limites locais para ISO UTC)
      const weekStartIso = weekStart.toISOString();
      const weekEndIso = weekEnd.toISOString();

      const tentativas = await db.banco_tentativas.find({
        selector: {
          user_id: userId,
          isdeleted: false,
          acertou: false,
          created_at: { $gte: weekStartIso, $lte: weekEndIso }
        }
      }).exec();

      // Deduplicar por questao_banco_id (manter a primeira ocorrência = primeira vez que errou)
      const questaoIdsUnicos: string[] = [];
      const visto = new Set<string>();
      for (const t of tentativas) {
        const qid = t.get('questao_banco_id');
        if (qid && !visto.has(qid)) {
          visto.add(qid);
          questaoIdsUnicos.push(qid);
        }
      }

      // Filtrar apenas questões que existem em banco_questoes (isdeleted=false)
      if (questaoIdsUnicos.length > 0) {
        const questoesValidas = await db.banco_questoes.find({
          selector: { id: { $in: questaoIdsUnicos }, isdeleted: false }
        }).exec();
        const validosSet = new Set(questoesValidas.map(q => q.get('id')));
        const filtrados = questaoIdsUnicos.filter(id => validosSet.has(id));
        questaoIdsUnicos.length = 0;
        questaoIdsUnicos.push(...filtrados);
      }

      // d) Se não há erros válidos, não cria caderno
      if (questaoIdsUnicos.length === 0) {
        return { created: false, count: 0, reason: 'no-errors' };
      }

      // e) Nome do caderno: "Caderno de Erros: DD/MM a DD/MM" (segunda a sexta)
      const nome = `Caderno de Erros: ${formatDDMM(weekStart)} a ${formatDDMM(weekEnd)}`;

      // g) Criar caderno com ID fixo (IDs dos vínculos derivados de cadernoId:questaoId)
      const resultado = await criarCadernoComIdFixo(
        userId, 
        cadernoId, 
        nome, 
        questaoIdsUnicos, 
        (cId, qId) => `${cId}:${qId}`
      );

      if (!resultado.success) {
        // Se falhou por erro inesperado, propagar
        if (!resultado.alreadyExists) {
          throw new Error(resultado.error || 'Erro ao criar caderno semanal');
        }
        // Se alreadyExists, significa que outro processo criou - tratar como sucesso
        return { created: false, count: questaoIdsUnicos.length, reason: 'exists' };
      }

      return { created: true, count: questaoIdsUnicos.length };
    } finally {
      // Limpar do mapa de concorrência
      inProgress.delete(concurrencyKey);
    }
  })();

  inProgress.set(concurrencyKey, promise);
  return promise;
}

/**
 * Limpa o cache de concorrência (útil para testes).
 */
export function clearConcurrencyCache(): void {
  inProgress.clear();
}