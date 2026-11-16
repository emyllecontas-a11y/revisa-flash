-- Migração: criar tabela aula_materiais, índices, RLS e bucket privado
-- Data: 2026-11-17
-- Objetivo: permitir anexar PDFs (Material de Apoio) a cada aula.
--   - Tabela aula_materiais guarda metadados (nome, storage_path, tamanho, mime).
--   - Bucket privado 'aula-materiais' guarda os PDFs (máx. 20 MB, application/pdf).
--   - Caminho no bucket: ${userId}/${aulaId}/${uid()}.pdf
--   - user_id é text (Clerk ID), igual à tabela files.
--   - aula_id é uuid (igual a aulas.id), sem foreign key.
--   - Sem isDeleted (igual a files — delete é físico).
--   - RLS baseada no JWT do Clerk (claim sub), não em auth.uid().

-- ============================================================
-- 1. TABELA aula_materiais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aula_materiais (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  aula_id       uuid        NOT NULL,
  nome          text        NOT NULL,
  storage_path  text        NOT NULL,
  tamanho       bigint      DEFAULT 0,
  mime          text        DEFAULT 'application/pdf',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Comentário para documentação
COMMENT ON TABLE public.aula_materiais IS 'Materiais de apoio (PDFs) anexados por aula. user_id = Clerk ID (text). aula_id = UUID da aula (sem FK).';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_aula_materiais_user_aula
  ON public.aula_materiais (user_id, aula_id);

CREATE INDEX IF NOT EXISTS idx_aula_materiais_user_created
  ON public.aula_materiais (user_id, created_at);

-- ============================================================
-- 3. RLS — Row Level Security
-- ============================================================
ALTER TABLE public.aula_materiais ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário só vê seus próprios materiais
DROP POLICY IF EXISTS "aula_materiais_select_own" ON public.aula_materiais;
CREATE POLICY "aula_materiais_select_own"
  ON public.aula_materiais FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

-- INSERT: usuário só insere materiais com seu próprio user_id
DROP POLICY IF EXISTS "aula_materiais_insert_own" ON public.aula_materiais;
CREATE POLICY "aula_materiais_insert_own"
  ON public.aula_materiais FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

-- UPDATE: usuário só atualiza seus próprios materiais
DROP POLICY IF EXISTS "aula_materiais_update_own" ON public.aula_materiais;
CREATE POLICY "aula_materiais_update_own"
  ON public.aula_materiais FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

-- DELETE: usuário só apaga seus próprios materiais
DROP POLICY IF EXISTS "aula_materiais_delete_own" ON public.aula_materiais;
CREATE POLICY "aula_materiais_delete_own"
  ON public.aula_materiais FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 4. BUCKET PRIVADO 'aula-materiais'
-- ============================================================
-- Bucket privado: file_size_limit = 20 MB, allowed_mime_types = application/pdf
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('aula-materiais', 'aula-materiais', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit  = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public           = EXCLUDED.public;

-- ============================================================
-- 5. POLICIES DO BUCKET (storage.objects)
-- ============================================================
-- O primeiro folder name do path é o userId (Clerk ID).
-- O usuário só acessa objetos cujo primeiro folder = seu Clerk ID.

-- SELECT: usuário só baixa seus próprios arquivos
DROP POLICY IF EXISTS "aula_materiais_storage_select" ON storage.objects;
CREATE POLICY "aula_materiais_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- INSERT: usuário só sobe arquivos no seu próprio folder
DROP POLICY IF EXISTS "aula_materiais_storage_insert" ON storage.objects;
CREATE POLICY "aula_materiais_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- UPDATE: usuário só atualiza seus próprios arquivos
DROP POLICY IF EXISTS "aula_materiais_storage_update" ON storage.objects;
CREATE POLICY "aula_materiais_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- DELETE: usuário só apaga seus próprios arquivos
DROP POLICY IF EXISTS "aula_materiais_storage_delete" ON storage.objects;
CREATE POLICY "aula_materiais_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );