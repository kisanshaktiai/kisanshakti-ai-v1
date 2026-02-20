

# Causal Hypothesis Arbitration Layer -- Production-Hardened Implementation

## Architecture Context

The codebase has a mature symbolic decision pipeline:

1. **ConditionLedger** in `loader.ts` (lines 303-330) -- strict fail-closed evaluator with `PASSED/FAILED/SKIPPED_NO_DATA/UNEVALUABLE` tracking
2. **LayeredRuleEvaluator** in `layered-rule-evaluator.ts` (lines 289-800) -- density-weighted scoring with 0.60 confidence gate
3. **Hypothesis Evaluator** in `decision/hypothesis-evaluator.ts` (1112 lines) -- partial-match rule grouping for clarification (NOT causal reasoning)
4. **UnifiedDecisionGate** in `decision/unified-decision-gate.ts` -- SSOT confidence passthrough from symbolic layer
5. **Orchestrator** in `agents/orchestrator.ts` (8233 lines) -- currently calls `evaluateCandidateHypotheses` for diagnosis-first clarification at line 3376, then `evaluateRulesLayered` at line 4724

The existing hypothesis evaluator groups `decision_rules` by cause using partial matching. It has NO dedicated hypothesis tables, NO contradiction checking, NO strict ledger, and NO fail-closed semantics. It is a **clarification helper**, not a causal reasoner.

---

## What This Plan Adds

A **strict causal hypothesis layer** between observation assembly and rule evaluation that:

- Uses dedicated database tables (not `decision_rules` metadata)
- Mirrors the ConditionLedger's fail-closed semantics exactly
- Includes density weighting, minimum thresholds, contradiction elimination
- Narrows rule evaluation scope via hypothesis-to-rule mapping
- Replaces generic clarification with discriminator-targeted questions when hypotheses compete
- Falls back cleanly to full-scope rule evaluation when no hypotheses exist

---

## Phase 1: Database Schema (5 tables + seed data)

### Table 1: `hypothesis_master`

```sql
CREATE TABLE hypothesis_master (
  hypothesis_id TEXT PRIMARY KEY,
  crop_group TEXT NOT NULL,
  hypothesis_type TEXT NOT NULL CHECK (hypothesis_type IN ('PEST','DISEASE','DEFICIENCY','STRESS','WEED','ENVIRONMENTAL')),
  canonical_group TEXT NOT NULL,
  cause_name_en TEXT NOT NULL,
  cause_name_mr TEXT,
  cause_name_hi TEXT,
  biological_basis TEXT,
  severity_model TEXT DEFAULT 'SIMPLE' CHECK (severity_model IN ('SIMPLE','ETL_BASED','ECONOMIC_MODEL')),
  version TEXT DEFAULT '1.0.0',
  engine_min_version TEXT DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hypothesis_crop ON hypothesis_master(crop_group);
CREATE INDEX idx_hypothesis_type ON hypothesis_master(hypothesis_type);
CREATE INDEX idx_hypothesis_active ON hypothesis_master(is_active) WHERE is_active = TRUE;
```

### Table 2: `hypothesis_conditions`

```sql
CREATE TABLE hypothesis_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  condition_type TEXT NOT NULL CHECK (condition_type IN ('OBSERVATION','DAS_RANGE','STAGE','NDVI_PATTERN','WEATHER','SOIL','BOOLEAN_GATE')),
  condition_key TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('EQUALS','CONTAINS','BETWEEN','GT','LT','GTE','LTE','EXISTS','NOT_EXISTS')),
  value_json JSONB NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  is_discriminator BOOLEAN DEFAULT FALSE,
  weight NUMERIC DEFAULT 1.0 CHECK (weight > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hyp_cond_hypothesis ON hypothesis_conditions(hypothesis_id);
```

### Table 3: `hypothesis_contradictions`

```sql
CREATE TABLE hypothesis_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  contradiction_type TEXT NOT NULL CHECK (contradiction_type IN ('OBSERVATION','STAGE','WEATHER','PATTERN')),
  contradiction_key TEXT NOT NULL,
  contradiction_value TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hyp_contra_hypothesis ON hypothesis_contradictions(hypothesis_id);
```

### Table 4: `hypothesis_rule_mapping`

```sql
CREATE TABLE hypothesis_rule_mapping (
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  rule_id TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  context_notes TEXT,
  PRIMARY KEY (hypothesis_id, rule_id)
);
```

### Table 5: `hypothesis_metrics`

```sql
CREATE TABLE hypothesis_metrics (
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id) PRIMARY KEY,
  times_triggered INTEGER DEFAULT 0,
  times_contradicted INTEGER DEFAULT 0,
  times_confirmed INTEGER DEFAULT 0,
  times_eliminated_missing_data INTEGER DEFAULT 0,
  avg_confidence NUMERIC DEFAULT 0,
  last_triggered TIMESTAMPTZ
);
```

### RLS: All tables read-only via service role (edge function uses service key).

```sql
ALTER TABLE hypothesis_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_rule_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON hypothesis_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_contradictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_rule_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_metrics FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow anon read" ON hypothesis_master FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_conditions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_contradictions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_rule_mapping FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_metrics FOR SELECT TO anon USING (true);
```

### Seed Data: 5 Sugarcane Pilot Hypotheses

Insert rows for:
1. `SC_EARLY_SHOOT_BORER` -- observations: DEAD_HEART, BORE_HOLES_IN_STEM; stage: tillering/grand_growth; contradiction: UNIFORM_FIELD_DAMAGE
2. `SC_TOP_BORER` -- observations: DEAD_HEART, TOP_SHOOT_DAMAGE; DAS > 120; contradiction: ROOT_DAMAGE
3. `SC_WHITEFLY` -- observations: WHITEFLY_PRESENT, HONEYDEW; contradiction: DEAD_HEART
4. `SC_RED_ROT` -- observations: RED_DISCOLORATION, STEM_ROT; stage: grand_growth+; contradiction: BORE_HOLES
5. `SC_NITROGEN_DEFICIENCY` -- observations: YELLOWING, STUNTED_GROWTH; soil_nitrogen: LOW; contradiction: BORE_HOLES

Each linked to 1-3 existing `decision_rules` via `hypothesis_rule_mapping`.

---

## Phase 2: Engine Implementation

### File 1: NEW `supabase/functions/ai-agriculture-chat/decision/causal-hypothesis-engine.ts`

Core engine (~500 lines) with:

**A. HypothesisLedger (mirrors ConditionLedger exactly)**

```text
enum HypothesisConditionStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  SKIPPED_NO_DATA = 'SKIPPED_NO_DATA',
  CONTRADICTED = 'CONTRADICTED'
}

interface HypothesisLedgerEntry {
  key: string;
  status: HypothesisConditionStatus;
  required: boolean;
  weight: number;
  inputValue?: unknown;
  ruleValue?: unknown;
}
```

**Match rule (strict fail-closed, identical to rule ConditionLedger):**
- Zero required entries with status FAILED
- Zero required entries with status SKIPPED_NO_DATA
- Zero entries with status CONTRADICTED
- At least one entry with status PASSED

**B. Data Loader (cached, indexed by crop_group)**

```text
interface CachedHypothesisData {
  hypotheses: HypothesisMaster[];
  conditions: Map<string, HypothesisCondition[]>;
  contradictions: Map<string, HypothesisContradiction[]>;
  ruleMappings: Map<string, string[]>;
  loadedAt: number;
}

const hypothesisCache = new Map<string, CachedHypothesisData>();
const HYPOTHESIS_CACHE_TTL = 300000; // 5 minutes

// Precompiled in-memory structure indexed by crop_group
async function loadHypothesesForCrop(cropGroup: string, supabase: any): Promise<CachedHypothesisData>
```

Single query with joins to populate full structure. Cache by crop_group.

**C. Hypothesis Scorer with Density Weighting**

```text
interface HypothesisScore {
  hypothesis_id: string;
  cause_name_en: string;
  hypothesis_type: string;
  canonical_group: string;
  passed_required: number;
  total_required: number;
  base_score: number;           // passed_weight / total_weight
  density_weight: number;        // log(total_required + 1) / log(10)
  weighted_score: number;        // base_score * (0.5 + 0.5 * density_weight)
  ledger: HypothesisLedgerEntry[];
  contradictions_found: string[];
  elimination_reason: 'NONE' | 'FAILED_REQUIRED' | 'MISSING_DATA' | 'CONTRADICTION' | 'LOW_SCORE';
  is_eliminated: boolean;
  matched_conditions: string[];
  discriminators_available: string[];
  mapped_rule_ids: string[];
}
```

Density weight formula (same as rule evaluator):
```text
densityWeight = Math.min(1.0, Math.log(total_required + 1) / Math.log(10))
weighted_score = Math.min(1.0, base_score * (0.5 + 0.5 * densityWeight))
```

**D. Condition Evaluator**

Each `hypothesis_conditions` row evaluated against `CanonicalState`:

| condition_type | Evaluation method |
|---|---|
| OBSERVATION | Check if `value_json.code` exists in canonical observations |
| DAS_RANGE | Compare `value_json.min/max` against `state.days_since_sowing` |
| STAGE | Check if `value_json.stages[]` contains current stage |
| NDVI_PATTERN | Compare against `state.ndvi_trend` or `state.ndvi_level` |
| WEATHER | Extract temp/humidity/rain from `state.weather`, compare with operator |
| SOIL | Compare `value_json.field/threshold` against soil data |
| BOOLEAN_GATE | Check `value_json.key` against state boolean fields |

Missing input data for required condition = `SKIPPED_NO_DATA` (fail-closed).

**E. Contradiction Checker**

For each `hypothesis_contradictions` row:
- Check if `contradiction_key` + `contradiction_value` matches canonical state or observations
- If match found: status = `CONTRADICTED`, hypothesis eliminated

All contradictions come from the table. Zero hardcoded biological rules in engine code.

**F. Competing Arbitration**

```text
const MIN_HYPOTHESIS_CONFIDENCE = 0.55;
const DISCRIMINATOR_DELTA = 0.10;

interface ArbitrationResult {
  best_hypothesis: HypothesisScore | null;
  competing: HypothesisScore[];
  needs_clarification: boolean;
  clarification_reason?: 'COMPETING_HYPOTHESES' | 'BELOW_THRESHOLD';
  discriminator_question?: DiscriminatorQuestion;
  decision_path: 'HYPOTHESIS_SCOPED' | 'FULL_RULE_SCOPE' | 'CLARIFICATION_REQUIRED';
  eliminated_hypotheses: Array<{ id: string; reason: string }>;
}
```

Logic:
1. Remove all eliminated hypotheses
2. If zero survive AND crop has hypotheses defined: `needs_clarification = true` (do NOT fall back silently)
3. If zero survive AND crop has NO hypotheses: `decision_path = 'FULL_RULE_SCOPE'` (backward compat fallback)
4. If best hypothesis < `MIN_HYPOTHESIS_CONFIDENCE`: `needs_clarification = true`
5. If top 2 within `DISCRIMINATOR_DELTA`: build discriminator question
6. Otherwise: return best hypothesis with `decision_path = 'HYPOTHESIS_SCOPED'`

**G. Discriminator Question Builder**

Find conditions marked `is_discriminator = true` that differ between top-2 hypotheses.
Build trilingual question targeting the highest-weight discriminator.
Return as structured clarification matching existing `DecisionBrainClarificationOutput` contract.

Guard: Only ask discriminator if BOTH hypotheses >= `MIN_HYPOTHESIS_CONFIDENCE`.

**H. Observability Block**

Before returning arbitration result:
```text
console.log(`🧠 [CausalHypothesis] Arbitration Result:`);
console.log(`   hypotheses_evaluated: ${allScores.length}`);
console.log(`   hypotheses_eliminated: ${eliminated.length}`);
console.log(`   hypotheses_survived: ${survived.length}`);
console.log(`   best_hypothesis: ${best?.hypothesis_id || 'NONE'}`);
console.log(`   best_score: ${best?.weighted_score.toFixed(3) || '0'}`);
console.log(`   decision_path: ${result.decision_path}`);
eliminated.forEach(e => console.log(`   eliminated: ${e.id} reason=${e.reason}`));
```

**I. Metrics Update (fire-and-forget)**

```text
// Non-blocking, catch errors silently
supabase.from('hypothesis_metrics').upsert({...}).then(() => {}).catch(() => {});
```

---

## Phase 3: Integration into Pipeline

### File 2: MODIFY `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Integration point: After observation assembly, before `evaluateRulesLayered` call (~line 4700)**

Insert causal hypothesis arbitration:

```text
// NEW: Run causal hypothesis arbitration (between PHASE 2.5 and PHASE 2.6)
console.log('\n🧠 PHASE 2.5.5: Causal Hypothesis Arbitration...');
let hypothesisRuleScope: string[] | undefined = undefined;
let hypothesisResult: ArbitrationResult | undefined = undefined;

try {
  const { runCausalHypothesisArbitration } = await import('../decision/causal-hypothesis-engine.ts');
  hypothesisResult = await runCausalHypothesisArbitration({
    crop_group: cropCode,
    canonical_state: canonicalState,
    observations: [...allObservationsForPreAuth],
    supabase_client: this.supabase,
    trace_id: traceId
  });

  if (hypothesisResult.needs_clarification) {
    // Return discriminator question immediately
    // (format matches existing clarification response structure)
    return formatHypothesisClarification(hypothesisResult, sessionId, farmerId, options, traceId, startTime, agentsUsed);
  }

  if (hypothesisResult.decision_path === 'HYPOTHESIS_SCOPED' && hypothesisResult.best_hypothesis) {
    hypothesisRuleScope = hypothesisResult.best_hypothesis.mapped_rule_ids;
    console.log(`   🎯 Hypothesis scoped to ${hypothesisRuleScope.length} rules: ${hypothesisRuleScope.join(', ')}`);
  }
  // else: FULL_RULE_SCOPE -- proceed normally
} catch (hypothesisError) {
  console.error(`   ⚠️ Hypothesis arbitration failed, falling back to full scope:`, hypothesisError);
  // Safe fallback: continue with full rule evaluation
}
```

**At line 4724 (evaluateRulesLayered call):**

Pass hypothesis scope to filter rules:

```text
// If hypothesis narrowed scope, filter allRulesWithBundled
let rulesToEvaluate = allRulesWithBundled;
if (hypothesisRuleScope && hypothesisRuleScope.length > 0) {
  const scopedRules = allRulesWithBundled.filter(r => hypothesisRuleScope!.includes(r.id));
  if (scopedRules.length > 0) {
    rulesToEvaluate = scopedRules;
    console.log(`   🎯 [HypothesisScope] Narrowed from ${allRulesWithBundled.length} to ${scopedRules.length} rules`);
  } else {
    console.warn(`   ⚠️ [HypothesisScope] No rules matched scope, falling back to full set`);
  }
}

layeredRuleResult = evaluateRulesLayered(rulesToEvaluate, canonicalStateWithQuery as any);
```

**Propagate hypothesis metadata to decision_output:**

Add `hypothesis_result` to `decisionOutput` so `index.ts` can access it:

```text
decisionOutput.hypothesis_result = hypothesisResult ? {
  best_hypothesis_id: hypothesisResult.best_hypothesis?.hypothesis_id,
  hypothesis_score: hypothesisResult.best_hypothesis?.weighted_score,
  decision_path: hypothesisResult.decision_path,
  eliminated_count: hypothesisResult.eliminated_hypotheses.length
} : undefined;
```

### File 3: MODIFY `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts`

**Extend `UnifiedGateInput` (~line 239):**

```text
/** Hypothesis layer confidence (0-1, optional) */
hypothesis_confidence?: number;
```

**Composite confidence (~line 377):**

```text
const calculatedConfidence = input.decision_confidence ?? 0;
// If hypothesis layer provided causal confidence, compute composite
const hypothesisConf = input.hypothesis_confidence;
if (hypothesisConf !== undefined && hypothesisConf > 0 && calculatedConfidence > 0) {
  const compositeConfidence = Math.round(hypothesisConf * (calculatedConfidence / 100) * 100);
  console.log(`   📊 [CausalConfidence] hypothesis=${hypothesisConf.toFixed(3)} * rule=${calculatedConfidence}% = composite=${compositeConfidence}%`);
  // Use composite only if it's higher (hypothesis should boost, not reduce)
  // calculatedConfidence remains unchanged -- hypothesis is additive context
}
```

### File 4: MODIFY `supabase/functions/ai-agriculture-chat/index.ts`

**Pass hypothesis confidence to UnifiedGateInput (~line 988):**

```text
const hypothesisConfidence = orchestratorResponse.decision_output?.hypothesis_result?.hypothesis_score ?? undefined;

// Add to unifiedGateInput:
hypothesis_confidence: hypothesisConfidence,
```

### File 5: MODIFY `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts`

**Prefer discriminator clarification over generic (~around line 360):**

Before calling `evaluateCandidateHypotheses`, check if a discriminator question was already produced:

```text
// If hypothesis arbitration already produced a targeted discriminator question,
// use it instead of running generic hypothesis evaluation
if (options?.discriminatorQuestion) {
  console.log(`   🎯 [Clarification] Using discriminator question from hypothesis arbitration`);
  return formatDiscriminatorAsClarification(options.discriminatorQuestion, language);
}
// Otherwise, fall through to existing evaluateCandidateHypotheses path
```

---

## Phase 4: Logging to `ai_decision_log`

In orchestrator, when saving to `ai_decision_log`, add hypothesis fields:

```text
hypothesis_id: hypothesisResult?.best_hypothesis?.hypothesis_id || null,
hypothesis_score: hypothesisResult?.best_hypothesis?.weighted_score || null,
hypothesis_decision_path: hypothesisResult?.decision_path || 'NO_HYPOTHESIS',
hypotheses_evaluated: hypothesisResult?.eliminated_hypotheses?.length || 0,
```

This requires adding nullable columns to `ai_decision_log`:
```sql
ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_id TEXT;
ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_score NUMERIC;
ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_decision_path TEXT;
```

---

## Architecture Invariants Enforced

| Invariant | How Enforced |
|---|---|
| Fail-closed on missing data | `SKIPPED_NO_DATA` on required condition blocks hypothesis |
| No soft-pass | Ledger-based, identical to rule ConditionLedger |
| Density weighting | Same formula as `layered-rule-evaluator.ts` line 750 |
| Minimum threshold | `MIN_HYPOTHESIS_CONFIDENCE = 0.55` enforced before rule scoping |
| No hardcoded biology | All contradictions from `hypothesis_contradictions` table |
| Explicit elimination reasons | `FAILED_REQUIRED / MISSING_DATA / CONTRADICTION / LOW_SCORE` |
| Strict fallback logic | Crop has hypotheses but none survives = clarification, not fallback |
| Crop has no hypotheses = full rule scope (backward compat) | Checked via empty result from loader |
| Versioning | `version` and `engine_min_version` in `hypothesis_master` |
| Full observability | Per-request log of evaluated/eliminated/survived/best/path |
| No infinite clarification | Discriminator only asked if both hypotheses >= threshold |
| Non-blocking metrics | Fire-and-forget upsert to `hypothesis_metrics` |

---

## Files Summary

1. **DB MIGRATION**: Create 5 tables + RLS + indexes
2. **DB SEED**: 5 sugarcane hypotheses + conditions + contradictions + rule mappings
3. **DB MIGRATION**: Add 3 nullable columns to `ai_decision_log`
4. **NEW**: `supabase/functions/ai-agriculture-chat/decision/causal-hypothesis-engine.ts` -- HypothesisLedger, loader, scorer, arbitrator, discriminator builder, metrics
5. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` -- Wire hypothesis arbitration at PHASE 2.5.5, pass scope to rule evaluator
6. **MODIFY**: `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` -- Add `hypothesis_confidence` to input, composite scoring
7. **MODIFY**: `supabase/functions/ai-agriculture-chat/index.ts` -- Pass hypothesis confidence to gate
8. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` -- Prefer discriminator questions
9. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function

