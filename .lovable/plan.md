# AI Chat Crop-Stage Specific Symptoms Fix

## Status: ✅ IMPLEMENTED

---

## Executive Summary

Fixed the AI Chat to show crop-stage-specific diagnostic options from the `decision_rules` database instead of generic 3-option fallback (Water/Pest/Nutrient).

---

## Root Cause Analysis

### Issue 1: Legacy Observable Characteristics Format
**File:** `hypothesis-evaluator.ts`  
**Problem:** Database stores `observable_characteristics` as `{dead_heart: true}` but code expected `["DEAD_HEART"]` or `[{observation_key: "DEAD_HEART"}]`  
**Fix:** Updated `extractObservableCharacteristics()` to convert legacy boolean object format to array

### Issue 2: Missing Marathi Symptom Keywords
**File:** `language-induction-layer.ts`  
**Problem:** Critical single-word Marathi keywords like "वाळला" (dried), "मेला" (died) weren't mapped  
**Fix:** Added 30+ common single-word Marathi symptom patterns

### Issue 3: Induction Gate Blocking Diagnosis Mode
**File:** `orchestrator.ts`  
**Problem:** When symptoms=0, the induction gate blocked the symbolic brain entirely  
**Fix:** Added P0 keyword fallback that detects problem keywords in the query and injects symptoms to trigger diagnosis-first mode

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` | Convert `{symptom: true}` → `["SYMPTOM"]` format |
| `supabase/functions/ai-agriculture-chat/agents/language-induction-layer.ts` | Added 30+ Marathi/Hindi single-word symptom keywords |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | Added P0 keyword fallback for zero-symptom queries |

---

## Technical Implementation

### 1. Legacy Format Handler (hypothesis-evaluator.ts:280-312)
```typescript
// Detect legacy {symptom: true} format
else if (keys.some(k => typeof raw[k] === 'boolean')) {
  raw = keys
    .filter(k => raw[k] === true)
    .map(k => k.toUpperCase().replace(/[\s-]/g, '_'));
}
```

### 2. Single-Word Symptom Mappings (language-induction-layer.ts:186-214)
```typescript
'वाळला': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },
'मेला': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },
'किडा': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.90 },
// ... 25+ more patterns
```

### 3. Query Keyword Fallback (orchestrator.ts:2526-2571)
```typescript
// When induction misses symptoms but query has problem keywords
if (allObservationsForPreAuth.size === 0 && landContext) {
  const problemKeywords = ['वाळला', 'मेला', 'सुकला', ...];
  // Inject appropriate symptom to trigger diagnosis-first mode
}
```

---

## Expected Behavior After Fix

```text
Farmer: "नवीन लावण केलेला ऊस काही ठिकाणी वाळला"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LANGUAGE INDUCTION                                                          │
│   "वाळला" → LEAF_DRYING symbol (NEW: single-word match)                     │
│   OR                                                                         │
│   P0 KEYWORD FALLBACK → Injects LEAF_DRYING if induction misses            │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ HYPOTHESIS EVALUATOR                                                        │
│   extractObservableCharacteristics() converts:                              │
│   {dead_heart: true} → ["DEAD_HEART"] (NEW: legacy format support)          │
│                                                                             │
│   Candidates found: 5-8 hypotheses                                          │
│   - Early Shoot Borer (dead heart, stem hollow)                             │
│   - Moisture stress (wilting, soil dry)                                     │
│   - Termite (mud tunnels, stem gnawing)                                     │
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

## Verification

After deployment, logs should show:
- `[ExtractObs] Converting legacy boolean object format with X keys: dead_heart, ...`
- `[P0 FIX] Query contains problem keyword "वाळला" but induction missed it` (fallback)
- `[HypothesisEval] Found 5+ candidate hypotheses`
- `[DIAGNOSIS-FIRST] Returning hypothesis-driven options`
