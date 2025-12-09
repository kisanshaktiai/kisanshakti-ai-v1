# Offline Database Schema Audit Report

**Date:** 2025-12-09  
**Status:** CRITICAL DRIFT DETECTED  
**Priority:** P0 - Fix immediately

---

## Executive Summary

A deep audit of the codebase reveals **significant schema drift** between the online Supabase database and the offline LocalDB (IndexedDB). The LocalDB interfaces are missing 80+ columns across core tables, which causes data loss during sync operations.

---

## A. Architecture Overview

| Component | Technology | Location |
|-----------|------------|----------|
| Online DB | Supabase/PostgreSQL | Cloud |
| Offline DB | IndexedDB via `idb` | Browser |
| Schema Source | `src/integrations/supabase/types.ts` | Auto-generated |
| LocalDB Schema | `src/services/localDB.ts` | Manual (DRIFT!) |
| Sync Service | `src/services/syncService.ts` | Manual |

---

## B. Schema Comparison: Critical Issues

### Table 1: `crop_schedules` (Supabase) → `cropSchedules` (LocalDB)

**Severity: CRITICAL**  
**Impact: 70+ columns missing, data loss during sync**

| Status | Supabase Column | LocalDB Field | Issue |
|--------|-----------------|---------------|-------|
| ✅ | id | id | OK |
| ✅ | tenant_id | tenant_id | OK |
| ✅ | farmer_id | farmer_id | OK |
| ✅ | land_id | land_id | OK |
| ✅ | crop_name | crop_name | OK |
| ✅ | crop_variety | crop_variety | OK |
| ✅ | sowing_date | sowing_date | OK |
| ✅ | expected_harvest_date | expected_harvest_date | OK |
| ✅ | schedule_version | schedule_version | OK |
| ✅ | generated_at | generated_at | OK |
| ✅ | generation_language | generation_language | OK |
| ✅ | generation_params | generation_params | OK |
| ✅ | country | country | OK |
| ✅ | last_weather_update | last_weather_update | OK |
| ✅ | weather_data | weather_data | OK |
| ✅ | ai_model | ai_model | OK |
| ✅ | is_active | is_active | OK |
| ✅ | completed_at | completed_at | OK |
| ✅ | created_at | created_at | OK |
| ✅ | updated_at | updated_at | OK |
| ❌ | actual_harvest_date | MISSING | Data lost |
| ❌ | actual_profit | MISSING | Data lost |
| ❌ | actual_total_cost | MISSING | Data lost |
| ❌ | actual_yield_quintals | MISSING | Data lost |
| ❌ | agro_climatic_zone | MISSING | Data lost |
| ❌ | bio_fertilizer_units | MISSING | Data lost |
| ❌ | bio_pesticide_ml | MISSING | Data lost |
| ❌ | calculated_for_area_acres | MISSING | Data lost |
| ❌ | cost_by_category | MISSING | Data lost |
| ❌ | cost_by_stage | MISSING | Data lost |
| ❌ | data_quality_score | MISSING | Data lost |
| ❌ | district_name | MISSING | Data lost |
| ❌ | expected_gross_revenue | MISSING | Data lost |
| ❌ | expected_market_price_per_quintal | MISSING | Data lost |
| ❌ | expected_net_profit | MISSING | Data lost |
| ❌ | expected_profit | MISSING | Data lost |
| ❌ | expected_yield_per_acre | MISSING | Data lost |
| ❌ | expected_yield_quintals | MISSING | Data lost |
| ❌ | farmer_feedback | MISSING | Data lost |
| ❌ | farmer_rating | MISSING | Data lost |
| ❌ | farming_type | MISSING | Data lost |
| ❌ | fertilizer_k_kg | MISSING | Data lost |
| ❌ | fertilizer_n_kg | MISSING | Data lost |
| ❌ | fertilizer_p_kg | MISSING | Data lost |
| ❌ | fungicide_gm | MISSING | Data lost |
| ❌ | growth_regulators | MISSING | Data lost |
| ❌ | herbicide_ml | MISSING | Data lost |
| ❌ | input_land_coordinates | MISSING | Data lost |
| ❌ | input_soil_data | MISSING | Data lost |
| ❌ | input_weather_data | MISSING | Data lost |
| ❌ | insecticide_ml | MISSING | Data lost |
| ❌ | irrigation_count_total | MISSING | Data lost |
| ❌ | is_training_candidate | MISSING | Data lost |
| ❌ | labor_rate_used | MISSING | Data lost |
| ❌ | last_weather_check | MISSING | Data lost |
| ❌ | metadata | MISSING | Data lost |
| ❌ | organic_fertilizer_kg | MISSING | Data lost |
| ❌ | organic_input_details | MISSING | Data lost |
| ❌ | organic_manure_kg | MISSING | Data lost |
| ❌ | outcome_recorded_at | MISSING | Data lost |
| ❌ | pesticide_requirements | MISSING | Data lost |
| ❌ | pgr_hormone_ml | MISSING | Data lost |
| ❌ | products_recommended_count | MISSING | Data lost |
| ❌ | recommendation_order | MISSING | Data lost |
| ❌ | recommended_products | MISSING | Data lost |
| ❌ | regional_dialect_zone | MISSING | Data lost |
| ❌ | schedule_accuracy_score | MISSING | Data lost |
| ❌ | seed_quantity_kg | MISSING | Data lost |
| ❌ | stages_covered | MISSING | Data lost |
| ❌ | state_region | MISSING | Data lost |
| ❌ | status | MISSING | Data lost |
| ❌ | suitability_score | MISSING | Data lost |
| ❌ | suitability_warnings | MISSING | Data lost |
| ❌ | taluka_name | MISSING | Data lost |
| ❌ | tasks_completed_count | MISSING | Data lost |
| ❌ | tasks_on_time_count | MISSING | Data lost |
| ❌ | tasks_total_count | MISSING | Data lost |
| ❌ | total_duration_days | MISSING | Data lost |
| ❌ | total_estimated_cost | MISSING | Data lost |
| ❌ | total_labor_cost | MISSING | Data lost |
| ❌ | total_material_cost | MISSING | Data lost |
| ❌ | total_water_requirement_liters | MISSING | Data lost |
| ❌ | training_batch_id | MISSING | Data lost |
| ❌ | training_excluded_reason | MISSING | Data lost |
| ❌ | training_processed | MISSING | Data lost |
| ❌ | vermicompost_kg | MISSING | Data lost |
| ❌ | water_per_irrigation_liters | MISSING | Data lost |
| ❌ | water_requirement_liters_total | MISSING | Data lost |
| ❌ | weather_auto_update_enabled | MISSING | Data lost |
| ❌ | yield_boosting_techniques | MISSING | Data lost |
| ❌ | yield_multiplier_target | MISSING | Data lost |

### Table 2: `schedule_tasks` (Supabase) → `scheduleTasks` (LocalDB)

**Severity: CRITICAL**  
**Impact: 17 columns missing, task data incomplete offline**

| Status | Supabase Column | LocalDB Field | Issue |
|--------|-----------------|---------------|-------|
| ✅ | id | id | OK |
| ✅ | schedule_id | schedule_id | OK |
| ✅ | task_name | task_name | OK |
| ✅ | task_type | task_type | OK |
| ✅ | task_date | task_date | OK |
| ✅ | task_description | task_description | OK |
| ✅ | duration_hours | duration_hours | OK |
| ✅ | priority | priority | OK |
| ✅ | weather_dependent | weather_dependent | OK |
| ✅ | resources | resources | OK |
| ✅ | estimated_cost | estimated_cost | OK |
| ✅ | currency | currency | OK |
| ✅ | instructions | instructions | OK |
| ✅ | precautions | precautions | OK |
| ✅ | ideal_weather | ideal_weather | OK |
| ✅ | weather_risk_level | weather_risk_level | OK |
| ✅ | status | status | OK |
| ✅ | completed_at | completed_at | OK |
| ✅ | completed_by | completed_by | OK |
| ✅ | completion_notes | completion_notes | OK |
| ✅ | original_date | original_date | OK |
| ✅ | reschedule_reason | reschedule_reason | OK |
| ✅ | auto_rescheduled | auto_rescheduled | OK |
| ✅ | climate_adjusted | climate_adjusted | OK |
| ✅ | original_date_before_climate_adjust | original_date_before_climate_adjust | OK |
| ✅ | climate_adjustment_reason | climate_adjustment_reason | OK |
| ✅ | language | language | OK |
| ✅ | created_at | created_at | OK |
| ✅ | updated_at | updated_at | OK |
| ❌ | tenant_id | MISSING | Security issue |
| ❌ | farmer_id | MISSING | Security issue |
| ❌ | days_from_sowing | MISSING | Data lost |
| ❌ | detailed_steps | MISSING | Data lost |
| ❌ | product_recommendations | MISSING | Data lost |
| ❌ | product_type | MISSING | Data lost |
| ❌ | regional_terms | MISSING | Data lost |
| ❌ | sequence_order | MISSING | Data lost |
| ❌ | skip_penalty | MISSING | Data lost |
| ❌ | skip_penalty_details | MISSING | Data lost |
| ❌ | stage_key | MISSING | Data lost |
| ❌ | stage_name | MISSING | Data lost |
| ❌ | stage_order | MISSING | Data lost |
| ❌ | water_required_liters | MISSING | Data lost |
| ❌ | yield_boost_technique | MISSING | Data lost |
| ❌ | yield_impact | MISSING | Data lost |
| ❌ | yield_impact_details | MISSING | Data lost |

---

## C. Sync Service Issues

### Issue 1: Schedule Tasks Not Downloaded

**File:** `src/services/syncService.ts`  
**Method:** `downloadServerData()`  
**Status:** ❌ MISSING

The sync service downloads:
- ✅ Farmers
- ✅ Lands
- ✅ Schedules
- ❌ **Schedule Tasks** (MISSING!)

This means:
- Users see schedule titles offline
- But task lists are EMPTY offline
- Critical for agricultural planning!

### Issue 2: Incomplete Schedule Mapping

The schedule sync saves only basic fields, missing all extended data like costs, yields, fertilizer requirements.

---

## D. Recommended Fixes

### Priority 1: Update LocalDB Interfaces (P0)

Update `src/services/localDB.ts`:
1. Extend `CropScheduleData` to match Supabase schema
2. Extend `ScheduleTaskData` to include missing fields
3. Add `tenant_id` and `farmer_id` to tasks for isolation

### Priority 2: Fix Sync Service (P0)

Update `src/services/syncService.ts`:
1. Add `downloadScheduleTasks()` method
2. Update schedule mapping to include all fields
3. Update task mapping to include all fields

### Priority 3: Bump Schema Version (P0)

Increment `SCHEMA_VERSION` in `localDB.ts` to force data refresh on all clients.

---

## E. Implementation Checklist

- [ ] Update `CropScheduleData` interface (70+ fields)
- [ ] Update `ScheduleTaskData` interface (17 fields)
- [ ] Add `scheduleTasks` to index with tenant/farmer
- [ ] Add task download to sync service
- [ ] Update schedule sync mapping
- [ ] Bump DB_VERSION and SCHEMA_VERSION
- [ ] Test offline functionality
- [ ] Verify data integrity post-sync

---

## F. Rollback Plan

If issues occur:
1. Revert localDB.ts changes
2. Reset DB_VERSION to previous
3. Users' local data will be cleared on next load
4. Fresh sync from server

---

**Report Generated By:** Deep Audit System  
**Files Analyzed:** 15+  
**Tables Compared:** 8  
**Columns Audited:** 200+
