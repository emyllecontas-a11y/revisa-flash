-- Migração: Adicionar coluna 'ordem' à tabela 'aulas'
-- Data: 2026-11-15

-- 1. Adicionar coluna 'ordem' nullable
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS ordem integer;

-- 2. Backfill: popular 'ordem' com ROW_NUMBER() por user_id, disciplina, assunto ordenado por created_at
UPDATE aulas SET ordem = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, disciplina, assunto
    ORDER BY created_at ASC
  ) AS rn
  FROM aulas
) sub
WHERE aulas.id = sub.id;

-- 3. Tornar 'ordem' NOT NULL com DEFAULT 0
ALTER TABLE aulas ALTER COLUMN ordem SET NOT NULL;
ALTER TABLE aulas ALTER COLUMN ordem SET DEFAULT 0;

-- 4. Adicionar índice composto para consultas ordenadas
CREATE INDEX IF NOT EXISTS idx_aulas_ordem ON aulas(user_id, disciplina, assunto, ordem);