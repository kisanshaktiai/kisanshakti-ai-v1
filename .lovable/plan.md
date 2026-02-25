

# Deep Audit Report: `i18n_key` Logic in the Symbolic Decision Brain

## HOW THE i18n_key SYSTEM IS DESIGNED TO WORK

The `i18n_key` field in the `decision_rules` table is the **multilingual anchor** for the symbolic engine. The architecture intends:

1. Store **only English text** in the database (`action_text`, `reason_text`, `knowledge_text`)
2. Assign each rule a unique `i18n_key` (e.g., `SC_PEST_SCALE_MEALYBUG_001_ACTION`)
3. At runtime, the translation loader resolves the key to a translated label
4. The LLM narration layer translates the English `action_text` into the farmer's language

---

## DATABASE STATUS

| Metric | Value |
|--------|-------|
| Total active rules | 517 |
| Rules with `i18n_key` populated | **517 (100%)** |
| Rules with `action_text` populated | 517 (100%) |
| Rules with `reason_text` populated | 517 (100%) |
| Rules with `knowledge_text` populated | 517 (100%) |

All `i18n_key` values follow the pattern: `{RULE_ID}_ACTION` (e.g., `SUGARCANE_ESB_CHEM_BLOCK_002_ACTION`, `SC_DIAG_TERMITE_001_ACTION`).

The English content in `action_text` is the authoritative agronomic instruction. Example:

```
i18n_key: SUGARCANE_ESB_CHEM_BLOCK_002_ACTION
action_text: "Early Shoot Borer below ETL (10% dead hearts). No chemical spray needed.
              Continue monitoring weekly. Remove and destroy dead hearts manually.
              Release Trichogramma chilonis as preventive biocontrol."
```

---

## HOW i18n_key IS ACTUALLY USED IN THE CODEBASE

### Step 1: Database → Loader (WORKS)

**File:** `bundled-rules/loader.ts` (line 238)

The loader correctly fetches `i18n_key` from the `decision_rules` table and maps it onto the `ExecutableRule` object:
```
i18n_key: row.i18n_key
```

This field is available to all downstream consumers.

### Step 2: Loader → Symbolic Reasoner (WORKS)

**File:** `decision/symbolic-reasoner.ts` (lines 113, 450, 467-477)

When a rule fires, its `i18n_key` is included in the `FiredRule` interface and in `matched_responses[]`:
```
i18n_key: rule.i18n_key
```

### Step 3: Symbolic Reasoner → Translation Loader (PARTIALLY WORKS)

**File:** `i18n/translation-loader.ts` (lines 275-334)

`initializeTranslationCache()` loads all `i18n_key` + `action_text` pairs from `decision_rules` and builds a cache. **However, there is a critical design flaw:**

```typescript
// Line 307-313
translations.set(key, {
  key,
  mr: text,  // Placeholder - LLM translates at runtime
  hi: text,  // Placeholder - LLM translates at runtime
  en: text,  // Base English text
  category: row.category
});
```

The cache stores **the same English `action_text` for ALL languages** (mr, hi, en). This means `getTranslation('SC_PEST_SCALE_MEALYBUG_001_ACTION', 'mr')` returns the English text, not Marathi. The comment says "LLM translates at runtime" but the `getTranslation()` function itself has logic to **detect and reject** this:

```typescript
// Line 142
if (value && language !== 'en' && value !== translation.en) {
  return value;  // Only returns if different from English
}
// Falls through to FALLBACK_TRANSLATIONS
```

So for non-English languages, the cache is effectively **useless** for all 517 rule translations. It always falls through to `FALLBACK_TRANSLATIONS`, which only covers ~45 pest/disease/symptom terms, not the 517 rule-specific `action_text` values.

### Step 4: Translation Loader → LLM Formatter (BROKEN)

**File:** `agents/llm-response-formatter.ts` (lines 1182-1184)

When `action_text` is missing from a rule, the formatter tries `i18n_key` lookup but **explicitly logs it as NOT IMPLEMENTED**:

```typescript
// Try i18n_key lookup (placeholder - would need i18n loader)
if (appDetails.i18n_key) {
  console.warn(`⚠️ [LLM Formatter] action_text missing, i18n_key=${appDetails.i18n_key} - i18n lookup not implemented`);
}
```

This is the critical disconnect. The formatter has the `i18n_key` but never calls `getTranslation()` to resolve it.

### Step 5: LLM Formatting (THE ACTUAL TRANSLATION MECHANISM)

**File:** `agents/llm-response-formatter.ts` (lines 1200+)

The **actual** translation happens via the LLM prompt, not via the `i18n_key` resolver. The formatter passes the English `action_text` to the LLM with an instruction like:

```
═══ REFERENCE TEXTS (TRANSLATE TO MARATHI) ═══
```

The LLM then translates the English `action_text` into the farmer's language. This is the **real** i18n mechanism — the LLM is the translator.

---

## COMPLETE DATA FLOW TRACE

```text
Database (decision_rules)
  │
  │  i18n_key: "SC_PEST_SCALE_MEALYBUG_001_ACTION"
  │  action_text: "Apply Buprofezin 25 SC @ 2ml/L..."  (English only)
  │
  ▼
Loader (loader.ts)
  │  Maps i18n_key onto ExecutableRule
  │
  ▼
Symbolic Reasoner (symbolic-reasoner.ts)
  │  Includes i18n_key in FiredRule + matched_responses
  │
  ▼
Translation Cache (translation-loader.ts)
  │  Caches i18n_key → {en: action_text, mr: action_text, hi: action_text}
  │  ❌ mr/hi are just COPIES of English text (placeholder)
  │  ❌ getTranslation() detects this and rejects it for non-English
  │  Falls through to FALLBACK_TRANSLATIONS (only 45 terms)
  │
  ▼
LLM Formatter (llm-response-formatter.ts)
  │  ❌ i18n_key lookup logged as "not implemented"
  │  ✅ BUT: English action_text IS passed to LLM prompt
  │  ✅ LLM translates action_text to target language
  │
  ▼
Farmer sees: Marathi/Hindi response (translated by LLM from English action_text)
```

---

## CRITICAL FINDINGS

### Finding 1: i18n_key is STORED but NEVER RESOLVED for rule-level translations

The `i18n_key` field exists on all 517 rules and flows through the pipeline, but:
- The translation cache stores English for all languages
- `getTranslation()` correctly rejects same-as-English values for non-English
- The LLM formatter explicitly logs "i18n lookup not implemented"
- **Net effect:** `i18n_key` is carried as metadata but never produces a translated string

### Finding 2: The LLM IS the actual translator (by design)

The system works despite the broken i18n resolver because:
- `action_text` (English) is always available (517/517 rules)
- The LLM formatter passes English `action_text` to the LLM with "TRANSLATE TO {language}" instructions
- The LLM generates the Marathi/Hindi response

This is **architecturally intentional** — the plan header states "store only English, translate via codebase." The "codebase" here is the LLM, not a static lookup table.

### Finding 3: FALLBACK_TRANSLATIONS still has ~96 hardcoded multilingual entries

**File:** `translation-loader.ts` (lines 50-96)

Despite the SSOT mandate to remove all hardcoded translations, this file contains 45+ entries with hardcoded Marathi/Hindi text for pests, diseases, symptoms, and actions. These serve as fallbacks when the cache cannot resolve a key.

### Finding 4: `diagnostic-options-i18n.ts` has hardcoded labels contradicting SSOT

**File:** `agents/diagnostic-options-i18n.ts`

Contains 10 diagnostic options with hardcoded `label: { mr: '...', hi: '...', en: '...' }` dictionaries. These use `i18n_key` as a field name but the actual label resolution uses the hardcoded `label[language]` map, not a DB lookup.

### Finding 5: `translateCause()` wrapper partially works

**File:** `translation-loader.ts` (lines 247-265)

This function tries `getTranslation()` first, then strips suffixes like `_INFESTATION` or `_ATTACK` and retries. For non-English, it will only return a real translation if the cause matches one of the 45 `FALLBACK_TRANSLATIONS` entries. For the other 472+ causes, it returns the raw key formatted as `SHOOT BORER INFESTATION`.

---

## SUMMARY: IS i18n_key WORKING?

| Aspect | Status | Details |
|--------|--------|---------|
| `i18n_key` stored in DB | ✅ 100% | All 517 rules have it |
| `i18n_key` loaded into runtime | ✅ Works | `loader.ts` maps it correctly |
| `i18n_key` flows to reasoner | ✅ Works | Included in `FiredRule` |
| `i18n_key` resolves to non-English text | ❌ Broken | Cache stores English for all languages; `getTranslation()` rejects it |
| `i18n_key` used by LLM formatter | ❌ Not implemented | Logged as "would need i18n loader" |
| English `action_text` translated by LLM | ✅ Works | LLM prompt includes "TRANSLATE TO {language}" |
| `FALLBACK_TRANSLATIONS` hardcoded | ⚠️ SSOT violation | 45+ entries with mr/hi/en |
| `diagnostic-options-i18n.ts` hardcoded | ⚠️ SSOT violation | 10 options with hardcoded labels |
| `translateCause()` for non-English | ⚠️ Partial | Only works for 45 fallback terms |

### Bottom Line

The `i18n_key` field is **metadata infrastructure** that is fully populated and flowing through the pipeline, but **never actually resolves translations** at the code level. The real translation mechanism is the LLM narration layer, which takes English `action_text` and translates it in-prompt. The `i18n_key` resolver (`translation-loader.ts`) is structurally present but functionally inert for rule-level content because it stores English text as placeholder for all languages.

No code or data changes have been made per your instruction.

