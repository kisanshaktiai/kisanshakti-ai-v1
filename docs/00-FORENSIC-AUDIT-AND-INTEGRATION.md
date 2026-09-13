# Proactive alerts → crop schedule: forensic audit and integration (2026-09-13)
Repo kisanshaktiai/kisanshakti-ai-v1 · branch kisanshakti-ai-update · HEAD `eb6ac8c3`. Live project inspected today. Nothing new was built; the existing chain was audited end to end, its dead parts identified, and the response logic completed.

## Part 1 — What the satellite and weather layer already gives you (and it is a lot)
Your `ndvi_data` carries far more than NDVI per field per pass: **NDWI and NDMI** (canopy water — the earliest satellite sign of water stress, before NDVI moves), **NDRE and MCARI** (chlorophyll / nitrogen status — this is how leaf-colour-chart advice becomes satellite-driven), **SAVI** (soil-adjusted, better in the thin early canopy), **RVI cross-ratio radar** (works through monsoon cloud when optical is blind), **uniformity_cv / p10 / p90** (patchiness — a patchy drop is pest or disease or a drainage problem; a uniform drop is water or nitrogen), `water_fraction` (standing water / flooding) and `soil_moisture`. The weather engine derives daily: FAO-56 root-zone depletion vs RAW, leaf-wetness hours, heat-stress degree-hours, VPD, GDD, spray score, harvest window.

As an agronomist, this is the map from those signals to the farmer's field — and it is exactly what the response table below implements:
| Field problem | Satellite / weather signature | What the schedule must do |
|---|---|---|
| **Water stress** | FAO-56 depletion ≥ RAW **plus** NDWI/NDVI decline or heat-stress hours at a critical stage | Bring the next irrigation to **today** — even if the urgency label is still "medium" |
| Canopy decline **without** a water deficit | NDVI/NDRE drop, uniformity CV rising, water balance fine | **Not thirst.** Scout today — pest, disease or nitrogen are the likelier causes |
| **Disease onset** (blast, sheath blight, BLB, false smut) | leaf-wetness hours + humidity + temperature window, at the susceptible stage | Scouting card to **today**, carrying "if you see X → apply Y at Z/acre, PHI N" |
| **Pest build-up** (BPH, gundhi bug) | warm–humid–still air at tillering→flowering; milky stage | Same: scout today, treat what you find (ETL), never spray on a weather model alone |
| **Heavy rain / waterlogging / lodging** | rain_24h + wind; water_fraction rising | **Defer** fertilizer (leaching/runoff) and sprays (already done via spray window) |
| **Nitrogen shortfall** | NDRE/MCARI low, LCC observation | Advance the next top-dressing whose window has opened — quantity unchanged |
| Heat at flowering | Tmax run at flowering | Water today (spikelet sterility protection) |

## Part 2 — Forensic findings
### F1 — 178 of 212 proactive rules have never fired (P0, the real reason the farmer sees so few alerts)
`proactive_rules` holds 212 active rules. Only **34** are in the compiled `{"all":[{op,path,value}]}` form that the evaluator's env-derived engine reads. The other **178** are in a legacy flat form (`{"temp_min":25,"humidity_min":80,…}`). Verified over 30 days: **0 alerts from any legacy rule.** That set includes **all 33 pest rules, 43 of 59 disease rules, all harvest, all fertilizer-window and all nutrition-timing rules.** The alerts you do see come from six compiled rules: FAO-56 irrigation trigger, NDVI drop, spray-window good/bad, disease episode onset/declining. So the early-warning layer for pests has been silent since day one — the rules and thresholds exist, they were just never compiled.
**Fix (migration `20260913100000`):** recompiles the seven rice rules whose legacy thresholds map one-to-one onto fact paths the engine already computes — BPH build-up, sheath blight, neck blast, false smut, bacterial leaf blight after wind-driven rain, lodging, heat at flowering. **Every number is the rule's own legacy value**; the legacy JSON is preserved under `legacy_source`; already-compiled rules are never touched. Four rice rules are deliberately left uncompiled because the engine has no fact for them (7-day rain forecast, grain moisture, district leafhopper sighting, stage-only gundhi) — listed in the file. 171 rules for other crops need the same treatment, crop by crop, after review.

### F2 — 98 junk alerts and 144 empty decisions in 30 days (P1, noise)
Alerts with `rule_id = 'weather_triggered'` (a placeholder, not a rule) fire a generic pesticide-safety knowledge blob as a low-priority "SPRAY_WINDOW" alert whenever weather matches nothing specific. They become `info:weather_triggered` decisions with evidence `{source: proactive_alerts}` and no field fact. The decision layer now ignores that key explicitly; the emitter itself lives in the evaluator's fallback path and should be silenced separately.

### F3 — The decision layer responded to only four situations (P1, the integration you asked for)
`decision-application.ts` handled irrigate/no-irrigation/no-data, spray window, and a priority bump on scouting. It did not: advance irrigation on confirmed stress unless the label was HIGH; bring a scouting card forward in **date** (only priority); defer fertilizer under heavy rain; act on a nutrient-deficiency signal; or distinguish onset from decline. **Fixed — v2.1.0**, using only decision keys and statuses the DB already emits; the test asserts the module holds no numeric threshold and reads no weather table directly.

### F4 — The whole layer is still not running (P0, unchanged from last week)
Live `schedule-reconciler` = **v12, engine 1.3.0** (no decision layer). `schedule_tasks.decision_state` column **missing** (migration `20260908120000` unapplied). Consequently `schedule_monitoring` 0 rows, `schedule_adjustments` 0, `auto_rescheduled` 0, `farm_decision.task_id` 0 — while decisions are derived every day (latest 12 Sept). Alerts fire; nothing consumes them.

## Part 3 — The integration, concretely (your two examples)
**"Static plan says water on 18 Sept; no rain and extreme heat since — the field needs water today."** The weather engine writes `water:irrigate` (FAO-56 depletion reached) and the satellite/heat engines write `observe:stress:PRO_NDVI_DROP` or a HEAT signal. v2.1.0 sees the deficit **and** the stress → `stressConfirmed` → the 18-Sept irrigation card moves to **today**, `decision_state = DUE`, the card's evidence names both decisions, and the farmer's app shows "give water today". Tomorrow, if it rained, `water:no_irrigation` defers it by its own cadence.

**"Pest/disease."** Neck blast weather fires (compiled rule, F1) → `scout:disease_risk:…` with ONSET → the tillering/booting scouting card moves to **today** at priority critical, already carrying "if you see neck blast lesions → apply <the DB rule's product> at <dose> per acre, wait <PHI> days". The farmer looks first and treats what he finds — which is what IPM and the pesticide label require. When the episode is DECLINING the card returns to its planned date and priority.

## Files
| File here | Repo path | Action |
|---|---|---|
| `supabase__functions__schedule-reconciler__decision-application.ts` | `…/decision-application.ts` | REPLACE → **v2.1.0** response table |
| `supabase__functions__schedule-reconciler__index.ts` | `…/index.ts` | unchanged (engine 1.5.0) — included because it must be deployed together |
| `supabase__migrations__20260913100000_compile_rice_proactive_rules.sql` | `supabase/migrations/…` | NEW — recompiles 7 silent rice rules |
| `supabase__migrations__20260908120000_schedule_decision_loop.sql` | `supabase/migrations/…` | unchanged — still unapplied, required first |
| `tests__edge__schedule__decision_loop_contract_test.ts` | `tests/edge/schedule/…` | +2 tests (response table; recompile safety) |

**Tests: 84 passed, 0 failed.** Both function files parse clean.

## Production sequence (each step needs your go)
1. Apply `20260908120000` (decision loop columns) — without it the function's writes fail.
2. Apply `20260913100000` (recompile the 7 rice rules) — turns on pest/disease early warning for rice.
3. Deploy `schedule-reconciler` (engine 1.5.0 + decision-application 2.1.0).
4. Dry run on the test land → live run → read `schedule_monitoring`, `schedule_adjustments`, `farm_decision.task_id`.
Nothing below is invented: every threshold is the rule's own, every date move is by the task's own DB cadence or window, and no spray is ever scheduled without a field check.
