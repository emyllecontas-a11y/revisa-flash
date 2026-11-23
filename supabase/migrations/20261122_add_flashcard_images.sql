-- Migração: Adicionar colunas para imagens nos flashcards
-- Data: 2026-11-22
-- Descrição: Adiciona front_image_url e back_image_url à tabela flashcards
-- para permitir armazenar URLs de imagens de frente e verso dos cards.

-- ============================================================
-- 1. ALTERAR TABELA FLASHCARDS
-- ============================================================
-- Adiciona as duas colunas de texto para armazenar URLs públicas
-- das imagens comprimidas (WebP, máx 800px, 0.5 MB) no bucket
-- Supabase Storage 'flashcard-images'.
-- As colunas são NULL por padrão (cards existentes sem imagem).
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS front_image_url TEXT,
  ADD COLUMN IF NOT EXISTS back_image_url TEXT;

-- Comentários para documentação no catálogo do Postgres
COMMENT ON COLUMN public.flashcards.front_image_url IS 'URL pública da imagem da frente do flashcard (bucket flashcard-images)';
COMMENT ON COLUMN public.flashcards.back_image_url IS 'URL pública da imagem do verso do flashcard (bucket flashcard-images)';

-- ============================================================
-- 2. OBSERVAÇÕES SOBRE RPC E SINCRONIZAÇÃO
-- ============================================================
-- Não existe RPC dedicada para flashcards (salvar_flashcards_batch etc.).
-- A sincronização RxDB ↔ Supabase usa:
--   - PUSH: pushWithConflictCheck() genérico (src/lib/db.ts) — faz upsert do documento inteiro via .from('flashcards').upsert()
--   - PULL: SELECT * FROM flashcards WHERE user_id = ... AND updated_at >= ...
-- Como as colunas foram adicionadas com ADD COLUMN IF NOT EXISTS,
-- o upsert e o select * funcionarão automaticamente sem alteração de código.
-- O schema RxDB (src/lib/db.ts) já está na versão 16 com os campos
-- front_image_url e back_image_url (type: ['string','null'], default: null).