# Separate General Chat from Symbolic Decision Brain (No New Edge Function)

## Why the previous plan does not fit

The project is at the edge-function limit, so we **cannot ship a new `ai-general-chat` function**. We also already have a frontend memory rule (`farmer-interaction-engine-rules-v1`) that says: *"WITHOUT land context → Direct LLM answers, NO options, NO photo requests"* — and the orchestrator already has a `Phase 0.4B` branch meant to route `GENERAL_INFO without land` to a direct LLM path. The bug is that the **General tab** still goes through the full 9-agent pipeline, which classifies open agronomy questions as diagnostic and replies with "Which part of the plant is affected? 1) पान 2) Stem / Stalk 3) मूळ".

The fix is **routing, not a new function**. We add a first-class `mode: 'general'` branch inside the existing `ai-agriculture-chat` function that bypasses the orchestrator entirely and calls the LLM directly with a **senior agronomist** system prompt. We also reclaim slots by deleting orphan edge functions if needed.

## Reusing existing infrastructure

| Need | Reuse |
| --- | --- |
| AI call to LLM | `supabase/functions/_shared/aiConfig.ts` (`getBestAvailableProvider`, `buildAIRequest`) — already used by `ai-agriculture-chat`, `ai-smart-schedule`, `ai-crop-scan`. |
| Persistence of user + assistant messages | Existing `ai_chat_messages` / `ai_chat_sessions` writes inside `ai-agriculture-chat` (`session_type: 'general'` already exists). |
| Entitlement + quota gating | Existing `subscriptionMiddleware` + `rateGuard` already wired into `ai-agriculture-chat`. |
| Auth / JWT validation | Existing `jwtValidator` / `tenantMiddleware` in `ai-agriculture-chat`. |
| Language detection + canonical-script enforcement | Existing helpers in `ai-agriculture-chat/utils`. |

No new function, no new schema, no new middleware.

## Reclaim slots (only if quota is still blocking after the change)

Confirmed orphan functions (zero external references in the codebase):
- `ai-query-understanding`
- `validation-monitor`
- `mcp-handler`

These can be deleted via `supabase--delete_edge_functions` to free room. They are not used by this fix; listed only as a fallback if the limit is the blocker.

## Solution

### 1. Server: add a `mode: 'general'` short-circuit in `ai-agriculture-chat`

In `supabase/functions/ai-agriculture-chat/index.ts`, immediately after request parsing + auth + entitlement checks (≈line 250–440, before the `getOrchestrator()` call at ≈line 826), insert:

```ts
const isGeneralMode =
  body?.mode === 'general' ||
  body?.metadata?.chatMode === 'general' ||
  (!landId && body?.metadata?.source === 'general_tab');

if (isGeneralMode) {
  return await handleGeneralChat({
    req, supa, traceId,
    farmerId: user.id, tenantId: tenant.id,
    sessionId, language, messages,
    landContext: body?.metadata?.landContext ?? null, // optional, picked by farmer
    corsHeaders,
  });
}
```

A new helper file `supabase/functions/ai-agriculture-chat/general-chat-handler.ts` exports `handleGeneralChat(...)`:

- Builds a single system prompt (see §3).
- Sends `[system, ...last 12 turns, user]` through `getBestAvailableProvider()` + `buildAIRequest()` (no tools, no JSON mode, plain markdown text).
- Persists the user message + assistant reply to `ai_chat_messages` with `session_type: 'general'`, `metadata.chat_mode = 'general_llm_v1'`, `ai_model = <provider/model>`.
- Returns the same response envelope the frontend already understands:
  ```json
  {
    "response": "<markdown in farmer's language>",
    "metadata": {
      "type": "general_chat",
      "orchestrator_type": "GENERAL_LLM_DIRECT",
      "model": "...",
      "trace_id": "...",
      "land_context_used": true|false
    }
  }
  ```
  Crucially, **no `options`, no `clarificationOptions`, no `selectionType`** — the existing `isClarification` check at line 1703 of `EnhancedAIChatInterface.tsx` then correctly falls through and renders a normal markdown bubble.
- Errors (429 / 402 / network) bubble up with the same shape `ai-agriculture-chat` already returns.

### 2. Frontend: route General tab to the new mode + land-context picker

`src/components/chat/EnhancedAIChatInterface.tsx`:

- In the `sendMessage` invoke at line 1652, add to the body:
  ```ts
  mode: activeTab === 'general' ? 'general' : 'land_specific',
  metadata: {
    ...existingMetadata,
    chatMode: activeTab === 'general' ? 'general' : 'land_specific',
    landContext: activeTab === 'general' ? generalLandContext : landContext,
  }
  ```
- Add state `generalLandContext: LandContext | null` keyed per session, persisted in `sessionStorage` under `chat:general-land:<sessionId>`.
- Before the first General-tab send of a session, if the farmer has ≥1 land and `generalLandContext === undefined`, open a new bottom-sheet `GeneralChatLandPicker` (lists farmer's lands + an explicit "No specific land — general question" option). Queue the outgoing message until they pick.
- Show a small chip under the General tab header: *"Context: {land name | General}"* with a "Change" button to re-open the picker.
- Skip all decision-brain post-processing for General-mode responses (the `isClarification`, `decision_output`, `data_audit_cards` branches already only trigger when those fields exist, so this is automatic once the server stops sending them).

Files:
- **Edit** `src/components/chat/EnhancedAIChatInterface.tsx`
- **New** `src/components/chat/GeneralChatLandPicker.tsx`
- **Edit** `src/components/chat/GeneralChatWelcomeCard.tsx` — replace diagnostic-style suggestions with free-form agronomy prompts ("इस मौसम में कौन सी फसल?", "गहूसाठी कोणते खत?", etc.).
- **Edit** `src/i18n/locales/{en,hi,mr}/chat.json` — add keys: `general.pick_land_title`, `general.pick_land_subtitle`, `general.no_specific_land`, `general.context_chip`, `general.change_land`, `general.queued_waiting_pick`.

### 3. Senior Agronomist System Prompt (server-side)

```
You are a SENIOR AGRONOMIST with 25+ years of on-field, rural farming experience
across Indian smallholder agriculture. You advise farmers in clear, practical,
season-aware language they can act on the same day.

Hard rules:
- Answer ONLY agriculture topics (crops, soil, water, fertilizer, pest/disease,
  weather, market, schemes, livestock, post-harvest). If the question is off-topic,
  politely steer back to farming in one sentence.
- Reply in the farmer's selected language ({{language}}) using its native script.
- Use simple rural vocabulary — like an elder advisor in the village, not a textbook.
- If LAND_CONTEXT is provided, use crop, growth stage, area, soil, district, season,
  and recent weather. If missing, give the best general guidance and briefly note
  one extra detail that would sharpen the answer.
- Be specific: name inputs, dosages per acre, timings, and PHI when relevant.
  Prefer organic / IPM first, then chemical only when justified.
- Never invent regulatory approvals. If unsure, say so.
- Reply as plain markdown. NEVER ask the farmer to "classify" their question,
  pick an "intent", or upload a photo. Maximum ONE follow-up question if truly needed.

LAND_CONTEXT:
{{landContextJsonOrNone}}
```

Followed by the last 12 turns of conversation + the new user message.

## Files Changed

**New**
- `supabase/functions/ai-agriculture-chat/general-chat-handler.ts`
- `src/components/chat/GeneralChatLandPicker.tsx`

**Edited**
- `supabase/functions/ai-agriculture-chat/index.ts` — add `isGeneralMode` short-circuit before orchestrator.
- `src/components/chat/EnhancedAIChatInterface.tsx` — send `mode`, add picker gating, store per-session land context chip.
- `src/components/chat/GeneralChatWelcomeCard.tsx` — agronomy-style suggestions.
- `src/i18n/locales/{en,hi,mr}/chat.json` — picker + chip keys.

**Optional (only if deploy still blocks on quota)**
- Delete orphan edge functions: `ai-query-understanding`, `validation-monitor`, `mcp-handler` (via `supabase--delete_edge_functions`).

## Unchanged

- Land-specific tabs continue using the full 9-agent symbolic orchestrator.
- Photo / video crop-scan flow (`ai-crop-scan`) unchanged.
- `ai_chat_messages`, `ai_chat_sessions`, RLS, quotas — unchanged.
- Subscription gating (`AIChat.tsx` redirect to `/app/subscription`) unchanged.

## Verification

1. `/app/chat` → **General** tab → ask "हिरवी मिरची पीक घ्यायचे आहे काय करावे?" → land picker appears → pick "No specific land" → assistant returns a markdown agronomy answer in Marathi. **No** "Which part of the plant is affected?" card.
2. Same tab, pick a real land → next answer references that land's crop/stage in the reply.
3. Switch to a **Land tab** → ask a pest question with vague symptoms → existing decision-brain clarification card still appears (untouched).
4. Reload → restored General messages + the same context chip.
5. Free / expired plan → still redirected to `/app/subscription`.
6. Edge-function count after change: unchanged (still N — we modified `ai-agriculture-chat` in-place).
