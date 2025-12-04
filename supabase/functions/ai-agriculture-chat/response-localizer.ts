// ============= RESPONSE LOCALIZER =============
// Post-processes AI responses to:
// 1. Auto-fix formal terms to rural equivalents
// 2. Add InstaScan CTAs for pest/disease queries
// 3. Fix common word confusions (खाद्य → खत)

import { 
  marathiTermMappings, 
  hindiTermMappings,
  replaceFormalsWithRural,
  shouldAddInstaScanCTA,
  getInstaScanCTA
} from './rural-language-dictionary.ts';

// ============= CRITICAL WORD FIXES =============
// These are word confusions that must be corrected

interface WordFix {
  wrong: RegExp;
  correct: string;
  context: string;
}

const marathiWordFixes: WordFix[] = [
  // CRITICAL: खाद्य (food) confused with खत (fertilizer)
  { wrong: /खाद्यपदार्थांची तयारी/gi, correct: 'खत देण्याची तयारी', context: 'fertilizer prep' },
  { wrong: /खाद्यपदार्थ/gi, correct: 'खत', context: 'fertilizer' },
  { wrong: /खाद्य व्यवस्थापन/gi, correct: 'खत व्यवस्थापन', context: 'fertilizer management' },
  { wrong: /खाद्य देणे/gi, correct: 'खत देणे', context: 'apply fertilizer' },
  
  // Formal terms to village terms
  { wrong: /सिंचन प्रणाली/gi, correct: 'पाणी देण्याची पद्धत', context: 'irrigation' },
  { wrong: /जलसिंचन/gi, correct: 'पाणी देणे', context: 'watering' },
  { wrong: /कीटकनाशके फवारणी/gi, correct: 'औषध फवारणी', context: 'pesticide spray' },
  { wrong: /कीटकनाशक/gi, correct: 'कीड मारायची दवा', context: 'pesticide' },
  { wrong: /रोगनाशक/gi, correct: 'रोग मारायची दवा', context: 'fungicide' },
  { wrong: /सेंद्रिय पदार्थ/gi, correct: 'देशी खत', context: 'organic matter' },
  { wrong: /रासायनिक खते/gi, correct: 'दुकानाची खते', context: 'chemical fertilizers' },
  { wrong: /रासायनिक खत/gi, correct: 'दुकानाचं खत', context: 'chemical fertilizer' },
  { wrong: /मृदा परीक्षण/gi, correct: 'माती तपासणी', context: 'soil test' },
  { wrong: /मृदा/gi, correct: 'माती', context: 'soil' },
  { wrong: /उर्वरक/gi, correct: 'खत', context: 'fertilizer' },
  { wrong: /जैविक/gi, correct: 'देशी', context: 'biological' },
  { wrong: /निरीक्षण करा/gi, correct: 'बघा', context: 'observe' },
  { wrong: /अंमलबजावणी/gi, correct: 'करा', context: 'implement' }
];

const hindiWordFixes: WordFix[] = [
  // Formal to village terms
  { wrong: /सिंचाई प्रणाली/gi, correct: 'पानी देने का तरीका', context: 'irrigation system' },
  { wrong: /जलापूर्ति/gi, correct: 'पानी देना', context: 'water supply' },
  { wrong: /कीटनाशक छिड़काव/gi, correct: 'दवाई स्प्रे', context: 'pesticide spray' },
  { wrong: /कीटनाशक/gi, correct: 'कीट मारने की दवा', context: 'pesticide' },
  { wrong: /फफूंदनाशक/gi, correct: 'फंगस की दवा', context: 'fungicide' },
  { wrong: /जैविक खाद/gi, correct: 'देशी खाद', context: 'organic fertilizer' },
  { wrong: /रासायनिक उर्वरक/gi, correct: 'दुकान की खाद', context: 'chemical fertilizer' },
  { wrong: /मृदा परीक्षण/gi, correct: 'मिट्टी जांच', context: 'soil test' },
  { wrong: /मृदा/gi, correct: 'मिट्टी', context: 'soil' },
  { wrong: /उर्वरक/gi, correct: 'खाद', context: 'fertilizer' },
  { wrong: /निरीक्षण करें/gi, correct: 'देखें', context: 'observe' },
  { wrong: /अनुशंसा/gi, correct: 'सलाह', context: 'recommendation' }
];

// ============= MAIN LOCALIZER FUNCTION =============
export function localizeResponse(
  response: string,
  language: string,
  queryType: string,
  addInstaScanCTA: boolean = true
): string {
  let localizedResponse = response;
  
  // Step 1: Apply critical word fixes
  localizedResponse = applyWordFixes(localizedResponse, language);
  
  // Step 2: Replace formal terms with rural equivalents
  localizedResponse = replaceFormalsWithRural(localizedResponse, language);
  
  // Step 3: Add InstaScan CTA for pest/disease queries
  if (addInstaScanCTA && shouldAddInstaScanCTA(queryType)) {
    // Check if response mentions problems that need photo diagnosis
    const needsPhotoDiagnosis = checkNeedsPhotoDiagnosis(localizedResponse, language);
    if (needsPhotoDiagnosis) {
      localizedResponse = addInstaScanSuggestion(localizedResponse, language);
    }
  }
  
  // Step 4: Ensure proper line breaks for readability
  localizedResponse = ensureProperFormatting(localizedResponse);
  
  return localizedResponse;
}

// ============= APPLY WORD FIXES =============
function applyWordFixes(text: string, language: string): string {
  let result = text;
  
  const fixes = language === 'mr' ? marathiWordFixes :
                language === 'hi' ? hindiWordFixes :
                [];
  
  for (const fix of fixes) {
    result = result.replace(fix.wrong, fix.correct);
  }
  
  return result;
}

// ============= CHECK IF PHOTO DIAGNOSIS NEEDED =============
function checkNeedsPhotoDiagnosis(text: string, language: string): boolean {
  const indicatorsMap: Record<string, RegExp[]> = {
    mr: [
      /कीड|कीटक|अळी|मावा|तुडतुडा/i,
      /रोग|बुरशी|करपा|मर|सड/i,
      /पान.*पिवळ|पिवळी.*पान/i,
      /पान.*करड|तपकिरी.*डाग/i,
      /वाढ.*थांब|वाढ.*कमी|विकास.*मंद/i,
      /लक्षण|समस्या|अडचण/i
    ],
    hi: [
      /कीड़|कीट|इल्ली|माहू|थ्रिप्स/i,
      /रोग|फफूंद|झुलसा|गलन|सड़न/i,
      /पत्त.*पील|पीला.*पत्त/i,
      /पत्त.*भूर|भूरे.*धब्बे/i,
      /बढ़.*रुक|विकास.*धीम/i,
      /लक्षण|समस्या|परेशानी/i
    ],
    en: [
      /pest|insect|worm|aphid|thrip/i,
      /disease|fungus|blight|rot|wilt/i,
      /leaf.*yellow|yellow.*leaf/i,
      /leaf.*brown|brown.*spot/i,
      /growth.*stop|slow.*growth/i,
      /symptom|problem|issue/i
    ]
  };
  
  const indicators = indicatorsMap[language] || indicatorsMap['en'];
  return indicators.some(pattern => pattern.test(text));
}

// ============= ADD INSTASCAN SUGGESTION =============
function addInstaScanSuggestion(text: string, language: string): string {
  const ctaMap: Record<string, string> = {
    mr: `

💡 **अचूक निदानासाठी:**
पान/पिकाचा फोटो काढा या अॅपमधून - मी बघून सांगतो नक्की काय झालंय!
👉 खाली InstaScan बटण दाबा`,

    hi: `

💡 **सही पहचान के लिए:**
पत्ते/फसल का फोटो खींचो इस ऐप से - मैं देखकर बताऊंगा क्या हुआ!
👉 नीचे InstaScan बटन दबाओ`,

    en: `

💡 **For accurate diagnosis:**
Take a photo of the leaf/crop using this app - I'll tell you exactly what's wrong!
👉 Tap InstaScan button below`,

    pa: `

💡 **ਸਹੀ ਪਛਾਣ ਲਈ:**
ਪੱਤੇ/ਫ਼ਸਲ ਦੀ ਫੋਟੋ ਖਿੱਚੋ - ਮੈਂ ਦੇਖ ਕੇ ਦੱਸਾਂਗਾ ਕੀ ਹੋਇਆ!
👉 ਹੇਠਾਂ InstaScan ਬਟਨ ਦਬਾਓ`,

    ta: `

💡 **சரியான கண்டறிதலுக்கு:**
இலை/பயிர் புகைப்படம் எடுங்கள் - நான் பார்த்து சொல்வேன்!
👉 கீழே InstaScan பொத்தானை அழுத்துங்கள்`
  };
  
  const cta = ctaMap[language] || ctaMap['en'];
  
  // Don't add if already has InstaScan mention
  if (/instascan|इंस्टास्कैन|इन्स्टास्कॅन/i.test(text)) {
    return text;
  }
  
  return text + cta;
}

// ============= ENSURE PROPER FORMATTING =============
function ensureProperFormatting(text: string): string {
  let result = text;
  
  // Ensure emoji sections start on new lines
  result = result.replace(/([^\n])(🟢|🟡|🔴|🔵|💧|🌱|⚠️|📸|💡)/g, '$1\n\n$2');
  
  // Ensure numbered points are on new lines
  result = result.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
  
  // Remove excessive blank lines
  result = result.replace(/\n{4,}/g, '\n\n\n');
  
  return result;
}

// ============= EXPORT HELPER FOR CONTEXT PERSONALIZATION =============
export function personalizeWithLocation(
  response: string,
  locationContext: {
    village?: string;
    district?: string;
    state?: string;
    localCropName?: string;
  },
  language: string
): string {
  let result = response;
  
  // Add village reference if available
  if (locationContext.village) {
    const villageRefs: Record<string, string> = {
      mr: `तुमच्या ${locationContext.village} गावात`,
      hi: `आपके ${locationContext.village} गांव में`,
      en: `In your village ${locationContext.village}`,
      pa: `ਤੁਹਾਡੇ ${locationContext.village} ਪਿੰਡ ਵਿੱਚ`
    };
    // Only add if not already present
    if (!result.includes(locationContext.village)) {
      const ref = villageRefs[language] || villageRefs['en'];
      // Add at a natural point in the response
      result = result.replace(/^/, ref + ', ');
    }
  }
  
  return result;
}
