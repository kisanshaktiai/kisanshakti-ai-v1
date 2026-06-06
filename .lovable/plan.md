# Step 2 — Harvest Engine (with crop-aware auto-confirmation)

We do NOT create a new edge function. The engine lives as an `?action=harvest-engine` branch inside the existing **`schedules-api`** function and is driven by `pg_cron` → `pg_net`. Zero new deploy slots.

## Engine responsibilities

The Step-1 migration (`20260606150014_*.sql`) already installed enums, lifecycle columns on `lands`/`crop_schedules`, the `harvest_confirmation_requests` table with `uniq_hcr_open_per_schedule`, the cascade trigger `fn_cascade_harvest_completion`, the guard `fn_block_double_active_schedule`, and the audit table `crop_lifecycle_events`.

The cron engine only does the time-based transitions Postgres cannot do on its own. There are now **three** steps:

### 1. MATURITY DETECTION
For each active schedule where `expected_harvest_date <= today` AND `harvest_status='NOT_STARTED'` AND `lifecycle_status IN ('PLANNED','SOWN','GROWING')`:
- `crop_schedules.lifecycle_status='MATURITY_REACHED'`
- `lands.lifecycle_status='WAITING_HARVEST_CONFIRMATION'`
- INSERT into `harvest_confirmation_requests` (the unique partial index dedupes)
- audit row in `crop_lifecycle_events` (`MATURITY_REACHED`)
- `farmer_alerts` row (`HARVEST_READY`, priority `high`)

### 2. REMINDERS
For `harvest_confirmation_requests.status='PENDING'` AND `last_reminded_at < now() − 48h` AND `reminder_count < 5`:
- bump `reminder_count`, set `last_reminded_at=now()`
- `farmer_alerts` row (`HARVEST_REMINDER`, priority `medium`)

### 3. AUTO-CONFIRMATION (crop-aware) — **new**
If the farmer never manually confirms, the engine auto-closes the loop after a crop-specific grace window measured from `expected_harvest_date`:

| Crop | Grace days after `expected_harvest_date` |
|---|---|
| **sugarcane** (ऊस / गन्ना / `sugarcane`) | **30** |
| every other crop (default) | **15** |

The grace map lives in `harvest-engine.ts` (`AUTO_CONFIRM_GRACE_DAYS_BY_CROP`) and is keyed by normalized crop code, so adding overrides for `cotton`, `banana`, etc. is one-line.

Selection: open `harvest_confirmation_requests` where `status='PENDING'` joined to its `crop_schedules` row where `expected_harvest_date + grace_days(crop) <= today` (the grace lookup is computed in code, not SQL, to keep the join simple — we filter PENDING requests by their schedule's expected date in a single follow-up batch).

Action per row:
1. `UPDATE crop_schedules SET harvest_status='FULLY_HARVESTED', actual_harvest_date = LEAST(today, expected_harvest_date + grace_days), harvest_response = jsonb_build_object('source','auto-confirm','reason','no_farmer_response','grace_days',N,'crop',crop)`.
   - The existing trigger `fn_cascade_harvest_completion` then automatically: marks schedule `HARVESTED` + `is_active=false`, releases the land (`lifecycle_status='AVAILABLE'`, clears `current_crop_*`), writes a `HARVEST_COMPLETED` audit row, and closes the open request (`status='RESPONDED', response='FULLY_HARVESTED'`).
2. Emit a `farmer_alerts` row (`HARVEST_AUTO_CONFIRMED`, priority `low`) telling the farmer the system auto-closed the season and they can edit yield/notes from the schedule screen if needed.

Reminder step #2 stops naturally because the request is no longer PENDING. The previous "expire after 5 reminders / 14d" branch is **removed** — auto-confirm supersedes it (the farmer's silence is treated as implicit confirmation, not a failure).

## Multi-tenant safety
- Service-role only; engine never trusts client headers.
- All writes idempotent: `uniq_hcr_open_per_schedule` dedupes INSERTs; auto-confirm uses optimistic `eq('harvest_status','NOT_STARTED')` guard so re-runs are no-ops.
- Triggers remain the single source of truth for state transitions.

## Auth model for the cron call
Anon Bearer (same pattern as `proactive-evaluator`). No secret needed. Token is **not** required.

## Cron wiring
Already scheduled via `supabase--insert`: `harvest-engine-daily`, jobid 18, `30 4 * * *` (04:30 UTC / 10:00 IST).

## File changes
1. **`supabase/functions/schedules-api/harvest-engine.ts`** — replace `expirePending(...)` with `autoConfirm(...)`; add `AUTO_CONFIRM_GRACE_DAYS_BY_CROP` map + `normalizeCropForGrace()` helper.
2. **`supabase/functions/schedules-api/index.ts`** — unchanged (action branch already there).
3. No DB migration, no new secret.

## Verification after build
- `curl_edge_functions` POST `schedules-api?action=harvest-engine` → returns `{ ok, matured, reminders_sent, auto_confirmed, duration_ms }`.
- Seed a sugarcane schedule with `expected_harvest_date = today − 31d` → next run auto-confirms it; land returns to `AVAILABLE`; `crop_lifecycle_events` has both `MATURITY_REACHED` and `HARVEST_COMPLETED` rows.
- Same row, run engine again → `auto_confirmed=0` (idempotent).
- Non-sugarcane schedule at `today − 14d` → not yet auto-confirmed; at `today − 16d` → auto-confirmed on next run.

## Rollback
- `select cron.unschedule('harvest-engine-daily');`
- Revert `harvest-engine.ts` to the previous version (expiry behaviour).
- Step-1 schema stays — harmless without the engine.
