
Audit verdict (from latest logs + code):
1) Pipeline reaches symbolic path correctly:
- Intent locked to STEM_DAMAGE
- Symptoms enriched to 10+ codes (DEAD_HEART, STEM_BORING, BORER_DAMAGE, STEM_HOLES, etc.)
- Canonical state built (SUGARCANE, TILLERING, DAS 85)
- Prescription Gate override triggered (strong evidence)
2) But final response still becomes:
- rule_id=INVARIANT_FALLBACK
- action_type=MONITOR_ONLY
- “Insufficient information…”
So the break is post-rule-evaluation, during decision recovery/formatting handoff.

Critical bug(s) to fix:
A) Index recovery reads matched responses with an unsafe fallback chain:
- `rawDecisionOutput.matched_responses || rawDecisionOutput.layered_rule_result?.matched_responses || []`
- If `matched_responses` is an empty array, it is truthy, so layered responses are ignored.
- This can produce “no eligible responses” and force INVARIANT_FALLBACK even when rules fired.

B) Eligibility mismatch across modules:
- `layered-rule-evaluator.ts` allows primary eligibility from action_text OR i18n_key OR reason_text OR knowledge_text.
- `index.ts` recovery currently checks only action_text OR i18n_key.
- Result: valid rule content can be dropped in index, causing false fallback.

C) Confidence-gate linkage drift:
- Layered evaluator has static `CONFIDENCE_GATE_THRESHOLD=0.60`.
- PrescriptionGate override (“LOW confidence overridden due strong symptom evidence”) is not explicitly wired into this threshold in layered primary selection.
- This can nullify primary decision after safety override is already granted.

D) Symptom prioritization bug (diagnostic quality regression):
- Canonical symptom shown as HOLES_IN_LEAVES while stem-borer-specific evidence exists.
- This weakens pest-specific scoring/rule ranking in edge cases and contributes to low confidence behavior.

Implementation plan (production hotfix + hardening):
Phase 1 — Stop false fallback immediately
1. index.ts:
- Replace matched response selection with strict helper:
  - Use `rawDecisionOutput.matched_responses` only if `Array.isArray(...) && length > 0`
  - Else use `rawDecisionOutput.layered_rule_result?.matched_responses` when non-empty.
- Align eligibility predicate with layered evaluator:
  - accept `action_text || i18n_key || reason_text || knowledge_text`.
- Extend recovery to run for decision statuses beyond SUCCESS/PARTIAL (e.g. DIAGNOSIS_COMPLETE/OBSERVATION_PROVIDED), not only two statuses.

2. index.ts observability:
- Add structured log block before INVARIANT_FALLBACK:
  - status, primary decision fields, raw matched count, layered matched count, eligible count, first 5 rule_ids.
- This makes future forensic debugging deterministic.

Phase 2 — Restore confidence/prescription consistency
3. layered-rule-evaluator.ts:
- Introduce override-aware confidence gate:
  - pass prescription override signal into evaluator options
  - when override=true, relax pre-selection threshold (e.g. 0.60 → 0.40) per policy.
- Log both base threshold and effective threshold for traceability.

4. orchestrator.ts → layered evaluator call:
- Pass override context from PrescriptionGate result into `evaluateRulesLayered(...)`.

Phase 3 — Improve symbolic diagnosis quality
5. canonical symptom prioritization:
- Add ranked symptom selection for biotic stem damage:
  - STEM_BORING_MARKS / DEAD_HEART / BORER_DAMAGE / STEM_HOLES outrank generic HOLES_IN_LEAVES.
- Keep full observation set unchanged, but ensure primary symptom used for diagnosis is biologically specific.

Phase 4 — Production-grade validation
6. Add deterministic regression tests (edge function tests):
- Case: “ऊसाच्या खोडात छिद्र पडली आहेत”, crop=SUGARCANE, stage=TILLERING, DAS~85.
- Assertions:
  - response must NOT use INVARIANT_FALLBACK
  - primary_decision.rule_id != INVARIANT_FALLBACK
  - matched_responses count > 0 at index recovery step
  - response contains structured deterministic sections (problem/action/safety; dosage if confidence gate permits)
  - no LLM-generated product/dosage outside rule data.

7. Data validation SQL checks (read-only audit in deployment checklist):
- confirm active sugarcane stem-borer rule rows have non-empty `action_type` + one of (`action_text`,`reason_text`,`knowledge_text`,`i18n_key`).
- confirm stage_applicable includes TILLERING for relevant borer rules.

Files to update:
- supabase/functions/ai-agriculture-chat/index.ts
- supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts
- supabase/functions/ai-agriculture-chat/agents/orchestrator.ts
- (tests) supabase/functions/ai-agriculture-chat/*_test.ts

Expected outcome after fix:
- Same farmer query should resolve to a symbolic rule-backed recommendation path (or explicit CLARIFY if truly below threshold), not generic monitor fallback.
- Decision output and displayed response will remain deterministic, database-sourced, and aligned with 2030 safety principles.
