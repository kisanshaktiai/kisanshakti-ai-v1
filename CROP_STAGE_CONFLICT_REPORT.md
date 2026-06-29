# `lands.crop_stage` vs `crop_stage_master` — Source & Conflict Report
_Read-only forensic. No code or DB changes._

## 1. Where `lands.crop_stage` is calculated and written

**Single producer (client-side, heuristic):**

| Layer | File | Evidence |
|---|---|---|
| UI calc | `src/lib/cropStage.ts` → `deriveCropCycle()` / `stageFromProgress()` | Maps `daysSinceSowing / durationDays` (a 0..1 ratio) onto a 7-bucket English label list: `Pre-sowing → Germination → Vegetative → Tillering / Branching → Flowering → Grand growth → Maturity`. |
| UI write | `src/components/land/SmartLandConfirmCard.tsx:242` | `crop_stage: cycle.stage !== '—' ? cycle.stage : undefined` — sends the raw label straight to `landsApi.createLand(...)`. |
| Transport | `src/services/landsApi.ts` (`crop_stage?: string`) → `supabase/functions/lands-api/index.ts` | `lands-api` performs **no normalization, no validation, no lookup against `crop_stage_master`** (`rg "stage" supabase/functions/lands-api/index.ts` → 0 hits). The value is persisted verbatim. |
| Result in DB | `SELECT DISTINCT crop_stage FROM lands` | Returns `"Germination"` (Title-Case English string). |

There is **no server-side recompute, trigger, or back-reference** between `lands.crop_stage` and `crop_stage_master`. The column is a frozen snapshot of whatever label the client picked at land-creation time.

## 2. What `crop_stage_master` actually is

Schema (`information_schema.columns`):
```
id, crop_code, growth_stage, das_min, das_max, stage_description, created_at, updated_at
```
- `growth_stage` is **lower_snake_case, crop-specific** (e.g. cotton: `germination, seedling, vegetative, squaring, flowering, boll_development, maturity, boll_opening, harvest`; maize: `emergence, early_vegetative, knee_high, tasseling, silking, grain_filling, …`; brinjal/onion/chilli have `nursery, transplanting, transplant_establishment, bulb_initiation`, etc.).
- Authoritative axis = **(crop_code, DAS range)** → stage code. This is the SSOT used by the AI brain.

Loaded once per Deno isolate by `supabase/functions/ai-agriculture-chat/utils/stage-knowledge-cache.ts` (`loadStageKnowledge → from('crop_stage_master')`) and consumed by:
- `utils/stage-normalizer.ts::getStageCategory()` → DB-first, logs `[STAGE_SSOT] source=crop_stage_master result=HIT|MISS`.
- `decision/intent-resolver.ts:90-99` → `getGrowthStageFromDAS()` queries `crop_stage_master` directly by DAS.
- `decision/db-observation-validator.ts:73-84` → same DAS lookup.
- `decision/pipeline-self-check.ts:64` lists `crop_stage_master` as a required SSOT table.

## 3. The conflict (concrete)

| Dimension | `lands.crop_stage` (client) | `crop_stage_master` (SSOT) |
|---|---|---|
| Producer | `stageFromProgress()` — 7 hardcoded buckets, **crop-agnostic** | DB rows curated per crop |
| Vocabulary | Title-Case English (`"Germination"`, `"Tillering / Branching"`, `"Grand growth"`) | `lower_snake_case` (`germination`, `tillering`, `grand_growth`, `boll_opening`, `nursery`, `transplant_establishment`, …) |
| Case | Mixed-case, contains spaces and `/` | `lower_snake_case` only |
| Granularity | Universal 7 buckets | 6–13 crop-specific stages (cotton 9, maize 8, chilli 8, brinjal 6, onion 7) |
| Derivation input | `daysSinceSowing / durationDays` ratio (uses `crops.duration_days`, **not** `crop_stage_master`) | Explicit `(crop_code, das_min, das_max)` ranges |
| Owner of truth | Client at land-creation time, **never updated** | DB, recomputed each AI request from current DAS |
| Validation | None (lands-api stores verbatim) | DB constraint + cached lookup map |

### Observed runtime divergence
1. **AI brain reads both.** `agents/orchestrator.ts:1331` does
   `stage: canonicalContext?.growth_stage ?? landContext?.current_crop_stage ?? null`.
   `landContext.current_crop_stage` is the unnormalized `lands.crop_stage` string. `canonicalContext.growth_stage` is derived through `crop_stage_master`. Both can be live simultaneously, with different casing/spelling.
2. **`getStageCategory(stage, crop)`** in `stage-normalizer.ts` always logs a `[STAGE_SSOT]` line. With `lands.crop_stage = "Germination"` and crop `cotton`, the DB lookup key is `cotton|germination` (lowercased) → HITs cotton's `germination` row — accidentally OK. But for `"Tillering / Branching"`, `"Grand growth"`, or `"Pre-sowing"`, the lookup key becomes `cotton|tillering_/_branching` etc. → **MISS**, falls back to the static `SEEDLING/VEGETATIVE/REPRODUCTIVE/MATURITY` regex lists. The result is a different category than the DB would have produced from DAS.
3. **Crop-specific stages are unreachable from the client path.** No farmer-saved land can ever carry `squaring`, `boll_opening`, `nursery`, `transplant_establishment`, `silking`, `tasseling`, `bulb_initiation`, etc. — those stage codes are only producible by the DAS lookup against `crop_stage_master`.
4. **`lands.crop_stage` is stale by design.** It is written once at confirm time and never re-derived as DAS advances. `crop_stage_master`-based resolution is recomputed every request. So even when the labels initially agree, they drift apart over time.
5. **The "frozen" canonical context inherits the stale string** when `crop_stage_master` lookup misses (e.g. unknown crop, missing DAS). `assertNoGraphDrift()` then locks the bad value for the whole request.

## 4. Root cause (single sentence)

`lands.crop_stage` is produced by a **client-side, crop-agnostic, 7-bucket English-label heuristic** (`src/lib/cropStage.ts::stageFromProgress`) that was written before `crop_stage_master` became the AI SSOT, and the write path (`SmartLandConfirmCard → lands-api`) bypasses any DB normalization — so the column persists a vocabulary that does not exist in `crop_stage_master` and is never reconciled with the DAS-driven SSOT the AI brain depends on.

## 5. Why both still "coexist" today

`orchestrator.ts` prefers `canonicalContext.growth_stage` first and only falls back to `landContext.current_crop_stage`. As long as DAS + `crop_stage_master` produce a HIT, the conflict is masked. The conflict materializes whenever:
- DAS is missing / 0 / negative (new land, no sowing date),
- `crop_code` is missing or not present in `crop_stage_master`,
- the canonical builder returns null and the orchestrator falls back to the raw `lands.crop_stage` string,
- any downstream caller compares against `lower_snake_case` rule values (`stage_applicable`, `STAGE_FAMILIES`) — `"Germination"` ≠ `"germination"` ≠ `"GERMINATION"` in case-sensitive checks (`layered-rule-evaluator.ts:1314` comment notes the dependency on `current_crop_stage = GERMINATION`).

## 6. Producers / consumers map (for the fix design — not executed here)

Producers of stage value entering the AI graph:
1. `src/lib/cropStage.ts::stageFromProgress` (client heuristic) → `lands.crop_stage`
2. `crop_stage_master` (DAS lookup) via `intent-resolver.ts::getGrowthStageFromDAS`, `stage-knowledge-cache.getStageByDAS`, `db-observation-validator.ts`
3. `utils/stage-normalizer.ts::normalizeStageForDB` (string remap table `STAGE_DB_MAP`)
4. `agents/canonical-state-builder.ts` (assembles `canonicalContext.growth_stage`)
5. `agents/orchestrator.ts:1331` (final fallback `?? landContext?.current_crop_stage`)

Consumers that read it back:
- `layered-rule-evaluator.ts` predicates (`stage_applicable`, `STAGE_FAMILIES`)
- `decision/hypothesis-evaluator.ts`, `decision/symbolic-reasoner.ts`
- `runtime/conversation-state.ts` (`stage_source` provenance: `'landContext' | 'crop_stage_master' | 'default'`)
- `index.ts:1024, 1121` (audit log `growthStage`)
- All `crop_schedules` / `ai-smart-schedule` paths

---
**Conclusion:** there is no "calculation" of `lands.crop_stage` anywhere on the server. It is a one-shot client label produced by `stageFromProgress()` and stored verbatim. `crop_stage_master` is the true SSOT (DAS-driven, crop-specific, snake_case). The two systems disagree on vocabulary, case, granularity, freshness, and owner — and the orchestrator's `??` fallback is the exact line where the two collide.
