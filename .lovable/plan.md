
# P1 Symbolic Decision Brain — System-Wide Fix (All Crops)

## Why a rice-only patch was wrong

The failing query "भात अद्याप उगवले नाही" exposed **structural** defects, not rice-specific data gaps. Database state confirms it:

| Signal | Value |
|---|---|
| `intent_observation_mapping` active rows | 13,521 across 12 crops |
| Rows at confidence_rank = 1 | 11,753 (87%) — rank is not selective |
| Distinct intents | 86 |
| Active `decision_rules` | 1,846 |
| Rules with `stage_applicable` set | 1,846 (100%) — gate exists but isn't enforced post-selection |
| Rules with `conditions_json.observations` | 1,822 (98%) |
| `observation_master` rows | 2,540 |
| `observation_aliases` | 2,919 |
| `observation_translations` | 5,145 |
| `hypothesis_master` | 346 |

The same three defects fire for tomato, onion, cotton, sugarcane, etc. Any rule whose `data_authority_rank` is high and whose conditions are mostly contextual (weather/soil) can win against an empty confirmed lane — regardless of crop.

## Root causes (crop-agnostic)

**RC-1 — Lane collapse.** `orchestrator.ts` sends **all** `intent_observation_mapping` rows to the *candidate* lane. There is no DB-curated field telling the system which rows are the farmer's *literal* assertion vs. a differential hypothesis, so the confirmed lane stays empty even when the farmer plainly stated the observation. The evaluator then scores rules against an empty symptom set and the highest-authority rule wins by tiebreak.

**RC-2 — Empty-confirmed fallthrough.** `layered-rule-evaluator.ts` at line ~992 falls back to `visual_symptoms` and silently allows primary selection when both lanes are empty. There is no invariant: *"if a rule's `conditions_json.observations` is non-empty and the farmer has confirmed zero observations, the rule cannot be primary."*

**RC-3 — Stage gate bypassed post-selection.** The stage gate lives inside `rule.when.custom` (line ~1372) and only filters rules during PHASE 2 (DIAGNOSIS). Rules already in `matched_responses` are re-ranked in `selectPrimaryDecision` without re-checking `stage_applicable` against `state.crop_stage`. When `state.crop_stage` is UNKNOWN at PHASE 2 (land context still loading) the gate is skipped entirely.

**RC-4 — Context-completeness silently treated as "no opinion".** `condition_ledger` already marks NDVI/soil/weather as `SKIPPED_NO_DATA` when absent, but `decision_rules` has no field declaring *how much* required context a rule needs to fire. Rules requiring 5 contextual inputs and rules requiring 0 compete on the same evidence ratio.

**RC-5 — Land context loader fan-in is implicit.** `lands`, `soil_health`, `ndvi_data`, `weather_current/forecast`, `crop_schedules` are pulled by different agents with no shared completeness ledger, so the evaluator cannot tell "data missing" from "data present and negative".

## Solution architecture — fully DB-driven, no hardcoded crop lists

### Layer 1 — Schema (one structural column per defect, all default-safe)

```sql
-- 1.1 IOM: declare how strongly each mapping asserts the farmer's literal claim
ALTER TABLE intent_observation_mapping
  ADD COLUMN assertion_strength text NOT NULL DEFAULT 'DIFFERENTIAL'
  CHECK (assertion_strength IN ('LITERAL','STRONG_HYPOTHESIS','DIFFERENTIAL'));
-- DEFAULT 'DIFFERENTIAL' = today's behavior, zero regression.

-- 1.2 decision_rules: min context completeness a rule needs to be eligible
ALTER TABLE decision_rules
  ADD COLUMN min_data_completeness numeric NOT NULL DEFAULT 0.0
  CHECK (min_data_completeness BETWEEN 0 AND 1);
-- DEFAULT 0.0 = today's behavior, zero regression.

-- 1.3 Tiny lookup that drives the agronomist-editable backfill
CREATE TABLE intent_assertion_pattern (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_code     text NOT NULL,
  obs_code_regex  text NOT NULL,        -- matched against observation_master.observation_code
  assertion_strength text NOT NULL CHECK (assertion_strength IN ('LITERAL','STRONG_HYPOTHESIS')),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (intent_code, obs_code_regex)
);
-- Seeded with ~20 generic patterns (EMERGENCE_FAILURE → '_no_emergence|_poor_germination',
-- LODGING → '_lodging', WILTING → '_wilt|_wilting', etc.). Cross-crop by construction.
-- Agronomists edit this table; no code changes to add crops.
```

Plus the required `GRANT` block and standard RLS (read-only for `authenticated`, full for `service_role`).

### Layer 2 — DB-driven backfill (no per-crop SQL)

A single regex-driven UPDATE walks all 13,521 IOM rows once, joins each row's `observation_code` against `observation_master` and against `intent_assertion_pattern`, and writes the curated `assertion_strength`. The agronomy team can then re-run it after editing the pattern table — never touching code.

```sql
UPDATE intent_observation_mapping iom
SET assertion_strength = p.assertion_strength
FROM intent_assertion_pattern p
WHERE iom.intent_code = p.intent_code
  AND iom.observation_code ~ p.obs_code_regex
  AND iom.is_active = true
  AND iom.assertion_strength = 'DIFFERENTIAL';
```

Plus one universal hygiene pass: deactivate IOM rows where the observation is **biologically incompatible** with the intent stage (e.g., any `*_lodging` mapped to `EMERGENCE_FAILURE`, any `*_harvest_*` mapped to germination intents). The compatibility rule lives in the same `intent_assertion_pattern` table as `STRONG_NEGATIVE` entries — DB-driven, cross-crop.

### Layer 3 — Code invariants (crop-agnostic, zero hardcoded lists)

**`decision/intent-resolver.ts`**
- Select and return `assertion_strength` and `confidence_rank` per row. No semantic decisions here.

**`agents/orchestrator.ts`** (lines ~3022–3063)
- Iterate `dbIntentResolution.rows`:
  - `assertion_strength = 'LITERAL'` → push into `expandedObservationCodes` (confirmed lane) with provenance `INTENT_LITERAL_ASSERTION`.
  - `'STRONG_HYPOTHESIS'` → confirmed lane only when **intent_confidence ≥ 0.85** (DB-configurable via `intent_classifier_config`), else candidate.
  - `'DIFFERENTIAL'` (default) → candidate lane (current behavior).
- Provenance is recorded in `evidence-graph.ts`; the contamination invariant already added earlier blocks any candidate-to-confirmed promotion that bypasses this path.

**`agents/layered-rule-evaluator.ts`**
- **Invariant A (empty-confirmed gate)** — after `eligibleResponses` is computed (line ~913):
  ```ts
  const confirmed = (state as any).confirmed_observations ?? [];
  if (confirmed.length === 0) {
    const requiresObservation = eligibleResponses.some(
      r => Array.isArray(r.conditions_json?.observations) && r.conditions_json.observations.length > 0
    );
    if (requiresObservation) {
      console.warn('🚫 [EmptyConfirmedGate] No confirmed observations; forcing CLARIFY.');
      result.primary_decision = null;
      result.matched_responses = [];
      return result;
    }
  }
  ```
  Crop-agnostic. Fires for any crop, any intent.

- **Invariant B (post-selection stage re-check)** — after `result.primary_decision` is built (line ~1229):
  ```ts
  const ruleStages = (best.stage_applicable || []).map(normalizeStage);
  const currentStage = normalizeStage(state.crop_stage);
  const isAuthoritative = currentStage && !DEFAULT_STAGES.has(currentStage);
  if (isAuthoritative && ruleStages.length && !ruleStages.includes(currentStage)
      && !establishmentFamilyMatch(currentStage, ruleStages)) {
    console.error('🚨 [STAGE_GATE_VIOLATION]', { rule: best.rule_id, ruleStages, currentStage });
    result.primary_decision = null;
  }
  ```
  Uses the same `ESTABLISHMENT_FAMILY` set already defined in the file — no new hardcoded data.

- **Invariant C (min_data_completeness)** — in the per-rule scoring block (line ~1004), reject any candidate where `passedRequired / totalRequired < rule.min_data_completeness`. Default 0.0 = no change; agronomy team raises it per rule as curation proceeds.

**`agents/canonical-state-builder.ts`**
- Add a `ContextLedger` field to `CanonicalState`: `{ land: 'present|missing', soil: ..., ndvi: ..., weather: ..., schedule: ... }`. Populated once from the existing loaders (`lands`, `soil_health`, `ndvi_data`, `weather_current`, `crop_schedules`). Surfaced in traces. No behavior change unless a rule's required column references one of these — then the existing `isDataPresent` check uses the ledger as SSOT.

### Layer 4 — Land context loading integrity (read-only audit + fail-loud)

No data migration. Three small code asserts:

1. **`lands` loader** — if `lands.crop_stage` is NULL but `lands.sowing_date` is set, derive stage from `crop_stage_master.lookup(crop_code, DAS)` and emit `LAND_STAGE_DERIVED` trace. Today this silently passes UNKNOWN to the evaluator.
2. **`soil_health` / `ndvi_data` / `weather_current`** — each loader writes its presence flag to `ContextLedger`. Already-present nulls become `missing` not `false`.
3. **`crop_schedules`** — when intent matches a schedule task within ±3 days, attach `schedule_context` to canonical state so the proactive lane and reactive lane share the same time-anchored truth.

### Layer 5 — Regression tests (crop-agnostic)

`_tests/symbolic_brain_invariants_test.ts`:
- Empty confirmed → primary_decision is null for sugarcane, cotton, tomato, onion, wheat, rice (parameterised).
- Stage mismatch → primary_decision is null for a rule tagged TILLERING when state is GERMINATION (parameterised across 6 crops).
- LITERAL IOM row → lands in confirmed lane.
- DIFFERENTIAL IOM row → lands in candidate lane.
- `min_data_completeness = 0.7` rule with 50% ledger → rejected.

## Rollout sequence

1. **Migration** (Layer 1 + Layer 2 backfill + RLS/grants). All defaults preserve current behavior, so nothing breaks on deploy.
2. **Code invariants** (Layer 3) deployed to `ai-agriculture-chat` edge function.
3. **Land-context asserts** (Layer 4).
4. **Tests** (Layer 5) executed; production curl smoke for one query per crop (12 calls) captured in `.lovable/audits/`.
5. **Agronomy curation** — agronomy team edits `intent_assertion_pattern` rows in Supabase dashboard; backfill is re-run on demand. No code deploy required.

## What this is NOT

- Not a rice patch. Not a per-crop UPDATE script.
- No hardcoded synonym lists, no `RICE_EMERGENCE_GUARD`-style arrays.
- No LLM-side patches — narration layer is untouched.
- No schema change to `observation_translations` (unique constraint preserved).
- No deletion of rows — only `is_active=false` on the patterns the agronomy team approves.

## Files to change

```
supabase/migrations/<new>.sql                                       (Layer 1 + 2)
supabase/functions/ai-agriculture-chat/decision/intent-resolver.ts
supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts
supabase/functions/ai-agriculture-chat/agents/canonical-state-builder.ts
supabase/functions/ai-agriculture-chat/decision/evidence-graph.ts   (provenance enum extension)
supabase/functions/ai-agriculture-chat/_tests/symbolic_brain_invariants_test.ts  (new)
.lovable/audits/system-audit-2026-06-22.md                          (append P1-system results)
```

Approve and I will execute in the order above.
