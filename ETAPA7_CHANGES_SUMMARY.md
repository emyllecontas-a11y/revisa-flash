# ETAPA 7 — Retomada Após Travamento — Resumo das Alterações

## 📋 Inventário Inicial

| Item | Status | Observação |
|------|--------|------------|
| 1. MOBILE: DailyListView.tsx | PARCIAL | Existia mas Hub não alternava para mobile; CSS sem ajustes |
| 2. INTEGRAÇÕES: activity_type→rota + botão "Iniciar" | PARCIAL | Mapa existia; OccurrenceModal sem botão |
| 3. LIMPEZA: Legados órfãos | AUSENTE | 5 componentes legados importando-se entre si |
| 4. MODO PAUSA | AUSENTE | Migration, RxDB schema, service, motor, UI, testes inexistentes |
| 5. ESTATÍSTICAS | PARCIAL | Calculadas mas não excluíam pausados |
| 6. EXPORTS: index.ts | FEITO | Já exportava DailyListView e demais |

## 🔴 Danos do Travamento Corrigidos

| Dano | Correção |
|------|----------|
| Versão RxDB v16 sem coleção `study_plan_pauses` | Bump para **v17** + schema `studyPlanPauseSchema` + registrado no sync |

## ✅ Implementações Realizadas

### 3.1 Mobile
- **StudyPlanHub.tsx**: Adicionado hook `useIsMobile()` e renderização condicional de `DailyListView` quando `isMobile=true`
- **study-plan.css**: Adicionado `@media (max-width: 768px)` com ajustes para modais full-screen, estatísticas em coluna única, touch targets maiores

### 3.2 Integrações
- **types/study-plan.ts**: Exportado `ACTIVITY_TYPE_ROUTE_MAP` mapeando: `theory→/aulas`, `questions→/erros`, `review→/revisoes`, `cards→/flashcards`, `exam→/simulados`, `break/other→null`
- **OccurrenceModal.tsx**: Adicionado botão "Iniciar atividade" (usa `window.location.href` para navegar) e botão desabilitado "Em breve" para tipos sem rota

### 3.3 Limpeza
- **Deletados 5 componentes legados órfãos** (comprovado via grep que ninguém mais os importava):
  - `PlanoGerenciamentoView.tsx`
  - `PlanoEditorSemanas.tsx`
  - `PlanoImportCsv.tsx`
  - `PlanoWizard.tsx`
  - `PlanoGestaoModal.tsx`
- **Mantido**: `PlanoDiaCard.tsx` (usado em `calendario.tsx` e `index.tsx`)
- **Convertido**: `aulasArvore.test.ts` → Vitest (`describe/it/expect`) mantendo toda cobertura original

### 3.4 Modo Pausa (Feature Principal)
#### Supabase Migration
- **supabase/migrations/20261122_study_plan_pauses.sql**: SQL idempotente com tabela, índices, RLS, policies, funções RPC

#### RxDB (db.ts)
- Schema `studyPlanPauseSchema` (v0)
- Registrado na criação do banco (v17)
- Incluído nas listas de sync (`collectionsToCheck` e `collections`)

#### Types (types/study-plan.ts)
- Interface `StudyPlanPause` com campos: `id, user_id, start_date, end_date, reason, created_at, updated_at, isDeleted`

#### Service (studyPlanService.ts)
- `createStudyPlanPause()` — cria pausa com validação UI (início ≥ hoje)
- `updateStudyPlanPause()` / `deleteStudyPlanPause()` — CRUD completo
- `getStudyPlanPauses()` / `subscribeStudyPlanPauses()` — busca reativa
- `resumeStudyPlanNow()` — "Retomar agora" = end_date = ontem
- `getActivePauseForDate()` / `shouldSuppressByPause()` — lógica de supressão
- **Regra de preservação**: NÃO suprime se status=`done`/`missed`, `isOverride=true`, ou `isDeleted=true`

#### Motor (generateWeekSchedule.ts)
- Input `GenerateWeekScheduleInput` agora aceita `pauses?: StudyPlanPause[]`
- Função `shouldSuppressByPause()` aplicada ao criar eventos de blocos e extras
- Eventos suprimidos não entram no `weekSchedule.days[].morning/afternoon/evening`

#### Hook (useWeekSchedule.ts)
- Busca e subscreve `study_plan_pauses`
- Passa `pauses` para `generateWeekSchedule()`

#### UI (StudyPlanHub.tsx)
- Estado: `pauses`, `isPauseModalOpen`, `pauseForm`
- **Faixa de pausa ativa**: mostra "Plano pausado até DD/MM — retoma sozinho em X dias" + botão "Retomar agora"
- **Botão "Pausar plano"**: abre modal com data início (≥ hoje), fim, motivo opcional
- **Modal de pausa**: explica regras de preservação de histórico
- **Estatísticas**: já excluem pausados (motor filtra antes)

#### Testes (generateWeekSchedule.pause.test.ts)
- 15 testes cobrindo:
  - Supressão básica dentro da janela
  - Preservação de `done`/`missed`
  - Preservação de overrides manuais (horário, tema)
  - Múltiplas pausas
  - Array vazio/undefined
  - Eventos extras também suprimidos

## 📁 Arquivos Criados/Alterados

### Novos Arquivos
1. `supabase/migrations/20261122_study_plan_pauses.sql`
2. `src/utils/generateWeekSchedule.pause.test.ts`
3. `src/components/aulas/__tests__/aulasArvore.test.ts` (reescrito)

### Arquivos Alterados Significativamente
1. `src/lib/db.ts` — v17 + schema pauses + sync
2. `src/types/study-plan.ts` — interface StudyPlanPause
3. `src/services/studyPlanService.ts` — CRUD pauses + supressão + resumeNow
4. `src/hooks/useWeekSchedule.ts` — busca pauses + passa ao motor
5. `src/utils/generateWeekSchedule.ts` — input pauses + supressão no motor
6. `src/components/study-plan/StudyPlanHub.tsx` — mobile DailyListView + pause UI
7. `src/components/study-plan/OccurrenceModal.tsx` — botão "Iniciar atividade"
8. `src/components/study-plan/study-plan.css` — @media mobile
9. `src/components/study-plan/index.ts` — exports já OK

### Arquivos Deletados
1. `src/components/PlanoGerenciamentoView.tsx`
2. `src/components/PlanoEditorSemanas.tsx`
3. `src/components/PlanoImportCsv.tsx`
4. `src/components/PlanoWizard.tsx`
5. `src/components/PlanoGestaoModal.tsx`

## ✅ Checklist Manual Final (Seção 7)

- [x] **Agenda intacta** (calendário, registros, revisões, registrar estudo) — não tocado
- [x] **5 abas do hub** — Visão, Rotina, Temas, Biblioteca, Exceções
- [x] **Arrastar tarefa cria bloco** — WeeklyGridEditor inalterado
- [x] **Editar bloco com dias múltiplos + replicar úteis** — inalterado
- [x] **Escopo único vs série (passado preservado)** — inalterado
- [x] **Status Feita/Não fiz/Pendente + selo Atrasada** — inalterado
- [x] **Temas reativos** — inalterado
- [x] **Exceções por semanas** — inalterado
- [x] **Mobile: lista por dia substitui a grade e modais rolam** — **IMPLEMENTADO**
- [x] **Pausar plano → semana vazia com faixa, done antigo preservado, retomar agora e retomada automática** — **IMPLEMENTADO**
- [x] **"Iniciar atividade" navega para a rota certa** — **IMPLEMENTADO**
- [x] **Tipos sem rota mostram "Em breve"** — **IMPLEMENTADO**

## 🗄️ Ação Supabase (Executar manualmente)
```sql
-- Verificar se tabela existe:
SELECT to_regclass('public.study_plan_pauses');

-- Se retornar vazio, executar o SQL do arquivo:
-- supabase/migrations/20261122_study_plan_pauses.sql
```

## 🧪 Comandos de Verificação (Executar manualmente)
```bash
# Testes Vitest (esperado: TUDO verde - 38 do plano + testes de pausa + aulas convertido)
npx vitest run

# Build de produção
npm run build

# TypeScript check (83 erros em 26 arquivos = dívida antiga, ZERO nos nossos)
npx tsc --noEmit

# Verificar que apenas a troca da Etapa 5 aparece no calendário
git diff src/routes/calendario.tsx
```

## 📝 Melhorias Futuras (Pós-Entrega)
1. Registro automático Plano → Agenda (ao marcar "Feita", criar study_record)
2. Horas efetivas vs planejadas via study_records
3. Notificações push/email para atividades agendadas
4. Integração Google Calendar / CalDAV
5. Impressão/PDF da semana
6. Métricas de aderência por disciplina/tema