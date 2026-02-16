
# Critical Bug Audit Report: Symbolic Decision Brain

## CRITICAL P0 BUG: Symbolic Brain Output Silently Dropped (Property Name Mismatch)

This is the root cause of "responses not changing" -- the entire symbolic rule engine fires rules correctly, but its output is **silently ignored** by the orchestrator due to property name mismatches between the `InferenceResult` interface and the orchestrator's consumption code.

### The Problem

The `InferenceResult` interface (in `symbolic-reasoner.ts`) uses **snake_case** property names:

```text
interface InferenceResult {
  rules_fired: number;        // snake_case
  recommendations: FiredRule[];  // array of FiredRule
  diagnosis: Hypothesis | null;  // Hypothesis.cause_name
}

interface Hypothesis {
  cause_name: string;   // NOT "cause"
  cause_id: string;     // NOT "ruleId"
}
```

But the orchestrator (line 4502+) reads **camelCase** properties that do not exist:

```text
symbolicResult.rulesFired        --> undefined (should be rules_fired)
symbolicResult.firedRuleIds      --> undefined (should be recommendations.map(r => r.rule_id))
symbolicResult.firedRules        --> undefined (should be recommendations)
symbolicResult.diagnosis?.cause  --> undefined (should be diagnosis?.cause_name)
symbolicResult.diagnosis?.ruleId --> undefined (doesn't exist on Hypothesis)
```

### Impact

The check `if (symbolicResult.rulesFired > 0)` on line 4502 always evaluates to `false` because `undefined > 0 === false`. This means:
- ALL symbolic rule results are silently dropped
- The system falls through to fallback/monitoring responses
- The farmer gets generic advice instead of rule-based recommendations
- All the previous bug fixes (pest exclusion, category priority, numeric thresholds) are working but their output never reaches the farmer

This explains why the user reports "the issue is still not resolved" -- the symbolic brain works correctly internally, but its results are never consumed.

---

## CRITICAL P0 BUG 2: `center_lng` Typo (Coordinates Never Reach Symbolic Brain)

On line 4419 of `orchestrator.ts`, the code reads `landContext.center_lng` but `fetchComprehensiveLandContext` (line 5875) stores the value as `center_lon`. This means `longitude` is always `null` in the authoritative state passed to the symbolic brain, breaking all weather-based and location-based rule conditions.

---

## P1 BUG 3: `soil_texture` vs `texture` in Authoritative State Builder

On line 4439, the orchestrator reads `landContext.soil_health?.soil_texture` but `fetchComprehensiveLandContext` (line 5890) stores it as `texture`. Soil texture is always null in rule evaluation.

---

## Implementation Plan

### File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

All fixes are in the orchestrator's consumption of the `InferenceResult`:

**Fix 1 (Lines 4502-4507):** Replace all camelCase property access with correct snake_case:

```text
BEFORE:
  if (symbolicResult.rulesFired > 0) {
    console.log(`Symbolic Reasoner fired ${symbolicResult.rulesFired} rules`);
    layeredRuleResult.rules_matched = symbolicResult.rulesFired;
    layeredRuleResult.rules_applied = symbolicResult.firedRuleIds || [];

AFTER:
  if (symbolicResult.rules_fired > 0) {
    console.log(`Symbolic Reasoner fired ${symbolicResult.rules_fired} rules`);
    layeredRuleResult.rules_matched = symbolicResult.rules_fired;
    layeredRuleResult.rules_applied = symbolicResult.recommendations.map(r => r.rule_id);
```

**Fix 2 (Line 4504):** Fix diagnosis property:

```text
BEFORE: symbolicResult.diagnosis?.cause
AFTER:  symbolicResult.diagnosis?.cause_name
```

**Fix 3 (Lines 4508-4516):** Fix rule_ids extraction:

```text
BEFORE: rule_ids: symbolicResult.firedRuleIds || []
AFTER:  rule_ids: symbolicResult.recommendations.map(r => r.rule_id)
```

**Fix 4 (Lines 4541, 4557, 4562, 4647-4652):** Replace all `symbolicResult.firedRules` with `symbolicResult.recommendations`:

```text
BEFORE: symbolicResult.firedRules
AFTER:  symbolicResult.recommendations
```

**Fix 5 (Line 4419):** Fix coordinate typo:

```text
BEFORE: longitude: landContext.center_lng || null,
AFTER:  longitude: landContext.center_lon || null,
```

**Fix 6 (Line 4439):** Fix soil texture property:

```text
BEFORE: texture: landContext.soil_health?.soil_texture || null,
AFTER:  texture: landContext.soil_health?.texture || null,
```

### Risk Assessment

| Fix | Impact | Risk | Notes |
|-----|--------|------|-------|
| Fix 1-4 (property names) | P0 Critical | Low | Pure rename, no logic change. Will unlock ALL symbolic brain output. |
| Fix 5 (center_lon) | P0 | Low | Single character fix. Enables weather-based rules. |
| Fix 6 (texture) | P1 | Low | Single property fix. Enables soil texture rules. |

### Expected Outcome

After these fixes:
- Symbolic brain results will actually reach the farmer for the first time
- All previously fixed bugs (pest exclusion, category priority, numeric thresholds) will become effective
- Land-specific data (coordinates, soil, NDVI) will correctly flow to rule evaluation
- Response quality should dramatically improve from generic fallbacks to rule-driven recommendations
