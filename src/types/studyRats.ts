// src/types/studyRats.ts
// Tipos do Study Rats (feed estilo Instagram da aba Comunidade).
// Os nomes seguem o padrão camelCase do TypeScript; o serviço converte para/de
// snake_case nas tabelas e RPCs do Supabase (supabase/migrations/20261124120000_study_rats.sql).

export type StudyPostKind = 'checkin' | 'post';

export type StudyCategory = 'study_tip' | 'curiosity' | 'question' | 'motivation';

export type StudyDestination = 'feed' | 'story';

export interface StudyAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarTipo: string | null;
  avatarId: string | null;
  bio: string | null;
}

export interface StudyPhoto {
  id: string;
  path: string;
  position: number;
  url: string | null;
}

export interface StudyPost {
  id: string;
  userId: string;
  kind: StudyPostKind;
  category: StudyCategory | null;
  title: string | null;
  caption: string | null;
  subject: string | null;
  durationMin: number;
  studyDate: string | null;
  studyTime: string | null;
  inFeed: boolean;
  createdAt: string;
  author: StudyAuthor;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  friendLikerId: string | null;
  friendLikerName: string | null;
  photos: StudyPhoto[];
}

export interface StudyComment {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  author: Omit<StudyAuthor, 'bio'>;
}

export interface StudyStory {
  id: string;
  userId: string;
  kind: StudyPostKind;
  category: StudyCategory | null;
  text: string | null;
  photoPath: string | null;
  photoUrl: string | null;
  subject: string | null;
  durationMin: number;
  checkinPostId: string | null;
  createdAt: string;
  expiresAt: string;
  viewedByMe: boolean;
  viewedCount: number;
  author: Omit<StudyAuthor, 'bio'>;
}

export interface StudyStoryViewer {
  userId: string;
  viewedAt: string;
  name: string;
  avatarUrl: string | null;
  avatarTipo: string | null;
  avatarId: string | null;
}

export interface StudyProfileStats {
  userId: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  avatarTipo: string | null;
  avatarId: string | null;
  postsCount: number;
  hours: number;
}

export interface StudyCalendarPhoto {
  path: string;
  position: number;
  url: string | null;
}

export interface StudyCalendarEntry {
  id: string;
  studyDate: string;
  studyTime: string | null;
  subject: string | null;
  durationMin: number;
  title: string | null;
  caption: string | null;
  inFeed: boolean;
  createdAt: string;
  photos: StudyCalendarPhoto[];
}

export interface StudyFeedFilter {
  kind?: StudyPostKind;
  category?: StudyCategory;
  authorId?: string;
  savedOnly?: boolean;
}

export interface StudyFeedCursor {
  createdAt: string;
  id: string;
}

export interface StudyFeedPage {
  posts: StudyPost[];
  nextCursor: StudyFeedCursor | null;
}

export interface StudyFeedParams {
  cursor?: StudyFeedCursor | null;
  filter?: StudyFeedFilter;
  pageSize?: number;
}

export interface CreateStudyPostInput {
  destination: StudyDestination;
  kind: StudyPostKind;
  category?: StudyCategory | null;
  files?: File[];
  title?: string;
  subject?: string;
  durationMin?: number;
  caption?: string;
  /** Data local (YYYY-MM-DD). Se omitida, usa a data local de hoje. */
  studyDate?: string;
}

export interface CreatedStudyPost {
  postId: string | null;
  storyId: string | null;
  photos: StudyPhoto[];
  /** Título como foi gravado pelo servidor (null quando não houve post). */
  title: string | null;
  /** Data local (YYYY-MM-DD) gravada pelo servidor; null fora de check-in. */
  studyDate: string | null;
  /** Hora local gravada pelo servidor; null fora de check-in. */
  studyTime: string | null;
  /** Duração gravada pelo servidor (0 fora de check-in). */
  durationMin: number;
}

export interface UpdateStudyPostInput {
  title?: string;
  caption?: string;
  category?: StudyCategory | null;
  subject?: string;
  durationMin?: number;
}

// ------------------------------------------------------------------
// Documento local (RxDB) — cache de LEITURA dos check-ins da usuária.
// Nunca é enviado ao Supabase pelo sync: as escritas passam pelo serviço.
// ------------------------------------------------------------------

export interface StudyCheckinPhoto {
  id: string;
  path: string;
  position: number;
}

export interface StudyCheckinRecord {
  id: string;
  user_id: string;
  kind: 'checkin';
  category: StudyCategory | null;
  title: string | null;
  caption: string | null;
  subject: string | null;
  duration_min: number;
  study_date: string;
  study_time: string | null;
  in_feed: boolean;
  created_at: string;
  updated_at: string;
  isDeleted: boolean;
  photos: StudyCheckinPhoto[];
}
