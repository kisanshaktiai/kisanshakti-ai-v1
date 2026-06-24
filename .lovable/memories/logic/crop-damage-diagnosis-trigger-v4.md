# Memory: logic/crop-damage-diagnosis-trigger-v4
Updated: 2026-01-15

The AI Chat implements a 'Diagnosis-First Mode' (v4.1.0) that treats crop damage observations as sufficient grounds for DIAGNOSIS mode with hypothesis-driven options, independent of pest/disease identification.

**HARD AGRONOMIC INVARIANT**: If canonical ObservationKeys OR CrossCropSymptoms indicate crop damage (e.g., PATCHY_GROWTH, AFFECTED_PATCHES, OVERALL_WEAK, SEEDLING_DIED, PLANT_DIED) with severity ≥ MEDIUM, the system MUST:
1. Activate DIAGNOSIS mode immediately
2. Run `evaluateCandidateHypotheses()` BEFORE any clarification
3. Return hypothesis-driven options from `decision_rules` (NOT generic clarification)
4. Always include photo option as final fallback

**Key Functions**:
- `detectCropDamageForDiagnosis()`: Pre-authority gate for damage detection
- `evaluateCandidateHypotheses()`: Pre-evaluates rules to build candidate set
- `generateDiagnosisFirstResponse()`: Generates ranked diagnosis options from hypotheses
- `createUnknownDiagnosisResponse()`: Emits UNKNOWN diagnosis when no rules match
- `formatForClarificationUI()`: Formats for UI rendering

**Damage Types → Response Flow**:
- `TERMINAL`: DIAGNOSIS_ONLY mode (skip all clarification), direct to rules
- `SIGNIFICANT`: DIAGNOSIS_FIRST mode (hypothesis-driven options, NOT generic)
- `MINOR`: DIAGNOSIS_FIRST mode with optional clarification

**Production Logging**:
```
Mode=DIAGNOSIS_FIRST
Source=DECISION_RULES
Clarification=HYPOTHESIS_DRIVEN
Crop=<CROP_CODE>
Stage=<GROWTH_STAGE>
Hypotheses=<COUNT>
```

**Key Invariants**:
- `authority = NONE` is PROHIBITED when crop damage observations exist
- When land context exists, options MUST come from `decision_rules.observable_characteristics`
- Generic symptom lists are NEVER returned when hypotheses exist
- Photo option is ALWAYS available as final choice
- Diagnoses ranked by: priority → confidence → severity

The system behaves like a senior field agronomist: when crop damage is reported with land context, we present ranked diagnosis options immediately — we do NOT ask generic clarification questions.
