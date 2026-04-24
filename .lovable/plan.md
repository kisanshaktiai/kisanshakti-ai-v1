

# Deep Audit — Schedule Edge Function Trio

> **Read-only forensic report.** Scope: `ai-smart-schedule`, `ai-schedule-ops`, `schedules-api`. No code or DB changes proposed for execution — this is the analysis you can act on later.

---

## 1. Function Snapshot

| Function | LOC | verify_jwt | Trigger | Callers in `src/` | DB tables touched |
|---|---:|---|---|---|---|
| `ai-smart-schedule` | **8,065** (6 files) | **true** ⚠️ | HTTP | `Schedule.tsx`, `ScheduleGenerator.tsx` | `crops`, `lands`, `farming_stages`, `crop_schedules` (insert), `schedule_tasks` (insert), `land_crops` (upsert) |
| `ai-schedule-ops` | 557 (1 file) | false | HTTP (`?action=`) | `AIScheduleDashboard.tsx` (monitor only) | `crop_schedules`, `schedule_tasks`, `schedule_monitoring`, `ai_schedule_refinements`, `schedule_climate_monitoring`, `farmer_alerts`, `alert_notifications`, `ai_decision_log` |
| `schedules-api` | 235 | false | HTTP | `schedulesApi.ts` (high traffic, plus `syncService`) | `crop_schedules` (read/soft-delete), `schedule_tasks` (read) |

Edge logs (last 7d) confirm `schedules-api` is **healthy and live** (multiple successful fetches: 13 schedules / 254 tasks per call). `ai-smart-schedule` and `ai-schedule-ops` show **no recent invocations** in the sampled window.

---

## 2. Feature Mapping

```text
GENERATION FLOW                          READ/SYNC FLOW                  MONITORING FLOW
──────────────────                       ──────────────                  ──────────────
Schedule.tsx ──┐                         ScheduleList ──┐               AIScheduleDashboard
ScheduleGenerator┘                       syncService    │                       │
        │                                useSchedules ──┤                       ▼
        ▼                                               ▼               ai-schedule-ops
ai-smart-schedule  ───inserts──▶  crop_schedules ◀──reads── schedules-api    ?action=monitor
   (writes 466 tasks                +                             │           (button-only)
    + 25 schedules)                schedule_tasks                 │
                                                                  ▼
                                                            React Query cache
```

`ai-schedule-ops` exposes **3 actions**: `monitor`, `climate`, `weather-sync`. Only `monitor` is wired to the UI (one button on `AIScheduleDashboard`). `climate` and `weather-sync` have **zero callers** in the entire `src/` tree and **no `pg_cron` schedule** invokes them.

---

## 3. Critical Findings

### 🔴 F1 — `ai-smart-schedule` has a JWT trap (production risk)
`config.toml` sets `verify_jwt = true`, but every caller (`Schedule.tsx`, `ScheduleGenerator.tsx`) uses `supabase.functions.invoke()` with the **anon key + custom `x-tenant-id`/`x-farmer-id` headers** — the same model that broke `lands-api` in Phase 5. This works today only because `supabase.functions.invoke` automatically attaches the anon key as Bearer; the moment the platform tightens JWT requirements (or you add the new `tenantAccessGuard`), schedule generation will silently 401. Inside the function the Bearer is never used — auth is done purely by reading headers and using the service-role key. **The flag is misleading and should be `false`** to match the actual auth model.

### 🔴 F2 — `ai-schedule-ops` is 99% dead code
- Only `?action=monitor` is reachable from the UI, behind a manual "Run Monitoring" button.
- `?action=climate` is invoked nowhere.
- `?action=weather-sync` is invoked nowhere (no cron job exists for it; only `proactive-evaluator-cron` runs).
- All four tables it writes to (`schedule_monitoring`, `ai_schedule_refinements`, `schedule_climate_monitoring`, plus monitoring rows in `farmer_alerts`) are **empty in production** despite the function existing for weeks.
- The `monitor` action still uses **OpenAI `gpt-4o-mini` directly** while the rest of the platform has migrated to the Lovable AI Gateway — it likely fails on missing `OPENAI_API_KEY` if invoked.

### 🟠 F3 — Massive bloat in `ai-smart-schedule`
4,743 lines in `index.ts` alone. Includes:
- Inline `CROP_TRANSLATIONS` table for 9 languages × ~25 crops (lines 28–248) — duplicates the `crops.label_*` columns in DB (function already queries them at runtime, line 2674).
- Inline `RURAL_TERMS`, `STATE_LABOR_RATES`, `LANGUAGES` constants.
- 5 sibling files (`agro-knowledge-base`, `decision-graph-integration`, `lean-prompt-builder`, `post-processor`, `scientific-validator`) totaling 3,322 LOC, half of which appear to be helper scaffolding for prompt building that runs on every cold start.
- Cold-start cost is significant; the `monitor` flow in `ai-schedule-ops` re-implements its own (much shorter) prompt/validation rather than reusing any of these helpers.

### 🟠 F4 — Functional overlap between `ai-smart-schedule` and `ai-schedule-ops`
| Concern | `ai-smart-schedule` | `ai-schedule-ops` |
|---|---|---|
| Reads `lands` row | ✅ | ✅ (in `monitor`) |
| Reads weather | via `weather` fn | direct `fetch` to `weather` fn URL |
| Reads NDVI | implicit via knowledge base | `ndvi_cache` direct query |
| LLM call | Gemini/OpenAI via `_shared/aiConfig` | OpenAI hardcoded |
| Writes alerts | no | `farmer_alerts` |
| Writes refinements | no | `ai_schedule_refinements` |

So they are **not duplicates** — they are **two halves of the same lifecycle that share the same data sources but never share code**. The shared data-fetch layer (land + weather + NDVI + soil) is implemented twice with slightly different shapes.

### 🟡 F5 — `ai-schedule-ops` `monitor` ignores the per-schedule date filter
`handleMonitor` selects all schedules with `harvest_date >= today`, but the column on `crop_schedules` is `expected_harvest_date` (per the `ScheduleData` interface in `schedulesApi.ts`). If the column name diverges, the query silently returns nothing and "0 schedules monitored" is reported as success.

### 🟡 F6 — `schedules-api` is clean but missing one half of CRUD
- ✅ GET list / GET single / GET tasks (with `since`/`limit`/`cursor` delta sync).
- ✅ DELETE (soft).
- ❌ No PATCH/PUT — task completion toggling (used in `InteractiveScheduleTable`) must therefore go directly to Supabase REST + RLS, bypassing the API. This is inconsistent with the `lands-api`/`schedules-api` "edge function as data gateway" pattern.

### 🟡 F7 — Header-only auth, no association check
`schedules-api` trusts `x-tenant-id` / `x-farmer-id` blindly. There is no verification that the authenticated user (anon-key bearer) is actually allowed to claim that farmer/tenant pair. A malicious client with the public anon key + a known farmer UUID could read any farmer's schedules. Same gap exists in `ai-schedule-ops`.

---

## 4. Duplication Matrix

```text
                       ai-smart-schedule   ai-schedule-ops   schedules-api
Land lookup                  ✅                  ✅                ─
Weather fetch                via fn              raw fetch         ─
NDVI access                  via KB              direct DB         ─
LLM client                   _shared/aiConfig    inline OpenAI     ─
Crop translation             inline + DB         ─                 ─
schedule_tasks INSERT        ✅                  ─                 ─
schedule_tasks READ          ─                   ✅                ✅
crop_schedules INSERT        ✅                  ─                 ─
crop_schedules READ          ─                   ✅                ✅
crop_schedules SOFT DELETE   ─                   ─                 ✅
Alert generation             ─                   ✅                 ─
```

**Genuine duplicates:** Land+weather+NDVI fetch helpers (3 locations), crop translation lookup (inline table + DB query in same function), LLM provider selection (two divergent code paths).

**No business-logic duplicate** between `ai-smart-schedule` (generation) and `ai-schedule-ops` (refinement) — they own different lifecycle phases.

---

## 5. Feature-Level Health Check

| Feature | Edge fn | Status | Notes |
|---|---|---|---|
| Generate schedule (Schedule page wizard) | `ai-smart-schedule` | ⚠️ Working but fragile | verify_jwt=true mismatch; will break if guard added |
| Generate schedule (admin generator) | `ai-smart-schedule` | ⚠️ Same | sends `x-session-token` header (unused) |
| List schedules | `schedules-api` | ✅ Live | 13 schedules returned in production |
| List tasks | `schedules-api` /tasks | ✅ Live | 254 tasks returned, delta sync OK |
| Soft-delete schedule | `schedules-api` DELETE | ✅ Working | |
| Toggle task done | direct Supabase | ⚠️ Bypasses API | no edge-fn validation |
| Run monitoring (dashboard button) | `ai-schedule-ops?action=monitor` | ❌ Likely broken | OpenAI key dep + 0 rows ever written; column-name mismatch suspected |
| Climate adjustments | `ai-schedule-ops?action=climate` | ❌ Dead | no caller, no cron |
| Weather-sync nightly | `ai-schedule-ops?action=weather-sync` | ❌ Dead | no cron, never invoked |

---

## 6. Recommended Refactor (proposal — not auto-applied)

### Step A — Safety
1. Flip `[functions.ai-smart-schedule] verify_jwt` from `true` → `false` to align with the actual header-based auth (matches Phase 5 lesson).
2. Add a thin tenant/farmer association check inside `schedules-api` and `ai-schedule-ops` (lookup `farmers.tenant_id == x-tenant-id`), without invoking `auth.getUser()`.

### Step B — Wake or kill `ai-schedule-ops`
Pick one of:
- **Option A (resurrect):** wire up `pg_cron` for `weather-sync` (e.g., daily at 04:00 IST) and remove the `monitor` button → `monitor` instead. Fix the OpenAI key path to use `_shared/aiConfig` (Gemini/Lovable Gateway).
- **Option B (kill):** delete `ai-schedule-ops` entirely. Move the `monitor` button's logic into `proactive-evaluator` (which already runs every 15 min, has the right shape, and writes to `farmer_alerts` correctly).

Recommendation: **Option B** — `proactive-evaluator` is already the system of record for alerts; `ai-schedule-ops` has produced zero rows after weeks of deployment.

### Step C — Slim `ai-smart-schedule`
1. Delete inline `CROP_TRANSLATIONS` (9-language table) — DB lookup at line 2674 already covers it; the fallback can use a 5-row map for the most common crops.
2. Move `agro-knowledge-base.ts`, `scientific-validator.ts`, `decision-graph-integration.ts` into `_shared/agronomy/` so they can be reused (and tree-shaken) by `proactive-evaluator` and any future schedule consumer.
3. Target reduction: ~4,700 LOC → ~2,200 LOC, ~30% faster cold start.

### Step D — Complete `schedules-api`
Add `PATCH /schedules-api/tasks/:id` (toggle complete, edit quantity) so the UI stops bypassing the gateway. This unifies all schedule writes through one auditable surface.

---

## 7. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Flipping `verify_jwt=false` on `ai-smart-schedule` | LOW | Header-auth already used; no behavior change for legitimate clients |
| Deleting `ai-schedule-ops` | LOW | Zero data ever written; one button to update in `AIScheduleDashboard.tsx` |
| Refactoring `ai-smart-schedule` shared modules | MEDIUM | Schedule generation is high-stakes; needs a parity test (compare output for 1 land before/after) |
| Adding tenant association check | LOW | Matches existing pattern in `_shared/tenantAccessGuard.ts`; 1 extra DB call per request |

---

## 8. JSON Summary

```json
{
  "edge_function_inventory": [
    {"name":"ai-smart-schedule","feature":"Schedule generation","is_used":true,"verify_jwt":true,"verify_jwt_correct":false,"loc":8065,"db_writes":["crop_schedules","schedule_tasks","land_crops"],"issues":["JWT mismatch","inline crop translation duplicates DB","monolithic 4,700 LOC index.ts"]},
    {"name":"ai-schedule-ops","feature":"Monitoring + climate + weather-sync","is_used":"partial","verify_jwt":false,"loc":557,"db_writes":["schedule_monitoring","ai_schedule_refinements","schedule_climate_monitoring","farmer_alerts","alert_notifications","ai_decision_log"],"actual_rows_written":0,"issues":["2 of 3 actions have zero callers","OpenAI hardcoded (not via _shared/aiConfig)","possible column-name mismatch (harvest_date vs expected_harvest_date)","no cron schedule registered"]},
    {"name":"schedules-api","feature":"Schedule read/delete","is_used":true,"verify_jwt":false,"loc":235,"db_writes":["crop_schedules (soft delete)"],"issues":["no PATCH for task updates","no tenant-farmer association check"]}
  ],
  "duplicate_groups": [
    {"functions":["ai-smart-schedule","ai-schedule-ops"],"reason":"Both fetch land+weather+NDVI with divergent shapes; should share _shared/agronomy data layer"}
  ],
  "dead_code": ["ai-schedule-ops?action=climate","ai-schedule-ops?action=weather-sync"],
  "recommended_actions": [
    "Flip ai-smart-schedule verify_jwt=false to match actual auth model",
    "Delete ai-schedule-ops; move monitor logic into proactive-evaluator OR resurrect with pg_cron",
    "Extract crop translation, weather fetch, NDVI fetch into _shared/agronomy/",
    "Add PATCH endpoint to schedules-api for task updates",
    "Add tenant-farmer association guard to schedules-api and (if kept) ai-schedule-ops"
  ]
}
```

