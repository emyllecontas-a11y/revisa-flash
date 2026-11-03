// src/services/rankingService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';

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

export async function calcularRanking(userIdLogado: string, periodo: 'semanal' | 'mensal'): Promise<RankingUser[]> {
  const db = await getDb();
  const agora = new Date();
  
  // Define a data de início
  let dataInicio = new Date();
  if (periodo === 'semanal') {
    const dia = agora.getDay() || 7; // Segunda = 1, Domingo = 7
    dataInicio.setDate(agora.getDate() - dia + 1);
    dataInicio.setHours(0, 0, 0, 0);
  } else {
    dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  }
  const isoInicio = dataInicio.toISOString();

  // 1. Pega todos os usuários que já interagiram no app (para não buscar do zero)
  // Como não temos uma tabela de "todos os usuários" local, vamos pegar quem tem study_records
  const todosRecords = await db.study_records.find().exec();
  const userIds = new Set<string>();
  todosRecords.forEach(r => userIds.add(r.get('user_id')));

  const rankingMap = new Map<string, RankingUser>();

  // Inicializa os usuários com dados zerados
  userIds.forEach(uid => {
    if (!uid) return;
    rankingMap.set(uid, {
      id: uid,
      name: `Estudante ${uid.slice(0, 4)}`, // Fallback, tentaremos pegar o nome real depois
      avatar_url: null,
      pontos: 0,
      variacao: 0,
      horasEstudadas: 0,
      questoesResolvidas: 0,
      simuladosRealizados: 0,
      coroa: null
    });
  });

  // Adiciona o usuário logado caso ele não tenha atividades (para ele aparecer no ranking dele)
  if (userIdLogado && !rankingMap.has(userIdLogado)) {
    rankingMap.set(userIdLogado, {
      id: userIdLogado, name: "Você", avatar_url: null, pontos: 0, variacao: 0, horasEstudadas: 0, questoesResolvidas: 0, simuladosRealizados: 0, coroa: null
    });
  }

  // 2. Soma Sessões de Estudo
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

  // 3. Soma Questões
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

  // 5. Tenta pegar o nome real via Supabase (Clerk)
  // Se a sua tabela "user_settings" ou "profiles" tiver o nome, puxamos ele aqui.
  try {
    const supabase = await getSupabaseWithToken();
    const ids = Array.from(rankingMap.keys());
    
    // Supondo que você tenha uma tabela 'profiles' com 'id' e 'name'
    const { data: profiles } = await supabase
      .from('profiles') 
      .select('id, name, avatar_url')
      .in('id', ids);

    profiles?.forEach(p => {
      if (rankingMap.has(p.id)) {
        const u = rankingMap.get(p.id)!;
        u.name = p.name || u.name;
        u.avatar_url = p.avatar_url || null;
      }
    });
  } catch (e) {
    console.warn("Não foi possível carregar os nomes dos perfis", e);
  }

  // 6. Define as coroas (Exemplo básico: Top 3 ganham coroa visual)
  const listaFinal = Array.from(rankingMap.values())
    .filter(u => u.pontos > 0 || u.id === userIdLogado) // Só mostra quem pontuou ou o próprio usuário
    .sort((a, b) => b.pontos - a.pontos);

  // Atribui coroas para os 3 primeiros
  if (listaFinal.length > 0) listaFinal[0].coroa = 'ouro';
  if (listaFinal.length > 1) listaFinal[1].coroa = 'prata';
  if (listaFinal.length > 2) listaFinal[2].coroa = 'bronze';

  return listaFinal;
}