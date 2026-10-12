// src/services/pdfCache.ts
// Cache local de PDFs (binário) em IndexedDB via Dexie.
// Fica separado do RxDB porque blobs grandes não combinam com o schema
// orientado a documentos do RxDB.

import Dexie, { Table } from 'dexie';

export interface CachedPdf {
  fileId: string;      // chave primária
  blob: Blob;          // binário do PDF
  nome: string;        // nome original, para exibir na UI
  size: number;        // tamanho em bytes
  cachedAt: string;    // ISO
}

// Limite de tamanho por arquivo — evita travar o navegador com PDFs gigantes.
// 100 MB cobre a maioria dos materiais de estudo.
const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024;

class PdfCacheDatabase extends Dexie {
  pdfs!: Table<CachedPdf, string>;

  constructor() {
    super('revisaflash_pdf_cache');
    this.version(1).stores({
      // fileId é a chave primária; cachedAt indexado para ordenação/limpeza.
      pdfs: 'fileId, cachedAt',
    });
  }
}

let dbInstance: PdfCacheDatabase | null = null;

function getPdfDb(): PdfCacheDatabase {
  if (!dbInstance) {
    dbInstance = new PdfCacheDatabase();
  }
  return dbInstance;
}

/**
 * Garante que o PDF de `fileId` está cacheado localmente.
 * Se já estiver, não faz nada. Se não, baixa da `url` e salva.
 * Retorna um objeto com o resultado:
 *   - { cached: true }                       → tudo certo
 *   - { cached: false, reason: 'size' }      → arquivo maior que o limite
 *   - { cached: false, reason: 'quota' }     → sem espaço no navegador
 *   - { cached: false, reason: 'network' }   → falha ao baixar
 *   - { cached: false, reason: string }      → outro erro
 */
export async function ensureCached(
  fileId: string,
  url: string,
  nome: string
): Promise<{ cached: boolean; reason?: string }> {
  try {
    const db = getPdfDb();
    const existing = await db.pdfs.get(fileId);
    if (existing) return { cached: true };

    const response = await fetch(url);
    if (!response.ok) {
      return { cached: false, reason: `HTTP ${response.status}` };
    }

    const blob = await response.blob();

    if (blob.size > MAX_PDF_SIZE_BYTES) {
      console.warn(`[pdfCache] PDF ${fileId} tem ${(blob.size / 1024 / 1024).toFixed(1)}MB, acima do limite.`);
      return { cached: false, reason: 'size' };
    }

    await db.pdfs.put({
      fileId,
      blob,
      nome,
      size: blob.size,
      cachedAt: new Date().toISOString(),
    });

    console.log(`[pdfCache] PDF cacheado: ${nome} (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
    return { cached: true };
  } catch (err: any) {
    // Erro de quota é comum quando o navegador está cheio.
    const name = String(err?.name || '');
    if (name === 'QuotaExceededError' || String(err?.message || '').includes('quota')) {
      console.warn('[pdfCache] Sem espaço no navegador para cachear o PDF.');
      return { cached: false, reason: 'quota' };
    }
    console.warn('[pdfCache] Falha ao baixar/cachear o PDF:', err);
    return { cached: false, reason: 'network' };
  }
}

export async function hasPdfBlob(fileId: string): Promise<boolean> {
  try {
    const db = getPdfDb();
    const count = await db.pdfs.where('fileId').equals(fileId).count();
    return count > 0;
  } catch {
    return false;
  }
}

export async function getPdfBlob(fileId: string): Promise<Blob | null> {
  try {
    const db = getPdfDb();
    const entry = await db.pdfs.get(fileId);
    return entry?.blob || null;
  } catch {
    return null;
  }
}

export async function deletePdfBlob(fileId: string): Promise<void> {
  try {
    const db = getPdfDb();
    await db.pdfs.delete(fileId);
  } catch { /* ignore */ }
}

export async function listCachedPdfIds(): Promise<string[]> {
  try {
    const db = getPdfDb();
    const all = await db.pdfs.toArray();
    return all.map((p) => p.fileId);
  } catch {
    return [];
  }
}

export async function listCachedPdfs(): Promise<CachedPdf[]> {
  try {
    const db = getPdfDb();
    return await db.pdfs.toArray();
  } catch {
    return [];
  }
}

export async function getTotalCacheSize(): Promise<number> {
  try {
    const db = getPdfDb();
    const all = await db.pdfs.toArray();
    return all.reduce((sum, p) => sum + (p.size || 0), 0);
  } catch {
    return 0;
  }
}

export async function clearPdfCache(): Promise<void> {
  try {
    const db = getPdfDb();
    await db.pdfs.clear();
  } catch { /* ignore */ }
}