

# DB-Driven Fix Plan: Romanized Weed Query Routing

## Problem
"shetat khup tan aale aahe" routes to `GENERAL_INFO` instead of `PEST_DISEASE_TREATMENT`. The previous plan proposed adding hardcoded regex patterns — this violates the "no hardcoded regional strings" constraint.

## Architecture Violation in Previous Plan

| Proposed Fix | Violation |
|---|---|
| Add weed regex to `PEST_DISEASE_PATTERNS` in query-router.ts | Hardcoded Romanized Marathi strings |
| Add Romanized examples to intent-classifier.ts prompt | Hardcoded Marathi examples in code |
| Add `gavat` to `emergencyKeywordFallback` | Hardcoded Romanized keyword |

Only the DB inserts (crop_vocabulary + observation_aliases) were compliant.

## Root Cause (Refined)

1. **`crop_vocabulary` table** has `recommended_intent_bias` column but the cache (`VocabEntry` interface) never fetches it
2. **No vocabulary-based route override** exists — even if vocabulary matches "tan" → WEED_PROBLEM, the query router runs synchronously with hardcoded patterns and never consults the DB
3. **Crop vocabulary only loads for specific crop codes** — weed queries without land context get `crop_code = 'UNKNOWN'`, which skips vocab loading entirely

## DB-Driven Fix (4 changes, zero hardcoded strings)

### Change 1: Insert weed vocabulary into `crop_vocabulary` table (DB)

Insert 8 rows with `crop_code = 'ALL'` so they load for any crop:

| phrase_pattern | semantic_hint | crop_code | recommended_intent_bias | recommended_observation_bias |
|---|---|---|---|---|
| tan | weed/unwanted plant in field (Marathi) | ALL | WEED_PROBLEM | WEED_PRESENT |
| tann | weed variant spelling | ALL | WEED_PROBLEM | WEED_PRESENT |
| gavat | grass/weed in Marathi | ALL | WEED_PROBLEM | WEED_PRESENT |
| gawat | grass/weed variant | ALL | WEED_PROBLEM | WEED_PRESENT |
| nindani | weeding activity in Marathi | ALL | WEED_PROBLEM | WEED_PRESENT |
| ghas | grass/weed in Hindi | ALL | WEED_PROBLEM | WEED_PRESENT |
| kharpatvar | weeds in Hindi | ALL | WEED_PROBLEM | WEED_PRESENT |
| kharpat | weed in Marathi | ALL | WEED_PROBLEM | WEED_PRESENT |

### Change 2: Insert weed observation aliases (DB)

Insert into `observation_aliases`:

| alias_code | canonical_code |
|---|---|
| WEED_PRESENT | WEED_PRESENCE |
| WEED_HEAVY | WEED_COMPETITION |
| WEED_INFESTATION | WEED_COMPETITION |
| GRASS_WEEDS | WEED_PRESENCE |

### Change 3: Upgrade `crop-vocabulary-cache.ts` to fetch `recommended_intent_bias`

Currently `VocabEntry` only has `phrase_pattern`, `semantic_hint`, `recommended_observation_bias`. Add `recommended_intent_bias` to the interface and the SELECT query. This makes routing data available from the DB cache.

### Change 4: Add DB-driven vocabulary route override in `orchestrator.ts`

After the synchronous `routeQuery()` call (line 1234), add a new phase:

**PHASE 0.3B: VOCABULARY-BASED ROUTE OVERRIDE**

Logic:
1. Load `crop_vocabulary` for both the detected crop AND `'ALL'` (universal entries)
2. Check if any `phrase_pattern` from the vocabulary appears in the farmer message (case-insensitive word boundary match)
3. If a match is found AND the current route is `GENERAL_INFO`, override the route based on `recommended_intent_bias`:
   - `WEED_PROBLEM` / `REPORT_SYMPTOM` / `PEST_PRESENCE_VISIBLE` / `DISEASE_LIKE_PATTERN` → override to `PEST_DISEASE_TREATMENT`
   - `FERTILIZER_SCHEDULE` → override to route based on existing fertilizer route
4. Set `requires_decision_brain = true` on override
5. Log the override with the matched vocabulary entry for debugging

This is fully DB-driven: adding new Romanized terms for ANY language only requires inserting rows into `crop_vocabulary`.

### Change 5: Also load `ALL` vocabulary in orchestrator

Currently vocab is only loaded for `canonicalContext.crop_code` (line 2319). Add a parallel load for `'ALL'` crop code to capture universal vocabulary (weed terms, general farming terms) that aren't crop-specific.

## Files Changed

| File | Change | Hardcoded strings? |
|---|---|---|
| `crop-vocabulary-cache.ts` | Add `recommended_intent_bias` to VocabEntry + SELECT | No |
| `orchestrator.ts` (~line 1234) | Add vocabulary-based route override after routeQuery | No |
| `orchestrator.ts` (~line 2319) | Also load `ALL` vocabulary | No |
| DB: `crop_vocabulary` | Insert 8 weed rows | N/A (DB data) |
| DB: `observation_aliases` | Insert 4 weed alias rows | N/A (DB data) |

## What Does NOT Change
- `query-router.ts` — no new hardcoded patterns
- `intent-classifier.ts` — no hardcoded prompt changes
- `emergencyKeywordFallback` — no hardcoded keywords
- Symbolic decision brain — untouched
- All existing safety constraints preserved

## Expected Result

For `shetat khup tan aale aahe`:
1. `routeQuery()` → `GENERAL_INFO` (no hardcoded weed patterns, as designed)
2. **NEW: Vocabulary route override** loads `ALL` vocabulary, finds `"tan"` matches `phrase_pattern`, reads `recommended_intent_bias = 'WEED_PROBLEM'` → overrides route to `PEST_DISEASE_TREATMENT`
3. Decision brain fires → weed management rules activate

## Scalability

To support a new Romanized term in ANY language:
- Insert one row into `crop_vocabulary` with the pattern + intent/observation bias
- No code changes needed
- 5-minute cache TTL ensures new entries take effect quickly

