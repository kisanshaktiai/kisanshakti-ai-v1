---
name: Observation classification DB SSOT (PR-2)
description: DB-driven failure-class and authority-domain classification for observation and cause tokens; replaces hardcoded Sets in failure-class-detector, authority-resolver, unified-decision-gate.
type: architecture
---

# Observation Classification DB SSOT (PR-2)

## Contract
- **SSOT**: `public.observation_master` (2,540 rows) + `public.observation_aliases` for ALL_CAPS→canonical bridging + `public.hypothesis_master` for cause→type lookup.
- **Cache**: `utils/observation-classification-cache.ts` (10-min TTL, preloaded in `orchestrator.ts`).
- **Consumers**: `failure-class-detector.ts`, `authority-resolver.ts`, `unified-decision-gate.ts`.

## Derivation rules (DB → Runtime enum)
- FailureClass ← `semantic_class` + `canonical_group` + `observation_category`:
  - `weather_damage` (not soil) OR `_weather` group → VEGETATIVE_STRESS
  - `pest` / `disease` / `nutrient` / `weed` → matching FC
  - `phenology` / `establishment` / `_stage` group → ESTABLISHMENT_FAILURE
  - `physiology` → VEGETATIVE_STRESS
- AuthorityDomain ← same signals:
  - `_soil` group → LAND
  - `weather_damage` (not soil) → CLIMATE
  - `pest`/`disease`/`nutrient`/`weed`/`physiology`/`phenology` → CROP
- Vagueness ← `is_diagnostic=false` OR `clarity_score<30`.
- Early stage ← `crop_stage_master.das_max ≤ 30`, Vegetative ← `30 < das_max ≤ 90`.

## Deleted hardcoded artefacts
- `failure-class-detector.ts`: `ESTABLISHMENT_OBSERVATIONS`, `PEST_OBSERVATIONS`, `DISEASE_OBSERVATIONS`, `NUTRIENT_OBSERVATIONS`, `WEED_OBSERVATIONS`, `VEGETATIVE_STRESS_OBSERVATIONS`, `EARLY_STAGES`, `VEGETATIVE_STAGES`, inline `floweringObs`, `countMatches()`.
- `authority-resolver.ts`: `LAND_SYMPTOMS`, `CLIMATE_SYMPTOMS`, substring cause checks (`c.includes('PEST')`, etc.), substring symptom checks.
- `unified-decision-gate.ts`: `VAGUE_SYMPTOM_PATTERNS`, `YOUNG_CROP_STAGES` (Set variant; DAS-based path kept).

## Cache-miss contract
`classifyObservation`, `classifyFailureClass`, `classifyAuthorityDomain`, `getHypothesisType` return `null`/`UNKNOWN` on miss. Callers MUST log `[OBS_CLASSIFICATION_MISS]` and NEVER substitute a hardcoded fallback. Fixing a miss means curating the DB row.

## Deferred to PR-2b / later
- `authority-resolver.SAFETY_CAUSES/LAND_CAUSES/CLIMATE_CAUSES/SYSTEM_CAUSES`: still hardcoded governance-token Sets (SALINITY, FROST, PHI_VIOLATION, …). These are authority-governance semantics, not observation agronomy; migrate to a new `authority_governance_tokens` table in PR-2b.
- `diagnostic-flow-controller.extractDetectedCauses()`: substring `symptom→cause` mapping still hardcoded; convert to observation_master classification in PR-2c.
- `unified-decision-gate.YOUNG_CROP_MAX_DAYS`: per-crop day thresholds; migrate to `crop_baseline_guidelines_v2.young_crop_max_das` when the schema/data land (see `HARDCODE_TO_DB_MAPPING.md` #19).
- `prescription-gate-enforcer.YOUNG_CROP_STAGES`, `nutrition-conflict-arbitrator.NON_NUTRIENT_OBSERVATIONS`: same pattern; already point at this cache — sweep in a follow-up.
