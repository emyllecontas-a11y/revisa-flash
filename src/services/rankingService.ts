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

export interface ResultadoRanking {
  lista: RankingUser[];
  subiuDePosicao: boolean;
  posicaoAtual: number;
}

function getPeriodos() {
  const agora = new Date();
  const hojeInicio = new Date(agora); hojeInicio.setHours(0, 0, 0, 0);
  const semanaInicio = new Date(agora);
  const dia = agora.getDay() || 7;
  semanaInicio.setDate(agora.getDate() - dia + 1); semanaInicio.setHours(0, 0, 0, 0);
  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const dataRefIso = hojeInicio.toISOString().split('T')[0]; // YYYY-MM-DD

  return {
    hojeIso: hojeInicio.toISOString(),
    semanaIso: semanaInicio.toISOString(),
    mesIso: mesInicio.toISOString(),
    dataRefIso,
    refSemana: `${agora.getFullYear()}-W${Math.ceil((agora.getDate() + 6) / 7)}`,
    refMes: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  };
}

export async function calcularRanking(userIdLogado: string, periodo: 'semanal' | 'mensal'): Promise<ResultadoRanking> {
  const db = await getDb();
  const supabase = await getSupabaseWithToken();
  const { semanaIso, mesIso, dataRefIso } = getPeriodos();
  const isoInicio = periodo === 'semanal' ? semanaIso : mesIso;

  const todosRecords = await db.study_records.find().exec();
  const userIds = new Set<string>();
  todosRecords.forEach(r => { if (r.get('user_id')) userIds.add(r.get('user_id')); });
  if (userIdLogado) userIds.add(userIdLogado);

  const rankingMap = new Map<string, RankingUser>();
  userIds.forEach(uid => {
    rankingMap.set(uid, {
      id: uid, name: `Estudante`, avatar_url: null, pontos: 0, variacao: 0,
      horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0, coroa: null
    });
  });

  const sessoes = await db.study_records.find({ selector: { date: { $gte: isoInicio } } }).exec();
  sessoes.forEach(s => {
    const uid = s.get('user_id');
    if (rankingMap.has(uid)) {
      const u = rankingMap.get(uid)!;
      const min = s.get('duration') || 0;
      u.horasEstudadas += min / 60;
      u.pontos += min * 1;
    }
  });

  const tentativas = await db.banco_tentativas.find({ selector: { created_at: { $gte: isoInicio } } }).exec();
  tentativas.forEach(t => {
    const uid = t.get('user_id');
    if (rankingMap.has(uid)) { rankingMap.get(uid)!.questoesResolvidas += 1; rankingMap.get(uid)!.pontos += 2; }
  });

  const simulados = await db.resultados_simulado.find({ selector: { created_at: { $gte: isoInicio } } }).exec();
  simulados.forEach(s => {
    const uid = s.get('user_id');
    if (rankingMap.has(uid)) { rankingMap.get(uid)!.simuladosRealizados += 1; rankingMap.get(uid)!.pontos += 20; }
  });

  const medalhasCountMap = new Map<string, number>();
  try {
    const ids = Array.from(rankingMap.keys());
    const { data: profiles } = await supabase.from('user_settings').select('user_id, name').in('user_id', ids);
    profiles?.forEach((p: any) => {
      if (rankingMap.has(p.user_id)) {
        rankingMap.get(p.user_id)!.name = p.name || "Estudante";
      }
    });

    const { data: medalhas } = await supabase.from('ranking_conquistas').select('user_id').eq('tipo', 'medalha').in('user_id', ids);
    medalhas?.forEach((m: any) => {
      medalhasCountMap.set(m.user_id, (medalhasCountMap.get(m.user_id) || 0) + 1);
    });
  } catch (e) { console.warn("Erro ao buscar perfis/medalhas"); }

  const listaFinal = Array.from(rankingMap.values())
    .filter(u => u.pontos > 0 || u.id === userIdLogado)
    .sort((a, b) => b.pontos - a.pontos);

  listaFinal.forEach(u => {
    const count = medalhasCountMap.get(u.id) || 0;
    if (count >= 7) u.coroa = 'diamante';
    else if (count >= 5) u.coroa = 'ouro';
    else if (count >= 3) u.coroa = 'prata';
    else if (count >= 1) u.coroa = 'bronze';
  });

  let subiuDePosicao = false;
  let posicaoAtual = 0;

  const indexLogado = listaFinal.findIndex(u => u.id === userIdLogado);
  if (indexLogado !== -1) {
    posicaoAtual = indexLogado + 1;
    
    const { data: snapshotAnterior } = await supabase
      .from('ranking_snapshots')
      .select('posicao')
      .eq('user_id', userIdLogado)
      .eq('periodo_tipo', periodo)
      .order('data_referencia', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotAnterior) {
      const diferenca = snapshotAnterior.posicao - posicaoAtual;
      listaFinal[indexLogado].variacao = diferenca;
      if (diferenca > 0) subiuDePosicao = true;
    }

    const { data: snapHoje } = await supabase
      .from('ranking_snapshots')
      .select('id')
      .eq('user_id', userIdLogado)
      .eq('periodo_tipo', periodo)
      .eq('data_referencia', dataRefIso)
      .maybeSingle();

    if (!snapHoje) {
      await supabase.from('ranking_snapshots').insert({
        user_id: userIdLogado, periodo_tipo: periodo, data_referencia: dataRefIso, posicao: posicaoAtual, pontos: listaFinal[indexLogado].pontos
      });
    }
  }

  return { lista: listaFinal, subiuDePosicao, posicaoAtual };
}

export async function getIndicadoresReais(userId: string): Promise<UserIndicators> {
  const db = await getDb();
  const { hojeIso, semanaIso, mesIso } = getPeriodos();
  const records = await db.study_records.find({ selector: { user_id: userId } }).exec();
  const questoes = await db.banco_tentativas.find({ selector: { user_id: userId } }).exec();
  const simulados = await db.resultados_simulado.find({ selector: { user_id: userId } }).exec();

  let tempoDia = 0, tempoSemana = 0, tempoMes = 0;
  records.forEach(r => {
    const data = r.get('date'); const dur = r.get('duration') || 0;
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

export async function getMedalhas(userId: string): Promise<{ semanais: Medal[], mensais: Medal[] }> {
  const db = await getDb();
  const { semanaIso, mesIso, refSemana, refMes } = getPeriodos();
  const supabase = await getSupabaseWithToken();

  const { data: historico } = await supabase.from('ranking_conquistas').select('conquista_id, periodo_referencia').eq('user_id', userId);
  const conquistasPassadas = new Set(historico?.map(h => `${h.conquista_id}-${h.periodo_referencia}`) || []);

  const recordsSemana = await db.study_records.find({ selector: { user_id: userId, date: { $gte: semanaIso } } }).exec();
  const recordsMes = await db.study_records.find({ selector: { user_id: userId, date: { $gte: mesIso } } }).exec();
  const questoesSemana = await db.banco_tentativas.find({ selector: { user_id: userId, created_at: { $gte: semanaIso } } }).exec();
  const simuladosSemana = await db.resultados_simulado.find({ selector: { user_id: userId, created_at: { $gte: semanaIso } } }).exec();

  const diasEstudadosSemana = new Set(recordsSemana.map(r => r.get('date').split('T')[0])).size;
  const minEstudadosSemana = recordsSemana.reduce((acc, r) => acc + (r.get('duration') || 0), 0);
  const minEstudadosMes = recordsMes.reduce((acc, r) => acc + (r.get('duration') || 0), 0);

  const checarMedalha = async (id: string, ref: string, isConquistada: boolean, progresso: number) => {
    const chave = `${id}-${ref}`;
    const jaConquistada = conquistasPassadas.has(chave) || isConquistada;
    if (isConquistada && !conquistasPassadas.has(chave)) {
      await supabase.from('ranking_conquistas').insert({
        user_id: userId, tipo: 'medalha', conquista_id: id, periodo_tipo: ref.includes('W') ? 'semanal' : 'mensal', periodo_referencia: ref
      });
    }
    return { conquistada: jaConquistada, progresso: jaConquistada ? 1 : progresso };
  };

  // --- METAS SEMANAIS ---
  // Meta Relógio firme: 12 horas = 720 minutos
  const s2 = await checarMedalha('relogio_firme', refSemana, minEstudadosSemana >= 720, minEstudadosSemana / 720);
  
  // Meta Mira certeira: 100 questões
  const s3 = await checarMedalha('mira_certeira', refSemana, questoesSemana.length >= 100, questoesSemana.length / 100);

  // --- METAS MENSAIS ---
  // Meta Maratonista: 48 horas = 2880 minutos
  const m2 = await checarMedalha('maratonista', refMes, minEstudadosMes >= 2880, minEstudadosMes / 2880);

  // Checagens que não mudaram (Chama acesa, Simulado e Diamante)
  const s1 = await checarMedalha('chama_acesa', refSemana, diasEstudadosSemana >= 5, diasEstudadosSemana / 5);
  const s4 = await checarMedalha('simulado_semana', refSemana, simuladosSemana.length >= 1, simuladosSemana.length / 1);
  const m1 = await checarMedalha('constancia_diamante', refMes, new Set(recordsMes.map(r => r.get('date').split('T')[0])).size >= 15, new Set(recordsMes.map(r => r.get('date').split('T')[0])).size / 15);

  const semanais: Medal[] = [
    { id: "s1", categoria: "semanal", titulo: "Chama acesa", descricao: "Estudou 5 dias ou mais na semana", tier: "rubi", icon: "flame", ...s1, ganhadores: [] },
    { id: "s2", categoria: "semanal", titulo: "Relógio firme", descricao: "Estudou por pelo menos 12 horas na semana", tier: "ouro", icon: "clock", ...s2, ganhadores: [] },
    { id: "s3", categoria: "semanal", titulo: "Mira certeira", descricao: "Resolveu 100 questões na semana", tier: "safira", icon: "target", ...s3, ganhadores: [] },
    { id: "s4", categoria: "semanal", titulo: "Simulado da semana", descricao: "Concluiu pelo menos 1 simulado", tier: "prata", icon: "book", ...s4, ganhadores: [] }
  ];

  const mensais: Medal[] = [
    { id: "m1", categoria: "mensal", titulo: "Constância de diamante", descricao: "Estudou 15 dias ou mais no mês", tier: "diamante", icon: "calendar", ...m1, ganhadores: [] },
    { id: "m2", categoria: "mensal", titulo: "Maratonista", descricao: "Acumulou 48 horas no mês", tier: "ouro", icon: "trophy", ...m2, ganhadores: [] }
  ];

  return { semanais, mensais };
}