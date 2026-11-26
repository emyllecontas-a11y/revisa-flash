// src/services/conteudoSugestaoService.ts
// Serviço para sugerir criação de disciplinas e tópicos no import de cronograma

import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';
import { uid } from '@/utils/helpers';
import { STATUS_TOPICO } from '@/constants';
import type { TaxonomiaDisciplina } from './taxonomiaService';

// ============================================================
// TIPOS
// ============================================================

export interface EntradaConteudo {
  disciplina: string;
  topico?: string;
}

export interface ConteudoNovo {
  disciplinasNovas: string[]; // nomes das disciplinas (primeira ocorrência, sem repetição por nome normalizado)
  topicosNovos: Array<{ disciplina: string; nome: string }>; // tópicos novos, sem repetição
  mapaExistentes: Map<string, string>; // chave -> id (disciplina: normDisc; tópico: `${normDisc}::${normTopico}`)
}

export interface DisciplinaExistente {
  id: string;
  name: string;
  normName: string;
}

export interface TopicoExistente {
  id: string;
  name: string;
  discipline_id: string;
  normName: string;
  order?: number;
}

export interface SelecaoConteudo {
  disciplinas: string[]; // nomes das disciplinas marcadas
  topicos: Array<{ disciplina: string; nome: string }>; // tópicos marcados
}

export interface MapaIds {
  disciplinas: Map<string, string>; // normName -> id
  topicos: Map<string, string>; // `${normDisc}::${normTopico}` -> id
  /** Quantos itens foram REALMENTE criados nesta chamada (os que já existiam não contam). */
  criadas?: { disciplinas: number; topicos: number };
}

// ============================================================
// NORMALIZAÇÃO DE NOMES
// ============================================================

/**
 * Normaliza um nome para comparação:
 * - minúsculas
 * - remove acentos (NFD + remover diacríticos)
 * - trim
 * - espaços múltiplos viram um
 */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ============================================================
// FUNÇÃO PURA: CALCULAR CONTEÚDO NOVO
// ============================================================

/**
 * Calcula quais disciplinas e tópicos são novos comparando as entradas
 * do arquivo com o que já existe no banco.
 * Casamento por nome normalizado EXATO.
 */
export function calcularConteudoNovo(
  entradas: EntradaConteudo[],
  disciplinasExistentes: DisciplinaExistente[],
  topicosExistentes: TopicoExistente[]
): ConteudoNovo {
  const mapaDisciplinas = new Map<string, DisciplinaExistente>();
  for (const d of disciplinasExistentes) {
    mapaDisciplinas.set(d.normName, d);
  }

  const mapaTopicos = new Map<string, TopicoExistente>();
  for (const t of topicosExistentes) {
    const chave = `${t.discipline_id}::${t.normName}`;
    mapaTopicos.set(chave, t);
  }

  const disciplinasNovas: string[] = [];
  const topicosNovos: Array<{ disciplina: string; nome: string }> = [];
  const mapaExistentes = new Map<string, string>();
  const disciplinasVistas = new Set<string>();
  const topicosVistos = new Set<string>();

  for (const entrada of entradas) {
    const normDisc = normalizarNome(entrada.disciplina);

    // Disciplina
    const disciplinaExistente = mapaDisciplinas.get(normDisc);
    if (!disciplinaExistente) {
      if (!disciplinasVistas.has(normDisc)) {
        disciplinasNovas.push(entrada.disciplina);
        disciplinasVistas.add(normDisc);
      }
    } else {
      mapaExistentes.set(normDisc, disciplinaExistente.id);
    }

    // Tópico (se houver)
    if (entrada.topico) {
      const normTopico = normalizarNome(entrada.topico);
      let discId: string;

      if (disciplinaExistente) {
        discId = disciplinaExistente.id;
      } else {
        // Disciplina é nova - usar o nome normalizado como chave temporária
        // O ID real será atribuído após a criação
        discId = normDisc;
      }

      const chaveTopico = `${discId}::${normTopico}`;
      const topicoExistente = mapaTopicos.get(chaveTopico);

      if (!topicoExistente) {
        const chaveVista = `${normDisc}::${normTopico}`;
        if (!topicosVistos.has(chaveVista)) {
          topicosNovos.push({ disciplina: entrada.disciplina, nome: entrada.topico });
          topicosVistos.add(chaveVista);
        }
      } else {
        mapaExistentes.set(chaveTopico, topicoExistente.id);
      }
    }
  }

  return { disciplinasNovas, topicosNovos, mapaExistentes };
}

// ============================================================
// CARREGAR CONTEÚDO EXISTENTE
// ============================================================

export async function carregarConteudoExistente(userId: string): Promise<{
  disciplinas: DisciplinaExistente[];
  topicos: TopicoExistente[];
}> {
  const db = await getDb();

  const disciplinasResult = await db.disciplines.find({
    selector: { user_id: userId, isDeleted: { $ne: true } }
  }).exec();

  const disciplinas: DisciplinaExistente[] = disciplinasResult.map((doc: any) => {
    const d = doc.toJSON();
    return { id: d.id, name: d.name, normName: normalizarNome(d.name) };
  });

  const topicosResult = await db.topics.find({
    selector: { user_id: userId, isDeleted: { $ne: true } }
  }).exec();

  const topicos: TopicoExistente[] = topicosResult.map((doc: any) => {
    const t = doc.toJSON();
    return { id: t.id, name: t.name, discipline_id: t.discipline_id, normName: normalizarNome(t.name), order: t.order };
  });

  return { disciplinas, topicos };
}

// ============================================================
// MONTAR ENTRADAS DA TAXONOMIA (FUNÇÃO PURA)
// ============================================================

export interface SelecaoTaxonomia {
  areas: string[]; // nomes das áreas marcadas (ex.: "Odontologia", "Português")
  materias: Array<{ area: string; nome: string }>; // matérias marcadas
  topicos: Array<{ area: string; materia: string; nome: string }>; // tópicos marcados
}

/**
 * Converte a seleção da taxonomia (áreas, matérias, tópicos) para o formato
 * EntradaConteudo[] que calcularConteudoNovo/criarConteudoSelecionado esperam.
 * - Matéria sem tópico marcado gera só a disciplina.
 * - Deduplica por nome normalizado: mesma matéria em áreas diferentes vira UMA disciplina,
 *   com a UNIÃO dos tópicos marcados (sem repetir tópico por nome normalizado).
 * - A grafia mantida é a da PRIMEIRA ocorrência na taxonomia (ordem das áreas/matérias/tópicos).
 * - Ordem: disciplinas e tópicos na ordem da primeira aparição na seleção.
 * - Subtópicos são ignorados nesta versão.
 */
export function montarEntradasDaTaxonomia(
  selecao: SelecaoTaxonomia,
  taxonomia: TaxonomiaDisciplina[]
): EntradaConteudo[] {
  // 1. Construir mapas canônicos a partir da taxonomia (fonte da verdade para grafia)
  // normMateria -> { nomeCanonico: string, topicos: Map<normTopico, nomeCanonicoTopico> }
  // A grafia da matéria vem da PRIMEIRA ocorrência; os tópicos são a UNIÃO de todas as ocorrências.
  const mapaMateriasCanonicas = new Map<string, { nomeCanonico: string; topicos: Map<string, string> }>();

  for (const area of taxonomia) {
    for (const materia of area.materias) {
      const normMateria = normalizarNome(materia.nome);
      const entrada = mapaMateriasCanonicas.get(normMateria);
      if (!entrada) {
        // Primeira ocorrência: define grafia canônica e inicia mapa de tópicos
        const topicosMap = new Map<string, string>();
        for (const topico of materia.topicos) {
          const normTopico = normalizarNome(topico.nome);
          if (!topicosMap.has(normTopico)) {
            topicosMap.set(normTopico, topico.nome);
          }
        }
        mapaMateriasCanonicas.set(normMateria, { nomeCanonico: materia.nome, topicos: topicosMap });
      } else {
        // Ocorrências seguintes: mesclar tópicos (união), mantendo grafia canônica original
        for (const topico of materia.topicos) {
          const normTopico = normalizarNome(topico.nome);
          if (!entrada.topicos.has(normTopico)) {
            entrada.topicos.set(normTopico, topico.nome);
          }
        }
      }
    }
  }

  // 2. Agrupar tópicos da seleção por matéria normalizada (independente da área)
  // normMateria -> Set<normTopico> (mantém ordem de primeira aparição na seleção)
  const topicosSelecionadosPorMateria = new Map<string, Array<{ normTopico: string; ordem: number }>>();
  let ordemTopico = 0;
  for (const topicoSel of selecao.topicos) {
    const normMateria = normalizarNome(topicoSel.materia);
    const normTopico = normalizarNome(topicoSel.nome);
    if (!topicosSelecionadosPorMateria.has(normMateria)) {
      topicosSelecionadosPorMateria.set(normMateria, []);
    }
    const arr = topicosSelecionadosPorMateria.get(normMateria)!;
    // Evitar duplicados por normTopico (manter o primeiro)
    if (!arr.some(t => t.normTopico === normTopico)) {
      arr.push({ normTopico, ordem: ordemTopico++ });
    }
  }

  // 3. Processar matérias da seleção em ordem, deduplicando por normMateria
  const entradas: EntradaConteudo[] = [];
  const materiasVistas = new Set<string>();

  for (const { area: _areaNome, nome: materiaNomeSel } of selecao.materias) {
    const normMateria = normalizarNome(materiaNomeSel);
    if (materiasVistas.has(normMateria)) continue;
    materiasVistas.add(normMateria);

    // Obter grafia canônica da taxonomia
    const canonica = mapaMateriasCanonicas.get(normMateria);
    const nomeDisciplina = canonica?.nomeCanonico ?? materiaNomeSel;

    // Obter tópicos selecionados para esta matéria (já deduplicados e ordenados)
    const topicosSel = topicosSelecionadosPorMateria.get(normMateria) ?? [];

    if (topicosSel.length === 0) {
      // Matéria sem tópicos marcados -> só a disciplina
      entradas.push({ disciplina: nomeDisciplina });
    } else {
      // Matéria com tópicos -> disciplina + cada tópico (grafia canônica da taxonomia)
      for (const { normTopico } of topicosSel) {
        const nomeTopicoCanonico = canonica?.topicos.get(normTopico) ?? normTopico;
        entradas.push({ disciplina: nomeDisciplina, topico: nomeTopicoCanonico });
      }
    }
  }

  return entradas;
}

// Tipos da taxonomia (reexportados para o modal)
export type { TaxonomiaDisciplina, TaxonomiaMateria, TaxonomiaTopico } from './taxonomiaService';

// ============================================================
// CRIAR CONTEÚDO SELECIONADO
// ============================================================

/**
 * Cria as disciplinas e tópicos marcados pela usuária.
 * Idempotente: reconsulta o RxDB antes de inserir para evitar duplicatas.
 * Segue o padrão de src/routes/conteudo.tsx (handleCreateDiscipline / handleCreateTopic).
 */
export async function criarConteudoSelecionado(
  userId: string,
  selecao: SelecaoConteudo
): Promise<MapaIds> {
  const db = await getDb();
  const now = new Date().toISOString();

  const mapaIds: MapaIds = {
    disciplinas: new Map(),
    topicos: new Map(),
    criadas: { disciplinas: 0, topicos: 0 },
  };

  // 1. Primeiro, carregar o que já existe no RxDB para idempotência
  const { disciplinas: disciplinasExistentes, topicos: topicosExistentes } = await carregarConteudoExistente(userId);

  for (const d of disciplinasExistentes) {
    mapaIds.disciplinas.set(d.normName, d.id);
  }
  for (const t of topicosExistentes) {
    const chave = `${t.discipline_id}::${t.normName}`;
    mapaIds.topicos.set(chave, t.id);
  }

  // 2. Criar disciplinas novas (na ordem do arquivo)
  for (const nomeDisciplina of selecao.disciplinas) {
    const normDisc = normalizarNome(nomeDisciplina);

    // Verificar se já existe (idempotência)
    if (mapaIds.disciplinas.has(normDisc)) {
      continue;
    }

    const id = uid();
    const novaDisciplina = {
      id,
      name: nomeDisciplina,
      user_id: userId,
      createdAt: now,
      updated_at: now,
      isDeleted: false,
    };

    try {
      await db.disciplines.insert(novaDisciplina);
    } catch (err: any) {
      // Se falhar por duplicata, buscar a existente
      const existing = await db.disciplines.findOne({
        selector: { user_id: userId, name: nomeDisciplina, isDeleted: { $ne: true } }
      }).exec();
      if (existing) {
        const d = existing.toJSON();
        mapaIds.disciplinas.set(normDisc, d.id);
        continue;
      }
      throw err;
    }

    // Tentar sincronizar com Supabase
    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient.from('disciplines').insert(novaDisciplina);
      if (error) throw error;
    } catch (supabaseError) {
      await enqueueOperation('create', 'disciplines', novaDisciplina);
    }

    mapaIds.disciplinas.set(normDisc, id);
    mapaIds.criadas!.disciplinas++;
  }

  // 3. Criar tópicos novos (na ordem do arquivo, sequencial por disciplina)
  // Agrupar tópicos por disciplina
  const topicosPorDisciplina = new Map<string, Array<{ disciplina: string; nome: string }>>();
  for (const tp of selecao.topicos) {
    const normDisc = normalizarNome(tp.disciplina);
    if (!topicosPorDisciplina.has(normDisc)) {
      topicosPorDisciplina.set(normDisc, []);
    }
    topicosPorDisciplina.get(normDisc)!.push(tp);
  }

  for (const [normDisc, topicosDaDisc] of topicosPorDisciplina) {
    const discId = mapaIds.disciplinas.get(normDisc);
    if (!discId) {
      // Disciplina não foi criada (não estava marcada) - pular tópicos
      console.warn(`[conteudoSugestao] Disciplina "${normDisc}" não encontrada no mapa, pulando tópicos`);
      continue;
    }

    // Encontrar o maior order existente desta disciplina no RxDB
    let maxOrder = 0;
    for (const t of topicosExistentes) {
      if (t.discipline_id === discId && (t.order ?? 0) > maxOrder) {
        maxOrder = t.order ?? 0;
      }
    }

    let order = maxOrder + 1;

    for (const tp of topicosDaDisc) {
      const normTopico = normalizarNome(tp.nome);
      const chave = `${discId}::${normTopico}`;

      // Verificar se já existe (idempotência)
      if (mapaIds.topicos.has(chave)) {
        order++;
        continue;
      }

      const id = uid();
      const novoTopico = {
        id,
        discipline_id: discId,
        name: tp.nome,
        status: STATUS_TOPICO.NAO_ESTUDADO,
        planned_date: null,
        createdAt: now,
        updated_at: now,
        user_id: userId,
        isDeleted: false,
        order,
      };

      try {
        await db.topics.insert(novoTopico);
      } catch (err: any) {
        // Se falhar por duplicata, buscar a existente
        const existing = await db.topics.findOne({
          selector: { discipline_id: discId, name: tp.nome, isDeleted: { $ne: true } }
        }).exec();
        if (existing) {
          const t = existing.toJSON();
          mapaIds.topicos.set(chave, t.id);
          order++;
          continue;
        }
        throw err;
      }

      // Tentar sincronizar com Supabase
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient.from('topics').insert(novoTopico);
        if (error) throw error;
      } catch (supabaseError) {
        await enqueueOperation('create', 'topics', novoTopico);
      }

      mapaIds.topicos.set(chave, id);
      mapaIds.criadas!.topicos++;
      order++;
    }
  }

  return mapaIds;
}