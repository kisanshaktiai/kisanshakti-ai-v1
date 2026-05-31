## Goal

Cleanly separate the two chat modes by giving each its own Edge Function, and remove the unused `mcp-handler`.

- **Land-specific chat** → keeps using existing `ai-agriculture-chat` (symbolic decision brain only).
- **General chat tab** → new dedicated Edge Function `ai-general-chat` (direct LLM, "Senior Agronomist", no symbolic brain).
- **`mcp-handler`** → deleted (audit confirms zero references in `src/` and no other Edge Function imports it).

This also eliminates the recent CORS / routing patches (`x-chat-mode` header, `orchestratorBypass` flag, in-function short-circuit) that were the source of the `FunctionsFetchError` and the "still hits symbolic brain" symptom.

## Audit summary

- `mcp-handler/index.ts` (538 lines): not invoked anywhere in `src/` (`rg "mcp-handler"` returns only the file itself). Safe to delete.
- `ai-agriculture-chat/index.ts` currently contains two general-mode short-circuits (lines ~600 and ~866) plus the `x-chat-mode` CORS header and an import of `general-chat-handler.ts`. These were bolted on and are the root cause of the brittle routing.
- `EnhancedAIChatInterface.tsx` sends both modes to `ai-agriculture-chat` and disambiguates with `mode`, `metadata.orchestratorBypass`, and the `x-chat-mode` header — fragile.
- `general-chat-handler.ts` already contains a clean direct-LLM implementation (Senior Agronomist prompt, history filter, persistence). It will be lifted into the new function as-is.

## Implementation

### 1. New Edge Function `supabase/functions/ai-general-chat/index.ts`
- Own CORS block using `_shared/cors.ts` (no custom `x-chat-mode` header needed).
- Validates auth headers (`x-tenant-id`, `x-farmer-id`, `x-session-token`) via existing `_shared/authMiddleware`.
- Resolves / creates a `session_type = 'general'` row in `ai_chat_sessions`.
- Calls a local `handleGeneralChat` (copied from current `general-chat-handler.ts`) which:
  - Builds Senior Agronomist (25+ yrs) prompt in farmer's language.
  - Optionally injects `landContext` when farmer attached a land.
  - Strips any symbolic clarification turns from history.
  - Calls Lovable AI Gateway via `_shared/aiConfig`.
  - Persists user + assistant messages with `orchestrator_type: 'GENERAL_LLM_DIRECT'`.
- Returns `{ response, metadata: { type: 'general_chat', ... } }` — same shape the UI already renders.

### 2. Strip general-mode logic from `ai-agriculture-chat`
- Remove `import { handleGeneralChat } from './general-chat-handler.ts'`.
- Remove both `isGeneralMode` short-circuits (lines ~600 and ~866).
- Remove `x-chat-mode` from `Access-Control-Allow-Headers`.
- Delete `supabase/functions/ai-agriculture-chat/general-chat-handler.ts`.
- Function reverts to a pure symbolic-decision-brain endpoint.

### 3. Delete `mcp-handler` Edge Function
- Remove `supabase/functions/mcp-handler/` directory.
- Call `supabase--delete_edge_functions(["mcp-handler"])` so it's also removed from Supabase.

### 4. Frontend routing in `EnhancedAIChatInterface.tsx`
- In `sendMessage` (and the retry / regenerate paths), branch on `isGeneralTab`:
  - `isGeneralTab === true` → `supabase.functions.invoke('ai-general-chat', { body: { messages, language, landContext, sessionId } })`
  - else → existing `supabase.functions.invoke('ai-agriculture-chat', { body: { ... } })` (land-specific symbolic brain).
- Remove `mode`, `metadata.chatMode`, `metadata.orchestratorBypass`, and the `x-chat-mode` header from outgoing requests — they're no longer needed because routing is now by function name.
- Keep `GeneralChatLandPicker` + `generalLandId` race-condition fix (`overrideGeneralLandId` parameter) as-is — that's a UX fix, not the routing problem.
- Keep history-filtering & forcing General responses to `messageType: 'text'` in the UI.
- Keep the `t('chat.tabs.general')` i18n fix.

### 5. Validation
- Land-specific tab: a Marathi diagnostic question still returns symbolic clarification / Decision Brain cards from `ai-agriculture-chat`.
- General tab: `हिरवी मिरची पिक घ्यायच आहे काय करावे?` returns a direct senior-agronomist answer from `ai-general-chat`, no "which part of the plant" cards.
- Selecting a land in the picker sends exactly one request (race-condition fix retained).
- No CORS preflight failures (no custom headers on General requests).
- `mcp-handler` no longer listed in the Supabase functions dashboard.

## Files touched

- **Create**: `supabase/functions/ai-general-chat/index.ts`
- **Edit**: `supabase/functions/ai-agriculture-chat/index.ts` (strip general-mode branches + CORS header)
- **Edit**: `src/components/chat/EnhancedAIChatInterface.tsx` (route by function name)
- **Delete**: `supabase/functions/ai-agriculture-chat/general-chat-handler.ts`
- **Delete**: `supabase/functions/mcp-handler/` (directory + dashboard)
