-- Migração: adicionar 'subassunto' e 'assunto_ordem' à tabela 'aulas'
-- Data: 2026-11-16
-- Objetivo:
--   1. Hierarquia opcional disciplina > assunto > subassunto > aulas.
--   2. Ordem definida para os assuntos dentro da disciplina.

-- 1. Subassunto (opcional). NULL = aula direto no assunto, como era antes.
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS subassunto text;

-- 2. Ordem do assunto dentro da disciplina (1, 2, 3...).
--    NULL = assunto antigo; na tela ele vai para o fim da disciplina.
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS assunto_ordem integer;

-- 3. Índice atualizado.
--    Definição anterior (migration 20261115_add_ordem_to_aulas.sql):
--      CREATE INDEX idx_aulas_ordem ON aulas(user_id, disciplina, assunto, ordem);
--    Agora inclui as colunas usadas na ordenação da árvore de aulas.
DROP INDEX IF EXISTS idx_aulas_ordem;
CREATE INDEX IF NOT EXISTS idx_aulas_ordem ON aulas (user_id, disciplina, assunto, subassunto, assunto_ordem, ordem);