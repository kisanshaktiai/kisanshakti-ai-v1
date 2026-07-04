# Forensic Fix Plan — Neuro-Symbolic Decision Brain Handoff Repairs

Scope: repair 4 handoff breaks identified in the edge log audit. No new architecture, no schema changes, no data changes, no LLM fallbacks.

## Root Causes Confirmed

From `supabase-logs...csv (14)`:
1. **Evidence→GraphState handoff drops observations**: `EVIDENCE_CLASSIFICATION real=1 [POOR_GERMINATION]` → `GRAPH_NODE_TRACE OBSERVATION canonical_count=0 real_symptom_count=0`.
2. **Intent resolver runs on empty observations** → misclassifies "crop not germinated" as `GENERAL_CROP_INFO` (0.9 conf).
3. **BiologicalState locks `transplanting` despite `POOR_GERMINATION` contradiction** — no biological compatibility check.
4. **Hypothesis seed candidates not promoted** to active graph state → rule engine runs on wrong universe → picks `PROACTIVE_FLOOD_PREPAREDNESS_001`.

## Fixes (in order)

### Fix 1 — Restore observation survival across handoff (ROOT CAUSE)
**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (canonical graph payload assembly) and `supabase/functions/ai-agriculture-chat/agents/canonical-state-builder.ts`.

- Locate the point where `EvidenceClassifier.real_codes` is computed and where `GraphState.observations` / `ConversationState.confirmed` is populated for the `OBSERVATION` node trace.
- Ensure the classifier output (`real_codes`) is passed directly into graph state — not re-derived from a downstream (filtered) source that drops `POOR_GERMINATION`.
- Add invariant guard (fail loud, do not mask):
  ```
  if (evidence.real_symptom_count > 0 && graphState.observations.length === 0) {
    console.error('[GRAPH_STATE_CORRUPTION] real_symptom_count=%d lost in handoff', ...)
    throw new Error('GRAPH_STATE_CORRUPTION: observations lost between classifier and graph')
  }
  ```
- Emit `[HANDOFF_TRACE]` immediately before and after graph-state assembly with `real_codes` in both.

### Fix 2 — Observation-evidence overrides intent classification
**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (INTENT_SALVAGE block, extending existing salvage logic).

- After intent resolution, if `real_symptom_count > 0` AND resolved intent ∈ {`GENERAL_CROP_INFO`, `UNKNOWN`, `UNKNOWN_OBSERVATION`, `CROP_INFO`}, force reclassify to `DIAGNOSTIC_INQUIRY`.
- Log `[INTENT_OVERRIDE_BY_EVIDENCE] from=GENERAL_CROP_INFO to=DIAGNOSTIC_INQUIRY reason=real_symptoms_present codes=[...]`.
- Do NOT touch intent resolver internals — override at orchestrator boundary.

### Fix 3 — Biological contradiction gate (do NOT remove SSOT)
**File**: `supabase/functions/ai-agriculture-chat/agents/biological-state.ts` (after `BIO_STATE_LOCKED` emission).

- Add post-lock compatibility check against confirmed observations:
  - Contradiction table (inline map, no DB): `POOR_GERMINATION`, `NO_GERMINATION`, `SEEDLING_DEATH` are incompatible with stages ∈ {`transplanting`, `tillering`, `vegetative`, `flowering`, `reproductive`, `maturity`}.
- On contradiction:
  - Downgrade `stage_confidence` (e.g. 0.75 → 0.30).
  - Set `contradiction_flag=true` on BIO_STATE.
  - Emit `[BIO_STATE_CONTRADICTION] stage=transplanting obs=POOR_GERMINATION action=confidence_downgrade`.
- Do NOT unlock/rewrite the stage — only mark contradiction so downstream can trigger clarification.

### Fix 4 — Wire hypothesis seed → active graph state
**File**: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` and orchestrator hand-off.

- Identify why `hypothesis_graph_seed candidates=5` produces `hyp=0 candidates=0 eligible=0` at rule-engine time.
- Ensure the seeded candidates are written to the `RuntimeGraphState.hypothesis_graph` array used by the rule evaluator (not a discarded local variable).
- Add invariant:
  ```
  if (seed.length > 0 && activeGraph.hypothesis_graph.length === 0) {
    console.error('[HYPOTHESIS_PROMOTION_LOST] seed=%d active=0', seed.length)
  }
  ```
- Extend the existing `HYPOTHESIS` `GRAPH_NODE_TRACE` with `seeded_count`, `promoted_count`, `dropped_reason`.

## Verification

After deploy, one turn ("crop did not germinate", Rice, DAS=26) must produce:
- `EVIDENCE_CLASSIFICATION real_symptom_count=1`
- `GRAPH_NODE_TRACE node=OBSERVATION real_symptom_count=1 real_codes=[POOR_GERMINATION]`
- `INTENT_OVERRIDE_BY_EVIDENCE → DIAGNOSTIC_INQUIRY`
- `BIO_STATE_CONTRADICTION` logged
- `HYPOTHESIS seeded_count>0 promoted_count>0`
- Rule engine matches diagnostic rule (not flood proactive)
- No `GRAPH_STATE_CORRUPTION` throws

## Out of Scope (do not touch)
- `crop_stage_master`, `decision_rules`, `observation_master` data
- BiologicalState RPC / crop_schedules fallback
- Translations, GDD tables
- Any new tables or LLM agronomic fallbacks
