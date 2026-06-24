# WS13 — Wave G — Multi-Match Competition Fix

> Re-materialised 2026-06-22 from prior session summary.

## Problem
When ≥2 rules fired with overlapping observation evidence, the orchestrator emitted a `CLARIFICATION_QUESTION` at site `orch.multimatch_competition` even though both hypotheses were valid differentials. The disposition was wrongly classified as DEFECT_SUSPECT.

## Fix
- Reclassified `orch.multimatch_competition` → `INTENTIONAL_DIFFERENTIAL` in `clarification-site-tag.ts` and in the `v_ai_clarification_attribution_90d` view CASE.
- Hypothesis arbitration retained — the clarification is by-design when `n_competing > 1` AND `top_confidence_gap < 0.15`.

## Validation
- Post-deploy 90-day window: 0 `orch.multimatch_competition` rows mis-classified as DEFECT.

## Related memory
- `mem://logic/diagnostic-gating-and-hypothesis-arbitration`
