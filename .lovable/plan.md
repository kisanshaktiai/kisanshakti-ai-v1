
# Deep Audit: AI Chat & Symbolic Decision Brain - Critical Bug Fix

## CRITICAL BUG: Message Formatting Changes After App Restart

### Root Cause Identified

The bug is a **metadata loss pipeline**: when messages are first displayed, the frontend has rich structured data in-memory (clarification options, orchestratorType, structured cards). When the app restarts and reloads from the database, the `mapMessageFromDB()` function (line 401-428) **fails to reconstruct** these critical properties because:

1. **Server-side persistence (index.ts line 1286-1311)** does NOT save `clarification_options` to the `metadata` JSON column -- only `orchestrator_type`, `confidence`, `trace_id`, etc.
2. **Client-side LocalDB save (line 1565-1594)** saves `clarification_options` to LocalDB metadata, but the SERVER save at line 1269-1312 does NOT include them.
3. **`mapMessageFromDB()` (line 401-428)** does NOT reconstruct `clarificationOptions` from metadata even if present. The field is completely absent from the mapping.

### What Happens

```text
FIRST LOAD (in-memory):
  aiMessage = {
    content: "🔬 तुमच्या पिकाला खालीलपैकी...",
    orchestratorType: "CLARIFICATION_QUESTION",
    clarificationOptions: { question: "...", options: [...] },  // RICH UI
  }
  --> Renders: Interactive buttons with options

AFTER RESTART (from DB):
  mapMessageFromDB = {
    content: "🔬 तुमच्या पिकाला खालीलपैकी...",
    orchestratorType: "CLARIFICATION_QUESTION",   // Restored from metadata
    clarificationOptions: undefined,               // LOST - not in DB metadata
  }
  --> Renders: Plain text with formatAIResponse() -- formatting stripped
```

**Database evidence confirms this**: All 37 CLARIFICATION_QUESTION messages in the last 7 days have `metadata->>'clarification_options' = NULL`.

---

## Fix Plan

### Fix 1: Save `clarification_options` to DB metadata (Server-Side)

**File:** `supabase/functions/ai-agriculture-chat/index.ts` (line ~1286)

Add `clarification_options` to the metadata object in the server-side assistant message insert. Currently the server saves `orchestrator_type`, `confidence`, `trace_id`, etc. but NOT the options array. The clarification response payload (built at line 3240-3246) contains well-structured options with `label`, `value`, `observation_key`, and `description` -- these need to be persisted.

Add to the metadata block at line 1286:
```typescript
metadata: {
  orchestrator_type: orchestratorResponse.type,
  // ... existing fields ...
  // NEW: Persist clarification options for reload
  clarification_options: orchestratorResponse.type === 'CLARIFICATION_QUESTION' 
    ? {
        question: responseContent,
        options: orchestratorResponse.question?.options || orchestratorResponse.communication?.options || [],
        selectionType: orchestratorResponse.metadata?.selectionType || 'SINGLE_CHOICE'
      }
    : undefined,
}
```

### Fix 2: Reconstruct `clarificationOptions` in `mapMessageFromDB()`

**File:** `src/components/chat/EnhancedAIChatInterface.tsx` (line 401-428)

The `mapMessageFromDB` function must reconstruct `clarificationOptions` from the saved metadata:

```typescript
const mapMessageFromDB = (msg: any): Message => {
  const metadata = msg.metadata as Record<string, any> | null;
  // ... existing code ...
  
  return {
    // ... existing fields ...
    
    // NEW: Reconstruct clarification options from metadata
    clarificationOptions: metadata?.clarification_options ? {
      question: metadata.clarification_options.question,
      options: metadata.clarification_options.options?.map((o: any) => ({
        label: typeof o === 'string' ? o : o.label,
        value: typeof o === 'string' ? o : (o.value || o.label),
        description: typeof o === 'object' ? o.description : undefined,
        observation_key: typeof o === 'object' ? o.observation_key : undefined
      })),
      selectionType: metadata.clarification_options.selectionType || 'SINGLE_CHOICE'
    } : undefined,
    
    // NEW: Reconstruct diagnosticEscalationData if present
    diagnosticEscalationData: metadata?.diagnostic_escalation_data || undefined,
  };
};
```

### Fix 3: Also persist `structuredResponse` for Decision Brain responses

Currently, the `structuredResponse` and `decisionBrainResponse` fields shown during live chat are never saved to the database. On reload, only the raw `content` text is available, so the rich card UI (colored sections, action cards) degrades to plain text.

**File:** `supabase/functions/ai-agriculture-chat/index.ts`

Add to the DECISION_PROVIDED metadata save:
```typescript
metadata: {
  // ... existing ...
  response_sections: orchestratorResponse.communication?.sections || undefined,
}
```

And reconstruct in `mapMessageFromDB`:
```typescript
structuredResponse: metadata?.response_sections ? {
  cards: metadata.response_sections.map(/*...*/),
  language: msg.language
} : undefined,
```

---

## Secondary Bugs Found

### Bug 2: Duplicate Message Interface Definition

The `Message` interface is defined TWICE:
- `EnhancedAIChatInterface.tsx` line 45-165 (21 fields)
- `ModernChatUI.tsx` line 56-112 (duplicate, subset)

These can drift apart causing rendering inconsistencies. Should be a single shared type.

### Bug 3: Hardcoded Marathi/Hindi in Frontend Components

- `WhatHowWhyCard.tsx` line 80: `language?: 'en' | 'hi' | 'mr'` -- should accept any string
- `DecisionBrainCards.tsx` lines 77-135: LABELS only has `en/hi/mr` entries
- `ModernChatUI.tsx` lines 371-404: Hardcoded Marathi/Hindi option patterns for clarification parsing

### Bug 4: `formatAIResponse` strips markdown then re-renders as plain text

On reload, messages go through `formatAIResponse()` (ModernChatUI line 240) which strips `**bold**`, `## headers`, etc. But during live chat, responses with `orchestratorType = 'CLARIFICATION_QUESTION'` bypass this entirely and render via `ClarificationOptionsUI`. After restart, with `clarificationOptions` lost, the same message falls through to the plain text path with all formatting stripped.

### Bug 5: Server saves TWO copies of each message

The server (`index.ts` line 1243 + 1269) saves both user and assistant messages. The client (`EnhancedAIChatInterface.tsx` line 1565-1594) ALSO calls `chatSyncService.batchSaveMessages()` for the same messages. This creates potential duplicates if both succeed. The comment at line 1501 says "Server already persists messages, so we DON'T save user message here" but the code at 1565 contradicts this by saving to LocalDB.

### Bug 6: Decision Rules with Generic-Only Conditions

From the earlier audit, rules like `SC_MICRO_ZN_DEFICIENCY_URGENT_001` still fire on generic observations. The condition evaluator fix from the previous change should be verified with current data.

---

## Implementation Summary

| Fix | File | Priority | Impact |
|-----|------|----------|--------|
| Save clarification_options to DB | index.ts | P0 | Root cause of formatting loss |
| Reconstruct clarificationOptions in mapMessageFromDB | EnhancedAIChatInterface.tsx | P0 | Completes the fix |
| Extract shared Message type | New shared file | P2 | Code hygiene |
| Remove hardcoded language in WhatHowWhyCard | WhatHowWhyCard.tsx | P2 | Language independence |
| Remove hardcoded language in DecisionBrainCards | DecisionBrainCards.tsx | P2 | Language independence |

The P0 fixes (Fix 1 + Fix 2) will resolve the formatting change bug. Fix 3 is a bonus improvement for richer reload experience.
