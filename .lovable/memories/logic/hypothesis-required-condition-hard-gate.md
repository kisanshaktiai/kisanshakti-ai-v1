---
name: Hypothesis Required-Condition Hard Gate
description: hypothesis_conditions.is_required=true STAGE/DAS_RANGE rows are HARD eliminations in hypothesis-graph-evaluator, not soft penalties.
type: feature
---

`decision/hypothesis-graph-evaluator.ts` — when a `hypothesis_conditions` row has `condition_type IN ('STAGE','DAS_RANGE')` AND `is_required=true` AND the current context violates it, the hypothesis MUST be eliminated (pushed to `eliminated[]` with `eliminated_reason='REQUIRED_STAGE_FAILED(…)'` or `'REQUIRED_DAS_FAILED(…)'`) and NEVER surface as a candidate. Soft `is_required=false` rows continue to produce `STAGE_CONTEXT_CONFLICT`/`DAS_CONTEXT_CONFLICT` warnings with confidence penalty as before. Emit `[HYP_ELIMINATED] reason=REQUIRED_STAGE_FAILED|REQUIRED_DAS_FAILED hypothesis_id=… …` per elimination.

Also: `utils/stage-normalizer.ts` — `transplanting`, `planting`, `sowing`, `post_planting`, `pre_sowing` are NOT `SEEDLING_STAGES`. `transplanting` belongs to VEGETATIVE (post-germination). Never remap `transplanting → germination` in `STAGE_DB_MAP`.
