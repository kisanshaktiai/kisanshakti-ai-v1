# DB-SSOT Migration Plan — Remove Hardcoded Agri Constants

Ground rules (locked): (1) No core reasoning logic touched — agents, gates, cascade order unchanged; only data source for constants swaps. (2) Every patch has a verify-in-DB step; if the query returns 0 rows, the code cutover for that patch is aborted.

## Tier 0 — Prerequisites (must land + verify BEFORE any code)

**M1 · Seed `system_config`** — new migration `20260723000000_seed_system_config_safety_keys.sql` inserting the 17 keys (spray thresholds ×4, safety/PHI/confidence ×5, diagnosis/NDVI/soil ×5, threshold maps ×2, humidity/rain-window ×2) with `ON CONFLICT DO NOTHING`. Values match current in-code defaults so behavior is a no-op on cutover.
Verify: `SELECT config_key FROM system_config WHERE config_key = ANY(...)` returns all rows.

**M2 · Shared config cache** — new file `supabase/functions/ai-agriculture-chat/utils/db-ssot/system-config-cache.ts` mirroring `phase1-caches.ts` discipline (10-min TTL, single-flight, boot assertion). Exports `preloadSystemConfig`, `getSystemConfig` (enrichment, undefined on miss), `requireSystemConfig` (safety, throws `SafetyConfigMissingError` on miss), `systemConfigReady`. Wire `preloadSystemConfig` into orchestrator boot preload next to `preloadPhase1Caches`.

## Tier 1 — Safety-critical patches

**P1 · `utils/db-ssot/phase1-caches.ts`** — recategorize `getEmergencyObsCodes` as safety: throw `SafetyCacheUnavailableError` when `phase1CacheReady()` and set is empty (matches banned/restricted pattern). Doc comment on `emergencyObsCodes` changes `// enrichment` → `// safety`.

**P2 · `agents/decision-graph-bridge.ts`** — reverse legacy/DB check order so DB is authoritative and legacy is cold-boot fallback only. Wrap in try/catch: on `SafetyCacheUnavailableError` return a `SAFETY_CACHE_UNAVAILABLE` blocking rule (refuse to advise). Delete the duplicate `checkChemicalStatus(...)` async block (phase1 cache is SSOT).

**P3 · `decision/weather-safety-gate.ts`** — replace the `const SPRAY_THRESHOLDS = {...}` block with a `getSprayThresholds(sprayType)` helper that calls `requireSystemConfig` for the 4 keys. On `SafetyConfigMissingError` return a `status:'UNKNOWN', spray_allowed:false` verdict. Physics/epidemiology formulas (`calculateDewPoint`, `calculateDiseaseRiskForSpray`) stay hardcoded — they are model equations, not agronomic policy.

**P4 · `agents/safety-guardian.ts` + `safety-guardian-types.ts`**
- P4a — `checkBannedSubstances`: replace `Object.entries(BANNED_SUBSTANCES_INDIA)` loop with `isBannedChemical / isRestrictedChemical / isWatchListChemical` from phase1 cache; on cache error return `{passed:false, action:'BLOCK'}`.
- P4b — Emergency detection: replace only the `EMERGENCY_KEYWORDS.banned_used` branch with a `isBannedListedInText` helper that reads the cache. Human-distress keywords (poisoning/mass_death) stay — they are medical, not agri.
- P4c — Delete `SAFETY_THRESHOLDS` export; call sites read `confidence_threshold_recommendation`, `confidence_threshold_min`, `safety_phi_min_days` via `requireSystemConfig`.
- P4d — Deferred to Phase 4 (needs schema columns): `BANNED_SUBSTANCES_INDIA` map shape, `PHI_DATABASE`, `WHO_TOXICITY_CLASSES`, `getWHOToxicityClass()`. Not touched now.

## Tier 2 — Enrichment patches

**P5 · `agents/nlp-agriculture-validator.ts`** — new `utils/db-ssot/vocab-cache.ts` (paginated loader over `crop_vocabulary` for langs mr/hi/romanized_mr/romanized_hi/en, TTL, single-flight). Delete `MARATHI_AG_VOCABULARY`, `HINDI_AG_VOCABULARY`, `DIALECT_NORMALIZATIONS`. Rewrite entity extraction to `lookupVocab(langKey)` and classify matches into pests/diseases/symptoms via `getObservationMaster(obs).semantic_class` (Phase-2 index). If `!vocabCacheReady()` push warning `vocab_cache_cold` and skip (enrichment-skip-on-miss). Levenshtein / Soundex / fuzzy-match algorithms preserved. `FORBIDDEN_COMBINATIONS` regexes stay (Phase-4).

**P6 · `agents/orchestrator.ts`** — add `advisoryDirectIntents` Set to phase1-caches with 6th parallel query (`observation_intent_master where clarification_mode='DIRECT' and is_active=true`) and `isAdvisoryDirectIntent` accessor. Replace `ADVISORY_DIRECT_INTENTS` const with `_LEGACY_ADVISORY_DIRECT_INTENTS` cold-boot fallback; `isAdvisoryRoute` delegates to `_isAdvisoryDirectIntentDb(intent, _LEGACY...)`. Agronomist reconciles the 2 intents flagged NOT-DIRECT in DB via one-off SQL before cutover.

**P7 · `decision/authoritative-state-loader.ts`** — replace `NDVI_THRESHOLDS`, `SOIL_THRESHOLDS`, `FRESHNESS_THRESHOLDS` with `_*_FALLBACK` constants + `getNDVIThresholds()`, `getSoilThresholds()`, `getFreshnessDays(key, season?)` helpers reading from `system_config`. NDVI staleness is season-aware (kharif/rabi). `weather_hours` stays in fallback (not agri). `calculateWaterStress`, `calculateNDVITrend`, `calculateDecisionConfidence` stay hardcoded — model math, not policy. UX 4-crop fallback picker stays (separate task).

## Tier 3 — Shadow-diff wiring (finish Phase 2)

**P8** — Wire `observationIndexDiff()` at 7 legacy files (`observation-code-mapper`, `observation-ontology`, `cross-crop-symptom-ontology`, `observation-cause-mapper`, `observation-key-mapper`, `cross-crop-symptom-mapper`, `entity-code-mapper`) with one distinct `site` string per file. Legacy return values unchanged; the diff never throws. Cutover to delete legacy queries is blocked until 7-day zero-diff signal.

## Tier 4 — Regression prevention

**P9** — New `.github/workflows/no-hardcoded-agri.yml` grep gate that fails PRs reintroducing any of the 11 forbidden runtime patterns (`const SPRAY_THRESHOLDS`, `const NDVI_THRESHOLDS`, `const SOIL_THRESHOLDS`, `const FRESHNESS_THRESHOLDS`, `export const MARATHI_AG_VOCABULARY`, `export const HINDI_AG_VOCABULARY`, `export const ADVISORY_DIRECT_INTENTS`, `_LEGACY_BANNED_CHEMICALS.find`, `Object.entries(BANNED_SUBSTANCES_INDIA)`, `PHI_DATABASE[`, `EMERGENCY_KEYWORDS.banned_used`). `_LEGACY_*` fallback declarations remain allowed.

## Ship order (fixed — each step gates the next)

```text
0  M1 seed system_config          -> 17 rows visible via SQL
1  M2 config cache + wiring       -> boot log [DB_SSOT_CACHE] system_config rows=17
2  P1 emergency->safety           -> [DB_SSOT_CACHE] emerg=38; no SAFETY_HARD_FAIL on happy path
3  P2 bridge fallback order       -> grep gate passes; verdict unchanged
4  P3 SPRAY_THRESHOLDS            -> spray query verdict identical to pre-cutover
5  P4 safety-guardian a/b/c       -> banned/restricted/watch tests still classify correctly
6  P5 nlp vocab cache             -> mr/hi/romanized entity extraction identical
7  P6 ADVISORY_DIRECT_INTENTS     -> 30-intent DB set matches routing; 2-intent reconciliation done
8  P7 NDVI/SOIL thresholds        -> interpretNDVI(0.5) still returns MODERATE
9  P8 seven shadow-diff wirings   -> [OBS_INDEX_DIFF] volume within agronomist threshold across 7 days
10 P9 CI gate                     -> PR reintroducing forbidden pattern auto-rejected
```

## Preserved / out of scope (explicit)

- Cascade order, agent boundaries, all gate structures, all response contracts.
- Model math: `calculateDewPoint` (Magnus-Tetens), `calculateDiseaseRiskForSpray`, `calculateWaterStress`, `calculateNDVITrend`, `calculateDecisionConfidence`, Levenshtein, Soundex.
- Human medical distress keyword maps in `safety-guardian` (`poisoning`, `mass_death`).
- Phase-4-gated data: `BANNED_SUBSTANCES_INDIA` map shape, `PHI_DATABASE`, `WHO_TOXICITY_CLASSES`, `FORBIDDEN_COMBINATIONS` regexes, `DIALECT_NORMALIZATIONS` (moves to observation_aliases in separate task).
- Weather freshness hours, UX crop-picker fallback list.

## Rollback

Each patch is independently revertible: M1 is `DELETE FROM system_config WHERE config_key IN (...)` (no FKs); code patches revert to git prior; cache files delete cleanly (unused imports flagged by tsgo).
