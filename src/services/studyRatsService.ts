// src/services/studyRatsService.ts
//
// Study Rats — feed estilo Instagram da aba Comunidade.
// Regras centrais (Fase 1 aprovada):
//  * Só a própria usuária e amizades aceitas veem posts/fotos/stories (RLS + RPCs).
//  * O RxDB é apenas cache de LEITURA dos check-ins da própria usuária; este serviço
//    nunca enfileira escrita offline. Publicar exige internet.
//  * Só se publica pela Comunidade. O calendário apenas lê os check-ins.
//  * Fotos ficam no bucket privado 'study-rats' e são lidas por URL assinada.

import * as imageCompression from 'browser-image-compression';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { STUDY_RATS } from '@/constants';
import { uid } from '@/utils/helpers';
import { localDateStr, localMonthRange, localTimeStr } from '@/utils/date';
import { invalidateStudyFeedCache } from '@/hooks/useStudyRats';
import type {
  CreatedStudyPost,
  CreateStudyPostInput,
  StudyAuthor,
  StudyCalendarEntry,
  StudyCategory,
  StudyComment,
  StudyFeedCursor,
  StudyFeedPage,
  StudyFeedParams,
  StudyPhoto,
  StudyPost,
  StudyPostKind,
  StudyProfileStats,
  StudyStory,
  StudyStoryViewer,
  UpdateStudyPostInput,
} from '@/types/studyRats';

// ============================================================
// ERROS AMIGÁVEIS
// ============================================================

export class StudyRatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudyRatsError';
  }
}

/** Transforma qualquer erro em uma frase pronta para a tela. */
export function studyRatsErrorMessage(error: unknown): string {
  if (error instanceof StudyRatsError) return error.message;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sem conexão com a internet. Conecte-se e tente de novo.';
  }
  const msg = error instanceof Error ? error.message : '';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Não foi possível conectar. Verifique a internet e tente de novo.';
  }
  if (/não autenticado|jwt|unauthorized/i.test(msg)) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  return 'Algo deu errado. Tente novamente em instantes.';
}

function fail(message: string, cause?: unknown): StudyRatsError {
  if (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.warn(`⚠️ [studyRats] ${message} (${detail})`);
  }
  return new StudyRatsError(message);
}

function assertOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new StudyRatsError(
      'Sem conexão com a internet. Conecte-se para publicar — o que você digitou continua aqui.',
    );
  }
}

/** Id da usuária salvo no navegador; devolve null quando ainda não há sessão. */
export function getCachedUserId(): string | null {
  try {
    const cached = localStorage.getItem('revisaflash_user_id');
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  return null;
}

function getCurrentUserId(): string {
  const cached = getCachedUserId();
  if (cached) return cached;
  const clerkId = (window as any)?.Clerk?.user?.id;
  if (typeof clerkId === 'string' && clerkId) return clerkId;
  throw new StudyRatsError('Sua sessão expirou. Entre novamente.');
}

// ============================================================
// URLs ASSINADAS (cache em memória com renovação antes de expirar)
// ============================================================

interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlEntry>();
const SIGNED_URL_TTL = STUDY_RATS.LIMITES.URL_ASSINADA_SEGUNDOS;
const SIGNED_URL_RENEW = STUDY_RATS.LIMITES.URL_ASSINADA_RENOVAR_SEGUNDOS;

/**
 * Devolve URLs assinadas para as fotos informadas. Não lança erro: fotos que
 * falharem ficam sem URL (a interface mostra um placeholder).
 */
export async function getSignedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((p): p is string => typeof p === 'string' && p.length > 0)),
  );
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const now = Date.now();
  const pending: string[] = [];

  for (const path of unique) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - now > SIGNED_URL_RENEW * 1000) {
      result.set(path, cached.url);
    } else {
      pending.push(path);
    }
  }

  if (pending.length > 0) {
    try {
      const supabase = await getSupabaseWithToken();
      for (let i = 0; i < pending.length; i += 100) {
        const chunk = pending.slice(i, i + 100);
        const { data, error } = await supabase.storage
          .from(STUDY_RATS.BUCKET)
          .createSignedUrls(chunk, SIGNED_URL_TTL);
        if (error) {
          console.warn('⚠️ [studyRats] Não foi possível assinar fotos agora.');
          continue;
        }
        for (const item of (data ?? []) as Array<{ path?: string; signedUrl?: string; error?: string }>) {
          if (!item.signedUrl || !item.path) continue;
          signedUrlCache.set(item.path, {
            url: item.signedUrl,
            expiresAt: now + SIGNED_URL_TTL * 1000,
          });
          result.set(item.path, item.signedUrl);
        }
      }
    } catch (error) {
      console.warn(
        '⚠️ [studyRats] Falha ao gerar URLs assinadas:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Para as que falharam agora, aproveita o cache mesmo perto de expirar.
  for (const path of unique) {
    if (!result.has(path)) {
      const cached = signedUrlCache.get(path);
      if (cached) result.set(path, cached.url);
    }
  }

  return result;
}

// ============================================================
// NORMALIZAÇÃO DE DADOS DAS RPCs
// ============================================================

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapAuthor(row: any, prefix: 'author' = 'author'): StudyAuthor {
  return {
    id: String(row.out_user_id ?? ''),
    name: toStr(row[`out_${prefix}_name`]) ?? '',
    avatarUrl: toStr(row[`out_${prefix}_avatar_url`]),
    avatarTipo: toStr(row[`out_${prefix}_avatar_tipo`]),
    avatarId: toStr(row[`out_${prefix}_avatar_id`]),
    bio: toStr(row.out_author_bio),
  };
}

function mapPostRow(row: any, urls: Map<string, string>): StudyPost {
  const photos: StudyPhoto[] = Array.isArray(row.out_photos)
    ? row.out_photos.map((p: any) => {
        const path = String(p.photo_path ?? '');
        return {
          id: String(p.id ?? ''),
          path,
          position: toNumber(p.position),
          url: urls.get(path) ?? null,
        };
      })
    : [];

  return {
    id: String(row.out_id),
    userId: String(row.out_user_id ?? ''),
    kind:
      row.out_kind === STUDY_RATS.TIPOS.POST
        ? STUDY_RATS.TIPOS.POST
        : STUDY_RATS.TIPOS.CHECKIN,
    category: (toStr(row.out_category) as StudyCategory | null) ?? null,
    title: toStr(row.out_title),
    caption: toStr(row.out_caption),
    subject: toStr(row.out_subject),
    durationMin: toNumber(row.out_duration_min),
    studyDate: toStr(row.out_study_date),
    studyTime: toStr(row.out_study_time),
    inFeed: row.out_in_feed === true,
    createdAt: String(row.out_created_at ?? new Date().toISOString()),
    author: mapAuthor(row),
    likesCount: toNumber(row.out_likes_count),
    commentsCount: toNumber(row.out_comments_count),
    likedByMe: row.out_liked_by_me === true,
    savedByMe: row.out_saved_by_me === true,
    friendLikerId: toStr(row.out_friend_liker_id),
    friendLikerName: toStr(row.out_friend_liker_name),
    photos,
  };
}

// ============================================================
// FEED
// ============================================================

export async function getFeed({
  cursor = null,
  filter = {},
  pageSize = STUDY_RATS.LIMITES.PAGINA_FEED,
}: StudyFeedParams = {}): Promise<StudyFeedPage> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc(STUDY_RATS.RPC.FEED, {
    p_cursor_created: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
    p_kind: filter.kind ?? null,
    p_category: filter.category ?? null,
    p_author_id: filter.authorId ?? null,
    p_saved_only: filter.savedOnly === true,
  });

  if (error) {
    throw fail('Não foi possível carregar o feed agora.', error);
  }

  const rows = (data ?? []) as any[];
  const paths: string[] = [];
  for (const row of rows) {
    if (Array.isArray(row.out_photos)) {
      for (const photo of row.out_photos) {
        if (photo?.photo_path) paths.push(String(photo.photo_path));
      }
    }
  }

  const urls = await getSignedPhotoUrls(paths);
  const posts = rows.map((row) => mapPostRow(row, urls));
  const last = rows[rows.length - 1];

  return {
    posts,
    nextCursor:
      rows.length >= pageSize && last
        ? { createdAt: String(last.out_created_at), id: String(last.out_id) }
        : null,
  };
}

/** Publicações de uma pessoa (usa o feed paginado por cursor). */
export async function getProfilePosts(
  userId: string,
  kind?: StudyPostKind,
): Promise<StudyPost[]> {
  const all: StudyPost[] = [];
  let cursor: StudyFeedCursor | null = null;

  for (let page = 0; page < 20; page++) {
    const result = await getFeed({
      cursor,
      filter: { authorId: userId, kind },
      pageSize: 50,
    });
    all.push(...result.posts);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return all;
}

/** Itens salvos pela própria usuária. */
export async function getSavedPosts(): Promise<StudyPost[]> {
  const all: StudyPost[] = [];
  let cursor: StudyFeedCursor | null = null;

  for (let page = 0; page < 10; page++) {
    const result = await getFeed({
      cursor,
      filter: { savedOnly: true },
      pageSize: STUDY_RATS.LIMITES.PAGINA_FEED,
    });
    all.push(...result.posts);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return all;
}

// ============================================================
// CURTIDAS E SALVOS
// ============================================================

export async function toggleLike(
  postId: string,
  options: { onlyLike?: boolean } = {},
): Promise<{ liked: boolean }> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const { data: existing, error: selectError } = await supabase
    .from(STUDY_RATS.TABELAS.POST_LIKES)
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw fail('Não foi possível curtir agora.', selectError);
  }

  if (existing) {
    if (options.onlyLike) return { liked: true };
    const { error } = await supabase
      .from(STUDY_RATS.TABELAS.POST_LIKES)
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw fail('Não foi possível descurtir agora.', error);
    return { liked: false };
  }

  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.POST_LIKES)
    .insert({ post_id: postId, user_id: userId });

  // 23505 = já curtido em outra aba/dispositivo.
  if (error && (error as { code?: string }).code !== '23505') {
    throw fail('Não foi possível curtir agora.', error);
  }

  return { liked: true };
}

export async function toggleSave(postId: string): Promise<{ saved: boolean }> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const { data: existing, error: selectError } = await supabase
    .from(STUDY_RATS.TABELAS.POST_SAVES)
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw fail('Não foi possível salvar agora.', selectError);
  }

  if (existing) {
    const { error } = await supabase
      .from(STUDY_RATS.TABELAS.POST_SAVES)
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw fail('Não foi possível remover dos salvos agora.', error);
    return { saved: false };
  }

  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.POST_SAVES)
    .insert({ post_id: postId, user_id: userId });

  if (error && (error as { code?: string }).code !== '23505') {
    throw fail('Não foi possível salvar agora.', error);
  }

  return { saved: true };
}

// ============================================================
// COMENTÁRIOS
// ============================================================

export async function getComments(postId: string): Promise<StudyComment[]> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc(STUDY_RATS.RPC.POST_COMMENTS, {
    p_post_id: postId,
  });

  if (error) throw fail('Não foi possível carregar os comentários.', error);

  return ((data ?? []) as any[]).map((row) => ({
    id: String(row.out_id),
    postId: String(row.out_post_id),
    userId: String(row.out_user_id ?? ''),
    text: String(row.out_text ?? ''),
    createdAt: String(row.out_created_at ?? ''),
    author: {
      id: String(row.out_user_id ?? ''),
      name: toStr(row.out_author_name) ?? '',
      avatarUrl: toStr(row.out_author_avatar_url),
      avatarTipo: toStr(row.out_author_avatar_tipo),
      avatarId: toStr(row.out_author_avatar_id),
    },
  }));
}

export async function addComment(postId: string, text: string): Promise<StudyComment> {
  const userId = getCurrentUserId();
  const clean = text.trim();

  if (!clean) throw new StudyRatsError('Escreva um comentário antes de publicar.');
  if (clean.length > STUDY_RATS.LIMITES.MAX_COMENTARIO) {
    throw new StudyRatsError(
      `O comentário pode ter no máximo ${STUDY_RATS.LIMITES.MAX_COMENTARIO} caracteres.`,
    );
  }

  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase
    .from(STUDY_RATS.TABELAS.POST_COMMENTS)
    .insert({ post_id: postId, user_id: userId, text: clean })
    .select('id, post_id, user_id, text, created_at')
    .single();

  if (error || !data) throw fail('Não foi possível publicar o comentário.', error);

  return {
    id: String(data.id),
    postId: String(data.post_id),
    userId: String(data.user_id),
    text: String(data.text),
    createdAt: String(data.created_at),
    author: {
      id: String(data.user_id),
      name: '',
      avatarUrl: null,
      avatarTipo: null,
      avatarId: null,
    },
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await getSupabaseWithToken();
  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.POST_COMMENTS)
    .delete()
    .eq('id', commentId);

  if (error) throw fail('Não foi possível excluir o comentário.', error);
}

// ============================================================
// COMPRESSÃO E UPLOAD DAS FOTOS
// ============================================================

const ALLOWED_INPUT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ALLOWED_OUTPUT_TYPES = ['image/webp', 'image/jpeg'];
const BUCKET_MAX_BYTES = 2 * 1024 * 1024; // limite do bucket na migration

interface PreparedPhoto {
  blob: Blob;
  ext: 'webp' | 'jpg';
  contentType: string;
}

/**
 * Comprime a foto no cliente (reencodar já remove EXIF), mira WebP 1080 px / ≤ 0,8 MB.
 * Safari antigo pode devolver PNG — nesse caso reencoda como JPEG (extensão .jpg),
 * porque o bucket só aceita image/webp e image/jpeg.
 */
async function compressForUpload(file: File): Promise<PreparedPhoto> {
  if (!ALLOWED_INPUT_TYPES.includes(file.type)) {
    throw new StudyRatsError('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
  }

  const maxBytes = STUDY_RATS.LIMITES.MAX_ARQUIVO_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new StudyRatsError(
      `Cada foto pode ter no máximo ${STUDY_RATS.LIMITES.MAX_ARQUIVO_MB} MB.`,
    );
  }

  const options = {
    maxSizeMB: STUDY_RATS.LIMITES.IMAGEM_ALVO_MB,
    maxWidthOrHeight: STUDY_RATS.LIMITES.IMAGEM_MAX_PX,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  };

  let out: Blob;
  try {
    out = await imageCompression.default(file, options);
  } catch (error) {
    throw fail('Não foi possível preparar esta imagem. Tente outra foto.', error);
  }

  if (!ALLOWED_OUTPUT_TYPES.includes(out.type)) {
    try {
      out = await imageCompression.default(out, { ...options, fileType: 'image/jpeg' });
    } catch (error) {
      throw fail('Não foi possível preparar esta imagem. Tente outra foto.', error);
    }
  }

  const isWebp = out.type === 'image/webp';
  const isJpeg = out.type === 'image/jpeg';
  if (!isWebp && !isJpeg) {
    throw new StudyRatsError('Não foi possível preparar esta imagem. Tente outra foto.');
  }
  if (out.size > BUCKET_MAX_BYTES) {
    throw new StudyRatsError('A foto ficou grande demais. Escolha uma imagem menor.');
  }

  return {
    blob: out,
    ext: isWebp ? 'webp' : 'jpg',
    contentType: out.type,
  };
}

async function removeStorageFiles(supabase: any, paths: string[]): Promise<void> {
  const unique = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p)));
  if (unique.length === 0) return;

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { error } = await supabase.storage.from(STUDY_RATS.BUCKET).remove(chunk);
    if (error) {
      console.warn('⚠️ [studyRats] Não foi possível apagar arquivos do storage agora.');
    }
  }
}

// ============================================================
// CRIAR / EDITAR / APAGAR PUBLICAÇÃO
// ============================================================

function validateCreateInput(input: CreateStudyPostInput): void {
  const files = input.files ?? [];

  if (files.length > STUDY_RATS.LIMITES.MAX_FOTOS) {
    throw new StudyRatsError(
      `Você pode enviar no máximo ${STUDY_RATS.LIMITES.MAX_FOTOS} fotos.`,
    );
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      throw new StudyRatsError('Só é possível enviar imagens.');
    }
  }

  // Story guarda só um photo_path: mais de uma foto ficaria órfã no storage.
  if (
    input.destination === STUDY_RATS.DESTINOS.STORY &&
    input.kind === STUDY_RATS.TIPOS.POST &&
    files.length > 1
  ) {
    throw new StudyRatsError('O story aceita apenas 1 foto.');
  }

  if (input.kind === STUDY_RATS.TIPOS.CHECKIN) {
    if (files.length === 0) {
      throw new StudyRatsError('O check-in precisa de pelo menos uma foto.');
    }
    if (!input.subject || !input.subject.trim()) {
      throw new StudyRatsError('Escolha a matéria do check-in.');
    }
    const duration = Number(input.durationMin ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new StudyRatsError('Informe quanto tempo você estudou.');
    }
    if (duration > STUDY_RATS.LIMITES.MAX_DURACAO_MIN) {
      throw new StudyRatsError('A duração máxima é de 24 horas.');
    }
  }

  if (input.kind === STUDY_RATS.TIPOS.POST) {
    if (!input.caption || !input.caption.trim()) {
      throw new StudyRatsError('Escreva o texto da publicação.');
    }
    if (!input.category) {
      throw new StudyRatsError('Escolha uma categoria para a publicação.');
    }
    if ((input.caption ?? '').trim().length > STUDY_RATS.LIMITES.MAX_LEGENDA) {
      throw new StudyRatsError(
        `O texto pode ter no máximo ${STUDY_RATS.LIMITES.MAX_LEGENDA} caracteres.`,
      );
    }
  }
}

export async function createPost(input: CreateStudyPostInput): Promise<CreatedStudyPost> {
  assertOnline();
  validateCreateInput(input);

  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const destination = input.destination;
  const isCheckin = input.kind === STUDY_RATS.TIPOS.CHECKIN;
  const needsPost = destination === STUDY_RATS.DESTINOS.FEED || isCheckin;
  const needsStory = destination === STUDY_RATS.DESTINOS.STORY;

  const postId = uid();
  const storyId = uid();
  const folderId = needsPost ? postId : storyId;
  const files = input.files ?? [];
  const subject = input.subject?.trim() || null;
  const caption = input.caption?.trim() || null;
  const category = input.category ?? null;
  const durationMin = isCheckin ? Number(input.durationMin ?? 0) : 0;
  const studyDate = input.studyDate || localDateStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(studyDate) || studyDate > localDateStr()) {
    throw new StudyRatsError('Data inválida.');
  }
  const studyTime = localTimeStr();
  const title = isCheckin
    ? input.title?.trim() || (subject ? `Check-in de ${subject}` : 'Check-in de estudo')
    : input.title?.trim() || null;

  const uploaded: StudyPhoto[] = [];
  let postInserted = false;
  let storyInserted = false;

  try {
    // 1. Comprimir e subir as fotos (caminho: {userId}/{postId ou storyId}/{posição}.{ext})
    const prepared: PreparedPhoto[] = [];
    for (const file of files) {
      prepared.push(await compressForUpload(file));
    }

    for (let position = 0; position < prepared.length; position++) {
      const photo = prepared[position];
      const path = `${userId}/${folderId}/${position}.${photo.ext}`;
      const { error } = await supabase.storage
        .from(STUDY_RATS.BUCKET)
        .upload(path, photo.blob, { contentType: photo.contentType, upsert: false });

      if (error) {
        throw fail('Não foi possível enviar as fotos. Verifique a internet e tente de novo.', error);
      }

      uploaded.push({ id: uid(), path, position, url: null });
    }

    // 2. Inserir o post (check-in sempre; publicação normal só no feed)
    if (needsPost) {
      const postRow = {
        id: postId,
        user_id: userId,
        kind: input.kind,
        category: isCheckin ? null : category,
        title,
        caption,
        subject,
        duration_min: durationMin,
        study_date: isCheckin ? studyDate : null,
        study_time: isCheckin ? studyTime : null,
        in_feed: destination === STUDY_RATS.DESTINOS.FEED,
      };

      const { error } = await supabase.from(STUDY_RATS.TABELAS.POSTS).insert(postRow);
      if (error) throw fail('Não foi possível salvar a publicação.', error);
      postInserted = true;

      // 3. Inserir as fotos do post
      if (uploaded.length > 0) {
        const rows = uploaded.map((photo) => ({
          id: photo.id,
          post_id: postId,
          photo_path: photo.path,
          position: photo.position,
        }));
        const { error: photosError } = await supabase
          .from(STUDY_RATS.TABELAS.POST_PHOTOS)
          .insert(rows);
        if (photosError) throw fail('Não foi possível salvar as fotos da publicação.', photosError);
      }
    }

    // 4. Inserir o story por último (o banco usa expires_at = now() + 24h; não enviamos expires_at)
    if (needsStory) {
      const storyRow = {
        id: storyId,
        user_id: userId,
        kind: input.kind,
        category: isCheckin ? null : category,
        text: caption,
        photo_path: uploaded[0]?.path ?? null,
        subject,
        duration_min: durationMin,
        checkin_post_id: isCheckin ? postId : null,
      };

      const { error } = await supabase.from(STUDY_RATS.TABELAS.STORIES).insert(storyRow);
      if (error) throw fail('Não foi possível publicar o story.', error);
      storyInserted = true;
    }

    return {
      postId: needsPost ? postId : null,
      storyId: needsStory ? storyId : null,
      photos: uploaded,
      title: needsPost ? title : null,
      studyDate: isCheckin ? studyDate : null,
      studyTime: isCheckin ? studyTime : null,
      durationMin,
    };
  } catch (error) {
    // Desfaz o que já foi gravado (linhas e arquivos), sem perder o texto digitado.
    try {
      if (storyInserted) {
        const { error: storyDeleteError } = await supabase
          .from(STUDY_RATS.TABELAS.STORIES)
          .delete()
          .eq('id', storyId)
          .eq('user_id', userId);
        if (storyDeleteError) {
          console.warn('⚠️ [studyRats] Story da publicação falha pode ter ficado ativo.');
        }
      }
      if (postInserted) {
        // O Supabase não lança erro aqui: sem policy de DELETE o retorno é vazio.
        const { data: deleted, error: deleteError } = await supabase
          .from(STUDY_RATS.TABELAS.POSTS)
          .delete()
          .eq('id', postId)
          .eq('user_id', userId)
          .select('id');

        if (deleteError) {
          console.warn('⚠️ [studyRats] Não foi possível apagar o post da publicação falha.');
        }
        if (deleteError || !deleted || deleted.length === 0) {
          const { error: softDeleteError } = await supabase
            .from(STUDY_RATS.TABELAS.POSTS)
            .update({ is_deleted: true })
            .eq('id', postId)
            .eq('user_id', userId);
          if (softDeleteError) {
            console.warn('⚠️ [studyRats] Post da publicação falha pode ter ficado ativo.');
          }
        }
      }
    } catch (rollbackError) {
      console.warn(
        '⚠️ [studyRats] Falha ao desfazer linhas da publicação:',
        rollbackError instanceof Error ? rollbackError.message : rollbackError,
      );
    }

    if (uploaded.length > 0) {
      await removeStorageFiles(supabase, uploaded.map((photo) => photo.path));
    }

    if (error instanceof StudyRatsError) throw error;
    throw new StudyRatsError(studyRatsErrorMessage(error));
  }
}

export async function updatePost(
  postId: string,
  data: UpdateStudyPostInput,
): Promise<void> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title?.trim() || null;
  if (data.caption !== undefined) patch.caption = data.caption?.trim() || null;
  if (data.category !== undefined) patch.category = data.category ?? null;
  if (data.subject !== undefined) patch.subject = data.subject?.trim() || null;
  if (data.durationMin !== undefined) {
    const duration = Number(data.durationMin);
    if (!Number.isFinite(duration) || duration <= 0 || duration > STUDY_RATS.LIMITES.MAX_DURACAO_MIN) {
      throw new StudyRatsError('Duração inválida.');
    }
    patch.duration_min = duration;
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.POSTS)
    .update(patch)
    .eq('id', postId)
    .eq('user_id', userId);

  if (error) throw fail('Não foi possível salvar as alterações.', error);
}

/**
 * Soft delete da publicação + remoção do story vinculado + remoção dos arquivos.
 * O banco não apaga arquivos sozinho; sem isso eles ficariam órfãos no bucket.
 */
export async function deletePost(postId: string): Promise<void> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const { data: photos } = await supabase
    .from(STUDY_RATS.TABELAS.POST_PHOTOS)
    .select('photo_path')
    .eq('post_id', postId);

  const { data: stories } = await supabase
    .from(STUDY_RATS.TABELAS.STORIES)
    .select('id')
    .eq('checkin_post_id', postId)
    .eq('user_id', userId);

  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.POSTS)
    .update({ is_deleted: true })
    .eq('id', postId)
    .eq('user_id', userId);

  if (error) throw fail('Não foi possível excluir a publicação.', error);

  const storyIds = ((stories ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (storyIds.length > 0) {
    const { error: storyError } = await supabase
      .from(STUDY_RATS.TABELAS.STORIES)
      .delete()
      .eq('user_id', userId)
      .in('id', storyIds);
    if (storyError) {
      console.warn('⚠️ [studyRats] Story vinculado não foi removido agora.');
    }
  }

  const paths = ((photos ?? []) as Array<{ photo_path: string }>).map((p) => p.photo_path);
  if (paths.length > 0) {
    await removeStorageFiles(supabase, paths);
  }
}

// ============================================================
// STORIES
// ============================================================

export async function getStories(): Promise<StudyStory[]> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc(STUDY_RATS.RPC.STORIES_FEED);

  if (error) throw fail('Não foi possível carregar os stories.', error);

  const rows = (data ?? []) as any[];
  const paths = rows
    .map((row) => toStr(row.out_photo_path))
    .filter((p): p is string => !!p);
  const urls = await getSignedPhotoUrls(paths);

  return rows.map((row) => {
    const photoPath = toStr(row.out_photo_path);
    return {
      id: String(row.out_id),
      userId: String(row.out_user_id ?? ''),
      kind:
        row.out_kind === STUDY_RATS.TIPOS.POST
          ? STUDY_RATS.TIPOS.POST
          : STUDY_RATS.TIPOS.CHECKIN,
      category: (toStr(row.out_category) as StudyCategory | null) ?? null,
      text: toStr(row.out_text),
      photoPath,
      photoUrl: photoPath ? urls.get(photoPath) ?? null : null,
      subject: toStr(row.out_subject),
      durationMin: toNumber(row.out_duration_min),
      checkinPostId: toStr(row.out_checkin_post_id),
      createdAt: String(row.out_created_at ?? ''),
      expiresAt: String(row.out_expires_at ?? ''),
      viewedByMe: row.out_viewed_by_me === true,
      viewedCount: toNumber(row.out_viewed_count),
      author: {
        id: String(row.out_user_id ?? ''),
        name: toStr(row.out_author_name) ?? '',
        avatarUrl: toStr(row.out_author_avatar_url),
        avatarTipo: toStr(row.out_author_avatar_tipo),
        avatarId: toStr(row.out_author_avatar_id),
      },
    };
  });
}

// Re-export do hook para uso em componentes
export { invalidateStudyFeedCache } from '@/hooks/useStudyRats';

export async function markStoryViewed(storyId: string): Promise<void> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();

  const { error } = await supabase
    .from(STUDY_RATS.TABELAS.STORY_VIEWS)
    .upsert(
      { story_id: storyId, user_id: userId },
      { onConflict: 'story_id,user_id', ignoreDuplicates: true },
    );

  if (error) throw fail('Não foi possível marcar o story como visto.', error);
}

export async function getStoryViewers(storyId: string): Promise<StudyStoryViewer[]> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc(STUDY_RATS.RPC.STORY_VIEWERS, {
    p_story_id: storyId,
  });

  if (error) throw fail('Não foi possível carregar quem viu o story.', error);

  return ((data ?? []) as any[]).map((row) => ({
    userId: String(row.out_user_id ?? ''),
    viewedAt: String(row.out_viewed_at ?? ''),
    name: toStr(row.out_name) ?? '',
    avatarUrl: toStr(row.out_avatar_url),
    avatarTipo: toStr(row.out_avatar_tipo),
    avatarId: toStr(row.out_avatar_id),
  }));
}

/**
 * Limpa stories expirados da própria usuária.
 * Apaga no storage só os arquivos não compartilhados com um check-in e depois
 * remove as linhas via RPC. Roda em segundo plano; qualquer erro é ignorado.
 */
export async function cleanupExpiredStories(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    const supabase = await getSupabaseWithToken();
    const { data, error } = await supabase.rpc(STUDY_RATS.RPC.STORIES_EXPIRADOS);
    if (error || !Array.isArray(data) || data.length === 0) return;

    const rows = data as Array<{
      out_id: string;
      out_photo_path: string | null;
      out_foto_compartilhada: boolean;
    }>;

    const onlyStoryFiles = rows
      .filter((row) => row.out_foto_compartilhada === false && row.out_photo_path)
      .map((row) => row.out_photo_path as string);

    if (onlyStoryFiles.length > 0) {
      await removeStorageFiles(supabase, onlyStoryFiles);
    }

    const ids = rows.map((row) => row.out_id).filter(Boolean);
    if (ids.length > 0) {
      await supabase.rpc(STUDY_RATS.RPC.STORIES_APAGAR_EXPIRADOS, { p_ids: ids });
    }
  } catch (error) {
    console.warn(
      '⚠️ [studyRats] Limpeza de stories expirados ignorada:',
      error instanceof Error ? error.message : error,
    );
  }
}

// ============================================================
// PERFIL
// ============================================================

export async function getProfile(userId: string): Promise<StudyProfileStats | null> {
  const supabase = await getSupabaseWithToken();
  const { data, error } = await supabase.rpc(STUDY_RATS.RPC.PERFIL_RESUMO, {
    p_user_id: userId,
  });

  if (error) throw fail('Não foi possível carregar o perfil.', error);

  const row = ((data ?? []) as any[])[0];
  if (!row) return null;

  return {
    userId: String(row.out_user_id ?? userId),
    name: toStr(row.out_name) ?? '',
    bio: toStr(row.out_bio),
    avatarUrl: toStr(row.out_avatar_url),
    avatarTipo: toStr(row.out_avatar_tipo),
    avatarId: toStr(row.out_avatar_id),
    postsCount: toNumber(row.out_posts_count),
    hours: toNumber(row.out_hours),
  };
}

export async function updateBio(text: string): Promise<void> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();
  const bio = text.trim();

  if (bio.length > STUDY_RATS.LIMITES.MAX_BIO) {
    throw new StudyRatsError(
      `A bio pode ter no máximo ${STUDY_RATS.LIMITES.MAX_BIO} caracteres.`,
    );
  }

  // Um UPDATE bloqueado por RLS volta 0 linhas sem erro: .select('id') revela isso.
  const { data, error } = await supabase
    .from(STUDY_RATS.TABELAS.PROFILES)
    .update({ bio: bio || null })
    .eq('id', userId)
    .select('id');

  if (error) throw fail('Não foi possível salvar a bio.', error);
  if (!data || data.length === 0) {
    throw new StudyRatsError('Não foi possível salvar a bio.');
  }
}

// ============================================================
// CALENDÁRIO (check-ins da própria usuária)
// ============================================================

/** Check-ins da própria usuária no mês local informado (`month` de 1 a 12). */
export async function getMyCheckinsByMonth(
  year: number,
  month: number,
): Promise<StudyCalendarEntry[]> {
  const userId = getCurrentUserId();
  const supabase = await getSupabaseWithToken();
  const { start, end } = localMonthRange(year, month);

  const { data, error } = await supabase
    .from(STUDY_RATS.TABELAS.POSTS)
    .select(
      'id, user_id, kind, category, title, caption, subject, duration_min, study_date, study_time, in_feed, created_at',
    )
    .eq('user_id', userId)
    .eq('kind', STUDY_RATS.TIPOS.CHECKIN)
    .eq('is_deleted', false)
    .gte('study_date', start)
    .lte('study_date', end)
    .order('study_date', { ascending: true })
    .order('study_time', { ascending: true });

  if (error) throw fail('Não foi possível carregar o calendário.', error);

  const posts = (data ?? []) as any[];
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => String(p.id));
  const photosByPost = new Map<string, Array<{ path: string; position: number }>>();

  for (let i = 0; i < postIds.length; i += 100) {
    const chunk = postIds.slice(i, i + 100);
    const { data: photos, error: photosError } = await supabase
      .from(STUDY_RATS.TABELAS.POST_PHOTOS)
      .select('post_id, photo_path, position')
      .in('post_id', chunk)
      .order('position', { ascending: true });

    if (photosError) {
      console.warn('⚠️ [studyRats] Não foi possível carregar as fotos dos check-ins.');
      continue;
    }

    for (const photo of (photos ?? []) as any[]) {
      const list = photosByPost.get(String(photo.post_id)) ?? [];
      list.push({ path: String(photo.photo_path), position: toNumber(photo.position) });
      photosByPost.set(String(photo.post_id), list);
    }
  }

  const allPaths = Array.from(photosByPost.values()).flatMap((list) =>
    list.map((photo) => photo.path),
  );
  const urls = await getSignedPhotoUrls(allPaths);

  return posts.map((post) => {
    const list = (photosByPost.get(String(post.id)) ?? []).sort(
      (a, b) => a.position - b.position,
    );
    return {
      id: String(post.id),
      studyDate: String(post.study_date ?? ''),
      studyTime: toStr(post.study_time),
      subject: toStr(post.subject),
      durationMin: toNumber(post.duration_min),
      title: toStr(post.title),
      caption: toStr(post.caption),
      inFeed: post.in_feed === true,
      createdAt: String(post.created_at ?? ''),
      photos: list.map((photo) => ({
        path: photo.path,
        position: photo.position,
        url: urls.get(photo.path) ?? null,
      })),
    };
  });
}
