// src/services/rankingService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import type { UserIndicators, Medal } from '@/components/ranking/types';

export interface RankingUser {
  id: string;
  name: string;
  avatar_url: string | null;
  pontos: number;
  variacao: number;
  horasEstudadas: number;
  questoesResolvidas: number;
  simuladosRealizados: number;
  coroa?: string | null;
}

// Helper de Data
function getPeriodos() {
  const agora = new Date();
  
  const hojeInicio = new Date(agora);
  hojeInicio.setHours(0, 0, 0, 0);

  const semanaInicio = new Date(agora);
  const dia = agora.getDay() || 7; // Segunda = 1, Domingo = 7
  semanaInicio.setDate(agora.getDate() - dia + 1);
  semanaInicio.setHours(0, 0, 0, 0);

  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);

  return {
    hojeIso: hojeInicio.toISOString(),
    semanaIso: semanaInicio.toISOString(),
    mesIso: mesInicio.toISOString(),
    semanaDias: 7,
  };
}

export async function calcularRanking(userIdLogado: string, periodo: 'semanal' | 'mensal'): Promise<RankingUser[]> {
  const db = await getDb();
  const { semanaIso, mesIso } = getPeriodos();
  const isoInicio = periodo === 'semanal' ? semanaIso : mesIso;

  // 1. Pega usuários locais (quem tem atividade no app)
  const todosRecords = await db.study_records.find().exec();
  const userIds = new Set<string>();
  todosRecords.forEach(r => { if (r.get('user_id')) userIds.add(r.get('user_id')); });

  const rankingMap = new Map<string, RankingUser>();

  // Inicializa com quem já interagiu
  userIds.forEach(uid => {
    rankingMap.set(uid, {
      id: uid, name: `Estudante`, avatar_url: null, pontos: 0, variacao: 0,
      horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0, coroa: null
    });
  });

  // Garante que o logado apareça
  if (userIdLogado && !rankingMap.has(userIdLogado)) {
    rankingMap.set(userIdLogado, {
      id: userIdLogado, name: "Você", avatar_url: null, pontos: 0, variacao: 0,
      horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0, coroa: null
    });
  }

  // 2. Soma Sessões
  const sessoes = await db.study_records.find({ selector: { date: { $gte: isoInicio } } }).exec();
  sessoes.forEach(s => {
    const uid = s.get('user_id');
    if (rankingMap.has(uid)) {
      const u = rankingMap.get(uid)!;
      const minutos = s.get('duration') || 0;
      u.horasEstudadas += minutos / 60;
      u.pontos += minutos * 1;
    }
  });

  // 3. Soma Questões (Banco de Questões e Listas)
  const tentativas = await db.banco_tentativas.find({ selector: { created_at: { $gte: isoInicio } } }).exec();
  tentativas.forEach(t => {
    const uid = t.get('user_id');
    if (rankingMap.has(uid)) {
      const u = rankingMap.get(uid)!;
      u.questoesResolvidas += 1;
      u.pontos += 2;
    }
  });

  // 4. Soma Simulados
  const simulados = await db.resultados_simulado.find({ selector: { created_at: { $gte: isoInicio } } }).exec();
  simulados.forEach(s => {
    const uid = s.get('user_id');
    if (rankingMap.has(uid)) {
      const u = rankingMap.get(uid)!;
      u.simuladosRealizados += 1;
      u.pontos += 20;
    }
  });

  // 5. Busca Nomes Reais no Supabase
  try {
    const supabase = await getSupabaseWithToken();
    const ids = Array.from(rankingMap.keys());
    
    // Tenta buscar na user_settings (que geralmente guarda o nome de exibição)
    // ATENÇÃO: Se o nome estiver em outra tabela, mude o nome aqui.
    const { data: profiles } = await supabase
      .from('user_settings') 
      .select('user_id, name')
      .in('user_id', ids);

    profiles?.forEach((p: any) => {
      if (rankingMap.has(p.user_id)) {
        const u = rankingMap.get(p.user_id)!;
        if (p.name) u.name = p.name;
      }
    });
  } catch (e) {
    console.warn("Não foi possível carregar os nomes do Supabase.");
  }

  const listaFinal = Array.from(rankingMap.values())
    .filter(u => u.pontos > 0 || u.id === userIdLogado)
    .sort((a, b) => b.pontos - a.pontos);

  if (listaFinal.length > 0) listaFinal[0].coroa = 'ouro';
  if (listaFinal.length > 1) listaFinal[1].coroa = 'prata';
  if (listaFinal.length > 2) listaFinal[2].coroa = 'bronze';

  return listaFinal;
}

// ==========================================
// INDICADORES REAIS (HOJE, SEMANA, MÊS)
// ==========================================
export async function getIndicadoresReais(userId: string): Promise<UserIndicators> {
  const db = await getDb();
  const { hojeIso, semanaIso, mesIso } = getPeriodos();

  const records = await db.study_records.find({ selector: { user_id: userId } }).exec();
  const questoes = await db.banco_tentativas.find({ selector: { user_id: userId } }).exec();
  const simulados = await db.resultados_simulado.find({ selector: { user_id: userId } }).exec();

  let tempoDia = 0, tempoSemana = 0, tempoMes = 0;
  records.forEach(r => {
    const data = r.get('date');
    const dur = r.get('duration') || 0;
    if (data >= hojeIso) tempoDia += dur;
    if (data >= semanaIso) tempoSemana += dur;
    if (data >= mesIso) tempoMes += dur;
  });

  let qDia = 0, qSemana = 0, qMes = 0;
  questoes.forEach(q => {
    const data = q.get('created_at');
    if (data >= hojeIso) qDia++;
    if (data >= semanaIso) qSemana++;
    if (data >= mesIso) qMes++;
  });

  let sSemana = 0, sMes = 0;
  simulados.forEach(s => {
    const data = s.get('created_at');
    if (data >= semanaIso) sSemana++;
    if (data >= mesIso) sMes++;
  });

  return {
    tempo: { dia: tempoDia, semana: tempoSemana, mes: tempoMes },
    questoes: { dia: qDia, semana: qSemana, mes: qMes },
    simulados: { semana: sSemana, mes: sMes }
  };
}

// ==========================================
// LÓGICA DE MEDALHAS
// ==========================================
export async function getMedalhas(userId: string): Promise<{ semanais: Medal[], mensais: Medal[] }> {
  const db = await getDb();
  const { semanaIso, mesIso } = getPeriodos();

  // Busca dados brutos para as medalhas
  const recordsSemana = await db.study_records.find({ selector: { user_id: userId, date: { $gte: semanaIso } } }).exec();
  const recordsMes = await db.study_records.find({ selector: { user_id: userId, date: { $gte: mesIso } } }).exec();
  const questoesSemana = await db.banco_tentativas.find({ selector: { user_id: userId, created_at: { $gte: semanaIso } } }).exec();
  const simuladosSemana = await db.resultados_simulado.find({ selector: { user_id: userId, created_at: { $gte: semanaIso } } }).exec();

  // Cálculos Semanais
  const diasEstudadosSemana = new Set(recordsSemana.map(r => r.get('date').split('T')[0])).size;
  const minEstudadosSemana = recordsSemana.reduce((acc, r) => acc + (r.get('duration') || 0), 0);
  
  // Cálculos Mensais
  const minEstudadosMes = recordsMes.reduce((acc, r) => acc + (r.get('duration') || 0), 0);

  const semanais: Medal[] = [
    {
      id: "s1", categoria: "semanal", titulo: "Chama acesa", descricao: "Estudou 5 dias ou mais na semana",
      tier: "rubi", icon: "flame", conquistada: diasEstudadosSemana >= 5,
      progresso: Math.min(diasEstudadosSemana / 5, 1), ganhadores: []
    },
    {
      id: "s2", categoria: "semanal", titulo: "Relógio firme", descricao: "Estudou por pelo menos 2 horas na semana",
      tier: "ouro", icon: "clock", conquistada: minEstudadosSemana >= 120,
      progresso: Math.min(minEstudadosSemana / 120, 1), ganhadores: []
    },
    {
      id: "s3", categoria: "semanal", titulo: "Mira certeira", descricao: "Resolveu 20 questões na semana",
      tier: "safira", icon: "target", conquistada: questoesSemana.length >= 20,
      progresso: Math.min(questoesSemana.length / 20, 1), ganhadores: []
    },
    {
      id: "s4", categoria: "semanal", titulo: "Simulado da semana", descricao: "Concluiu pelo menos 1 simulado",
      tier: "prata", icon: "book", conquistada: simuladosSemana.length >= 1,
      progresso: Math.min(simuladosSemana.length / 1, 1), ganhadores: []
    }
  ];

  const mensais: Medal[] = [
    {
      id: "m1", categoria: "mensal", titulo: "Constância de diamante", descricao: "Estudou 15 dias ou mais no mês",
      tier: "diamante", icon: "calendar", conquistada: new Set(recordsMes.map(r => r.get('date').split('T')[0])).size >= 15,
      progresso: Math.min(new Set(recordsMes.map(r => r.get('date').split('T')[0])).size / 15, 1), ganhadores: []
    },
    {
      id: "m2", categoria: "mensal", titulo: "Maratonista", descricao: "Acumulou 20 horas no mês",
      tier: "ouro", icon: "trophy", conquistada: minEstudadosMes >= 1200,
      progresso: Math.min(minEstudadosMes / 1200, 1), ganhadores: []
    }
  ];

  return { semanais, mensais };
}