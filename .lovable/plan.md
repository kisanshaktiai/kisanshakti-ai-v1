

# Critical Pipeline Break: Intent Disconnection + Prescription Gate + Intent Lock Scope

## Root Cause Analysis

From the edge logs, the farmer sends a clear Marathi message about sugarcane stem boring: "उसाच्या खोडात छिद्र पडली आहेत आणि वरची पानं सुकतायत" (Holes in sugarcane stems and top leaves drying).

The pipeline extracts the data correctly but produces a **generic clarification** instead of a diagnosis.

### BUG 1: Intent Disconnection — SemanticExtractor result never flows into IntentLock (CRITICAL)

**Evidence from logs:**
- `[IntentClassifier v3.0.0]` → `Intent: STEM_DAMAGE (90% confidence)` ✅
- `[IntentTier] HIGH confidence (90%)` ✅  
- `[IntentLock] LOCKED intent: UNKNOWN` ❌

**Root cause:** At `orchestrator.ts:3899`, `detectedIntent` reads from `nluOutput.intent_classification.primary_intent`. But `nlu-agent.ts:572` **always returns** `primary_intent: 'UNKNOWN'` because the NLU Agent is a pure perception layer — intent is classified upstream by `semantic-extractor.ts`. The `semanticExtraction.intent_code` (which correctly has `STEM_DAMAGE`) is **never propagated** to `detectedIntent`.

**Impact:** IntentLock locks to `UNKNOWN`, which maps to `DEFAULT_SCOPE = { allowed_scopes: ['GENERAL'], allowed_actions: ['INFORM', 'CLARIFY'] }`. This **blocks all treatment/diagnostic actions** including SPRAY, APPLY, MONITOR.

**Fix:** At `orchestrator.ts:3899`, replace:
```typescript
const detectedIntent = nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY';
```
with:
```typescript
const detectedIntent = semanticExtraction?.intent_code || 
                        nluOutput?.intent_classification?.primary_intent || 'GENERAL_QUERY';
```

### BUG 2: IntentLock has no STEM_DAMAGE scope mapping

Even after fixing BUG 1, `STEM_DAMAGE` is not in `INTENT_SCOPE_MAP` in `intent-lock.ts`. It will still fall to `DEFAULT_SCOPE` which only allows INFORM/CLARIFY.

**Fix:** Add symptom-based intent mappings to `INTENT_SCOPE_MAP` in `intent-lock.ts`:
```typescript
'STEM_DAMAGE': {
  allowed_scopes: ['PEST', 'DISEASE', 'IPM', 'BIOCONTROL', 'CHEMICAL_PEST', 'CULTURAL', 'GENERAL'],
  allowed_actions: ['SPRAY', 'APPLY', 'RELEASE', 'MONITOR', 'REMOVE', 'TRAP', 'CULTURAL_PRACTICE', 'INFORM', 'CLARIFY'],
  forbidden_actions: ['HARVEST', 'SELL']
},
```
Add similar entries for all symptom-based intents: `LEAF_DAMAGE_VISIBLE`, `LEAF_MARKS_OR_SPOTS`, `ROOT_OR_BASE_PROBLEM`, `GROWTH_ANOMALY`, `COLOR_CHANGE`, `WILTING_OR_DROOPING`, `PEST_PRESENCE_VISIBLE`, `DISEASE_LIKE_PATTERN`, `EMERGENCE_FAILURE`, `UNKNOWN_OBSERVATION`.

### BUG 3: Prescription Gate blocks on LOW data_confidence despite 10 observations and 88% coverage

**Evidence from logs:**
- `⚠️ Prescription Gate BLOCKED: Can diagnose but cannot prescribe treatment with low confidence.`
- `Data Confidence: LOW`
- `Combined unique: LEAF_DRYING, LEAF_HOLES, STEM_HOLES, STEM_BORING_MARKS, DEAD_HEART_PRESENT, BORER_DAMAGE, STEM_BORING, LEAF_SPOTS, AFFECTED_PART_STEM, SEVERITY_HIGH` (10 observations)
- `coverage=88%`

**Root cause:** `checkPrescriptionGate()` in `canonical-state-builder.ts:1236` blocks when `data_confidence === DataConfidence.LOW`. But `DataConfidence.LOW` is set because soil NPK is NOT_TESTED and no weather data exists — these are **optional** fields. The gate conflates "missing optional environmental data" with "insufficient diagnostic evidence", blocking treatment even with 10 strong biotic symptoms at 88% coverage.

**Fix:** In `checkPrescriptionGate()`, add a symptom-evidence override: if observation count ≥ 5 AND coverage ≥ 70%, allow diagnosis+prescription regardless of data_confidence:
```typescript
// Before the LOW confidence check at line 1236:
if (state.data_confidence === DataConfidence.LOW) {
  // Override: sufficient symptom evidence should allow prescription
  const hasStrongEvidence = (state.symptom_count || 0) >= 5 || 
                            (state.data_completeness || 0) >= 0.7;
  if (hasStrongEvidence) {
    // Allow prescription with warning
    return {
      allowed: true,
      reason: 'Low data confidence overridden by strong symptom evidence.',
      requiredData: getRequiredDataForConfidence(state)
    };
  }
  // Original block remains for cases with no symptom evidence
  return { allowed: false, ... };
}
```

### BUG 4: Diagnostic Flow Controller produces GATHERING_INFO after symbolic brain

**Evidence:** The logs end after Phase 2.5.5 (Causal Hypothesis). The orchestrator continues to Phase 3 (Diagnostic Flow at line 5304) which runs `diagnosticController.processNLUOutput()` using `nluOutput` (which has `UNKNOWN` intent). The diagnostic controller returns `GATHERING_INFO` mode, which triggers the clarification return at line 5340-5352.

**Fix:** The diagnostic flow at Phase 3 should be skipped when the symbolic brain (Phase 2.6) has already produced matched rules. Add a guard before line 5304:
```typescript
// Skip Phase 3 Diagnostic Flow if symbolic brain already produced results
if (layeredRuleResult?.rules_matched > 0 || symbolicResult?.recommendations?.length > 0) {
  console.log('\n🧠 PHASE 3: SKIPPED — symbolic brain already produced results');
} else {
  // ... existing Phase 3 code
}
```

## Implementation Steps

### Step 1: Fix intent propagation (orchestrator.ts ~line 3899)
Replace `nluOutput?.intent_classification?.primary_intent` with `semanticExtraction?.intent_code` as the primary intent source, with NLU as fallback.

### Step 2: Add symptom-based intent scopes (intent-lock.ts)
Add scope mappings for all 11 symptom-based intents (`STEM_DAMAGE`, `LEAF_DAMAGE_VISIBLE`, `LEAF_MARKS_OR_SPOTS`, `ROOT_OR_BASE_PROBLEM`, `GROWTH_ANOMALY`, `COLOR_CHANGE`, `WILTING_OR_DROOPING`, `PEST_PRESENCE_VISIBLE`, `DISEASE_LIKE_PATTERN`, `EMERGENCE_FAILURE`, `UNKNOWN_OBSERVATION`) with PEST/DISEASE/IPM scopes and treatment-capable actions.

### Step 3: Fix Prescription Gate evidence override (canonical-state-builder.ts ~line 1236)
Add symptom-count/coverage override that allows prescription when strong observational evidence exists, even with LOW data_confidence from missing optional fields.

### Step 4: Guard Phase 3 diagnostic flow (orchestrator.ts ~line 5304)
Skip the legacy `DiagnosticFlowController` when the symbolic brain has already produced matched rules to prevent the `GATHERING_INFO` → clarification path from overriding valid symbolic results.

### Step 5: Deploy and verify
Deploy the edge function and verify via logs that:
- IntentLock shows `LOCKED intent: STEM_DAMAGE` (not UNKNOWN)
- Prescription Gate shows `PASSED` or `overridden by strong symptom evidence`
- Response is a treatment recommendation (not a clarification)

