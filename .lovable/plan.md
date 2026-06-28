
# Candidate Rule Retrieval — Forensic Audit & Fix

## Problem (from production replay)

```
Intent ✅ → Clarification ✅ → Observation confirmed ✅ → Symbol merged ✅
→ Rule cache loaded ✅ → Candidate rules = 0 ❌ → Generic monitoring response
```

`SuppressionGuard SSOT check: rules=0, actions=0, responses=0` for crop=RICE, stage=SEEDLING, das=19. The break is **between rule cache load and `matchesConditions` invocation** — i.e. inside the `convertBundledToRule(...).when.custom` pre-filter funnel and/or the pre-filter that runs in `getAllRulesWithBundled(cropCode)`.

## Scope

Audit and fix **only** the candidate retrieval funnel:

```
getAllRulesWithBundled(cropCode)   ← crop variant filter
  └─ convertBundledToRule().when.custom()
        ├─ STAGE pre-filter        (stage_applicable / STAGE_FAMILIES)
        ├─ CROP pre-filter         (cropCodeAliases)
        ├─ OBSERVATION CATEGORY    (required_observation_category)
        └─ PLANT PART              (required_plant_part)
  └─ matchesConditions(rule, state) in evaluateRulesLayered
```

Out of scope: orchestrator, NLU, clarification, navigator, LLM, ontology, UI.

## Phase 1 — Instrument the funnel (read-only)

Add structured per-stage counters (single log block per turn, gated on `traceId`):

```
[CANDIDATE_FUNNEL] trace=… crop=RICE stage=SEEDLING das=19
  loaded_total=…
  after_crop_variants=…       (drop reason counts)
  after_stage_family=…        (drop reason counts: stage_mismatch_N)
  after_crop_alias=…
  after_obs_category=…        (inferred_cats=[…])
  after_plant_part=…          (inferred_parts=[…])
  after_matchesConditions=…
  state.visual_symptoms=[…] state.confirmed_observations=[…]
  state.crop_type=… state.crop_stage=…
```

Counters are pure additions inside the existing `getAllRulesWithBundled` and the `when.custom` closure — no logic changes.

## Phase 2 — Replay & diagnose

1. Re-run the failing Marathi turn (RICE / SEEDLING / das=19, confirmed observation from clarification).
2. Read the `[CANDIDATE_FUNNEL]` block and identify the **single transition** where the count collapses to 0.
3. Confirm the runtime values used by the funnel match the symbolic state:
   - `state.crop_type` vs rule `crop_code` (alias table covers `RICE` ↔ `RIC` ↔ `PADDY`?)
   - `state.crop_stage` vs `stage_applicable` (family map covers `SEEDLING`?)
   - `state.visual_symptoms` actually contains the confirmed observation code (not a UI label, not a canonical key only carried in `confirmed_observations`)
   - `required_observation_category` / `required_plant_part` are derivable from the confirmed code

## Phase 3 — Six targeted hypotheses

| # | Hypothesis | Where to verify |
|---|---|---|
| H1 | Confirmed observation lands in `state.confirmed_observations` but **not** in `state.visual_symptoms`, so category/plant-part inference returns ∅ and every rule with `required_observation_category` is dropped. | `convertBundledToRule.when.custom` lines 1388-1455 + the orchestrator site that builds `stateWithQuery` |
| H2 | `getCropCodeVariants('RICE')` does not emit the short code `RIC` used in `bundled-rules`, so `getAllRulesWithBundled('RICE')` drops every rice rule at the loader stage. | `crop-code-normalizer` + `getAllRulesWithBundled` line 1256-1263 |
| H3 | `cropCodeAliases['RIC']` exists (`['RICE','PADDY','DHAN']`) but the inverse (`state.crop_type='RICE'`, rule `crop_code='RIC'`) returns `false` because the reverse-alias branch tests `code === ruleCropCode` after the forward check already failed. Edge case for short-code rules. | lines 1367-1382 |
| H4 | Confirmed code is canonical (e.g. `RICE_SEEDLING_NOT_EMERGED`) but the CATEGORY_PATTERNS keyword list has no token matching it, so `inferredCategories=∅` and any rule that declares `required_observation_category` is excluded. | lines 1395-1411 |
| H5 | `stage_applicable` on the relevant emergence-failure rules is something the family map doesn't include (e.g. `PRE_EMERGENCE`, `SOWING`), so the Phase Z family fix still misses. | lines 1317-1336 |
| H6 | DEFAULT_STAGES includes `''` only, but the runtime stage arrives lowercase (`seedling`) and normalizes correctly — verify there isn't a second path that bypasses normalization. | line 1289 |

Only the hypotheses confirmed by the Phase 1 trace get a fix.

## Phase 4 — Minimal in-place fix

Apply the **single** correction proven by the trace. Examples per hypothesis (only the proven one is applied):

- H1: ensure `state.visual_symptoms` is populated from `confirmed_observations ∪ inferred` at the same `stateWithQuery` site we already touched in the previous fix. No new data source.
- H2: extend `getCropCodeVariants` (or the loader filter) so DB short codes (`RIC`, `SC`, …) are always included alongside the long form — driven by the existing `cropCodeAliases` table, not a new hardcode.
- H3: collapse the alias check into one symmetric lookup (`aliasMatches(ruleCropCode, stateCropCode)`).
- H4: when `required_observation_category` is set but `inferredCategories` is empty, fall through to `matchesConditions` instead of hard-dropping — the inner predicate evaluator already handles category mismatch correctly via `conditions_json`. Pre-filter must never reject on absence of inference signal.
- H5: extend `STAGE_FAMILIES` rows in place (no new abstraction) for any missing neighbor proven by trace.

No fallback recommendations. No crop hardcoding. No bypass of the symbolic graph.

## Phase 5 — Verify

1. Replay the failing RICE/SEEDLING turn → assert `[CANDIDATE_FUNNEL]` shows `after_… > 0` at every stage and `rules_matched ≥ 1`.
2. Replay one sugarcane turn and one cotton turn → assert no regression in their funnel counts.
3. Negative test: a deliberately mismatched observation (wrong category) must still produce a structured `INSUFFICIENT_EVIDENCE` proof listing the eliminating filter — never a silent monitoring fallback.

## Deliverables

- One instrumented `[CANDIDATE_FUNNEL]` log block (kept in production at INFO).
- One targeted fix in `layered-rule-evaluator.ts` (and/or `crop-code-normalizer.ts`) for the proven hypothesis.
- Edge function deployed; replay screenshot of the funnel counts before/after.

## Out of scope (do not touch)

Orchestrator, NLU, clarification, navigator, ontology, LLM narration, UI, schema, new tables, new abstractions.
