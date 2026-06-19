## Phase 3 — De-Hardcode the Brain (semantic_class SSOT)

Replace 7 hardcoded lookups with DB reads. Phase 2 made `observation_master.semantic_class` and `intent_semantic_class_allowlist` authoritative; Phase 3 wires the runtime through them.

### Targets and replacement strategy

| Hardcoded constant | Location | DB SSOT replacement |
|---|---|---|
| `BIOTIC_OBS_KEYS` | `decision/symbolic-reasoner.ts:327` | `observation_master.semantic_class IN ('pest','disease')` |
| `EMERGENCY_OBS_CODES` | `agents/orchestrator.ts:421` | new column `observation_master.is_emergency boolean` (backfilled from current 12 codes + severity rules) |
| `ADVISORY_DIRECT_ROUTES` | `agents/orchestrator.ts:3394` | new column `observation_intent_master.clarification_mode='DIRECT'` flag (already partly used via `intentMetaFromDB?.clarification_mode`); seed the 4 routes |
| `IPM_DATABASE` + `DISEASE_DATABASE` | `agents/decision-graph-bridge-data.ts:38,115` | already superseded by `decision_rules` + `master_products`; remove fallback path, fail-closed |
| `CULTURAL_STRATEGIES` / `getCulturalAdvice()` | `agents/decision-graph-bridge-data.ts:143` | `decision_rules` with `category='cultural'` filtered by crop + semantic_class |
| `CROP_NAME_TO_CODE` + `normalizeCropName()` | `src/constants/crops.ts:13` | `crop_synonyms` table (DB) via existing `landsApi` / new `cropResolver` service |

### Migration (single SQL)

1. `ALTER TABLE observation_master ADD COLUMN is_emergency boolean NOT NULL DEFAULT false;`
   Backfill `true` for the 12 codes in `EMERGENCY_OBS_CODES` plus any obs where `severity_level='HIGH'` AND `semantic_class IN ('pest','disease')`.
   Index `WHERE is_emergency`.
2. Seed `observation_intent_master.clarification_mode='DIRECT'` for intents matching `FERTILIZER_NUTRITION`, `IRRIGATION_SCHEDULING`, `WEATHER_SPRAY_TIMING`, `CROP_HEALTH` (if not already).
3. Ensure `crop_synonyms` has rows for all 80+ entries in `CROP_NAME_TO_CODE` (English/Hindi/Marathi). Audit + insert any missing.

### Code changes

**A. `decision/symbolic-reasoner.ts`** — replace `BIOTIC_OBS_KEYS.some(...)` with a per-turn cached `loadBioticObservationCodes(scope)` that selects `observation_code` from `observation_master` where `semantic_class IN ('pest','disease')`, cached in `scope.turnCache.observations`.

**B. `agents/orchestrator.ts`**
- Remove `EMERGENCY_OBS_CODES` constant. Add `loadEmergencyObservationCodes(scope)` reading `observation_master.is_emergency=true`. Both call sites (`L7018`, `L7792`) use the cached Set.
- Remove `ADVISORY_DIRECT_ROUTES` constant. Both call sites (`L3406`, `L4612`) consult `intentMetaFromDB?.clarification_mode === 'DIRECT'` (already the canonical signal); seed the 4 missing rows so behavior is preserved.

**C. `agents/decision-graph-bridge-data.ts`** — delete the file (or shrink to types-only). `decision-graph-bridge.ts:254` switches to a new `loadCulturalAdviceFromRules(scope, crop_code)` that selects from `decision_rules` where `category='cultural'` and `crop_code = ?`, falling back to a single DB-driven `'general'` crop bucket.

**D. `src/constants/crops.ts`** — delete `CROP_NAME_TO_CODE` map. Keep the `normalizeCropName()` signature but convert to a thin sync wrapper that delegates to a new `src/services/cropResolver.ts` (async, queries `crop_synonyms`, in-memory LRU cached). Any sync callers get refactored to await. Inventory call sites first; if more than ~5 sync callers, keep a tiny English-only fallback map for the sync path and emit a console warning.

### Test plan

- Migration verifier: count rows by `is_emergency`, by `semantic_class`, count cultural rules per crop.
- Edge-fn smoke: run a sugarcane DEAD_HEART query → emergency path still fires; run a wheat fertilizer query → DIRECT bypass still fires.
- Rule engine: confirm abiotic rules still skipped when pest observations present (BIOTIC_OBS_KEYS replacement).
- Frontend: load `AddLand` page, switch language, confirm crop name dropdown still resolves.

### Risks / rollback

- The `is_emergency` column and `clarification_mode='DIRECT'` seed are additive — rollback is `UPDATE observation_master SET is_emergency=false` and removing the seeded rows.
- `CROP_NAME_TO_CODE` deletion can break sync callers in React components; addressed by keeping the function name + warning fallback.
- `IPM_DATABASE`/`DISEASE_DATABASE` are already marked deprecated/fallback-only; deletion only matters if `decision_rules` coverage gaps exist — verified during Phase 2 (2,537 obs, 309 disease, 427 pest already classified).

Ready to execute on approval. Will run the migration first, verify, then ship the code changes in one pass.
