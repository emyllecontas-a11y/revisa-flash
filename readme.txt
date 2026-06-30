ATENÇÃO: Antes de gerar qualquer código, siga rigorosamente as diretrizes abaixo.
TESTANDO
DIRETRIZES OBRIGATÓRIAS:

1. Use o arquivo de constantes (src/constants/index.ts) para TODOS os nomes de campos e valores fixos.
   - Exemplo: em vez de 'date', use CAMPOS.ESTUDO.DATA.
   - Em vez de 'teorico', use TIPOS_ESTUDO.TEORICO.
   - Em vez de 'estudando', use STATUS_TOPICO.ESTUDANDO.
   - Sempre importe as constantes necessárias: import { CAMPOS, TIPOS_ESTUDO, STATUS_TOPICO, ... } from '@/constants'.

2. Gere IDs usando a função uid() corrigida (que gera UUIDs válidos).
   - Importe de: import { uid } from '@/utils/helpers'.
   - NUNCA gere IDs manuais ou com Math.random() + timestamp.

3. Mantenha consistência de nomes entre:
   - Schema do RxDB (em db.ts)
   - Interface TypeScript (em contexts, types, etc.)
   - Formulários e objetos de dados
   - Tabelas do Supabase (em db.ts ou serviços)

4. Sempre verifique:
   - Se o campo existe no schema e na interface.
   - Se os nomes estão em inglês (date, type, discipline, etc.) e em camelCase.
   - Se os IDs são sempre UUIDs.

5. Para listas/selects, use as listas de constantes (ex: LISTA_TIPOS_ESTUDO, LISTA_STATUS_TOPICO).

6. O banco de dados local se chama 'revisaflash_db_v2' (use DB_NAME da constante).

7. Ao salvar dados, garanta que todos os campos obrigatórios estejam preenchidos e com os nomes corretos.

8. Se houver qualquer inconsistência de nomenclatura ou tipo, aponte e corrija antes de entregar o código.



Preciso corrigir o [NOME_DO_CONTEXTO] (ex: StudyContext) para funcionar offline, seguindo o mesmo padrão aplicado ao ErrorContext.

Requisitos:
1. O contexto deve carregar os dados do RxDB ao iniciar (use getDb() e find() na coleção correspondente).
2. As operações de CRUD (criar, editar, excluir) devem:
   - Salvar/atualizar/remover no RxDB.
   - Atualizar o estado local (useState) para reatividade imediata.
   - Não depender de resposta do Supabase para persistência local.
3. A interface deve incluir:
   - `loading: boolean` (enquanto carrega)
   - `refresh: () => Promise<void>` (para recarregar dados)
4. O `userId` deve ser obtido do Supabase ou cache local (como nos demais contextos).
5. Os dados devem persistir após recarregar a página (F5).
6. A coleção correspondente deve estar no schema do RxDB (em db.ts) e ser adicionada ao addCollections.
7. Se houver sincronização com Supabase, use o syncWithSupabase (já existente) ou um hook específico, mas o contexto não deve depender dele para funcionar offline.

Arquivos a serem alterados:
- src/contexts/[Nome]Context.tsx (código principal)
- src/lib/db.ts (verificar se o schema existe)
- src/client.tsx ou __root.tsx (garantir que o provider está no lugar certo)

Refatore o código seguindo o padrão do ErrorContext corrigido.

Preciso corrigir o [NOME_DO_CONTEXTO] para funcionar offline com persistência no RxDB, seguindo o padrão já aplicado ao StudyContext e ErrorContext.

Requisitos:
- O contexto deve carregar dados do RxDB ao iniciar (loadData no useEffect).
- CRUD deve operar no RxDB e no estado local simultaneamente.
- userId deve ser obtido do Supabase ou cache local.
- Expor loading, refresh e userId (opcional).
- A coleção correspondente deve estar no schema do RxDB e no addCollections.
- Adicionar logs de depuração para cada operação.

Arquivos a alterar:
- src/contexts/[Nome]Context.tsx
- src/lib/db.ts (verificar schema e coleção)
- src/routes/__root.tsx (garantir que o Provider está no lugar certo)

Refatore seguindo o padrão do ErrorContext (já corrigido e funcional).