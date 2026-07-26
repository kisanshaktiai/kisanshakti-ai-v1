
# Neuro-Symbolic Brain — Root Cause & Surgical Repair

## What actually went wrong (verified, not inferred)

The farmer said "पिकाची वाढ कमी आहे" (growth is poor). Perception correctly extracted `stunted_plants`. The brain then answered about **lodging**, at `tillering`, and died.

Chain, from the log:

```text
perception      obs = [poor_germination, rice_lodging, seedling_died,
                       stunted_plants, uneven_emergence]      (5 codes)
GraphTruth      obs = [POOR_GERMINATION, ... ]                UPPERCASE  <-- drift
IOM gate        raw=4 -> das_filtered=1 -> allowed=[rice_lodging]  <-- collapse
OBS_TO_HYP      obs=[rice_lodging] -> HYP_RICE_LODGING_001
stage gate      REQUIRED_STAGE_FAILED(expected=booting|flowering|grain_filling,
                                      got=tillering)
result          NO_STAGE_VALID_HYPOTHESES -> NO_DECISION -> re-clarify (loop)
```

### RC-1 — The IOM gate is used as a hard observation allowlist (primary)
`decision/iom-gate.ts` is documented as an allowlist and is applied as an **exclusion filter over the observation set**. That directly contradicts the standing invariant "assertion_strength is an evidence WEIGHT, never a SQL exclusion filter". `stunted_plants` — a real `observation_master` code, actually perceived — was deleted from the turn because no curated IOM cell covered it at DAS 48. The only survivor, `rice_lodging`, is agronomically absurd for "poor growth" and is stage-impossible at tillering, so the graph had nothing left to reason with.

### RC-2 — Canonical-code SSOT is not applied (secondary, systemic)
`utils/canonical-code.ts` exists but only 8 of 175 edge files import it. DB truth verified this session:

| Table.column | DB casing | Code casing |
| --- | --- | --- |
| `observation_master.observation_code` | lower_snake (2549/2549) | UPPER in GraphTruth, label loader, validator |
| `observation_translations.observation_code` | lower_snake (5172/5172) | keyed UPPER in the label Map |
| `hypothesis_conditions.condition_key` | lower_snake | mixed |
| `decision_rules.rule_id` / `hypothesis_rule_mapping.rule_id` | **UPPER** (1853 / 1820) | `canonicalSymbolCode()` lowercases |
| `decision_rules.crop_code` / `growth_stage` | lower_snake | ok after last patch |

Consequences observed: `stage=TILLERING` vs `stage=tillering` in two OBS_TO_HYP traces from the same turn; the label Map keyed by uppercase so lower_snake lookups miss and the UI renders the raw i18n key `clarification.default.mr`. The SSOT file's own header is also wrong — it claims rule/hypothesis ids are lower_snake; the DB says UPPER.

### RC-3 — Two genuine DB curation gaps
- `stunted_plants` has **no** `hypothesis_conditions` row at all, so even with RC-1 fixed it anchors to nothing.
- `GROWTH_ANOMALY x rice` has only 4 IOM rows, 3 of them `das_max=45`, leaving a single low-value code past DAS 45.
- `observation_translations.crop_code` exists and is never used in the query, so a crop-agnostic row can shadow a crop-specific one.

---

## Repair plan

### Step 1 — Canonical-code SSOT correctness (blocking, do first)
`utils/canonical-code.ts`
- Split identity helpers to match verified DB casing: keep `canonicalObsCode` / `canonicalCropCode` / `canonicalStageKey` as lower_snake; add `canonicalRuleId()` and `canonicalHypothesisId()` returning **UPPER_SNAKE**; deprecate the mis-specified `canonicalSymbolCode` behind a re-export that logs `[CANON_LEGACY_SYMBOL]`.
- Correct the header block with the DB-verified casing table and add today's CHANGE LOG entry.

### Step 2 — Route every matching layer through the SSOT
Replace ad-hoc `toUpperCase().replace(/[\s-]/g,'_')` normalizers at the comparison sites in:
`agents/orchestrator.ts` (GraphTruth build/projection), `i18n/observation-label-loader.ts`, `i18n/translation-loader.ts`, `utils/llm-output-validator.ts`, `decision/fact-extractor.ts`, `utils/context-tracer.ts`, `runtime/clarification-contract.ts` (make `canonicalizeObservationKey` a thin re-export of `canonicalObsCode`), `runtime/navigator-adapter.ts`, `bundled-rules/loader.ts` (comparison paths only).

Specifically:
- **GraphTruth** stores and hashes `canonical_observations` in lower_snake only; stage always via `canonicalStageKey`. Keep the `[GRAPH_OBS_DRIFT]` probe.
- **Label loader** keys the returned Map by `canonicalObsCode`, queries `observation_translations` with lower codes only, and adds `.or(crop_code.eq.<crop>,crop_code.is.null)` with crop-specific rows winning. This is what removes the raw `clarification.default.mr` header.
- **Rule/hypothesis ids** compared with `canonicalRuleId` on both sides.

Add a repo guard: a grep-based check that fails on any new `toUpperCase().replace(/[\s-]/` inside a comparison in the chat pipeline.

### Step 3 — Demote the IOM gate from filter to weight (the actual fix)
In `decision/iom-gate.ts` and its call sites in `agents/orchestrator.ts` (~5558, ~6594) and `decision/hypothesis-clarification-builder.ts`:
- `loadIOMAllowed` keeps returning `allowedRanked`, but the orchestrator **no longer subtracts** perceived observations that are absent from it.
- Any code present in `observation_master` and grounded by perception stays in the turn and is passed to the hypothesis graph. IOM membership and `assertion_strength` become inputs to `decision/evidence-confidence.ts` scoring (`LITERAL > STRONG > DIFFERENTIAL > WEAK`), i.e. ranking, never elimination.
- Keep the gate hard for *candidate hypotheses* only where a curated cell explicitly contradicts (that is the original Tungro-on-ungerminated-rice protection) and log `[IOM_WEIGHT] kept=N demoted=M dropped=0`.
- Add invariant `[IOM_OBS_SUPPRESSION]` — error if the post-gate observation count is lower than the perceived count.

### Step 4 — Exit invariant on empty graph
When `structured_gap_reason = NO_STAGE_VALID_HYPOTHESES` and stage-eliminated candidates exist, the orchestrator must emit a **stage-scoped differential clarification built from the eliminated set's sibling hypotheses at the current stage**, never a generic re-ask of the same question. Reuse the existing `[CLARIFICATION_DIVERSITY_VIOLATION]` invariant to break the loop.

### Step 5 — DB curation (migration, agronomist-reviewed)
No agronomy in TypeScript — these are data rows:
- Add `hypothesis_conditions` OBSERVATION anchors for `stunted_plants` on the rice hypotheses where it is a real symptom (BPH, tungro, gall midge, nutrient/N deficiency, root damage) with `is_required=false`, `is_discriminator=false`, curated `weight`.
- Extend `intent_observation_mapping` for `GROWTH_ANOMALY x rice` to cover `stunted_plants`, `leaf_yellowing`, `bph_hopper_burn`, `ysb_dead_heart`, `dead_heart_tiller` with `das_max=999` where biologically valid; correct the `das_max=45` caps that are germination-only.
- Seed missing `observation_translations` (mr/hi) for the codes surfaced in clarification cards.

### Step 6 — Node-by-node verification
Replay the exact log-99 turn and assert:
```text
[GRAPH_TRUTH_BUILT] obs=[poor_germination,rice_lodging,seedling_died,stunted_plants,uneven_emergence]
[IOM_WEIGHT] kept=5 dropped=0
[OBS_TO_HYP] obs=[...5...] matched=[HYP_RICE_BPH_001, ...]
[HYP_VALIDATION] survived=[...] (lodging eliminated, others alive)
[OPTION_GRAPH_SCOPE] rules 202 -> 25
TURN_END decision_status=DECISION_PROVIDED, dosage from decision_rules
```
Plus: no `CODE_NORM_MISMATCH`, no raw i18n key in the card header, no `DECISION_WITHOUT_DB_BACKING`.

---

## Technical notes

- Files touched: `utils/canonical-code.ts`, `decision/iom-gate.ts`, `agents/orchestrator.ts`, `decision/evidence-confidence.ts`, `decision/hypothesis-clarification-builder.ts`, `i18n/observation-label-loader.ts`, `i18n/translation-loader.ts`, `utils/llm-output-validator.ts`, `decision/fact-extractor.ts`, `utils/context-tracer.ts`, `runtime/clarification-contract.ts`, `runtime/navigator-adapter.ts`, `bundled-rules/loader.ts`, plus one SQL migration.
- Every touched file gets its mandatory top-of-file CHANGE LOG entry.
- Step 5 changes farmer-visible agronomy. I will present the exact row set for your sign-off before applying the migration, and Steps 1–4 ship independently of it.
