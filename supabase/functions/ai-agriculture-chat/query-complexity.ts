// ============= QUERY COMPLEXITY ANALYZER =============

export interface ComplexityAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  maxWords: number;
  maxTokens: number;
  responseStyle: string;
}

export function analyzeQueryComplexity(userMessage: string, language: string = 'en'): ComplexityAnalysis {
  const msg = userMessage.toLowerCase();
  
  // ✅ FIX: Use character count for Indic scripts, word count for Latin scripts
  const isIndicScript = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(userMessage);
  
  let complexity: 'simple' | 'medium' | 'complex';
  let baseMaxWords: number;
  let baseMaxTokens: number;
  
  if (isIndicScript) {
    // For Indic scripts, use character count
    const charCount = userMessage.length;
    if (charCount < 30) {
      complexity = 'simple';
      baseMaxWords = 80;
      baseMaxTokens = 150;
    } else if (charCount < 100) {
      complexity = 'medium';
      baseMaxWords = 250;
      baseMaxTokens = 400;
    } else {
      complexity = 'complex';
      baseMaxWords = 500;
      baseMaxTokens = 800;
    }
  } else {
    // For Latin scripts, use word count
    const wordCount = msg.split(/\s+/).length;
  
  // ============================================
  // SIMPLE QUERIES (1-5 words, yes/no, greetings)
  // ============================================
  const simplePatterns = [
    // Greetings
    /^(hi|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|नमस्कार|হ্যালো|வணக்கம்|నమస్కారం|ਨਮਸਤੇ)$/i,
    
    // Yes/No questions
    /^(yes|no|ok|okay|हाँ|नहीं|हो|नाही|ஆம்|இல்லை|అవును|కాదు|ਹਾਂ|ਨਹੀਂ)$/i,
    
    // Single fact questions (1-3 words)
    /^(what is|क्या है|काय आहे|என்ன|ఏమిటి|ਕੀ ਹੈ)/,
    
    // When questions (1-4 words)
    /^(when|कब|कधी|எப்போது|ఎప్పుడు|ਕਦੋਂ)\s+(water|irrigate|spray|पानी|सिंचाई|पाणी|நீர்|నీరు|ਪਾਣੀ)/,
    
    // Simple status checks
    /^(crop|फसल|पीक|பயிர்|పంట|ਫ਼ਸਲ)\s+(ok|ठीक|बरोबर|good|சரி|బాగుంది|ਠੀਕ)/,
    
    // Direct short questions
    /^(कौनसी|which|எந்த|ఏ|ਕਿਹੜਾ)\s+(खाद|fertilizer|உரம்|ఎరువు|ਖਾਦ)/,
    /^(कितना|how much|எவ்வளவு|ఎంత|ਕਿੰਨਾ)/,
    /^(price|भाव|किंमत|விலை|ధర|ਭਾਅ)/
  ];
  
    if (wordCount <= 5 || simplePatterns.some(p => p.test(msg))) {
      complexity = 'simple';
      baseMaxWords = 80;
      baseMaxTokens = 150;
    } else if (wordCount <= 15 || mediumPatterns.some(p => p.test(msg))) {
      complexity = 'medium';
      baseMaxWords = 250;
      baseMaxTokens = 400;
    } else {
      complexity = 'complex';
      baseMaxWords = 500;
      baseMaxTokens = 800;
    }
  }
  
  // ✅ FIX: Apply 1.8x multiplier for Indic languages
  const indicLanguages = ['hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa', 'or', 'ur'];
  const isIndicLanguage = indicLanguages.includes(language);
  
  let finalMaxTokens = baseMaxTokens;
  if (isIndicLanguage) {
    finalMaxTokens = Math.round(baseMaxTokens * 1.8); // Indic scripts use more tokens
    console.log(`🔤 Indic language detected (${language}): ${baseMaxTokens} → ${finalMaxTokens} tokens`);
  }
  
  // ✅ FIX: Add 20% safety buffer to prevent mid-response cutoffs
  finalMaxTokens = Math.round(finalMaxTokens * 1.2);
  
  return {
    complexity,
    maxWords: baseMaxWords,
    maxTokens: finalMaxTokens,
    responseStyle: complexity === 'simple' ? 'brief' : complexity === 'medium' ? 'structured' : 'comprehensive'
  };
  
  // ============================================
  // MEDIUM QUERIES (6-15 words, how-to, advice)
  // ============================================
  const mediumPatterns = [
    // How-to questions
    /how (to|do|can)|कैसे|कसे|எப்படி|ఎలా|ਕਿਵੇਂ/,
    
    // Advice questions
    /should i|what should|मुझे क्या|मला काय|நான் என்ன|నేను ఏమి|ਮੈਨੂੰ ਕੀ/,
    
    // Recommendation requests
    /recommend|suggest|सुझाव|शिफारस|பரிந்துரை|సూచన|ਸਲਾਹ/,
    
    // Schedule questions
    /schedule|timing|समय|वेळ|அட்டவணை|షెడ్యూల్|ਸਮਾਂ/,
    
    // Problem diagnosis (medium detail)
    /problem|issue|समस्या|अडचण|பிரச்சனை|సమస్య|ਸਮੱਸਿਆ/
  ];

export function getResponseLengthInstruction(
  complexity: 'simple' | 'medium' | 'complex',
  language: string
): string {
  const instructions = {
    simple: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 80 WORDS (3-4 sentences)
This is a SIMPLE question. Give a DIRECT, SHORT answer.
DO NOT use emoji sections (🟢🟡🔴) for simple queries - just plain text.

Example:
User: "When to water wheat?"
You: "Water your wheat crop twice this week - Monday and Thursday. Apply 28,000 liters each time through drip system. Water early morning (6-8 AM) for best results."

DO NOT give:
❌ Long introductions
❌ Detailed explanations
❌ Multiple sections
❌ Historical background

DO give:
✅ Direct answer in 2-3 sentences
✅ Specific numbers/timings
✅ One key tip`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 80 शब्द (3-4 वाक्य)
यह एक सरल सवाल है। सीधा, छोटा जवाब दें।
सरल सवालों के लिए इमोजी सेक्शन (🟢🟡🔴) का उपयोग न करें - केवल सादा टेक्स्ट।

उदाहरण:
उपयोगकर्ता: "गेहूं में पानी कब दें?"
आप: "इस हफ्ते दो बार पानी दें - सोमवार और गुरुवार। हर बार 28,000 लीटर ड्रिप से। सुबह 6-8 बजे पानी देना बेस्ट है।"

मत दें:
❌ लंबी शुरुआत
❌ विस्तृत व्याख्या
❌ कई सेक्शन

दें:
✅ सीधा जवाब 2-3 वाक्यों में
✅ सटीक संख्या/समय
✅ एक मुख्य टिप`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 80 शब्द (3-4 वाक्ये)
हा एक साधा प्रश्न आहे। थेट, लहान उत्तर द्या।
साध्या प्रश्नांसाठी इमोजी विभाग (🟢🟡🔴) वापरू नका - फक्त साधा मजकूर.

उदाहरण:
वापरकर्ता: "गहू मध्ये पाणी कधी द्यावे?"
तुम्ही: "या आठवड्यात दोन वेळा पाणी द्या - सोमवार आणि गुरुवार। प्रत्येक वेळी 28,000 लीटर ठिबक प्रणालीतून। सकाळी 6-8 वाजता पाणी देणे चांगले."

देऊ नका:
❌ लांब परिचय
❌ तपशीलवार स्पष्टीकरण
❌ अनेक विभाग

द्या:
✅ थेट उत्तर 2-3 वाक्यांमध्ये
✅ अचूक संख्या/वेळ
✅ एक मुख्य टिप`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 80 சொற்கள் (3-4 வாக்கியங்கள்)
இது ஒரு எளிய கேள்வி. நேரடியான, குறுகிய பதில் கொடுங்கள்.

உதாரணம்:
பயனர்: "கோதுமைக்கு எப்போது நீர் தேவை?"
நீங்கள்: "இந்த வாரம் இருமுறை நீர் கொடுங்கள் - திங்கள் மற்றும் வியாழன். ஒவ்வொரு முறையும் 28,000 லிட்டர் சொட்டுநீர் மூலம். காலை 6-8 மணிக்கு நீர் கொடுப்பது சிறந்தது."

கொடுக்க வேண்டாம்:
❌ நீண்ட அறிமுகம்
❌ விரிவான விளக்கம்
❌ பல பிரிவுகள்

கொடுங்கள்:
✅ நேரடி பதில் 2-3 வாக்கியங்களில்
✅ குறிப்பிட்ட எண்கள்/நேரங்கள்
✅ ஒரு முக்கிய குறிப்பு`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 80 పదాలు (3-4 వాక్యాలు)
ఇది ఒక సాధారణ ప్రశ్న. ప్రత్యక్ష, చిన్న సమాధానం ఇవ్వండి।

ఉదాహరణ:
వినియోగదారు: "గోధుమకు నీరు ఎప్పుడు?"
మీరు: "ఈ వారం రెండుసార్లు నీరు ఇవ్వండి - సోమవారం మరియు గురువారం। ప్రతిసారి 28,000 లీటర్లు డ్రిప్ ద్వారా। ఉదయం 6-8 గంటలకు నీరు ఇవ్వడం మంచిది."

ఇవ్వకండి:
❌ పొడవైన పరిచయం
❌ వివరణాత్మక వివరణ
❌ అనేక విభాగాలు

ఇవ్వండి:
✅ ప్రత్యక్ష సమాధానం 2-3 వాక్యాలలో
✅ నిర్దిష్ట సంఖ్యలు/సమయాలు
✅ ఒక ముఖ్య చిట్కా`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 80 ਸ਼ਬਦ (3-4 ਵਾਕ)
ਇਹ ਇੱਕ ਸਧਾਰਨ ਸਵਾਲ ਹੈ। ਸਿੱਧਾ, ਛੋਟਾ ਜਵਾਬ ਦਿਓ।

ਉਦਾਹਰਨ:
ਵਰਤੋਂਕਾਰ: "ਕਣਕ ਵਿੱਚ ਪਾਣੀ ਕਦੋਂ?"
ਤੁਸੀਂ: "ਇਸ ਹਫਤੇ ਦੋ ਵਾਰ ਪਾਣੀ ਦਿਓ - ਸੋਮਵਾਰ ਅਤੇ ਵੀਰਵਾਰ। ਹਰ ਵਾਰ 28,000 ਲੀਟਰ ਡਰਿੱਪ ਰਾਹੀਂ। ਸਵੇਰੇ 6-8 ਵਜੇ ਪਾਣੀ ਦੇਣਾ ਚੰਗਾ ਹੈ।"

ਨਾ ਦਿਓ:
❌ ਲੰਮੀ ਜਾਣ-ਪਛਾਣ
❌ ਵਿਸਥਾਰਪੂਰਵਕ ਵਿਆਖਿਆ
❌ ਕਈ ਭਾਗ

ਦਿਓ:
✅ ਸਿੱਧਾ ਜਵਾਬ 2-3 ਵਾਕਾਂ ਵਿੱਚ
✅ ਖਾਸ ਸੰਖਿਆਵਾਂ/ਸਮੇਂ
✅ ਇੱਕ ਮੁੱਖ ਸੁਝਾਅ`
    },
    
    medium: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 250 WORDS (2-3 paragraphs)
This is a MEDIUM complexity question. Provide structured, step-by-step guidance.

Structure:
1️⃣ Brief intro (1 sentence)
2️⃣ Main steps (3-5 bullet points)
3️⃣ Key tip (1 sentence)

Example:
User: "How to apply fertilizer to tomato?"
You: "Here's the fertilizer schedule for tomato in your 5.25 acres:

STEP 1: At planting - Mix DAP 25kg + Potash 15kg in soil
STEP 2: After 20 days - Apply Urea 20kg around plants
STEP 3: At flowering - Apply 19:19:19 NPK 30kg

Apply on moist soil, water lightly after. Avoid touching leaves."

DO NOT exceed 250 words.`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 250 शब्द (2-3 पैराग्राफ)
यह मध्यम कठिनाई का सवाल है। स्टेप-बाय-स्टेप मार्गदर्शन दें।

ढांचा:
1️⃣ संक्षिप्त परिचय (1 वाक्य)
2️⃣ मुख्य कदम (3-5 बिंदु)
3️⃣ महत्वपूर्ण टिप (1 वाक्य)

250 शब्दों से अधिक न लिखें।`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 250 शब्द (2-3 परिच्छेद)
हा मध्यम क्लिष्टतेचा प्रश्न आहे। पायरी-दर-पायरी मार्गदर्शन द्या।

रचना:
1️⃣ संक्षिप्त परिचय (1 वाक्य)
2️⃣ मुख्य पायऱ्या (3-5 मुद्दे)
3️⃣ महत्त्वाची टीप (1 वाक्य)

250 शब्दांपेक्षा जास्त लिहू नका।`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 250 சொற்கள் (2-3 பத்திகள்)
இது நடுத்தர சிக்கலான கேள்வி। படிப்படியான வழிகாட்டுதலை வழங்கவும்.

கட்டமைப்பு:
1️⃣ சுருக்கமான அறிமுகம் (1 வாக்கியம்)
2️⃣ முக்கிய படிகள் (3-5 புள்ளிகள்)
3️⃣ முக்கிய குறிப்பு (1 வாக்கியம்)

250 சொற்களுக்கு மேல் எழுத வேண்டாம்.`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 250 పదాలు (2-3 పేరాగ్రాఫ్‌లు)
ఇది మధ్యస్థ సంక్లిష్టత ప్రశ్న. దశలవారీ మార్గదర్శకత్వం అందించండి.

నిర్మాణం:
1️⃣ సంక్షిప్త పరిచయం (1 వాక్యం)
2️⃣ ముఖ్య దశలు (3-5 పాయింట్లు)
3️⃣ ముఖ్య చిట్కా (1 వాక్యం)

250 పదాలకు మించి రాయకండి.`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 250 ਸ਼ਬਦ (2-3 ਪੈਰੇ)
ਇਹ ਮੱਧਮ ਗੁੰਝਲਦਾਰਤਾ ਦਾ ਸਵਾਲ ਹੈ। ਕਦਮ-ਦਰ-ਕਦਮ ਮਾਰਗਦਰਸ਼ਨ ਦਿਓ।

ਢਾਂਚਾ:
1️⃣ ਸੰਖੇਪ ਜਾਣ-ਪਛਾਣ (1 ਵਾਕ)
2️⃣ ਮੁੱਖ ਕਦਮ (3-5 ਬਿੰਦੂ)
3️⃣ ਮੁੱਖ ਸੁਝਾਅ (1 ਵਾਕ)

250 ਸ਼ਬਦਾਂ ਤੋਂ ਵੱਧ ਨਾ ਲਿਖੋ।`
    },
    
    complex: {
      en: `
⚠️ RESPONSE LENGTH: MAXIMUM 500 WORDS
This is a COMPLEX question requiring detailed planning.

Use organized sections with emojis:
🟢 Organic methods (if applicable)
🟡 Fertilizer schedule (if applicable)
🔵 Irrigation plan (if applicable)
🔴 Pest control (if applicable)

Keep each section to 3-5 sentences maximum.
Provide calculations for the exact land size.`,
      
      hi: `
⚠️ उत्तर की लंबाई: अधिकतम 500 शब्द
यह जटिल सवाल है जिसमें विस्तृत योजना चाहिए।

इमोजी के साथ सेक्शन बनाएं:
🟢 जैविक तरीके
🟡 खाद का शेड्यूल
🔵 पानी की योजना
🔴 कीट नियंत्रण

हर सेक्शन 3-5 वाक्यों तक सीमित रखें।`,
      
      mr: `
⚠️ उत्तराची लांबी: जास्तीत जास्त 500 शब्द
हा गुंतागुंतीचा प्रश्न आहे ज्यासाठी तपशीलवार नियोजन आवश्यक आहे।

इमोजीसह विभाग तयार करा:
🟢 सेंद्रिय पद्धती
🟡 खत वेळापत्रक
🔵 पाणी योजना
🔴 कीड नियंत्रण

प्रत्येक विभाग 3-5 वाक्यांपर्यंत मर्यादित ठेवा।`,
      
      ta: `
⚠️ பதில் நீளம்: அதிகபட்சம் 500 சொற்கள்
இது விரிவான திட்டமிடல் தேவைப்படும் சிக்கலான கேள்வி.

எமோஜியுடன் ஒழுங்கமைக்கப்பட்ட பிரிவுகள்:
🟢 இயற்கை முறைகள்
🟡 உர அட்டவணை
🔵 நீர்ப்பாசன திட்டம்
🔴 பூச்சி கட்டுப்பாடு

ஒவ்வொரு பிரிவையும் 3-5 வாக்கியங்களுக்கு மட்டுப்படுத்துங்கள்.`,
      
      te: `
⚠️ సమాధాన పొడవు: గరిష్టంగా 500 పదాలు
ఇది వివరణాత్మక ప్లానింగ్ అవసరమైన సంక్లిష్ట ప్రశ్న.

ఎమోజీలతో వ్యవస్థీకృత విభాగాలు:
🟢 సేంద్రీయ పద్ధతులు
🟡 ఎరువుల షెడ్యూల్
🔵 నీటిపారుదల ప్రణాళిక
🔴 చీడపురుగుల నియంత్రణ

ప్రతి విభాగాన్ని 3-5 వాక్యాలకు పరిమితం చేయండి.`,
      
      pa: `
⚠️ ਜਵਾਬ ਦੀ ਲੰਬਾਈ: ਅਧਿਕਤਮ 500 ਸ਼ਬਦ
ਇਹ ਗੁੰਝਲਦਾਰ ਸਵਾਲ ਹੈ ਜਿਸ ਲਈ ਵਿਸਥਾਰਪੂਰਵਕ ਯੋਜਨਾ ਚਾਹੀਦੀ ਹੈ।

ਇਮੋਜੀ ਨਾਲ ਸੰਗਠਿਤ ਭਾਗ:
🟢 ਜੈਵਿਕ ਤਰੀਕੇ
🟡 ਖਾਦ ਸਮਾਂ-ਸਾਰਣੀ
🔵 ਸਿੰਚਾਈ ਯੋਜਨਾ
🔴 ਕੀੜੇ ਨਿਯੰਤਰਣ

ਹਰੇਕ ਭਾਗ ਨੂੰ 3-5 ਵਾਕਾਂ ਤੱਕ ਸੀਮਤ ਰੱਖੋ।`
    }
  };
  
  // Fallback to English if language not found
  const langInstructions = instructions[complexity][language] || instructions[complexity]['en'];
  return langInstructions;
}

export function enforceResponseLength(
  aiResponse: string,
  maxWords: number,
  language: string
): string {
  const words = aiResponse.split(/\s+/);
  
  // If within limit, return as-is
  if (words.length <= maxWords) {
    return aiResponse;
  }
  
  console.log(`✂️ Truncating response from ${words.length} to ${maxWords} words`);
  
  // Truncate to max words
  const truncated = words.slice(0, maxWords).join(' ');
  
  // Find last complete sentence
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');
  const lastDevanagari = truncated.lastIndexOf('।'); // Hindi/Marathi sentence end
  
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation, lastDevanagari);
  
  if (lastSentenceEnd > 0) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }
  
  // If no sentence end found, add ellipsis
  return truncated + '...';
}
