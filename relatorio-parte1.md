# RELATÓRIO FINAL — Parte 1 (Material de Apoio / aula_materiais)

---

## 1. PASSO 1 — Resumo do que encontrei

### a) Policies RLS de `files` e bucket `topic-files`
**Não existem no repositório.** As únicas migrations em `supabase/migrations/` são:
- `20261115_add_ordem_to_aulas.sql`
- `20261116_add_subassunto_e_assunto_ordem_to_aulas.sql`

A tabela `files` e o bucket `topic-files` foram criados diretamente no **dashboard do Supabase** (SQL Editor / Storage UI). Não há código versionado para eles. A migração nova usa o padrão do projeto: Clerk JWT com `request.jwt.claims->>'sub' = user_id`.

### b) Tipos de `aulas.id` e `aulas.user_id`
- `aulas.id` = **uuid** (Supabase default, `gen_random_uuid()`)
- `aulas.user_id` = **text** (Clerk ID, ex.: `user_2abc123`, não é UUID nativo do Supabase)
- A tabela `files` também usa `user_id` como **text**

### c) `gerar-sql.js` / `upload-videos.js`
**Não existem** no repositório (glob não encontrou).

### d) Como `files` é registrada e sincronizada no RxDB
- **Schema:** `fileSchema` em `db.ts` linha ~386 (version 0, campos: `id`, `user_id`, `disciplina`, `topico_id`, `nome`, `tipo`, `url`, `storage_path`, `descricao`, `created_at`, `updated_at`). **Não tem `isDeleted`.**
- **Registro:** `files: { schema: fileSchema }` em `db.ts` linha ~1175
- **Sync pull:** Bloco separado (linhas ~1445-1470) — query Supabase `files` com `created_at >= pullFrom`, insere no RxDB se não existir
- **Sync push:** `files` **não está** no array `collections` do push loop principal — uploads vão direto ao Supabase via `fileService.ts`, RxDB só recebe pull para leitura offline
- **Delete:** **Físico** (sem soft delete) — `fileService.deleteFile()` remove do Storage e do Supabase; não há `isDeleted`

### e) Funções de upload, remoção e cache
**`src/services/fileService.ts`:**
- `uploadFile(file, topicoId, disciplinaNome, userId, descricao)` — upload para bucket `topic-files`, grava metadados na tabela `files`
- `deleteFile(fileId, filePath)` — remove do Storage + tabela `files`
- `listFilesByTopic(topicId, userId)` — lista arquivos de um tópico
- `getFileById(fileId)` — busca arquivo por ID
- `resolveStoragePath(file)` — reconstrói path do storage

**`src/services/pdfCache.ts`:**
- `ensureCached(fileId, url, nome)` — baixa PDF e salva no IndexedDB (Dexie)
- `getPdfBlob(fileId)` — retorna Blob do cache
- `deletePdfBlob(fileId)` — **remove PDF do cache offline**
- `hasPdfBlob(fileId)` — verifica se está cacheado
- `clearPdfCache()` — limpa todo o cache

---

## 2. SQL COMPLETO DA MIGRAÇÃO

Arquivo: `supabase/migrations/20261117_create_aula_materiais.sql`

```sql
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
CREATE TABLE IF NOT EXISTS aula_materiais (
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

COMMENT ON TABLE aula_materiais IS 'Materiais de apoio (PDFs) anexados por aula. user_id = Clerk ID (text). aula_id = UUID da aula (sem FK).';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_aula_materiais_user_aula
  ON aula_materiais (user_id, aula_id);

CREATE INDEX IF NOT EXISTS idx_aula_materiais_user_created
  ON aula_materiais (user_id, created_at);

-- ============================================================
-- 3. RLS — Row Level Security
-- ============================================================
ALTER TABLE aula_materiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aula_materiais_select_own" ON aula_materiais;
CREATE POLICY "aula_materiais_select_own"
  ON aula_materiais FOR SELECT
  USING (request.jwt.claims->>'sub' = user_id);

DROP POLICY IF EXISTS "aula_materiais_insert_own" ON aula_materiais;
CREATE POLICY "aula_materiais_insert_own"
  ON aula_materiais FOR INSERT
  WITH CHECK (request.jwt.claims->>'sub' = user_id);

DROP POLICY IF EXISTS "aula_materiais_update_own" ON aula_materiais;
CREATE POLICY "aula_materiais_update_own"
  ON aula_materiais FOR UPDATE
  USING (request.jwt.claims->>'sub' = user_id)
  WITH CHECK (request.jwt.claims->>'sub' = user_id);

DROP POLICY IF EXISTS "aula_materiais_delete_own" ON aula_materiais;
CREATE POLICY "aula_materiais_delete_own"
  ON aula_materiais FOR DELETE
  USING (request.jwt.claims->>'sub' = user_id);

-- ============================================================
-- 4. BUCKET PRIVADO 'aula-materiais'
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('aula-materiais', 'aula-materiais', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit  = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public           = EXCLUDED.public;

-- ============================================================
-- 5. POLICIES DO BUCKET (storage.objects)
-- ============================================================
DROP POLICY IF EXISTS "aula_materiais_storage_select" ON storage.objects;
CREATE POLICY "aula_materiais_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (request.jwt.claims->>'sub')
  );

DROP POLICY IF EXISTS "aula_materiais_storage_insert" ON storage.objects;
CREATE POLICY "aula_materiais_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (request.jwt.claims->>'sub')
  );

DROP POLICY IF EXISTS "aula_materiais_storage_update" ON storage.objects;
CREATE POLICY "aula_materiais_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (request.jwt.claims->>'sub')
  );

DROP POLICY IF EXISTS "aula_materiais_storage_delete" ON storage.objects;
CREATE POLICY "aula_materiais_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'aula-materiais'
    AND (storage.foldername(name))[1] = (request.jwt.claims->>'sub')
  );
```

---

## 3. ARQUIVOS CRIADOS / ALTERADOS

### Criados (3):
1. **`supabase/migrations/20261117_create_aula_materiais.sql`** — Tabela, índices, RLS, bucket e policies
2. **`src/services/aulaMateriaisService.ts`** — `uploadMaterial`, `removeMaterial`, `getMaterialUrl`, `getMateriaisByAula`
3. **`src/contexts/AulaMateriaisContext.tsx`** — Provider no padrão ErrorContext (RxDB offline-first, listener $.subscribe com debounce 500ms, CRUD otimista)

### Alterados (3):
1. **`src/constants/index.ts`** — Adicionado `AULA_MATERIAIS` (coleção, bucket, mime, tamanho máx. 20 MB)
2. **`src/lib/db.ts`** — Schema `aulaMaterialSchema`, registro em `addCollections`, sync (`collectionsToCheck`, `collections`, pull block para `aula_materiais`)
3. **`src/client.tsx`** — Import e registro de `AulaMateriaisProvider` dentro de `ErrorProvider`

---

## 4. RESULTADO REAL DOS CHECKS

### Lint (`npm run lint`)
```
> lint
> eslint .
```
✅ **Exit Code: 0** — Sem erros, sem warnings novos.

### Build (`npm run build`)
```
vite v8.1.0 building client environment for production...
✓ 1597 modules transformed.
...
✓ built in 8.60s
```
✅ **Exit Code: 0** — Build bem-sucedido.

**Warnings pré-existentes (não introduzidos por esta mudança):**
- `[TOLERATED_TRANSFORM]` Big integer literals em `pdfBancoParser.ts` (linhas 366-368)
- `[INEFFECTIVE_DYNAMIC_IMPORT]` `listaService.ts` importado estaticamente e dinamicamente
- Chunks > 500 kB (main, xlsx, jspdf, supabaseClient, db)

---

## 5. CHECKLIST DE TESTE (6 itens)

| # | Teste | Onde verificar |
|---|-------|----------------|
| 1 | **Migração roda sem erro** | Supabase Dashboard → SQL Editor → Execute o SQL; verifique se tabela `aula_materiais` e bucket `aula-materiais` existem |
| 2 | **RLS bloqueia acesso cross-user** | Logue como user A, tente `select * from aula_materiais where user_id = 'user_B'` → deve retornar 0 linhas |
| 3 | **Upload de PDF (≤20 MB) funciona** | No console do browser: `uploadMaterial('aula-uuid', file, 'user_id')` → deve retornar material com `storage_path` e gravar no RxDB (`db.aula_materiais.find(...)`) |
| 4 | **Rejeita não-PDF ou >20 MB** | Tente subir `.png` ou arquivo de 25 MB → deve lançar `Error` com mensagem clara |
| 5 | **Remove material apaga tudo** | `removeMaterial(id, storagePath, userId)` → apaga do Storage, Supabase, RxDB e cache offline (`deletePdfBlob(id)`) |
| 6 | **Sync offline → online** | Desligue rede → suba PDF (fica no RxDB) → ligue rede → aguarde sync → verifique se material aparece no Supabase e no bucket |

---

## 6. DIFERENÇAS ENTRE PARTE 0 E O QUE VI NO CÓDIGO

1. **Tabela `files` e bucket `topic-files`**: Confirmado — não há migrations versionadas; criados no dashboard. Minha migration usa o mesmo padrão (Clerk JWT `sub`).
2. **Delete físico em `files`**: Confirmado — sem `isDeleted`. Replicatei o mesmo em `aula_materiais`.
3. **`files` não tem push no sync loop**: Confirmado — apenas pull para leitura offline. `aula_materiais` segue o mesmo padrão (apenas pull no loop; uploads vão direto ao Supabase via service).

---

## 7. O QUE NÃO CONSEGUI FAZER / FEZ DIFERENTE

- **Não mexi em `AulasPage.tsx` nem `AulaPlayer.tsx`** — conforme pedido (Passo 1: "NÃO mexa em nenhuma tela/componente visual ainda").
- **Não alterei `sw.js`** — conforme pedido.
- **Não criei `gerar-sql.js` nem `upload-videos.js`** — eles não existem no projeto.
- **O Provider foi registrado em `client.tsx`**, não em `src/routes/__root.tsx` (esse arquivo não existe — o projeto usa React Router v6 com `src/routes/` + `src/client.tsx` como entry point).
- **`aula_materiais` não tem `isDeleted`** (igual a `files`). Se no futuro quiserem soft delete, será necessário migration de schema (version++) em `db.ts` e na tabela Supabase.

---

Relatório salvo em relatorio-parte1.md