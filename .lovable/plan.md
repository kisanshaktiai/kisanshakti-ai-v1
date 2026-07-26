## Forensic audit — verified findings (every claim below was read from code or queried from the DB)

### F1 — `assertion_strength` is used as a hard SQL exclusion gate (kills 98.5% of the evidence set)

DB fact (queried `intent_observation_mapping where is_active`):

```text
DIFFERENTIAL        13,245 rows
LITERAL                208 rows
STRONG_HYPOTHESIS      141 rows
total               13,594 rows
```

Code that excludes:
- `decision/concept-bridge.ts:267` — `.eq('assertion_strength', 'LITERAL')` inside `resolveCropCanonicalObservations`. Only 208 of 13,594 rows can ever be seen. If the farmer's observation is DIFFERENTIAL-mapped, `anchor=NONE` and zero peers are injected — the hypothesis graph then never receives the crop-specific canonical codes that `hypothesis_conditions` are authored against.
- `agents/orchestrator.ts:5047-5050` — a second, duplicated copy of the same `LITERAL`-only query.
- `decision/observation-code-mapper.ts:64` — documents the contract as `assertion_strength IN ('LITERAL','STRONG')`. **`STRONG` does not exist in the table** (the real value is `STRONG_HYPOTHESIS`), so that documented contract is unsatisfiable.

Non-exclusionary (correct, keep): `utils/observation-mapping-cache.ts` uses `ASSERTION_PRIORITY` only for dedup/ordering, and `decision/iom-gate.ts` selects the column without filtering on it.

### F2 — Hardcoded agronomy still present: stage-family map in the IOM gate

`decision/iom-gate.ts:52-72` contains a 13-entry `STAGE_SYNONYMS` table (seedling↔nursery↔germination↔emergence, flowering↔reproductive↔grand_growth, …). This is agronomy in TypeScript and it directly contradicts the project rule that stage families come exclusively from `public.crop_stage_graph`. The identical map was already deleted from `runtime/clarification-contract.ts:66-78` and from `runtime/stage-family-shim.ts:102` (now `Object.freeze({})`), and the DB-backed replacements already exist: `utils/stage-knowledge-cache.ts` exports `getStageFamilyFromDB` and `stagesEquivalentFromDB`.

Worse, the expanded list feeds a hard SQL gate: `.in('growth_stage', stageVariants)`. `intent_observation_mapping` has 16 distinct stage values (`all, boll_development, boll_opening, early_vegetative, flowering, germination, grand_growth, maturity, nursery, planting, ratoon_init, seedling, squaring, tillering, transplanting, vegetative`) — any stage absent from the hardcoded map collapses the allowlist to `[stage, 'all']` and drops curated rows.

### F3 — Canonical code normalization exists but is applied in only 4 of ~12 matching sites

Canonical casing verified from the DB: `observation_master` = 2,549 rows, **0 with uppercase**; `hypothesis_conditions` = 736 rows, all lower_snake. So `lower_snake_case` is the true canonical form.

The single normalizer `canonicalizeObservationKey` (`trim → lowercase → [\s-]+ → _`) lives in `runtime/clarification-contract.ts:62` and is imported by only `runtime/navigator-adapter.ts`, `agents/clarification-generator.ts`, and `agents/orchestrator.ts`.

Every other matching layer re-implements its own, with a different regex (`[\s-]` without `+`, and uppercase instead of lowercase):
- `decision/symbolic-reasoner.ts:1010,1014` — `.toUpperCase().replace(/[\s-]/g,'_')`
- `agents/layered-rule-evaluator.ts:1890` — same
- `utils/llm-output-validator.ts:161,247,331` — `.toUpperCase()` only, no separator folding
- `agents/understanding-completeness-checker.ts:179,305` — `code.toUpperCase()`
- `agents/entity-code-mapper.ts:234,272,308,356` — `.toUpperCase().replace(/[\s-]+/g,'_')`
- `decision/iom-gate.ts:151-160` — builds `allowedSet` lower_snake but the interface comment says UPPERCASE; `filterHypothesesByIOM` compares against hypothesis keys normalized elsewhere as UPPERCASE

Any comparison where one side is uppercased and the other is DB-lowercase silently returns no match, which is exactly the "rules blocked by normalization" symptom.

### F4 — There is no Evidence Confidence stage (matches your analysis)

`decision/confidence-calculator.ts` consumes `diagnosis`, `firedRules`, `facts`, `landState` — it runs **after** a diagnosis is selected. Nothing in the pipeline scores observation evidence *before* hypothesis competition, so `assertion_strength` and `confidence_rank` currently have nowhere to act except as the illegal exclusion filter in F1.

---

## Fix plan

### Step 1 — Canonical code SSOT (new file, framework only, no agronomy)
Create `supabase/functions/ai-agriculture-chat/utils/canonical-code.ts` exporting:
- `canonicalObsCode(s)` — `trim → toLowerCase → collapse [\s-]+ to _ → strip repeated _`
- `canonicalIntentCode(s)` — trim/upper (DB verified: all intent codes uppercase)
- `canonicalCropCode(s)`, `canonicalStageKey(s)` — trim/lower_snake
- `sameObsCode(a,b)`, `obsCodeSet(list)`

`runtime/clarification-contract.ts` keeps `canonicalizeObservationKey` as a thin re-export so existing imports do not break.

### Step 2 — Apply the SSOT at every matching site
Replace the ad-hoc normalizers in: `decision/symbolic-reasoner.ts`, `agents/layered-rule-evaluator.ts`, `utils/llm-output-validator.ts`, `agents/understanding-completeness-checker.ts`, `agents/entity-code-mapper.ts`, `decision/iom-gate.ts`, `decision/concept-bridge.ts`, `utils/observation-mapping-cache.ts`, `utils/db-ssot/observation-index.ts`. All observation-code comparisons become lower_snake on both sides. Add a `[CODE_NORM_MISMATCH]` warn log whenever a comparison would have matched under the old uppercase form but not the new one (and vice versa), so any residual drift is visible in production logs for one release.

### Step 3 — Delete the exclusion filters, keep the signal as a weight
- `decision/concept-bridge.ts`: drop `.eq('assertion_strength','LITERAL')`; select all active rows for the (intent, crop) cell and return each peer with its `assertion_strength` + `confidence_rank` attached. Anchor detection stays, but peer injection is now weighted, not gated. Log `[IOM_EVIDENCE] literal=N strong=N differential=N`.
- `agents/orchestrator.ts:5047`: delete the duplicated query and call `resolveCropCanonicalObservations` instead — one code path, one contract.
- `decision/observation-code-mapper.ts`: correct the stale `('LITERAL','STRONG')` contract comment to reflect that no strength-based exclusion exists.

### Step 4 — Remove the hardcoded stage map from the IOM gate
`decision/iom-gate.ts`: delete `STAGE_SYNONYMS`; `expandStageSynonyms` becomes `await` on `getStageFamilyFromDB(crop, stage)` from `utils/stage-knowledge-cache.ts`, always unioned with `'all'`. On cache miss, log `[IOM_GATE_STAGE_MISS]` and fall back to `[normalizedStage, 'all']` — never to a hardcoded family.

### Step 5 — New Evidence Confidence stage (the missing layer)
New `decision/evidence-confidence.ts`, called after intent→observation resolution and **before** hypothesis competition. For each candidate observation node it computes a weight from DB fields only:
- `intent_observation_mapping.assertion_strength` and `confidence_rank`
- `observation_master.is_diagnostic`, `clarity_score`, `discriminator_score`, `frequency_score`
- evidence source (farmer-confirmed / inferred peer / vision / sensor)

Weights themselves are read from `system_config` (seeded keys, e.g. `evidence_weight_assertion_literal`, `..._strong_hypothesis`, `..._differential`, `evidence_weight_source_*`) — no numeric agronomy constants in TS. Output is a `Map<obs_code, evidence_confidence>` consumed by `decision/hypothesis-graph-evaluator.ts` to score competing hypotheses instead of eliminating them by strength.

`decision/confidence-calculator.ts` is **not modified** — it stays the post-decision calibrator, per your architectural conclusion.

### Step 6 — SQL (seed only, no schema change)
One migration inserting the `system_config` evidence-weight keys with defaults that reproduce today's ordering (LITERAL > STRONG_HYPOTHESIS > DIFFERENTIAL) so behavior is tunable by curators, not by code. No new tables.

### Step 7 — Regression tests
Added under `tests/edge/ai-agriculture-chat/tests/`:
1. `canonical-code-ssot_test.ts` — the normalizer is idempotent and every DB-sourced observation code round-trips unchanged.
2. `iom-assertion-no-exclusion_test.ts` — a DIFFERENTIAL-only observation still reaches the hypothesis graph.
3. `iom-stage-db-family_test.ts` — the IOM gate produces identical stage variants to `crop_stage_graph`, with no TS map present (grep assertion for `STAGE_SYNONYMS`).
4. `evidence-confidence_test.ts` — hypothesis ranking changes with assertion strength but no hypothesis is eliminated by it.
5. Grep guard: no `.eq('assertion_strength'` and no `.toUpperCase()` on an observation code anywhere on the live path.

### Files touched
`utils/canonical-code.ts` (new), `decision/evidence-confidence.ts` (new), `decision/concept-bridge.ts`, `decision/iom-gate.ts`, `decision/symbolic-reasoner.ts`, `decision/hypothesis-graph-evaluator.ts`, `decision/observation-code-mapper.ts`, `agents/orchestrator.ts`, `agents/layered-rule-evaluator.ts`, `agents/understanding-completeness-checker.ts`, `agents/entity-code-mapper.ts`, `utils/llm-output-validator.ts`, `utils/observation-mapping-cache.ts`, `utils/db-ssot/observation-index.ts`, `runtime/clarification-contract.ts`, plus one `system_config` seed migration. Each edited file gets its mandatory CHANGE LOG entry.

### Risk
Step 3 widens the evidence set from 208 to 13,594 reachable IOM rows. Step 5 lands in the same batch precisely so the widening is absorbed by confidence competition rather than producing noisy differentials. Steps 3 and 5 must not be split.
