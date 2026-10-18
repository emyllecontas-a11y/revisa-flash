// src/services/copiaConteudoService.ts
import { getDb } from '@/lib/db';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { enqueueOperation } from '@/services/queueService';
import { uploadFile } from '@/services/fileService';
import { uid } from '@/utils/helpers';
import { STATUS_TOPICO } from '@/constants';

export interface TopicoParaCopiar {
  nome: string;
  arquivoIds: string[];
}

export interface ResultadoCopiaDisciplina {
  success: boolean;
  disciplinaId?: string;
  topicosCriados: number;
  arquivosCopiados: number;
  arquivosComFalha: number;
  error?: string;
}

export interface ResultadoCopiaLista {
  success: boolean;
  listaId?: string;
  questoesCopiadas: number;
  error?: string;
}

export interface ResultadoCopiaSimulado {
  success: boolean;
  simuladoId?: string;
  questoesCopiadas: number;
  error?: string;
}

async function salvarNaNuvem(tabela: string, registro: Record<string, any>): Promise<void> {
  try {
    const supabase = await getSupabaseWithToken();
    const { error } = await supabase.from(tabela).insert(registro);
    if (error) throw error;
  } catch {
    await enqueueOperation('create', tabela, registro);
  }
}

async function copiarImagemQuestao(urlOriginal: string, userId: string): Promise<string | null> {
  try {
    if (!urlOriginal) return null;
    const resp = await fetch(urlOriginal);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const arquivo = new File([blob], 'imagem-questao.jpg', { type: blob.type || 'image/jpeg' });
    const novo = await uploadFile(arquivo, 'questoes-imagens', 'Imagens', userId);
    return novo ? novo.url : null;
  } catch (e) {
    console.warn('[copiaConteudo] Falha ao copiar imagem', e);
    return null;
  }
}

async function copiarArquivo(
  arquivoId: string,
  novoTopicoId: string,
  nomeDisciplina: string,
  userId: string
): Promise<boolean> {
  try {
    const db: any = await getDb();
    const doc = await db.files.findOne({ selector: { id: arquivoId } }).exec();
    if (!doc) return false;
    const original = doc.toJSON();
    if (!original.url) return false;

    const resp = await fetch(original.url);
    if (!resp.ok) return false;
    const blob = await resp.blob();

    const tipo = original.tipo || blob.type || 'application/octet-stream';
    const arquivo = new File([blob], original.nome || 'arquivo.pdf', { type: tipo });

    const novo = await uploadFile(arquivo, novoTopicoId, nomeDisciplina, userId, original.descricao || '');
    if (!novo) return false;

    try {
      const existente = await db.files.findOne({ selector: { id: novo.id } }).exec();
      if (!existente) {
        await db.files.insert({ ...novo, updated_at: novo.created_at });
      }
    } catch (e) {
      console.warn('[copiaConteudo] Não consegui guardar o arquivo no banco local:', e);
    }
    return true;
  } catch (e) {
    console.warn('[copiaConteudo] Falha ao copiar arquivo', arquivoId, e);
    return false;
  }
}

// ============================================================
// 1. COPIAR DISCIPLINA
// ============================================================
export async function copiarDisciplinaParaMinhaConta(
  nomeDisciplina: string,
  topicos: TopicoParaCopiar[],
  userId: string,
  onProgresso?: (texto: string) => void
): Promise<ResultadoCopiaDisciplina> {
  const vazio = { topicosCriados: 0, arquivosCopiados: 0, arquivosComFalha: 0 };

  if (!userId) return { success: false, ...vazio, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, ...vazio, error: 'Você está offline. Copiar precisa de conexão com a internet.' };
  }
  if (!topicos.length) {
    return { success: false, ...vazio, error: 'Não há nada para copiar aqui.' };
  }

  let topicosCriados = 0;
  let arquivosCopiados = 0;
  let arquivosComFalha = 0;

  try {
    const db: any = await getDb();
    const agora = new Date().toISOString();
    const nome = (nomeDisciplina || 'Disciplina').trim();

    const disciplinaId = uid();
    const novaDisciplina = {
      id: disciplinaId,
      name: nome,
      user_id: userId,
      createdAt: agora,
      updated_at: agora,
      isDeleted: false,
    };
    await db.disciplines.insert(novaDisciplina);
    await salvarNaNuvem('disciplines', novaDisciplina);

    for (let i = 0; i < topicos.length; i++) {
      const t = topicos[i];
      onProgresso?.(`Tópico ${i + 1} de ${topicos.length}: ${t.nome}`);

      const topicoId = uid();
      const novoTopico = {
        id: topicoId,
        discipline_id: disciplinaId,
        name: (t.nome || 'Tópico').trim(),
        status: STATUS_TOPICO.NAO_ESTUDADO,
        createdAt: agora,
        updated_at: agora,
        user_id: userId,
        isDeleted: false,
        order: i,
      };
      await db.topics.insert(novoTopico);
      await salvarNaNuvem('topics', novoTopico);
      topicosCriados++;

      for (let j = 0; j < t.arquivoIds.length; j++) {
        onProgresso?.(`Copiando PDF ${j + 1} de ${t.arquivoIds.length} (${t.nome})`);
        const ok = await copiarArquivo(t.arquivoIds[j], topicoId, nome, userId);
        if (ok) arquivosCopiados++;
        else arquivosComFalha++;
      }
    }

    return { success: true, disciplinaId, topicosCriados, arquivosCopiados, arquivosComFalha };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar disciplina:', e);
    return { success: false, topicosCriados, arquivosCopiados, arquivosComFalha, error: e?.message || 'Erro ao copiar.' };
  }
}

// ============================================================
// 2. COPIAR LISTA DE QUESTÕES (CORRIGIDO)
// ============================================================
export async function copiarListaParaMinhaConta(
  listaId: string,
  userId: string,
  onProgresso?: (texto: string) => void
): Promise<ResultadoCopiaLista> {
  if (!userId) return { success: false, questoesCopiadas: 0, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, questoesCopiadas: 0, error: 'Você está offline.' };
  }

  try {
    const db: any = await getDb();
    const agora = new Date().toISOString();

    // 1. Pega a lista original
    const listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (!listaDoc) return { success: false, questoesCopiadas: 0, error: 'Lista não encontrada.' };
    const lista = listaDoc.toJSON();

    // 2. Encontra ou cria a disciplina "Listas Importadas" para a usuária
    let disciplinaImportadaId = "";
    const discDoc = await db.disciplines.findOne({ 
      selector: { user_id: userId, name: 'Listas Importadas' } 
    }).exec();

    if (discDoc) {
      disciplinaImportadaId = discDoc.id;
    } else {
      disciplinaImportadaId = uid();
      const novaDisc = {
        id: disciplinaImportadaId,
        name: 'Listas Importadas',
        user_id: userId,
        createdAt: agora,
        updated_at: agora,
        isDeleted: false,
      };
      await db.disciplines.insert(novaDisc);
      await salvarNaNuvem('disciplines', novaDisc);
    }

    // 3. Cria a nova lista vinculada à disciplina "Listas Importadas"
    const novaListaId = uid();
    const novaLista = {
      ...lista,
      id: novaListaId,
      user_id: userId,
      discipline_id: disciplinaImportadaId, // <-- AQUI ESTÁ A CORREÇÃO
      folder_id: null, // Remove o vínculo com a pasta da dona
      titulo: `${lista.titulo} (Cópia)`,
      created_at: agora,
      updated_at: agora,
      isdeleted: false,
    };
    await db.listas.insert(novaLista);
    await salvarNaNuvem('listas', novaLista);

    // 4. Pega e copia as questões
    const vinculos = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
    let copiadas = 0;

    for (let i = 0; i < vinculos.length; i++) {
      const v = vinculos[i].toJSON();
      onProgresso?.(`Copiando questão ${i + 1} de ${vinculos.length}`);

      const qDoc = await db.questoes_lista.findOne({ selector: { id: v.questao_id } }).exec();
      if (!qDoc) continue;
      const q = qDoc.toJSON();

      // Copia a imagem, se houver
      let novaImagemUrl = q.imagem_url;
      if (q.imagem_url) {
        novaImagemUrl = await copiarImagemQuestao(q.imagem_url, userId);
      }

      // Cria a nova questão
      const novaQuestaoId = uid();
      const novaQuestao = {
        ...q,
        id: novaQuestaoId,
        user_id: userId,
        discipline_id: disciplinaImportadaId, // <-- AQUI ESTÁ A CORREÇÃO
        imagem_url: novaImagemUrl,
        created_at: agora,
        updated_at: agora,
      };
      await db.questoes_lista.insert(novaQuestao);
      await salvarNaNuvem('questoes_lista', novaQuestao);

      // Cria o novo vínculo
      const novoVinculo = {
        id: uid(),
        lista_id: novaListaId,
        questao_id: novaQuestaoId,
        ordem: v.ordem,
        created_at: agora,
      };
      await db.listas_questoes.insert(novoVinculo);
      await salvarNaNuvem('listas_questoes', novoVinculo);
      copiadas++;
    }

    return { success: true, listaId: novaListaId, questoesCopiadas: copiadas };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar lista:', e);
    return { success: false, questoesCopiadas: 0, error: e?.message || 'Erro ao copiar.' };
  }
}

// ============================================================
// 3. COPIAR SIMULADO
// ============================================================
export async function copiarSimuladoParaMinhaConta(
  simuladoId: string,
  userId: string,
  onProgresso?: (texto: string) => void
): Promise<ResultadoCopiaSimulado> {
  if (!userId) return { success: false, questoesCopiadas: 0, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, questoesCopiadas: 0, error: 'Você está offline.' };
  }

  try {
    const db: any = await getDb();
    const agora = new Date().toISOString();

    const simDoc = await db.simulados.findOne({ selector: { id: simuladoId } }).exec();
    if (!simDoc) return { success: false, questoesCopiadas: 0, error: 'Simulado não encontrado.' };
    const simulado = simDoc.toJSON();

    const novoSimuladoId = uid();
    const novoSimulado = {
      ...simulado,
      id: novoSimuladoId,
      created_by: userId,
      titulo: `${simulado.titulo} (Cópia)`,
      created_at: agora,
      updated_at: agora,
      isdeleted: false,
    };
    await db.simulados.insert(novoSimulado);
    await salvarNaNuvem('simulados', novoSimulado);

    const qDocs = await db.questoes.find({ selector: { simulado_id: simuladoId, isdeleted: false } }).exec();
    let copiadas = 0;

    for (let i = 0; i < qDocs.length; i++) {
      const q = qDocs[i].toJSON();
      onProgresso?.(`Copiando questão ${i + 1} de ${qDocs.length}`);

      let novaImagemUrl = q.imagem_url;
      if (q.imagem_url) {
        novaImagemUrl = await copiarImagemQuestao(q.imagem_url, userId);
      }

      const novaQuestaoId = uid();
      const novaQuestao = {
        ...q,
        id: novaQuestaoId,
        simulado_id: novoSimuladoId,
        imagem_url: novaImagemUrl,
        created_at: agora,
        updated_at: agora,
      };
      await db.questoes.insert(novaQuestao);
      await salvarNaNuvem('questoes', novaQuestao);

      const altDocs = await db.alternativas.find({ selector: { questao_id: q.id, isdeleted: false } }).exec();
      for (const altDoc of altDocs) {
        const alt = altDoc.toJSON();
        const novaAlternativa = {
          ...alt,
          id: uid(),
          questao_id: novaQuestaoId,
          created_at: agora,
          updated_at: agora,
        };
        await db.alternativas.insert(novaAlternativa);
        await salvarNaNuvem('alternativas', novaAlternativa);
      }
      copiadas++;
    }

    return { success: true, simuladoId: novoSimuladoId, questoesCopiadas: copiadas };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar simulado:', e);
    return { success: false, questoesCopiadas: 0, error: e?.message || 'Erro ao copiar.' };
  }
}