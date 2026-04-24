

## Phased Remediation Plan — KisanShakti Farmer App

Goal: Lift the audited issues into a safe, additive, multi-phase rollout. **Zero breaking changes**, **no shared-table schema breaks** (tenants portal & SaaS admin remain untouched), and **measurable performance gains at every step**.

Guardrails for every phase:
- ✅ Additive only on shared tables (`lands`, `crop_schedules`, `schedule_tasks`, `subscription_plans`, `tenants`, `white_label_configs`, `user_tenants`).
- ✅ All edge-function changes are backward-compatible (new query params optional; old responses preserved).
- ✅ Frontend changes ship behind defensive fallbacks.
- ❌ No DROP/ALTER on shared columns. No changes to AI symbolic engine, proactive evaluator logic, or chat orchestrator.
- ❌ No backend rate-limiting (deferred per platform policy).
- ❌ No JWT migration in this plan (tracked as Phase 7 future work — too invasive, separate approval).

---

### Phase 1 — Quick wins (perf + stability, no risk)

**1A. React Query staleTime propagation** (frontend only)
- Add `staleTime: 5*60*1000` + `gcTime: 30*60*1000` to: `useLands`, `useSchedules`, `useTasks`, `useProactiveAlerts`, `useTenantConfig`, `useWeather`.
- Set `refetchOnWindowFocus: false` globally in `QueryClient` defaults; opt-in per critical hook only.
- **Impact:** ~70% fewer API calls / mount; eliminates the double-fetch on tab focus.

**1B. Realtime invalidation de-thrash** (`src/hooks/useRealtimeData.ts`)
- Remove the `refetchQueries` call; keep only `invalidateQueries` (React Query refetches automatically when consumers are mounted).
- Debounce payload handler at 250ms per table.
- **Impact:** Eliminates double-refetch storm under bulk writes.

**1C. Sync trigger debounce** (`src/services/syncService.ts`, `src/App.tsx`)
- Replace "sync on every visibility change" with: debounced 30s + only if `lastSync > 5min ago`.
- Keep manual SyncButton path unchanged.
- **Impact:** Cuts redundant 9.5s cold-syncs; major egress saving.

Files touched: `useLands.ts`, `useSchedules.ts`, `useTasks.ts`, `useProactiveAlerts.ts`, `useTenantConfig.ts`, `useWeather.ts`, `useRealtimeData.ts`, `syncService.ts`, `App.tsx`, `main.tsx` (QueryClient defaults).

---

### Phase 2 — Mobile rendering perf (Home + bundle)

**2A. Home.tsx decomposition (no UX change)**
- Split 848-line monolith into: `HomeHeroCard`, `HomeMetricsCarousel`, `HomeQuickActions`, `HomeAlertsStrip`, `HomeWeatherTile`.
- Wrap each child in `React.memo`; lift interval timers into a single `useMinuteTick()` hook so only the metrics carousel re-renders.
- Replace heavy framer-motion on low-end Android via `prefers-reduced-motion` + `useIsLowEndDevice()` heuristic (already in project).

**2B. Bundle code-split**
- Lazy-load `localDB.ts` (2113 LOC) via dynamic `import()` on first offline event or first sync.
- Dynamic-import `syncService` from non-critical paths.
- **Impact:** Initial JS payload ↓ ~120KB; LCP improves on rural 3G.

Files touched: `src/pages/Home.tsx` + 5 new components under `src/components/home/`, `src/services/localDB.ts` (entry shim only), `src/hooks/useMinuteTick.ts` (new).

---

### Phase 3 — API pagination & incremental sync (additive)

**3A. `schedules-api` — additive query params**
- Add optional `?limit=`, `?cursor=`, `?since=updated_at` to `GET /tasks` and `GET /` (schedules). Default behavior unchanged when params absent.
- Frontend: paginate tasks by 50, infinite-scroll in task list views.

**3B. `lands-api` — fix N+1 enrichment**
- Replace per-land soil/NDVI loop with a single SQL join inside the edge function (additive — same response shape).
- Add optional `?since=` for delta sync.

**3C. Frontend incremental sync**
- `syncService.performSync()` stores `lastSyncAt` per entity in IndexedDB; subsequent syncs send `?since=lastSyncAt`.
- Full-sync fallback retained for first load and version bumps.

**Impact:** lands-api 1.4s → ~250ms; sync egress reduced ~95%.

Files touched: `supabase/functions/lands-api/index.ts`, `supabase/functions/schedules-api/index.ts`, `src/services/syncService.ts`, `src/services/landsApi.ts`, `src/services/schedulesApi.ts`, `src/hooks/useTasks.ts`.

---

### Phase 4 — Database hygiene (additive only, safe for other apps)

**4A. SECURITY DEFINER view hardening**
- Audit each flagged view (`ndvi_full_view`, `land_agent_context`, `vw_soil_summary`, etc.).
- For views consumed only by the farmer app: convert to `SECURITY INVOKER` and ensure underlying tables have farmer-scoped RLS.
- For views used by tenant portal / SaaS admin: **leave untouched**, instead create a parallel farmer-scoped RPC `get_<view>_for_farmer(p_tenant_id, p_farmer_id)` and switch farmer app to it.

**4B. Backup/staging tables containment**
- Create `archive` schema (private, not exposed by PostgREST).
- Move `*_backup_*` and `staging_*` tables via `ALTER TABLE ... SET SCHEMA archive` only after confirming no other app reads them (audit via `pg_stat_user_tables.seq_scan + idx_scan`).
- If any uncertainty → revoke `anon`/`authenticated` SELECT instead of moving.

**4C. Function `search_path` hardening**
- Add `SET search_path = public` to all SECURITY DEFINER functions missing it (additive — no signature change).

**4D. Deferred (NOT in this plan):** dropping unused indexes — risky on shared tables; tracked separately with longer observation window.

Files touched: one new migration `supabase/migrations/<ts>_phase4_db_hygiene.sql`.

---

### Phase 5 — Edge function auth hardening (cost protection)

**5A. Enable `verify_jwt = true`** on cost-sensitive functions: `text-to-speech`, `community-tts`, `translate-text`, `transcribe-voice`, `weather`.
- Update `supabase/config.toml`.
- Add `getClaims()` check at top of each handler.
- Frontend already sends `Authorization: Bearer <anon-or-session>` via supabase-js → minimal client change.

**5B. HMAC signing for header-trusted endpoints** (`lands-api`, `schedules-api`, `ai-agriculture-chat`)
- Add `x-signature` header = HMAC-SHA256(`tenantId|farmerId|timestamp`, `EDGE_SHARED_SECRET`).
- Edge functions verify signature + freshness (5-min window) before trusting `x-farmer-id`.
- Old unsigned requests still accepted for 1 release (logged as `auth_legacy=true`) → then enforced.
- Requires new secret: `EDGE_SHARED_SECRET` (will request via add_secret tool).

Files touched: `supabase/config.toml`, edge functions listed, `src/services/dataIsolationService.ts` (signing helper), `src/integrations/supabase/client.ts`.

---

### Phase 6 — Observability & operational

**6A. Structured logs**
- Add `requestId`, `tenantId`, `farmerId`, `latencyMs` to every edge-function log line (additive).
- Frontend: tag console logs with same `requestId` for correlation.

**6B. Per-tenant Sentry tags**
- Wire Sentry (already in deps?) — if not, plan only; user approves install.
- Tag: `tenant_id`, `farmer_id_hash`, `app_version`.

**6C. Retention jobs (cron via pg_cron)**
- `ai_chat_messages`: archive partitions > 180 days.
- `tile_marking_progress`: prune rows > 90 days where `status='completed'`.
- `proactive_alerts`: soft-delete dismissed > 60 days.
- All as additive scheduled functions; no schema changes.

Files touched: edge function shared logger, one migration for cron jobs, `src/lib/sentry.ts` (new, optional).

---

### Phase 7 — Future / deferred (separate approval cycles)

- JWT auth migration (replace `session_*` tokens) — large, multi-week.
- Realtime broadcast-per-tenant topics — needs Supabase Realtime broadcast API design.
- Read replica routing — infra decision.
- CDN cache (Cloudflare) for `tenant-config` & `get_farmer_subscription_plans` — infra.
- Drop unused indexes (after 30-day observation).
- Partitioning `proactive_alerts`, `ndvi_data` by month.

---

### Rollout order & checkpoints

```text
Phase 1 ──► verify perf (Network panel, sync logs)
   │
Phase 2 ──► verify Home FPS on low-end (Performance tab)
   │
Phase 3 ──► verify lands <300ms, sync delta-only
   │
Phase 4 ──► run supabase--linter; ERROR count must drop
   │
Phase 5 ──► verify TTS/weather reject anon; HMAC accepted
   │
Phase 6 ──► verify logs carry tenantId; cron jobs scheduled
```

Each phase ends with: linter run + console-log spot check + manual smoke on `/app/home`, `/app/lands`, `/app/schedules`, `/app/subscription`, `/app/chat`. Rollback = revert that phase's commit (no destructive DB ops anywhere).

---

### Expected outcomes

| Metric | Before | After Phase 1–3 | After Phase 1–6 |
|---|---|---|---|
| Cold sync time | 9.5s | ~3s | ~1.5s |
| lands-api latency | 1.4s | ~250ms | ~200ms |
| API calls / focus | 6 | 0–1 | 0–1 |
| Initial JS bundle | baseline | −120KB | −120KB |
| Linter ERRORs | 312 | 312 | <50 |
| Cost-attack surface (TTS/translate) | open | open | locked |
| Practical concurrent capacity | 25–50k | 75–150k | 200–400k |

---

### Out of scope (explicit)

- ❌ No changes to tenants portal or SaaS admin codebases.
- ❌ No DROP/ALTER on columns of shared tables.
- ❌ No changes to symbolic decision engine, proactive evaluator rules, AI chat orchestrator, narration prompts.
- ❌ No backend rate-limiting (platform policy).
- ❌ No `auth.users` modifications.

Awaiting approval to begin Phase 1.

