# Deep Audit: Hardcoded Text in `ai-agriculture-chat/index.ts`

## TL;DR
You are correct. Despite the architecture mandate ("100% of agronomic + farmer-facing text originates from the symbolic decision brain / DB; LLM is pure narrator"), `index.ts` still contains **at least 12 hardcoded English template functions** that bypass the symbolic brain and are wired directly into the primary response pipeline. They violate the **Symbolic Engine Strict Invariants**, **Layer Responsibility Model**, and **LLM Response Generator Narration-Only v2** contracts.

---

## Evidence — Hardcoded strings still in `index.ts`

| Line | Hardcoded text | Function |
|---|---|---|
| 2519 | `'🌾 Hello farmer friend!'` | `generateValidationFailureFallback` |
| 2522 | `'📌 **What to do now:**'` | `generateValidationFailureFallback` |
| 2575 | `'🌾 Hello Farmer Friend!\nI encountered a technical issue...📞 For urgent help: Contact your nearest KVK.'` | `generateValidationFailureFallback` |
| 2600 | `'\n✅ Best wishes! 🙏'` | `generateValidationFailureFallback` |
| 2607–2617 | Multi-line "Hello Farmer Friend / technical issue / KVK" template | `generateValidationFailureFallback` |
| 2630 | `'Hello farmer friend! 🌾'` + `'⚠️ Unable to provide recommendations...'` | `generateAllActionsFilteredResponse` |
| 2644–2651 | `categoryLabels` map (Regulatory / Safety / Seasonal / Weather / Economic / Compatibility / Other Reasons) | `generateAllActionsFilteredResponse` |
| 3059, 3070, 3072, 3076, 3079 | "Hello farmer friend / I understand you're dealing with X / What is the crop name / growth stage / symptoms / send a photo" | `generateNoRecommendationsFallback` |
| 3091, 3098, 3103, 3109 | "Hello farmer friend / Stop / Postpone spray / No action required / Continue monitoring" | `buildFormattedRecommendationsList` |
| 3224 | `'Please provide more details about your question. Tell us the crop name, problem, and symptoms.'` | `generateClarificationPrompt` |
| 3241–3255 | Multi-line "🙏 Hello Farmer Friend / Quick tips / Monitor your crop / water management" template | `generateHelpfulErrorResponse` |
| 3270, 3282, 3288, 3303, 3331–3335, 3351, 3360 | "Hello farmer / Postpone spray / No action / Recommended treatment / Spray in the morning 6-10 AM / Spray in the evening 4-6 PM / Any time of day / Alternative measures / Best wishes" | `buildResponseFromDecisionOutput` |
| 3370 | `'Hello! 🌾 Continue monitoring your crop. Let us know if you notice any issues.'` | `getGenericMonitoringMessage` |

These functions are invoked from the **main response pipeline** at lines **1235, 1565, 1585, 1687, 2997, 3002, 3024, 3042, 3047** — i.e., they are not dead code; they fire on common branches (NO_RECS, BLOCKED, WEATHER_DELAYED, NEEDS_CLARIFICATION, SYSTEM_ERROR, VALIDATION_FAIL, ALL_FILTERED).

---

## Why this code is here (root cause)

Each hardcoded block is preceded by a comment like `CRITICAL FIX`, `PRODUCTION FIX`, or `English-only — forceTranslateResponse() handles localization at runtime`. The history is:

1. Symbolic brain originally returned only structured payloads. When it returned `NO_RECS` / `BLOCKED` / errors, the narrator had nothing to say.
2. Instead of fixing the symbolic brain to always emit `fallback_text` (the v2 contract), engineers patched **defensive English templates** directly into `index.ts`.
3. To "fix" the language problem, they added `forceTranslateResponse()` (line 1606, 2148) — an **LLM round-trip** that re-translates the hardcoded English at runtime. This is exactly the "parallel authority" anti-pattern the v2 narration contract forbids: the LLM is now both generating *and* rewriting agronomic-adjacent text, with no DB anchor.
4. The comments openly admit the design: *"English-only fallback — forceTranslateResponse() handles localization at runtime"*. That sentence is the smoking gun — it normalizes hardcoded English as a "feature".

So the loophole is **two layered violations**:
- Hardcoded English templates in the orchestrator (violates Symbolic Engine Strict Invariants).
- A second LLM translation pass that masks them at runtime (violates Layer Responsibility Model + Narration-Only v2 + Canonical Language Governance).

---

## Why it matters (data-accuracy impact)

- **Greetings, tips, monitoring advice** ("Monitor your crop regularly", "Maintain proper water management") are *agronomic* statements not sourced from `decision_rules` — they are fabricated.
- **Timing labels** ("Spray in the morning 6–10 AM", "Spray in the evening 4–6 PM") override DB `timing.best_time_of_day` with hardcoded windows.
- **Category labels** (Regulatory / Safety / Seasonal) are not the canonical labels stored in DB filter metadata.
- `forceTranslateResponse` then sends this English to GPT-4o-mini, which can **rephrase, drop emojis, or inject local idioms** — the user sees text that no rule ever produced.
- Violates the Core memory rule: *"100% of agronomic advice MUST originate from database; LLM is restricted exclusively to translation/narration."*

---

## Remediation plan (Phase by phase)

### Phase A — Surface the violation in the symbolic brain contract
1. Make `fallback_text` truly **required** on every `OrchestratorResponse` branch (`READY`, `NEEDS_CLARIFICATION`, `NO_MATCH`, `BLOCKED`, `ESCALATE`, `WEATHER_DELAYED`, `SYSTEM_ERROR`, `VALIDATION_FAIL`, `ALL_FILTERED`). The symbolic brain — not `index.ts` — owns this text, sourced from a new `decision_fallback_texts` DB table keyed by `(status, intent, language)`.
2. Add a runtime invariant in `index.ts`: if `fallback_text` is missing, log `SYMBOLIC_CONTRACT_VIOLATION` and short-circuit to a **single** neutral DB-sourced string — never build prose in TS.

### Phase B — Delete the hardcoded template functions
Remove (after Phase A lands):
- `generateValidationFailureFallback`
- `generateAllActionsFilteredResponse`
- `generateNoRecommendationsFallback`
- `buildFormattedRecommendationsList` (English template parts only — keep DB field reads)
- `generateClarificationPrompt`
- `generateHelpfulErrorResponse`
- `generateGenericAcknowledgment`
- `buildResponseFromDecisionOutput` (English template parts only)
- `getGenericMonitoringMessage`
- The English `timingLabels`, `categoryLabels`, and "Best wishes" / "Hello farmer friend" string literals.

Replace each call site (1235, 1565, 1585, 1687, 2997, 3002, 3024, 3042, 3047) with a single call:
```
responseContent = symbolicResponse.fallback_text ?? await narrator.narrate(symbolicResponse, lang);
```

### Phase C — Retire `forceTranslateResponse` as a band-aid
- Keep it only as a **language-validation gate** (reject + log if narrator output isn't in target script). Stop using it to translate hardcoded English at runtime — once Phase B is done there is no English to translate.
- Update `verifyLanguageConsistency` to call `SYMBOLIC_CONTRACT_VIOLATION` on failure instead of re-prompting an LLM.

### Phase D — Migration + tests
1. Migration: create `public.decision_fallback_texts (status, intent, lang, text, updated_at)` with GRANTs + RLS; seed canonical mr / hi / en / ta / te / kn / bn / gu / pa rows for every status.
2. Add a Deno test asserting no string literal in `index.ts` matches `/(Hello farmer|farmer friend|Best wishes|Continue monitoring|technical issue|KVK|Spray in the morning)/i`.
3. Add a contract test that mocks each `status` branch and asserts the response is byte-identical to the DB `fallback_text` (no LLM call).

---

## Technical notes
- Files touched (after approval): `supabase/functions/ai-agriculture-chat/index.ts`, the symbolic brain orchestrator under `decision/`, new migration under `supabase/migrations/`, new test under `supabase/functions/ai-agriculture-chat/__tests__/`.
- No frontend changes required.
- This is purely backend / SSOT enforcement work — no UI impact beyond removing fabricated greetings.

---

## Open question before I implement
Do you want me to:
**(1)** Execute the full A→D refactor (new DB table + delete ~250 lines of hardcoded templates + tests), or
**(2)** Do a smaller surgical pass that just deletes the hardcoded English and forces every branch to read `symbolic_decision.fallback_text` (failing loudly if missing), leaving the DB-seed work for a follow-up?

Option 1 is the correct architectural fix. Option 2 exposes every missing `fallback_text` in the symbolic brain so we can find and seed them quickly.
