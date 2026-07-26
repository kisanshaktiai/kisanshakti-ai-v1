---
name: assertion_strength is a weight, never a filter
description: IOM assertion_strength must weight evidence via evidence-confidence.ts, never exclude rows via SQL; all symbolic codes fold through utils/canonical-code.ts.
type: constraint
---
**2026-07-26 forensic audit (F1/F2/F3).**

## F1 — assertion_strength must NEVER be a SQL exclusion gate
`intent_observation_mapping` holds 13,594 active rows: DIFFERENTIAL 13,245 / LITERAL 208 / STRONG_HYPOTHESIS 141. Two live sites used `.eq('assertion_strength','LITERAL')` and made 98.5% of curated agronomy invisible to the graph:
- `decision/concept-bridge.ts` (LITERAL-peer resolution)
- `agents/orchestrator.ts` (zero-observation `[INTENT_IOM_FALLBACK]`)

Both filters are DELETED. Strength is now an **ordering weight** consumed by `decision/evidence-confidence.ts::scoreEvidenceSet`. Injection is bounded by `system_config.evidence_iom_fallback_max_inject` (default 12), never by strength.

Enum values are `LITERAL | STRONG_HYPOTHESIS | DIFFERENTIAL`. `'STRONG'` does not exist — any code or comment referencing it is a bug.

**Forbidden pattern:** `.eq('assertion_strength', …)` / `.in('assertion_strength', …)` anywhere under `supabase/functions/ai-agriculture-chat/**`.

## Two distinct confidence stages — do not merge
1. **Evidence confidence** (`decision/evidence-confidence.ts`) — runs AFTER intent→observation mapping, BEFORE hypothesis competition. Inputs: `assertion_strength`, `confidence_rank`, `observation_master.is_diagnostic`, evidence source. Weights live in `system_config` (`evidence_weight_*`).
2. **Decision confidence** (`decision/confidence-calculator.ts`) — runs AFTER a diagnosis is selected. Calibrates how strongly to present advice. It must NOT read `assertion_strength`.

## F2 — stage families come only from crop_stage_graph
Hardcoded `STAGE_SYNONYMS` / `STAGE_SYNONYM_GROUPS` maps were deleted from `decision/iom-gate.ts` and `agents/canonical-observation-loader.ts`. Both now call `utils/stage-knowledge-cache.ts::getStageFamilyFromDB(crop, stage)`. Cache miss degrades to `[stage,'all']` and logs `[IOM_GATE_STAGE_MISS]` / `[CANON_LOADER_STAGE_MISS]` — NEVER a static family.

## F3 — one normalizer: utils/canonical-code.ts
`canonicalObsCode` (lower_snake), `canonicalIntentCode` (UPPER_SNAKE), `canonicalCropCode`, `canonicalStageKey`. DB stores observation/crop/stage/canonical_group codes in lower_snake_case. Ad-hoc `toUpperCase().replace(/[\s-]/g,'_')` folds silently broke rule matching and are removed from `symbolic-reasoner.ts`, `layered-rule-evaluator.ts`, `iom-gate.ts`, `observation-mapping-cache.ts`. Every new comparison site must fold BOTH sides through this SSOT.

**Traces:** `[INTENT_IOM_FALLBACK] … candidates=N cap=M injected=[code@score,…]`, `[IOM_GATE_STAGE_MISS]`, `[CANON_LOADER_STAGE_MISS]`.
