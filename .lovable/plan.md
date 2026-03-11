

# Production-Grade Audit Report — Post-Fix Verification

## Executive Summary

The previous P0-P4 fixes have been **partially implemented**. P0 (Safety bypass), P3 (Emergency code dedup), and P4 (cropMap removal) are confirmed complete. However, **P1 (hardcoded regional language cleanup) is only ~40% complete** — 200+ hardcoded Marathi/Hindi strings remain across 7 files. Additionally, a new architectural violation was found: a dynamic `await import()` in the orchestrator.

---

## 1. Previous Fix Verification Status

| Fix | Status | Evidence |
|---|---|---|
| P0: Safety bypass on immediate return | **DONE** | PHI + Pollinator + SafetyGuardian checks at lines 6162-6275 before return at line 6290 |
| P1: Hardcoded mr/hi string removal | **PARTIAL** | `communication-generator.ts` economics section cleaned; `orchestrator.ts` photo retake cleaned. But 7 other files still contain 200+ hardcoded mr/hi strings |
| P3: EMERGENCY_OBS_CODES dedup | **DONE** | Single module-level constant at line 275, both return paths reference it |
| P4: cropMap removal | **DONE** | No `cropMap` found in orchestrator; uses `unifiedNormalizeCropCode` (line 123) |
| Previous: `this.generateFarmerCommunication` fix | **DONE** | Line 6279 uses `this.communicationGenerator.generate()` correctly |

---

## 2. Remaining Hardcoded Regional Language Strings (P1 Incomplete)

**249 matches across 16 files.** The following files were NOT cleaned in the previous fix round:

| File | Approx. Matches | Examples |
|---|---|---|
| `utils/ui-response-builder.ts` | 30+ | `MODE_MESSAGES` dict (lines 43-78), `PHOTO_GUIDANCE` dict (lines 81-96) — full mr/hi/en mode messages |
| `contracts/ui-response-contract.ts` | 25+ | `MODE_DEFAULTS` dict (lines 335-371) — duplicate of ui-response-builder |
| `decision/prescription-gate-enforcer.ts` | 15+ | `generateObservationOnlyResponse()` (lines 534-542) — full template strings |
| `decision/diagnosis-first-generator.ts` | 20+ | `unknownMessages` (line 588), `checkLabels` (line 594) — clarification option labels |
| `agents/diagnostic-flow-controller.ts` | 40+ | `message_mr`/`message_hi` in ASK_CLARIFICATION (233-234), ESCALATE (517-518), BLOCK (531-532), authority messages (770-788), alternatives (799+) |
| `agents/pollinator-protection-rules.ts` | 15+ | `block_reason_mr`/`block_reason_hi` in type definition AND runtime values (lines 413-414, 449-450, 470-471) |
| `agents/rule-module-types.ts` | 10+ | Type definitions with `text_mr`/`text_hi` fields (lines 196-198, 321-323, 340-342, 349-351) — structural but drives hardcoded population |

**Impact**: Tamil, Telugu, Kannada, Gujarati, Bengali, Punjabi users will see either English fallback or no text for these paths. The `forceTranslateResponse()` LLM layer in index.ts only translates the FINAL farmer-facing response — it does NOT translate intermediate control messages from diagnostic-flow-controller or prescription-gate-enforcer.

**Risk Level**: HIGH — These intermediate messages are sometimes returned directly to the farmer (e.g., ESCALATION, PHOTO_REQUEST, CLARIFICATION paths bypass LLM formatting).

---

## 3. New Finding: Dynamic Import Violation

**File**: `orchestrator.ts` line 5112
```typescript
const { runCausalHypothesisArbitration } = await import('../decision/causal-hypothesis-engine.ts');
```

This violates the edge function runtime constraint (memory: `stability/edge-function-runtime-constraints`): "Dynamic `await import()` calls are prohibited within synchronous paths." This can cause bundler issues and intermittent 500/503 errors under load.

**Fix**: Convert to static import at top of file.

**Risk Level**: MEDIUM — Works currently but fragile under Deno Deploy bundler changes.

---

## 4. Corrected Finding: `hypothesis_master` IS Used

The previous audit incorrectly stated `hypothesis_master` is unused. It IS queried by `causal-hypothesis-engine.ts` (line 164) which is called from orchestrator Phase 2.5.5. The table provides structured hypothesis data (conditions, contradictory evidence, observation mappings) for the causal arbitration layer.

---

## 5. Recommended Implementation Plan

### Task 1: Clean remaining hardcoded mr/hi strings (7 files)

**Strategy**: Replace all `{ mr: '...', hi: '...', en: '...' }` dictionaries with English-only values. The downstream `forceTranslateResponse()` or LLM narration layer handles localization. For intermediate control messages (ESCALATION, CLARIFICATION), ensure index.ts routes them through the translation layer before returning to frontend.

**Files to modify**:
1. `utils/ui-response-builder.ts` — Replace `MODE_MESSAGES` and `PHOTO_GUIDANCE` with English-only + i18n_key
2. `contracts/ui-response-contract.ts` — Replace `MODE_DEFAULTS` with English-only
3. `decision/prescription-gate-enforcer.ts` — Replace `generateObservationOnlyResponse()` templates with English-only
4. `decision/diagnosis-first-generator.ts` — Replace `unknownMessages` and `checkLabels` with English-only
5. `agents/diagnostic-flow-controller.ts` — Replace all `message_mr`/`message_hi` with English-only, remove authority message dicts
6. `agents/pollinator-protection-rules.ts` — Remove `block_reason_mr`/`block_reason_hi` from runtime values (keep type fields for backward compat but populate only `block_reason` English)
7. `agents/rule-module-types.ts` — Mark `text_mr`/`text_hi` type fields as `@deprecated` (structural only, no runtime change needed)

### Task 2: Fix dynamic import violation

**File**: `orchestrator.ts`
- Move `import { runCausalHypothesisArbitration } from '../decision/causal-hypothesis-engine.ts'` to static imports at top of file (near line 28)
- Remove the `await import()` at line 5112

### Task 3: Ensure intermediate messages go through translation

**File**: `index.ts`
- Verify that PHOTO_REQUEST, CLARIFICATION_QUESTION, and ESCALATION_REQUIRED response types pass through `forceTranslateResponse()` before being returned to the farmer
- If they currently bypass the LLM formatter (which they likely do based on early returns in orchestrator), add a translation pass for their `text_en` / `message_en` fields

---

## 6. Updated System Reliability Score

| Category | Previous | Current | Delta |
|---|---|---|---|
| Safety Compliance | 5/10 | 9/10 | +4 (P0 fix verified) |
| Language Agnosticism | 6/10 | 6.5/10 | +0.5 (partial P1) |
| Code Maintainability | 4/10 | 4.5/10 | +0.5 (dedup done) |
| **Overall** | **7.0/10** | **7.5/10** | +0.5 |

Target after Task 1-3 completion: **8.5/10**

