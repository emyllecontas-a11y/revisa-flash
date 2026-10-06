// src/services/listaService.ts

import { supabase, getSupabaseWithToken } from '@/lib/supabaseClient';
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import {
  Lista,
  QuestaoLista,
  QuestaoListaPlayer,
  ResultadoLista,
  ListaImport,
  ListaPlayer,
  ResultadoListaCalc,
  AcertosPorArea,
  TipoQuestaoLista,
  AlternativaLista,
  Pasta,
  FiltroListas,
} from '@/lib/listas-types';

// ============================================================
// HELPERS
// ============================================================

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Erro ao ler arquivo ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) em ${label}`)), ms)
    ),
  ]);
}

async function processarEmLotes<T, R>(
  itens: T[],
  tamanhoLote: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < itens.length; i += tamanhoLote) {
    const lote = itens.slice(i, i + tamanhoLote);
    const res = await Promise.all(lote.map((item, idx) => fn(item, i + idx)));
    resultados.push(...res);
  }
  return resultados;
}

const saveQueues = new Map<string, Promise<any>>();
function serializar<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const anterior = saveQueues.get(key) || Promise.resolve();
  const proxima = anterior.then(() => fn()).catch((e) => {
    console.warn('⚠️ Erro na fila serializada:', e);
    return undefined as any;
  });
  saveQueues.set(key, proxima);
  proxima.finally(() => {
    if (saveQueues.get(key) === proxima) saveQueues.delete(key);
  });
  return proxima;
}

// ============================================================
// 1. LISTAR AS LISTAS DO USUÁRIO
// ============================================================

export async function getListas(
  userId: string,
  filtro?: FiltroListas
): Promise<{ success: boolean; data?: Lista[]; error?: string }> {
  try {
    const db = await getDb();

    const docs = await db.listas.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    let listas: Lista[] = docs.map((d: any) => d.toJSON());

    const links = await db.listas_questoes.find({ selector: {} }).exec();
    const contagemPorLista: Record<string, number> = {};
    for (const link of links) {
      const l = link.toJSON();
      contagemPorLista[l.lista_id] = (contagemPorLista[l.lista_id] || 0) + 1;
    }
    listas = listas.map((l) => ({
      ...l,
      questoes_count: contagemPorLista[l.id] || 0,
    }));

    listas.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    if (filtro?.disciplineId) listas = listas.filter((l) => l.discipline_id === filtro.disciplineId);
    if (filtro?.folderId) listas = listas.filter((l) => l.folder_id === filtro.folderId);
    if (filtro?.apenasSemPasta) listas = listas.filter((l) => !l.folder_id);

    return { success: true, data: listas };
  } catch (error: any) {
    console.error('Erro ao buscar listas:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 2. BUSCAR LISTA COMPLETA
// ============================================================

export async function getListaCompleta(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: ListaPlayer; error?: string }> {
  try {
    console.log(`📖 [getListaCompleta] Início — listaId=${listaId}`);
    const db = await getDb();
    console.log('📖 [getListaCompleta] DB ok');

    let listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    let linkDocs = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
    console.log(`📖 [getListaCompleta] Local: lista=${!!listaDoc}, links=${linkDocs.length}`);

    const precisaBuscar = (!listaDoc || linkDocs.length === 0);
    if (precisaBuscar && isOnline()) {
      try {
        console.log('📖 [getListaCompleta] Fallback online iniciando...');
        const client = await withTimeout(getSupabaseWithToken(), 8000, 'getSupabaseWithToken');
        console.log('📖 [getListaCompleta] Cliente Supabase ok');

        if (!listaDoc) {
          const { data: lista, error: lErr } = await withTimeout(
            client.from('listas').select('*').eq('id', listaId).eq('user_id', userId).eq('isdeleted', false).maybeSingle(),
            8000,
            'select listas'
          );
          if (lErr) console.warn('⚠️ Erro ao buscar lista:', lErr);
          if (lista) await db.listas.insert(lista).catch(() => {});
          console.log(`📖 [getListaCompleta] Lista vinda do servidor: ${!!lista}`);
        }

        const { data: links, error: lkErr } = await withTimeout(
          client.from('listas_questoes').select('*').eq('lista_id', listaId),
          8000,
          'select listas_questoes'
        );
        if (lkErr) console.warn('⚠️ Erro ao buscar links:', lkErr);
        console.log(`📖 [getListaCompleta] Links do servidor: ${links?.length || 0}`);
        for (const l of links || []) {
          const ex = await db.listas_questoes.findOne({ selector: { id: l.id } }).exec();
          if (!ex) await db.listas_questoes.insert(l).catch(() => {});
        }

        const questaoIds = (links || []).map((l: any) => l.questao_id).filter(Boolean);
        if (questaoIds.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < questaoIds.length; i += 100) {
            chunks.push(questaoIds.slice(i, i + 100));
          }
          let totalQ = 0;
          for (const chunk of chunks) {
            const { data: qs, error: qErr } = await withTimeout(
              client.from('questoes_lista').select('*').in('id', chunk).eq('isdeleted', false),
              8000,
              'select questoes_lista'
            );
            if (qErr) {
              console.warn('⚠️ Erro ao buscar questões:', qErr);
              continue;
            }
            for (const q of qs || []) {
              const ex = await db.questoes_lista.findOne({ selector: { id: q.id } }).exec();
              if (!ex) {
                await db.questoes_lista.insert(q).catch(() => {});
                totalQ++;
              }
            }
          }
          console.log(`📖 [getListaCompleta] Questões do servidor: ${totalQ}`);
        }

        listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
        linkDocs = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
        console.log(`📖 [getListaCompleta] Após fallback: lista=${!!listaDoc}, links=${linkDocs.length}`);
      } catch (e: any) {
        console.warn('⚠️ Fallback online de lista falhou:', e?.message || e);
      }
    }

    if (!listaDoc) {
      console.warn('📖 [getListaCompleta] Lista não encontrada');
      return { success: false, error: 'Lista não encontrada' };
    }
    const lista: any = listaDoc.toJSON();

    if (linkDocs.length === 0) {
      console.warn('📖 [getListaCompleta] Sem links');
      if (!isOnline()) {
        return {
          success: false,
          error: 'Esta lista ainda não foi baixada. Conecte-se à internet uma vez para baixá-la.',
        };
      }
      return { success: false, error: 'Esta lista não tem questões.' };
    }

    const links = linkDocs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (a.ordem || 0) - (b.ordem || 0));

    const questoes: QuestaoListaPlayer[] = [];
    for (const link of links) {
      const qDoc = await db.questoes_lista.findOne({ selector: { id: link.questao_id } }).exec();
      if (!qDoc) continue;
      const q: any = qDoc.toJSON();
      if (q.isdeleted) continue;
      questoes.push({ ...q, numero: link.ordem });
    }

    console.log(`📖 [getListaCompleta] Fim — ${questoes.length} questões montadas`);

    if (questoes.length === 0) {
      if (!isOnline()) {
        return { success: false, error: 'Lista sem questões disponíveis offline.' };
      }
      return { success: false, error: 'Esta lista não tem questões.' };
    }

    return { success: true, data: { ...lista, questoes } };
  } catch (error: any) {
    console.error('📖 [getListaCompleta] Erro:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 3. UPLOAD DE IMAGEM
// ============================================================

export async function uploadImagemQuestao(
  base64: string,
  userId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const client = await getSupabaseWithToken();

    const match = base64.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (!match) return { success: false, error: 'Formato de imagem inválido' };

    const formato = match[1];
    const dados = match[2];
    const extensao = formato === 'jpeg' ? 'jpg' : formato;

    const tamanhoBytes = Math.ceil((dados.length * 3) / 4);
    if (tamanhoBytes > 2 * 1024 * 1024) {
      return { success: false, error: 'Imagem maior que 2 MB' };
    }

    const binario = atob(dados);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const blob = new Blob([bytes], { type: `image/${formato}` });

    const nomeArquivo = `${userId}/${crypto.randomUUID()}.${extensao}`;

    const { error: uploadError } = await client.storage
      .from('questoes-imagens')
      .upload(nomeArquivo, blob, { contentType: `image/${formato}`, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage
      .from('questoes-imagens')
      .getPublicUrl(nomeArquivo);

    return { success: true, url: urlData.publicUrl };
  } catch (error: any) {
    console.error('Erro no upload de imagem:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 4. IMPORTAR LISTA
// ============================================================

export async function importarLista(
  dados: ListaImport,
  userId: string,
  disciplineId: string,
  imagensFiles?: File[],
  folderId?: string | null
): Promise<{ success: boolean; listaId?: string; error?: string }> {
  try {
    if (!userId) return { success: false, error: 'Usuário não autenticado' };
    if (!disciplineId) return { success: false, error: 'Disciplina é obrigatória' };
    if (!isOnline()) {
      return {
        success: false,
        error: 'Você está offline. A importação de listas precisa de conexão com a internet.',
      };
    }

    const client = await getSupabaseWithToken();
    const listaId = crypto.randomUUID();

    const arquivosMap = new Map<string, File>();
    (imagensFiles || []).forEach((f) => arquivosMap.set(f.name.toLowerCase(), f));

    const faltando: string[] = [];
    dados.questoes.forEach((q, i) => {
      if (q.imagem && !q.imagem_base64) {
        const key = q.imagem.toLowerCase();
        if (!arquivosMap.has(key)) faltando.push(`Questão ${q.numero || i + 1}: "${q.imagem}"`);
      }
    });
    if (faltando.length > 0) {
      return {
        success: false,
        error: `As seguintes imagens não foram encontradas:\n` + faltando.join('\n'),
      };
    }

    const preparados = await processarEmLotes(dados.questoes, 10, async (q, idx) => {
      if (q.imagem && !q.imagem_base64) {
        const arquivo = arquivosMap.get(q.imagem.toLowerCase());
        if (arquivo) {
          try {
            const b64 = await fileToBase64(arquivo);
            return { base64: b64 as string | null, erro: null as string | null };
          } catch (err: any) {
            return { base64: null, erro: `Erro ao ler imagem da questão ${q.numero || idx + 1}: ${err.message}` };
          }
        }
      } else if (q.imagem_base64) {
        return { base64: q.imagem_base64, erro: null };
      }
      return { base64: null, erro: null };
    });

    const erroLeitura = preparados.find((p) => p.erro);
    if (erroLeitura) return { success: false, error: erroLeitura.erro! };

    const uploads = await processarEmLotes(preparados, 5, async (p) => {
      if (!p.base64) return { url: null as string | null, erro: null as string | null };
      const res = await uploadImagemQuestao(p.base64, userId);
      return { url: res.url || null, erro: res.success ? null : (res.error || 'Erro no upload') };
    });

    const erroUploadIdx = uploads.findIndex((u) => u.erro);
    if (erroUploadIdx !== -1) {
      const q = dados.questoes[erroUploadIdx];
      return { success: false, error: `Erro na imagem da questão ${q.numero || erroUploadIdx + 1}: ${uploads[erroUploadIdx].erro}` };
    }

    const questoesFormatadas = dados.questoes.map((q, i) => {
      const qf: any = {
        numero: q.numero || i + 1,
        tipo: q.tipo,
        enunciado: q.enunciado,
        area: q.area || null,
        imagem_url: uploads[i].url,
        comentario_geral: q.comentario_geral || null,
      };
      if (q.tipo === 'multipla_escolha') qf.alternativas = q.alternativas || [];
      else if (q.tipo === 'certo_errado') qf.correta = q.correta === true;
      return qf;
    });

    const { data, error } = await client.rpc('importar_lista', {
      p_lista_id: listaId,
      p_user_id: userId,
      p_discipline_id: disciplineId,
      p_titulo: dados.titulo,
      p_descricao: dados.descricao || null,
      p_questoes: questoesFormatadas,
    });

    if (error) throw error;

    if (data && data.success === true) {
      if (folderId) {
        const { error: folderError } = await client
          .from('listas')
          .update({ folder_id: folderId })
          .eq('id', listaId)
          .eq('user_id', userId);
        if (folderError) console.error('Erro ao vincular pasta:', folderError);
      }
      import('@/lib/db').then(({ syncWithSupabase }) => {
        syncWithSupabase(userId).catch(() => {});
      });
      return { success: true, listaId };
    }
    return { success: false, error: data?.error || 'Erro desconhecido na RPC' };
  } catch (error: any) {
    console.error('Erro ao importar lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 5. EXCLUIR / RESTAURAR LISTA
// ============================================================

export async function excluirLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (listaDoc && listaDoc.get('user_id') === userId) {
      await listaDoc.patch({ isdeleted: true, updated_at: now });
    }

    const resultados = await db.resultados_lista.find({
      selector: { lista_id: listaId, user_id: userId, isdeleted: false },
    }).exec();
    for (const r of resultados) {
      await r.patch({ isdeleted: true, updated_at: now });
      await enqueueOperation('update', 'resultados_lista', {
        id: r.get('id'), isdeleted: true, updated_at: now,
      });
    }

    await enqueueOperation('update', 'listas', {
      id: listaId, isdeleted: true, updated_at: now,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao excluir lista:', error);
    return { success: false, error: error.message };
  }
}

export async function restaurarLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    const listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (listaDoc && listaDoc.get('user_id') === userId) {
      await listaDoc.patch({ isdeleted: false, updated_at: now });
    }
    await enqueueOperation('update', 'listas', {
      id: listaId, isdeleted: false, updated_at: now,
    });

    const resultados = await db.resultados_lista.find({
      selector: { lista_id: listaId, user_id: userId },
    }).exec();
    for (const r of resultados) {
      await r.patch({ isdeleted: false, updated_at: now });
      await enqueueOperation('update', 'resultados_lista', {
        id: r.get('id'), isdeleted: false, updated_at: now,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao restaurar lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 6. RESULTADO DA LISTA
// ============================================================

export async function salvarResultadoLista(
  listaId: string,
  userId: string,
  resultado: ResultadoListaCalc,
  respostas: Record<number, string>,
  areas: Record<number, string>,
  acertosPorArea: AcertosPorArea
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = nowIso();

    const doc = {
      id,
      lista_id: listaId,
      user_id: userId,
      total_questoes: resultado.totalQuestoes,
      acertos: resultado.acertos,
      erros: resultado.erros,
      nao_respondidas: resultado.naoRespondidas,
      porcentagem: resultado.porcentagem,
      tempo_segundos: resultado.tempoDecorrido,
      respostas,
      areas,
      acertos_por_area: acertosPorArea,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };

    await db.resultados_lista.insert(doc);
    await enqueueOperation('create', 'resultados_lista', doc);

    return { success: true, id };
  } catch (error: any) {
    console.error('Erro ao salvar resultado:', error);
    return { success: false, error: error.message };
  }
}

export async function buscarResultadosLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: ResultadoLista[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.resultados_lista.find({
      selector: { lista_id: listaId, user_id: userId, isdeleted: false },
    }).exec();
    const data: ResultadoLista[] = docs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar resultados da lista:', error);
    return { success: false, error: error.message };
  }
}

export async function buscarTodosResultados(
  userId: string
): Promise<{ success: boolean; data?: ResultadoLista[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.resultados_lista.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    const data: ResultadoLista[] = docs
      .map((d: any) => d.toJSON())
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar resultados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 9-10. CÁLCULOS
// ============================================================

export function calcularResultadoLista(
  questoes: QuestaoListaPlayer[],
  respostas: Record<number, string>
): ResultadoListaCalc {
  const total = questoes.length;
  let acertos = 0;
  let erros = 0;
  let naoRespondidas = 0;

  for (const q of questoes) {
    const resposta = respostas[q.numero];
    if (!resposta) { naoRespondidas++; continue; }

    let correta: string | null = null;
    if (q.tipo === 'multipla_escolha') correta = q.alternativas?.find((a) => a.correta)?.letra || null;
    else if (q.tipo === 'certo_errado') correta = q.gabarito_ce ? 'C' : 'E';

    if (resposta === correta) acertos++;
    else erros++;
  }

  const porcentagem = total > 0 ? Math.round((acertos / total) * 100) : 0;

  return {
    listaId: '',
    totalQuestoes: total,
    respondidas: acertos + erros,
    acertos, erros, naoRespondidas, porcentagem,
    tempoDecorrido: 0,
  };
}

export function calcularAcertosPorArea(
  questoes: QuestaoListaPlayer[],
  respostas: Record<number, string>
): AcertosPorArea {
  const mapa: AcertosPorArea = {};
  for (const q of questoes) {
    const area = q.area || 'Não categorizada';
    if (!mapa[area]) mapa[area] = { acertos: 0, total: 0 };
    mapa[area].total++;

    const resposta = respostas[q.numero];
    if (!resposta) continue;

    let correta: string | null = null;
    if (q.tipo === 'multipla_escolha') correta = q.alternativas?.find((a) => a.correta)?.letra || null;
    else if (q.tipo === 'certo_errado') correta = q.gabarito_ce ? 'C' : 'E';

    if (resposta === correta) mapa[area].acertos++;
  }
  return mapa;
}

// ============================================================
// 11. ATUALIZAR LISTA (corrigido — busca por PK)
// ============================================================

export async function atualizarLista(
  listaId: string,
  userId: string,
  dados: { titulo: string; descricao: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!dados.titulo || dados.titulo.trim().length === 0) {
      return { success: false, error: 'Título é obrigatório' };
    }
    const db = await getDb();
    const now = nowIso();
    const patch = {
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() || null,
      updated_at: now,
    };

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const doc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (!doc || doc.get('user_id') !== userId) {
      return { success: false, error: 'Lista não encontrada' };
    }
    await doc.patch(patch);
    await enqueueOperation('update', 'listas', { id: listaId, ...patch });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar lista:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 12-16. QUESTÕES (corrigido — busca por PK)
// ============================================================

export async function removerQuestaoDALista(
  listaId: string,
  questaoId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();

    const linkDoc = await db.listas_questoes.findOne({
      selector: { lista_id: listaId, questao_id: questaoId },
    }).exec();
    if (!linkDoc) return { success: false, error: 'Vínculo não encontrado' };

    const linkId = linkDoc.get('id');
    await linkDoc.remove();
    await enqueueOperation('delete', 'listas_questoes', { id: linkId });

    const outrosLinks = await db.listas_questoes.find({ selector: { questao_id: questaoId } }).exec();
    if (outrosLinks.length === 0) {
      const qDoc = await db.questoes_lista.findOne({ selector: { id: questaoId } }).exec();
      if (qDoc) {
        await qDoc.patch({ isdeleted: true });
        await enqueueOperation('update', 'questoes_lista', {
          id: questaoId, isdeleted: true, updated_at: nowIso(),
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao remover questão:', error);
    return { success: false, error: error.message };
  }
}

export async function buscarQuestoesDaLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: QuestaoListaPlayer[]; error?: string }> {
  try {
    const db = await getDb();
    const linkDocs = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
    const links = linkDocs.map((d: any) => d.toJSON()).sort((a: any, b: any) => (a.ordem || 0) - (b.ordem || 0));

    const questoes: QuestaoListaPlayer[] = [];
    for (const link of links) {
      const qDoc = await db.questoes_lista.findOne({ selector: { id: link.questao_id } }).exec();
      if (!qDoc) continue;
      const q: any = qDoc.toJSON();
      if (q.isdeleted) continue;
      questoes.push({ ...q, numero: link.ordem });
    }

    return { success: true, data: questoes };
  } catch (error: any) {
    console.error('Erro ao buscar questões da lista:', error);
    return { success: false, error: error.message };
  }
}

export async function criarQuestaoNaLista(
  listaId: string,
  userId: string,
  disciplineId: string,
  dados: {
    tipo: TipoQuestaoLista;
    enunciado: string;
    area: string | null;
    imagem_url: string | null;
    comentario_geral: string | null;
    alternativas: AlternativaLista[] | null;
    gabarito_ce: boolean | null;
  }
): Promise<{ success: boolean; questaoId?: string; error?: string }> {
  try {
    if (!dados.enunciado || dados.enunciado.trim().length === 0) {
      return { success: false, error: 'Enunciado é obrigatório' };
    }
    if (dados.tipo === 'multipla_escolha') {
      if (!dados.alternativas || dados.alternativas.length < 2) {
        return { success: false, error: 'Múltipla escolha precisa de pelo menos 2 alternativas' };
      }
      const corretas = dados.alternativas.filter(a => a.correta).length;
      if (corretas !== 1) return { success: false, error: 'Marque exatamente uma alternativa como correta' };
    }

    const db = await getDb();
    const questaoId = crypto.randomUUID();
    const now = nowIso();

    const questaoDoc = {
      id: questaoId,
      user_id: userId,
      discipline_id: disciplineId,
      tipo: dados.tipo,
      enunciado: dados.enunciado.trim(),
      area: dados.area?.trim() || null,
      imagem_url: dados.imagem_url,
      comentario_geral: dados.comentario_geral?.trim() || null,
      alternativas: dados.tipo === 'multipla_escolha' ? dados.alternativas : null,
      gabarito_ce: dados.tipo === 'certo_errado' ? dados.gabarito_ce : null,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };
    await db.questoes_lista.insert(questaoDoc);
    await enqueueOperation('create', 'questoes_lista', questaoDoc);

    const linkDocs = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
    const ordens = linkDocs.map((d: any) => d.get('ordem') || 0);
    const proximaOrdem = ordens.length > 0 ? Math.max(...ordens) + 1 : 1;

    const linkDoc = {
      id: crypto.randomUUID(),
      lista_id: listaId,
      questao_id: questaoId,
      ordem: proximaOrdem,
      created_at: now,
    };
    await db.listas_questoes.insert(linkDoc);
    await enqueueOperation('create', 'listas_questoes', linkDoc);

    return { success: true, questaoId };
  } catch (error: any) {
    console.error('Erro ao criar questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// CORRIGIDO — busca só pela PK + valida em JS
// ============================================================

export async function atualizarQuestaoLista(
  questaoId: string,
  userId: string,
  dados: {
    tipo: TipoQuestaoLista;
    enunciado: string;
    area: string | null;
    imagem_url: string | null;
    comentario_geral: string | null;
    alternativas: AlternativaLista[] | null;
    gabarito_ce: boolean | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!dados.enunciado || dados.enunciado.trim().length === 0) {
      return { success: false, error: 'Enunciado é obrigatório' };
    }
    if (dados.tipo === 'multipla_escolha') {
      if (!dados.alternativas || dados.alternativas.length < 2) {
        return { success: false, error: 'Múltipla escolha precisa de pelo menos 2 alternativas' };
      }
      const corretas = dados.alternativas.filter(a => a.correta).length;
      if (corretas !== 1) return { success: false, error: 'Marque exatamente uma alternativa como correta' };
    }

    const db = await getDb();
    const now = nowIso();
    const patch = {
      tipo: dados.tipo,
      enunciado: dados.enunciado.trim(),
      area: dados.area?.trim() || null,
      imagem_url: dados.imagem_url,
      comentario_geral: dados.comentario_geral?.trim() || null,
      alternativas: dados.tipo === 'multipla_escolha' ? dados.alternativas : null,
      gabarito_ce: dados.tipo === 'certo_errado' ? dados.gabarito_ce : null,
      updated_at: now,
    };

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const doc = await db.questoes_lista.findOne({ selector: { id: questaoId } }).exec();
    if (!doc || doc.get('user_id') !== userId) {
      return { success: false, error: 'Questão não encontrada' };
    }
    await doc.patch(patch);
    await enqueueOperation('update', 'questoes_lista', { id: questaoId, ...patch });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar questão:', error);
    return { success: false, error: error.message };
  }
}

export async function buscarQuestao(
  questaoId: string,
  userId: string
): Promise<{ success: boolean; data?: QuestaoLista; error?: string }> {
  try {
    const db = await getDb();

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const doc = await db.questoes_lista.findOne({ selector: { id: questaoId } }).exec();
    if (!doc) return { success: false, error: 'Questão não encontrada' };

    const q: any = doc.toJSON();
    if (q.user_id !== userId || q.isdeleted) {
      return { success: false, error: 'Questão não encontrada' };
    }
    return { success: true, data: q as QuestaoLista };
  } catch (error: any) {
    console.error('Erro ao buscar questão:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 17-22. PASTAS (corrigido — busca por PK)
// ============================================================

export async function getPastas(
  userId: string,
  disciplineId?: string
): Promise<{ success: boolean; data?: Pasta[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.listas_pastas.find({
      selector: { user_id: userId, isdeleted: false },
    }).exec();
    let data: Pasta[] = docs.map((d: any) => d.toJSON());
    if (disciplineId) data = data.filter((p) => p.discipline_id === disciplineId);
    data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    return { success: true, data };
  } catch (error: any) {
    console.error('Erro ao buscar pastas:', error);
    return { success: false, error: error.message };
  }
}

export async function criarPasta(
  userId: string,
  disciplineId: string,
  name: string
): Promise<{ success: boolean; data?: Pasta; error?: string }> {
  try {
    const nomeLimpo = name?.trim();
    if (!nomeLimpo) return { success: false, error: 'Nome da pasta é obrigatório' };
    if (!userId) return { success: false, error: 'Usuário não autenticado' };
    if (!disciplineId) return { success: false, error: 'Disciplina é obrigatória' };

    const db = await getDb();
    const now = nowIso();
    const existentes = await db.listas_pastas.find({
      selector: { user_id: userId, discipline_id: disciplineId, isdeleted: false },
    }).exec();
    const ordens = existentes.map((d: any) => d.get('order') || 0);
    const proximaOrder = ordens.length > 0 ? Math.max(...ordens) + 1 : 0;

    const pasta: Pasta = {
      id: crypto.randomUUID(),
      user_id: userId,
      discipline_id: disciplineId,
      name: nomeLimpo,
      order: proximaOrder,
      created_at: now,
      updated_at: now,
      isdeleted: false,
    };

    await db.listas_pastas.insert(pasta);
    await enqueueOperation('create', 'listas_pastas', pasta);
    return { success: true, data: pasta };
  } catch (error: any) {
    console.error('Erro ao criar pasta:', error);
    return { success: false, error: error.message };
  }
}

export async function renomearPasta(
  pastaId: string,
  userId: string,
  novoNome: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const nomeLimpo = novoNome?.trim();
    if (!nomeLimpo) return { success: false, error: 'Nome da pasta é obrigatório' };

    const db = await getDb();
    const now = nowIso();

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const doc = await db.listas_pastas.findOne({ selector: { id: pastaId } }).exec();
    if (!doc || doc.get('user_id') !== userId) {
      return { success: false, error: 'Pasta não encontrada' };
    }

    await doc.patch({ name: nomeLimpo, updated_at: now });
    await enqueueOperation('update', 'listas_pastas', { id: pastaId, name: nomeLimpo, updated_at: now });
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao renomear pasta:', error);
    return { success: false, error: error.message };
  }
}

export async function excluirPasta(
  pastaId: string,
  userId: string
): Promise<{ success: boolean; listasMovidas?: number; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    const listas = await db.listas.find({
      selector: { folder_id: pastaId, user_id: userId, isdeleted: false },
    }).exec();
    for (const l of listas) {
      await l.patch({ folder_id: null, updated_at: now });
      await enqueueOperation('update', 'listas', { id: l.get('id'), folder_id: null, updated_at: now });
    }

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const pastaDoc = await db.listas_pastas.findOne({ selector: { id: pastaId } }).exec();
    if (pastaDoc && pastaDoc.get('user_id') === userId) {
      await pastaDoc.patch({ isdeleted: true, updated_at: now });
    }
    await enqueueOperation('update', 'listas_pastas', { id: pastaId, isdeleted: true, updated_at: now });

    return { success: true, listasMovidas: listas.length };
  } catch (error: any) {
    console.error('Erro ao excluir pasta:', error);
    return { success: false, error: error.message };
  }
}

export async function moverListaParaPasta(
  listaId: string,
  userId: string,
  folderId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const now = nowIso();

    // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
    const doc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (!doc) return { success: false, error: 'Lista não encontrada' };
    if (doc.get('user_id') !== userId || doc.get('isdeleted')) {
      return { success: false, error: 'Lista não encontrada' };
    }

    await doc.patch({ folder_id: folderId, updated_at: now });
    await enqueueOperation('update', 'listas', { id: listaId, folder_id: folderId, updated_at: now });
    return { success: true };
  } catch (error: any) {
    console.error('Erro ao mover lista:', error);
    return { success: false, error: error.message };
  }
}

export async function reordenarPastas(
  userId: string,
  itens: { id: string; order: number }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!itens || itens.length === 0) return { success: true };

    const db = await getDb();
    const now = nowIso();

    for (const item of itens) {
      // Busca só pela PK + valida em JS (evita bug IDBKeyRange)
      const doc = await db.listas_pastas.findOne({ selector: { id: item.id } }).exec();
      if (!doc || doc.get('user_id') !== userId) continue;
      await doc.patch({ order: item.order, updated_at: now });
      await enqueueOperation('update', 'listas_pastas', { id: item.id, order: item.order, updated_at: now });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao reordenar pastas:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 23-24. PROGRESSO DA LISTA
// ============================================================

export async function getProgressoLista(
  listaId: string,
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const db = await getDb();
    const doc = await db.progresso_lista.findOne({
      selector: { lista_id: listaId, user_id: userId, isdeleted: false },
    }).exec();
    return { success: true, data: doc ? doc.toJSON() : undefined };
  } catch (error: any) {
    console.error('Erro ao buscar progresso local:', error);
    return { success: false, error: error.message };
  }
}

export async function salvarProgressoLista(
  listaId: string,
  userId: string,
  progresso: {
    respostas: Record<number, string>;
    marcadas: number[];
    tempo_decorrido: number;
    status: 'em-andamento' | 'concluido';
  }
): Promise<{ success: boolean; error?: string }> {
  const lockKey = `progresso_lista:${listaId}:${userId}`;

  return serializar(lockKey, async () => {
    try {
      const db = await getDb();
      const now = nowIso();

      const existing = await db.progresso_lista.findOne({
        selector: { lista_id: listaId, user_id: userId, isdeleted: false },
      }).exec();

      const existingRespostas: any = existing?.get('respostas') || {};
      const existingMarcadas: any = existing?.get('marcadas') || [];
      const existingTempo: number = existing?.get('tempo_decorrido') || 0;

      const novasRespostas = progresso.respostas ?? existingRespostas;
      const novasMarcadas = progresso.marcadas ?? existingMarcadas;
      const novoTempo = progresso.tempo_decorrido ?? existingTempo;

      const veioVazio =
        Object.keys(progresso.respostas || {}).length === 0 &&
        (progresso.marcadas || []).length === 0 &&
        (progresso.tempo_decorrido || 0) === 0;
      const jaTemDados =
        Object.keys(existingRespostas).length > 0 ||
        existingMarcadas.length > 0 ||
        existingTempo > 0;

      if (veioVazio && jaTemDados) {
        return { success: true };
      }

      if (existing) {
        const patch = {
          respostas: novasRespostas,
          marcadas: novasMarcadas,
          tempo_decorrido: novoTempo,
          status: progresso.status ?? existing.get('status') ?? 'em-andamento',
          updated_at: now,
        };
        await existing.patch(patch);
        await enqueueOperation('update', 'progresso_lista', { id: existing.get('id'), ...patch });
      } else {
        const doc = {
          id: crypto.randomUUID(),
          lista_id: listaId,
          user_id: userId,
          respostas: progresso.respostas || {},
          marcadas: progresso.marcadas || [],
          tempo_decorrido: progresso.tempo_decorrido || 0,
          status: progresso.status || 'em-andamento',
          created_at: now,
          updated_at: now,
          isdeleted: false,
        };
        await db.progresso_lista.insert(doc);
        await enqueueOperation('create', 'progresso_lista', doc);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao salvar progresso lista:', error);
      return { success: false, error: error.message };
    }
  });
}