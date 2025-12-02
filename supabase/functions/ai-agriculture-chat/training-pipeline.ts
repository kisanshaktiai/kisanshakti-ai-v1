// ============= TRAINING DATA PIPELINE =============
// Auto-populates all LLM training columns for ai_chat_messages
// This module handles domain classification, quality scoring, and training candidate selection

export interface TrainingData {
  complexity_level: 'simple' | 'medium' | 'complex';
  domain_tags: string[];
  conversation_quality_score: number;
  agricultural_accuracy: number;
  is_training_candidate: boolean;
  preprocessed_content: string;
  conversation_turn_number: number;
  off_topic: boolean;
  excluded_reason: string | null;
}

// ============= DOMAIN TAG EXTRACTION =============
export function extractDomainTags(userText: string, aiResponse: string, queryIntent: any): string[] {
  const tags: string[] = [];
  const combinedText = `${userText} ${aiResponse}`.toLowerCase();
  
  // Add intent type as tag if not general
  if (queryIntent.type && queryIntent.type !== 'general') {
    tags.push(queryIntent.type);
  }
  
  // Fertilizer patterns - multi-language
  if (/fertilizer|खाद|खत|உரம்|ఎరువు|ખાતર|সার|ਖਾਦ|urea|dap|npk|nitrogen|phosphorus|potassium|यूरिया|डीएपी|युरिया|নাইট্রোজেন/i.test(combinedText)) {
    tags.push('fertilizer');
  }
  
  // Pest control patterns
  if (/pest|disease|insect|bug|fungus|spray|pesticide|कीट|बीमारी|रोग|किडे|पூச்சி|వ్యాధి|જીવાત|ਕੀੜੇ|পোকা|attack|damage|infestation|हमला|नुकसान|ದಾಳಿ/i.test(combinedText)) {
    tags.push('pest_control');
  }
  
  // Irrigation/watering patterns
  if (/irrigation|water|drip|sprinkler|पानी|सिंचाई|पाणी|நீர்|నీరు|સિંચાઈ|সেচ|ਪਾਣੀ|ನೀರು|timing|schedule|when to water|कब पानी|कधी पाणी/i.test(combinedText)) {
    tags.push('irrigation');
  }
  
  // Market/price patterns
  if (/price|market|भाव|बाजार|किंमत|விலை|ధర|કિંમત|দাম|ਕੀਮਤ|ಬೆಲೆ|yield|income|profit|sell|revenue|demand|उपज|कमाई|ఆదాయం/i.test(combinedText)) {
    tags.push('market_price');
  }
  
  // Crop selection patterns
  if (/crop\s+selection|which\s+crop|कौनसी\s+फसल|कोणती\s+पीक|எந்த\s+பயிர்|ఏ\s+పంట|ਕਿਹੜੀ\s+ਫ਼ਸਲ|variety|सिफारस|recommend|suggest|शिफारस|பரிந்துரை|సూచన/i.test(combinedText)) {
    tags.push('crop_selection');
  }
  
  // Soil health patterns
  if (/soil|मिट्टी|माती|மண்|నేల|માટી|মাটি|ਮਿੱਟੀ|ಮಣ್ಣು|health|texture|ph|organic\s+carbon|npk|nutrients|पोषक|ಪೋಷಕಾಂಶ/i.test(combinedText)) {
    tags.push('soil_health');
  }
  
  // Weather patterns
  if (/weather|rain|temperature|मौसम|वातावरण|હવામાન|আবহাওয়া|ਮੌਸਮ|ಹವಾಮಾನ|बारिश|पाऊस|மழை|వర్షం|વરસાદ|বৃষ্টি|ਮੀਂਹ|ಮಳೆ|forecast|climate/i.test(combinedText)) {
    tags.push('weather');
  }
  
  // Harvest patterns
  if (/harvest|कटाई|कापणी|அறுவடை|కోత|લણણી|কাটা|ਵਾਢੀ|ಸುಗ್ಗಿ|maturity|ready|timing|when to harvest|कब काटे/i.test(combinedText)) {
    tags.push('harvest');
  }
  
  // Seed patterns
  if (/seed|बीज|बियाणे|விதை|విత్తనం|બીજ|বীজ|ਬੀਜ|ಬೀಜ|variety|सिफारस|ठण/i.test(combinedText)) {
    tags.push('seed_selection');
  }
  
  // Growth stage patterns
  if (/stage|growth|flowering|फूल|फुल|பூக்கும்|పువ్వులు|ફૂલ|ফুল|ਫੁੱਲ|ಹೂವು|tillering|branching|vegetative|reproductive/i.test(combinedText)) {
    tags.push('growth_stage');
  }
  
  // Mulching/organic practices
  if (/mulch|organic|compost|vermi|गोबर|शेण|நுண்ணுயிர்|సేంద్రీయ|કાદવ|জৈব|ਕੰਪੋਸਟ|ಸಾವಯವ|जैविक|natural|bio/i.test(combinedText)) {
    tags.push('organic_farming');
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

// ============= COMPLEXITY ANALYSIS =============
export function analyzeContentComplexity(
  userText: string,
  aiResponse: string,
  language: string
): 'simple' | 'medium' | 'complex' {
  // Check user query length
  const userWords = userText.split(/\s+/).length;
  const aiWords = aiResponse.split(/\s+/).length;
  
  // Simple: Short query, short answer
  if (userWords <= 5 && aiWords <= 100) return 'simple';
  
  // Complex: Long query or very detailed answer
  if (userWords > 15 || aiWords > 300) return 'complex';
  
  // Medium: Everything in between
  return 'medium';
}

// ============= CONVERSATION QUALITY SCORING =============
export function calculateQualityScore(
  aiResponse: string,
  responseTimeMs: number,
  feedbackRating?: number | null
): number {
  let score = 0.5; // Base score
  
  // 1. Response completeness (0-0.25)
  const wordCount = aiResponse.split(/\s+/).length;
  if (wordCount >= 50 && wordCount <= 500) score += 0.25;
  else if (wordCount >= 20) score += 0.15;
  
  // 2. Specific agricultural terms (0-0.15)
  const hasSpecificDosage = /\d+\s*(kg|किलो|किग्रा|લિટર|लीटर|ml|gram|ग्राम)/i.test(aiResponse);
  const hasTimingInfo = /\d+\s*(days|दिन|दिवस|நாட்கள்|రోజులు|દિવસ|সপ্তাহ|weeks|सप्ताह)/i.test(aiResponse);
  if (hasSpecificDosage) score += 0.08;
  if (hasTimingInfo) score += 0.07;
  
  // 3. Scientific references (0-0.1)
  if (/(ICAR|IARI|PAU|TNAU|university|research|अनुसंधान|संशोधन|ஆராய்ச்சி|పరిశోధన|સંશોધન)/i.test(aiResponse)) {
    score += 0.1;
  }
  
  // 4. Safety warnings (0-0.1)
  if (/(safety|सावधानी|caution|warning|खबरदारी|सावधगिरी|எச்சரிக்கை|హెచ్చరిక|સાવચેતી)/i.test(aiResponse)) {
    score += 0.1;
  }
  
  // 5. Response time bonus (0-0.1)
  if (responseTimeMs < 3000) score += 0.1;
  else if (responseTimeMs < 5000) score += 0.05;
  
  // 6. User feedback (0-0.3)
  if (feedbackRating) {
    if (feedbackRating >= 4) score += 0.3;
    else if (feedbackRating === 3) score += 0.15;
    else score -= 0.1; // Penalty for poor rating
  }
  
  // 7. Penalty for vague responses (-0.1)
  if (/(maybe|शायद|कदाचित|ஒருவேளை|బహుశా|કદાચ|হয়তো|perhaps|might|could be)/i.test(aiResponse)) {
    score -= 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}

// ============= AGRICULTURAL ACCURACY ESTIMATION =============
export function estimateAgricultureAccuracy(
  aiResponse: string,
  queryIntent: any,
  hasLandContext: boolean
): number {
  let score = 0.5; // Base score
  
  // 1. Context-specific recommendations (0-0.2)
  if (hasLandContext) {
    // Check if response uses specific numbers for this land
    if (/\d+\.\d+\s*(acre|एकड़|एकर|ஏக்கர்|ఎకరాలు|એકર)/i.test(aiResponse)) score += 0.1;
    if (/\d+\s*(gunta|गुंठा|ಗುಂಟ)/i.test(aiResponse)) score += 0.1;
  }
  
  // 2. Specific dosage recommendations (0-0.15)
  const hasNumericalDosage = /\d+\s*(kg|किलो|liter|லிட்டர్|લિટર|gram|ml)\/acre|per\s+acre/i.test(aiResponse);
  if (hasNumericalDosage) score += 0.15;
  
  // 3. Timing precision (0-0.1)
  if (/\d+\s*-\s*\d+\s*(days|दिन|దినాలు|દિવસ|weeks|सप्ताह)/i.test(aiResponse)) score += 0.1;
  
  // 4. Scientific backing (0-0.1)
  if (/(ICAR|IARI|recommended|certified|approved|अनुमोदित|प्रमाणित)/i.test(aiResponse)) {
    score += 0.1;
  }
  
  // 5. Safety and precautions (0-0.1)
  if (/(safety\s+period|waiting\s+period|withholding|सुरक्षा\s+अवधि|प्रतीक्षा\s+काळ)/i.test(aiResponse)) {
    score += 0.1;
  }
  
  // 6. Crop-stage awareness (0-0.05)
  if (/(vegetative|reproductive|flowering|tillering|वनस्पति|प्रजनन|फुलणे)/i.test(aiResponse)) {
    score += 0.05;
  }
  
  // Penalties:
  // -0.15 for generic advice without specifics
  if (!/\d/.test(aiResponse)) score -= 0.15;
  
  // -0.1 for uncertain language
  if (/(maybe|perhaps|might|could|शायद|कदाचित|ஒருவேளை)/i.test(aiResponse)) score -= 0.1;
  
  return Math.max(0, Math.min(1, score));
}

// ============= TRAINING CANDIDATE SELECTION =============
export function shouldBeTrainingCandidate(
  feedbackRating: number | null,
  responseTimeMs: number,
  wordCount: number,
  qualityScore: number,
  agricultureAccuracy: number,
  offTopic: boolean
): boolean {
  // Auto-exclude off-topic conversations
  if (offTopic) return false;
  
  // Auto-exclude very short responses (likely errors)
  if (wordCount < 15) return false;
  
  // Auto-exclude very long responses (likely hallucinations)
  if (wordCount > 1000) return false;
  
  // Excellent candidates: High feedback + accuracy
  if (feedbackRating && feedbackRating >= 4 && agricultureAccuracy >= 0.7) return true;
  
  // Good candidates: High quality score
  if (qualityScore >= 0.7) return true;
  
  // Moderate candidates: Decent accuracy without negative feedback
  if (agricultureAccuracy >= 0.6 && (!feedbackRating || feedbackRating >= 3)) return true;
  
  return false;
}

// ============= CONTENT PREPROCESSING =============
export function preprocessForTraining(content: string): string {
  // Remove excessive whitespace
  let processed = content.replace(/\s+/g, ' ').trim();
  
  // Remove markdown formatting
  processed = processed.replace(/\*\*/g, '');
  processed = processed.replace(/\*/g, '');
  processed = processed.replace(/#{1,6}\s/g, '');
  
  // Remove emojis for consistency
  processed = processed.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  
  // Normalize numbers with units
  processed = processed.replace(/(\d+)\s*kg/gi, '$1 kg');
  processed = processed.replace(/(\d+)\s*liter/gi, '$1 liter');
  
  return processed.trim();
}

// ============= OFF-TOPIC DETECTION =============
export function isOffTopic(userText: string, aiResponse: string): boolean {
  const combinedText = `${userText} ${aiResponse}`.toLowerCase();
  
  // Check for non-agricultural keywords
  const offTopicPatterns = [
    /(buy|purchase|sell).*(car|vehicle|phone|laptop|computer|movie|film|game|video|music|song)/i,
    /(recommend|suggestion).*(movie|film|series|show|game|restaurant|hotel)/i,
    /how\s+to\s+(cook|bake|make|prepare).*(recipe|dish|food|meal|breakfast|lunch|dinner)/i,
    /(football|cricket|tennis|sports|match|score)/i,
    /(politics|election|government|minister|party)/i
  ];
  
  // Check if matches off-topic pattern
  for (const pattern of offTopicPatterns) {
    if (pattern.test(combinedText)) {
      // Double-check: does it also contain agricultural keywords?
      const hasAgriKeywords = /(crop|farm|agricult|plant|soil|seed|fertiliz|pest|irrigat|harvest|land|weather|rain|खेत|फसल|पीक|పంట|ખેત)/i.test(combinedText);
      if (!hasAgriKeywords) return true;
    }
  }
  
  return false;
}

// ============= MAIN PIPELINE FUNCTION =============
export function buildTrainingData(
  userText: string,
  aiResponse: string,
  queryIntent: any,
  language: string,
  conversationTurnNumber: number,
  responseTimeMs: number,
  hasLandContext: boolean,
  feedbackRating: number | null = null
): TrainingData {
  const wordCount = aiResponse.split(/\s+/).length;
  const offTopic = isOffTopic(userText, aiResponse);
  const complexity = analyzeContentComplexity(userText, aiResponse, language);
  const domainTags = extractDomainTags(userText, aiResponse, queryIntent);
  const qualityScore = calculateQualityScore(aiResponse, responseTimeMs, feedbackRating);
  const agricultureAccuracy = estimateAgricultureAccuracy(aiResponse, queryIntent, hasLandContext);
  const isCandidate = shouldBeTrainingCandidate(
    feedbackRating,
    responseTimeMs,
    wordCount,
    qualityScore,
    agricultureAccuracy,
    offTopic
  );
  const preprocessedContent = preprocessForTraining(aiResponse);
  
  // Determine exclusion reason
  let excludedReason: string | null = null;
  if (offTopic) excludedReason = 'off_topic';
  else if (wordCount < 15) excludedReason = 'too_short';
  else if (wordCount > 1000) excludedReason = 'too_long';
  else if (feedbackRating && feedbackRating <= 2) excludedReason = 'poor_feedback';
  
  return {
    complexity_level: complexity,
    domain_tags: domainTags,
    conversation_quality_score: qualityScore,
    agricultural_accuracy: agricultureAccuracy,
    is_training_candidate: isCandidate,
    preprocessed_content: preprocessedContent,
    conversation_turn_number: conversationTurnNumber,
    off_topic: offTopic,
    excluded_reason: excludedReason
  };
}
