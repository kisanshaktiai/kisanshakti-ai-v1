---
name: Stage Graph DB SSOT + Cultivation Lane
description: Stage category/adjacency/compatibility come only from crop_stage_master + crop_stage_graph, scoped by cultivation_method lane.
type: feature
---

`utils/stage-normalizer.ts` has NO hardcoded stage lists (SEEDLING/VEGETATIVE/REPRODUCTIVE/MATURITY/PRE_SOWING deleted, 2026-07-27). Only `STAGE_DB_MAP` string canonicalization remains.

- `getStageCategory(stage, crop)` → DB only (`crop_stage_master`), `UNKNOWN` on miss.
- `getStageQueryVariants(stage, crop)` → canonical stage + DB family + `all`/`*`.
- `areStagesCompatible` / `calculateStageRelevanceScore(…, crop)` → `stagesEquivalent` from `runtime/stage-family-shim.ts` (1.0 exact · 0.8 DB family · 0.5 wildcard · 0.1 else).

**Cultivation lane:** `crop_stage_master` AND `crop_stage_graph` both carry `cultivation_method`. `utils/stage-knowledge-cache.ts` keys adjacency as `crop|method|stage` and exposes `setActiveCultivationMethod()` (called from `agents/biological-state.ts` at lock time, authority = `crop_schedules`). Lane rule: a row matches iff its method equals the active lane or is `any`; NULL NEVER matches. Direct-seeded and transplanted timelines must never merge — e.g. rice `tillering` neighbours `early_vegetative` (DSR) vs `transplant_establishment` (transplanted).
