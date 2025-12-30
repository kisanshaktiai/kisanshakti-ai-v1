/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM RESPONSE GENERATOR - Direct AI-Powered Responses for Farmers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides direct LLM-based response generation for farmer queries
 * that don't require rule-based decisions (pest treatment, chemical applications).
 * 
 * Key capabilities:
 * - Direct answering of general agricultural questions
 * - Context-aware responses using land data
 * - Multi-language support (Marathi, Hindi, English)
 * - Fallback to safe, helpful responses when LLM unavailable
 */

import { ruralLanguageGuide, icarGuidelines, getIcarGuidance } from '../../_shared/ruralLanguageGuide.ts';
import { getRuralLanguageRules, replaceFormalsWithRural } from '../rural-language-dictionary.ts';

// Types for the LLM response generator
export interface LLMResponseInput {
  farmer_message: string;
  language: 'mr' | 'hi' | 'en';
  intent: string;
  land_context?: {
    current_crop?: string;
    crop_stage?: string;
    area_acres?: number;
    soil_tested?: boolean;
    soil_health?: {
      nitrogen_kg_per_ha?: number;
      phosphorus_kg_per_ha?: number;
      potassium_kg_per_ha?: number;
      ph?: number;       // Can accept either ph or ph_level
      ph_level?: number; // Schema uses ph_level
      organic_carbon?: number;
    };
    ndvi?: {
      value?: number;
      trend?: string;
    };
    sowing_date?: string;
    days_since_sowing?: number;
    village?: string;
    district?: string;
  };
  weather?: {
    temperature_current?: number;
    humidity_percent?: number;
    rain_probability_percent?: number;
  };
  conversation_history?: Array<{role: string; content: string}>;
}

export interface LLMResponseOutput {
  response_text: string;
  confidence: number;
  source: 'LLM_DIRECT' | 'CONTEXT_DIRECT' | 'FALLBACK';
  suggested_followups?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT CATEGORIES THAT DON'T NEED RULE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const DIRECT_ANSWER_INTENTS = [
  'GREETING',
  'GENERAL_QUERY',
  'CROP_INFO_QUERY',        // "What crop is in this field?"
  'LAND_INFO_QUERY',        // "What is my land area?"
  'SOIL_INFO_QUERY',        // "What is my soil status?"
  'GROWTH_STAGE_QUERY',     // "What stage is my crop?"
  'HARVEST_QUERY',          // "When should I harvest?"
  'SOWING_QUERY',           // "When should I sow?"
  'MARKET_QUERY',           // Basic market info
  'WEATHER_QUERY',          // Simple weather questions
  'CONFIRMATION',
];

// Intents that REQUIRE rule engine (spray/chemical/treatment decisions)
const RULE_ENGINE_REQUIRED_INTENTS = [
  'PEST_PROBLEM',
  'DISEASE_PROBLEM', 
  'EMERGENCY',
  'NUTRIENT_ISSUE',  // Only when asking for specific fertilizer recommendations
];

/**
 * Check if a question can be answered directly without rule engine
 */
export function canAnswerDirectly(intent: string, farmerMessage: string): boolean {
  // Always use direct answer for greetings
  if (intent === 'GREETING') return true;
  
  // Check if intent is in direct answer list
  if (DIRECT_ANSWER_INTENTS.includes(intent)) return true;
  
  // Pattern-based detection for simple questions
  const simpleQuestionPatterns = [
    /कोणते\s*पीक/i,           // "which crop"
    /कोणती\s*पिक/i,
    /काय\s*पीक/i,             // "what crop"
    /पीक\s*काय/i,
    /कौन\s*सी\s*फसल/i,        // "which crop" in Hindi
    /क्या\s*फसल/i,            // "what crop" in Hindi
    /what\s*crop/i,
    /which\s*crop/i,
    /शेत\s*किती/i,            // "how much land"
    /क्षेत्र\s*किती/i,         // "how much area"
    /जमीन\s*किती/i,           // "how much land"
    /नमस्कार|नमस्ते|hello|hi/i,
    /धन्यवाद|thanks/i,
    /कसे\s*आहात/i,            // "how are you"
    /कैसे\s*हो/i,
  ];
  
  for (const pattern of simpleQuestionPatterns) {
    if (pattern.test(farmerMessage)) return true;
  }
  
  return false;
}

/**
 * Check if question requires rule engine for safety-critical decisions
 */
export function requiresRuleEngine(intent: string, farmerMessage: string): boolean {
  // Explicit rule engine intents
  if (RULE_ENGINE_REQUIRED_INTENTS.includes(intent)) return true;
  
  // Pattern-based detection for treatment/spray questions
  const treatmentPatterns = [
    /फवारणी/i,               // "spraying"
    /स्प्रे/i,                // "spray"
    /औषध/i,                  // "medicine/pesticide"
    /कीटकनाशक/i,             // "insecticide"
    /बुरशीनाशक/i,            // "fungicide"
    /किडी/i,                 // "pest"
    /रोग/i,                  // "disease"
    /कीड़/i,                  // "pest" Hindi
    /दवा/i,                  // "medicine" Hindi
    /छिड़काव/i,              // "spray" Hindi
    /pesticide|insecticide|fungicide|spray/i,
    /treatment|control|kill/i,
    /मर\s*रह|वाळ|सुक/i,       // "dying/wilting"
  ];
  
  for (const pattern of treatmentPatterns) {
    if (pattern.test(farmerMessage)) return true;
  }
  
  return false;
}

/**
 * Generate a direct response for simple questions using land context
 */
export function generateContextDirectResponse(
  input: LLMResponseInput
): LLMResponseOutput | null {
  const { farmer_message, language, land_context } = input;
  const lowerMessage = farmer_message.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP QUERY - "या शेतात कोणते पीक आहे" / "What crop is in this field"
  // ═══════════════════════════════════════════════════════════════════════════
  if (/कोणते\s*पीक|काय\s*पीक|पीक\s*काय|कौन.*फसल|क्या.*फसल|what.*crop|which.*crop/i.test(farmer_message)) {
    if (land_context?.current_crop) {
      const crop = land_context.current_crop;
      const stage = land_context.crop_stage || '';
      const days = land_context.days_since_sowing;
      
      const responses: Record<string, string> = {
        mr: `🌾 या शेतात सध्या **${crop}** हे पीक आहे.${stage ? ` पिकाचा टप्पा: ${stage}.` : ''}${days ? ` पेरणीपासून ${days} दिवस झाले.` : ''}`,
        hi: `🌾 इस खेत में अभी **${crop}** फसल है।${stage ? ` फसल की अवस्था: ${stage}।` : ''}${days ? ` बुवाई के ${days} दिन हो गए।` : ''}`,
        en: `🌾 This field currently has **${crop}**.${stage ? ` Crop stage: ${stage}.` : ''}${days ? ` ${days} days since sowing.` : ''}`
      };
      
      return {
        response_text: responses[language] || responses.en,
        confidence: 0.95,
        source: 'CONTEXT_DIRECT',
        suggested_followups: getFollowupsForCrop(crop, language)
      };
    } else {
      const responses: Record<string, string> = {
        mr: '🌱 या शेताची पीक माहिती अद्याप नोंदवलेली नाही. कृपया "पीक नोंदणी" मध्ये पीक जोडा.',
        hi: '🌱 इस खेत की फसल जानकारी अभी दर्ज नहीं है। कृपया "फसल पंजीकरण" में फसल जोड़ें।',
        en: '🌱 Crop information for this field is not yet recorded. Please add crop in "Crop Registration".'
      };
      return {
        response_text: responses[language] || responses.en,
        confidence: 0.9,
        source: 'CONTEXT_DIRECT'
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAND AREA QUERY
  // ═══════════════════════════════════════════════════════════════════════════
  if (/किती\s*(एकर|क्षेत्र|जमीन)|कितना\s*(एकड़|क्षेत्र)|how\s*much.*area|land\s*size/i.test(farmer_message)) {
    if (land_context?.area_acres) {
      const area = land_context.area_acres;
      const responses: Record<string, string> = {
        mr: `📐 या शेताचे क्षेत्रफळ **${area.toFixed(2)} एकर** आहे.`,
        hi: `📐 इस खेत का क्षेत्रफल **${area.toFixed(2)} एकड़** है।`,
        en: `📐 This field is **${area.toFixed(2)} acres**.`
      };
      return {
        response_text: responses[language] || responses.en,
        confidence: 0.95,
        source: 'CONTEXT_DIRECT'
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SOIL HEALTH QUERY
  // ═══════════════════════════════════════════════════════════════════════════
  if (/माती|मातीची\s*आरोग्य|मृदा|soil|जमिनीची/i.test(farmer_message)) {
    if (land_context?.soil_health && land_context.soil_tested) {
      const soil = land_context.soil_health;
      // CRITICAL FIX: Support both ph and ph_level field names
      const phValue = soil.ph ?? soil.ph_level ?? 'N/A';
      const responses: Record<string, string> = {
        mr: `🧪 **मातीची आरोग्य स्थिती:**
• नत्र (N): ${soil.nitrogen_kg_per_ha ?? 'N/A'} kg/ha
• स्फुरद (P): ${soil.phosphorus_kg_per_ha ?? 'N/A'} kg/ha  
• पालाश (K): ${soil.potassium_kg_per_ha ?? 'N/A'} kg/ha
• pH: ${phValue}
• सेंद्रिय कर्ब: ${soil.organic_carbon ?? 'N/A'}%`,
        hi: `🧪 **मिट्टी स्वास्थ्य स्थिति:**
• नाइट्रोजन (N): ${soil.nitrogen_kg_per_ha ?? 'N/A'} kg/ha
• फास्फोरस (P): ${soil.phosphorus_kg_per_ha ?? 'N/A'} kg/ha
• पोटाश (K): ${soil.potassium_kg_per_ha ?? 'N/A'} kg/ha
• pH: ${phValue}
• जैविक कार्बन: ${soil.organic_carbon ?? 'N/A'}%`,
        en: `🧪 **Soil Health Status:**
• Nitrogen (N): ${soil.nitrogen_kg_per_ha ?? 'N/A'} kg/ha
• Phosphorus (P): ${soil.phosphorus_kg_per_ha ?? 'N/A'} kg/ha
• Potassium (K): ${soil.potassium_kg_per_ha ?? 'N/A'} kg/ha
• pH: ${phValue}
• Organic Carbon: ${soil.organic_carbon ?? 'N/A'}%`
      };
      return {
        response_text: responses[language] || responses.en,
        confidence: 0.95,
        source: 'CONTEXT_DIRECT'
      };
    } else {
      const responses: Record<string, string> = {
        mr: '🧪 या शेताची माती तपासणी अद्याप झालेली नाही. माती परीक्षण करून अहवाल जोडा.',
        hi: '🧪 इस खेत की मिट्टी जांच अभी नहीं हुई है। मिट्टी परीक्षण करवाकर रिपोर्ट जोड़ें।',
        en: '🧪 Soil test for this field is not yet done. Please get soil tested and add report.'
      };
      return {
        response_text: responses[language] || responses.en,
        confidence: 0.9,
        source: 'CONTEXT_DIRECT'
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GREETING
  // ═══════════════════════════════════════════════════════════════════════════
  if (/^(नमस्कार|नमस्ते|hello|hi|hey|नमस्ते जी)[\s!।]*$/i.test(farmer_message.trim())) {
    const crop = land_context?.current_crop || '';
    const greetings: Record<string, string> = {
      mr: `🙏 नमस्कार शेतकरी बंधू! ${crop ? `आपल्या ${crop} पिकाबद्दल` : 'शेतीबद्दल'} काही प्रश्न असल्यास विचारा.`,
      hi: `🙏 नमस्कार किसान भाई! ${crop ? `आपकी ${crop} फसल के बारे में` : 'खेती के बारे में'} कोई सवाल हो तो पूछें।`,
      en: `🙏 Hello farmer! Feel free to ask any questions ${crop ? `about your ${crop} crop` : 'about farming'}.`
    };
    return {
      response_text: greetings[language] || greetings.en,
      confidence: 0.95,
      source: 'CONTEXT_DIRECT',
      suggested_followups: [
        language === 'mr' ? 'पिकाची सध्याची स्थिती कशी आहे?' : 
        language === 'hi' ? 'फसल की वर्तमान स्थिति कैसी है?' : 
        'How is the current crop condition?'
      ]
    };
  }
  
  return null; // Could not answer directly from context
}

/**
 * Generate LLM-powered response for general agricultural queries
 */
export async function generateLLMResponse(
  input: LLMResponseInput
): Promise<LLMResponseOutput> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  // First try context-direct response
  const contextResponse = generateContextDirectResponse(input);
  if (contextResponse) {
    return contextResponse;
  }
  
  // Build rich context for LLM
  const contextInfo = buildContextString(input);
  const languageRules = getRuralLanguageRules(input.language);
  
  const systemPrompt = `You are KisanMitra (किसानमित्र), a friendly agricultural advisor for Indian farmers.
You speak in simple, rural ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'} that farmers understand.

${languageRules}

FARMER'S LAND CONTEXT:
${contextInfo}

IMPORTANT RULES:
1. Answer in the SAME language as the farmer's question
2. Use simple village language, not technical jargon
3. Give practical, actionable advice
4. If you don't have specific data, say so honestly
5. For pest/disease treatment questions, recommend consulting with the app's diagnosis feature
6. Never recommend specific pesticides without proper diagnosis
7. Be warm, respectful, and encouraging
8. Keep responses concise but complete

If the question is about pest/disease treatment, gently guide them to use the photo diagnosis feature for accurate identification.`;

  const userPrompt = `Farmer's question: "${input.farmer_message}"

Please provide a helpful, accurate response in ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'}.`;

  try {
    let responseText = '';
    
    // Try Gemini first
    if (GEMINI_API_KEY) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
              }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 800
              }
            })
          }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (e) {
        console.warn('Gemini API failed:', e);
      }
    }
    
    // Fallback to OpenAI
    if (!responseText && OPENAI_API_KEY) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 800,
            temperature: 0.7
          })
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          responseText = data.choices?.[0]?.message?.content || '';
        }
      } catch (e) {
        console.warn('OpenAI API failed:', e);
      }
    }
    
    if (responseText) {
      // Post-process for rural language
      responseText = replaceFormalsWithRural(responseText, input.language);
      
      return {
        response_text: responseText,
        confidence: 0.85,
        source: 'LLM_DIRECT',
        suggested_followups: generateFollowups(input)
      };
    }
  } catch (error) {
    console.error('LLM response generation failed:', error);
  }
  
  // Fallback response
  return generateFallbackResponse(input);
}

/**
 * Build context string for LLM prompt
 */
function buildContextString(input: LLMResponseInput): string {
  const ctx = input.land_context;
  if (!ctx) return 'No land context available.';
  
  const parts: string[] = [];
  
  if (ctx.current_crop) parts.push(`Current Crop: ${ctx.current_crop}`);
  if (ctx.crop_stage) parts.push(`Growth Stage: ${ctx.crop_stage}`);
  if (ctx.area_acres) parts.push(`Land Area: ${ctx.area_acres} acres`);
  if (ctx.days_since_sowing) parts.push(`Days since sowing: ${ctx.days_since_sowing}`);
  if (ctx.village) parts.push(`Village: ${ctx.village}`);
  if (ctx.district) parts.push(`District: ${ctx.district}`);
  
  if (ctx.soil_health) {
    const soil = ctx.soil_health;
    parts.push(`Soil: N=${soil.nitrogen_kg_per_ha || 'N/A'}, P=${soil.phosphorus_kg_per_ha || 'N/A'}, K=${soil.potassium_kg_per_ha || 'N/A'}, pH=${soil.ph || 'N/A'}`);
  }
  
  if (ctx.ndvi) {
    parts.push(`Crop Health (NDVI): ${ctx.ndvi.value?.toFixed(2) || 'N/A'} (${ctx.ndvi.trend || 'unknown trend'})`);
  }
  
  if (input.weather) {
    parts.push(`Weather: ${input.weather.temperature_current || 'N/A'}°C, Humidity ${input.weather.humidity_percent || 'N/A'}%, Rain chance ${input.weather.rain_probability_percent || 'N/A'}%`);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'Limited context available.';
}

/**
 * Generate follow-up suggestions based on context
 */
function generateFollowups(input: LLMResponseInput): string[] {
  const lang = input.language;
  const crop = input.land_context?.current_crop;
  
  if (crop) {
    return getFollowupsForCrop(crop, lang);
  }
  
  const defaults: Record<string, string[]> = {
    mr: ['पिकाची आरोग्य स्थिती तपासा', 'हवामान माहिती पहा', 'मातीची तपासणी करा'],
    hi: ['फसल स्वास्थ्य जांचें', 'मौसम जानकारी देखें', 'मिट्टी परीक्षण करें'],
    en: ['Check crop health', 'View weather info', 'Get soil tested']
  };
  
  return defaults[lang] || defaults.en;
}

/**
 * Get crop-specific follow-ups
 */
function getFollowupsForCrop(crop: string, lang: string): string[] {
  const cropLower = crop.toLowerCase();
  
  const followups: Record<string, Record<string, string[]>> = {
    sugarcane: {
      mr: ['ऊसाला पाणी कधी द्यावे?', 'ऊसाचे खत व्यवस्थापन', 'ऊसावरील किडींची माहिती'],
      hi: ['गन्ने को पानी कब दें?', 'गन्ने की खाद प्रबंधन', 'गन्ने के कीट जानकारी'],
      en: ['When to irrigate sugarcane?', 'Sugarcane fertilizer management', 'Sugarcane pest info']
    },
    cotton: {
      mr: ['कापसाला पाणी कधी द्यावे?', 'कापसाचे किडी व्यवस्थापन', 'कापूस वेचणी कधी?'],
      hi: ['कपास को पानी कब दें?', 'कपास कीट प्रबंधन', 'कपास कब तोड़ें?'],
      en: ['When to irrigate cotton?', 'Cotton pest management', 'When to pick cotton?']
    },
    soybean: {
      mr: ['सोयाबीनची फवारणी कधी?', 'सोयाबीन खत व्यवस्थापन', 'सोयाबीन काढणी कधी?'],
      hi: ['सोयाबीन छिड़काव कब?', 'सोयाबीन खाद प्रबंधन', 'सोयाबीन कटाई कब?'],
      en: ['When to spray soybean?', 'Soybean fertilizer management', 'When to harvest soybean?']
    }
  };
  
  // Find matching crop
  for (const [key, value] of Object.entries(followups)) {
    if (cropLower.includes(key) || key.includes(cropLower)) {
      return value[lang] || value.en;
    }
  }
  
  // Default followups
  const defaults: Record<string, string[]> = {
    mr: ['पिकाला पाणी कधी द्यावे?', 'खत कधी टाकावे?', 'किडी आहेत का तपासा'],
    hi: ['फसल को पानी कब दें?', 'खाद कब डालें?', 'कीट हैं क्या जांचें'],
    en: ['When to irrigate?', 'When to fertilize?', 'Check for pests']
  };
  
  return defaults[lang] || defaults.en;
}

/**
 * Generate fallback response when LLM is unavailable
 */
function generateFallbackResponse(input: LLMResponseInput): LLMResponseOutput {
  const lang = input.language;
  const crop = input.land_context?.current_crop || '';
  
  // Get ICAR guidance if available
  const icarInfo = crop ? getIcarGuidance(crop) : '';
  
  const fallbacks: Record<string, string> = {
    mr: `🙏 शेतकरी मित्र, तुमचा प्रश्न समजला. 
${crop ? `तुमच्या ${crop} पिकाबद्दल:` : ''}
${icarInfo || 'कृपया अधिक तपशील द्या किंवा पुन्हा प्रयत्न करा.'}

💡 **टीप:** पिकावर किडी/रोग असल्यास, "InstaScan" वापरून फोटो पाठवा - अचूक निदान मिळेल.`,
    
    hi: `🙏 किसान भाई, आपका सवाल समझ गया।
${crop ? `आपकी ${crop} फसल के बारे में:` : ''}
${icarInfo || 'कृपया अधिक जानकारी दें या फिर से प्रयास करें।'}

💡 **सुझाव:** फसल पर कीट/रोग है तो "InstaScan" से फोटो भेजें - सटीक निदान मिलेगा।`,
    
    en: `🙏 Dear farmer, I understand your question.
${crop ? `About your ${crop} crop:` : ''}
${icarInfo || 'Please provide more details or try again.'}

💡 **Tip:** If you have pest/disease issues, use "InstaScan" to send a photo for accurate diagnosis.`
  };
  
  return {
    response_text: fallbacks[lang] || fallbacks.en,
    confidence: 0.6,
    source: 'FALLBACK',
    suggested_followups: generateFollowups(input)
  };
}
