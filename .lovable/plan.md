


# Proactive Neuro-Symbolic Intelligence System — Production-Ready Upgrade Plan

## Current State Assessment

**Working**: Frontend inbox, 10 template rules, 6 condition types, dedup/throttle, trilingual fields, TTS, priority sorting, 5-state lifecycle.

**Broken**: `crop_schedules` query uses `crop_code` (correct: `crop_name`). `ndvi_data` query uses `recorded_at` (correct: `date`). No trigger/cron exists. No realtime push. N*M sequential DB queries will timeout at scale.

**Missing**: Soil NPK/pH/OC signals. 72h forecast rain probability. GDD accumulation. 578 `decision_rules` completely disconnected. Stage computation hardcoded to 4 crops. No "Why this alert?" evidence display. No chat deeplink CTA. No realtime subscription.

---

## Execution Plan (7 Steps, Priority Order)

### Step 1: Fix Critical Schema Bugs + Batch Query Pattern (G4 + data fixes) ✅ DONE

**File**: `supabase/functions/proactive-evaluator/index.ts`

- Fix `crop_schedules` query: `crop_code` → `crop_name`
- Fix `ndvi_data` query: `recorded_at` → `date`
- **Batch-load all dedup/cooldown data upfront**: Single query to load all recent alerts for all `land_ids` in the last 72h into a `Map<string, Alert[]>`. All dedup, cooldown, and daily-count checks happen in-memory. Eliminates the N*M sequential DB round-trip problem.
- Batch-load weather for all unique `location_key`s in one query
- Batch-load NDVI for all `land_ids` in one query
- Batch-load soil health for all `land_ids` in one query

### Step 2: Extend LandContext with Missing Signals (G1) ✅ DONE

**File**: `supabase/functions/proactive-evaluator/index.ts`

Add to `LandContext`:
- `soil_n`, `soil_p`, `soil_k`, `soil_ph`, `organic_carbon` — from `soil_health` table (batch-loaded per land_id)
- `forecast_rain_probability_72h` — from `weather_forecasts` table (max `rain_probability_percent` in next 72h)
- `gdd_accumulated` — computed from `weather_forecasts.growing_degree_days` or calculated from daily temp data

Add corresponding evaluation logic in `evaluateRule()`:
- `SOIL` condition type: evaluate `soil_n_min`, `soil_ph_min/max`, `organic_carbon_min` thresholds
- Extend `DISEASE_RISK`/`COMPOUND` to check `forecast_rain_probability_72h`
- Extend `PEST_RISK` to use GDD accumulation instead of simple DAS+temp

### Step 3: Bridge `decision_rules` to Proactive Engine (G2) ✅ DONE

**File**: `supabase/functions/proactive-evaluator/index.ts`

- Load rules from `decision_rules` WHERE `is_proactive_rule = true AND is_active = true`, filtered by crop_code and stage
- Map `decision_rules` fields to the evaluation interface: `conditions_json` → conditions, `etl_value_min/max` for ETL threshold checks, `phi_days` for spray-window timing
- Evaluate in priority order (SAFETY > URGENT > TREATMENT > NUTRIENT > MONITORING)
- Merge fired `decision_rules` into the same alert pipeline alongside `proactive_rules`
- Use `rule_id` from `decision_rules` as the `rule_id` field in generated alerts

### Step 4: Dynamic Stage Computation (G3) ✅ DONE

**File**: `supabase/functions/proactive-evaluator/index.ts`

- Replace hardcoded `computeStage()` with a database-driven approach
- Query `intent_observation_mapping` for `crop_code` × `das_min/das_max` × `growth_stage` to resolve the correct stage
- Fallback to hardcoded table only if no DB mapping exists
- Support all crops in the system, not just 4

### Step 5: Realtime Push + "Why this alert?" + Chat Deeplink (G7 + G6 partial) ✅ DONE

**File**: `src/hooks/useProactiveAlerts.ts`
- Add Supabase realtime channel subscription for `proactive_alerts` INSERT events filtered by `farmer_id`
- Auto-append new alerts to state and increment unread count

**File**: `src/pages/ProactiveAlerts.tsx`
- Add expandable "Why this alert?" section rendering `trigger_data` and `decision_reasoning` in human-readable form (e.g., "Temperature: 39°C exceeds 35°C threshold", "Humidity: 88% creates disease-favorable conditions")
- Add inline CTA button: "Ask AI about this" that navigates to `/app/chat` with pre-filled query based on alert category + crop + land name
- Add land name display on each alert card so farmer knows which field

### Step 6: Set Up Cron Trigger (Production Activation) ✅ DONE

**Database**: Use `pg_cron` + `pg_net` to schedule the evaluator
- Schedule: every 15 minutes during 5AM-9PM IST (farmer active hours), every 60 minutes at night
- Call `proactive-evaluator` with `action: 'scheduled'`
- This is a data INSERT operation (cron.schedule), not a schema migration

### Step 7: Neural Enrichment for High-Risk Alerts (G6) ✅ DONE

**File**: `supabase/functions/proactive-evaluator/index.ts`

- For alerts where `risk_score >= 70` OR `priority === 'CRITICAL'`, call Lovable AI (Gemini Flash) with a structured prompt containing:
  - Rule's `reason_text`, `knowledge_text`, `action_text`
  - Land's crop + stage + DAS + weather values
  - Evidence values from trigger_data
- Ask it to return trilingual title/message/action (mr, hi, en) with farmer-friendly language
- For lower-risk alerts, continue using existing template system
- Cost-bounded: only enriches ~10-20% of alerts

---

## Phase 2: conditions_json Parser + Rule Enablement ✅ DONE

### N1: Bulk-enable proactive rules (DB UPDATE) ✅ DONE
- 124 decision_rules now have `is_proactive_rule = true` and `forecast_horizon_days = 3`
- Categories: pest, disease, nutrition, irrigation, stress, weather, safety, stage_problems, physiology, soil

### N2: conditions_json format parser ✅ DONE
- Added `parseDecisionRuleConditions()` that translates:
  - `"humidity": ">80%"` → `humidity_min: 80`
  - `"temperature": "22-28C"` → `temp_min: 22, temp_max: 28`
  - `"temperature_c": ">38"` → `temp_min: 38`
  - `"frost": true` → frost check at ≤5°C
  - `"soil_moisture": "excess"` → rain/humidity proxy
  - `"high_humidity": true` → `humidity_min: 80`

### N3: GDD computation ✅ DONE
- Added `batchLoadGDD()` to sum `growing_degree_days` from `weather_forecasts` over last 30 days
- GDD now feeds into pest emergence rules

### N4: Category mappings ✅ DONE
- Extended `mapDecisionCategory()` to map all 14 categories to valid DB check constraint values
- Added `mapDecisionEventType()` for proactive_events table

---

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/proactive-evaluator/index.ts` | Complete rewrite: batch queries, extended LandContext (soil/GDD/forecast), decision_rules bridge, dynamic stage, neural enrichment, conditions_json parser |
| `src/hooks/useProactiveAlerts.ts` | Add Supabase realtime subscription, land_name in interface |
| `src/pages/ProactiveAlerts.tsx` | "Why this alert?" expandable, chat deeplink CTA, land name display |
| `src/components/proactive/AlertEvidenceSection.tsx` | New component for evidence display |
| Database (INSERT via tool) | `pg_cron` schedule for evaluator trigger |
| Database (migration) | Bulk-enable 124 decision_rules as proactive |

## What This Does NOT Change

- No modifications to existing AI Chat pipeline
- No changes to existing crop schedule system
- No changes to `decision_rules` data (only reads `is_proactive_rule = true`)
- No new database tables or schema changes
- No changes to LLM formatter or narration layer
