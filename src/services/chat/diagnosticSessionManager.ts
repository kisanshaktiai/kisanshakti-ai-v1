/**
 * Diagnostic Session Manager
 * 
 * Manages stateful diagnostic conversations per land chat.
 * Tracks question progression, cause elimination, and transitions between modes.
 * 
 * Key design principle: AI is used for UNDERSTANDING only, actions are DETERMINISTIC.
 */

export interface PossibleCause {
  id: string;
  name: string;
  probability: number;
  differentiatingFactors: string[];
  yesIndicates?: string;
  noIndicates?: string;
  eliminated?: boolean;
  boosted?: boolean;
}

export interface DiagnosticQuestion {
  id: string;
  text: string;
  yesIndicates: string;
  noIndicates: string;
  outcomeYes?: string;
  outcomeNo?: string;
}

export type DiagnosticMode = 'DIAGNOSTIC' | 'PHOTO_REQUIRED' | 'ACTION' | 'CLARIFICATION';

export interface DiagnosticSessionState {
  isActive: boolean;
  landId: string;
  sessionId: string;
  cropCode: string;
  language: string;
  
  // Question progression
  currentQuestionIndex: number;
  answeredQuestions: Array<{
    questionId: string;
    questionText: string;
    answer: 'yes' | 'no';
    timestamp: number;
  }>;
  
  // Cause tracking
  possibleCauses: PossibleCause[];
  confirmedCauseId: string | null;
  
  // Questions pool
  disambiguationQuestions: DiagnosticQuestion[];
  
  // Context from Decision Brain
  decisionContext: {
    cropCode: string;
    growthStage: string;
    daysAfterSowing: number;
    symptomId?: string;
    detectedSymptoms: string[];
    confidence: number;
  } | null;
  
  // Photo requirement
  photoRequested: boolean;
  photoInstructions?: string;
  
  // Timestamps
  startedAt: number;
  lastActivityAt: number;
}

export interface DiagnosticAnswerResult {
  nextMode: DiagnosticMode;
  updatedCauses: PossibleCause[];
  nextQuestionIndex: number;
  confirmedCauseId: string | null;
  responseText: string;
  shouldRequestPhoto: boolean;
  photoInstructions?: string;
}

// Localized labels for diagnostic messages
const DIAGNOSTIC_LABELS: Record<string, Record<string, string>> = {
  en: {
    causeEliminated: 'Based on your answer, we can rule out',
    causeBoosted: 'Your answer suggests this might be',
    needMoreInfo: 'Let me ask another question to narrow down the issue',
    photoNeeded: 'I need a photo to confirm this diagnosis',
    confirmed: 'Based on your responses, the most likely cause is',
    multipleRemaining: 'There are still a few possibilities. Let me ask more.',
  },
  hi: {
    causeEliminated: 'आपके जवाब के आधार पर, हम इसे खारिज कर सकते हैं',
    causeBoosted: 'आपका जवाब बताता है कि यह हो सकता है',
    needMoreInfo: 'समस्या को समझने के लिए एक और सवाल पूछता हूं',
    photoNeeded: 'इस निदान की पुष्टि के लिए मुझे एक फोटो चाहिए',
    confirmed: 'आपके जवाबों के आधार पर, सबसे संभावित कारण है',
    multipleRemaining: 'अभी भी कुछ संभावनाएं हैं। और सवाल पूछता हूं।',
  },
  mr: {
    causeEliminated: 'तुमच्या उत्तरावरून, हे कारण नाकारता येते',
    causeBoosted: 'तुमचे उत्तर सुचवते की हे असू शकते',
    needMoreInfo: 'समस्या समजून घेण्यासाठी आणखी एक प्रश्न विचारतो',
    photoNeeded: 'या निदानाची खात्री करण्यासाठी मला फोटो हवा आहे',
    confirmed: 'तुमच्या उत्तरांवरून, सर्वात संभाव्य कारण आहे',
    multipleRemaining: 'अजून काही शक्यता आहेत। आणखी विचारतो।',
  },
};

/**
 * Create a new diagnostic session for a land chat
 */
export function createDiagnosticSession(
  landId: string,
  cropCode: string,
  language: string,
  possibleCauses: PossibleCause[],
  disambiguationQuestions: DiagnosticQuestion[],
  decisionContext?: DiagnosticSessionState['decisionContext']
): DiagnosticSessionState {
  return {
    isActive: true,
    landId,
    sessionId: `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    cropCode,
    language,
    currentQuestionIndex: 0,
    answeredQuestions: [],
    possibleCauses: possibleCauses.map(c => ({ ...c, eliminated: false, boosted: false })),
    confirmedCauseId: null,
    disambiguationQuestions,
    decisionContext: decisionContext || null,
    photoRequested: false,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

/**
 * Apply a diagnostic answer and determine next step
 * This is DETERMINISTIC - no AI involved in the decision logic
 */
export function applyDiagnosticAnswer(
  session: DiagnosticSessionState,
  questionId: string,
  answer: 'yes' | 'no'
): DiagnosticAnswerResult {
  const lang = session.language || 'en';
  const labels = DIAGNOSTIC_LABELS[lang] || DIAGNOSTIC_LABELS.en;
  
  // Find the question that was answered
  const question = session.disambiguationQuestions.find(q => q.id === questionId);
  if (!question) {
    // If question not found, just move to next
    return {
      nextMode: 'DIAGNOSTIC',
      updatedCauses: session.possibleCauses,
      nextQuestionIndex: session.currentQuestionIndex + 1,
      confirmedCauseId: null,
      responseText: labels.needMoreInfo,
      shouldRequestPhoto: false,
    };
  }
  
  // Apply cause elimination/boosting logic
  const indicatedCauseId = answer === 'yes' ? question.yesIndicates : question.noIndicates;
  const oppositeId = answer === 'yes' ? question.noIndicates : question.yesIndicates;
  
  const updatedCauses = session.possibleCauses.map(cause => {
    if (cause.id === indicatedCauseId) {
      // Boost this cause
      return {
        ...cause,
        probability: Math.min(cause.probability + 25, 95),
        boosted: true,
      };
    } else if (cause.id === oppositeId) {
      // Reduce this cause or eliminate if already low
      const newProb = cause.probability - 30;
      return {
        ...cause,
        probability: Math.max(newProb, 0),
        eliminated: newProb <= 10,
      };
    }
    return cause;
  });
  
  // Filter out eliminated causes
  const remainingCauses = updatedCauses.filter(c => !c.eliminated && c.probability > 10);
  
  // Determine next mode
  let nextMode: DiagnosticMode = 'DIAGNOSTIC';
  let confirmedCauseId: string | null = null;
  let responseText = '';
  let shouldRequestPhoto = false;
  let photoInstructions: string | undefined;
  
  // Check if we have a clear winner (high probability difference)
  const sortedCauses = [...remainingCauses].sort((a, b) => b.probability - a.probability);
  
  if (sortedCauses.length === 0) {
    // All causes eliminated - need photo or expert
    nextMode = 'PHOTO_REQUIRED';
    shouldRequestPhoto = true;
    photoInstructions = getPhotoInstructions(session.decisionContext?.symptomId || 'general', lang);
    responseText = labels.photoNeeded;
  } else if (sortedCauses.length === 1 || 
             (sortedCauses.length > 1 && sortedCauses[0].probability - sortedCauses[1].probability >= 30)) {
    // Clear winner - move to ACTION mode
    const topCause = sortedCauses[0];
    if (topCause.probability >= 70) {
      nextMode = 'ACTION';
      confirmedCauseId = topCause.id;
      responseText = `${labels.confirmed}: ${topCause.name}`;
    } else {
      // Still need more confidence - request photo
      nextMode = 'PHOTO_REQUIRED';
      shouldRequestPhoto = true;
      photoInstructions = getPhotoInstructions(topCause.id, lang);
      responseText = `${labels.causeBoosted}: ${topCause.name}. ${labels.photoNeeded}`;
    }
  } else {
    // Multiple causes with similar probability - continue diagnostics
    const nextQuestionIdx = session.currentQuestionIndex + 1;
    
    if (nextQuestionIdx >= session.disambiguationQuestions.length) {
      // No more questions - use top cause or request photo
      const topCause = sortedCauses[0];
      if (topCause.probability >= 50) {
        nextMode = 'ACTION';
        confirmedCauseId = topCause.id;
        responseText = `${labels.confirmed}: ${topCause.name}`;
      } else {
        nextMode = 'PHOTO_REQUIRED';
        shouldRequestPhoto = true;
        photoInstructions = getPhotoInstructions(session.decisionContext?.symptomId || 'general', lang);
        responseText = labels.photoNeeded;
      }
    } else {
      nextMode = 'DIAGNOSTIC';
      responseText = labels.needMoreInfo;
    }
  }
  
  return {
    nextMode,
    updatedCauses,
    nextQuestionIndex: session.currentQuestionIndex + 1,
    confirmedCauseId,
    responseText,
    shouldRequestPhoto,
    photoInstructions,
  };
}

/**
 * Get localized photo instructions based on symptom/cause
 */
function getPhotoInstructions(symptomOrCauseId: string, language: string): string {
  const instructions: Record<string, Record<string, string>> = {
    en: {
      general: 'Please take a clear photo of the affected area in good daylight.',
      LEAF_YELLOWING: 'Take a close-up photo of the yellow leaves, showing both sides.',
      LEAF_SPOTS: 'Photograph the spotted leaves clearly, showing the pattern.',
      STUNTED_GROWTH: 'Take a photo showing the full plant height compared to healthy plants.',
      WILTING: 'Capture the wilting plant during the hottest part of the day.',
      nutrient_deficiency: 'Take photos of leaves from different parts of the plant.',
      pest_damage: 'Look for insects and take a close-up of any damage patterns.',
      disease_infection: 'Photograph any unusual spots, lesions, or discoloration.',
    },
    hi: {
      general: 'कृपया प्रभावित क्षेत्र की एक स्पष्ट फोटो दिन के उजाले में लें।',
      LEAF_YELLOWING: 'पीले पत्तों की क्लोज-अप फोटो लें, दोनों तरफ दिखाएं।',
      LEAF_SPOTS: 'धब्बेदार पत्तों की स्पष्ट फोटो लें, पैटर्न दिखाएं।',
      STUNTED_GROWTH: 'स्वस्थ पौधों की तुलना में पूरी ऊंचाई दिखाते हुए फोटो लें।',
      WILTING: 'दिन के सबसे गर्म समय में मुरझाए पौधे की फोटो लें।',
      nutrient_deficiency: 'पौधे के विभिन्न हिस्सों से पत्तियों की फोटो लें।',
      pest_damage: 'कीड़े देखें और नुकसान के पैटर्न की क्लोज-अप लें।',
      disease_infection: 'किसी भी असामान्य धब्बे, घाव या रंग बदलाव की फोटो लें।',
    },
    mr: {
      general: 'कृपया दिवसाच्या प्रकाशात प्रभावित भागाचा स्पष्ट फोटो काढा.',
      LEAF_YELLOWING: 'पिवळ्या पानांचा क्लोज-अप फोटो काढा, दोन्ही बाजू दाखवा.',
      LEAF_SPOTS: 'डागाळलेल्या पानांचा स्पष्ट फोटो काढा, नमुना दाखवा.',
      STUNTED_GROWTH: 'निरोगी झाडांशी तुलना करून संपूर्ण उंची दाखवणारा फोटो काढा.',
      WILTING: 'दिवसाच्या सर्वात गरम वेळी कोमेजलेल्या झाडाचा फोटो काढा.',
      nutrient_deficiency: 'झाडाच्या वेगवेगळ्या भागांतील पानांचे फोटो काढा.',
      pest_damage: 'किडे शोधा आणि नुकसानाच्या पद्धतीचा क्लोज-अप काढा.',
      disease_infection: 'कोणतेही असामान्य डाग, जखमा किंवा रंग बदलाचे फोटो काढा.',
    },
  };
  
  const langInstructions = instructions[language] || instructions.en;
  return langInstructions[symptomOrCauseId] || langInstructions.general;
}

/**
 * Check if input is a diagnostic answer (Yes/No in any language)
 */
export function isDiagnosticAnswer(text: string): { isAnswer: boolean; answer?: 'yes' | 'no' } {
  const normalizedText = text.toLowerCase().trim();
  
  // Yes patterns in multiple languages
  const yesPatterns = [
    'yes', 'yeah', 'yep', 'yup', 'हां', 'हाँ', 'हा', 'जी', 'जी हां', 'होय', 'हो',
    '1', 'y', 'ha', 'haa', 'ji', 'ho', 'hoy'
  ];
  
  // No patterns in multiple languages
  const noPatterns = [
    'no', 'nope', 'nah', 'नहीं', 'ना', 'नाही', 'नाय', 'नको',
    '2', 'n', 'nahi', 'nahin', 'nako', 'nay'
  ];
  
  if (yesPatterns.some(p => normalizedText === p || normalizedText.startsWith(p + ' '))) {
    return { isAnswer: true, answer: 'yes' };
  }
  
  if (noPatterns.some(p => normalizedText === p || normalizedText.startsWith(p + ' '))) {
    return { isAnswer: true, answer: 'no' };
  }
  
  return { isAnswer: false };
}

/**
 * Update session after an answer
 */
export function updateSessionWithAnswer(
  session: DiagnosticSessionState,
  questionId: string,
  questionText: string,
  answer: 'yes' | 'no',
  result: DiagnosticAnswerResult
): DiagnosticSessionState {
  return {
    ...session,
    currentQuestionIndex: result.nextQuestionIndex,
    answeredQuestions: [
      ...session.answeredQuestions,
      {
        questionId,
        questionText,
        answer,
        timestamp: Date.now(),
      },
    ],
    possibleCauses: result.updatedCauses,
    confirmedCauseId: result.confirmedCauseId,
    photoRequested: result.shouldRequestPhoto,
    photoInstructions: result.photoInstructions,
    lastActivityAt: Date.now(),
  };
}

/**
 * End diagnostic session
 */
export function endDiagnosticSession(session: DiagnosticSessionState): DiagnosticSessionState {
  return {
    ...session,
    isActive: false,
    lastActivityAt: Date.now(),
  };
}

/**
 * Get current question from session
 */
export function getCurrentQuestion(session: DiagnosticSessionState): DiagnosticQuestion | null {
  if (session.currentQuestionIndex >= session.disambiguationQuestions.length) {
    return null;
  }
  return session.disambiguationQuestions[session.currentQuestionIndex];
}

/**
 * Get remaining (non-eliminated) causes
 */
export function getRemainingCauses(session: DiagnosticSessionState): PossibleCause[] {
  return session.possibleCauses
    .filter(c => !c.eliminated && c.probability > 10)
    .sort((a, b) => b.probability - a.probability);
}
