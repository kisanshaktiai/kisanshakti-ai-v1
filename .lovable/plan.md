

# Deterministic Audit & Fix Plan: Observation Pipeline + Authority + Stage Integrity

## Critical Bugs Found

### BUG 1: `allObservationsForDiagCheck` — ReferenceError (RUNTIME CRASH)
**File:** `orchestrator.ts:5082`
**Issue:** Variable `allObservationsForDiagCheck` is referenced but never defined. It should be `allObservationsForPreAuth` (defined at line 2931, same scope).
**Fix:** Replace `allObservationsForDiagCheck` with `[...allObservationsForPreAuth]` at line 5082.

### BUG 2: Dual CropDamageDetector execution (v4 + v5)
**File:** `orchestrator.ts:3159-3165`
**Issue:** Both `detectCropDamageWithAuthority()` (v5, authority-aware) AND `resolveDiagnosticAuthorityFromObservations()` (v4 legacy) run on EVERY request. The v4 result at line 3165 uses the flat `allObservationsForPreAuth` set which includes INFERRED/SYNTHETIC codes, bypassing the authority filtering that v5 enforces. The v4 result then feeds into `enforcedAuthorityDecision` (line 3168) and `diagnosisOnlyModeActive` (line 3257), creating a path where INFERRED codes trigger terminal damage mode.
**Fix:** Remove the legacy v4 `resolveDiagnosticAuthorityFromObservations` call. Use v5 `cropDamageResult` as sole authority source. Update all downstream references to `preAuthorityResult`.

### BUG 3: Stage drift — 3 competing stage calculators
**Files:**
- `orchestrator.ts:6537` — private `calculateGrowthStage()` (ICAR tables, sugarcane-aware)
- `crop-calendar-lookup.ts:529` — `calculateGenericStage()` (generic, maps 70-100 DAS → FLOWERING for ALL crops)
- `data-validator.ts:291` — `calculateGrowthStage()` (another set of ICAR tables)
- `agronomic-observation-validator.ts:250` — `getStageFromDAS()`

The generic fallback in `crop-calendar-lookup.ts:546` maps DAS 71-100 → `FLOWERING` for ANY crop, including sugarcane (where DAS 71-100 is TILLERING). If this function is invoked as fallback (when ICAR calendar not found for a crop variant), TILLERING shifts to FLOWERING.

Additionally, `contextValidation.reconciled_stage` at line 4608-4612 can override `landContext.growth_stage` with a recalculated value.

**Fix:** 
1. In orchestrator, after canonical state is built, add a stage immutability guard: if `canonicalContext.growth_stage` is set and locked, reject any recalculation.
2. Remove the `landContext.growth_stage = contextValidation.reconciled_stage` override at lines 4608-4612 when canonical context is locked.

### BUG 4: DiagnosisOnlyMode activates AFTER symbolic reasoning already executed
**File:** `orchestrator.ts:5061`
**Issue:** `diagnosisOnlyModeActive` is checked at line 5061 inside the symbolic reasoner result block (after rules already fired). If `diagnosisOnlyModeActive=true`, it generates a separate `diagnosisOnlyOutput` using `generateDiagnosisOnlyOutput()` — but this calls the crashed `allObservationsForDiagCheck`. Even after fixing the variable name, this path duplicates work: the symbolic reasoner already produced recommendations, and `generateDiagnosisOnlyOutput` reformats them into a different shape. This is redundant and can produce inconsistent outputs.
**Fix:** After fixing BUG 1, add a guard: if symbolic reasoner already produced a primary decision with confidence > 0.6, skip the DiagnosisOnly reformatting and use the symbolic result directly.

### BUG 5: Authority resolver blocks CROP domain when observations exist
**File:** `authority-resolver.ts:462-469`
**Issue:** `shouldSkipCropRules()` returns `true` when `authority === DecisionAuthority.NONE`. But `NONE` can be set by the standard authority resolver when no pest/disease causes are detected — even when crop damage observations exist. The v5 CropDamageDetector sets `enforced_authority: DecisionAuthority.CROP`, but this enforcement happens AFTER the diagnostic-flow-controller's authority check at line 370.
**Fix:** In `diagnostic-flow-controller.ts`, check for crop damage enforcement BEFORE calling `shouldSkipCropRules`. If `preAuthorityResult.enforced_decision` exists, use it instead of the standard authority path.

---

## Implementation Steps

### Step 1: Fix runtime crash — `allObservationsForDiagCheck`
In `orchestrator.ts` line 5082, replace `allObservationsForDiagCheck` with `[...allObservationsForPreAuth]`.

### Step 2: Remove dual detector execution
In `orchestrator.ts`:
- Remove the v4 legacy call at line 3164-3165 (`resolveDiagnosticAuthorityFromObservations`)
- Replace all `preAuthorityResult.*` references (lines 3167-3206, 3233, 3249, 3255-3257, 3289-3296) with equivalent fields from `cropDamageResult`
- Map: `preAuthorityResult.nlu_bypassed` → `cropDamageResult.nlu_gating_disabled`
- Map: `preAuthorityResult.enforced_decision` → derive from `cropDamageResult.enforced_authority`
- Map: `preAuthorityResult.authority` → `cropDamageResult.enforced_authority`
- Map: `preAuthorityResult.terminal_indicators` → `cropDamageResult.damage_observations`

### Step 3: Add stage immutability guard
In `orchestrator.ts` lines 4607-4613, wrap the `landContext.growth_stage` override in a guard:
```typescript
if (contextValidation.reconciled_stage && contextValidation.stage_source !== 'DEFAULT') {
  if (canonicalContext?.is_locked && canonicalContext.growth_stage) {
    console.log(`   🔒 Stage override BLOCKED — canonical stage locked: ${canonicalContext.growth_stage}`);
  } else {
    landContext.growth_stage = contextValidation.reconciled_stage;
  }
}
```

### Step 4: Add observation pipeline checkpoint logging
After each observation collection phase (lines 2931-3128), add a checkpoint log:
```typescript
console.log(`   📊 [OBSERVATION_CHECKPOINT] Stage=POST_COLLECTION, count=${allObservationsForPreAuth.size}, codes=[${[...allObservationsForPreAuth].slice(0,10).join(',')}]`);
```

### Step 5: Guard DiagnosisOnlyMode against redundant execution
At line 5061, add a condition:
```typescript
if (diagnosisOnlyModeActive && symbolicResult.recommendations?.length > 0 && !symbolicResult.primary_decision) {
```
This ensures DiagnosisOnly reformatting only runs when symbolic reasoner didn't already produce a clean primary decision.

### Step 6: Fix authority blocking in diagnostic-flow-controller
In `diagnostic-flow-controller.ts` line 369-377, add crop damage override before `shouldSkipCropRules`:
```typescript
if (preAuthorityResult.enforced_decision) {
  authorityDecision = preAuthorityResult.enforced_decision;
}
const skipCropRules = shouldSkipCropRules(authorityDecision);
```

### Step 7: Deploy and verify
Deploy the edge function and verify via logs that:
- No `ReferenceError` for `allObservationsForDiagCheck`
- Only one `[CropDamageDetector v5.0]` log appears (no v4)
- Stage remains constant through pipeline (no TILLERING→FLOWERING drift)
- `shouldSkipCropRules` returns `false` when crop damage observations exist

