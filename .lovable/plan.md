

# Deep Forensic Analysis: AI Chat Not Showing Crop-Stage Specific Symptoms

## Executive Summary

After deep analysis of the logs, database, and codebase, I have identified **one critical root cause** and **two contributing factors** that cause the AI Chat to show generic 3-option clarifications instead of crop-stage-specific symptoms from the `decision_rules` database.

---

## Root Cause Analysis

### The Farmer's Query Flow

```text
Farmer: "नवीन लावण केलेला ऊस काही ठिकाणी वाळला" 
        (Newly planted sugarcane dried in some places)
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CANONICAL CONTEXT BUILT CORRECTLY                                           │
│   Crop: SUGARCANE ✓                                                         │
│   Stage: SEEDLING ✓                                                         │
│   DAS: 58 ✓                                                                 │
│   NDVI: 0.36 ✓                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DIAGNOSIS-FIRST MODE ACTIVATED ✓                                            │
│   Mode: DIAGNOSIS_FIRST                                                     │
│   Source: DECISION_RULES                                                    │
│   Clarification: HYPOTHESIS_DRIVEN (NOT generic)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ HYPOTHESIS EVALUATOR - RULE LOADING                                         │
│   Query: crop_code = 'sc' OR crop_code = 'sugarcane' OR crop_code = 'all'   │
│   Filter: observable_characteristics IS NOT NULL                            │
│   Filter: observable_characteristics != '{}'                                │
│                                                                             │
│   Loaded: 28 rules with observable_characteristics                          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL BUG: extractObservableCharacteristics() FAILS                   │
│                                                                             │
│   Database format: { dead_heart: true, central_shoot_dried: true }          │
│   Expected format: ["DEAD_HEART", "CENTRAL_SHOOT_DRIED"]                    │
│                 OR [{observation_key: "DEAD_HEART"}]                        │
│                                                                             │
│   Code check at line 291-298:                                               │
│   if (raw.observation_key) → FALSE (object has "dead_heart", not "obs_key") │
│   else → return [] ← ALL 28 RULES GET EMPTY CHARACTERISTICS                 │
│                                                                             │
│   Result: observableChars.length === 0 → rule SKIPPED                       │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ NO CANDIDATE HYPOTHESES FOUND (candidates = [])                             │
│                                                                             │
│   Log: "⚠️ No hypothesis candidates - generating UNKNOWN diagnosis"         │
│                                                                             │
│   Falls back to: createUnknownDiagnosisResponse()                           │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GENERIC 3-OPTION RESPONSE GENERATED                                         │
│                                                                             │
│   💧 पाण्याची समस्या (जास्त/कमी पाणी)                                        │
│   🐛 कीड/किडीचा हल्ला                                                        │
│   🌿 पोषण कमतरता (खत कमी)                                                   │
│   📷 फोटो पाठवा                                                             │
│                                                                             │
│   These are HARDCODED in createUnknownDiagnosisResponse() lines 641-678     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Evidence

| Metric | Value |
|--------|-------|
| Total SEEDLING rules | 52 |
| Rules with observable_characteristics | 28 |
| Rules in OBJECT format (failing) | 28 |
| Rules in ARRAY format (working) | 0 |

**Example of failing SEEDLING rule data:**

```json
{
  "rule_id": "SC_DIAG_EARLY_SHOOT_BORER_001",
  "cause": "Early Shoot Borer",
  "observable_characteristics": {
    "dead_heart": true,
    "central_shoot_dried": true
  }
}
```

**Expected format that would work:**

```json
{
  "rule_id": "SC_DIAG_EARLY_SHOOT_BORER_001",
  "cause": "Early Shoot Borer",
  "observable_characteristics": ["DEAD_HEART", "CENTRAL_SHOOT_DRIED"]
}
```

---

## Buggy Code Location

**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`  
**Lines:** 280-298

```typescript
function extractObservableCharacteristics(raw: any): ObservableCharacteristic[] {
  if (!raw) return [];
  
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw);
    if (keys.length === 0) {
      return [];
    }
    // BUG: Only handles {observation_key: "..."} format
    if (raw.observation_key) {
      raw = [raw];
    } else {
      // BUG: Returns empty for {dead_heart: true} format
      console.log('   [ExtractObs] Skipping unknown object structure:', keys.slice(0, 3));
      return [];  // ← ALL 28 SEEDLING RULES FAIL HERE
    }
  }
  // ... rest of function never executes for these rules
}
```

---

## Fix Strategy

### Option A: Fix Code to Handle Legacy Format (PREFERRED)

Modify `extractObservableCharacteristics()` to handle the legacy `{symptom_name: true}` object format by extracting object keys as observation codes.

**Benefits:**
- No database migration needed
- Immediately fixes 28 SEEDLING rules
- Backward compatible with both formats

### Option B: Database Migration

Migrate all 232 object-format rules to array format.

**Drawbacks:**
- Requires careful data migration
- Risk of data corruption
- Takes longer to implement and test

---

## Implementation Plan (Option A)

### Step 1: Fix extractObservableCharacteristics()

Update the function to handle the legacy `{symptom: true}` format by treating object keys as observation codes:

```typescript
function extractObservableCharacteristics(raw: any): ObservableCharacteristic[] {
  if (!raw) return [];
  
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw);
    if (keys.length === 0) {
      return [];
    }
    
    // Handle {observation_key: "..."} format
    if (raw.observation_key) {
      raw = [raw];
    } 
    // NEW: Handle legacy {symptom_name: true} format
    // Extract keys as observation codes when values are boolean/truthy
    else if (keys.some(k => typeof raw[k] === 'boolean' || raw[k] === true)) {
      console.log(`   [ExtractObs] Converting legacy object format with keys: ${keys.join(', ')}`);
      // Convert {dead_heart: true, stem_hollow: true} → ["DEAD_HEART", "STEM_HOLLOW"]
      raw = keys
        .filter(k => raw[k] === true || raw[k])
        .map(k => k.toUpperCase().replace(/[\s-]/g, '_'));
    }
    else {
      console.log('   [ExtractObs] Skipping unknown object structure:', keys.slice(0, 3));
      return [];
    }
  }
  // ... rest of function continues with array processing
}
```

### Step 2: Add Unit Test Logging

Add logging to verify the fix is working:

```typescript
console.log(`   [ExtractObs] Processed ${charArray.length} observations from ${typeof raw === 'object' ? 'converted-object' : 'array'} format`);
```

### Step 3: Verify with Edge Function Logs

After deployment, verify:
- `[ExtractObs] Converting legacy object format with keys: dead_heart, central_shoot_dried`
- `[HypothesisEval] Found 5+ candidate hypotheses` (instead of 0)
- Farmer sees actual pest/disease options instead of generic 3-option fallback

---

## Expected Outcome After Fix

```text
Farmer: "नवीन लावण केलेला ऊस काही ठिकाणी वाळला"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ HYPOTHESIS EVALUATOR - FIXED                                                │
│   extractObservableCharacteristics() converts:                              │
│   {dead_heart: true} → ["DEAD_HEART"]                                       │
│                                                                             │
│   Candidates found: 5-8 hypotheses                                          │
│   - Early Shoot Borer (dead heart, stem hollow)                             │
│   - Termite (mud tunnels, stem gnawing)                                     │
│   - Moisture stress (wilting, soil dry)                                     │
│   - Sett rot (rotted setts, germination failure)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FARMER SEES CROP-STAGE SPECIFIC OPTIONS                                     │
│                                                                             │
│ 🔬 तुमच्या ऊस पिकाला खालीलपैकी कोणती समस्या असू शकते?                        │
│                                                                             │
│ 🐛 मधली पाने वाळली (खोडकिडा)                                                │
│ 🏠 मातीत बोगदे / वाळवी दिसते                                                │
│ 💧 जमीन कोरडी / पाणी कमी                                                    │
│ 🌱 बेणे कुजलेले                                                             │
│ 📷 फोटो पाठवा                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` | Fix `extractObservableCharacteristics()` to handle legacy object format |

---

## Technical Details

### Legacy Format Detection Logic

```typescript
// Detect if object uses legacy {symptom: true} format
const isLegacyBooleanFormat = (obj: Record<string, any>): boolean => {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  if (obj.observation_key) return false; // Already proper format
  
  // Check if at least one key has a boolean value
  return keys.some(k => typeof obj[k] === 'boolean');
};
```

### Conversion Logic

```typescript
// Convert {dead_heart: true, stem_hollow: true} → ["DEAD_HEART", "STEM_HOLLOW"]
const convertLegacyToArray = (obj: Record<string, boolean>): string[] => {
  return Object.keys(obj)
    .filter(k => obj[k] === true)
    .map(k => k.toUpperCase().replace(/[\s-]/g, '_'));
};
```

---

## Zero-Regression Verification

After fix, verify these test cases:

| Test Case | Expected |
|-----------|----------|
| "उसाची वाढ होत नाही" | Shows crop-stage specific symptoms (not 3 generic options) |
| "किडे दिसतात" | Shows pest-specific options from SEEDLING rules |
| Array-format rules (GRAND_GROWTH) | Continue working unchanged |
| Object-format SEEDLING rules | Now extracted correctly |

