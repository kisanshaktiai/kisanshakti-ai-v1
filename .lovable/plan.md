
# PR-7 — Decision Brain Graph Repair (code + live-DB verified)

Supersedes the "response-contract only" plan currently in `.lovable/plan.md`. That plan patched the UI symptom (empty options). The forensic addendum shows the pipeline breaks upstream, in the graph itself, and the UI-only patch would still ship a Cotton intent + phantom pest evidence on a Rice/weed query. This plan fixes the graph. No new files, no new tables, no LLM agronomy, no schema changes.

Trace under repair: `trace_mr9ixe63_gvykf4` — Marathi "या शेतात खूप तन आले आहे" on Rice/DAS=28 → wrongly locked `COTTON_SQUARE_BOLL_DROP_QUERY`, injected `SEVERITY_MEDIUM`+`INSECT_DENSITY_MANY`, winner `PROACTIVE_FLOOD_PREPAREDNESS_001`.

Every file:line below was re-verified against the live source in this repo.

---

## Root-cause chain (code-verified)

```text
Farmer weeds query (Rice, DAS 28)
   ▼
[F1] intent-lock.ts:221  lockIntent(label, conf) — no crop param
   ▼    → COTTON_* locks onto Rice, structurally uncatchable
[F2] orchestrator.ts:3616  symptomFreeRoutes includes GENERAL_INFO
   ▼    → Fix-7 zero-symptom gate at 3625 is skipped, clarification bypassed
[F3] orchestrator.ts:4035  INTENT_IOM_FALLBACK on wrong locked intent
   ▼    → injects SEVERITY_MEDIUM + INSECT_DENSITY_MANY as INFERRED evidence
[F5] layered-rule-evaluator.ts:1368  local `const STAGE_FAMILIES = {}`
   ▼    → stage gate is a no-op; 87× STAGE_ONTOLOGY_MISSING bypass
[F4] bundled-rules/loader.ts:1405  leakage guard sets _noTreatmentEligible
   ▼    → but layered-rule-evaluator.ts:1115 builds primary_decision without
        _sourceRule, so prescription-gate-enforcer.ts:213 Gate 0a is dead code
Winner: PROACTIVE_FLOOD_PREPAREDNESS_001 → URGENT_ACTION 73.9%
```

---

## Fix list (7 patches, ordered by safety)

### F1 — Wire the winning ExecutableRule onto `primary_decision`
- File: `agents/layered-rule-evaluator.ts` (around L1115 where `primary_decision` literal is built)
- Change (1 line, additive): `_sourceRule: best,` on the object literal.
- Effect: `prescription-gate-enforcer.ts:213` Gate 0a can now read `_noTreatmentEligible` / `_intentGateLeakage` — the guard stops being dead code.
- Risk: none (additive property, no consumers today).

### F7 — Register `ndvi_authority_gate` in `mapBundledCategory`
- File: `agents/layered-rule-evaluator.ts:1692` (the `map` object inside `mapBundledCategory`)
- Add one entry (same pattern as existing `weed_management` / `physiology`).
- Silences the safe-default warning surfacing on every NDVI-gated rule.

### F5 — Wire the existing stage-family shim into the rule evaluator
- File: `agents/layered-rule-evaluator.ts:1361–1385`
- Delete the local empty `const STAGE_FAMILIES = {}` stub, `import { stagesEquivalent, stageFamily } from '../runtime/stage-family-shim.ts';` (already used by `contradiction-engine.ts` and `navigator-adapter.ts`) and replace the family lookup with `stagesEquivalent(currentStage, applicable)`.
- Data path: `crop_stage_graph` has 146 live rows already; the shim covers the rice `transplanting↔tillering` edge this incident needed. No DB migration.
- Effect: `STAGE_ONTOLOGY_MISSING … BYPASS_STAGE_GATE` collapses to real gate decisions.

### F4 — Diagnostic instrumentation before rule evaluator (addendum §4 open item)
- File: `agents/orchestrator.ts:~6749` (call site of `evaluateRulesLayered`)
- Add ONE trace line: `[RULE_EVALUATOR_INPUT] trace=… count=N ids=[…] intents=[…] proactive_count=…`.
- Purpose: resolve the `PROACTIVE_FLOOD_PREPAREDNESS_001 rule_intent='recommendation'` vs `kept=0 demoted=202 dropped=0` contradiction noted in addendum §4. Read-only, no behaviour change. Ships with F1/F5.

### F2 — Remove `GENERAL_INFO` from `symptomFreeRoutes` and unconditionalise the zero-symptom invariant
- File: `agents/orchestrator.ts:3616` and the gate at `3625` (Fix-7 invariant).
- Change 1: drop `'GENERAL_INFO'` from `symptomFreeRoutes` (keep `IRRIGATION_SCHEDULING`, `CROP_HEALTH`, `WEATHER_SPRAY*`, `GREETING`, `FERTILIZER_NUTRITION`).
- Change 2: rewrite the gate to `if (!hasSymptoms && !isSymptomFreeRoute && !diagnosticIntent) { … }` — the previous `shouldRunSymbolicBrain && !hasSymptoms && !isSymptomFreeRoute` skipped itself whenever the route allowlist matched.
- Effect: Marathi weed query with 0 symptoms takes the observation-selection path instead of the symbolic brain.
- Also add: at `agents/orchestrator.ts:5841` (call site of `lockIntent`) log `[INTENT_ROUTER_DISAGREEMENT] route=… semantic=… → …` when `queryRoute.route` and `detectedIntent` disagree, so we can see the "two classifiers, use whichever is convenient" pattern in future traces.

### F3 — Gate the IOM fallback on intent-lock confidence + crop compatibility
- File: `agents/orchestrator.ts:4035–4090` (the `INTENT_IOM_FALLBACK` block).
- Add pre-conditions before the `.from('intent_observation_mapping')` fetch:
  1. `intentLock.confidence >= 0.75` (below this, we do not manufacture INFERRED evidence)
  2. `intentLock.crop_scope` intersects `landContext.current_crop` OR is `['*']`
  3. Skip entirely when `queryRoute.route === 'DIAGNOSTIC'` and `hasSymptoms === false` — that turn belongs to clarification, not fallback synthesis
- Keep the existing `INFERRED` authority tag and `[INTENT_IOM_FALLBACK]` trace. No new tables.

### F6 — Crop-scope check before intent lock commits
- Files: `agents/intent-lock.ts:221` (extend signature to `lockIntent(intent_label, confidence, opts?: { crop?: string | null })`) and the single call site `agents/orchestrator.ts:5841`.
- Before building the lock: if `scopeConfig.crop_scope` is defined, not `['*']`, and `opts.crop` is set, and there is no intersection → return `{ locked: null, reason: 'CROP_SCOPE_MISMATCH', … }` and let the orchestrator drop to observation discovery.
- Log: `[INTENT_REJECT_CROP_SCOPE] intent=… scope=… land_crop=…`.
- Uses existing `INTENT_SCOPE_MAP`; no new data.

### F6b — Delete the duplicate `ICAR_CROP_CALENDARS` stage table
- File: `decision/context-validator.ts:83–103` and the single reader at `:310`.
- Replace with a query against `crop_stage_master` (`crop_code, stage_code, das_min, das_max`) — already the SSOT used everywhere else. In-file cache by `crop_code` for the request lifetime.
- Removes the third competing stage authority that produced the misleading "TILLERING (28 DAS, ICAR confirmed)" line. `crop_stage_master` says RICE_TRANSPLANTING = DAS 25–35, RICE_TILLERING = DAS 35–60, so at DAS 28 the correct answer is TRANSPLANTING — matching the immutability lock that (correctly) blocked the override.

---

## What is NOT changed

- No new files. No new tables. No RLS changes (the 24-table advisory is called out for the user's team to triage separately per the addendum).
- No LLM prompt edits, no agronomy in TypeScript, no changes to `decision_rules`, `intent_observation_mapping`, `hypothesis_master`, `hypothesis_rule_mapping`, `observation_master`.
- `runtime/graph-truth.ts`, `runtime/graph-runtime.ts`, `runtime/stage-family-shim.ts` are read-only reuse — no edits.
- The response-contract UI plan currently in `.lovable/plan.md` is superseded: with F2+F3+F6 fixed, `orchestrator_type='CLARIFICATION_QUESTION'` and non-empty `options` fall out of the correct pipeline instead of being force-stamped by a fallback.

---

## Verification (once implemented)

Query: `या शेतात खूप तन आले आहे` (Rice land, DAS 28).

Required logs, in order:
```
[INTENT_ROUTER_DISAGREEMENT] route=GENERAL_INFO semantic=COTTON_SQUARE_BOLL_DROP_QUERY → reconciled=WEED_*
[INTENT_REJECT_CROP_SCOPE] intent=COTTON_SQUARE_BOLL_DROP_QUERY scope=[cotton] land_crop=rice   (if the reconciler still emits it)
[RULE_EVALUATOR_INPUT] trace=… count=N ids=[…] proactive_count=0
# NO occurrence of:
#   [STAGE_ONTOLOGY_MISSING] … BYPASS_STAGE_GATE
#   [INTENT_IOM_FALLBACK] intent=COTTON_* injected=N
#   winner_rule=PROACTIVE_FLOOD_PREPAREDNESS_001
```

Response payload MUST have `metadata.orchestrator_type === 'CLARIFICATION_QUESTION'` and `metadata.options.length >= 3` sourced from `intent_observation_mapping` / `observation_master` for a weed intent — not from `generateNoRecommendationsFallback` (already dead after F2/F3).

Deno test: `supabase/functions/ai-agriculture-chat/tests/graph-integrity.test.ts` (single new test file, allowed).
1. Rice weed query never locks a `COTTON_*` intent.
2. Zero confirmed observations + diagnostic intent → response type = CLARIFICATION_QUESTION, options ≥ 3.
3. IOM fallback rejected when `intentLock.confidence < 0.75` OR `crop_scope` mismatch.
4. Gate 0a blocks a rule carrying `_noTreatmentEligible=true` via `_sourceRule`.
5. Stage gate returns `applicable=true` for `transplanting` when rule declares `tillering` (uses shim + `crop_stage_graph`).

---

## Files touched (7 code files + 1 test)

1. `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` — F1 (`_sourceRule: best`), F5 (import shim, delete empty local `STAGE_FAMILIES`), F7 (`ndvi_authority_gate` mapping)
2. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — F2 (remove `GENERAL_INFO`, rewrite zero-symptom gate, disagreement log), F3 (IOM-fallback preconditions), F6 (pass `crop` into `lockIntent`), F4 (`[RULE_EVALUATOR_INPUT]` trace)
3. `supabase/functions/ai-agriculture-chat/agents/intent-lock.ts` — F6 signature extension + crop-scope reject
4. `supabase/functions/ai-agriculture-chat/decision/context-validator.ts` — F6b (delete `ICAR_CROP_CALENDARS`, read `crop_stage_master`)
5. `supabase/functions/ai-agriculture-chat/decision/prescription-gate-enforcer.ts` — no code change; will start firing once F1 lands (documented only)
6. `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` — no code change; the leakage-guard flag it already sets becomes reachable via F1 (documented only)
7. `supabase/functions/ai-agriculture-chat/runtime/stage-family-shim.ts` — no code change; consumed by F5 (documented only)
8. NEW test: `supabase/functions/ai-agriculture-chat/tests/graph-integrity.test.ts` (the only new file)

Reply `proceed PR-7` to implement.
