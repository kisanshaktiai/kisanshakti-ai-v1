/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGE 4: UNDERSTANDING COMPLETENESS CHECKER (SYMBOLIC - NO LLM)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * MASTER PROMPT v3 - Stage 4
 * 
 * PURPOSE:
 * Symbolically (WITHOUT LLM) evaluate if we have enough information
 * to proceed with diagnosis and prescription.
 * 
 * REFACTORED: Phase-1 SSOT Compliance
 * - Removed hardcoded Marathi/Hindi/English urgency keywords
 * - Now uses pre-extracted urgency flags from Language Induction Layer
 * - Language-agnostic vague term detection using canonical patterns
 * 
 * RULES:
 * - Pure deterministic logic, no AI inference
 * - Returns structured result indicating what's missing
 * - If understanding insufficient → CLARIFY action
 * - Clarification questions come from database, not LLM
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ObservationExtraction } from './observation-extractor.ts';
import { isDiagnosticEntryObservation } from '../decision/diagnosis-only-mode.ts';

export const UNDERSTANDING_CHECKER_VERSION = '2.1.0'; // diagnostic-entry bypass

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export enum UnderstandingConfidence {
  VERY_LOW = 'VERY_LOW',   // < 2 critical fields known
  LOW = 'LOW',             // 2-3 critical fields known
  MEDIUM = 'MEDIUM',       // 4-5 critical fields known
  HIGH = 'HIGH'            // 6+ critical fields known
}

export interface UnderstandingCheckResult {
  /**
   * Overall understanding confidence level
   */
  understanding_confidence: UnderstandingConfidence;
  
  /**
   * List of critical fields that are UNKNOWN
   */
  unknown_critical_fields: string[];
  
  /**
   * Any contradictions detected in observations
   */
  contradiction_detected: string[];
  
  /**
   * Whether clarification is required before proceeding
   */
  clarification_required: boolean;
  
  /**
   * Specific reason why clarification is needed
   */
  clarification_reason?: string;
  
  /**
   * What specific information is missing for diagnosis
   */
  missing_for_diagnosis: string[];
  
  /**
   * Score 0-100 for debugging/auditing
   */
  completeness_score: number;
  
  /**
   * Priority of missing information (what to ask first)
   */
  clarification_priority: 'crop' | 'symptom' | 'severity' | 'location' | 'timing' | 'none';
  
  /**
   * Whether diagnosis rules have fired (used to gate clarification options)
   */
  diagnosis_rules_fired: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL FIELDS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

interface CriticalFieldCheck {
  field: string;
  weight: number;
  description: string;
  isKnown: (obs: ObservationExtraction, landContext?: any) => boolean;
}

const CRITICAL_FIELDS: CriticalFieldCheck[] = [
  {
    field: 'crop_mentioned',
    weight: 25,
    description: 'Which crop is affected',
    isKnown: (obs, land) => 
      (obs.crop_mentioned !== undefined && obs.crop_mentioned !== '') || 
      (land?.current_crop !== undefined && land.current_crop !== '')
  },
  {
    field: 'affected_part',
    weight: 15,
    description: 'Which part of plant is affected',
    isKnown: (obs) => obs.affected_part !== 'unknown'
  },
  {
    field: 'raw_symptom_text',
    weight: 25,
    description: 'What symptoms are described',
    isKnown: (obs) => obs.raw_symptom_text.length > 0 && obs.raw_symptom_text[0].length > 5
  },
  {
    field: 'symptom_distribution',
    weight: 10,
    description: 'How symptoms are distributed',
    isKnown: (obs) => obs.symptom_distribution !== 'unknown'
  },
  {
    field: 'severity_words',
    weight: 10,
    description: 'How severe is the problem',
    isKnown: (obs) => obs.severity_words.length > 0
  },
  {
    field: 'time_reference',
    weight: 10,
    description: 'When did the problem start',
    isKnown: (obs) => obs.time_reference !== undefined && obs.time_reference !== ''
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// VAGUE SYMPTOM DETECTION - CANONICAL OBSERVATION CODES
// Uses canonical pest/disease observation patterns, NOT language strings
// ═══════════════════════════════════════════════════════════════════════════

const VAGUE_OBSERVATION_CODES = new Set([
  // Generic pest codes that need clarification
  'INSECT_PRESENT',
  'PEST_DAMAGE',
  'INSECT_VISIBLE',
  'CATERPILLAR_VISIBLE',
  'LARVAE_VISIBLE',
  
  // Generic disease codes that need clarification
  'DISEASE_SYMPTOM',
  'LEAF_SPOTS',
  'FUNGAL_GROWTH',
  'WILT_DISEASE',
  
  // Generic stress codes
  'UNKNOWN_PROBLEM',
  'GENERAL_STRESS',
  'VISUAL_DAMAGE'
]);

/**
 * Detects if symptoms are vague and need clarification to distinguish
 * between multiple possible diagnoses.
 * 
 * SSOT-COMPLIANT: Uses canonical observation codes, not language strings
 * 
 * Returns true if:
 * 1. A vague observation code is present
 * 2. Fewer than 2 distinguishing features are present
 */
export function detectSymptomAmbiguity(observations: ObservationExtraction): boolean {
  // Check if any extracted observation codes are vague
  const observationCodes = observations.extracted_observations || [];
  const hasVagueObservation = observationCodes.some(code => 
    VAGUE_OBSERVATION_CODES.has(code.toUpperCase())
  );
  
  if (!hasVagueObservation) {
    return false; // Specific observation codes - not ambiguous
  }
  
  // Vague observation found - check for distinguishing features in canonical state
  const hasColor = observations.color_mentioned && observations.color_mentioned.length > 0;
  const hasSize = observations.size_mentioned !== undefined;
  const hasBehavior = observations.behavior_mentioned !== undefined;
  const hasSpecificLocation = observations.affected_part !== 'unknown' && 
                              observations.affected_part !== 'whole' &&
                              observations.affected_part !== '';
  const hasSecondarySymptom = observations.secondary_symptoms && observations.secondary_symptoms.length > 0;
  
  // Count distinguishing features
  const featureCount = [hasColor, hasSize, hasBehavior, hasSpecificLocation, hasSecondarySymptom]
    .filter(Boolean).length;
  
  // Need at least 2 distinguishing features for vague observations
  const isAmbiguous = featureCount < 2;
  
  if (isAmbiguous) {
    console.log(`   ⚠️ [AmbiguityDetector v${UNDERSTANDING_CHECKER_VERSION}] Vague observations without distinguishing features`);
    console.log(`      Features present: ${featureCount}/5 (color:${hasColor}, size:${hasSize}, behavior:${hasBehavior}, location:${hasSpecificLocation}, secondary:${hasSecondarySymptom})`);
  }
  
  return isAmbiguous;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRADICTION DETECTION - USING CANONICAL FLAGS
// ═══════════════════════════════════════════════════════════════════════════

function detectContradictions(obs: ObservationExtraction): string[] {
  const contradictions: string[] = [];
  
  // Use canonical flags from Language Induction Layer instead of language strings
  const healthyFlag = obs.plant_healthy === true;
  const dyingFlag = obs.plant_dying === true;
  const noProblemFlag = obs.no_problem_mentioned === true;
  const hasDamageObs = (obs.extracted_observations || []).some(code => 
    code.includes('DAMAGE') || code.includes('DEATH') || code.includes('ATTACK')
  );
  const hasSeverity = obs.severity_words && obs.severity_words.length > 0;
  const isJustStarted = obs.timing_just_started === true;
  const isSevere = obs.severity_level === 'SEVERE' || obs.severity_level === 'CRITICAL';
  
  // Contradiction: healthy + dying
  if (healthyFlag && dyingFlag) {
    contradictions.push('Contradictory: plant described as both healthy and dying');
  }
  
  // Contradiction: "no problem" + damage observations
  if (noProblemFlag && (hasDamageObs || hasSeverity)) {
    contradictions.push('Contradictory: says no problem but describes damage');
  }
  
  // Contradiction: "just started" + "very severe"
  if (isJustStarted && isSevere) {
    contradictions.push('Contradictory: just started but very severe (unusual progression)');
  }
  
  return contradictions;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateConfidenceLevel(score: number, unknownCount: number): UnderstandingConfidence {
  if (unknownCount >= 4 || score < 25) {
    return UnderstandingConfidence.VERY_LOW;
  }
  if (unknownCount >= 3 || score < 50) {
    return UnderstandingConfidence.LOW;
  }
  if (unknownCount >= 2 || score < 75) {
    return UnderstandingConfidence.MEDIUM;
  }
  return UnderstandingConfidence.HIGH;
}

function determineClarificationPriority(unknownFields: string[]): 'crop' | 'symptom' | 'severity' | 'location' | 'timing' | 'none' {
  // Priority order based on what's most critical for diagnosis
  const priorityOrder = [
    { fields: ['crop_mentioned'], priority: 'crop' as const },
    { fields: ['raw_symptom_text', 'affected_part'], priority: 'symptom' as const },
    { fields: ['severity_words'], priority: 'severity' as const },
    { fields: ['symptom_distribution'], priority: 'location' as const },
    { fields: ['time_reference'], priority: 'timing' as const }
  ];
  
  for (const { fields, priority } of priorityOrder) {
    if (fields.some(f => unknownFields.includes(f))) {
      return priority;
    }
  }
  
  return 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY DETECTION - USING CANONICAL FLAGS
// SSOT-COMPLIANT: Uses pre-extracted urgency flag, NOT language keywords
// ═══════════════════════════════════════════════════════════════════════════

function detectUrgency(observations: ObservationExtraction): boolean {
  // Use urgency flag from Language Induction Layer (already extracted)
  if (observations.is_urgent === true) {
    return true;
  }
  
  // Check for terminal observation codes
  const terminalCodes = new Set([
    'PLANT_DEATH',
    'SEEDLING_DEATH',
    'CROP_DYING',
    'WILT_TERMINAL',
    'DRYING_SEVERE',
    'WITHERING_SEVERE'
  ]);
  
  const extractedCodes = observations.extracted_observations || [];
  for (const code of extractedCodes) {
    if (terminalCodes.has(code.toUpperCase())) {
      return true;
    }
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHECKER FUNCTION - WITH ADAPTIVE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export function checkUnderstandingCompleteness(
  observations: ObservationExtraction,
  landContext?: {
    current_crop?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    area_acres?: number;
  }
): UnderstandingCheckResult {
  const unknownCriticalFields: string[] = [];
  const missingForDiagnosis: string[] = [];
  let totalScore = 0;
  let maxScore = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX (Phase-24): DIAGNOSTIC-ENTRY SHORT-CIRCUIT
  // For germination/emergence/establishment observations, fields like
  // affected_part / symptom_distribution / severity_words / time_reference
  // are by definition N/A (the crop hasn't emerged yet — there is no
  // "affected leaf area" to describe). The Understanding Gate must NOT
  // demand those metadata and block the symbolic brain.
  // ═══════════════════════════════════════════════════════════════════════════
  const extractedCodes = observations.extracted_observations || [];
  const entryCodesPresent = extractedCodes.filter(c => isDiagnosticEntryObservation(c));
  const cropKnown =
    (observations.crop_mentioned !== undefined && observations.crop_mentioned !== '') ||
    (landContext?.current_crop !== undefined && landContext.current_crop !== '');

  if (entryCodesPresent.length > 0 && cropKnown) {
    console.log(
      `   ✅ [UnderstandingChecker v${UNDERSTANDING_CHECKER_VERSION}] DIAGNOSTIC_ENTRY bypass — ` +
      `crop="${observations.crop_mentioned || landContext?.current_crop}" ` +
      `entry_codes=[${entryCodesPresent.join(',')}]`
    );
    console.log(
      `      → Skipping affected_part/distribution/severity/timing penalties; symbolic brain must run.`
    );
    return {
      understanding_confidence: UnderstandingConfidence.HIGH,
      unknown_critical_fields: [],
      contradiction_detected: detectContradictions(observations),
      clarification_required: false,
      clarification_reason: undefined,
      missing_for_diagnosis: [],
      completeness_score: 100,
      clarification_priority: 'none',
      diagnosis_rules_fired: false
    };
  }

  
  // Check each critical field
  for (const field of CRITICAL_FIELDS) {
    maxScore += field.weight;
    const isKnown = field.isKnown(observations, landContext);
    
    if (isKnown) {
      totalScore += field.weight;
    } else {
      unknownCriticalFields.push(field.field);
      missingForDiagnosis.push(field.description);
    }
  }
  
  // Calculate completeness score as percentage
  const completenessScore = Math.round((totalScore / maxScore) * 100);
  
  // Detect contradictions using canonical flags
  const contradictions = detectContradictions(observations);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX (Issue #3): ADAPTIVE THRESHOLDS based on urgency & context
  // ═══════════════════════════════════════════════════════════════════════════
  
  const isUrgent = detectUrgency(observations);
  const hasCropAndSymptom = (observations.crop_mentioned || landContext?.current_crop) && 
                            observations.raw_symptom_text.length > 0;
  const hasDistribution = observations.symptom_distribution !== 'unknown';
  
  // Calculate adaptive threshold
  let requiredThreshold = 70; // Default: 70% confidence required
  
  // LOWER threshold for urgent queries (dying crop = need immediate advice)
  if (isUrgent) {
    requiredThreshold = 50;
    console.log(`   ⚡ [UnderstandingChecker v${UNDERSTANDING_CHECKER_VERSION}] URGENCY detected - lowering threshold to 50%`);
  }
  // LOWER threshold if we have crop + symptom + distribution (enough for diagnosis)
  else if (hasCropAndSymptom && hasDistribution) {
    requiredThreshold = 55;
    console.log(`   ✅ [UnderstandingChecker] Sufficient context (crop+symptom+distribution) - lowering threshold to 55%`);
  }
  // LOWER threshold if we have crop + symptom (minimum for rule matching)
  else if (hasCropAndSymptom) {
    requiredThreshold = 60;
    console.log(`   ℹ️ [UnderstandingChecker] Basic context (crop+symptom) - lowering threshold to 60%`);
  }
  
  // Determine confidence level using ADAPTIVE threshold
  const confidenceLevel = calculateConfidenceLevel(completenessScore, unknownCriticalFields.length);
  
  // ADAPTIVE clarification decision
  let clarificationRequired = 
    (completenessScore < requiredThreshold && !isUrgent) || // Don't clarify if urgent
    contradictions.length > 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Force clarification for vague pest/disease symptoms
  // This catches cases with vague observations that need clarification to 
  // distinguish between aphids, whiteflies, thrips, jassids, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  if (!clarificationRequired && !isUrgent) {
    const isAmbiguous = detectSymptomAmbiguity(observations);
    if (isAmbiguous) {
      console.log(`   🔍 [AmbiguityOverride] Forcing clarification for vague pest/disease symptoms`);
      clarificationRequired = true;
    }
  }
  
  console.log(`   📊 [UnderstandingChecker] Score: ${completenessScore}%, Threshold: ${requiredThreshold}%, ` +
              `Urgent: ${isUrgent}, ClarificationRequired: ${clarificationRequired}`);
  
  // Generate clarification reason
  let clarificationReason: string | undefined;
  if (contradictions.length > 0) {
    clarificationReason = `Contradictory information: ${contradictions[0]}`;
  } else if (clarificationRequired) {
    clarificationReason = `Missing critical information: ${missingForDiagnosis.slice(0, 2).join(', ')}`;
  }
  
  return {
    understanding_confidence: confidenceLevel,
    unknown_critical_fields: unknownCriticalFields,
    contradiction_detected: contradictions,
    clarification_required: clarificationRequired,
    clarification_reason: clarificationReason,
    missing_for_diagnosis: missingForDiagnosis,
    completeness_score: completenessScore,
    clarification_priority: determineClarificationPriority(unknownCriticalFields),
    diagnosis_rules_fired: false // Will be set by the orchestrator after rule evaluation
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  checkUnderstandingCompleteness,
  detectSymptomAmbiguity,
  UNDERSTANDING_CHECKER_VERSION
};
