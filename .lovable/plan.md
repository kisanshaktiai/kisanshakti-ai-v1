# Neuro-Symbolic Decision Brain — Forensic Audit Report
*Report only. No fix plan yet — awaiting your review before we design the refactor.*

## Method

- Built the real import graph of `supabase/functions/ai-agriculture-chat/` from `index.ts`, including `await import(...)` dynamic imports.
- Ran hardcoded-agri literal scan (crop/pest/disease/stage/symptom tokens) against the **reachable** set only, so dead code doesn't skew the report.
- Cross-checked every file named in the reference plan against actual reachability.
- Queried the live DB for the tables the loaders would depend on.
- Attempted to pull live `ai-agriculture-chat` edge logs — **none available in the current retention window**, so the "OBS_TO_HYP matched=[]" trace you shared cannot be re-observed right now; conclusions below are from static evidence.

## Finding 1 — Several files in the reference plan are DEAD CODE, but a few are live via dynamic import

Reachable-from-`index.ts` audit (181 total .ts files, 153 reachable):

| File in reference plan | Reachable? | How |
|---|---|---|
| `agents/orchestrator.ts` | YES | static import |
| `agents/llm-response-formatter.ts` | YES | static |
| `agents/language-induction-layer.ts` | YES | static |
| `agents/symptom-enums.ts` | YES | via language-induction-layer |
| `agents/crop-stage-advisor.ts` | YES | static |
| `agents/rule-engine-types.ts` | YES | static |
| `agents/clarification-generator.ts` | YES | static |
| `agents/clarification-scope-resolver.ts` | YES | static |
| `agents/layered-rule-evaluator.ts` | YES | static |
| `agents/cross-crop-symptom-mapper.ts` | YES | static |
| `decision/cross-crop-symptom-ontology.ts` | YES | static |
| `decision/symbolic-reasoner.ts` | YES | static |
| `decision/crop-calendar-lookup.ts` | YES | static |
| `decision/context-validator.ts` | YES | static |
| `decision/causal-hypothesis-engine.ts` | YES | static |
| `decision/hypothesis-evaluator.ts` | YES | static — **this is the active hypothesis path** |
| `decision/observation-code-mapper.ts` | YES | static |
| `decision/unified-decision-gate.ts` | YES | static |
| `runtime/stage-family-shim.ts` | YES | static |
| `runtime/clarification-contract.ts` | YES | static |
| `utils/llm-output-validator.ts` | YES | static |
| `decision/hypothesis-graph-evaluator.ts` | **YES — but only via `await import()` in orchestrator.ts:4811** | dynamic |
| `decision/iom-gate.ts` | **YES — dynamic (orchestrator.ts:4380, 4972)** | dynamic |
| `agents/entity-normalizer.ts` (483 hardcoded matches per prior report) | **NO — DEAD CODE** | not imported |
| `agents/dynamic-clarification-generator.ts` | **NO — DEAD CODE** | only referenced in a comment |
| `runtime/differential-questions-reader.ts` | **NO — DEAD CODE** | only imported by `graph-evidence-sentinel.ts` which is itself dead |
| `runtime/graph-evidence-sentinel.ts` | **NO — DEAD CODE** | |
| `runtime/clarification-authority.ts` | **NO — DEAD CODE** | |
| `decision/db-observation-validator.ts` | **NO — DEAD CODE** | |
| `decision/decision-readiness-gate.ts` | **NO — DEAD CODE** | |
| `decision/intent-resolver.ts` | **NO — DEAD CODE** | |
| `decision/induction-to-observation-mapper.ts` | **NO — DEAD CODE** | |
| `decision/diagnostic-signal-detector.ts` | **NO — DEAD CODE** | |
| `decision/canonical-state-invariants.ts` | **NO — DEAD CODE** | |
| `decision/confidence-thresholds.ts` | **NO — DEAD CODE** | |
| `agents/agronomic-validator.ts` | **NO — DEAD CODE** | |
| `agents/response-validation-gate.ts` | **NO — DEAD CODE** | |
| `agents/raw-observation-contract.ts` | **NO — DEAD CODE** | |
| `agents/intent-router.ts` | **NO — DEAD CODE** | |
| `agents/irrigation-decision-module.ts` | **NO — DEAD CODE** | |
| `agents/spray-window-calculator.ts` | **NO — DEAD CODE** | |
| `utils/invariant-guards.ts`, `utils/ui-response-builder.ts` | **NO — DEAD CODE** | |

**Implication:** The 483 hardcoded matches in `entity-normalizer.ts` — the reference plan's #1 offender — are irrelevant to runtime behavior. Deleting the file is a nop for the brain.

## Finding 2 — Real hardcoded-agri offenders (reachable set only)

Rescanning literal tokens (`RICE|SUGARCANE|COTTON|...|SHOOT_BORER|DEAD_HEART|POOR_GERMINATION|SEEDLING_DIED|...|TILLERING|FLOWERING|SEEDLING|NURSERY|GERMINATION|...`) inside the 153 reachable files. Top 20:

```text
136  agents/orchestrator.ts
 85  agents/entity-code-mapper.ts          ← NOT in reference plan
 75  agents/type-mappers.ts                ← NOT in reference plan
 58  agents/language-induction-layer.ts
 53  agents/nlp-agriculture-validator.ts   ← NOT in reference plan
 53  agents/canonical-state-builder.ts     ← NOT in reference plan
 52  agents/soil-ndvi-state-calculator.ts  ← NOT in reference plan
 42  decision/hypothesis-evaluator.ts      ← the ACTIVE hypothesis file, NOT in ref plan
 40  decision/context-validator.ts
 37  utils/crop-code-normalizer.ts         ← NOT in reference plan
 36  agents/static-data-gate.ts            ← NOT in reference plan
 32  agents/symptom-enums.ts
 32  agents/intent-lock.ts                 ← NOT in reference plan
 31  agents/crop-stage-advisor.ts
 30  agents/llm-response-formatter.ts
 26  decision/crop-calendar-lookup.ts
 24  decision/differential-diagnosis-clarifier.ts  ← NOT in reference plan
 23  agents/rule-module-types.ts           ← NOT in reference plan
 22  agents/agricultural-vocabulary.ts     ← NOT in reference plan
 21  index.ts                              ← NOT in reference plan
```

Total: **1,304 hits across 76 reachable files** (vs the reference plan's 1,558 across 77, which counted dead code).

**Implication:** The reference plan mislabels the worst offenders. The real top-3 blockers are `orchestrator.ts`, `entity-code-mapper.ts`, `type-mappers.ts`. The active hypothesis file `hypothesis-evaluator.ts` (1,528 LOC, 42 hardcoded hits) is not mentioned in the plan at all.

## Finding 3 — Two parallel hypothesis engines, and the one you've been fixing is the fallback

- **Primary path** (static import from orchestrator → decision-graph-bridge etc.): `decision/hypothesis-evaluator.ts` (1,528 LOC) + `decision/causal-hypothesis-engine.ts`.
- **Secondary path** (lazy `await import()` at `orchestrator.ts:4811`): `decision/hypothesis-graph-evaluator.ts` — the file we've been editing for the last several turns to fix "OBS_TO_HYP matched=[]".

If the runtime code path never reaches line 4811 (guarded by a conditional above it), our recent changes have **zero effect** on the observed stuck-at-`OBS_TO_HYP` symptom. This is the most likely reason repeated "fixes" haven't moved the needle. We need to confirm the guard around 4811 before any more edits.

## Finding 4 — Only 3 graph-trace emitters exist

Files emitting `OBS_TO_HYP|HYP_TO_RULE|HYP_GRAPH|EVIDENCE_FREEZE|RULE_RESULT`:

- `agents/orchestrator.ts`
- `agents/layered-rule-evaluator.ts`
- `decision/hypothesis-graph-evaluator.ts` (dead unless the dynamic import fires)

So if a live trace ever shows `OBS_TO_HYP` but no `HYP_TO_RULE`, the flow is inside the dynamic-import branch — meaning the fixes DID land, but the branch's caller stops before invoking rule evaluation. Root cause is in `orchestrator.ts` around line ~4811–4972, not inside `hypothesis-graph-evaluator.ts`.

## Finding 5 — DB is not ready for a pure DB-driven clarification loader

Live row counts pulled just now:

| Table | Rows | Fit for purpose? |
|---|---|---|
| `observation_master` | 2,540 | ✅ |
| `observation_aliases` | 14,029 | ✅ |
| `hypothesis_master` | 346 | ✅ |
| `hypothesis_conditions` | 713 | ✅ |
| `hypothesis_rule_mapping` | 1,810 | ✅ |
| `decision_rules` | 1,853 | ✅ |
| `intent_observation_mapping` | 13,672 | ✅ |
| `crop_stage_aliases` | 195 | ✅ (enough to replace STAGE_SYNONYMS shim) |
| `crop_synonyms` | 699 | ✅ |
| `observation_differential_questions` | **3** | ❌ **Blocker** for ClarificationGraphLoader |

**Implication:** Phase 5 of the reference plan ("delete hardcoded clarification templates → derive from `observation_differential_questions`") **cannot ship** without first seeding hundreds of ODQ rows. Deleting the templates now leaves the farmer with silence.

Not audited yet (unknown if exist): `observation_crop_mapping`, `observation_relationships`, `clarification_questions`, `clarification_edges`, `rule_product_mapping`, `universal_observations`, `chemical_regulatory_status` (in schema list but not row-counted). Need to confirm before any loader is built.

## Finding 6 — Can't confirm the stuck-stage from live logs

`supabase--edge_function_logs` for `ai-agriculture-chat` returns "No logs found" (retention has aged out the trace you pasted). Any statement about which stage is stuck **right now** would be an assumption. If you can trigger one live query with the failing Marathi utterance, the next trace will be captured and I can pinpoint the exact halt line.

## What the report tells us

1. The reference plan targets several dead files (`entity-normalizer`, `dynamic-clarification-generator`, `differential-questions-reader`, `graph-evidence-sentinel`, `db-observation-validator`, and 12+ others). Deleting them is safe cleanup but will not change brain behavior.
2. Our recent edits to `hypothesis-graph-evaluator.ts` land on a file that is only invoked through a conditional `await import()` in `orchestrator.ts`. If that conditional never fires for the failing utterance, no fix inside that file can help.
3. The real hardcoded surface concentrates in files the reference plan did not list: `entity-code-mapper`, `type-mappers`, `nlp-agriculture-validator`, `canonical-state-builder`, `soil-ndvi-state-calculator`, `static-data-gate`, `crop-code-normalizer`, `intent-lock`, `agricultural-vocabulary`, `differential-diagnosis-clarifier`, and the active `hypothesis-evaluator.ts` itself.
4. Two hypothesis engines coexist — the "primary" (`hypothesis-evaluator`) and the "graph" (`hypothesis-graph-evaluator`) — with no clear contract about which one owns a given request. This is the architectural defect underneath every symptom you've reported.
5. DB is ready for observation/hypothesis/rule/IOM loaders. It is **not** ready for a clarification loader (ODQ = 3 rows).

## Next step (needs your call)

Before I draft the fix plan, please confirm which of these you want:

1. **Trigger one live failing query** so I can capture a fresh trace and identify the exact stuck line before editing anything.
2. **Consolidate the two hypothesis engines first** (pick `hypothesis-evaluator.ts` OR `hypothesis-graph-evaluator.ts` as SSOT, delete the loser) — otherwise every DB-loader refactor will have to be done twice.
3. **Seed `observation_differential_questions`** before we touch clarification code.
4. **Revise the file target list** to match what's actually reachable (drop the ~15 dead files; add `entity-code-mapper`, `type-mappers`, `nlp-agriculture-validator`, `canonical-state-builder`, `soil-ndvi-state-calculator`, `static-data-gate`, `crop-code-normalizer`, `intent-lock`, `hypothesis-evaluator`, `differential-diagnosis-clarifier`).

Once you tell me which of 1–4 to include, I will produce the actual fix plan.
