// src/lib/helpers.ts
// Funções utilitárias usadas em toda a aplicação

export const uid = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${random}`;
};

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
export const gerenciarRevisao = (
  topicoId: string,
  topicoNome: string,
  disciplinaNome: string,
  novoStatus: string,
  revisoesExistentes: any[]
): any[] => {
  console.log('🔄 Gerenciando revisão:', { topicoId, topicoNome, novoStatus });
  
  const revisaoExistente = revisoesExistentes.find((r: any) => r.topicoId === topicoId);
  
  const niveis = [
    { nivel: 1, dias: 1, label: '1 dia' },
    { nivel: 2, dias: 7, label: '7 dias' },
    { nivel: 3, dias: 15, label: '15 dias' },
    { nivel: 4, dias: 30, label: '30 dias' },
    { nivel: 5, dias: 60, label: '60 dias' }
  ];
  
  if (novoStatus === 'dominado') {
    if (revisaoExistente) {
      return revisoesExistentes.map((r: any) => {
        if (r.topicoId !== topicoId) return r;
        return {
          ...r,
          reviewLevel: 5,
          nextReviewDate: null,
          completedAt: new Date().toISOString(),
          lastStudyDate: new Date().toISOString()
        };
      });
    }
    return revisoesExistentes;
  }
  
  if (!revisaoExistente && (novoStatus === 'estudando' || novoStatus === 'revisado')) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    
    const novaRevisao = {
      id: uid(),
      topicoId: topicoId,
      topicoNome: topicoNome,
      disciplina: disciplinaNome,
      reviewLevel: 1,
      nextReviewDate: nextDate.toISOString(),
      createdAt: new Date().toISOString(),
      lastStudyDate: new Date().toISOString()
    };
    
    console.log('✅ Revisão CRIADA para 1 dia:', topicoNome);
    return [...revisoesExistentes, novaRevisao];
  }
  
  if (revisaoExistente && (novoStatus === 'estudando' || novoStatus === 'revisado')) {
    const nivelAtual = revisaoExistente.reviewLevel || 1;
    
    if (nivelAtual >= 5) {
      console.log('🏆 Tópico DOMINADO (nível máximo):', topicoNome);
      return revisoesExistentes.map((r: any) => {
        if (r.topicoId !== topicoId) return r;
        return {
          ...r,
          reviewLevel: 5,
          nextReviewDate: null,
          completedAt: new Date().toISOString(),
          lastStudyDate: new Date().toISOString()
        };
      });
    }
    
    const proximoNivelIndex = Math.min(niveis.length - 1, nivelAtual);
    const proximoNivel = niveis[proximoNivelIndex];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + proximoNivel.dias);
    
    console.log(`📊 Avançando para nível ${proximoNivel.nivel} (${proximoNivel.label}):`, topicoNome);
    
    return revisoesExistentes.map((r: any) => {
      if (r.topicoId !== topicoId) return r;
      return {
        ...r,
        reviewLevel: proximoNivel.nivel,
        nextReviewDate: nextDate.toISOString(),
        lastStudyDate: new Date().toISOString()
      };
    });
  }
  
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