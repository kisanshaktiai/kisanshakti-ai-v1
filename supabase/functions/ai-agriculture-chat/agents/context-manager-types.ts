/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT 2A: CONTEXT-AWARE CONVERSATION MANAGER - TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maintains state across multiple conversation turns, detects context switches,
 * and ensures continuity in multi-session farmer interactions.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SESSION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

export type SessionState = 
  | 'NEW_CONVERSATION'
  | 'INFORMATION_GATHERING'
  | 'PHOTO_REQUESTED'
  | 'PHOTO_RECEIVED'
  | 'DIAGNOSIS_READY'
  | 'RECOMMENDATION_PROVIDED'
  | 'FOLLOW_UP_DAY_3'
  | 'FOLLOW_UP_DAY_7'
  | 'RESOLVED'
  | 'NEEDS_ADJUSTMENT'
  | 'NEW_ISSUE_REPORTED'
  | 'ESCALATED';

export interface StateTransition {
  from: SessionState;
  to: SessionState;
  trigger: string;
  timestamp: string;
}

export const STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  NEW_CONVERSATION: ['INFORMATION_GATHERING', 'PHOTO_REQUESTED'],
  INFORMATION_GATHERING: ['DIAGNOSIS_READY', 'PHOTO_REQUESTED', 'ESCALATED'],
  PHOTO_REQUESTED: ['PHOTO_RECEIVED', 'DIAGNOSIS_READY', 'INFORMATION_GATHERING'],
  PHOTO_RECEIVED: ['DIAGNOSIS_READY', 'INFORMATION_GATHERING'],
  DIAGNOSIS_READY: ['RECOMMENDATION_PROVIDED'],
  RECOMMENDATION_PROVIDED: ['FOLLOW_UP_DAY_3', 'NEW_ISSUE_REPORTED', 'RESOLVED'],
  FOLLOW_UP_DAY_3: ['RESOLVED', 'NEEDS_ADJUSTMENT', 'FOLLOW_UP_DAY_7'],
  FOLLOW_UP_DAY_7: ['RESOLVED', 'NEEDS_ADJUSTMENT', 'ESCALATED'],
  NEEDS_ADJUSTMENT: ['RECOMMENDATION_PROVIDED', 'ESCALATED'],
  NEW_ISSUE_REPORTED: ['INFORMATION_GATHERING'],
  RESOLVED: [],
  ESCALATED: []
};

// ═══════════════════════════════════════════════════════════════════════════
// INPUT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export interface ContextManagerInput {
  farmer_id: string;
  land_id?: string;
  current_input: string;
  input_type: 'TEXT' | 'VOICE' | 'PHOTO' | 'QUICK_REPLY';
  timestamp: string;
  nlu_output: NLUOutputSummary;
  photo_data?: PhotoUploadData;
}

export interface NLUOutputSummary {
  primary_intent: string;
  crop_code?: string;
  symptoms: string[];
  pest_hypothesis?: string;
  disease_hypothesis?: string;
  urgency_level: 'HIGH' | 'MEDIUM' | 'LOW';
  emotional_state: 'PANIC' | 'STRESSED' | 'NEUTRAL' | 'CONFIDENT';
  confidence: number;
}

export interface PhotoUploadData {
  photo_id: string;
  upload_timestamp: string;
  file_size_kb: number;
  dimensions?: { width: number; height: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION CONTEXT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export interface SessionContext {
  session_id: string;
  farmer_id: string;
  land_id: string;
  session_started: string;
  last_interaction: string;
  current_state: SessionState;
  conversation_turn: number;
  total_interactions: number;
  is_active: boolean;
}

export interface ConversationTurn {
  turn: number;
  timestamp: string;
  farmer_input: string;
  farmer_input_summary: string;
  system_response_type: SystemResponseType;
  system_question_asked?: string;
  question_id?: string;
  answered: boolean;
  photo_uploaded?: boolean;
  entities_extracted?: Record<string, unknown>;
}

export type SystemResponseType = 
  | 'GREETING'
  | 'CLARIFICATION_QUESTION'
  | 'PHOTO_REQUEST'
  | 'PROCESSING_PHOTO'
  | 'DIAGNOSIS'
  | 'RECOMMENDATION'
  | 'FOLLOW_UP_CHECK'
  | 'CONTEXT_CLARIFICATION'
  | 'ACKNOWLEDGEMENT'
  | 'ERROR_RECOVERY';

export interface ConversationHistory {
  turns: ConversationTurn[];
  total_turns: number;
  avg_response_time_minutes: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCUMULATED KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════════════

export interface AccumulatedKnowledge {
  confirmed_facts: ConfirmedFacts;
  suspected_but_unconfirmed: Record<string, string>;
  questions_asked: string[];
  questions_remaining: string[];
  photo_analysis_result?: PhotoAnalysisResult;
}

export interface ConfirmedFacts {
  crop?: string;
  crop_stage?: string;
  pest?: string;
  disease?: string;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  affected_area_percent?: number;
  duration_days?: number;
  previous_treatments?: string[];
  visual_confirmation?: boolean;
}

export interface PhotoAnalysisResult {
  photo_id: string;
  analyzed_at: string;
  detected_issues: string[];
  confidence: number;
  requires_expert: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMER BEHAVIOR PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerBehaviorPatterns {
  response_speed: 'FAST' | 'MODERATE' | 'SLOW';
  avg_response_time_minutes: number;
  photo_willingness: 'HIGH' | 'MEDIUM' | 'LOW';
  detail_level: 'HIGH' | 'MODERATE' | 'LOW';
  language_consistency: string;  // e.g., 'MR_ONLY', 'HI_ONLY', 'MIXED'
  preferred_language: string;
  cooperation_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-LAND TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export interface LandIssueStatus {
  land_id: string;
  land_name?: string;
  crop: string;
  issue_type?: string;
  issue_status: IssueStatus;
  session_id: string;
  last_updated: string;
}

export type IssueStatus = 
  | 'REPORTED'
  | 'DIAGNOSIS_IN_PROGRESS'
  | 'AWAITING_PHOTO'
  | 'RECOMMENDATION_PROVIDED'
  | 'FOLLOW_UP_PENDING'
  | 'RESOLVED'
  | 'ESCALATED';

export interface MultiLandTracking {
  active_lands: LandIssueStatus[];
  current_land_focus: string;
  total_active_issues: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT SWITCH DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ContextSwitchDetection {
  switch_detected: boolean;
  switch_type?: ContextSwitchType;
  confidence: number;
  clarification_needed: boolean;
  clarification_question?: {
    mr: string;
    hi: string;
    en: string;
  };
}

export type ContextSwitchType = 
  | 'NEW_ISSUE_SAME_LAND'
  | 'DIFFERENT_LAND'
  | 'FOLLOW_UP_AFTER_RECOMMENDATION'
  | 'TOPIC_CHANGE'
  | 'RELATED_ISSUE'
  | 'SESSION_RESUME';

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export interface ContextManagerOutput {
  session_management: SessionManagement;
  context_continuity: ContextContinuity;
  multi_land_tracking: MultiLandTracking;
  conversation_flow: ConversationFlow;
  accumulated_knowledge: AccumulatedKnowledge;
  farmer_engagement: FarmerBehaviorPatterns;
  context_switch: ContextSwitchDetection;
  next_action_recommendation: NextActionRecommendation;
}

export interface SessionManagement {
  session_id: string;
  session_type: 'NEW' | 'CONTINUING' | 'RESUMED';
  current_state: SessionState;
  previous_state?: SessionState;
  state_transition?: string;
  conversation_turn: number;
  session_duration_minutes: number;
}

export interface ContextContinuity {
  is_follow_up: boolean;
  previous_interaction_summary?: string;
  time_since_last_interaction_hours: number;
  context_retrieved_successfully: boolean;
  context_gaps: string[];
}

export interface ConversationFlow {
  questions_asked_count: number;
  questions_remaining: number;
  max_questions_limit: number;
  photo_requested: boolean;
  photo_received: boolean;
  ready_for_diagnosis: boolean;
  diagnosis_confidence: number;
}

export interface NextActionRecommendation {
  action: NextAction;
  reason: string;
  pass_to_agent: string;
  priority: 'IMMEDIATE' | 'NORMAL' | 'LOW';
  fallback_action?: NextAction;
}

export type NextAction = 
  | 'ASK_CLARIFICATION_QUESTION'
  | 'REQUEST_PHOTO'
  | 'PROCESS_PHOTO'
  | 'PROCEED_TO_DIAGNOSIS'
  | 'PROVIDE_RECOMMENDATION'
  | 'FOLLOW_UP_CHECK'
  | 'CLARIFY_CONTEXT_SWITCH'
  | 'RESUME_PREVIOUS_SESSION'
  | 'CREATE_NEW_SESSION'
  | 'ESCALATE_TO_EXPERT'
  | 'ACKNOWLEDGE_AND_CLOSE';

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationQuestionBank {
  id: string;
  category: 'CROP' | 'PEST' | 'DISEASE' | 'SYMPTOM' | 'SEVERITY' | 'DURATION' | 'TREATMENT' | 'AREA';
  priority: number;
  question: {
    mr: string;
    hi: string;
    en: string;
  };
  expected_answer_type: 'TEXT' | 'NUMBER' | 'CHOICE' | 'YES_NO';
  options?: {
    value: string;
    label: { mr: string; hi: string; en: string };
  }[];
  skip_if_urgent: boolean;
  skip_if_known: string[]; // Skip if these facts are already known
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL SESSION DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface FullSessionData {
  session_context: SessionContext;
  conversation_history: ConversationHistory;
  accumulated_knowledge: AccumulatedKnowledge;
  farmer_behavior: FarmerBehaviorPatterns;
  state_transitions: StateTransition[];
}
