
# Mission

Clarification generation is correct. After the farmer confirms a valid observation, the pipeline still returns a generic monitoring response instead of executing a symbolic rule. Find the exact stage that drops the confirmed symbol or fails to advance the decision graph, fix it in place, and prove the fix by replaying the failing turn end-to-end. No new architecture, no hardcoded crop logic, no LLM shortcuts.

# Phase 1 — Forensic trace of one failing turn (read-only)

Goal: produce a single execution graph of the live production path for the failing Marathi turn ("या शेतातील पिक अजून उगवले नाही" → confirmed observation → generic response).

Steps:
1. Replay the conversation via `supabase--curl_edge_functions` against `ai-agriculture-chat` with the actual conversation_id and selected option, capturing the full `runtimeTrace` and `brain-trace` output.
2. Walk the active code path in order and record input/output/owner at each stage:
   - `index.ts` request handler
   - `orchestrator.processQuery`
   - LLM understanding (`llm-understanding-layer.ts`, `nlu-agent.ts`)
   - Canonical context lock (`canonical-state-builder.ts`, `context-manager.ts`)
   - `runtime/contradiction-engine.ts`
   - Clarification path on the **reply turn** — confirm whether `OPTION_SELECTED` is treated as a confirmed observation or re-enters the clarification loop
   - `runtime/graph-runtime-state.ts::applyEvent` — confirm the confirmed symbol enters `confirmed` map with the canonical key
   - `decision/hypothesis-evaluator.ts` — confirm it consumes the updated state
   - `agents/rule-engine-executor.ts` / `decision/symbolic-reasoner.ts` — confirm candidate retrieval scope
   - `agents/layered-rule-evaluator.ts` — per-predicate PASS/FAIL/NOT_APPLICABLE
   - `agents/deterministic-response-builder.ts` vs `agents/llm-response-generator.ts` — which branch produced the final response, and why
3. At each stage record: did the confirmed symbol propagate unchanged? If renamed/dropped, where exactly?

Deliverable: a single annotated trace document (markdown) with file:line citations and the **proven failure stage**.

# Phase 2 — Targeted hypotheses to confirm or reject

Each hypothesis is checked against the Phase 1 trace; we fix only the ones the trace proves.

H1. Reply-turn intent misclassification: the option-selection reply is re-classified by NLU instead of being treated as an `OPTION_SELECTED` event, so the previously selected observation never reaches `confirmed`.

H2. Canonical key mismatch on write: clarification options carry one casing/shape (e.g. `crop_not_emerged`) but `applyEvent` writes a different key (uppercase code or display string), so `confirmed.has(canonical)` is false in the evaluator.

H3. Hypothesis activation gate drops all candidates after confirmation: `requires`/`blocks` are evaluated against a key shape the state doesn't contain, so `activeNodeIds` collapses to ∅ → `INSUFFICIENT_EVIDENCE` → narrator falls through to generic monitoring.

H4. Rule candidate retrieval scope query excludes germination/emergence stage family (stage equivalence not applied at the SQL/in-memory filter step) so zero candidate rules load for the confirmed symbol.

H5. Predicate evaluator returns "no rule matched" without per-predicate verdicts, and the orchestrator's fallback branch converts that into a monitoring narration instead of a deterministic `INSUFFICIENT_EVIDENCE` response with rejection reasons.

H6. A legacy fallback path (e.g. `llm-response-generator.ts::generateLLMResponse` or a `generic_monitoring` template in `deterministic-response-builder.ts`) is still reachable after the navigator emits PROCEED-but-no-rule, silently overriding the symbolic verdict.

# Phase 3 — Minimal in-place fixes

Only the hypotheses Phase 1 proves get patched. Patches are constrained to existing files (no new abstractions):

- Reply-turn handling: ensure orchestrator routes "option selected" replies straight to `RuntimeGraphState.applyEvent(OPTION_SELECTED)` with the canonical observation key from the prior turn's options metadata, **before** NLU re-classification can override it.
- Canonical key normalization: single `canonicalizeObservationKey` call at the write site in `graph-runtime-state.ts::applyEvent` and at every read site (hypothesis activation, predicate eval, candidate retrieval). Remove any local lowercase/uppercase variants.
- Stage-family equivalence: reuse the existing `STAGE_FAMILIES` table from `navigator-adapter.ts` inside candidate retrieval and predicate evaluation so germination/nursery/seedling/emergence/establishment are treated as one family (per existing memory rule).
- Per-predicate verdicts: ensure `layered-rule-evaluator.ts` returns `{PASS|FAIL|NOT_APPLICABLE, reason}` for every predicate and that the orchestrator surfaces these into `runtimeTrace.rule_evaluation` instead of collapsing to "no rule matched".
- Remove the silent monitoring fallback: when the navigator emits `INSUFFICIENT_EVIDENCE` or the evaluator produces zero winners, the orchestrator must return a deterministic insufficient-evidence response built from the rejection report, **never** call the LLM monitoring template. Delete or guard the offending fallback branch in `orchestrator.ts` / `deterministic-response-builder.ts`.

Each patch is a search-replace inside the existing file; no new files, no new schema, no crop-specific code.

# Phase 4 — Verification

1. Replay the failing Marathi conversation via `supabase--curl_edge_functions` and assert:
   - `runtimeTrace.confirmed` contains the canonical observation key after the selection turn.
   - `runtimeTrace.rule_evaluation` lists ≥1 candidate rule with per-predicate verdicts.
   - Final response is either a deterministic recommendation **or** a deterministic insufficient-evidence response with the rejection report — never the generic monitoring narration.
2. Run two additional replays on different crops/stages (e.g. sugarcane shoot-borer turn, rice tillering turn) to confirm no crop-specific regression.
3. Spot-check `[CLARIFICATION_OWNER]` and `[BRAIN_TRACE]` edge logs for any remaining legacy producer or fallback marker.

# Phase 5 — Dead-code sweep (only what Phase 1 proves dead)

Remove or `[DEPRECATED]`-guard any legacy execution path the trace shows is bypassed (e.g. legacy `fetchRuleDrivenClarificationOptions`, any second response-builder branch). No speculative deletions.

# Out of scope

- New schema, new tables, new abstractions.
- Architectural redesign.
- Any crop-, pest-, disease-, observation-specific hardcoding.
- LLM-generated agronomic recommendations.

# Technical references

- Pipeline owner: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- Single state SSOT: `supabase/functions/ai-agriculture-chat/runtime/graph-runtime-state.ts`
- Navigator: `supabase/functions/ai-agriculture-chat/runtime/decision-graph-navigator.ts` + `navigator-adapter.ts`
- Evaluators: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`, `agents/layered-rule-evaluator.ts`, `agents/rule-engine-executor.ts`
- Response builders: `agents/deterministic-response-builder.ts`, `agents/llm-response-generator.ts`
- Canonical keys: `runtime/clarification-contract.ts::canonicalizeObservationKey`
- Stage-family table: `runtime/navigator-adapter.ts::STAGE_FAMILIES`

# Deliverables

1. Annotated execution-graph trace of the failing turn with proven root cause(s).
2. Minimal in-place patch set across existing files only.
3. Replay verification log for the failing turn + 2 cross-crop turns.
4. Short dead-code removal note listing each deleted/guarded path with justification from the trace.
