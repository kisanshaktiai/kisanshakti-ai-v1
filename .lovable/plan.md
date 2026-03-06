

# Production Bug Fix: Deterministic Response Builder Not Activating

## Root Cause Analysis

The deterministic response builder (`deterministic-response-builder.ts`) exists and is integrated into `llm-response-formatter.ts`, but it receives **empty data** for most rich agronomic fields because of 4 broken data propagation paths.

### Bug Map

```text
decision_rules DB (50+ columns loaded)
       │
       ▼
loader.ts ── ExecutableRule (✅ all fields present)
       │
       ▼
convertBundledToRule() ── action_details (✅ all fields mapped)
       │
       ├──► DIAGNOSIS phase push (lines 438-448)   ❌ ONLY 4 fields
       ├──► PRESCRIPTION phase push (lines 594-649) ✅ ALL fields
       └──► BLOCKED path push (lines 670-678)       ❌ ONLY 4 fields
       │
       ▼
PrimaryDecision interface (lines 232-247)           ❌ Missing 45+ field declarations
       │
       ▼
orchestrator.ts OPTION_SELECTED path (lines 1855-63) ❌ ONLY 5 fields in application_details
orchestrator.ts recovery path (lines 5834-5860)      ⚠️ Partial (15 fields)
       │
       ▼
extractRichRuleData() reads from primary_decision    ❌ Gets nulls for most fields
       │
       ▼
hasAdequateRuleContent() → passes (needs only action_text/reason_text)
       │
       ▼
buildDeterministicResponse() → dosage/safety/cost sections ALL EMPTY
       │
       ▼
LLM gets skeleton prompt → generates old-format response
```

## Fixes Required (3 files, 4 bugs)

### Fix 1: `layered-rule-evaluator.ts` — DIAGNOSIS phase push (lines 438-448)

Add ALL 50+ rich fields from `actionDetails` to the DIAGNOSIS-phase `matched_responses.push()` — identical to how PRESCRIPTION-phase does it (lines 604-648).

Currently:
```typescript
result.matched_responses.push({
  rule_id, cause, action_type, priority, confidence_score,
  action_text, reason_text, knowledge_text, i18n_key, conditions_json
});
```

Must add: `active_ingredient`, `dosage_per_acre`, `water_volume_per_acre`, `application_method`, `phi_days`, `bee_toxicity`, `organic_alternative`, `chemical_class`, `mode_of_action`, `resistance_group`, `reentry_interval_hours`, `material_cost_per_acre_min/max`, `roi_yield_gain_pct`, `success_indicators`, `failure_indicators`, and all other rich fields — sourced from `actionDetails` (which comes from `rule.then.action_details`).

### Fix 2: `layered-rule-evaluator.ts` — BLOCKED path push (lines 670-678)

Same fix as Fix 1: propagate all rich fields from `blockedActionDetails` into the blocked-path `matched_responses.push()`.

### Fix 3: `layered-rule-evaluator.ts` — PrimaryDecision interface (lines 232-247)

Extend the `PrimaryDecision` interface to include all 50+ fields that are already being assigned at lines 927-947. This prevents TypeScript from silently dropping them and ensures downstream consumers can access them with type safety.

### Fix 4: `orchestrator.ts` — OPTION_SELECTED path (lines 1855-1863)

The `application_details` object in the OPTION_SELECTED path only propagates `product_name`, `product_type`, `action_text`, `reason_text`, `knowledge_text`, `i18n_key`, `rule_id`. It must propagate ALL rich fields from `layeredPrimaryDecision` — matching the recovery path pattern at lines 5834-5860 which already does this (partially).

Add to the OPTION_SELECTED `application_details`:
- `active_ingredient`, `dosage_per_acre`, `cause`
- `organic_alternative`, `phi_days`, `bee_toxicity`
- `application_method`, `water_volume_per_acre`
- `mode_of_action`, `chemical_class`, `resistance_group`
- `target_pest_stage`, `success_indicators`, `failure_indicators`
- `roi_yield_gain_pct`, `reentry_interval_hours`
- `material_cost_per_acre_min/max`, `labor_cost_per_acre_min/max`
- `scientific_basis`, `aquatic_toxicity`, `regulatory_status`

### Fix 5: `orchestrator.ts` — Recovery path (lines 5834-5860)

Add missing fields that are in `deterministic-response-builder.ts` `RichRuleData` but not in the recovery path's `application_details`:
- `scientific_basis`, `treatment_type`, `biological_group`
- `farmer_safety_level`, `aquatic_toxicity`, `regulatory_status`
- `material_cost_per_acre_min/max`, `labor_cost_per_acre_min/max`
- `labor_hours_per_acre`, `equipment_required`, `equipment_cost_per_acre`
- `total_cost_estimated`, `roi_cost_saved_min/max`, `roi_net_score`, `roi_confidence`
- `min_temperature`, `max_temperature`, `max_wind_speed`, `rain_delay_hours`
- `weather_dependency`, `icar_package_ref`, `university_source`
- `risk_level`, `response_severity`, `data_authority_rank`

## Verification

After fixes, the data pipeline will be:
```text
DB → loader → action_details (✅) → ALL push paths (✅) → PrimaryDecision (✅)
→ orchestrator application_details (✅) → extractRichRuleData (✅)
→ buildDeterministicResponse → structured sections with real data
```

The edge function will be redeployed after all fixes.

