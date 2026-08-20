# Crop schedule forensic audit — findings and fix plan

## Part 1 — "This land already has an active crop" on a freshly added land

Verified in the database:

- Land `8897e53d…` ("Kodoli Mala", created 2026-08-18) has `lifecycle_status = CROP_ACTIVE` and `active_schedule_id = a3eb23c2…`.
- That schedule row `a3eb23c2…` has `is_active = false`, `lifecycle_status = PLANNED`, `harvest_status = NOT_STARTED`, 248 tasks.
- So the land has **zero active schedules** but is still flagged CROP_ACTIVE. It is the only land in this state today (all other CROP_ACTIVE lands have exactly one active schedule).

Cause chain (all verified by reading the code and the trigger sources):

1. `ai-smart-schedule` inserts the schedule with `is_active = true`. The trigger `fn_block_double_active_schedule` promotes `lands.lifecycle_status → CROP_ACTIVE` and sets `active_schedule_id`.
2. `schedules-api` DELETE is a **soft delete**: it deletes `schedule_tasks` and sets `crop_schedules.is_active = false`. It never touches `lands.lifecycle_status` / `active_schedule_id`.
3. The only demotion path back to `AVAILABLE` is `fn_cascade_harvest_completion`, which fires only on `harvest_status = FULLY_HARVESTED` or `ABANDONED`. A soft-deleted/deactivated schedule never triggers it.
4. Next generation attempt hits the fail-fast guard in `ai-smart-schedule/index.ts` (`lifecycle_status === 'CROP_ACTIVE'`) and returns `LAND_NOT_AVAILABLE` — the message the farmer sees.

### Fixes

1. **Trigger (migration):** add an `AFTER UPDATE` trigger on `crop_schedules` — when a row goes `is_active true → false` and no other active schedule remains for that land, release the land: `lifecycle_status = 'AVAILABLE'`, `active_schedule_id = NULL`, `lifecycle_changed_at = now()`, and log a `crop_lifecycle_events` row (`SCHEDULE_DEACTIVATED`). Harvest/abandon paths keep their existing behaviour.
2. **Backfill (same migration):** release every land that is CROP_ACTIVE with zero active schedules (currently exactly `8897e53d…`), with an audit event per land.
3. **Server guard (`schedules-api`):** after the soft delete, explicitly reconcile the land, so the API is correct even if the trigger is bypassed.
4. **Guard hardening (`ai-smart-schedule/index.ts`):** before returning `LAND_NOT_AVAILABLE`, verify an active schedule actually exists. If the land is CROP_ACTIVE but has none, self-heal (release the land) and continue generating instead of blocking.
5. **Client message:** keep the existing localized 409/200 domain toast; add the current crop name and an "confirm harvest" affordance when the block is genuine.

## Part 2 — Farming-mode preset matrix: is it applied?

**No. It is not applied anywhere.** Verified:

- Columns exist: `crop_schedules.nutrient_policy` / `protection_policy`, `land_crops.nutrient_policy` / `protection_policy`, `farmers.default_nutrient_policy` / `default_protection_policy`, each with a CHECK constraint allowing `organic_only | integrated | inorganic_allowed` (nutrient) and `organic_only | integrated | synthetic_allowed` (protection).
- No trigger, no default, no DB function derives these columns from `farming_type`.
- Current data contradicts the requested matrix: `organic_fertilizer` rows are stored as `organic_only / NULL` (12 rows) and `organic_only / integrated` (4 rows). Target is `integrated / organic_only`.
- Grep across `supabase/functions` and `src`: **zero** reads of `nutrient_policy` / `protection_policy` outside the generated types file. They are dead columns.
- `ai-smart-schedule` contains no occurrence of "organic" or "farming" other than storing `body.farmingType` verbatim on the schedule row. Schedule generation today is completely farming-mode-blind: the baseline generator picks fertilizer/protection tasks with no policy filter.

### Where the data comes from during generation (today)

`CropDateInput` / `ScheduleGenerator` (default `organic_fertilizer`) → `Schedule.tsx` → request body `farmingType` → written to `crop_schedules.farming_type`. Nothing else reads it. `land_crops.farming_type` and the chat farming-mode store are a separate lane.

### Proposed final, deterministic, versioned design

1. **Preset table (SSOT), new migration:** `public.farming_mode_presets` — `farming_type` (PK), `nutrient_policy`, `protection_policy`, `version` int, `is_active`, `rationale`, `effective_from`. Seed exactly the matrix given:

   ```text
   organic_only         → organic_only        / organic_only
   organic_fertilizer   → integrated          / organic_only
   fertilizer_pesticide → inorganic_allowed   / synthetic_allowed
   ipm (reserved, inactive) → integrated      / integrated
   ```

   Grants: `SELECT` to `anon`/`authenticated`, `ALL` to `service_role`; RLS on with a read-only public policy (reference data).

2. **Deterministic derivation:** a `BEFORE INSERT OR UPDATE` trigger on `crop_schedules` and `land_crops` fills `nutrient_policy` / `protection_policy` from the active preset whenever `farming_type` is set or changed, and stamps `policy_version`. Explicit caller-supplied policies are never silently overwritten by a *different* value — a mismatch raises, so the preset stays the only author.

3. **Backfill:** rewrite existing rows to the matrix (16 `organic_fertilizer` rows change to `integrated / organic_only`), recorded with the preset version.

4. **Generator consumption (`ai-smart-schedule`):** resolve the preset once in `db/resolve-inputs.ts` (farming type from request → preset row) and thread `nutrient_policy` / `protection_policy` into `generator/baseline-generator.ts`:
   - nutrient tasks: `organic_only` → organic sources only; `integrated` → organic-first, synthetic top-up allowed and labelled; `inorganic_allowed` → unrestricted.
   - protection tasks: `organic_only` → bio/cultural only, synthetic rules skipped and pushed to `gaps[]` with reason `policy_excluded`; `integrated` → organic-first with synthetic fallback; `synthetic_allowed` → unrestricted.
   - Every emitted task keeps `source_refs` / `rule_ids`; nothing is invented, missing organic coverage becomes a gap, never a substituted chemical.

5. **Chat/advisory alignment:** the existing farming-mode store keeps `crop_schedules` as SSOT; it will additionally write `farming_type` only, letting the trigger derive the policies, so chat and schedule can never diverge.

6. **Tests:** extend `tests/edge/schedule/` with a preset-contract test (each `farming_type` maps to the exact policy pair) and a policy-filter test (an `organic_fertilizer` schedule contains no synthetic protection task).

## Sequencing

Part 1 (lifecycle release + backfill + self-heal) ships first and unblocks the land immediately. Part 2 ships as one migration plus the generator wiring, behind the same deploy.
