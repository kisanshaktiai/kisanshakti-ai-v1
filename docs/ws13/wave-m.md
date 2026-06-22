# WS13 — Wave M — Clarification Site Disposition Hardening

> Re-materialised 2026-06-22 from prior session summary.

## Three hardenings

### 1. `orch.nlu_low_confidence` — `WAVE_M_ZERO_CODE_BYPASS`
- `orchestrator.ts` L3204–L3224 — the `ZERO_CODE_GATE` previously checked only `mappedCodes`. It now also checks `expandedObservationCodes` and `candidateObservationCodes`.
- When DB intent resolution has already promoted ≥1 LITERAL or STRONG_HYPOTHESIS code, the orchestrator enters the symbolic brain instead of emitting a clarification.
- Telemetry: `WAVE_M_ZERO_CODE_BYPASS` pushed into `agents_used`.

### 2. `orch.dynamic_options` — reclassified `DEFECT_SUSPECT` → `INTENTIONAL_FOLLOWUP`
- `clarification-site-tag.ts` v1.2.0 (line 94).
- Reasoning: this site fires only inside the deferred-clarification branch where `totalRulesMatched === 0`. Asking for refinement at that point is a designed symbolic fallback, not a routing defect.
- View `v_ai_clarification_attribution_90d` rebuilt to match (migration `20260622193705_…`).

### 3. `orch.mandatory_fallback_observations` — instrumented
- `orchestrator.ts` L7636 — `WAVE_M_MANDATORY_FALLBACK_DIAG` warning captures `photo_success`, `photo_conf`, `photo_obs_count`, `expanded_obs` at the emission boundary.
- No bypass yet — held for Wave N once the diagnostic distribution is known.

## Post-deploy attribution
All 42 historical `DEFECT_SUSPECT` rows remain (pre-deploy, backfilled by Wave L). 28 `pre_rule_clarification` rows remain `UNKNOWN`. No new `DEFECT_SUSPECT` rows expected from `nlu_low_confidence` or `dynamic_options` under Wave M code.

## Files
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- `supabase/functions/ai-agriculture-chat/utils/clarification-site-tag.ts` (v1.2.0)
- `supabase/migrations/20260622193705_84d91c31-a1a3-4f83-a924-55a7f6a2056c.sql`
