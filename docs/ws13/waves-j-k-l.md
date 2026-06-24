# WS13 — Waves J + K + L

> Re-materialised 2026-06-22 from prior session summary.

## Wave J — Per-emission-site tagging + intent-lock bypass
- New file `supabase/functions/ai-agriculture-chat/utils/clarification-site-tag.ts` defines the 12-site registry (`CLARIFICATION_SITES`).
- Every clarification emission in `orchestrator.ts` now stamps `metadata.clarification_site` at the point of emission.
- New bypass `WAVE_J_INTENT_LOCK_BYPASS` at `orchestrator.ts` L7804–L7843:
  - Trigger: intent classifier confidence `< 0.6` **AND** `≥ 1` symbolic rule has already matched on observation evidence.
  - Action: skip the intent-lock filter and forward to the decision brain.
  - Telemetry: pushes `WAVE_J_INTENT_LOCK_BYPASS` into `agents_used`.

## Wave K — Site dispositions map
- `SITE_DISPOSITIONS` map in `clarification-site-tag.ts` classifies each of the 12 emission sites as one of:
  - `INTENTIONAL_DIFFERENTIAL` — diagnosis-first generator, multimatch competition, diagnostic-state next question
  - `INTENTIONAL_FOLLOWUP` — hard-gate option reminder, dynamic options (reclassified in Wave M)
  - `INTENTIONAL_GATE` — stage clarification, location invariant, g2 completeness
  - `DEFECT_SUSPECT` — mandatory fallback obs, NLU low confidence, intent-lock-all-filtered
- View `v_ai_clarification_attribution_90d` rebuilt to surface this disposition.

## Wave L — Retroactive backfill
- Migration `20260622191926_…` backfilled all 42 historical `pre_brain_clarification` rows that lacked Wave-J tagging:
  - `clarification_site = 'orch.intent_lock_all_filtered'`
  - `clarification_site_disposition = 'DEFECT_SUSPECT'`
  - `clarification_site_attribution_method = 'wave_l_retroactive_elimination_v1'`
- Elimination reasoning: the 42 rows had **zero** `diagnosisFirstMode`, `clarification_scope`, `selectionType`, `orchestrator_subtype` metadata — ruling out `DIAGNOSIS_FIRST_OPTIONS` and `DYNAMIC_OPTIONS`. By elimination across the 12-site registry, the dominant emitter was `orch.intent_lock_all_filtered` — exactly the site Wave J's bypass neutralises going forward.

## Post-L attribution snapshot
| Origin | Site | Disposition | Turns |
|---|---|---|---|
| `pre_brain_clarification` | `orch.intent_lock_all_filtered` | DEFECT_SUSPECT | 42 |
| `pre_rule_clarification` | `untagged` | UNKNOWN | 28 |
