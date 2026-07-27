## Verified current state

Confirmed by reads/queries this turn:

- `crop_stage_master` for rice holds **two distinct lanes**: `direct_seeded` (10 stages, seedling → early_vegetative → tillering …) and `transplanted` (11 stages, nursery → transplanting → transplant_establishment → tillering …), plus one shared `any` row (germination).
- `crop_stage_graph` **has a `cultivation_method` column** and all 21 rice edges are lane-tagged (10 direct_seeded, 11 transplanted).
- `utils/stage-knowledge-cache.ts` builds its adjacency map keyed only by `crop|stage` and **ignores `cultivation_method` entirely** (it doesn't even select the column). So DSR and transplanted timelines are merged into one family — `transplanting` becomes a neighbour of stages that only exist on the DSR path, and vice-versa.
- `utils/stage-normalizer.ts` still contains hardcoded agronomy: `SEEDLING_STAGES`, `PRE_SOWING_STAGES`, `VEGETATIVE_STAGES`, `REPRODUCTIVE_STAGES`, `MATURITY_STAGES`, plus `getStageQueryVariants()` which hand-expands categories into stage lists, `areStagesCompatible()` and `calculateStageRelevanceScore()` which score via those lists. These duplicate `crop_stage_graph`.
- `getStageRow(crop, stage)` returns a single row per `crop|stage`, so for rice `tillering` it silently returns whichever lane loaded last.
- `runtime/stage-family-shim.ts` is already DB-only (hardcoded families removed) but has no method dimension.
- `decision/hypothesis-evaluator.ts` consumes `getStageQueryVariants` and `calculateStageRelevanceScore` without passing crop, so it never reaches the DB path.
- `runtime/phenology-reconciler.ts` and `agents/biological-state.ts` already handle `cultivation_method` correctly — they're the source of the active lane.

## Changes (minimal, no new tables, no crop-specific conditions)

### 1. `utils/stage-knowledge-cache.ts` — lane-aware SSOT
- Select `cultivation_method` from `crop_stage_graph`; key adjacency as `crop|method|stage`.
- Add a per-request `activeCultivationMethod` (`setActiveCultivationMethod` / `getActiveCultivationMethod`) so call sites don't need signature changes.
- Lane matching rule (same as the existing SQL resolver): a row qualifies iff its method equals the active lane or is `any`; `NULL` never matches.
- `getStageFamilyFromDB(crop, stage, method?)` and `stagesEquivalentFromDB(crop, a, b, method?)` filter by lane, defaulting to the active lane.
- `getStageRow(crop, stage, method?)` prefers the exact-lane row, then `any`, then null.
- `getStageByDAS` defaults its method argument to the active lane instead of legacy first-hit.

### 2. `agents/biological-state.ts` — publish the lane
At lock time (where `cultivationMethod` is already computed) call `setActiveCultivationMethod(...)` so every downstream stage read resolves on the correct timeline. One line, no logic change.

### 3. `runtime/stage-family-shim.ts` — pass the method through
`stageFamily(stage, crop, method?)` and `stagesEquivalent(a, b, crop, method?)` forward the optional method to the cache; omitted → active lane. Existing 2-arg callers keep working.

### 4. `utils/stage-normalizer.ts` — delete duplicated agronomy
- Remove `SEEDLING_STAGES`, `PRE_SOWING_STAGES`, `VEGETATIVE_STAGES`, `REPRODUCTIVE_STAGES`, `MATURITY_STAGES`.
- `getStageCategory(stage, crop?)` → DB only; `UNKNOWN` on miss (log `[STAGE_SSOT] result=MISS`), no static-list fallback.
- `getStageQueryVariants(stage, crop?)` → normalized stage + DB family from `crop_stage_graph` + `all`/`*`; no category expansion.
- `areStagesCompatible(a, b, crop?)` → delegates to `stagesEquivalent`.
- `calculateStageRelevanceScore(stages, current, crop?)` → 1.0 exact, 0.8 DB-family, 0.5 wildcard, 0.1 otherwise; substring guessing removed.
- `normalizeStageForDB` / `STAGE_DB_MAP` stay (string canonicalization, not agronomy).

### 5. `decision/hypothesis-evaluator.ts` — feed crop context in
Pass `crop_code` into `getStageQueryVariants` and `calculateStageRelevance` so the DB path is actually reachable.

## Verification
- Redeploy `ai-agriculture-chat`; confirm boot log shows `crop_stage_graph edges=…` and per-turn `[STAGE_LANE] active_cultivation_method=…`.
- Run a transplanted-rice turn: `stageFamily('tillering','rice')` must return only transplanted neighbours (`transplant_establishment`, `panicle_initiation`) and must **not** include `early_vegetative`; a DSR turn must return `early_vegetative`/`panicle_initiation` and never `transplanting`.
- Grep to confirm zero remaining hardcoded stage lists outside the DB readers.

## Not in scope
No new tables, no crop-specific branches, no changes to `phenology-reconciler.ts` or the SQL resolver (already lane-correct), no changes to decision/rule semantics beyond removing the duplicated stage scoring.
