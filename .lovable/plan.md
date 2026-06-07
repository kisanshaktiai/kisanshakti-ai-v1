## Root cause (evidence-backed)

The orchestrator's short-circuit lanes build a complete, localized, confidence=1.0 payload and return it to `index.ts`. But the post-orchestrator pipeline in `supabase/functions/ai-agriculture-chat/index.ts` only recognizes ONE short-circuit sentinel (`template_type === 'STATIC_DIRECT'`). Every other short-circuit — `NO_ACTIVE_CROP`, `NEXT_CROP_RECOMMENDATION`, `STAGE_FALLBACK` (partial), greeting, etc. — falls through into:

1. Filtering audit → wipes `actions_returned` to 0 (no matching filters but no pass-through for these payload shapes either).
2. Confidence bridge → recomputes `symbolic_confidence = 0` (overwrites the orchestrator's `1.0`).
3. Unified gate → fails (confidence 0).
4. Safety gate → CLARIFY downgrade.
5. LLM formatter → emits the generic clarification template with the literal placeholder `{symptom}` because no symptoms exist.

### Evidence

- **`docs/audit-2026-06-07/15-live-trace-evidence.md`** documents the Marathi "खारी / गहू" trace returning `"...\"symptom\" च्या लक्षणांमागे..."` with `metadata.confidence = 0`, while the orchestrator log shows the NO_ACTIVE_CROP guard fired with `confidence_score: 1.0`.
- **Latest edge-function logs (trace `trace_mq3tmjhq_7f5ht2`)** show the new NEXT_CROP engine working correctly — `NEXT_CROP_ENGINE_HIT, matched_rule_count: 2, top_candidates: [cotton, soybean]` — but the next log lines are `AFTER FILTERING: 0 actions`, `ConfidenceBridge: symbolic=0`, `Using LLM formatter`, `ai_model: template`, response length 224 chars. The 2 engine candidates and the pre-rendered Marathi narration are silently discarded.
- **`index.ts:1223-1225`** is the only short-circuit check: `template_type === 'STATIC_DIRECT' || source === 'STATIC_DATA_GATE'`. Neither `NO_ACTIVE_CROP` (orchestrator.ts:1737) nor `NEXT_CROP_RECOMMENDATION` (orchestrator.ts:1895) are matched.

This is a single defect with two visible symptoms: (a) generic "{symptom}" template instead of the localized no-active-crop message, and (b) the new crop-rotation engine's correct DB-sourced recommendation never reaches the user.

## Fix

### 1. `supabase/functions/ai-agriculture-chat/index.ts`

Generalize the short-circuit detector at line ~1223 from a single sentinel to a set:

```ts
const SHORT_CIRCUIT_TEMPLATE_TYPES = new Set([
  'STATIC_DIRECT',
  'NO_ACTIVE_CROP',
  'NEXT_CROP_RECOMMENDATION',
  'GREETING',
  'STAGE_FALLBACK',
]);
const SHORT_CIRCUIT_SOURCES = new Set([
  'STATIC_DATA_GATE',
  'NO_ACTIVE_CROP_GUARD',
  'NEXT_CROP_RECOMMENDATION_ENGINE',
  'NEXT_CROP_RECOMMENDATION_FALLBACK',
]);
const isShortCircuitResponse =
  SHORT_CIRCUIT_TEMPLATE_TYPES.has(
    orchestratorResponse.decision_output?.metadata?.template_type as string
  ) ||
  SHORT_CIRCUIT_SOURCES.has(
    orchestratorResponse.communication?.metadata?.source as string
  );
```

When `isShortCircuitResponse` is true:
- Use the orchestrator's pre-built `communication.main_message.full_text[detectedLanguage]` verbatim — no LLM, no template formatter.
- Skip filtering, confidence bridge, unified gate, safety gate, and Phase 5 LLM formatting entirely.
- Preserve the orchestrator's `metadata.confidence` (1.0 for the guard, engine score for next-crop) end-to-end into the response payload.
- Set `metadata.ai_model` to a clear sentinel (`'template-no-active-crop'`, `'next-crop-engine'`, etc.) so traces are unambiguous.
- Still persist the assistant message and run the standard `ui-response-builder` pass — only the LLM/template formatting branch is bypassed.

### 2. `supabase/functions/ai-agriculture-chat/decision/response-generator.ts`

Add a defensive placeholder guard: if the rendered template still contains a `{…}` token after substitution, refuse to emit it and fall back to a minimal localized "need more details" string. This prevents future similar regressions from leaking raw template tokens to farmers.

### 3. Confidence preservation

When `isShortCircuitResponse`, the confidence-bridge MUST NOT overwrite the orchestrator's confidence with 0. The simplest implementation is to skip the bridge entirely on this branch (it has no rule outputs to bridge anyway).

### 4. Regression tests

Add `tests/chat/short-circuit-bypass.test.ts` with two cases:

- **NO_ACTIVE_CROP**: Marathi input "माझ्या खारी जमिनीत आता काय करू? मागच्या वेळी गहू होते" on a land with no active crop must return:
  - `response` starts with `🌱`, contains `गहू` and `पीक नोंदणी`.
  - `metadata.confidence === 1.0`.
  - `metadata.ai_model === 'template-no-active-crop'`.
  - No `"{"` or `"symptom"` substring in `response`.
- **NEXT_CROP_RECOMMENDATION**: Hindi/Marathi rotation query after a Wheat harvest must:
  - Include the top candidate crop name from the engine (e.g. cotton/soybean per the live log).
  - Carry `actions_returned.length >= 1` with `action_type === 'RECOMMEND_CROP'` and a non-empty `scientific_basis`.
  - `metadata.ai_model === 'next-crop-engine'`.

### 5. Memory update

Add a core rule to `mem://index.md`:

> Any orchestrator short-circuit payload (template_type ∈ {STATIC_DIRECT, NO_ACTIVE_CROP, NEXT_CROP_RECOMMENDATION, GREETING, STAGE_FALLBACK} OR source matches a registered short-circuit source) MUST bypass filtering, confidence-bridge, unified-gate, safety-gate, and LLM/template formatting. Confidence from the orchestrator metadata is authoritative on these branches.

## Files to change

```text
supabase/functions/ai-agriculture-chat/index.ts                    (broaden short-circuit detection + bypass)
supabase/functions/ai-agriculture-chat/decision/response-generator.ts  (placeholder guard)
tests/chat/short-circuit-bypass.test.ts                            (NEW — regression cases)
mem://index.md                                                     (core rule)
mem://architecture/orchestrator-short-circuit-bypass-contract.md   (NEW — detailed contract)
```

No DB migration, no orchestrator changes, no engine changes — the engine output and short-circuit payloads are already correct; the wrapper just has to honor them.

## Validation

1. Replay the Marathi NO_ACTIVE_CROP trace — assert response starts with `🌱`, mentions `गहू`, confidence = 1.0, no `{symptom}` leak.
2. Replay a Hindi "अगली फसल क्या लगाऊं?" trace after wheat harvest — assert response names cotton or soybean and `actions_returned[0].rule_id` matches `CROT_AFTER_WHEAT_*`.
3. Re-run `tests/chat/next-crop-recommendation-routing.test.ts` (33 cases) — must still pass.
4. Verify edge logs no longer show `"AFTER FILTERING: 0 actions"` followed by `"Using LLM formatter"` for short-circuit traces.
