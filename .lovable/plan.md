
# Fix Plan: AI Chat Options Display Issue for Rural Farmers

## Problem Summary
The AI Chat clarification options are showing technical English metadata like `[obs_keys:ROOT_BLACKENING]` directly to farmers. This breaks the farmer-friendly experience required for rural Indian users.

## Root Causes Identified

### Issue 1: Metadata Embedded in Display Labels
The backend file `diagnosis-first-generator.ts` embeds `[obs_keys:...]` directly into the label text that gets displayed. For example:
- `cause_label: "💧 पाणी ताण [obs_keys:WATER_STRESS_CHECK]"`
- `label: "🐛 सुरुवातीची खोड किडा [obs_keys:DEAD_HEART_PRESENT]"`

### Issue 2: Frontend Displays Raw Labels
The `ClarificationOptionsUI.tsx` component renders `option.label` directly without removing the technical metadata brackets.

### Issue 3: English Technical Terms Leaking
Some options show mixed English/Marathi text like "Red Internal Tissue And White Patches" instead of pure Marathi translations from the database.

## Solution: Two-Part Fix

### Part 1: Frontend - Strip Metadata Before Display
Add a utility function in `ClarificationOptionsUI.tsx` to clean labels before rendering:
- Remove `[obs_keys:...]` patterns
- Keep only the farmer-friendly text
- Apply to all option labels displayed in the UI

### Part 2: Backend - Use Separate Display vs Backend Labels
Update `diagnosis-first-generator.ts` to:
- Keep `observation_key` as a separate field (already exists)
- Remove embedded metadata from `label` field
- Let frontend handle the metadata separately

## Files to Modify

### 1. `src/components/chat/ClarificationOptionsUI.tsx`
Add label cleaning function that strips `[obs_keys:...]` before display:

```text
// Before: option.label displayed directly
// After: cleanOptionLabel(option.label) displayed
```

Changes:
- Add `cleanOptionLabel()` utility at top of file
- Apply to labels in `SingleChoiceOption` component (line 223)
- Apply to labels in `MultiChoiceOption` component (line 305)

### 2. `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`
Separate display labels from backend metadata:

```text
// Current (broken):
label: `${displayLabel} [obs_keys:${d.observation_key}]`

// Fixed approach:
label: displayLabel  // Clean farmer-friendly label
// observation_key field already carries the key separately
```

Changes:
- Line 770: Remove embedded `[obs_keys:]` from `embeddedLabel`
- Line 787: Remove embedded `[obs_keys:]` from photo option label
- Lines 646, 658, 670: Remove embedded metadata from fallback labels

### 3. `src/components/chat/EnhancedAIChatInterface.tsx`
Ensure option selection still works by using `observation_key` field:

```text
// When farmer clicks option, construct backend message using:
// `${cleanLabel} [obs_keys:${option.observation_key}]`
```

This keeps the backend parsing working while showing clean labels to farmers.

## Technical Details

### Label Cleaning Function
```text
function cleanOptionLabel(label: string): string {
  if (!label) return '';
  return label
    .replace(/\s*\[obs_keys:[^\]]+\]/gi, '')  // Remove [obs_keys:...]
    .replace(/\s+/g, ' ')                      // Normalize whitespace
    .trim();
}
```

### Data Flow After Fix
```text
Backend → sends option.label (clean) + option.observation_key (for routing)
Frontend → displays cleanOptionLabel(option.label)
On Click → constructs message with observation_key for backend parsing
```

## Testing Checklist
- Verify options display clean Marathi/Hindi labels without brackets
- Verify option selection still triggers correct backend routing
- Verify photo option works correctly
- Test with multiple languages (mr, hi, en)

## Expected Outcome
Farmers will see clean, readable options in their language:
- "🐛 वाळवी" instead of "🐛 वाळवी [obs_keys:ROOT_BLACKENING]"
- "📷 फोटो पाठवा" instead of "📷 फोटो पाठवा [obs_keys:PHOTO_UPLOAD]"
