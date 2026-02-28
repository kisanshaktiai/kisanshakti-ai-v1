
# Pipeline Stability Fixes v5.1 — Completed

## Fixes Applied (2026-02-28)

### BUG 1: `allObservationsForDiagCheck` ReferenceError — FIXED
- **File:** `orchestrator.ts:5082`
- **Fix:** Replaced undefined `allObservationsForDiagCheck` with `[...allObservationsForPreAuth]`

### BUG 2: Dual CropDamageDetector (v4+v5) — FIXED
- **File:** `orchestrator.ts:3164-3168`
- **Fix:** Removed legacy `resolveDiagnosticAuthorityFromObservations()` call from orchestrator. v5 `cropDamageResult` is now sole authority source. Removed import, all `preAuthorityResult.*` references replaced with v5 equivalents.

### BUG 3: Stage drift (3 competing calculators) — FIXED
- **File:** `orchestrator.ts:4607-4613`
- **Fix:** Added stage immutability guard: if `canonicalContext.is_locked && canonicalContext.growth_stage`, stage override is BLOCKED with log.

### BUG 4: DiagnosisOnlyMode redundant execution — FIXED
- **File:** `orchestrator.ts:5061`
- **Fix:** Added guard: DiagnosisOnly reformatting only runs when symbolic reasoner did NOT produce a primary decision with confidence > 0.6.

### BUG 5: Authority resolver blocks CROP when observations exist — FIXED
- **File:** `diagnostic-flow-controller.ts:369-377`
- **Fix:** Added enforced crop damage override check BEFORE `shouldSkipCropRules()`. If `preAuthorityResult.enforced_decision` exists, it overrides the standard authority path.

### Observation Pipeline Checkpoint — ADDED
- **File:** `orchestrator.ts:3129`
- **Fix:** Added `[OBSERVATION_CHECKPOINT]` log after collection phase showing count and first 10 codes.

## Guaranteed Invariants (v5.1)
1. `allObservationsForPreAuth` is the single flat observation set — no undefined variables
2. Only ONE authority detector (v5 authority-aware) executes per request
3. Canonical stage is immutable when locked — no drift from generic calculators
4. DiagnosisOnlyMode does not duplicate symbolic reasoner results
5. Crop damage observations prevent authority blocking even when NLU returns NONE
