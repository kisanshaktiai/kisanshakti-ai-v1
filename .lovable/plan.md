# Root cause (confirmed from live edge logs `trace_mqnrkutj_5px0ec`)

The symbolic brain is now working end-to-end after the previous round of fixes — the rice DAS-13 turn produces:

```
✅ YOUNG CROP BYPASS — confirmed observation has SAFE rule (RICE_GERMINATION_RESOW_DECISION_001)
🚦 [UnifiedGate] ✅ PASS — Action: PROVIDE_OBSERVATION_ONLY — Response Mode: OBSERVATION
   Decision Confidence: 60
```

But the very next stage flips it back to a generic clarification:

```
🛡️ [SafetyGates] mode=CLARIFY conf=0.40 stageRej=0 foliarRej=0 ndviOK=false
🛡️ [SafetyGates] OVERRIDE=CLARIFY - downgrading unified gate to CLARIFY
   ⚠️ Unified gate blocked treatments - using CLARIFICATION response
   📋 Using unified gate fallback response (no LLM)
```

`runSafetyGates` (`decision/safety-gates.ts`, lines 244–301) caps confidence to 0.40 because `number_of_distinct_observations < 2` and `!photo_present`, then `cappedConf (0.40) < 0.45` triggers `mustClarify` and force-flips `override_mode = CLARIFY`. The orchestrator (`index.ts` lines 1791–1801) then unconditionally honors that override and clobbers the unified gate's `PROVIDE_OBSERVATION_ONLY` decision, even though:

- The matched rule is `farmer_safety_level=SAFE`.
- The response mode is `OBSERVATION` (no chemical, no spray, no dosage being dispensed).
- The unified gate already enforces stage + authority + young-crop protection.

This single guardrail collision is why every "भात अद्याप उगवले नाही" turn ends in a clarification instead of the resow decision. None of the other 7-priority roadmap items are firing in this trace — they were already addressed in the prior round.

# Fix — single-phase, two minimal edits

Honor the unified-gate SAFE-rule bypass inside safety-gates without disabling any actual safety check. Safety-gates must still run (audit invariant from project memory), still capture the confidence caps, and still BLOCK on real safety failures (foliar reject, K-contradiction, NDVI anomaly on nutrient diagnosis). It must NOT force CLARIFY purely on low-confidence when the upstream decision is an OBSERVATION-mode SAFE rule.

### 1. `supabase/functions/ai-agriculture-chat/decision/safety-gates.ts`

- Extend `SafetyGateInput` with two optional inputs the orchestrator already has:
  - `confirmed_safe_rule_bypass?: boolean`
  - `response_mode?: 'OBSERVATION' | 'CLARIFICATION' | 'DIAGNOSTIC_ESCALATION' | 'FULL_TREATMENT' | string`
- In `runSafetyGates`, after computing `mustClarify`, add a guard:
  - If `confirmed_safe_rule_bypass === true` OR `response_mode === 'OBSERVATION'`, then suppress the `cappedConf < 0.45` clarify trigger. Keep the hard safety triggers (`contradicted`, `ndviAnomalous && DEFICIENCY_CATEGORIES`, `lowSpecSymptom`, `foliarRejects`) — those still force CLARIFY/BLOCK as before.
  - Set `override_mode = 'NONE'` in that branch and write `CLARIFICATION_GATE.reason = 'Bypassed: unified gate confirmed SAFE rule (OBSERVATION mode)'`.
- Keep `effective_confidence` and `gate_decisions` populated so the audit row in `ai_chat_audit_logs.gate_decisions` is unchanged.

### 2. `supabase/functions/ai-agriculture-chat/index.ts` (around lines 1767–1801)

- When building `safetyInput`, pass through the two new fields from `unifiedGateResult`:
  - `confirmed_safe_rule_bypass: typeof unifiedGateResult.reason === 'string' && unifiedGateResult.reason.startsWith('bypass:confirmed_safe_rule_exists')`
  - `response_mode: unifiedGateResult.response_mode`
- No change to the downgrade logic itself — once safety-gates returns `override_mode === 'NONE'` for the bypass path, the existing `if (safetyGateResult.override_mode !== 'NONE')` branch is naturally skipped and the OBSERVATION response flows through.

# What is intentionally NOT changing

- Unified decision gate, hypothesis evaluator, canonical group filter, loader, intent classifier, communication generator, clarification scope resolver — the current live trace shows them all behaving correctly. No edits.
- All other safety triggers (foliar, contradiction, NDVI-vs-nutrient, low-discriminator symptom) keep their current force-CLARIFY/BLOCK behavior. The bypass is scoped exclusively to the "low confidence alone" path on an already-confirmed SAFE OBSERVATION rule.
- Safety-gates is still called on every turn — the audit invariant from `mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates` is preserved.

# Verification after the edit

1. Re-run "भात अद्याप उगवले नाही" on the rice DAS-12 land. Expect logs:
   - `🛡️ [SafetyGates ...] mode=NONE conf=0.40 ...`
   - No `OVERRIDE=CLARIFY` warning.
   - Response uses `RICE_GERMINATION_RESOW_DECISION_001` action text in Marathi instead of the generic differential question.
2. Re-run a known unsafe scenario (e.g. K-deficiency on HIGH-K soil, or foliar reject) → expect safety-gates to still force CLARIFY/BLOCK exactly as today.
3. Check `ai_chat_audit_logs.gate_decisions` row for both turns — caps and reasons are still recorded.

# Memory update (after the fix lands)

Append one line to `mem://index.md` Core:

> Safety-gates MUST NOT force CLARIFY purely on low-confidence (`cappedConf < 0.45`) when the unified gate took the `bypass:confirmed_safe_rule_exists` path or `response_mode === 'OBSERVATION'`. Hard safety triggers (foliar, contradiction, NDVI-vs-nutrient, low discriminator) still apply.
