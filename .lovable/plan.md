## Verified current state (checked before planning)

- `decision_rules`: 1855 active-eligible rows, **12 distinct `crop_code` values, 0 mixed-case** (`count(*) filter (where crop_code <> lower(crop_code)) = 0`). So no `LOWER()` UPDATE is needed — but `getCropCodeVariantsForDB()` returns **uppercase** variants (`SC`, `RICE`, `ALL`), so the `.in()` list must be lowercased+deduped at query build time.
- The 13 named indexes all show `idx_scan = 0` in `pg_stat_user_indexes` (confirmed), totalling ~2 MB. `idx_decision_rules_stage_applicable_gin` (6 scans) and `idx_decision_rules_version_hash` (3 scans) exist and stay.
- `hypothesis-evaluator.ts:737` builds the `crop_code.ilike.*` OR-filter; selects 15 columns; paginates 1000/page.
- `bundled-rules/loader.ts:107` does `select('*')`, paginated, then normalizes.
- Direct `decision_rules` reads inside the orchestrator are at **lines 2440 and 9539** (not 1809/6620 as stated in the brief); line 2440 is a single-rule fetch by `rule_id`, 9539 is a crop-scoped fetch. Both will be re-pointed at the repository where semantics allow.
- `lookupMarketProducts` is called **4×** — `agents/llm-response-formatter.ts:473,1502` and `index.ts:3837,3999` (the brief said twice, in the formatter only).
- Nine other modules also query `decision_rules` (`symbolic-reasoner`, `hypothesis-graph-evaluator`, `canonical-observation-loader`, etc.). **Out of scope** for this task — they stay untouched.

## Work plan

### 1. SQL migration (one migration)
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dr_crop_lower_active ON decision_rules (lower(crop_code), is_active);`
- `DROP INDEX CONCURRENTLY IF EXISTS` for the 13 verified zero-scan indexes.
- No case-normalization UPDATE (verified unnecessary).
- Note: `CONCURRENTLY` cannot run inside a transaction block; the migration will be authored as standalone statements and I will confirm the runner accepts it — if it rejects `CONCURRENTLY`, I will fall back to plain `CREATE INDEX` / `DROP INDEX` (table is small, 1855 rows, lock is sub-second).

### 2. `data/rule-repository.ts` (new)
- Single in-memory snapshot of active rules; `loadingPromise` in-flight lock copied verbatim in shape from `utils/crop-vocabulary-cache.ts`.
- Column set = `select('*')` (loader's current set) — trivially a superset of the evaluator's 15 columns and both orchestrator selects.
- Normalization functions (`normalizeActionType`, `normalizeCanonicalGroup`, `normalizeStages`, `normalizeObservableChars`, `normalizeBeeToxicity`) **moved as-is** out of `loader.ts` and imported back by it — no rewrite.
- Pre-bucketed `Map<cropCodeLower, Map<canonicalGroup, Rule[]>>` plus a per-crop flat list, built once per snapshot.
- Invalidation: max `version_hash` probe + TTL backstop (5 min, matching the vocabulary cache).
- API: `getSnapshot()`, `getRulesForCrop(cropCode)`, `getRulesForCropAndGroup(cropCode, group)`, `getRuleById(ruleId)`.

### 3. Consumers
- `hypothesis-evaluator.ts`: replace the paged `.or(ilike)` query with `getRulesForCrop()` over the same variant list (lowercased). Downstream filtering/scoring untouched. Delete the misleading STEP 1.6 comment only.
- `bundled-rules/loader.ts`: `loadRulesFromDatabase()` delegates to the repository.
- `orchestrator.ts:9539`: read from repository. `orchestrator.ts:2440` (single rule by id): `getRuleById()` from the snapshot.

### 4. Hot-loop hoists (`hypothesis-evaluator.ts`)
- `HIGH_POWER` / `LOW_POWER` (lines 542/551) and the `patterns` array in `normalizeCauseForDedup()` (line 275) → module-scope `const`. Identical values, identical order.

### 5. Orchestrator concurrency + per-request memoization
- Kick off `fetchComprehensiveLandContext()`, `fetchWeatherData()`, `getCropVocabulary('ALL')`, `loadFarmerProfileLite()` as promises at the top of `orchestrate()`; await at point of use. `getCropVocabulary(landContext.crop_code)` stays chained (real dependency).
- Per-request `Map` cache (created inside `orchestrate()`, passed down; **never module-level**) for `fetchComprehensiveLandContext`, `fetchWeatherData`, and `lookupMarketProducts` (all 4 sites).

### 6. Level-gated logging
- Small `runtime/log.ts` reading `LOG_LEVEL` (default `INFO`).
- INFO retained: `trace_id`, five `layerTimings`, `[TOKEN_METRICS]`, every `console.error`.
- Everything else rewritten to `debug(...)` — no statement deleted.

## Acceptance test — how I will verify identical `rule_id` sets

Two checks, both concrete:

1. **SQL equivalence proof for the query swap.** For each of the 12 distinct `crop_code` values plus a representative variant list, run in production:
   `SELECT rule_id FROM decision_rules WHERE is_active AND (crop_code ILIKE ANY($variants))` vs `... WHERE is_active AND lower(crop_code) = ANY($lowered)` and assert the symmetric difference is empty. This is exact and I can run it.
2. **Runtime snapshot diff.** Behind a temporary `RULE_REPO_SHADOW=1` env flag, run the old query path and the repository path on the same turn, sort both `rule_id` lists, and log a hash + any diff. Run 3–5 live turns (rice/direct_seeded and sugarcane), confirm zero diffs, then remove the flag.

**Honest caveat:** check 1 proves the DB-filter swap exactly. Check 2 covers only the turns I actually exercise — it is a strong sample, not an exhaustive proof over all inputs. The stronger structural guarantee is that no filtering/scoring code is edited: post-fetch logic operates on the same rows because the repository's column set is `select('*')` and the crop filter is proven equivalent. I will not claim exhaustive verification.

## Not doing
- No changes to scoring, `evaluateConditionsJson`, conflict resolution, safety gates, or formatter validation.
- No agronomic constants moved into TypeScript.
- No changes to the nine out-of-scope modules that query `decision_rules`.
