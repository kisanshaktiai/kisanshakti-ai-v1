

# Fix Plan: Clarification Option Translation + Rich Response Generation

## Issue 1: Clarification Options Showing Raw DB Text

**Root Cause:** The `diagnostic-options-i18n.ts` correctly loads labels from `observation_translations`, and the DB has proper Marathi translations (e.g., `DEAD_HEART_PRESENT` → "मधली पाने सुकलेली, ओढल्यास बाहेर येतात"). However, the issue is in multiple code paths:

1. **Orchestrator line 4119:** When rule-driven options are used, it maps `finalClarificationOptions = ruleDrivenClarification.options.map(o => o.label)` — this correctly passes DB labels. BUT...

2. **Orchestrator line 3541-3542:** When options come from NLU/legacy paths, they are raw strings or objects with raw labels: `typeof opt === 'string' ? { label: opt, observation_key: 'DYNAMIC', confidence: 0.7 } : opt`. These are NOT translated.

3. **Orchestrator line 3688-3691:** The return path maps options as `label: typeof opt === 'string' ? opt : (opt.label || String(opt))` — passing raw untranslated strings to the UI.

4. **Key finding:** The `getDiagnosticOptionsForCropStage()` async function loads translations BUT it's only called for terminal damage diagnostic options. For most clarification paths, options are assembled from `observable_characteristics` strings which come as raw English codes from the DB (e.g., "DEAD_HEART", "BORE_HOLES_AT_BASE").

**Fix:** Add an LLM-powered translation step for clarification option labels before sending them to the frontend. When options are built from observation codes rather than `observation_translations`, pass them through a lightweight LLM translation call that converts to farmer-friendly local language.

### Changes:

**File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`**

Create a helper function `translateClarificationOptions()` that:
1. Takes the options array and target language
2. First tries to load labels from `observation_translations` DB table (SSOT)
3. For any option without a DB label, uses a quick LLM call to translate the observation code to farmer-friendly local language
4. Apply this function at ALL clarification return paths (lines ~3688, ~4119, ~4594)

---

## Issue 2: Final Response Not Using All Available Rule Data

**Root Cause:** The `buildRecommendationSummary()` in `llm-response-formatter.ts` (line 1291) builds the LLM prompt data from `primary_decision` but misses many rich columns from `decision_rules`:

**Currently passed to LLM:**
- `action_text`, `reason_text`, `knowledge_text` ✅
- `product_name`, `dosage_per_acre`, `concentration`, `method` ✅
- `phi_days`, `ipm_level`, `timing`, `water_volume` ✅

**NOT passed to LLM (but available in DB):**
- `organic_alternative` — available in `matched_responses` but NOT in prompt ❌
- `success_indicators` — in DB as JSONB array but `expected_outcomes.success_indicators` is always `[]` ❌
- `failure_indicators` — never propagated ❌
- `roi_yield_gain_pct`, `roi_cost_saved_min/max` — in DB but never passed ❌
- `target_pest_stage` — useful for timing context ❌
- `mode_of_action` — useful for "why this works" ❌
- `bee_toxicity` — in matched_responses but not prominently in prompt ❌
- `application_method` — null for many rules but available in some ❌

### Changes:

**File: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` (~line 789)**

Add to `primary_decision` object:
```
organic_alternative: best.organic_alternative || null,
phi_days: best.phi_days || null,
bee_toxicity: best.bee_toxicity || null,
application_method: best.application_method || null,
water_volume_per_acre: best.water_volume_per_acre || null,
success_indicators: best.success_indicators || null,
failure_indicators: best.failure_indicators || null,
roi_yield_gain_pct: best.roi_yield_gain_pct || null,
target_pest_stage: best.target_pest_stage || null,
mode_of_action: best.mode_of_action || null,
```

**File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~line 5592)**

Propagate these new fields from `layeredRuleResult.primary_decision` to `decisionOutput.primary_decision.application_details`:
```
organic_alternative: ...,
success_indicators: ...,
failure_indicators: ...,
roi_yield_gain_pct: ...,
bee_toxicity: ...,
application_method: ...,
target_pest_stage: ...,
mode_of_action: ...,
```

**File: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (line ~1370)**

In `buildRecommendationSummary()`, after the existing product details section, add:
```
// RICH CONTEXT for world-class response
if (appDetails.organic_alternative) parts.push(`- 🌿 Organic Alternative: ${appDetails.organic_alternative}`);
if (appDetails.success_indicators) parts.push(`- ✅ Success Signs: ${JSON.stringify(appDetails.success_indicators)}`);
if (appDetails.failure_indicators) parts.push(`- ❌ Failure Signs: ${JSON.stringify(appDetails.failure_indicators)}`);
if (appDetails.roi_yield_gain_pct) parts.push(`- 📈 Expected Yield Gain: ${appDetails.roi_yield_gain_pct}%`);
if (appDetails.bee_toxicity) parts.push(`- 🐝 Bee Safety: ${appDetails.bee_toxicity}`);
if (appDetails.target_pest_stage) parts.push(`- 🎯 Target Stage: ${appDetails.target_pest_stage}`);
if (appDetails.mode_of_action) parts.push(`- 🔬 How It Works: ${appDetails.mode_of_action}`);
```

Also update the system prompt FORMAT_1 and FORMAT_5 templates to instruct the LLM to include:
- Organic alternative section
- Success/failure monitoring indicators for follow-up
- ROI information
- Bee safety warning when bee_toxicity is HIGH

---

## Issue 3: Template Fallback Not Using Rich Data

The template fallback (`buildTemplateFallback`) at line 1810-1900 also needs to propagate `organic_alternative`, `success_indicators`, etc. when building the static response.

### Changes:

**File: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (~line 1900)**

After the product recommendation section in the template fallback, add:
- Organic alternative line if available
- Success indicators as follow-up instructions
- Bee safety warning

---

## Implementation Order

1. **Propagate rich rule data** through layered-rule-evaluator → orchestrator → formatter (3 files)
2. **Enrich LLM prompt** with organic_alternative, success/failure indicators, ROI, bee_toxicity
3. **Add option translation** in orchestrator for clarification paths
4. **Deploy and test** the shoot borer scenario

## What LLM Does vs Doesn't Do

- LLM **DOES**: Translate action_text/reason_text/knowledge_text to farmer language, format response using rich data
- LLM **DOES NOT**: Generate any agronomic data, products, dosages, or timing — all from decision_rules only
- LLM **NEW**: Translate clarification option labels to farmer's local agricultural language when DB translation is missing

