

# Critical Bug: Village Officer Persona Is Present But Overridden by FORMAT Templates

## Root Cause

The persona block IS deployed at the top of the system prompt. But **gpt-4o-mini exhibits strong recency bias** — it pays most attention to the LAST instructions it reads. The prompt structure is:

```text
1. Village Officer Persona (top)        ← says "speak like field officer"
2. Supreme Law / Crop Lock              ← structural
3. FORMAT_1 template (middle)           ← says "[Warm greeting]", "[Action heading]"
4. Rural Language Rules (bottom)        ← says "translate meaning not words"
5. Final line: "TRANSLATE ALL into..."  ← THE KILLER: last word is "TRANSLATE"
```

**Three specific bugs causing textbook output:**

### Bug 1: FORMAT_1 line 1190 — Vague greeting instruction
```
[Warm greeting — address farmer by crop name "${crop}" in ${langName}]
```
gpt-4o-mini interprets `[Warm greeting]` as formal letter greeting → produces **"प्रिय ऊस शेतकरी"** (Dear sugarcane farmer). No anti-pattern tells it NOT to use "प्रिय".

### Bug 2: Line 1409 — Final instruction says "TRANSLATE"
```
TRANSLATION: action_text/reason_text/knowledge_text are English REFERENCE texts. TRANSLATE ALL into natural ${langName}.
```
The **last word** of the entire system prompt frames the task as TRANSLATION. This overrides the persona at the top due to recency bias.

### Bug 3: No tone reinforcement at prompt END
The persona is at the TOP but the detailed FORMAT templates and rules in the MIDDLE/END dominate. There's no final reinforcement saying "Remember: you are a village officer EXPLAINING, not a translator."

## Fix Plan (3 surgical changes, same file)

### Fix A: Rewrite FORMAT_1 greeting line (line 1190)
Replace vague `[Warm greeting]` with explicit conversational instruction:

**Before:** `[Warm greeting — address farmer by crop name "${crop}" in ${langName}]`
**After:** `[Start by casually addressing the farmer like a friend/brother — then state what you see in their crop. Do NOT use formal greetings like "Dear farmer" or "Respected farmer". Speak as if you walked into their field.]`

Apply same fix to FORMAT_5 greeting (line 1291).

### Fix B: Replace final "TRANSLATE" line (line 1409)
**Before:** `TRANSLATION: action_text/reason_text/knowledge_text are English REFERENCE texts. TRANSLATE ALL into natural ${langName}.`
**After:** `IMPORTANT: action_text/reason_text/knowledge_text below are English reference notes. REWRITE them as a village agriculture officer EXPLAINING to the farmer in natural rural ${langName}. Do NOT translate word-by-word.`

### Fix C: Add tone reinforcement as LAST line of system prompt
After line 1409, add a final 3-line reinforcement block:

```
═══ FINAL REMINDER ═══
You are a VILLAGE AGRICULTURE OFFICER standing in the farmer's field, not a translator at a desk.
Speak naturally. Use the words farmers actually use. Never start with "Dear farmer" or formal greetings.
```

This exploits LLM recency bias — the last instruction the model reads will anchor its tone.

## Files Changed

| File | Lines | Change |
|------|-------|--------|
| `llm-response-formatter.ts` | 1190 | Rewrite FORMAT_1 greeting to anti-formal |
| `llm-response-formatter.ts` | 1291 | Rewrite FORMAT_5 greeting to anti-formal |
| `llm-response-formatter.ts` | 1409 | Replace "TRANSLATE ALL" with "REWRITE as officer explaining" |
| `llm-response-formatter.ts` | after 1409 | Add tone reinforcement as final block |

## What Does NOT Change
- Persona block — kept as-is (it's correct, just needs end-reinforcement)
- Supreme Law, dosage lock, product lock — untouched
- Symbolic decision brain — untouched
- No hardcoded Marathi/Hindi strings added
- Token cost: ~30 tokens added

## Expected Result
**Before:** "प्रिय ऊस शेतकरी, तुमच्या ऊसामध्ये मृत गाभा आहे..."
**After:** "भाऊ, तुमच्या उसाच्या गाभ्याला अळी लागलीय..."

