-- ============================================================
-- TABELAS DE RANKING: ranking_conquistas e ranking_snapshots
-- ============================================================
-- Criadas para suportar o sistema de ranking/comunidade.
-- Baseado nas consultas usadas em src/services/rankingService.ts
-- ============================================================

-- ------------------------------------------------------------
-- ranking_conquistas — medalhas/conquistas conquistadas por usuário
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ranking_conquistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('medalha', 'conquista')),
  conquista_id text NOT NULL,
  periodo_tipo text NOT NULL CHECK (periodo_tipo IN ('semanal', 'mensal')),
  periodo_referencia text NOT NULL, -- ex: '2026-W48' ou '2026-11'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conquista_id, periodo_referencia)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_ranking_conquistas_user
  ON public.ranking_conquistas (user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_conquistas_user_tipo
  ON public.ranking_conquistas (user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ranking_conquistas_periodo
  ON public.ranking_conquistas (periodo_tipo, periodo_referencia);

-- RLS
ALTER TABLE public.ranking_conquistas ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas suas próprias conquistas
CREATE POLICY "Users can view own ranking_conquistas"
  ON public.ranking_conquistas FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário pode inserir suas próprias conquistas (via RPC/service role)
CREATE POLICY "Users can insert own ranking_conquistas"
  ON public.ranking_conquistas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- ranking_snapshots — snapshot diário da posição no ranking
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  periodo_tipo text NOT NULL CHECK (periodo_tipo IN ('semanal', 'mensal')),
  data_referencia date NOT NULL, -- ex: '2026-11-25'
  posicao integer NOT NULL,
  pontos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, periodo_tipo, data_referencia)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_user
  ON public.ranking_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_user_periodo
  ON public.ranking_snapshots (user_id, periodo_tipo);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_data
  ON public.ranking_snapshots (data_referencia);

-- RLS
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas seus próprios snapshots
CREATE POLICY "Users can view own ranking_snapshots"
  ON public.ranking_snapshots FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário pode inserir seus próprios snapshots (via RPC/service role)
CREATE POLICY "Users can insert own ranking_snapshots"
  ON public.ranking_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- RPC: calcular_ranking_comunidade (já deve existir no banco)
-- ------------------------------------------------------------
-- Se não existir, criar aqui. O código em rankingService.ts chama:
--   supabase.rpc('calcular_ranking_comunidade', { p_user_id, p_periodo })
-- A RPC deve retornar: user_id, pontos_totais, horas_estudadas, questoes_resolvidas, simulados_realizados
-- Esta migration NÃO cria a RPC — assume que já existe no Supabase.
-- ============================================================