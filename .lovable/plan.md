

# Neuro-Symbolic Pipeline: Codebase–Database Alignment Audit Report

## Executive Summary

Based on the attached DB audit (March 28, 2026) and deep codebase analysis, I identified **4 P0 (Critical)**, **5 P1 (High)**, **4 P2 (Medium)**, and **3 P3 (Low)** issues across the symbolic reasoning chain. The most dangerous is a type-mismatch bug that silently skips ALL safety warnings for CAUTION/EXPERT_ONLY chemicals.

---

## P0 — Critical Issues (Breaks System or Produces Wrong Advisory)

### P0-1: `farmer_safety_level > 1` — Safety Warnings NEVER Fire

**File:** `agents/layered-rule-evaluator.ts`, line 685

```typescript
const farmerSafetyLevel = rule.then.action_details?.farmer_safety_level as SafetyLevel | undefined;
if (farmerSafetyLevel && farmerSafetyLevel > 1) {  // BUG: string > number comparison
```

**Root Cause:** `SafetyLevel` is `'SAFE' | 'CAUTION' | 'EXPERT_ONLY'` (string type). The comparison `'CAUTION' > 1` always returns `false` in JavaScript. This means safety warnings are **never generated** for any rule, including EXPERT_ONLY chemicals like Monocrotophos.

**Fix:**
```typescript
if (farmerSafetyLevel && farmerSafetyLevel !== 'SAFE') {
```

**Impact:** Every chemical recommendation currently ships without PPE/safety warnings regardless of toxicity level.

---

### P0-2: Broken Hypothesis→Rule Reference (SC_PEST_EARLY_SHOOT_BORER_006)

**Table:** `hypothesis_rule_mapping`
**File:** `decision/causal-hypothesis-engine.ts`, lines 261-264

The code loads `rule_id` from `hypothesis_rule_mapping` and passes them downstream, but **does not validate** that the rule_id actually exists in `decision_rules`. The broken reference `SC_PEST_EARLY_SHOOT_BORER_006` will cause a silent miss — the hypothesis triggers but the rule never fires.

**Fix (SQL — prerequisite):**
```sql
-- Option A: Delete broken mapping
DELETE FROM hypothesis_rule_mapping WHERE rule_id = 'SC_PEST_EARLY_SHOOT_BORER_006';

-- Option B: Add FK constraint (after fixing broken ref)
ALTER TABLE hypothesis_rule_mapping
ADD CONSTRAINT fk_hrm_rule_id FOREIGN KEY (rule_id)
REFERENCES decision_rules(rule_id);
```

**Fix (Code — defensive):** In `causal-hypothesis-engine.ts` after loading rule mappings, validate against fetched rules:
```typescript
// After loading mappings, filter out non-existent rule_ids
const validRuleIds = ruleIds.filter(id => allLoadedRules.has(id));
if (validRuleIds.length < ruleIds.length) {
  console.warn(`[HypothesisEngine] ${ruleIds.length - validRuleIds.length} broken rule references filtered`);
}
```

---

### P0-3: Bee Toxicity + Safety Level Contradiction Not Validated in Code

**DB Issue:** 25 rules have `bee_toxicity=HIGH` + `farmer_safety_level=SAFE`. The `deterministic-response-builder.ts` computes a safety score but **does not cross-validate** bee_toxicity against farmer_safety_level.

**File:** `agents/deterministic-response-builder.ts`, `computeSafetyScore()` (line 502)

The safety score deduction for HIGH bee toxicity is only -0.15 (from 1.0), which won't trigger the 0.5 threshold to downgrade to MONITOR. A rule with HIGH bee_toxicity + SAFE safety level + APPROVED regulatory status scores `1.0 - 0.15 = 0.85`, passing all gates.

**Fix (Code):** Add cross-validation:
```typescript
// After computing score, enforce consistency
if (beeTox === 'HIGH' && (ruleData.farmer_safety_level || '').toUpperCase() === 'SAFE') {
  console.error(`[SafetyScore] CONTRADICTION: ${ruleData.rule_id} has bee_toxicity=HIGH but safety=SAFE`);
  score -= 0.2; // Additional penalty for contradictory data
}
```

**Fix (SQL — suggested, DO NOT auto-run):**
```sql
UPDATE decision_rules SET farmer_safety_level = 'CAUTION', updated_at = NOW()
WHERE bee_toxicity = 'HIGH' AND farmer_safety_level = 'SAFE' AND is_active = true;
```

---

### P0-4: Chlorantraniliprole Incorrectly Tagged HIGH Bee Toxicity (2 Rules)

**DB Issue:** Rules `SC_PEST_TOP_BORER_004` and `SC_PEST_INTERNODE_BORER_001` have `bee_toxicity=HIGH` for Chlorantraniliprole, which is factually `LOW/SAFE` per FAO/IRAC Group 28.

**Code Impact:** The `pollinator-protection-rules.ts` correctly lists Chlorantraniliprole as `RELATIVELY_NONTOXIC` (line 173), but the DB value overrides this in `deterministic-response-builder.ts` (which reads from DB). This creates conflicting safety signals between two code paths.

**Fix (SQL — suggested):**
```sql
UPDATE decision_rules SET bee_toxicity = 'LOW', updated_at = NOW()
WHERE active_ingredient ILIKE '%chlorantraniliprole%' AND bee_toxicity = 'HIGH' AND is_active = true;
```

---

## P1 — High Priority Issues (Affects Accuracy or Safety)

### P1-1: 5 Active Orphan Hypotheses Produce No Recommendations

**Affected:** CT_WILT, WH_YELLOW_RUST, RC_BLAST, CT_PINK_BOLLWORM, WH_APHID (+ RC_BPH)

The `causal-hypothesis-engine.ts` correctly loads hypotheses and evaluates conditions. When a hypothesis survives arbitration, it returns `mapped_rule_ids` (line 588). For orphan hypotheses, this array is **empty** — the system triggers but produces no actionable output, silently failing.

**Fix (Code):** Add a guard after arbitration in the engine:
```typescript
if (result.best_hypothesis && result.best_hypothesis.mapped_rule_ids.length === 0) {
  console.warn(`[HypothesisEngine] ORPHAN: ${result.best_hypothesis.hypothesis_id} has no rule mappings`);
  result.decision_path = 'ORPHAN_HYPOTHESIS_FALLBACK';
  result.needs_clarification = true;
}
```

**Fix (DB):** Create rule mappings or deactivate orphan hypotheses until rules are created.

### P1-2: 69 Rules with `regulatory_status=UNKNOWN`

Code in `deterministic-response-builder.ts` only penalizes `BANNED`, `RESTRICTED`, and `WATCH_LIST`. `UNKNOWN` gets **zero penalty** (treated same as `APPROVED`), meaning unverified chemicals pass all safety gates.

**Fix:** Add `UNKNOWN` penalty:
```typescript
else if (regStatus === 'UNKNOWN' && ruleData.active_ingredient) {
  score -= 0.1; // Minor penalty for unverified chemicals
}
```

### P1-3: RESTRICTED + SAFE Contradiction (9 Rules)

Same pattern as P0-3. The `product-repository.ts` checks `chemical_regulatory_status` table separately (line 234), but the `deterministic-response-builder.ts` uses the `regulatory_status` column from `decision_rules` directly. If the DB says `RESTRICTED` + `SAFE`, the safety score is `1.0 - 0.15 = 0.85` — still passes.

**Fix (SQL):** Set `farmer_safety_level = 'CAUTION'` for RESTRICTED rules.

### P1-4: Multi-Match Resolution for SAFETY_BLOCK (99 Rules)

When multiple SAFETY_BLOCK rules fire simultaneously, the `layered-rule-evaluator.ts` sorts by `CATEGORY_PRIORITY_MAP` (SAFETY_GATE=100). But within SAFETY_GATE, all rules have equal priority. The system picks the first after sorting, potentially surfacing a less critical block.

**Fix:** Add secondary sort by `risk_level` within same-category matches.

### P1-5: `crop_group` Inconsistency (17 Rules)

12 SUGARCANE rules tagged `CEREALS_SUGARCANE`, 5 tagged `CEREALS`. The `hypothesis-evaluator.ts` filters by `crop_code` variants (line ~200+), but the `causal-hypothesis-engine.ts` loads hypotheses by `crop_group` (line 207). If `crop_group` doesn't match, hypotheses won't load for those 17 rules.

**Fix (SQL):**
```sql
UPDATE decision_rules SET crop_group = 'SUGARCANE', updated_at = NOW()
WHERE crop_code = 'SUGARCANE' AND crop_group IN ('CEREALS_SUGARCANE', 'CEREALS');
```

---

## P2 — Medium Priority Issues

### P2-1: Confidence Score Non-Discrimination (393 Rules at 0.70)

67% of rules share the same confidence. The `symbolic-reasoner.ts` uses `confidence_score` in composite sorting, but when 393 rules share 0.70, the discriminator is effectively disabled.

### P2-2: 53 Backup Tables in Public Schema

No RLS, no lifecycle. Not a code issue but a security/performance concern.

### P2-3: Duplicate Indexes on `observation_master`

`idx_obs_canonical_engine` and `idx_obs_master_canonical` are redundant.

### P2-4: Missing `conditions_json` GIN Index

Sequential scan on JSONB when filtering by condition values.

---

## P3 — Low Priority Issues

### P3-1: Wheat Coverage Gap (0 Rules)

System will silently return generic responses for wheat queries. Code handles this via `RULE_COVERAGE_GAP` fallback, but the farmer experience is poor.

### P3-2: ETL Thresholds as Text

`etl_threshold` column stores text, making programmatic comparison impossible. Code in `etl-gate.ts` likely parses manually.

### P3-3: 8 Hypotheses Missing Metrics Tracking

`hypothesis_metrics` has 59 rows vs 67 hypotheses.

---

## Implementation Plan (Prioritized)

| Step | Fix | File | Type |
|------|-----|------|------|
| 1 | Fix `farmerSafetyLevel > 1` → `!== 'SAFE'` | `layered-rule-evaluator.ts:685` | Code |
| 2 | Add bee_toxicity/safety cross-validation | `deterministic-response-builder.ts:502` | Code |
| 3 | Add UNKNOWN regulatory penalty | `deterministic-response-builder.ts:519` | Code |
| 4 | Add orphan hypothesis guard | `causal-hypothesis-engine.ts:~700` | Code |
| 5 | Fix Chlorantraniliprole bee_toxicity | Migration SQL | DB |
| 6 | Fix bee_toxicity HIGH + SAFE contradiction | Migration SQL | DB |
| 7 | Fix RESTRICTED + SAFE contradiction | Migration SQL | DB |
| 8 | Fix crop_group inconsistency | Migration SQL | DB |
| 9 | Delete broken rule reference | Migration SQL | DB |
| 10 | Add FK constraint on hypothesis_rule_mapping.rule_id | Migration SQL | DB |

## What This Does NOT Change

- No changes to the LLM formatter or narration layer
- No changes to frontend UI components
- No new tables or schema restructuring
- No changes to the intent→observation mapping (recently fixed)
- No data INSERTs for wheat rules (requires agronomist input)

