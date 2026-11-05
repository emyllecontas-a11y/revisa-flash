// src/services/r2StorageService.ts
import { AwsClient } from 'aws4fetch';

const R2_ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = import.meta.env.VITE_R2_BUCKET_NAME;
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL;

// Validação básica para avisar se faltar variável
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.warn('⚠️ Variáveis de ambiente do R2 não estão completamente configuradas.');
}

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
    const nomeArquivo = `${userId}/${Date.now()}_${nomeOriginal}`;
    const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${nomeArquivo}`;
    
    // Garante que o Content-Type seja o mais específico possível
    const contentType = blob.type || 'image/png'; 

    console.log(`📤 Tentando upload para R2: ${url} (${contentType})`);

    const res = await aws.fetch(url, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (!res.ok) {
      // 🔥 IMPRIME O ERRO REAL DO R2 NO CONSOLE
      const erroTexto = await res.text();
      console.error(`❌ Erro no upload R2 (HTTP ${res.status}):`, erroTexto);
      return null;
    }

    console.log(`✅ Upload R2 concluído com sucesso: ${nomeArquivo}`);
    return `${R2_PUBLIC_URL}/${nomeArquivo}`;
  } catch (e: any) {
    console.error('❌ Falha de rede/criptografia ao subir imagem para R2:', e);
    return null;
  }
}