# Phases 4–7 — NEXT_CROP_RECOMMENDATION Engine

Status: shipped 2026-06-07. Builds on Phases 1–3 (intent registration + static-gate / NO_ACTIVE_CROP bypass).

## Phase 4 — Rule category lane
`mapBundledCategory()` (layered-rule-evaluator.ts) now registers:

| Category | Routed to |
| --- | --- |
| `crop_rotation` | PRESCRIPTION |
| `crop_selection` | PRESCRIPTION |
| `next_crop` | PRESCRIPTION |
| `rotation_advisory` | PRESCRIPTION |
| `management` | PRESCRIPTION (was unmapped → DIAGNOSIS via fail-loud) |
| `organic` | PRESCRIPTION |
| `stress_tolerance` | PRESCRIPTION |
| `gate` | SAFETY |
| `stress_weather` | WARNING |

This stops `SYMBOLIC_CONTRACT_VIOLATION` log spam and opens the lane for crop-recommendation rules. No seed rules ship in this commit — content authoring is a separate task (decision_rules rows with `category='crop_rotation'` keyed by `crop_group`/last-crop conditions).

## Phase 5 — CanonicalContext extension
`CanonicalContext.soil` now carries `organic_carbon`, `texture`, `agro_zone`, `irrigation_type`. New top-level `rotation_history: ReadonlyArray<{crop_code, crop_name, crop_variety, sowing_date, harvest_date, season}>` (last 5, most recent first). Builder reads from `landContext.soil.*`, `landContext.agro_zone`, `landContext.irrigation_type`, `landContext.rotation_history || harvested_schedules`.

All fields are optional (null) — no existing rule path is broken.

## Phase 6 — Formatter RECOMMEND framing
`llm-response-formatter.ts` imports `isNextCropRecommendationQuery` and, when the farmer message matches, injects a forward-looking instruction block into the system prompt:
- Acknowledge last harvest
- Show rotation history
- Recommend ONLY crops present in the symbolic actions
- No invented yields/varieties
- If symbolic data is empty, request more info (no guessing)

## Phase 7 — Structured audit tags
Two `JSON.stringify({audit_tag:'NEXT_CROP_ROUTING', …})` lines emitted in orchestrator:
- `stage='PRE_CLASSIFY'` — static gate + NO_ACTIVE_CROP guards flagged for bypass
- `stage='NO_ACTIVE_CROP_BYPASS'` — guard actually bypassed, plus `last_harvest`, `rotation_depth`, `has_soil_oc`, `has_agro_zone`

`agentsUsed` now records `NEXT_CROP_RECOMMENDATION_PRECLASSIFIED` and `NEXT_CROP_RECOMMENDATION_BYPASS`.

## Tests
- `tests/chat/next-crop-recommendation-routing.test.ts` — 33/33 ✅
- No regression in static-gate factual lookups

## Not in scope (follow-up)
- Authoring `decision_rules` rows for crop_rotation / crop_selection per crop_group
- Populating `intent_observation_mapping` for NEXT_CROP_RECOMMENDATION
- Loader-side enrichment so `landContext.rotation_history` is actually filled
  (currently the field flows through if upstream provides it; otherwise empty)
