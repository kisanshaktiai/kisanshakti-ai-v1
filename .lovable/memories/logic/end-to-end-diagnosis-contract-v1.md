# Memory: logic/end-to-end-diagnosis-contract-v1
Updated: 2026-01-15

The AI Chat implements a complete end-to-end contract between backend and frontend for diagnosis-first flow.

## Backend → Frontend Contract (Diagnosis-First)

When crop damage is detected and land context exists, the orchestrator returns:

```typescript
{
  type: 'CLARIFICATION_QUESTION',
  question: {
    question_id: 'diag_first_...',
    text_mr: '...',
    text_hi: '...',
    text_en: '...',
    options: [
      { label: '...', value: '...', observation_key: 'DEAD_HEART_PRESENT', diagnostic_power: 'HIGH' },
      // ... more options
      { label: '📷 फोटो पाठवा', observation_key: 'PHOTO_UPLOAD' }
    ],
    scope: 'DIAGNOSTIC_CONFIRMATION'
  },
  communication: {
    options: [...] // Same options for fallback extraction
  },
  metadata: {
    orchestrator_type: 'CLARIFICATION_QUESTION', // snake_case for frontend
    selectionType: 'SINGLE_CHOICE',
    diagnosisFirstMode: true
  }
}
```

## Frontend Processing

1. `EnhancedAIChatInterface.tsx` detects clarification via `metadata.orchestrator_type === 'CLARIFICATION_QUESTION'`
2. Maps `metadata.options` to `clarificationOptions` preserving `observation_key`
3. `ClarificationOptionsUI.tsx` renders options with proper styling
4. On selection, sends: `"Label text [obs_keys:OBSERVATION_KEY1,KEY2]"`

## Frontend → Backend Contract (Option Selection)

When farmer selects an option, frontend sends:
```
"मातीचे बोगद दिसतात [obs_keys:MUD_TUBES_PRESENT]"
```

Backend parses `[obs_keys:...]` pattern to extract observation keys directly, avoiding label-to-key mapping failures.

## Key Files

- **Backend**: `orchestrator.ts` (lines 2388-2460) - diagnosis-first response generation
- **Backend**: `orchestrator.ts` (lines 1395-1420) - option selection parsing with embedded keys
- **Frontend**: `EnhancedAIChatInterface.tsx` (lines 1490-1640) - clarification detection and selection handler
- **Frontend**: `ClarificationOptionsUI.tsx` - option rendering with observation_key export

## Invariants

1. `metadata.options` MUST contain `observation_key` for each option
2. Frontend MUST preserve and return `observation_key` on selection
3. Backend MUST parse `[obs_keys:...]` before falling back to label mapping
4. Photo option MUST always be present as last option in diagnosis-first
