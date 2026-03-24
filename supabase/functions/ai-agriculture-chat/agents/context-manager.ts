/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENT 2A: CONTEXT-AWARE CONVERSATION MANAGER - PRODUCTION v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Maintains state across multiple conversation turns, detects context switches,
 * and ensures continuity in multi-session farmer interactions.
 * 
 * Core Responsibilities:
 * 1. Session State Management - Track conversation flow
 * 2. Context Preservation - Remember what was discussed
 * 3. Farmer Intent Tracking - Understand journey through problem-solving
 * 4. Multi-Land Disambiguation - Handle farmers with multiple plots
 * 5. Temporal Context - Track when issues were first reported vs follow-ups
 */

import {
  SessionState,
  SessionContext,
  ConversationTurn,
  ConversationHistory,
  AccumulatedKnowledge,
  ConfirmedFacts,
  FarmerBehaviorPatterns,
  MultiLandTracking,
  LandIssueStatus,
  ContextSwitchDetection,
  ContextSwitchType,
  ContextManagerInput,
  ContextManagerOutput,
  NextAction,
  ClarificationQuestionBank,
  FullSessionData,
  STATE_TRANSITIONS,
  StateTransition,
} from './context-manager-types.ts';

const CONTEXT_MANAGER_VERSION = '1.0.0';
const MAX_QUESTIONS_LIMIT = 5;
const SESSION_TIMEOUT_HOURS = 24;
const PHOTO_WAIT_TIMEOUT_HOURS = 24;

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION QUESTION BANK
// ═══════════════════════════════════════════════════════════════════════════

const QUESTION_BANK: ClarificationQuestionBank[] = [
  {
    id: 'Q1_CROP',
    category: 'CROP',
    priority: 1,
    question: {
      mr: 'तुम्ही कोणतं पीक घेतलंय?',
      hi: 'आप कौन सी फसल उगा रहे हैं?',
      en: 'Which crop are you growing?'
    },
    expected_answer_type: 'TEXT',
    skip_if_urgent: true,
    skip_if_known: ['crop']
  },
  {
    id: 'Q2_PEST_COLOR',
    category: 'PEST',
    priority: 2,
    question: {
      mr: 'किडींचा रंग काय आहे - हिरवा, काळा, पांढरा की इतर?',
      hi: 'कीड़ों का रंग क्या है - हरा, काला, सफेद या अन्य?',
      en: 'What color are the pests - green, black, white or other?'
    },
    expected_answer_type: 'CHOICE',
    options: [
      { value: 'GREEN', label: { mr: 'हिरवा', hi: 'हरा', en: 'Green' } },
      { value: 'BLACK', label: { mr: 'काळा', hi: 'काला', en: 'Black' } },
      { value: 'WHITE', label: { mr: 'पांढरा', hi: 'सफेद', en: 'White' } },
      { value: 'BROWN', label: { mr: 'तपकिरी', hi: 'भूरा', en: 'Brown' } }
    ],
    skip_if_urgent: true,
    skip_if_known: ['pest']
  },
  {
    id: 'Q3_PEST_DENSITY',
    category: 'SEVERITY',
    priority: 3,
    question: {
      mr: 'किडींची संख्या किती - थोडी (१०-१५ प्रति पान) की जास्त (२०+ प्रति पान)?',
      hi: 'कीड़ों की संख्या कितनी है - थोड़ी (10-15 प्रति पत्ता) या ज्यादा (20+ प्रति पत्ता)?',
      en: 'How many pests - few (10-15 per leaf) or many (20+ per leaf)?'
    },
    expected_answer_type: 'CHOICE',
    options: [
      { value: 'FEW', label: { mr: 'थोडी', hi: 'थोड़ी', en: 'Few' } },
      { value: 'MODERATE', label: { mr: 'मध्यम', hi: 'मध्यम', en: 'Moderate' } },
      { value: 'MANY', label: { mr: 'जास्त', hi: 'ज्यादा', en: 'Many' } }
    ],
    skip_if_urgent: false,
    skip_if_known: ['severity']
  },
  {
    id: 'Q4_AFFECTED_AREA',
    category: 'AREA',
    priority: 4,
    question: {
      mr: 'किती टक्के शेतात समस्या दिसते - १०%, ३०% की ५०% पेक्षा जास्त?',
      hi: 'कितने प्रतिशत खेत में समस्या दिख रही है - 10%, 30% या 50% से ज्यादा?',
      en: 'What percentage of field is affected - 10%, 30% or more than 50%?'
    },
    expected_answer_type: 'CHOICE',
    options: [
      { value: '10', label: { mr: '१०% पर्यंत', hi: '10% तक', en: 'Up to 10%' } },
      { value: '30', label: { mr: '३०% पर्यंत', hi: '30% तक', en: 'Up to 30%' } },
      { value: '50_PLUS', label: { mr: '५०% पेक्षा जास्त', hi: '50% से ज्यादा', en: 'More than 50%' } }
    ],
    skip_if_urgent: true,
    skip_if_known: ['affected_area_percent']
  },
  {
    id: 'Q5_DURATION',
    category: 'DURATION',
    priority: 5,
    question: {
      mr: 'ही समस्या किती दिवसांपासून आहे?',
      hi: 'यह समस्या कितने दिनों से है?',
      en: 'How many days have you noticed this problem?'
    },
    expected_answer_type: 'CHOICE',
    options: [
      { value: '1-2', label: { mr: '१-२ दिवस', hi: '1-2 दिन', en: '1-2 days' } },
      { value: '3-7', label: { mr: '३-७ दिवस', hi: '3-7 दिन', en: '3-7 days' } },
      { value: '7_PLUS', label: { mr: '१ आठवड्यापेक्षा जास्त', hi: '1 हफ्ते से ज्यादा', en: 'More than 1 week' } }
    ],
    skip_if_urgent: true,
    skip_if_known: ['duration_days']
  },
  {
    id: 'Q6_PREVIOUS_TREATMENT',
    category: 'TREATMENT',
    priority: 6,
    question: {
      mr: 'यापूर्वी काही फवारणी किंवा उपचार केला का?',
      hi: 'पहले कोई छिड़काव या उपचार किया?',
      en: 'Did you apply any spray or treatment before?'
    },
    expected_answer_type: 'YES_NO',
    skip_if_urgent: true,
    skip_if_known: ['previous_treatments']
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateSessionId(): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SES_${date}_${random}`;
}

function createNewSession(farmerId: string, landId: string): SessionContext {
  const now = new Date().toISOString();
  return {
    session_id: generateSessionId(),
    farmer_id: farmerId,
    land_id: landId,
    session_started: now,
    last_interaction: now,
    current_state: 'NEW_CONVERSATION',
    conversation_turn: 1,
    total_interactions: 1,
    is_active: true
  };
}

function isValidTransition(from: SessionState, to: SessionState): boolean {
  const validTransitions = STATE_TRANSITIONS[from];
  return validTransitions.includes(to);
}

function transitionState(
  session: SessionContext,
  newState: SessionState,
  trigger: string
): StateTransition | null {
  if (!isValidTransition(session.current_state, newState)) {
    console.warn(`Invalid state transition: ${session.current_state} -> ${newState}`);
    return null;
  }
  
  const transition: StateTransition = {
    from: session.current_state,
    to: newState,
    trigger,
    timestamp: new Date().toISOString()
  };
  
  session.current_state = newState;
  return transition;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT SWITCH DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function detectContextSwitch(
  input: ContextManagerInput,
  currentSession: FullSessionData | null,
  activeSessions: SessionContext[]
): ContextSwitchDetection {
  // No switch if no previous session
  if (!currentSession) {
    return {
      switch_detected: false,
      confidence: 1.0,
      clarification_needed: false
    };
  }
  
  const { nlu_output, land_id } = input;
  const previousCrop = currentSession.accumulated_knowledge.confirmed_facts.crop;
  const currentCrop = nlu_output.crop_code;
  const previousLandId = currentSession.session_context.land_id;
  
  // Case 1: Different land mentioned
  if (land_id && land_id !== previousLandId) {
    return {
      switch_detected: true,
      switch_type: 'DIFFERENT_LAND',
      confidence: 0.9,
      clarification_needed: true,
      clarification_question: {
        mr: 'हे वेगळं शेत आहे का? तुमच्या आधीच्या पिकाची समस्या सुटली का?',
        hi: 'क्या यह अलग खेत है? क्या पिछली फसल की समस्या हल हो गई?',
        en: 'Is this a different field? Is the previous crop issue resolved?'
      }
    };
  }
  
  // Case 2: Different crop mentioned on same land
  if (currentCrop && previousCrop && currentCrop !== previousCrop) {
    return {
      switch_detected: true,
      switch_type: 'DIFFERENT_LAND',
      confidence: 0.85,
      clarification_needed: true,
      clarification_question: {
        mr: `तुम्ही ${previousCrop} ऐवजी ${currentCrop} बद्दल बोलत आहात का? हे वेगळं शेत आहे का?`,
        hi: `क्या आप ${previousCrop} की जगह ${currentCrop} के बारे में बात कर रहे हैं? क्या यह अलग खेत है?`,
        en: `Are you talking about ${currentCrop} instead of ${previousCrop}? Is this a different field?`
      }
    };
  }
  
  // Case 3: New issue on same land (different symptoms)
  const previousSymptoms = currentSession.accumulated_knowledge.confirmed_facts.pest || 
                           currentSession.accumulated_knowledge.confirmed_facts.disease;
  const currentSymptoms = nlu_output.symptoms.join(',');
  
  if (previousSymptoms && currentSymptoms && !currentSymptoms.includes(previousSymptoms)) {
    // Check if this could be related (e.g., pest damage leading to disease)
    return {
      switch_detected: true,
      switch_type: 'NEW_ISSUE_SAME_LAND',
      confidence: 0.7,
      clarification_needed: true,
      clarification_question: {
        mr: 'ही आधीच्या समस्येशी संबंधित आहे का, की नवीन समस्या आहे?',
        hi: 'क्या यह पिछली समस्या से संबंधित है, या नई समस्या है?',
        en: 'Is this related to the previous issue, or a new problem?'
      }
    };
  }
  
  // Case 4: Follow-up after recommendation
  if (currentSession.session_context.current_state === 'RECOMMENDATION_PROVIDED') {
    const timeSinceRecommendation = getHoursSinceLastInteraction(currentSession.session_context.last_interaction);
    
    if (timeSinceRecommendation >= 24) {
      return {
        switch_detected: true,
        switch_type: 'FOLLOW_UP_AFTER_RECOMMENDATION',
        confidence: 0.8,
        clarification_needed: false // We know this is a follow-up
      };
    }
  }
  
  // Case 5: Session resume after timeout
  const hoursSinceLastInteraction = getHoursSinceLastInteraction(currentSession.session_context.last_interaction);
  if (hoursSinceLastInteraction > 2 && hoursSinceLastInteraction < SESSION_TIMEOUT_HOURS) {
    return {
      switch_detected: true,
      switch_type: 'SESSION_RESUME',
      confidence: 0.9,
      clarification_needed: false
    };
  }
  
  return {
    switch_detected: false,
    confidence: 0.9,
    clarification_needed: false
  };
}

function getHoursSinceLastInteraction(lastInteraction: string): number {
  const now = new Date();
  const last = new Date(lastInteraction);
  return (now.getTime() - last.getTime()) / (1000 * 60 * 60);
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE ACCUMULATION
// ═══════════════════════════════════════════════════════════════════════════

function updateAccumulatedKnowledge(
  existing: AccumulatedKnowledge,
  input: ContextManagerInput
): AccumulatedKnowledge {
  const { nlu_output, photo_data } = input;
  const updated = { ...existing };
  
  // Update confirmed facts
  if (nlu_output.crop_code && nlu_output.confidence > 0.7) {
    updated.confirmed_facts.crop = nlu_output.crop_code;
  }
  
  if (nlu_output.pest_hypothesis && nlu_output.confidence > 0.75) {
    updated.confirmed_facts.pest = nlu_output.pest_hypothesis;
  }
  
  if (nlu_output.disease_hypothesis && nlu_output.confidence > 0.75) {
    updated.confirmed_facts.disease = nlu_output.disease_hypothesis;
  }
  
  if (nlu_output.urgency_level === 'HIGH') {
    updated.confirmed_facts.severity = 'SEVERE';
  }
  
  if (photo_data) {
    updated.confirmed_facts.visual_confirmation = true;
  }
  
  return updated;
}

function getNextQuestion(
  knowledge: AccumulatedKnowledge,
  isUrgent: boolean
): ClarificationQuestionBank | null {
  const askedIds = new Set(knowledge.questions_asked);
  
  for (const question of QUESTION_BANK) {
    // Skip if already asked
    if (askedIds.has(question.id)) continue;
    
    // Skip if urgent and question can be skipped
    if (isUrgent && question.skip_if_urgent) continue;
    
    // Skip if we already know this information
    const shouldSkip = question.skip_if_known.some(field => {
      const facts = knowledge.confirmed_facts as Record<string, unknown>;
      return facts[field] !== undefined;
    });
    if (shouldSkip) continue;
    
    return question;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMER BEHAVIOR ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function analyzeFarmerBehavior(
  history: ConversationHistory,
  currentLanguage: string
): FarmerBehaviorPatterns {
  const avgResponseTime = history.avg_response_time_minutes;
  
  let responseSpeed: 'FAST' | 'MODERATE' | 'SLOW' = 'MODERATE';
  if (avgResponseTime < 5) responseSpeed = 'FAST';
  else if (avgResponseTime > 30) responseSpeed = 'SLOW';
  
  const hasUploadedPhoto = history.turns.some(t => t.photo_uploaded);
  
  let detailLevel: 'HIGH' | 'MODERATE' | 'LOW' = 'MODERATE';
  const avgInputLength = history.turns.reduce((sum, t) => sum + t.farmer_input.length, 0) / history.turns.length;
  if (avgInputLength > 100) detailLevel = 'HIGH';
  else if (avgInputLength < 30) detailLevel = 'LOW';
  
  return {
    response_speed: responseSpeed,
    avg_response_time_minutes: avgResponseTime,
    photo_willingness: hasUploadedPhoto ? 'HIGH' : 'MEDIUM',
    detail_level: detailLevel,
    language_consistency: `${(currentLanguage || 'en').toUpperCase()}_ONLY`,
    preferred_language: currentLanguage || 'en',
    cooperation_level: responseSpeed === 'FAST' ? 'HIGH' : 'MEDIUM'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONTEXT MANAGER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function processContextManager(
  input: Partial<ContextManagerInput> & { farmer_id: string; land_context?: any },
  existingSession: FullSessionData | null = null,
  allActiveSessions: SessionContext[] = []
): ContextManagerOutput {
  const startTime = Date.now();
  const isPhotoUpload = input.input_type === 'PHOTO';
  // Null-safe access to nlu_output.urgency_level
  const isUrgent = input.nlu_output?.urgency_level === 'HIGH';
  
  // CRITICAL FIX: Extract land context for pre-populating confirmed facts
  const landContext = input.land_context;
  
  // 1. Determine session type and get/create session
  let sessionType: 'NEW' | 'CONTINUING' | 'RESUMED' = 'NEW';
  let session: SessionContext;
  let conversationHistory: ConversationHistory;
  let accumulatedKnowledge: AccumulatedKnowledge;
  let stateTransitions: StateTransition[] = [];
  
  if (existingSession) {
    const hoursSinceLast = getHoursSinceLastInteraction(existingSession.session_context.last_interaction);
    
    if (hoursSinceLast > SESSION_TIMEOUT_HOURS) {
      // Session expired, create new
      session = createNewSession(input.farmer_id, input.land_id || 'UNKNOWN');
      conversationHistory = { turns: [], total_turns: 0, avg_response_time_minutes: 0 };
      accumulatedKnowledge = {
        confirmed_facts: {},
        suspected_but_unconfirmed: {},
        questions_asked: [],
        questions_remaining: QUESTION_BANK.map(q => q.id)
      };
    } else if (hoursSinceLast > 2) {
      // Session resuming after gap
      sessionType = 'RESUMED';
      session = { ...existingSession.session_context };
      session.last_interaction = new Date().toISOString();
      session.conversation_turn++;
      conversationHistory = existingSession.conversation_history;
      accumulatedKnowledge = existingSession.accumulated_knowledge;
      stateTransitions = existingSession.state_transitions;
    } else {
      // Continuing session
      sessionType = 'CONTINUING';
      session = { ...existingSession.session_context };
      session.last_interaction = new Date().toISOString();
      session.conversation_turn++;
      conversationHistory = existingSession.conversation_history;
      accumulatedKnowledge = existingSession.accumulated_knowledge;
      stateTransitions = existingSession.state_transitions;
    }
  } else {
    // New session
    session = createNewSession(input.farmer_id, input.land_id || 'UNKNOWN');
    conversationHistory = { turns: [], total_turns: 0, avg_response_time_minutes: 0 };
    accumulatedKnowledge = {
      confirmed_facts: {},
      suspected_but_unconfirmed: {},
      questions_asked: [],
      questions_remaining: QUESTION_BANK.map(q => q.id)
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Pre-populate confirmed facts from land context
  // This prevents redundant questions about crop, area, soil, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  if (landContext) {
    console.log('📊 [ContextManager] Pre-populating facts from land context');
    
    // Pre-populate crop info
    if (landContext.current_crop) {
      accumulatedKnowledge.confirmed_facts.crop = landContext.current_crop;
      // Mark crop question as already answered
      accumulatedKnowledge.questions_asked.push('Q1_CROP');
      accumulatedKnowledge.questions_remaining = accumulatedKnowledge.questions_remaining.filter(q => q !== 'Q1_CROP');
    }
    
    // Pre-populate area
    if (landContext.area_acres) {
      (accumulatedKnowledge.confirmed_facts as any).area_acres = landContext.area_acres;
    }
    
    // Pre-populate soil type
    if (landContext.soil_type) {
      (accumulatedKnowledge.confirmed_facts as any).soil_type = landContext.soil_type;
    }
    
    // Pre-populate growth stage
    if (landContext.growth_stage) {
      (accumulatedKnowledge.confirmed_facts as any).growth_stage = landContext.growth_stage;
      (accumulatedKnowledge.confirmed_facts as any).days_after_sowing = landContext.days_since_sowing;
    }
    
    // Pre-populate soil health (NPK)
    if (landContext.soil_health) {
      (accumulatedKnowledge.confirmed_facts as any).soil_npk = {
        nitrogen: landContext.soil_health.nitrogen,
        phosphorus: landContext.soil_health.phosphorus,
        potassium: landContext.soil_health.potassium
      };
    }
    
    // Pre-populate NDVI
    if (landContext.ndvi) {
      (accumulatedKnowledge.confirmed_facts as any).ndvi = landContext.ndvi.value;
      (accumulatedKnowledge.confirmed_facts as any).health_status = landContext.ndvi.health_status;
    }
    
    console.log('✅ [ContextManager] Pre-populated facts:', Object.keys(accumulatedKnowledge.confirmed_facts));
  }
  
  // 2. Detect context switch
  const contextSwitch = detectContextSwitch(input, existingSession, allActiveSessions);
  
  // 3. Update accumulated knowledge
  accumulatedKnowledge = updateAccumulatedKnowledge(accumulatedKnowledge, input);
  
  // 4. State transitions based on input
  let previousState = session.current_state;
  
  if (session.current_state === 'NEW_CONVERSATION') {
    const transition = transitionState(session, 'INFORMATION_GATHERING', 'First input received');
    if (transition) stateTransitions.push(transition);
  }
  
  if (isPhotoUpload && session.current_state === 'PHOTO_REQUESTED') {
    const transition = transitionState(session, 'PHOTO_RECEIVED', 'Photo uploaded');
    if (transition) stateTransitions.push(transition);
  }
  
  // 5. Determine if ready for diagnosis
  const questionsAsked = accumulatedKnowledge.questions_asked.length;
  const hasPhoto = accumulatedKnowledge.confirmed_facts.visual_confirmation;
  const hasCrop = !!accumulatedKnowledge.confirmed_facts.crop;
  const hasPestOrDisease = !!accumulatedKnowledge.confirmed_facts.pest || 
                           !!accumulatedKnowledge.confirmed_facts.disease;
  
  const readyForDiagnosis = (hasCrop && hasPestOrDisease && (hasPhoto || questionsAsked >= 3)) ||
                            (isUrgent && hasCrop) ||
                            questionsAsked >= MAX_QUESTIONS_LIMIT;
  
  const diagnosisConfidence = (hasCrop ? 0.3 : 0) + 
                              (hasPestOrDisease ? 0.3 : 0) + 
                              (hasPhoto ? 0.3 : 0) + 
                              (questionsAsked * 0.05);
  
  // 6. Determine next action
  let nextAction: NextAction;
  let reason: string;
  let passToAgent: string;
  
  if (contextSwitch.clarification_needed) {
    nextAction = 'CLARIFY_CONTEXT_SWITCH';
    reason = 'Context switch detected, need clarification';
    passToAgent = 'AGENT_2A_CONTEXT_MANAGER';
  } else if (isPhotoUpload) {
    nextAction = 'PROCESS_PHOTO';
    reason = 'Photo received, process for diagnosis';
    passToAgent = 'AGENT_3_PHOTO_ANALYSIS';
  } else if (readyForDiagnosis) {
    nextAction = 'PROCEED_TO_DIAGNOSIS';
    reason = 'Sufficient information gathered';
    passToAgent = 'AGENT_2B_DIAGNOSTIC_FLOW';
    
    if (session.current_state !== 'DIAGNOSIS_READY') {
      const transition = transitionState(session, 'DIAGNOSIS_READY', 'Sufficient info');
      if (transition) stateTransitions.push(transition);
    }
  } else if (!hasPhoto && (hasPestOrDisease || questionsAsked >= 2)) {
    nextAction = 'REQUEST_PHOTO';
    reason = 'Photo will improve diagnosis accuracy';
    passToAgent = 'AGENT_2A_CONTEXT_MANAGER';
    
    if (session.current_state !== 'PHOTO_REQUESTED') {
      const transition = transitionState(session, 'PHOTO_REQUESTED', 'Photo requested');
      if (transition) stateTransitions.push(transition);
    }
  } else {
    nextAction = 'ASK_CLARIFICATION_QUESTION';
    reason = 'More information needed';
    passToAgent = 'AGENT_2A_CONTEXT_MANAGER';
  }
  
  // 7. Build multi-land tracking
  const multiLandTracking: MultiLandTracking = {
    active_lands: allActiveSessions.map(s => ({
      land_id: s.land_id,
      crop: 'UNKNOWN',
      issue_status: s.current_state === 'RESOLVED' ? 'RESOLVED' : 'DIAGNOSIS_IN_PROGRESS',
      session_id: s.session_id,
      last_updated: s.last_interaction
    })),
    current_land_focus: session.land_id,
    total_active_issues: allActiveSessions.filter(s => s.is_active).length
  };
  
  // 8. Analyze farmer behavior
  const farmerBehavior = analyzeFarmerBehavior(conversationHistory, 'mr');
  
  // 9. Build conversation flow summary
  const conversationFlow = {
    questions_asked_count: questionsAsked,
    questions_remaining: MAX_QUESTIONS_LIMIT - questionsAsked,
    max_questions_limit: MAX_QUESTIONS_LIMIT,
    photo_requested: session.current_state === 'PHOTO_REQUESTED' || stateTransitions.some(t => t.to === 'PHOTO_REQUESTED'),
    photo_received: hasPhoto,
    ready_for_diagnosis: readyForDiagnosis,
    diagnosis_confidence: Math.min(diagnosisConfidence, 1.0)
  };
  
  // 10. Build output
  return {
    session_management: {
      session_id: session.session_id,
      session_type: sessionType,
      current_state: session.current_state,
      previous_state: previousState !== session.current_state ? previousState : undefined,
      state_transition: previousState !== session.current_state ? 
        `${previousState} → ${session.current_state}` : undefined,
      conversation_turn: session.conversation_turn,
      session_duration_minutes: Math.round(
        (new Date().getTime() - new Date(session.session_started).getTime()) / (1000 * 60)
      )
    },
    context_continuity: {
      is_follow_up: sessionType !== 'NEW',
      previous_interaction_summary: existingSession ? 
        `Turn ${existingSession.session_context.conversation_turn}: ${existingSession.conversation_history.turns.slice(-1)[0]?.farmer_input_summary || 'Unknown'}` : 
        undefined,
      time_since_last_interaction_hours: existingSession ? 
        getHoursSinceLastInteraction(existingSession.session_context.last_interaction) : 0,
      context_retrieved_successfully: !!existingSession,
      context_gaps: !hasCrop ? ['CROP_TYPE'] : []
    },
    multi_land_tracking: multiLandTracking,
    conversation_flow: conversationFlow,
    accumulated_knowledge: accumulatedKnowledge,
    farmer_engagement: farmerBehavior,
    context_switch: contextSwitch,
    next_action_recommendation: {
      action: nextAction,
      reason,
      pass_to_agent: passToAgent,
      priority: isUrgent ? 'IMMEDIATE' : 'NORMAL',
      fallback_action: nextAction === 'REQUEST_PHOTO' ? 'ASK_CLARIFICATION_QUESTION' : undefined
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CONTEXT_MANAGER_VERSION,
  QUESTION_BANK,
  MAX_QUESTIONS_LIMIT,
  createNewSession,
  getNextQuestion,
  detectContextSwitch,
  getHoursSinceLastInteraction
};
