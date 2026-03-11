/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC HYPOTHESIS MANAGEMENT TYPES v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Types for managing multiple diagnostic hypotheses with:
 * - Confidence tracking and Bayesian updates
 * - Evidence management (supporting/contradicting)
 * - Multi-cause scenario handling
 * - Smart question selection with information gain
 */

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC HYPOTHESIS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticHypothesis {
  /** Unique identifier for this hypothesis */
  hypothesis_id: string;
  /** Session this belongs to */
  session_id: string;
  /** Type of cause: PEST, DISEASE, NUTRIENT, WATER, OTHER */
  cause_type: CauseType;
  /** Canonical code: APHID, NITROGEN_DEFICIENCY, etc. */
  cause_code: string;
  /** Local name in Marathi/Hindi for farmer communication */
  cause_name_mr?: string;
  cause_name_hi?: string;
  cause_name_en?: string;
  /** Current confidence score (0.0 to 1.0) */
  confidence: number;
  /** Initial confidence when hypothesis was created */
  initial_confidence: number;
  /** Current status based on confidence thresholds */
  status: HypothesisStatus;
  /** Evidence supporting this hypothesis */
  evidence_for: Evidence[];
  /** Evidence contradicting this hypothesis */
  evidence_against: Evidence[];
  /** Related hypotheses (e.g., APHID causes SOOTY_MOLD) */
  related_hypotheses?: RelatedHypothesis[];
  /** Questions that have been asked to evaluate this hypothesis */
  questions_asked: string[];
  /** Remaining questions that could further confirm/eliminate */
  questions_available: string[];
  /** Created timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

export type CauseType = 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'ENVIRONMENTAL' | 'MECHANICAL' | 'OTHER';

export type HypothesisStatus = 
  | 'SUSPECTED'    // 0.20 - 0.50 confidence
  | 'LIKELY'       // 0.50 - 0.75 confidence
  | 'CONFIRMED'    // > 0.75 confidence
  | 'ELIMINATED';  // < 0.20 confidence

export interface Evidence {
  evidence_id: string;
  source: EvidenceSource;
  description: string;
  description_mr?: string;
  description_hi?: string;
  impact: 'STRONG_SUPPORT' | 'MODERATE_SUPPORT' | 'WEAK_SUPPORT' | 'NEUTRAL' | 'WEAK_CONTRADICT' | 'MODERATE_CONTRADICT' | 'STRONG_CONTRADICT';
  confidence_delta: number; // How much this changed confidence (+/-)
  timestamp: string;
}

export type EvidenceSource = 
  | 'FARMER_DESCRIPTION'
  | 'FARMER_ANSWER'
  | 'PHOTO_ANALYSIS'
  | 'SENSOR_DATA'
  | 'WEATHER_DATA'
  | 'HISTORICAL_DATA'
  | 'CROP_STAGE'
  | 'EXPERT_INPUT';

export interface RelatedHypothesis {
  hypothesis_id: string;
  relationship: HypothesisRelationship;
  /** If PRIMARY_CAUSES_SECONDARY, treating primary resolves secondary */
  primary_treatment_resolves: boolean;
}

export type HypothesisRelationship = 
  | 'PRIMARY_CAUSES_SECONDARY'  // e.g., Aphid → Sooty Mold
  | 'OFTEN_COOCCUR'            // e.g., Aphid + Whitefly
  | 'MUTUALLY_EXCLUSIVE'       // e.g., Aphid vs Whitefly (similar symptoms, different pest)
  | 'AGGRAVATES'               // e.g., Water stress makes pest damage worse
  | 'INDEPENDENT';             // No relationship

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticQuestion {
  question_id: string;
  /** Which hypothesis(es) this question helps evaluate */
  hypothesis_targeted: string[];
  /** Question text in multiple languages */
  /** @deprecated Use question_text_en — LLM translates at runtime */
  question_text_mr: string;
  /** @deprecated Use question_text_en — LLM translates at runtime */
  question_text_hi: string;
  question_text_en: string;
  /** Type of expected answer */
  question_type: QuestionType;
  /** Multiple choice options (if applicable) */
  options?: QuestionOption[];
  /** What answer would we expect if hypothesis is true */
  expected_answer_if_true: string;
  /** What answer would eliminate the hypothesis */
  answer_that_eliminates?: string;
  /** How much information does this question provide (0-1) */
  information_gain: number;
  /** Question category for organization */
  category: QuestionCategory;
  /** Priority for asking this question */
  ask_priority: number;
  /** Skip this question if farmer is stressed/urgent */
  skip_if_urgent: boolean;
  /** Prerequisite questions that must be answered first */
  prerequisite_questions?: string[];
}

export type QuestionType = 'YES_NO' | 'MULTIPLE_CHOICE' | 'NUMERIC' | 'PERCENTAGE' | 'DESCRIPTIVE' | 'DATE';

export interface QuestionOption {
  value: string;
  label_mr: string;
  label_hi: string;
  label_en: string;
  /** If this option is selected, what happens to hypothesis confidence */
  confidence_effect?: Record<string, number>; // { "APHID": +0.15, "WHITEFLY": -0.10 }
}

export type QuestionCategory = 
  | 'PEST_IDENTIFICATION'
  | 'DISEASE_IDENTIFICATION'
  | 'SYMPTOM_DETAIL'
  | 'SEVERITY_ASSESSMENT'
  | 'TIMING_DURATION'
  | 'AFFECTED_AREA'
  | 'TREATMENT_HISTORY'
  | 'ENVIRONMENTAL'
  | 'DIFFERENTIATING'; // Questions that help distinguish between two similar hypotheses

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC SESSION STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticSessionState {
  session_id: string;
  farmer_id: string;
  land_id?: string;
  started_at: string;
  last_updated: string;
  /** Current operating mode */
  mode: DiagnosticMode;
  /** All hypotheses being tracked */
  hypotheses: DiagnosticHypothesis[];
  /** Questions asked so far */
  questions_asked: string[];
  /** Total question count */
  question_count: number;
  /** Maximum questions allowed */
  max_questions: number;
  /** Photo received? */
  photo_received: boolean;
  /** Photo analysis result */
  photo_analysis?: PhotoAnalysisResult;
  /** Farmer's emotional state */
  farmer_urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  /** Conversation history summary */
  conversation_summary: string;
  /** Confidence in overall diagnosis */
  diagnostic_confidence: number;
}

export type DiagnosticMode = 
  | 'INITIALIZING'        // Just started
  | 'GATHERING_INFO'      // Asking questions
  | 'WAITING_FOR_PHOTO'   // Photo requested, waiting
  | 'ANALYZING_PHOTO'     // Photo being processed
  | 'READY_FOR_DECISION'  // Enough info, proceed to treatment
  | 'WEATHER_BLOCKED'     // Diagnosis done but weather unsafe
  | 'ESCALATED'           // Too complex, need expert
  | 'EMERGENCY'           // Urgent situation
  | 'COMPLETE';           // Diagnosis complete

export interface PhotoAnalysisResult {
  detected_pests: DetectedEntity[];
  detected_diseases: DetectedEntity[];
  detected_symptoms: DetectedEntity[];
  overall_confidence: number;
  image_quality: 'GOOD' | 'ACCEPTABLE' | 'POOR';
}

export interface DetectedEntity {
  code: string;
  confidence: number;
  bounding_box?: { x: number; y: number; width: number; height: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CAUSE SCENARIO HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export interface MultiCauseAnalysis {
  scenario: MultiCauseScenario;
  primary_cause?: DiagnosticHypothesis;
  secondary_causes?: DiagnosticHypothesis[];
  treatment_strategy: TreatmentStrategy;
  treatment_order?: string[]; // Order of treatment if sequential
  combined_treatment_possible: boolean;
  reasoning: string;
}

export type MultiCauseScenario = 
  | 'SINGLE_CAUSE'           // Only one confirmed cause
  | 'PRIMARY_SECONDARY'      // One causes the other
  | 'MULTIPLE_COMPATIBLE'    // Multiple causes, can treat together
  | 'MULTIPLE_SEQUENTIAL'    // Multiple causes, treat in order
  | 'COMPLEX';               // 3+ causes, needs expert review

export type TreatmentStrategy = 
  | 'TREAT_SINGLE'
  | 'TREAT_PRIMARY_ONLY'
  | 'TREAT_SIMULTANEOUSLY'
  | 'TREAT_SEQUENTIALLY'
  | 'ESCALATE_TO_EXPERT';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE UPDATE LOGIC TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfidenceUpdate {
  hypothesis_id: string;
  previous_confidence: number;
  new_confidence: number;
  delta: number;
  reason: string;
  evidence_source: EvidenceSource;
  timestamp: string;
}

export interface ConfidenceUpdateRules {
  /** Base confidence changes for different evidence impacts */
  impact_deltas: Record<Evidence['impact'], number>;
  /** Multipliers for different evidence sources */
  source_multipliers: Record<EvidenceSource, number>;
  /** Confidence thresholds for status changes */
  status_thresholds: {
    suspected_min: number;
    likely_min: number;
    confirmed_min: number;
    eliminated_max: number;
  };
  /** Maximum confidence change in single update */
  max_single_update: number;
  /** Decay rate for old hypotheses (per hour without new evidence) */
  decay_rate: number;
}

export const DEFAULT_CONFIDENCE_RULES: ConfidenceUpdateRules = {
  impact_deltas: {
    'STRONG_SUPPORT': 0.20,
    'MODERATE_SUPPORT': 0.12,
    'WEAK_SUPPORT': 0.05,
    'NEUTRAL': 0,
    'WEAK_CONTRADICT': -0.05,
    'MODERATE_CONTRADICT': -0.12,
    'STRONG_CONTRADICT': -0.25
  },
  source_multipliers: {
    'FARMER_DESCRIPTION': 0.8,
    'FARMER_ANSWER': 0.9,
    'PHOTO_ANALYSIS': 1.3,  // Visual confirmation is strong
    'SENSOR_DATA': 1.2,     // Objective data
    'WEATHER_DATA': 1.0,
    'HISTORICAL_DATA': 0.7,
    'CROP_STAGE': 0.9,
    'EXPERT_INPUT': 1.5     // Expert input is strongest
  },
  status_thresholds: {
    suspected_min: 0.20,
    likely_min: 0.50,
    confirmed_min: 0.80,
    eliminated_max: 0.15
  },
  max_single_update: 0.25,
  decay_rate: 0.02 // 2% per hour
};

// ═══════════════════════════════════════════════════════════════════════════
// ESCALATION CRITERIA
// ═══════════════════════════════════════════════════════════════════════════

export interface EscalationCriteria {
  /** Max questions before escalation */
  max_questions: number;
  /** Min confidence after max questions to not escalate */
  min_confidence_after_max_questions: number;
  /** Keywords that trigger immediate escalation */
  emergency_keywords_mr: string[];
  emergency_keywords_hi: string[];
  emergency_keywords_en: string[];
  /** Number of failed treatments before escalation */
  max_failed_treatments: number;
  /** Unknown species triggers escalation */
  unknown_species_escalates: boolean;
}

export const DEFAULT_ESCALATION_CRITERIA: EscalationCriteria = {
  max_questions: 10,
  min_confidence_after_max_questions: 0.60,
  emergency_keywords_mr: ['सगळं संपलं', 'मरतंय', 'खूप मोठी समस्या', 'ताबडतोब', 'वाचवा'],
  emergency_keywords_hi: ['सब खत्म', 'मर रहा है', 'बहुत बड़ी समस्या', 'तुरंत', 'बचाओ'],
  emergency_keywords_en: ['destroyed', 'dying', 'emergency', 'immediately', 'save'],
  max_failed_treatments: 2,
  unknown_species_escalates: true
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC FLOW DECISION OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticDecision {
  decision_type: DiagnosticDecisionType;
  /** The question to ask (if ASK_QUESTION) */
  question?: DiagnosticQuestion;
  /** Photo request details (if REQUEST_PHOTO) */
  photo_request?: PhotoRequestDetails;
  /** Escalation details (if ESCALATE) */
  escalation?: EscalationDetails;
  /** Confirmed hypotheses (if PROCEED_TO_TREATMENT) */
  confirmed_hypotheses?: DiagnosticHypothesis[];
  /** Multi-cause analysis (if multiple causes) */
  multi_cause_analysis?: MultiCauseAnalysis;
  /** Reasoning for this decision */
  reasoning: string;
  reasoning_mr?: string;
  reasoning_hi?: string;
}

export type DiagnosticDecisionType = 
  | 'ASK_QUESTION'
  | 'REQUEST_PHOTO'
  | 'PROCEED_TO_TREATMENT'
  | 'ESCALATE'
  | 'WAIT_FOR_INPUT'
  | 'EMERGENCY_PROTOCOL';

export interface PhotoRequestDetails {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  instructions_mr: string;
  instructions_hi: string;
  instructions_en: string;
  what_to_capture: string;
  example_image_url?: string;
}

export interface EscalationDetails {
  reason: EscalationReason;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary_for_expert: string;
  farmer_message_mr: string;
  farmer_message_hi: string;
  farmer_message_en: string;
  expected_response_hours: number;
}

export type EscalationReason = 
  | 'LOW_CONFIDENCE_AFTER_MAX_QUESTIONS'
  | 'UNKNOWN_SPECIES'
  | 'MULTIPLE_FAILED_TREATMENTS'
  | 'FARMER_EMERGENCY'
  | 'COMPLEX_MULTI_CAUSE'
  | 'RARE_CONDITION';
