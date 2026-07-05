
## Root cause (from audit)

The Decision Brain does reach the "needs farmer evidence" state, but two exit paths silently drop the observation payload and ship an English text-only message. The frontend contract requires `metadata.orchestrator_type === 'CLARIFICATION_QUESTION'` AND `metadata.options.length > 0` (see `src/components/chat/EnhancedAIChatInterface.tsx` L1775-1789). When either is missing the UI renders a plain assistant bubble — no `ClarificationOptionsUI`, no symptom checkboxes — which the farmer experiences as "the brain gave up".

Two concrete leak sites in `supabase/functions/ai-agriculture-chat/`:

1. **`index.ts` L3386-3388 → `generateNoRecommendationsFallback` (L3441)** — When a `DECISION_PROVIDED` response has neither a usable `FarmerCommunication` nor a `primary_decision`, we emit the English text *"…I need more information: 1. crop 2. stage 3. symptoms…"*. Type stays `DECISION_PROVIDED`, so the frontend never renders a picker. This is the exact fallback the farmer is seeing.

2. **`agents/orchestrator.ts`** — Several `CLARIFICATION_QUESTION` returns can ship with `question.options = []` (e.g. diagnosis-first path at L5298 when `diagnosisOptions` is empty; intent-mismatch at L8661). `transformOrchestratorResponse` (index.ts L4085-4120) then produces `metadata.options: []`, and the frontend's `isClarification && data.metadata?.options?.length` guard fails → text-only render.

There is already a working "observation SSOT loader" at `orchestrator.ts` L8504-8542 that pulls the top `observable_characteristics` from `decision_rules` and hydrates labels from `observation_translations`. We reuse it — no new agronomy code, no new LLM prompt, no rule/observation table changes.

## Fix — response-contract only

### 1. Extract the SSOT observation loader
In `agents/orchestrator.ts`, promote the inline block at L8504-8542 to a private method `loadObservationSelectorOptions(cropCode, growthStage, userLanguage)` returning `{value, label, observation_key, i18n_key}[]` (+ `PHOTO_REQUEST` as last option). No behaviour change — just makes it reusable.

### 2. Guarantee non-empty options on every `CLARIFICATION_QUESTION` return
Add a single helper `ensureObservationOptions(response, ctx)` invoked immediately before every `return { type: 'CLARIFICATION_QUESTION', … }` in `orchestrator.ts` (grep sites: L2741, 2949, 3428, 5298, 5661, 6641, 7711, 7806, 7917, 8548, 8661). Behaviour:
- If `response.question.options?.length > 0` → return unchanged.
- Else call `loadObservationSelectorOptions` and inject the result into `question.options` and `communication.options`.
- Stamp `metadata.orchestrator_type = 'CLARIFICATION_QUESTION'`, `metadata.selectionType = 'MULTIPLE_CHOICE'` (matches user's expected multi-symptom flow), `metadata.observation_source = 'DECISION_RULES_SSOT'`.

### 3. Convert the English "no recommendations" leak into a symptom picker
In `index.ts`:
- Delete the `generateNoRecommendationsFallback` call at L3388.
- Replace with: promote the response to `CLARIFICATION_QUESTION`, populate `question.options` via `loadObservationSelectorOptions` using `response.dataAudit.land` context, then re-run `transformOrchestratorResponse` for the CLARIFICATION branch. The English "I need more information" string is deleted entirely.
- Add trace log: `[OBSERVATION_REQUIRED_PROMOTED] trace=… reason=decision_provided_empty crop=… stage=… options=N`.

### 4. Fail-closed invariant
In `transformOrchestratorResponse` (index.ts L4065 CLARIFICATION_QUESTION branch), if `rawOptions.length === 0` after the fallback lookup, throw `OBSERVATION_CONTRACT_VIOLATION: empty_options trace=<id>` instead of returning a text-only response. The catch handler already surfaces `SYSTEM_ERROR` with a helpful message; this makes the leak impossible to ship silently and greppable in logs, matching the existing `GRAPH_PIPELINE_BYPASSED` pattern.

### 5. Trace parity with existing brain traces
In `runtime/brain-trace.ts`, extend `BrainTracePhases` with `observation_required?: boolean` and `observation_option_count?: number`, and log them in the single `[BRAIN_TRACE]` line so audits can grep `observation_required=true observation_option_count=N` alongside the existing `sequence=` counters. No new emitter — single-trace invariant preserved.

## What is NOT changed

- No edits to LLM prompts, `decision_rules`, `observation_master`, `intent_observation_mapping`, `hypothesis-evaluator.ts`, `hypothesis-graph-evaluator.ts`, or any agronomy table.
- No new hardcoded symptom lists — options always come from `decision_rules.observable_characteristics` + `observation_translations`.
- `ClarificationOptionsUI.tsx` and `EnhancedAIChatInterface.tsx` stay as-is; the existing frontend contract is already correct.
- Mandatory graph gate and 1→5 sequence assertions from the previous turn remain untouched.

## Verification

Query: `भात अजून उगवले नाही` and `उस खराब वाढ झाली आहे`.

Expected log:
```
[MANDATORY_GRAPH_GATE] … POST_EVIDENCE_FREEZE sequence=1 → … → sequence=5
[BRAIN_TRACE] … observation_required=true observation_option_count>=3
```
Response payload MUST have:
```
metadata.orchestrator_type === 'CLARIFICATION_QUESTION'
metadata.options.length >= 3
```
Forbidden forever: any response where farmer intent is diagnostic AND response text contains "I need more information" / "need more information" without accompanying `metadata.options`.

## Files touched

- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — extract `loadObservationSelectorOptions`, wrap every `CLARIFICATION_QUESTION` return with `ensureObservationOptions`.
- `supabase/functions/ai-agriculture-chat/index.ts` — replace `generateNoRecommendationsFallback` call with observation-selector promotion, add fail-closed invariant in `transformOrchestratorResponse`, delete the two English "I need more information" string branches at L3456/L3458.
- `supabase/functions/ai-agriculture-chat/runtime/brain-trace.ts` — extend trace fields for observability.
