// scripts/migrate-theme-ids.ts
// Script de migração: popula topic_ids nas study_theme_timelines legadas
// baseando-se no match case-insensitive entre timeline.themes e topics.name
//
// Uso:
//   npx tsx scripts/migrate-theme-ids.ts           # executa a migração
//   npx tsx scripts/migrate-theme-ids.ts --dry-run # preview apenas (não salva)

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://driayoaxyrpfdaqugvmx.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaWF5b2F4eXJwZmRhcXVndm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzE3MjIsImV4cCI6MjA5NzQwNzcyMn0.iAZZ2J7sXthYj8UQYEAwuJGbbLt2cudDpp0D2HaxHPI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TimelineRow {
  id: string;
  user_id: string;
  period_type: 'month' | 'week';
  period_start: string;
  themes: string[];
  topic_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

interface TopicRow {
  id: string;
  discipline_id: string;
  name: string;
  user_id: string;
}

interface DisciplineRow {
  id: string;
  user_id: string;
  name: string;
}

const DRY_RUN = process.argv.includes('--dry-run');
const USER_ID = process.argv.find(arg => arg.startsWith('--user-id='))?.split('=')[1];

function normalize(str: string): string {
  return str.trim().toLowerCase();
}

async function getUserId(): Promise<string> {
  if (USER_ID) return USER_ID;
  
  // Tentar obter do localStorage via variável de ambiente (se definido)
  const envUserId = process.env.REVISA_USER_ID;
  if (envUserId) return envUserId;
  
  throw new Error('User ID não fornecido. Use --user-id=<uuid> ou defina REVISA_USER_ID no .env');
}

async function fetchTimelines(userId: string): Promise<TimelineRow[]> {
  const { data, error } = await supabase
    .from('study_theme_timelines')
    .select('*')
    .eq('user_id', userId)
    .is('isDeleted', false)
    .order('period_start', { ascending: true });

  if (error) throw new Error(`Erro ao buscar timelines: ${error.message}`);
  return data || [];
}

async function fetchTopics(userId: string): Promise<TopicRow[]> {
  // Primeiro buscar disciplinas do usuário
  const { data: disciplines, error: discError } = await supabase
    .from('disciplines')
    .select('id')
    .eq('user_id', userId);

  if (discError) throw new Error(`Erro ao buscar disciplinas: ${discError.message}`);
  
  const disciplineIds = (disciplines || []).map(d => d.id);
  if (disciplineIds.length === 0) return [];

  // Buscar tópicos dessas disciplinas
  const { data, error } = await supabase
    .from('topics')
    .select('id, discipline_id, name')
    .in('discipline_id', disciplineIds);

  if (error) throw new Error(`Erro ao buscar tópicos: ${error.message}`);
  return data || [];
}

function findMatchingTopicIds(themes: string[], topics: TopicRow[]): string[] {
  const matchedIds: string[] = [];
  
  for (const theme of themes) {
    const normTheme = normalize(theme);
    
    // Procurar match exato (case-insensitive)
    const exactMatch = topics.find(t => normalize(t.name) === normTheme);
    
    if (exactMatch) {
      matchedIds.push(exactMatch.id);
      continue;
    }
    
    // Procurar match parcial (tema contido no nome do tópico ou vice-versa)
    const partialMatch = topics.find(t => {
      const normTopic = normalize(t.name);
      return normTopic.includes(normTheme) || normTheme.includes(normTopic);
    });
    
    if (partialMatch) {
      matchedIds.push(partialMatch.id);
    }
  }
  
  // Deduplicar
  return [...new Set(matchedIds)];
}

async function main() {
  console.log('🔄 Iniciando migração de topic_ids para study_theme_timelines...');
  console.log(`📋 Modo: ${DRY_RUN ? 'DRY-RUN (preview apenas)' : 'EXECUÇÃO REAL'}`);
  
  try {
    const userId = await getUserId();
    console.log(`👤 Usuário: ${userId}`);
    
    // Buscar dados
    const timelines = await fetchTimelines(userId);
    const topics = await fetchTopics(userId);
    
    console.log(`📊 Timelines encontradas: ${timelines.length}`);
    console.log(`📚 Tópicos encontrados: ${topics.length}`);
    
    // Filtrar timelines que precisam de migração (topic_ids vazio/null mas themes tem dados)
    const needsMigration = timelines.filter(t => 
      (!t.topic_ids || t.topic_ids.length === 0) && 
      t.themes && t.themes.length > 0
    );
    
    console.log(`⚡ Timelines que precisam de migração: ${needsMigration.length}`);
    
    if (needsMigration.length === 0) {
      console.log('✅ Nenhuma timeline precisa de migração.');
      return;
    }
    
    // Processar cada timeline
    const updates: Array<{ id: string; topic_ids: string[] }> = [];
    
    for (const timeline of needsMigration) {
      const matchedIds = findMatchingTopicIds(timeline.themes, topics);
      
      if (matchedIds.length > 0) {
        updates.push({
          id: timeline.id,
          topic_ids: matchedIds,
        });
        
        console.log(`  📝 ${timeline.period_type} ${timeline.period_start}: ${timeline.themes.join(', ')}`);
        console.log(`     → Matched ${matchedIds.length} topic(s): ${matchedIds.join(', ')}`);
      } else {
        console.log(`  ⚠️  ${timeline.period_type} ${timeline.period_start}: ${timeline.themes.join(', ')}`);
        console.log(`     → Nenhum match encontrado`);
      }
    }
    
    console.log(`\n📋 Resumo: ${updates.length} timeline(s) serão atualizada(s)`);
    
    if (DRY_RUN) {
      console.log('\n🔍 DRY-RUN: Nenhuma alteração foi salva.');
      console.log('   Para executar a migração, rode sem --dry-run');
      return;
    }
    
    // Confirmar antes de salvar
    console.log('\n⚠️  Esta operação atualizará as timelines no banco de dados.');
    console.log('   Pressione Ctrl+C para cancelar, ou Enter para confirmar...');
    
    // Em ambiente não-interativo, prosseguir automaticamente
    if (process.stdin.isTTY) {
      await new Promise<void>(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }
    
    // Aplicar atualizações em lote
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      const { error } = await supabase
        .from('study_theme_timelines')
        .update({ topic_ids: update.topic_ids, updated_at: new Date().toISOString() })
        .eq('id', update.id);
      
      if (error) {
        console.error(`❌ Erro ao atualizar ${update.id}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
      }
    }
    
    console.log(`\n✅ Migração concluída!`);
    console.log(`   Sucessos: ${successCount}`);
    console.log(`   Erros: ${errorCount}`);
    
  } catch (err) {
    console.error('❌ Erro fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();