

# Critical Bug Audit: AI Agriculture Chat System

## Executive Summary

After deep analysis of the edge function logs, database schema, and codebase, I have identified **6 CRITICAL BUGS** that are causing wrong results for farmer queries.

---

## Bug #1: Missing Column Query (DATABASE BREAKING)

**Severity:** CRITICAL  
**Impact:** All hypothesis evaluations FAIL with database error

**Location:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` (line 429)

```
Error: column decision_rules.trigger_keywords does not exist
```

**Root Cause:**
The code attempts to SELECT `trigger_keywords` from `decision_rules`, but this column was DROPPED from the database during the SSOT migration.

**Evidence from logs:**
```
❌ [HypothesisEval] Database error: {
  code: "42703",
  message: "column decision_rules.trigger_keywords does not exist"
}
```

**Fix Required:**
Remove `trigger_keywords` from the SELECT query in `hypothesis-evaluator.ts` line 429. The column no longer exists in the database.

---

## Bug #2: No Wheat Rules in Database (DATA GAP)

**Severity:** CRITICAL  
**Impact:** All wheat farmer queries return fallback/unknown responses

**Database Query Results:**
```sql
SELECT DISTINCT crop_code, COUNT(*) FROM decision_rules WHERE is_active = true GROUP BY crop_code;

-- Results:
-- SC (Sugarcane): 409 rules
-- ALL: 36 rules  
-- CTN (Cotton): 27 rules
-- WHEAT: 0 rules ← ZERO RULES!
```

**Root Cause:**
The `decision_rules` table has NO rules for wheat crop. The farmer's query for `WHEAT/STEM_ELONGATION` has no matching rules.

**Impact on Farmer:**
- Query: "गहू तवरी पडत आहे" (Wheat falling over)
- Expected: Lodging prevention advice
- Actual: "Class: UNKNOWN (confidence: 40%)"

**Fix Required:**
Add wheat crop rules to the decision_rules table covering all growth stages.

---

## Bug #3: Stage Normalization Mismatch

**Severity:** HIGH  
**Impact:** Rules don't match due to stage format inconsistency

**Evidence from logs:**
```
[HypothesisEval] Stage normalization: STEM_ELONGATION → tillering
```

**Root Cause:**
1. Land context provides: `STEM_ELONGATION` (from crop_schedules)
2. Stage normalizer maps: `STEM_ELONGATION` → `tillering`
3. But database stages are ALL UPPERCASE: `GRAND_GROWTH`, `TILLERING`, `GERMINATION`
4. Query uses lowercase: `tillering` ≠ `TILLERING`

**Database Evidence:**
```sql
SELECT DISTINCT unnest(stage_applicable) as stage FROM decision_rules;
-- GRAND_GROWTH (154), TILLERING (151), GERMINATION (75) ← ALL UPPERCASE
```

**Fix Required:**
Normalize stage comparisons to be case-insensitive or migrate database stages to lowercase.

---

## Bug #4: trigger_keywords Used in Multiple Files

**Severity:** HIGH  
**Impact:** Multiple code paths break when trying to access non-existent column

**Affected Files:**
1. `hypothesis-evaluator.ts` (line 429) - SELECT query
2. `symbolic-rules-bridge.ts` (lines 204, 231) - Expects `trigger_keywords` property
3. `layered-rule-evaluator.ts` (line 878) - Matches against `trigger_keywords`
4. `loader.ts` (lines 77, 288-406) - References in conditions_json handling
5. `all-rules.ts` (line 33) - Interface definition

**Fix Required:**
Remove all `trigger_keywords` column references from:
- Database SELECT statements
- TypeScript interfaces
- Runtime matching logic

Since `trigger_keywords` is now stored INSIDE `conditions_json`, the code should use `rule.conditions_json.trigger_keywords` instead of `rule.trigger_keywords`.

---

## Bug #5: Hardcoded Regional Language Keywords (Technical Debt)

**Severity:** MEDIUM  
**Impact:** Maintenance nightmare, not database-driven (violates SSOT principle)

**Locations with hardcoded Marathi/Hindi:**

| File | Lines | Content |
|------|-------|---------|
| `failure-class-detector.ts` | 100-133 | Hardcoded keyword arrays in Hindi/Marathi |
| `nlp-agriculture-validator.ts` | 59-92 | `MARATHI_AG_VOCABULARY` with 5000+ terms |
| `clarification-renderer.ts` | 114-321 | `BASE_TEMPLATES` with hardcoded questions/options |
| `diagnosis-only-mode.ts` | 788-795 | Pest name translations |

**Example (failure-class-detector.ts lines 118-121):**
```typescript
const NUTRIENT_KEYWORDS = [
  // Marathi
  'पिवळे', 'पिवळसर', 'फिकट', 'खुरटलेले', 'पोषण', 'वाढ नाही',
  'कमकुवत', 'लालसर', 'पान पिवळे', 'कडा जळाला'
];
```

**Recommendation:**
These should be loaded from database tables (`observation_translations`, `intent_translations`) per the SSOT principle. However, this is lower priority than the database-breaking bugs.

---

## Bug #6: Confidence Score Logic Inconsistency

**Severity:** MEDIUM  
**Impact:** Confidence calculations vary across modules with no single source of truth

**Inconsistent Thresholds Across Files:**

| File | Threshold | Purpose |
|------|-----------|---------|
| `confidence-engine.ts` | 0.40 floor | Minimum base confidence |
| `diagnosis-conflict-resolver.ts` | < 0.6 | requires_clarification |
| `diagnosis-conflict-resolver.ts` | < 0.5 | all diagnoses low |
| `unified-decision-gate.ts` | 0.4 base, 0.7 treatment | Mixed thresholds |
| `nlp-agriculture-validator.ts` | 0.8-1.0 | Entity detection |

**Root Cause:**
The `confidence-engine.ts` in `src/decision-graph/` is a **frontend module** but the edge function has its own confidence logic scattered across multiple files.

**Fix Required:**
Consolidate confidence thresholds into a single constants file in the edge function.

---

## Implementation Priority

| Bug | Priority | Effort | Impact |
|-----|----------|--------|--------|
| #1 | P0 | 1 hour | Fixes database error |
| #2 | P0 | 4 hours | Wheat crop support |
| #4 | P0 | 2 hours | Removes broken code paths |
| #3 | P1 | 1 hour | Stage matching works |
| #6 | P2 | 2 hours | Consistent confidence |
| #5 | P3 | 8 hours | SSOT compliance |

---

## Phase 1: Immediate Fixes (P0)

### 1.1 Remove trigger_keywords from hypothesis-evaluator.ts

**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`

Lines 418-432: Remove `trigger_keywords` from SELECT:
```typescript
const { data: rulesRaw, error } = await supabaseClient
  .from('decision_rules')
  .select(`
    rule_id,
    cause,
    canonical_group,
    priority,
    stage_applicable,
    conditions_json,
    observable_characteristics,
    differentiating_questions,
    crop_age_days_min,
    crop_age_days_max
  `)  // REMOVED: trigger_keywords
```

Lines 226-237: Update `evaluatePartialConditionMatch` to use `conditions.trigger_keywords` (from conditions_json) instead of expecting column:
```typescript
// Check trigger_keywords from conditions_json (not column)
if (conditionsJson.trigger_keywords && Array.isArray(conditionsJson.trigger_keywords)) {
  // ... existing logic works because it uses conditionsJson
}
```

### 1.2 Fix symbolic-rules-bridge.ts

**File:** `supabase/functions/ai-agriculture-chat/agents/symbolic-rules-bridge.ts`

Lines 44-47: Remove from interface:
```typescript
// REMOVE: trigger_keywords?: string[];
```

Lines 202-217: Update to use conditions_json:
```typescript
if (keywords.length > 0) {
  filteredRules = filteredRules.filter(r => {
    // Get trigger_keywords from conditions_json, not column
    const ruleKeywords = r.conditions_json?.trigger_keywords || [];
    const ruleCause = (r.cause || '').toLowerCase();
    const ruleId = (r.rule_id || '').toLowerCase();
    // ... rest of logic
  });
}
```

Lines 229-233: Remove from mapping:
```typescript
// REMOVE: trigger_keywords: r.trigger_keywords || [],
```

### 1.3 Fix layered-rule-evaluator.ts

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Lines 877-896: Update to use conditions_json:
```typescript
for (const rule of allBundled) {
  // Get trigger_keywords from conditions_json, not column
  const ruleKeywords = rule.conditions_json?.trigger_keywords || [];
  if (ruleKeywords.some(kw => queryLower.includes(kw.toLowerCase()))) {
    // ... rest of logic
  }
}
```

### 1.4 Fix all-rules.ts Interface

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts`

Line 33: Remove from interface:
```typescript
// REMOVE: trigger_keywords?: string[];
```

---

## Phase 2: Stage Normalization Fix (P1)

### 2.1 Case-Insensitive Stage Matching

**File:** `supabase/functions/ai-agriculture-chat/utils/stage-normalizer.ts`

Update `normalizeStageForDB` to return lowercase only:
```typescript
export function normalizeStageForDB(stage: string | undefined | null): string {
  if (!stage) return 'unknown';
  const key = stage.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return STAGE_DB_MAP[key] || key;  // Already lowercase
}
```

Update `calculateStageRelevanceScore` to use case-insensitive comparison:
```typescript
const normalizedCurrent = normalizeStageForDB(currentStage).toLowerCase();
if (stageApplicable.some(s => normalizeStageForDB(s).toLowerCase() === normalizedCurrent)) {
  return 1.0;
}
```

---

## Phase 3: Confidence Threshold Consolidation (P2)

### 3.1 Create Centralized Constants

**File:** `supabase/functions/ai-agriculture-chat/decision/confidence-thresholds.ts` (NEW)

```typescript
export const CONFIDENCE_THRESHOLDS = {
  // Core thresholds
  MINIMUM_BASE: 0.40,
  TREATMENT_ALLOWED: 0.70,
  CLARIFICATION_REQUIRED: 0.60,
  LOW_CONFIDENCE: 0.50,
  
  // Entity detection
  ENTITY_HIGH: 1.0,
  ENTITY_MEDIUM: 0.8,
  
  // Risk adjustments
  CRITICAL_PENALTY: 0.8,
  MULTIPLE_CAUSES_PENALTY: 0.95,
  HEALTHY_BOOST: 1.05
} as const;
```

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `decision/hypothesis-evaluator.ts` | MODIFY | Remove trigger_keywords from SELECT |
| `agents/symbolic-rules-bridge.ts` | MODIFY | Use conditions_json.trigger_keywords |
| `agents/layered-rule-evaluator.ts` | MODIFY | Use conditions_json.trigger_keywords |
| `bundled-rules/all-rules.ts` | MODIFY | Remove from interface |
| `utils/stage-normalizer.ts` | MODIFY | Case-insensitive matching |
| `decision/confidence-thresholds.ts` | CREATE | Centralized thresholds |

---

## Success Criteria

After implementation:

| Metric | Before | After |
|--------|--------|-------|
| Database error on hypothesis eval | Yes | No |
| trigger_keywords column references | 5+ files | 0 files |
| Stage matching (case mismatch) | Fails | Works |
| Confidence threshold locations | 6+ files | 1 file |

---

## Notes for Implementation

1. **Database Migration NOT Required:** The trigger_keywords column is already removed. We just need to update code.

2. **Wheat Rules Addition:** This requires agronomist input to create proper wheat rules with:
   - Growth stages: SEEDLING, TILLERING, STEM_ELONGATION, BOOTING, HEADING, FLOWERING, GRAIN_FILLING, MATURITY
   - Pest/disease rules for each stage
   - Nutrient management rules

3. **Hardcoded Regional Text:** Low priority - the current hardcoded vocabulary works but violates SSOT. Can be addressed in a future sprint.

4. **Testing:** After fixes, test with:
   - Wheat query: "गहू तवरी पडत आहे" (expect: lodging advice)
   - Sugarcane query: "खोड किडा लागला" (expect: stem borer treatment)
   - Cotton query: "पाने पिवळी होत आहेत" (expect: nutrient/pest diagnosis)

