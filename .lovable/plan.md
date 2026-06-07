# Root cause: the SSOT land-state loader is imported but never called

The symbolic brain expects a single authoritative snapshot of land + soil + NDVI + weather + crop + variety from `decision/authoritative-state-loader.ts → loadAuthoritativeLandState()`. That loader reads `lands`, `crop_history`, `soil_health`, `ndvi_data`, `weather_observations` (with `weather_current` fallback) and computes freshness + derived metrics (water stress, crop health, completeness score, `sources_available` / `sources_missing`).

But in `agents/orchestrator.ts`:
- `loadAuthoritativeLandState` is imported (line 340) and **never invoked** anywhere (`rg` returns zero call sites).
- Instead, at line ~5986 the orchestrator hand-builds an `authoritativeLandState` from the lightweight `landContext` plus `fusedIntelligence.weather_data`, and hardcodes:
  - `soil.test_date: null`, `test_age_days: null`, `data_fresh: !!landContext.soil_health`
  - `ndvi.age_days: null`
  - `weather.data_timestamp: null`, `data_age_hours: null`, `rain_probability: null`
  - `derived.water_stress_level: 'unknown'`, `crop_health_status: 'unknown'`, `data_completeness_score: 50`
  - `sources_available: ['land_context']`, `sources_missing: []`

This fake state is what feeds `FactExtractor.extractFacts(...)` and `SymbolicReasoner.executeRules(...)`. Consequences:
1. Rules conditioned on `soil.*`, `ndvi.*`, `weather.*`, `derived.*` cannot evaluate truthfully → `Rules Fired: 0` and a generic proactive/stage rule (`PROACTIVE_FLOOD_PREPAREDNESS_001`, `ACTIVE_TILLERING` template) wins every turn regardless of intent.
2. Variety details are passed only as a free-text `crop_variety` string — the existing variety SSOT (`master_products WHERE product_type='seed'` + `variety_resistance` + `variety_translations`) is never joined, so variety-aware rules (resistance downweighting, maturity, irrigation sensitivity) cannot match.
3. `sources_missing` is always `[]`, so the data-audit footer cannot honestly tell the farmer what's missing.

This explains the reported symptom: every Marathi turn collapses to the same answer because the SSOT context the brain depends on is effectively empty.

## Fix plan

### 1. Call the SSOT loader exactly once per turn

In `agents/orchestrator.ts`:
- After `landContext = await this.fetchComprehensiveLandContext(...)` and before the symbolic-reasoner block, call:
  ```text
  authoritativeLandState = await loadAuthoritativeLandState(supabase, landId, { now })
  ```
- Cache it on the turn and reuse from symbolic reasoner, weather-safety-gate, fact-extractor, response-generator, dynamic-clarification-generator.
- **Delete** the hand-built `authoritativeLandState = { ... }` literal at lines ~5986-6052. Pass the loader result directly. If the loader returns `null` (no land), keep the existing `null` path — no fabrication.
- Add one structured log per turn:
  ```text
  [SSOT] AuthoritativeLandState loaded: sources=[...], missing=[...], completeness=NN, weather_age_h=NN, ndvi_age_d=NN, soil_age_d=NN
  ```

### 2. Wire variety SSOT (already exists, do not rebuild)

The variety catalog is already canonical at `master_products WHERE product_type='seed'` with child tables `variety_resistance`, `variety_translations`, `variety_source_references` (see `mem://database/variety-master-schema-v1`). The shared loader `_shared/variety-context.ts → loadVarietyProfile()` returns the full `VarietyProfile` (resistance, climate suitability, water demand, critical stages, translations).

In `decision/authoritative-state-loader.ts`:
- After resolving the active crop row, resolve the variety id using `lands.variety_id` (authoritative) → `crop_history.crop_variety` fallback (free-text matched against `master_products.name`).
- Call `loadVarietyProfile(supabase, varietyId, languageCode)` from `_shared/variety-context.ts`.
- Attach the returned profile to the snapshot at `crop.variety` (do not flatten, do not duplicate fields).
- Add `'master_products'` / `'variety_resistance'` / `'variety_translations'` to `sources_available` based on what the profile loader actually returned; add to `sources_missing` when null. No placeholder objects.

In `decision/fact-extractor.ts`:
- Expose variety facts to the rule engine from the SSOT profile only:
  `variety_code`, `variety_class`, `maturity_days`, `water_demand_category`, `critical_stages[]`, `resistance_map { observation_code → level }`.
- Downweight pest/disease hypotheses when `resistance_map[obs] ∈ {R, HR}` per the documented contract.

### 3. Weather: live data only, no defaults, no hallucination

- `loadAuthoritativeLandState` already attempts `weather_observations` (by `land_id`) and falls back to `weather_current` (by rounded lat/lon `location_key`). Keep that chain.
- If both queries return nothing OR the freshest record is older than `WEATHER_FRESHNESS_HOURS`, set `weather: null` and push `'weather'` into `sources_missing`. Do NOT substitute defaults, climatology, monthly averages, or zeros.
- `FactExtractor.extractEnvironmentalFacts` must emit `temperature/humidity/recent_rain/soil_moisture_estimated = null/UNKNOWN` when `weather === null`. Today it returns `recent_rain: false` and `soil_moisture_estimated: 'UNKNOWN'` only when `landState?.weather` is missing — verify the new `null` path keeps that behavior and never invents `rainfall_last_24h: 0` from a missing record.
- The rule engine must treat `weather === null` as "weather predicate cannot be evaluated" → the rule is skipped, not fired. Add an explicit guard in the predicate evaluator: if a rule references `weather.*` and `land_state.weather === null`, mark `evaluation_skipped: 'weather_missing'` and surface it in the audit footer.
- The data-audit footer for the farmer should list `Missing: Weather` when this happens, instead of silently using stale or zero values.

### 4. Fold SSOT data into the rule-engine input

In `layers/rule-evaluation-layer.ts` and `agents/layered-rule-evaluator.ts`:
- Confirm `land_state` is passed (it already accepts `AuthoritativeLandState | null`).
- In the predicate evaluator, prefer `land_state.*` over `landContext.*`; remove any silent fallback that substitutes constants for missing weather/NDVI/soil.

### 5. Reconcile `fetchComprehensiveLandContext` with the SSOT

- Keep `fetchComprehensiveLandContext` only for legacy display fields (names, labels) used by clarification/UX.
- Stop using its soil/NDVI/weather/variety subfields for rule evaluation — the loader is now the only source.

### 6. Make the completeness gate honest

- Replace the hardcoded `data_completeness_score: 50` with the loader's real score.
- Feed `sources_missing` into the audit footer text (e.g. `Missing: Weather, Soil Test`) so the farmer sees the real gaps that prevented full rule evaluation.

### 7. Database touch-ups (only if a column drift is found)

Read-only verification only — no new tables:
- Confirm columns referenced by the loader exist: `ndvi_data.date`, `soil_health.test_date`, `weather_observations.observed_at` (or `observation_time`), `lands.variety_id`, `crop_history.crop_variety`.
- If any name has drifted, add a view or a small column-rename migration. Do not invent defaults or seed weather rows.

### 8. Verification

Re-run the three Marathi turns from the prior regression on Land=Khori (Rice, DAS=1). Expect in logs:
```text
[SSOT] AuthoritativeLandState loaded: sources=[lands, crop_history, soil_health, ndvi_data, weather_observations, master_products, variety_resistance], missing=[...], completeness=NN
[FactExtractor] facts include soil.*, ndvi.*, weather.*, derived.*, variety.{code,resistance_map,critical_stages}
[LayeredRuleEvaluator] rules_matched > 0 for intent-specific predicates (FERTILIZER_SCHEDULE → nutrition rules; WEED_PROBLEM → weed rules)
```
And:
- Three turns produce three different primary decisions.
- When live weather is missing, the response shows `Missing: Weather` and no rule that depends on weather fires.

## Out of scope

- No LLM authority changes (LLM stays render-only).
- No new SSOT tables — variety SSOT already exists at `master_products` + variety_* children.
- No weather defaults, climatology fallbacks, or hardcoded values anywhere.
- No UI changes beyond surfacing real `sources_missing` in the existing audit footer.
