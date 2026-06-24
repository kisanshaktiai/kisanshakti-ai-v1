---
name: Orchestrator Short-Circuit Bypass Contract
description: Defines which orchestrator payloads bypass filtering/gates/LLM formatter and preserve their own confidence end-to-end.
type: architecture
---

# Short-Circuit Bypass Contract (ai-agriculture-chat)

The orchestrator (`supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`)
has multiple short-circuit lanes that build a complete, localized, deterministic
payload (full_text in mr/hi/en, confidence, source). The post-orchestrator
pipeline in `supabase/functions/ai-agriculture-chat/index.ts` MUST recognize
ALL of these and route them straight to delivery — never through filtering,
confidence-bridge, unified-gate, safety-gate, or LLM/template formatting.

## Recognized template_types (decision_output.metadata.template_type)
- `STATIC_DIRECT`
- `NO_ACTIVE_CROP`
- `NEXT_CROP_RECOMMENDATION`
- `GREETING`
- `STAGE_FALLBACK`

## Recognized sources (communication.metadata.source)
- `STATIC_DATA_GATE`
- `NO_ACTIVE_CROP_GUARD`
- `NEXT_CROP_RECOMMENDATION_ENGINE`
- `NEXT_CROP_RECOMMENDATION_FALLBACK`

## On bypass:
1. `responseContent` = `communication.main_message.full_text[lang]` verbatim.
2. `aiModelUsed` set to a clear sentinel (`template-no-active-crop`,
   `next-crop-engine`, etc.) so traces are unambiguous.
3. `orchestratorResponse.metadata.confidence` is **set** from
   `decision_output.metadata.confidence` (fallback: `communication.metadata.confidence_score`, then `1.0`)
   so persistence + UI builder propagate it.
4. Placeholder guard: any rendered string containing `{token}` is rejected and
   replaced with a minimal localized "need more details" message.

## Why this matters
Without the bypass, the LLM template formatter overwrites the rich localized
message with a generic clarification template containing literal `{symptom}`
placeholders and `confidence=0`. See `docs/audit-2026-06-07/15-live-trace-evidence.md`
for the original regression evidence (Marathi NO_ACTIVE_CROP trace
`trace_mq3ffmsw_7ul7ef`).

## When adding a new short-circuit lane
Register both its `template_type` AND its `source` in BOTH sets in index.ts —
forgetting either will cause the lane's payload to be silently discarded.
