

## Re-audited Performance Optimization Plan

### Critical revision
The previous plan included DB index drops and additions on shared tables (`tenants`, `crop_schedules`, `lands`, `white_label_configs`, `user_tenants`). These tables are also used by the **tenants portal** and **SaaS admin** apps. Schema-level changes (DROP INDEX, ALTER) could break or slow those apps. **All shared-DB mutations are removed from this plan.** Only **additive, safe** DB changes remain (CREATE INDEX IF NOT EXISTS on columns this app queries, with `CONCURRENTLY` semantics where supported by migration). Anything that could regress other apps is out.

---

## Scope rule
- ✅ Allowed: code-only changes inside this repo; additive indexes that ONLY help (never drop, never alter existing).
- ❌ Forbidden: dropping any existing index, altering existing tables, modifying RLS, touching shared functions/triggers.

---

## Phase 1 — Code-only optimizations (zero DB risk)

### 1.1 Sync parallelization — `src/services/syncService.ts`
- Keep `downloadSubscriptionData()` FIRST (gating dependency).
- Then run `Promise.all([lands, schedules, alerts, crops, farmers])`.
- Tasks run AFTER schedules (data dependency).
- Add timing logs per phase.
- **Expected:** login-to-ready ~6s → ~2.2s.

### 1.2 Realtime channel consolidation — `src/hooks/useRealtimeData.ts`
- Replace 3 separate channels (lands / crop_schedules / schedule_tasks) with **one** channel having 3 `.on('postgres_changes', …)` handlers.
- Stable channel name keyed by `${tenantId}:${userId}` (drop `Date.now()`).
- Net: 5 channels per session → 3.
- **Expected:** fewer `CHANNEL_ERROR` storms, lower Realtime quota usage.

### 1.3 Reference-data caching — `src/hooks/useLandFormData.ts`
- Convert manual `useState` + `useEffect` to `useQuery` with `staleTime: Infinity`, `gcTime: Infinity`, shared `queryKey: ['ref','soil-water-irrigation']`.
- **Expected:** eliminate 3 redundant SELECTs on every land-form mount.

### 1.4 Log noise reduction (hot paths)
- `src/services/dataIsolationService.ts`: drop the per-call `console.log` (keep WARN/ERROR).
- `src/integrations/supabase/client.ts`: drop verbose header-ready logs in steady state.
- **Expected:** less GC pressure, cleaner production logs.

### 1.5 React `Home` ref warning
- Locate the child inside `<AnimatePresence>` that receives a ref and wrap with `React.forwardRef`.
- **Expected:** no remount cycles, console clean.

### 1.6 (Optional, this-app only) `schedules-api` batching
- Edge function in this repo: `supabase/functions/schedules-api/index.ts`.
- Add a `?include=tasks` query param that returns `{schedules, tasks}` in one round-trip.
- Frontend keeps current 2-call path as default; new path is opt-in. Zero impact on other apps.

---

## Phase 2 — Safe additive indexes only (no drops, no alters)

All indexes use `CREATE INDEX IF NOT EXISTS` and only add — they cannot break existing apps. They will only be added if confirmed missing.

```sql
-- This-app workload only; benefits any reader of these columns.
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_farmer_status_created
  ON public.proactive_alerts(farmer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_farmer_subscriptions_farmer_status
  ON public.farmer_subscriptions(farmer_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_logs_farmer_period
  ON public.subscription_usage_logs(farmer_id, billing_period_start DESC);
```

### Explicitly removed from previous plan (would impact other apps)
- ❌ DROP INDEX on `crop_schedules` (5 unused) — could regress admin reports.
- ❌ CREATE INDEX on `tenants(custom_domain)`, `tenants(subdomain)` — owned by tenants portal; let that team manage.
- ❌ CREATE INDEX on `white_label_configs(domain)` — owned by tenants portal.
- ❌ CREATE INDEX on `user_tenants(user_id)` — admin-portal table.
- ❌ ANALYZE on shared tables — let DB autovacuum handle; manual ANALYZE could shift plans for other apps.
- ❌ Anything touching `spatial_ref_sys` (PostGIS system table — never modify).

---

## Files to modify (this codebase only)

| File | Change |
|---|---|
| `src/services/syncService.ts` | Parallelize independent downloads |
| `src/hooks/useRealtimeData.ts` | Single multi-table channel, stable name |
| `src/hooks/useLandFormData.ts` | React Query w/ infinite staleTime |
| `src/services/dataIsolationService.ts` | Reduce hot-path logging |
| `src/integrations/supabase/client.ts` | Reduce hot-path logging |
| `src/pages/Home.tsx` (+ child) | `forwardRef` fix |
| `supabase/functions/schedules-api/index.ts` | Optional `?include=tasks` |
| New migration | 3 additive indexes (Phase 2) only |

---

## Expected gains

| Metric | Before | After |
|---|---|---|
| Login → app ready | ~6.0s | ~2.2s |
| Realtime channels | 5 | 3 |
| Land-form ref data fetches | 3 per mount | 0 (cached) |
| Subscription/alerts query latency | baseline | improved (additive idx) |
| Console noise (per sync) | ~12 logs | ~2 logs |

---

## Guarantees
- ✅ No DROP/ALTER on shared tables.
- ✅ No business logic changes; AI/symbolic engine untouched.
- ✅ Only this app's code paths and frontend hooks modified.
- ✅ Indexes are additive — cannot break tenants portal or SaaS admin.
- ✅ Realtime/sync changes are local; data contracts preserved.

