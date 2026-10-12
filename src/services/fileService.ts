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
  storage_path?: string;
  descricao?: string;
  created_at: string;
}

/**
 * Faz upload de um arquivo para o Supabase Storage e salva os metadados
 * na tabela `files`.
 *
 * Guardamos também o `storage_path` (o caminho no bucket), para que a
 * remoção posterior não dependa de reconstruir o caminho a partir da URL.
 */
export async function uploadFile(
  file: File,
  topicoId: string,
  disciplinaNome: string,
  userId: string,
  descricao?: string
): Promise<FileRecord | null> {
  try {
    const supabase = await getSupabaseWithToken();

    const fileExt = file.name.split('.').pop();
    const fileName = `${uid()}.${fileExt}`;
    const filePath = `${userId}/${topicoId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Erro ao fazer upload:', uploadError);
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    const now = new Date().toISOString();
    const fileRecord: FileRecord = {
      id: uid(),
      user_id: userId,
      disciplina: disciplinaNome,
      topico_id: topicoId,
      nome: file.name,
      tipo: file.type || 'application/octet-stream',
      url: publicUrl,
      storage_path: filePath,
      descricao: descricao || '',
      created_at: now,
    };

    const { error: dbError } = await supabase
      .from('files')
      .insert(fileRecord);

    if (dbError) {
      console.error('❌ Erro ao salvar metadados no Supabase:', dbError);
      // Rollback: remove o arquivo do storage se o insert falhou
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
 * Lista os arquivos de um tópico.
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
 * Busca um arquivo específico pelo ID.
 */
export async function getFileById(fileId: string, userId: string): Promise<FileRecord | null> {
  try {
    const supabase = await getSupabaseWithToken();
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar arquivo:', error);
      return null;
    }

    return data as FileRecord | null;
  } catch (error) {
    console.error('❌ Erro ao buscar arquivo:', error);
    return null;
  }
}

/**
 * Remove um arquivo (storage + banco).
 */
export async function deleteFile(fileId: string, filePath: string): Promise<void> {
  try {
    const supabase = await getSupabaseWithToken();

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (storageError) {
      console.error('❌ Erro ao remover arquivo do storage:', storageError);
      throw storageError;
    }

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

/**
 * Reconstrói o `storage_path` a partir de um FileRecord.
 * Prioriza o campo `storage_path` (novo). Se não existir — porque o
 * arquivo foi enviado antes desta correção —, tenta extrair da URL.
 */
export function resolveStoragePath(file: FileRecord): string {
  if (file.storage_path) return file.storage_path;
  try {
    const match = file.url.match(/\/topic-files\/([^?]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch { /* ignore */ }
  return '';
}