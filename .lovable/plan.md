

# Fix: Language-Agnostic LLM Formatter (English-Only Data → LLM Translates)

## Root Problem

The `llm-response-formatter.ts` system prompt contains **hardcoded Marathi text** in all 5 FORMAT templates, the SUPREME LAW section, and multiple validation helpers. This means:

1. **FORMAT_1 through FORMAT_5** (lines 1156-1266): Template examples use Marathi words like `भाऊ`, `काय करायचं`, `काळजी घ्या`, `शिफारस`, etc. — these are Marathi-only, not language-agnostic
2. **SUPREME LAW section** (lines 1275-1276): Fallback phrases hardcoded in Marathi: `"कीड मारायची दवा वापरा"`, `"मला अधिक माहिती हवी आहे"`
3. **RURAL LANGUAGE RULES** (line 1282-1284): Marathi-only word substitutions: `"फवारणी" not "छिडकाव"`
4. **PHI TRANSLATION** (line 1302): Marathi-only: `"काढणीपूर्वी किमान X दिवस आधी फवारणी बंद करा"`
5. **Legacy template fallback** (lines 2067-2092): English-only, never localized
6. **`extractSections()`** (lines 2113-2121): Checks for Marathi words `नमस्कार`, `शिफारस`, `शुभेच्छा`
7. **`validateWhatWhyHow()`** (lines 2190-2216): Hardcoded Marathi + Hindi keyword detection
8. **`CROP_NAME_ALIASES`** (lines 2243-2256): Hardcoded Marathi/Hindi crop names for validation
9. **Validation gate CHECK 1** (lines 896-904): Rejects LLM output when product name is transliterated
10. **Validation gate CHECK 2c** (lines 990-997): Rejects Devanagari numerals (४५) for PHI values

Additionally, the `decision_rules` seed JSON files contain `response_mr` and `response_hi` columns with pre-translated text. Per the language-agnostic architecture, the DB should store English-only rule content, and the LLM should translate at runtime.

## Fix Plan

### Fix 1: Make FORMAT templates language-agnostic (lines 1156-1266)

Replace all 5 FORMAT templates with **English-only structural instructions** that tell the LLM "translate everything into {langName}". Remove all hardcoded Marathi phrases.

**Before** (FORMAT_1 example):
```
भाऊ/दादा (or ताई if female),
🎯 [ONE LINE: diagnosis in plain ${langName}]
📋 काय करायचं:
```

**After**:
```
[Greeting — address farmer warmly in ${langName}]
🎯 [ONE LINE: diagnosis in plain ${langName}]
📋 [Action heading in ${langName}]:
```

### Fix 2: Make SUPREME LAW language-agnostic (lines 1269-1307)

Replace Marathi fallback phrases with English instructions:
- `"कीड मारायची दवा वापरा"` → `generic pesticide phrases like "use medicine"`
- `"मला अधिक माहिती हवी आहे"` → `"I need more information" (translated to ${langName})`
- PHI translation instruction: English template `"Stop spraying at least X days before harvest" (translated to ${langName})`
- Rural language rules: `"Use rural/colloquial ${langName} vocabulary, not formal/literary terms"`

### Fix 3: Fix validation gate false positives (lines 896-904, 990-997)

- **CHECK 1**: When product keyword exists in `allowedProducts`, downgrade "Missing product" from hard error to soft warning (the LLM transliterated the name)
- **CHECK 2c**: Add `devanagariToAscii()` helper to convert ०-९ → 0-9 before PHI check. Also downgrade to soft warning since PHI is enforced deterministically

### Fix 4: Remove HARD_VIOLATION for transliteration cases (lines 679-686)

Remove `'Missing product from symbolic'` and `'PHI value modified'` from `HARD_VIOLATION_PATTERNS`. These become soft warnings only.

### Fix 5: Make `extractSections()` language-agnostic (lines 2113-2121)

Replace Marathi keyword checks with emoji-based detection (already partially done) + English keywords only. The LLM output language varies, so section detection should use emoji anchors (🎯, 📋, ⚠️, 💰, ✅, 🙏) which are language-neutral.

### Fix 6: Make `validateWhatWhyHow()` language-agnostic (lines 2155-2236)

Remove all hardcoded Marathi/Hindi keyword lists. Use only emoji anchors + English keywords for validation. The function is already marked as producing "soft violations" so this is safe.

### Fix 7: Make `CROP_NAME_ALIASES` language-agnostic (lines 2243-2256)

Keep only English aliases. The LLM will use the correct crop name in the target language — validation should check the English canonical name only.

### Fix 8: Localize legacy template fallback (lines 2067-2092)

Replace English-only fallback with a language-parameterized English structural template. The LLM isn't called here (it's the fallback WHEN LLM fails), so this should output English-only structured content and let the downstream `forceTranslateResponse()` handle localization.

### Fix 9: Remove `response_mr` and `response_hi` from seed rules (P2 — data team)

The seed JSON files store pre-translated Marathi/Hindi in `response_mr`/`response_hi` columns. Per the architecture, these should be removed or ignored. The `response_en` column is the SSOT; the LLM translates at runtime. **This is a data-layer change for a future sprint** — the formatter fix above is independent.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` | All 9 fixes above — make FORMAT templates, SUPREME LAW, validation gate, section detection, and crop aliases language-agnostic |

## Expected Result

- All rule data flows through the pipeline in **English only**
- The LLM system prompt instructs translation to **any** farmer-selected language (mr, hi, ta, te, bn, gu, kn, pa, ml, or)
- Validation gate no longer rejects transliterated product names or Devanagari numerals
- No hardcoded Marathi/Hindi in the formatter — fully language-agnostic
- Farmer sees fully translated, natural response in their selected app language

