# Memory: logic/diagnostic-confirmation-mode-v5-final

The AI Chat implements a 'Diagnostic Confirmation' mode (v5.0.0) that activates when crop/stage are known and terminal/high-severity damage (e.g., SEEDLING_DIED, PLANT_DIED, AFFECTED_PART_WHOLE, or PATCHY_DAMAGE + SEVERITY_HIGH) is detected. This mode enforces strict invariants: (1) Permanently blocks 'IDENTIFY_LOCATION' and generic scopes to prevent location re-confirmation when whole-plant damage is known. (2) Presents 4-6 cause-narrowing options (e.g., DEAD_HEART_PRESENT, LARVAE_VISIBLE) derived exclusively from 'observable_characteristics' of top candidate rules. (3) Replaces 'None of the above' with a mandatory '📷 Take Photo' option, pivoting to vision-assisted evidence extraction if verbal symptoms aren't confirmed. (4) Uses 'PreservedCanonicalContext' to ensure crop, stage, DAS, and NDVI data are passed as an immutable, locked object, preventing data loss or inference during clarification. (5) Rule-driven options must never be overwritten by NLU fallback. Rationale: System behavior must mirror a senior agronomist—confirming the cause, not the problem.

## Key Components

1. **PreservedCanonicalContext** (clarification-scope-resolver.ts): An immutable context type with crop_code, crop_name, growth_stage, days_since_sowing, ndvi_value, ndvi_trend, and is_locked=true. This context MUST be passed forward intact during clarification.

2. **checkDiagnosticConfirmationAuthority** (clarification-scope-resolver.ts): A preemptive authority function that runs BEFORE any other clarification logic. It checks for terminal/high-severity indicators and blocks IDENTIFY_LOCATION when conditions are met.

3. **Fail-Fast Invariants** (clarification-scope-resolver.ts, clarification-generator.ts): If hasLandContext=true but landContext is incomplete/missing, the system throws an error immediately instead of falling back to generic clarification.

4. **Terminal Damage Indicators**: SEEDLING_DIED, AFFECTED_PART_WHOLE, ESTABLISHMENT_FAILURE, PATCHY_DAMAGE, GAPS_IN_FIELD, PLANT_DEATH, CROP_FAILURE, DEAD_SEEDLINGS, PLANT_DRYING, WILTING_SEVERE.

5. **High Severity Indicators**: SEVERITY_HIGH, ENTIRE_FIELD_AFFECTED, SEVERITY_CRITICAL, AFFECTED_PERCENTAGE_HIGH.

6. **Production Logs**: Must show Scope=DIAGNOSTIC_CONFIRMATION, ClarificationAuthority=DECISION_RULES, ContextPreserved=true, and preserved crop/stage/DAS/NDVI context.
