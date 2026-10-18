// src/services/copiaConteudoService.ts
//
// "Copiar para minha conta" — disciplinas, tópicos e PDFs compartilhados.
//
// Regras:
//  - Copia só o CONTEÚDO (disciplina, tópicos e arquivos). Grifos, notas,
//    progresso e status de estudo da dona NÃO são copiados.
//  - Cada PDF é baixado da URL pública e enviado de novo para a pasta de
//    quem copia (ID-da-usuária/ID-do-novo-tópico/arquivo). A cópia nunca
//    aponta para o arquivo da dona, então apagar o original dela não afeta
//    a sua cópia, e apagar a sua cópia não afeta o original.
//  - Tudo o que é criado pertence a quem copia (user_id dela).

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

// Mesmo padrão do conteudo.tsx: tenta gravar direto no Supabase e, se
// falhar (ex.: sem internet), deixa na fila para enviar depois.
async function salvarNaNuvem(tabela: string, registro: Record<string, any>): Promise<void> {
  try {
    const supabase = await getSupabaseWithToken();
    const { error } = await supabase.from(tabela).insert(registro);
    if (error) throw error;
  } catch {
    await enqueueOperation('create', tabela, registro);
  }
}

// Baixa o PDF da dona e envia de novo para a pasta de quem copia.
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

    // uploadFile envia ao Storage, grava na tabela `files` e devolve o registro novo.
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

export async function copiarDisciplinaParaMinhaConta(
  nomeDisciplina: string,
  topicos: TopicoParaCopiar[],
  userId: string,
  onProgresso?: (texto: string) => void
): Promise<ResultadoCopiaDisciplina> {
  const vazio = { topicosCriados: 0, arquivosCopiados: 0, arquivosComFalha: 0 };

  if (!userId) return { success: false, ...vazio, error: 'Usuária não autenticada.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      success: false,
      ...vazio,
      error: 'Você está offline. Copiar precisa de conexão com a internet.',
    };
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

    // 1) Disciplina nova, da usuária que copia
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

    // 2) Tópicos novos e, dentro de cada um, os PDFs copiados
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
    return {
      success: false,
      topicosCriados,
      arquivosCopiados,
      arquivosComFalha,
      error: e?.message || 'Erro ao copiar.',
    };
  }
}