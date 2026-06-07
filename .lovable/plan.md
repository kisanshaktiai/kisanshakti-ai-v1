## Root cause confirmed

The repeated Marathi answers are not caused by the new observation translation resolver. The failure is earlier in the decision-brain workflow:

```text
farmer query
  → queryRoute often falls to GENERAL_INFO
  → IntentClassifier may classify incorrectly or correctly
  → resolveIntentToObservations() is NOT called
  → intent_observation_mapping is bypassed
  → hardcoded/fallback observation injection is used instead
  → rules are evaluated too broadly or with no meaningful observations
  → proactive/stage rules or STAGE_ADVISORY_FALLBACK win
  → same crop-stage answer appears for different questions
```

Evidence from the uploaded recent log:

- Weed query: `या शेतात तन येवू नये म्हणून काय मारावे ?`
- Router: `GENERAL_INFO (50%)`
- LLM intent: `COTTON_SUCKING_PEST (90%)` even though crop is Rice and query is weed prevention
- Clarification was bypassed: `DIRECT_MODE/advisory intent`
- Rule path became broad: `Symbolic Bridge: 60 rules matched for all`
- Wrong primary surfaced: `PROACTIVE_FLOOD_PREPAREDNESS_001`
- `resolveIntentToObservations()` exists, but current orchestrator only calls `mapToObservationCodes()`, a small local mapper, so the large DB SSOT `intent_observation_mapping` table is not actually feeding the rule engine.

## What I will change

### 1. Make canonical intent resolution DB-first

In `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`:

- After `extractSemanticMeaning()`, call the existing DB resolver:

```text
resolveIntentToObservations(intent_code, crop_code, DAS, growth_stage)
```

- Inject returned `observation_codes` into:
  - `expandedObservationCodes`
  - `allObservationsForPreAuth`
  - `authoredObservations`
- Mark these as `EXTRACTED`/DB-derived, not synthetic.
- Keep `mapToObservationCodes()` only as a fallback when DB resolution fails or returns zero rows.

This restores the intended SSOT flow:

```text
observation_intent_master
  → intent_observation_mapping
  → observation_master
  → decision_rules
  → observation_translations / intent_translations for narration
```

### 2. Stop `GENERAL_INFO` from becoming a dangerous direct-mode bypass

In `orchestrator.ts`:

- Remove `GENERAL_INFO` from broad advisory direct-mode / symptom-free rule execution when the classifier intent is not truly general.
- If route is `GENERAL_INFO` but DB intent is `FERTILIZER_SCHEDULE`, `WEED_PROBLEM`, `IRRIGATION_QUERY`, etc., trust the DB intent and route to the symbolic brain with that intent’s observation mappings.
- Only allow stage-only fallback for true status/general questions, not fertilizer/weed/input recommendation queries.

### 3. Fix DB vocabulary override matching for Devanagari

Current override uses word-boundary regex:

```text
\b<phrase_pattern>\b
```

This does not reliably match Devanagari terms like `खत`, `तण`, `तन`, so rows already in `crop_vocabulary` do not override `GENERAL_INFO`.

I will replace it with safe Unicode substring/escaped-regex matching:

```text
message.includes(phrase_pattern)
```

with regex escaping only where needed.

### 4. Add missing weed vocabulary rows only if absent

Use the existing `crop_vocabulary` table, not a new table.

Add only missing Marathi/Hindi weed terms such as:

```text
तण → WEED_PROBLEM
तन → WEED_PROBLEM  (Marathi typo/dialect seen in the failing query)
खरपतवार → WEED_PROBLEM
निंदणी / निंदण → WEED_PROBLEM
```

This follows the user’s rule: if SSOT data is missing, add it to the existing table, not seed a parallel table.

### 5. Add intent/category rule scoping before selecting a primary decision

In the rule evaluation path before `evaluateRulesLayered()`:

- For `FERTILIZER_SCHEDULE`, prefer nutrition/fertilizer rules.
- For `WEED_PROBLEM`, prefer weed-management rules.
- For crop health/status queries, allow crop-stage/health/NDVI rules.
- Prevent unrelated proactive weather/flood rules from becoming primary unless the intent or weather context explicitly warrants them.

This prevents `PROACTIVE_FLOOD_PREPAREDNESS_001` from winning a weed/fertilizer query just because crop/stage context exists.

### 6. Make fallback intent-aware, not stage-only

If no rule can be selected:

- Fertilizer query: return a DB-grounded “soil test / stage-specific fertilizer data missing” clarification/advisory, not generic monitoring.
- Weed query: return a weed-specific clarification/advisory, not generic monitoring.
- Crop status query: keep the stage/health response.

No LLM agronomic invention; fallback text must use `intent_translations` / existing deterministic response text where possible.

### 7. Verification

I will verify with the three reported Marathi turns:

1. `सध्या पिकाची काय स्थिति आहे.`
   - Expected: crop status / stage health response.
2. `चांगली उगवण होणे साठी काय खत द्यावे?`
   - Expected: fertilizer/nutrition path, not same stage-monitoring answer.
3. `या शेतात तन येवू नये म्हणून काय मारावे ?`
   - Expected: weed-management path, not crop health/flood/stage generic answer.

And check logs for:

```text
[IntentResolver] Found ... observation codes
[DB_INTENT_OBSERVATIONS] injected ...
[IntentScope] intent=WEED_PROBLEM/FERTILIZER_SCHEDULE
```

## Out of scope

- No new SSOT tables.
- No seeding `observation_differential_questions`.
- No LLM-generated agronomic recommendations.
- No changes to frontend chat UI.
- No rewriting the whole decision brain; this is a wiring and scoping fix.