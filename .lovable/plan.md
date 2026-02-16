

# Neuro-Symbolic Architecture Redesign: LLM-to-Symbol Bridge

## Deep Audit Results

### Current Architecture Flow (Verified)
```text
Farmer Message
    |
    v
[NLU Agent] -- Raw perception (observations, urgency, emotion)
    |
    v
[Semantic Extractor v5.1] -- Calls intent-classifier.ts (LLM)
    |                         Returns intent_code + confidence
    v
[Observation Code Mapper v2.0] -- Hardcoded INTENT_TO_OBSERVATION_MAPPINGS
    |                              Maps intent_code to ObservationKey[]
    v
[Legacy Language Induction v3.0] -- STILL RUNS as fallback
    |                                 200+ hardcoded Marathi/Hindi keywords
    v
[MERGE step in orchestrator] -- Merges LLM codes + legacy codes
    |
    v
[Understanding Completeness Checker] -- Field-count-based gating
    |
    v
[Canonical State Builder] -- Builds state for rule engine
    |
    v
[Symbolic Rule Engine] -- Layered evaluation + hypothesis
    |
    v
[LLM Response Formatter] -- Render-only narration
```

### Critical Gaps Confirmed Against Expert Analysis

| Gap | Status | Evidence |
|---|---|---|
| No canonical_hint_mapping table | CONFIRMED | Table does not exist in DB. Mapper uses hardcoded arrays |
| intent_observation_mapping only has SUGARCANE | CONFIRMED | 46 rows, ALL crop_code=SUGARCANE. Cotton/Rice/etc have 0 mappings |
| Legacy keyword dictionaries still active | CONFIRMED | language-induction-layer.ts runs every request (orchestrator.ts line 2128) |
| No Zod schema validation on LLM output | CONFIRMED | intent-classifier.ts uses manual safeExtractJson with regex fallbacks |
| No LLM prompt versioning | CONFIRMED | No version tracking in semantic-extractor or intent-classifier |
| No multi-turn context in LLM bridge | CONFIRMED | extractSemanticMeaning() takes only farmerMessage + language, no history |
| Coverage % gate still present | CONFIRMED | hasMinimumCoverage() imported from legacy layer (orchestrator.ts line 103) |
| No confidence calibration | CONFIRMED | LLM confidence passed through directly without hybrid adjustment |
| query-router.ts has 100+ Marathi/Hindi regex patterns | CONFIRMED | Lines 50-250+ with hardcoded language patterns |
| observation_master has only 63 entries | CONFIRMED | Limited canonical symbol vocabulary |
| No structured semantic bridge metrics | CONFIRMED | No telemetry table for bridge performance |

---

## Implementation Plan (6 Phases)

### PHASE 1: Create canonical_hint_mapping Table + Populate (Week 1)

**Database Migration:**

Create the core governance table that bridges LLM semantic output to observation codes:

```sql
CREATE TABLE canonical_hint_mapping (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_hint TEXT NOT NULL UNIQUE,
  observation_code TEXT NOT NULL,
  crop_code TEXT,
  weight_modifier DECIMAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_observation_code 
    FOREIGN KEY (observation_code) REFERENCES observation_master(observation_code)
);

CREATE INDEX idx_canonical_hint ON canonical_hint_mapping(canonical_hint);
CREATE INDEX idx_obs_code ON canonical_hint_mapping(observation_code);
```

**Data population:** Seed 200+ canonical hints covering all crops (SC, CTN, RICE, WHEAT, MAIZE, SOYBEAN) mapped to the 63 observation_master codes. Examples:
- `BLACK_WHIP_STRUCTURE` to `SMUT_WHIP_PRESENT` (crop_code=SC)
- `YELLOW_LEAVES` to `LEAF_YELLOWING` (crop_code=NULL, universal)
- `DEAD_HEART` to `DEAD_HEART_PRESENT` (crop_code=SC)
- `BOLL_DAMAGE` to `BOLL_DAMAGE` (crop_code=CTN)

**Also:** Add `semantic_bridge_metrics` table for observability:

```sql
CREATE TABLE semantic_bridge_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  intent TEXT,
  confidence DECIMAL,
  canonical_hints TEXT[],
  mapping_success BOOLEAN,
  symbolic_invoked BOOLEAN,
  fallback_used BOOLEAN,
  latency_ms INTEGER,
  prompt_version TEXT,
  farmer_id UUID,
  tenant_id UUID
);
```

**Also:** Extend `ai_decision_log` with new columns:

```sql
ALTER TABLE ai_decision_log 
ADD COLUMN IF NOT EXISTS top_5_rejected_rules JSONB,
ADD COLUMN IF NOT EXISTS evaluation_trace JSONB,
ADD COLUMN IF NOT EXISTS missing_data_fields TEXT[],
ADD COLUMN IF NOT EXISTS prompt_version TEXT;
```

---

### PHASE 2: Create llm-semantic-normalizer.ts (Week 2)

**New file:** `supabase/functions/ai-agriculture-chat/agents/llm-semantic-normalizer.ts`

This replaces the current semantic-extractor.ts + intent-classifier.ts chain with a single, contract-driven module.

**Key design:**

1. **Strict JSON contract** with Zod validation:
```typescript
const SemanticOutputSchema = z.object({
  intent: z.enum([
    'REPORT_SYMPTOM', 'ASK_TREATMENT', 'GENERAL_INFO', 
    'CLARIFICATION_RESPONSE', 'GREETING'
  ]),
  crop_inference: z.enum([
    'SUGARCANE', 'COTTON', 'RICE', 'WHEAT', 'MAIZE', 
    'SOYBEAN', 'ONION', 'TOMATO', 'UNKNOWN'
  ]),
  symptom_entities: z.array(z.object({
    entity_type: z.enum(['STRUCTURE', 'COLOR', 'DAMAGE', 'GROWTH_ISSUE', 'PEST', 'DISEASE']),
    canonical_hint: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    confidence: z.number().min(0).max(1)
  })).default([]),
  affected_part: z.enum(['LEAF', 'STEM', 'ROOT', 'FRUIT', 'FLOWER', 'WHOLE_PLANT', 'UNKNOWN']),
  severity_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  time_reference: z.enum(['RECENT', 'PROGRESSING', 'CHRONIC', 'UNKNOWN']),
  requires_clarification: z.boolean(),
  confidence_score: z.number().min(0).max(100),
  _debug_reasoning: z.string().optional()
}).strict();
```

2. **Prompt budget:** 1200 tokens max. Contains ONLY semantic extraction instructions. No agronomic rules, no dosage, no crop stages.

3. **Prompt versioning:**
```typescript
const SEMANTIC_BRIDGE_PROMPT_VERSION = 'v1.0.0';
// Stored in metrics + audit logs
```

4. **Multi-turn context** (minimal, stateless):
```typescript
interface SemanticBridgeInput {
  current_message: string;
  locked_crop?: string;
  locked_stage?: string;
  last_canonical_hint?: string;
}
```

5. **Feature flag:**
```typescript
const USE_LLM_SEMANTIC_BRIDGE = Deno.env.get('USE_LLM_SEMANTIC_BRIDGE') === 'true';
```

6. **Legacy fallback:** If LLM fails (429, timeout, malformed JSON), fall back to current semantic-extractor.ts chain. Log fallback usage to metrics.

---

### PHASE 3: Canonical Hint to Symbol Mapper (Week 2-3)

**New file:** `supabase/functions/ai-agriculture-chat/decision/canonical-hint-mapper.ts`

Replaces hardcoded `INTENT_TO_OBSERVATION_MAPPINGS` in observation-code-mapper.ts with database-driven deterministic lookup.

**Logic:**

```typescript
async function mapCanonicalHints(
  hints: Array<{ canonical_hint: string; confidence: number }>,
  cropCode: string
): Promise<MappedObservationCodes> {
  // 1. Query canonical_hint_mapping table
  // 2. Prioritize crop-specific mappings over universal ones
  // 3. Apply weight_modifier for multi-symptom boosting
  // 4. Validate each observation_code against observation_master
  // 5. Return deterministic codes
  
  // If hint not found in DB -> return UNKNOWN_SYMBOL
  // NEVER guess or fabricate observation codes
}
```

**Confidence calibration** (hybrid, not blind LLM trust):

```typescript
function calibrateConfidence(
  llmConfidence: number,
  mappingValid: boolean,
  cropContextMatch: boolean,
  multiSymptomCoherence: boolean
): number {
  return (
    llmConfidence * 0.6 +
    (mappingValid ? 0.2 : 0) +
    (cropContextMatch ? 0.1 : 0) +
    (multiSymptomCoherence ? 0.1 : 0)
  );
}
```

---

### PHASE 4: Confidence Gate Rewrite (Week 3)

**Modify:** `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts`

Replace the current multi-factor gate with a clean confidence-driven gate:

```text
calibrated_confidence >= 60 --> Run symbolic engine
calibrated_confidence 40-59 --> Symbolic + clarification
calibrated_confidence < 40  --> Clarification only

EXCEPTION: If intent == GENERAL_INFO AND crop context exists
           --> Always run symbolic (NDVI/stage rules apply)
```

**Key changes:**
- Remove `hasMinimumCoverage()` dependency from orchestrator
- Remove ASCII ratio input-side checks (keep output-side Devanagari validation in formatter)
- Gate on calibrated confidence, not raw LLM confidence
- Never block symbolic if crop context + symptoms exist AND confidence >= 40

---

### PHASE 5: Orchestrator Integration (Week 3-4)

**Modify:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Changes in Layer 2 (LLM Understanding, lines 2075-2300):**

1. Replace the current 3-step extraction (semantic extractor + observation mapper + legacy induction + merge) with:

```text
IF USE_LLM_SEMANTIC_BRIDGE:
  semantic = await llmSemanticNormalizer(message, { locked_crop, locked_stage, last_hint })
  codes = await mapCanonicalHints(semantic.symptom_entities, cropCode)
  confidence = calibrateConfidence(semantic.confidence_score, ...)
  Log to semantic_bridge_metrics
ELSE:
  // Legacy path (current code)
  semantic = await extractSemanticMeaning(message)
  codes = mapToObservationCodes(semantic)
  // ... existing merge logic
```

2. Remove the legacy induction layer execution when bridge is active (lines 2126-2138)

3. Remove the MERGE step (lines 2141-2213) when bridge is active - the new normalizer produces complete output

4. Remove router entity fallback injection (lines 2216-2301) when bridge is active - the normalizer handles all languages

5. Pass `last_canonical_hint` from session state for multi-turn context

6. Log `prompt_version` to ai_decision_log

---

### PHASE 6: Language Hardcoding Removal + Clarification Fix (Week 4-5)

**6A: Remove hardcoded patterns from query-router.ts**

The query-router currently has 100+ Marathi/Hindi regex patterns. Under the new bridge:
- Keep the router for ROUTE classification (STATIC_DATA, GREETING, etc.) but simplify patterns
- Remove symptom/pest/disease extraction from router (now handled by normalizer)
- Keep `detected_entities` for backward compatibility but flag as deprecated

**6B: Clarification redesign**

When bridge returns `requires_clarification: true`:
- If `symptom_entities` empty AND `crop_inference` known: generate crop-stage-aware options from `intent_observation_mapping` (expanding to all crops, not just SUGARCANE)
- If `symptom_entities` empty AND `crop_inference` UNKNOWN: return open-ended prompt (acceptable to have 0 structured options)
- If `symptom_entities` exist but `severity_level` UNKNOWN: generate severity options
- If `symptom_entities` exist but `affected_part` UNKNOWN: generate part-based options

**6C: Populate intent_observation_mapping for all crops**

Currently only 46 rows for SUGARCANE. Need to add mappings for:
- Cotton (CTN): ~40 rows
- Rice (RICE): ~30 rows
- Wheat (WHT): ~20 rows
- Soybean (SOY): ~20 rows
- Others: ~20 rows each

Total target: 200+ active mappings.

---

## Risk Assessment

| Phase | Risk | Mitigation |
|---|---|---|
| 1. DB migration | LOW | Additive only, no existing schema changes |
| 2. New normalizer | MEDIUM | Feature flag + legacy fallback for 6 months |
| 3. Hint mapper | LOW | Falls back to existing mapper if DB lookup fails |
| 4. Gate rewrite | MEDIUM | A/B test with 10% traffic first |
| 5. Orchestrator | HIGH | Feature flag controls entire path. Rollback = set flag to false |
| 6. Language removal | LOW | Done incrementally after bridge is stable |

## Invariant Checks Post-Deployment

Track these metrics weekly:
- UNKNOWN_OBSERVATION rate: target less than 5% (current estimated ~15-20%)
- Rules Fired rate when symptoms exist: target greater than 80%
- Clarification options greater than 0 when clarify=true: target 95%+
- Legacy fallback usage: target less than 5% after month 1
- Bridge latency p95: target less than 200ms
- No hardcoded mr/hi words in new normalizer or mapper

## Files Created/Modified Summary

**New files (3):**
- `supabase/functions/ai-agriculture-chat/agents/llm-semantic-normalizer.ts`
- `supabase/functions/ai-agriculture-chat/decision/canonical-hint-mapper.ts`
- `supabase/functions/ai-agriculture-chat/decision/confidence-calibrator.ts`

**Modified files (4):**
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Layer 2 rewrite under feature flag)
- `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` (confidence gate logic)
- `supabase/functions/ai-agriculture-chat/agents/query-router.ts` (simplify patterns)
- `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts` (0-options fix)

**Database changes (3):**
- New table: `canonical_hint_mapping`
- New table: `semantic_bridge_metrics`
- Alter table: `ai_decision_log` (add 4 columns)
- Data insert: ~200 canonical hint mappings + ~150 intent_observation_mappings for non-SC crops

**Deprecated (not deleted, kept as fallback):**
- `language-induction-layer.ts` (keyword dictionaries)
- `observation-code-mapper.ts` INTENT_TO_OBSERVATION_MAPPINGS (hardcoded arrays)
- `semantic-extractor.ts` (replaced by normalizer)
- `intent-classifier.ts` (merged into normalizer)

