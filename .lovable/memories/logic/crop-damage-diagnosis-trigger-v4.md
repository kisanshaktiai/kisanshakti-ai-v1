# Memory: logic/crop-damage-diagnosis-trigger-v4
Updated: 2026-01-15

The AI Chat implements a 'Crop Damage Diagnosis Trigger' (v4.0.0) that treats crop damage observations as sufficient grounds for DIAGNOSIS mode, independent of pest/disease identification.

**HARD AGRONOMIC INVARIANT**: If canonical ObservationKeys OR CrossCropSymptoms indicate crop damage (e.g., PATCHY_GROWTH, AFFECTED_PATCHES, OVERALL_WEAK, SEEDLING_DIED, PLANT_DIED) with severity ≥ MEDIUM, the system MUST activate the DIAGNOSIS category for the crop and stage.

Key functions in `diagnosis-only-mode.ts`:
- `detectCropDamageForDiagnosis()`: New pre-authority gate that inspects observations, ignores NLU intent/pest detection, sets authority=CROP when damage is present
- `CROP_DAMAGE_OBSERVATION_KEYS`: Extended set of 40+ non-terminal damage indicators that trigger diagnosis
- `TERMINAL_DAMAGE_OBSERVATION_KEYS`: Terminal damage indicators (death, complete failure)
- `createUnknownDiagnosis()`: Emits explicit UNKNOWN diagnosis when no rules match (never suppresses output)

**Damage Types**:
- `TERMINAL`: DIAGNOSIS_ONLY mode (skip clarification), NLU gating disabled
- `SIGNIFICANT`: DIAGNOSIS_WITH_CLARIFICATION mode, NLU gating disabled  
- `MINOR`: DIAGNOSIS mode with optional clarification

**Production Logging**:
```
DiagnosticTrigger=CROP_DAMAGE
Authority=CROP
Mode=DIAGNOSIS
Stage=<GROWTH_STAGE>
RulesExecuted=DIAGNOSIS
NLU_GATING=DISABLED
```

**Key Invariants**:
- `authority = NONE` is PROHIBITED when crop damage observations exist
- Pest/disease entities are diagnostic OUTPUTS, not prerequisites
- If no high-confidence diagnosis matches, emit UNKNOWN diagnosis explicitly
- Diagnosis options ranked by: priority → confidence → severity

The system behaves like a field agronomist: when crop damage is reported, diagnosis is mandatory — not optional.
