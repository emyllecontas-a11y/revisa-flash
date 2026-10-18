// src/lib/sharedSync.ts
//
// Sincroniza o conteúdo que AMIGAS compartilharam com você (somente leitura).
//
// Como funciona:
//  1. Pergunta ao servidor o que você pode ler e que é de OUTRAS pessoas
//     (a segurança do banco já filtra: só vem o que foi compartilhado com você).
//  2. Baixa o que falta ou mudou.
//  3. APAGA DO APARELHO o que sumiu: compartilhamento removido, amizade desfeita,
//     item apagado pela dona, ou simulados antigos que eram públicos.
//
// Travas de segurança:
//  - Nunca apaga nem altera itens SEUS: só mexe em itens cujo dono é outra pessoa.
//  - Só apaga se a lista do servidor chegou completa e sem erro.
//  - Antes de tudo, confere se o servidor reconhece você (token válido).
//  - Nada daqui é enviado ao servidor: apagar do aparelho não afeta a dona.
//  - Seus grifos, respostas e resultados não são tocados.

import { getDb } from './db';
import { getSupabaseWithToken } from './supabaseClient';

type Row = Record<string, any>;

const TAMANHO_PAGINA = 1000;
const IDS_POR_CONSULTA = 80;
const IDS_POR_DOWNLOAD = 40;
const INTERVALO_MIN_MS = 20_000;

let rodando = false;
let ultimaExecucaoOk = 0;

// ============================================================
// AUXILIARES
// ============================================================

function dividir<T>(lista: T[], tamanho: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) partes.push(lista.slice(i, i + tamanho));
  return partes;
}

/** Item apagado pela dona (disciplinas e tópicos têm duas colunas: isDeleted e isdeleted). */
function apagado(r: Row): boolean {
  return r.isDeleted === true || r.isdeleted === true;
}

/** Garante updated_at (a tabela de arquivos pode vir só com created_at). */
function normalizar(r: Row): Row {
  return r.updated_at || !r.created_at ? r : { ...r, updated_at: r.created_at };
}

function maisNovo(remoto: Row, local: Row): boolean {
  const a = Date.parse(remoto.updated_at || remoto.created_at || '');
  const b = Date.parse(local.updated_at || local.created_at || '');
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a > b;
}

/** Lê todas as páginas de uma consulta. Devolve null se qualquer página falhar. */
async function paginar(
  montar: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<Row[] | null> {
  const todas: Row[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) {
      console.warn('⚠️ [Compartilhados] Consulta falhou:', error.message || error);
      return null;
    }
    todas.push(...(data || []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }
  return todas;
}

async function buscarPorIds(
  client: any,
  tabela: string,
  coluna: string,
  ids: string[],
  colunas: string,
  tamanho: number,
): Promise<Row[] | null> {
  const todas: Row[] = [];
  for (const parte of dividir(ids, tamanho)) {
    const linhas = await paginar((de, ate) =>
      client.from(tabela).select(colunas).in(coluna, parte).order('id').range(de, ate),
    );
    if (!linhas) return null;
    todas.push(...linhas);
  }
  return todas;
}

async function indiceLocal(colecao: any): Promise<Map<string, Row>> {
  const docs = await colecao.find().exec();
  const mapa = new Map<string, Row>();
  for (const d of docs) {
    const j = d.toJSON();
    mapa.set(String(j.id), j);
  }
  return mapa;
}

/** Grava o que veio do servidor e apaga do aparelho o que sumiu (só itens de outras pessoas). */
async function aplicar(
  tabela: string,
  colecao: any,
  local: Map<string, Row>,
  gravar: Row[],
  vivos: Set<string>,
  ehDeOutra: (j: Row) => boolean,
): Promise<boolean> {
  let ok = true;
  let novos = 0;
  let atualizados = 0;
  let removidos = 0;

  const inserir = gravar.filter((r) => !local.has(String(r.id)));
  const atualizar = gravar.filter((r) => local.has(String(r.id)));

  if (inserir.length > 0) {
    try {
      const res = await colecao.bulkInsert(inserir);
      const erros = res?.error || [];
      novos = inserir.length - erros.length;
      if (erros.length > 0) {
        console.warn(`⚠️ [Compartilhados] ${tabela}: ${erros.length} item(ns) não gravado(s).`);
        ok = false;
      }
    } catch (e) {
      console.warn(`⚠️ [Compartilhados] ${tabela}: falha ao gravar novos itens:`, e);
      ok = false;
    }
  }

  for (const r of atualizar) {
    try {
      const doc = await colecao.findOne({ selector: { id: r.id } }).exec();
      if (doc) {
        await doc.incrementalPatch(r);
        atualizados++;
      }
    } catch (e) {
      console.warn(`⚠️ [Compartilhados] ${tabela}/${r.id}: falha ao atualizar:`, e);
      ok = false;
    }
  }

  // Só apaga itens de OUTRAS pessoas que não estão mais na lista do servidor.
  const paraRemover = [...local.values()]
    .filter((j) => ehDeOutra(j) && !vivos.has(String(j.id)))
    .map((j) => String(j.id));
  if (paraRemover.length > 0) {
    try {
      await colecao.bulkRemove(paraRemover);
      removidos = paraRemover.length;
    } catch (e) {
      console.warn(`⚠️ [Compartilhados] ${tabela}: falha ao remover do aparelho:`, e);
      ok = false;
    }
  }

  if (novos || atualizados || removidos) {
    console.log(`🤝 [Compartilhados] ${tabela}: +${novos} novos, ~${atualizados} atualizados, -${removidos} removidos`);
  }
  return ok;
}

// ============================================================
// TABELAS COM DONO (disciplinas, tópicos, arquivos, listas, simulados)
// ============================================================

interface ResultadoRaiz {
  ok: boolean;
  completa: boolean;
  vivos: Set<string>;
  antes: Set<string>;
}

async function sincronizarRaiz(
  db: any,
  client: any,
  eu: string,
  tabela: string,
  colunaDono: string,
): Promise<ResultadoRaiz> {
  const colecao = db.collections[tabela];
  if (!colecao) return { ok: false, completa: false, vivos: new Set(), antes: new Set() };

  const local = await indiceLocal(colecao);
  const ehDeOutra = (j: Row) =>
    typeof j[colunaDono] === 'string' && j[colunaDono] !== '' && j[colunaDono] !== eu;
  const antes = new Set([...local.values()].filter(ehDeOutra).map((j) => String(j.id)));

  const remotas = await paginar((de, ate) =>
    client.from(tabela).select('*').neq(colunaDono, eu).order('id').range(de, ate),
  );
  if (!remotas) return { ok: false, completa: false, vivos: new Set(), antes };

  const vivas = remotas
    .filter((r) => !apagado(r) && r[colunaDono] !== eu)
    .map(normalizar);
  const vivos = new Set(vivas.map((r) => String(r.id)));

  const gravar = vivas.filter((r) => {
    const l = local.get(String(r.id));
    return !l || (ehDeOutra(l) && maisNovo(r, l));
  });

  const ok = await aplicar(tabela, colecao, local, gravar, vivos, ehDeOutra);
  return { ok, completa: true, vivos, antes };
}

// ============================================================
// TABELAS FILHAS (vínculos, questões, alternativas)
// ============================================================

interface OpcoesFilha {
  tabela: string;
  /** Consulta a lista do servidor. Devolve null se falhar. */
  buscarLista: () => Promise<Row[] | null>;
  /** Este item local pertence a conteúdo de outra pessoa? (só esses são apagados) */
  ehDeOutra: (j: Row) => boolean;
  /** true: a consulta já traz as linhas inteiras. false: traz só id + datas e baixa depois o que mudou. */
  linhasCompletas: boolean;
  mudou?: (remoto: Row, local: Row) => boolean;
}

async function sincronizarFilha(
  db: any,
  client: any,
  op: OpcoesFilha,
): Promise<{ ok: boolean; completa: boolean; vivos: Set<string> }> {
  const colecao = db.collections[op.tabela];
  if (!colecao) return { ok: false, completa: false, vivos: new Set() };

  const local = await indiceLocal(colecao);
  const lista = await op.buscarLista();
  if (!lista) return { ok: false, completa: false, vivos: new Set() };

  const vivas = lista.filter((r) => !apagado(r));
  const vivos = new Set(vivas.map((r) => String(r.id)));
  const mudou = op.mudou || maisNovo;

  const precisam = vivas.filter((r) => {
    const l = local.get(String(r.id));
    return !l || (op.ehDeOutra(l) && mudou(r, l));
  });

  let ok = true;
  let gravar: Row[] = [];
  if (op.linhasCompletas) {
    gravar = precisam.map(normalizar);
  } else {
    const baixadas = await buscarPorIds(
      client, op.tabela, 'id', precisam.map((r) => String(r.id)), '*', IDS_POR_DOWNLOAD,
    );
    if (!baixadas) ok = false;
    else gravar = baixadas.filter((r) => !apagado(r)).map(normalizar);
  }

  const okAplicar = await aplicar(op.tabela, colecao, local, gravar, vivos, op.ehDeOutra);
  return { ok: ok && okAplicar, completa: true, vivos };
}

// ============================================================
// FUNÇÃO PRINCIPAL
// ============================================================

/**
 * Atualiza no aparelho o conteúdo compartilhado com você.
 * Devolve true se terminou tudo sem erro.
 */
export async function syncSharedContent(userId: string, force = false): Promise<boolean> {
  if (rodando) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!force && Date.now() - ultimaExecucaoOk < INTERVALO_MIN_MS) return true;

  rodando = true;
  try {
    const eu = String(userId || '');
    if (!eu) return false;

    const db = await getDb();
    const client = await getSupabaseWithToken();

    // Trava de segurança: se o servidor não reconhece você, a lista viria vazia
    // e o app apagaria tudo por engano. Então para aqui.
    const { data: quem, error: quemErro } = await client.rpc('get_user_id');
    if (quemErro || String(quem ?? '') !== eu) {
      console.warn('⚠️ [Compartilhados] Servidor não reconheceu a sessão. Nada foi alterado.');
      return false;
    }

    let tudoOk = true;
    const marcar = (ok: boolean) => { if (!ok) tudoOk = false; };

    // ---- disciplinas, tópicos e arquivos ----
    marcar((await sincronizarRaiz(db, client, eu, 'disciplines', 'user_id')).ok);
    marcar((await sincronizarRaiz(db, client, eu, 'topics', 'user_id')).ok);
    marcar((await sincronizarRaiz(db, client, eu, 'files', 'user_id')).ok);

    // ---- listas de questões ----
    const listas = await sincronizarRaiz(db, client, eu, 'listas', 'user_id');
    marcar(listas.ok);

    if (listas.completa) {
      const listasGerenciadas = new Set([...listas.antes, ...listas.vivos]);
      const vinculos = await sincronizarFilha(db, client, {
        tabela: 'listas_questoes',
        linhasCompletas: true,
        buscarLista: () =>
          buscarPorIds(client, 'listas_questoes', 'lista_id', [...listas.vivos], '*', IDS_POR_CONSULTA),
        ehDeOutra: (j) => listasGerenciadas.has(String(j.lista_id)),
        mudou: (remoto, local) => remoto.ordem !== local.ordem,
      });
      marcar(vinculos.ok);
    } else {
      marcar(false);
    }

    const questoesLista = await sincronizarFilha(db, client, {
      tabela: 'questoes_lista',
      linhasCompletas: false,
      buscarLista: () =>
        paginar((de, ate) =>
          client
            .from('questoes_lista')
            .select('id,user_id,updated_at,created_at,isdeleted')
            .neq('user_id', eu)
            .order('id')
            .range(de, ate),
        ),
      ehDeOutra: (j) => typeof j.user_id === 'string' && j.user_id !== '' && j.user_id !== eu,
    });
    marcar(questoesLista.ok);

    // ---- simulados → questões → alternativas ----
    const simulados = await sincronizarRaiz(db, client, eu, 'simulados', 'created_by');
    marcar(simulados.ok);

    if (simulados.completa) {
      const simuladosGerenciados = new Set([...simulados.antes, ...simulados.vivos]);

      // Guarda quais questões locais já eram de simulados de outras pessoas (antes de sincronizar)
      const colQuestoes = db.collections.questoes;
      const indiceQuestoes = colQuestoes ? await indiceLocal(colQuestoes) : new Map<string, Row>();
      const questoesAntes = [...indiceQuestoes.values()]
        .filter((j) => simuladosGerenciados.has(String(j.simulado_id)))
        .map((j) => String(j.id));

      const questoes = await sincronizarFilha(db, client, {
        tabela: 'questoes',
        linhasCompletas: false,
        buscarLista: () =>
          buscarPorIds(
            client, 'questoes', 'simulado_id', [...simulados.vivos],
            'id,simulado_id,updated_at,created_at,isdeleted', IDS_POR_CONSULTA,
          ),
        ehDeOutra: (j) => simuladosGerenciados.has(String(j.simulado_id)),
      });
      marcar(questoes.ok);

      if (questoes.completa) {
        const questoesGerenciadas = new Set([...questoesAntes, ...questoes.vivos]);
        const alternativas = await sincronizarFilha(db, client, {
          tabela: 'alternativas',
          linhasCompletas: false,
          buscarLista: () =>
            buscarPorIds(
              client, 'alternativas', 'questao_id', [...questoes.vivos],
              'id,questao_id,updated_at,created_at,isdeleted', IDS_POR_CONSULTA,
            ),
          ehDeOutra: (j) => questoesGerenciadas.has(String(j.questao_id)),
        });
        marcar(alternativas.ok);
      } else {
        marcar(false);
      }
    } else {
      marcar(false);
    }

    if (tudoOk) ultimaExecucaoOk = Date.now();
    return tudoOk;
  } catch (e) {
    console.error('❌ [Compartilhados] Erro inesperado:', e);
    return false;
  } finally {
    rodando = false;
  }
}