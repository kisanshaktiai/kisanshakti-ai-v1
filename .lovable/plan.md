

# Fix Plan: 3 Critical Silent Failures in Decision Brain

## Verified Bug Status (All 3 Confirmed Still Present)

| Bug | File | Root Cause | DB Schema Verified |
|-----|------|-----------|-------------------|
| **Bug 1** | `baseline-guidelines-cache.ts` | Selects `irrigation_critical`, `key_activities`, `common_problems` — none exist in DB | DB has: `critical_moisture_percent`, `notes`, `water_requirement_mm` |
| **Bug 2** | `crop-synonyms-cache.ts` | Selects `crop_code`, `synonym` — neither exists in DB | DB has: `canonical_crop`, `variant_name`, `variant_type`, `region` |
| **Bug 3** | `orchestrator.ts:5999-6120` | `layeredRuleResult.rules_applied` never copied to `decisionOutput.rules_applied` | PHASE-19 photo gate misfires on every session |

All three bugs produce **silent failures** — no crash, no visible error, just degraded behavior.

---

## Task 1: Fix `baseline-guidelines-cache.ts`

**Interface change** — replace 3 wrong fields with correct DB columns, add micronutrient and soil fields:

```
REMOVE: irrigation_critical: boolean, key_activities: string|null, common_problems: string|null
ADD: critical_moisture_percent: number|null, water_requirement_mm: number|null, notes: string|null,
     sulphur_optimal: number|null, zinc_optimal: number|null, iron_optimal: number|null,
     soil_ph_min: number|null, soil_ph_max: number|null, soil_ec_max: number|null
```

**Select query** — align with actual DB columns (all 27 rows, 5 crops):

```sql
crop_code, growth_stage, das_start, das_end, nitrogen_optimal, phosphorus_optimal,
potassium_optimal, sulphur_optimal, zinc_optimal, iron_optimal, irrigation_interval_days,
water_requirement_mm, critical_moisture_percent, soil_ph_min, soil_ph_max, soil_ec_max,
notes, source_reference
```

Add explicit error logging with column detail so future schema mismatches are immediately visible.

## Task 2: Fix `crop-synonyms-cache.ts`

**Interface change**:
```
RENAME: crop_code → canonical_crop, synonym → variant_name
ADD: variant_type: string, region: string|null
```

**Select query**: `canonical_crop, variant_name, language_code, variant_type, region`

**Mapping**: `map.set(row.variant_name.toLowerCase(), row.canonical_crop)`

## Task 3: Fix `rules_applied` propagation in `orchestrator.ts`

After line 6119 (end of the layeredRuleResult copy block), add:

```typescript
if (layeredRuleResult.rules_applied && layeredRuleResult.rules_applied.length > 0) {
  decisionOutput.rules_applied = layeredRuleResult.rules_applied.map(ruleId => ({
    rule_id: ruleId,
    rule_file: 'layered-evaluator',
    priority: 'P5_IPM',
    result: 'RECOMMEND',
    confidence: layeredRuleResult.confidence_in_result ?? 0.7
  }));
}
```

This fixes PHASE-19 photo gate (line 6322) which incorrectly fires when `rulesAppliedCount === 0` despite 11+ rules matching.

## Task 4: Update plan.md

Add these fixes to the completion log and mark Bug 1/2/3 as resolved.

## Task 5: Deploy edge function

Redeploy `ai-agriculture-chat` and verify logs show:
- `[BASELINE] Loaded 27 guidelines for 5 crops`
- `[CROP_SYNONYMS] Loaded 193 synonyms from DB`
- `rules_applied: 11+` (not 0)

