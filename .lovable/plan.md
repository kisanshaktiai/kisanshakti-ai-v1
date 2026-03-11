

# Audit Report & Fix Plan: Rural Agricultural Officer Persona for LLM Narration

## Problem Summary

Three LLM prompt locations currently instruct the model to act as a "TRANSLATOR" or "LANGUAGE ADAPTER", causing literal English-to-regional-language translation instead of natural agricultural officer speech.

| Location | File | Current Identity | Problem |
|----------|------|-----------------|---------|
| **Primary formatter** | `llm-response-formatter.ts:1352` | "LANGUAGE ADAPTER / TRANSLATOR/FORMATTER" | Translates instead of explains |
| **Narration prompt** | `llm-response-generator.ts:112` | "MULTILINGUAL AGRICULTURAL LANGUAGE ADAPTER" | Same translator mindset |
| **Fallback translator** | `index.ts:1943` | "You are a translator" | Pure mechanical translation, zero rural voice |
| **Rural rules** | `rural-language-dictionary.ts:34` | English-only examples | No "officer explaining" framing |

## Root Cause

The word "TRANSLATOR" / "ADAPTER" in the identity makes the LLM think: "take English → produce equivalent in target language". This produces textbook outputs like "मृत गाभ" (literal "dead heart") instead of the farming term "गाभ्याचा मर".

## Fix Plan (4 files, ~80 tokens added per prompt, zero hardcoded regional strings)

### Fix 1: `rural-language-dictionary.ts` — Add Village Officer Persona Function

Add `getVillageOfficerPersona()` that returns the universal persona block (English-only, no hardcoded mr/hi strings):

```
═══ YOUR IDENTITY ═══
You are a Village Agriculture Officer with 20+ years of field experience helping farmers.
You EXPLAIN agricultural advice to farmers in their own language and conversational style.
You DO NOT translate sentences word-by-word from English.
You explain advice the way a local agriculture officer would speak to a farmer in that language.

═══ LANGUAGE STYLE RULES (ALL LANGUAGES) ═══
• Speak like a real person talking to a farmer
• Use short and clear sentences
• Avoid textbook or scientific wording
• Avoid literal translation of English sentences
• Use common village words used by farmers
• Address the farmer politely and respectfully
• Focus on practical action
You are explaining advice, not translating text.
```

### Fix 2: `llm-response-formatter.ts` line 1352 — Replace Identity

**Replace**: `"You are a LANGUAGE ADAPTER for an agricultural advisory system..."` and `"You are a TRANSLATOR/FORMATTER ONLY"`

**With**: Import and inject `getVillageOfficerPersona()` as the opening identity block, followed by existing constraint rules (Supreme Law, crop lock, dosage, etc.).

Keep all existing safety constraints (dosage lock, product lock, crop lock) intact — only the identity framing changes.

### Fix 3: `llm-response-generator.ts` line 112 — Replace NARRATION_SYSTEM_PROMPT Identity

**Replace**: `"You are a MULTILINGUAL AGRICULTURAL LANGUAGE ADAPTER"` and `"YOUR IDENTITY: LANGUAGE ADAPTER ONLY"`

**With**: Same village officer persona block. Keep all existing prohibitions (cannot diagnose, cannot recommend products, cannot suggest dosages) intact.

### Fix 4: `index.ts` line 1943 — Upgrade forceTranslateResponse Prompt

**Replace**:
```
"You are a translator. Translate to ${langName}. Keep numbers, product names, dosages unchanged."
```

**With**:
```
"You are a village agriculture officer rewriting this advisory in natural rural ${langName}.
Speak like you are in the farmer's field explaining advice face-to-face.
Use local farming vocabulary, not textbook language.
Keep all numbers, product names, dosages, emojis unchanged.
You are explaining, not translating."
```

## What Does NOT Change

- Symbolic decision brain — untouched
- Decision rules SSOT — untouched
- Dosage logic — untouched
- Validation gates (product/dosage checks) — untouched
- Crop lock enforcement — untouched
- No hardcoded Marathi/Hindi/Tamil strings added anywhere
- All existing safety constraints preserved

## Expected Impact

The LLM reasoning path changes from:
```
Symbolic decision → Translate English text → Output
```
To:
```
Symbolic decision → Explain advice like local officer → Output
```

This produces natural farmer speech across all languages without any language-specific hardcoding.

