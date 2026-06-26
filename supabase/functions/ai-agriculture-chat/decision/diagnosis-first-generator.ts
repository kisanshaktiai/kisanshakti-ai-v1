/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-FIRST RESPONSE GENERATOR (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * When crop damage is detected with full land context, immediately generate
 * ranked diagnosis options from candidate hypotheses (decision_rules) instead
 * of asking generic clarification questions.
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When a farmer reports dying crops, we present possible causes immediately.
 * We do NOT ask 'what problem do you see?' - that's not agronomist practice."
 * 
 * ARCHITECTURE:
 * 1. Takes candidate hypotheses from hypothesis-evaluator.ts
 * 2. Generates ranked diagnosis options (top 3-5 causes)
 * 3. Includes differentiating observations from observable_characteristics
 * 4. ALWAYS appends photo option as final fallback
 * 5. Returns response ready for UI rendering
 * 
 * HARD INVARIANTS:
 * - When land context exists, options MUST come from decision_rules
 * - Generic symptom lists are NEVER returned
 * - Photo option is ALWAYS available
 * - Diagnoses ranked by: priority → confidence → severity
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CandidateHypothesis, HypothesisEvaluationOutput } from './hypothesis-evaluator.ts';
// STATIC IMPORT: Required for Edge Functions (no dynamic imports allowed)
import { translateToRegionalTerms, type FarmerLocation, type RegionalTranslation } from '../services/regional-translator.ts';
// PHASE 4: DB-driven i18n - replaces hardcoded CAUSE_TRANSLATIONS dictionary
import { translateCause, initializeTranslationCache } from '../i18n/translation-loader.ts';
type SupportedLanguage = string;
// PHASE 4: DB-driven observation labels - replaces hardcoded OBSERVATION_LABELS dictionary
import { loadObservationLabels, type ObservationLabel } from '../i18n/observation-label-loader.ts';
// FARMER-OBSERVABLE ONTOLOGY GATE — single source of truth for clarification keys
import { assertFarmerObservable } from '../runtime/farmer-observable-gate.ts';

export const DIAGNOSIS_FIRST_VERSION = '2.0.0';  // v2.0.0: DB-driven i18n, removed hardcoded CAUSE_TRANSLATIONS and OBSERVATION_LABELS

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosisOption {
  id: string;
  cause: string;
  cause_label: string;  // Farmer-friendly name in requested language
  canonical_group: string;
  observation_key: string;  // Key differentiating symptom to look for
  observation_label: string;  // What farmer should check
  confidence: number;
  priority: number;
  icon: string;  // Emoji for visual aid
  rule_id: string;
}

export interface PhotoOption {
  id: 'PHOTO_UPLOAD';
  label: string;
  icon: '📷';
  description: string;
}

export interface DiagnosisFirstOutput {
  mode: 'DIAGNOSIS_FIRST';
  source: 'DECISION_RULES';
  question_text: string;
  
  // Ranked diagnosis options (top 3-5)
  diagnoses: DiagnosisOption[];
  
  // Photo option (always last)
  photo_option: PhotoOption;
  
  // Metadata
  crop_code: string;
  growth_stage: string;
  total_hypotheses_considered: number;
  timestamp: number;
  trace_id: string;
}

export interface DiagnosisFirstInput {
  hypotheses: CandidateHypothesis[];
  crop_code: string;
  growth_stage: string;
  current_observations: string[];
  language: SupportedLanguage;
  damage_observations?: string[];
  trace_id?: string;
  /** v1.1.0: Farmer location for regional translation */
  farmer_location?: FarmerLocation;
  /** v2.0.0: Supabase client for DB-driven translation lookups */
  supabaseClient?: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP ICONS
// ═══════════════════════════════════════════════════════════════════════════

const GROUP_ICONS: Record<string, string> = {
  'pest': '🐛',
  'borer': '🐛',
  'insect': '🐜',
  'mite': '🕷️',
  'disease': '🦠',
  'fungal': '🍄',
  'bacterial': '🦠',
  'viral': '🧬',
  'stress': '🌡️',
  'irrigation': '💧',
  'nutrition': '🍃',
  'deficiency': '🌿',
  'germination': '🌱',
  'establishment': '🌱',
  'soil_borne': '🪱',
  'termite': '🐜',
  'unknown': '🔍'
};

function getGroupIcon(canonicalGroup: string): string {
  const groupLower = canonicalGroup.toLowerCase();
  return GROUP_ICONS[groupLower] || '🔍';
}

// ═══════════════════════════════════════════════════════════════════════════
// v2.0.0: CAUSE TRANSLATION - DB-DRIVEN via translateCause()
// Replaces hardcoded CAUSE_TRANSLATIONS dictionary (was ~60 entries, mr/hi/en only)
// Now scales to all crops and all languages via decision_rules.i18n_key + FALLBACK_TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get farmer-friendly cause label using DB-driven i18n system.
 * Resolution chain: translation-loader cache → FALLBACK_TRANSLATIONS → formatted key
 */
function getCauseLabelFromDB(cause: string, language: SupportedLanguage): string {
  const translated = translateCause(cause, language);
  
  // CRITICAL FIX: Detect if translation is still English for non-English language
  // Uses script-aware detection (inline, no dynamic import)
  if (language !== 'en' && translated) {
    const SCRIPT_RANGES: Record<string, RegExp> = {
      mr: /[\u0900-\u097F]/, hi: /[\u0900-\u097F]/,
      ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/, kn: /[\u0C80-\u0CFF]/,
      ml: /[\u0D00-\u0D7F]/, bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/,
      pa: /[\u0A00-\u0A7F]/, or: /[\u0B00-\u0B7F]/,
    };
    const scriptRegex = SCRIPT_RANGES[language];
    const hasNativeScript = scriptRegex ? scriptRegex.test(translated) : 
      (translated.replace(/[\s\d\p{P}\p{S}a-zA-Z]/gu, '').length > 0);
    
    if (!hasNativeScript) {
      console.warn(`   ⚠️ [getCauseLabelDB] No ${language} translation for "${cause}" - will use observation label`);
      return '';
    }
  }
  
  console.log(`   [getCauseLabelDB] "${cause}" → "${translated}" (${language})`);
  return translated;
}

// ═══════════════════════════════════════════════════════════════════════════
// v2.0.0: OBSERVATION LABELS - DB-DRIVEN via loadObservationLabels()
// Replaces hardcoded OBSERVATION_LABELS dictionary (was ~45 entries, mr/hi/en only)
// Now loads from observation_translations table, scales to all languages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get observation label from pre-loaded DB labels map, with formatted fallback
 */
function getObservationLabelFromMap(
  key: string,
  labelsMap: Map<string, ObservationLabel>,
  language: SupportedLanguage
): string {
  const upperKey = key.toUpperCase();
  const label = labelsMap.get(upperKey);
  if (label && label.display_text) {
    return label.display_text;
  }
  // Fallback: format code as readable label (English-only, language-agnostic)
  const formatted = key
    .replace(/_/g, ' ')
    .replace(/check for/i, '')
    .trim()
    .toLowerCase();
  return formatted;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO OPTION LABELS (English-only — LLM narration layer translates)
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_LABEL = { label: '📷 Send Photo', description: 'Send a crop photo for more accurate diagnosis' };

const DIAGNOSIS_QUESTION_TEMPLATE = {
  single: '🔬 Your crop may be affected by {cause}. Which of these do you see?',
  multiple: '🔬 Your crop may have one of these issues. Select the closest match:'
};

function getQuestionText(
  diagnoses: DiagnosisOption[],
  _language: string
): string {
  if (diagnoses.length === 1) {
    return DIAGNOSIS_QUESTION_TEMPLATE.single.replace('{cause}', diagnoses[0].cause_label);
  }
  
  return DIAGNOSIS_QUESTION_TEMPLATE.multiple;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate diagnosis-first response from candidate hypotheses.
 * 
 * PRINCIPLE: When crop damage is reported with land context, show ranked
 * diagnosis options immediately - don't ask generic clarification questions.
 * 
 * This is how a senior agronomist operates in the field.
 * 
 * v1.1.0: Now supports async regional translation for authentic farmer vocabulary.
 */
export async function generateDiagnosisFirstResponse(
  input: DiagnosisFirstInput
): Promise<DiagnosisFirstOutput | null> {
  const {
    hypotheses,
    crop_code,
    growth_stage,
    current_observations,
    language,
    damage_observations,
    trace_id,
    farmer_location,
    supabaseClient
  } = input;
  
  const traceIdFinal = trace_id || `diag_${Date.now()}`;
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`🔬 [DiagnosisFirst v${DIAGNOSIS_FIRST_VERSION}] Generating diagnosis options`);
  console.log(`   Mode=DIAGNOSIS_FIRST`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Clarification=HYPOTHESIS_DRIVEN`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Hypotheses received: ${hypotheses.length}`);
  console.log(`   Damage observations: ${(damage_observations || []).join(', ') || 'none'}`);
  if (farmer_location) {
    console.log(`   🌍 Regional translation: ${farmer_location.district}, ${farmer_location.state} (${farmer_location.language})`);
  }
  
  // Validate: Need at least one hypothesis
  if (!hypotheses || hypotheses.length === 0) {
    console.log(`   ⚠️ No hypotheses available - cannot generate diagnosis-first response`);
    return null;
  }
  
  // Sort hypotheses by priority → confidence (total_score)
  const sortedHypotheses = [...hypotheses].sort((a, b) => {
    // Higher priority first (priority 1 is highest)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Higher confidence first
    return b.total_score - a.total_score;
  });
  
  // Take top 4 hypotheses
  const topHypotheses = sortedHypotheses.slice(0, 4);
  
  console.log(`   📊 Top hypotheses:`);
  topHypotheses.forEach((h, i) => {
    console.log(`      ${i + 1}. ${h.cause} (group=${h.canonical_group}, priority=${h.priority}, score=${h.total_score.toFixed(2)})`);
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // v2.0.0: DB-DRIVEN TRANSLATION
  // 1. Initialize translation cache (from decision_rules.i18n_key)
  // 2. Load observation labels from observation_translations table
  // 3. Regional translator → DB-driven fallback (NOT hardcoded dictionaries)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Initialize i18n translation cache if supabaseClient available
  if (supabaseClient) {
    try {
      await initializeTranslationCache(supabaseClient);
    } catch (e) {
      console.warn(`   ⚠️ Translation cache init failed, using fallbacks: ${e}`);
    }
  }
  
  // Collect all observation keys for batch DB lookup
  const allObservationKeys: string[] = [];
  for (const h of topHypotheses) {
    for (const obs of h.observable_characteristics || []) {
      if (obs.observation_key && !allObservationKeys.includes(obs.observation_key.toUpperCase())) {
        allObservationKeys.push(obs.observation_key.toUpperCase());
      }
    }
  }
  allObservationKeys.push('VISUAL_CHECK'); // Always include fallback
  
  // Load observation labels from DB (single batch query)
  let observationLabelsMap = new Map<string, ObservationLabel>();
  if (supabaseClient) {
    try {
      observationLabelsMap = await loadObservationLabels(supabaseClient, allObservationKeys, language);
      console.log(`   📖 Loaded ${observationLabelsMap.size} observation labels from DB`);
    } catch (e) {
      console.warn(`   ⚠️ Observation labels load failed: ${e}`);
    }
  }
  
  // Generate diagnosis options (with optional regional translation)
  const diagnoses: DiagnosisOption[] = await Promise.all(
    topHypotheses.map(async (h, idx) => {
      // ═══════════════════════════════════════════════════════════════════
      // FIX #2: Pick MOST DIAGNOSTIC observation key, not just [0]
      // Priority: is_diagnostic=true in observation_master > specific borer/disease
      //           markers > observation not already known > fallback to [0]
      // ═══════════════════════════════════════════════════════════════════
      const DIAGNOSTIC_PRIORITY_KEYS = new Set([
        'DEAD_HEART', 'DEAD_HEART_PRESENT', 'BORE_HOLES', 'BORE_HOLES_AT_BASE',
        'STEM_BORING_MARKS', 'FRASS_VISIBLE', 'RED_ROT_SYMPTOMS', 'SMUT_WHIP_PRESENT',
        'BLACK_WHIP_STRUCTURE', 'MUD_TUNNELS', 'MUD_TUBES_PRESENT', 'RAT_DAMAGE',
        'SETT_HOLLOWED', 'LARVAE_CREAM_COLORED', 'PINK_LARVAE_INSIDE',
        'CENTRAL_SHOOT_WITHERED', 'CENTRAL_SHOOT_PULLS_OUT', 'BORER_EGG_MASS_VISIBLE',
        'STALK_HOLE', 'RED_PITH', 'HOLLOW_STALK', 'WHIP_FORMATION',
      ]);
      
      let bestObservation = h.observable_characteristics?.[0];
      
      // First pass: find a high-diagnostic-priority observation not already known
      for (const obs of h.observable_characteristics || []) {
        const obsKey = obs.observation_key.toUpperCase();
        if (DIAGNOSTIC_PRIORITY_KEYS.has(obsKey) && 
            !current_observations.some(co => co.toUpperCase() === obsKey)) {
          bestObservation = obs;
          break;
        }
      }
      
      // Second pass: find ANY observation not already known (if no diagnostic found)
      if (!bestObservation || DIAGNOSTIC_PRIORITY_KEYS.has(bestObservation.observation_key?.toUpperCase()) === false) {
        for (const obs of h.observable_characteristics || []) {
          const obsKey = obs.observation_key.toUpperCase();
          if (!current_observations.some(co => co.toUpperCase() === obsKey)) {
            if (!bestObservation || DIAGNOSTIC_PRIORITY_KEYS.has(obsKey)) {
              bestObservation = obs;
            }
            break;
          }
        }
      }
      
      const observationKey = bestObservation?.observation_key || 'VISUAL_CHECK';
      
      // ═══════════════════════════════════════════════════════════════
      // CRITICAL FIX v2.1.0: DB-FIRST label resolution
      // Priority: DB observation_translations → regional translator fallback
      // Previous bug: hardcoded regional dict returned short technical labels
      // (e.g., "मृत गाभा / सुरळी वाळणे") which bypassed longer farmer-friendly
      // DB entries (e.g., "मधली सुरळी सुकलेली आणि ओढल्यास बाहेर येते")
      // ═══════════════════════════════════════════════════════════════
      let causeLabel: string;
      let observationLabel: string;
      
      // Script-aware untranslated detection (works for any language)
      const isUntranslated = (text: string | undefined | null): boolean => {
        const t = (text || '').trim();
        if (!t) return true;
        if (language === 'en') return false;
        const SCRIPT_RANGES: Record<string, RegExp> = {
          mr: /[\u0900-\u097F]/, hi: /[\u0900-\u097F]/,
          ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/, kn: /[\u0C80-\u0CFF]/,
          ml: /[\u0D00-\u0D7F]/, bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/,
          pa: /[\u0A00-\u0A7F]/, or: /[\u0B00-\u0B7F]/,
        };
        const scriptRegex = SCRIPT_RANGES[language];
        if (scriptRegex && !scriptRegex.test(t)) return true;
        if (t.toLowerCase() === (h.cause || '').trim().toLowerCase()) return true;
        if (/\bcheck\s+for\b/i.test(t)) return true;
        return false;
      };

      // STEP 1: Try DB-driven labels FIRST (SSOT)
      causeLabel = getCauseLabelFromDB(h.cause, language);
      observationLabel = getObservationLabelFromMap(observationKey, observationLabelsMap, language);
      
      const dbCauseGood = !isUntranslated(causeLabel);
      const dbObsGood = !isUntranslated(observationLabel);
      
      // STEP 2: Only fall back to regional translator if DB didn't provide good labels
      if (farmer_location && (!dbCauseGood || !dbObsGood)) {
        try {
          const regional = await translateToRegionalTerms(
            {
              pest_name_en: h.cause,
              treatment_description_en: `Check for ${observationKey.replace(/_/g, ' ').toLowerCase()}`,
            },
            farmer_location
          );

          // Only use regional result if DB label was missing/untranslated
          if (!dbCauseGood && !isUntranslated(regional.pest_name_regional)) {
            causeLabel = regional.pest_name_regional;
            console.log(`   🌍 [v2.1] Regional fallback for cause: "${h.cause}" → "${causeLabel}" (DB had no translation)`);
          }
          if (!dbObsGood && !isUntranslated(regional.treatment_label_regional)) {
            observationLabel = regional.treatment_label_regional;
            console.log(`   🌍 [v2.1] Regional fallback for obs: "${observationKey}" → "${observationLabel}" (DB had no translation)`);
          }
        } catch (error) {
          console.warn(`   ⚠️ Regional translation also failed for ${h.cause}`);
        }
      }
      
      if (dbCauseGood || dbObsGood) {
        console.log(`   ✅ [v2.1] DB-first: cause="${h.cause}" → "${causeLabel}" | obs="${observationKey}" → "${observationLabel}"`);
      }
      
      // ═══════════════════════════════════════════════════════════════
      // FORENSIC AUDIT FIX v8.0: Prevent mixed-language options
      // When causeLabel is empty (no regional translation), prefer observationLabel.
      // If observationLabel is also English for a non-English user, format h.cause
      // as human-readable instead of raw UPPERCASE_CODE.
      // ═══════════════════════════════════════════════════════════════
      let finalCauseLabel = causeLabel || observationLabel;
      if (!finalCauseLabel || finalCauseLabel === h.cause) {
        // Last resort: format the English cause as readable text
        finalCauseLabel = h.cause
          .replace(/_/g, ' ')
          .split(' ')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }
      
      // ALL_CAPS LABEL GATE: If labels are still raw technical codes, humanize them
      const isRawCode = (s: string) => /^[A-Z][A-Z_]{3,}$/.test(s);
      if (isRawCode(finalCauseLabel)) {
        finalCauseLabel = finalCauseLabel.replace(/_/g, ' ').split(' ')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      if (isRawCode(observationLabel)) {
        observationLabel = observationLabel.replace(/_/g, ' ').split(' ')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      
      return {
        id: `diag_${idx}_${h.rule_id}`,
        cause: h.cause,
        cause_label: finalCauseLabel,
        canonical_group: h.canonical_group,
        observation_key: observationKey,
        observation_label: observationLabel,
        confidence: h.total_score,
        priority: h.priority,
        icon: getGroupIcon(h.canonical_group),
        rule_id: h.rule_id
      };
    })
  );
  
  // ═══════════════════════════════════════════════════════════════
  // SAFETY GUARD: Filter out diagnoses with synthetic/invalid observation keys.
  // Valid keys are short uppercase codes (e.g., LEAF_YELLOWING, DEAD_HEART_PRESENT).
  // Invalid keys are truncated sentences from cause field (e.g., ZINC_DEFICIENCY_CAUSES_CHLOROS).
  // ═══════════════════════════════════════════════════════════════
  const KNOWN_VALID_LONG_KEYS = new Set(['INTERVEINAL_CHLOROSIS', 'DEAD_HEART_PRESENT', 'STEM_BORING_MARKS', 'WATERLOGGING_DAMAGE', 'HONEYDEW_PRESENT']);
  
  const filteredDiagnoses = diagnoses.filter(d => {
    const key = d.observation_key;
    if (key === 'VISUAL_CHECK') return true; // Always valid
    if (KNOWN_VALID_LONG_KEYS.has(key)) return true;
    // Reject keys that look like truncated sentences (>25 chars, no DB match)
    if (key.length > 25 && !observationLabelsMap.has(key)) {
      console.log(`   🚫 Filtered out invalid observation key: "${key}" (from cause: "${d.cause}")`);
      return false;
    }
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: Deduplicate options by observation_key.
  // Multiple hypotheses can produce the same observation_key (e.g., NUTRIENT_DEFICIENCY),
  // causing duplicate options in the farmer UI. Keep the highest-priority one.
  // ═══════════════════════════════════════════════════════════════
  const seenObservationKeys = new Map<string, DiagnosisOption>();
  const validatedDiagnoses: DiagnosisOption[] = [];
  
  for (const d of filteredDiagnoses) {
    const key = d.observation_key.toUpperCase();
    const existing = seenObservationKeys.get(key);
    
    if (!existing) {
      seenObservationKeys.set(key, d);
      validatedDiagnoses.push(d);
    } else {
      // Keep the one with higher priority (lower number) or higher confidence
      if (d.priority < existing.priority || (d.priority === existing.priority && d.confidence > existing.confidence)) {
        // Replace existing
        const idx = validatedDiagnoses.indexOf(existing);
        if (idx >= 0) validatedDiagnoses[idx] = d;
        seenObservationKeys.set(key, d);
        console.log(`   🔄 Dedup: Replaced "${existing.cause}" with "${d.cause}" for key ${key} (higher priority)`);
      } else {
        console.log(`   🔄 Dedup: Skipped "${d.cause}" - already have "${existing.cause}" for key ${key}`);
      }
    }
  }
  
  if (filteredDiagnoses.length !== validatedDiagnoses.length) {
    console.log(`   🔄 [Dedup] Removed ${filteredDiagnoses.length - validatedDiagnoses.length} duplicate options by observation_key`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FORENSIC AUDIT FIX v8.0: Second dedup layer by cause_label
  // Even after observation_key dedup, different observation keys can produce
  // the same farmer-facing label (e.g., "NUTRIENT DEFICIENCY" from NUTRIENT_DEFICIENCY
  // and YELLOWING keys). Dedup by normalized cause_label to prevent UI duplicates.
  // ═══════════════════════════════════════════════════════════════
  const seenCauseLabels = new Map<string, DiagnosisOption>();
  const labelDedupedDiagnoses: DiagnosisOption[] = [];
  
  for (const d of validatedDiagnoses) {
    const normalizedLabel = d.cause_label
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    
    const existing = seenCauseLabels.get(normalizedLabel);
    if (!existing) {
      seenCauseLabels.set(normalizedLabel, d);
      labelDedupedDiagnoses.push(d);
    } else {
      // Keep higher priority / higher confidence
      if (d.priority < existing.priority || (d.priority === existing.priority && d.confidence > existing.confidence)) {
        const idx = labelDedupedDiagnoses.indexOf(existing);
        if (idx >= 0) labelDedupedDiagnoses[idx] = d;
        seenCauseLabels.set(normalizedLabel, d);
        console.log(`   🔄 [LabelDedup] Replaced "${existing.cause_label}" with "${d.cause_label}" for label "${normalizedLabel}"`);
      } else {
        console.log(`   🔄 [LabelDedup] Skipped "${d.cause_label}" - already have "${existing.cause_label}" for label "${normalizedLabel}"`);
      }
    }
  }
  
  if (validatedDiagnoses.length !== labelDedupedDiagnoses.length) {
    console.log(`   🔄 [LabelDedup] Removed ${validatedDiagnoses.length - labelDedupedDiagnoses.length} duplicate options by cause_label`);
  }

  // ═══════════════════════════════════════════════════════════════
  // FARMER-OBSERVABLE ONTOLOGY GATE (Phase X.2 — definitive enforcement)
  // Drop any option whose observation_key is NOT in observation_master
  // (i.e., diagnosis codes like TUNGRO_YELLOW_STUNT leaking from rules).
  // The PHOTO option and the always-valid VISUAL_CHECK key bypass the gate.
  // ═══════════════════════════════════════════════════════════════
  let ontologyGatedDiagnoses = labelDedupedDiagnoses;
  if (supabaseClient && labelDedupedDiagnoses.length > 0) {
    try {
      const candidateKeys = labelDedupedDiagnoses
        .map(d => d.observation_key)
        .filter(k => k && k !== 'VISUAL_CHECK');
      if (candidateKeys.length > 0) {
        const gate = await assertFarmerObservable(supabaseClient, candidateKeys, {
          source: 'DIAGNOSIS_FIRST_GENERATOR',
          crop_code,
          stage: growth_stage,
          rule_ids: labelDedupedDiagnoses.map(d => d.rule_id),
          trace_id: traceIdFinal,
        });
        const valid = gate.validKeys;
        ontologyGatedDiagnoses = labelDedupedDiagnoses.filter(d => {
          const key = (d.observation_key || '').toUpperCase();
          if (key === 'VISUAL_CHECK') return true;
          if (valid.has(key)) return true;
          console.warn(`   🚫 [OntologyGate] Dropping diagnosis-leak option: cause="${d.cause}" observation_key="${key}" rule=${d.rule_id}`);
          return false;
        });
        if (ontologyGatedDiagnoses.length !== labelDedupedDiagnoses.length) {
          console.log(`   🚪 [OntologyGate] Kept ${ontologyGatedDiagnoses.length}/${labelDedupedDiagnoses.length} options (dropped ${labelDedupedDiagnoses.length - ontologyGatedDiagnoses.length} non-farmer-observable)`);
        }
      }
    } catch (gateErr) {
      console.warn(`   ⚠️ [OntologyGate] Validation failed, passing through: ${gateErr}`);
    }
  }

  // Generate photo option (ALWAYS present)
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: PHOTO_LABEL.label,
    icon: '📷',
    description: PHOTO_LABEL.description
  };

  // Generate question text
  const questionText = getQuestionText(ontologyGatedDiagnoses, language);

  console.log(`   ✅ Generated ${ontologyGatedDiagnoses.length} diagnosis options (filtered from ${diagnoses.length}) + photo option`);
  console.log(`   Question: "${questionText.substring(0, 60)}..."`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: questionText,
    diagnoses: ontologyGatedDiagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: hypotheses.length,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Create UNKNOWN diagnosis when no rules match.
 * This is a formal positive output - we NEVER suppress output when crop damage exists.
 */
export function createUnknownDiagnosisResponse(
  crop_code: string,
  growth_stage: string,
  damage_observations: string[],
  language: string,
  trace_id?: string
): DiagnosisFirstOutput {
  const traceIdFinal = trace_id || `unknown_${Date.now()}`;
  
  console.log(`\n🔍 [DiagnosisFirst] Creating UNKNOWN diagnosis response`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Damage observed: ${damage_observations.join(', ')}`);
  
  // English-only — LLM narration layer translates at runtime
  const questionText = '🔍 Your crop has an issue but we need more information to identify the exact cause.';
  
  // English-only labels — LLM translates at runtime
  const labels = {
    water: 'Water issue (too much/too little)',
    pest: 'Pest/insect attack',
    nutrient: 'Nutrient deficiency'
  };
  
  // v1.3.0: CLEAN labels - NO embedded [obs_keys:...] metadata
  // The observation_key field carries routing info separately
  const diagnoses: DiagnosisOption[] = [
    {
      id: 'unknown_water',
      cause: 'water_issue',
      cause_label: labels.water,  // CLEAN: No metadata in display label
      canonical_group: 'stress',
      observation_key: 'WATER_STRESS_CHECK',
      observation_label: labels.water,
      confidence: 0.3,
      priority: 1,
      icon: '💧',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_pest',
      cause: 'pest_issue',
      cause_label: labels.pest,  // CLEAN: No metadata in display label
      canonical_group: 'pest',
      observation_key: 'PEST_CHECK',
      observation_label: labels.pest,
      confidence: 0.3,
      priority: 2,
      icon: '🐛',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_nutrient',
      cause: 'nutrient_issue',
      cause_label: labels.nutrient,  // CLEAN: No metadata in display label
      canonical_group: 'deficiency',
      observation_key: 'NUTRIENT_CHECK',
      observation_label: labels.nutrient,
      confidence: 0.3,
      priority: 3,
      icon: '🌿',
      rule_id: 'UNKNOWN_FALLBACK'
    }
  ];
  
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: PHOTO_LABEL.label,
    icon: '📷',
    description: PHOTO_LABEL.description
  };
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: questionText,
    diagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: 0,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Format DiagnosisFirstOutput for ClarificationOptionsUI.
 * Converts to the format expected by the frontend.
 * 
 * v1.1.1: FIX - Prevent duplicate text in labels by checking for similarity
 * between cause_label and observation_label before combining them.
 */
export function formatForClarificationUI(
  output: DiagnosisFirstOutput
): {
  type: 'CLARIFICATION_QUESTION';
  orchestratorType: 'DIAGNOSTIC_CONFIRMATION';
  question: string;
  options: Array<{
    id: string;
    label: string;
    observation_key: string;
    rule_id: string;
    confidence_boost: number;
    icon?: string;
    cause?: string;
  }>;
  selectionType: 'single_choice';
  maxSelections: 1;
  metadata: {
    source: string;
    mode: string;
    crop_code: string;
    growth_stage: string;
  };
} {
  // Helper: Check if two labels are similar (would cause duplication)
  const areLabelsSimilar = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    const normA = a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
    const normB = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
    // Check for substring containment or high overlap
    if (normA === normB) return true;
    if (normA.includes(normB) || normB.includes(normA)) return true;
    // Check for >70% character overlap using Jaccard-like similarity
    const setA = new Set(normA.split(''));
    const setB = new Set(normB.split(''));
    const intersection = [...setA].filter(c => setB.has(c)).length;
    const union = new Set([...setA, ...setB]).size;
    return union > 0 && (intersection / union) > 0.7;
  };

  // Convert diagnoses to clarification options format
  // FIX: Avoid duplication when cause_label and observation_label are similar
  // v1.3.0: CLEAN labels - NO embedded [obs_keys:...] metadata in display
  // Frontend uses observation_key field for routing when farmer selects option
  const options = output.diagnoses.map(d => {
    let displayLabel: string;
    
    // If cause_label already contains observation_label or they're very similar, use only cause_label
    if (areLabelsSimilar(d.cause_label, d.observation_label)) {
      // Only use cause_label (with icon) - CLEAN, no metadata
      displayLabel = `${d.icon} ${d.cause_label}`;
    } else {
      // Combine both (no duplication) - CLEAN, no metadata
      displayLabel = `${d.icon} ${d.cause_label} (${d.observation_label})`;
    }
    
    // v2.1.0: Return CLEAN label for farmer UI
      // FIX #1: Embed cause + rule_id in observation_key metadata so orchestrator
      // can bypass generic observation matching when farmer confirms a diagnosis
      // Frontend (ClarificationOptionsUI) will use observation_key when sending selection
      return {
        id: d.id,
        label: displayLabel,  // CLEAN: Farmer sees only readable text
        observation_key: d.observation_key,  // ROUTING: Backend uses this for rule matching
        rule_id: d.rule_id,
        confidence_boost: 0.20,  // Standard boost for confirmed diagnosis option
        icon: d.icon,
        cause: d.cause
      };
  });
  
  // Add photo option at end - CLEAN label, observation_key for routing
  options.push({
    id: output.photo_option.id,
    label: output.photo_option.label,  // CLEAN: No metadata in display
    observation_key: 'PHOTO_UPLOAD',  // ROUTING: Used by frontend for camera trigger
    rule_id: 'PHOTO_FALLBACK',
    confidence_boost: 0.25,
    icon: output.photo_option.icon
  });
  
  return {
    type: 'CLARIFICATION_QUESTION',
    orchestratorType: 'DIAGNOSTIC_CONFIRMATION',
    question: output.question_text,
    options,
    selectionType: 'single_choice',
    maxSelections: 1,
    metadata: {
      source: output.source,
      mode: output.mode,
      crop_code: output.crop_code,
      growth_stage: output.growth_stage
    }
  };
}
