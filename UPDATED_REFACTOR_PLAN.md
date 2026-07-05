# UPDATED_REFACTOR_PLAN — DB-Anchored

**Date:** 2026-07-05  
**Supersedes:** Prior "Phase 4 — Migrate hardcoded agronomy to DB" section.  
**Anchored to:** `DATABASE_ONTOLOGY_AUDIT.md`, `HARDCODE_TO_DB_MAPPING.md`, `MISSING_DB_CAPABILITY_REPORT.md`, `DATABASE_CLEANUP_REPORT.md`.  
**Rule:** Database brain is finalised BEFORE any runtime cleanup. LLM = narrator only. Code = graph executor only.

---

## Guiding Invariants (unchanged)

1. One agricultural fact → one DB owner.
2. No new `_v2` tables. Extend existing ontology.
3. No agriculture constants in TypeScript.
4. Additive migrations only (no PK/FK/column renames).
5. Every TS deletion is gated on a DB row-count assertion.

---

## Phase 1 — Kill Symbolic Bypasses (unchanged)
Delete `generateDefaultDecision`, `generateFallbackDecision`, `createMonitoringDecision`, INFO_MODULE / HYBRID direct-LLM branches, `findSaferAlternatives` hardcoded list, hardcoded English fallbacks in `llm-response-generator.ts`, `diagnostic-escalation-generator.ts` text assembly, sync `bridgeCodes()`. Add post-LLM re-assertion for `phi_days`, `dosage`, `product_name`, `chemical`. Apply narration validation to proactive-alert path. **No DB dependency.**

## Phase 2 — RequestScope + Kill Cross-Tenant Leaks (unchanged)
`RequestContext { tenantId, farmerId, landId, sessionId, turnId, graphTruth, ledger }` threaded through the pipeline. Remove all module-scope singletons (`orchestrator`, `reasonerInstance`, `extractorInstance`, `generatorInstance`, `symbolicReasonerInstance`). Re-key all caches by `(tenantId, cropCode, …)` with TTL. Wire `EvidenceLedger` from context.

## Phase 3 — Single Land-Context Lock (unchanged)
One `loadLandContext(landId)` per turn, frozen. Fix `authoritative-state-loader.ts`: read `crop_code` from `land_crops`; call `getStageFromDASDatabase()` only (no TS ladder). Add `blockStageWriteIfLocked` gate. Delete duplicate crop-name maps in NLU layers; use `crop_synonyms` via loader.

---

## Phase 4 — DB Ontology Finalisation (**REWRITTEN**)

**Old plan:** 9 new tables + 5 new columns.  
**Audit result:** 1 new table + ~20 new columns on 4 existing tables + 1 config row + backfill.

### 4.1 Schema Migration (single migration file)

```sql
-- (A1) crop_stage_master extensions
ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS chemical_safe_from_das INTEGER,
  ADD COLUMN IF NOT EXISTS is_critical_stage BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photoperiod_critical_day_length_hours NUMERIC;

-- (A2) chemical_regulatory_status extensions
ALTER TABLE public.chemical_regulatory_status
  ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
  ADD COLUMN IF NOT EXISTS phi_days_domestic INTEGER,
  ADD COLUMN IF NOT EXISTS phi_days_export_eu INTEGER,
  ADD COLUMN IF NOT EXISTS phi_days_export_us INTEGER,
  ADD COLUMN IF NOT EXISTS mrl_fssai_ppm NUMERIC,
  ADD COLUMN IF NOT EXISTS mrl_eu_ppm NUMERIC,
  ADD COLUMN IF NOT EXISTS who_toxicity_class TEXT
    CHECK (who_toxicity_class IN ('Ia','Ib','II','III','U')),
  ADD COLUMN IF NOT EXISTS max_dose_g_per_ha NUMERIC,
  ADD COLUMN IF NOT EXISTS crop_specific_phi JSONB,
  ADD COLUMN IF NOT EXISTS pollinator_bee_ld50_contact_ug NUMERIC,
  ADD COLUMN IF NOT EXISTS pollinator_bee_ld50_oral_ug NUMERIC,
  ADD COLUMN IF NOT EXISTS pollinator_residual_toxicity_days INTEGER,
  ADD COLUMN IF NOT EXISTS pollinator_flowering_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pollinator_evening_spray_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS buffer_pollinator_m INTEGER,
  ADD COLUMN IF NOT EXISTS buffer_aquatic_m INTEGER;
CREATE INDEX IF NOT EXISTS idx_chemical_regulatory_status_ai
  ON public.chemical_regulatory_status (lower(active_ingredient));

-- (A3) crop_baseline_guidelines_v2 cost columns
ALTER TABLE public.crop_baseline_guidelines_v2
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_low NUMERIC,
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_mid NUMERIC,
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_high NUMERIC;

-- (A4) irrigation_types efficiency
ALTER TABLE public.irrigation_types
  ADD COLUMN IF NOT EXISTS efficiency_factor NUMERIC
    CHECK (efficiency_factor > 0 AND efficiency_factor <= 1);

-- (C1) spray_condition_thresholds — only truly new table
CREATE TABLE IF NOT EXISTS public.spray_condition_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL UNIQUE,
  wind_max_kmph NUMERIC NOT NULL,
  rain_prob_max_pct NUMERIC NOT NULL,
  temp_min_c NUMERIC NOT NULL,
  temp_max_c NUMERIC NOT NULL,
  humidity_min_pct NUMERIC,
  humidity_max_pct NUMERIC,
  dry_hours_required_min INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spray_condition_thresholds TO anon, authenticated;
GRANT ALL ON public.spray_condition_thresholds TO service_role;
ALTER TABLE public.spray_condition_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read spray condition thresholds"
  ON public.spray_condition_thresholds FOR SELECT USING (is_active);
```

### 4.2 Seed Migration (data-only, follows 4.1)

- **`system_config`**: insert `hypothesis_engine_defaults` (weights + thresholds + decay).
- **`spray_condition_thresholds`**: seed 7 product types from `SPRAY_LIMITS`.
- **`chemical_regulatory_status`**: backfill new columns from `PHI_DATABASE`, `POLLINATOR_TOXICITY_DB`, `MAX_SAFE_DOSES`, inline neonic/aquatic lists.
- **`crop_stage_master`**: populate `gdd_min/max`, `expected_ndvi_min/max`, `chemical_safe_from_das`, `is_critical_stage`, `photoperiod_critical_day_length_hours` from the corresponding TS constants.
- **`crop_baseline_guidelines_v2`**: fill NPK / irrigation gaps + input cost bands.
- **`irrigation_types.efficiency_factor`**: DRIP=0.90, SPRINKLER=0.75, FURROW=0.60, FLOOD=0.55, DEFAULT via row `system`.

### 4.3 Cleanup Migration (per `DATABASE_CLEANUP_REPORT.md`, gated on user approval)

- MERGE `crop_baseline_guidelines` (v1) → `_v2`, then drop v1.
- REMOVE post-migration scratch tables (mapping / fix / staging) after `rg` confirms no edge-function reference.

---

## Phase 5 — Kill Parallel Keyword Pipelines (unchanged; now DB-backed)

- Delete `language-induction-layer.ts` and `USE_LLM_NLU=false` branch.
- Delete `observation-key-mapper.mapSymptomsToPhenomena()`, `cross-crop-symptom-mapper.ts` regex layer, `intent-router.ts` regex sets, `observation-code-mapper.ts` VISUAL_CHANGE / PEST_BEHAVIOR maps.
- Replace `conflict-resolver.isSprayAction()`, `diagnostic-escalation-generator.detectCategory()`, `safety-guardian.ts:207` `.includes()` checks with structured DB lookups on `decision_rules.action_type` / `observation_master.observation_category` / `chemical_regulatory_status.active_ingredient`.
- Replace `response-validation-gate.ts:265` crop regex with `crop_code` equality against `GraphTruth`.
- Delete all constants covered in `HARDCODE_TO_DB_MAPPING.md` — each deletion PR asserts `SELECT count(*)` ≥ TS constant size on the corresponding DB table.

---

## Phase 6 — Audit Trail Completeness (unchanged)

Every rule evaluation, gate result, hypothesis contradiction → `decision_rules_history`, `hypothesis_integrity_alerts`, `EvidenceLedger`. Trace collector uses `RequestContext.trace` (no module singleton).

---

## Phase 7 — Regression Suite (unchanged; test IDs anchored to DB rows)

1. Land-context differentiation (Sugarcane DAS 40 vs 250) → disjoint `rules_applied[]`.
2. LLM removed → symbolic packet still reaches `RESPONSE_READY`.
3. Wrong observation → no `SPRAY_*` action.
4. Low confidence → `CLARIFICATION_REQUIRED` with DB-sourced questions.
5. No matching rule → `NEED_MORE_INFORMATION`, never synthetic MONITOR.
6. GraphTruth hash equality across Mr/Hi/En for equivalent queries.
7. Cross-tenant cache isolation (concurrent same-crop requests).
8. **NEW:** For every TS constant slated for deletion, assert `SELECT count(*)` on the target DB table exceeds the constant's original size.

---

## Phase 8 — Backfill Loop (post Phase 4)

Populated rows must reach parity with prior TS coverage:

- `crop_stage_master.gdd_min/max`: seed for all 24 crops.
- `crop_stage_master.expected_ndvi_min/max`: seed for all 24 crops × active stages.
- `variety_phenology_profile`: expand from 1 crop to at least the 6 rule-covered crops.
- `chemical_regulatory_status`: extend from 59 chemicals to full CIB&RC label list.
- `observation_master.observation_category`: backfill 345 remaining rows (2540 total − 2195 populated).

Owner: agronomist team; delivery format: CSV imports via `supabase--insert`.

---

## Graph Flow Verification (Phase 5 of Prompt)

```
Land (lands, land_crops)
  ↓  farmer scope: farmers, tenants
Crop (crops, crop_synonyms, crop_groups)
  ↓
Variety (master_products WHERE product_type='SEED', variety_phenology_profile)
  ↓
Phenology (crop_stage_master + gdd_min/max + expected_ndvi_min/max
            + is_photoperiod_sensitive + chemical_safe_from_das
            + is_critical_stage; variety_phenology_profile overrides)
  ↓
Observation (observation_master + observation_translations + observation_aliases
             + intent_observation_mapping + intent_assertion_pattern
             + emergency_observation_codes)
  ↓
Hypothesis (hypothesis_master + hypothesis_conditions
            + hypothesis_contradictions + hypothesis_rule_mapping)
  ↓
Decision Rule (decision_rules + etl_standards + disease_risk_model)
  ↓
Product/Safety (master_products + chemical_regulatory_status (extended)
                + spray_condition_thresholds (new) + irrigation_types
                + crop_baseline_guidelines_v2)
  ↓
Response (LLM narrator only — reads packet, translates, adds no facts)
Audit (decision_rules_history + advisory_audit_log
       + hypothesis_integrity_alerts + safety_verifications)
```

Every node maps to a table. No orphan concept.

---

## Deliverable Order

1. **This turn:** four `.md` reports (done) + updated plan (this file).
2. **Next turn (on user approval):** run `supabase--migration` for §4.1 schema, then `supabase--insert` for §4.2 seeds.
3. **Then:** Phase 5 code deletions guarded by Phase 7 tests.
4. **Then:** Phase 8 backfill sprint.

**No code or SQL executed this cycle — audit-only deliverable, as instructed.**
