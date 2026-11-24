// src/utils/helpers.ts

// ============================================================
// 📦 FORMATAÇÃO DE TAMANHO
// ============================================================

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace('.', ',')} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

// ============================================================
// 🔑 GERADOR DE UUID V4 (com fallback)
// ============================================================

/**
 * Gera um UUID v4 válido.
 * Usa crypto.randomUUID() se disponível, caso contrário, gera manualmente.
 */
export const uid = (): string => {
  // Tenta usar a API nativa (moderna)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback manual para UUID v4 (segundo RFC 4122)
  // Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // Onde x é qualquer dígito hex e y é 8, 9, A ou B
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // Versão 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) + 8]; // 8, 9, a ou b
    } else {
      uuid += hex[Math.floor(Math.random() * 16)];
    }
  }
  return uuid;
};

// ============================================================
// 🔐 UUID DETERMINÍSTICO (v5-like usando SHA-1)
// ============================================================

/**
 * Gera um UUID determinístico (v5-like) a partir de um namespace e nome.
 * Usa crypto.subtle.digest('SHA-1') para criar um hash consistente.
 * O resultado é formatado como UUID v5 (versão 5, variant RFC4122).
 *
 * @param namespace UUID do namespace (ex: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' para DNS)
 * @param name String que identifica o recurso de forma única (ex: 'weekly-errors:user123:2024-11-25')
 * @returns UUID v5-like determinístico
 */
export async function deterministicUuid(namespace: string, name: string): Promise<string> {
  // Converter namespace UUID para bytes
  const namespaceBytes = uuidToBytes(namespace);
  // Converter name para bytes (UTF-8)
  const nameBytes = new TextEncoder().encode(name);

  // Concatenar namespace + name
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes);
  combined.set(nameBytes, namespaceBytes.length);

  // Calcular SHA-1
  const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
  const hashBytes = new Uint8Array(hashBuffer);

  // Pegar primeiros 16 bytes (128 bits) e formatar como UUID v5
  const uuidBytes = hashBytes.slice(0, 16);

  // Definir versão (5) no byte 6 (bits 4-7)
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  // Definir variant (RFC4122) no byte 8 (bits 6-7)
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;

  // Converter para string UUID
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) {
      uuid += '-';
    }
    uuid += hex[uuidBytes[i] >> 4];
    uuid += hex[uuidBytes[i] & 0x0f];
  }
  return uuid;
}

/**
 * Converte UUID string para array de 16 bytes.
 */
function uuidToBytes(uuid: string): Uint8Array {
  const clean = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Gera ID determinístico para o caderno semanal de erros.
 * Namespace fixo para "weekly-errors" + userId + weekStart.
 *
 * @param userId ID do usuário (Clerk sub)
 * @param weekStartStr Data da segunda-feira em 'YYYY-MM-DD' (fuso local)
 * @returns UUID v5-like determinístico
 */
export async function generateWeeklyErrorNotebookId(userId: string, weekStartStr: string): Promise<string> {
  // Namespace UUID v5 fixo para "weekly-errors" (gerado uma vez, fixo)
  // Este UUID foi gerado aleatoriamente para servir como namespace fixo
  const NAMESPACE_WEEKLY_ERRORS = '6ba7b810-9dad-5ea1-80b4-00c04fd430c8'; // versão 5, variante RFC4122
  const name = `weekly-errors:${userId}:${weekStartStr}`;
  return deterministicUuid(NAMESPACE_WEEKLY_ERRORS, name);
}

/**
 * Gera ID determinístico para o vínculo caderno_questoes.
 * Derivado de `${cadernoId}:${questaoId}`.
 *
 * @param cadernoId ID do caderno
 * @param questaoId ID da questão
 * @returns UUID v5-like determinístico
 */
export async function generateCadernoQuestaoLinkId(cadernoId: string, questaoId: string): Promise<string> {
  // Namespace fixo para vínculos de caderno
  const NAMESPACE_CADERNO_QUESTAO = '6ba7b811-9dad-5ea1-80b4-00c04fd430c8';
  const name = `${cadernoId}:${questaoId}`;
  return deterministicUuid(NAMESPACE_CADERNO_QUESTAO, name);
}

// ============================================================
// 🧹 SANITIZAÇÃO DE DADOS
// ============================================================

export const sanitizeData = (data: any) => {
  if (typeof data === 'string') {
    return data.trim().slice(0, 1000);
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeData(value);
    }
    return sanitized;
  }
  return data;
};

// ============================================================
// ✅ VALIDAÇÃO DE DADOS
// ============================================================

export const validateData = (data: any, schema: Record<string, { required?: boolean; type?: string; maxLength?: number }>) => {
  const errors: string[] = [];
  for (const [key, rules] of Object.entries(schema)) {
    if (rules.required && !data[key]) {
      errors.push(`Campo ${key} é obrigatório`);
    }
    if (rules.type && typeof data[key] !== rules.type) {
      errors.push(`Campo ${key} deve ser do tipo ${rules.type}`);
    }
    if (rules.maxLength && data[key]?.length > rules.maxLength) {
      errors.push(`Campo ${key} excede o limite de ${rules.maxLength} caracteres`);
    }
  }
  return errors;
};

// ============================================================
// 🔄 SINCRONIZAÇÃO COM RETRY
// ============================================================

export const syncWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000) => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
};

// ============================================================
// 🔄 GERENCIAMENTO DE REVISÕES DE TÓPICOS
// ============================================================

/**
 * Gerencia as revisões de um tópico.
 * Agora aceita uma data base (dataBase) para usar como referência para os cálculos de datas futuras.
 */
export const gerenciarRevisao = (
  topicoId: string,
  topicoNome: string,
  disciplinaNome: string,
  novoStatus: string,
  revisoesExistentes: any[],
  dataBase?: Date // 🔥 NOVO: data base para cálculos (se não fornecida, usa hoje)
): any[] => {
  console.log('🔄 Gerenciando revisão:', { topicoId, topicoNome, novoStatus, dataBase });

  const niveis = [
    { nivel: 1, dias: 1, label: '1 dia' },
    { nivel: 2, dias: 7, label: '7 dias' },
    { nivel: 3, dias: 15, label: '15 dias' },
    { nivel: 4, dias: 30, label: '30 dias' },
    { nivel: 5, dias: 60, label: '60 dias' }
  ];

  // Define a data de referência: usa a fornecida ou hoje
  const dataReferencia = dataBase || new Date();
  const now = dataReferencia.toISOString();

  // Se for "dominado", marcar todas como concluídas
  if (novoStatus === 'dominado') {
    return revisoesExistentes.map((r: any) => ({
      ...r,
      reviewLevel: r.reviewLevel || 5,
      nextReviewDate: null,
      completedAt: now,
      lastStudyDate: now
    }));
  }

  // Se for "estudando": cria apenas a revisão de 1 dia (se não existir)
  if (novoStatus === 'estudando') {
    const existeNivel1 = revisoesExistentes.some((r: any) => r.reviewLevel === 1);
    if (!existeNivel1) {
      const nextDate = new Date(dataReferencia);
      nextDate.setDate(nextDate.getDate() + 1);
      const novaRevisao = {
        id: uid(),
        topicoId: topicoId,
        topicoNome: topicoNome,
        disciplina: disciplinaNome,
        reviewLevel: 1,
        nextReviewDate: nextDate.toISOString(),
        createdAt: now,
        lastStudyDate: now,
        completedAt: null
      };
      console.log('✅ Revisão CRIADA para 1 dia (estudando):', topicoNome);
      return [...revisoesExistentes, novaRevisao];
    }
    // Se já existe, não faz nada
    return revisoesExistentes;
  }

  // 🔥 Se for "revisado": criar TODAS as 5 revisões (substituindo as existentes)
  if (novoStatus === 'revisado') {
    const novasRevisoes = niveis.map((nivel) => {
      const nextDate = new Date(dataReferencia);
      nextDate.setDate(nextDate.getDate() + nivel.dias);
      return {
        id: uid(),
        topicoId: topicoId,
        topicoNome: topicoNome,
        disciplina: disciplinaNome,
        reviewLevel: nivel.nivel,
        nextReviewDate: nextDate.toISOString(),
        createdAt: now,
        lastStudyDate: now,
        completedAt: null
      };
    });
    console.log(`✅ ${novasRevisoes.length} revisões criadas para "${topicoNome}" (níveis 1 a 5) a partir de ${dataReferencia.toISOString()}`);
    return novasRevisoes; // 🔥 Substitui todas as existentes
  }

  // Fallback: retorna as existentes
  return revisoesExistentes;
};

export const getProximoNivel = (nivelAtual: number) => {
  const niveis = [
    { nivel: 1, dias: 1, label: '1 dia' },
    { nivel: 2, dias: 7, label: '7 dias' },
    { nivel: 3, dias: 15, label: '15 dias' },
    { nivel: 4, dias: 30, label: '30 dias' },
    { nivel: 5, dias: 60, label: '60 dias' }
  ];
  
  if (nivelAtual >= 5) {
    return { nivel: 5, dias: 60, label: '60 dias (Dominado)' };
  }
  
  const proximoIndex = Math.min(niveis.length - 1, nivelAtual);
  return niveis[proximoIndex];
};

export const salvarDadosCompletos = async (
  novasDisciplinas: any[],
  novasRevisoes: any[],
  novosFlashcards?: any[],
  novosErrors?: any[]
): Promise<boolean> => {
  try {
    console.log('💾 Salvando dados...');
    
    if (novasDisciplinas) {
      localStorage.setItem('eot_disciplines', JSON.stringify(novasDisciplinas));
    }
    if (novasRevisoes) {
      localStorage.setItem('eot_revisoes_conteudo', JSON.stringify(novasRevisoes));
    }
    if (novosFlashcards) {
      localStorage.setItem('eot_flashcards', JSON.stringify(novosFlashcards));
    }
    if (novosErrors) {
      localStorage.setItem('eot_errors', JSON.stringify(novosErrors));
    }
    
    window.dispatchEvent(new Event('dashboard-update'));
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Todos os dados salvos com sucesso!');
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao salvar:', error);
    return false;
  }
};

export const STATUS_ORDER = ["nao_estudado", "estudando", "revisado", "dominado"];

export const STATUS_META: any = {
  nao_estudado: { label: "Não estudado", short: "Não estudado", bg: "#fef3c7", fg: "#d97706", dot: "#f59e0b" },
  estudando: { label: "Estudando", short: "Estudando", bg: "#dbeafe", fg: "#2563eb", dot: "#3b82f6" },
  revisado: { label: "Revisado", short: "Revisado", bg: "#e0e7ff", fg: "#4f46e5", dot: "#6366f1" },
  dominado: { label: "Dominado", short: "Dominado", bg: "#dcfce7", fg: "#16a34a", dot: "#22c55e" }
};