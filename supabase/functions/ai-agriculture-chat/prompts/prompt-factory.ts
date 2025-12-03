// ============= SMART PROMPT FACTORY =============
// Builds minimal, query-specific prompts to reduce token usage by 85%

import { getBaseIdentity } from './base-identity.ts';
import { getQueryPrompt } from './query-prompts.ts';

export interface PromptConfig {
  queryType: string;
  language: string;
  cropName?: string;
  hasLand: boolean;
  messageCount: number;
}

export function buildOptimizedSystemPrompt(config: PromptConfig): string {
  const { queryType, language, cropName, hasLand, messageCount } = config;
  
  // Base identity: ~200 tokens
  let prompt = getBaseIdentity(language);
  
  // Query-specific rules: ~100-150 tokens
  prompt += '\n\n' + getQueryPrompt(queryType, language);
  
  // Formatting rules (minimal): ~100 tokens
  prompt += '\n\n' + getFormattingRules(language);
  
  // Income focus instruction: ~50 tokens
  prompt += '\n\n' + getIncomeFocusPrompt(language);
  
  // Context awareness (first message vs continuation)
  if (messageCount > 1) {
    prompt += `\n\n[Continuation - farmer already knows you, be direct]`;
  }
  
  return prompt;
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
