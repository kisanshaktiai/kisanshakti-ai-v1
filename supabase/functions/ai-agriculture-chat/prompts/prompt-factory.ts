// ============= SMART PROMPT FACTORY =============
// Builds minimal, query-specific prompts to reduce token usage by 85%
// NOW WITH RURAL LANGUAGE ENFORCEMENT + FARMER INTERACTION RULES

import { getBaseIdentity } from './base-identity.ts';
import { getQueryPrompt } from './query-prompts.ts';
import { getRuralLanguageRules } from '../rural-language-dictionary.ts';

export interface PromptConfig {
  queryType: string;
  language: string;
  cropName?: string;
  hasLand: boolean;
  messageCount: number;
  locationContext?: {
    village?: string;
    district?: string;
    state?: string;
  };
}

export function buildOptimizedSystemPrompt(config: PromptConfig): string {
  const { queryType, language, cropName, hasLand, messageCount, locationContext } = config;
  
  // Base identity with rural language rules: ~300 tokens
  let prompt = getBaseIdentity(language);
  
  // CRITICAL: Add farmer interaction rules (MUST be added)
  prompt += '\n\n' + getFarmerInteractionRules(language, hasLand);
  
  // Query-specific rules with InstaScan CTAs: ~150 tokens
  prompt += '\n\n' + getQueryPrompt(queryType, language);
  
  // Formatting rules (minimal): ~100 tokens
  prompt += '\n\n' + getFormattingRules(language);
  
  // Income focus instruction: ~50 tokens
  prompt += '\n\n' + getIncomeFocusPrompt(language);
  
  // Add location personalization if available
  if (locationContext?.village || locationContext?.district) {
    prompt += '\n\n' + getLocationPersonalization(locationContext, language);
  }
  
  // Context awareness (first message vs continuation)
  if (messageCount > 1) {
    prompt += `\n\n[Continuation - farmer already knows you, be direct]`;
  }
  
  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMER INTERACTION RULES (CRITICAL - DO NOT MODIFY)
// These rules ensure natural, helpful communication with farmers
// ═══════════════════════════════════════════════════════════════════════════

function getFarmerInteractionRules(language: string, hasLandContext: boolean): string {
  const rules: Record<string, string> = {
    'hi': `🚫 सख्त मनाही:
- किसान से सवाल का "वर्गीकरण" मत पूछो (जैसे "यह सामान्य सवाल है?")
- "विषय चुनें" या "समस्या का प्रकार बताएं" ऐसा मत बोलो
- "intent", "query type", "classification" ऐसे शब्द मत बोलो
- किसान को भ्रमित करने वाले तकनीकी शब्द मत बोलो

✅ ऐसे बात करो:
- हर सवाल को गंभीरता से लो, अधूरा हो तो भी समझकर जवाब दो
- ${hasLandContext ? 'खेत के बारे में एक साफ सवाल पूछ सकते हो (अधिकतम 3 विकल्प)' : 'सीधा जवाब दो, विकल्प मत दो, फोटो मत मांगो'}
- कभी भी एक साथ कई सवाल मत पूछो
- जवाब का पैटर्न: समझा → समझाया → आगे क्या करें

${hasLandContext ? '📸 फोटो तभी मांगो जब सच में जरूरी हो और बताओ क्यों चाहिए' : '❌ फोटो मत मांगो - यह सामान्य चर्चा है'}`,

    'mr': `🚫 सक्त मनाई:
- शेतकऱ्याला प्रश्नाचे "वर्गीकरण" विचारू नका (जसे "हे सामान्य प्रश्न आहे?")
- "विषय निवडा" किंवा "समस्येचा प्रकार सांगा" असे बोलू नका
- "intent", "query type", "classification" असे शब्द वापरू नका
- शेतकऱ्याला गोंधळात टाकणारे तांत्रिक शब्द टाळा

✅ असे बोला:
- प्रत्येक प्रश्न गांभीर्याने घ्या, अपूर्ण असला तरी समजून उत्तर द्या
- ${hasLandContext ? 'शेताबद्दल एक स्पष्ट प्रश्न विचारा शकता (जास्तीत जास्त ३ पर्याय)' : 'सरळ उत्तर द्या, पर्याय देऊ नका, फोटो मागू नका'}
- एकाच वेळी अनेक प्रश्न कधीच विचारू नका
- उत्तराचा पॅटर्न: समजले → समजावले → पुढे काय करायचे

${hasLandContext ? '📸 फोटो तेव्हाच मागा जेव्हा खरोखर गरज असेल आणि का हवे ते सांगा' : '❌ फोटो मागू नका - ही सामान्य चर्चा आहे'}`,

    'en': `🚫 STRICTLY FORBIDDEN:
- NEVER ask farmer to "classify" their question (like "Is this a general query?")
- NEVER say "Select a topic" or "Choose problem type"
- NEVER use words like "intent", "query type", "classification"
- NEVER use confusing technical jargon

✅ HOW TO RESPOND:
- Treat every message as meaningful, even if incomplete
- ${hasLandContext ? 'You may ask ONE clear question with max 3 options for their field' : 'Give direct answers, NO options, NO photo requests'}
- NEVER ask multiple questions at once
- Response pattern: Acknowledge → Explain → What to do next

${hasLandContext ? '📸 Request photo ONLY when truly necessary and explain why it helps' : '❌ Do NOT request photos - this is a general discussion'}`,

    'pa': `🚫 ਸਖ਼ਤ ਮਨਾਹੀ:
- ਕਿਸਾਨ ਤੋਂ ਸਵਾਲ ਦਾ "ਵਰਗੀਕਰਨ" ਨਾ ਪੁੱਛੋ
- "ਵਿਸ਼ਾ ਚੁਣੋ" ਜਾਂ "ਸਮੱਸਿਆ ਦੀ ਕਿਸਮ" ਨਾ ਪੁੱਛੋ

✅ ਇਸ ਤਰ੍ਹਾਂ ਬੋਲੋ:
- ਹਰ ਸਵਾਲ ਗੰਭੀਰਤਾ ਨਾਲ ਲਵੋ
- ${hasLandContext ? 'ਖੇਤ ਬਾਰੇ ਇੱਕ ਸਪੱਸ਼ਟ ਸਵਾਲ ਪੁੱਛ ਸਕਦੇ ਹੋ' : 'ਸਿੱਧਾ ਜਵਾਬ ਦਿਓ'}
- ਇੱਕ ਵਾਰ ਵਿੱਚ ਕਈ ਸਵਾਲ ਨਾ ਪੁੱਛੋ`,

    'ta': `🚫 கடுமையான தடை:
- விவசாயியிடம் கேள்வியை "வகைப்படுத்த" கேட்க வேண்டாம்
- "தலைப்பு தேர்ந்தெடுக்கவும்" என்று சொல்ல வேண்டாம்

✅ இப்படி பேசுங்கள்:
- ஒவ்வொரு கேள்வியையும் தீவிரமாக எடுத்துக் கொள்ளுங்கள்
- ${hasLandContext ? 'வயல் பற்றி ஒரு தெளிவான கேள்வி கேட்கலாம்' : 'நேரடியாக பதில் சொல்லுங்கள்'}
- ஒரே நேரத்தில் பல கேள்விகள் கேட்க வேண்டாம்`
  };

  return rules[language] || rules['en'];
}

// NEW: Location-based personalization
function getLocationPersonalization(
  location: { village?: string; district?: string; state?: string },
  language: string
): string {
  const templates: Record<string, string> = {
    hi: `📍 किसान का इलाका: ${location.village || ''} ${location.district ? `(${location.district})` : ''}
- इस इलाके के हिसाब से सलाह दो
- स्थानीय मंडी का भाव बताओ
- यहां की मिट्टी/मौसम का ध्यान रखो`,

    mr: `📍 शेतकऱ्याचा भाग: ${location.village || ''} ${location.district ? `(${location.district})` : ''}
- या भागानुसार सल्ला द्या
- स्थानिक बाजारभाव सांगा
- इथली माती/हवामान लक्षात ठेवा`,

    en: `📍 Farmer's area: ${location.village || ''} ${location.district ? `(${location.district})` : ''}
- Give advice according to this area
- Mention local market prices
- Consider local soil/weather`,

    pa: `📍 ਕਿਸਾਨ ਦਾ ਇਲਾਕਾ: ${location.village || ''} ${location.district ? `(${location.district})` : ''}
- ਇਸ ਇਲਾਕੇ ਅਨੁਸਾਰ ਸਲਾਹ ਦਿਓ`
  };

  return templates[language] || templates['en'];
}

function getFormattingRules(language: string): string {
  const rules: Record<string, string> = {
    'hi': `📋 प्रारूप:
- उत्तर 3-4 खंडों में (इमोजी से शुरू)
- प्रत्येक बिंदु नई पंक्ति पर
- 🎯 सारांश अंत में
- ✅ ICAR/PAU आधारित`,
    'mr': `📋 स्वरूप:
- उत्तर 3-4 विभागांमध्ये (इमोजी सह)
- प्रत्येक मुद्दा नवीन ओळीवर
- 🎯 सारांश शेवटी
- ✅ ICAR/PAU आधारित`,
    'en': `📋 Format:
- Answer in 3-4 sections (start with emoji)
- Each point on new line
- 🎯 Summary at end
- ✅ ICAR/PAU verified`,
    'pa': `📋 ਫਾਰਮੈਟ:
- ਜਵਾਬ 3-4 ਭਾਗਾਂ ਵਿੱਚ
- ਹਰ ਮੁੱਦਾ ਨਵੀਂ ਲਾਈਨ ਤੇ
- 🎯 ਸਾਰ ਅੰਤ ਵਿੱਚ`,
    'ta': `📋 வடிவம்:
- பதில் 3-4 பிரிவுகளில்
- ஒவ்வொரு புள்ளியும் புதிய வரியில்
- 🎯 சுருக்கம் இறுதியில்`
  };
  return rules[language] || rules['en'];
}

function getIncomeFocusPrompt(language: string): string {
  const focus: Record<string, string> = {
    'hi': `🎯 मुख्य लक्ष्य: किसान की आय दोगुनी करना
- हर सुझाव में आर्थिक लाभ बताएं (₹/एकड़)
- लागत बचत के तरीके बताएं
- 5x उपज बढ़ाने के वैज्ञानिक तरीके`,
    'mr': `🎯 मुख्य उद्दिष्ट: शेतकऱ्याचे उत्पन्न दुप्पट करणे
- प्रत्येक सूचनेत आर्थिक फायदा सांगा (₹/एकर)
- खर्च वाचवण्याचे मार्ग सुचवा
- 5x उत्पादन वाढीचे शास्त्रीय मार्ग`,
    'en': `🎯 Core Goal: Double farmer income
- Include economic benefit in every suggestion (₹/acre)
- Cost-saving methods
- Scientific ways to achieve 5x yield`,
    'pa': `🎯 ਮੁੱਖ ਟੀਚਾ: ਕਿਸਾਨ ਦੀ ਆਮਦਨ ਦੁੱਗਣੀ ਕਰਨਾ
- ਹਰ ਸੁਝਾਅ ਵਿੱਚ ਆਰਥਿਕ ਲਾਭ (₹/ਏਕੜ)`,
    'ta': `🎯 முக்கிய இலக்கு: விவசாயி வருமானத்தை இரட்டிப்பாக்குதல்
- ஒவ்வொரு ஆலோசனையிலும் பொருளாதார நன்மை`
  };
  return focus[language] || focus['en'];
}

// Token estimation for monitoring
export function estimatePromptTokens(prompt: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English, 2-3 for Hindi/regional
  return Math.ceil(prompt.length / 3);
}
