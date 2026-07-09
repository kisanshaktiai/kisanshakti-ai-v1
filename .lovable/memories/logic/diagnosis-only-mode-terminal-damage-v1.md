# Memory: logic/diagnosis-only-mode-terminal-damage-v2
Updated: 2026-07-09

**SUPERSEDED by OBSERVATION_STATE_CONTRACT + TERMINAL_DAMAGE_CONTRACT v2.0.0.**

Terminal damage observations (SEEDLING_DIED, PLANT_DIED, DEAD_HEART, TERMITE_DAMAGE, AFFECTED_PART_WHOLE, PATCHY_DAMAGE+SEVERITY_HIGH) now grant a **CROP-authority priority boost only**. They **DO NOT** bypass:
- the observation graph,
- clarification for zero-confirmed-observation diagnostic turns,
- OBS_TO_HYP evaluation.

Rationale: a terminal symptom (e.g. "plant died") has many possible causes (drought, seed rot, disease, chemical injury, pest). Skipping straight to `evaluateRules()` allowed the runtime to fabricate a diagnosis without evidence.

Rule (enforced in `agents/diagnostic-flow-controller.ts` @ terminal-damage branch and `runtime/observation-state.ts`):

```
if (terminalDamage) {
  session.__priority_boost = 'TERMINAL_DAMAGE';
  // fall through to GRAPH_GATE — do NOT return early
}
```

Farmer-extracted terminal codes (regex match on farmer's own text) satisfy the observation gate because they carry `ObservationAuthority.EXTRACTED`. Inferred / synthetic / alias-expanded terminal codes do NOT satisfy the gate.

Companion invariant: `HYPOTHESIS_INVARIANT_CONTRACT` — `diagnostic ∧ graph_ran ∧ hyp=0 ∧ observation_required=false` throws `GraphContractViolation` in dev and forces `observation_required=true` in prod.

Files:
- `supabase/functions/ai-agriculture-chat/agents/diagnostic-flow-controller.ts`
- `supabase/functions/ai-agriculture-chat/runtime/observation-state.ts`
- `supabase/functions/ai-agriculture-chat/runtime/graph-contracts.ts` (assertObservationRequiredWhenNoHypothesis)
- `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` (NO_CONFIRMED_OBSERVATIONS gate)
