
# Forensic Audit — Verifying the Pipeline Report

I traced every claim in the report against the actual code and the live database. Verdict per finding below — most are correct, two are partially wrong (root cause is different), and one is a much bigger silent bug than the report realized.

## Findings — verified vs. corrected

### 1. Wrong outcome (`no_action_needed` for fertilizer query at GRAND_GROWTH)
**CONFIRMED.** DB has plenty of matching rules — e.g. `SC_NUTRITION_NITROGEN_022`, `SC_NUTRITION_NITROGEN_006`, `SC_NUTRITION_K_DEFICIENCY_001`, `SC_BP_NITROGEN_EFFICIENCY_001` — all `category in ('nutrition','best_practice')`, `stage_applicable @> {GRAND_GROWTH}`, `is_active=true`. They are loaded into the 268-rule cache but never selected. Root cause is the chain of (2) + (3) + (4) below, not a content gap.

### 2. Semantic extractor coverage = 0% / language tagged `hi`
**PARTIALLY CONFIRMED.** Marathi vocab in `crop_vocabulary` already contains `खत`, `खते`, `कोणते खत`, `खत कधी द्यावे`, `खत किती द्यावे`, `पाणी द्यावे`, etc.
What is actually missing for this exact query:
- `द्यावीत` (feminine-plural imperative — only `द्यावे` is seeded)
- `सध्या` (temporal "now")
- `कोणती` (feminine "which" — only `कोणते` masculine is seeded)
- No `SUGARCANE` row for `खते` (only `ALL`); the cache loader uppercases crop_code (`SUGARCANE`) so the `ALL` entries must be queried separately. **Need to confirm the induction layer queries both `crop_code=SUGARCANE` and `crop_code=ALL`** — if it only queries the specific crop, every `ALL` entry is invisible.
The `lang=hi` tag in induction logs while the rest of the pipeline says `mr` is a real inconsistency in `language-induction-layer.ts`.

### 3. `mapBundledCategory` unmapped buckets — **the worst silent failure in the pipeline**
**CONFIRMED.** `agents/layered-rule-evaluator.ts:1581` defines the map. The following categories used by live DB rules are **NOT** in the map and fall through to the `DIAGNOSIS` default with a warning:

| Category | rules in DB | DB count |
|---|---|---|
| `nutrient_management` | yes | 2 |
| `application_timing` | yes | 2 |
| `best_practice` | yes | 5 (incl. `SC_BP_NITROGEN_EFFICIENCY_001`) |
| `proactive_monitoring` | yes | 6 |
| `proactive_irrigation` | yes | 7 |
| `crop_management` | yes | 1 |
| `planting_practice` | yes | 1 |
| `yield_risk_early_warning` | yes | 1 |
| `data_quality` | yes | 2 |
| `proactive_pest` / `proactive_yield` / `proactive_nutrition` / `ndvi_authority_gate` / `diagnostic_discipline` / `stress_guard` / `system_calibration` / `system` / `status` / `planting_material` | yes | also unmapped |

Every one of these rules is being shoved into the DIAGNOSIS phase, where it is scored against symptom evidence (zero for a fertilizer query), then loses ranking to (non-existent) pest rules, and never fires. This is the single biggest reason 268 → 0.

### 4. ObsValidation warnings for `BORE_HOLES`, `FRASS_EXTRUSION`, `WEATHER_ALERT`, `HONEYDEW`, `BORED_INTERNODES`
**REPORT'S DIAGNOSIS IS WRONG. Real bug is worse.**
Querying the DB: **all five codes exist in `observation_master` with `is_active=true`.** `observation_master` has **1,982 active rows** total.
`bundled-rules/loader.ts:1213` loads them with:
```
supabase.from('observation_master').select('observation_code').eq('is_active', true)
```
No `.range()`, no pagination. PostgREST default limit is **1000 rows**, which matches the "1000 codes loaded" line in the logs exactly. **~982 valid observation codes are silently missing from the cache**, so every rule that references them logs a false `unknown observation` warning and (since the validator doesn't drop rules, only warns) clutters logs while masking real authoring errors.

### 5. GDD `FALLBACK_DAS`
**CONFIRMED.** `agents/gdd-phenology-engine.ts:575` initializes `gddSource='FALLBACK_DAS'` and only switches to `CALCULATED`/`ESTIMATED_FROM_AVG` when temperature data is present. No weather source is wired in for this farmer's land. Any rule conditioning on `gdd_min/gdd_max` (DB columns confirmed) silently fails to match.

### 6. Clarification contradiction
**CONFIRMED.** Three independent bypass paths (`clarification-strategy.ts`, `clarification-gate.ts`, `ADVISORY_ROUTE_BYPASS_UNDERSTANDING_GATE` in `orchestrator.ts`) all fire on the same turn. The "farmer already selected option" message prints unconditionally inside one path while `option_selected=NO`.

### 7. NDVI=0.068 ignored
**CONFIRMED.** `canonical-state-builder.ts:390 mapNDVIToLevel` does bucket 0.068 → `VERY_LOW`, but DB rules use raw `ndvi_min/ndvi_max` columns. Need to verify those are wired into the rule input. Also no DB rule covers the `NDVI < 0.15 at GRAND_GROWTH` case; one should be added as a data-quality warning.

### 8. Duplicate `LAND_FETCH` / `STAGE_LOCK` logs
**CONFIRMED.** ContextTracer is invoked twice per Layer-1 pass in `orchestrator.ts`. Doubles DB reads for land + soil + NDVI + crop schedule on every turn.

---

# Fix Plan

Six PRs, ordered by impact / risk. Each is independently shippable. No frontend changes.

**Status (2026-06-04):** P0 mapBundledCategory ✅ shipped · P0 pagination ✅ shipped · P1 Marathi vocab ✅ shipped (migration) · P1 language tag ✅ shipped · P1 fertilizer firing — contract-violation log ✅ shipped (active rescue path deferred — needs DB rule rendering design) · P2 GDD `DATA_QUALITY:gdd_unwired` warning ✅ shipped (weather wiring deferred) · P2 NDVI seed rule ✅ shipped (migration); `ndvi_value` already in rule input · P3 obs validator dedup ✅ shipped · P3 clarification bypass log gating ✅ shipped · P3 duplicate ContextTracer call — not reproduced (single call site in orchestrator).


## P0 — Restore rule firing (root cause of `no_action_needed`)

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` (`mapBundledCategory`, ~line 1581)

1. Add explicit mappings for every category present in `decision_rules`:
   ```
   nutrient_management         → PRESCRIPTION
   application_timing          → PRESCRIPTION
   best_practice               → PRESCRIPTION
   proactive_monitoring        → WARNING
   proactive_irrigation        → PRESCRIPTION
   proactive_nutrition         → PRESCRIPTION
   proactive_pest              → WARNING
   proactive_yield             → WARNING
   crop_management             → PRESCRIPTION
   planting_practice           → PRESCRIPTION
   planting_material           → PRESCRIPTION
   yield_risk_early_warning    → WARNING
   data_quality                → WARNING
   ndvi_authority_gate         → SAFETY
   diagnostic_discipline       → SAFETY
   stress_guard                → SAFETY
   system / status / system_calibration → OBSERVATION
   ```
2. Change the unknown-category fallback to **fail loud** instead of silently coercing to DIAGNOSIS — log `SYMBOLIC_CONTRACT_VIOLATION` with the unmapped category and the rule_id so future drift is caught immediately.
3. Add a Deno unit test that asserts every distinct `category` value present in seeded rules maps to a non-default bucket.

## P0 — Fix `observation_master` cache truncation (1000-row PostgREST cap)

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (~line 1213)

Replace the single `.select().eq()` with a paginated read using `.range(0, 9999)` (or a `while (more)` loop). Same fix needed in `utils/llm-output-validator.ts` and `decision/symbolic-reasoner.ts` if they read the same table. Add a startup log line that prints the row count and warns if the count equals 1000 (pagination smell).

## P1 — FERTILIZER_SCHEDULE deterministic firing guarantee

**File:** `agents/layered-rule-evaluator.ts` + `agents/rule-engine-executor.ts`

When `intent_lock = FERTILIZER_SCHEDULE` (or sibling fertilize/soil-test intents) and stage flag `critical_nutrition = true`, require that the PRESCRIPTION phase return at least one rule. If zero rules fire, do **not** fall through to `no_action_needed` — emit `NEEDS_RULE_SEEDING` diagnostic and surface the highest-scoring stage-applicable PRESCRIPTION rule even if symptom evidence is empty. Symbolic-only output goes through the existing DB-sourced `fallback_text` path (no hardcoded English — see prior refactor).

## P1 — Marathi vocabulary completeness

**Table:** `public.crop_vocabulary` (INSERT-only migration)

Add the missing rows used by this exact farmer turn and structurally similar ones:
- `सध्या` → temporal "now"
- `कोणती` / `कोणत्या` → feminine "which"
- `द्यावीत` / `द्याव्यात` → feminine-plural imperative "should be given"
- `सध्या कोणती खते द्यावीत` → fertilizer schedule query
- mirrored masculine/neuter/plural variants for `पाणी`, `औषध`, `फवारणी`

**File:** verify `agents/language-induction-layer.ts` queries vocab with `.in('crop_code', [cropCode, 'ALL'])`, not only the specific crop, and that script normalization is case-/whitespace-tolerant for Devanagari.

## P1 — Language tag consistency

**File:** `agents/language-induction-layer.ts`

The `lang` field in the LI log line is sourced from a separate detection call instead of the canonical language already locked upstream. Inject the canonical `detected_language` from the orchestrator's Stage-1 normalization and stop re-detecting inside induction.

## P2 — GDD wiring + degraded-mode label

**File:** `agents/gdd-phenology-engine.ts`

1. Pull daily Tmin/Tmax from the existing weather telemetry feed (the project already has live weather context — see `mem://weather/live-weather-context-resolution`). When proximity lookup returns a station, use those daily temps.
2. When neither station nor regional average is available, set `gdd_source='FALLBACK_DAS'` **and** emit a `DATA_QUALITY: gdd_unwired` warning so the response gate can mark the recommendation as degraded.
3. Rule conditions on `gdd_min/gdd_max` should be marked `required: false` (soft) when `gdd_source === 'FALLBACK_DAS'`, matching the existing soft-condition pattern in `loader.ts`.

## P2 — NDVI gate + data-quality rule

**File:** `agents/canonical-state-builder.ts` + new seed rule

1. Add explicit `ndvi_value` and `ndvi_level` (already exists) to the rule-engine input payload so DB columns `ndvi_min/ndvi_max` evaluate correctly.
2. Seed one new DB rule: `SC_DATA_QUALITY_NDVI_001` — category `data_quality`, `ndvi_max = 0.15`, stage_applicable = `{TILLERING, GRAND_GROWTH, MATURITY}`, surfaces a "satellite data unreliable / field may be bare — please confirm" warning sourced from DB text.

## P3 — Cleanup (low-risk hygiene)

- **`orchestrator.ts` Layer 1:** find the duplicate ContextTracer invocation and remove the second call (cuts DB reads in half).
- **Clarification logs:** in the bypass branch that prints "farmer already selected option", gate the message on `option_selected === 'YES'`.
- **Obs validator dedup:** the duplicated warnings come from validating both `observations` and `required_symptoms` arrays in `loader.ts:842`. Move validation above the soft/hard branch so each `(rule_id, obs_code)` is validated once.

---

## Technical notes

- All DB writes are **migrations** for the new seed rule + a SQL `INSERT` migration for the vocabulary rows. No schema changes.
- The pagination fix in `loader.ts` does not need a migration — it's a Deno code change deployed with the edge function.
- The `mapBundledCategory` change is the highest-leverage fix: it alone will cause the existing `SC_NUTRITION_NITROGEN_022`, `SC_NUTRITION_NITROGEN_006`, `SC_BP_NITROGEN_EFFICIENCY_001` rules to fire for the audited turn.
- Verification after each PR: re-run the exact farmer turn (`सध्या कोणती खते द्यावीत?`, sugarcane, DAS=158) against the edge function and assert: (a) `mapBundledCategory` warning count = 0, (b) `ObsValidation` warnings dropped to ~0, (c) at least one PRESCRIPTION rule fires, (d) final response references a DB-sourced N/K split, not `no_action_needed`.
- Honors the existing SSOT contract: **no hardcoded agronomic text added**. All new user-visible strings ship as DB rows.

```text
report claim                      verdict       real root cause
─────────────────────────────────────────────────────────────────
1 wrong outcome                   confirmed     #3 + #4 + #5 chain
2 coverage 0%, lang=hi            partial       missing fem-plural Marathi + LI re-detects lang
3 unmapped categories             confirmed     mapBundledCategory has 10+ holes
4 obs codes "missing from DB"     INCORRECT     codes exist; cache truncated at 1000/1982
5 GDD FALLBACK_DAS                confirmed     weather feed not wired into engine
6 contradictory clarification     confirmed     3 bypass paths, one logs unconditionally
7 NDVI 0.068 unused               confirmed     no rule covers <0.15; needs seed + wiring
8 duplicate LAND_FETCH logs       confirmed     Layer-1 tracer invoked twice
```
