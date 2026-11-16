# RELATÓRIO DE EXPLORAÇÃO — Una Vox (revisa-flash)

---

## 1. PÁGINA DA AULA

**Rota/Componente:** `src/components/aulas/AulasPage.tsx` — página principal que renderiza a árvore de aulas + player.

| Elemento | Componente | Fonte dos dados |
|----------|------------|-----------------|
| **Player de vídeo** | `AulaPlayer` (em `src/components/aulas/AulaPlayer.tsx`) | `aula.terabox_url` vem do campo `terabox_url` da interface `Aula` (via `aulaService.ts`) → Supabase `aulas.terabox_url` |
| **Botão "Marcar como concluída"** | Dentro de `AulasPage` (linha ~183) | `concluidas` state em `localStorage` (`unavox_aulas_concluidas_${userId}`) — **não persiste no backend** |
| **Botão "Favoritar"** | Dentro de `AulasPage` (linha ~198) | `favoritas` state em `localStorage` (`unavox_aulas_favoritas_${userId}`) — **não persiste no backend** |
| **Botão "Criar flashcard"** | Abre `CriarFlashcardAulaModal` (em `src/components/CriarFlashcardAulaModal.tsx`) | Contexto `FlashcardContext` |
| **Card "Sobre esta aula"** | Renderizado inline em `AulasPage` (linha ~246) | `aula.descricao` do objeto `AulaFormatada` (vem de `aulasArvore.ts::formatarAula`) |
| **Botões Anterior/Próxima** | Dentro de `AulasPage` (linha ~257) | Navegação baseada em `listaNavegacao` (achatamento da árvore via `aulasArvore.ts::achatarArvore`) |

**Dados da aula:** vêm de `getAulasDoUsuario(user.id)` em `src/services/aulaService.ts` → query Supabase `select * from aulas where user_id = ? order by ordem`. O RxDB **não** guarda aulas; tudo vem do Supabase e é formatado em `aulasArvore.ts`.

---

## 2. TABELA DE AULAS (`aulas`)

**Schema RxDB (`src/lib/db.ts`, ~linha 800):**
```typescript
const aulaSchema = {
  title: 'aula schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string' },
    user_id: { type: 'string' },
    titulo: { type: 'string' },
    descricao: { type: 'string' },
    terabox_url: { type: 'string' },
    disciplina: { type: 'string' },
    assunto: { type: 'string' },
    subassunto: { type: ['string', 'null'], default: null },
    assunto_ordem: { type: ['number', 'null'], default: null },
    ordem: { type: 'number', default: 0 },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    isDeleted: { type: 'boolean', default: false },
  },
  required: ['id', 'user_id', 'titulo'],
};
```

**Interface TypeScript (`src/services/aulaService.ts`):**
```typescript
export interface Aula {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  terabox_url: string;
  disciplina?: string;
  assunto?: string;
  subassunto?: string | null;
  assunto_ordem?: number | null;
  ordem?: number;
  created_at: string;
}
```

**Colunas Supabase (migrações):**
- `20261115_add_ordem_to_aulas.sql`: adiciona `ordem integer NOT NULL DEFAULT 0` + índice `(user_id, disciplina, assunto, ordem)`
- `20261116_add_subassunto_e_assunto_ordem_to_aulas.sql`: adiciona `subassunto text` (nullable) + `assunto_ordem integer` (nullable) + recria índice `(user_id, disciplina, assunto, subassunto, assunto_ordem, ordem)`

**Sincronização:** O RxDB tem schema de `aulas` mas **não há código de sync** para essa tabela em `db.ts` (não vejo `aulas` no `syncCollections` nem listeners de mudança). Hoje as aulas só são lidas do Supabase via `aulaService.getAulasDoUsuario()`.

---

## 3. PDFs DA PÁGINA DE CONTEÚDO

**Arquivos principais:**
- **Upload/Lista/Download/Offline:** `src/services/fileService.ts` — usa bucket Supabase Storage **`topic-files`**
- **Visualizador (com grifos, notas, caixas):** `src/components/PdfViewer.tsx` (usa `react-pdf`)
- **Cache offline (IndexedDB via Cache API):** `src/services/pdfCache.ts` — `ensureCached(fileId, url)` salva blob no Cache API; `getPdfBlob(fileId)` recupera
- **Metadados no RxDB (`src/lib/db.ts`):**
  - `fileSchema` — tabela `files` (id, user_id, disciplina, topico_id, nome, tipo, url, storage_path, descricao, created_at, updated_at)
  - `pdfHighlightSchema` — grifos por página
  - `pdfNoteSchema` — notas vinculadas a grifos ou página
  - `pdfTextBoxSchema` — caixas de texto livres

**Onde ficam os arquivos:**
- **Binário:** Supabase Storage bucket `topic-files` (caminho: `${userId}/${topicoId}/${uuid}.${ext}`)
- **Cache offline:** Cache API (`pdfCache.ts`) — armazena blob do PDF para leitura offline
- **Metadados:** Tabela Supabase `files` + RxDB `files` collection (sync bidirecional via `queueService`)

**Autenticação do upload:** `getSupabaseWithToken()` em `src/lib/supabaseClient.ts` — injeta `Authorization: Bearer <clerk-token>` no header. Clerk → template `supabase1` → JWT assinado pelo Clerk, validado pelo Supabase via JWKS. **Não usa Supabase Auth diretamente.**

---

## 4. OFFLINE / PWA

**Service Worker:** `public/sw.js`
- **Estratégia:**
  - **HTML (documentos/SPA routes):** `networkFirst` — sempre tenta rede; fallback para `/index.html` em cache
  - **Assets estáticos (`/assets/`, ícones, manifest):** `cacheFirst` — serve do cache, revalida em background
- **Cache name:** `una-vox-v2`
- **Exclusões:** Hosts `clerk`, `supabase`, `chrome-extension` + métodos não-GET → **não intercepta**
- **SPA routes listadas:** `/aulas`, `/conteudo`, `/flashcards`, `/simulados`, `/listas`, `/calendario`, etc. → todas caem no `networkFirst`

**Interferência em vídeos grandes / github.com:**
- **Vídeos (terabox_url):** O SW **não intercepta** porque `terabox_url` é domínio externo (não passa pelo SW do app). O player `AulaPlayer` usa `<video src={teraboxUrl}>` direto — **sem cache offline**.
- **github.com:** Excluído por não estar na lista `EXCLUDED_HOSTS`, mas também não está em `STATIC_ASSETS` nem nas rotas SPA → cai no `cacheFirst` genérico. Como não é same-origin, o browser bloqueia o SW de interceptar cross-origin (CORS). **Não interfere.**

**Gap para vídeo offline:** O SW atual **não suporta** cache de streams de vídeo (range requests, partial content). Para baixar vídeo, precisaria de:
1. Download do blob via `fetch` + armazenar no IndexedDB (ou Cache API com `Response` completo)
2. `URL.createObjectURL(blob)` para player offline
3. Background download / Service Worker com `streams` API (complexo)

---

## 5. CONTEXTOS EXISTENTES (`src/contexts/`)

| Arquivo | Propósito | Modelo recomendado para copiar |
|---------|-----------|-------------------------------|
| `ErrorContext.tsx` | Erros de questões, sync RxDB↔Supabase, queue offline | **Melhor modelo** — completo: loadData, listener RxDB `$.subscribe()`, CRUD com `editError`/`deleteError` usando `incrementalPatch`, enqueue em falha, `useMemo` no provider |
| `StudyContext.tsx` | Registros de estudo, recálculo de revisões ao deletar | Bom para lógica de "recalcular algo ao deletar" (ex: `deleteRecord` chama `updateTopicStatusAndRevisions`) |
| `FlashcardContext.tsx` | Decks, cards, FSRS | Útil se novo contexto envolver spaced repetition |
| `UserContext.tsx` | Clerk user + fallback offline (localStorage) | Base para qualquer contexto que precise de `userId` |
| `ActiveSessionContext`, `LoadingContext`, `MusicContext`, `PomodoroContext`, `ThemeContext` | UI/estado global simples | Menos relevantes para dados persistidos |

**Padrão canônico (copiar de `ErrorContext`):**
1. `createContext` + `useContext` hook
2. `Provider` com `useState` para `records`, `userId`, `loading`
3. `loadData()` lê do RxDB (com `isDeleted: { $ne: true }`) + `loadDisciplines()` opcional
4. `useEffect` inicial + listener RxDB `collection.$.subscribe()` com debounce (500ms) → `loadData()`
5. CRUD: `insert` no RxDB → `setRecords` otimista → `supabase.from(...).insert` → `catch` → `enqueueOperation`
6. `edit`: `doc.incrementalPatch()` → `supabase.update()` → `catch` → `enqueueOperation`
7. `delete`: soft delete (`isDeleted: true`) → `supabase.update({ isDeleted: true })` → `catch` → `enqueueOperation`
8. `useMemo` no `value` do Provider

---

## 6. SUPABASE — MIGRAÇÕES E RLS

**Organização:** `supabase/migrations/*.sql` (numeradas por data)
- `20261115_add_ordem_to_aulas.sql`
- `20261116_add_subassunto_e_assunto_ordem_to_aulas.sql`
- (Outras migrações existem mas não listadas no glob)

**Exemplo de política RLS (tabela `files` — inferida do padrão do projeto):**
```sql
-- Habilita RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Usuário vê seus arquivos
CREATE POLICY "Users can view own files"
  ON files FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário insere seus arquivos
CREATE POLICY "Users can insert own files"
  ON files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Usuário atualiza seus arquivos
CREATE POLICY "Users can update own files"
  ON files FOR UPDATE
  USING (auth.uid() = user_id);

-- Usuário deleta seus arquivos
CREATE POLICY "Users can delete own files"
  ON files FOR DELETE
  USING (auth.uid() = user_id);
```

> **Nota:** O projeto usa **Clerk** para auth, não `auth.uid()` nativo do Supabase. O JWT do Clerk tem `sub` = Clerk user ID. As policies reais usam `request.jwt.claims.sub = user_id` (ou via `auth.jwt()`), não `auth.uid()`. Verifique `supabase/functions/clerk-webhook/index.ts` para como o `user_id` é mapeado.

**Clerk Webhook (`supabase/functions/clerk-webhook/index.ts`):** sincroniza usuários Clerk → tabela `users` (ou `profiles`) no Supabase para que RLS funcione com `user_id` = Clerk ID.

---

## 7. UI — BIBLIOTECA E COMPONENTES

**Biblioteca:** **shadcn/ui** (Radix UI + Tailwind + class-variance-authority)
- Componentes em `src/components/ui/` — `card.tsx`, `button.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, etc.
- Usa `cn()` de `src/lib/utils.ts` (merge de `clsx` + `tailwind-merge`)

**Card reutilizável:** `src/components/ui/card.tsx`
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição</CardDescription>
  </CardHeader>
  <CardContent>Conteúdo</CardContent>
  <CardFooter>Ações</CardFooter>
</Card>
```

**Button reutilizável:** `src/components/ui/button.tsx` — variantes: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; tamanhos: `default`, `sm`, `lg`, `icon`.

**Ícones:** `lucide-react` — import direto: `import { Play, ChevronLeft, ChevronRight, CheckCircle, Heart, PlusSquare, Folder, BookOpen, Layers } from 'lucide-react';`

**Estilos customizados da página de aulas:** `src/components/aulas/AulasStyles.tsx` — injeta `<style>` com precedence via `AulasStyles` component (usa tokens CSS do design system: `--surface`, `--border`, `--primary`, `--au-tone`, etc.)

---

## 8. PROBLEMAS / INCONSISTÊNCIAS IDENTIFICADOS

| # | Problema | Impacto nas novas features |
|---|----------|----------------------------|
| **1** | **Aulas não sincronizam no RxDB** — schema existe mas não há sync listener nem `pushWithConflictCheck` para `aulas` | "Material de Apoio" por aula precisará de sync próprio ou migrar aulas para RxDB primeiro |
| **2** | **Concluída/Favorita só no localStorage** — não persiste no Supabase, não sincroniza entre dispositivos | Se "Material de Apoio" for por aula, o estado de "concluída" do PDF não sincroniza |
| **3** | **Vídeo (terabox_url) não tem suporte offline** — SW não cacheia cross-origin, player não usa blob | "Baixar vídeo para offline" exige implementação nova: download + IndexedDB + `URL.createObjectURL` |
| **4** | **`fileService.ts` usa `topic_files` (tópicos de estudo), não `aulas`** — bucket e tabela `files` vinculados a `topico_id`, não `aula_id` | Para "Material de Apoio por aula", criar nova tabela `aula_arquivos` (aula_id, file_id) ou estender `files` com `aula_id` nullable |
| **5** | **`aula.descricao` é string simples** — o card "Sobre esta aula" mostra texto plano; para PDFs anexados precisará de lista/renderer | Precisa de componente novo para listar PDFs da aula (semelhante a `PdfViewer` mas só lista + download) |
| **6** | **RxDB `fileSchema` version 0** — se adicionar `aula_id` depois, precisa migração de schema (version++) | Planejar schema v1 com `aula_id?: string` desde o início |
| **7** | **Clerk token template `supabase1`** — hardcoded em `supabaseClient.ts`; se mudar no painel Clerk, quebra auth | Documentar ou tornar configurável via env |
| **8** | **`PdfViewer` carrega grifos/notas/caixas do RxDB por `file_id`** — funciona para PDFs de tópicos; para aulas precisaria mesmo padrão | Reutilizar `pdfCache`, `pdf_highlights`, `pdf_notes`, `pdf_text_boxes` — só mudar `file_id` → `aula_arquivo_id` |

---

## RESUMO PARA IMPLEMENTAÇÃO

### (a) Material de Apoio (PDFs por aula)
1. **Nova tabela/coleção:** `aula_arquivos` (id, aula_id, file_id, ordem, created_at) — ou estender `files` com `aula_id` nullable
2. **Bucket:** reutilizar `topic-files` ou criar `aula-files`
3. **Upload:** adaptar `fileService.uploadFile` para aceitar `aulaId` + `topicoId` opcional
4. **Lista na página da aula:** novo componente `AulaAnexos` (card shadcn + lista de arquivos + botão download) no lugar do card "Sobre esta aula"
5. **Offline:** reutilizar `pdfCache.ensureCached(fileId, url)` — já funciona para qualquer file_id

### (b) Baixar vídeo para offline
1. **Nova tabela:** `aula_videos_offline` (id, aula_id, blob_data [ou path no IndexedDB], tamanho, downloaded_at)
2. **Download:** botão no player → `fetch(terabox_url)` → `blob()` → `indexedDB` (via `idb` lib ou `localforage`) → `URL.createObjectURL(blob)` para player
3. **Player offline:** detectar se `aula_id` tem blob salvo → usar `blobUrl` em vez de `terabox_url`
4. **Limpeza:** opção "Remover download" + listener `storage` estimate/quota

---

**Arquivos-chave para editar:**
- `src/components/aulas/AulasPage.tsx` — injetar nova seção de anexos
- `src/services/fileService.ts` — adicionar `aulaId` no upload/listagem
- `src/lib/db.ts` — adicionar schema `aula_arquivos` + sync
- `src/components/aulas/AulaPlayer.tsx` — adicionar botão download + lógica offline
- `src/services/pdfCache.ts` — já pronto para uso genérico
- `supabase/migrations/YYYYMMDD_add_aula_arquivos.sql` — nova migração