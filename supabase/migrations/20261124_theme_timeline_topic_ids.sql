-- Migração: Adicionar topic_ids à study_theme_timelines (Integração Plano↔Conteúdos)
-- Data: 2026-11-24
-- Objetivo: Vincular cronograma de temas à hierarquia real de Conteúdos (topics)
-- DECISÃO: Opção B — topic_ids na timeline (não em tasks). Tasks continuam genéricas.

-- 1. Adicionar coluna topic_ids (array de UUIDs dos tópicos)
ALTER TABLE public.study_theme_timelines
  ADD COLUMN IF NOT EXISTS topic_ids uuid[] DEFAULT '{}';

-- 2. Índice GIN para busca eficiente por tópicos
CREATE INDEX IF NOT EXISTS idx_study_theme_timelines_topic_ids
  ON public.study_theme_timelines USING GIN (topic_ids);

-- 3. Atualizar RPC salvar_study_theme_timelines_batch preservando assinatura original
-- Assinatura original: RETURNS void, LANGUAGE sql, SECURITY DEFINER
-- Colunas no INSERT: id, user_id, period_type, period_start, themes, created_at, updated_at, is_deleted
-- Adicionar topic_ids mantendo o mesmo padrão de conversão JSONB -> uuid[]

CREATE OR REPLACE FUNCTION public.salvar_study_theme_timelines_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_theme_timelines (id, user_id, period_type, period_start, themes, topic_ids, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'period_type',
    (r->>'period_start')::date,
    (r->>'themes')::text[],
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'topic_ids','[]'::jsonb)))::uuid[], '{}'),
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    period_type = EXCLUDED.period_type,
    period_start = EXCLUDED.period_start,
    themes = EXCLUDED.themes,
    topic_ids = EXCLUDED.topic_ids,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;

-- 4. Permissões (mesmo padrão das outras funções do plano)
REVOKE EXECUTE ON FUNCTION public.salvar_study_theme_timelines_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_study_theme_timelines_batch(jsonb) TO authenticated;