-- Migração: adicionar coluna effective_until em study_weekly_blocks
-- Data: 2026-11-20
-- Objetivo: permitir encerrar séries de blocos semanais preservando histórico
-- P3: migração aditiva (não destrutiva) - apenas adiciona coluna opcional

-- ============================================================
-- Adicionar coluna effective_until em study_weekly_blocks
-- ============================================================
ALTER TABLE public.study_weekly_blocks
ADD COLUMN IF NOT EXISTS effective_until date;

COMMENT ON COLUMN public.study_weekly_blocks.effective_until IS 'Data até quando este bloco vale (inclusive). NULL = sem fim definido. Usado para "edição a partir de hoje": versão antiga recebe effective_until = ontem, nova versão inicia em effective_from = hoje.';

-- Atualizar função RPC de batch insert para incluir effective_until
CREATE OR REPLACE FUNCTION public.salvar_study_weekly_blocks_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_weekly_blocks (id, user_id, task_id, weekday, start_time, end_time, effective_from, effective_until, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'task_id',
    (r->>'weekday')::int,
    r->>'start_time',
    r->>'end_time',
    (r->>'effective_from')::date,
    CASE WHEN (r->>'effective_until') IS NOT NULL THEN (r->>'effective_until')::date ELSE NULL END,
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    task_id = EXCLUDED.task_id,
    weekday = EXCLUDED.weekday,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    effective_from = EXCLUDED.effective_from,
    effective_until = EXCLUDED.effective_until,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;