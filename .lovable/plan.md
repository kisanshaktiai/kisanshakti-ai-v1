

# Root Cause: Duplicate Response Display Bug

## The Bug

**File**: `ModernChatUI.tsx`, lines 682-686

When a canonical advisory card exists (`hasCanonicalAdvisory = true`), the UI renders:
1. The `CanonicalAdvisoryCard` (structured card with diagnosis, treatment, safety sections)
2. **AND** the raw `message.content` (plain Marathi LLM narration text) directly below it

```tsx
// Line 682-686 — THIS IS THE BUG
{message.content && message.content.length > 20 && (
  <div className="px-3 pb-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
    {message.content}
  </div>
)}
```

The LLM narration text (the "भाऊ, तुम्हाला साखरेच्या कांड्यात..." block) is always >20 chars, so it always renders — creating the duplicate response the user sees.

## The Fix

**Remove the raw content block** when a canonical advisory card is present. The card already contains all the structured advisory information. The plain text is redundant.

### Change in `ModernChatUI.tsx`

Delete lines 681-686 (the `message.content` block inside the `hasCanonicalAdvisory` branch). The section should only render the `CanonicalAdvisoryCard` and the timestamp — no raw text fallback beneath it.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/chat/ModernChatUI.tsx` | Remove lines 681-686: the `message.content` render block inside the `hasCanonicalAdvisory` conditional branch |

### What This Does NOT Change
- Backend response pipeline (untouched)
- Edge function logic (untouched)
- Other response renderers (DecisionBrainCards, ColorCodedCard, etc.)

