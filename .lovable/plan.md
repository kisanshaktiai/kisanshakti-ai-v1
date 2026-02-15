

# Forensic Audit: Symbolic Decision Brain Graph - Production Readiness Report

## AUDIT SCOPE
- 494 active rules in `decision_rules` table
- 7,600+ lines in orchestrator, 3,500+ in index.ts, 845 in symbolic-reasoner
- 42 modules in `/decision`, 76 modules in `/agents`, 7 in `/utils`
- Full data flow from farmer query to LLM-formatted response

---

## CRITICAL BUG #1: `conditions_json` Format Mismatch (SEVERITY: P0)

The `SymbolicReasoner.evaluateConditionsJson()` expects a recursive `{all: [...], any: [...], fact: "...", operator: "..."}` format. However, **0 out of 494 rules** use the `fact/operator` format and only **1 rule** uses `all/any`. 

The actual DB format is flat key-value: `{observations: ["WEED_PRESENT"], crop_stage: "SEEDLING", ndvi_trend: "IMPROVING", soil_moisture_low: true}`.

**Impact**: The `SymbolicReasoner.executeRules()` evaluates conditions using recursive `all/any/fact/operator` logic. Since no rules match this format, it falls through to `{matches: true, confidence: 0.5, reason: 'No conditions (default)'}` for EVERY rule -- meaning ALL rules for a given crop/stage fire indiscriminately, producing noise instead of precision.

The system currently survives because the **HypothesisEvaluator** (used in the PHASE-20 clarification path) has its OWN `evaluatePartialConditionMatch()` that correctly parses the flat `{observations: [...], crop_stage: [...], trigger_keywords: [...]}` format. But the direct SymbolicReasoner path produces garbage matches.

**Fix**: Rewrite `SymbolicReasoner.evaluateConditionsJson()` to handle the actual flat DB format (observations, crop_stage, ndvi_level, boolean flags like `soil_moisture_low`).

---

## CRITICAL BUG #2: Weed Rules Missing `canonical_group` (SEVERITY: P0)

6 weed rules have `canonical_group = NULL`. The `HYPOTHESIS_CANONICAL_GROUPS` filter in `hypothesis-evaluator.ts` lists:
```
['pest', 'disease', 'stress', 'germination', 'irrigation',
 'nutrition', 'deficiency', 'insect', 'fungal', 'bacterial',
 'viral', 'establishment', 'soil_borne', 'borer', 'mite']
```

This filter is NOT currently active in the main query (it was removed), but the NULL `canonical_group` still causes weed rules to appear as `canonical_group: 'general'` in candidates -- reducing their score and preventing proper categorization.

**Fix**: 
1. Set `canonical_group = '06_weed'` for all 6 weed rules in the DB
2. Add `'weed'` and `'06_weed'` to `HYPOTHESIS_CANONICAL_GROUPS` constant
3. Add `WEED_COMPETITION` to `FailureClass` type in `failure-class-detector.ts`

---

## CRITICAL BUG #3: Safety Data Gap - 97% of RECOMMEND Rules Missing Safety Fields (SEVERITY: P0)

Out of 246 RECOMMEND/URGENT_ACTION rules:
- **240 (97.6%)** missing `dosage_per_acre`
- **229 (93.1%)** missing `phi_days`  
- **223 (90.7%)** missing `bee_toxicity`
- **233 (94.7%)** missing `active_ingredient`

Many rules embed dosage info IN `action_text` (e.g., "Apply Chlorantraniliprole 18.5% SC at 0.4 ml/L") but NOT in the structured fields. This means:
- PHI Enforcement Guardian (`phi-enforcement-guardian.ts`) cannot block pre-harvest spray
- Pollinator Protection Rules (`pollinator-protection-rules.ts`) cannot enforce bee safety  
- Resistance rotation checks (`safety-enhancement.ts`) cannot detect consecutive same-group use

**Impact**: Safety gates are effectively disabled for 97% of chemical recommendations. This is a production blocker for farmer safety.

**Fix**: Requires agronomic data enrichment -- extracting `active_ingredient`, `phi_days`, `bee_toxicity`, and `dosage_per_acre` from each rule's `action_text` into the structured columns. This is a data migration task, not a code fix.

---

## CRITICAL BUG #4: 39 NO_ACTION_REQUIRED Rules Have NULL `action_text` (SEVERITY: P1)

Rules like "Irrigation Method Selection Guide", "Bee Protection", "Heavy Rainfall" have no `action_text`, causing `[Action text unavailable]` to leak into farmer responses. The previous fix added a fallback chain (`action_text -> knowledge_text -> reason_text`), but 6 of these rules ALSO have NULL `knowledge_text`.

**Fix**: Populate `action_text` for these 39 rules with appropriate guidance text, OR populate `knowledge_text` as minimum fallback content.

---

## CRITICAL BUG #5: 92 Rules Missing `reason_text` (SEVERITY: P1)

20 BLOCK rules have no `reason_text`. When the system blocks a treatment, it needs to explain WHY to the farmer. Without `reason_text`, the LLM has no symbolic data to explain the block, leading to generic "Do not apply" without agronomic justification.

---

## BUG #6: `trigger_keywords` Still Present in 17 Rules (SEVERITY: P2)

The SSOT architecture explicitly deprecated `trigger_keywords` -- the symbolic brain should match on `observations` array in `conditions_json` only. However, 17 rules (mostly weed rules) still contain `trigger_keywords` in their `conditions_json`. The `evaluatePartialConditionMatch()` in `hypothesis-evaluator.ts` still scores these via keyword matching against `user_query`, violating the language-agnostic contract.

**Fix**: Remove `trigger_keywords` from `conditions_json` for all 17 rules. Ensure their `observations` arrays contain sufficient canonical codes for matching.

---

## BUG #7: Duplicate `canonical_group` Namespaces (SEVERITY: P2)

The DB has both:
- `05_nutrition` (11 rules) AND `06_nutrition` (5 rules)
- `11_harvest` (12 rules) AND `12_harvest` (1 rule)
- `01_safety` AND `01_crop_identity` AND `01_seed_quality`

This prevents clean aggregation and creates ambiguity in rule categorization.

**Fix**: Consolidate to single namespace per domain (e.g., merge `06_nutrition` into `05_nutrition`, merge `12_harvest` into `11_harvest`).

---

## BUG #8: `LLMFormatterInput.language` Type Too Narrow (SEVERITY: P2)

The `LLMFormatterInput` interface defines `language: 'mr' | 'hi' | 'en'` but the system now supports 9 languages (Tamil, Telugu, Bengali, Gujarati, Kannada, Punjabi). Farmers selecting these languages will get type errors or fallback to English.

**Fix**: Expand type to `'mr' | 'hi' | 'en' | 'ta' | 'te' | 'bn' | 'gu' | 'kn' | 'pa'`

---

## PRODUCTION READINESS GAPS

### Gap 1: No Connection Pooling / Supabase Client Reuse
The `SymbolicReasoner` creates a NEW Supabase client in its constructor every time. At 1M+ users, this creates excessive connections. The `index.ts` already creates a client -- it should be passed to the reasoner.

### Gap 2: No Rule Caching
Every request loads 300-500 rules from DB. For sugarcane (431 rules), this is a 200-500ms DB hit per request. At 1M+ users this creates unsustainable DB load.

**Fix**: Implement in-memory rule cache with 5-minute TTL per crop_code, invalidated on rule updates.

### Gap 3: Orchestrator Size (7,616 lines)
The orchestrator is a single 7,600-line file. This creates:
- Memory pressure on cold starts (Deno must parse the entire file)
- Difficulty debugging specific phases
- Risk of timeout on initial boot

### Gap 4: No Request Deduplication
If a farmer double-taps, two identical requests run in parallel. At scale, this doubles load.

### Gap 5: Missing `crop_age_days_min/max` on Most Rules
The temporal constraint validator exists but most rules lack these columns, making it a no-op.

---

## UNUSED COLUMNS IN `decision_rules`

These columns exist in the schema but are rarely/never used in the codebase:
- `roi_cost_saved_min/max`, `roi_yield_gain_pct`, `roi_yield_risk_pct`, `roi_confidence`, `roi_net_score` -- ROI calculator exists but these are unpopulated
- `crop_family`, `crop_category`, `botanical_name` -- no code references these
- `applicability_scope`, `crop_tags` -- no code references
- `visual_markers` -- exists but code uses `observable_characteristics` instead
- `reentry_interval_hours` -- safety-relevant but never checked in code
- `aquatic_toxicity` -- never checked
- `validation_trials`, `field_validated` -- metadata only

---

## IMPLEMENTATION PLAN (Priority Order)

### Phase 1: Critical Bug Fixes (Code Changes)

**File 1: `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`**
- Rewrite `evaluateConditionsJson()` to handle flat DB format: `{observations: [...], crop_stage: [...], boolean_flags, ndvi_level, etc.}`
- Add observation-based matching: if `conditions_json.observations` exists, check against `facts.primary_symptom` and `facts.user_query` observation codes
- Add boolean flag matching: if key like `soil_moisture_low` exists, map to corresponding fact value
- Keep existing `all/any/fact/operator` logic as secondary path for future rule format support

**File 2: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`**
- Add `'weed'`, `'06_weed'`, `'harvest'`, `'economics'` to `HYPOTHESIS_CANONICAL_GROUPS`

**File 3: `supabase/functions/ai-agriculture-chat/decision/failure-class-detector.ts`**
- Add `WEED_COMPETITION` failure class with weed-specific observation keys

**File 4: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`**
- Expand `language` type to include all 9 supported languages

### Phase 2: Data Fixes (SQL Migrations)
- Set `canonical_group = '06_weed'` for 6 NULL weed rules
- Remove `trigger_keywords` from `conditions_json` for 17 rules
- Consolidate duplicate canonical_group namespaces
- Populate `action_text` for 39 NO_ACTION_REQUIRED rules
- Populate `reason_text` for 20 BLOCK rules

### Phase 3: Production Hardening (Code Changes)
- Pass Supabase client to SymbolicReasoner instead of creating new instances
- Add in-memory rule cache with TTL
- Add request deduplication guard

---

## AGRONOMIC ACCURACY CHECK

The rules themselves are agronomically sound based on spot-checking:
- Sugarcane pest rules correctly reference ICAR packages (Chlorantraniliprole for borers, Cotesia for biocontrol)
- Stage-applicable arrays are biologically valid (Early Shoot Borer at SEEDLING/TILLERING, Smut at GRAND_GROWTH)
- Weed rules correctly differentiate manual vs chemical control by stage
- BLOCK rules correctly prevent treatment at terminal damage stages

The primary agronomic risk is the **safety data gap** (Bug #3) -- chemical recommendations go out without PHI/bee toxicity checks.

