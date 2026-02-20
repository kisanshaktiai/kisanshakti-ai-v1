

# Symbolic Decision Brain Stabilization v4.0 (Refined)

## Summary of Changes from Previous Plan

Three critical architectural refinements have been added based on expert review. These elevate the system from "good" to "world-class" by ensuring no silent skips, no inflated coverage, and no per-request DB overhead.

---

## ISSUE 1: Arbitration Crash (`cropCode is not defined`) -- P0

**File**: `orchestrator.ts` line 4733
**Root Cause**: `cropCode` is block-scoped to a different `try` block (line 3374-3538). At line 4733 (Phase 2.5.5), it does not exist in scope.
**Fix**: Replace `cropCode` with `canonicalContext?.crop_code`.

**REFINEMENT 2 APPLIED**: Instead of `console.warn` + skip, throw a hard error:

```text
const hypothesisCrop = canonicalContext?.crop_code;
if (!hypothesisCrop || hypothesisCrop === 'UNKNOWN') {
  throw new Error('FATAL_CANONICAL_CONTEXT_CORRUPTION: crop_code missing or UNKNOWN before hypothesis arbitration');
}
// Then use crop_group: hypothesisCrop
```

Rationale: Skipping arbitration silently creates reasoning gaps and confidence inconsistencies. World-class engines fail explicitly. The outer orchestrator catch block will handle this as a proper symbolic failure, not a silent degradation.

---

## ISSUE 2: Crop Lock Leak via Induction Layer -- P1

**File**: `orchestrator.ts` lines 4541-4544
**Root Cause**: When `canonicalContext.is_locked === true`, induction crop can still override `canonicalState.crop_type`.
**Fix**: Guard with `canonicalContext.is_locked` check:

```text
if (canonicalContext && canonicalContext.is_locked) {
  console.log(`   Crop locked from canonical context (${canonicalContext.crop_code}) -- ignoring induction crop: ${inductionCrop}`);
  canonicalState.crop_type = canonicalContext.crop_code as any;
} else if (inductionCrop !== 'UNKNOWN_CROP') {
  console.log(`   Enriching canonical state crop from induction: ${inductionCrop}`);
  canonicalState.crop_type = inductionCrop as any;
}
```

---

## ISSUE 3: Demote Induction Bypass Log -- P1

**File**: `orchestrator.ts` line 4043
**Fix**: Replace `INDUCTION BYPASS ACTIVE` with enrichment-only log:

```text
console.log(`   Induction enrichment: ${inductionResult.symptoms.length} supplementary symbols (coverage=${(inductionResult.symbol_coverage * 100).toFixed(0)}%)`);
```

The `inductionBasedBypass` variable continues to function but the log no longer implies routing authority.

---

## ISSUE 4: Intent Lock Cannot Downgrade High-Confidence Intent -- P1

**File**: `orchestrator.ts` after line 2253, and `intent-lock.ts`

Current `lockIntent()` at line 3952 blindly locks whatever intent is passed. If downstream logic overwrites `intentCode` to `UNKNOWN` after the LLM returned >= 0.65 confidence, the system loses valid classification.

**Fix Part A** -- Confidence tiering (after line 2253):

```text
const intentTier = intentConf >= 0.65 ? 'HIGH' : intentConf >= 0.35 ? 'TENTATIVE' : 'LOW';
console.log(`   [IntentTier] ${intentTier} confidence (${(intentConf * 100).toFixed(0)}%) - intent: ${intentCode}`);
```

**Fix Part B** -- Hard override guard (enforce, not just log):

```text
// Before any downstream UNKNOWN promotion/override:
if (intentTier === 'HIGH' && (newIntent === 'UNKNOWN' || newIntent === 'UNKNOWN_OBSERVATION')) {
  console.log(`   BLOCKED: Cannot overwrite HIGH-confidence intent ${intentCode} with ${newIntent}`);
  // Keep original intentCode
} else {
  intentCode = newIntent;
}
```

**Fix Part C** -- Modify UNKNOWN-to-REPORT_SYMPTOM promotion to respect tiers:

```text
if ((intentCode === 'UNKNOWN' || intentCode === 'UNKNOWN_OBSERVATION') &&
    allObservationsForPreAuth.size >= 2 && intentConf >= 0.35) {
  intentCode = 'REPORT_SYMPTOM';
}
```

This ensures `lockIntent()` at line 3952 receives the correct, non-downgraded intent.

---

## ISSUE 5: Authority-Based Coverage Calculation -- P1

**File**: `orchestrator.ts` around line 2346

**REFINEMENT 1 (from expert review) APPLIED**: The previous plan used string-based `s.source` filtering which is wrong -- `LLM_SEMANTIC_EXTRACTOR` may include INFERRED expansions, and `LANGUAGE_INDUCTION` may include alias expansions. Must use the actual `ObservationAuthority` enum via `AuthoredObservationSet`.

**Fix**: Use `getConfirmedAndExtractedCodes()` from `AuthoredObservationSet` (already exists at line 94 of `observation-authority.ts`):

```text
// Authority-based coverage: use ONLY CONFIRMED + EXTRACTED observations
const authorityBasedCodes = authoredObservations?.getConfirmedAndExtractedCodes() || [];
const evidenceCoverage = authorityBasedCodes.length > 0 
  ? Math.min(1.0, authorityBasedCodes.length / 8) 
  : 0;
console.log(`   Evidence coverage (CONFIRMED+EXTRACTED only): ${(evidenceCoverage * 100).toFixed(0)}% (${authorityBasedCodes.length} codes)`);
```

**REFINEMENT 3 APPLIED**: Coverage gate must actually block diagnosis entry, not just log:

```text
if (evidenceCoverage < 0.25 && !isSymptomFreeRoute && !bypassClarification) {
  console.log(`   [COVERAGE_GATE] Evidence coverage too low (${(evidenceCoverage * 100).toFixed(0)}%) -- blocking diagnosis, forcing clarification`);
  shouldBlockDiagnosis = true;
  // Set flag that will be checked before hypothesis engine and rule evaluation
}
```

Then before Phase 2.5.5 (hypothesis arbitration):

```text
if (shouldBlockDiagnosis) {
  console.log(`   [COVERAGE_GATE] Skipping hypothesis arbitration and rule evaluation -- insufficient evidence`);
  // Trigger clarification path directly
}
```

This makes the gate functional, not observational.

---

## ISSUE 6: Remove Silent Template Fallback -- P1

**File**: `llm-response-formatter.ts` lines 416-418 and 481-483

Before every `buildTemplateFallback` call, add structured `SYMBOLIC_FAILURE` logging:

```text
console.error(`[SYMBOLIC_FAILURE] Falling back to template`);
console.error(`   Gate failed: ${failureReason}`);
console.error(`   Observations present: ${input.decision_output?.matched_responses?.length || 0}`);
console.error(`   Hypotheses evaluated: ${input.decision_output?.hypothesis_result?.eliminated_count || 0}`);
console.error(`   Decision confidence: ${input.decision_output?.primary_decision?.weighted_confidence || 0}`);
console.error(`   Primary rule: ${input.decision_output?.primary_decision?.rule_id || 'NONE'}`);
```

---

## ISSUE 7: LLM Output Validation Against Database -- P0

**File**: NEW `supabase/functions/ai-agriculture-chat/utils/llm-output-validator.ts`

Validates LLM-extracted intents and observations against DB tables with cached lookups (15-min TTL).

**Expert refinement applied**: Add crop-applicability check. Even if an observation exists in `observation_master`, reject it if it does not apply to the current crop. Use `crop_group` from `decision_rules` or `intent_observation_mapping` to validate applicability.

```text
// Crop-applicability validation
// Example: BOLL_DAMAGE exists in observation_master but is invalid for SUGARCANE
const applicableObs = await getCropApplicableObservations(canonicalCrop);
for (const code of observationCodes) {
  if (!applicableObs.has(code)) {
    rejected.push(code);
    reasons.push(`${code} not applicable to crop ${canonicalCrop}`);
  }
}
```

Cache structure:

```text
const validatorCache = new Map<string, { data: Set<string>; loadedAt: number }>();
const VALIDATOR_CACHE_TTL = 900000; // 15 minutes
```

Functions:
- `validateLLMOutputAgainstDB({ intent_code, observation_codes, canonical_crop, supabase })` -- returns `{ valid, rejected_intents, rejected_observations, reason }`
- `loadValidIntentCodes(supabase)` -- cached lookup from `observation_intent_master`
- `loadValidObservationCodes(supabase)` -- cached lookup from `observation_master`
- `loadCropApplicableObservations(supabase, cropCode)` -- cached lookup filtering by crop applicability

Wire into `orchestrator.ts` after semantic extraction.

---

## ISSUE 8: Crop Vocabulary Table for Romanized Input -- Enhancement

**Phase 1: DB Migration**

Create `crop_vocabulary` table + seed sugarcane entries.

**REFINEMENT 1 APPLIED**: Do NOT query Supabase per request. Use in-memory cache with 5-minute TTL:

```text
const vocabCache = new Map<string, { entries: VocabEntry[]; loadedAt: number }>();
const VOCAB_CACHE_TTL = 300000; // 5 minutes

async function getCropVocabulary(cropCode: string, supabase: any): Promise<VocabEntry[]> {
  const cached = vocabCache.get(cropCode);
  if (cached && Date.now() - cached.loadedAt < VOCAB_CACHE_TTL) {
    return cached.entries;
  }
  
  const { data } = await supabase
    .from('crop_vocabulary')
    .select('phrase_pattern, semantic_hint')
    .eq('crop_code', cropCode)
    .eq('is_active', true);
  
  const entries = data || [];
  vocabCache.set(cropCode, { entries, loadedAt: Date.now() });
  return entries;
}
```

Inject into LLM prompt as contextual knowledge block:

```text
CROP-SPECIFIC VOCABULARY (Sugarcane):
- "surali valali" refers to central whorl drying (dead heart symptom)
- "khod pokharla" indicates stem borer damage
- "pandhrya muli" refers to white grub root damage
```

Seed data (10 entries for sugarcane romanized Marathi phrases).

---

## Summary of Expert Refinements Applied

| Refinement | Previous Plan | Refined Plan |
|---|---|---|
| Vocabulary fetching | Per-request Supabase query | In-memory cache with 5-min TTL |
| Arbitration on missing crop | `console.warn` + skip | `throw new Error('FATAL_CANONICAL_CONTEXT_CORRUPTION')` |
| Coverage gate | Log-only warning | Functional gate that blocks diagnosis entry |

Additionally:
- Coverage calculation uses `ObservationAuthority` enum via `getConfirmedAndExtractedCodes()` instead of string-based `s.source` filtering
- LLM output validator includes crop-applicability check (not just existence in `observation_master`)
- Intent tiering includes hard override guard (enforcement, not just logging)

---

## Files Modified (Complete)

1. **DB MIGRATION**: Create `crop_vocabulary` table + seed sugarcane entries
2. **NEW**: `supabase/functions/ai-agriculture-chat/utils/llm-output-validator.ts` -- DB-validated LLM output gate with cached lookups and crop-applicability check
3. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`:
   - Fix `cropCode` crash with `throw` on corruption (Issue 1)
   - Seal crop lock leak (Issue 2)
   - Demote induction bypass log (Issue 3)
   - Intent confidence tiering with hard override guard (Issue 4)
   - Authority-based coverage with functional gate (Issue 5)
   - Wire LLM output validator (Issue 7)
   - Wire crop vocabulary prompt enrichment with cache (Issue 8)
4. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` -- Structured `SYMBOLIC_FAILURE` logging (Issue 6)
5. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function

---

## Pipeline After Fix

```text
1. CanonicalContext lock (crop immutable)
2. LLM semantic extraction (perception layer)
3. LLM output validation (DB-enforced, crop-applicable)
4. Intent confidence tiering (HIGH/TENTATIVE/LOW with hard guard)
5. Observation authority filtering (CONFIRMED + EXTRACTED only)
6. Evidence coverage gate (functional, blocks diagnosis if < 25%)
7. Hypothesis arbitration (deterministic, fails hard on missing crop)
8. Decision rules evaluation (hypothesis-scoped)
9. Response formatting (validated, no silent fallback)
```

## Edge Logs Must NOT Contain (Post-Fix)

- `INDUCTION BYPASS ACTIVE`
- `ReferenceError: cropCode is not defined`
- `Intent LOCKED: UNKNOWN` after >= 65% confidence
- `Decision confidence: 0` unless genuine symbolic failure
- `Template fallback generated` without preceding `[SYMBOLIC_FAILURE]` log

