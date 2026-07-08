---
name: crop-calendar-and-names-db-ssot
description: PR-3 removed ICAR_CALENDARS + ICAR_CROP_CALENDARS + hardcoded normalizeCrop regex; stage lookup now goes through StageKnowledgeCache and crop-name resolution goes through crop-names-cache (public.crops).
type: constraint
---

## Contract

- `decision/crop-calendar-lookup.ts` is a **thin shim** over `StageKnowledgeCache`. It must never re-introduce a per-crop calendar table. `calculateGrowthStageFromDAS`, `getStageWatchLists`, `hasICARCalendar` delegate to `getStageByDAS` / `getStageKnowledge`. Cache miss → `source: 'UNKNOWN'` with `[CROP_CALENDAR_MISS]` log, never a hardcoded guess.
- `decision/context-validator.ts::validateGrowthStage` reads `getStageByDAS(crop, DAS)`. Cache miss falls back to `VEGETATIVE` with `stage_source='DEFAULT'` and a warning — the ONLY permitted non-DB stage assignment. Do NOT restore any per-crop table.
- `decision/context-validator.ts::normalizeCrop` uses `getCachedSynonymMap()` from `crop-synonyms-cache` (SSOT: `public.crop_synonyms`). Never inline multilingual crop regex here.
- `utils/crop-names-cache.ts` is the SSOT accessor for multilingual crop labels (`public.crops.label`, `label_hi`, `label_mr`, …). `agents/llm-response-generator.ts` and `agents/llm-response-formatter.ts` MUST resolve crop display / canonical names via `getCropDisplayName` / `getCropCanonical` / `getAllCropNames` — never via a hardcoded object.
- Orchestrator preloads `loadCropNames` alongside `loadCropSynonyms`, `loadStageKnowledge`, `loadObservationMapping`, `loadObservationClassification`. Cache-miss logs (`[CROP_NAMES_CACHE_MISS]`, `[CROP_CALENDAR_MISS]`, `[STAGE_KNOWLEDGE]`) are the correct signal to curate the DB row — not to patch code.

## Why

The former `ICAR_CALENDARS` (5 crops) and `ICAR_CROP_CALENDARS` (8 crops) tables duplicated `public.crop_stage_master` (146+ curated rows), drifted from it (e.g., rice missing TRANSPLANTING), and violated the neuro-symbolic invariant that the DB is the sole knowledge source.
