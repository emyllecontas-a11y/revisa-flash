-- Migração: Pausas do Plano de Estudos (ETAPA 7)
-- Data: 2026-11-22

CREATE TABLE IF NOT EXISTS public.study_plan_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_study_plan_pauses_user ON public.study_plan_pauses (user_id);

ALTER TABLE public.study_plan_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_plan_pauses_select_own" ON public.study_plan_pauses;
CREATE POLICY "study_plan_pauses_select_own" ON public.study_plan_pauses FOR SELECT USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_plan_pauses_insert_own" ON public.study_plan_pauses;
CREATE POLICY "study_plan_pauses_insert_own" ON public.study_plan_pauses FOR INSERT WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_plan_pauses_update_own" ON public.study_plan_pauses;
CREATE POLICY "study_plan_pauses_update_own" ON public.study_plan_pauses FOR UPDATE USING ((auth.jwt() ->> 'sub') = user_id) WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_plan_pauses_delete_own" ON public.study_plan_pauses;
CREATE POLICY "study_plan_pauses_delete_own" ON public.study_plan_pauses FOR DELETE USING ((auth.jwt() ->> 'sub') = user_id);

CREATE OR REPLACE FUNCTION public.buscar_study_plan_pauses_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_plan_pauses LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.study_plan_pauses
  WHERE user_id = p_user_id AND p_user_id = (auth.jwt() ->> 'sub')
    AND updated_at >= p_last_sync AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.salvar_study_plan_pauses_batch(p_records jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.study_plan_pauses (id, user_id, start_date, end_date, reason, created_at, updated_at, is_deleted)
  SELECT (r->>'id')::uuid, r->>'user_id', (r->>'start_date')::date, (r->>'end_date')::date, r->>'reason',
         COALESCE((r->>'created_at')::timestamptz, now()),
         COALESCE((r->>'updated_at')::timestamptz, now()),
         COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  WHERE r->>'user_id' = (auth.jwt() ->> 'sub')
  ON CONFLICT (id) DO UPDATE SET
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, reason = EXCLUDED.reason,
    updated_at = EXCLUDED.updated_at, is_deleted = EXCLUDED.is_deleted;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_study_plan_pauses_usuario(text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.salvar_study_plan_pauses_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_study_plan_pauses_usuario(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_study_plan_pauses_batch(jsonb) TO authenticated;