# Phase 6 — Codebase ↔ Schema Drift

## D1. Case-mismatch hazard — HIGH

The DB stores `observation_master.observation_code` 100% lowercase. Several code sites compare against UPPER_SNAKE constants:

| File:line | Symbol | Problem |
|---|---|---|
| `decision/symbolic-reasoner.ts:327` | `BIOTIC_OBS_KEYS = ['BORE_HOLES', 'DEAD_HEART', ...]` | `obs.includes('BORE_HOLES')` — uppercase substring scan against lowercase DB rows. Biotic detection branch is dead in many flows. |
| `_tests/observation_rule_bypass_test.ts:52,75,84,90,170` | `'OBS_RICE_NO_EMERGENCE'` | Test fixtures use uppercase symptom keys; real DB row is `obs_rice_no_emergence`. Tests pass against mocks only. |

**Live DB confirmation** (queried during audit):
```
observation_master.observation_code: obs_rice_no_emergence  (lowercase)
decision_rules.condition_code:        obs_rice_no_emergence  (lowercase) ✅ FK-aligned
decision_rules.rule_id:               RICE_GERMINATION_DIAGNOSTIC_001 (uppercase)
```

**Fix pattern (P0):**
1. Normalize every incoming symptom key to lowercase at the orchestrator boundary (single helper `normalizeObsCode(s) → s.toLowerCase()`).
2. Convert `BIOTIC_OBS_KEYS` to lowercase entries.
3. Convert all `OBS_*` constants in non-test files to lowercase.
4. Update test fixtures to lowercase.

## D2. Non-paginated reads

Search for `.from('<large_table>').select(...)` without `.range()` confirmed clean by recent fix: `bundled-rules/loader.ts` now paginates. Spot-check verified — no remaining unbounded reads against `decision_rules`, `observation_master`, `intent_observation_mapping`, `hypothesis_master`.

## D3. camelCase / snake_case bridge points

`src/lib/cropStage.ts`, `src/services/chatSyncService.ts` consume snake_case columns and expose camelCase properties. Translations happen at the service boundary — acceptable pattern. No drift detected.

## D4. Hardcoded agronomic vocabulary remaining

Recent fixes removed `criticalFallback` from `orchestrator.ts` and `CROP_STAGE_DURATIONS` from `src/constants/crops.ts`. Spot-checks:
- `src/constants/crops.ts` retains `CROP_NAME_TO_CODE` (vocabulary mapping only) — acceptable.
- `EMERGENCY_OBS_CODES` set in `orchestrator.ts:420` — string list of observation codes. Verify each entry exists in `observation_master` (run cross-check below).

```sql
-- Verify emergency codes are in DB. Replace list with actual constant values.
SELECT unnest(ARRAY[...]) AS code
EXCEPT SELECT observation_code FROM observation_master;
```

## D5. Edge function `createClient` sites

16 confirmed (matches `_audit/2026-06-13-leakage-inventory.md`). Still pending consolidation onto `scope.db`. Files:

```
agents/audit-logger.ts
agents/canonical-observation-loader.ts
agents/feedback-learning.ts
agents/intent-classifier.ts
agents/next-crop-recommender.ts
agents/orchestrator.ts
agents/safety-guardian.ts
bundled-rules/loader.ts
decision/authoritative-state-loader.ts
decision/db-observation-validator.ts
decision/intent-resolver.ts
decision/observation-code-mapper.ts
decision/symbolic-reasoner.ts
index.ts                       (entry point — keeps one)
runtime/request-scope.ts       (factory — keeps one)
```

13 of 16 are candidates for migration to `scope.db`.

## D6. Module-level mutable state

Confirmed via grep:
```
agents/intent-classifier.ts:35  let _validIntentCodes
agents/intent-classifier.ts:36  let _validIntentCodesPromise
agents/next-crop-recommender.ts:114 let _cachedRules
agents/next-crop-recommender.ts:115 let _cachedAt
```

Plus module-level `Map` caches with no tenant prefix in the key:
```
agents/market-product-lookup.ts:33    ingredientProductCache
bundled-rules/loader.ts:459           conditionLedgerCache
decision/causal-hypothesis-engine.ts:224 hypothesisCache
decision/observation-code-mapper.ts:483  OBS_ALIAS_CACHE
```

All are reads of **global** reference data (ontology, rules, hypotheses), not tenant-scoped data → cross-tenant safe. Document the contract in the W1 inventory and add a guard test.

## Conclusion

The only **functional** code-vs-schema drift is the case-mismatch (D1). All other items are hygiene / hardening.
