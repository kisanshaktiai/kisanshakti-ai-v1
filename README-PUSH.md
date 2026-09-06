# Crop schedule — static completeness + dynamic field-condition layer (rev 4, 2026-09-05)
Repo **kisanshaktiai/kisanshakti-ai-v1**, branch **kisanshakti-ai-update**, base **45ea490c**. Supersedes rev 3 (never pushed). Two existing functions touched, no new function.

## Design in one line
**Static plan = LLM composes from DB evidence (Harness). Dynamic plan = the DB weather/NDVI engines decide, the reconciler applies.** No agronomic threshold lives in code; every "skip water today / don't spray today / scout now" comes from a `land_weather_state` or `land_farm_state` row that already exists and is refreshed daily.

## A. Static schedule (ai-smart-schedule)
| # | Path | Action | What it does |
|---|---|---|---|
| 1 | `supabase/functions/ai-smart-schedule/harness/llm-v3.ts` | REPLACE | Deadline-aware planner, one attempt per provider, no sleeps; composition contract in the prompt; **new `domain_coverage` self-check** — the model must classify all 16 audited domains (SCHEDULED / CONDITIONAL / MONITOR / NOT_REQUIRED / INSUFFICIENT_DATA / NO_AUTHORITATIVE_RULE) consistent with its sequence. Same schema id; validator untouched. |
| 2 | `supabase/functions/ai-smart-schedule/harness/types.ts` | REPLACE | `PlanIntent.domain_coverage?` (optional; ignored by the validator). |
| 3 | `supabase/functions/ai-smart-schedule/harness/index.ts` | REPLACE | Budgeted planner; fallback retains DB-classified CONDITIONAL candidates + SCHEDULED candidates for uncovered task types; `resources.harness` on each task; `domain_coverage` in the trace. |
| 4 | `supabase/functions/ai-smart-schedule/harness/evidence-pack.ts` | REPLACE | Treatment rules no longer hidden by scouting references; farmer steps from rule fields; micronutrient 0 = NOT_REQUIRED; `NO_AUTHORITATIVE_RULE:<DOMAIN>` gaps. |
| 5 | `supabase/functions/ai-smart-schedule/generator/baseline-generator.ts` | REPLACE (v1.6.0) | Fertilizer row by method/stage clock; basal split re-anchored via DB clock origins (recorded); nutrient basis; product-equivalent kg from `master_products.nutrient_analysis`. |
| 6 | `supabase/functions/ai-smart-schedule/db/agronomy-repo.ts` | REPLACE | `getFertilizerPlan(methodTokens)`, `getCropClockOrigins`, `getStraightFertilizerProducts`, `getLaborRate` on real columns. |
| 7 | `supabase/functions/ai-smart-schedule/index.ts` | REPLACE | Harness budget from the single deadline (narration keeps ≥45 s); evidence gaps merged into `metadata.gaps`; `time_plan`. Your fail-closed narration is untouched. |

## B. Dynamic schedule (schedule-reconciler)
| # | Path | Action | What it does |
|---|---|---|---|
| 8 | `supabase/functions/schedule-reconciler/weather-adaptation.ts` | NEW module | **DEFER** irrigation due today/tomorrow when `irrigation_needed=false` (rain covered the deficit) by the task's own cadence; **ADVANCE** the next irrigation to today when `irrigation_urgency=HIGH` and its DB window has opened; **DEFER** spray/spread/foliar tasks due today when the day's `spray_window` has no `good` slot (one day at a time, never past the stage window — flagged instead); **FLAG/UNFLAG** the scouting task covering today on `disease_risk_level` HIGH/CRITICAL, `crop_stress_level≠NONE`, or NDVI `canopy.vs_expected='below'`. Pinned tasks never touched; every change → `schedule_adjustments` with the evidence row. |
| 9 | `supabase/functions/schedule-reconciler/index.ts` | REPLACE (v1.4.0) | Field-condition layer now runs for **every** SSOT-coherent schedule, before the phenology/provisional gates (live: 11/12 schedules were skipped before any weather logic ran). Stage-drift shifts still require biological evidence. Writes an `edge_invocation_logs` row per run. |

## C. Migration + tests
| 10 | `supabase/migrations/20260905100000_crop_schedule_language_and_governance_fix.sql` | NEW | Sync trigger stops overwriting `language`; variety-gap trigger → `metadata.gaps`; governance trigger accepts farmer OR stage-clock method; repairs stamped rows; `sowing_date → lands.planting_date` for anchorless active lands. |
| 11 | `tests/edge/schedule/schedule_completeness_contract_test.ts` | NEW | Locks all of the above, incl. "weather layer before biology gate" and "no numeric thresholds in the adaptation module". |

## Order
Push 1–11 → apply migration → redeploy `ai-smart-schedule` and `schedule-reconciler` → regenerate the test-land schedule → invoke the reconciler once (`{"landId":"<land>"}`) and read `schedule_adjustments` / `edge_invocation_logs`.

## What a farmer will now experience
- Day-0 basal fertilizer with a buyable quantity ("22.4 kg Urea (46% N)"), then top-dresses by stage.
- Pest/disease/weed cards at the right stage that say **"Only if: <threshold> — Apply: <ingredient>, <dose> per acre by <method> — Wait N days before harvest"**, in Marathi.
- Irrigation that steps aside after rain and comes forward on a dry spell; sprays that wait for a usable day; scouting that jumps to high priority the day disease risk or NDVI says so — each with a reason and the evidence date.
- Honest gaps instead of silence: `NO_AUTHORITATIVE_RULE:PGR`, `micronutrient_dose_not_authoritative` — these are content work in `decision_rules` / `crop_baseline_guidelines_v2`, not code.
