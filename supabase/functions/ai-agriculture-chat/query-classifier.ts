// ============= SMART QUERY CLASSIFIER =============
// Detects farmer's intent to load only relevant data

export interface QueryIntent {
  type: 'watering' | 'fertilizer' | 'pest' | 'health' | 'market' | 'general';
  confidence: number;
  keywords: string[];
}

const INTENT_PATTERNS = {
  watering: {
    en: ['water', 'irrigation', 'drip', 'sprinkler', 'when to water', 'how much water', 'watering schedule'],
    hi: ['पानी', 'सिंचाई', 'कब पानी', 'पानी देना', 'पानी की जरूरत', 'ड्रिप', 'स्प्रिंकलर'],
    mr: ['पाणी', 'सिंचन', 'कधी पाणी', 'पाणी द्यावे', 'ड्रिप', 'फवारा'],
    ta: ['நீர்', 'நீர்ப்பாசனம', 'எப்போது நீர்', 'தண்ணீர்'],
    te: ['నీరు', 'నీటిపారుదల', 'ఎప్పుడు నీరు'],
    bn: ['জল', 'সেচ', 'কখন জল'],
    gu: ['પાણી', 'સિંચાઈ', 'ક્યારે પાણી'],
    kn: ['ನೀರು', 'ನೀರಾವರಿ', 'ಯಾವಾಗ ನೀರು'],
    pa: ['ਪਾਣੀ', 'ਸਿੰਚਾਈ', 'ਕਦੋਂ ਪਾਣੀ'],
  },
  fertilizer: {
    en: ['fertilizer', 'npk', 'urea', 'dap', 'nutrient', 'manure', 'compost', 'deficiency', 'nitrogen', 'phosphorus', 'potassium'],
    hi: ['खाद', 'उर्वरक', 'यूरिया', 'डीएपी', 'पोषक', 'गोबर', 'कंपोस्ट', 'नाइट्रोजन', 'फास्फोरस'],
    mr: ['खत', 'युरिया', 'डीएपी', 'पोषक', 'शेण', 'कंपोस्ट', 'नायट्रोजन'],
    ta: ['உரம்', 'என்பிகே', 'யூரியா', 'டிஏபி', 'ஊட்டச்சத்து'],
    te: ['ఎరువు', 'ఎన్పీకే', 'యూరియా', 'డిఏపి', 'పోషకాలు'],
    bn: ['সার', 'এনপিকে', 'ইউরিয়া', 'ডিএপি', 'পুষ্টি'],
    gu: ['ખાતર', 'એનપીકે', 'યુરિયા', 'ડીએપી', 'પોષણ'],
    kn: ['ಗೊಬ್ಬರ', 'ಎನ್‌ಪಿಕೆ', 'ಯುರಿಯಾ', 'ಡಿಎಪಿ', 'ಪೋಷಕಾಂಶ'],
    pa: ['ਖਾਦ', 'ਐਨਪੀਕੇ', 'ਯੂਰੀਆ', 'ਡੀਏਪੀ', 'ਪੋਸ਼ਕ'],
  },
  pest: {
    en: ['pest', 'disease', 'insect', 'bug', 'fungus', 'spray', 'pesticide', 'attack', 'damage', 'infestation'],
    hi: ['कीट', 'बीमारी', 'रोग', 'कीड़े', 'फंगस', 'स्प्रे', 'कीटनाशक', 'हमला', 'नुकसान'],
    mr: ['किडे', 'रोग', 'आजार', 'किटक', 'बुरशी', 'फवारणी', 'किटकनाशक', 'हल्ला'],
    ta: ['பூச்சி', 'நோய்', 'தாக்குதல்', 'பூச்சிக்கொல்லி'],
    te: ['చీడపురుగు', 'వ్యాధి', 'దాడి', 'క్రిమి సంహారిణి'],
    bn: ['পোকা', 'রোগ', 'আক্রমণ', 'কীটনাশক'],
    gu: ['જીવાત', 'રોગ', 'હુમલો', 'જંતુનાશક'],
    kn: ['ಕೀಟ', 'ರೋಗ', 'ದಾಳಿ', 'ಕೀಟನಾಶಕ'],
    pa: ['ਕੀੜੇ', 'ਰੋਗ', 'ਹਮਲਾ', 'ਕੀਟਨਾਸ਼ਕ'],
  },
  health: {
    en: ['health', 'condition', 'growth', 'status', 'how is crop', 'crop doing', 'yellowing', 'wilting'],
    hi: ['स्वास्थ्य', 'हालत', 'कैसी है फसल', 'विकास', 'बढ़वार', 'पीली', 'मुरझाना'],
    mr: ['आरोग्य', 'स्थिती', 'पीक कशी आहे', 'वाढ', 'पिवळे', 'कोमेजणे'],
    ta: ['ஆரோக்கியம்', 'நிலை', 'பயிர் எப்படி', 'வளர்ச்சி'],
    te: ['ఆరోగ్యం', 'స్థితి', 'పంట ఎలా ఉంది', 'పెరుగుదల'],
    bn: ['স্বাস্থ্য', 'অবস্থা', 'ফসল কেমন', 'বৃদ্ধি'],
    gu: ['આરોગ્ય', 'સ્થિતિ', 'પાક કેવો છે', 'વૃદ્ધિ'],
    kn: ['ಆರೋಗ್ಯ', 'ಸ್ಥಿತಿ', 'ಬೆಳೆ ಹೇಗಿದೆ', 'ಬೆಳವಣಿಗೆ'],
    pa: ['ਸਿਹਤ', 'ਸਥਿਤੀ', 'ਫਸਲ ਕਿਵੇਂ ਹੈ', 'ਵਾਧਾ'],
  },
  market: {
    en: ['price', 'market', 'yield', 'income', 'profit', 'sell', 'revenue', 'demand'],
    hi: ['कीमत', 'बाजार', 'भाव', 'उपज', 'कमाई', 'आमदनी', 'बेचना', 'मांग'],
    mr: ['किंमत', 'बाजार', 'भाव', 'उत्पन्न', 'कमाई', 'विक्री', 'मागणी'],
    ta: ['விலை', 'சந்தை', 'விளைச்சல்', 'வருமானம்', 'விற்பனை'],
    te: ['ధర', 'మార్కెట్', 'దిగుబడి', 'ఆదాయం', 'అమ్మకం'],
    bn: ['দাম', 'বাজার', 'ফলন', 'আয়', 'বিক্রয়'],
    gu: ['કિંમત', 'બજાર', 'ઉપજ', 'આવક', 'વેચાણ'],
    kn: ['ಬೆಲೆ', 'ಮಾರುಕಟ್ಟೆ', 'ಇಳುವರಿ', 'ಆದಾಯ', 'ಮಾರಾಟ'],
    pa: ['ਕੀਮਤ', 'ਮਾਰਕੀਟ', 'ਪੈਦਾਵਾਰ', 'ਆਮਦਨ', 'ਵਿਕਰੀ'],
  },
  general: {
    en: ['hello', 'hi', 'namaste', 'help', 'what can you do', 'who are you'],
    hi: ['नमस्ते', 'हेलो', 'हाय', 'मदद', 'आप कौन हैं', 'आप क्या कर सकते हैं'],
    mr: ['नमस्कार', 'हॅलो', 'मदत', 'तुम्ही कोण', 'काय करू शकता'],
    ta: ['வணக்கம்', 'ஹலோ', 'உதவி', 'நீங்கள் யார்'],
    te: ['నమస్కారం', 'హలో', 'సహాయం', 'మీరు ఎవరు'],
    bn: ['নমস্কার', 'হ্যালো', 'সাহায্য', 'আপনি কে'],
    gu: ['નમસ્તે', 'હેલો', 'મદદ', 'તમે કોણ છો'],
    kn: ['ನಮಸ್ಕಾರ', 'ಹಲೋ', 'ಸಹಾಯ', 'ನೀವು ಯಾರು'],
    pa: ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'ਹੈਲੋ', 'ਮਦਦ', 'ਤੁਸੀਂ ਕੌਣ ਹੋ'],
  }
};

export function classifyFarmerQuery(text: string, language: string = 'en'): QueryIntent {
  const normalizedText = text.toLowerCase();
  const scores: Record<string, number> = {
    watering: 0,
    fertilizer: 0,
    pest: 0,
    health: 0,
    market: 0,
    general: 0
  };
  
  // Score each intent type based on keyword matches
  for (const [intentType, langPatterns] of Object.entries(INTENT_PATTERNS)) {
    const patterns = langPatterns[language as keyof typeof langPatterns] || langPatterns.en;
    
    for (const keyword of patterns) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        scores[intentType] += 1;
      }
    }
  }
  
  // Find highest scoring intent
  let maxScore = 0;
  let detectedType: QueryIntent['type'] = 'general';
  const matchedKeywords: string[] = [];
  
  for (const [intentType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = intentType as QueryIntent['type'];
    }
  }
  
  // Collect matched keywords for logging
  if (detectedType !== 'general') {
    const patterns = INTENT_PATTERNS[detectedType][language as keyof typeof INTENT_PATTERNS.watering] || 
                    INTENT_PATTERNS[detectedType].en;
    for (const keyword of patterns) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }
  }
  
  // Calculate confidence (0-1 scale)
  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1) : 0.1;
  
  return {
    type: detectedType,
    confidence,
    keywords: matchedKeywords
  };
}
