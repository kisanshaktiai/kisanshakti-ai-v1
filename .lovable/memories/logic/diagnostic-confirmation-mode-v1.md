# Memory: logic/diagnostic-confirmation-mode-v6-final-verified

The AI Chat implements a 'Diagnostic Confirmation' mode (v6.0.0) that activates when crop/stage are known and terminal/high-severity damage (e.g., SEEDLING_DIED, PLANT_DIED, AFFECTED_PART_WHOLE, or PATCHY_DAMAGE + SEVERITY_HIGH) is detected. (1) Permanently blocks 'IDENTIFY_LOCATION' to prevent redundant location questioning. (2) Presents 4-6 cause-narrowing options (e.g., DEAD_HEART_PRESENT, LARVAE_VISIBLE) derived from candidate rules. (3) Replaces 'None of the above' with a mandatory '📷 Take Photo' option. (4) Uses 'PreservedCanonicalContext' (a locked, single immutable object) to pass crop, stage, DAS, and NDVI data. (5) Rule-driven options always take priority over NLU fallback. (6) Selection re-runs the symbolic brain with updated facts. Behavior mirrors a senior agronomist—confirming the cause, not the problem.

## Key Architecture Components

1. **CanonicalContext Contract** (canonical-context-contract.ts): Defines a SINGLE, IMMUTABLE context object built EXACTLY ONCE per turn and passed by reference through: orchestrator → hypothesis-evaluator → clarification-generator → UI. No function may rebuild or infer context.

2. **buildCanonicalContext()**: Creates the locked context from landContext, throws FAIL-FAST error if hasLandContext=true but data is incomplete.

3. **validateContextIntegrity()**: Called at critical points to catch invariant violations early. Throws if hasContext=true but context is null/UNKNOWN.

4. **checkDiagnosticConfirmationAuthority()**: Preemptive authority function that runs BEFORE any other clarification logic. Uses hasTerminalDamage() and getDetectedTerminalDamage() from canonical contract.

5. **Terminal Damage Indicators**: SEEDLING_DIED, AFFECTED_PART_WHOLE, ESTABLISHMENT_FAILURE, PATCHY_DAMAGE, GAPS_IN_FIELD, PLANT_DEATH, CROP_FAILURE, DEAD_SEEDLINGS, PLANT_DRYING, WILTING_SEVERE.

6. **High Severity Indicators**: SEVERITY_HIGH, ENTIRE_FIELD_AFFECTED, SEVERITY_CRITICAL, AFFECTED_PERCENTAGE_HIGH.

7. **Production Logs**: Must show Scope=DIAGNOSTIC_CONFIRMATION, Source=DECISION_RULES, CanonicalContext=LOCKED, and preserved crop/stage/DAS/NDVI context.

## Invariants

- Context is created EXACTLY ONCE per turn (not rebuilt)
- If hasLandContext=true but context is incomplete, system MUST fail fast
- IDENTIFY_LOCATION is PERMANENTLY BLOCKED when crop context is known
- Rule-driven options MUST take priority over NLU fallback
- Photo option is MANDATORY (replaces NONE_OF_THE_ABOVE)
