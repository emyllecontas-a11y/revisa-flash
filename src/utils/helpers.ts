// src/utils/helpers.ts

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