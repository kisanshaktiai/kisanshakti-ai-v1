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

---

# Step 5 — Harvest Notification Delivery (local push + WhatsApp share)

No new edge function, no provider secrets. Two complementary delivery channels:

## 5a. Local browser notification (PWA)
- `src/hooks/useHarvestNotificationDelivery.ts` reads `usePendingHarvests()` and, when permission is already `'granted'`, fires one `new Notification('🌾 Ready for harvest', ...)` per matured schedule.
- Dedupe by `schedule_id` in `localStorage` (`harvest:notified_schedule_ids`, capped to 200) so reloads never re-notify.
- Mounted inside `HarvestConfirmBanner` so it activates exactly where pending harvests are already fetched — no extra subscriptions.
- No permission auto-prompt; that stays with the unified Permission Hub.

## 5b. WhatsApp share intent
- `HarvestConfirmDialog` gains a `Share2` icon button in the footer that opens `https://wa.me/?text=<crop • land\nyield q\ndate>` in a new tab. Pre-fills from current dialog state so the farmer can send the confirmation to an agronomist / family member.
- Recent rows in `HarvestHistoryCard` also each expose a per-row WhatsApp share for past harvests.
- `wa.me` is a public URL scheme — no API key, no backend.

## i18n
- New keys `schedule.harvest.dialog.share` in en/hi/mr.

---

# Step 6 — Post-harvest Analytics

## Data layer
- `src/hooks/useHarvestHistory.ts` queries `crop_schedules` for `farmer_id = current user` where `harvest_status IN ('FULLY_HARVESTED','PARTIALLY_HARVESTED')`, joined to `lands(name, area_acres)`, ordered by `actual_harvest_date desc`, limit 200.
- Derived per row: `days_to_harvest = actual − sowing`, `yield_per_acre_qtl = actual_yield_quintals / area_acres`, `season_key = YYYY-H1|H2`.
- `aggregate(rows)` exports totals, avg yield/acre, avg days, best row, and arrays grouped by season & crop.

## UI
- `src/components/analytics/HarvestHistoryCard.tsx`:
  - Header with badge count.
  - 3-stat strip: total yield (q), avg q/ac, avg days.
  - Season-over-season delta % (latest two seasons present in data).
  - Top performer card (highest q/ac) with trophy.
  - Recent 5 rows, each with a WhatsApp share button and an `auto` tag if `harvest_response.source = 'auto-confirm'`.
- Mounted in `Analytics.tsx` in both single-land scope (after `MarketPulseCard`) and all-farm aggregate view (after `ForecastChart`). Empty-state copy when farmer has no completed harvests yet.

## i18n
- New `analytics.harvest_history.*` keys in `en/analytics.json`. Other languages fall back via existing i18n fallback chain.

## Files touched (Steps 5 + 6)
- created `src/hooks/useHarvestNotificationDelivery.ts`
- created `src/hooks/useHarvestHistory.ts`
- created `src/components/analytics/HarvestHistoryCard.tsx`
- edited `src/components/home/HarvestConfirmBanner.tsx` (mount notification hook)
- edited `src/components/schedule/HarvestConfirmDialog.tsx` (WhatsApp share button)
- edited `src/pages/Analytics.tsx` (mount HarvestHistoryCard)
- edited `src/i18n/locales/{en,hi,mr}/schedule.json` (share key)
- edited `src/i18n/locales/en/analytics.json` (harvest_history block)

No DB migration, no new edge function, no new secret.

---

# Step 7 — Post-harvest Residue & Rotation Suggestions

After the farmer confirms a real harvest (`FULLY_HARVESTED` or `PARTIALLY_HARVESTED`), surface a follow-up dialog with:
- **Residue tip** — family-specific (sugarcane → mulch trash, rice → decomposer, cotton → shred + remove root stubble, etc.). Never recommends burning.
- **2-3 next-crop suggestions** — driven by a static rotation matrix in `src/lib/harvest/postHarvestSuggestions.ts` keyed by detected `CropFamily`. Each suggestion carries a `reason_key` chip (`fixes_nitrogen`, `breaks_pest_cycle`, `different_family`, `classic_pair`, etc.).

## Why static & not DB-driven
These are operational rotation hints (not pest/nutrition prescriptions), so per the agronomic-safety memory they may live in code. No chemical advice, no dosages.

## Family detection
`detectCropFamily(crop)` does a substring/regex match against English + Devanagari/regional tokens for 12 families. Defaults to `unknown` (still returns safe legume/cereal suggestions).

## Trigger point
`HarvestConfirmDialog` now sets `showNext=true` after a successful submit (not for `ABANDONED`) and renders `PostHarvestSuggestionDialog` as a sibling.

---

# Step 8 — One-tap "Plan Next Crop"

Each suggestion row in `PostHarvestSuggestionDialog` has a **Plan** button that:
1. Closes the suggestion dialog.
2. `navigate('/app/schedule', { state: { preselectedLandId, suggestedCrop, source: 'post-harvest' } })`.

`Schedule.tsx` reads `useLocation().state` once lands are loaded, auto-selects the land, jumps `flowStep='crop-input'`, fires a toast with the suggested crop name, then clears history state (so a refresh doesn't re-trigger).

The existing `CropDateInput` → `ai-smart-schedule` flow handles the actual schedule creation — no edge function changes.

## Files touched (Steps 7 + 8)
- created `src/lib/harvest/postHarvestSuggestions.ts` — rotation matrix + family detector
- created `src/components/schedule/PostHarvestSuggestionDialog.tsx`
- edited `src/components/schedule/HarvestConfirmDialog.tsx` — open suggestion dialog after success
- edited `src/pages/Schedule.tsx` — read `location.state.preselectedLandId / suggestedCrop`

No DB migration, no new edge function, no new secret. Pure frontend close-the-loop.
