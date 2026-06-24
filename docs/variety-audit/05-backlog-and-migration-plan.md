# 05 — Prioritized Backlog & Migration Plan

Order is the rollout order for the implementation round. Each item is independently shippable.

## Status Legend
- 🔴 **P0** — blocks variety value end-to-end
- 🟡 **P1** — required for production parity
- 🟢 **P2** — quality / scale

---

### 1. 🔴 P0 — Resistance ↔ Observation reconciliation
**Why:** all 131 `variety_resistance` rows orphan against `observation_master`. Until fixed, every "resistance-aware" feature is dead code.

**Steps:**
1. Read distinct `observation_code` values from `variety_resistance`; produce mapping file `docs/variety-audit/resistance-code-map.tsv` (human-curated).
2. Migration: insert canonical aliases into `observation_aliases` so legacy codes resolve.
3. Migration: backfill `variety_resistance.observation_code` to canonical, add `FK ... NOT VALID` then `VALIDATE CONSTRAINT`.
4. Add CI guard: SQL test that asserts 0 orphans.

**Risk:** mapping ambiguity for generic codes (e.g. `RED_ROT` could match multiple crops). Resolve by prefixing with `crop_id`.

---

### 2. 🔴 P0 — Wire VarietySelector → lands persistence
**Why:** 0% adoption today because the picker doesn't reach the DB.

**Files:** `src/services/landsApi.ts`, `src/hooks/useLands.ts`, `src/pages/AddLand.tsx`, `src/pages/EditLand.tsx`.

**Acceptance:** new land created via UI persists `lands.current_crop_variety_id`; reloading the land shows the same variety in the selector.

---

### 3. 🔴 P0 — Foreign keys on every `variety_id` column
**Migration (single transaction):**
```sql
ALTER TABLE lands           ADD CONSTRAINT lands_current_crop_variety_fk
  FOREIGN KEY (current_crop_variety_id) REFERENCES master_products(id) ON DELETE SET NULL;
ALTER TABLE farmer_plans    ADD CONSTRAINT farmer_plans_current_crop_variety_fk
  FOREIGN KEY (current_crop_variety_id) REFERENCES master_products(id) ON DELETE SET NULL;
ALTER TABLE crop_schedules  ADD CONSTRAINT crop_schedules_variety_fk
  FOREIGN KEY (variety_id) REFERENCES master_products(id) ON DELETE SET NULL;
ALTER TABLE land_crops      ADD CONSTRAINT land_crops_variety_fk
  FOREIGN KEY (variety_id) REFERENCES master_products(id) ON DELETE SET NULL;
ALTER TABLE crop_history    ADD CONSTRAINT crop_history_variety_fk
  FOREIGN KEY (variety_id) REFERENCES master_products(id) ON DELETE SET NULL;
-- Partial CHECK enforcing seed-only:
CREATE OR REPLACE FUNCTION enforce_variety_is_seed() RETURNS trigger AS $$
BEGIN
  IF NEW.variety_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM master_products WHERE id = NEW.variety_id AND product_type='seed'
  ) THEN RAISE EXCEPTION 'variety_id must reference a seed master_product';
  END IF;
  RETURN NEW;
END$$ LANGUAGE plpgsql SET search_path=public;
```
Attach trigger to the five tables above (column name varies).

**Risk:** existing dangling uuids? Counts are 0 today (see DB audit §3.2) so safe.

---

### 4. 🔴 P0 — Shared `_shared/variety-context.ts`
Extract `loadVarietyProfile` / `formatVarietyProfileForPrompt` from `ai-smart-schedule/variety-context-loader.ts` into the shared folder. Re-export from the old path for backward compatibility. Adds a request-scoped cache key on `variety_id`.

---

### 5. 🔴 P0 — AI Crop Schedule wiring (Six Intelligences)
Per gap matrix in `02-ai-crop-schedule-audit.md`:
1. `resolveScheduleHorizonDays(variety, crop)` honors variety maturity first.
2. New `irrigation-planner.ts` using `water_demand_mm_per_season` + `irrigation_sensitivity.critical_stages`.
3. Yield target in schedule output.
4. `scientific-validator.ts` cross-check vs `climate_suitability`.
5. New `soil-fit-check.ts` vs `soil_suitability`.
6. State-fit warning surfaced from existing `state_match`.
7. Persist `variety_id` on `schedule_tasks` and `ai_schedule_refinements`.
8. Structured telemetry log on variety resolution.

**Demote** hard-coded matrices in `agro-knowledge-base.ts` to a strict fallback.

---

### 6. 🟡 P1 — Symbolic brain resistance integration
Per `03-symbolic-brain-audit.md`:
- Inject `variety_context` into `LandContext`.
- Apply confidence multiplier in `symbolic-reasoner.ts` + `hypothesis-evaluator.ts`.
- Apply chemical-rec suppression in `prescription-gate-enforcer.ts` (with emergency-pest bypass).
- Narrate variety in canonical language.
- Add `ai_decision_log.variety_resistance_applied` JSON column.

---

### 7. 🟡 P1 — Proactive evaluator + alerts
- Migration: add `variety_id uuid` to `proactive_alerts`, `proactive_evaluation_log` (FK to master_products).
- Resistance-gate disease alerts; irrigation-gate by water demand + critical stages.
- Persist `variety_id` on every emitted alert.

---

### 8. 🟡 P1 — schedules-api + farmer_plans payload
- Join `master_products` on every read endpoint; return shaped `variety` sub-object.
- Always persist `variety_id` on write endpoints.
- New endpoint `?action=variety-context&landId=…` for frontend reuse.

---

### 9. 🟡 P1 — Frontend land/plan UI surfacing
Per `04-variety-context-surfaces-audit.md` §4. Additive Badges/chips only; no new design directions.

---

### 10. 🟢 P2 — Performance & indexes
```sql
CREATE INDEX IF NOT EXISTS idx_variety_resistance_variety_obs
  ON variety_resistance (variety_id, observation_code);
CREATE INDEX IF NOT EXISTS idx_master_products_agro_eco
  ON master_products USING gin (agro_ecological_suitability)
  WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_master_products_crop_seed
  ON master_products (crop_id) WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_farmer_plans_variety
  ON farmer_plans (current_crop_variety_id);
```
Add `EXPLAIN ANALYZE` regression tests for the two hot read paths (schedules-api list, chat orchestrator land load).

---

### 11. 🟢 P2 — Data-quality validation + completeness scoring
- Trigger `recalc_variety_completeness_score` on `master_products` update referencing presence of: maturity, water, irrigation_sensitivity, climate, soil, ≥1 resistance row, ≥3 translations, ≥1 source reference.
- View `v_variety_data_quality` exposing per-variety completeness, orphan flags, conflict flags (e.g. `maturity_days_min > maturity_days_max`).
- CI: nightly cron writes to `variety_review_queue` for any variety with completeness < 60.

---

### 12. 🟢 P2 — Intercrop variety modelling
Migrate `lands.intercrop_*_variety` and `crop_schedules.intercrop_*_variety` from text → uuid (additive column, dual-write window, then drop text). Out of P0/P1 because intercrop adoption is low.

---

## Approval Workflow

1. You review the five reports.
2. Strike-through or comment on any backlog item you reject.
3. Reply "implement P0" (or named subset) and I'll return with focused implementation plans starting with items 1–5.

## Memory Updates Reserved for Implementation Round
- New: `mem://logic/variety-resistance-confidence-multipliers`
- New: `mem://architecture/variety-context-shared-loader`
- Update: `mem://database/variety-master-schema-v1` (consumer adoption confirmation)
- Update: `mem://logic/proactive-disease-risk-modeling` (resistance gating)
