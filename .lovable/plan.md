

# Production-Final Plan: Symbolic Decision Brain — Intent Layer Refactoring

## Current State Confirmed by Audit

| Component | Confirmed Status |
|-----------|-----------------|
| `VALID_INTENT_CODES` | 20 codes HARDCODED in `intent-resolver.ts` (line 270-295) |
| `INTENT_CLASSIFICATION_PROMPT` | 20 descriptions HARDCODED in `intent-classifier.ts` (line 50-85) |
| `INTENT_TO_OBSERVATION_MAPPINGS` | 15 entries HARDCODED in `observation-code-mapper.ts` (line 57-148) |
| `observation_intent_master` DB | 15 rows (missing 5 codes used in code: WEED_PROBLEM, FERTILIZER_SCHEDULE, IRRIGATION_QUERY, HARVEST_TIMING, GENERAL_CROP_INFO) |
| `intent_observation_mapping` DB | 46 rows, ALL for crop_code=SUGARCANE only. Columns: intent_code, crop_code, growth_stage, das_min, das_max, observation_code |
| `NLU Agent AIPerceptionResult.language` | HARDCODED `'mr' \| 'hi' \| 'en'` (line 72) |
| `types.ts InputMetadata.language_detected` | HARDCODED `'mr' \| 'hi' \| 'en' \| 'mixed'` (line 27) |
| `types.ts LanguageAnalysis.detected_language` | HARDCODED `'mr' \| 'hi' \| 'en' \| 'mixed'` (line 130) |
| `NLU LLM prompt` | HARDCODED `"language": "mr" \| "hi" \| "en"` in JSON schema (line 195) |
| `detectLanguage()` | Only detects Devanagari vs Latin (line 339-386). No Tamil/Telugu/Kannada/Bengali/Gujarati/Punjabi/Odia script detection |
| Emergency fallback | 10 regex patterns with mr/hi keywords + some regional script keywords (line 254-308) |
| Symbolic reasoner DAS filtering | NOT at SQL level. `loadRulesForContext()` filters by crop_code + is_active at SQL, then stage in-memory. DAS is NOT used in rule pre-filter |
| `intent-resolver.ts getValidObservationCodes()` | Filters by intent_code + crop_code + DAS at SQL level (correct) |

---

## Phase 1: Database Migration — Intent Ontology Governance

Add governance columns to `observation_intent_master` to prevent semantic drift and control clarification behavior:

```sql
ALTER TABLE observation_intent_master
ADD COLUMN IF NOT EXISTS allowed_observation_groups text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS requires_crop_context boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS requires_stage_context boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS routing_target text DEFAULT 'SYMBOLIC_BRAIN',
ADD COLUMN IF NOT EXISTS is_biological boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS clarification_mode text DEFAULT 'AUTO',
ADD COLUMN IF NOT EXISTS max_clarification_rounds integer DEFAULT 2;
```

Then INSERT missing + new intent codes with governance:

```sql
-- Missing 5 codes (exist in code, not in DB)
INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds) VALUES
('WEED_PROBLEM', 'Weeds growing, weed competition, unwanted plants', 'WEED',
 true, '{WEED}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 1),
('FERTILIZER_SCHEDULE', 'When/how much fertilizer, nutrient schedule', 'NUTRITION',
 true, '{NUTRITION}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('IRRIGATION_QUERY', 'Water schedule, irrigation timing', 'WATER',
 true, '{WATER}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('HARVEST_TIMING', 'When to harvest, crop maturity signs', 'HARVEST',
 true, '{HARVEST,OUTPUT}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('GENERAL_CROP_INFO', 'General crop management, planting info', 'GENERAL',
 true, '{}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0);

-- New core agronomic intents
INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds) VALUES
('SOIL_TESTING_QUERY', 'Soil test interpretation, pH, EC, organic carbon', 'SOIL',
 true, '{SOIL}', false, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('SEED_SELECTION', 'Variety selection, seed rate, seed treatment', 'ESTABLISHMENT',
 true, '{ESTABLISHMENT}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('POST_HARVEST_HANDLING', 'Storage, drying, grading after harvest', 'POST_HARVEST',
 true, '{POST_HARVEST}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('ANIMAL_DAMAGE', 'Damage from wild boar, monkeys, birds, rats', 'PEST',
 true, '{PEST}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 2),
('FLOOD_DROUGHT_DAMAGE', 'Flood damage recovery, drought management, waterlogging', 'CLIMATE',
 true, '{WATER,WATER_STRESS}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 1);

-- Advisory intents (NEVER activate biological rule engine)
INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds) VALUES
('MARKET_PRICE_QUERY', 'Current market price, MSP, where to sell', 'ECONOMICS',
 true, '{}', true, false, 'INFO_MODULE', false, 'NONE', 0),
('SUBSIDY_SCHEME_INFO', 'Government schemes, subsidies, PM-KISAN', 'ECONOMICS',
 true, '{}', false, false, 'INFO_MODULE', false, 'NONE', 0),
('EQUIPMENT_USAGE', 'Sprayer, tractor operation and maintenance', 'EQUIPMENT',
 true, '{}', false, false, 'INFO_MODULE', false, 'NONE', 0),
('CROP_INSURANCE', 'Crop insurance claim, PMFBY', 'ECONOMICS',
 true, '{}', true, false, 'INFO_MODULE', false, 'NONE', 0);

-- Hybrid intent (weather can affect biological decisions)
INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds) VALUES
('WEATHER_ADVISORY', 'Weather forecast impact, seasonal planning', 'CLIMATE',
 true, '{}', false, false, 'HYBRID', false, 'NONE', 0);

-- Update existing 15 intents with governance columns
UPDATE observation_intent_master SET
  allowed_observation_groups = '{PHYSIOLOGY}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 3
WHERE intent_code = 'COLOR_CHANGE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{PEST,DISEASE}',
  requires_crop_context = true, requires_stage_context = true,
  is_biological = true, clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 3
WHERE intent_code IN ('LEAF_DAMAGE_VISIBLE', 'LEAF_MARKS_OR_SPOTS',
  'PEST_PRESENCE_VISIBLE', 'DISEASE_LIKE_PATTERN', 'STEM_DAMAGE');

UPDATE observation_intent_master SET
  allowed_observation_groups = '{WATER,WATER_STRESS}',
  is_biological = true, requires_crop_context = true, requires_stage_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code IN ('WATER_STRESS_SIGNAL', 'WILTING_OR_DROOPING');

UPDATE observation_intent_master SET
  allowed_observation_groups = '{NUTRITION}',
  is_biological = true, requires_crop_context = true, requires_stage_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'NUTRIENT_STRESS_SIGNAL';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{ESTABLISHMENT}',
  is_biological = true, requires_crop_context = true, requires_stage_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'EMERGENCE_FAILURE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{GROWTH}',
  is_biological = true, requires_crop_context = true, requires_stage_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'GROWTH_ANOMALY';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{FIELD}',
  is_biological = true, requires_crop_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'UNEVEN_FIELD_PATTERN';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{OUTPUT}',
  is_biological = true, requires_crop_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 1
WHERE intent_code = 'YIELD_OR_OUTPUT_ISSUE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{ROOT}',
  is_biological = true, requires_crop_context = true, requires_stage_context = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'ROOT_OR_BASE_PROBLEM';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{}',
  routing_target = 'SYMBOLIC_BRAIN', is_biological = false,
  clarification_mode = 'AUTO', max_clarification_rounds = 2
WHERE intent_code = 'UNKNOWN_OBSERVATION';
```

---

## Phase 2: Crop-Agnostic Intent-to-Observation Mapping

Create new table that decouples intents from crops. Crop filtering belongs in the rule engine (which already does it in `loadRulesForContext` + `filterByStage`).

```sql
CREATE TABLE IF NOT EXISTS intent_observation_mapping_v2 (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_code text NOT NULL,
  observation_code text NOT NULL,
  confidence_rank integer NOT NULL DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(intent_code, observation_code)
);

-- Add indexes for production performance
CREATE INDEX IF NOT EXISTS idx_iom_v2_intent_code ON intent_observation_mapping_v2(intent_code);
CREATE INDEX IF NOT EXISTS idx_iom_v2_active ON intent_observation_mapping_v2(is_active) WHERE is_active = true;

-- Migrate unique intent-observation pairs (drop crop_code, das_min, das_max)
INSERT INTO intent_observation_mapping_v2 (intent_code, observation_code, confidence_rank, is_active)
SELECT DISTINCT ON (intent_code, observation_code)
  intent_code, observation_code, MIN(confidence_rank) OVER (PARTITION BY intent_code, observation_code), true
FROM intent_observation_mapping
WHERE is_active = true
ON CONFLICT (intent_code, observation_code) DO NOTHING;

-- Seed mappings for NEW intents
INSERT INTO intent_observation_mapping_v2 (intent_code, observation_code, confidence_rank) VALUES
-- WEED_PROBLEM
('WEED_PROBLEM', 'WEED_INFESTATION', 1),
('WEED_PROBLEM', 'STUNTED_PLANTS', 2),
-- FERTILIZER_SCHEDULE
('FERTILIZER_SCHEDULE', 'LEAF_YELLOWING', 1),
('FERTILIZER_SCHEDULE', 'LEAF_PALE_GREEN', 2),
('FERTILIZER_SCHEDULE', 'STUNTED_PLANTS', 3),
-- IRRIGATION_QUERY
('IRRIGATION_QUERY', 'LEAF_WILTING', 1),
('IRRIGATION_QUERY', 'LEAF_DRYING', 2),
-- SOIL_TESTING_QUERY
('SOIL_TESTING_QUERY', 'LEAF_YELLOWING', 1),
-- SEED_SELECTION
('SEED_SELECTION', 'SEEDLING_DIED', 1),
-- FLOOD_DROUGHT_DAMAGE
('FLOOD_DROUGHT_DAMAGE', 'LEAF_WILTING', 1),
('FLOOD_DROUGHT_DAMAGE', 'ROOTS_ROTTED', 2),
-- ANIMAL_DAMAGE
('ANIMAL_DAMAGE', 'LEAF_CHEWING', 1),
('ANIMAL_DAMAGE', 'STEM_BORING_MARKS', 2)
ON CONFLICT (intent_code, observation_code) DO NOTHING;
```

---

## Phase 3: DB-Driven Intent Classifier (Controlled, Cached)

**File: `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`**

Changes:
1. Remove `import { VALID_INTENT_CODES, IntentCode } from '../decision/intent-resolver.ts'`
2. Replace hardcoded `INTENT_CLASSIFICATION_PROMPT` with DB-driven builder
3. Replace `emergencyKeywordFallback()` with minimal safe default + telemetry logging
4. Use 15-minute cache TTL (not 5) per your scalability feedback

```typescript
// NEW: DB-driven intent registry with 15-minute cache
let _intentCache: { codes: Set<string>; prompt: string; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function getIntentRegistry(): Promise<{ codes: Set<string>; prompt: string }> {
  if (_intentCache && Date.now() - _intentCache.timestamp < CACHE_TTL) {
    return _intentCache;
  }
  
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('observation_intent_master')
    .select('intent_code, intent_description')  // NO routing_target exposed to LLM
    .eq('is_active', true)
    .order('intent_code');
  
  const rows = data || [];
  const codes = new Set(rows.map(r => r.intent_code));
  codes.add('UNKNOWN_OBSERVATION');
  
  // Build prompt from DB — only intent_code + description visible to LLM
  const intentList = rows.map(r => `- ${r.intent_code}: ${r.intent_description}`).join('\n');
  
  const prompt = `You are an intent classifier for farmer messages about agriculture.

Your task:
- Read the farmer message (ANY language including mixed-language/code-switching)
- Choose exactly ONE intent_code from the list below
- For mixed-language (e.g., "mala sugarcane la pani kiti dyave"), understand meaning across ALL languages
- Do not explain, diagnose, or infer causes

INTENT CODES:
${intentList}

Return JSON only:
{"intent_code": "...", "confidence": 0.0-1.0}

Farmer message:
{farmer_message}`;

  _intentCache = { codes, prompt, timestamp: Date.now() };
  return _intentCache;
}
```

Replace `emergencyKeywordFallback()` (lines 254-308) with:

```typescript
function emergencyFallback(rawLLMOutput: string | null): IntentClassification {
  // Log raw output for production observability
  console.error(`[IntentClassifier] LLM_FALLBACK_TRIGGERED raw_output=${
    rawLLMOutput ? rawLLMOutput.substring(0, 200) : 'null'
  }`);
  // Safe default — downstream clarification loop handles ambiguity
  return {
    intent_code: 'UNKNOWN_OBSERVATION',
    confidence: 0.15
  };
}
```

Update `classifyFarmerIntent()` to use `getIntentRegistry()`:

```typescript
export async function classifyFarmerIntent(farmerMessage: string): Promise<IntentClassification> {
  try {
    const registry = await getIntentRegistry();
    const prompt = registry.prompt.replace('{farmer_message}', farmerMessage);
    
    // ... existing LLM call logic ...
    
    // Validate against DB-loaded codes (not hardcoded array)
    if (!registry.codes.has(intentCode)) {
      intentCode = 'UNKNOWN_OBSERVATION';
    }
    // ...
  } catch (error) {
    return emergencyFallback(null);
  }
}
```

---

## Phase 4: Update Intent Resolver — DB-Driven Validation + Crop-Agnostic Query

**File: `supabase/functions/ai-agriculture-chat/decision/intent-resolver.ts`**

Changes:
1. `VALID_INTENT_CODES` array stays as compile-time fallback but is no longer source of truth
2. Add `getValidIntentCodesFromDB()` with 15-minute cache
3. `getValidObservationCodes()` queries `intent_observation_mapping_v2` (no crop_code filter)
4. `isObservationValidForCropStage()` stays unchanged (used by rule engine for biological validation)

```typescript
// Keep static array as compile-time fallback
export const VALID_INTENT_CODES = [...] as const;

// NEW: Runtime validation from DB (preferred)
let _intentCodeCache: Set<string> | null = null;
let _intentCodeCacheTime = 0;

export async function getValidIntentCodesFromDB(): Promise<Set<string>> {
  if (_intentCodeCache && Date.now() - _intentCodeCacheTime < 15 * 60 * 1000) {
    return _intentCodeCache;
  }
  const { data } = await supabase
    .from('observation_intent_master')
    .select('intent_code')
    .eq('is_active', true);
  _intentCodeCache = new Set((data || []).map(r => r.intent_code));
  _intentCodeCacheTime = Date.now();
  return _intentCodeCache;
}

// UPDATE: Query crop-agnostic v2 table
export async function getValidObservationCodes(
  intentCode: string
): Promise<ObservationMapping[]> {
  const { data } = await supabase
    .from('intent_observation_mapping_v2')
    .select('observation_code, confidence_rank')
    .eq('intent_code', intentCode)
    .eq('is_active', true)
    .order('confidence_rank', { ascending: true });
  return data || [];
}
```

Note: The signature change (removing `cropCode` and `das` params) requires updating all callers of `getValidObservationCodes()`. The old table stays for `isObservationValidForCropStage()` which is used by the agronomic validator for biological gating.

---

## Phase 5: Remove Hardcoded Observation-Code Mapper

**File: `supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts`**

Replace `INTENT_TO_OBSERVATION_MAPPINGS` (lines 57-148) with a DB-driven loader:

```typescript
let _mappingCache: Map<string, IntentMapping> | null = null;
let _mappingCacheTime = 0;

async function getIntentMappingsFromDB(): Promise<Map<string, IntentMapping>> {
  if (_mappingCache && Date.now() - _mappingCacheTime < 15 * 60 * 1000) {
    return _mappingCache;
  }
  
  const { data } = await supabase
    .from('intent_observation_mapping_v2')
    .select('intent_code, observation_code, confidence_rank')
    .eq('is_active', true)
    .order('confidence_rank');
  
  const map = new Map<string, IntentMapping>();
  for (const row of (data || [])) {
    if (!map.has(row.intent_code)) {
      map.set(row.intent_code, {
        intent_codes: [row.intent_code],
        observation_codes: [],
        default_part: ObservationKey.AFFECTED_PART_UNKNOWN,
        default_severity: ObservationKey.SEVERITY_MEDIUM
      });
    }
    const obsKey = row.observation_code as ObservationKey;
    if (Object.values(ObservationKey).includes(obsKey)) {
      map.get(row.intent_code)!.observation_codes.push(obsKey);
    }
  }
  
  _mappingCache = map;
  _mappingCacheTime = Date.now();
  return map;
}
```

The `mapToObservationCodes()` function becomes async and queries the DB cache. The `VISUAL_CHANGE_MAPPINGS` (lines 159-224), `PEST_BEHAVIOR_MAPPINGS`, `AFFECTED_PART_MAPPINGS`, `DISTRIBUTION_MAPPINGS`, and `SEVERITY_MAPPINGS` all remain hardcoded — these are English-only ontology mappings that operate on LLM-normalized text, not raw farmer language. They are stable, correct, and ontology-aligned.

---

## Phase 6: Language Type Fix + Multi-Script Detection

**File: `supabase/functions/ai-agriculture-chat/agents/nlu-agent.ts`**

6a. Line 72: `language: 'mr' | 'hi' | 'en'` changes to `language: string`

6b. Line 195 in LLM prompt: Change `"language": "mr" | "hi" | "en"` to `"language": "<ISO 639-1 code>"` with guidance: "Use standard 2-letter ISO 639-1 codes (mr, hi, en, ta, te, kn, bn, gu, pa, or, ml, etc.)"

6c. Line 350: `let primaryLanguage: 'mr' | 'hi' | 'en' = 'en'` changes to `let primaryLanguage: string = 'en'`

6d. `detectLanguage()` function (lines 339-386): Add script detection for Tamil, Telugu, Kannada, Bengali, Gujarati, Punjabi, Odia, Malayalam alongside existing Devanagari:

```typescript
const SCRIPT_RANGES: Record<string, RegExp> = {
  ta: /[\u0B80-\u0BFF]/g, te: /[\u0C00-\u0C7F]/g, kn: /[\u0C80-\u0CFF]/g,
  ml: /[\u0D00-\u0D7F]/g, bn: /[\u0980-\u09FF]/g, gu: /[\u0A80-\u0AFF]/g,
  pa: /[\u0A00-\u0A7F]/g, or: /[\u0B00-\u0B7F]/g,
};
```

6e. Add ISO 639-1 validation guard:

```typescript
const VALID_ISO639: Set<string> = new Set([
  'en','hi','mr','ta','te','kn','ml','bn','gu','pa','or','as','ur','sd','ne','si'
]);

function validateLanguageCode(code: string): string {
  return VALID_ISO639.has(code) ? code : 'en';
}
```

6f. Line 382: Replace `primaryLanguage === 'mr' ? 'STANDARD_MARATHI' : primaryLanguage === 'hi' ? 'STANDARD_HINDI' : 'STANDARD_ENGLISH'` with `\`STANDARD_${primaryLanguage.toUpperCase()}\``

**File: `supabase/functions/ai-agriculture-chat/agents/types.ts`**

- Line 27: `language_detected: 'mr' | 'hi' | 'en' | 'mixed'` changes to `language_detected: string`
- Line 130: `detected_language: 'mr' | 'hi' | 'en' | 'mixed'` changes to `detected_language: string`
- Line 135: `original_script?: 'DEVANAGARI' | 'LATIN' | 'MIXED'` changes to `original_script?: string`

---

## Phase 7: Deterministic Crop-Context Guard

Add a pre-symbolic-engine check in the orchestrator to prevent biological intents from executing without crop context. This must be added wherever the orchestrator routes to the symbolic brain.

```typescript
// Before calling symbolic engine:
if (intentMeta.requires_crop_context && !landContext?.active_crop) {
  return {
    type: 'CLARIFICATION_QUESTION',
    question: { /* ask farmer to select crop */ },
    reason: 'CROP_CONTEXT_REQUIRED'
  };
}
```

This requires loading `requires_crop_context` from the `observation_intent_master` table when the intent is classified. The `getIntentRegistry()` function should also cache this metadata:

```typescript
async function getIntentRegistry(): Promise<{
  codes: Set<string>;
  prompt: string;
  metadata: Map<string, { requires_crop_context: boolean; requires_stage_context: boolean; routing_target: string; is_biological: boolean; clarification_mode: string; max_clarification_rounds: number }>;
}> {
  // ... select intent_code, intent_description, requires_crop_context, etc.
  // ... build metadata map alongside prompt
}
```

---

## Phase 8: Telemetry for Fallback Rate

Add a simple counter log in the emergency fallback path to enable production monitoring:

```typescript
function emergencyFallback(rawLLMOutput: string | null): IntentClassification {
  console.error(JSON.stringify({
    event: 'INTENT_CLASSIFIER_FALLBACK',
    timestamp: new Date().toISOString(),
    raw_output_preview: rawLLMOutput?.substring(0, 200) || null,
    fallback_intent: 'UNKNOWN_OBSERVATION',
    fallback_confidence: 0.15
  }));
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.15 };
}
```

This structured log can be queried via Supabase edge function logs for monitoring fallback rate without needing a separate telemetry system.

---

## What Does NOT Change (Correctly Kept)

| Component | Reason |
|-----------|--------|
| `ObservationKey` enum in `observation-ontology.ts` | Stable symbolic ontology — SHOULD be hardcoded |
| `VISUAL_CHANGE_MAPPINGS` in observation-code-mapper | English ontology mapping, not language logic |
| `PEST_BEHAVIOR_MAPPINGS`, `AFFECTED_PART_MAPPINGS`, etc. | English ontology, operates on LLM-normalized text |
| `decision_rules` table | Rule engine already filters by crop_code + stage |
| `symbolic-reasoner.ts loadRulesForContext()` | Already filters crop_code at SQL + stage in-memory (DAS not needed at rule level because stage implicitly encodes DAS range) |
| `isObservationValidForCropStage()` in intent-resolver | Biological validator stays on old table (crop+DAS gating for agronomic safety) |
| Old `intent_observation_mapping` table | Kept for backward compat and biological validation |

---

## DAS Pre-Filter Ordering Verification

Your concern: "Ensure DAS pre-filter is executed BEFORE scoring, not after."

Confirmed safe: The symbolic reasoner's `loadRulesForContext()` (line 483-531) filters by `crop_code` at SQL level, then `filterByStage()` in-memory BEFORE any rule evaluation happens (line 530: `return this.filterByStage(allRules, stage)`). Only filtered rules enter the scoring loop (line 254). DAS is not used directly because `growth_stage` already encodes the DAS range via `crop_stage_master`. The ordering is: SQL filter -> stage filter -> THEN evaluate conditions. This is correct.

---

## Files Modified Summary

| File | Change | Priority |
|------|--------|----------|
| `intent-classifier.ts` | DB-driven prompt + validation, remove emergency keyword fallback, add telemetry | P0 |
| `intent-resolver.ts` | DB-driven VALID_INTENT_CODES, query v2 table for observation codes | P0 |
| `observation-code-mapper.ts` | DB-driven intent mappings (make `mapToObservationCodes` async) | P0 |
| `nlu-agent.ts` | Language type `string`, multi-script detection, ISO validation, prompt fix | P0 |
| `agents/types.ts` | Language fields from union to `string` | P0 |
| Orchestrator (where intent routes to symbolic brain) | Add crop-context guard using `requires_crop_context` | P1 |

| DB Table | Change | Priority |
|----------|--------|----------|
| `observation_intent_master` | Add 7 governance columns + 11 new intent rows + update 15 existing | P0 |
| `intent_observation_mapping_v2` | New crop-agnostic table with indexes, seeded from existing + new | P0 |

---

## Architecture After Implementation

```text
Farmer Message (any of 15+ languages)
  |
  v
NLU Agent (multi-script detection: Devanagari, Tamil, Telugu, Kannada, Bengali, Gujarati, Punjabi, Odia, Latin)
  |
  v
Intent Classifier (DB-driven prompt, DB-validated codes, 15-min cache)
  |
  v
Intent Metadata Lookup (routing_target, requires_crop_context, clarification_mode)
  |                          |                    |
  | routing=SYMBOLIC_BRAIN   | routing=INFO_MODULE | routing=HYBRID
  v                          v                    v
Crop Context Guard        Info Module          Hybrid Router
(if requires_crop_context  (market/subsidy/     (weather: general->INFO,
 && no crop -> clarify)     equipment/insurance)  crop impact->SYMBOLIC)
  |
  v
Intent Resolver (crop-AGNOSTIC obs codes from v2 table)
  |
  v
Observation Code Mapper (DB-driven + ontology enrichment)
  |
  v
Symbolic Reasoner (HERE: crop_code + stage filtering from decision_rules)
  |
  v
Rule Engine (deterministic evaluation)
  |
  v
LLM Narration (language-specific output)
```

