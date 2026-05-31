# Land-Specific Symbolic Chat – Forensic Audit & Fix Plan

## What the audit found

Test query (Marathi): "सध्या कोणते खत देवू आणि फवारणी घेवू ?" (which fertilizer / spray now?)
Live edge log shows the symbolic brain returned a disease-style clarification:
"🔍 What exactly are you observing? (Color change / Lumps / Drying)"

Trace evidence (from `ai-agriculture-chat` logs):
- Canonical context is correctly locked: `Crop=SUGARCANE, Stage=GRAND_GROWTH, DAS=154`.
- `UnderstandingChecker` scored 53% (threshold 60%) and set `clarification_required=true`.
- Pipeline returned `CLARIFICATION_QUESTION` via the **scope-aware clarification** path.
- No `[DIRECT_MODE]` log line ⇒ the FERTILIZER_NUTRITION advisory bypass never fired.

### Root causes (all in `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`)

1. **Advisory routes are not exempt from the Understanding-based clarification gate** (line ~3937).
   The earlier `ZERO_CODE_CLARIFICATION_GATE` (line 2438) correctly exempts `FERTILIZER_NUTRITION / IRRIGATION_SCHEDULING / WEATHER_SPRAY_TIMING / CROP_HEALTH / GENERAL_INFO`, but the Understanding gate has no such guard, so any advisory query with no symptom keywords (low score) falls through to "describe your symptoms".

2. **DIRECT-mode bypass depends only on `landContext?.current_crop`** (line ~2782).
   When the land record stores the crop under `crop_schedules.crop_name` (the canonical contract is built from that), `landContext.current_crop` can be null while `canonicalContext.crop` is valid. Bypass silently skips and the query falls into the symptom pipeline.

3. **Stale session `decision_state = awaiting_clarification`** carries across topic switches.
   Logs show `turn: 13, state: awaiting_clarification, clarification_active: true`. A fresh advisory question is still being treated as a follow-up to an earlier disease clarification, which biases NLU and forces low understanding scores.

4. **Query router result is not used to widen `symptomBasedIntents` detection.**
   When `queryRoute.route` is an advisory route, NLU's `intent_code` should not be treated as symptom-based even if observation-extractor produced "AFFECTED_PART_UNKNOWN" filler codes (seen in log: 7 codes, 4 unknowns).

## Fixes (surgical, scoped to orchestrator + session state)

### Fix 1 — Add advisory exemption to the Understanding clarification gate
File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~line 3937)

Reuse the same exempt set already declared for the Zero-Code Gate. Skip the gate when:
- `queryRoute.route ∈ {FERTILIZER_NUTRITION, IRRIGATION_SCHEDULING, WEATHER_SPRAY_TIMING, CROP_HEALTH, GENERAL_INFO}`, OR
- `bypassClarification === true`, OR
- intent metadata `clarification_mode === 'DIRECT'`.

When skipped, log `ADVISORY_ROUTE_BYPASS_UNDERSTANDING_GATE` so traces are auditable.

### Fix 2 — Strengthen `directModeBypass` crop-context check (~line 2782)
Change condition to OR-check both sources of truth:
`landContext?.current_crop || canonicalContext?.crop || landContext?.crop_schedule?.crop_name`.
This restores DIRECT mode for advisory routes whenever any layer of context knows the crop.

### Fix 3 — Reset stale clarification state on advisory-route turns
In the early session block (~line 1063 where `clarificationActive` is read):
- If `queryRoute.route` is in the advisory exempt set **and** the incoming farmerMessage does NOT match a pending clarification option, forcibly set `clarificationActive = false`, persist `decision_state = 'decision_in_progress'`, and log `STALE_CLARIFICATION_RESET`.
- This prevents NLU from interpreting "khat devu / favarni" as an answer to a prior pest question.

### Fix 4 — Treat advisory route as non-symptom intent in gates
Wherever `symptomBasedIntents` membership decides flow (Zero-Code Gate, Understanding gate, evidence-coverage gate at line 3573, scoped clarification call), AND together with `!isZeroCodeGateExempt`. Make this a single helper: `isAdvisoryRoute(queryRoute.route)` and reuse.

### Fix 5 — Verify STAGE_ADVISORY_FALLBACK still fires
Confirm `shouldUseStageAdvisoryFallback` at line 6417 will now be reachable for advisory routes that pass the new bypasses with zero rules matched — so farmer always gets a deterministic stage-based plan from `crop_stage_advisor.ts` instead of a clarification.

## DB / data validation (no schema changes)

Read-only checks against the production DB to confirm the symbolic brain has data to render:
- `crop_vocabulary` — confirm Marathi fertilizer phrases `खत`, `फवारणी`, `देवू` are present with `recommended_intent_bias ∈ {FERTILIZER_SCHEDULE, NUTRIENT_DEFICIENCY}`.
- `intent_metadata` — confirm `FERTILIZER_NUTRITION` / `FERTILIZER_SCHEDULE` rows have `clarification_mode = 'DIRECT'` and `requires_stage_context = false` (or stage available).
- `decision_rules` for sugarcane GRAND_GROWTH stage advisory rules (action_type IN ('fertilizer','spray','schedule')) — confirm at least one matches DAS=154.
- `crop_schedules` for the failing land — confirm `crop_name='SUGARCANE'` and active flag.

If any vocabulary or intent_metadata row is missing or wrong, the plan ends with read-only findings; we will request approval before any data write.

## Production-readiness checks (post-fix)

1. **Trace replay**: Re-run the failing Marathi query and verify log line `[DIRECT_MODE] route FERTILIZER_NUTRITION skips symptom clarification` and a `DECISION_PROVIDED` response with stage-based fertilizer recommendations.
2. **Regression net**: Re-run three known-good prompts (one disease report, one irrigation question, one greeting) and confirm each still routes correctly.
3. **Edge log audit**: Confirm new `STALE_CLARIFICATION_RESET` and `ADVISORY_ROUTE_BYPASS_UNDERSTANDING_GATE` markers appear only when expected.
4. **No code change outside `orchestrator.ts`** unless DB findings in step above prove otherwise. Symbolic brain contract, rule engine, and clarification generator stay untouched.

## Out of scope
- No changes to general-chat tab (separate edge function).
- No changes to NLU contract, rule engine, or LLM formatter.
- No DB migrations — only read-only audit; any data correction will be proposed back to you first.
