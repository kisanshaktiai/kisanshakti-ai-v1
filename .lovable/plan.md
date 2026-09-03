# Crop schedule: agronomy + farmer-language forensic audit and fix

## What I verified (live data, no assumptions)

Latest generated schedule `0f48f75f` (Rice / Indrayani, land `8897e53d`, 31 tasks, 2026-09-02 13:17 UTC):

- `generation_language = 'en'`, `ai_model = 'none'`, gaps contain
  `narration_unavailable: llm_failed:llm_http_429|llm_http_429`. Both providers in the
  schedule chain returned HTTP 429, both narration attempts (call + immediate retry) failed,
  so the whole schedule was persisted in raw English. The farmer's Marathi request silently
  became an English schedule.
- Persisted task text is still machine text. Real rows from `schedule_tasks`:
  - `"150 plants/m2 x 18.0000000000000000 g TGW, corrected for 90% germination, 98% purity and 0.85 field emergence (Seed drill (conventional tillage))."`
  - `"Inspect for: obs rice seed rotted, echinochloa crus, weed history"` — raw observation codes and Latin names.
  - `"tungro_yellow_stunt: GLH vector presence …"`, `"glh_presence: 5-10/hill"` — condition codes as instructions.
- The shorthand expander corrupts agronomic text and titles: task names read
  `"Fertilizer application (Nitrogen (N))"`, `"Fertilizer application (Potassium (K))"`, and DB text
  became `"fixes 30-40 kg Nitrogen (N)/ha"`. The single-letter rule fires inside legitimate DB prose.
- Two nutrition tasks at DAS 35 have an **empty** `task_description` (nothing for the farmer to read),
  while three other nutrition tasks sit on the same DAS 35 with long prose — five nutrition entries at one date.
- Agronomic clock conflict: a task anchored at DAS 35 from sowing carries the text
  `"AT 25-30 DAYS AFTER TRANSPLANTING (active tillering)"`. Sowing-anchored day vs transplant-anchored
  advice in the same task.
- `gaps` also record `stage_graph_exceeds_variety_duration`, `fertilizer_split_without_timing_skipped`,
  `soil_fertility_class_missing`, `labor_rates_no_row`, `input_price_not_authoritatively_mappable`,
  `rag_evidence: 10 task(s) have no corpus evidence`.

SSOT seeding (verified column-by-column on the saved schedule and against the land's data):

| SSOT | Data exists for this land | Seeded into the schedule |
| --- | --- | --- |
| Land area / state / district / region | yes | yes |
| Soil test (`soil_health`) | 0 rows | correctly reported as a gap |
| Soil type on `lands` | present | not used, `input_soil_data` NULL |
| Weather (`land_weather_state`, 16 rows) | yes | `input_weather_data` NULL |
| NDVI (`ndvi_data`, 8 rows) | yes | never read |
| Env observations (289 rows) | yes | never read |
| Variety agronomy (`variety_cultivation_agronomy`, `crop_water_requirement`) | yes | only partially used |
| `input_land_coordinates`, `agro_climatic_zone` | derivable | NULL |
| `labor_rates`, `input_prices` | 0 rows | correctly reported as gaps |

So the generator reads only: `crop_stage_master`, `crop_baseline_guidelines_v2`,
`fertilizer_recommendation_master`, `variety_cultivation_agronomy`, `decision_rules`,
`chemical_regulatory_status`, `labor_rates`, `input_prices`, `task_type_map`.
Soil, weather, NDVI and land-state SSOTs are not part of day-0 generation at all.

## Fix plan

### 1. Marathi is never silently dropped
- Narration failure must not downgrade the schedule to English. Add bounded backoff that honours
  `Retry-After` on 429 (currently the retry is immediate), and reduce parallelism when a 429 appears.
- If narration still fails, persist the schedule with `generation_language` = requested language and
  mark each un-narrated task `needs_translation`, then let a small `schedule-narrate-retry` pass
  (invoked by the existing reconciler cron) finish the job. The farmer sees a "translation pending"
  chip on those cards instead of English prose presented as final advice.

### 2. Stop text corruption, remove technical language at source
- Rewrite `generator/farmer-text.ts`: drop the single-letter N/P/K substitution entirely (it damages
  DB prose and titles); keep only whole-token expansions (DAS, DAT, RDF, PHI, ETL) and tag stripping.
- Move machine content out of farmer text deterministically: condition codes (`tungro_yellow_stunt:`),
  seed-rate derivation strings (`TGW`, `% purity`, `field emergence`), and `Inspect for: <codes>` lists
  go to `resources.technical_details`. The farmer line is rebuilt from DB label columns
  (`observation_master` / threat local names, already used elsewhere in the app) — no invented text;
  when no label exists, the item is omitted and a gap is recorded.
- Never persist an empty `task_description`: a task with no farmer-readable text is a generation gap,
  surfaced in `gaps` and rendered as pending, not as a blank card.

### 3. Agronomic correctness
- Collapse the five same-day nutrition entries per stage into one nutrition task per stage per nutrient
  event, ordered by the DB split timing; when the split has no timing, keep the existing skip gap but
  attach it to the stage task instead of emitting a bare title-only row.
- Anchor consistency: a task whose DB text is transplant-referenced must carry `anchor_type = 'DAT'`
  and a transplant-based day; mixing a sowing DAS with transplant text is treated as a validation
  violation in `generator/validate-schedule.ts`.
- Keep `stage_graph_exceeds_variety_duration` as a hard warning shown to the farmer (variety duration
  vs stage graph disagree for Indrayani).

### 4. Seed every available SSOT into the schedule
At generation time, read and persist (values only, no derived agronomy):
`input_soil_data` (latest `soil_health` + `lands.soil_type`), `input_weather_data`
(`land_weather_state` latest row), `input_land_coordinates`, `agro_climatic_zone`, and an
`metadata.ndvi_context` from `ndvi_data`. Each missing SSOT becomes an explicit gap.
These are recorded as the generation context and used only where a DB rule already declares a
condition on them (irrigation deferral already does this in the reconciler) — no new agronomic logic.

### 5. UI
- Task cards render `technical_details` only inside the collapsible details area, show the
  "translation pending" state, and show the gap chips already returned by the function.

## Technical notes
- Files: `supabase/functions/ai-smart-schedule/generator/farmer-text.ts`, `generator/narrate.ts`,
  `generator/baseline-generator.ts`, `generator/validate-schedule.ts`, `db/resolve-inputs.ts`,
  `index.ts`, plus `src/lib/scheduleTaskPresentation.ts` and the schedule task card components.
- No new agronomic constants; every value keeps coming from the tables listed above. Change-log
  blocks at the top of each touched edge file get a new entry, per project convention.
- Verification after the change: regenerate one Marathi schedule on land `8897e53d` and read the
  persisted rows — assert no Latin/condition codes in `task_name`/`task_description`, no
  `"Nitrogen (N)"` corruption, no empty descriptions, `generation_language = 'mr'`, and
  `input_soil_data` / `input_weather_data` non-null where the land has data.
