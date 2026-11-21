-- Migração: criar tabelas do Plano de Estudos Inteligente (4 camadas)
-- Data: 2026-11-19
-- Objetivo: implementar as 5 tabelas base do novo Plano de Estudos
--   1. study_tasks — Biblioteca de tarefas/atividades (Camada 2)
--   2. study_theme_timelines — Linha do tempo de temas (Camada 1)
--   3. study_weekly_blocks — Blocos semanais recorrentes (Camada 3)
--   4. study_extra_events — Eventos extras/exceções (Camada 4)
--   5. study_occurrences — Ocorrências individuais geradas (motor)
-- Todas com user_id = Supabase user_id (auth.jwt() ->> 'sub'), RLS baseada em auth.jwt() ->> 'sub'

-- ============================================================
-- 1. study_tasks — Biblioteca de Tarefas (Camada 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_tasks (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text        NOT NULL,
  name                    text        NOT NULL,
  activity_type           text        NOT NULL CHECK (activity_type IN ('theory', 'questions', 'review', 'cards', 'exam', 'break', 'other')),
  color                   text        NOT NULL DEFAULT '#FE7802',
  theme_rule              text        NOT NULL DEFAULT 'period' CHECK (theme_rule IN ('period', 'all', 'none')),
  default_duration_min    integer     NOT NULL DEFAULT 90,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  is_deleted              boolean     DEFAULT false
);

COMMENT ON TABLE public.study_tasks IS 'Biblioteca de tipos de atividade de estudo (teoria, questões, revisão, flashcards, simulado, pausa, outro). user_id = Supabase user_id (auth.jwt() ->> ''sub'').';

-- Índices
CREATE INDEX IF NOT EXISTS idx_study_tasks_user ON public.study_tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user_type ON public.study_tasks (user_id, activity_type);

-- RLS
ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_tasks_select_own" ON public.study_tasks;
CREATE POLICY "study_tasks_select_own"
  ON public.study_tasks FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_tasks_insert_own" ON public.study_tasks;
CREATE POLICY "study_tasks_insert_own"
  ON public.study_tasks FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_tasks_update_own" ON public.study_tasks;
CREATE POLICY "study_tasks_update_own"
  ON public.study_tasks FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_tasks_delete_own" ON public.study_tasks;
CREATE POLICY "study_tasks_delete_own"
  ON public.study_tasks FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 2. study_theme_timelines — Linha do Tempo de Temas (Camada 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_theme_timelines (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  period_type     text        NOT NULL CHECK (period_type IN ('month', 'week')),
  period_start    date        NOT NULL, -- início do período (ex: 2026-11-01 para mês, segunda-feira da semana)
  themes          text[]      NOT NULL DEFAULT '{}', -- array de nomes de temas
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  is_deleted      boolean     DEFAULT false
);

COMMENT ON TABLE public.study_theme_timelines IS 'Define quais temas estão vigentes em cada mês ou semana. period_type = month|week, period_start = início do período. themes = array de strings. user_id = Supabase user_id (auth.jwt() ->> ''sub'').';

-- Único: um timeline por user + period_type + period_start
CREATE UNIQUE INDEX IF NOT EXISTS uq_study_theme_timelines_user_period
  ON public.study_theme_timelines (user_id, period_type, period_start)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_study_theme_timelines_user ON public.study_theme_timelines (user_id);
CREATE INDEX IF NOT EXISTS idx_study_theme_timelines_user_period_start ON public.study_theme_timelines (user_id, period_start);

-- RLS
ALTER TABLE public.study_theme_timelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_theme_timelines_select_own" ON public.study_theme_timelines;
CREATE POLICY "study_theme_timelines_select_own"
  ON public.study_theme_timelines FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_theme_timelines_insert_own" ON public.study_theme_timelines;
CREATE POLICY "study_theme_timelines_insert_own"
  ON public.study_theme_timelines FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_theme_timelines_update_own" ON public.study_theme_timelines;
CREATE POLICY "study_theme_timelines_update_own"
  ON public.study_theme_timelines FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_theme_timelines_delete_own" ON public.study_theme_timelines;
CREATE POLICY "study_theme_timelines_delete_own"
  ON public.study_theme_timelines FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 3. study_weekly_blocks — Blocos Semanais Recorrentes (Camada 3)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_weekly_blocks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  task_id         uuid        NOT NULL REFERENCES public.study_tasks(id) ON DELETE CASCADE,
  weekday         integer     NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Dom, 6=Sáb
  start_time      time        NOT NULL, -- HH:MM:SS
  end_time        time        NOT NULL, -- HH:MM:SS
  effective_from  date        NOT NULL, -- a partir de quando este padrão vale
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  is_deleted      boolean     DEFAULT false
);

COMMENT ON TABLE public.study_weekly_blocks IS 'Padrão semanal recorrente de estudo. weekday 0-6, start_time/end_time em HH:MM, effective_from = data a partir da qual este bloco passa a valer (preserva histórico). user_id = Supabase user_id (auth.jwt() ->> ''sub'').';

-- Índices
CREATE INDEX IF NOT EXISTS idx_study_weekly_blocks_user ON public.study_weekly_blocks (user_id);
CREATE INDEX IF NOT EXISTS idx_study_weekly_blocks_user_task ON public.study_weekly_blocks (user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_study_weekly_blocks_user_weekday ON public.study_weekly_blocks (user_id, weekday);
CREATE INDEX IF NOT EXISTS idx_study_weekly_blocks_user_effective ON public.study_weekly_blocks (user_id, effective_from);

-- RLS
ALTER TABLE public.study_weekly_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_weekly_blocks_select_own" ON public.study_weekly_blocks;
CREATE POLICY "study_weekly_blocks_select_own"
  ON public.study_weekly_blocks FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_weekly_blocks_insert_own" ON public.study_weekly_blocks;
CREATE POLICY "study_weekly_blocks_insert_own"
  ON public.study_weekly_blocks FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_weekly_blocks_update_own" ON public.study_weekly_blocks;
CREATE POLICY "study_weekly_blocks_update_own"
  ON public.study_weekly_blocks FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_weekly_blocks_delete_own" ON public.study_weekly_blocks;
CREATE POLICY "study_weekly_blocks_delete_own"
  ON public.study_weekly_blocks FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 4. study_extra_events — Eventos Extras/Exceções (Camada 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_extra_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  task_id         uuid        NOT NULL REFERENCES public.study_tasks(id) ON DELETE CASCADE,
  weekdays        integer[]   NOT NULL DEFAULT '{}', -- array de weekdays 0-6
  start_time      time        NOT NULL, -- HH:MM:SS
  end_time        time        NOT NULL, -- HH:MM:SS
  week_starts     date[]      NOT NULL DEFAULT '{}', -- array de inícios de semana (segundas-feiras) onde este extra vale
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  is_deleted      boolean     DEFAULT false
);

COMMENT ON TABLE public.study_extra_events IS 'Eventos avulsos/exceções para semanas específicas. weekdays = array de dias da semana, week_starts = array de datas (segundas-feiras) das semanas onde ocorre. user_id = Supabase user_id (auth.jwt() ->> ''sub'').';

-- Índices
CREATE INDEX IF NOT EXISTS idx_study_extra_events_user ON public.study_extra_events (user_id);
CREATE INDEX IF NOT EXISTS idx_study_extra_events_user_task ON public.study_extra_events (user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_study_extra_events_user_week_start ON public.study_extra_events (user_id, week_starts);

-- RLS
ALTER TABLE public.study_extra_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_extra_events_select_own" ON public.study_extra_events;
CREATE POLICY "study_extra_events_select_own"
  ON public.study_extra_events FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_extra_events_insert_own" ON public.study_extra_events;
CREATE POLICY "study_extra_events_insert_own"
  ON public.study_extra_events FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_extra_events_update_own" ON public.study_extra_events;
CREATE POLICY "study_extra_events_update_own"
  ON public.study_extra_events FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_extra_events_delete_own" ON public.study_extra_events;
CREATE POLICY "study_extra_events_delete_own"
  ON public.study_extra_events FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 5. study_occurrences — Ocorrências Individuais (Motor)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_occurrences (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text        NOT NULL,
  source_type             text        NOT NULL CHECK (source_type IN ('block', 'extra')), -- 'block' = weekly_block, 'extra' = extra_event
  source_id               uuid        NOT NULL, -- ID do weekly_block ou extra_event que gerou
  occurrence_date         date        NOT NULL, -- data específica da ocorrência
  start_time              time        NOT NULL, -- HH:MM:SS
  end_time                time        NOT NULL, -- HH:MM:SS
  task_id                 uuid        NOT NULL REFERENCES public.study_tasks(id) ON DELETE CASCADE, -- denormalizado
  task_name               text        NOT NULL, -- denormalizado
  task_color              text        NOT NULL, -- denormalizado
  task_activity_type      text        NOT NULL CHECK (task_activity_type IN ('theory', 'questions', 'review', 'cards', 'exam', 'break', 'other')), -- denormalizado
  theme                   text        NOT NULL DEFAULT '', -- tema resolvido (baseado na theme_rule + theme_timeline)
  status                  text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'missed')),
  override_theme          text, -- override manual do tema (opcional)
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  is_deleted              boolean     DEFAULT false
);

COMMENT ON TABLE public.study_occurrences IS 'Ocorrências individuais geradas pelo motor. Cada linha = um evento específico num dia/hora. source_type = block|extra. theme = tema resolvido dinamicamente. status = pending|done|missed. user_id = Supabase user_id (auth.jwt() ->> ''sub'').';

-- Índices
CREATE INDEX IF NOT EXISTS idx_study_occurrences_user ON public.study_occurrences (user_id);
CREATE INDEX IF NOT EXISTS idx_study_occurrences_user_date ON public.study_occurrences (user_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_study_occurrences_user_status ON public.study_occurrences (user_id, status);
CREATE INDEX IF NOT EXISTS idx_study_occurrences_source ON public.study_occurrences (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_study_occurrences_task ON public.study_occurrences (task_id);

-- RLS
ALTER TABLE public.study_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_occurrences_select_own" ON public.study_occurrences;
CREATE POLICY "study_occurrences_select_own"
  ON public.study_occurrences FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_occurrences_insert_own" ON public.study_occurrences;
CREATE POLICY "study_occurrences_insert_own"
  ON public.study_occurrences FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_occurrences_update_own" ON public.study_occurrences;
CREATE POLICY "study_occurrences_update_own"
  ON public.study_occurrences FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "study_occurrences_delete_own" ON public.study_occurrences;
CREATE POLICY "study_occurrences_delete_own"
  ON public.study_occurrences FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);

-- ============================================================
-- 6. FUNÇÕES AUXILIARES PARA RPC (OPCIONAL - para sync otimizado)
-- ============================================================

-- Função para buscar study_tasks do usuário (para sync incremental)
CREATE OR REPLACE FUNCTION public.buscar_study_tasks_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_tasks
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.study_tasks
  WHERE user_id = p_user_id
    AND updated_at >= p_last_sync
    AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

-- Função para buscar study_theme_timelines do usuário
CREATE OR REPLACE FUNCTION public.buscar_study_theme_timelines_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_theme_timelines
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.study_theme_timelines
  WHERE user_id = p_user_id
    AND updated_at >= p_last_sync
    AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

-- Função para buscar study_weekly_blocks do usuário
CREATE OR REPLACE FUNCTION public.buscar_study_weekly_blocks_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_weekly_blocks
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.study_weekly_blocks
  WHERE user_id = p_user_id
    AND updated_at >= p_last_sync
    AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

-- Função para buscar study_extra_events do usuário
CREATE OR REPLACE FUNCTION public.buscar_study_extra_events_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_extra_events
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.study_extra_events
  WHERE user_id = p_user_id
    AND updated_at >= p_last_sync
    AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

-- Função para buscar study_occurrences do usuário
CREATE OR REPLACE FUNCTION public.buscar_study_occurrences_usuario(p_user_id text, p_last_sync timestamptz)
RETURNS SETOF public.study_occurrences
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.study_occurrences
  WHERE user_id = p_user_id
    AND updated_at >= p_last_sync
    AND is_deleted = false
  ORDER BY updated_at ASC;
$$;

-- Funções de batch insert/update para sync (usadas pelo queueService)
CREATE OR REPLACE FUNCTION public.salvar_study_tasks_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_tasks (id, user_id, name, activity_type, color, theme_rule, default_duration_min, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'name',
    r->>'activity_type',
    r->>'color',
    r->>'theme_rule',
    (r->>'default_duration_min')::int,
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    activity_type = EXCLUDED.activity_type,
    color = EXCLUDED.color,
    theme_rule = EXCLUDED.theme_rule,
    default_duration_min = EXCLUDED.default_duration_min,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;

CREATE OR REPLACE FUNCTION public.salvar_study_theme_timelines_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_theme_timelines (id, user_id, period_type, period_start, themes, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'period_type',
    (r->>'period_start')::date,
    (r->>'themes')::text[],
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    period_type = EXCLUDED.period_type,
    period_start = EXCLUDED.period_start,
    themes = EXCLUDED.themes,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;

CREATE OR REPLACE FUNCTION public.salvar_study_weekly_blocks_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_weekly_blocks (id, user_id, task_id, weekday, start_time, end_time, effective_from, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'task_id',
    (r->>'weekday')::int,
    r->>'start_time',
    r->>'end_time',
    (r->>'effective_from')::date,
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
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;

CREATE OR REPLACE FUNCTION public.salvar_study_extra_events_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_extra_events (id, user_id, task_id, weekdays, start_time, end_time, week_starts, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'task_id',
    (r->>'weekdays')::int[],
    r->>'start_time',
    r->>'end_time',
    (r->>'week_starts')::date[],
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    task_id = EXCLUDED.task_id,
    weekdays = EXCLUDED.weekdays,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    week_starts = EXCLUDED.week_starts,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;

CREATE OR REPLACE FUNCTION public.salvar_study_occurrences_batch(p_records jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.study_occurrences (id, user_id, source_type, source_id, occurrence_date, start_time, end_time, task_id, task_name, task_color, task_activity_type, theme, status, override_theme, created_at, updated_at, is_deleted)
  SELECT
    r->>'id',
    r->>'user_id',
    r->>'source_type',
    r->>'source_id',
    (r->>'occurrence_date')::date,
    r->>'start_time',
    r->>'end_time',
    r->>'task_id',
    r->>'task_name',
    r->>'task_color',
    r->>'task_activity_type',
    r->>'theme',
    r->>'status',
    r->>'override_theme',
    r->>'created_at',
    r->>'updated_at',
    COALESCE((r->>'is_deleted')::bool, false)
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (id) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    source_id = EXCLUDED.source_id,
    occurrence_date = EXCLUDED.occurrence_date,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    task_id = EXCLUDED.task_id,
    task_name = EXCLUDED.task_name,
    task_color = EXCLUDED.task_color,
    task_activity_type = EXCLUDED.task_activity_type,
    theme = EXCLUDED.theme,
    status = EXCLUDED.status,
    override_theme = EXCLUDED.override_theme,
    updated_at = EXCLUDED.updated_at,
    is_deleted = EXCLUDED.is_deleted;
$$;