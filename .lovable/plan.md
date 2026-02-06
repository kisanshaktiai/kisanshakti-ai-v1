

# Production Forensic Audit: AI Chat Symbolic Decision Brain
## Complete Analysis of Hardcoded Language & Architectural Misalignments

---

## Executive Summary

After deep exploration of **58+ files** containing **~50,000+ lines of code**, I have identified **7 critical categories** of hardcoded language violations and **3 architectural misalignments** that need to be addressed for production-readiness. The system has a well-designed SSOT architecture (`observation_translations`, `observation_master`, `i18n_key` in `decision_rules`), but numerous implementation gaps leak hardcoded regional text into logic layers.

---

## Section 1: Hardcoded Language Violations Inventory

### Category A: Keyword Arrays in Logic Layers (CRITICAL - 15 Files)

These files contain language-specific keyword arrays that bypass canonical symbols:

| File | Lines | Violation Type | Estimated Terms |
|------|-------|----------------|-----------------|
| `failure-class-detector.ts` | 73-133 | `ESTABLISHMENT_KEYWORDS`, `PEST_KEYWORDS`, `DISEASE_KEYWORDS`, etc. with Marathi/Hindi/English words | ~200 terms |
| `language-induction-layer.ts` | 129-350 | `MARATHI_SYMPTOM_MAP`, `HINDI_SYMPTOM_MAP`, `ENGLISH_SYMPTOM_MAP`, `CROP_MAP` | ~300 terms |
| `nlp-agriculture-validator.ts` | 59-293 | `MARATHI_AG_VOCABULARY`, `HINDI_AG_VOCABULARY`, `DIALECT_NORMALIZATIONS` | ~500+ terms |
| `understanding-completeness-checker.ts` | 262-284 | `URGENCY_KEYWORDS` with Marathi/Hindi/English | ~30 terms |
| `intent-classifier.ts` | 197-222 | Keyword fallback arrays for growth/pest/color/wilt patterns | ~40 terms |
| `fact-extractor.ts` | 21-60 | `SYMPTOM_CANONICAL_MAP` with Marathi/Hindi phrases | ~50 terms |

### Category B: Hardcoded UI Templates (MODERATE - 12 Files)

These files contain hardcoded question/response text in regional languages:

| File | Lines | Violation Type |
|------|-------|----------------|
| `clarification-renderer.ts` | 115-320 | `BASE_TEMPLATES` with full Marathi/Hindi/English questions and options |
| `diagnosis-first-generator.ts` | 126-340 | `CAUSE_TRANSLATIONS`, `OBSERVATION_LABELS` with ~100 pest/disease/symptom terms |
| `context-manager.ts` | 52-230 | `clarification_question` objects with hardcoded Marathi/Hindi |
| `communication-translation-dictionary.ts` | 24-270 | Hardcoded diagnosis/action translations |
| `clarification-scope-resolver.ts` | 873-877 | Hardcoded photo request messages |
| `agricultural-vocabulary.ts` | 657-661 | Urgency keywords in regional languages |

### Category C: Regional Translator Dictionaries (LOW - 2 Files)

These are intentionally cached for dialect consistency but could be migrated to DB:

| File | Lines | Description |
|------|-------|-------------|
| `regional-translator.ts` | 75-400 | `PEST_TRANSLATIONS`, `DISEASE_TRANSLATIONS`, `SYMPTOM_TRANSLATIONS` with ~200 terms |
| `translation-loader.ts` | 51-97 | `FALLBACK_TRANSLATIONS` with ~30 terms |

### Category D: `.includes()` Language Checks (CRITICAL - 4 Files)

These use language strings for logic branching:

| File | Lines | Code Pattern |
|------|-------|--------------|
| `observation-key-mapper.ts` | 224-227 | `.includes('किड')`, `.includes('अळी')`, `.includes('कीड')` |
| `multilingual-quick-replies.ts` | 123-130 | `.includes('पानी')`, `.includes('खत')`, `.includes('किडे')` |
| `clarification-reentry-controller.ts` | 362-364 | `.includes('पान')` for leaf detection |
| `understanding-completeness-checker.ts` | 201-204 | `.includes('मरत')`, `.includes('मर रहा')` for contradiction detection |

---

## Section 2: decision_rules Table Audit

### Current Schema Strengths

```text
✅ i18n_key column present (488 active rules, 100% coverage)
✅ action_text column for English base text (279 rules, 57% coverage)
✅ conditions_json JSONB for trigger logic
✅ observable_characteristics JSONB for diagnostic clues
✅ differentiating_questions JSONB for differential diagnosis
✅ crop_code, stage_applicable, canonical_group for scoping
```

### Schema Misalignments Found

| Issue | Location | Impact |
|-------|----------|--------|
| **Crop code inconsistency** | `crop_code` values: `SC`, `SUGARCANE`, `CTN`, `ALL` | Rule matching fails when code formats differ |
| **trigger_keywords in conditions_json** | `SC_STRESS_WATERLOGGING_003` has `trigger_keywords: [पाणी जास्त, पाणी साचले, waterlogging...]` | Logic depends on language strings inside conditions |
| **Missing action_text** | 209 rules (43%) have NULL action_text | Forces fallback to hardcoded dictionaries |
| **Inconsistent stage_applicable format** | Some: `[SEEDLING]`, others: `[germination, tillering]` | Case mismatch breaks rule matching |

### Sample Rule with Embedded Language:

```json
{
  "rule_id": "SC_STRESS_WATERLOGGING_003",
  "conditions_json": {
    "trigger_keywords": ["पाणी जास्त", "पाणी साचले", "waterlogging", "excess water", "जमीन ओली"]
  }
}
```

**This violates SSOT** - language strings are embedded in rule conditions instead of using canonical observation codes.

---

## Section 3: Architectural Misalignments

### Misalignment #1: Language Induction Layer is a "Dual-Path" System

**Current Architecture:**
```text
Farmer Input → Language Induction Layer (hardcoded maps) → Canonical Symbols
           ↘ Intent Classifier (LLM + keyword fallback) → Intent Codes
```

**Problem:** Two parallel paths with duplicated language logic. The Language Induction Layer uses `MARATHI_SYMPTOM_MAP` while Intent Classifier uses keyword fallbacks - both hardcoded.

**Correct Architecture:**
```text
Farmer Input → LLM Semantic Extractor → Canonical Symbols (language-agnostic)
                     ↓
           Intent Resolver (DB-driven) → Intent Codes
```

### Misalignment #2: Failure Class Detector Bypasses Symbolic Layer

**Current Code (failure-class-detector.ts:158-180):**
```typescript
const normalizedQuery = user_query.toLowerCase();
// Directly matches language keywords against user query
const establishmentMatches = ESTABLISHMENT_KEYWORDS.filter(k => 
  normalizedQuery.includes(k.toLowerCase())
);
```

**Problem:** This detector operates on raw user text instead of extracted canonical symbols, making it language-dependent.

### Misalignment #3: Validation Gate Treats Clarification as Treatment

**Current Code (index.ts validation section):**
```typescript
const decision_brain_source = true;  // Always true
validationResult = validateResponseBeforeSave({...}); // Validates everything
// Fails for CLARIFICATION_QUESTION → shows "technical issue"
```

**Problem:** Non-decision response types (CLARIFICATION_QUESTION, PHOTO_REQUEST) are incorrectly validated as treatment outputs.

---

## Section 4: Refactoring Strategy

### Phase 1: Eliminate Keyword Arrays from Logic Layers (P0 - CRITICAL)

**Files to Refactor:**

| File | Current | Refactored Approach |
|------|---------|---------------------|
| `failure-class-detector.ts` | Keyword arrays | Accept pre-extracted `ObservationKey[]` as input; match against canonical codes only |
| `understanding-completeness-checker.ts` | `URGENCY_KEYWORDS` | Use urgency flag from semantic extraction output (already extracted by LLM) |
| `intent-classifier.ts` | Keyword fallbacks | Remove fallbacks; let LLM return `UNKNOWN` if it cannot classify |

**Example Refactor for failure-class-detector.ts:**

```typescript
// BEFORE (language-dependent)
const PEST_KEYWORDS = ['insect', 'pest', 'किडे', 'कीड़े', 'अळी'];
if (PEST_KEYWORDS.some(k => query.includes(k))) { ... }

// AFTER (canonical-only)
export function detectPrimaryFailureClass(input: {
  observations: ObservationKey[];  // Already extracted canonical codes
  crop_code: string;
  growth_stage: string;
}) {
  if (input.observations.includes('INSECT_PRESENT') ||
      input.observations.includes('PEST_DAMAGE')) {
    return { primary_class: 'PEST_DAMAGE' };
  }
}
```

### Phase 2: Migrate UI Templates to Database (P1)

**Create new table `clarification_templates`:**

```sql
CREATE TABLE clarification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,  -- 'IDENTIFY_CROP', 'IDENTIFY_LOCATION', etc.
  language_code TEXT NOT NULL,  -- 'mr', 'hi', 'en'
  question_text TEXT NOT NULL,
  options JSONB,  -- [{value: 'LEAF', label: 'पान'}, ...]
  is_active BOOLEAN DEFAULT true,
  UNIQUE(scope, language_code)
);
```

Then refactor `clarification-renderer.ts` to load templates from DB:

```typescript
// BEFORE
const BASE_TEMPLATES = { 
  [ClarificationScope.IDENTIFY_CROP]: { mr: '🌾 कोणत्या पिकाबद्दल...', ...} 
};

// AFTER
const templates = await supabase
  .from('clarification_templates')
  .select('*')
  .eq('scope', scope)
  .eq('language_code', language);
```

### Phase 3: Fix decision_rules Data Quality (P0)

**SQL Migration to Standardize crop_code:**

```sql
-- Normalize all crop codes to short form
UPDATE decision_rules SET crop_code = 'SC' WHERE crop_code = 'SUGARCANE';
UPDATE decision_rules SET crop_code = 'CTN' WHERE crop_code = 'COTTON';

-- Remove trigger_keywords from conditions_json (language strings)
UPDATE decision_rules 
SET conditions_json = conditions_json - 'trigger_keywords'
WHERE conditions_json ? 'trigger_keywords';
```

**Ensure all rules have proper observation codes in conditions_json:**

```json
// BEFORE (language-dependent)
{"trigger_keywords": ["पाणी जास्त", "waterlogging"]}

// AFTER (canonical-only)
{"observations": ["WATERLOGGING", "EXCESS_WATER", "ROOT_ROT"]}
```

### Phase 4: Remove `.includes()` Language Checks (P1)

**Example Refactor for observation-key-mapper.ts:**

```typescript
// BEFORE
if (combined.includes('किड') || combined.includes('अळी') || combined.includes('कीड')) {
  phenomena.push(ObservationKey.INSECT_PRESENT);
}

// AFTER - Input is already canonical symbols from semantic extraction
if (extractedSymbols.symptoms.includes(CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE)) {
  phenomena.push(ObservationKey.INSECT_PRESENT);
}
```

### Phase 5: Fix Validation Gate (P0 - Already in Previous Plan)

```typescript
// Skip validation for non-decision response types
const isClarificationOrPhoto = ['CLARIFICATION_QUESTION', 'PHOTO_REQUEST', 
                                'CLARIFICATION_NEEDED'].includes(orchestratorResponse.type);

if (isClarificationOrPhoto) {
  console.log(`🔐 [${traceId}] VALIDATION SKIPPED: Response type is ${orchestratorResponse.type}`);
  validationResult = { passed: true, errors: [] };
}
```

---

## Section 5: Database Translation Tables Status

### Existing SSOT Tables (Well-Designed)

| Table | Records | Purpose |
|-------|---------|---------|
| `observation_master` | 50+ | Canonical observation codes with English descriptions |
| `observation_translations` | 150+ | Localized display_text for observation codes (mr/hi/en) |
| `intent_translations` | TBD | Localized intent display text |
| `decision_rules.i18n_key` | 488 | Translation key for rule responses |

### Tables Needed for Full SSOT

| Table | Purpose | Status |
|-------|---------|--------|
| `clarification_templates` | Localized clarification questions/options | **NOT EXISTS - CREATE** |
| `cause_translations` | Localized pest/disease names (currently hardcoded in diagnosis-first-generator.ts) | **NOT EXISTS - CREATE** |
| `action_translations` | Localized action/treatment labels | **NOT EXISTS - CREATE** |

---

## Section 6: Complete File Inventory Requiring Changes

### Priority 0 (Must Fix for Production)

| File | LOC | Change Type |
|------|-----|-------------|
| `failure-class-detector.ts` | 625 | Remove keyword arrays; accept canonical observations |
| `intent-classifier.ts` | 268 | Remove keyword fallback section (lines 194-229) |
| `index.ts` | 1200+ | Skip validation for clarification types |
| `decision_rules` table | N/A | Remove trigger_keywords; standardize crop_code |

### Priority 1 (Should Fix)

| File | LOC | Change Type |
|------|-----|-------------|
| `language-induction-layer.ts` | 692 | Migrate maps to DB; use LLM extraction as primary |
| `clarification-renderer.ts` | 987 | Load templates from DB instead of hardcoded `BASE_TEMPLATES` |
| `diagnosis-first-generator.ts` | 798 | Load `CAUSE_TRANSLATIONS` and `OBSERVATION_LABELS` from DB |
| `understanding-completeness-checker.ts` | 472 | Remove `URGENCY_KEYWORDS`; use semantic extraction flag |

### Priority 2 (Technical Debt)

| File | LOC | Change Type |
|------|-----|-------------|
| `nlp-agriculture-validator.ts` | 741 | Consider DB-driven vocabulary (5000+ terms) |
| `regional-translator.ts` | 597 | Consider DB-driven regional variants |
| `communication-translation-dictionary.ts` | 300+ | Migrate to `i18n_key` system |

---

## Section 7: Zero-Regression Verification Checklist

After implementation, verify:

| Test Case | Expected Behavior |
|-----------|-------------------|
| "उसाची वाढ होत नाही" (Marathi growth query) | Extracts STUNTED_GROWTH symbol, triggers DIAGNOSIS mode |
| "मधली सुरळी वाळली" (Dead heart) | Maps to DEAD_HEART observation, matches shoot borer rules |
| "किडे दिसतात" (Insects visible) | Maps to INSECT_PRESENT, shows pest diagnostic options |
| CLARIFICATION_QUESTION response | Passes validation gate, shows options (not "technical issue") |
| Hindi input "पौधा मर गया" | Extracts PLANT_DEATH, triggers DIAGNOSIS_ONLY mode |
| English input "yellow leaves" | Same behavior as Marathi/Hindi equivalents |

---

## Section 8: Implementation Order

```text
Week 1: P0 Fixes
├── Fix validation gate (index.ts) ← Already done in previous session
├── Standardize crop_code in decision_rules
├── Remove trigger_keywords from conditions_json
└── Refactor failure-class-detector.ts to canonical-only

Week 2: P1 Database Migration
├── Create clarification_templates table
├── Create cause_translations table
├── Migrate clarification-renderer.ts to DB-driven
└── Migrate diagnosis-first-generator.ts to DB-driven

Week 3: P2 Cleanup
├── Deprecate keyword fallbacks in intent-classifier.ts
├── Migrate nlp-agriculture-validator.ts vocabulary to DB
└── Full regression testing across all languages
```

---

## Technical Appendix: Key Code Locations

### Hardcoded Marathi/Hindi in Decision Logic

```
supabase/functions/ai-agriculture-chat/
├── decision/
│   ├── failure-class-detector.ts:73-133      ← ESTABLISHMENT/PEST/DISEASE_KEYWORDS
│   ├── fact-extractor.ts:21-60               ← SYMPTOM_CANONICAL_MAP
│   ├── diagnosis-first-generator.ts:126-340  ← CAUSE_TRANSLATIONS, OBSERVATION_LABELS
│   └── diagnosis-only-mode.ts:71-186         ← TERMINAL_DAMAGE_OBSERVATION_KEYS (OK - canonical)
├── agents/
│   ├── language-induction-layer.ts:129-350   ← MARATHI/HINDI/ENGLISH_SYMPTOM_MAP
│   ├── intent-classifier.ts:194-229          ← Keyword fallback arrays
│   ├── clarification-renderer.ts:115-320     ← BASE_TEMPLATES with regional text
│   ├── understanding-completeness-checker.ts:262-284 ← URGENCY_KEYWORDS
│   └── nlp-agriculture-validator.ts:59-293   ← MARATHI/HINDI_AG_VOCABULARY (5000+ terms)
└── services/
    └── regional-translator.ts:75-400         ← Deterministic translation cache
```

### Existing SSOT Infrastructure (Use This!)

```
supabase/functions/ai-agriculture-chat/i18n/
├── observation-label-loader.ts   ← Loads from observation_translations table ✅
└── translation-loader.ts         ← Uses i18n_key from decision_rules ✅
```

---

This audit identifies 15+ files with ~1,200+ hardcoded regional language terms that need migration to database-driven canonical symbols. The system has strong SSOT infrastructure already in place (`observation_master`, `observation_translations`, `i18n_key`), but implementation gaps allow hardcoded language to leak into logic layers.

