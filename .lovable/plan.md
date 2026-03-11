

# Audit Plan Fix Verification Report

## Fix Status Summary

| Audit Item | Status | Evidence |
|---|---|---|
| **P0: Safety bypass on immediate return** | **FULLY FIXED** | Lines 6162-6278: PHI, Pollinator, SafetyGuardian all execute before return at line 6293 |
| **P3: EMERGENCY_OBS_CODES dedup** | **FULLY FIXED** | Single module-level constant at line 278, referenced by both return paths (lines 6147, 6863) |
| **P4: Hardcoded cropMap in orchestrator** | **FULLY FIXED** | Orchestrator uses `unifiedNormalizeCropCode` (line 123). No `cropMap` in orchestrator |
| **Dynamic import violation** | **FULLY FIXED** | Static import at line 155: `import { runCausalHypothesisArbitration } from '../decision/causal-hypothesis-engine.ts'` |
| **index.ts hardcoded Marathi fallbacks** | **FULLY FIXED** | `माहिती उपलब्ध नाही` and `कृपया पुन्हा प्रयत्न करा` — zero matches found |
| **ui-response-builder.ts** | **FULLY FIXED** | `MODE_MESSAGES` and `PHOTO_GUIDANCE` are English-only (lines 44-59) |
| **diagnosis-first-generator.ts** | **FULLY FIXED** | `unknownMessages` and `checkLabels` are English-only (lines 588-596) |
| **diagnostic-flow-controller.ts** | **PARTIALLY FIXED** | Runtime values cleaned, but type definitions still have `message_mr`/`message_hi` fields (marked `@deprecated`) — acceptable |
| **pollinator-protection-rules.ts** | **PARTIALLY FIXED** | Runtime values cleaned, type definition still has `block_reason_mr`/`block_reason_hi` (marked `@deprecated`) — acceptable |
| **P1: Hardcoded mr/hi string removal** | **~55% COMPLETE** | See remaining issues below |

---

## Remaining Hardcoded Regional Strings (349 matches across 14 files)

These files were **NOT cleaned** in prior rounds:

### Critical (runtime strings, not just type defs):

| # | File | Issue | Matches |
|---|---|---|---|
| 1 | **`weather-safety-gate.ts`** | Full mr/hi/en blocking messages for rain, wind, heat, cold conditions (lines 357-387). These are runtime-populated, not just types. | ~20 |
| 2 | **`diagnostic-escalation-generator.ts`** | Complete mr/hi/en template dictionaries (lines 63-117) with 15+ strings each for diagnostic escalation UI. | ~40 |
| 3 | **`rule-module-resolver.ts`** | 5 clarification questions with full mr/hi/en text (lines 300-390). Runtime-populated. | ~15 |
| 4 | **`generic-multi-match-detector.ts`** | Differential question text in mr/hi/en (line 267-269). Runtime-populated. | ~5 |
| 5 | **`causal-hypothesis-engine.ts`** | Discriminating question templates in mr/hi (lines 593-594). Runtime-populated. | ~5 |
| 6 | **`index.ts`** | `generateClarificationPrompt()` at line 3138-3142 has mr/hi/en clarification messages. | ~3 |
| 7 | **`decision-graph-bridge.ts`** | `recommendation_text_mr`/`recommendation_text_hi` runtime population (line 191-193). | ~3 |
| 8 | **`clarification-strategy.ts`** | Propagates `question_text_mr`/`question_text_hi` from causal hypothesis engine (lines 381-396). | ~5 |

### Structural only (type definitions — low risk):

| # | File | Issue |
|---|---|---|
| 9 | `rule-module-types.ts` | Type defs with `text_mr`/`text_hi` fields (~10 matches) — structural, not runtime |
| 10 | `hypothesis-types.ts` | Type def with `question_text_mr`/`question_text_hi` (line 104-106) — structural |
| 11 | `phi-enforcement-guardian.ts` | Type def with `block_reason_mr`/`block_reason_hi` (lines 29-30) — marked `@deprecated` |

### Also found: Additional `cropMap` in `type-mappers.ts` (line 173) and `canonical-state-builder.ts` (line 507)
These are separate files from orchestrator and contain full mr/hi crop name mappings. Not covered by P4 fix.

---

## Implementation Plan

### Task 1: Clean 6 files with runtime hardcoded mr/hi strings

**Strategy**: Replace `{ mr: '...', hi: '...', en: '...' }` dictionaries with English-only values. The `forceTranslateResponse()` LLM layer handles localization at runtime.

**Files**:
1. **`weather-safety-gate.ts`** — Replace `block_reason_mr`/`block_reason_hi` with English-only `block_reason` field; keep `block_reason_en` as primary
2. **`diagnostic-escalation-generator.ts`** — Flatten `ESCALATION_TEMPLATES` to English-only; remove mr/hi template blocks entirely
3. **`rule-module-resolver.ts`** — Replace 5 clarification question objects to use English-only `question_text` (populate `question_text_mr`/`question_text_hi` as empty strings for backward compat with type interface)
4. **`generic-multi-match-detector.ts`** — Replace `question_text` dict with English-only value
5. **`causal-hypothesis-engine.ts`** — Replace discriminating question templates with English-only
6. **`index.ts`** — Replace `generateClarificationPrompt()` dictionary with English-only

### Task 2: Clean `cropMap` in 2 remaining files

Replace hardcoded crop mappings in `type-mappers.ts` and `canonical-state-builder.ts` with calls to `unifiedNormalizeCropCode()` or `crop-synonyms-cache.ts`.

### Task 3: Mark remaining type definitions as `@deprecated`

Add `@deprecated` JSDoc to `question_text_mr`/`question_text_hi` fields in `rule-module-types.ts`, `hypothesis-types.ts`, and `clarification-strategy.ts` interfaces. No runtime change needed.

---

## Expected Outcome

After these 3 tasks:
- Hardcoded mr/hi runtime strings drop from ~349 to ~25 (type defs only)
- Language Agnosticism score: 6.5/10 → **9/10**
- All farmer-facing text goes through LLM translation layer
- Tamil, Telugu, Kannada, Gujarati users get fully localized responses

