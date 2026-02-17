

# Hardening Patch Plan — Symbolic Decision Brain (Post-Refactor Safety Layer)

This plan applies 8 targeted hardening corrections only. No architectural redesign.

---

## Patch 1: Remove Symptom Mapping from FERTILIZER_SCHEDULE

**Problem:** The hardcoded `INTENT_TO_OBSERVATION_MAPPINGS` in `observation-code-mapper.ts` (line 57-148) currently does NOT have a FERTILIZER_SCHEDULE entry — so the code is already safe. However, the previously approved plan proposed inserting `FERTILIZER_SCHEDULE -> LEAF_YELLOWING, LEAF_PALE_GREEN, STUNTED_PLANTS` into the new `intent_observation_mapping_v2` table. That insertion must be removed from the migration SQL.

**Fix:**
- When executing the Phase 1+2 DB migration (from previously approved plan), do NOT insert these rows:
  ```
  ('FERTILIZER_SCHEDULE', 'LEAF_YELLOWING', 1)
  ('FERTILIZER_SCHEDULE', 'LEAF_PALE_GREEN', 2)
  ('FERTILIZER_SCHEDULE', 'STUNTED_PLANTS', 3)
  ```
- Ensure `observation_intent_master` has `clarification_mode = 'DIRECT'` and `max_clarification_rounds = 0` for FERTILIZER_SCHEDULE (already in the approved plan SQL).
- FERTILIZER_SCHEDULE routes to symbolic engine calendar logic, not symptom logic — zero observation mappings is correct.

---

## Patch 2: Add Stage Context Guard (Parallel to Crop Guard)

**Problem:** No `requires_stage_context` check exists anywhere in the codebase (confirmed: 0 matches). The previously approved plan added this column to `observation_intent_master` but did not specify the exact orchestrator location.

**File:** `supabase/functions/ai-agriculture-chat/index.ts`

**Fix:** After the intent classification result is obtained and intent metadata is loaded from DB, add a deterministic stage guard AFTER the crop context guard and BEFORE symbolic engine execution:

```typescript
// After crop-context guard:
if (intentMeta.requires_stage_context && !landContext?.crop_stage) {
  return {
    type: 'CLARIFICATION_QUESTION',
    question: { /* ask farmer for crop stage */ },
    reason: 'STAGE_CONTEXT_REQUIRED'
  };
}
```

This requires the orchestrator to load intent metadata (including `requires_stage_context`) from the `observation_intent_master` table — which is already part of the enhanced `getIntentRegistry()` function from the approved plan (Phase 3/7).

---

## Patch 3: Verify No Residual DAS Logic Outside Stage Layer

**Finding:** `das_min`/`das_max` appear in exactly 2 files:

| File | Usage | Verdict |
|------|-------|---------|
| `decision/intent-resolver.ts` (lines 100-104, 141-144, 243-247) | Queries `crop_stage_master` and `intent_observation_mapping` tables | SAFE - these tables legitimately have DAS columns for biological gating |
| `decision/db-observation-validator.ts` (lines 74-77, 85-92, 140-143, 176-179, 250-253) | Queries same tables for validation | SAFE - same legitimate DB column access |

**Verdict:** No DAS logic exists in the rule evaluator, condition evaluator, or symbolic scoring layers. All DAS usage is confined to DB query layers reading `crop_stage_master.das_min/das_max` and `intent_observation_mapping.das_min/das_max` — which is correct. The `das_min`/`das_max` columns on these tables convert DAS to `growth_stage`, which is the single biological clock abstraction used downstream.

**No code changes needed** for this patch. The architecture is already clean.

---

## Patch 4: Ensure Ontology Mappings Use Normalized Text Only

**Finding:** The `mapToObservationCodes()` function in `observation-code-mapper.ts` (line 326-468) receives a `SemanticExtraction` object. It accesses:
- `semantic.intent_code` — symbolic code, not raw text (SAFE)
- `semantic.visual_changes` — LLM-extracted English tokens (SAFE)
- `semantic.pest_behavior` — LLM-extracted English tokens (SAFE)
- `semantic.affected_plant_parts` — LLM-extracted English tokens (SAFE)
- `semantic.distribution_pattern` — LLM-extracted English tokens (SAFE)
- `semantic.severity_indicator` — LLM-extracted English tokens (SAFE)

Search for `farmerMessage`/`farmer_message`/`rawMessage`/`raw_message` in this file returned **0 matches**.

**Verdict:** All ontology mappings already operate exclusively on LLM-normalized English semantic output. No raw farmer text leaks into the mapping layer.

**No code changes needed** for this patch.

---

## Patch 5: Improve Script Detection Dominance Logic

**Problem:** Current `detectLanguage()` in `nlu-agent.ts` (lines 339-386) only detects Devanagari vs Latin with simple counting. A small Latin substring (e.g., "sugarcane") can override dominant Tamil/Marathi script.

**File:** `supabase/functions/ai-agriculture-chat/agents/nlu-agent.ts`

**Fix:** Replace the existing `detectLanguage()` function (lines 339-386) with dominance-scored multi-script detection:

```typescript
function detectLanguage(text: string): LanguageDetectionResult {
  const SCRIPT_RANGES: Record<string, RegExp> = {
    ta: /[\u0B80-\u0BFF]/g,
    te: /[\u0C00-\u0C7F]/g,
    kn: /[\u0C80-\u0CFF]/g,
    ml: /[\u0D00-\u0D7F]/g,
    bn: /[\u0980-\u09FF]/g,
    gu: /[\u0A80-\u0AFF]/g,
    pa: /[\u0A00-\u0A7F]/g,
    or: /[\u0B00-\u0B7F]/g,
    en: /[a-zA-Z]/g,
  };
  
  // Devanagari disambiguation (mr vs hi)
  const devanagariPattern = /[\u0900-\u097F]/g;
  const hindiWords = /है|हैं|का|की|के|में|से|को|पर|और|था|थी|थे|हूँ|हो/g;
  const marathiWords = /आहे|आहेत|चे|ची|च्या|मध्ये|वर|आणि|होते|होती|असे/g;

  // Count all scripts
  const scriptCounts: Record<string, number> = {};
  const devanagariCount = (text.match(devanagariPattern) || []).length;
  
  for (const [lang, regex] of Object.entries(SCRIPT_RANGES)) {
    scriptCounts[lang] = (text.match(regex) || []).length;
  }
  
  // Add Devanagari as combined mr+hi count
  scriptCounts['devanagari'] = devanagariCount;
  
  // Find dominant script (excluding English for non-Latin scripts)
  const nonLatinScripts = Object.entries(scriptCounts)
    .filter(([k]) => k !== 'en' && k !== 'devanagari')
    .sort((a, b) => b[1] - a[1]);
  
  let primaryLanguage = 'en';
  let confidence = 0.5;
  let isCodeSwitched = false;
  
  const englishCount = scriptCounts['en'] || 0;
  
  // Check if a non-Latin script dominates
  if (devanagariCount > englishCount || (nonLatinScripts[0] && nonLatinScripts[0][1] > englishCount)) {
    if (devanagariCount > 0 && devanagariCount >= (nonLatinScripts[0]?.[1] || 0)) {
      // Devanagari dominant - disambiguate mr vs hi
      const marathiWordCount = (text.match(marathiWords) || []).length;
      const hindiWordCount = (text.match(hindiWords) || []).length;
      primaryLanguage = marathiWordCount > hindiWordCount ? 'mr' : 'hi';
      confidence = Math.min(0.95, 0.7 + (Math.max(marathiWordCount, hindiWordCount) * 0.05));
    } else if (nonLatinScripts[0] && nonLatinScripts[0][1] > 0) {
      // Other script dominant
      primaryLanguage = nonLatinScripts[0][0];
      confidence = Math.min(0.95, 0.7 + (nonLatinScripts[0][1] * 0.03));
    }
    
    if (englishCount > 2) isCodeSwitched = true;
  } else if (englishCount > 0) {
    primaryLanguage = 'en';
    confidence = Math.min(0.95, 0.7 + (englishCount * 0.02));
    if (devanagariCount > 0 || (nonLatinScripts[0] && nonLatinScripts[0][1] > 0)) {
      isCodeSwitched = true;
    }
  }
  
  // ISO validation
  const VALID_ISO639 = new Set(['en','hi','mr','ta','te','kn','ml','bn','gu','pa','or','as','ur','sd','ne','si']);
  if (!VALID_ISO639.has(primaryLanguage)) primaryLanguage = 'en';
  
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  
  return {
    primary_language: primaryLanguage as any,
    confidence,
    is_code_switched: isCodeSwitched,
    secondary_language: isCodeSwitched ? (primaryLanguage === 'en' ? 'hi' : 'en') as any : undefined,
    dialect_detected: `STANDARD_${primaryLanguage.toUpperCase()}`,
    normalized_text: text.trim(),
    tokens
  };
}
```

Also update the `AIPerceptionResult` interface (line 72):
- `language: 'mr' | 'hi' | 'en'` changes to `language: string`

And `LanguageDetectionResult` in `types.ts` (lines 382-390):
- `primary_language: 'mr' | 'hi' | 'en'` changes to `primary_language: string`
- `secondary_language?: 'mr' | 'hi' | 'en'` changes to `secondary_language?: string`

And `InputMetadata.language_detected` (line 27):
- `'mr' | 'hi' | 'en' | 'mixed'` changes to `string`

And `LanguageAnalysis.detected_language` (line 130):
- `'mr' | 'hi' | 'en' | 'mixed'` changes to `string`

And `original_script` (line 135):
- `'DEVANAGARI' | 'LATIN' | 'MIXED'` changes to `string`

---

## Patch 6: Add Stage Guard for HYBRID Routing

**Problem:** No HYBRID routing logic exists anywhere in the codebase (confirmed: 0 matches for `routing_target`, `HYBRID`, or `INFO_MODULE` in routing context).

**File:** `supabase/functions/ai-agriculture-chat/index.ts` (orchestrator section)

**Fix:** When intent metadata is loaded from DB (part of the approved plan's `getIntentRegistry()` with metadata), add routing logic:

```typescript
if (intentMeta.routing_target === 'HYBRID') {
  if (landContext?.active_crop) {
    // Route to symbolic engine — weather impacts active crop
    routeToSymbolicEngine();
  } else {
    // Route to info module — general weather advisory
    routeToInfoModule();
  }
} else if (intentMeta.routing_target === 'INFO_MODULE') {
  routeToInfoModule();
} else {
  // SYMBOLIC_BRAIN (default)
  routeToSymbolicEngine();
}
```

This must be placed AFTER crop/stage context guards and BEFORE symbolic engine invocation.

---

## Patch 7: Telemetry Enrichment for Fallback Monitoring

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`

**Fix:** Replace the `emergencyFallback()` function (from approved plan) with enriched structured logging:

```typescript
function emergencyFallback(rawLLMOutput: string | null, modelLatency?: number): IntentClassification {
  console.error(JSON.stringify({
    event: 'INTENT_CLASSIFIER_FALLBACK',
    timestamp: new Date().toISOString(),
    model_response_time_ms: modelLatency || null,
    intent_registry_version: _intentCache?.timestamp || null,
    raw_output_preview: rawLLMOutput?.substring(0, 200) || null,
    fallback_intent: 'UNKNOWN_OBSERVATION',
    fallback_confidence: 0.15
  }));
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.15 };
}
```

Also add `modelLatency` tracking in the `classifyFarmerIntent()` function:

```typescript
const llmStartTime = Date.now();
const response = await fetch(endpoint, { ... });
const modelLatency = Date.now() - llmStartTime;

// In catch block:
return emergencyFallback(null, modelLatency);
```

---

## Patch 8: Concurrency Lock for Cache Refresh

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`

**Fix:** Add concurrency-safe cache loading to prevent duplicate DB calls during cache refresh:

```typescript
let _intentCache: { codes: Set<string>; prompt: string; metadata: Map<string, any>; timestamp: number } | null = null;
let _intentLoadingPromise: Promise<typeof _intentCache> | null = null;
const CACHE_TTL = 15 * 60 * 1000;

async function getIntentRegistry() {
  // Return valid cache
  if (_intentCache && Date.now() - _intentCache.timestamp < CACHE_TTL) {
    return _intentCache;
  }
  
  // If already loading, await the in-flight promise
  if (_intentLoadingPromise) return _intentLoadingPromise;
  
  // Start loading and store the promise
  _intentLoadingPromise = loadIntentRegistryFromDB();
  try {
    const result = await _intentLoadingPromise;
    _intentCache = result;
    return result;
  } finally {
    _intentLoadingPromise = null;
  }
}
```

Apply the same pattern to the observation-code-mapper DB cache in `observation-code-mapper.ts`.

---

## Summary of Changes

| Patch | File(s) | Change Type |
|-------|---------|-------------|
| 1 | DB migration SQL (from approved plan) | Remove 3 rows from INSERT |
| 2 | `index.ts` (orchestrator) | Add stage context guard |
| 3 | None | Already clean (verified) |
| 4 | None | Already clean (verified) |
| 5 | `nlu-agent.ts`, `types.ts` | Rewrite detectLanguage() with dominance scoring + fix type unions |
| 6 | `index.ts` (orchestrator) | Add HYBRID routing logic |
| 7 | `intent-classifier.ts` | Enrich fallback telemetry with latency + registry version |
| 8 | `intent-classifier.ts`, `observation-code-mapper.ts` | Add concurrency lock on cache refresh |

**Not modified (as required):** ObservationKey enum, decision_rules schema, symbolic-reasoner evaluation logic, authority hierarchy, clarification system design, routing_target semantics, multilingual narration layer.

