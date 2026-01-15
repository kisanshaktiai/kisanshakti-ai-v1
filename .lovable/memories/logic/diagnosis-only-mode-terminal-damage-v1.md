# Memory: logic/diagnosis-only-mode-terminal-damage-v1
Updated: 2026-01-15

The AI Chat implements a 'Diagnosis-Only Mode' (v1.0.0) that activates when:
1. Canonical context is LOCKED (crop + stage known)
2. Terminal damage indicators present (SEEDLING_DIED, PLANT_DIED, AFFECTED_PART_WHOLE, PATCHY_DAMAGE + SEVERITY_HIGH)
3. At least 1 rule matched

When activated:
- SKIPS all clarification logic entirely
- SKIPS IDENTIFY_LOCATION, IDENTIFY_PART, and generic scopes
- IMMEDIATELY executes symbolic rule engine
- Presents top 1-3 diagnoses ranked by confidence
- Offers photo ONLY as optional confirmation ("For more accuracy, upload a photo")

Key files:
- `diagnosis-only-mode.ts`: Contains `shouldActivateDiagnosisOnlyMode()`, `generateDiagnosisOnlyOutput()`, `formatDiagnosisForLLM()`
- `orchestrator.ts`: Checks activation before clarification gate, generates DIAGNOSIS_PROVIDED response

Logs show: `Mode=DIAGNOSIS_ONLY`, `Clarification=SKIPPED`, `Source=DECISION_RULES`, `Crop/Stage=LOCKED`

The LLM NEVER asks questions or invents diagnoses - it only formats rule-engine outputs in farmer's language.
