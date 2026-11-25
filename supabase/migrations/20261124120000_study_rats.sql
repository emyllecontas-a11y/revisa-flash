-- Migração: Study Rats — banco de dados, RLS, RPCs e storage
-- Data: 2026-11-24
-- Fase: 1 (somente SQL; não executar antes da revisão)
-- Objetivo: tornar funcional o feed estilo Instagram (Study Rats) na aba Comunidade.
--   - Tabelas: study_posts, study_post_photos, study_post_likes, study_post_comments,
--     study_post_saves, study_stories, study_story_views.
--   - Coluna bio em profiles (máx. 150 caracteres).
--   - RLS baseada em Clerk: (auth.jwt() ->> 'sub') = user_id (user_id text).
--   - Visibilidade: só a própria autora e amizades aceitas (friendships.status = 'accepted').
--   - Bucket privado 'study-rats' com URLs assinadas (createSignedUrls no cliente).
--   - Regra central: só se publica pela Comunidade; o calendário apenas lê check-ins.
--   - in_feed = false => check-in publicado como story (conta no calendário/horas,
--     fora do feed e da grade do perfil). Post normal (kind='post') nunca entra no calendário.
--   - Datas de estudo = data local do dispositivo (America/Fortaleza), nunca UTC.
--
-- DECISÕES FIXAS (herdadas da Fase 0):
--   * Autenticação é Clerk (não Supabase Auth). Toda policy usa (auth.jwt() ->> 'sub').
--   * user_id é text (igual às demais tabelas). id é uuid (uid() gera UUID v4).
--   * Soft delete no banco: is_deleted boolean NOT NULL DEFAULT false.
--   * Amizades: friendships(requester_id, addressee_id, status pending|accepted).

-- ============================================================
-- 0. FUNÇÕES AUXILIARES (SECURITY DEFINER)
-- ============================================================
-- Estas funções encapsulam a lógica de amizade/visibilidade para reuso em policies e RPCs.
-- SECURITY DEFINER + search_path fixo evita que o chamador precise ler friendships/profiles.

-- 0.1. Sou amigo aceito de p_other?
CREATE OR REPLACE FUNCTION public.sr_sou_amigo_de(p_other text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = (auth.jwt() ->> 'sub') AND f.addressee_id = p_other)
        OR
        (f.addressee_id = (auth.jwt() ->> 'sub') AND f.requester_id = p_other)
      )
  );
$$;

-- 0.2. Posso ver o post p_post_id?
--   Dona: sempre (inclusive is_deleted, para o calendário/estatísticas locais).
--   Não-dona: is_deleted = false E amizade aceita E
--             (in_feed = true OU existe story não expirado com checkin_post_id = o post E user_id = p.user_id).
CREATE OR REPLACE FUNCTION public.sr_posso_ver_post(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_posts p
    WHERE p.id = p_post_id
      AND (
        p.user_id = (auth.jwt() ->> 'sub')
        OR (
          p.is_deleted = false
          AND public.sr_sou_amigo_de(p.user_id)
          AND (
            p.in_feed = true
            OR EXISTS (
              SELECT 1 FROM public.study_stories s
              WHERE s.checkin_post_id = p.id AND s.expires_at > now()
                AND s.user_id = p.user_id
            )
          )
        )
      )
  );
$$;

-- 0.3. Posso ver o story p_story_id? (dona ou amizade aceita da dona; não expirado)
CREATE OR REPLACE FUNCTION public.sr_posso_ver_story(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_stories s
    WHERE s.id = p_story_id
      AND s.expires_at > now()
      AND (
        s.user_id = (auth.jwt() ->> 'sub')
        OR public.sr_sou_amigo_de(s.user_id)
      )
  );
$$;

-- 0.4. Posso ver o arquivo p_path no bucket study-rats?
--   Dona (1º folder = identidade): sempre.
--   Não-dona: amiga aceita da dona E o arquivo pertence a algo visível:
--     (a) foto de post visível (sr_posso_ver_post), ou
--     (b) photo_path de story não expirado com s.user_id = f.owner, ou
--     (c) foto de check-in vinculado a story não expirado com s.user_id = p.user_id.
CREATE OR REPLACE FUNCTION public.sr_posso_ver_arquivo(p_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (SELECT (storage.foldername(p_path))[1] AS owner) f
    WHERE
      f.owner = (auth.jwt() ->> 'sub')
      OR (
        public.sr_sou_amigo_de(f.owner)
        AND (
          -- (a) foto de post visível (a dona do arquivo já é amiga aceita aqui)
          EXISTS (
            SELECT 1
            FROM public.study_post_photos ph
            JOIN public.study_posts p ON p.id = ph.post_id
            WHERE ph.photo_path = p_path
              AND p.is_deleted = false
              AND (
                p.in_feed = true
                OR EXISTS (
                  SELECT 1 FROM public.study_stories s3
                  WHERE s3.checkin_post_id = p.id AND s3.expires_at > now()
                    AND s3.user_id = p.user_id
                )
              )
          )
          -- (b) photo_path de story não expirado
          OR EXISTS (
            SELECT 1 FROM public.study_stories s
            WHERE s.photo_path = p_path AND s.expires_at > now()
              AND s.user_id = f.owner
          )
          -- (c) foto de check-in vinculado a story não expirado
          OR EXISTS (
            SELECT 1
            FROM public.study_stories s
            JOIN public.study_posts p ON p.id = s.checkin_post_id
            JOIN public.study_post_photos ph ON ph.post_id = p.id
            WHERE s.expires_at > now()
              AND s.checkin_post_id IS NOT NULL
              AND p.is_deleted = false
              AND s.user_id = p.user_id
              AND ph.photo_path = p_path
          )
        )
      )
  );
$$;

-- ============================================================
-- 1. TABELA study_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('checkin', 'post')),
  category      text        CHECK (category IN ('study_tip', 'curiosity', 'question', 'motivation')),
  title         text,
  caption       text,
  subject       text,
  duration_min  integer     NOT NULL DEFAULT 0,
  study_date    date,
  study_time    time,
  in_feed       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  is_deleted    boolean     NOT NULL DEFAULT false,
  CONSTRAINT study_posts_checkin_fields CHECK (
    kind <> 'checkin' OR (subject IS NOT NULL AND duration_min > 0 AND study_date IS NOT NULL)
  ),
  CONSTRAINT study_posts_post_fields CHECK (
    kind <> 'post' OR (caption IS NOT NULL AND category IS NOT NULL)
  ),
  CONSTRAINT study_posts_duration_nonneg CHECK (duration_min >= 0),
  CONSTRAINT study_posts_duration_max CHECK (duration_min <= 1440)
);

COMMENT ON TABLE public.study_posts IS 'Publicações do Study Rats. kind=checkin (entra no calendário/horas) ou post (só feed/perfil). in_feed=false = check-in publicado como story (fora do feed e da grade do perfil). user_id = Clerk ID (auth.jwt() ->> ''sub'').';

-- ATENÇÃO (delete de post pelo cliente): um DELETE (ou soft delete is_deleted=true)
-- NÃO remove os arquivos do post no storage 'study-rats'. A Fase 2 deve apagar os
-- arquivos antes/depois do delete — exceto os que ainda forem compartilhados com um
-- story ativo (checkin_post_id), que serão limpos pela rotina de expirados
-- (study_stories_meus_expirados + study_stories_apagar_expirados).

CREATE INDEX IF NOT EXISTS idx_study_posts_user_created
  ON public.study_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_posts_user_kind_date
  ON public.study_posts (user_id, kind, study_date);
CREATE INDEX IF NOT EXISTS idx_study_posts_feed
  ON public.study_posts (in_feed, created_at DESC, id);

-- Trigger BEFORE UPDATE para manter updated_at (não há função de trigger versionada;
-- cria-se uma dedicada).
CREATE OR REPLACE FUNCTION public.sr_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_study_posts_updated_at ON public.study_posts;
CREATE TRIGGER trg_study_posts_updated_at
  BEFORE UPDATE ON public.study_posts
  FOR EACH ROW EXECUTE FUNCTION public.sr_set_updated_at();

ALTER TABLE public.study_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_posts_select" ON public.study_posts;
CREATE POLICY "study_posts_select"
  ON public.study_posts FOR SELECT
  TO authenticated
  USING (public.sr_posso_ver_post(id));

DROP POLICY IF EXISTS "study_posts_insert_own" ON public.study_posts;
CREATE POLICY "study_posts_insert_own"
  ON public.study_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "study_posts_update_own" ON public.study_posts;
CREATE POLICY "study_posts_update_own"
  ON public.study_posts FOR UPDATE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "study_posts_delete_own" ON public.study_posts;
CREATE POLICY "study_posts_delete_own"
  ON public.study_posts FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- ============================================================
-- 2. TABELA study_post_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_post_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES public.study_posts(id) ON DELETE CASCADE,
  photo_path  text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT study_post_photos_unique_position UNIQUE (post_id, position)
);

COMMENT ON TABLE public.study_post_photos IS 'Fotos de um post/check-in. photo_path é o caminho no bucket privado study-rats. Máx. 10 por post (position 0-9). UNIQUE(post_id, position).';

CREATE INDEX IF NOT EXISTS idx_study_post_photos_post
  ON public.study_post_photos (post_id, position);
CREATE INDEX IF NOT EXISTS idx_study_post_photos_path
  ON public.study_post_photos (photo_path);

ALTER TABLE public.study_post_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_post_photos_select" ON public.study_post_photos;
CREATE POLICY "study_post_photos_select"
  ON public.study_post_photos FOR SELECT
  TO authenticated
  USING (public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_photos_insert_own" ON public.study_post_photos;
CREATE POLICY "study_post_photos_insert_own"
  ON public.study_post_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    split_part(photo_path, '/', 1) = (auth.jwt() ->> 'sub')
    AND EXISTS (
      SELECT 1 FROM public.study_posts p
      WHERE p.id = post_id AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS "study_post_photos_delete_own" ON public.study_post_photos;
CREATE POLICY "study_post_photos_delete_own"
  ON public.study_post_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.study_posts p
      WHERE p.id = post_id AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );

-- ============================================================
-- 3. TABELA study_post_likes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_post_likes (
  post_id     uuid        NOT NULL REFERENCES public.study_posts(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

COMMENT ON TABLE public.study_post_likes IS 'Curtidas. PK composta (post_id, user_id). Só quem pode ver o post pode curtir.';

CREATE INDEX IF NOT EXISTS idx_study_post_likes_user
  ON public.study_post_likes (user_id);

ALTER TABLE public.study_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_post_likes_select" ON public.study_post_likes;
CREATE POLICY "study_post_likes_select"
  ON public.study_post_likes FOR SELECT
  TO authenticated
  USING (public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_likes_insert" ON public.study_post_likes;
CREATE POLICY "study_post_likes_insert"
  ON public.study_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_likes_delete_own" ON public.study_post_likes;
CREATE POLICY "study_post_likes_delete_own"
  ON public.study_post_likes FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- ============================================================
-- 4. TABELA study_post_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_post_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES public.study_posts(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  text        text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.study_post_comments IS 'Comentários. text com 1-500 caracteres. A autora do comentário e a autora do post podem excluir.';

CREATE INDEX IF NOT EXISTS idx_study_post_comments_post
  ON public.study_post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_study_post_comments_user
  ON public.study_post_comments (user_id);

ALTER TABLE public.study_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_post_comments_select" ON public.study_post_comments;
CREATE POLICY "study_post_comments_select"
  ON public.study_post_comments FOR SELECT
  TO authenticated
  USING (public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_comments_insert" ON public.study_post_comments;
CREATE POLICY "study_post_comments_insert"
  ON public.study_post_comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_comments_delete" ON public.study_post_comments;
CREATE POLICY "study_post_comments_delete"
  ON public.study_post_comments FOR DELETE
  TO authenticated
  USING (
    user_id = (auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.study_posts p
      WHERE p.id = post_id AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );

-- ============================================================
-- 5. TABELA study_post_saves
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_post_saves (
  post_id     uuid        NOT NULL REFERENCES public.study_posts(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

COMMENT ON TABLE public.study_post_saves IS 'Itens salvos. PK composta (post_id, user_id). Só a própria usuária lê os próprios salvos.';

CREATE INDEX IF NOT EXISTS idx_study_post_saves_user_created
  ON public.study_post_saves (user_id, created_at DESC);

ALTER TABLE public.study_post_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_post_saves_select_own" ON public.study_post_saves;
CREATE POLICY "study_post_saves_select_own"
  ON public.study_post_saves FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "study_post_saves_insert" ON public.study_post_saves;
CREATE POLICY "study_post_saves_insert"
  ON public.study_post_saves FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND public.sr_posso_ver_post(post_id));

DROP POLICY IF EXISTS "study_post_saves_delete_own" ON public.study_post_saves;
CREATE POLICY "study_post_saves_delete_own"
  ON public.study_post_saves FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- ============================================================
-- 6. TABELA study_stories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_stories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('checkin', 'post')),
  category        text        CHECK (category IN ('study_tip', 'curiosity', 'question', 'motivation')),
  text            text,
  photo_path      text,
  subject         text,
  duration_min    integer     NOT NULL DEFAULT 0,
  checkin_post_id uuid        REFERENCES public.study_posts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT study_stories_checkin_fields CHECK (
    kind <> 'checkin' OR (subject IS NOT NULL AND duration_min > 0)
  ),
  CONSTRAINT study_stories_post_fields CHECK (
    kind <> 'post' OR (text IS NOT NULL OR photo_path IS NOT NULL)
  ),
  CONSTRAINT study_stories_duration_max CHECK (duration_min <= 1440)
);

COMMENT ON TABLE public.study_stories IS 'Stories de 24h. kind=checkin (vinculado a um study_post via checkin_post_id) ou post (texto/foto). expires_at = created_at + 24h. user_id = Clerk ID.';

CREATE INDEX IF NOT EXISTS idx_study_stories_user_expires
  ON public.study_stories (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_study_stories_expires
  ON public.study_stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_study_stories_checkin
  ON public.study_stories (checkin_post_id);
CREATE INDEX IF NOT EXISTS idx_study_stories_path
  ON public.study_stories (photo_path);

ALTER TABLE public.study_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_stories_select" ON public.study_stories;
CREATE POLICY "study_stories_select"
  ON public.study_stories FOR SELECT
  TO authenticated
  USING (
    expires_at > now()
    AND (
      user_id = (auth.jwt() ->> 'sub')
      OR public.sr_sou_amigo_de(user_id)
    )
  );

DROP POLICY IF EXISTS "study_stories_insert_own" ON public.study_stories;
CREATE POLICY "study_stories_insert_own"
  ON public.study_stories FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (auth.jwt() ->> 'sub')
    AND expires_at <= now() + interval '25 hours'
    AND (photo_path IS NULL OR split_part(photo_path, '/', 1) = (auth.jwt() ->> 'sub'))
    AND (
      checkin_post_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.study_posts p
        WHERE p.id = checkin_post_id AND p.user_id = (auth.jwt() ->> 'sub')
      )
    )
  );

-- REMOVER a policy study_stories_update_own (nada no plano edita story).
-- Se a Fase 2 precisar, recriamos com as mesmas travas do INSERT.
DROP POLICY IF EXISTS "study_stories_update_own" ON public.study_stories;

DROP POLICY IF EXISTS "study_stories_delete_own" ON public.study_stories;
CREATE POLICY "study_stories_delete_own"
  ON public.study_stories FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- ============================================================
-- 7. TABELA study_story_views
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_story_views (
  story_id    uuid        NOT NULL REFERENCES public.study_stories(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  viewed_at   timestamptz DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

COMMENT ON TABLE public.study_story_views IS 'Quem viu cada story. PK composta (story_id, user_id). Quem viu insere; só a autora do story lê quem viu.';

ALTER TABLE public.study_story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_story_views_select_owner" ON public.study_story_views;
CREATE POLICY "study_story_views_select_owner"
  ON public.study_story_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.study_stories s
      WHERE s.id = story_id AND s.user_id = (auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS "study_story_views_insert" ON public.study_story_views;
CREATE POLICY "study_story_views_insert"
  ON public.study_story_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND public.sr_posso_ver_story(story_id));

-- REVOKE anon em todas as tabelas study_* (bucket study-rats é privado, URLs assinadas)
REVOKE ALL ON public.study_posts FROM anon;
REVOKE ALL ON public.study_post_photos FROM anon;
REVOKE ALL ON public.study_post_likes FROM anon;
REVOKE ALL ON public.study_post_comments FROM anon;
REVOKE ALL ON public.study_post_saves FROM anon;
REVOKE ALL ON public.study_stories FROM anon;
REVOKE ALL ON public.study_story_views FROM anon;

-- ============================================================
-- 8. COLUNA bio EM profiles
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_len CHECK (bio IS NULL OR char_length(bio) <= 150);

COMMENT ON COLUMN public.profiles.bio IS 'Biografia do perfil (máx. 150 caracteres). Usada no perfil do Study Rats.';

-- ============================================================
-- 9. RPCs — FEED, STORIES, PERFIL, COMENTÁRIOS, VIEWERS (evitam N+1)
-- ============================================================
-- Todas as RPCs são SECURITY DEFINER, com checagem de visibilidade (regra C3),
-- e usam (auth.jwt() ->> 'sub') como identidade da usuária.

-- 9.1. Feed paginado por cursor (created_at, id).
--   Parâmetros:
--     p_cursor_created  timestamptz (null = primeira página)
--     p_cursor_id       uuid        (null = primeira página)
--     p_page_size       integer     (padrão 20)
--     p_kind            text        (null = todos; 'checkin'|'post')
--     p_category        text        (null = todas as categorias)
--     p_author_id       text        (null = todos; posts de uma pessoa)
--     p_saved_only      boolean     (false; true = só os salvos da própria usuária)
--   Devolve: post + contagens + liked_by_me + saved_by_me +
--            uma amiga que curtiu (friend_liker_id/name) + fotos (jsonb ordenado).
CREATE OR REPLACE FUNCTION public.study_feed(
  p_cursor_created timestamptz DEFAULT NULL,
  p_cursor_id      uuid        DEFAULT NULL,
  p_page_size      integer     DEFAULT 20,
  p_kind           text        DEFAULT NULL,
  p_category       text        DEFAULT NULL,
  p_author_id      text        DEFAULT NULL,
  p_saved_only     boolean     DEFAULT false
)
RETURNS TABLE (
  out_id              uuid,
  out_user_id         text,
  out_kind            text,
  out_category        text,
  out_title           text,
  out_caption         text,
  out_subject         text,
  out_duration_min    integer,
  out_study_date      date,
  out_study_time      time,
  out_in_feed         boolean,
  out_created_at      timestamptz,
  out_author_name     text,
  out_author_avatar_url text,
  out_author_avatar_tipo text,
  out_author_avatar_id  text,
  out_author_bio      text,
  out_likes_count     bigint,
  out_comments_count  bigint,
  out_liked_by_me     boolean,
  out_saved_by_me     boolean,
  out_friend_liker_id text,
  out_friend_liker_name text,
  out_photos          jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = (auth.jwt() ->> 'sub')
                THEN f.addressee_id ELSE f.requester_id END AS id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = (auth.jwt() ->> 'sub') OR f.addressee_id = (auth.jwt() ->> 'sub'))
  ),
  visible AS (
    SELECT p.*
    FROM public.study_posts p
    WHERE p.in_feed = true
      AND p.is_deleted = false
      AND (
        p.user_id = (auth.jwt() ->> 'sub')
        OR p.user_id IN (SELECT id FROM friends)
      )
      AND (p_kind IS NULL OR p.kind = p_kind)
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_author_id IS NULL OR p.user_id = p_author_id)
      AND (
        p_saved_only = false
        OR EXISTS (
          SELECT 1 FROM public.study_post_saves s
          WHERE s.post_id = p.id AND s.user_id = (auth.jwt() ->> 'sub')
        )
      )
      AND (
        p_cursor_created IS NULL
        OR (p.created_at, p.id) < (p_cursor_created, p_cursor_id)
      )
  ),
  liked AS (
    SELECT l.post_id, l.user_id, l.created_at
    FROM public.study_post_likes l
    WHERE l.post_id IN (SELECT id FROM visible)
  ),
  friend_like AS (
    SELECT DISTINCT ON (l.post_id)
      l.post_id,
      l.user_id AS friend_id,
      pr.name   AS friend_name
    FROM liked l
    JOIN public.profiles pr ON pr.id = l.user_id
    WHERE l.user_id <> (auth.jwt() ->> 'sub')
      AND l.user_id IN (SELECT id FROM friends)
    ORDER BY l.post_id, l.created_at DESC
  )
  SELECT
    v.id, v.user_id, v.kind, v.category, v.title, v.caption, v.subject,
    v.duration_min, v.study_date, v.study_time, v.in_feed, v.created_at,
    pr.name, pr.avatar_url, pr.avatar_tipo, pr.avatar_id, pr.bio,
    (SELECT count(*) FROM liked l WHERE l.post_id = v.id),
    (SELECT count(*) FROM public.study_post_comments c WHERE c.post_id = v.id),
    EXISTS (SELECT 1 FROM liked l WHERE l.post_id = v.id AND l.user_id = (auth.jwt() ->> 'sub')),
    EXISTS (SELECT 1 FROM public.study_post_saves s WHERE s.post_id = v.id AND s.user_id = (auth.jwt() ->> 'sub')),
    fl.friend_id, fl.friend_name,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ph.id, 'photo_path', ph.photo_path, 'position', ph.position) ORDER BY ph.position)
       FROM public.study_post_photos ph WHERE ph.post_id = v.id),
      '[]'::jsonb
    )
  FROM visible v
  LEFT JOIN public.profiles pr ON pr.id = v.user_id
  LEFT JOIN friend_like fl ON fl.post_id = v.id
  ORDER BY v.created_at DESC, v.id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 50);
$$;

-- 9.2. Stories ativos (expires_at > now()) da usuária e das amizades.
--   Devolve: story + author + viewed_by_me + viewed_count (só a dona; não conta a dona).
CREATE OR REPLACE FUNCTION public.study_stories_feed()
RETURNS TABLE (
  out_id              uuid,
  out_user_id         text,
  out_kind            text,
  out_category        text,
  out_text            text,
  out_photo_path      text,
  out_subject         text,
  out_duration_min    integer,
  out_checkin_post_id uuid,
  out_created_at      timestamptz,
  out_expires_at      timestamptz,
  out_author_name     text,
  out_author_avatar_url text,
  out_author_avatar_tipo text,
  out_author_avatar_id  text,
  out_viewed_by_me    boolean,
  out_viewed_count    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = (auth.jwt() ->> 'sub')
                THEN f.addressee_id ELSE f.requester_id END AS id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = (auth.jwt() ->> 'sub') OR f.addressee_id = (auth.jwt() ->> 'sub'))
  )
  SELECT
    s.id, s.user_id, s.kind, s.category, s.text, s.photo_path, s.subject,
    s.duration_min, s.checkin_post_id, s.created_at, s.expires_at,
    pr.name, pr.avatar_url, pr.avatar_tipo, pr.avatar_id,
    EXISTS (
      SELECT 1 FROM public.study_story_views v
      WHERE v.story_id = s.id AND v.user_id = (auth.jwt() ->> 'sub')
    ),
    CASE WHEN s.user_id = (auth.jwt() ->> 'sub')
      THEN (SELECT count(*) FROM public.study_story_views v
            WHERE v.story_id = s.id AND v.user_id <> s.user_id)
      ELSE 0
    END
  FROM public.study_stories s
  LEFT JOIN public.profiles pr ON pr.id = s.user_id
  WHERE s.expires_at > now()
    AND (
      s.user_id = (auth.jwt() ->> 'sub')
      OR s.user_id IN (SELECT id FROM friends)
    )
  ORDER BY s.created_at DESC;
$$;

-- 9.3. Resumo do perfil.
--   posts_count = publicações com in_feed = true (posts normais + check-ins no feed).
--   hours       = soma de duration_min de TODOS os check-ins (inclusive in_feed = false).
--   bio/name/avatar da própria usuária (ou de amizade aceita).
CREATE OR REPLACE FUNCTION public.study_perfil_resumo(p_user_id text)
RETURNS TABLE (
  out_user_id   text,
  out_name      text,
  out_bio       text,
  out_avatar_url text,
  out_avatar_tipo text,
  out_avatar_id text,
  out_posts_count bigint,
  out_hours     numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = (auth.jwt() ->> 'sub')
                THEN f.addressee_id ELSE f.requester_id END AS id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = (auth.jwt() ->> 'sub') OR f.addressee_id = (auth.jwt() ->> 'sub'))
  )
  SELECT
    pr.id, pr.name, pr.bio, pr.avatar_url, pr.avatar_tipo, pr.avatar_id,
    (SELECT count(*) FROM public.study_posts p
       WHERE p.user_id = pr.id AND p.in_feed = true AND p.is_deleted = false),
    (SELECT COALESCE(sum(p.duration_min), 0) / 60.0
       FROM public.study_posts p
       WHERE p.user_id = pr.id AND p.kind = 'checkin' AND p.is_deleted = false)
  FROM public.profiles pr
  WHERE pr.id = p_user_id
    AND (
      pr.id = (auth.jwt() ->> 'sub')
      OR pr.id IN (SELECT id FROM friends)
    );
$$;

-- 9.4. Comentários de um post, em ordem cronológica, com autor (nome/avatar).
--   Comentaristas podem não ser amigas de quem lê; por isso a RPC é SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.study_post_comments_list(p_post_id uuid)
RETURNS TABLE (
  out_id          uuid,
  out_post_id     uuid,
  out_user_id     text,
  out_text        text,
  out_created_at  timestamptz,
  out_author_name text,
  out_author_avatar_url text,
  out_author_avatar_tipo text,
  out_author_avatar_id  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id, c.post_id, c.user_id, c.text, c.created_at,
    pr.name, pr.avatar_url, pr.avatar_tipo, pr.avatar_id
  FROM public.study_post_comments c
  LEFT JOIN public.profiles pr ON pr.id = c.user_id
  WHERE c.post_id = p_post_id
    AND public.sr_posso_ver_post(p_post_id)
  ORDER BY c.created_at ASC;
$$;

-- 9.5. Quem viu um story (só a dona do story).
CREATE OR REPLACE FUNCTION public.study_story_viewers(p_story_id uuid)
RETURNS TABLE (
  out_user_id     text,
  out_viewed_at   timestamptz,
  out_name        text,
  out_avatar_url  text,
  out_avatar_tipo text,
  out_avatar_id   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    v.user_id, v.viewed_at,
    pr.name, pr.avatar_url, pr.avatar_tipo, pr.avatar_id
  FROM public.study_story_views v
  LEFT JOIN public.profiles pr ON pr.id = v.user_id
  WHERE v.story_id = p_story_id
    AND EXISTS (
      SELECT 1 FROM public.study_stories s
      WHERE s.id = p_story_id AND s.user_id = (auth.jwt() ->> 'sub')
    )
  ORDER BY v.viewed_at ASC;
$$;

-- 9.6. Meus stories expirados (para o cliente limpar o storage com segurança).
--   Devolve id, photo_path e foto_compartilhada:
--     foto_compartilhada = true quando checkin_post_id não é nulo OU o photo_path
--     também está em study_post_photos (mesma foto do check-in do calendário).
--   O cliente apaga o arquivo no storage SOMENTE quando foto_compartilhada = false
--   e só depois chama study_stories_apagar_expirados(p_ids).
CREATE OR REPLACE FUNCTION public.study_stories_meus_expirados()
RETURNS TABLE (
  out_id                uuid,
  out_photo_path        text,
  out_foto_compartilhada boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id,
    s.photo_path,
    (
      s.checkin_post_id IS NOT NULL
      OR (
        s.photo_path IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.study_post_photos ph
          WHERE ph.photo_path = s.photo_path
        )
      )
    ) AS foto_compartilhada
  FROM public.study_stories s
  WHERE s.user_id = (auth.jwt() ->> 'sub')
    AND s.expires_at <= now();
$$;

-- 9.7. Apaga stories próprios e já expirados entre os ids recebidos.
--   Não apaga dados de outras usuárias; não apaga o check-in vinculado
--   (checkin_post_id é ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.study_stories_apagar_expirados(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.study_stories s
    WHERE s.id = ANY(p_ids)
      AND s.user_id = (auth.jwt() ->> 'sub')
      AND s.expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 10. BUCKET PRIVADO 'study-rats' E POLICIES DE STORAGE
-- ============================================================
-- Bucket privado (public = false). Acesso por URLs assinadas (createSignedUrls).
-- Caminho: {user_id}/{post_id ou story_id}/{position}.{ext}
--   A extensão é a real do arquivo gerado no cliente (WebP ou JPEG/PNG em Safari
--   antigo). O cliente deve usar a extensão real; a policy não depende da extensão.
-- Escrita: só na pasta da própria usuária (1º folder = Clerk ID).
-- Leitura: dona ou amizade aceita da dona, via sr_posso_ver_arquivo(path) (regra C3).
-- Limite 2 MB (a compressão do cliente mira ≤ 0,8 MB; 2 MB dá folga para JPEG/PNG).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('study-rats', 'study-rats', false, 2097152, ARRAY['image/webp','image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public             = EXCLUDED.public;

-- Leitura/listagem: dona ou amiga visível (sr_posso_ver_arquivo)
DROP POLICY IF EXISTS "study_rats_storage_select" ON storage.objects;
CREATE POLICY "study_rats_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'study-rats'
    AND public.sr_posso_ver_arquivo(name)
  );

-- Inserção: só na própria pasta
DROP POLICY IF EXISTS "study_rats_storage_insert" ON storage.objects;
CREATE POLICY "study_rats_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'study-rats'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- Atualização: só na própria pasta
DROP POLICY IF EXISTS "study_rats_storage_update" ON storage.objects;
CREATE POLICY "study_rats_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'study-rats'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket_id = 'study-rats'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- Exclusão: só na própria pasta
DROP POLICY IF EXISTS "study_rats_storage_delete" ON storage.objects;
CREATE POLICY "study_rats_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'study-rats'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- ============================================================
-- 11. PERMISSÕES DAS FUNÇÕES (padrão do app: REVOKE PUBLIC/anon, GRANT authenticated)
-- ============================================================
REVOKE ALL ON FUNCTION public.sr_sou_amigo_de(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sr_sou_amigo_de(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sr_sou_amigo_de(text) TO authenticated;

REVOKE ALL ON FUNCTION public.sr_posso_ver_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sr_posso_ver_post(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sr_posso_ver_post(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sr_posso_ver_story(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sr_posso_ver_story(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sr_posso_ver_story(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sr_posso_ver_arquivo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sr_posso_ver_arquivo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sr_posso_ver_arquivo(text) TO authenticated;

REVOKE ALL ON FUNCTION public.sr_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sr_set_updated_at() FROM anon;

REVOKE ALL ON FUNCTION public.study_feed(timestamptz, uuid, integer, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_feed(timestamptz, uuid, integer, text, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.study_feed(timestamptz, uuid, integer, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.study_stories_feed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_stories_feed() FROM anon;
GRANT EXECUTE ON FUNCTION public.study_stories_feed() TO authenticated;

REVOKE ALL ON FUNCTION public.study_perfil_resumo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_perfil_resumo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.study_perfil_resumo(text) TO authenticated;

REVOKE ALL ON FUNCTION public.study_post_comments_list(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_post_comments_list(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.study_post_comments_list(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.study_story_viewers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_story_viewers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.study_story_viewers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.study_stories_meus_expirados() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_stories_meus_expirados() FROM anon;
GRANT EXECUTE ON FUNCTION public.study_stories_meus_expirados() TO authenticated;

REVOKE ALL ON FUNCTION public.study_stories_apagar_expirados(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_stories_apagar_expirados(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.study_stories_apagar_expirados(uuid[]) TO authenticated;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
-- Observações para o revisor:
--   * RPCs usam SECURITY DEFINER + checagem de visibilidade (regra C3); validar vazio entre contas.
--   * Políticas de storage reusam sr_posso_ver_arquivo; confirmar que (auth.jwt() ->> 'sub')
--     funciona no contexto de storage.objects (igual às migrations existentes).
--   * in_feed: default true; check-in como story deve gravar in_feed = false.
--   * Expiração: study_stories_meus_expirados() + study_stories_apagar_expirados()
--     apagam story + (se não compartilhada) a foto; preservam o check-in e a foto do check-in.
--   * Performance: índices em (user_id, created_at desc), (user_id, kind, study_date),
--     (in_feed, created_at desc, id), (expires_at), (photo_path), (checkin_post_id) e FKs.