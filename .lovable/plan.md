

# Proactive Alerts System Audit — Findings & Fix Plan

## Critical Findings

### 1. Cron IS Running, But Evaluation Log INSERT Fails Silently (P0)

The edge function runs every 15 minutes (confirmed by logs at 08:15 UTC today, March 31). However, **zero rows appear in `proactive_evaluation_log` for March 31**.

**Root Cause**: The INSERT at line 172 uses wrong column names and is missing required NOT NULL fields:

```text
Code inserts:        Table expects:
─────────────        ──────────────
trigger_type    →    evaluation_type (NOT NULL)
(missing)       →    tenant_id (NOT NULL)
```

The column `tenant_id` is `NOT NULL` with no default, and `evaluation_type` is `NOT NULL` — so the INSERT silently fails every run.

### 2. Alerts Blocked by Dedup Constraint — Only March 29 Data Exists (P0)

All 15 alerts have `created_at: 2026-03-29`. The dedup key format is `PRO_NDVI_STRESS:{land_id}:2026-03-29`. New runs generate keys with today's date (`2026-03-31`), but the edge function logs show:

```
ERROR: duplicate key value violates unique constraint "idx_proactive_alerts_dedup"
```

The unique index `idx_proactive_alerts_dedup` is a **global unique** on `dedup_key` — meaning if an alert with `PRO_NDVI_STRESS:{land}:2026-03-31` was partially inserted on a previous run and the transaction didn't fully roll back, or the in-memory dedup check (`isDuplicate`) is comparing against the March 29 alerts' 72h window and still blocking, the new alerts cannot be created.

The logs show "28 rules fired, 7 alerts" — meaning 7 pass the in-memory dedup but then fail at the DB unique constraint. This means the same dedup_keys are being regenerated each run within the same day, and the first successful partial insert blocks all subsequent runs.

### 3. Alert Diversity Still Zero — Only NDVI Fires

All 15 alerts are `PRO_NDVI_STRESS` / `CROP_STRESS`. The decision rule fallback evaluation fires some rules, but they get blocked by either dedup or the daily throttle.

## Fix Plan

### Fix 1 — Fix Evaluation Log INSERT (P0)
**File**: `supabase/functions/proactive-evaluator/index.ts` (line ~172)

Change `trigger_type` → `evaluation_type` and add `tenant_id`:
```typescript
await supabase.from('proactive_evaluation_log').insert({
  tenant_id: tenantIds[0] || 'default',
  evaluation_type: action === 'scheduled' ? 'scheduled' : 'manual',
  lands_evaluated: totalLands,
  rules_evaluated: totalRulesFired,  // column is rules_evaluated, not rules_fired
  rules_fired: totalRulesFired,
  alerts_generated: totalAlerts,
  execution_time_ms: elapsed,
  metadata: { tenants_processed: tenantIds.length },
});
```

### Fix 2 — Fix Dedup Key Collision on Batch Insert (P0)
**File**: `supabase/functions/proactive-evaluator/index.ts`

The batch INSERT of `alertsToInsert` fails entirely when ANY row has a duplicate key. Change to use `.upsert()` with `onConflict: 'dedup_key'` and `ignoreDuplicates: true`:
```typescript
const { data: insertedAlerts, error: alErr } = await supabase
  .from('proactive_alerts')
  .upsert(alertsToInsert, { onConflict: 'dedup_key', ignoreDuplicates: true })
  .select('id, risk_score, priority, ...');
```

This ensures new alerts (different dedup_key) get inserted while duplicates are silently skipped.

### Fix 3 — UI: `useProactiveAlerts` Shows All Alerts Including New Dates
**File**: `src/hooks/useProactiveAlerts.ts`

The current query filters for `status IN ('PENDING', 'DELIVERED', 'SEEN')` which is correct. Once Fix 2 allows new alerts to be inserted, the UI will automatically show them. No code change needed here — the issue is upstream (no new alerts being created).

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/proactive-evaluator/index.ts` | Fix evaluation_log column names + add tenant_id; Change alert INSERT to upsert with ignoreDuplicates |

## Expected Outcome

- Evaluation logs resume appearing in DB for every cron run
- New alerts are created daily (not blocked by dedup collisions)
- Cron health becomes monitorable via `proactive_evaluation_log`

