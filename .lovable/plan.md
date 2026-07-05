# Step 8 — Graph-First Neuro-Symbolic Runtime (v2, corrected)

## Target pipeline (immutable contract)

```text
Land-Specific Chat Room
        ↓
LLM NLU (language → symbols only, no reasoning)
        ↓
Intent Graph
        ↓
Observation Mapper (farmer words → ONE observation_code via observation_aliases)
        ↓
EVIDENCE_FREEZE  ← immutable ledger, single SSOT for the turn
        ↓
HypothesisGraphEvaluator          (DB graph discovery: hypothesis_conditions → hypothesis_master)
        ↓
CausalHypothesisEngine            (existing: rank / eliminate / confidence)
        ↓
hypothesis_rule_mapping            (ONLY edge from hypothesis → rule)
        ↓
DecisionRules                      (crop/stage/DAS/weather/soil/NDVI evaluation)
        ↓
Safety Gates                       (SafetyGuardian)
        ↓
LLM Farmer Narrator                (translation only — never invents advice)
```

Invariants:
- Database = agriculture brain.
- TypeScript = graph runtime only.
- LLM = language + narration only. Never a source of agronomic content.
- No hardcoded agronomy, no fallback AI reasoning, no silent second-SSOT paths.

## Root cause the plan fixes

`hypothesis-evaluator.ts` derives hypotheses from `decision_rules` (rules pretending to be intelligence). Result on the failing turn: 12 observations, 0 hypotheses, 0 candidate rules, no winner. The graph edge `observation_master → hypothesis_conditions → hypothesis_master → hypothesis_rule_mapping → decision_rules` is never walked.

## Changes

### 1. NEW module — `decision/hypothesis-graph-evaluator.ts`
Pure DB graph discovery. No rule text, no LLM.

Input (from frozen evidence only):
```text
{ crop_code, growth_stage, das, observation_codes[], land_context, supabase, trace_id }
```

SQL — read the full condition set, not just positive matches:
```sql
SELECT hypothesis_code, observation_code, condition_type, weight
FROM   hypothesis_conditions
WHERE  hypothesis_code IN (
         SELECT DISTINCT hypothesis_code
         FROM   hypothesis_conditions
         WHERE  observation_code = ANY($obs)
       )
```

`condition_type` MUST be one of: `required | supporting | blocking | exclusion`. Negative reasoning is first-class.

Per candidate hypothesis, compute:
```text
{
  hypothesis_code,
  positive_matches:      [obs…],       // observed AND (required|supporting)
  negative_matches:      [obs…],       // observed AND (blocking|exclusion)
  missing_required:      [obs…],       // required AND NOT observed
  blocking_conditions:   [obs…],       // active blocking hits
  required_match_pct:    0..1,
  supporting_score:      0..1,
  confidence:            0..1          // aggregated from the four buckets
}
```

Ranking: drop hypotheses with any active `exclusion` hit, penalize `blocking`, reward `required` completion, tie-break by `hypothesis_master.priority`.

Join `hypothesis_master` for `canonical_group`, `stage_applicable`, `crop_code`, `severity`, `priority`. Filter by `crop_code`, stage compatibility, DAS window.

Emit one `[OBS_TO_HYP]` line: `input_observations`, `matched_hypothesis`, `blocked`, `excluded`.

### 2. `layered-rule-evaluator.ts` — hypothesis-scoped entry point

New method (existing evaluator stays for non-diagnostic callers):
```text
evaluateRulesForHypotheses({
  hypothesis_codes[], canonical_state, das, weather, soil, ndvi, supabase, trace_id
}) → LayeredRuleResult
```

Rule lookup is graph-only:
1. `SELECT rule_id FROM hypothesis_rule_mapping WHERE hypothesis_code = ANY($hyp)`.
2. If the set is empty for a hypothesis → return `{ error: 'HYPOTHESIS_RULE_EDGE_MISSING', hypothesis_code }`. **No fallback to `decision_rules.hypothesis_code`.** That column is not a graph edge and using it creates a competing SSOT.
3. Load those rules via `loadRulesForCrop` filtered to the id set.
4. Evaluate crop/stage/DAS/weather/soil/NDVI/safety through existing gates.
5. If `rules_matched === 0` → `result.coverage_gap = 'RULE_COVERAGE_GAP'`. Never invent a winner.

Emit one `[HYP_TO_RULE]` and one `[RULE_RESULT]` line.

### 3. `concept-bridge.ts` — remove canonical→canonical translation, gated

Goal: one `observation_code` end-to-end. Delete `resolveCropCanonicalObservations` and its call sites. Keep `bridgeCodesDb` (farmer language → canonical only via `observation_aliases`).

**Do not delete blindly.** Pre-flight audit that must return zero rows before removal:
```sql
SELECT hc.observation_code
FROM   hypothesis_conditions hc
LEFT JOIN observation_master om
       ON hc.observation_code = om.observation_code
WHERE  om.id IS NULL;
```
If rows > 0: leave the resolver in place, curate the missing `observation_master` rows first, re-run audit, then remove. This is a data-curation gate, not a code decision.

### 4. `agents/orchestrator.ts` — freeze evidence, run the graph

After `EVIDENCE_FREEZE`, only the frozen ledger is legal input downstream. Forbid: raw text re-parsing, LLM interpretation, keyword extraction, symptom recompute, direct `decision_rules` scans.

Ledger shape (single SSOT for the turn):
```text
{
  turn_id,
  evidence_locked: true,
  observations: [
    { code: 'POOR_GERMINATION', source: 'FARMER_LITERAL', confidence: 1 },
    …
  ]
}
```

Pipeline wiring:
```text
FrozenEvidence
   → HypothesisGraphEvaluator.evaluate()
   → CausalHypothesisEngine.rank()           // existing — keep, do not bypass
   → RuleEvaluator.evaluateRulesForHypotheses()
   → SafetyGuardian.verify()
   → DeterministicResponseBuilder → LLM narrator
   OR RULE_COVERAGE_GAP → LLM narrator (translation only)
```

`CausalHypothesisEngine` stays as the arbitration layer between raw graph discovery and rule selection — it already handles contradictions, `causal-hypothesis-engine.ts` is not bypassed.

### 5. Non-breaking compat shim — no fake `rule_id`

`hypothesis-evaluator.ts` becomes a thin delegate that returns the new shape mapped to a compat structure. **The shim must NOT synthesize a `rule_id`** — rule selection is a later stage.

New adapter shape consumers migrate to:
```text
CandidateHypothesis {
  hypothesis_code,
  cause,
  canonical_group,
  matched_conditions,
  positive_matches,
  negative_matches,
  missing_required,
  blocking_conditions,
  confidence,
  candidate_rule_ids: string[],   // from hypothesis_rule_mapping
  selected_rule_id:   null        // filled ONLY after rule evaluator wins
}
```

Consumers (`clarification-generator.ts`, `deterministic-response-builder.ts`, etc.) are updated to read `hypothesis_code` + `candidate_rule_ids` instead of the old top-`rule_id`. Legacy field is removed to prevent silent regressions.

### 6. Mandatory traces (one line each, in order)
```text
[EVIDENCE_FREEZE] turn=… locked_observations=[…] source=farmer
[OBS_TO_HYP]      trace=… crop=… stage=… obs=[…] matched=[…] blocked=[…] excluded=[…]
[HYP_TO_RULE]     trace=… hyp=[…] candidate_rules=[…] missing_edges=[…]
[RULE_RESULT]     trace=… winner=<rule_id|none> reason=<match|coverage_gap|edge_missing|safety_block>
```

### 7. Coverage-gap and edge-missing responses
- `rules_matched === 0` → structured `RULE_COVERAGE_GAP` with the ranked hypothesis list. Narrator translates the gap message. No advice invented.
- `HYPOTHESIS_RULE_EDGE_MISSING` → surfaced as a data-curation alert in logs (`ai_decision_log`), farmer sees an "insufficient knowledge" message from the narrator. Never GPT-authored advice.

## Files touched

1. **new** `supabase/functions/ai-agriculture-chat/decision/hypothesis-graph-evaluator.ts` (~280 LOC)
2. **edit** `decision/hypothesis-evaluator.ts` — delegates to (1), removes rules-as-hypothesis logic, keeps type exports for compilation.
3. **edit** `agents/layered-rule-evaluator.ts` — add `evaluateRulesForHypotheses`, `coverage_gap` and `edge_missing` fields; NO fallback to `decision_rules.hypothesis_code`.
4. **edit** `agents/orchestrator.ts` — insert `EVIDENCE_FREEZE` ledger; wire GraphEvaluator → CausalHypothesisEngine → RuleEvaluator; delete `resolveCropCanonicalObservations` call; add four trace lines; propagate `RULE_COVERAGE_GAP` / `HYPOTHESIS_RULE_EDGE_MISSING`.
5. **edit** `decision/concept-bridge.ts` — remove `resolveCropCanonicalObservations` **after** pre-flight audit returns zero rows.
6. **edit** `agents/causal-hypothesis-engine.ts` — accept the new hypothesis shape (positive/negative/blocking buckets) as ranking input; no behavioral change beyond input contract.
7. **no DB migration** — uses `hypothesis_conditions`, `hypothesis_master`, `hypothesis_rule_mapping`, `observation_master`, `observation_aliases` as they already exist.

## Success test

Farmer: `"या शेतातील पिक अजून उगवले नाही"` on a rice land, DAS 27.

Expected edge logs:
```text
[EVIDENCE_FREEZE] turn=… locked_observations=[POOR_GERMINATION,SEEDLING_DIED,STUNTED_PLANTS] source=farmer
[OBS_TO_HYP]      obs=[…] matched=[SEED_ROT,WATER_STRESS,LOW_SEED_VIABILITY,…] blocked=[…] excluded=[…]
[HYP_TO_RULE]     hyp=[…] candidate_rules=[…] missing_edges=[]
[RULE_RESULT]     winner=<rule_id|none> reason=<match|coverage_gap>
```

Pass criteria:
- Hypothesis count > 0.
- Either a winner rule OR a clean `RULE_COVERAGE_GAP` — never an LLM-fabricated answer.
- Zero `[GRAPH_OBS_DRIFT]` between freeze and rule selection.

## Rollout order

1. Ship module (1) and evaluator method (3) behind a shadow flag; log both old and new outcomes without changing user-facing behavior.
2. Wire `EVIDENCE_FREEZE` + causal engine integration in orchestrator (4, 6).
3. Flip orchestrator to the new pipeline as primary; keep the old path as read-only diff for one release.
4. Run pre-flight audit for concept-bridge, then delete `resolveCropCanonicalObservations` (5).
5. Remove the legacy `rule_id`-on-hypothesis shape once all consumers read the new adapter.

## Approval table (baked into this plan)

| Change                                          | Decision                          |
| ----------------------------------------------- | --------------------------------- |
| New `hypothesis-graph-evaluator.ts`             | ✅ Do                              |
| Use `hypothesis_conditions` as SSOT             | ✅ Do                              |
| New rule evaluator entry `evaluateRulesForHypotheses` | ✅ Do                        |
| Fallback to `decision_rules.hypothesis_code`    | ❌ Removed — edge-missing instead |
| Remove `concept-bridge` canonical→canonical     | 🟡 After pre-flight audit         |
| Orchestrator EVIDENCE_FREEZE pipeline           | ✅ Do                              |
| Compat shim with fake `rule_id`                 | ❌ Removed — adapter has `candidate_rule_ids` |
| Coverage-gap response                           | ✅ Do                              |
| Keep `causal-hypothesis-engine` in the chain    | ✅ Required                        |

## Out of scope

- Rewriting LLM prompts.
- Adding fallback AI reasoning.
- Any hardcoded agronomy.
- Seeding `observation_aliases` or new `decision_rules` rows.
- Retiring the `hypothesis_*` tables — this plan promotes them to SSOT.
