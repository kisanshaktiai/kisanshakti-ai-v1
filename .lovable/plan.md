
# Harvest Confirmation & Land Release Engine

## 1. Current System Audit (findings)

**Database (already exists):**
- `crop_schedules`: has `sowing_date`, `expected_harvest_date`, `actual_harvest_date` (nullable), `status`, `is_active`. No `harvest_status`, no `harvest_confirmed_at`, no `harvest_confirmed_by`.
- `lands`: has `current_crop_id`, `current_crop_variety_id`, `crop_stage`, `planting_date`, `expected_harvest_date`, `harvest_date`, `last_crop`, `last_harvest_date`. No `land_status` enum, no `active_schedule_id`.
- `schedule_tasks`: has `status`, `stage_key` — harvest is just another task.
- No `crop_lifecycle_events` audit table.

**Root cause:** Land "occupancy" is inferred from `lands.current_crop_id` being non-null + `crop_schedules.is_active=true`. Nothing flips these off — `expected_harvest_date` is treated as truth. AI Chat (`ai-agriculture-chat`) and Symbolic Brain load land context that keeps the crop "active" indefinitely past maturity.

**Failure scenarios confirmed:**
- After `expected_harvest_date`, crop stays `is_active=true` → stale fertilizer/pest advice.
- New schedule creation isn't blocked → duplicate active crops possible.
- AI Chat has no signal to switch to post-harvest mode.
- Symbolic Brain canonical state derives stage from `sowing_date + days` — runs past maturity into negative territory.

---

## 2. Lifecycle Contract (Single Source of Truth)

**Land status enum** (`land_lifecycle_status`):
`AVAILABLE → PREPARING → CROP_ACTIVE → READY_FOR_HARVEST → WAITING_HARVEST_CONFIRMATION → HARVEST_COMPLETED → AVAILABLE`

**Crop schedule status enum** (`crop_schedule_status`):
`PLANNED → SOWN → GROWING → MATURITY_REACHED → WAITING_HARVEST_CONFIRMATION → HARVESTED | ABANDONED`

**Harvest status enum** (`harvest_status`):
`NOT_STARTED | PARTIALLY_HARVESTED | FULLY_HARVESTED | ABANDONED`

Authoritative truth = `crop_schedules.harvest_status` + `crop_schedules.actual_harvest_date` + `lands.lifecycle_status`. Everything else is derived.

---

## 3. Database Migration Plan

```text
ENUMS
 ├── land_lifecycle_status
 ├── crop_schedule_status (extend / new)
 └── harvest_status

ALTER lands ADD
 ├── lifecycle_status land_lifecycle_status DEFAULT 'AVAILABLE'
 ├── active_schedule_id uuid NULL REFERENCES crop_schedules(id)
 └── lifecycle_changed_at timestamptz

ALTER crop_schedules ADD
 ├── harvest_status harvest_status DEFAULT 'NOT_STARTED'
 ├── harvest_confirmed_at timestamptz
 ├── harvest_confirmed_by uuid
 ├── harvest_response jsonb     -- yield, partial %, notes
 └── lifecycle_status crop_schedule_status DEFAULT 'PLANNED'

NEW TABLE crop_lifecycle_events  (audit log)
 ├── id, tenant_id, farmer_id, land_id, schedule_id
 ├── from_status, to_status, event_type, payload jsonb
 └── created_at

NEW TABLE harvest_confirmation_requests
 ├── id, tenant_id, farmer_id, land_id, schedule_id
 ├── triggered_at, due_at, channel
 ├── response harvest_status NULL, responded_at
 └── status: PENDING | RESPONDED | EXPIRED
```

Triggers:
- `trg_schedule_harvest_confirmed`: when `harvest_status='FULLY_HARVESTED'` AND `actual_harvest_date IS NOT NULL` → set schedule `lifecycle_status='HARVESTED'`, `is_active=false`; flip `lands.lifecycle_status='AVAILABLE'`, clear `current_crop_id`, `current_crop_variety_id`, `active_schedule_id`; copy to `last_crop`, `last_harvest_date`; insert lifecycle event.
- `trg_block_double_active`: prevent inserting a new `crop_schedules` row with `is_active=true` when `lands.lifecycle_status NOT IN ('AVAILABLE','HARVEST_COMPLETED')`.
- `trg_validate_lifecycle_transition`: enforce legal status transitions.

RLS: tenant_id scoped on every new table; reuse `has_role`/tenant helpers. GRANTs to `authenticated` + `service_role`.

Backfill:
- Existing `is_active=true` schedules → `lifecycle_status='GROWING'` (or `MATURITY_REACHED` if past `expected_harvest_date`), `harvest_status='NOT_STARTED'`.
- Existing `is_active=false` schedules with `actual_harvest_date` → `HARVESTED` + `FULLY_HARVESTED`.
- `lands.lifecycle_status` derived: `CROP_ACTIVE` if any active schedule, else `AVAILABLE`.

---

## 4. Backend Engine

**New edge function `harvest-engine`** (cron + on-demand):
- Daily scan: for each active schedule where `today >= expected_harvest_date - 3d` → flip `lifecycle_status` to `MATURITY_REACHED` / `WAITING_HARVEST_CONFIRMATION`; create `harvest_confirmation_requests` row; emit push/in-app notification; insert AI chat reminder card.
- Re-prompt cadence: day 0, +3, +7, +14, then weekly until response or 60d → `ABANDONED`.
- Endpoint `POST /confirm`: body `{schedule_id, response: FULLY|PARTIAL|NOT_YET|ABANDONED, actual_harvest_date, yield?, notes?}` → writes `harvest_status`, `actual_harvest_date`, `harvest_confirmed_at`, lets triggers cascade.

**Existing `schedules-api`**: add `POST /:id/harvest-confirm` proxy → `harvest-engine`. Block new schedule creation when land not `AVAILABLE`.

---

## 5. AI Chat Integration (`ai-agriculture-chat`)

Land context loader changes:
- Read `lands.lifecycle_status` + active schedule's `lifecycle_status` + `harvest_status`.
- Inject canonical block:
  ```
  CROP_LIFECYCLE_STATE: HARVESTED | WAITING_HARVEST_CONFIRMATION | ACTIVE
  ACTUAL_HARVEST_DATE: <date|null>
  ```
- Hard gate in orchestrator:
  - `HARVESTED` → route to post-harvest agent (residue / soil prep / next-crop planning). Block active-crop pest/fertilizer rules.
  - `WAITING_HARVEST_CONFIRMATION` → first message asks farmer to confirm; surface confirmation CTA.
  - `ACTIVE` → current behavior.

Symbolic guard: any rule with `category IN (pest, fertilizer, irrigation_active)` is filtered out when state ≠ `ACTIVE`. Logged as `LIFECYCLE_GATE_BLOCKED`.

---

## 6. Symbolic Decision Brain

Canonical State Builder:
- Stop deriving "active crop" from `sowing_date + duration`. Replace with `deriveCropStage(schedule)`:
  ```
  if harvest_status='FULLY_HARVESTED' → POST_HARVEST
  elif lifecycle_status='WAITING_HARVEST_CONFIRMATION' → AWAITING_CONFIRMATION
  elif today > expected_harvest_date → MATURITY_REACHED
  else → stage-from-days
  ```
- Rule engine: register lifecycle category gate (mapBundledCategory). Unknown post-harvest categories → `SYMBOLIC_CONTRACT_VIOLATION` (per existing core rule).
- Proactive evaluator: skip active-crop rules for non-ACTIVE lands; enable `post_harvest_*` rule pack.

---

## 7. Notification Workflow

Channels (all tenant-scoped via existing `notificationService`):
1. Push (capacitor) — i18n title/body.
2. In-app inbox alert (`proactive_alerts` row, type=`HARVEST_CONFIRMATION_REQUEST`).
3. Dashboard banner on Land detail + Schedule screen.
4. AI Chat system message inserted on next session open.

Each notification carries `schedule_id` deep link → opens Harvest Confirmation sheet.

---

## 8. Frontend UX

New components:
- `HarvestConfirmationSheet` (bottom sheet): three big buttons — "Harvest Completed ✅", "Partial Harvest 🟡", "Not Yet Done ⏳"; date picker (default today); optional yield/notes; i18n en/hi/mr.
- `LandLifecycleBadge`: chip on Land card showing `AVAILABLE / CROP_ACTIVE / WAITING_HARVEST / …`.
- `HarvestAlertBanner` on Schedule + Home.
- Schedule generation flow: if land not `AVAILABLE` → show explanation + CTA to confirm pending harvest.

Wire-ups:
- `useSchedules` exposes `confirmHarvest(scheduleId, payload)`.
- `useLands` returns `lifecycle_status` and blocks "New Schedule" CTA when not free.

---

## 9. Multi-Tenant Safety
- All new tables: RLS `tenant_id = current_tenant()` + farmer scoping via `has_role`/existing helpers.
- `harvest-engine` validates `x-tenant-id` + `x-farmer-id` (existing `tenantAccessGuard`).
- Notifications scoped by `tenant_id`.
- Backfill runs per-tenant in a single transaction.

---

## 10. Testing & Production Validation
- Unit: lifecycle transition matrix; trigger blocks double-active; harvest engine cron idempotency.
- Integration: confirm-harvest end-to-end (DB → triggers → land released → AI Chat post-harvest mode).
- E2E: Generate schedule → fast-forward maturity → receive notification → confirm → verify land available → new schedule allowed.
- Validation jobs (nightly):
  - lands with `current_crop_id` IS NOT NULL but no active schedule.
  - active schedules with `actual_harvest_date` set.
  - duplicate active schedules per land.
  - AI Chat sessions that emitted active-crop advice after `HARVESTED`.

---

## 11. Rollback
- Migration is additive (new columns/tables/enums). Rollback drops triggers + new columns. Existing reads keep working.
- Feature-flag `HARVEST_CONFIRMATION_ENABLED` per tenant; engine no-ops when off.

---

## 12. Step-by-Step Implementation Order

1. **Migration**: enums, columns, tables, triggers, RLS, GRANTs, backfill. *(supabase--migration)*
2. **Edge function `harvest-engine`** + cron schedule.
3. **`schedules-api`** patch: confirm-harvest route + block-creation guard.
4. **AI Chat**: land context loader + orchestrator gate + post-harvest agent stub.
5. **Symbolic Brain**: canonical state + rule gate + proactive filter.
6. **Frontend**: `HarvestConfirmationSheet`, `LandLifecycleBadge`, banner, i18n (en/hi/mr), schedule-generation guard.
7. **Notifications**: push + in-app + chat reminder.
8. **Validation jobs** + dashboards.
9. **QA** with feature flag rolled out tenant-by-tenant.

---

This is a large multi-phase change. Approve to proceed; I will start with **Step 1 (migration)** which requires your explicit approval before running.
