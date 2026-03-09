

# Audit Results: Which Hardcoded Strings Are Real vs Dead Code

## Key Finding: NOT all files need DB migration

After tracing every import chain and call path, here is the reality:

---

## FILES WITH HARDCODED STRINGS THAT ARE ACTIVELY USED IN RUNTIME

### 1. `response-mode-renderer.ts` — MODE_TEMPLATES + PHOTO_GUIDANCE_TEMPLATES (~50 strings)
**Status: ACTIVELY USED** — called via `renderByMode()` from `llm-response-formatter.ts`
**BUT**: These are **fallback defaults** only. The function checks `hasTextContent(content.primary_text)` first and only uses the template if no LLM-generated text exists. They serve as crash-proof fallbacks for when the LLM call fails.
**Verdict**: These are legitimate safety nets. The LLM narration layer handles the real translation. **Alternative: Replace with English-only fallbacks** — the `forceTranslateResponse()` dynamic LLM translator in `index.ts` will translate them anyway. No DB table needed.

### 2. `ui-response-contract.ts` — MODE_DEFAULTS (~21 strings, mr/hi/en)
**Status: ACTIVELY USED** — imported by `ui-response-builder.ts` which is imported... **nowhere**. 
**Verdict: DEAD CODE.** `ui-response-builder.ts` has zero importers. Both files can be ignored entirely. No fix needed.

### 3. `diagnosis-first-generator.ts` — PHOTO_LABELS, DIAGNOSIS_QUESTION_TEMPLATES (~12 strings)
**Status: ACTIVELY USED** — called from `orchestrator.ts` when generating clarification options.
**Alternative**: The LLM system prompt already instructs translation to the target language. These short templates can be English-only — the `forceTranslateResponse()` layer translates the final output. Or keep mr/hi/en only (3 high-value languages) since these are fixed structural prompts, not domain knowledge.

### 4. `safety-guardian.ts` — farmer_safety_instructions (~9 strings, 3 emergencies × 3 langs)
**Status: ACTIVELY USED** — critical emergency path.
**Verdict: KEEP HARDCODED.** These are life-safety messages (poison control, chemical exposure). They must work even if DB is down. This is the correct design — safety fallbacks should never depend on external DB availability. No change needed.

### 5. `safety-enhancement.ts` — SAFETY_WARNINGS (~9 strings, 3 levels × 3 langs)
**Status: ACTIVELY USED** — called from `layered-rule-evaluator.ts`.
**Verdict: Same as above — safety messages. Keep hardcoded as crash-proof fallbacks.**

### 6. `llm-response-formatter.ts` — IPM_URGENCY_LABELS (~15 strings) + CROP_LOCAL_NAMES (~45 strings)
**Status: ACTIVELY USED**
- `IPM_URGENCY_LABELS`: Used to inject IPM level labels into the LLM system prompt. These are **prompt instructions**, not farmer-facing text. The LLM translates them.
- `CROP_LOCAL_NAMES`: Used in the crop lock block to tell the LLM what crop name to use. These ARE farmer-facing (the LLM uses them verbatim).
**Alternative for CROP_LOCAL_NAMES**: Query `crop_vocabulary` table (has 10 entries) or `crop_stage_master` which has crop names. But this requires an async DB call in a sync function.
**Verdict**: IPM labels — keep (prompt-only, not farmer-facing). CROP_LOCAL_NAMES — this is the one genuine violation, but it needs a practical solution since the formatter runs synchronously.

### 7. `follow-up-generator.ts` — FOLLOW_UP_TEMPLATES (~40 strings, action_mr/action_hi/action_en)
**Status: ACTIVELY USED** — called from `llm-response-formatter.ts`.
**Alternative**: The follow-up text is passed to the LLM as part of the data payload. The LLM system prompt says "TRANSLATE ALL into natural {langName}". So `action_mr`/`action_hi` are redundant — the LLM already translates `action_en`.
**Verdict: Remove action_mr/action_hi fields.** Keep only `action_en` (English reference). The LLM narration layer handles translation.

### 8. `visual-agent.ts` — retake instructions + diagnosis summary (~6 strings)
**Status: ACTIVELY USED** — called from `orchestrator.ts` via `processVisualAgent()`.
**Verdict**: These messages flow through the LLM formatter before reaching the farmer. Can be English-only. The `forceTranslateResponse()` layer handles translation.

### 9. `agronomic-validator.ts` — message_mr/message_hi in errors/warnings (~12 strings)
**Status: USED** — but these are **internal validation messages** logged for debugging, not farmer-facing.
**Verdict: Remove message_mr/message_hi. Keep message_en only.** These are developer/audit messages.

### 10. `language-quality-validator.ts` — FIXED_TRANSLATIONS (~30 strings) + getSafeAskMoreInfoMessage (~3 strings)
- `FIXED_TRANSLATIONS`: Used by `enforceTermConsistency()` which is **exported but NEVER imported** anywhere else.
**Verdict: DEAD CODE.** `enforceTermConsistency` has zero callers. Remove entirely.
- `getSafeAskMoreInfoMessage`: Used by `response-validation-gate.ts`. Only 3 strings (mr/hi/en).
**Verdict**: Keep — it is a small crash-proof fallback. Or make English-only + let LLM translate.

### 11. `llm-response-generator.ts` — KNOWN_PRODUCTS Devanagari entries + fallbackMessages
- `KNOWN_PRODUCTS` Devanagari entries: Used for output validation (checking if LLM hallucinated products). Legitimate use — the validator needs to match Devanagari product names in the LLM output.
**Verdict: Keep — this is validation logic, not content generation.**
- `fallbackMessages`: 3 strings in a DEPRECATED function.
**Verdict**: The function itself is deprecated. Low priority.

---

## Summary: What Actually Needs Fixing

| File | Strings | Action | Why |
|------|---------|--------|-----|
| `response-mode-renderer.ts` | ~50 | **Switch to English-only** fallbacks | LLM translates final output anyway |
| `ui-response-contract.ts` + `ui-response-builder.ts` | ~21 | **No action — dead code** | Zero importers |
| `diagnosis-first-generator.ts` | ~12 | **Switch to English-only** templates | LLM translates final output |
| `safety-guardian.ts` | ~9 | **Keep hardcoded** | Life-safety — must work without DB |
| `safety-enhancement.ts` | ~9 | **Keep hardcoded** | Safety — must work without DB |
| `llm-response-formatter.ts` IPM | ~15 | **Keep** | Prompt instructions, not farmer text |
| `llm-response-formatter.ts` CROP_LOCAL_NAMES | ~45 | **Move to pre-loaded cache** from `crop_vocabulary` | Genuine violation — farmer-facing |
| `follow-up-generator.ts` | ~40 | **Remove action_mr/action_hi** | LLM translates action_en already |
| `visual-agent.ts` | ~6 | **Switch to English-only** | LLM translates final output |
| `agronomic-validator.ts` | ~12 | **Remove message_mr/message_hi** | Internal debug messages |
| `language-quality-validator.ts` FIXED_TRANSLATIONS | ~30 | **Remove entirely** | Dead code — zero callers |
| `language-quality-validator.ts` getSafeAskMoreInfoMessage | ~3 | **Switch to English-only** | LLM translates |
| `llm-response-generator.ts` KNOWN_PRODUCTS | ~8 | **Keep** | Validation logic |
| `llm-response-generator.ts` fallbackMessages | ~3 | **Switch to English-only** | Deprecated function |

---

## Revised Plan: NO New DB Table Needed

The previous plan proposed creating a `ui_message_templates` table with 200+ rows. After this audit, the correct approach is:

**The LLM narration layer (`forceTranslateResponse` in `index.ts`) already handles multilingual translation dynamically.** Most hardcoded mr/hi strings are redundant because:
1. They are fallback defaults that get overwritten by LLM-generated text
2. Even when used as fallbacks, they pass through `forceTranslateResponse()` which translates English to the target language

### Implementation Steps

1. **Switch 7 files to English-only fallbacks** — remove `mr`/`hi`/`pa`/`ta` keys, keep only `en`. The dynamic LLM translation layer handles the rest.
   - `response-mode-renderer.ts`: MODE_TEMPLATES and PHOTO_GUIDANCE_TEMPLATES
   - `diagnosis-first-generator.ts`: PHOTO_LABELS and DIAGNOSIS_QUESTION_TEMPLATES
   - `visual-agent.ts`: retake instructions and diagnosis summary
   - `language-quality-validator.ts`: getSafeAskMoreInfoMessage
   - `llm-response-generator.ts`: fallbackMessages

2. **Remove dead code** (zero callers):
   - `language-quality-validator.ts`: Remove `FIXED_TRANSLATIONS` and `enforceTermConsistency()`
   - Do NOT touch `ui-response-builder.ts` / `ui-response-contract.ts` (dead but harmless)

3. **Remove redundant mr/hi fields** (LLM translates the English version):
   - `follow-up-generator.ts`: Remove `action_mr`/`action_hi` from all templates, keep `action_en`
   - `agronomic-validator.ts`: Remove `message_mr`/`message_hi`, keep `message_en`

4. **CROP_LOCAL_NAMES** — the one genuine case needing DB:
   - Pre-load crop names from `crop_vocabulary` table (already has 10 entries) during orchestrator init
   - Pass resolved crop local name to formatter via context
   - Remove hardcoded CROP_LOCAL_NAMES dictionary

5. **Keep unchanged** (correct design):
   - `safety-guardian.ts` emergency messages — life-safety fallbacks
   - `safety-enhancement.ts` safety warnings — PPE fallbacks
   - `llm-response-formatter.ts` IPM_URGENCY_LABELS — prompt instructions
   - `llm-response-generator.ts` KNOWN_PRODUCTS — validation logic

This eliminates ~150 hardcoded strings without creating any new DB tables, by leveraging the existing LLM translation layer that already handles multilingual output.

