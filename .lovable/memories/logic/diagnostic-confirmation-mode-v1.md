# Memory: logic/diagnostic-confirmation-mode-v1

The AI Chat implements a 'Diagnostic Confirmation' mode. This mode activates when crop and stage are known and terminal or high-severity damage (e.g., SEEDLING_DIED, PLANT_DIED, AFFECTED_PART_WHOLE, or PATCHY_DAMAGE + SEVERITY_HIGH) is detected. It permanently blocks the 'IDENTIFY_LOCATION' scope to prevent generic questioning (e.g., "leaf/stem/root") when whole-plant damage is already known. Instead, it presents 4-6 cause-narrowing options derived from the 'observable_characteristics' of top candidate rules (e.g., DEAD_HEART_PRESENT, LARVAE_VISIBLE). The final option is always '📷 Take Photo' instead of 'None of the above', pivoting to visual evidence if verbal symptoms aren't confirmed. Vision output is converted to ObservationKeys and merged into the canonical state for symbolic re-evaluation. Rationale: Matches real-world agronomist behavior of confirming the cause rather than restating the location of a known problem.

## Key Components

1. **PreservedCanonicalContext** (clarification-scope-resolver.ts): An immutable context type with crop_code, crop_name, growth_stage, days_since_sowing, ndvi_value, ndvi_trend, and is_locked=true. This context MUST be passed forward intact during clarification.

2. **Fail-Fast Invariants** (orchestrator.ts): If hasLandContext=true but landContext is incomplete, the system throws an error immediately instead of falling back to generic clarification.

3. **Terminal Damage Indicators**: SEEDLING_DIED, AFFECTED_PART_WHOLE, ESTABLISHMENT_FAILURE, PATCHY_DAMAGE, GAPS_IN_FIELD, PLANT_DEATH, CROP_FAILURE, DEAD_SEEDLINGS, PLANT_DRYING, WILTING_SEVERE.

4. **High Severity Indicators**: SEVERITY_HIGH, ENTIRE_FIELD_AFFECTED, SEVERITY_CRITICAL, AFFECTED_PERCENTAGE_HIGH.

5. **Production Logs**: Must show Scope=DIAGNOSTIC_CONFIRMATION, Source=DECISION_RULES, and preserved crop/stage/DAS/NDVI context.
