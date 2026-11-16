// src/services/flashcardImageService.ts
// Serviço de upload e exclusão de imagens de flashcards com compressão client-side

import * as imageCompression from 'browser-image-compression';
import { getSupabaseWithToken } from '@/lib/supabaseClient';

const BUCKET_NAME = 'flashcard-images';
const MAX_WIDTH_OR_HEIGHT = 800;
const MAX_SIZE_MB = 0.5;

/**
 * Comprime a imagem e faz upload para o Supabase Storage
 * @param file - Arquivo de imagem (File object)
 * @param userId - ID do usuário (para organizar no bucket)
 * @returns URL pública da imagem
 */
export async function compressAndUploadImage(
  file: File,
  userId: string
): Promise<string> {
  // Validar tipo de arquivo
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Tipo de arquivo não suportado. Use PNG, JPEG ou WebP.');
  }

  // Configurações de compressão
  const options = {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
    useWebWorker: true,
    fileType: 'image/webp', // Converter para WebP para melhor compressão
    initialQuality: 0.8,
  };

  try {
    // Comprimir a imagem
    const compressedFile = await imageCompression.default(file, options);

    // Gerar nome único para o arquivo
    const fileName = `${userId}/flashcards/${crypto.randomUUID()}.webp`;

    // Obter cliente Supabase autenticado
    const supabaseClient = await getSupabaseWithToken();

    // Upload para o bucket
    const { data, error } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(fileName, compressedFile, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (error) {
      console.error('❌ Erro no upload da imagem:', error);
      throw new Error(`Falha no upload: ${error.message}`);
    }

    // Obter URL pública
    const { data: urlData } = supabaseClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    if (!urlData.publicUrl) {
      throw new Error('Não foi possível obter a URL pública da imagem');
    }

    console.log('✅ Imagem de flashcard enviada:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro desconhecido ao processar a imagem');
  }
}

/**
 * Exclui uma imagem do Supabase Storage
 * @param imageUrl - URL pública da imagem a ser excluída
 * @returns { success: boolean, error?: string }
 */
export async function deleteFlashcardImage(imageUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Extrair o path do arquivo da URL
    // URL format: https://<project>.supabase.co/storage/v1/object/public/flashcard-images/<path>
    const bucketMarker = `/${BUCKET_NAME}/`;
    const index = imageUrl.indexOf(bucketMarker);

    if (index === -1) {
      return { success: false, error: 'URL da imagem não reconhecida' };
    }

    const path = imageUrl.substring(index + bucketMarker.length);

    // Obter cliente Supabase autenticado
    const supabaseClient = await getSupabaseWithToken();

    // Excluir do bucket
    const { error } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) {
      console.error('❌ Erro ao excluir imagem:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Imagem de flashcard excluída:', path);
    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao excluir imagem:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Valida se um arquivo é uma imagem suportada
 */
export function isValidImageFile(file: File): boolean {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  return allowedTypes.includes(file.type);
}

/**
 * Formata o tamanho do arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}