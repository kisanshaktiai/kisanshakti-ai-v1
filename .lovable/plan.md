
# Deep Audit Report: decision_rules Table & Farmer Response UI

## Executive Summary

After extensive analysis of 494 rules in the `decision_rules` table, the codebase, and the farmer response UI, I have identified critical data quality issues, unused columns, and opportunities to enhance the UI based on the **WHAT → HOW → WHY / NEXT STEPS** paradigm.

---

## Section 1: Database Schema Audit - Column Usage Analysis

### 1.1 Columns Correctly Used (Core Symbolic Brain)

| Column | Usage | Coverage | Status |
|--------|-------|----------|--------|
| `rule_id` | Primary identifier | 100% | OK |
| `crop_group`, `crop_code` | Crop targeting | 100% | OK |
| `canonical_group` | Rule classification | 100% (22 unique values) | NEEDS NORMALIZATION |
| `stage_applicable` | Growth stage filtering | 100% | CASE INCONSISTENCY |
| `conditions_json` | Symbolic matching | 100% | OK |
| `cause` | Problem identification | 100% | OK |
| `priority` | Rule precedence | 100% | OK |
| `action_type` | Treatment classification | 100% (5 values) | ENUM MISMATCH |
| `is_active` | Rule activation | 100% | OK |
| `observable_characteristics` | Differential diagnosis | 100% (494) | FORMAT CHAOS |
| `reason_text` | WHY explanation | 81% (402/494) | CRITICAL for UI |
| `knowledge_text` | Scientific basis | 82% (405/494) | CRITICAL for UI |
| `i18n_key` | Translation lookup | 78% (386/494) | OK |

### 1.2 Columns with Data Format Issues

#### 1.2.1 `observable_characteristics` Format Chaos
```text
Current State:
- ARRAY format: 257 rules (52%)
- OBJECT format: 237 rules (48%)

CRITICAL: Two incompatible formats cause parsing failures!
```

The `hypothesis-evaluator.ts` includes a fallback handler (lines 280-378), but this adds runtime overhead and risks silent failures.

#### 1.2.2 `action_type` Enum Mismatch
```text
Database Values (Actual):     TypeScript Enums (Expected):
- RECOMMEND (232 rules)        - treatment
- MONITOR (116 rules)          - monitoring  
- BLOCK (96 rules)             - safety_gate
- NO_ACTION_REQUIRED (39)      - advisory
- URGENT_ACTION (11 rules)     - urgent_treatment

0% MATCH between DB and code enums!
```

The `loader.ts` defaults to `'advisory'` when mapping fails (line 109), masking this critical bug.

#### 1.2.3 `stage_applicable` Case Inconsistency
```text
Database Values (UPPERCASE):    Code Expects (lowercase):
- GRAND_GROWTH (108)            - grand_growth
- TILLERING (75)                - tillering
- SEEDLING (52)                 - seedling
- PLANTING (37)                 - germination (WRONG NAME!)
- RATOON (26)                   - post_harvest
- CANE_FORMATION (2)            - grand_growth (UNMAPPED!)
- EARLY_GROWTH (1)              - seedling (UNMAPPED!)
- RATOON_INIT (1)               - NOT IN ENUM
```

### 1.3 Columns NOT Used in Codebase (Technical Debt)

| Column | Coverage | Used in Code? | Recommendation |
|--------|----------|---------------|----------------|
| `reentry_interval_hours` | 0% | NO | REMOVE or populate for safety |
| `research_paper_ref` | 0% | NO | REMOVE |
| `chemical_class` | ~2% | NO | Consolidate to `mode_of_action` |
| `aquatic_toxicity` | ~2% | NO | KEEP for environmental safety |
| `decision_trace_template` | 2% (9 rules) | Minimal | Populate for audit trail |
| `supersedes_rule_id` | ~1% | NO | KEEP for versioning |
| `resistance_group` | ~2% | YES (loader.ts line 143) | Populate for rotation |
| `approved_by`, `approval_date` | 0% | NO | Populate for governance |
| `field_validated`, `validation_trials` | 0% | NO | Populate for quality |

### 1.4 Safety-Critical Columns (ALARMING GAPS)

| Column | Coverage | Required For | Risk Level |
|--------|----------|--------------|------------|
| `phi_days` | 13% (64/494) | Pre-harvest interval | CRITICAL |
| `bee_toxicity` | 16% (80/494) | Pollinator safety | HIGH |
| `dosage_per_acre` | 2% (11/494) | Treatment accuracy | CRITICAL |
| `active_ingredient` | 12% (61/494) | Chemical identification | HIGH |
| `ipm_level` | 37% (182/494) | IPM hierarchy | MEDIUM |
| `organic_alternative` | 17% (83/494) | Organic options | MEDIUM |

---

## Section 2: WHAT → HOW → WHY Paradigm Analysis

### 2.1 Current Response Architecture

The `decision_rules` table has columns designed for structured responses:

| Paradigm Layer | Column | Purpose | Population |
|----------------|--------|---------|------------|
| **WHAT** | `cause` | What's the problem | 100% |
| **HOW** | `action_text` | HOW NOT EXIST | COLUMN MISSING |
| **WHY** | `reason_text` | Why this action | 81% (402) |
| **KNOWLEDGE** | `knowledge_text` | Scientific backing | 82% (405) |

**CRITICAL FINDING**: The `action_text` column (HOW) was mentioned in `loader.ts` (line 102) but DOES NOT EXIST in the database!

```sql
-- Verified column does not exist:
SELECT action_text FROM decision_rules LIMIT 1;
-- ERROR: column "action_text" does not exist
```

### 2.2 Current UI Components Analysis

| Component | Renders | WHAT | HOW | WHY |
|-----------|---------|------|-----|-----|
| `DecisionBrainCards.tsx` | Primary/Secondary actions | ✓ | ✓ (action field) | ✓ (reason field) |
| `DiagnosticResponseCard.tsx` | Causes + questions | ✓ | ❌ | ❌ |
| `ResponseSectionCard.tsx` | Markdown content | ✓ | Embedded | Embedded |
| `ClarificationOptionsUI.tsx` | Option selection | ✓ | ❌ | ❌ |

### 2.3 Gap Analysis: UI vs Database

The `DecisionBrainCards.tsx` interface expects:
```typescript
interface ActionItem {
  action: string;      // WHAT + HOW combined
  reason: string;      // WHY
  timing?: string;     // WHEN (not in DB)
  ruleSources: string[]; // Audit trail
}
```

But the database provides:
- `cause` → WHAT
- `reason_text` → WHY
- `knowledge_text` → Scientific backing
- **MISSING**: `action_text` for HOW

---

## Section 3: Fix Plan

### Phase 1: Database Schema Fixes (CRITICAL)

#### 1.1 Add Missing `action_text` Column
```sql
ALTER TABLE decision_rules 
ADD COLUMN action_text TEXT;

COMMENT ON COLUMN decision_rules.action_text IS 
  'HOW: Specific actionable instruction for farmer';
```

#### 1.2 Normalize `action_type` Values
```sql
-- Map existing values to standard enums
UPDATE decision_rules SET action_type = 'treatment' WHERE action_type = 'RECOMMEND';
UPDATE decision_rules SET action_type = 'monitoring' WHERE action_type = 'MONITOR';
UPDATE decision_rules SET action_type = 'safety_gate' WHERE action_type = 'BLOCK';
UPDATE decision_rules SET action_type = 'advisory' WHERE action_type = 'NO_ACTION_REQUIRED';
UPDATE decision_rules SET action_type = 'urgent_treatment' WHERE action_type = 'URGENT_ACTION';

-- Add constraint
ALTER TABLE decision_rules 
ADD CONSTRAINT valid_action_type 
CHECK (action_type IN ('treatment', 'urgent_treatment', 'prevention', 'advisory', 
                       'safety_gate', 'monitoring', 'clarification', 'diagnosis'));
```

#### 1.3 Normalize `stage_applicable` to Lowercase
```sql
UPDATE decision_rules 
SET stage_applicable = (
  SELECT array_agg(lower(elem))
  FROM unnest(stage_applicable) elem
);

-- Fix stage name mappings
UPDATE decision_rules 
SET stage_applicable = array_replace(stage_applicable, 'planting', 'germination');
UPDATE decision_rules 
SET stage_applicable = array_replace(stage_applicable, 'ratoon', 'post_harvest');
UPDATE decision_rules 
SET stage_applicable = array_replace(stage_applicable, 'cane_formation', 'grand_growth');
```

#### 1.4 Unify `observable_characteristics` to Array Format
```sql
-- Convert object format to array format
UPDATE decision_rules 
SET observable_characteristics = (
  SELECT jsonb_agg(upper(key))
  FROM jsonb_each(observable_characteristics)
)
WHERE jsonb_typeof(observable_characteristics) = 'object'
  AND observable_characteristics != '{}';
```

### Phase 2: Data Enrichment (SAFETY CRITICAL)

#### 2.1 Populate Safety Fields for Treatment Rules

For all 232 `RECOMMEND` action_type rules, add:

| Active Ingredient | PHI (days) | Bee Toxicity | Dosage/Acre |
|-------------------|------------|--------------|-------------|
| Chlorantraniliprole 18.5% SC | 45 | LOW | 75-100 ml |
| Fipronil 5% SC | 30 | HIGH | 1000 ml |
| Imidacloprid 17.8 SL | 40 | HIGH | 100 ml |
| Carbendazim 50% WP | 14 | SAFE | 500g |

Source: CIB&RC India, ICAR-IISR Lucknow

#### 2.2 Add `action_text` to All Treatment Rules

Pattern: "Apply {product} at {dosage} per acre during {timing}"

Example:
```json
{
  "rule_id": "SC_PEST_EARLY_SHOOT_BORER_001",
  "cause": "Early Shoot Borer",
  "action_text": "Release Trichogramma chilonis @ 50,000 eggs/acre in 3 splits",
  "reason_text": "Biological control prevents ESB before dead heart escalation",
  "knowledge_text": "Field trials across TN and MH show effective ESB suppression"
}
```

### Phase 3: Enhanced Farmer Response UI

#### 3.1 New `WhatHowWhyCard.tsx` Component

```text
+------------------------------------------+
| 🎯 WHAT: Early Shoot Borer Attack        |
|    Detected symptoms: Dead heart, Frass  |
+------------------------------------------+
| ✅ HOW: Release Trichogramma chilonis    |
|    @ 50,000 eggs/acre in 3 splits        |
|    Timing: Early morning, avoid rain     |
+------------------------------------------+
| 💡 WHY: Biological control prevents ESB  |
|    before dead heart escalation          |
+------------------------------------------+
| 📚 ICAR Source: IISR-PKG-2024-TRICHO-003 |
+------------------------------------------+
```

#### 3.2 Mobile-First Card Structure

```typescript
interface WhatHowWhyResponse {
  // WHAT - Problem identification
  what: {
    cause_name: string;
    cause_code: string;
    symptoms_observed: string[];
    confidence: number;
    icon: string; // Pest: 🐛, Disease: 🦠, Stress: 🌡️
  };
  
  // HOW - Actionable instruction
  how: {
    action_text: string;
    dosage?: string;
    timing?: string;
    application_method?: string;
    safety_ppe?: string[];
  };
  
  // WHY - Reasoning
  why: {
    reason_text: string;
    knowledge_text?: string;
    ipm_level?: number;
    scientific_source?: string;
  };
  
  // NEXT STEPS
  next_steps?: {
    follow_up_days?: number;
    success_indicators?: string[];
    photo_required?: boolean;
  };
}
```

### Phase 4: Seeder Validation Layer

Update `supabase/functions/seed-decision-rules/index.ts`:

```typescript
const validateRule = (rule: RuleFromJSON): string[] => {
  const errors: string[] = [];
  
  // WHAT validation
  if (!rule.cause || rule.cause.length < 5) {
    errors.push(`${rule.rule_id}: Missing or invalid cause`);
  }
  
  // HOW validation for treatment rules
  if (rule.action_type === 'treatment') {
    if (!rule.action_text) {
      errors.push(`${rule.rule_id}: Treatment rule missing action_text`);
    }
    if (!rule.phi_days) {
      errors.push(`${rule.rule_id}: Treatment rule missing phi_days`);
    }
    if (!rule.bee_toxicity) {
      errors.push(`${rule.rule_id}: Treatment rule missing bee_toxicity`);
    }
  }
  
  // WHY validation
  if (!rule.reason_text) {
    errors.push(`${rule.rule_id}: Missing reason_text`);
  }
  
  return errors;
};
```

---

## Section 4: Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| Database Migration | CREATE | Add `action_text`, normalize action_type, stage_applicable |
| `seed-decision-rules/index.ts` | MODIFY | Add validation layer |
| `bundled-rules/loader.ts` | MODIFY | Fetch `action_text`, remove fallback defaults |
| `llm-response-generator.ts` | MODIFY | Include `action_text` in narration prompt |
| `src/components/chat/WhatHowWhyCard.tsx` | CREATE | New structured response component |
| `src/components/chat/DecisionBrainCards.tsx` | MODIFY | Integrate WHAT→HOW→WHY structure |
| `src/types/decision-rules.types.ts` | MODIFY | Add `action_text` to interface |

---

## Section 5: Success Metrics

After implementation:

| Metric | Current | Target |
|--------|---------|--------|
| `action_text` coverage | 0% | 100% |
| `action_type` enum compliance | 0% | 100% |
| `stage_applicable` lowercase | 0% | 100% |
| `observable_characteristics` array format | 52% | 100% |
| `phi_days` for treatment rules | 13% | 100% |
| `bee_toxicity` for treatment rules | 16% | 100% |
| UI displays WHAT→HOW→WHY | No | Yes |

---

## Technical Notes

1. **Database Migration**: Run migrations before code deployment
2. **Backward Compatibility**: `loader.ts` already handles missing fields with defaults
3. **Testing**: Validate 10 sample rules across all crops before full deployment
4. **Rollback**: Keep backup of current `decision_rules` table state
