---
name: rxdb-pre-v16-migration-strategy
description: RxDB migration strategy for pre-v16 local databases when upgrading to v16 with new study-plan collections
type: project
category: important_decision
keywords:
  - "RxDB migration"
  - "database versioning"
  - "study-plan collections"
  - "v16 upgrade"
  - "offline-first sync"
usage_scenarios:
  - "Understanding how pre-v16 users get study-plan data"
  - "Debugging sync issues for users upgrading from older versions"
  - "Planning future schema migrations"
---

# RxDB Pre-v16 Migration Strategy for Study-Plan Collections

## Context
- New study-plan feature added in RxDB v16 (5 new collections: `study_tasks`, `study_theme_timelines`, `study_weekly_blocks`, `study_extra_events`, `study_occurrences`)
- All new collections start at schema version 0
- Users upgrading from v14, v15, or earlier have NO local data for these new tables

## Current Behavior (Implemented in `src/lib/db.ts`)

### Version Marker System
```typescript
const DB_VERSION_MARKER = 'revisaflash_db_version';
const CURRENT_DB_VERSION = 'v16';
const DB_NAME = 'revisaflash_db_v16';
```

### On App Load (`getDb()`)
1. **Check version marker**: If `localStorage.getItem(DB_VERSION_MARKER) !== CURRENT_DB_VERSION`
2. **Emergency push**: Attempt to push critical data from old v14 database to Supabase (only for specific collections: `questoes_lista`, `listas_questoes`, `listas`, `resultados_lista`, `progresso_lista`)
3. **Clear sync timestamps**: `clearAllLastSync()` forces full pull from Supabase for ALL collections
4. **Set new version marker**: `localStorage.setItem(DB_VERSION_MARKER, CURRENT_DB_VERSION)`
5. **Create new v16 database**: All collections including new study-plan collections created fresh (schema v0)
6. **Full sync runs**: Because lastSync was cleared, complete pull from Supabase brings down any existing server data

## Why This Is Safe (No Data Loss)

### For Study-Plan Collections Specifically:
- **No local data existed before v16**: These 5 tables are completely new — there's nothing to migrate from old local databases
- **Supabase is source of truth**: The Supabase migration (20261119_create_study_plan.sql) was applied on 2026-11-20, creating the tables server-side
- **Full pull reconstructs local state**: Any data the user created on other devices (or via web) comes down via the forced full pull
- **Local changes sync up**: After the pull, any new local changes are enqueued via `enqueueOperation` and pushed normally

### For Other Collections:
- Emergency push protects critical user data (lists, questions, progress) from v14 before the database is recreated
- Full pull then restores everything from Supabase
- This is the existing proven pattern used for previous migrations

## Edge Cases Handled

| Scenario | Result |
|----------|--------|
| User on v14, upgrades to v16 | Emergency push from v14 → full pull → fresh v16 DB |
| User on v15, upgrades to v16 | No emergency push (only checks v14) → full pull → fresh v16 DB (v15 data reconstructed from Supabase) |
| Fresh user (no local DB) | Creates v16 DB directly → full pull (empty) → works normally |
| User with Supabase study-plan data, no local | Full pull brings all study-plan data down to new local collections |

## What Was NOT Done (And Why)

- ❌ **No migration scripts for study-plan collections**: Not needed — no local data exists
- ❌ **No reading from v15 for emergency push**: Only v14 had the critical collections that needed protection; v15 data is reconstructed from Supabase anyway
- ❌ **No incremental migration**: Full pull is simpler and safer for these new tables

## Verification Checklist
- [x] New collections created at schema v0 in v16
- [x] Version marker triggers full pull on upgrade
- [x] Supabase migration applied before code deployment
- [x] Sync via `enqueueOperation` works for new collections
- [x] RLS policies protect user data on Supabase side

## Future Migrations
When adding new collections in future versions:
1. Add to `collections` in `createRxDatabase` with schema v0
2. Ensure Supabase migration is applied first
3. The existing version marker + full pull pattern will handle it automatically
4. If critical local-only data exists in old version, add to `EMERGENCY_PUSH_COLLECTIONS` and update `pushEmergencyDataToSupabase()` to read from the appropriate old DB version