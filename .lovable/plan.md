
# Neuro-Symbolic Decision Brain — Forensic Audit & Repair Plan

## Scope

Audit the live `supabase/functions/ai-agriculture-chat/` pipeline against the required graph:

```text
Farmer → Intent → LandContextLock → Observation → Hypothesis → Confidence → DecisionRule → LLM Narrator
```

No new files, no new tables, no new architecture. Only reconnect, delete dead paths, fix wiring.

## Phase 1 — Read-only Forensic Trace (no edits)

For each node I will produce a `File / Function / Line / Issue / Fix` block. Investigation targets:

1. **Entry & Orchestrator**
   - `index.ts`, `agents/orchestrator.ts`, `agents/intent-router.ts`, `agents/query-router.ts`
   - Verify: single entry, no LLM diagnosis, `symptomFreeRoutes` gate holds, no `GENERAL_INFO` override of `DIAGNOSTIC`.

2. **Language / Intent (Node 1 + 3)**
   - `llm-understanding-layer.ts`, `agents/nlu-agent.ts`, `agents/intent-classifier.ts`, `agents/semantic-extractor.ts`, `agents/intent-lock.ts`
   - Verify `intent_master` + `intent_observation_mapping` reads; confirm LLM only extracts, never diagnoses; confirm crop-prefix lock (PR-7 F6) is invoked on every turn.

3. **Land Context Lock (Node 2)**
   - `decision/authoritative-state-loader.ts`, `decision/canonical-context-contract.ts`, `decision/context-authority.ts`, `decision/context-validator.ts`, `runtime/conversation-state.ts`, `src/hooks/useLandChatContext.ts`
   - Verify context is frozen once per turn (`assertCanonicalContextLocked`), no rebuild downstream, no cross-land leakage in `context-manager.ts`.

4. **Observation (Node 4)**
   - `agents/canonical-observation-loader.ts`, `agents/observation-extractor.ts`, `agents/observation-key-mapper.ts`, `decision/observation-ontology.ts`, `decision/iom-gate.ts`, `runtime/farmer-observable-gate.ts`, `runtime/evidence-classifier.ts`
   - Verify observations come only from `observation_master` via `intent_observation_mapping`; LLM-invented symptoms are rejected; pagination is honoured (memory rule).

5. **Hypothesis (Node 5)**
   - `decision/causal-hypothesis-engine.ts`, `decision/hypothesis-evaluator.ts`, `decision/hypothesis-graph-evaluator.ts`, `runtime/graph-runtime.ts`, `runtime/decision-graph-navigator.ts`, `runtime/graph-truth.ts`
   - Verify `OBS_TO_HYP` always runs when observations exist; `HYP_TO_RULE` never runs with `hyp=[]`; canonical_group + stage-family invariants hold.

6. **Confidence (Node 6)**
   - `decision/confidence-calculator.ts`, `decision/confidence-chain.ts`, `runtime/contradiction-engine.ts`, `src/decision-graph/confidence-engine.ts`
   - Verify confidence source = symbolic evidence, not LLM; low-confidence path routes to `clarification-generator`, never straight to rules.

7. **Decision Rule (Node 7)**
   - `agents/layered-rule-evaluator.ts`, `agents/rule-engine-executor.ts`, `agents/rule-module-resolver.ts`, `layers/rule-evaluation-layer.ts`, `decision/prescription-gate-enforcer.ts`, `decision/unified-decision-gate.ts`
   - Verify hypothesis→rule mapping via `hypothesis_rule_mapping`; no `ORPHAN_RULE_SELECTION`; category registry complete (memory rule).

8. **Narration (Node 8)**
   - `agents/llm-response-generator.ts`, `agents/llm-response-formatter.ts`, `agents/deterministic-response-builder.ts`, `agents/communication-generator.ts`
   - Verify LLM receives only approved decision payload; no dose/chemical mutation; canonical-language SSOT enforced.

9. **DB wiring**
   - For each of `intent_master`, `intent_observation_mapping`, `observation_master`, `hypothesis_conditions`, `hypothesis_master`, `hypothesis_rule_mapping`, `decision_rules`: check reader function, column names via `information_schema`, row counts, and runtime usage sites. Fill the `TABLE / Expected / Actual / Connected / Broken / Fix` grid.

10. **Dead code / duplicates**
    - Compare `_deadcode/` against live counterparts.
    - Grep for unreferenced exports in `agents/`, `decision/`, `runtime/`.
    - Flag duplicated graph runners (`graph-runtime.ts` vs `decision-graph-navigator.ts` vs `hypothesis-graph-evaluator.ts`) and pick the one wired to the orchestrator.

11. **Graph integrity traces**
    - Mental-trace two queries end-to-end and record real vs expected node transitions:
      - "My sugarcane leaves are yellow"
      - "भात अजून उगवले नाही"

## Phase 2 — Deliverable (produced at end of Phase 1)

A single forensic report with:
- Executive summary (Graph Working: Y/P/N, Production Ready: Y/N)
- Actual pipeline diagram derived from code
- Expected-vs-Actual table per node
- P0/P1/P2 bug list with File / Function / Line / Root cause / Fix / Risk
- Dead code report
- Missing-wire report
- Minimal ordered PR plan (see Phase 3)

## Phase 3 — Minimal Repair PRs (build mode, after report approval)

Placeholder order — actual PRs are only defined after Phase 1 findings. Each PR must:
- touch existing files only
- add no tables
- add no new agents/runners
- carry a targeted regression test in `supabase/functions/ai-agriculture-chat/tests/`

```text
PR-A  Reconnect broken graph edge exposed by trace #1
PR-B  Delete/quarantine duplicate graph runner not wired to orchestrator
PR-C  Restore DB reader for the table found disconnected in Phase 1
PR-D  Kill any LLM diagnostic fallback path discovered
PR-E  Regression tests pinning each repaired edge
```

## Guardrails

- No new files, no new tables, no schema changes.
- No parallel pipeline; repair the existing brain.
- Every finding must cite `file:line`; no assumptions.
- LLM stays a narrator; any code found generating agronomy is removed, not rewritten.

## What I need from you before I start

1. Approve running Phase 1 as a read-only forensic sweep now (I will return the full report, then wait for approval before any edits).
2. Confirm the two trace queries above, or give me a specific failing farmer message + `land_id` from a recent session so the trace uses real data instead of synthetic input.
