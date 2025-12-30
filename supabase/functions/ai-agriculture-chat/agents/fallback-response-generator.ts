/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FALLBACK RESPONSE GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates helpful responses when the main orchestration pipeline fails
 * or when rule engine has no matching rules.
 * 
 * PRINCIPLE: Never show "माफ करा" (sorry) if we have ANY context.
 * Always provide SOMETHING useful to the farmer.
 */

import { 
  getCropAdvice, 
  getFertilizerAdvice, 
  getWateringAdvice,
  getClarifyingQuestions 
} from './crop-knowledge-base.ts';

export interface FallbackContext {
  cropCode?: string;
  cropStage?: string;
  landId?: string;
  landName?: string;
  soilNitrogen?: number;
  soilPhosphorus?: number;
  soilPotassium?: number;
  soilPh?: number;
  ndviValue?: number;
  farmerMessage?: string;
  queryType?: 'fertilizer' | 'watering' | 'pest' | 'disease' | 'general';
}

export interface FallbackResponse {
  message: string;
  language: 'mr' | 'hi' | 'en';
  clarification_questions: string[];
  confidence: number;
  source: 'fallback_knowledge_base' | 'generic_advice';
}

/**
 * Generate fallback response based on available context
 */
export function generateFallbackResponse(
  context: FallbackContext,
  language: 'mr' | 'hi' | 'en' = 'mr'
): FallbackResponse {
  const parts: string[] = [];
  let confidence = 0.5;
  let source: FallbackResponse['source'] = 'generic_advice';
  
  // Add greeting
  parts.push(getGreeting(language));
  
  // Detect query type from message
  const queryType = context.queryType || detectQueryType(context.farmerMessage || '');
  
  // If we have crop context, provide crop-specific advice
  if (context.cropCode) {
    source = 'fallback_knowledge_base';
    confidence = 0.7;
    
    // Add land context if available
    if (context.landName) {
      parts.push(getLandAcknowledgment(context.landName, context.cropCode, language));
    }
    
    // Add query-specific advice
    if (queryType === 'fertilizer') {
      parts.push(getFertilizerAdvice(context.cropCode, context.cropStage || 'vegetative', language));
      
      // Add soil-specific info if available
      if (context.soilNitrogen !== undefined || context.soilPhosphorus !== undefined) {
        parts.push(getSoilStatusMessage(context, language));
      }
    } else if (queryType === 'watering') {
      parts.push(getWateringAdvice(context.cropCode, context.cropStage || 'vegetative', language));
    } else {
      // General - provide full crop advice
      parts.push(getCropAdvice(context.cropCode, context.cropStage || 'vegetative', language));
    }
    
    // Add NDVI status if available
    if (context.ndviValue !== undefined) {
      parts.push(getNDVIStatusMessage(context.ndviValue, language));
    }
  } else {
    // No crop context - provide generic advice and ask clarifying questions
    parts.push(getNoContextMessage(language));
    confidence = 0.3;
  }
  
  // Add closing
  parts.push(getClosing(language));
  
  // Get clarifying questions
  const clarification_questions = context.cropCode 
    ? getFollowUpQuestions(queryType, language)
    : getClarifyingQuestions(language);
  
  return {
    message: parts.filter(Boolean).join('\n\n'),
    language,
    clarification_questions,
    confidence,
    source
  };
}

/**
 * Generate partial response when orchestration partially fails
 */
export function generatePartialResponse(
  farmerMessage: string,
  landContext: any,
  language: 'mr' | 'hi' | 'en' = 'mr'
): FallbackResponse {
  const context: FallbackContext = {
    cropCode: landContext?.current_crop,
    cropStage: landContext?.growth_stage,
    landId: landContext?.land_id,
    landName: landContext?.land_name,
    soilNitrogen: landContext?.soil_health?.nitrogen,
    soilPhosphorus: landContext?.soil_health?.phosphorus,
    soilPotassium: landContext?.soil_health?.potassium,
    soilPh: landContext?.soil_health?.ph,
    ndviValue: landContext?.ndvi?.value,
    farmerMessage
  };
  
  return generateFallbackResponse(context, language);
}

/**
 * Detect query type from farmer message
 */
function detectQueryType(message: string): FallbackContext['queryType'] {
  const lower = message.toLowerCase();
  
  // Fertilizer keywords (Marathi, Hindi, English)
  if (/खत|खाद|युरिया|urea|dap|मुरेट|potash|fertilizer|npk|nutrient/.test(lower)) {
    return 'fertilizer';
  }
  
  // Watering keywords
  if (/पाणी|पानी|water|irrigation|सिंचन|सिंचाई/.test(lower)) {
    return 'watering';
  }
  
  // Pest keywords
  if (/किडी|कीट|अळी|माशी|pest|insect|bug|worm|aphid|whitefly/.test(lower)) {
    return 'pest';
  }
  
  // Disease keywords
  if (/रोग|disease|बुरशी|फंगस|fungus|वाळणे|wilting|पिवळे|yellow/.test(lower)) {
    return 'disease';
  }
  
  return 'general';
}

/**
 * Get greeting based on language
 */
function getGreeting(language: 'mr' | 'hi' | 'en'): string {
  const greetings = {
    mr: '🙏 नमस्कार शेतकरी मित्रांनो!',
    hi: '🙏 नमस्कार किसान भाई!',
    en: '🙏 Hello Farmer!'
  };
  return greetings[language];
}

/**
 * Get closing message
 */
function getClosing(language: 'mr' | 'hi' | 'en'): string {
  const closings = {
    mr: '📞 अधिक मदतीसाठी विचारा. तुमचा शेतीमित्र!',
    hi: '📞 और मदद के लिए पूछें। आपका खेती मित्र!',
    en: '📞 Ask for more help. Your Farming Friend!'
  };
  return closings[language];
}

/**
 * Acknowledge land context
 */
function getLandAcknowledgment(
  landName: string,
  cropCode: string,
  language: 'mr' | 'hi' | 'en'
): string {
  const templates = {
    mr: `📍 तुमच्या "${landName}" शेतातील ${cropCode} पिकासाठी:`,
    hi: `📍 आपके "${landName}" खेत में ${cropCode} फसल के लिए:`,
    en: `📍 For ${cropCode} in your "${landName}" field:`
  };
  return templates[language];
}

/**
 * Get soil status message
 */
function getSoilStatusMessage(context: FallbackContext, language: 'mr' | 'hi' | 'en'): string {
  const n = context.soilNitrogen;
  const p = context.soilPhosphorus;
  const k = context.soilPotassium;
  const ph = context.soilPh;
  
  const templates = {
    mr: `📊 मातीची स्थिती:\n${n !== undefined ? `• नायट्रोजन: ${n} kg/ha` : ''}\n${p !== undefined ? `• फॉस्फरस: ${p} kg/ha` : ''}\n${k !== undefined ? `• पोटॅशियम: ${k} kg/ha` : ''}\n${ph !== undefined ? `• pH: ${ph}` : ''}`.replace(/\n+/g, '\n').trim(),
    hi: `📊 मिट्टी की स्थिति:\n${n !== undefined ? `• नाइट्रोजन: ${n} kg/ha` : ''}\n${p !== undefined ? `• फॉस्फोरस: ${p} kg/ha` : ''}\n${k !== undefined ? `• पोटेशियम: ${k} kg/ha` : ''}\n${ph !== undefined ? `• pH: ${ph}` : ''}`.replace(/\n+/g, '\n').trim(),
    en: `📊 Soil Status:\n${n !== undefined ? `• Nitrogen: ${n} kg/ha` : ''}\n${p !== undefined ? `• Phosphorus: ${p} kg/ha` : ''}\n${k !== undefined ? `• Potassium: ${k} kg/ha` : ''}\n${ph !== undefined ? `• pH: ${ph}` : ''}`.replace(/\n+/g, '\n').trim()
  };
  return templates[language];
}

/**
 * Get NDVI status message
 */
function getNDVIStatusMessage(ndvi: number, language: 'mr' | 'hi' | 'en'): string {
  let status: string;
  let statusMr: string;
  let statusHi: string;
  
  if (ndvi >= 0.7) {
    status = 'Excellent';
    statusMr = 'उत्तम';
    statusHi = 'उत्तम';
  } else if (ndvi >= 0.5) {
    status = 'Good';
    statusMr = 'चांगले';
    statusHi = 'अच्छा';
  } else if (ndvi >= 0.3) {
    status = 'Moderate stress';
    statusMr = 'मध्यम ताण';
    statusHi = 'मध्यम तनाव';
  } else {
    status = 'High stress';
    statusMr = 'जास्त ताण';
    statusHi = 'उच्च तनाव';
  }
  
  const templates = {
    mr: `🛰️ NDVI: ${ndvi.toFixed(2)} (${statusMr})`,
    hi: `🛰️ NDVI: ${ndvi.toFixed(2)} (${statusHi})`,
    en: `🛰️ NDVI: ${ndvi.toFixed(2)} (${status})`
  };
  return templates[language];
}

/**
 * Message when no context available
 */
function getNoContextMessage(language: 'mr' | 'hi' | 'en'): string {
  const messages = {
    mr: `तुमच्या प्रश्नाचे उत्तर देण्यासाठी मला थोडी अधिक माहिती हवी आहे.

कृपया खालील माहिती द्या:
• तुमचे पीक कोणते आहे?
• पिकाचे वय किती दिवस?
• समस्या असल्यास फोटो पाठवा

या माहितीने मी तुम्हाला योग्य सल्ला देऊ शकेन.`,
    hi: `आपके प्रश्न का उत्तर देने के लिए मुझे थोड़ी और जानकारी चाहिए।

कृपया निम्नलिखित जानकारी दें:
• आपकी फसल कौन सी है?
• फसल की उम्र कितने दिन?
• समस्या हो तो फोटो भेजें

इस जानकारी से मैं आपको सही सलाह दे सकूंगा।`,
    en: `I need a little more information to answer your question.

Please provide:
• What is your crop?
• How old is the crop (days)?
• Send a photo if there's a problem

With this information, I can give you proper advice.`
  };
  return messages[language];
}

/**
 * Get follow-up questions based on query type
 */
function getFollowUpQuestions(
  queryType: FallbackContext['queryType'],
  language: 'mr' | 'hi' | 'en'
): string[] {
  const questions: Record<string, Record<'mr' | 'hi' | 'en', string[]>> = {
    fertilizer: {
      mr: [
        '📊 मातीची तपासणी केली होती का?',
        '📅 शेवटचे खत कधी दिले?',
        '🌾 आणखी काही मदत हवी का?'
      ],
      hi: [
        '📊 क्या मिट्टी जांच हुई थी?',
        '📅 आखिरी खाद कब दी?',
        '🌾 और कोई मदद चाहिए?'
      ],
      en: [
        '📊 Was soil testing done?',
        '📅 When was last fertilizer applied?',
        '🌾 Need more help?'
      ]
    },
    watering: {
      mr: [
        '💧 सिंचन पद्धती कोणती?',
        '📅 शेवटचे पाणी कधी दिले?',
        '🌾 आणखी काही मदत हवी का?'
      ],
      hi: [
        '💧 सिंचाई विधि कौन सी?',
        '📅 आखिरी पानी कब दिया?',
        '🌾 और कोई मदद चाहिए?'
      ],
      en: [
        '💧 What is your irrigation method?',
        '📅 When was last irrigation?',
        '🌾 Need more help?'
      ]
    },
    pest: {
      mr: [
        '📸 प्रभावित पानांचा फोटो पाठवा',
        '🔍 किडी कशा दिसतात?',
        '📅 समस्या कधीपासून?'
      ],
      hi: [
        '📸 प्रभावित पत्तियों का फोटो भेजें',
        '🔍 कीट कैसे दिखते हैं?',
        '📅 समस्या कब से?'
      ],
      en: [
        '📸 Send photo of affected leaves',
        '🔍 How do the insects look?',
        '📅 When did problem start?'
      ]
    },
    disease: {
      mr: [
        '📸 रोगग्रस्त भागाचा फोटो पाठवा',
        '🔍 लक्षणे कोणती दिसतात?',
        '📅 समस्या कधीपासून?'
      ],
      hi: [
        '📸 रोगग्रस्त भाग का फोटो भेजें',
        '🔍 कौन से लक्षण दिख रहे हैं?',
        '📅 समस्या कब से?'
      ],
      en: [
        '📸 Send photo of diseased part',
        '🔍 What symptoms are visible?',
        '📅 When did problem start?'
      ]
    },
    general: {
      mr: [
        '🌾 आज काय करायचे?',
        '💧 पाणी देण्याची वेळ?',
        '📊 पीक कसे आहे?'
      ],
      hi: [
        '🌾 आज क्या करना है?',
        '💧 पानी देने का समय?',
        '📊 फसल कैसी है?'
      ],
      en: [
        '🌾 What to do today?',
        '💧 When to irrigate?',
        '📊 How is the crop?'
      ]
    }
  };
  
  return questions[queryType || 'general'][language];
}

/**
 * Check if we have enough context to provide useful response
 */
export function hasUsableContext(context: FallbackContext | null | undefined): boolean {
  if (!context) return false;
  return !!(context.cropCode || context.landId || context.farmerMessage);
}

/**
 * Get helpful error message when we truly can't help
 * This is the LAST RESORT - only used when we have NO context at all
 */
export function getHelpfulErrorMessage(language: 'mr' | 'hi' | 'en'): string {
  const messages = {
    mr: `🙏 कृपया तुमचा प्रश्न पुन्हा विचारा.

मला मदत करण्यासाठी सांगा:
• तुमचे पीक कोणते आहे?
• काय समस्या आहे?
• कधीपासून आहे?

मी तुम्हाला नक्की मदत करेन! 🌾`,
    hi: `🙏 कृपया अपना प्रश्न दोबारा पूछें।

मदद के लिए बताएं:
• आपकी फसल कौन सी है?
• क्या समस्या है?
• कब से है?

मैं जरूर मदद करूंगा! 🌾`,
    en: `🙏 Please ask your question again.

To help you, tell me:
• What is your crop?
• What is the problem?
• Since when?

I will definitely help! 🌾`
  };
  return messages[language];
}
