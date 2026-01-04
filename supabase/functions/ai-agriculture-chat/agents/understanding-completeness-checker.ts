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
 * RULES:
 * - Pure deterministic logic, no AI inference
 * - Returns structured result indicating what's missing
 * - If understanding insufficient → CLARIFY action
 * - Clarification questions come from database, not LLM
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ObservationExtraction } from './observation-extractor.ts';

export const UNDERSTANDING_CHECKER_VERSION = '1.0.0';

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
// CONTRADICTION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function detectContradictions(obs: ObservationExtraction): string[] {
  const contradictions: string[] = [];
  const text = obs.raw_symptom_text.join(' ').toLowerCase();
  
  // Contradiction: "healthy" + "dying"
  if ((text.includes('healthy') || text.includes('चांगले') || text.includes('अच्छा')) &&
      (text.includes('dying') || text.includes('मरत') || text.includes('मर रहा'))) {
    contradictions.push('Contradictory: plant described as both healthy and dying');
  }
  
  // Contradiction: "no problem" + symptom descriptions
  if ((text.includes('no problem') || text.includes('काही नाही') || text.includes('कुछ नहीं')) &&
      (obs.severity_words.length > 0 || text.includes('damage') || text.includes('attack'))) {
    contradictions.push('Contradictory: says no problem but describes damage');
  }
  
  // Contradiction: "just started" + "very severe"
  if ((text.includes('just started') || text.includes('नुकतेच') || text.includes('अभी शुरू')) &&
      obs.severity_words.some(w => ['severe', 'भयंकर', 'गंभीर', 'बहुत'].includes(w.toLowerCase()))) {
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
// MAIN CHECKER FUNCTION
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
  
  // Detect contradictions
  const contradictions = detectContradictions(observations);
  
  // Determine confidence level
  const confidenceLevel = calculateConfidenceLevel(completenessScore, unknownCriticalFields.length);
  
  // Determine if clarification is required
  // Clarify if: VERY_LOW or LOW confidence, or contradictions exist
  const clarificationRequired = 
    confidenceLevel === UnderstandingConfidence.VERY_LOW ||
    confidenceLevel === UnderstandingConfidence.LOW ||
    contradictions.length > 0;
  
  // Generate clarification reason
  let clarificationReason: string | undefined;
  if (contradictions.length > 0) {
    clarificationReason = `Contradictory information: ${contradictions[0]}`;
  } else if (clarificationRequired) {
    const priority = determineClarificationPriority(unknownCriticalFields);
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
    diagnosis_rules_fired: false // Will be updated by orchestrator if rules fire
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTION GATE - BLOCKS ACTIONS IF UNDERSTANDING INSUFFICIENT
// ═══════════════════════════════════════════════════════════════════════════

export interface PrescriptionGateResult {
  can_prescribe: boolean;
  reason?: string;
  allowed_actions: ('PRESCRIBE' | 'CLARIFY' | 'MONITOR' | 'ESCALATE')[];
  blocked_because: string[];
}

export function checkPrescriptionGate(
  understandingResult: UnderstandingCheckResult,
  dataConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
): PrescriptionGateResult {
  const blockedReasons: string[] = [];
  const allowedActions: ('PRESCRIBE' | 'CLARIFY' | 'MONITOR' | 'ESCALATE')[] = [];
  
  // Check understanding confidence
  const understandingLow = 
    understandingResult.understanding_confidence === UnderstandingConfidence.VERY_LOW ||
    understandingResult.understanding_confidence === UnderstandingConfidence.LOW;
  
  if (understandingLow) {
    blockedReasons.push(`Understanding confidence is ${understandingResult.understanding_confidence}`);
    allowedActions.push('CLARIFY');
  }
  
  // Check data confidence
  if (dataConfidence === 'LOW' || dataConfidence === 'UNKNOWN') {
    blockedReasons.push(`Data confidence is ${dataConfidence}`);
    if (!allowedActions.includes('CLARIFY')) {
      allowedActions.push('CLARIFY');
    }
    allowedActions.push('MONITOR');
  }
  
  // Check for contradictions
  if (understandingResult.contradiction_detected.length > 0) {
    blockedReasons.push(`Contradictions detected: ${understandingResult.contradiction_detected[0]}`);
    if (!allowedActions.includes('CLARIFY')) {
      allowedActions.push('CLARIFY');
    }
  }
  
  // Determine if prescription is allowed
  const canPrescribe = blockedReasons.length === 0;
  
  if (canPrescribe) {
    allowedActions.push('PRESCRIBE');
    allowedActions.push('MONITOR');
  }
  
  // Always allow escalation for complex cases
  if (!canPrescribe && understandingResult.completeness_score > 30) {
    allowedActions.push('ESCALATE');
  }
  
  return {
    can_prescribe: canPrescribe,
    reason: blockedReasons.length > 0 ? blockedReasons.join('; ') : undefined,
    allowed_actions: allowedActions,
    blocked_because: blockedReasons
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  checkUnderstandingCompleteness,
  checkPrescriptionGate,
  UnderstandingConfidence,
  UNDERSTANDING_CHECKER_VERSION
};
