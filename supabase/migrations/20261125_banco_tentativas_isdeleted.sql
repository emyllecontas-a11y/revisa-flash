-- ============================================================
-- BANCO_TENTATIVAS: adicionar coluna isdeleted + índice
-- ============================================================
-- IMPORTANTE: este arquivo deve ser executado ANTES de publicar o
-- código novo. Ele prepara a tabela remota para o sync de histórico
-- de respostas do Banco de Questões.
--
-- As policies (RLS) NÃO são tratadas aqui — serão ajustadas em outra
-- etapa. Este arquivo SOMENTE adiciona a coluna isdeleted e um índice
-- de apoio à consulta por usuário + data.
--
-- É idempotente: pode ser executado mais de uma vez sem problema.
-- ============================================================

-- Coluna de exclusão lógica (soft delete), igual às outras tabelas do app.
ALTER TABLE public.banco_tentativas
  ADD COLUMN IF NOT EXISTS isdeleted boolean DEFAULT false;

-- Índice para acelerar consultas por usuário ordenadas por data de criação
-- (usado nas estatísticas e no histórico por período).
CREATE INDEX IF NOT EXISTS idx_banco_tentativas_user_created
  ON public.banco_tentativas (user_id, created_at);