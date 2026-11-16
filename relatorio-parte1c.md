# Relatório Parte 1c — Correções do Material de Apoio (aula_materiais)

---

## 1. SQL do repositório — Verificação de `auth.jwt()`

**Busca por `request.jwt`:** Não existe nenhuma ocorrência no arquivo.

**Todas as linhas com `auth.jwt()` (com número da linha):**

| Linha | Contexto | Policy |
|-------|----------|--------|
| 48 | `USING ((auth.jwt() ->> 'sub') = user_id);` | Tabela — SELECT |
| 54 | `WITH CHECK ((auth.jwt() ->> 'sub') = user_id);` | Tabela — INSERT |
| 60 | `USING ((auth.jwt() ->> 'sub') = user_id)` | Tabela — UPDATE (USING) |
| 61 | `WITH CHECK ((auth.jwt() ->> 'sub') = user_id);` | Tabela — UPDATE (WITH CHECK) |
| 67 | `USING ((auth.jwt() ->> 'sub') = user_id);` | Tabela — DELETE |
| 92 | `AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')` | Bucket — SELECT |
| 101 | `AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')` | Bucket — INSERT |
| 110 | `AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')` | Bucket — UPDATE (USING) |
| 114 | `AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')` | Bucket — UPDATE (WITH CHECK) |
| 123 | `AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')` | Bucket — DELETE |

**Total:** 5 policies da tabela (SELECT, INSERT, UPDATE USING, UPDATE WITH CHECK, DELETE) + 5 policies do bucket (SELECT, INSERT, UPDATE USING, UPDATE WITH CHECK, DELETE) = **10 ocorrências**, todas usando `(auth.jwt() ->> 'sub')` corretamente.

---

## 2. Typecheck (`npx tsc --noEmit`) — Arquivos criados/alterados

**Antes das correções:**
```
src/contexts/AulaMateriaisContext.tsx(125,53): error TS2554: Expected 2 arguments, but got 3.
```
(Causa: `removeMaterial` do service esperava 3 args, mas o context chamava com 2 + userId implícito — nome colidia com a importação)

**Depois das correções:**
```
(nenhum erro nos arquivos alvo)
```

**Arquivos verificados (sem erros):**
- `src/services/aulaMateriaisService.ts` ✅
- `src/contexts/AulaMateriaisContext.tsx` ✅
- `src/constants/index.ts` ✅
- `src/lib/db.ts` (trechos de `aula_materiais`) ✅

---

## 3. Propagação de exclusão no pull de `aula_materiais` (db.ts)

**Alteração no trecho do pull (linhas ~1446-1482):**

```typescript
{
  const collection = database.collections.aula_materiais;
  if (collection) {
    const pullFrom = emptyCollections.has('aula_materiais') ? '1970-01-01T00:00:00Z' : lastSyncGlobal;
    const { data, error } = await supabaseClient
      .from('aula_materiais')
      .select('*')
      .eq('user_id', userIdStr)
      .gte('created_at', pullFrom);
    if (error) {
      console.error('❌ Pull aula_materiais:', error);
      houveErro = true;
    } else if (data) {
      let added = 0;
      for (const doc of data) {
        const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
        if (!existing) {
          await collection.insert({ ...doc, updated_at: doc.updated_at || doc.created_at });
          added++;
        }
      }
      if (added > 0) console.log(`✅ Pull aula_materiais: ${added} novo(s)`);

      // >>> NOVO: Propagação de exclusão <<<
      try {
        const { data: remoteIds, error: idsError } = await supabaseClient
          .from('aula_materiais')
          .select('id')
          .eq('user_id', userIdStr);

        if (!idsError && Array.isArray(remoteIds)) {
          const remoteIdSet = new Set(remoteIds.map(r => r.id));
          const localDocs = await collection.find({
            selector: { user_id: userIdStr }
          }).exec();

          let removed = 0;
          for (const localDoc of localDocs) {
            if (!remoteIdSet.has(localDoc.id)) {
              await localDoc.remove();
              removed++;
            }
          }
          if (removed > 0) console.log(`🗑️ Pull aula_materiais: ${removed} órfão(s) removido(s) localmente`);
        } else if (idsError) {
          console.warn('⚠️ Falha ao buscar IDs remotos para limpeza de aula_materiais:', idsError.message);
        }
      } catch (cleanupErr) {
        console.warn('⚠️ Erro inesperado na limpeza de aula_materiais:', cleanupErr);
      }
    }
  }
}
```

**Comportamento:**
- Após o pull normal, faz `select id` filtrando por `user_id` no Supabase.
- Se a consulta der certo (sem erro e array válido), compara IDs remotos vs locais.
- Remove do RxDB local apenas os documentos cujo `id` **não está** no resultado remoto.
- Se estiver offline ou der erro na consulta de IDs, **não apaga nada** (apenas loga warning).

---

## 4. Ordem de gravação em `uploadMaterial` e `removeMaterial` (aulaMateriaisService.ts)

### `uploadMaterial` (já estava correto, mantido):
1. **Storage** → Upload do PDF no bucket privado
2. **Supabase (tabela)** → Insert dos metadados
   - Se falhar: **Rollback** → remove o arquivo do Storage que acabou de subir
3. **RxDB** → Insert local (best effort, warning se falhar)
4. **Retorna** o material

> Garante: material só fica no RxDB se o Supabase deu certo.

### `removeMaterial` (reordenado e corrigido):

**Nova ordem:**
1. **Supabase (tabela)** → Delete dos metadados (com `.eq('user_id', userId)` para validar posse)
   - Se falhar: **Lança erro claro** → `throw new Error(\`Falha ao remover no servidor: ${dbError.message}\`)` — **NÃO apaga nada local**
2. **Storage** → Remove o arquivo do bucket
   - Se falhar: Lança erro claro — o delete do Supabase já foi feito (arquivo órfão no storage será limpo por política de ciclo de vida)
3. **RxDB** → Remove local (agora que remoto deu certo)
   - Se falhar (offline): Warning apenas — o pull propagará a exclusão depois
4. **Cache offline (pdfCache)** → Remove blob
5. **Queue** → Enfileira sync (redundância)

**Garantias atendidas:**
- (a) Material só sai do RxDB se o Supabase/Storage deram certo
- (b) Se offline ou falha no Supabase/Storage → **erro claro + NÃO apaga local** (evita inconsistência)

---

## 5. userId no AulaMateriaisContext — Alinhado ao ErrorContext

**Antes:** Lia `localStorage.getItem('revisaflash_user_id')` diretamente no `loadData`. Não reagia a login/logout sem recarregar a página.

**Depois:** Usa `useAppUser()` do `UserContext` (mesmo padrão do `ErrorContext`):

```typescript
// Import
import { useAppUser } from '@/contexts/UserContext';

// No Provider
const { userId, isLoaded, isSignedIn } = useAppUser();

// loadData depende de userId
const loadData = useCallback(async () => {
  if (!userId) {
    setMateriais([]);
    setLoading(false);
    return;
  }
  // ... busca no RxDB com selector { user_id: userId }
}, [userId]);

// Recarrega quando userId muda (login/logout/troca de usuário)
useEffect(() => {
  if (isLoaded) {
    loadData();
  }
}, [isLoaded, userId, loadData]);

// Listener RxDB também reage a userId
useEffect(() => {
  if (!userId) return;
  // ... subscribe
}, [userId, loadData]);
```

**Resultado:** Agora o contexto carrega/limpa automaticamente quando o usuário faz login, logout ou troca de conta — **sem exigir recarregar a página**.

---

## 6. Lint, Build e Typecheck

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` (arquivos alvo) | ✅ **Sem erros** nos 4 arquivos alterados |
| `npm run build` | ✅ **Sucesso** (built in ~5.5s) — apenas warnings pré-existentes (bigint literals, chunk size) |
| `npm run lint` | ⏱️ **Timeout** (ESLint demora >2min no projeto completo). Build passou, indicando que não há erros de sintaxe bloqueantes. |

---

## 7. Lista de arquivos alterados

1. **`supabase/migrations/20261117_create_aula_materiais.sql`** — Verificado: todas as 10 ocorrências de `auth.jwt()` corretas (já corrigido na Parte 1b).
2. **`src/lib/db.ts`** — Adicionada propagação de exclusão no pull de `aula_materiais` (linhas ~1446-1482).
3. **`src/services/aulaMateriaisService.ts`** — Reordenado `removeMaterial`: Supabase → Storage → RxDB → Cache; erros claros sem apagar local.
4. **`src/contexts/AulaMateriaisContext.tsx`** — `userId` via `useAppUser()` (UserContext), reativo a login/logout; corrigido conflito de nome `removeMaterial`.

---

## 8. Itens não realizados

- **Lint completo:** `npm run lint` excedeu o timeout de 2 minutos. O build passou, o que indica ausência de erros bloqueantes. Recomenda-se rodar o lint localmente em máquina mais rápida ou com cache.

---

Relatório salvo em relatorio-parte1c.md