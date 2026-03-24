# Memory: logic/diagnosis-only-mode-terminal-damage-v2-final
Updated: 2026-01-15

The AI Chat implements a 'Diagnosis-Only Mode' (v2.0.0) with **rule-granted diagnosis authority** that activates when:
1. Terminal damage ObservationKeys are present (SEEDLING_DIED, PLANT_DIED, AFFECTED_PART_WHOLE, PATCHY_DAMAGE+SEVERITY_HIGH, DEAD_HEART, TERMITE_DAMAGE, etc.)
2. Canonical context is LOCKED (crop + stage known) - but terminal damage activates even with limited context

**HARD INVARIANT**: When terminal damage is detected, authority = CROP is ENFORCED:
- `assertTerminalDamageAuthority()` throws error if authority !== CROP
- NLU gating is DISABLED - `hasPestOrDisease`, `intent`, `confidence` are IGNORED
- Authority is derived from ObservationKeys, not NLU classification
- `authority = NONE` is IMPOSSIBLE when terminal damage exists

When activated:
- `detectTerminalDamageForAuthority()` runs BEFORE authority-resolver.ts
- `createEnforcedCropAuthority()` overrides normal authority resolution
- SKIPS all clarification logic permanently (IDENTIFY_LOCATION, IDENTIFY_PART, generic scopes)
- IMMEDIATELY executes symbolic rule engine
- Presents top 1-3 diagnoses ranked by confidence with agronomist-style explanations
- Photo upload offered ONLY as optional confirmation

Logs show: `Mode=DIAGNOSIS_ONLY`, `Authority=CROP`, `NLU_GATING=DISABLED`, `Clarification=SKIPPED`, `Source=DECISION_RULES`, `Crop/Stage=LOCKED`

Key files:
- `diagnosis-only-mode.ts`: Contains `detectTerminalDamageForAuthority()`, `createEnforcedCropAuthority()`, `assertTerminalDamageAuthority()`, `shouldActivateDiagnosisOnlyMode()`, `generateDiagnosisOnlyOutput()`
- `orchestrator.ts`: Enforces terminal damage authority BEFORE clarification gate

The system behaves like a senior agronomist: when crops die, we diagnose causes — we do not ask permission from NLU.
