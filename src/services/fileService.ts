// src/services/fileService.ts

import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { uid } from '@/utils/helpers';

const BUCKET_NAME = 'topic-files';

export interface FileRecord {
  id: string;
  user_id: string;
  disciplina: string;
  topico_id: string;
  nome: string;
  tipo: string;
  url: string;
  descricao?: string;
  created_at: string;
}

/**
 * Faz upload de um arquivo para o Supabase Storage e salva os metadados na tabela files
 * Agora usando cliente autenticado com token do Clerk
 */
export async function uploadFile(
  file: File,
  topicoId: string,
  disciplinaNome: string,
  userId: string,
  descricao?: string
): Promise<FileRecord | null> {
  try {
    // 1. Obter cliente autenticado
    const supabase = await getSupabaseWithToken();

    // 2. Gerar nome único para o arquivo no storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${uid()}.${fileExt}`;
    const filePath = `${userId}/${topicoId}/${fileName}`;

    // 3. Upload para o Supabase Storage
    const { error: uploadError, data } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Erro ao fazer upload:', uploadError);
      throw uploadError;
    }

    // 4. Obter URL pública do arquivo
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    // 5. Salvar metadados na tabela files
    const now = new Date().toISOString();
    const fileRecord: FileRecord = {
      id: uid(),
      user_id: userId,
      disciplina: disciplinaNome,
      topico_id: topicoId,
      nome: file.name,
      tipo: file.type || 'application/octet-stream',
      url: publicUrl,
      descricao: descricao || '',
      created_at: now,
    };

    const { error: dbError } = await supabase
      .from('files')
      .insert(fileRecord);

    if (dbError) {
      console.error('❌ Erro ao salvar metadados no Supabase:', dbError);
      // Tentar remover o arquivo do storage em caso de falha no banco
      await supabase.storage.from(BUCKET_NAME).remove([filePath]);
      throw dbError;
    }

    console.log('✅ Arquivo enviado com sucesso:', fileRecord);
    return fileRecord;

  } catch (error) {
    console.error('❌ Erro no upload do arquivo:', error);
    throw error;
  }
}

/**
 * Lista os arquivos de um tópico
 */
export async function listFilesByTopic(topicId: string, userId: string): Promise<FileRecord[]> {
  try {
    const supabase = await getSupabaseWithToken();
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('topico_id', topicId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao listar arquivos:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Erro ao listar arquivos:', error);
    return [];
  }
}

/**
 * Remove um arquivo (storage + banco)
 */
export async function deleteFile(fileId: string, filePath: string): Promise<void> {
  try {
    const supabase = await getSupabaseWithToken();

    // 1. Remover do storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (storageError) {
      console.error('❌ Erro ao remover arquivo do storage:', storageError);
      throw storageError;
    }

    // 2. Remover da tabela files
    const { error: dbError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      console.error('❌ Erro ao remover metadados do arquivo:', dbError);
      throw dbError;
    }

    console.log('✅ Arquivo removido com sucesso');
  } catch (error) {
    console.error('❌ Erro ao remover arquivo:', error);
    throw error;
  }
}