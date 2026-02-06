
# Deep Forensic Audit: Symbolic Decision Brain - Root Cause Analysis & Production Fix

## Executive Summary

After comprehensive analysis of the logs, database, and codebase, I have identified **5 interconnected root causes** that prevent the symbolic decision brain from working correctly for common Marathi farmer queries like "उसाची वाढ होत नाही" (sugarcane not growing).

## Log Analysis - The Failure Sequence

```text
1. INPUT: "उसाची वाढ होत नाही"
2. CROP DETECTED: SUGARCANE ✓ (उसाची → उस → SUGARCANE)
3. SYMPTOMS EXTRACTED: [] ❌ (ZERO!)
4. UNMAPPED TOKENS: "वाढ, होत, नाही" ❌
5. SYMBOL COVERAGE: 25% (only crop symbol mapped)
6. INDUCTION GATE: BLOCKED (coverage OK but symptoms=0)
7. CLARIFICATION PATH TRIGGERED
8. VALIDATION GATE: FAILED (wrong validation applied to clarification)
9. FALLBACK: "Technical issue" message shown
```

## Root Cause Analysis

### ROOT CAUSE #1: Missing Marathi Symptom Mappings (CRITICAL)

**Location:** `language-induction-layer.ts` lines 129-171

**Current MARATHI_SYMPTOM_MAP:**
```typescript
'वाढ थांबली': { symbol: STUNTED_GROWTH, confidence: 0.90 }  // Only this exists
```

**MISSING Patterns (common farmer phrases):**
```typescript
'वाढ होत नाही'   // "Growth is not happening" - MOST COMMON
'वाढ नाही'       // "No growth"
'वाढत नाही'      // "Not growing"  
'वाढ कमी'        // "Less growth"
'वाढ मंद'        // "Slow growth"
```

**Evidence:** These patterns already exist in `failure-class-detector.ts` (lines 119-132) but were never added to the Language Induction Layer.

### ROOT CAUSE #2: Intent Classifier Returns UNKNOWN_OBSERVATION

**Location:** `intent-classifier.ts` - LLM response parsing

**Log Evidence:**
```text
⚠️ [SafeExtract] No valid JSON found in LLM response
🎯 Intent: UNKNOWN_OBSERVATION (0%)
⚠️ LLM returned non-JSON - forcing clarification flow
```

**Issue:** The LLM sometimes returns natural language instead of JSON. The `safeExtractJson()` function fails to recover the intent, defaulting to `UNKNOWN_OBSERVATION` with 0% confidence.

**Impact:** When intent confidence is 0%, the system lacks understanding of what the farmer is asking about, leading to generic clarification.

### ROOT CAUSE #3: Validation Gate Applied to Clarification Responses

**Location:** `index.ts` lines 1083-1123

**Issue:** The validation gate at line 1087 sets `decision_brain_source = true` unconditionally, then validates ALL responses as if they were treatment recommendations:

```typescript
const decision_brain_source = true;  // ALWAYS true
const validationResult = validateResponseBeforeSave({...});  // Validates everything

if (!validationResult.passed) {
  // Generates "technical issue" fallback even for CLARIFICATION_QUESTION
  responseContent = generateValidationFailureFallback(...);
}
```

**Impact:** When the orchestrator correctly generates a `CLARIFICATION_QUESTION` response, the validation gate:
1. Checks for `actions_returned` (empty for clarification - correct!)
2. Checks for recommendation keywords (not present in clarification - correct!)
3. FAILS validation and generates "technical issue" fallback instead

### ROOT CAUSE #4: SSOT Fallback Not Generating Proper Clarification

**Location:** `orchestrator.ts` - SSOT clarification generation

When the induction gate blocks the symbolic brain (symptoms=0), the orchestrator should:
1. Query `decision_rules.observable_characteristics` for the crop/stage
2. Query `observation_translations` for localized display text
3. Return a proper `CLARIFICATION_QUESTION` with options

**Current Issue:** The generated clarification response is missing required fields:
- `question.text_mr` / `text_hi` / `text_en` - The localized question text
- `question.options` - Array of observation options from database

**Impact:** `getResponseContent()` at line 2334 tries to read `response.question?.text_mr` but finds it empty, falling back to `generateClarificationPrompt()` which may also fail validation.

### ROOT CAUSE #5: Crop Code Normalization Mismatch

**Location:** Multiple files - crop code handling

**Issue:** Database uses different crop code formats:
- `decision_rules.crop_code`: `SC`, `CTN`, `SOY`
- `observation_translations`: References by observation_code, not crop
- Language Induction: Produces `SUGARCANE`, not `SC`

**Impact:** When querying `decision_rules` for observable characteristics using `SUGARCANE`, no rules match because the database has `SC`.

## Data Flow Diagram - Current (Broken)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FARMER: "उसाची वाढ होत नाही"                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LANGUAGE INDUCTION LAYER                                                    │
│                                                                             │
│  MARATHI_SYMPTOM_MAP.contains("वाढ होत नाही")? → NO ❌                       │
│  MARATHI_SYMPTOM_MAP.contains("वाढ थांबली")? → NO (different phrase)        │
│                                                                             │
│  Result: symptoms = [], crop = SUGARCANE                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INDUCTION GATE                                                              │
│                                                                             │
│  hasSymptoms = symptoms.length >= 1 → FALSE                                 │
│  shouldRunSymbolicBrain = hasSymptoms && (coverage || symbols) → FALSE      │
│                                                                             │
│  ⚠️ BLOCKING symbolic brain - forcing clarification                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SSOT FALLBACK CLARIFICATION                                                 │
│                                                                             │
│  Query decision_rules WHERE crop_code = 'SUGARCANE' → NO MATCH (uses 'SC')  │
│  Result: Empty options, missing question text                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INDEX.TS VALIDATION GATE                                                    │
│                                                                             │
│  decision_brain_source = true (hardcoded)                                   │
│  actions_returned = [] (empty - correct for clarification)                  │
│  Check 2: FAIL - "decision_output has recommendations but actions empty"    │
│                                                                             │
│  ❌ VALIDATION FAILED → Generate "technical issue" fallback                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FARMER SEES: "तांत्रिक समस्या आली" (Technical issue occurred)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Comprehensive Fix Implementation

### FIX 1: Add Missing Marathi Growth Symptom Patterns

**File:** `language-induction-layer.ts`

Add to MARATHI_SYMPTOM_MAP (after line 171):

```typescript
// Growth/Stunting patterns - CRITICAL for farmer queries
'वाढ होत नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.95 },
'वाढ नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
'वाढत नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
'वाढ कमी': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },
'वाढ मंद': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },
'मंद वाढ': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },
'खुंटलेली वाढ': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },

// Hindi equivalents
'बढ़ नहीं रहा': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
'वृद्धि नहीं': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
'धीमी वृद्धि': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },
'बढ़वार रुकी': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
```

### FIX 2: Skip Validation Gate for Non-Decision Response Types

**File:** `index.ts`

Modify lines 1083-1095 to skip validation for clarification/photo responses:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION GATE: SKIP for non-decision response types
// Clarification and photo requests should NOT be validated as treatment outputs
// ═══════════════════════════════════════════════════════════════════════════
const isDecisionResponse = orchestratorResponse.type === 'DECISION_PROVIDED';
const isClarificationOrPhoto = ['CLARIFICATION_QUESTION', 'PHOTO_REQUEST', 
                                'CLARIFICATION_NEEDED'].includes(orchestratorResponse.type);

let validationResult = { passed: true, errors: [] };

if (isDecisionResponse && !isClarificationOrPhoto) {
  const decision_brain_source = true;
  validationResult = validateResponseBeforeSave({
    decision_brain_source,
    actions_returned,
    responseContent,
    orchestratorResponse,
    traceId,
    language: detectedLanguage as 'mr' | 'hi' | 'en'
  });
} else if (isClarificationOrPhoto) {
  console.log(`🔐 [${traceId}] VALIDATION SKIPPED: Response type is ${orchestratorResponse.type}`);
}
```

### FIX 3: Normalize Crop Codes for Database Queries

**File:** `orchestrator.ts`

Add crop code normalization utility and use it in SSOT fallback:

```typescript
// Crop code normalization map (SUGARCANE → SC, etc.)
const CROP_CODE_MAP: Record<string, string> = {
  'SUGARCANE': 'SC',
  'COTTON': 'CTN',
  'SOYBEAN': 'SOY',
  'RICE': 'RICE',
  'WHEAT': 'WHT',
  'MAIZE': 'MZ',
  // Add more as needed
};

function normalizeCropCodeForDB(inductionCropCode: string): string {
  const upper = inductionCropCode?.toUpperCase() || '';
  return CROP_CODE_MAP[upper] || upper;
}

// In SSOT fallback section, use normalized code:
const dbCropCode = normalizeCropCodeForDB(inductionResult.crop?.symbol || 'SC');

const { data: topRules } = await this.supabase
  .from('decision_rules')
  .select('observable_characteristics')
  .eq('is_active', true)
  .or(`crop_code.eq.${dbCropCode},crop_code.eq.all,crop_code.eq.ALL`)
  .contains('stage_applicable', [growthStage.toUpperCase()])
  .not('observable_characteristics', 'is', null)
  .limit(10);
```

### FIX 4: Ensure SSOT Clarification Has Proper Structure

**File:** `orchestrator.ts`

When generating SSOT fallback clarification, ensure all required fields are populated:

```typescript
// Build complete clarification response structure
const clarificationQuestion = {
  question_id: `ssot_clarify_${Date.now()}`,
  // CRITICAL: Populate localized question text
  text_mr: 'तुमच्या पिकात खालीलपैकी काय दिसते?',
  text_hi: 'आपकी फसल में निम्नलिखित में से क्या दिख रहा है?',
  text_en: 'What do you see in your crop?',
  i18n_key: 'clarification.what_do_you_see',
  options: clarificationOptions.map(opt => ({
    value: opt.observation_code,
    label: `${opt.icon} ${opt.display_text}`,
    observation_key: opt.observation_code
  })),
  source: 'DECISION_RULES_SSOT'
};

return {
  type: 'CLARIFICATION_QUESTION',
  session_id: sessionId,
  question: clarificationQuestion,
  metadata: {
    confidence: 0.3,
    safety_status: 'NEEDS_CLARIFICATION',
    rules_applied: 0,
    // ... rest of metadata
  }
};
```

### FIX 5: Add Fallback Intent Classification for Growth Queries

**File:** `intent-classifier.ts`

Add keyword-based fallback when LLM fails to return JSON:

```typescript
// After safeExtractJson returns null, try keyword-based fallback
if (!parsed) {
  console.warn(`   ⚠️ LLM JSON extraction failed - trying keyword fallback`);
  
  const messageLower = farmerMessage.toLowerCase();
  
  // Growth-related keywords → GROWTH_ANOMALY
  const growthKeywords = ['वाढ', 'growth', 'बढ़', 'stunted', 'slow', 'नाही', 'नहीं'];
  if (growthKeywords.some(kw => messageLower.includes(kw))) {
    console.log(`   📋 Keyword fallback: GROWTH_ANOMALY detected`);
    return { intent_code: 'GROWTH_ANOMALY', confidence: 0.6 };
  }
  
  // Pest keywords → PEST_PRESENCE_VISIBLE
  const pestKeywords = ['किडे', 'कीड़े', 'insect', 'pest', 'bug', 'अळी', 'इल्ली'];
  if (pestKeywords.some(kw => messageLower.includes(kw))) {
    return { intent_code: 'PEST_PRESENCE_VISIBLE', confidence: 0.6 };
  }
  
  // Default: Unknown with low confidence
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.0 };
}
```

## Files to Modify

| File | Priority | Changes |
|------|----------|---------|
| `language-induction-layer.ts` | P0 | Add 11 Marathi/Hindi growth symptom patterns |
| `index.ts` | P0 | Skip validation gate for CLARIFICATION_QUESTION |
| `orchestrator.ts` | P0 | Add crop code normalization + fix SSOT clarification structure |
| `intent-classifier.ts` | P1 | Add keyword fallback for common patterns |

## Expected Outcome After Fix

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FARMER: "उसाची वाढ होत नाही"                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LANGUAGE INDUCTION LAYER (FIXED)                                            │
│                                                                             │
│  MARATHI_SYMPTOM_MAP.contains("वाढ होत नाही")? → YES ✓                       │
│  → { symbol: STUNTED_GROWTH, confidence: 0.95 }                             │
│                                                                             │
│  Result: symptoms = [STUNTED_GROWTH], crop = SUGARCANE                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INDUCTION GATE                                                              │
│                                                                             │
│  hasSymptoms = symptoms.length >= 1 → TRUE ✓                                │
│  shouldRunSymbolicBrain = hasSymptoms && coverage → TRUE ✓                  │
│                                                                             │
│  ✅ PASSING to Symbolic Decision Brain                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SYMBOLIC DECISION BRAIN                                                     │
│                                                                             │
│  Query: crop_code=SC, symptoms=[STUNTED_GROWTH], stage=SEEDLING            │
│  Matches: SC_PEST_EARLY_SHOOT_BORER, SC_STRESS_WATERLOGGING, etc.          │
│                                                                             │
│  ✅ Rules matched - generating diagnosis/clarification                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FARMER SEES: Relevant diagnostic question OR treatment advice              │
│                                                                             │
│ "तुमच्या ऊस पिकात वाढ मंद आहे. खालीलपैकी काय दिसते?"                         │
│ ○ 🔴 मधली सुरळी वाळलेली (Dead heart)                                        │
│ ○ 🐛 खोडात छिद्र दिसते (Stem boring)                                        │
│ ○ 💧 पाणी साचलेले (Waterlogging)                                            │
│ ○ 📷 फोटो पाठवा                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Testing Strategy

1. **Unit Test:** Query "उसाची वाढ होत नाही" → verify `symptoms = [STUNTED_GROWTH]`
2. **Integration Test:** End-to-end with same query → verify NO "technical issue" fallback
3. **Regression Test:** Verify existing symptom patterns still work
4. **Database Test:** Query `decision_rules` with `SC` crop code → verify rules match
5. **Validation Test:** Verify CLARIFICATION_QUESTION bypasses validation gate

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| "वाढ होत नाही" symptom extraction | 0% | 100% |
| Technical issue fallback rate | High | 0% |
| Symbolic brain activation rate | Low | High |
| SSOT clarification quality | Missing text | Complete structure |
| Response time | Timeout risk | < 10 seconds |
