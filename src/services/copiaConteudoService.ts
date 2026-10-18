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

export interface ProgressoCopia {
  current: number;
  total: number;
  label: string;
}
export type OnProgresso = (info: ProgressoCopia) => void;

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

export interface TopicoDestino {
  nomeOriginal: string;
  arquivoIds: string[];
  /** Se informado, copia arquivos para esse tópico existente. Senão, cria um novo com nomeNovoTopico. */
  topicoDestinoId: string | null;
  nomeNovoTopico?: string;
}

export interface DestinoLista {
  /** null = criar nova disciplina (usa nomeNovaDisciplina) */
  disciplinaId: string | null;
  nomeNovaDisciplina?: string;
  folderId?: string | null;
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
// FUNÇÃO PRINCIPAL — copia tópicos (com arquivos) para um destino
// ============================================================
export async function copiarTopicosParaDisciplina(
  userId: string,
  destinoDisciplinaId: string | null,
  nomeNovaDisciplina: string,
  topicos: TopicoDestino[],
  onProgresso?: OnProgresso
): Promise<ResultadoCopiaDisciplina> {
  const vazio = { topicosCriados: 0, arquivosCopiados: 0, arquivosComFalha: 0 };

  if (!userId) return { success: false, ...vazio, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, ...vazio, error: 'Você está offline. Copiar precisa de conexão.' };
  }
  if (!topicos.length) {
    return { success: false, ...vazio, error: 'Não há nada para copiar aqui.' };
  }

  const totalArquivos = topicos.reduce((s, t) => s + t.arquivoIds.length, 0);
  const vaiCriarDisciplina = !destinoDisciplinaId;
  const topicosNovosPrevistos = topicos.filter((t) => !t.topicoDestinoId).length;
  const totalPassos =
    (vaiCriarDisciplina ? 1 : 0) + topicosNovosPrevistos + totalArquivos;
  let passosFeitos = 0;

  const reportar = (label: string) => {
    onProgresso?.({ current: passosFeitos, total: Math.max(totalPassos, 1), label });
  };
  reportar('Começando...');

  let topicosCriados = 0;
  let arquivosCopiados = 0;
  let arquivosComFalha = 0;

  try {
    const db: any = await getDb();
    const agora = new Date().toISOString();

    // 1) Disciplina de destino
    let disciplinaId = destinoDisciplinaId;
    let nomeDisciplinaFinal = nomeNovaDisciplina;

    if (!disciplinaId) {
      const nome = (nomeNovaDisciplina || 'Disciplina').trim();
      disciplinaId = uid();
      const novaDisciplina = {
        id: disciplinaId,
        name: nome,
        user_id: userId,
        createdAt: agora,
        updated_at: agora,
        isDeleted: false,
      };
      reportar(`Criando disciplina "${nome}"...`);
      await db.disciplines.insert(novaDisciplina);
      await salvarNaNuvem('disciplines', novaDisciplina);
      nomeDisciplinaFinal = nome;
      passosFeitos++;
    } else {
      try {
        const discDoc = await db.disciplines.findOne({ selector: { id: disciplinaId } }).exec();
        if (discDoc) nomeDisciplinaFinal = discDoc.get('name') || nomeDisciplinaFinal;
      } catch { /* segue com o nome padrão */ }
    }

    // 2) Descobre o próximo "order" disponível na disciplina
    let proximaOrdem = 0;
    try {
      const existentes = await db.topics.find({
        selector: { discipline_id: disciplinaId, isDeleted: { $ne: true } },
      }).exec();
      const ordens = existentes.map((d: any) => d.get('order') || 0);
      proximaOrdem = ordens.length > 0 ? Math.max(...ordens) + 1 : 0;
    } catch { /* segue com 0 */ }

    // 3) Tópicos + arquivos
    for (let i = 0; i < topicos.length; i++) {
      const t = topicos[i];
      let topicoId = t.topicoDestinoId;

      if (!topicoId) {
        topicoId = uid();
        const nomeTopico = (t.nomeNovoTopico || t.nomeOriginal || 'Tópico').trim();
        const novoTopico = {
          id: topicoId,
          discipline_id: disciplinaId,
          name: nomeTopico,
          status: STATUS_TOPICO.NAO_ESTUDADO,
          createdAt: agora,
          updated_at: agora,
          user_id: userId,
          isDeleted: false,
          order: proximaOrdem++,
        };
        reportar(`Criando tópico "${nomeTopico}"...`);
        await db.topics.insert(novoTopico);
        await salvarNaNuvem('topics', novoTopico);
        topicosCriados++;
        passosFeitos++;
      }

      for (let j = 0; j < t.arquivoIds.length; j++) {
        reportar(
          `Copiando PDF ${j + 1} de ${t.arquivoIds.length} (${t.nomeOriginal})...`
        );
        const ok = await copiarArquivo(t.arquivoIds[j], topicoId, nomeDisciplinaFinal, userId);
        if (ok) arquivosCopiados++;
        else arquivosComFalha++;
        passosFeitos++;
      }
    }

    reportar('Concluído!');
    return { success: true, disciplinaId, topicosCriados, arquivosCopiados, arquivosComFalha };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar conteúdo:', e);
    return { success: false, topicosCriados, arquivosCopiados, arquivosComFalha, error: e?.message || 'Erro ao copiar.' };
  }
}

// Wrapper de compatibilidade — copia disciplina inteira (criando nova)
export async function copiarDisciplinaParaMinhaConta(
  nomeDisciplina: string,
  topicos: TopicoParaCopiar[],
  userId: string,
  onProgresso?: OnProgresso
): Promise<ResultadoCopiaDisciplina> {
  return copiarTopicosParaDisciplina(
    userId,
    null,
    nomeDisciplina,
    topicos.map((t) => ({
      nomeOriginal: t.nome,
      arquivoIds: t.arquivoIds,
      topicoDestinoId: null,
    })),
    onProgresso
  );
}

// ============================================================
// COPIAR LISTA — aceita destino (disciplina + pasta)
// ============================================================
export async function copiarListaParaMinhaConta(
  listaId: string,
  userId: string,
  onProgresso?: OnProgresso,
  destino?: DestinoLista
): Promise<ResultadoCopiaLista> {
  if (!userId) return { success: false, questoesCopiadas: 0, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, questoesCopiadas: 0, error: 'Você está offline.' };
  }

  try {
    const db: any = await getDb();
    const agora = new Date().toISOString();

    const listaDoc = await db.listas.findOne({ selector: { id: listaId } }).exec();
    if (!listaDoc) return { success: false, questoesCopiadas: 0, error: 'Lista não encontrada.' };
    const lista = listaDoc.toJSON();

    onProgresso?.({ current: 0, total: 1, label: 'Preparando...' });

    // Disciplina de destino
    let disciplinaDestinoId: string;
    if (destino?.disciplinaId) {
      disciplinaDestinoId = destino.disciplinaId;
    } else if (destino?.nomeNovaDisciplina) {
      disciplinaDestinoId = uid();
      const novaDisc = {
        id: disciplinaDestinoId,
        name: destino.nomeNovaDisciplina,
        user_id: userId,
        createdAt: agora,
        updated_at: agora,
        isDeleted: false,
      };
      await db.disciplines.insert(novaDisc);
      await salvarNaNuvem('disciplines', novaDisc);
    } else {
      const discDoc = await db.disciplines.findOne({
        selector: { user_id: userId, name: 'Listas Importadas' },
      }).exec();
      if (discDoc) {
        disciplinaDestinoId = discDoc.id;
      } else {
        disciplinaDestinoId = uid();
        const novaDisc = {
          id: disciplinaDestinoId,
          name: 'Listas Importadas',
          user_id: userId,
          createdAt: agora,
          updated_at: agora,
          isDeleted: false,
        };
        await db.disciplines.insert(novaDisc);
        await salvarNaNuvem('disciplines', novaDisc);
      }
    }

    // Cria a nova lista
    const novaListaId = uid();
    const novaLista = {
      ...lista,
      id: novaListaId,
      user_id: userId,
      discipline_id: disciplinaDestinoId,
      folder_id: destino?.folderId ?? null,
      titulo: `${lista.titulo} (Cópia)`,
      created_at: agora,
      updated_at: agora,
      isdeleted: false,
    };
    await db.listas.insert(novaLista);
    await salvarNaNuvem('listas', novaLista);

    // Copia questões
    const vinculos = await db.listas_questoes.find({ selector: { lista_id: listaId } }).exec();
    const totalQuestoes = vinculos.length;
    let copiadas = 0;

    for (let i = 0; i < vinculos.length; i++) {
      const v = vinculos[i].toJSON();
      onProgresso?.({
        current: i,
        total: Math.max(totalQuestoes, 1),
        label: `Copiando questão ${i + 1} de ${totalQuestoes}...`,
      });

      const qDoc = await db.questoes_lista.findOne({ selector: { id: v.questao_id } }).exec();
      if (!qDoc) continue;
      const q = qDoc.toJSON();

      let novaImagemUrl = q.imagem_url;
      if (q.imagem_url) {
        novaImagemUrl = await copiarImagemQuestao(q.imagem_url, userId);
      }

      const novaQuestaoId = uid();
      const novaQuestao = {
        ...q,
        id: novaQuestaoId,
        user_id: userId,
        discipline_id: disciplinaDestinoId,
        imagem_url: novaImagemUrl,
        created_at: agora,
        updated_at: agora,
      };
      await db.questoes_lista.insert(novaQuestao);
      await salvarNaNuvem('questoes_lista', novaQuestao);

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

    onProgresso?.({
      current: Math.max(totalQuestoes, 1),
      total: Math.max(totalQuestoes, 1),
      label: 'Concluído!',
    });
    return { success: true, listaId: novaListaId, questoesCopiadas: copiadas };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar lista:', e);
    return { success: false, questoesCopiadas: 0, error: e?.message || 'Erro ao copiar.' };
  }
}

// ============================================================
// COPIAR SIMULADO — só mudou tipo de progresso
// ============================================================
export async function copiarSimuladoParaMinhaConta(
  simuladoId: string,
  userId: string,
  onProgresso?: OnProgresso
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

    onProgresso?.({ current: 0, total: 1, label: 'Preparando...' });

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
    const total = qDocs.length;
    let copiadas = 0;

    for (let i = 0; i < qDocs.length; i++) {
      const q = qDocs[i].toJSON();
      onProgresso?.({
        current: i,
        total: Math.max(total, 1),
        label: `Copiando questão ${i + 1} de ${total}...`,
      });

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

    onProgresso?.({ current: Math.max(total, 1), total: Math.max(total, 1), label: 'Concluído!' });
    return { success: true, simuladoId: novoSimuladoId, questoesCopiadas: copiadas };
  } catch (e: any) {
    console.error('❌ [copiaConteudo] Erro ao copiar simulado:', e);
    return { success: false, questoesCopiadas: 0, error: e?.message || 'Erro ao copiar.' };
  }
}