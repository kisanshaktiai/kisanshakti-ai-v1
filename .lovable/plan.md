

# Fix Plan: Language-Agnostic LLM Response Quality + DB Table Integration

## The Problem with the Previous Plan

The previous plan proposed adding a **hardcoded Marathi/Hindi agricultural term dictionary** directly in the LLM system prompt — lines like `"Dead heart" → "गाभ्याचा मर"`. This violates the core architectural rule: **no hardcoded regional language text in codebase**. All translations must come from the database (`observation_translations` table) or from the LLM's own translation capability at runtime.

## Current Violations Found

**1. Lines 1353-1354 in `llm-response-formatter.ts`** — Hardcoded Marathi and Hindi example text:
```
- For Marathi: use बोलीभाषा (spoken language)... Example: "पानांच्या शिरांजवळ पिवळेपणा दिसतोय"
- For Hindi: use गांव की बोली (village speech)... Example: "खाद की कमी दिख रही है"
```

**2. Line 1308** — Hardcoded language key selection (`crop_name_hi`, `crop_name_mr`) instead of using `getCropNameKey()` from `language-utils.ts`.

**3. Line 1319** — Hardcoded Marathi/Hindi crop names in the crop lock example: `"no गहू/wheat if crop is ऊस/sugarcane"`.

**4. FORMAT_1 (lines 1184-1214)** — Missing mandatory sections for organic alternative, monitoring, land-area dosage calculation mandate, and success indicators.

**5. No DB table wiring** — The report confirms `crop_baseline_guidelines` (6 rows), `etl_standards` (56 rows), `agro_climatic_zones` (22 zones), and `crop_vocabulary` (45 rows) are now populated. The `decision_rules` now has 556 rules with `observable_characteristics`. These tables need to be verified as properly wired into the symbolic pipeline.

## Fix Plan

### Fix 1: Remove hardcoded Marathi/Hindi from LLM system prompt

**File:** `llm-response-formatter.ts`

Replace lines 1350-1358 (TRANSLATION QUALITY RULES) with language-agnostic instructions:
```
═══ TRANSLATION QUALITY RULES ═══
- TRANSLATE MEANING, not words. Rewrite like an experienced agricultural officer talking face-to-face with a farmer.
- Use colloquial rural dialect, NOT literary/formal/textbook language.
- Use the spoken village form of ${langName}, not the formal written standard.
- Agricultural terms must use local farmer vocabulary, not literal translation of English technical terms.
  Example: "Dead heart" is a pest symptom name — translate to the local farming term for this condition, NOT a literal word-by-word translation.
  Example: "Interveinal chlorosis" → translate as "yellowing near leaf veins" in natural ${langName}, NOT the medical/scientific term.
- Keep sentences under 15 words. Break complex advice into numbered steps.
- Every instruction must be actionable — farmer must know exactly WHAT to buy, HOW MUCH, and WHEN to apply.
- NEVER use English words when a ${langName} equivalent exists.
- Transliterate-only for chemical/product names that have no ${langName} equivalent.
- NEVER literally translate English compound nouns — "dead heart" is NOT "dead" + "heart" in ${langName}. It is a specific agricultural condition name.
```

Replace line 1308 (hardcoded lang key):
```typescript
const langKey = getCropNameKey(input.language);  // from language-utils.ts
```

Replace line 1319 (hardcoded crop name examples):
```
2. You MUST NOT mention any other crop name in the response
```

### Fix 2: Upgrade FORMAT_1 to 8-section (language-agnostic)

**File:** `llm-response-formatter.ts` lines 1184-1214

Add mandatory organic alternative and monitoring sections to FORMAT_1 (all instructions in English referencing `${langName}`):

```
═══ MANDATORY FORMAT: TYPE 1 — DIRECT PRESCRIPTION ═══
Structure your response EXACTLY as (ALL text must be in ${langName}):

[Warm greeting — address farmer by crop name in ${langName}]

🔎 [ONE LINE: diagnosis in plain ${langName}, using farmer terms]

📌 [Reason — WHY this happened, 1-2 lines in ${langName}]

📋 [Action heading in ${langName}]:
- [Product name transliterated] — [dosage × land_area = TOTAL quantity]
- [Method — HOW to apply, in ${langName}]
- [Best time: morning/evening, in ${langName}]

⚠️ [Safety heading in ${langName}]:
- [PHI days warning if provided]
- [bee_toxicity warning if HIGH — recommend evening spray]
- [PPE instructions]

🌿 [IF ORGANIC/IPM ALTERNATIVE data exists below, this section is MANDATORY]:
- [Organic option translated to ${langName}]

📈 [Expected Benefit in ${langName}]: [ROI/yield gain if available]

✅ [Follow-up in ${langName}]: [specific observable improvement, time-bound]

CRITICAL RULES:
- Calculate TOTAL dosage = dosage_per_acre × farmer's land area (${input.land_context?.area_acres || '?'} acres)
- Show calculated total, NOT per-acre rate
- MUST reference farmer's crop by its ${langName} name in the greeting
- MUST mention farmer's land area when calculating dosage
- If ORGANIC/IPM ALTERNATIVE section exists in data below, you MUST include the 🌿 section
- If SUCCESS_INDICATORS exist in data below, use them in the ✅ follow-up
- If BEE_TOXICITY is HIGH, MUST include evening-only spray warning
- If RECOMMENDED_MARKET_PRODUCTS are provided, mention available market products
- Use trade name farmer recognizes, put molecule in brackets
- Transliterate product names into ${langName} script
- If dosage_per_acre is null/missing, say "I need more information to recommend exact treatment" in ${langName}
- NEVER invent products, dosages, or timing not in the data below
```

### Fix 3: Same upgrade for FORMAT_5

Add mandatory organic alternative section when data exists (same pattern as FORMAT_1, no hardcoded regional text).

### Fix 4: Remove IPM_URGENCY_LABELS hardcoded dict (lines 163-169)

Replace with English-only labels that the LLM translates at runtime:
```typescript
const IPM_URGENCY_LABELS: Record<string, string> = {
  'LEVEL_1': 'Monitor only',
  'LEVEL_2': 'Use cultural practices',
  'LEVEL_3': 'Mechanical control',
  'LEVEL_4': 'Biological control',
  'LEVEL_5': 'Immediate chemical action required',
};
```

### Fix 5: Verify DB table wiring in symbolic pipeline

Based on the report, these tables are now populated. Check that the pipeline code actually queries them:

| Table | Expected Wire Point | Status to Verify |
|---|---|---|
| `crop_baseline_guidelines` | `orchestrator.ts` parallel loader | Verify it loads and passes to context |
| `etl_standards` | `etl-gate.ts` | Report says "code needs to query this table" — check |
| `agro_climatic_zones` | `weather-safety-gate.ts` | Report says "Use zone-specific spray thresholds" — check |
| `crop_vocabulary` | `canonical-state-builder.ts` or NLU | Verify synonym matching uses this |
| `decision_rules` (556 rules, all with `observable_characteristics`) | `loader.ts` condition ledger | Already wired — verify observation matching uses this field |

This is a **read-only audit** for Fix 5 — if wiring is missing, it becomes a separate task.

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` | Remove hardcoded mr/hi text from lines 1308, 1319, 1350-1358. Upgrade FORMAT_1 and FORMAT_5 to 8-section with mandatory organic/monitoring. Flatten `IPM_URGENCY_LABELS` to English-only. |

## What Will NOT Change
- Symbolic decision brain graph, rule engine, authority hierarchy
- `deterministic-response-builder.ts` (already correctly extracts organic_alternative, success_indicators, etc.)
- `crop-calendar-lookup.ts` (crop_name_mr/hi are structural reference data, not UI text — acceptable per architecture)
- Frontend card components
- Database schema

## Implementation Order
1. Remove hardcoded Marathi/Hindi from system prompt (lines 1350-1358)
2. Fix crop lock block (lines 1308, 1319) to use `getCropNameKey()` and remove inline regional text
3. Upgrade FORMAT_1 to 8-section with organic/monitoring mandates
4. Upgrade FORMAT_5 similarly
5. Flatten `IPM_URGENCY_LABELS` to English-only
6. Audit DB table wiring for the 5 updated tables

