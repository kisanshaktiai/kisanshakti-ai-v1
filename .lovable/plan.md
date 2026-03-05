

# Deterministic Agronomic Response System Hardening — Implementation Plan

## Current State Assessment

The `deterministic-response-builder.ts` module was created in the previous iteration but is **NOT INTEGRATED** into the pipeline. Zero references exist from orchestrator or LLM formatter. The LLM formatter still manually constructs prompts from `application_details` in its `buildRecommendationSummary()` function, duplicating logic and missing the structured deterministic output.

The rich agronomic fields ARE being propagated through: `loader.ts` → `layered-rule-evaluator.ts` → `PrimaryDecision` → `orchestrator.ts` → `application_details`. However, the deterministic builder sits unused.

## Architecture Changes (6 Modules)

### Module 1: Integrate Deterministic Response Builder into LLM Formatter

**File:** `llm-response-formatter.ts`

In `buildRecommendationSummary()` (line ~1293), when a `primary_decision` exists with rich data:

1. Import `buildDeterministicResponse`, `formatStructuredResponseForLLM` from `deterministic-response-builder.ts`
2. Extract rich fields from `primary.application_details` into a `RichRuleData` object
3. Call `buildDeterministicResponse(richData, landAreaAcres)` to get the `StructuredFarmerResponse`
4. Call `formatStructuredResponseForLLM(structuredResponse)` to generate the prompt text
5. Use this output **instead of** the current manual prompt assembly (lines 1300-1520)
6. This replaces ~220 lines of manual prompt construction with the deterministic builder

The template fallback path (`buildTemplateFallback`, line ~1693) will also use the deterministic builder when a `primary_decision` exists, ensuring both LLM and fallback paths produce structured, rule-sourced content.

### Module 2: Strengthen Dose Calculation Engine

**File:** `deterministic-response-builder.ts`

Add three safety validators within `buildDeterministicResponse()`:

1. **Active Ingredient Dose Cap** — New function `validateDosageSafety(ruleData, landArea)`:
   - If `active_ingredient` and `dosage_per_acre` exist, parse the numeric dose
   - Compare against `MAX_SAFE_DOSES` lookup (a static map of known active ingredients to max dose/ha)
   - If `calculated_total > max_safe_limit`, set `dosage.blocked = true` and add a safety warning string
   - Block the recommendation and return a safety notice instead of the dose

2. **PHI Harvest Proximity Check** — New function `validatePHISafety(phiDays, daysSinceSowing, cropDuration)`:
   - Calculate `days_to_harvest = cropDuration - daysSinceSowing`
   - If `phi_days > days_to_harvest`, add `safety.phi_blocked = true` with instruction
   - This prevents chemical treatment near harvest

3. **Spray Volume Optimization** — Enhance the dosage section:
   - If `application_method` contains 'knapsack' or 'power sprayer', adjust water volume display
   - Include `water_volume_per_acre` context with spray type recommendation

### Module 3: Environmental Condition Pre-Validation

**File:** `deterministic-response-builder.ts` (new function) + `layered-rule-evaluator.ts`

Add `validateEnvironmentalConditions()`:
- Takes `ruleData.rain_delay_hours`, `min_temperature`, `max_temperature`, `max_wind_speed`
- Takes current weather context (temperature, rain forecast, wind)
- Returns `{ spray_allowed: boolean, reason: string, instruction: string }`
- If `rain_delay_hours > 0` and rain is forecasted within that window, add environmental warning
- If current temp is outside min/max range, add spray timing advisory

This is added as a new section in the `StructuredFarmerResponse` and displayed in the environment section.

### Module 4: Agronomic Safety Validator Layer

**File:** `deterministic-response-builder.ts` (new exported function)

Add `validateAgronomicSafety()` that runs before response generation:

1. **Resistance Rotation** — Already exists in `safety-enhancement.ts`. Wire `resistance_group` from the rule into the existing `checkResistanceRotation()`. Add the result as a warning in the safety section.

2. **Bee Safety Enhancement** — If `bee_toxicity === 'HIGH'`, add mandatory evening-spray instruction to the spray window section (already partially exists; ensure it's always prominent).

3. **Combined Safety Score** — New field `safety_score: number` (0-1) based on:
   - PHI compliance (0.3 weight)
   - Bee toxicity (0.2 weight)  
   - Regulatory status (0.3 weight)
   - Resistance rotation (0.2 weight)
   - If `safety_score < 0.5`, downgrade response to monitoring-only

### Module 5: Confidence-Based Response Gating

**File:** `deterministic-response-builder.ts`

Add response-level confidence logic:

1. New field in `StructuredFarmerResponse`: `response_decision: 'TREAT' | 'MONITOR' | 'CLARIFY'`
2. Based on:
   - `ruleData.confidence_score >= 0.7` → TREAT (full recommendation)
   - `0.5 <= confidence < 0.7` → MONITOR (observation only, no product)
   - `confidence < 0.5` → CLARIFY (request more observations)
3. When mode is MONITOR or CLARIFY:
   - Suppress dosage, cost, and ROI sections
   - Only show problem explanation and monitoring instructions
   - Add "More crop observations are required before giving treatment advice"

### Module 6: Rule Conflict Resolution Enhancement

**File:** `layered-rule-evaluator.ts` (enhance existing selection)

The existing priority sort (line ~850) already handles: `data_authority_rank → evidenceScore → priority → confidence_score`. Add one more layer:

1. Add `CATEGORY_PRIORITY_MAP` for rule conflict resolution:
   - SAFETY_GATE: priority 100 (always wins)
   - PEST/DISEASE treatment: priority 80
   - NUTRIENT deficiency: priority 60
   - GROWTH management: priority 40
   - MONITORING: priority 20

2. Apply as a pre-sort factor before `data_authority_rank`, ensuring CRITICAL safety rules always surface first even if their evidence score is lower.

## Response Section Order (enforced in builder)

The `formatStructuredResponseForLLM` already outputs sections in the correct order. Verify and lock this:

```
1. Problem Identification (cause, explanation)
2. Recommended Action (action_text, treatment_type)
3. Dosage for Your Field (calculated total)
4. Spray Method (application_method)
5. Safety Precautions (PHI, bee, reentry)
6. Organic Alternative (organic_alternative, ipm_level)
7. Estimated Cost (total material + labor)
8. Monitoring Instructions (success/failure indicators)
```

Scientific references stay in the `reference` section (audit-only, not in farmer display).

## Missing Knowledge Layers (2030-Ready Assessment)

These are identified gaps but NOT implemented in this phase — documented for roadmap:

1. **Pest Lifecycle Ontology** — No table for pest lifecycle stages, generation cycles, temperature thresholds
2. **Crop Nutrition Decision Graph** — No stage-wise NPK schedule engine; nutrition rules exist but lack temporal scheduling
3. **Irrigation Intelligence** — No ETc-based irrigation rules; `weather_dependency` exists but no irrigation-specific calculations
4. **Regional Rule Overrides** — No `region` or `agro_climatic_zone` filter in rule evaluation; rules are national-level only

## Files Modified

| File | Change |
|------|--------|
| `deterministic-response-builder.ts` | Add dose safety validation, PHI check, environmental validation, confidence gating, safety scoring |
| `llm-response-formatter.ts` | Integrate deterministic builder into `buildRecommendationSummary()` and `buildTemplateFallback()` |
| `layered-rule-evaluator.ts` | Add category-based conflict resolution pre-sort |

## Verification Checklist

- All agronomic content comes from `decision_rules` columns
- LLM prompt contains only structured builder output (not manual assembly)
- Dose is always land-size aware with safety caps
- PHI is validated against harvest proximity
- Bee toxicity triggers mandatory evening-spray advisory
- Confidence < threshold produces monitoring-only response
- No hardcoded mr/hi text added

