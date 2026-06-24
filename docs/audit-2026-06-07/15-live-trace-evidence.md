# Live Trace Evidence — Marathi / Khari (NO_ACTIVE_CROP)

**Trace ID:** `trace_mq3ffmsw_7ul7ef`
**Date:** 2026-06-07 06:54:34Z
**Land:** Khari (`ca9687fa-e0d8-41fa-b77c-07325384a898`), tenant `a2a59533…`, farmer `155588c4…`
**Input (mr):** "माझ्या खारी जमिनीत आता काय करू? मागच्या वेळी गहू होते"
**Channel:** direct `POST /ai-agriculture-chat` with anon JWT + custom auth headers.

---

## 1. Raw response (from the edge function)

```json
{
  "actionsReturned": null,
  "language": "mr",
  "metadata": {
    "actions_count": 0,
    "ai_model": "template",
    "confidence": 0,
    "orchestrator_type": "DECISION_PROVIDED",
    "trace_id": "trace_mq3ffmsw_7ul7ef",
    "type": "decision"
  },
  "quickReplies": [
    "🔍 How can I confirm which cause is affecting my crop?",
    "📸 Should I send a photo for diagnosis?",
    "📅 What should I do first thing tomorrow?"
  ],
  "response": "तुमच्या पिकातल्या \"symptom\" च्या लक्षणांमागे अनेक कारणं असू शकतात…",
  "responseTime": 5165,
  "sessionId": "9a105ccf-3dde-45ec-9872-047e44e1576c",
  "source": "orchestrator_v1",
  "structured_advisory": null
}
```

---

## 2. Edge-function log timeline (ordered)

| t (Z) | Phase | Line |
|---|---|---|
| 06:54:34 | Init | `🚀 Orchestrator v4.1.0: Starting full diagnostic flow…` |
| 06:54:34 | Language | `raw=mr, has_devanagari=true, output_language_target=mr` |
| 06:54:35 | Canonical context | `⚠️ [NO_CROP_DATA] No crop_schedule AND no lands.current_crop for ca9687fa…` |
| 06:54:35 | Canonical context | `✅ [CanonicalContext] Built and LOCKED (status=NO_ACTIVE_CROP)` |
| 06:54:35 | Canonical context | `Crop=null, Stage=null, DAS=null, NDVI=0.041, Source=LAND_DATA` |
| 06:54:35 | Routing | `🛤️ Query Route: GENERAL_INFO (confidence: 50%)` |
| 06:54:35 | **Short-circuit** | `🛑 NO_ACTIVE_CROP short-circuit fired (lastCrop=Wheat)` |
| 06:54:35 | Static gate | `⏭️ Static gate passed - continuing to AI pipeline` ← **leak: short-circuit's `return` did not stop the wrapper** |
| 06:54:35 | Filtering | `RAW DECISION GRAPH OUTPUT … 0 actions, Status: INFORMATION_PROVIDED` |
| 06:54:35 | Confidence bridge | `📊 [ConfidenceBridge] symbolic_confidence=0.000 -> decision_confidence=0` |
| 06:54:35 | Unified gate | `🚦 [UnifiedGate] 🚫 FAIL — Decision Confidence: 0 — Resolved Mode: INFORMATION` |
| 06:54:35 | Safety gate | `🛡️ override=CLARIFY, downgrading unified gate to CLARIFY` |
| 06:54:35 | LLM format | `🤖 Using LLM formatter for natural language generation` |
| 06:54:35 | Render | `🔒 No crop context available for rendering` |
| 06:54:38 | HTTP | `200` returned with template `{symptom}` body |

---

## 3. Findings vs. prior remediation

| # | Finding | Status |
|---|---|---|
| **F1** | `NO_ACTIVE_CROP_GUARD` returns a fully-formed payload at `orchestrator.ts:1616` but the wrapper in `index.ts` ignores `decision_output.status === 'INFORMATION_PROVIDED' + template_type === 'NO_ACTIVE_CROP'` and continues into filtering → unified gate → LLM formatter. Net effect: the diagnostic template is rendered instead of the localized "no active crop" message. | **Open — regression of previous fix** |
| **F2** | Template fallback emits the literal token `"symptom"` (Marathi response wraps it in quotes) when no symptoms were extracted. The placeholder substitution map has no entry for `symptom`. | **Open** |
| **F3** | `metadata.confidence` returned to the client is `0` despite the orchestrator short-circuit setting `confidence_score: 1.0`. Confirms F1: the short-circuit payload is discarded. The previously-fixed precedence chain in `ui-response-builder.ts` is correct but never receives the floored value because metadata is overwritten downstream. | **Open — confidence floor leak** |
| **F4** | Confidence bridge logs `symbolic_confidence=0.000` (no rules fired). The widened fallback chain is functioning; the upstream value is genuinely 0 because the orchestrator never produced a primary_decision (correct for NO_ACTIVE_CROP). The bug is not in the bridge — it is in F1/F3 (the short-circuit payload was lost). | Bridge OK |
| **F5** | Multi-tenant: tenant header `a2a59533…` is honored end-to-end; land lookup, NDVI (0.041), soil NPK (260/24/320) all resolve under the correct tenant. No leakage observed. | OK |
| **F6** | Intent classifier returns `GENERAL_INFO @ 50%` for a past-tense crop-history query referencing a harvested land. Acceptable, but a dedicated `LAND_INFO` / `POST_HARVEST_INFO` intent would short-circuit cleanly without depending on the canonical-context guard. | Improvement (deferred) |

---

## 4. Root cause for F1/F2/F3 (single defect)

`orchestrator.ts:1616` returns the NO_ACTIVE_CROP payload from inside `runOrchestrator`,
but the caller in `index.ts` re-enters the **filtering → unified-gate → LLM-formatter** pipeline
regardless of `decision_output.status === 'INFORMATION_PROVIDED'` plus
`metadata.template_type === 'NO_ACTIVE_CROP'`. The template formatter then synthesizes a
generic clarification with unfilled `{symptom}` placeholders and zeroed confidence.

**Required fix (next round, gated by your "remediate in one pass" instruction):**

1. In `index.ts`, immediately after `runOrchestrator` returns, check
   `orchestratorResponse?.decision_output?.metadata?.template_type === 'NO_ACTIVE_CROP'`
   (or `source === 'NO_ACTIVE_CROP_GUARD'`) and **bypass** filtering, unified-gate,
   safety-gate, and LLM formatting — pass the payload straight to `ui-response-builder`.
2. In the LLM/template formatter, refuse to emit any string containing an unfilled
   `{…}` placeholder; fall back to the NO_ACTIVE_CROP localized text when the
   placeholder map is empty.
3. Preserve `confidence_score: 1.0` from the short-circuit payload through
   `metadata.confidence` (do NOT overwrite with the symbolic-bridge 0).

---

## 5. Validation plan

- Replay the same Marathi query after the fix; assert:
  - `response` starts with `🌱` and contains `गहू` (last crop) and `पीक नोंदणी`.
  - `metadata.confidence === 1.0`.
  - `metadata.ai_model === 'template-no-active-crop'` (new sentinel).
  - No `"{` or `"symptom"` substring in `response`.
- Add a regression test under `tests/chat/no-active-crop.test.ts`.

---

## 6. Files implicated (for the next remediation pass)

- `supabase/functions/ai-agriculture-chat/index.ts` — pipeline bypass for short-circuit payloads.
- `supabase/functions/ai-agriculture-chat/decision/response-generator.ts` — placeholder guard.
- `supabase/functions/ai-agriculture-chat/utils/ui-response-builder.ts` — confidence propagation already correct; no change needed for this scenario.
