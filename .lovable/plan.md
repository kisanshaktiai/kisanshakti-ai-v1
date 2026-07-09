
# Neuro-Symbolic Graph Repair — 6 Surgical Patches (v4, crop-agnostic)

Corrections applied from the audit: contracts are now graph-agnostic to crop, symbol identity runs BEFORE biological scope, orphan-rule fallback removed from runtime, action contract generalized to decision-output contract, regression suite is crop-independent. No new architecture, no DB changes, no hardcoded agronomy, no LLM diagnosis path.

## Universal bug being fixed

Graph accepts nodes without validating: (1) does the symbol exist? (2) is it biologically permissible in this context? (3) does an edge exist from it? (4) is a decision reachable? The rice/brinjal trace in the log is only one instance of this class.

## Enforced pipeline (order matters)

```text
Farmer Input
   ↓ Intent Detection (no decision)
   ↓ Observation Extraction
   ↓ SYMBOL_IDENTITY_CONTRACT      ← Patch 5 (runs FIRST)
   ↓ BIOLOGICAL_SCOPE_CONTRACT     ← Patch 1
   ↓ Observation Authority
   ↓ OBS → HYP edge
   ↓ Hypothesis Validation
   ↓ HYP → RULE edge
   ↓ GRAPH_AUTHORITY_GATE          ← Patch 2
   ↓ Rule Execution (graph nodes only)  ← Patch 3
   ↓ DECISION_OUTPUT_CONTRACT      ← Patch 4
   ↓ LLM Narration (render only)
```

---

## Patch 5 — SYMBOL_IDENTITY_CONTRACT (runs first)

**Files:** `runtime/symbol-contract.ts` (extend), call sites in `agents/orchestrator.ts`, `decision/hypothesis-graph-evaluator.ts`, decision-representation.

Three gates loaded once per turn from data the pipeline already fetches:

```text
BEFORE any scope check : obs.code   ∈ observation_master   else drop, log [UNKNOWN_OBSERVATION_SYMBOL]
BEFORE HYP_TO_RULE     : hyp.code   ∈ hypothesis_master    else drop, log [UNKNOWN_HYPOTHESIS_SYMBOL]
BEFORE final execution : rule.rule_id ∈ decision_rules     else drop, log [UNKNOWN_RULE_SYMBOL]
```

Rationale: unknown symbols have no reliable crop metadata; scope evaluation on them is meaningless. Never inspect an object that isn't in the graph.

## Patch 1 — BIOLOGICAL_SCOPE_CONTRACT (crop-agnostic)

**Files:** `decision/concept-bridge.ts`, `runtime/observation-authority.ts`, any observation-code-mapper / cross-crop-mapper publish point.

Runs AFTER Patch 5. Uses only DB metadata already available on `observation_master` / `observation_aliases` (`crop_code`, `crop_group`, `host_family`, `scope`, `semantic_type`) — no hardcoded species lists.

```text
ACCEPT observation o if ANY:
  o.crop_code == current_crop_code
  o.scope IN ('UNIVERSAL','GENERIC_SYMPTOM')
  o.crop_group  == current_crop_group        // e.g. grasses, solanaceae
  o.host_family == current_crop_family
  o.semantic_type == 'SYMPTOM'               // biological symptom, not organ-specific

REJECT if:
  o.semantic_type == 'CROP_ORGAN_SPECIFIC' AND crop/family/group mismatch
  → reason=CROSS_CROP_SCOPE_VIOLATION
```

Effect:
- Rice ACCEPTS: `YELLOW_LEAF`, `STUNTED_GROWTH`, `ROOT_DAMAGE`, `POOR_TILLERING` (shared with sugarcane/maize/wheat via grass family).
- Rice REJECTS: `CANE_INTERNODE_BORING`, `COTTON_BOLL_DAMAGE`, `BRINJAL_FRUIT_ROT` (organ-specific to another crop).
- Solanaceae members share `BACTERIAL_WILT`, `LEAF_CURL`, nematode symptoms via `crop_group`/`host_family`.

Dropped codes go to `dropped_cross_crop[]` and NEVER enter `confirmed_observations`, `real_codes`, `GRAPH_TRUTH_BUILT.obs`, `CANONICAL_PROJECTION_ONLY`, `HYPOTHESIS_CONTRACT`, or `ObservationAuthority.INFERRED`. Trace: `[OBS_SCOPE_REJECT] crop=<ctx> dropped=[...] reason=CROSS_CROP_SCOPE_VIOLATION`.

## Patch 2 — GRAPH_AUTHORITY_GATE (unchanged, mandatory)

**File:** `agents/orchestrator.ts`, immediately after `syncCanonicalStateFromSnapshot`, before `LayeredRuleEvaluator`.

```text
if diagnostic_intent
   and graphExecuted
   and confirmed_observations.length > 0
   and snapshot.hypotheses.length == 0:
       decision_outcome = INSUFFICIENT_KNOWLEDGE
       gap_reason       = NO_HYPOTHESIS_EDGE
       route            = ClarificationEngine   // questions from hypothesis_conditions of nearest_hypotheses
       SKIP LayeredRuleEvaluator
       log [GRAPH_AUTHORITY_GATE] blocked=RULE_EVALUATOR reason=NO_HYPOTHESIS_EDGE
```

`[GRAPH_HANDOFF_CHECK]` in `index.ts` throws `GRAPH_CONTRACT_VIOLATION` on `graphExecuted && hypotheses==0 && rules==0 && ruleResult==true`. Non-diagnostic intents (proactive, monitoring, rotation, cron) keep existing path.

## Patch 3 — Graph-Only Rule Firewall (no runtime orphan fallback)

**Files:** `agents/layered-rule-evaluator.ts`, bundled-rules loader, `INTENT_FILTER` call site.

Production runtime:

```text
candidate_rules = snapshot.rule_ids     // ONLY. No orphan admission at runtime.
```

Missing HYP→RULE edge is a data-quality issue, not a runtime feature. When a hypothesis has no rule edge:
- Emit `[GRAPH_EDGE_MISSING] hypothesis=<code> reason=NO_RULE_EDGE`.
- Route to clarification / gap disclosure via Patch 4.
- Never silently repair by pulling a "close-looking" rule.

Development/debug mode (env flag `GRAPH_DEBUG_ORPHAN_DISCOVERY=true`, off in prod): may compute candidate orphans and write an audit report — but MUST NOT feed them into the evaluator.

`INTENT_FILTER` must actually intersect with `decision_rules.applicable_intents` — current `202→202` no-op is a bug. Trace: `[INTENT_FILTER] before=X after=Y removed=[...]`.

## Patch 4 — DECISION_OUTPUT_CONTRACT (generalized)

**File:** `agents/decision-representation.ts` and actions-populator.

Every farmer-visible turn must terminate in EXACTLY ONE of:

```text
ACTION               → rule.action_text + action_type (spray/irrigate/fertilize/…)
MONITORING_PLAN      → observation window + trigger conditions
CLARIFICATION_REQUEST→ missing observations from hypothesis_conditions
NO_ACTION_REASON     → healthy / no-op justification from graph
```

Every output kind sources content from graph nodes (`decision_rules`, `hypothesis_master`, `observation_master`) — never from LLM synthesis. Missing all four → `EXECUTION_INVALID`, log `[DECISION_OUTPUT_CONTRACT_VIOLATION] kind=NONE`, degrade to `INSUFFICIENT_KNOWLEDGE`. Never a silent empty primary.

## Patch 6 — Crop-Independent Regression Harness

**File (new):** `tests/graph-authority_test.ts`. Parametrized by crop — no rice-specific asserts.

```text
T1 FOREIGN_ORGAN_SYMBOL
   for crop in [RICE, SUGARCANE, COTTON, ONION, TOMATO, GRAPES]:
     inject observation whose semantic_type=CROP_ORGAN_SPECIFIC belongs to another crop
     expect: [OBS_SCOPE_REJECT]; GRAPH_TRUTH_BUILT.obs clean

T2 UNIVERSAL_SYMPTOM
   for crop in [RICE, COTTON, SUGARCANE, ONION]:
     inject YELLOWING (scope=UNIVERSAL)
     expect: accepted; projects to at least one crop-appropriate hypothesis

T3 FAMILY_SHARED_SYMPTOM
   inject BACTERIAL_WILT for each Solanaceae member (TOMATO, BRINJAL, CHILLI, POTATO)
     expect: accepted via crop_group / host_family

T4 GRAPH_AUTHORITY_GATE
   confirmed>0, hypotheses==0, diagnostic intent
     expect: [GRAPH_AUTHORITY_GATE]; evaluator not called; response=INSUFFICIENT_KNOWLEDGE

T5 GRAPH_ONLY_RULES
   diagnostic intent
     expect: evaluator candidate_rules ⊆ snapshot.rule_ids;
             no CROT_* / PROACTIVE_FLOOD_* leaking in

T6 GRAPH_EDGE_MISSING
   hypothesis present but no HYP→RULE edge
     expect: [GRAPH_EDGE_MISSING]; NO silent orphan use in prod mode

T7 DECISION_OUTPUT_CONTRACT
   for each kind ∈ {ACTION, MONITORING_PLAN, CLARIFICATION_REQUEST, NO_ACTION_REASON}:
     expect: terminal turn passes; missing all → EXECUTION_INVALID

T8 UNKNOWN_SYMBOL
   inject obs.code / hyp.code / rule_id not in master tables
     expect: [UNKNOWN_*_SYMBOL]; dropped before graph traversal

T9 LLM_DIAGNOSIS_ATTEMPT
   force narrator to emit a diagnosis not in graph output
     expect: rejected by output validator; narrator restricted to rendering
```

## Change-log headers

Every touched file under `supabase/functions/ai-agriculture-chat/**` gets a newest-first entry `2026-07-09 HH:MM UTC — <summary>` per project rule.

## Expected trace after fix (audit-log turn)

```text
SYMBOL_CONTRACT      obs_ok=N hyp_ok=M rule_ok=K unknown=0
CONCEPT_BRIDGE       crop=RICE output=[universal + rice-family only]
OBS_SCOPE_REJECT     crop=RICE dropped=[BRINJAL_OBS_STUNTED_PLANT, STUNTED_CANES, STUNTED_INTERNODES, STUNTED_TILLERS]  reason=CROSS_CROP_SCOPE_VIOLATION
GRAPH_TRUTH_BUILT    obs=[rice/family/universal only]
OBS_TO_HYP_TRACE     matched_conditions>=1
HYP_TO_RULE_TRACE    rules>=1                    (else [GRAPH_EDGE_MISSING] + clarification)
INTENT_FILTER        before=202 after=<<
RULE_EVALUATOR_INPUT count=snapshot.rule_ids     (graph-scoped only)
DECISION_OUTPUT      kind ∈ {ACTION|MONITORING_PLAN|CLARIFICATION_REQUEST|NO_ACTION_REASON}
ORCHESTRATOR_EXIT    graphExecuted=true hypotheses>=1 rules>=1 output_kind!=NONE ruleResult=true
```

`PROACTIVE_FLOOD_PREPAREDNESS_001` cannot win a diagnostic turn — it's not in `snapshot.rule_ids`. Silent `MONITOR_ONLY` and empty-actions primaries are eliminated by Patch 4.

## Guarantees

- Fully crop-agnostic: no rice/sugarcane/cotton/onion/tomato/grape branches anywhere.
- No new architecture; working graph runtime, snapshot builder, hypothesis validator untouched.
- No runtime orphan repair; missing edges surface as data-quality signals.
- DB unchanged. LLM restricted to narration.
- Scales to millions of farmers and all future crops loaded from DB metadata.

## Deliverables after implementation

1. Files changed with change-log entries.
2. Contracts added: `SYMBOL_IDENTITY`, `BIOLOGICAL_SCOPE`, `GRAPH_AUTHORITY_GATE`, `GRAPH_ONLY_RULE_FIREWALL`, `DECISION_OUTPUT`.
3. Before/after execution trace of the audit-log turn.
4. Regression test results (T1–T9, parametrized across ≥6 crops).
5. Confirmation the old failure log cannot reproduce (golden replay green).
