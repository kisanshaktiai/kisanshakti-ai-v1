# WS13 — Wave H — Crop Canonical Realign

> Re-materialised 2026-06-22 from prior session summary.

## Problem
`crop_context.crop_id` and `crop_context.crop_name` drifted between user-uploads, land selection, and inferred crop. The attribution view bucketed many `DEFECT_SUSPECT` rows as `crop=unknown` when in fact a crop was resolved upstream but not propagated into the assistant message metadata.

## Fix
- Single canonical crop resolution chain enforced (per `mem://logic/land-context-resolution-chain`).
- `metadata.crop_context` now always written at the orchestrator entry point so all downstream classification carries a stable crop identity.
- Crop synonym + multilingual alias detection (`mem://logic/multilingual-crop-synonym-detection`) verified for 8 languages.

## Validation
- The remaining `crop_context=unknown` rows in `v_ai_clarification_attribution_90d` are now genuinely crop-less inputs (greetings, generic questions), not propagation defects.

## Related memory
- `mem://intelligence/crop-context-authoritative-lock`
- `mem://logic/land-context-resolution-chain`
