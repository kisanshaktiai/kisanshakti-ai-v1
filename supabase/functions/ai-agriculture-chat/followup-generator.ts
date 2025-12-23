// ============= DYNAMIC CONTEXT-AWARE FOLLOW-UP QUESTIONS =============
// Generates truly personalized follow-ups based on ACTUAL response content
// Not static templates - analyzes response to create relevant next questions

export interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'income' | 'yield' | 'savings' | 'next_action' | 'expert_tip' | 'diagnosis' | 'prevention';
  emoji: string;
}

/**
 * Parse AI-generated follow-up questions from the response
 * The AI includes these in a structured format at the end of its response
 */
export function parseAIGeneratedFollowUps(
  aiResponse: string,
  language: string,
  landContext?: any
): { cleanedResponse: string; followUpQuestions: FollowUpQuestion[] } {
  const followUpQuestions: FollowUpQuestion[] = [];
  let cleanedResponse = aiResponse;
  
  // Look for the follow-up section marker in the AI response
  const followUpPattern = /💡\s*(?:FOLLOW_UP_QUESTIONS|अनुवर्ती प्रश्न|पुढील प्रश्न):\s*\[([^\]]+)\]/i;
  const match = aiResponse.match(followUpPattern);
  
  if (match) {
    try {
      cleanedResponse = aiResponse.replace(followUpPattern, '').trim();
      const questionsJson = `[${match[1]}]`;
      const parsedQuestions = JSON.parse(questionsJson);
      
      parsedQuestions.forEach((q: any, index: number) => {
        if (typeof q === 'string') {
          followUpQuestions.push({
            id: `ai-${index}`,
            text: q.trim(),
            category: detectCategory(q),
            emoji: getEmojiForCategory(detectCategory(q))
          });
        } else if (q.text) {
          followUpQuestions.push({
            id: `ai-${index}`,
            text: q.text.trim(),
            category: q.category || detectCategory(q.text),
            emoji: q.emoji || getEmojiForCategory(q.category || detectCategory(q.text))
          });
        }
      });
    } catch (e) {
      console.log('⚠️ Could not parse AI follow-ups, using smart fallback');
    }
  }
  
  // If no AI-generated questions, generate CONTEXT-AWARE ones from actual response
  if (followUpQuestions.length === 0) {
    followUpQuestions.push(...generateContextAwareFollowUps(aiResponse, language, landContext));
  }
  
  return {
    cleanedResponse,
    followUpQuestions: followUpQuestions.slice(0, 3)
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXT-AWARE FOLLOW-UP GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Analyzes the ACTUAL AI response content to generate truly relevant follow-ups.
 * NOT static templates - dynamically adapts to what was discussed.
 */
function generateContextAwareFollowUps(
  response: string, 
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const lowerResponse = response.toLowerCase();
  const lang = ['hi', 'mr', 'en'].includes(language) ? language : 'en';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Detect what topics were discussed in the response
  // ═══════════════════════════════════════════════════════════════════════════
  
  const topicsDetected = {
    pest: /pest|कीट|कीड|किडा|borer|aphid|mites|whitefly|bollworm|stem.*borer|shoot.*borer|early.*shoot/i.test(lowerResponse),
    disease: /disease|रोग|blight|rust|mildew|fungus|bacterial|virus|yellowing|wilting|rot/i.test(lowerResponse),
    fertilizer: /fertilizer|खाद|खत|urea|dap|npk|nitrogen|potash|phosphorus|nutrient/i.test(lowerResponse),
    irrigation: /water|पानी|पाणी|irrigation|सिंचाई|drip|sprinkler|flood/i.test(lowerResponse),
    diagnosis: /diagnos|तपास|निदान|symptom|लक्षण|check|confirm|verify|खात्री/i.test(lowerResponse),
    treatment: /spray|treatment|उपचार|pesticide|fungicide|insecticide|control|manage/i.test(lowerResponse),
    prevention: /prevent|रोखा|बचाव|avoid|protect|सुरक्षित/i.test(lowerResponse),
    costSavings: /cost|खर्च|save|बचत|वाच|money|पैस/i.test(lowerResponse),
    yieldIncrease: /yield|उपज|उत्पादन|increase|वाढ|बढ़|production|harvest/i.test(lowerResponse),
    probableCauses: /probable|संभाव्य|संभव|शक्यता|possible.*cause|likely/i.test(lowerResponse),
    multiCause: /1️⃣.*2️⃣|2.*possible|multiple.*cause|अनेक.*कारण|दोन.*शक्यता/i.test(lowerResponse)
  };
  
  // Extract specific entities mentioned
  const extractedEntities = {
    cropName: landContext?.current_crop || landContext?.crop_name || null,
    pestName: extractPestName(lowerResponse),
    diseaseName: extractDiseaseName(lowerResponse),
    chemicalMentioned: extractChemicalName(lowerResponse)
  };
  
  console.log('🔍 [FollowUp] Topics detected:', topicsDetected);
  console.log('🔍 [FollowUp] Entities extracted:', extractedEntities);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Generate questions based on WHAT WAS DISCUSSED
  // ═══════════════════════════════════════════════════════════════════════════
  
  // If multiple causes mentioned - ask for clarification
  if (topicsDetected.multiCause || topicsDetected.probableCauses) {
    questions.push(generateDiagnosticFollowUp(lang, extractedEntities));
  }
  
  // If diagnosis was discussed - ask about confirmation
  if (topicsDetected.diagnosis && !topicsDetected.treatment) {
    questions.push(generateConfirmationFollowUp(lang, extractedEntities));
  }
  
  // If pest/disease mentioned - ask about treatment cost/benefit
  if (topicsDetected.pest || topicsDetected.disease) {
    if (extractedEntities.pestName || extractedEntities.diseaseName) {
      questions.push(generateTreatmentImpactFollowUp(lang, extractedEntities));
    }
    // Ask about prevention for next season
    questions.push(generatePreventionFollowUp(lang, extractedEntities));
  }
  
  // If treatment was discussed - ask about timing and cost
  if (topicsDetected.treatment && extractedEntities.chemicalMentioned) {
    questions.push(generateTreatmentTimingFollowUp(lang, extractedEntities));
  }
  
  // If fertilizer mentioned - ask about optimal dosage for yield
  if (topicsDetected.fertilizer) {
    questions.push(generateFertilizerYieldFollowUp(lang, extractedEntities));
  }
  
  // If irrigation mentioned - ask about water savings
  if (topicsDetected.irrigation) {
    questions.push(generateIrrigationSavingsFollowUp(lang));
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Ensure we always have 3 relevant questions
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Always add "what to do tomorrow" if space available
  if (questions.length < 3) {
    questions.push(generateNextActionFollowUp(lang, extractedEntities));
  }
  
  // Add yield/income question if not already present
  if (questions.length < 3 && !questions.some(q => q.category === 'yield' || q.category === 'income')) {
    questions.push(generateYieldImpactFollowUp(lang, extractedEntities));
  }
  
  // Deduplicate and limit
  const uniqueQuestions = deduplicateQuestions(questions);
  return uniqueQuestions.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractPestName(text: string): string | null {
  const pestPatterns = [
    /early\s*shoot\s*borer/i,
    /stem\s*borer/i,
    /top\s*borer/i,
    /bollworm/i,
    /aphid/i,
    /whitefly/i,
    /mites/i,
    /thrips/i,
    /caterpillar/i,
    /grub/i
  ];
  
  for (const pattern of pestPatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractDiseaseName(text: string): string | null {
  const diseasePatterns = [
    /dead\s*heart/i,
    /leaf\s*rust/i,
    /stem\s*rust/i,
    /powdery\s*mildew/i,
    /downy\s*mildew/i,
    /blight/i,
    /wilt/i,
    /rot/i,
    /mosaic/i,
    /yellowing/i
  ];
  
  for (const pattern of diseasePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractChemicalName(text: string): string | null {
  const chemicalPatterns = [
    /chlorantraniliprole/i,
    /cartap/i,
    /fipronil/i,
    /imidacloprid/i,
    /chlorpyrifos/i,
    /thiamethoxam/i,
    /urea/i,
    /dap/i,
    /npk/i,
    /mancozeb/i
  ];
  
  for (const pattern of chemicalPatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT-SPECIFIC QUESTION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function generateDiagnosticFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'How can I confirm which cause is affecting my crop?',
    hi: 'मैं कैसे पता करूं कि कौनसी समस्या है?',
    mr: 'मी कसे निश्चित करू की कोणते कारण आहे?'
  };
  return { id: 'diag1', text: templates[lang] || templates.en, category: 'diagnosis', emoji: '🔍' };
}

function generateConfirmationFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'What signs should I look for to confirm?',
    hi: 'पक्का करने के लिए क्या देखूं?',
    mr: 'खात्री करण्यासाठी काय बघू?'
  };
  return { id: 'conf1', text: templates[lang] || templates.en, category: 'diagnosis', emoji: '✅' };
}

function generateTreatmentImpactFollowUp(lang: string, entities: any): FollowUpQuestion {
  const issue = entities.pestName || entities.diseaseName || 'this';
  const templates = {
    en: `How much crop loss will I prevent by treating ${issue} now?`,
    hi: `समय पर इलाज से कितना नुकसान बचेगा?`,
    mr: `वेळेवर उपचाराने किती नुकसान टळेल?`
  };
  return { id: 'treat1', text: templates[lang] || templates.en, category: 'savings', emoji: '💵' };
}

function generatePreventionFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'How can I prevent this problem next season?',
    hi: 'अगली बार यह समस्या कैसे रोकूं?',
    mr: 'पुढच्या वेळी हे कसे टाळू?'
  };
  return { id: 'prev1', text: templates[lang] || templates.en, category: 'prevention', emoji: '🛡️' };
}

function generateTreatmentTimingFollowUp(lang: string, entities: any): FollowUpQuestion {
  const chemical = entities.chemicalMentioned || 'the spray';
  const templates = {
    en: `When is the best time to apply ${chemical}?`,
    hi: `फवारणी का सबसे अच्छा समय क्या है?`,
    mr: `फवारणीची योग्य वेळ कोणती?`
  };
  return { id: 'time1', text: templates[lang] || templates.en, category: 'next_action', emoji: '⏰' };
}

function generateFertilizerYieldFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'How much will my yield increase with correct fertilizer dosage?',
    hi: 'सही खाद से उपज कितनी बढ़ेगी?',
    mr: 'योग्य खतामुळे उत्पादन किती वाढेल?'
  };
  return { id: 'fert1', text: templates[lang] || templates.en, category: 'yield', emoji: '📈' };
}

function generateIrrigationSavingsFollowUp(lang: string): FollowUpQuestion {
  const templates = {
    en: 'How can I save water and still get good yield?',
    hi: 'कम पानी में भी अच्छी उपज कैसे लूं?',
    mr: 'कमी पाण्यात चांगले उत्पादन कसे घेऊ?'
  };
  return { id: 'water1', text: templates[lang] || templates.en, category: 'savings', emoji: '💧' };
}

function generateNextActionFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'What should I do first thing tomorrow?',
    hi: 'कल सबसे पहले क्या करूं?',
    mr: 'उद्या सर्वात आधी काय करू?'
  };
  return { id: 'next1', text: templates[lang] || templates.en, category: 'next_action', emoji: '🎯' };
}

function generateYieldImpactFollowUp(lang: string, entities: any): FollowUpQuestion {
  const templates = {
    en: 'What is the expected yield improvement from this advice?',
    hi: 'इस सलाह से उपज कितनी बढ़ेगी?',
    mr: 'या सल्ल्याने उत्पादन किती वाढेल?'
  };
  return { id: 'yield1', text: templates[lang] || templates.en, category: 'yield', emoji: '📊' };
}

function deduplicateQuestions(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  const seen = new Set<string>();
  return questions.filter(q => {
    const key = q.category + q.text.substring(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectCategory(text: string): FollowUpQuestion['category'] {
  const lower = text.toLowerCase();
  
  if (lower.includes('income') || lower.includes('कमाई') || lower.includes('उत्पन्न') || lower.includes('पैसे')) {
    return 'income';
  }
  if (lower.includes('yield') || lower.includes('उपज') || lower.includes('उत्पादन') || lower.includes('बढ़ा') || lower.includes('वाढ')) {
    return 'yield';
  }
  if (lower.includes('save') || lower.includes('बचा') || lower.includes('वाच') || lower.includes('cost')) {
    return 'savings';
  }
  if (lower.includes('tomorrow') || lower.includes('कल') || lower.includes('उद्या') || lower.includes('next') || lower.includes('step')) {
    return 'next_action';
  }
  if (lower.includes('confirm') || lower.includes('diagnos') || lower.includes('check') || lower.includes('तपास')) {
    return 'diagnosis';
  }
  if (lower.includes('prevent') || lower.includes('avoid') || lower.includes('रोक') || lower.includes('टाळ')) {
    return 'prevention';
  }
  
  return 'expert_tip';
}

function getEmojiForCategory(category: string): string {
  const emojis: Record<string, string> = {
    income: '💰',
    yield: '📈',
    savings: '🏦',
    next_action: '🎯',
    expert_tip: '🏆',
    diagnosis: '🔍',
    prevention: '🛡️'
  };
  return emojis[category] || '💡';
}

// Export for backward compatibility
export function generateFollowUpQuestions(
  aiResponse: string,
  userQuery: string,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const { followUpQuestions } = parseAIGeneratedFollowUps(aiResponse, language, landContext);
  return followUpQuestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION BRAIN FOLLOW-UP GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates context-aware follow-ups specifically for Decision Brain responses.
 * Called from frontend when Decision Brain handles the query.
 */
export function generateDecisionBrainFollowUps(
  response: string,
  advisory: any,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const lang = ['hi', 'mr', 'en'].includes(language) ? language : 'en';
  const questions: FollowUpQuestion[] = [];
  
  // Check if response mentions diagnostic mode
  const isDiagnostic = advisory?.mode === 'DIAGNOSTIC' || 
    /संभाव्य कारण|possible.*cause|probable|शक्यता/i.test(response);
  
  if (isDiagnostic) {
    questions.push(generateDiagnosticFollowUp(lang, {}));
    questions.push(generateConfirmationFollowUp(lang, {}));
  }
  
  // Check what type of advisory was given
  if (advisory?.actions?.length > 0) {
    const actionTypes = advisory.actions.map((a: any) => a.action?.toString() || '');
    
    if (actionTypes.some((a: string) => /SPRAY|PESTICIDE|FUNGICIDE/i.test(a))) {
      questions.push(generateTreatmentImpactFollowUp(lang, {}));
    }
    if (actionTypes.some((a: string) => /FERTILIZER|UREA|NPK/i.test(a))) {
      questions.push(generateFertilizerYieldFollowUp(lang, {}));
    }
    if (actionTypes.some((a: string) => /IRRIGATE|WATER/i.test(a))) {
      questions.push(generateIrrigationSavingsFollowUp(lang));
    }
  }
  
  // Ensure 3 questions
  if (questions.length < 3) {
    questions.push(generateNextActionFollowUp(lang, {}));
  }
  if (questions.length < 3) {
    questions.push(generateYieldImpactFollowUp(lang, {}));
  }
  
  return deduplicateQuestions(questions).slice(0, 3);
}
