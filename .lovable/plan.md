
# Fix: Observation Authority Levels and Terminal Damage Gate Protection

## Problem Statement
The Terminal Damage Gate fires on **inferred/expanded symbols** (alias expansion, cross-crop injection, legacy induction) instead of only farmer-confirmed evidence. This causes the entire decision brain to shift into emergency DIAGNOSIS_ONLY mode based on synthetic codes like `PLANT_DEATH` that were never explicitly reported by the farmer.

**Example failure**: Farmer selects "Early shoot borer" (obs_key: `DEAD_HEART_PRESENT`) -> alias expansion adds `PLANT_DEATH` -> Terminal Damage Gate fires -> DIAGNOSIS_ONLY mode activates -> all downstream reasoning shifts to emergency mode.

---

## Root Causes

1. **No epistemic separation**: All observation sources (farmer-confirmed, alias-expanded, cross-crop injected, LLM-inferred) are merged into one flat `Set<string>` (`allObservationsForPreAuth`) with no source tracking
2. **Terminal Damage Gate operates on merged set**: `detectCropDamageForDiagnosis()` receives the full merged set including synthetic codes
3. **Cross-crop mapper injects terminal indicators**: `PLANT_DEATH`, `SEEDLING_DEATH` from pattern matching on farmer text get injected directly
4. **Clarification selection path runs full expansion**: When farmer selects a clarification option, `obsKeyExpansion` can add terminal codes like `DEAD_HEART` which then flow into expanded set
5. **Inconsistent symbol handling**: Pipeline sometimes expands aggressively (18 codes), sometimes collapses to single symbol (HARD GATE), creating unstable rule matching

---

## Solution Architecture

### Layer A: Observation Authority Metadata

Create a typed observation wrapper that tracks the source and authority level of each symbol.

```text
ObservationWithAuthority {
  code: string            // e.g., "DEAD_HEART_PRESENT"
  authority: CONFIRMED | EXTRACTED | INFERRED | SYNTHETIC
  source: string          // e.g., "CLARIFICATION_SELECTION", "ALIAS_EXPANSION"
}
```

Authority hierarchy:
- **CONFIRMED**: Clarification selection, explicit farmer statement, photo-verified
- **EXTRACTED**: Pattern match from farmer's raw text (induction layer, cross-crop mapper on raw text)
- **INFERRED**: Alias expansion, LLM semantic extraction, intent-to-observation mapping
- **SYNTHETIC**: Cross-crop injection, obsKeyExpansion, router fallback injection

### Layer B: Terminal Damage Gate Filter

The Terminal Damage Gate (`detectCropDamageForDiagnosis` and `detectTerminalDamageForAuthority`) must only check symbols with authority `CONFIRMED` or `EXTRACTED`.

### Layer C: Cross-Crop Injection Guard

The cross-crop symptom mapper must never inject terminal-level symbols (`PLANT_DEATH`, `SEEDLING_DEATH`, `GERMINATION_FAILURE`, `CROP_FAILURE`) into the authority set. These codes are tagged `SYNTHETIC` and excluded from terminal gate evaluation.

### Layer D: Clarification Selection Isolation

When a clarification option is selected, disable alias expansion and legacy induction. Use only the selected observation key with controlled (not recursive) expansion.

---

## Technical Implementation

### File 1: NEW `supabase/functions/ai-agriculture-chat/utils/observation-authority.ts`

Create the observation authority system:

- `ObservationAuthority` enum: `CONFIRMED`, `EXTRACTED`, `INFERRED`, `SYNTHETIC`
- `AuthoredObservation` interface: `{ code: string; authority: ObservationAuthority; source: string }`
- `AuthoredObservationSet` class:
  - `add(code, authority, source)` -- stores highest authority if duplicate
  - `getConfirmedCodes(): string[]` -- returns only CONFIRMED codes
  - `getConfirmedAndExtractedCodes(): string[]` -- returns CONFIRMED + EXTRACTED
  - `getAllCodes(): string[]` -- returns all codes (for rule evaluation)
  - `getCodesForTerminalGate(): string[]` -- returns only CONFIRMED codes
  - `toFlatSet(): Set<string>` -- backward-compatible flat set for rule engine

### File 2: MODIFY `supabase/functions/ai-agriculture-chat/decision/diagnosis-only-mode.ts`

- Add new function `detectCropDamageWithAuthority(authoredObservations: AuthoredObservationSet, crossCropSymptoms?: string[])`
- This function filters to only CONFIRMED + EXTRACTED observations before checking terminal indicators
- The existing `detectCropDamageForDiagnosis` remains for backward compatibility but logs a deprecation warning

### File 3: MODIFY `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Section 1: Replace flat Set with AuthoredObservationSet (around line 2981)**

Replace `allObservationsForPreAuth = new Set<string>()` with `AuthoredObservationSet`.

Tag each source:
- `observationKeys` from induction: `EXTRACTED`
- `mappedCodes.observation_codes` from LLM semantic extractor: `INFERRED`
- `inductionResult.symptoms` with `source === 'LLM_SEMANTIC_EXTRACTOR'`: `INFERRED`
- `inductionResult.symptoms` with `source === 'LANGUAGE_INDUCTION'`: `EXTRACTED`
- `photoMappedCodes`: `CONFIRMED` (photo-verified)
- Cross-crop symptoms: `SYNTHETIC`
- LLM-intent fallback injections (line 3098-3124): `INFERRED`
- `obsKeyExpansion` entries (line 1581-1614): `INFERRED`

**Section 2: Terminal Gate uses filtered codes (around line 3148)**

Change:
```
detectCropDamageForDiagnosis(allObservationsForPreAuth, crossCropSymptomsList)
```
To call the new authority-aware version that only checks CONFIRMED + EXTRACTED codes for terminal indicators.

Pass the full set to the rule engine (all authority levels participate in rule matching).

**Section 3: Clarification selection path (around line 1440-1620)**

When processing a clarification option selection:
- Tag the embedded observation key as `CONFIRMED`
- Tag `obsKeyExpansion` results as `INFERRED`
- Do NOT run alias expansion or legacy induction on the selected option
- Pass only the CONFIRMED key + controlled expansion to rule evaluation

**Section 4: Cross-crop injection guard (around line 3142)**

Before injecting cross-crop symptoms, filter out terminal indicators:
```
const TERMINAL_CODES_BLOCKED_FROM_INJECTION = new Set([
  'PLANT_DEATH', 'SEEDLING_DEATH', 'GERMINATION_FAILURE', 
  'CROP_FAILURE', 'ESTABLISHMENT_FAILURE'
]);
```
Only inject non-terminal cross-crop codes. Terminal codes require explicit farmer confirmation.

### File 4: MODIFY `supabase/functions/ai-agriculture-chat/agents/cross-crop-symptom-mapper.ts`

No structural changes needed. The guard is applied at injection point in orchestrator.ts, not at the mapper level, to preserve the mapper's role as a pure observation extractor.

### File 5: MODIFY `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts`

- In `mapClarificationSelectionToSymbols`: tag the selected observation as `CONFIRMED`
- Verify merge logic (already fixed) preserves existing symbols

---

## Backward Compatibility

- The flat `Set<string>` interface is preserved via `toFlatSet()` for the rule engine, canonical state builder, and all downstream consumers
- Only the terminal damage gate and diagnosis-only mode activation change behavior
- Rule evaluation continues to use ALL observations (all authority levels)
- The `AuthoredObservationSet` degrades gracefully -- if any consumer needs a plain `Set<string>`, `toFlatSet()` provides it

---

## Expected Behavior After Fix

| Scenario | Before | After |
|---|---|---|
| Farmer selects "Early shoot borer" (DEAD_HEART_PRESENT) | PLANT_DEATH injected via cross-crop -> DIAGNOSIS_ONLY fires | DEAD_HEART_PRESENT is CONFIRMED, PLANT_DEATH is SYNTHETIC -> Terminal gate ignores PLANT_DEATH -> Normal rule evaluation runs |
| Farmer says "my plants are all dead" | PLANT_DEATH from cross-crop mapper on raw text -> DIAGNOSIS_ONLY fires | PLANT_DEATH is EXTRACTED (from raw text pattern match) -> Terminal gate fires correctly |
| Alias expansion adds PLANT_DEATH from LEAF_WILTING | Terminal gate fires incorrectly | PLANT_DEATH is INFERRED -> Terminal gate ignores it |
| Photo shows dead plants | Terminal gate may not fire | PLANT_DEATH is CONFIRMED (photo-verified) -> Terminal gate fires correctly |

---

## Files Modified (Summary)

1. **NEW**: `supabase/functions/ai-agriculture-chat/utils/observation-authority.ts` -- Authority tracking system
2. **MODIFY**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-only-mode.ts` -- Authority-aware terminal detection
3. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` -- Tag observations with authority, filter terminal gate, guard cross-crop injection, isolate clarification path
4. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` -- Tag clarification selections as CONFIRMED
5. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function
