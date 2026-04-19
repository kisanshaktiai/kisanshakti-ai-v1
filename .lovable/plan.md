

## Investigation Goal

Audit online (Supabase) vs offline (IndexedDB / `localDB`) schema parity, sync coverage, and known drift. Then propose a focused fix plan to bring offline DB into alignment without breaking existing flows.

## Step 1 — Read current state

Inspect:
- `src/services/localDB.ts` (interfaces, stores, schema version, upgrade logic)
- `src/services/syncService.ts` (download/upload, tables covered, mapping)
- `src/services/offlineDataService.ts` (field mappings)
- Supabase schema for: `lands`, `crop_schedules`, `schedule_tasks`, `farmers`, `farmer_subscriptions`, `subscription_plans`, `subscription_usage_logs`, `payment_records`, `ai_chat_messages`, `weather_current`, `soil_health`
- `docs/OFFLINE_DATABASE_AUDIT_REPORT.md` (already flags 80+ missing columns + missing `schedule_tasks` download)

## Step 2 — Compare schemas

For each synced table, build a column-by-column diff:
- Online column → present in LocalDB interface? → mapped in syncService download? → mapped in syncService upload?
- Identify: missing columns, type mismatches, missing tenant_id/farmer_id (isolation risk), missing tables entirely.

## Step 3 — Identify gaps

Expected gaps based on prior audit + recent subscription work:
1. `crop_schedules` — 70+ missing columns (weather_data, soil_recommendations, ai_confidence, etc.)
2. `schedule_tasks` — 17 missing columns including `tenant_id`, `farmer_id` (RLS/isolation risk offline)
3. `schedule_tasks` — not downloaded by syncService at all
4. **NEW**: `farmer_subscriptions` + `subscription_plans` — not mirrored offline → useSubscription falls back to cached `localStorage` only, no IndexedDB store
5. **NEW**: `subscription_usage_logs` — not mirrored → usage meters break offline
6. `payment_records` — not mirrored
7. Schema version bump needed to force IndexedDB upgrade
8. Sync order: subscription tables must download BEFORE other tables (gating depends on it)

## Step 4 — Design fix plan

### Phase 1 — Schema alignment in `localDB.ts`
- Expand `Land`, `CropSchedule`, `ScheduleTask` interfaces to mirror Supabase columns 1:1 (use existing types from `src/integrations/supabase/types.ts` as source of truth)
- Add new IndexedDB stores:
  - `farmerSubscriptions` (keyPath: id; index: farmer_id, tenant_id, status)
  - `subscriptionPlans` (keyPath: id; index: plan_type)
  - `subscriptionUsageLogs` (keyPath: id; index: farmer_id, billing_period_start)
  - `paymentRecords` (keyPath: id; index: farmer_id, created_at)
- Bump `SCHEMA_VERSION` to 5, add upgrade migration that wipes & re-syncs affected stores
- Add getter methods: `getActiveSubscription(farmerId)`, `getUsageLogs(farmerId)`, `getPlans()`

### Phase 2 — Sync coverage in `syncService.ts`
- Add download steps for: `schedule_tasks`, `farmer_subscriptions`, `subscription_plans`, `subscription_usage_logs`, `payment_records`
- Reorder `downloadServerData()`: subscriptions FIRST → then lands → schedules → tasks
- Map ALL columns (not just hand-picked subset) — use `...row` spread + explicit overrides for renamed fields
- Tenant/farmer isolation: enforce `eq('tenant_id', user.tenantId)` and `eq('farmer_id', user.id)` on subscription queries

### Phase 3 — Update `useSubscription` for IndexedDB-backed offline
- Replace `localStorage` cache with `localDB.getActiveSubscription(farmerId)` for richer fallback
- Keep 72h HMAC TTL logic intact
- On sync completion, refetch subscription query

### Phase 4 — Field mapping audit in `offlineDataService.ts`
- Replace hand-picked field maps with full row spreads to prevent silent column drops on future schema changes
- Add a single `mapSupabaseRow` utility per table

### Phase 5 — Verification
- Add `__debugSchema()` console helper that dumps column counts: online vs offline per table
- Confirm `useSubscription` works offline after sync
- Confirm `schedule_tasks` populate offline
- Confirm tenant isolation: query localDB with wrong farmer_id returns nothing

## Files to modify

| File | Change |
|---|---|
| `src/services/localDB.ts` | Expand interfaces, add 4 stores, bump schema to v5, add getters |
| `src/services/syncService.ts` | Add 5 table downloads, fix order, full row mapping |
| `src/services/offlineDataService.ts` | Use full row spreads |
| `src/hooks/useSubscription.ts` | IndexedDB-backed offline fallback |
| `src/services/syncService.ts` | (Same file) Reorder + add subscription tables FIRST |

## No changes to

- RLS policies (already correct)
- Edge functions
- Subscription middleware / payment webhook
- UI components
- Auth / tenant isolation services

## Risk & rollback

- Schema v5 upgrade wipes affected IndexedDB stores → next sync repopulates from server (safe, server is SSOT)
- No destructive changes to Supabase
- Pending offline writes (queued mutations) preserved by keeping `pendingChanges` store untouched in upgrade

