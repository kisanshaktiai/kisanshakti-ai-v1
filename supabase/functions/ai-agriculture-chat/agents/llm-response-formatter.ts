/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 5: LLM RESPONSE FORMATTER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Takes rule engine output and formats it into natural, empathetic, 
 * action-oriented advice using LLM (Gemini/OpenAI).
 * 
 * Key Features:
 * - Converts symbolic rule output to conversational farmer advice
 * - Translates technical terms to regional language equivalents
 * - Preserves all product names, dosages, and application methods
 * - Adds empathetic tone and supportive closing
 * - 25-second timeout with structured fallback
 */

import type { DecisionOutput, FarmerCommunication } from './rule-engine-types.ts';
import type { DataAudit } from './orchestrator.ts';
import { getRuralLanguageRules, replaceFormalsWithRural } from '../rural-language-dictionary.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface LLMFormatterInput {
  farmer_message: string;
  language: 'mr' | 'hi' | 'en';
  decision_output: DecisionOutput;
  land_context?: {
    current_crop?: string;
    growth_stage?: string;
    area_acres?: number;
    days_since_sowing?: number;
    soil_health?: {
      nitrogen_kg_per_ha?: number;
      phosphorus_kg_per_ha?: number;
      potassium_kg_per_ha?: number;
      ph_level?: number;
    };
    ndvi?: {
      value?: number;
      trend?: string;
    };
    village?: string;
    district?: string;
  };
  data_audit?: DataAudit;
  trace_id?: string;
}

export interface LLMFormatterOutput {
  formatted_response: string;
  confidence: number;
  source: 'LLM_FORMATTED' | 'TEMPLATE_FALLBACK';
  ai_model_used?: string;
  processing_time_ms: number;
  sections_included: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// IPM LEVEL TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const IPM_URGENCY_LABELS: Record<string, Record<string, string>> = {
  'LEVEL_1': { mr: 'निरीक्षण करा', hi: 'निगरानी करें', en: 'Monitor' },
  'LEVEL_2': { mr: 'सांस्कृतिक पद्धत वापरा', hi: 'सांस्कृतिक तरीके अपनाएं', en: 'Use cultural practices' },
  'LEVEL_3': { mr: 'यांत्रिक नियंत्रण करा', hi: 'यांत्रिक नियंत्रण करें', en: 'Mechanical control' },
  'LEVEL_4': { mr: 'जैविक नियंत्रण करा', hi: 'जैविक नियंत्रण करें', en: 'Biological control' },
  'LEVEL_5': { mr: '⚠️ तुरंत करा', hi: '⚠️ तुरंत करें', en: '⚠️ Do immediately' },
};

// ═══════════════════════════════════════════════════════════════════════════
// TECHNICAL TERM TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const PEST_TRANSLATIONS: Record<string, Record<string, string>> = {
  'SHOOT_BORER': { mr: 'अंकुर बेधक (खोड किडा)', hi: 'अंकुर बेधक (तना छेदक)', en: 'Shoot Borer' },
  'STEM_BORER': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer' },
  'BOLLWORM': { mr: 'बोंड अळी', hi: 'बॉलवर्म', en: 'Bollworm' },
  'APHID': { mr: 'मावा', hi: 'माहूं', en: 'Aphid' },
  'WHITEFLY': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly' },
  'THRIPS': { mr: 'तुडतुडे', hi: 'थ्रिप्स', en: 'Thrips' },
  'JASSID': { mr: 'तुडतुडा', hi: 'जैसिड', en: 'Jassid' },
  'MEALYBUG': { mr: 'पिठ्या ढेकूण', hi: 'मिलीबग', en: 'Mealybug' },
};

const DISEASE_TRANSLATIONS: Record<string, Record<string, string>> = {
  'RUST': { mr: 'तांबेरा', hi: 'रतुआ', en: 'Rust' },
  'WILT': { mr: 'मर रोग', hi: 'उकठा', en: 'Wilt' },
  'BLAST': { mr: 'करपा', hi: 'ब्लास्ट', en: 'Blast' },
  'BLIGHT': { mr: 'करपा', hi: 'झुलसा', en: 'Blight' },
  'LEAF_SPOT': { mr: 'पान ठिपके', hi: 'पत्ती धब्बा', en: 'Leaf Spot' },
  'POWDERY_MILDEW': { mr: 'भुरी', hi: 'चूर्णिल आसिता', en: 'Powdery Mildew' },
  'DOWNY_MILDEW': { mr: 'केवडा', hi: 'मृदुरोमिल आसिता', en: 'Downy Mildew' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LLM FORMATTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function formatRecommendationsWithLLM(
  input: LLMFormatterInput
): Promise<LLMFormatterOutput> {
  const startTime = Date.now();
  const traceId = input.trace_id || `fmt_${Date.now().toString(36)}`;
  
  console.log(`\n📝 [${traceId}] ═══ PHASE 5: LLM RESPONSE FORMATTING ═══`);
  console.log(`   Language: ${input.language}`);
  console.log(`   Decision Status: ${input.decision_output?.status}`);
  
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Build structured recommendation data for LLM
  const recommendationData = buildRecommendationSummary(input);
  
  // If no API keys available, use template fallback immediately
  if (!GEMINI_API_KEY && !OPENAI_API_KEY && !LOVABLE_API_KEY) {
    console.log(`   ⚠️ No LLM API keys - using template fallback`);
    return buildTemplateFallback(input, startTime);
  }
  
  // Build prompt for LLM
  const systemPrompt = buildFormattingSystemPrompt(input);
  const userPrompt = buildFormattingUserPrompt(input, recommendationData);
  
  let formattedResponse = '';
  let aiModelUsed = '';
  
  try {
    // Try Gemini first with 15-second timeout
    if (GEMINI_API_KEY) {
      const result = await callGeminiWithTimeout(systemPrompt, userPrompt, GEMINI_API_KEY, 15000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gemini-2.0-flash';
        console.log(`   ✅ Gemini formatting successful`);
      }
    }
    
    // Fallback to OpenAI if Gemini failed
    if (!formattedResponse && OPENAI_API_KEY) {
      const result = await callOpenAIWithTimeout(systemPrompt, userPrompt, OPENAI_API_KEY, 12000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'gpt-4o-mini';
        console.log(`   ✅ OpenAI formatting successful`);
      }
    }
    
    // Fallback to Lovable AI
    if (!formattedResponse && LOVABLE_API_KEY) {
      const result = await callLovableAIWithTimeout(systemPrompt, userPrompt, LOVABLE_API_KEY, 10000);
      if (result.success) {
        formattedResponse = result.text;
        aiModelUsed = 'lovable-gemini-2.5-flash';
        console.log(`   ✅ Lovable AI formatting successful`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ LLM formatting error:`, error);
  }
  
  // If LLM formatting failed, use template fallback
  if (!formattedResponse || formattedResponse.length < 50) {
    console.log(`   ⚠️ LLM response empty/short - using template fallback`);
    return buildTemplateFallback(input, startTime);
  }
  
  // Post-process: Apply rural language replacements
  formattedResponse = replaceFormalsWithRural(formattedResponse, input.language);
  
  const processingTime = Date.now() - startTime;
  console.log(`   ✅ PHASE 5 complete in ${processingTime}ms`);
  
  return {
    formatted_response: formattedResponse,
    confidence: 0.9,
    source: 'LLM_FORMATTED',
    ai_model_used: aiModelUsed,
    processing_time_ms: processingTime,
    sections_included: extractSections(formattedResponse)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildFormattingSystemPrompt(input: LLMFormatterInput): string {
  const langName = input.language === 'mr' ? 'Marathi' : 
                   input.language === 'hi' ? 'Hindi' : 'English';
  
  const ruralRules = getRuralLanguageRules(input.language);
  
  return `You are KisanMitra (किसानमित्र), a warm and experienced agricultural advisor for Indian farmers.
Your task is to convert technical recommendations into natural, empathetic, action-oriented advice.

OUTPUT LANGUAGE: ${langName}
${ruralRules}

RESPONSE STRUCTURE:
1. SITUATION ACKNOWLEDGMENT - Show you understand the farmer's concern
2. SPECIFIC ACTIONS - Clear, numbered steps with products, dosages, methods
3. TIMING - When to do each action (morning/evening, days)
4. EXPECTED RESULTS - What improvement they should see
5. SUPPORTIVE CLOSING - Encouragement and offer to help further

CRITICAL RULES:
- Use simple village language, NOT technical jargon
- Preserve ALL product names, dosages, and application methods from the recommendations
- Use IPM hierarchy urgency levels as indicators (Level 5 = "तुरंत करें/Do immediately")
- Include emojis for visual clarity: 🌾 for crops, 💧 for water, ⏰ for timing, ⚠️ for warnings
- Add supportive closing like "Feel free to ask if you need clarification"
- Keep response under 400 words - farmers need concise advice`;
}

function buildFormattingUserPrompt(input: LLMFormatterInput, recData: string): string {
  const landInfo = input.land_context ? `
LAND CONTEXT:
- Crop: ${input.land_context.current_crop || 'Not specified'}
- Growth Stage: ${input.land_context.growth_stage || 'Not specified'}
- Area: ${input.land_context.area_acres || 'N/A'} acres
- Days Since Sowing: ${input.land_context.days_since_sowing || 'N/A'}
- NDVI Health: ${input.land_context.ndvi?.value || 'N/A'} (${input.land_context.ndvi?.trend || 'unknown'})
- Soil N/P/K: ${input.land_context.soil_health?.nitrogen_kg_per_ha || 'N/A'}/${input.land_context.soil_health?.phosphorus_kg_per_ha || 'N/A'}/${input.land_context.soil_health?.potassium_kg_per_ha || 'N/A'} kg/ha
- pH: ${input.land_context.soil_health?.ph_level || 'N/A'}
- Location: ${input.land_context.village || ''}, ${input.land_context.district || ''}` : '';

  return `FARMER'S QUESTION (in their language):
"${input.farmer_message}"

${landInfo}

RULE ENGINE RECOMMENDATIONS:
${recData}

FORMAT this into natural, empathetic farmer advice in ${input.language === 'mr' ? 'Marathi' : input.language === 'hi' ? 'Hindi' : 'English'}.
Remember: Include ALL product names and dosages. Be warm and supportive.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION DATA EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

function buildRecommendationSummary(input: LLMFormatterInput): string {
  const decision = input.decision_output;
  const parts: string[] = [];
  
  // Status
  parts.push(`STATUS: ${decision.status || 'UNKNOWN'}`);
  
  // Primary recommendation
  const primary = decision.primary_decision;
  if (primary) {
    const pestCode = primary.target?.pest_code;
    const diseaseCode = primary.target?.disease_code;
    const pestName = pestCode ? (PEST_TRANSLATIONS[pestCode]?.[input.language] || pestCode) : '';
    const diseaseName = diseaseCode ? (DISEASE_TRANSLATIONS[diseaseCode]?.[input.language] || diseaseCode) : '';
    
    parts.push(`\nPRIMARY RECOMMENDATION:`);
    parts.push(`- Action Type: ${primary.action_type}`);
    parts.push(`- Target: ${pestName || diseaseName || primary.target?.nutrient_deficiency || 'General'}`);
    parts.push(`- Product: ${primary.application_details?.product_name || 'Not specified'}`);
    parts.push(`- Dosage: ${primary.application_details?.concentration || 'As per label'}`);
    parts.push(`- Method: ${primary.application_details?.method || 'Standard application'}`);
    parts.push(`- Timing: ${primary.timing?.best_time_of_day || 'Morning recommended'}`);
    parts.push(`- Priority: ${primary.priority || 'HIGH'}`);
    parts.push(`- IPM Level: ${primary.ipm_level || 'LEVEL_3'}`);
    
    // Urgency indicator
    const urgency = IPM_URGENCY_LABELS[primary.ipm_level || 'LEVEL_3']?.[input.language] || 'Normal priority';
    parts.push(`- Urgency: ${urgency}`);
    
    if (primary.expected_outcomes?.efficacy_percent) {
      parts.push(`- Expected Efficacy: ${primary.expected_outcomes.efficacy_percent}%`);
    }
    if (primary.rule_id) {
      parts.push(`- Scientific Basis: ICAR Rule ${primary.rule_id}`);
    }
  }
  
  // Secondary recommendations
  const secondary = decision.secondary_actions || decision.secondary_recommendations;
  if (secondary && secondary.length > 0) {
    parts.push(`\nSECONDARY RECOMMENDATIONS:`);
    secondary.forEach((sec: any, idx: number) => {
      parts.push(`${idx + 1}. ${sec.action || sec.action_type} - ${sec.reason || 'Supporting action'}`);
      if (sec.timing) parts.push(`   Timing: ${sec.timing}`);
      if (sec.priority) parts.push(`   Priority: ${sec.priority}`);
    });
  }
  
  // Warnings
  if (decision.warnings && decision.warnings.length > 0) {
    parts.push(`\nWARNINGS:`);
    decision.warnings.forEach((warning: any) => {
      parts.push(`⚠️ ${typeof warning === 'string' ? warning : warning.message || warning.text}`);
    });
  }
  
  // Blocked actions (explain why some actions were filtered)
  if (decision.blocked_actions && decision.blocked_actions.length > 0) {
    parts.push(`\nBLOCKED ACTIONS (explain these to farmer):`);
    decision.blocked_actions.forEach((blocked: any) => {
      parts.push(`- ${blocked.action}: ${blocked.reason}`);
    });
  }
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM API CALLS WITH TIMEOUT
// ═══════════════════════════════════════════════════════════════════════════

async function callGeminiWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  apiKey: string, 
  timeoutMs: number
): Promise<{ success: boolean; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    
    if (!response.ok) {
      console.warn(`Gemini API error: ${response.status}`);
      return { success: false, text: '' };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { success: !!text, text };
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`Gemini call failed:`, error);
    return { success: false, text: '' };
  }
}

async function callOpenAIWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  apiKey: string, 
  timeoutMs: number
): Promise<{ success: boolean; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
    
    if (!response.ok) {
      console.warn(`OpenAI API error: ${response.status}`);
      return { success: false, text: '' };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { success: !!text, text };
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`OpenAI call failed:`, error);
    return { success: false, text: '' };
  }
}

async function callLovableAIWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  apiKey: string, 
  timeoutMs: number
): Promise<{ success: boolean; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`Lovable AI error: ${response.status}`);
      return { success: false, text: '' };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { success: !!text, text };
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`Lovable AI call failed:`, error);
    return { success: false, text: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE FALLBACK (when LLM unavailable)
// ═══════════════════════════════════════════════════════════════════════════

function buildTemplateFallback(input: LLMFormatterInput, startTime: number): LLMFormatterOutput {
  const lang = input.language;
  const decision = input.decision_output;
  const parts: string[] = [];
  
  // Greeting
  const greetings: Record<string, string> = {
    mr: 'नमस्कार शेतकरी मित्र! 🌾',
    hi: 'नमस्कार किसान मित्र! 🌾',
    en: 'Hello farmer friend! 🌾'
  };
  parts.push(greetings[lang]);
  
  // Acknowledgment
  if (input.land_context?.current_crop) {
    const acks: Record<string, string> = {
      mr: `तुमच्या ${input.land_context.current_crop} पिकाबद्दलचा प्रश्न समजला.`,
      hi: `आपकी ${input.land_context.current_crop} फसल के बारे में प्रश्न समझा।`,
      en: `I understand your question about ${input.land_context.current_crop}.`
    };
    parts.push(acks[lang]);
  }
  
  // Primary recommendation
  const primary = decision.primary_decision;
  if (primary && primary.action_type !== 'NO_ACTION') {
    const headers: Record<string, string> = {
      mr: '📌 **शिफारस:**',
      hi: '📌 **सिफारिश:**',
      en: '📌 **Recommendation:**'
    };
    parts.push(headers[lang]);
    
    const productName = primary.application_details?.product_name || 'शिफारस केलेले उत्पादन';
    const dosage = primary.application_details?.concentration || '';
    const timing = primary.timing?.best_time_of_day === 'MORNING' ? 
      (lang === 'mr' ? 'सकाळी' : lang === 'hi' ? 'सुबह' : 'Morning') :
      (lang === 'mr' ? 'संध्याकाळी' : lang === 'hi' ? 'शाम को' : 'Evening');
    
    let recText = `1. **${productName}**`;
    if (dosage) recText += ` @ ${dosage}`;
    recText += `\n   ⏰ ${timing}`;
    
    if (primary.expected_outcomes?.efficacy_percent) {
      recText += ` | 📊 ${primary.expected_outcomes.efficacy_percent}% ${lang === 'mr' ? 'प्रभावी' : lang === 'hi' ? 'प्रभावी' : 'effective'}`;
    }
    
    parts.push(recText);
    
    // IPM urgency indicator
    const ipmLevel = primary.ipm_level || 'LEVEL_3';
    const urgencyLabel = IPM_URGENCY_LABELS[ipmLevel]?.[lang] || '';
    if (urgencyLabel) {
      parts.push(`\n${urgencyLabel}`);
    }
  } else {
    // No action required
    const noAction: Record<string, string> = {
      mr: '👀 **सध्या कोणतीही कृती आवश्यक नाही.** पिकाचे निरीक्षण सुरू ठेवा.',
      hi: '👀 **अभी कोई कार्रवाई आवश्यक नहीं।** फसल की निगरानी जारी रखें।',
      en: '👀 **No action required at this time.** Continue monitoring your crop.'
    };
    parts.push(noAction[lang]);
  }
  
  // Secondary recommendations
  const secondary = decision.secondary_actions || decision.secondary_recommendations;
  if (secondary && secondary.length > 0) {
    parts.push('');
    secondary.slice(0, 2).forEach((sec: any, idx: number) => {
      if (sec.action) {
        parts.push(`${idx + 2}. ${sec.action}${sec.reason ? ` - ${sec.reason}` : ''}`);
      }
    });
  }
  
  // Supportive closing
  const closings: Record<string, string> = {
    mr: '\n🙏 काही शंका असल्यास विचारा. शुभेच्छा!',
    hi: '\n🙏 कोई सवाल हो तो पूछें। शुभकामनाएं!',
    en: '\n🙏 Feel free to ask if you need clarification. Best wishes!'
  };
  parts.push(closings[lang]);
  
  return {
    formatted_response: parts.join('\n\n'),
    confidence: 0.7,
    source: 'TEMPLATE_FALLBACK',
    processing_time_ms: Date.now() - startTime,
    sections_included: ['greeting', 'recommendation', 'closing']
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractSections(text: string): string[] {
  const sections: string[] = [];
  if (text.includes('नमस्कार') || text.includes('Hello')) sections.push('greeting');
  if (text.includes('शिफारस') || text.includes('Recommend')) sections.push('recommendation');
  if (text.includes('⏰')) sections.push('timing');
  if (text.includes('📊') || text.includes('%')) sections.push('efficacy');
  if (text.includes('⚠️')) sections.push('warning');
  if (text.includes('🙏') || text.includes('शुभेच्छा')) sections.push('closing');
  return sections;
}

export default formatRecommendationsWithLLM;
