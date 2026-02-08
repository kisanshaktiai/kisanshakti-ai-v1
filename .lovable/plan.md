
Goal
- Stop AI Chat from returning “fallback / monitoring only” responses after a farmer selects a clarification option, and ensure the decision brain’s rule-based answer is actually delivered to the UI.

What I already verified (from your recent /app/chat traffic + edge logs)
- The frontend is correctly sending the selected option with embedded routing markers, e.g.:
  - "🔍 सुरुवातीची खोड किडा [obs_keys:DEAD_HEART_PRESENT] ..."
- The edge function ai-agriculture-chat is receiving the selection and the option-selection handler runs:
  - Logs show ClarificationRebuild added symbol, clarification lock cleared, rules matched, primary decision built.
- Yet the farmer-visible response often becomes a generic monitoring-style message (what you’re calling “fallback”), even though rules fired and a primary decision exists.

Root causes (code-level, high confidence)
1) Unified Gate is blocking and forcing “OBSERVATION / monitoring” because it thinks this is a “young crop without confirmed diagnosis”
- unified-decision-gate.ts marks a crop as “young” if the growth stage is SEEDLING (stage check returns true immediately), even when days_since_sowing is high (e.g., 59 DAS).
- In the OPTION_SELECTED path, primary_decision.target is currently an empty object {} (no pest_code/disease_code/nutrient_deficiency), so hasConfirmedPestOrDisease() returns false.
- Result: Gate 5 triggers “YOUNG CROP PROTECTION → Observation only” and you get a monitoring response even after selection.

2) Suppression Guard isn’t receiving the real “actions/rules” so it cannot prevent recommendation drops
- index.ts currently builds symbolicDecisionForGuard using orchestratorResponse.metadata?.actionsReturned / rulesFired / matchedResponses.
- But in practice, the decision info lives under orchestratorResponse.decision_output.actions_returned and decision_output.matched_responses (not consistently mirrored into metadata).
- So suppression guard sees empty arrays and cannot “upgrade” the gate result even when actions exist.

3) Rule matching is vulnerable to “always-true” conditions_json objects (causes wrong primary decisions)
- bundled-rules/loader.ts evaluateConditionsJson() supports:
  - compound all/any
  - atomic {fact, operator, value}
  - a limited “simple object” format (crop_stage, observations, trigger_keywords)
- If the DB conditions_json contains other keys (example we observed: { soil_fe_ppm: "<4.5" }), the current implementation may treat it as “no recognized conditions” and default to match=true.
- That can produce incorrect matches (wrong primary decision), which then cascades into gate behavior and farmer-visible “fallback-like” messages.

Fix strategy (minimal risk, maximum impact, preserves your symbolic-brain invariants)
A) Fix the data contract used by the Unified Gate + Suppression Guard (index.ts)
- Change index.ts to build:
  - unifiedGateInput.symptom_keys from decision_output.symptom_keys (if present) and/or extracted from selected option metadata, not only orchestratorResponse.metadata.symptomKeys.
  - symbolicDecisionForGuard.rules_fired from decision_output.rules_applied (or layered_rule_result.rules_applied) instead of metadata-only.
  - symbolicDecisionForGuard.actions_returned from decision_output.actions_returned.
  - symbolicDecisionForGuard.matched_responses from decision_output.matched_responses.
- Outcome: the suppression guard can correctly detect “rules fired + actions exist” and prevent silent recommendation drops.

B) Fix “young crop” detection so it does not block valid 59-DAS sugarcane decisions
- Update unified-decision-gate.ts checkIfYoungCrop() logic:
  - Prioritize days_since_sowing when available:
    - If days_since_sowing > crop-specific YOUNG_CROP_MAX_DAYS (Sugarcane: 45), return false even if stage says SEEDLING.
  - Only fall back to stage-based “young” classification when days_since_sowing is missing/unknown.
- Outcome: stage labels won’t permanently trap the system in “young crop protection” mode.

C) Ensure OPTION_SELECTED path produces a “confirmed enough” diagnosis signal for gating (or equivalent safe signal)
- Update the OPTION_SELECTED primary_decision builder in agents/orchestrator.ts to populate target fields when possible:
  - If the query router/understanding layer already identified pest/disease/nutrient entity (we saw logs like Detected entities: {pest:"STEM_BORER"}), propagate that into primary_decision.target.pest_code.
  - If the matched rule clearly corresponds to a nutrient deficiency / pest group, set target.nutrient_deficiency / pest_code using a deterministic mapping (no LLM invention, no heuristics on language text).
- If we cannot reliably populate target for certain rules, we will still rely on (A) + (B) so that “actions_returned exists” can keep the system from degrading to generic monitoring.

D) Harden conditions_json evaluation to stop “unknown keys → match all”
- Modify bundled-rules/loader.ts evaluateConditionsJson():
  - If conditions is a non-empty object but has no recognized keys, do NOT default to true.
  - Treat unknown keys as conditions that must be evaluable; if missing from input, return false.
  - Add support for simple comparator strings like:
    - "<4.5", "<=10", ">34"
    - "between: 4-7" (if present in your DB)
  - This is a safety fix: better to return “no match” (and ask clarification) than to match a wrong agronomic rule.
- Also check SymbolicReasoner’s conditions_json evaluator for the same pattern (keep both evaluators consistent).

E) Add “forensic-grade” logging so we can confirm the fix immediately
- In index.ts, log and (optionally) attach to response metadata:
  - unified gate status, response_mode, young-crop decision, reason
  - counts: rules_applied, actions_returned length, matched_responses length
  - trace_id (already present)
- This will make future debugging deterministic (no guessing).

Files that will be changed (implementation)
- supabase/functions/ai-agriculture-chat/index.ts
  - Fix UnifiedGate input + suppression-guard symbolicDecision source fields (use decision_output as SSOT).
  - Add explicit logging around gate decisions and the “why”.
- supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts
  - Fix young-crop checkIfYoungCrop() prioritizing days_since_sowing.
  - (Optional) accept a “confirmed via explicit selection” safe flag if needed later.
- supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
  - Ensure OPTION_SELECTED primary_decision.target is populated when deterministically known.
- supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts
  - Harden evaluateConditionsJson() to avoid always-true matches for unknown condition objects.

How we will test (end-to-end, fast)
1) Reproduce in /app/chat (your same flow)
- Ask a crop issue → get clarification options → select one option.
- Confirm the response is not generic monitoring if rules/actions exist.
2) Verify edge logs show:
- Gate decision PASS with ResponseMode.TREATMENT (or a meaningful DIAGNOSTIC_ESCALATION) when rules/actions exist.
- Suppression guard activation only when appropriate.
3) Verify DB session state remains consistent:
- ai_chat_sessions.metadata.decision_tracking.decision_state transitions away from awaiting_clarification.
- pending_clarification_options cleared after selection.

Risk controls (agronomy + safety)
- We will not “force treatments” blindly.
- The gate will still block when genuinely unsafe or when diagnosis is truly unconfirmed; the fix is to stop false blocking caused by missing target fields, missing action/rule context, and overly strict “young crop” classification.

Stop point (per your TIME CRITICAL instruction)
- I’m stopping here without further tool calls.
- If you want me to proceed with the implementation immediately, send a new request like: “Continue and implement the fix for fallback after option selection”.