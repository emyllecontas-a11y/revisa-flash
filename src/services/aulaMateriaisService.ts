// src/services/aulaMateriaisService.ts
// Serviço de Material de Apoio (PDFs por aula).
// Upload/remoção no Supabase Storage (bucket privado aula-materiais),
// metadados no RxDB (coleção aula_materiais) e tabela Supabase aula_materiais.
// Cache offline via pdfCache (IndexedDB/Dexie).

import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { getDb } from "@/lib/db";
import { enqueueOperation } from "@/services/queueService";
import { deletePdfBlob } from "@/services/pdfCache";
import { uid } from "@/utils/helpers";
import { AULA_MATERIAIS } from "@/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AulaMaterial {
  id: string;
  user_id: string;
  aula_id: string;
  nome: string;
  storage_path: string;
  tamanho: number;
  mime: string;
  created_at: string;
  updated_at: string;
}

/**
 * Faz upload de um PDF para o bucket privado 'aula-materiais' usando URL assinada de upload,
 * grava metadados no Supabase (tabela aula_materiais) e no RxDB.
 * Valida tipo (application/pdf) e tamanho (máx. 50 MB).
 * O token da URL assinada tem validade própria e NÃO depende do token do Clerk durante o upload.
 */
export async function uploadMaterial(
  aulaId: string,
  file: File,
  userId: string,
): Promise<AulaMaterial> {
  const inicioTotal = Date.now();

  // Validações
  if (file.type !== AULA_MATERIAIS.MIME_TYPE) {
    throw new Error(`Tipo de arquivo inválido. Use apenas PDF (application/pdf).`);
  }

  if (file.size > AULA_MATERIAIS.MAX_SIZE_BYTES) {
    throw new Error(
      `Arquivo muito grande. O limite é ${AULA_MATERIAIS.MAX_SIZE_MB} MB. ` +
        `Este arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
    );
  }

  // 1. Cliente com token NOVO para criar a URL assinada de upload
  let supabase: SupabaseClient;
  try {
    supabase = await getSupabaseWithToken();
  } catch (err) {
    console.error("❌ Falha ao obter cliente autenticado:", err);
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }

  // Caminho: ${userId}/${aulaId}/${uid()}.pdf
  const fileId = uid();
  const storagePath = `${userId}/${aulaId}/${fileId}.pdf`;

  // 2. Cria URL assinada de UPLOAD (token tem validade própria, não depende do token do Clerk durante o upload)
  let uploadToken: string;
  const inicioSignedUrl = Date.now();
  try {
    const { data, error: signedUrlError } = await supabase.storage
      .from(AULA_MATERIAIS.BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedUrlError) {
      console.error("❌ Erro ao criar URL assinada de upload:", signedUrlError);
      throw new Error(`Falha ao preparar envio: ${signedUrlError.message}`);
    }

    uploadToken = data?.token;
    if (!uploadToken) {
      throw new Error("Falha ao obter token de upload assinado.");
    }
    console.info(
      `[aulaMateriais] URL assinada criada em ${((Date.now() - inicioSignedUrl) / 1000).toFixed(2)} s`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao criar URL de upload.";
    console.error("❌ Erro ao criar URL assinada de upload:", err);
    throw new Error(msg);
  }

  // 3. Faz upload usando a URL assinada (NÃO usa o token do Clerk)
  try {
    const { error: uploadError } = await supabase.storage
      .from(AULA_MATERIAIS.BUCKET)
      .uploadToSignedUrl(storagePath, uploadToken, file, {
        contentType: "application/pdf",
      });

    if (uploadError) {
      console.error("❌ Erro no upload para URL assinada:", uploadError);
      throw new Error(`Falha no envio do arquivo: ${uploadError.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido no upload.";
    console.error("❌ Erro no upload do arquivo:", err);
    throw new Error(msg);
  }

  // 4. Cliente com token NOVO para gravar metadados (e para rollback se falhar)
  let supabaseForDb: SupabaseClient;
  try {
    supabaseForDb = await getSupabaseWithToken();
  } catch (err) {
    console.error("❌ Falha ao obter cliente autenticado para gravar metadados:", err);
    // Rollback: tenta remover o arquivo que foi enviado
    try {
      const cleanupClient = await getSupabaseWithToken();
      await cleanupClient.storage.from(AULA_MATERIAIS.BUCKET).remove([storagePath]);
    } catch {
      /* ignore rollback error */
    }
    throw new Error("Sessão expirada ao gravar metadados. Faça login novamente.");
  }

  // Metadados
  const now = new Date().toISOString();
  const material: AulaMaterial = {
    id: fileId,
    user_id: userId,
    aula_id: aulaId,
    nome: file.name,
    storage_path: storagePath,
    tamanho: file.size,
    mime: file.type,
    created_at: now,
    updated_at: now,
  };

  // 5. Grava no Supabase (tabela aula_materiais)
  const { error: dbError } = await supabaseForDb.from(AULA_MATERIAIS.COLECAO).insert(material);

  if (dbError) {
    console.error("❌ Erro ao salvar metadados no Supabase:", dbError);
    // Rollback: remove o arquivo do storage usando cliente com token novo
    try {
      const rollbackClient = await getSupabaseWithToken();
      await rollbackClient.storage.from(AULA_MATERIAIS.BUCKET).remove([storagePath]);
    } catch (rollbackErr) {
      console.error("❌ Falha no rollback (remoção do arquivo):", rollbackErr);
    }
    throw new Error(`Falha ao gravar metadados: ${dbError.message}`);
  }

  // 6. Grava no RxDB (para leitura offline)
  try {
    const db = await getDb();
    const col = db.collections.aula_materiais;
    if (col) {
      await col.insert(material);
    }
  } catch (rxErr) {
    console.warn("⚠️ [aulaMateriais] Falha ao gravar no RxDB (offline?):", rxErr);
  }

  console.info(
    `[aulaMateriais] upload concluído em ${((Date.now() - inicioTotal) / 1000).toFixed(2)} s`,
  );
  console.log("✅ Material de apoio enviado:", material);
  return material;
}

/**
 * Remove um material: apaga da tabela Supabase, do Storage, do RxDB e do cache offline.
 * Ordem: Supabase → Storage → RxDB → Cache.
 * Se falhar no Supabase, lança erro e NÃO apaga nada localmente.
 * Se o delete no Supabase der certo e SÓ a remoção no Storage falhar, NÃO lança erro:
 * faz console.warn com o storage_path e continua removendo do RxDB e do cache do PDF.
 * Usa cliente com token NOVO antes de cada chamada remota.
 */
export async function removeMaterial(
  materialId: string,
  storagePath: string,
  userId: string,
): Promise<void> {
  // 1. Cliente com token NOVO para remover da tabela Supabase
  let supabase: SupabaseClient;
  try {
    supabase = await getSupabaseWithToken();
  } catch (err) {
    console.error("❌ Falha ao obter cliente autenticado:", err);
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }

  // Remove da tabela Supabase (primeiro, para validar permissão e existência)
  const { error: dbError } = await supabase
    .from(AULA_MATERIAIS.COLECAO)
    .delete()
    .eq("id", materialId)
    .eq("user_id", userId); // Garante que só o dono apaga

  if (dbError) {
    console.error("❌ Erro ao remover metadados do Supabase:", dbError);
    throw new Error(`Falha ao remover no servidor: ${dbError.message}`);
  }

  // 2. Cliente com token NOVO para remover do Storage
  let storageClient: SupabaseClient | null = null;
  try {
    storageClient = await getSupabaseWithToken();
  } catch (err) {
    console.error("❌ Falha ao obter cliente autenticado para storage:", err);
    // Não lança erro aqui - o Supabase já removeu os metadados
    // Apenas avisa que a limpeza do storage pode não ter acontecido
    console.warn(
      "⚠️ [aulaMateriais] Token expirado ao tentar limpar storage. " +
        "Arquivo pode permanecer órfão.",
    );
  }

  if (storageClient) {
    const { error: storageError } = await storageClient.storage
      .from(AULA_MATERIAIS.BUCKET)
      .remove([storagePath]);

    if (storageError) {
      console.warn(
        "⚠️ [aulaMateriais] Falha ao remover arquivo do storage (storage_path:",
        storagePath,
        "):",
        storageError,
      );
      // Não lança erro - continua para limpar localmente
    }
  }

  // 3. Remove do RxDB (agora que o remoto deu certo)
  try {
    const db = await getDb();
    const col = db.collections.aula_materiais;
    if (col) {
      const doc = await col.findOne({ selector: { id: materialId } }).exec();
      if (doc) {
        await doc.remove();
      }
    }
  } catch (rxErr) {
    console.warn("⚠️ [aulaMateriais] Falha ao remover do RxDB (offline?):", rxErr);
    // Não lança erro - o pull propagará a exclusão depois
  }

  // 4. Remove do cache offline (pdfCache)
  try {
    await deletePdfBlob(materialId);
  } catch (cacheErr) {
    console.warn("⚠️ [aulaMateriais] Falha ao remover do cache offline:", cacheErr);
  }

  // 5. Enfileira sync (redundância)
  try {
    await enqueueOperation("delete", AULA_MATERIAIS.COLECAO, { id: materialId });
  } catch {
    /* ignore */
  }

  console.log("✅ Material removido com sucesso");
}

/**
 * Gera URL assinada para download de um material privado.
 * Válida por 1 hora.
 * Com `downloadName`, o Supabase responde com Content-Disposition: attachment,
 * o que faz o navegador baixar com esse nome em vez de abrir na aba.
 */
export async function getMaterialUrl(
  storagePath: string,
  downloadName?: string,
): Promise<string | null> {
  try {
    const supabase = await getSupabaseWithToken();
    const { data, error } = await supabase.storage
      .from(AULA_MATERIAIS.BUCKET)
      .createSignedUrl(storagePath, 3600, downloadName ? { download: downloadName } : undefined); // 1 hora

    if (error) {
      console.error("❌ Erro ao gerar URL assinada:", error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error("❌ Erro ao gerar URL assinada:", error);
    return null;
  }
}

/**
 * Lista materiais de uma aula (do RxDB para offline, com fallback para Supabase).
 * Material de apoio é compartilhado: traz os de qualquer autor. O userId ficou só por compatibilidade.
 */
export async function getMateriaisByAula(aulaId: string, _userId?: string): Promise<AulaMaterial[]> {
  try {
    // Tenta do RxDB primeiro (offline-first)
    const db = await getDb();
    const col = db.collections.aula_materiais;
    if (col) {
      const docs = await col
        .find({
          selector: {
            aula_id: aulaId,
          },
        })
        .exec();
      if (docs.length > 0) {
        return docs.map((d) => d.toJSON() as unknown as AulaMaterial);
      }
    }
  } catch (rxErr) {
    console.warn("⚠️ [aulaMateriais] Falha ao ler do RxDB:", rxErr);
  }

  // Fallback: Supabase
  try {
    const supabase = await getSupabaseWithToken();
    const { data, error } = await supabase
      .from(AULA_MATERIAIS.COLECAO)
      .select("*")
      .eq("aula_id", aulaId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Erro ao buscar materiais no Supabase:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("❌ Erro ao buscar materiais:", error);
    return [];
  }
}
