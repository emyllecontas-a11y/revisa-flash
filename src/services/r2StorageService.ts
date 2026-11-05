// src/services/r2StorageService.ts
import { AwsClient } from 'aws4fetch';

const R2_ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = import.meta.env.VITE_R2_BUCKET_NAME;
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL;

// Cliente AWS para assinar as requisições para o R2
const aws = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export async function uploadImagemR2(
  blob: Blob,
  nomeOriginal: string,
  userId: string
): Promise<string | null> {
  try {
    // Cria um nome único para o arquivo
    const nomeArquivo = `${userId}/${Date.now()}_${nomeOriginal}`;
    const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${nomeArquivo}`;

    const res = await aws.fetch(url, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
      },
    });

    if (!res.ok) {
      console.error('Erro no upload R2:', await res.text());
      return null;
    }

    // Retorna a URL pública da imagem
    return `${R2_PUBLIC_URL}/${nomeArquivo}`;
  } catch (e) {
    console.error('Falha ao subir imagem para R2:', e);
    return null;
  }
}