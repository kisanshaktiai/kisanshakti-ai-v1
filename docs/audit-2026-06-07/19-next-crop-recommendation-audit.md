# AI Agriculture Chat — Next-Crop Recommendation Audit
**Date:** 2026-06-07  
**Query under investigation:** Marathi `"या शेतात कोणते नवीन पीक घेवू?"` ("which new crop should I grow in this field?")  
**Symptom:** Farmer asking for a next-crop recommendation receives a *last-harvest status message* instead of agronomic crop selection advice.  
**Audit scope:** `supabase/functions/ai-agriculture-chat/` + `_shared/`

---

## 1. Pipeline Map — Failing Query

```
Farmer message: "या शेतात कोणते नवीन पीक घेवू?"
  │
  ▼
[index.ts:288] guardTenantAccess()
  │
  ▼
[orchestrator.ts:1101] normalizeFarmerMessage()
  │  → safeFarmerMessage = "या शेतात कोणते नवीन पीक घेवू?"
  │
  ▼
[orchestrator.ts:1169-1196] fetchComprehensiveLandContext(landId)
  │  → landContext.current_crop = null (field just harvested)
  │  → landContext.last_harvested_schedule = { crop_name: "Wheat", actual_harvest_date: "2026-03-30" }
  │
  ▼
[orchestrator.ts:1213] buildCanonicalContextContract(landContext, true)
  │  [canonical-context-contract.ts:213] isActive = false (cropCode is null)
  │  → canonicalContext.status = 'NO_ACTIVE_CROP'
  │  → canonicalContext.last_harvest = { crop_name: "Wheat", actual_harvest_date: "2026-03-30" }
  │
  ▼
[orchestrator.ts:1296] routeQuery(farmerMessage, ...)
  │  → route = 'GENERAL_INFO' (no crop/pest keywords match)
  │
  ▼
═══════════════════════════════════════════════════════
[orchestrator.ts:1505] checkStaticDataGate(...)       ← FIRST INTERCEPT
═══════════════════════════════════════════════════════
  │  [static-data-gate.ts:250] iterates CROP_NAME.patterns[]
  │  [static-data-gate.ts:94]  pattern /या\s*शेतात.*पीक/i  ← MATCHES
  │  [static-data-gate.ts:260] cropName = null (no active crop)
  │  [static-data-gate.ts:264] last_harvested_schedule found
  │  [static-data-gate.ts:277] builds harvestedResponse:
  │     mr: "🌾 या शेतात मागील हंगामात **Wheat** हे पीक होते.\n
  │          📅 कापणी: ३० मार्च २०२६\n
  │          🌱 सध्या हे शेत रिकामे आहे — नवीन पेरणीसाठी उपलब्ध आहे."
  │  → returns { handled: true, response_type: 'CROP_NAME', confidence: 0.98 }
  │
  ▼
[orchestrator.ts:1528-1589] staticGateResult.handled = true
  │  IMMEDIATE RETURN — no NLU, no intent classification, no rule engine
  │  decision_brain_source = false
  │  agents_used = ['STATIC_DATA_GATE']
  │
  ▼ (if static gate somehow missed — second intercept for any remaining path)
═══════════════════════════════════════════════════════
[orchestrator.ts:1600] canonicalContext.status === 'NO_ACTIVE_CROP'  ← SECOND INTERCEPT
═══════════════════════════════════════════════════════
  │  Hardcoded message:
  │  mr: "🌱 या शेतात सध्या कोणतेही सक्रिय पीक नाही.
  │       मागील हंगामात **Wheat** हे पीक होते.
  │       नवीन पीक नोंदवण्यासाठी 'पीक नोंदणी' वापरा."
  │  IMMEDIATE RETURN — same hard cutoff
  │
  ▼
❌ FARMER RECEIVES: Last-harvest info, not a next-crop recommendation
   (Intent classifier, rule engine, LLM formatter never execute)
```

---

## 2. Language Induction Layer

**File:** `agents/language-induction-layer.ts` (imported at `orchestrator.ts:171`)  
**File:** `agents/nlu-agent.ts` (called via `processNLUAgent`)  
**File:** `_shared/ruralLanguageGuide.ts`

### What it does
The NLU agent (`nlu-agent.ts:158-353`) calls GPT-4o / Gemini with a *Pure Perception* prompt that:
- Detects language (Devanagari Marathi → ISO `mr`)
- Extracts exact farmer words as `observations[]`
- Assesses urgency and emotion
- **Does NOT classify intent** — that is delegated downstream

The system prompt (`nlu-agent.ts:171-243`) explicitly handles romanized Marathi ("pik", "kide", "rog") and correctly disambiguates `mr` vs `hi` via Devanagari word lists (`nlu-agent.ts:374-375`).

### Does it preserve intent words?
**YES** — the NLU perception layer would correctly extract `["या शेतात कोणते नवीन पीक घेवू?"]` as a raw observation and detect language `mr`. **However, this layer is never reached** because the Static Data Gate fires first and returns at `orchestrator.ts:1534`.

---

## 3. Intent Classification

### Canonical intent code list
The classifier (`intent-classifier.ts:33-65`) loads all `intent_code` values from the `observation_intent_master` DB table at cold start. The hard-coded fallback list in `decision/intent-resolver.ts:291-333` (VALID_INTENT_CODES) is:

```
EMERGENCE_FAILURE, GROWTH_ANOMALY, COLOR_CHANGE, WILTING_OR_DROOPING,
LEAF_DAMAGE_VISIBLE, LEAF_MARKS_OR_SPOTS, STEM_DAMAGE, ROOT_OR_BASE_PROBLEM,
PEST_PRESENCE_VISIBLE, DISEASE_LIKE_PATTERN, WATER_STRESS_SIGNAL,
NUTRIENT_STRESS_SIGNAL, UNEVEN_FIELD_PATTERN, YIELD_OR_OUTPUT_ISSUE,
WEED_PROBLEM, FERTILIZER_SCHEDULE, IRRIGATION_QUERY, HARVEST_TIMING,
GENERAL_CROP_INFO, INPUT_RECOMMENDATION, SOIL_TESTING_QUERY,
SEED_SELECTION, MARKET_PRICE_QUERY, WEATHER_QUERY, BORER_IDENTIFICATION,
FLOOD_DROUGHT_DAMAGE, ANIMAL_DAMAGE, RATOON_MANAGEMENT_QUERY, UNKNOWN_OBSERVATION
```

Additionally, `ADVISORY_DIRECT_INTENTS` in `orchestrator.ts:69-100` includes:
```
CROP_ROTATION_QUERY, SEED_SELECTION, VARIETY_SELECTION_QUERY,
SEASONAL_TRANSITION_ALERT, GENERAL_CROP_INFO, ...
```

### Is there a "next-crop recommendation" intent?
**Partial coverage only:**
- `CROP_ROTATION_QUERY` — exists in `ADVISORY_DIRECT_INTENTS` (`orchestrator.ts:94`) but is **not** in `VALID_INTENT_CODES` fallback list, and it is unclear whether it is present in `observation_intent_master`
- `SEED_SELECTION` — covers variety selection, not "which crop family to grow next season"
- `VARIETY_SELECTION_QUERY` — same as above
- `GENERAL_CROP_INFO` — a catch-all, yields no agronomic recommendation

**No intent code named** `NEXT_CROP_RECOMMENDATION`, `NEW_CROP_SELECTION`, or `CROP_PLANNING` exists anywhere in the codebase.

### Emergency keyword fallback (`intent-classifier.ts:280-315`)
The Marathi/Hindi/English phrase `"नवीन पीक घेवू"` / `"अगली फसल"` / `"which new crop to plant"` does **not** match any regex in the keyword fallback table. The fallback would emit `GENERAL_CROP_INFO` at confidence 0.3.

---

## 4. Orchestrator Routing Switch

**File:** `agents/orchestrator.ts`

The routing decision chain (in execution order):
```
1. routeQuery()              [line 1296]  → GENERAL_INFO
2. Vocab route override      [line 1315]  → no override (no crop/symptom vocab match)
3. GREETING guard            [line 1362]  → no match
4. GENERAL_INFO + no landId  [line 1379]  → n/a (landId present)
5. IRRIGATION_SCHEDULING     [line 1390]  → no match
6. CROP_HEALTH               [line 1477]  → no match
7. ═══ checkStaticDataGate() [line 1505]  → MATCH → EARLY RETURN ← ROOT CAUSE
8. NO_ACTIVE_CROP guard      [line 1600]  → never reached (step 7 fires first)
```

### The Static Information Gate — exact code path
`static-data-gate.ts:81-116` defines `CROP_NAME.patterns`:
```typescript
/कोणते\s*पीक/i,
/या\s*शेतात.*पीक/i,      // ← matches "या शेतात कोणते नवीन पीक घेवू?"
/या\s*शेतात.*पिक/i,
...
```

When this matches and `cropName` is null (no active crop):
- `static-data-gate.ts:264` checks `last_harvested_schedule`
- `static-data-gate.ts:277-287` returns last-harvest info and exits
- **Pattern does not distinguish "query about existing crop" from "ask for next-crop advice"**

### NO_ACTIVE_CROP short-circuit
`orchestrator.ts:1600-1673` — if the static gate misses (e.g. query doesn't mention "पीक" or "फसल"), this second guard fires:
```typescript
if (canonicalContext && canonicalContext.status === 'NO_ACTIVE_CROP') {
  // Hardcoded: "no active crop. Use Crop Registration."
  return { ... };
}
```
This is a blanket short-circuit for **all** queries when `status === 'NO_ACTIVE_CROP'`, regardless of intent.

---

## 5. Canonical Context — Available Fields

**File:** `decision/canonical-context-contract.ts`

When `status === 'NO_ACTIVE_CROP'`, the context is built but most fields are null. Available fields for a NEW_CROP_RECOMMENDATION rule group:

| Field | Available for NO_ACTIVE_CROP? | Notes |
|---|---|---|
| `status` | ✅ `'NO_ACTIVE_CROP'` | Triggers short-circuit |
| `last_harvest.crop_name` | ✅ | e.g. "Wheat" |
| `last_harvest.crop_variety` | ✅ | e.g. "GW496" |
| `last_harvest.sowing_date` | ✅ | ISO date |
| `last_harvest.actual_harvest_date` | ✅ | ISO date → season derivable |
| `land_id` | ✅ | For DB queries |
| `farmer_id` | ✅ | For tenant-isolated queries |
| `soil.nitrogen` | ✅/❌ | Populated from authoritative-state-loader if soil test exists |
| `soil.phosphorus` | ✅/❌ | Same |
| `soil.potassium` | ✅/❌ | Same |
| `soil.ph` | ✅/❌ | Same |
| `ndvi.value` | ✅/❌ | Populated if NDVI reading exists |
| `ndvi.trend` | ✅/❌ | Same |
| `weather.temperature` | ✅/❌ | From weather service |
| `weather.humidity` | ✅/❌ | Same |
| `crop_code` | ❌ null | isActive=false |
| `growth_stage` | ❌ null | isActive=false |
| `days_since_sowing` | ❌ null | isActive=false |
| `variety` | ❌ null | isActive=false |

**Missing for crop rotation scoring (not in CanonicalContext):**
- Rotation history beyond one previous crop
- Soil organic carbon (OC) — not mapped in `canonical-context-contract.ts:97-103`
- Soil texture / type name
- Market prices for candidate crops
- Season/month (derivable from `last_harvest.actual_harvest_date`)
- Region/agro-zone (available in `landContext` but not mapped into `CanonicalContext`)

---

## 6. Symbolic Decision Brain / Rule Engine

**File:** `agents/layered-rule-evaluator.ts:1581-1696` — `mapBundledCategory()`

### Existing category registry
```
observation, crop_identity, growth_stage, soil, cropping_system, monitoring,
diagnosis, pest, disease, weed, stress,
nutrient, nutrition,          → PRESCRIPTION
exclusion,                    → EXCLUSION
safety, weather_safety, ...   → SAFETY
prescription, irrigation, fertilizer, ipm_treatment, treatment,
  stage_advisory, economics, harvest, planting, ratoon_management,
  ipm, advisory, cultural_practice, integrated_management, biocontrol,
  nutrient_management, application_timing, best_practice, crop_management,
  planting_practice, planting_material, proactive_irrigation,
  proactive_nutrition, proactive_monitoring, proactive_pest, proactive_yield,
  yield_risk_early_warning, data_quality, ndvi_authority_gate,
  diagnostic_discipline, stress_guard, probable_diagnosis,
  governance, resistance_mgmt, weed_management, physiology,
  general, warning, weather,  clarification, system, status, system_calibration
```

**No `crop_rotation`, `next_crop`, `crop_selection`, or `crop_planning` category exists.**

### How a new `RULE_GROUP_NEXT_CROP_SELECTION` would slot in
1. Add DB `decision_rules` rows with `category = 'crop_rotation'` (or `'crop_selection'`)
2. Register `'crop_rotation': RuleCategory.PRESCRIPTION` in `mapBundledCategory()` (`layered-rule-evaluator.ts:~1625`)
3. The rule evaluator (`evaluateRulesLayered`) will pick them up automatically via `loadAllRules()` from DB

### SYMBOLIC_CONTRACT_VIOLATION invariant
Any unregistered category string logs:
```
🚨 [SYMBOLIC_CONTRACT_VIOLATION] mapBundledCategory: unknown category '...' — register it in layered-rule-evaluator.ts
```
and coerces to `RuleCategory.DIAGNOSIS` (layered-rule-evaluator.ts:1692). This would cause crop rotation rules to be treated as diagnosis, not prescription — they would not produce actionable outputs.

---

## 7. Unified Decision Gate + Response Formatter

**LLM is render-only:** `llm-response-formatter.ts:1-30` is titled "RENDER-ONLY MODE" with constraints:
- LLM can ONLY render what Rule Engine decided
- LLM CANNOT add products, dosages, or actions
- Every output must pass SOURCE VALIDATION

**Expected JSON contract from rule engine → LLM formatter (`LLMFormatterInput`):**
```typescript
{
  farmer_message: string,
  language: string,
  decision_output: DecisionOutput,  // from rule engine
  land_context?: { current_crop, growth_stage, area_acres, soil_health, ndvi, ... },
  data_audit?: DataAudit,
  trace_id?: string,
  supabase_client?: any,
  farmer_addressing?: FarmerAddressing
}
```
For a `NEXT_CROP_RECOMMENDATION` response, the rule engine would need to populate `decision_output` with:
```typescript
{
  action_type: 'RECOMMEND',
  action_text: '...recommended crops...',
  reason_text: '...based on soil N/P/K, previous crop, season...',
  knowledge_text: '...ICAR rotation guidance...'
}
```

---

## 8. Confidence Thresholds and Short-Circuits

**File:** `decision/confidence-thresholds.ts`
**File:** `orchestrator.ts:1600-1673`

Key thresholds (`CONFIDENCE_THRESHOLDS`):
- `TREATMENT_ALLOWED: 0.70` — minimum for prescriptions
- `CLARIFICATION_REQUIRED: 0.60` — triggers clarification
- `MINIMUM_BASE: 0.40` — below this, blocked entirely

**Short-circuit preventing rule engine access for empty-field queries:**
1. **Static Data Gate** (`orchestrator.ts:1505-1589`) — fires before confidence is calculated; bypasses confidence thresholds entirely
2. **NO_ACTIVE_CROP guard** (`orchestrator.ts:1600-1673`) — fires after static gate, also bypasses confidence; no thresholds involved; always returns "register a new crop" message

Neither short-circuit checks whether the intent is advisory (e.g., CROP_ROTATION_QUERY) vs. factual (CROP_NAME). Both treat all queries on a fallow field identically.

---

## 9. Database Checks — decision_rules and observation_master

> **Note:** Direct SQL execution is not available in this read-only audit. The following is based on static analysis of the loader and schema references.

### What the loader queries
`bundled-rules/loader.ts:104-108`:
```sql
SELECT * FROM decision_rules WHERE is_active = true LIMIT 3000
```

### Categories present in decision_rules (inferred from mapBundledCategory registry)
Based on the exhaustive category list in `layered-rule-evaluator.ts:1582-1683`, the following crop-selection-adjacent categories are registered but their DB row count is unknown:
- `planting` → PRESCRIPTION  
- `planting_practice` → PRESCRIPTION  
- `planting_material` → PRESCRIPTION  
- `crop_management` → PRESCRIPTION  
- `cropping_system` → OBSERVATION  

**`crop_rotation`, `next_crop`, `new_crop`, `crop_selection`** — **none registered** in `mapBundledCategory`. If any rows exist in `decision_rules` with these categories, they silently coerce to `RuleCategory.DIAGNOSIS` and produce no actionable output.

### intent_observation_mapping coverage
`intent-resolver.ts:141-161` queries:
```sql
SELECT observation_code, confidence_rank
FROM intent_observation_mapping
WHERE intent_code = :intentCode AND is_active = true
```
If `CROP_ROTATION_QUERY` has no rows in this table, `resolveIntentToObservations` returns `success: false` with an empty observation set, halting the pipeline (`intent-resolver.ts:199-214`).

---

## 10. Logging — ai_decision_log / ai_chat_audit_logs

**File:** `agents/audit-logger.ts`

Tags emitted at each stage:
| Stage | Agent Tag | Log field |
|---|---|---|
| Intent classification | `NLU` | `nlu_output.intent_label` |
| Intent lock | `INTENT_LOCK` | `locked_intent`, `allowed_scopes` |
| Rule evaluation | `RULE_ENGINE`, `SYMBOLIC_BRAIN` | `rules_fired[]`, `actions_returned[]` |
| Gate decision | `PRESCRIPTION_GATE` | `prescription_gate_result` |
| LLM format | `LLM_FORMATTER` | `llm_formatter_audit` |

**Currently missing for this failure path:**
- Static Data Gate intercept is NOT logged to `ai_chat_audit_logs` — `orchestrator.ts:1532` pushes `'STATIC_DATA_GATE'` to `agentsUsed` array, but `auditLogger.logDecision()` is never called before the early return
- NO_ACTIVE_CROP guard is similarly silent: `agentsUsed.push('NO_ACTIVE_CROP_GUARD')` but no audit log entry
- No tag like `STATIC_GATE_INTERCEPT_REASON` or `NO_ACTIVE_CROP_INTENT_BYPASS` identifies *why* intent was never classified

---

## ROOT CAUSE STATEMENT

**Stage that misroutes the query:** `checkStaticDataGate()` at `orchestrator.ts:1505`, specifically the CROP_NAME pattern `/या\s*शेतात.*पीक/i` in `static-data-gate.ts:94`.

**Why it misroutes:**  
The Static Data Gate uses intent-blind regex patterns that match any sentence containing "या शेतात" + "पीक" regardless of whether the sentence is a *factual inquiry* ("what crop is in this field?") or an *advisory request* ("which new crop should I grow?"). The word "नवीन" (new) and the verb "घेवू" (should I take/grow) — which indicate a *future-tense recommendation intent* — are not evaluated. The gate intercepts the query, detects no active crop, finds a last-harvest record, and returns last-harvest info. The intent classifier, rule engine, and LLM formatter are never invoked.

A second guard at `orchestrator.ts:1600` (`NO_ACTIVE_CROP` short-circuit) provides a blanket fallback that directs the farmer to "Crop Registration" regardless of intent — this would fire even if the static gate were fixed, preventing next-crop recommendations from reaching the symbolic brain.

---

## MISSING PIECES — End-to-End NEW_CROP_RECOMMENDATION

### A. Intent Layer
| Item | Status | Location |
|---|---|---|
| Intent code `NEXT_CROP_RECOMMENDATION` (or use `CROP_ROTATION_QUERY`) | ❌ Missing | Must be inserted into `observation_intent_master` table |
| Marathi/Hindi/English examples in classifier prompt | ❌ Missing | `intent-classifier.ts:122-131` ROUTING HINTS block |
| Emergency keyword fallback regex for "नवीन पीक / अगली फसल / next crop" | ❌ Missing | `intent-classifier.ts:285-314` |
| `CROP_ROTATION_QUERY` in `VALID_INTENT_CODES` | ⚠️ Partial | In `ADVISORY_DIRECT_INTENTS` but not in fallback whitelist |

### B. Static Data Gate Fix
| Item | Status | Location |
|---|---|---|
| Distinguish recommendation intent from factual crop-name lookup | ❌ Missing | `static-data-gate.ts:81-116` |
| Add negative-lookahead or "नवीन / घेवू / लावावे / कोणते नवीन" exclusion guard | ❌ Missing | `static-data-gate.ts:250` for loop |

### C. NO_ACTIVE_CROP Gate Bypass
| Item | Status | Location |
|---|---|---|
| Intent-aware bypass: if intent is advisory (CROP_ROTATION_QUERY, SEED_SELECTION, NEXT_CROP_RECOMMENDATION) and status=NO_ACTIVE_CROP, allow pipeline to continue | ❌ Missing | `orchestrator.ts:1600` |

### D. Rule Category Registration
| Item | Status | Location |
|---|---|---|
| `'crop_rotation': RuleCategory.PRESCRIPTION` in `mapBundledCategory` | ❌ Missing | `layered-rule-evaluator.ts:~1625` |
| `'crop_selection': RuleCategory.PRESCRIPTION` | ❌ Missing | Same file |
| `'next_crop': RuleCategory.PRESCRIPTION` | ❌ Missing | Same file |

### E. Decision Rules — DB Rows
| Item | Status |
|---|---|
| `decision_rules` rows with `category = 'crop_rotation'` that evaluate last crop, soil NPK, season | ❌ Missing |
| Rotation constraints (e.g., legume after cereal, rest period) | ❌ Missing |
| Market price integration hook (optional scoring input) | ❌ Missing |

### F. Intent→Observation Mapping
| Item | Status |
|---|---|
| `intent_observation_mapping` rows for `CROP_ROTATION_QUERY` / `NEXT_CROP_RECOMMENDATION` | ❌ Missing |
| `observation_intent_master` row for the new intent code | ❌ Missing |

### G. Scoring Inputs — Available vs Missing
| Input | Available in CanonicalContext | Notes |
|---|---|---|
| Previous crop name | ✅ `last_harvest.crop_name` | One season only |
| Previous crop variety | ✅ `last_harvest.crop_variety` | |
| Harvest date → season | ✅ Derivable from `last_harvest.actual_harvest_date` | Not pre-computed |
| Soil N/P/K | ✅ `soil.*` (if test exists) | Often null |
| Soil pH | ✅ `soil.ph` | Often null |
| NDVI / field health | ✅ `ndvi.*` | Often null |
| Weather/temperature | ✅ `weather.*` | |
| Soil OC (organic carbon) | ❌ Not in CanonicalContext | Add to `soil` section |
| Soil texture/type | ❌ Not mapped | `landContext.soil_type` exists but not propagated |
| Rotation history (>1 season) | ❌ No multi-season rotation table query | Needs DB query |
| Market prices for candidate crops | ❌ Not in CanonicalContext | |
| Agro-zone / region | ❌ Not in CanonicalContext | `landContext.district/state` exists |
| Water availability / irrigation type | ❌ Not in CanonicalContext | `landContext.irrigation_type` exists |

### H. Formatter Contract Extension
| Item | Status | Location |
|---|---|---|
| `action_text` must carry crop recommendation list | ❌ Needs rule data | `decision_rules.action_text` |
| `reason_text` must carry rotation rationale (soil fit, disease break) | ❌ Needs rule data | `decision_rules.reason_text` |
| `knowledge_text` must carry ICAR rotation guidance | ❌ Needs rule data | `decision_rules.knowledge_text` |
| LLM formatter must not add crops beyond what rule engine specified | Enforced | `llm-response-formatter.ts:14-30` |

### I. Logging Tags
| Tag | Status |
|---|---|
| `STATIC_GATE_INTERCEPT_REASON` — why gate fired and what intent was bypassed | ❌ Missing |
| `NO_ACTIVE_CROP_INTENT_BYPASS` — whether advisory intent was detected before cutoff | ❌ Missing |
| `NEXT_CROP_RULE_FIRED` — audit trail when recommendation rule executes | ❌ Missing |

---

## RISK CALLOUTS — Invariants That Must Not Be Broken

| Invariant | Risk | Source |
|---|---|---|
| **CanonicalContext immutability** — built once, never rebuilt | When bypassing NO_ACTIVE_CROP guard, do NOT reconstruct context; pass existing `canonicalContext` | `canonical-context-contract.ts:37-60` |
| **SSOT for intent codes** — `observation_intent_master` is the live registry | New intent code MUST be inserted into DB, not hardcoded only in `VALID_INTENT_CODES` | `intent-classifier.ts:33-65` |
| **Rule-category registry** — unknown category logs SYMBOLIC_CONTRACT_VIOLATION and coerces to DIAGNOSIS | Register `crop_rotation` / `crop_selection` in `mapBundledCategory()` before seeding DB rules | `layered-rule-evaluator.ts:1686-1694` |
| **LLM render-only** — formatter cannot invent crop names, rotation schedules, or market data | Rule engine rows in `decision_rules` must carry the actual crop list in `action_text`; LLM only paraphrases | `llm-response-formatter.ts:14-20` |
| **Tenant isolation** — all DB queries must scope to farmer's tenant | Any new rotation-history query must include `tenant_id` filter | `_shared/tenantAccessGuard.ts` |
| **SYMBOLIC_CONTRACT_VIOLATION** — must not silence these logs | New rules producing no output on empty fields will log violations; they must be investigated, not suppressed | `orchestrator.ts:5556` |
| **Canonical observation codes** — only `^[A-Z][A-Z0-9_]+$` pass audit boundary | Observations produced by new intent must use canonical English codes, not Marathi text | `audit-logger.ts:28-43` |

---

## INCREMENTAL IMPLEMENTATION PLAN

### Phase 0: Audit baseline (this document)
- **Files:** This document
- **Action:** Establish the root-cause baseline; no code changes

### Phase 1: Intent Registration
- **Files:**
  - DB: `observation_intent_master` — insert `NEXT_CROP_RECOMMENDATION` (or `CROP_ROTATION_QUERY` if already partial)
  - DB: `intent_observation_mapping` — add placeholder rows for the new intent
  - `agents/intent-classifier.ts:122-131` — add ROUTING HINTS for "नवीन पीक", "अगली फसल", "next crop", "which crop to grow"
  - `agents/intent-classifier.ts:280-314` — add emergency keyword regex
  - `decision/intent-resolver.ts:291-333` — add `'NEXT_CROP_RECOMMENDATION'` to `VALID_INTENT_CODES`
  - `agents/orchestrator.ts:69-100` — add `'NEXT_CROP_RECOMMENDATION'` to `ADVISORY_DIRECT_INTENTS`

### Phase 2: Static Gate Bypass
- **Files:**
  - `agents/static-data-gate.ts:81-116` — add intent-discrimination guards for the CROP_NAME pattern list
    - Add negative pattern: if message contains "नवीन" AND "घेवू/लावावे/घ्यावे", do NOT handle as CROP_NAME
    - OR: extract a function `isAdvisoryQuery(message)` that returns true for next-crop phrasing
  - `agents/static-data-gate.ts:70-76` — add `intent_hint?: string` to `StaticDataGateInput` interface
  - `agents/orchestrator.ts:1505-1507` — pass detected intent hint (if pre-classified) to gate

### Phase 3: NO_ACTIVE_CROP Guard Bypass for Advisory Intents
- **Files:**
  - `agents/orchestrator.ts:1600-1673` — add intent check before firing blanket short-circuit:
    ```typescript
    const ADVISORY_ON_EMPTY_FIELD = new Set(['NEXT_CROP_RECOMMENDATION', 'CROP_ROTATION_QUERY', 'SEED_SELECTION']);
    if (canonicalContext?.status === 'NO_ACTIVE_CROP') {
      if (!ADVISORY_ON_EMPTY_FIELD.has(detectedIntent)) {
        // existing short-circuit ...
      }
      // else: fall through to rule engine with NO_ACTIVE_CROP context
    }
    ```
  - Note: Intent must be pre-classified before this check; currently NLU runs AFTER the guard

### Phase 4: Rule Group — DB Seed
- **Files:**
  - DB: `decision_rules` — seed rows with:
    - `category = 'crop_rotation'`
    - `crop_code = 'ALL'` or per-crop
    - `conditions_json`: evaluate `last_crop`, `soil_ph`, `soil_n`, `season`, `region`
    - `action_text`: recommended crops with rationale
    - `action_type = 'RECOMMEND'`
  - `agents/layered-rule-evaluator.ts:1624` — register `'crop_rotation': RuleCategory.PRESCRIPTION`

### Phase 5: Scoring Inputs — CanonicalContext Extension
- **Files:**
  - `decision/canonical-context-contract.ts:97-103` — add `organic_carbon`, `texture` to `soil` section
  - `decision/canonical-context-contract.ts:144-148` — add `agro_zone`, `irrigation_type` to metadata section
  - `decision/authoritative-state-loader.ts` — populate new fields from `lands` table

### Phase 6: Formatter Contract Extension
- **Files:**
  - `agents/llm-response-formatter.ts` — add NEXT_CROP_RECOMMENDATION response mode handling
    - Ensure crop list from `action_text` is rendered verbatim
    - Add seasonal context from `last_harvest.actual_harvest_date`
  - `utils/ui-response-builder.ts` — add `CROP_RECOMMENDATION` card type if UI needs structured output

### Phase 7: Logging Tags
- **Files:**
  - `agents/orchestrator.ts:1528-1532` — before early return from static gate, log:
    `auditLogger.logDecision('INFORM', 'DATA_GATE')` + tag `STATIC_GATE_CROP_NAME_INTERCEPT`
  - `agents/orchestrator.ts:1615-1616` — before NO_ACTIVE_CROP return, log intent that was bypassed
  - `agents/audit-logger.ts:197` — add `'NEXT_CROP_BYPASS'` to `decision_type` union

### Phase 8: Tests
- **Files:** (new)
  - `tests/next-crop-recommendation.test.ts` — test that "या शेतात कोणते नवीन पीक घेवू?" with `status=NO_ACTIVE_CROP` routes to rule engine
  - Test that static gate does NOT intercept advisory queries
  - Test that `CROP_ROTATION_QUERY` / `NEXT_CROP_RECOMMENDATION` classify correctly in LLM classifier
  - Test that new `decision_rules` rows produce non-empty `actions_returned`

---

## SUMMARY TABLE

| Stage | Component | Status | Issue |
|---|---|---|---|
| Language induction | `nlu-agent.ts` | ✅ Capable | Never reached |
| Intent classification | `intent-classifier.ts` | ⚠️ Partial | No NEXT_CROP intent; would fall to GENERAL_CROP_INFO |
| Static Data Gate | `static-data-gate.ts:94` | 🔴 **ROOT CAUSE** | Pattern `/या\s*शेतात.*पीक/i` captures "new crop" queries |
| NO_ACTIVE_CROP guard | `orchestrator.ts:1600` | 🔴 **2nd blocker** | Blanket cutoff regardless of advisory intent |
| Intent→Observation mapping | `intent-resolver.ts` | 🔴 Missing | No rows for NEXT_CROP_RECOMMENDATION |
| Rule category registry | `layered-rule-evaluator.ts` | 🔴 Missing | `crop_rotation` not registered |
| Decision rules | DB `decision_rules` | 🔴 Missing | No rows for next-crop selection |
| Formatter contract | `llm-response-formatter.ts` | ✅ Extensible | Render-only correctly enforced |
| Confidence thresholds | `confidence-thresholds.ts` | ✅ OK | Thresholds not reached (gate fires first) |
| Audit logging | `audit-logger.ts` | ⚠️ Gap | No log for static gate or NO_ACTIVE_CROP intercept reason |
