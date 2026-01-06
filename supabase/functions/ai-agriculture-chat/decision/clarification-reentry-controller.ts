/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION RE-ENTRY CONTROLLER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Ensures that when a farmer answers a clarification question, the system
 * PRESERVES complete context and RE-RUNS the full decision pipeline.
 * 
 * CRITICAL PRINCIPLE:
 * Clarification answer = NEW EVIDENCE, not task completion.
 * The system must NEVER treat clarification completion as "task complete".
 * 
 * FORBIDDEN BEHAVIORS:
 * ❌ Clearing decision state to "no_action_needed" after clarification
 * ❌ Skipping symbolic rule evaluation after receiving clarification answer
 * ❌ Returning greeting messages or generic responses after clarification
 * ❌ Generating treatment without re-running the decision graph
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CLARIFICATION_REENTRY_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL STATE PRESERVATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CanonicalSessionState
 * 
 * The preserved state that MUST carry forward through clarification turns.
 * Once a value is CONFIRMED, it MUST NEVER revert to UNKNOWN.
 */
export interface CanonicalSessionState {
  // Core identity (IMMUTABLE once set)
  session_id: string;
  land_id?: string;
  farmer_id: string;
  
  // Crop context (LOCKED once confirmed)
  crop_name?: string;
  crop_confirmed: boolean;
  crop_source?: 'LAND_CONTEXT' | 'CROP_SCHEDULES' | 'FARMER_CONFIRMATION' | 'SESSION';
  
  // Growth stage (CALCULATED, never guessed)
  growth_stage?: string;
  days_since_sowing?: number;
  sowing_date?: string;
  stage_source?: 'CROP_SCHEDULES' | 'CALCULATION' | 'FARMER_INPUT';
  
  // Accumulated symptoms (APPEND-ONLY)
  confirmed_symptoms: string[];
  observation_keys: string[];
  cross_crop_symptoms: string[];
  
  // Clarification state
  turn_count: number;
  pending_options: string[];
  pending_scope?: string;
  previous_scopes: string[];
  
  // Decision context (evolves with each turn)
  authority_level?: 'CROP' | 'LAND' | 'CLIMATE' | 'SAFETY' | 'NONE';
  detected_causes: string[];
  
  // Audit trail
  state_history: StateHistoryEntry[];
}

export interface StateHistoryEntry {
  turn_number: number;
  timestamp: string;
  action: 'CLARIFICATION_ASKED' | 'ANSWER_RECEIVED' | 'SYMPTOM_CONFIRMED' | 'DIAGNOSIS_MADE' | 'STATE_ENRICHED';
  details: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE PRESERVATION VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * validateStatePreservation
 * 
 * Ensures canonical state NEVER degrades during clarification.
 * Confirmed values must persist; state can only move forward in specificity.
 */
export function validateStatePreservation(
  previousState: Partial<CanonicalSessionState>,
  newState: Partial<CanonicalSessionState>
): {
  valid: boolean;
  violations: StateViolation[];
  corrected_state: Partial<CanonicalSessionState>;
} {
  const violations: StateViolation[] = [];
  const correctedState = { ...newState };
  
  // INVARIANT 1: Confirmed crop cannot revert to UNKNOWN
  if (previousState.crop_confirmed && previousState.crop_name) {
    if (!newState.crop_name || newState.crop_name === 'UNKNOWN') {
      violations.push({
        field: 'crop_name',
        previous_value: previousState.crop_name,
        new_value: newState.crop_name,
        violation_type: 'STATE_DEGRADATION',
        severity: 'CRITICAL'
      });
      correctedState.crop_name = previousState.crop_name;
      correctedState.crop_confirmed = true;
    }
  }
  
  // INVARIANT 2: Growth stage cannot revert to UNKNOWN
  if (previousState.growth_stage && previousState.growth_stage !== 'UNKNOWN') {
    if (!newState.growth_stage || newState.growth_stage === 'UNKNOWN') {
      violations.push({
        field: 'growth_stage',
        previous_value: previousState.growth_stage,
        new_value: newState.growth_stage,
        violation_type: 'STATE_DEGRADATION',
        severity: 'CRITICAL'
      });
      correctedState.growth_stage = previousState.growth_stage;
    }
  }
  
  // INVARIANT 3: Days since sowing cannot become undefined
  if (previousState.days_since_sowing !== undefined && previousState.days_since_sowing !== null) {
    if (newState.days_since_sowing === undefined || newState.days_since_sowing === null) {
      violations.push({
        field: 'days_since_sowing',
        previous_value: previousState.days_since_sowing,
        new_value: newState.days_since_sowing,
        violation_type: 'STATE_DEGRADATION',
        severity: 'HIGH'
      });
      correctedState.days_since_sowing = previousState.days_since_sowing;
    }
  }
  
  // INVARIANT 4: Confirmed symptoms can only be appended, never removed
  if (previousState.confirmed_symptoms && previousState.confirmed_symptoms.length > 0) {
    const previousSymptoms = new Set(previousState.confirmed_symptoms);
    const newSymptoms = new Set(newState.confirmed_symptoms || []);
    
    previousSymptoms.forEach(symptom => {
      if (!newSymptoms.has(symptom)) {
        violations.push({
          field: 'confirmed_symptoms',
          previous_value: symptom,
          new_value: 'REMOVED',
          violation_type: 'SYMPTOM_REMOVAL',
          severity: 'HIGH'
        });
      }
    });
    
    // Merge symptoms (append-only)
    correctedState.confirmed_symptoms = Array.from(
      new Set([...previousState.confirmed_symptoms, ...(newState.confirmed_symptoms || [])])
    );
  }
  
  // INVARIANT 5: Turn count must increment, never decrease
  if (previousState.turn_count !== undefined) {
    if (newState.turn_count !== undefined && newState.turn_count < previousState.turn_count) {
      violations.push({
        field: 'turn_count',
        previous_value: previousState.turn_count,
        new_value: newState.turn_count,
        violation_type: 'TURN_REGRESSION',
        severity: 'MEDIUM'
      });
      correctedState.turn_count = previousState.turn_count;
    }
  }
  
  return {
    valid: violations.length === 0,
    violations,
    corrected_state: correctedState
  };
}

export interface StateViolation {
  field: string;
  previous_value: unknown;
  new_value: unknown;
  violation_type: 'STATE_DEGRADATION' | 'SYMPTOM_REMOVAL' | 'TURN_REGRESSION' | 'CONTEXT_LOSS';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION ANSWER PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * processClarificationAnswer
 * 
 * Processes a farmer's clarification answer and enriches the canonical state.
 * This ALWAYS triggers a re-run of the decision pipeline.
 */
export function processClarificationAnswer(
  currentState: CanonicalSessionState,
  answer: {
    selected_option_index?: number;
    selected_option_text?: string;
    free_text?: string;
    image_url?: string;
  },
  pendingScope: string
): {
  enriched_state: CanonicalSessionState;
  mapped_observation?: string;
  mapped_symptom_key?: string;
  should_re_run_pipeline: boolean;
  pipeline_inputs: {
    observations: string[];
    symptoms: string[];
    causes: string[];
  };
} {
  // Clone state to avoid mutation
  const enrichedState: CanonicalSessionState = {
    ...currentState,
    confirmed_symptoms: [...currentState.confirmed_symptoms],
    observation_keys: [...currentState.observation_keys],
    cross_crop_symptoms: [...currentState.cross_crop_symptoms],
    detected_causes: [...currentState.detected_causes],
    previous_scopes: [...currentState.previous_scopes, pendingScope],
    state_history: [...currentState.state_history]
  };
  
  // Increment turn count
  enrichedState.turn_count += 1;
  
  // Clear pending options (this clarification is answered)
  enrichedState.pending_options = [];
  enrichedState.pending_scope = undefined;
  
  // Log the answer in state history
  enrichedState.state_history.push({
    turn_number: enrichedState.turn_count,
    timestamp: new Date().toISOString(),
    action: 'ANSWER_RECEIVED',
    details: {
      scope: pendingScope,
      answer_type: answer.selected_option_index !== undefined ? 'OPTION_SELECTION' : 
                   answer.image_url ? 'IMAGE_UPLOAD' : 'FREE_TEXT',
      selected_option: answer.selected_option_text
    }
  });
  
  // Map answer to observation/symptom
  let mappedObservation: string | undefined;
  let mappedSymptomKey: string | undefined;
  
  if (answer.selected_option_text) {
    const mapping = mapAnswerToObservation(answer.selected_option_text, pendingScope);
    mappedObservation = mapping.observation;
    mappedSymptomKey = mapping.symptom_key;
    
    if (mappedObservation) {
      enrichedState.observation_keys.push(mappedObservation);
    }
    if (mappedSymptomKey) {
      enrichedState.cross_crop_symptoms.push(mappedSymptomKey);
      enrichedState.confirmed_symptoms.push(mappedSymptomKey);
      
      // Log symptom confirmation
      enrichedState.state_history.push({
        turn_number: enrichedState.turn_count,
        timestamp: new Date().toISOString(),
        action: 'SYMPTOM_CONFIRMED',
        details: {
          symptom_key: mappedSymptomKey,
          observation: mappedObservation,
          source: 'CLARIFICATION_ANSWER'
        }
      });
    }
  }
  
  // CRITICAL: Always require pipeline re-run
  // Clarification is NEVER task completion
  return {
    enriched_state: enrichedState,
    mapped_observation: mappedObservation,
    mapped_symptom_key: mappedSymptomKey,
    should_re_run_pipeline: true, // ALWAYS TRUE - this is the key invariant
    pipeline_inputs: {
      observations: enrichedState.observation_keys,
      symptoms: enrichedState.confirmed_symptoms,
      causes: enrichedState.detected_causes
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANSWER TO OBSERVATION MAPPING
// ═══════════════════════════════════════════════════════════════════════════

function mapAnswerToObservation(
  answerText: string,
  scope: string
): {
  observation?: string;
  symptom_key?: string;
} {
  const lowerAnswer = answerText.toLowerCase();
  
  switch (scope) {
    case 'IDENTIFY_INSECT_BEHAVIOR':
      if (lowerAnswer.includes('उडत') || lowerAnswer.includes('उड़') || lowerAnswer.includes('fly')) {
        return { observation: 'INSECT_BEHAVIOR_FLYING', symptom_key: 'FLYING_INSECTS_VISIBLE' };
      }
      if (lowerAnswer.includes('चालत') || lowerAnswer.includes('रेंग') || lowerAnswer.includes('crawl')) {
        return { observation: 'INSECT_BEHAVIOR_CRAWLING', symptom_key: 'CRAWLING_INSECTS_VISIBLE' };
      }
      return { observation: 'INSECT_BEHAVIOR_UNKNOWN' };
      
    case 'IDENTIFY_PLANT_RESPONSE':
      if (lowerAnswer.includes('वळ') || lowerAnswer.includes('मुड') || lowerAnswer.includes('curl')) {
        return { observation: 'PLANT_RESPONSE_CURLING', symptom_key: 'CURLED_LEAVES' };
      }
      if (lowerAnswer.includes('पिवळ') || lowerAnswer.includes('पीला') || lowerAnswer.includes('yellow')) {
        return { observation: 'PLANT_RESPONSE_YELLOWING', symptom_key: 'GENERAL_YELLOWING' };
      }
      if (lowerAnswer.includes('चिकट') || lowerAnswer.includes('sticky')) {
        return { observation: 'PLANT_RESPONSE_STICKY', symptom_key: 'HONEYDEW_PRESENT' };
      }
      if (lowerAnswer.includes('छिद्र') || lowerAnswer.includes('hole')) {
        return { observation: 'PLANT_RESPONSE_HOLES', symptom_key: 'LEAF_HOLES' };
      }
      if (lowerAnswer.includes('काहीही नाही') || lowerAnswer.includes('no')) {
        return { observation: 'PLANT_RESPONSE_NONE', symptom_key: 'INSECT_PRESENT_NO_DAMAGE' };
      }
      return { observation: 'PLANT_RESPONSE_UNKNOWN' };
      
    case 'IDENTIFY_DISTRIBUTION':
      if (lowerAnswer.includes('सगळीकडे') || lowerAnswer.includes('uniform') || lowerAnswer.includes('everywhere')) {
        return { observation: 'DISTRIBUTION_UNIFORM', symptom_key: 'UNIFORM_SPREAD' };
      }
      if (lowerAnswer.includes('ठिकठिकाणी') || lowerAnswer.includes('patch')) {
        return { observation: 'DISTRIBUTION_PATCHY', symptom_key: 'PATCHY_SPREAD' };
      }
      if (lowerAnswer.includes('कडे') || lowerAnswer.includes('edge')) {
        return { observation: 'DISTRIBUTION_EDGE', symptom_key: 'EDGE_DAMAGE' };
      }
      return { observation: 'DISTRIBUTION_UNKNOWN' };
      
    case 'IDENTIFY_SEVERITY':
      if (lowerAnswer.includes('कमी') || lowerAnswer.includes('थोड') || lowerAnswer.includes('low') || lowerAnswer.includes('mild')) {
        return { observation: 'SEVERITY_LOW' };
      }
      if (lowerAnswer.includes('जास्त') || lowerAnswer.includes('गंभीर') || lowerAnswer.includes('high') || lowerAnswer.includes('severe')) {
        return { observation: 'SEVERITY_HIGH' };
      }
      return { observation: 'SEVERITY_MEDIUM' };
      
    case 'IDENTIFY_LOCATION':
      if (lowerAnswer.includes('पान') || lowerAnswer.includes('leaf')) {
        return { observation: 'AFFECTED_PART_LEAF' };
      }
      if (lowerAnswer.includes('खोड') || lowerAnswer.includes('stem')) {
        return { observation: 'AFFECTED_PART_STEM' };
      }
      if (lowerAnswer.includes('मूळ') || lowerAnswer.includes('root')) {
        return { observation: 'AFFECTED_PART_ROOT' };
      }
      if (lowerAnswer.includes('फळ') || lowerAnswer.includes('fruit')) {
        return { observation: 'AFFECTED_PART_FRUIT' };
      }
      return { observation: 'AFFECTED_PART_UNKNOWN' };
      
    default:
      return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXIT STRATEGY CHECKER
// ═══════════════════════════════════════════════════════════════════════════

export interface ExitStrategyResult {
  should_exit: boolean;
  exit_reason?: string;
  recommended_action: 'CONTINUE' | 'PHOTO_REQUEST' | 'GENERAL_GUIDANCE' | 'EXPERT_ESCALATION';
  message_templates?: {
    mr: string;
    hi: string;
    en: string;
  };
}

/**
 * checkClarificationExitStrategy
 * 
 * Determines if clarification should exit due to limits or dead ends.
 * Prevents infinite clarification loops.
 */
export function checkClarificationExitStrategy(
  state: CanonicalSessionState,
  notSureCount: number
): ExitStrategyResult {
  const MAX_TURNS = 3;
  const MAX_NOT_SURE = 2;
  
  // Exit: Maximum turns reached
  if (state.turn_count >= MAX_TURNS) {
    return {
      should_exit: true,
      exit_reason: `Maximum clarification turns (${MAX_TURNS}) reached`,
      recommended_action: 'GENERAL_GUIDANCE',
      message_templates: {
        mr: `तुमच्या उपलब्ध माहितीच्या आधारे मी सामान्य सल्ला देऊ शकतो.\n\nकृपया लक्षात ठेवा: ही विशिष्ट उपचार योजना नाही. नेमके निदान करण्यासाठी फोटो पाठवा किंवा तज्ञाशी संपर्क साधा.`,
        hi: `उपलब्ध जानकारी के आधार पर मैं सामान्य सलाह दे सकता हूं.\n\nकृपया ध्यान दें: यह विशिष्ट उपचार योजना नहीं है। सटीक निदान के लिए फोटो भेजें या विशेषज्ञ से संपर्क करें।`,
        en: `Based on available information, I can provide general advice.\n\nPlease note: This is not a specific treatment plan. For accurate diagnosis, send a photo or contact an expert.`
      }
    };
  }
  
  // Exit: Too many "Not Sure" responses
  if (notSureCount >= MAX_NOT_SURE) {
    return {
      should_exit: true,
      exit_reason: `Too many "Not sure" responses (${notSureCount})`,
      recommended_action: 'PHOTO_REQUEST',
      message_templates: {
        mr: `तुम्ही पिकाचा फोटो पाठवू शकता का? किंवा सामान्य काळजी उपाय पहायचे आहेत?`,
        hi: `क्या आप फसल की फोटो भेज सकते हैं? या सामान्य देखभाल उपाय देखना चाहते हैं?`,
        en: `Can you send a photo of the crop? Or would you like to see general care measures?`
      }
    };
  }
  
  // Exit: Same scope asked twice
  const scopeCounts = state.previous_scopes.reduce((acc, scope) => {
    acc[scope] = (acc[scope] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const repeatedScope = Object.entries(scopeCounts).find(([_, count]) => count >= 2);
  if (repeatedScope) {
    return {
      should_exit: true,
      exit_reason: `Same clarification scope "${repeatedScope[0]}" asked twice`,
      recommended_action: 'PHOTO_REQUEST',
      message_templates: {
        mr: `मला तुमचा प्रश्न नीट समजला नाही. कृपया प्रभावित भागाचा फोटो पाठवा.`,
        hi: `मुझे आपका प्रश्न ठीक से समझ नहीं आया। कृपया प्रभावित भाग की फोटो भेजें।`,
        en: `I couldn't fully understand your question. Please send a photo of the affected area.`
      }
    };
  }
  
  return {
    should_exit: false,
    recommended_action: 'CONTINUE'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createCanonicalSessionState(
  sessionId: string,
  farmerId: string,
  landId?: string,
  initialCropContext?: {
    crop_name?: string;
    growth_stage?: string;
    days_since_sowing?: number;
    sowing_date?: string;
  }
): CanonicalSessionState {
  return {
    session_id: sessionId,
    farmer_id: farmerId,
    land_id: landId,
    
    crop_name: initialCropContext?.crop_name,
    crop_confirmed: !!initialCropContext?.crop_name,
    crop_source: initialCropContext?.crop_name ? 'LAND_CONTEXT' : undefined,
    
    growth_stage: initialCropContext?.growth_stage,
    days_since_sowing: initialCropContext?.days_since_sowing,
    sowing_date: initialCropContext?.sowing_date,
    stage_source: initialCropContext?.growth_stage ? 'CROP_SCHEDULES' : undefined,
    
    confirmed_symptoms: [],
    observation_keys: [],
    cross_crop_symptoms: [],
    
    turn_count: 0,
    pending_options: [],
    pending_scope: undefined,
    previous_scopes: [],
    
    authority_level: 'NONE',
    detected_causes: [],
    
    state_history: [{
      turn_number: 0,
      timestamp: new Date().toISOString(),
      action: 'STATE_ENRICHED',
      details: {
        event: 'SESSION_CREATED',
        initial_crop: initialCropContext?.crop_name,
        has_land_context: !!landId
      }
    }]
  };
}
