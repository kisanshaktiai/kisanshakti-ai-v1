

# Critical Bug Fix Plan: SSOT-Compliant Symbolic Decision Brain

## Executive Summary

After deep forensic analysis of the codebase and database schema, I have identified that the system has **partial SSOT compliance** but contains critical violations that cause:

1. **Edge Function Timeouts** - LLM JSON parsing failure breaks the pipeline
2. **Hardcoded Regional Text** - Clarification options and diagnostic labels bypass database translations
3. **Wrong Induction Gate Logic** - Allows symbolic brain execution with 0 symptoms

The `decision_rules` table already contains the correct data architecture:
- `observable_characteristics` - Array of observation codes per rule (crop+stage specific)
- `differentiating_questions` - JSON with `question_id`, `mr`, `hi`, `en` translations, `information_gain`
- `conditions_json.symptom` - Symptom arrays for rule matching

The `observation_translations` table provides multilingual display text for observation codes.

**The fix is NOT to add more hardcoded text, but to properly USE the existing database structure.**

---

## Current Database Architecture (SSOT)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          decision_rules (SSOT)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ rule_id: SC_PEST_EARLY_SHOOT_BORER_006                                      │
│ crop_code: SC                                                               │
│ stage_applicable: [TILLERING, GERMINATION]                                  │
│ cause: Early Shoot Borer                                                    │
│                                                                             │
│ observable_characteristics: [                                               │
│   "DEAD_HEART_PRESENT",                                                     │
│   "LARVAE_PRESENT",                                                         │
│   "STEM_BORING_MARKS"                                                       │
│ ]                                                                           │
│                                                                             │
│ differentiating_questions: [                                                │
│   {                                                                         │
│     "question_id": "DEADHEART_CHECK",                                       │
│     "mr": "मधली सुरळी वाळली आहे का?",                                        │
│     "hi": "बीच की पत्ती मुरझाई है?",                                         │
│     "en": "Is the central whorl wilted (dead heart)?",                      │
│     "information_gain": 0.95,                                               │
│     "discriminates_from": ["TERMITE", "WATERLOGGING"]                       │
│   }                                                                         │
│ ]                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ observation_code JOIN
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      observation_translations                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ observation_code: LEAF_YELLOWING                                            │
│ language_code: mr → display_text: "पाने पिवळी"                              │
│ language_code: hi → display_text: "पत्ते पीले"                               │
│ language_code: en → display_text: "Leaf yellowing"                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Bug Analysis with SSOT Lens

### BUG #1: Unguarded JSON.parse() in Intent Classifier

**File:** `agents/intent-classifier.ts` (line 134)

```typescript
// CURRENT (BREAKS)
const parsed = JSON.parse(cleanContent);
```

**Impact:** LLM returns `"Here is the classification..."` → SyntaxError → 0% confidence fallback → pipeline corruption

**FIX:** Add safe JSON extraction with regex fallback (NO language text involved)

---

### BUG #2: Induction Gate Allows Symbolic Brain with 0 Symptoms

**File:** `agents/language-induction-layer.ts` (line 621)

```typescript
// CURRENT (WRONG)
return result.symbol_coverage >= minCoverage || result.total_symbols_extracted >= 1;
// A crop symbol alone (SUGARCANE) passes this gate!
```

**Impact:** `symptoms=[]` but `total_symbols_extracted=1` (crop) → symbolic brain runs → 0 rules match → timeout

**FIX:** Require `symptoms.length >= 1` for symbolic brain activation

---

### BUG #3: DIAGNOSTIC_OBSERVATION_LABELS Hardcoded in hypothesis-evaluator.ts

**File:** `decision/hypothesis-evaluator.ts` (lines 764-837)

```typescript
// CURRENT (SSOT VIOLATION)
const DIAGNOSTIC_OBSERVATION_LABELS: Record<string, { mr: string; hi: string; en: string; icon: string }> = {
  'DEAD_HEART_PRESENT': {
    mr: 'मधली सुरळी सुकलेली / ओढल्यास बाहेर येते',  // ❌ HARDCODED
    hi: 'बीच की पत्ती सूखी / खींचने पर निकल जाती है',  // ❌ HARDCODED
    en: 'Central whorl dried / pulls out easily',
    icon: '🔴'
  },
  // ... 12 more hardcoded entries
};
```

**FIX:** Replace with database lookup from `observation_translations` table

---

### BUG #4: DIFFERENTIAL_PATTERNS Hardcoded in differential-diagnosis-clarifier.ts

**File:** `decision/differential-diagnosis-clarifier.ts` (lines 115-500)

```typescript
// CURRENT (SSOT VIOLATION)
const DIFFERENTIAL_PATTERNS: Record<string, DifferentialPattern> = {
  'LEAF_YELLOWING': {
    differentiating_questions: [
      {
        question_mr: 'पिवळेपणा आधी कोणत्या पानांवर आला...',  // ❌ HARDCODED
        question_hi: 'पीलापन पहले किन पत्तियों पर आया...',   // ❌ HARDCODED
        // ...
      }
    ]
  }
};
```

**DATABASE REALITY:** `decision_rules.differentiating_questions` ALREADY has this data with `mr`, `hi`, `en` translations!

**FIX:** Load differential questions from `decision_rules.differentiating_questions` at runtime

---

### BUG #5: getDefaultClarificationOptions Hardcoded in generic-multi-match-detector.ts

**File:** `agents/generic-multi-match-detector.ts` (lines 599-622)

```typescript
// CURRENT (SSOT VIOLATION)
function getDefaultClarificationOptions(language: 'mr' | 'hi' | 'en'): string[] {
  if (language === 'mr') {
    return [
      '🐛 छोटे किडे दिसतात',          // ❌ HARDCODED
      '🍂 पाने पिवळी/वाळलेली दिसतात', // ❌ HARDCODED
      // ...
    ];
  }
}
```

**FIX:** Load from `observation_translations` table using canonical observation codes

---

## Implementation Plan (SSOT-Compliant)

### Phase 1: Fix JSON Parsing (No Language Involved)

**File:** `agents/intent-classifier.ts`

```typescript
/**
 * Safely extract JSON from LLM output that may contain non-JSON preamble
 * This is pure parsing logic - NO language strings involved
 */
function safeExtractJson(content: string): { intent_code: string; confidence: number } | null {
  if (!content || typeof content !== 'string') return null;
  
  // Clean markdown fences
  let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Strategy 1: Direct parse
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  
  // Strategy 2: Find JSON object in mixed content
  const jsonMatch = cleaned.match(/\{[\s\S]*?"intent_code"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* continue */ }
  }
  
  // LLM returned plain text - signal for clarification
  return null;
}

// Update line 134
const parsed = safeExtractJson(cleanContent);
if (!parsed) {
  console.warn(`   ⚠️ [IntentClassifier] LLM returned non-JSON - forcing clarification`);
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.0 };
}
```

---

### Phase 2: Fix Induction Gate (Symptom Requirement)

**File:** `agents/language-induction-layer.ts`

```typescript
/**
 * Check if induction result has sufficient coverage for rule evaluation
 * SSOT PRINCIPLE: Symbolic brain requires SYMPTOMS, not just crop detection
 */
export function hasMinimumCoverage(
  result: LanguageInductionResult, 
  minCoverage: number = 0.3
): boolean {
  // FIX: A crop symbol alone is NOT sufficient for rule matching
  // We must have at least 1 symptom to run the symbolic brain
  const hasSymptoms = result.symptoms.length >= 1;
  const hasSufficientCoverage = result.symbol_coverage >= minCoverage;
  
  return hasSymptoms && (hasSufficientCoverage || result.total_symbols_extracted >= 2);
}
```

**File:** `agents/orchestrator.ts` (around line 2103)

```typescript
// Add explicit symptom gate
const hasSymptoms = inductionResult.symptoms.length > 0;
const effectiveShouldRunSymbolic = shouldRunSymbolicBrain && hasSymptoms;

if (!hasSymptoms && shouldRunSymbolicBrain) {
  console.log(`\n⚠️ [INDUCTION_GATE] Blocking symbolic: coverage=${inductionResult.symbol_coverage.toFixed(2)} but symptoms=0`);
  console.log(`   → Crop detected: ${inductionResult.crop?.symbol || 'NONE'}`);
  console.log(`   → Forcing CLARIFICATION path (no symptoms = no rules)`);
}
```

---

### Phase 3: Create Database Observation Loader (SSOT)

**File:** `supabase/functions/ai-agriculture-chat/i18n/observation-label-loader.ts` (NEW)

```typescript
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION LABEL LOADER - SSOT-COMPLIANT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Loads observation display labels from observation_translations table.
 * Falls back to formatted English code if translation missing.
 * NEVER returns hardcoded regional text.
 */

export const OBSERVATION_LOADER_VERSION = '1.0.0';

// Icon mapping (visual symbols are language-neutral)
const OBSERVATION_ICONS: Record<string, string> = {
  'LEAF_YELLOWING': '🍂',
  'LEAF_WILTING': '🥀',
  'INSECTS_VISIBLE': '🐛',
  'LARVAE_PRESENT': '🐛',
  'STEM_BORING_MARKS': '🕳️',
  'DEAD_HEART_PRESENT': '💀',
  'DEAD_HEART': '💀',
  'STUNTED_PLANTS': '📉',
  'STUNTED_GROWTH': '📉',
  'SLOW_GROWTH': '📉',
  'FIELD_WATERLOGGED': '💧',
  'SOIL_TOO_DRY': '🏜️',
  'ROOT_ROTTED': '🪵',
  'LEAF_SPOTS': '🦠',
  'POOR_TILLERING': '🌾',
  'PHOTO_REQUEST': '📷'
};

export interface ObservationLabel {
  observation_code: string;
  display_text: string;
  description_text: string;
  icon: string;
}

/**
 * Load observation labels from database for given codes and language
 * SSOT: All display text comes from observation_translations table
 */
export async function loadObservationLabels(
  supabaseClient: any,
  observationCodes: string[],
  language: 'mr' | 'hi' | 'en'
): Promise<Map<string, ObservationLabel>> {
  console.log(`📖 [ObservationLoader] Loading ${observationCodes.length} labels in ${language}`);
  
  const labelMap = new Map<string, ObservationLabel>();
  
  try {
    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', observationCodes.map(c => c.toUpperCase()))
      .eq('language_code', language);
    
    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
    }
    
    // Build map from database results
    for (const code of observationCodes) {
      const upperCode = code.toUpperCase();
      const translation = translations?.find(
        t => t.observation_code.toUpperCase() === upperCode
      );
      const icon = OBSERVATION_ICONS[upperCode] || '❓';
      
      if (translation) {
        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: translation.display_text,
          description_text: translation.description_text || '',
          icon
        });
      } else {
        // Fallback: Format code as English words (NOT hardcoded regional text)
        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: formatCodeAsLabel(upperCode),
          description_text: '',
          icon
        });
      }
    }
    
    console.log(`   ✅ Loaded ${labelMap.size} labels from database`);
    
  } catch (err) {
    console.error(`   ❌ Exception: ${err}`);
  }
  
  return labelMap;
}

/**
 * Format observation code as human-readable label
 * STUNTED_GROWTH → Stunted Growth (English only - SSOT compliant)
 */
function formatCodeAsLabel(code: string): string {
  return code
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
```

---

### Phase 4: Replace Hardcoded DIAGNOSTIC_OBSERVATION_LABELS

**File:** `decision/hypothesis-evaluator.ts`

**REMOVE:** Lines 764-837 (the hardcoded `DIAGNOSTIC_OBSERVATION_LABELS` dictionary)

**REPLACE:** With database lookup function:

```typescript
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';

/**
 * Get diagnostic observation label from database
 * SSOT: All display text from observation_translations table
 */
async function getDiagnosticObservationLabel(
  supabaseClient: any,
  observationKey: string,
  language: 'mr' | 'hi' | 'en'
): Promise<{ text: string; icon: string } | null> {
  const labels = await loadObservationLabels(supabaseClient, [observationKey], language);
  const label = labels.get(observationKey.toUpperCase());
  
  if (label) {
    return {
      text: `${label.icon} ${label.display_text}`,
      icon: label.icon
    };
  }
  
  return null;
}
```

**UPDATE:** `generateDiagnosticConfirmationOptions()` function to use database lookup:

```typescript
export async function generateDiagnosticConfirmationOptions(
  candidates: CandidateHypothesis[],
  language: 'mr' | 'hi' | 'en' = 'mr',
  maxOptions: number = 5,
  supabaseClient: any  // NEW: Pass Supabase client
): Promise<DiagnosticConfirmationResult> {
  
  // Collect all unique observation keys from candidates
  const allObsKeys: string[] = [];
  for (const candidate of candidates) {
    for (const char of candidate.observable_characteristics) {
      const key = char.observation_key.toUpperCase();
      if (!allObsKeys.includes(key)) {
        allObsKeys.push(key);
      }
    }
  }
  
  // SSOT: Load labels from database (single batch query)
  const labelMap = await loadObservationLabels(supabaseClient, allObsKeys, language);
  
  // Build options using database labels
  const options: DiagnosticConfirmationOption[] = [];
  // ... rest of logic using labelMap instead of hardcoded dictionary
}
```

---

### Phase 5: Replace Hardcoded DIFFERENTIAL_PATTERNS

**File:** `decision/differential-diagnosis-clarifier.ts`

**CHANGE:** Load `differentiating_questions` from `decision_rules` table instead of hardcoded patterns.

**Current hardcoded structure:**
```typescript
const DIFFERENTIAL_PATTERNS: Record<string, DifferentialPattern> = { ... };
```

**New database-driven approach:**

```typescript
/**
 * Load differential diagnosis questions from decision_rules table
 * SSOT: differentiating_questions column has mr/hi/en translations
 */
async function loadDifferentialQuestionsFromDB(
  supabaseClient: any,
  cropCode: string,
  growthStage: string,
  symptomCodes: string[]
): Promise<DifferentialQuestion[]> {
  
  console.log(`📖 [DiffDiag] Loading questions from DB for ${cropCode}/${growthStage}`);
  
  // Query rules that have differentiating_questions for this crop/stage
  const { data: rules, error } = await supabaseClient
    .from('decision_rules')
    .select('rule_id, cause, differentiating_questions')
    .eq('is_active', true)
    .or(`crop_code.eq.${cropCode.toUpperCase()},crop_code.eq.all`)
    .contains('stage_applicable', [growthStage.toUpperCase()])
    .not('differentiating_questions', 'is', null)
    .neq('differentiating_questions', '[]')
    .limit(20);
  
  if (error) {
    console.error(`   ❌ DB error: ${error.message}`);
    return [];
  }
  
  // Extract questions with highest information_gain
  const questions: DifferentialQuestion[] = [];
  
  for (const rule of rules || []) {
    const ruleQuestions = rule.differentiating_questions || [];
    for (const q of ruleQuestions) {
      if (q.question_id && q.mr && q.en) {
        questions.push({
          question_id: q.question_id,
          question_mr: q.mr,
          question_hi: q.hi || q.en,  // Fallback to English if Hindi missing
          question_en: q.en,
          information_gain: q.information_gain || 0.5,
          discriminates_from: q.discriminates_from || [],
          source_rule_id: rule.rule_id
        });
      }
    }
  }
  
  // Sort by information_gain and deduplicate by question_id
  const uniqueQuestions = new Map<string, DifferentialQuestion>();
  for (const q of questions.sort((a, b) => b.information_gain - a.information_gain)) {
    if (!uniqueQuestions.has(q.question_id)) {
      uniqueQuestions.set(q.question_id, q);
    }
  }
  
  console.log(`   ✅ Loaded ${uniqueQuestions.size} unique questions from ${rules?.length || 0} rules`);
  
  return Array.from(uniqueQuestions.values());
}
```

---

### Phase 6: Replace getDefaultClarificationOptions

**File:** `agents/generic-multi-match-detector.ts`

**REMOVE:** Lines 599-622 (the hardcoded `getDefaultClarificationOptions` function)

**REPLACE:** With database-driven function:

```typescript
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';

// Default observation codes for generic clarification (canonical symbols)
const DEFAULT_CLARIFICATION_CODES = [
  'INSECTS_VISIBLE',
  'LEAF_YELLOWING',
  'LEAF_SPOTS',
  'PHOTO_REQUEST'
];

/**
 * Get default clarification options from database
 * SSOT: All display text from observation_translations table
 */
async function getDefaultClarificationOptionsFromDB(
  supabaseClient: any,
  language: 'mr' | 'hi' | 'en'
): Promise<string[]> {
  const labelMap = await loadObservationLabels(
    supabaseClient, 
    DEFAULT_CLARIFICATION_CODES, 
    language
  );
  
  const options: string[] = [];
  for (const code of DEFAULT_CLARIFICATION_CODES) {
    const label = labelMap.get(code.toUpperCase());
    if (label) {
      options.push(`${label.icon} ${label.display_text}`);
    }
  }
  
  // Always include photo option (loaded from DB)
  const photoLabel = labelMap.get('PHOTO_REQUEST');
  if (!photoLabel) {
    // Hardcoded photo icon is acceptable (universal symbol)
    options.push('📷 Send photo');
  }
  
  return options;
}
```

---

### Phase 7: Add Mandatory Fallback Clarification (SSOT-Compliant)

**File:** `agents/orchestrator.ts`

Add at the end of orchestration, before final return:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// MANDATORY FALLBACK: Generate clarification from decision_rules
// when zero rules matched and no primary decision exists
// ═══════════════════════════════════════════════════════════════════════════

const rulesApplied = decisionOutput.rules_applied?.length || 0;
const hasPrimaryDecision = !!(decisionOutput.primary_decision?.rule_id);

if (rulesApplied === 0 && !hasPrimaryDecision) {
  console.warn(`\n⚠️ [MANDATORY_FALLBACK] No rules matched - generating SSOT clarification`);
  
  const cropCode = landContext?.current_crop?.toUpperCase() || 'SC';
  const growthStage = landContext?.growth_stage?.toUpperCase() || 'TILLERING';
  const language = (options.language as 'mr' | 'hi' | 'en') || 'mr';
  
  // SSOT: Load top observable_characteristics for this crop/stage from decision_rules
  const { data: topRules } = await this.supabase
    .from('decision_rules')
    .select('observable_characteristics')
    .eq('is_active', true)
    .or(`crop_code.eq.${cropCode},crop_code.eq.all`)
    .contains('stage_applicable', [growthStage])
    .not('observable_characteristics', 'is', null)
    .limit(10);
  
  // Extract unique observation codes
  const obsCodesSet = new Set<string>();
  for (const rule of topRules || []) {
    const chars = rule.observable_characteristics;
    if (Array.isArray(chars)) {
      chars.slice(0, 3).forEach((c: string) => obsCodesSet.add(c.toUpperCase()));
    }
  }
  
  // Limit to top 4 + photo
  const obsCodes = Array.from(obsCodesSet).slice(0, 4);
  obsCodes.push('PHOTO_REQUEST');
  
  // SSOT: Load translations from observation_translations table
  const { loadObservationLabels } = await import('../i18n/observation-label-loader.ts');
  const labelMap = await loadObservationLabels(this.supabase, obsCodes, language);
  
  // Build options array
  const clarificationOptions = obsCodes.map(code => {
    const label = labelMap.get(code);
    return {
      value: code,
      label: label ? `${label.icon} ${label.display_text}` : code
    };
  });
  
  // SSOT: Load question text from message_translations or use i18n_key
  return {
    type: 'CLARIFICATION_QUESTION',
    session_id: sessionId,
    question: {
      question_id: `fallback_clarify_${Date.now()}`,
      i18n_key: 'clarification.zero_symptoms_detected',
      options: clarificationOptions,
      source: 'DECISION_RULES_SSOT'
    },
    metadata: {
      confidence: 0.3,
      safety_status: 'NEEDS_CLARIFICATION',
      rules_applied: 0,
      processing_time_ms: Date.now() - startTime,
      agents_used: [...agentsUsed, 'MANDATORY_FALLBACK'],
      trace_id: traceId,
      fallback_reason: 'ZERO_RULES_ZERO_SYMPTOMS',
      ssot_source: 'decision_rules.observable_characteristics'
    }
  };
}
```

---

### Phase 8: Seed Missing Observation Translations

**SQL to run:** Add missing translations for frequently used observation codes

```sql
-- Add missing observation translations
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  -- English
  ('INSECTS_VISIBLE', 'en', 'Insects visible', 'Small insects visible on plant'),
  ('LARVAE_PRESENT', 'en', 'Larvae visible', 'Caterpillar or grub larvae present'),
  ('STEM_BORING_MARKS', 'en', 'Bore holes in stem', 'Entry/exit holes visible on stem'),
  ('SLOW_GROWTH', 'en', 'Slow growth', 'Plant growing slower than expected'),
  ('FIELD_WATERLOGGED', 'en', 'Waterlogged field', 'Standing water in field'),
  ('SOIL_TOO_DRY', 'en', 'Dry soil', 'Soil is very dry'),
  ('POOR_TILLERING', 'en', 'Poor tillering', 'Less tillers than expected'),
  ('PHOTO_REQUEST', 'en', 'Send photo', 'Take and send a photo'),
  
  -- Marathi
  ('INSECTS_VISIBLE', 'mr', 'किडे दिसतात', 'रोपावर लहान किडे दिसतात'),
  ('LARVAE_PRESENT', 'mr', 'अळ्या दिसतात', 'पोंग्यात किंवा मुळांजवळ अळ्या'),
  ('STEM_BORING_MARKS', 'mr', 'खोडात छिद्र', 'खोडावर छिद्र दिसते'),
  ('SLOW_GROWTH', 'mr', 'वाढ मंद', 'पीक अपेक्षेपेक्षा कमी वाढते'),
  ('FIELD_WATERLOGGED', 'mr', 'पाणी साचले', 'शेतात पाणी साचलेले'),
  ('SOIL_TOO_DRY', 'mr', 'माती कोरडी', 'माती खूप कोरडी आहे'),
  ('POOR_TILLERING', 'mr', 'कमी फुटवे', 'अपेक्षेपेक्षा कमी फुटवे'),
  ('PHOTO_REQUEST', 'mr', 'फोटो पाठवा', 'प्रभावित भागाचा फोटो काढा'),
  
  -- Hindi
  ('INSECTS_VISIBLE', 'hi', 'कीड़े दिखते हैं', 'पौधे पर छोटे कीड़े दिखते हैं'),
  ('LARVAE_PRESENT', 'hi', 'इल्ली दिखती है', 'तने या जड़ों के पास इल्ली'),
  ('STEM_BORING_MARKS', 'hi', 'तने में छेद', 'तने पर छेद दिखता है'),
  ('SLOW_GROWTH', 'hi', 'धीमी वृद्धि', 'फसल अपेक्षा से कम बढ़ रही'),
  ('FIELD_WATERLOGGED', 'hi', 'पानी भरा', 'खेत में पानी जमा है'),
  ('SOIL_TOO_DRY', 'hi', 'मिट्टी सूखी', 'मिट्टी बहुत सूखी है'),
  ('POOR_TILLERING', 'hi', 'कम कल्ले', 'अपेक्षा से कम कल्ले'),
  ('PHOTO_REQUEST', 'hi', 'फोटो भेजें', 'प्रभावित हिस्से की फोटो लें')
ON CONFLICT (observation_code, language_code) DO NOTHING;
```

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `agents/intent-classifier.ts` | MODIFY | Add `safeExtractJson()` for robust LLM parsing |
| `agents/language-induction-layer.ts` | MODIFY | Fix `hasMinimumCoverage()` to require symptoms |
| `agents/orchestrator.ts` | MODIFY | Add symptom gate + SSOT fallback clarification |
| `decision/hypothesis-evaluator.ts` | MODIFY | Remove hardcoded labels, use DB loader |
| `decision/differential-diagnosis-clarifier.ts` | MODIFY | Load questions from `decision_rules` table |
| `agents/generic-multi-match-detector.ts` | MODIFY | Use DB loader for default options |
| `i18n/observation-label-loader.ts` | CREATE | SSOT label loader utility |

---

## SSOT Data Flow (After Fix)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FARMER QUERY                                        │
│                  "उसाची वाढ होत नाही" (Sugarcane not growing)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INTENT CLASSIFIER (safeExtractJson)                                         │
│ → LLM returns "Here is..." → Regex extracts JSON → intent_code: UNKNOWN     │
│ → confidence: 0.0 → Signals clarification needed                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LANGUAGE INDUCTION (Symptom Check)                                          │
│ → Crop: SUGARCANE ✓                                                         │
│ → Stage: TILLERING ✓                                                        │
│ → Symptoms: [] (ZERO!)                                                      │
│ → hasMinimumCoverage() returns FALSE → Blocks symbolic brain                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLARIFICATION PATH (SSOT-Driven)                                            │
│                                                                             │
│ 1. Query decision_rules WHERE crop_code='SC' AND stage='TILLERING'          │
│    → Get observable_characteristics: [LEAF_YELLOWING, INSECTS_VISIBLE, ...] │
│                                                                             │
│ 2. Query observation_translations WHERE observation_code IN (...) AND       │
│    language_code='mr'                                                       │
│    → Get display_text: "पाने पिवळी", "किडे दिसतात", ...                       │
│                                                                             │
│ 3. Return CLARIFICATION_QUESTION with database-sourced options              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FARMER SEES (in Marathi, from database):                                    │
│                                                                             │
│ "तुमच्या पिकात खालीलपैकी काय दिसते?"                                         │
│                                                                             │
│ ○ 🍂 पाने पिवळी                                                             │
│ ○ 🐛 किडे दिसतात                                                            │
│ ○ 📉 वाढ मंद                                                                │
│ ○ 📷 फोटो पाठवा                                                             │
│                                                                             │
│ [All text from observation_translations table - ZERO hardcoded strings]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Hardcoded MR/HI in hypothesis-evaluator.ts | 12 entries | 0 (DB-driven) |
| Hardcoded MR/HI in differential-diagnosis-clarifier.ts | 400+ lines | 0 (DB-driven) |
| Hardcoded MR/HI in generic-multi-match-detector.ts | 12 lines | 0 (DB-driven) |
| JSON parse failures causing timeout | Yes | No (safe extraction) |
| Symbolic brain runs with 0 symptoms | Yes | No (gate blocks) |
| Clarification source | Hardcoded | decision_rules + observation_translations |
| Edge Function timeout rate | Intermittent | 0% |

---

## Testing Strategy

1. **JSON Parse Test:** Mock LLM returning "Here is the analysis..." → verify clarification (not timeout)
2. **Zero Symptom Test:** Send "उसाची वाढ होत नाही" → verify clarification options from DB
3. **SSOT Audit:** Grep modified files for Devanagari → must return 0 matches in logic files
4. **DB Translation Test:** Query observation_translations for test codes → verify all 3 languages exist
5. **End-to-End Test:** Complete farmer query → response in < 10 seconds with DB-sourced text

