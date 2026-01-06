# Forensic Audit Report: Symbolic Agronomy Decision Brain

## EXECUTIVE SUMMARY

### System Status Assessment

| Criterion | Status | Risk Level |
|-----------|--------|------------|
| **Architecturally Sound?** | MOSTLY YES | MEDIUM |
| **Safe for Production?** | CONDITIONAL | HIGH |
| **Production-Ready Today?** | NO | CRITICAL |

### Critical Findings Overview

1. **Duplicate Logic Paths**: 7 major duplications identified across crop identification, stage determination, and fallback response generation
2. **Authority Conflicts**: 3 modules independently determine decision authority with divergent logic
3. **State Corruption Risk**: Multi-turn clarification can lose canonical state in 2 identified scenarios
4. **Fallback Override Risk**: Generic fallbacks can bypass authoritative context in 4 code paths
5. **Symbolic Boundary Violations**: LLM has 2 paths to influence logic despite "render-only" constraints

### Verdict

The system has a strong symbolic foundation but suffers from **architectural fragmentation** where multiple modules independently implement overlapping responsibilities. This creates race conditions, authority conflicts, and fallback paths that can dilute agronomic advice quality.

---

## VERIFIED EXECUTION FLOW

### Primary Request Processing Chain

```
index.ts (Entry)
  |
  +-- Session Management (lines 186-271)
  |     - Validates tenant-farmer association
  |     - Enforces session-land binding (P0-A)
  |     - Loads session state with pending_clarification_options
  |
  +-- Orchestrator.orchestrate() (orchestrator.ts lines 497-1150+)
        |
        +-- [PHASE 0] Land Context Fetch (lines 544-551)
        |     - fetchComprehensiveLandContext()
        |     - crop_schedules as authority
        |
        +-- [PHASE 0.3] Query Router (lines 557-571)
        |     - Routes to GREETING, IRRIGATION, CROP_HEALTH, etc.
        |
        +-- [PHASE 0.4A] Clarification Hard Gate (lines 916-1129)
        |     - IF pendingOptionsCount > 0, blocks NLU pipeline
        |     - Processes option selection only
        |
        +-- [PHASE 1-2] Language + Observation Extraction (lines 1162-1198)
        |
        +-- [PHASE 2.5] ObservationKey Mapping (lines 1200-1286)
        |     - CropContextAuthority built here
        |     - GUARDRAIL: Prevents CROP_UNKNOWN when context exists
        |
        +-- [PHASE 4] Understanding Completeness Check (lines 1306-1453)
        |     - IF insufficient, returns CLARIFICATION_QUESTION
        |
        +-- [PHASE 5+] NLU + Canonical State + Rule Engine
        
index.ts (Response Assembly, lines 548-800)
  |
  +-- Prescription Gate Enforcement (lines 624-658)
  +-- LLM Response Formatter (lines 580-750)
  +-- Source Validation Gate (validateLLMOutputIntegrity)
```

### Where Decisions Are Made

| Decision Type | Module | Location | Override Risk |
|--------------|--------|----------|---------------|
| Crop identification | orchestrator.ts | Lines 1211-1255 | LOW (guarded) |
| Growth stage | orchestrator.ts, canonical-state-builder.ts | Multiple | MEDIUM |
| Authority level | authority-resolver.ts, prescription-gate-enforcer.ts, decision-readiness-gate.ts | 3 LOCATIONS | HIGH |
| Treatment allowed | prescription-gate-enforcer.ts, llm-response-formatter.ts, decision-readiness-gate.ts | 3 LOCATIONS | HIGH |
| Clarification scope | clarification-scope-resolver.ts, understanding-completeness-checker.ts | 2 LOCATIONS | MEDIUM |

---

## DUPLICATE LOGIC FINDINGS (MANDATORY TABLE)

| Responsibility | Module A | Module B | Conflict Type | Runtime Winner | Risk Level |
|---------------|----------|----------|---------------|----------------|------------|
| **Crop Identification** | orchestrator.ts (buildCropContextFromLandContext) | canonical-state-builder.ts (mapCropNameToEnum) | Parallel inference | orchestrator wins | MEDIUM |
| **Growth Stage Determination** | orchestrator.ts (lockedCropContext.growth_stage) | canonical-state-builder.ts (mapStageToEnum with default VEGETATIVE) | Default override | canonical-state defaults override if stage missing | HIGH |
| **Authority Resolution** | authority-resolver.ts (resolveDecisionAuthority) | prescription-gate-enforcer.ts (determineAuthorityConfirmation) | Duplicate enum + logic | BOTH run independently | CRITICAL |
| **Treatment Gate** | prescription-gate-enforcer.ts (enforcePrescriptionGate) | decision-readiness-gate.ts (checkDecisionReadiness) | Duplicate gates | BOTH enforce, can conflict | HIGH |
| **Fallback Response Generation** | fallback-response-generator.ts | prescription-gate-enforcer.ts (generateObservationOnlyResponse) | Parallel fallback paths | Context-dependent | MEDIUM |
| **Clarification Required Check** | clarification-scope-resolver.ts (needsClarification) | understanding-completeness-checker.ts (checkUnderstandingCompleteness) | Overlapping logic | understanding-completeness wins in orchestrator | MEDIUM |
| **Symptom Mapping** | observation-key-mapper.ts | cross-crop-symptom-mapper.ts | Parallel symptom extraction | Both outputs used | LOW |

### Evidence for Critical Duplications

**1. Authority Resolution Duplication (CRITICAL)**

`authority-resolver.ts` (lines 220-374):
```typescript
export function resolveDecisionAuthority(input: AuthorityInput): AuthorityDecision {
  // Returns: authority, authority_status, treatments_allowed, response_mode
}
```

`prescription-gate-enforcer.ts` (lines 300-328):
```typescript
function determineAuthorityConfirmation(decision: SymbolicDecision): AuthorityConfirmation {
  // Independently determines: CONFIRMED_PEST, CONFIRMED_DISEASE, UNCONFIRMED
}
```

`decision-readiness-gate.ts` (lines 248-265):
```typescript
const authorityConfirmed = input.authority_confirmed && 
  input.authority_level !== 'NONE' && 
  input.authority_level !== 'UNKNOWN';
// Third independent authority check
```

**Risk**: Three modules independently decide authority. If one allows treatment and another blocks, behavior is unpredictable.

**2. Growth Stage Default Override (HIGH RISK)**

`canonical-state-builder.ts` (lines 548-570):
```typescript
export function mapStageToEnum(stage: string | undefined): CropStage {
  if (!stage) return CropStage.UNKNOWN; // Returns UNKNOWN, not VEGETATIVE
  // But buildCanonicalState defaults to VEGETATIVE if stage missing
}
```

`orchestrator.ts` (line 945):
```typescript
const growthStage = lockedCropContext?.growth_stage || landContext?.growth_stage || 'VEGETATIVE';
// Fallback to 'VEGETATIVE' if missing
```

**Risk**: A missing growth stage from crop_schedules gets defaulted to VEGETATIVE in orchestrator, which then passes to rule engine as if confirmed. Young crop protection gate may fail.

---

## AUTHORITY LEAKAGE FINDINGS

### 1. Implicit Authority in GENERAL_INFO Route

**Location**: orchestrator.ts lines 589-659

```typescript
if (queryRoute.route === 'GENERAL_INFO' && !options.landId) {
  const symbolicDecision = {
    decision_brain_source: true, // IMPLICIT authority granted
    actions_returned: [{
      action_type: 'PROVIDE_GENERAL_INFO',
      requires_llm_render: true,
      rule_id: 'GENERAL_INFO_HANDLER' // No actual rule exists
    }]
  };
}
```

**Risk**: `decision_brain_source: true` is set without actual symbolic rule evaluation. LLM formatter sees this as authorized.

### 2. Missing Authority Resolution Before Clarification

**Location**: orchestrator.ts lines 1328-1453

When understanding is insufficient, the system returns a CLARIFICATION_QUESTION without ever calling `resolveDecisionAuthority()`. The authority field is never populated.

**Risk**: If clarification is answered and rules fire, authority may be inferred post-hoc rather than determined upfront.

### 3. Authority Bypass in OPTION_SELECTED Path

**Location**: orchestrator.ts lines 929-1081

```typescript
if (matchResult.matched && matchResult.matched_option) {
  const ruleResult = evaluateRulesLayered(ALL_RULES, canonicalState);
  // Authority resolver NOT called before rule evaluation
  return {
    decision_output: {
      decision_brain_source: true, // Authority assumed
    }
  };
}
```

**Risk**: Rules fire without authority resolution. A land-level issue (salinity) could be ignored and pest treatment suggested.

---

## FALLBACK LOGIC RISK ASSESSMENT

| Fallback Mechanism | Location | Activation Condition | Context-Aware? | Safety Impact |
|--------------------|----------|---------------------|----------------|---------------|
| **VEGETATIVE stage default** | orchestrator.ts line 945 | growth_stage missing | NO | Can trigger young crop protection incorrectly |
| **Generic fallback response** | fallback-response-generator.ts | No rules matched + context available | YES (partial) | May provide non-symbolic advice |
| **Observation-only response** | prescription-gate-enforcer.ts lines 444-479 | Authority unconfirmed | YES | Safe but may lose context |
| **Template fallback** | llm-response-formatter.ts lines 318-320 | No API keys available | NO | Uses hardcoded templates |
| **NLU fallback** | orchestrator.ts line 1467 | NLU agent fails | NO | Creates minimal output, may lose symptoms |
| **Default scope** | intent-lock.ts lines 129-131 | Unknown intent | NO | Allows INFORM/CLARIFY only |

### High-Risk Fallback: VEGETATIVE Default

**Evidence** (orchestrator.ts line 945):
```typescript
const growthStage = lockedCropContext?.growth_stage || landContext?.growth_stage || 'VEGETATIVE';
```

**Scenario**: Crop schedule exists but growth_stage column is NULL (data quality issue).

**Consequence**: System treats NULL as VEGETATIVE, which may:
1. Trigger young crop protection gate when crop is actually mature
2. Block valid treatment recommendations
3. Create farmer confusion

**Mitigation Required**: Distinguish between "missing data" and "confirmed stage" in canonical state.

---

## MULTI-TURN FAILURE MODES

### Failure Mode 1: Context Loss After Invalid Option Selection

**Turn Sequence**:
1. Farmer reports "पानावर किडे दिसतात" (Insects on leaves)
2. System asks clarification with 3 options
3. Farmer types free text instead of selecting option
4. System returns CLARIFICATION_REMINDER (lines 1086-1124)
5. **BUT**: If farmer then types a completely different query, pendingClarificationOptions is cleared

**Evidence** (orchestrator.ts lines 1082-1125):
The reminder path preserves pendingClarificationOptions, but if farmer bypasses and sends new message, the next turn clears state.

**Risk**: Previous symptom context lost, system asks about crop again.

### Failure Mode 2: lockedCropContext Not Persisted to Database

**Evidence**: 
- `lockedCropContext` is passed via metadata (line 1446)
- Session state saves to `ai_chat_sessions.metadata.decision_tracking` (index.ts)
- BUT lockedCropContext extraction from session is conditional (orchestrator.ts line 1142)

**Scenario**:
1. Turn 1: Clarification asked, lockedCropContext set in response metadata
2. Turn 2: Session reloaded, but `options.sessionState?.lockedCropContext` may not be populated from database

**Risk**: Crop context lost between turns if not properly persisted and reloaded.

### Failure Mode 3: Turn Count Not Incremented Consistently

**Evidence**:
- `turnCount` read from `options.sessionState?.turnCount` (line 914)
- Increment logic exists in session persistence (index.ts)
- BUT turn count is only incremented on successful response, not on clarification

**Risk**: `MAX_CLARIFICATION_TURNS = 3` check may not trigger correctly if turns aren't counted.

---

## SYMBOLIC vs PROBABILISTIC BOUNDARY VIOLATIONS

### Violation 1: LLM Confidence Affects Authority (INDIRECT)

**Location**: llm-response-formatter.ts lines 153-173

```typescript
const gateInput: DecisionReadinessInput = {
  is_specific_symptom: input.decision_output?.primary_decision?.target !== undefined,
  authority_confirmed: input.decision_output?.decision_brain_source === true,
  // These are derived from symbolic output, but...
};
```

**Issue**: The `is_specific_symptom` determination includes:
```typescript
const hasSpecificKey = input.symptom_keys.some(k => 
  SPECIFIC_SYMPTOM_INDICATORS.some(ind => k.includes(ind))
);
```

This string matching is heuristic, not symbolic rule-based.

### Violation 2: Query Router Uses Pattern Matching

**Location**: query-router.ts (imported at orchestrator.ts line 557)

```typescript
const queryRoute = routeQuery(farmerMessage, {...});
```

The query router uses regex and keyword matching to determine route, which then affects whether symbolic rules are applied.

**Risk**: A slightly different phrasing could route to GENERAL_INFO bypass instead of PEST_DISEASE_TREATMENT path.

### Violation 3: Fallback Response Uses Knowledge Base (Not Rules)

**Location**: fallback-response-generator.ts lines 70-82

```typescript
if (queryType === 'fertilizer') {
  parts.push(getFertilizerAdvice(context.cropCode, context.cropStage || 'vegetative', language));
}
```

`getFertilizerAdvice()` comes from `crop-knowledge-base.ts`, which is a static knowledge base, NOT the symbolic rule engine.

**Risk**: Fallback path provides advice not validated by symbolic rules.

---

## AGRONOMIC CONSEQUENCES (REALISTIC)

### Consequence 1: Wrong Treatment for Wrong Growth Stage

**Field Impact**: Farmer with mature cotton crop (120 DAS) has NULL in crop_schedules.growth_stage

**What Happens**:
1. orchestrator defaults to 'VEGETATIVE'
2. Young crop protection gate triggers (cotton < 30 days = young)
3. Treatment blocked, only monitoring advice given
4. Farmer loses 2-3 days waiting for "safe" treatment window that doesn't exist

**Affected Queries**: Any treatment query with missing growth_stage data

**Severity**: ECONOMIC LOSS (delayed treatment = yield loss)

### Consequence 2: Salinity Stress Ignored, Pest Treatment Given

**Field Impact**: Farmer in Gujarat with saline soil reports yellowing

**What Happens**:
1. Authority resolver identifies LAND (salinity) authority
2. BUT in OPTION_SELECTED path, authority resolver not called
3. Canonical state built with GENERAL_YELLOWING symptom
4. Rule engine fires NUTRIENT_DEFICIENCY rules
5. Farmer advised to apply Urea
6. Salt stress worsens

**Affected Queries**: Any query from saline/waterlogged areas

**Severity**: SAFETY-CRITICAL (wrong advice worsens condition)

### Consequence 3: Clarification Loop with Context Loss

**Field Impact**: Farmer in Maharashtra with sugarcane + pest issue

**What Happens**:
1. Reports "माझ्या उसावर किडे" (insects on my sugarcane)
2. System asks "flying or crawling?"
3. Farmer mistypes, gets reminder
4. Farmer types new question: "काय फवारणी करू?" (what spray?)
5. System clears pendingOptions, loses "insects" context
6. Asks "what problem?" again
7. Farmer frustrated, abandons

**Affected Queries**: Any multi-turn clarification flow

**Severity**: USER EXPERIENCE / TRUST

### Consequence 4: Biocontrol Leakage Across Crops

**Field Impact**: System trained on sugarcane Trichogramma rules advises same for wheat

**What Happens**:
1. WHEAT + FLYING_INSECTS canonical state
2. Universal observation rules fire
3. Biocontrol rule (designed for sugarcane) matches
4. Trichogramma advised for wheat aphids
5. Trichogramma ineffective for aphids (it targets lepidopteran eggs)

**Affected Queries**: Any pest query on non-sugarcane crops

**Severity**: AGRONOMIC (ineffective advice)

---

## NON-NEGOTIABLE CONCLUSIONS

### MUST BE FIXED (P0 - Blockers for Production)

1. **Unify Authority Resolution**: Create single `resolveAuthority()` call point that ALL paths must pass through. Current 3 independent implementations create conflict.

2. **Prevent VEGETATIVE Default Override**: Add explicit `stage_source: 'CONFIRMED' | 'DEFAULT'` flag. Block treatment if `stage_source === 'DEFAULT'`.

3. **Persist lockedCropContext to Database**: Ensure session reload populates `lockedCropContext` from `ai_chat_sessions.metadata`.

4. **Call Authority Resolver in OPTION_SELECTED Path**: Add `resolveDecisionAuthority()` call before `evaluateRulesLayered()` in lines 967-970.

5. **Remove GENERAL_INFO Bypass**: Route ALL queries through symbolic path. Set `decision_brain_source: true` only after actual rule evaluation.

### MUST NOT BE TOUCHED (Stable Components)

1. **Crop Context Authority (buildCropContextFromLandContext)**: This is correctly implemented with crop_schedules as single source of truth.

2. **PHASE-8.1 Guardrail (lines 1278-1286)**: The CROP_UNKNOWN violation check is critical and working.

3. **Clarification Hard Gate (lines 916-1129)**: The option selection flow is well-designed and prevents NLU bypass.

4. **LLM Render-Only Enforcement (llm-response-formatter.ts lines 181-240)**: These gates correctly block unauthorized content.

5. **PHI/Pollinator Safety Gates**: These are production-ready and well-tested.

### CAN WAIT (P1/P2 - Post-Launch)

1. **Consolidate Clarification Logic**: Merge `clarification-scope-resolver.ts` and `understanding-completeness-checker.ts` into single module.

2. **Add Turn Count Persistence Tests**: Current implementation works but edge cases need integration tests.

3. **Fallback Response Audit Trail**: Add logging when fallback-response-generator is used instead of symbolic path.

4. **Query Router Symbolic Replacement**: Replace pattern-matching router with rule-based intent classification.

5. **Crop Knowledge Base Deprecation**: Move all crop advice to symbolic rules, deprecate static knowledge base.

---

## IMPLEMENTATION PRIORITY

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0-1 | Unify Authority Resolution | 4h | Eliminates authority conflicts |
| P0-2 | Fix VEGETATIVE Default | 2h | Prevents wrong stage gates |
| P0-3 | Persist lockedCropContext | 2h | Fixes multi-turn context loss |
| P0-4 | Authority in OPTION_SELECTED | 1h | Prevents salinity bypass |
| P0-5 | Remove GENERAL_INFO Bypass | 2h | Ensures symbolic-only path |
| P1-1 | Consolidate Clarification | 8h | Code quality |
| P1-2 | Turn Count Tests | 4h | Reliability |
| P2-1 | Router Replacement | 16h | Full symbolic compliance |

---

## AUDIT METADATA

- **Audit Version**: 1.0.0
- **Auditor**: Senior Agronomy Systems Auditor + AI Safety Architect
- **Date**: 2026-01-06
- **Files Examined**: 15+ core modules
- **Lines Analyzed**: ~10,000
- **Evidence Sources**: Code analysis only (no runtime logs available)

---

## Critical Files for Implementation

- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` - Central orchestration with duplicate authority paths (lines 916-1081, 1200-1286)
- `supabase/functions/ai-agriculture-chat/decision/authority-resolver.ts` - One of 3 authority implementations
- `supabase/functions/ai-agriculture-chat/decision/prescription-gate-enforcer.ts` - Duplicate authority determination
- `supabase/functions/ai-agriculture-chat/decision/decision-readiness-gate.ts` - Third authority check location
- `supabase/functions/ai-agriculture-chat/index.ts` - Session persistence and lockedCropContext handling (lines 584-658)
