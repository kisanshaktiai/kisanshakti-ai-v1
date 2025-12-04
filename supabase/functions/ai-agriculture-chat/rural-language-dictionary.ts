// ============= RURAL LANGUAGE DICTIONARY =============
// Maps formal/textbook terms to village-spoken equivalents
// This fixes issues like "खाद्यपदार्थ" being used instead of "खत"

export interface TermMapping {
  formal: string;
  rural: string[];
  context?: string;
}

export interface RegionalVocabulary {
  greetings: string[];
  farmerTerms: string[];
  commonPhrases: Record<string, string>;
}

// ============= MARATHI TERM CORRECTIONS =============
export const marathiTermMappings: TermMapping[] = [
  // CRITICAL FIX: खाद्य (food) vs खत (fertilizer) confusion
  { formal: 'खाद्यपदार्थ', rural: ['खत', 'खाद'], context: 'fertilizer' },
  { formal: 'खाद्य', rural: ['खत', 'खाद'], context: 'fertilizer' },
  { formal: 'खाद्यपदार्थांची तयारी', rural: ['खत देणे', 'खाद टाकणे'], context: 'fertilizer application' },
  
  // Irrigation terms
  { formal: 'सिंचन', rural: ['पाणी देणे', 'पाणी भरणे'] },
  { formal: 'सिंचन प्रणाली', rural: ['पाणी कसं द्यायचं', 'पाणी देण्याची पद्धत'] },
  { formal: 'जलसिंचन', rural: ['पाणी देणे'] },
  
  // Fertilizer terms
  { formal: 'रासायनिक खत', rural: ['दुकानाचं खत', 'केमिकल खत'] },
  { formal: 'सेंद्रिय', rural: ['देशी', 'नैसर्गिक', 'शेणखत'] },
  { formal: 'सेंद्रिय पदार्थ', rural: ['शेणखत', 'देशी खत', 'कंपोस्ट'] },
  { formal: 'जैविक', rural: ['देशी', 'नैसर्गिक'] },
  { formal: 'उर्वरक', rural: ['खत', 'खाद'] },
  
  // Pest/Disease terms
  { formal: 'कीटकनाशक', rural: ['कीड मारायची दवा', 'औषध', 'फवारणी'] },
  { formal: 'कीटकनाशके', rural: ['औषधं', 'फवारण्या'] },
  { formal: 'रोगनाशक', rural: ['रोग मारायची दवा', 'बुरशीचं औषध'] },
  { formal: 'कीड नियंत्रण', rural: ['कीड मारणे', 'औषध फवारणे'] },
  { formal: 'रोग व्यवस्थापन', rural: ['रोग कसा घालवायचा'] },
  
  // Soil terms
  { formal: 'मृदा', rural: ['माती', 'जमीन'] },
  { formal: 'मृदा परीक्षण', rural: ['माती तपासणी', 'माती चेक'] },
  { formal: 'भूमी', rural: ['जमीन', 'शेत'] },
  
  // Crop terms
  { formal: 'पीक संरक्षण', rural: ['पिकाची काळजी'] },
  { formal: 'पीक व्यवस्थापन', rural: ['पीक कसं वाढवायचं'] },
  { formal: 'उत्पादकता', rural: ['उत्पन्न', 'माल', 'पिकाचा भार'] },
  
  // Technical terms
  { formal: 'तापमान', rural: ['उन्हाळा', 'गारवा', 'हवामान'] },
  { formal: 'आर्द्रता', rural: ['ओलावा', 'दमटपणा'] },
  { formal: 'वातावरण', rural: ['हवा', 'हवामान'] },
  
  // Action terms
  { formal: 'निरीक्षण करा', rural: ['बघा', 'तपासा', 'पहा'] },
  { formal: 'अंमलबजावणी', rural: ['करा', 'वापरा'] },
  { formal: 'शिफारस', rural: ['सल्ला', 'सांगतो'] }
];

// ============= HINDI TERM CORRECTIONS =============
export const hindiTermMappings: TermMapping[] = [
  // Irrigation
  { formal: 'सिंचाई प्रणाली', rural: ['पानी कैसे दें', 'पानी देने का तरीका'] },
  { formal: 'जलापूर्ति', rural: ['पानी देना'] },
  
  // Fertilizer
  { formal: 'रासायनिक उर्वरक', rural: ['दुकान की खाद', 'केमिकल खाद'] },
  { formal: 'जैविक खाद', rural: ['देशी खाद', 'गोबर की खाद'] },
  { formal: 'सेंद्रिय', rural: ['देशी', 'प्राकृतिक'] },
  
  // Pest
  { formal: 'कीटनाशक', rural: ['कीट मारने की दवा', 'दवाई', 'स्प्रे'] },
  { formal: 'फफूंदनाशक', rural: ['फंगस की दवा', 'बीमारी की दवा'] },
  
  // Soil
  { formal: 'मृदा', rural: ['मिट्टी', 'जमीन'] },
  { formal: 'मृदा परीक्षण', rural: ['मिट्टी जांच', 'मिट्टी टेस्ट'] },
  
  // Technical
  { formal: 'तापमान', rural: ['गर्मी', 'ठंड', 'मौसम'] },
  { formal: 'आर्द्रता', rural: ['नमी', 'गीलापन'] },
  { formal: 'अनुशंसा', rural: ['सलाह', 'बताता हूं'] }
];

// ============= REGIONAL VOCABULARY (State-specific) =============
export const regionalVocabulary: Record<string, RegionalVocabulary> = {
  maharashtra: {
    greetings: ['भाऊ', 'दादा', 'काका', 'मामा'],
    farmerTerms: ['शेतकरी', 'बळीराजा'],
    commonPhrases: {
      'अच्छा': 'बरं',
      'ठीक है': 'चांगलं',
      'समझे': 'समजलं का',
      'देखो': 'बघा',
      'करो': 'करा'
    }
  },
  
  punjab_haryana: {
    greetings: ['वीर जी', 'भाई साहब', 'ताऊ जी'],
    farmerTerms: ['किसान', 'जट्ट'],
    commonPhrases: {
      'देखो': 'वेखो',
      'अच्छा': 'चंगा',
      'ठीक है': 'ठीक है जी'
    }
  },
  
  up_bihar: {
    greetings: ['भैया', 'बाबू', 'काका'],
    farmerTerms: ['किसान', 'खेतिहर'],
    commonPhrases: {
      'देखिए': 'देखा',
      'समझिए': 'बुझा',
      'करिए': 'करा'
    }
  },
  
  tamil_nadu: {
    greetings: ['அண்ணா', 'தம்பி'],
    farmerTerms: ['விவசாயி', 'உழவர்'],
    commonPhrases: {}
  },
  
  andhra_telangana: {
    greetings: ['అన్నా', 'బాబూ'],
    farmerTerms: ['రైతు', 'కర్షకుడు'],
    commonPhrases: {}
  }
};

// ============= INSTASCAN CTA PHRASES =============
export const instaScanCTAs: Record<string, string> = {
  mr: `
📸 **टिप:** पान/पिकाचा फोटो काढा या अॅपमधून!
मी बघून सांगतो नक्की काय झालंय आणि कोणतं औषध लागेल.
[फोटो काढण्यासाठी InstaScan वापरा]`,

  hi: `
📸 **टिप:** पत्ते/फसल का फोटो खींचो इस ऐप से!
मैं देखकर बताऊंगा क्या हुआ और कौनसी दवा लगेगी।
[फोटो लेने के लिए InstaScan इस्तेमाल करें]`,

  en: `
📸 **Tip:** Take a photo of the leaf/crop using this app!
I'll see and tell you exactly what's wrong and which medicine to use.
[Use InstaScan to capture photo]`,

  pa: `
📸 **ਸੁਝਾਅ:** ਪੱਤੇ/ਫ਼ਸਲ ਦੀ ਫੋਟੋ ਖਿੱਚੋ ਇਸ ਐਪ ਨਾਲ!
ਮੈਂ ਦੇਖ ਕੇ ਦੱਸਾਂਗਾ ਕੀ ਹੋਇਆ ਤੇ ਕਿਹੜੀ ਦਵਾਈ ਲੱਗੇਗੀ।`,

  ta: `
📸 **குறிப்பு:** இலை/பயிர் புகைப்படம் எடுங்கள் இந்த ஆப்பில்!
நான் பார்த்து சொல்வேன் என்ன பிரச்சனை, எந்த மருந்து வேண்டும்.`
};

// ============= FUNCTION: Replace formal terms with rural =============
export function replaceFormalsWithRural(
  text: string, 
  language: string
): string {
  let result = text;
  
  const mappings = language === 'mr' ? marathiTermMappings : 
                   language === 'hi' ? hindiTermMappings : 
                   [];
  
  for (const mapping of mappings) {
    // Replace formal term with first rural equivalent
    const regex = new RegExp(mapping.formal, 'gi');
    result = result.replace(regex, mapping.rural[0]);
  }
  
  return result;
}

// ============= FUNCTION: Get rural language rules for prompts =============
export function getRuralLanguageRules(language: string): string {
  const rules: Record<string, string> = {
    mr: `
⚠️ भाषा नियम (अत्यंत महत्त्वाचे):
तुम्ही गावातील शेतकऱ्यांचे जुने मित्र आहात - शास्त्रज्ञ नाही!

🚫 हे शब्द कधीच वापरू नका:
- "खाद्यपदार्थ" → "खत/खाद" वापरा
- "सिंचन प्रणाली" → "पाणी कसं द्यायचं" म्हणा
- "कीटकनाशक" → "कीड मारायची दवा/औषध" म्हणा
- "सेंद्रिय पदार्थ" → "देशी खत/शेणखत" म्हणा
- "रासायनिक" → "दुकानाचं खत" म्हणा
- "मृदा" → "माती/जमीन" म्हणा
- "उर्वरक" → "खत" म्हणा

✅ गावठी बोलीभाषा वापरा:
- "भाऊ" किंवा "दादा" असं संबोधन करा
- साध्या, सोप्या शब्दात बोला
- तांत्रिक शब्द टाळा
- शेतकऱ्याला समजेल अशा भाषेत सांगा

उदाहरण:
❌ "सिंचन प्रणालीद्वारे जलापूर्ति करा"
✅ "ठिबक पद्धतीने पाणी द्या भाऊ"

❌ "कीटकनाशकांची फवारणी करा"
✅ "कीड मारायची दवा फवारा"`,

    hi: `
⚠️ भाषा नियम (बहुत जरूरी):
आप गांव के किसानों के पुराने दोस्त हैं - वैज्ञानिक नहीं!

🚫 ये शब्द कभी मत बोलो:
- "सिंचाई प्रणाली" → "पानी कैसे दें" बोलो
- "कीटनाशक" → "कीट मारने की दवा" बोलो
- "जैविक खाद" → "देशी खाद/गोबर की खाद" बोलो
- "रासायनिक उर्वरक" → "दुकान की खाद" बोलो
- "मृदा" → "मिट्टी/जमीन" बोलो

✅ गांव की भाषा बोलो:
- "भैया" या "दादा" कहकर बात करो
- सीधे-सादे शब्द बोलो
- टेक्निकल शब्द मत बोलो
- किसान को समझ आए ऐसा बोलो

उदाहरण:
❌ "सिंचाई प्रणाली द्वारा जलापूर्ति करें"
✅ "ड्रिप से पानी दो भैया"

❌ "कीटनाशकों का छिड़काव करें"
✅ "कीड़े मारने की दवाई स्प्रे करो"`,

    en: `
⚠️ Language Rules (Very Important):
You are a farmer's old friend from the village - NOT a scientist!

🚫 Never use these words:
- "Irrigation system" → Say "how to water"
- "Pesticide application" → Say "spray medicine for insects"
- "Organic fertilizer" → Say "natural/desi manure"
- "Chemical fertilizer" → Say "shop fertilizer"
- "Soil" → Say "land/ground"

✅ Use simple village language:
- Address as "brother" or "friend"
- Use simple, easy words
- Avoid technical jargon
- Speak so farmer understands easily

Example:
❌ "Implement drip irrigation system for optimal water distribution"
✅ "Brother, use drip for watering - saves water and works better"`,

    pa: `
⚠️ ਭਾਸ਼ਾ ਨਿਯਮ:
ਤੁਸੀਂ ਪਿੰਡ ਦੇ ਕਿਸਾਨਾਂ ਦੇ ਪੁਰਾਣੇ ਦੋਸਤ ਹੋ!

🚫 ਇਹ ਸ਼ਬਦ ਨਾ ਵਰਤੋ:
- "ਸਿੰਚਾਈ ਪ੍ਰਣਾਲੀ" → "ਪਾਣੀ ਕਿਵੇਂ ਦੇਣਾ" ਬੋਲੋ
- "ਕੀਟਨਾਸ਼ਕ" → "ਕੀੜੇ ਮਾਰਨ ਦੀ ਦਵਾਈ" ਬੋਲੋ

✅ ਪਿੰਡ ਦੀ ਭਾਸ਼ਾ ਬੋਲੋ:
- "ਵੀਰ ਜੀ" ਕਹਿ ਕੇ ਗੱਲ ਕਰੋ
- ਸਿੱਧੇ-ਸਾਦੇ ਸ਼ਬਦ ਬੋਲੋ`,

    ta: `
⚠️ மொழி விதிகள்:
நீங்கள் கிராம விவசாயிகளின் பழைய நண்பர்!

🚫 இந்த வார்த்தைகள் பயன்படுத்தாதீர்கள்:
- தொழில்நுட்ப சொற்கள் தவிர்க்கவும்

✅ எளிய கிராம மொழி பயன்படுத்துங்கள்:
- "அண்ணா" என்று அழைக்கவும்
- எளிய வார்த்தைகள் பயன்படுத்துங்கள்`
  };

  return rules[language] || rules['en'];
}

// ============= FUNCTION: Should add InstaScan CTA =============
export function shouldAddInstaScanCTA(queryType: string): boolean {
  return ['pest', 'health', 'growth'].includes(queryType);
}

// ============= FUNCTION: Get InstaScan CTA =============
export function getInstaScanCTA(language: string): string {
  return instaScanCTAs[language] || instaScanCTAs['en'];
}
