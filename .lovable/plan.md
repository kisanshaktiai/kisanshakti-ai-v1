
## Root cause map (from log + code trace)

### Bug A — URGENT_ACTION → DIAGNOSTIC_ESCALATION → no_action_needed
**File:** `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts`
**Function:** `runUnifiedDecisionGate` — Gate 5 ("Young Crop Protection"), lines **595–696**

Trace:
1. `index.ts` runs Decision Brain → returns `PROACTIVE_FLOOD_PREPAREDNESS_001`, `URGENT_ACTION`, conf=74, treatments=true.
2. Result is passed into `runUnifiedDecisionGate`. At L599 `checkIfYoungCrop(stage, DAS=13, rice)` returns **true** (NURSERY/13 DAS).
3. At L605 `hasConfirmedPestOrDisease(symbolic_decision)` returns **false** — a *proactive flood* rule is not a pest/disease, so the gate treats it as "no diagnosis".
4. `input.confirmed_observation_has_safe_rule` is false (orchestrator only precomputes this for pest/disease observation rules, not proactive weather rules), so bypass at L618 is skipped.
5. L650–696: because `symptom_keys` exist ("not emerged"), gate forces `GateStatus.PARTIAL` + `ResponseMode.DIAGNOSTIC_ESCALATION`, throwing away the SUCCESS payload from the brain.
6. `index.ts` L1843–1868 honors that mode and rewrites `orchestratorResponse.type = 'DIAGNOSTIC_ESCALATION'`.
7. `index.ts` L2522–2546 then writes `session_decision_state = 'no_action_needed'` because the response now carries 0 actions.

**This is the suppression site.** Gate 5 was written for pest/disease young-crop protection but currently swallows *all* proactive rules (flood, drought, frost, irrigation, sowing) just because the brain's primary decision isn't a CONFIRMED_PEST/DISEASE.

**Fix (production-safe):**
- In `unified-decision-gate.ts` add an early bypass at the top of Gate 5 (before L612):
  - If `symbolic_decision.primary_decision?.urgency_level === 'URGENT_ACTION'` **and** `hasTreatmentActions === true` **and** `symbolic_decision.primary_decision.decision_authority` is one of `WEATHER | CLIMATE | PROACTIVE | IRRIGATION | LAND` — return `GateStatus.PASS` / `ResponseMode.RECOMMENDATION` and forward the brain's products/dosages.
  - Reason string: `bypass:proactive_urgent_rule rule=<rule_id>`.
- Extend `hasConfirmedPestOrDisease` (or add `hasConfirmedActionableRule`) to also return true when `rule.category` starts with `PROACTIVE_` or `rule.farmer_safety_level === 'SAFE'` AND `confidence >= 70`.
- In `index.ts` (≈L1843), guard the `DIAGNOSTIC_ESCALATION` rewrite with `if (unifiedGateResult.bypass_reason?.startsWith('bypass:') === false)` so future bypasses cannot be overwritten.
- In `index.ts` (≈L2522–2546), do not coerce to `no_action_needed` when `rawDecisionOutput.primary_decision?.urgency_level === 'URGENT_ACTION'`; set `awaiting_clarification` only when symptoms exist *and* primary decision is null.

### Bug B — Stage drift NURSERY → TILLERING → ACTIVE_TILLERING
**Authority order today (wrong):**
```
resolveCropTimeline (NURSERY, DAS=13)   ← SSOT, stage_source='crop_stage_master'
   ↓
canonical-state-builder.ts L530-537     ← keyword regex still maps "tiller/फुटवा" → TILLERING
   ↓
gdd-phenology-engine.ts L141,247,428    ← hard-codes TILLERING / ACTIVE_TILLERING when GDD>threshold,
                                          overwriting SSOT regardless of stage_source
   ↓
crop-calendar-lookup.ts L83/153/211/235 ← second lookup returns TILLERING for any rice rule scan
```

**Fix:**
- In `agents/canonical-state-builder.ts`: when incoming `timeline.stage_source === 'crop_stage_master'`, **skip** the keyword regex normalization block (L520–560) entirely and return `timeline.stage` verbatim. Add invariant log: `[StageAuthority] LOCKED stage=<x> source=SSOT`.
- In `agents/gdd-phenology-engine.ts`: top of `inferStageFromGDD` (around L100), early-return the incoming SSOT stage when `stage_source === 'crop_stage_master'`. The GDD engine becomes advisory only — never overrides SSOT.
- In `decision/crop-calendar-lookup.ts`: callers must pass `effective_stage` from SSOT; remove the implicit "TILLERING default" branches at L83/L153/L235 — replace with `stage ?? input.stage_from_ssot`.
- In `decision/unified-decision-gate.ts` L599–608: pass `stage_source` through and refuse to call `checkIfYoungCrop` with a stage that disagrees with SSOT — throw `STAGE_AUTHORITY_VIOLATION` to logs and use SSOT value.

### Bug C — Hypothesis fabricated without observation evidence
"Hard soil crust formed after rain blocks seedling emergence" diagnosis appears with **0 semantic_mapped, 6 synthetic**.

**Files:**
- `agents/observation-extractor.ts` — synthetic-observation injector (search for `synthetic: true` / `source: 'synthetic'`).
- `decision/hypothesis-evaluator.ts` — currently accepts synthetic obs as evidence.
- `agents/observation-wiring.ts` (if present in repo) — wiring stage that turns ranked symptom keys into observation rows.

**Fix:**
- In `observation-extractor.ts`: gate synthetic injection behind `if (semantic_mapped.length === 0 && allow_synthetic_fallback === true)`; default `allow_synthetic_fallback = false`. Log every synthetic obs with `{code, source:'synthetic', reason, confidence}`.
- In `hypothesis-evaluator.ts`: when evaluating hypothesis conditions, **require ≥1 non-synthetic observation** to mark a hypothesis CONFIRMED. Synthetic obs may only contribute to CANDIDATE list, never to CONFIRMED.
- Add unit assertion in `decision/observation-rule-lookup.ts` that drops rule matches whose `required_observation_codes` are satisfied *only* by synthetic codes.

### Bug D — Authority Resolver returns NONE for valid proactive rule
**File:** `decision/authority-resolver.ts`
The resolver only marks `authority` non-NONE when the symbolic decision has a confirmed pest/disease/nutrient code. Proactive weather rules (flood/drought) fall through to `DecisionAuthority.NONE`, which is why log shows `Authority Resolved=false` despite conf=74.

**Fix:**
- Add explicit case: if `rule.category` ∈ {`PROACTIVE_WEATHER`,`PROACTIVE_IRRIGATION`,`PROACTIVE_CLIMATE`} → `authority = DecisionAuthority.WEATHER`, `treatments_allowed = rule.has_treatment_actions`.
- Re-export updated authority via Gate 2 so L439 sees `authority !== NONE`.

## State-transition diagram (after fix)

```text
Brain.success (URGENT_ACTION, conf=74, actions=[...])
   │
   ├─► AuthorityResolver
   │      old: NONE  →  new: WEATHER (rule.category=PROACTIVE_*)
   │
   ├─► UnifiedGate Gate2: authorityResolved=true, blocksCrop=false → continue
   │
   ├─► UnifiedGate Gate5 (Young Crop):
   │      isYoungCrop=true, but NEW bypass:
   │      urgency=URGENT_ACTION + actionable + authority=WEATHER  ⇒ PASS
   │
   ├─► Response builder: RECOMMENDATION (rule.action_text)
   │
   └─► session_decision_state = 'action_recommended'
```

## Files to change

1. `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` — Gate 5 proactive bypass + `hasConfirmedActionableRule`.
2. `supabase/functions/ai-agriculture-chat/decision/authority-resolver.ts` — PROACTIVE_* → WEATHER authority.
3. `supabase/functions/ai-agriculture-chat/index.ts` — respect bypass; don't coerce `no_action_needed` when URGENT_ACTION.
4. `supabase/functions/ai-agriculture-chat/agents/canonical-state-builder.ts` — SSOT lock, skip keyword regex when stage_source='crop_stage_master'.
5. `supabase/functions/ai-agriculture-chat/agents/gdd-phenology-engine.ts` — SSOT short-circuit; GDD becomes advisory.
6. `supabase/functions/ai-agriculture-chat/decision/crop-calendar-lookup.ts` — remove implicit TILLERING defaults; require stage param.
7. `supabase/functions/ai-agriculture-chat/agents/observation-extractor.ts` — disable synthetic obs by default + structured log.
8. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` — synthetic obs cannot CONFIRM a hypothesis.
9. `supabase/functions/ai-agriculture-chat/decision/observation-rule-lookup.ts` — drop matches satisfied only by synthetic codes.

## Out of scope / invariants kept
- No DB schema changes. `crop_stage_master` remains sole stage authority.
- Decision Brain output untouched; we only stop downstream layers from overwriting it.
- No LLM-generated agronomy; synthetic-obs hypotheses are demoted, not deleted, so audit trail remains.

## Verification
- Replay the failing session: expect `response_mode=RECOMMENDATION`, `session_decision_state=action_recommended`, stage rendered = NURSERY everywhere.
- Add regression test in `_tests/`: rice DAS=13 + "not emerged" + proactive flood rule → asserts no DIAGNOSTIC_ESCALATION and stage===NURSERY across canonical context, survival matrix, and rule filtering.
- Add log assertion: any `[StageAuthority] LOCKED` must precede every downstream `stage=` log line in the same request.
