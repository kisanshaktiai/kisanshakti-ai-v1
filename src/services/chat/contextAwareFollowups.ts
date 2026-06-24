/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXT-AWARE FOLLOW-UP GENERATOR (Frontend)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates truly personalized follow-up questions based on:
 * 1. The ACTUAL content of the AI/Decision Brain response
 * 2. The land context (crop, stage, etc.)
 * 3. The type of advisory given
 * 
 * NOT static templates - dynamically adapts to the conversation context.
 */

export interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'income' | 'yield' | 'savings' | 'next_action' | 'expert_tip' | 'diagnosis' | 'prevention';
  emoji: string;
}

/**
 * Generate context-aware follow-ups for Decision Brain responses.
 * Analyzes the actual response content to create relevant next questions.
 */
export function generateContextAwareFollowups(
  response: string,
  advisory: any,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const lang = ['hi', 'mr', 'en'].includes(language) ? language : 'en';
  const questions: FollowUpQuestion[] = [];
  const lowerResponse = response.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Detect topics discussed in the response
  // ═══════════════════════════════════════════════════════════════════════════
  
  const topicsDetected = {
    pest: /pest|कीट|कीड|किडा|borer|aphid|mites|whitefly|bollworm|stem.*borer|shoot.*borer|early.*shoot/i.test(lowerResponse),
    disease: /disease|रोग|blight|rust|mildew|fungus|bacterial|virus|yellowing|wilting|rot|dead.*heart/i.test(lowerResponse),
    fertilizer: /fertilizer|खाद|खत|urea|dap|npk|nitrogen|potash|phosphorus|nutrient/i.test(lowerResponse),
    irrigation: /water|पानी|पाणी|irrigation|सिंचाई|drip|sprinkler|flood/i.test(lowerResponse),
    diagnosis: /diagnos|तपास|निदान|symptom|लक्षण|check|confirm|verify|खात्री|संभाव्य|संभव|possible.*cause/i.test(lowerResponse),
    treatment: /spray|treatment|उपचार|pesticide|fungicide|insecticide|control|manage|फवारणी/i.test(lowerResponse),
    prevention: /prevent|रोखा|बचाव|avoid|protect|सुरक्षित|next.*season/i.test(lowerResponse),
    multipleCauses: /1️⃣.*2️⃣|2.*possible|multiple.*cause|अनेक.*कारण|दोन.*शक्यता|\d+%.*शक्यता/i.test(lowerResponse)
  };
  
  // Check advisory mode if available
  const isDiagnosticMode = advisory?.mode === 'DIAGNOSTIC' || topicsDetected.multipleCauses;
  
  console.log('🔍 [Frontend FollowUp] Topics detected:', topicsDetected);
  console.log('🔍 [Frontend FollowUp] Diagnostic mode:', isDiagnosticMode);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Generate questions based on detected topics
  // ═══════════════════════════════════════════════════════════════════════════
  
  // If multiple causes / diagnostic mode - ask for confirmation
  if (isDiagnosticMode || topicsDetected.diagnosis) {
    questions.push(getConfirmationQuestion(lang));
  }
  
  // If pest/disease mentioned - ask about treatment savings
  if (topicsDetected.pest || topicsDetected.disease) {
    questions.push(getTreatmentSavingsQuestion(lang));
    
    // Also ask about prevention
    if (!topicsDetected.prevention) {
      questions.push(getPreventionQuestion(lang));
    }
  }
  
  // If treatment mentioned - ask about timing
  if (topicsDetected.treatment) {
    questions.push(getTreatmentTimingQuestion(lang));
  }
  
  // If fertilizer mentioned - ask about yield impact
  if (topicsDetected.fertilizer) {
    questions.push(getFertilizerYieldQuestion(lang));
  }
  
  // If irrigation mentioned - ask about water savings
  if (topicsDetected.irrigation) {
    questions.push(getWaterSavingsQuestion(lang));
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Ensure we always have 3 relevant questions
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Always add "what to do tomorrow" if space
  if (questions.length < 3) {
    questions.push(getNextActionQuestion(lang));
  }
  
  // Add yield impact question if not already present
  if (questions.length < 3 && !questions.some(q => q.category === 'yield')) {
    questions.push(getYieldImpactQuestion(lang));
  }
  
  // Deduplicate by category
  const uniqueQuestions = deduplicateByCategory(questions);
  return uniqueQuestions.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

function getConfirmationQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'How can I confirm which cause is affecting my crop?',
    hi: 'मैं कैसे पता करूं कि कौनसी समस्या है?',
    mr: 'मी कसे निश्चित करू की कोणते कारण आहे?'
  };
  return { id: 'diag1', text: templates[lang] || templates.en, category: 'diagnosis', emoji: '🔍' };
}

function getTreatmentSavingsQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'How much crop loss will I prevent with timely treatment?',
    hi: 'समय पर इलाज से कितना नुकसान बचेगा?',
    mr: 'वेळेवर उपचाराने किती नुकसान टळेल?'
  };
  return { id: 'save1', text: templates[lang] || templates.en, category: 'savings', emoji: '💵' };
}

function getPreventionQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'How can I prevent this problem next season?',
    hi: 'अगली बार यह समस्या कैसे रोकूं?',
    mr: 'पुढच्या वेळी हे कसे टाळू?'
  };
  return { id: 'prev1', text: templates[lang] || templates.en, category: 'prevention', emoji: '🛡️' };
}

function getTreatmentTimingQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'When is the best time to apply the spray?',
    hi: 'फवारणी का सबसे अच्छा समय क्या है?',
    mr: 'फवारणीची योग्य वेळ कोणती?'
  };
  return { id: 'time1', text: templates[lang] || templates.en, category: 'next_action', emoji: '⏰' };
}

function getFertilizerYieldQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'How much will yield increase with correct dosage?',
    hi: 'सही मात्रा से उपज कितनी बढ़ेगी?',
    mr: 'योग्य प्रमाणाने उत्पादन किती वाढेल?'
  };
  return { id: 'fert1', text: templates[lang] || templates.en, category: 'yield', emoji: '📈' };
}

function getWaterSavingsQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'How can I save water and still get good yield?',
    hi: 'कम पानी में भी अच्छी उपज कैसे लूं?',
    mr: 'कमी पाण्यात चांगले उत्पादन कसे घेऊ?'
  };
  return { id: 'water1', text: templates[lang] || templates.en, category: 'savings', emoji: '💧' };
}

function getNextActionQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'What should I do first thing tomorrow?',
    hi: 'कल सबसे पहले क्या करूं?',
    mr: 'उद्या सर्वात आधी काय करू?'
  };
  return { id: 'next1', text: templates[lang] || templates.en, category: 'next_action', emoji: '🎯' };
}

function getYieldImpactQuestion(lang: string): FollowUpQuestion {
  const templates: Record<string, string> = {
    en: 'What yield improvement can I expect from this advice?',
    hi: 'इस सलाह से उपज कितनी बढ़ेगी?',
    mr: 'या सल्ल्याने उत्पादन किती वाढेल?'
  };
  return { id: 'yield1', text: templates[lang] || templates.en, category: 'yield', emoji: '📊' };
}

function deduplicateByCategory(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  const seen = new Set<string>();
  return questions.filter(q => {
    if (seen.has(q.category)) return false;
    seen.add(q.category);
    return true;
  });
}

/**
 * Converts action-based follow-ups to context-aware ones.
 * Used as fallback when advisory has actions but response content analysis is preferred.
 */
export function convertActionsToFollowups(
  actions: any[],
  language: string
): FollowUpQuestion[] {
  const lang = ['hi', 'mr', 'en'].includes(language) ? language : 'en';
  const questions: FollowUpQuestion[] = [];
  
  for (const action of actions.slice(0, 3)) {
    const actionName = action.action?.toString() || '';
    
    // Convert action type to relevant follow-up question
    if (/SPRAY|PESTICIDE|FUNGICIDE/i.test(actionName)) {
      questions.push(getTreatmentSavingsQuestion(lang));
    } else if (/FERTILIZER|UREA|NPK|DAP/i.test(actionName)) {
      questions.push(getFertilizerYieldQuestion(lang));
    } else if (/IRRIGATE|WATER/i.test(actionName)) {
      questions.push(getWaterSavingsQuestion(lang));
    } else {
      questions.push(getNextActionQuestion(lang));
    }
  }
  
  return deduplicateByCategory(questions).slice(0, 3);
}
