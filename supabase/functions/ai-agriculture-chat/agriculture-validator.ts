// ============= AGRICULTURE QUERY VALIDATOR =============
// Validates if query is agriculture-related before processing

export interface ValidationResult {
  isAgricultureRelated: boolean;
  confidence: number;
  category: 'crop' | 'soil' | 'weather' | 'pest' | 'fertilizer' | 'irrigation' | 'market' | 'equipment' | 'livestock' | 'general_farming' | 'non_agriculture';
  suggestedResponse?: string;
}

// Agriculture-related keywords in multiple languages
const AGRICULTURE_KEYWORDS = {
  // Crops
  crops: [
    // English
    'crop', 'seed', 'plant', 'harvest', 'yield', 'sow', 'cultivation', 'farming', 'agriculture',
    'wheat', 'rice', 'cotton', 'sugarcane', 'maize', 'corn', 'tomato', 'onion', 'potato', 'vegetable',
    'fruit', 'mango', 'banana', 'grape', 'orange', 'apple', 'soybean', 'groundnut', 'mustard',
    'chilli', 'pepper', 'brinjal', 'cauliflower', 'cabbage', 'spinach', 'okra', 'ladyfinger',
    // Hindi
    'फसल', 'बीज', 'पौधा', 'कटाई', 'उपज', 'बुवाई', 'खेती', 'कृषि',
    'गेहूं', 'धान', 'चावल', 'कपास', 'गन्ना', 'मक्का', 'टमाटर', 'प्याज', 'आलू', 'सब्जी',
    'फल', 'आम', 'केला', 'अंगूर', 'संतरा', 'सेब', 'सोयाबीन', 'मूंगफली', 'सरसों',
    'मिर्च', 'बैंगन', 'फूलगोभी', 'पत्तागोभी', 'पालक', 'भिंडी',
    // Marathi
    'पीक', 'बियाणे', 'रोप', 'कापणी', 'उत्पादन', 'पेरणी', 'शेती',
    'गहू', 'तांदूळ', 'कापूस', 'ऊस', 'मका', 'टोमॅटो', 'कांदा', 'बटाटा', 'भाजी',
    'फळ', 'आंबा', 'केळी', 'द्राक्ष', 'मोसंबी', 'सोयाबीन', 'भुईमूग', 'मोहरी',
    'मिरची', 'वांगे', 'फ्लॉवर', 'कोबी', 'पालक', 'भेंडी'
  ],
  
  // Soil & Land
  soil: [
    'soil', 'land', 'field', 'acre', 'hectare', 'plot', 'farm', 'terrain',
    'clay', 'sandy', 'loam', 'black soil', 'red soil', 'alluvial',
    'ph', 'nitrogen', 'phosphorus', 'potassium', 'npk', 'organic matter',
    'मिट्टी', 'जमीन', 'खेत', 'एकड़', 'हेक्टेयर', 'भूमि',
    'चिकनी', 'रेतीली', 'दोमट', 'काली मिट्टी', 'लाल मिट्टी',
    'माती', 'जमीन', 'शेत', 'काळी माती', 'तांबडी माती'
  ],
  
  // Weather & Climate
  weather: [
    'weather', 'rain', 'rainfall', 'monsoon', 'temperature', 'humidity', 'wind', 'frost', 'heat',
    'forecast', 'climate', 'season', 'kharif', 'rabi', 'zaid', 'summer', 'winter',
    'मौसम', 'बारिश', 'वर्षा', 'मानसून', 'तापमान', 'नमी', 'हवा', 'पाला', 'गर्मी',
    'हवामान', 'पाऊस', 'मान्सून', 'तापमान', 'आर्द्रता', 'वारा', 'थंडी', 'उष्णता'
  ],
  
  // Pests & Diseases
  pest: [
    'pest', 'insect', 'disease', 'fungus', 'bacteria', 'virus', 'weed', 'blight', 'rot',
    'aphid', 'bollworm', 'caterpillar', 'mite', 'whitefly', 'thrips', 'borer',
    'rust', 'mildew', 'wilt', 'mosaic', 'leaf spot', 'root rot',
    'कीड़े', 'कीट', 'रोग', 'फफूंद', 'बीमारी', 'खरपतवार',
    'एफिड', 'इल्ली', 'माहू', 'थ्रिप्स', 'तना छेदक',
    'जंग', 'फफूंदी', 'मुरझान', 'पत्ती धब्बा',
    'किडा', 'कीटक', 'रोग', 'बुरशी', 'आजार', 'तण',
    'मावा', 'अळी', 'गंज', 'करपा', 'मर'
  ],
  
  // Fertilizers & Nutrients
  fertilizer: [
    'fertilizer', 'manure', 'compost', 'urea', 'dap', 'mop', 'npk', 'organic',
    'nutrient', 'nitrogen', 'phosphorus', 'potassium', 'zinc', 'boron', 'calcium',
    'vermicompost', 'bio-fertilizer', 'neem cake', 'cow dung', 'fym',
    'खाद', 'उर्वरक', 'यूरिया', 'डीएपी', 'पोटाश', 'जैविक खाद',
    'गोबर', 'वर्मीकम्पोस्ट', 'नीम खली', 'जीवाणु खाद',
    'खत', 'युरिया', 'सेंद्रिय खत', 'शेणखत', 'गांडूळखत', 'निंबोळी पेंड'
  ],
  
  // Irrigation & Water
  irrigation: [
    'water', 'irrigation', 'drip', 'sprinkler', 'flood', 'canal', 'well', 'bore',
    'pump', 'pipe', 'tank', 'pond', 'river', 'groundwater',
    'पानी', 'सिंचाई', 'ड्रिप', 'स्प्रिंकलर', 'कुआं', 'बोर', 'नहर',
    'पंप', 'पाइप', 'टैंक', 'तालाब', 'नदी', 'भूजल',
    'पाणी', 'सिंचन', 'विहीर', 'बोअर', 'कालवा', 'पंप', 'तलाव'
  ],
  
  // Market & Economics
  market: [
    'price', 'market', 'mandi', 'sell', 'buy', 'profit', 'cost', 'income', 'rate',
    'export', 'import', 'trader', 'middleman', 'msp', 'procurement',
    'भाव', 'बाजार', 'मंडी', 'बेचना', 'खरीदना', 'मुनाफा', 'लागत', 'आमदनी',
    'भाव', 'बाजार', 'मार्केट', 'विकणे', 'खरेदी', 'नफा', 'खर्च', 'उत्पन्न'
  ],
  
  // Equipment & Tools
  equipment: [
    'tractor', 'plough', 'harvester', 'sprayer', 'thresher', 'seed drill',
    'rotavator', 'cultivator', 'trailer', 'implement',
    'ट्रैक्टर', 'हल', 'हार्वेस्टर', 'स्प्रेयर', 'थ्रेशर', 'बीज ड्रिल',
    'ट्रॅक्टर', 'नांगर', 'हार्वेस्टर', 'फवारणी यंत्र', 'मळणी यंत्र'
  ],
  
  // Livestock (related to farming)
  livestock: [
    'cow', 'buffalo', 'goat', 'sheep', 'poultry', 'chicken', 'cattle', 'dairy',
    'milk', 'fodder', 'feed', 'animal husbandry',
    'गाय', 'भैंस', 'बकरी', 'भेड़', 'मुर्गी', 'पशु', 'दूध', 'चारा',
    'गाय', 'म्हैस', 'बकरी', 'मेंढी', 'कोंबडी', 'जनावर', 'दूध', 'चारा'
  ]
};

// Non-agriculture keywords to detect off-topic queries
const NON_AGRICULTURE_KEYWORDS = [
  // Technology/Entertainment
  'movie', 'film', 'song', 'music', 'game', 'cricket', 'football', 'ipl',
  'phone', 'mobile', 'laptop', 'computer', 'internet', 'wifi', 'app',
  'facebook', 'whatsapp', 'instagram', 'youtube', 'tiktok',
  
  // Politics/News
  'election', 'minister', 'government', 'politics', 'party', 'vote',
  'चुनाव', 'मंत्री', 'सरकार', 'राजनीति',
  
  // Personal/Lifestyle
  'love', 'relationship', 'marriage', 'job', 'salary', 'career',
  'health', 'doctor', 'hospital', 'medicine', 'covid',
  'recipe', 'cooking', 'restaurant', 'hotel',
  
  // Finance (non-farm)
  'stock', 'share', 'bitcoin', 'crypto', 'investment', 'mutual fund',
  'loan', 'emi', 'credit card', 'bank account',
  
  // Misc
  'joke', 'story', 'poem', 'riddle', 'puzzle'
];

export function validateAgricultureQuery(
  text: string,
  language: string = 'en'
): ValidationResult {
  const lowerText = text.toLowerCase();
  
  // Check for non-agriculture keywords first
  const nonAgriMatches = NON_AGRICULTURE_KEYWORDS.filter(kw => 
    lowerText.includes(kw.toLowerCase())
  );
  
  // Count agriculture keyword matches per category
  const categoryScores: Record<string, number> = {};
  let totalAgriMatches = 0;
  
  for (const [category, keywords] of Object.entries(AGRICULTURE_KEYWORDS)) {
    const matches = keywords.filter(kw => 
      lowerText.includes(kw.toLowerCase())
    );
    categoryScores[category] = matches.length;
    totalAgriMatches += matches.length;
  }
  
  // Find top category
  const topCategory = Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])[0];
  
  // Calculate confidence
  let confidence = 0;
  let isAgricultureRelated = false;
  let category: ValidationResult['category'] = 'non_agriculture';
  
  if (totalAgriMatches > 0 && nonAgriMatches.length === 0) {
    // Pure agriculture query
    confidence = Math.min(100, 60 + (totalAgriMatches * 10));
    isAgricultureRelated = true;
    category = topCategory[0] as ValidationResult['category'];
  } else if (totalAgriMatches > nonAgriMatches.length * 2) {
    // More agriculture than non-agriculture
    confidence = Math.min(80, 40 + (totalAgriMatches * 5));
    isAgricultureRelated = true;
    category = topCategory[0] as ValidationResult['category'];
  } else if (totalAgriMatches > 0) {
    // Mixed query - might be agriculture related
    confidence = 40;
    isAgricultureRelated = true;
    category = 'general_farming';
  } else if (nonAgriMatches.length > 0) {
    // Clear non-agriculture query
    confidence = 90;
    isAgricultureRelated = false;
    category = 'non_agriculture';
  } else {
    // Ambiguous - could be a greeting or simple query
    // Give benefit of doubt but low confidence
    confidence = 30;
    isAgricultureRelated = true;
    category = 'general_farming';
  }
  
  // Generate suggested response for non-agriculture queries
  let suggestedResponse: string | undefined;
  if (!isAgricultureRelated) {
    suggestedResponse = getNonAgricultureResponse(language);
  }
  
  return {
    isAgricultureRelated,
    confidence,
    category,
    suggestedResponse
  };
}

function getNonAgricultureResponse(language: string): string {
  const responses: Record<string, string> = {
    en: `🌾 I am your AI Agriculture Expert Assistant. I specialize in helping farmers with:

• Crop cultivation & management
• Soil health & fertilizers
• Pest & disease control
• Irrigation & water management
• Weather-based farming advice
• Market prices & selling

Please ask me questions related to farming and agriculture. How can I help with your crops today?`,

    hi: `🌾 मैं आपका AI कृषि विशेषज्ञ सहायक हूं। मैं किसानों की मदद करने में माहिर हूं:

• फसल उगाना और देखभाल
• मिट्टी की सेहत और खाद
• कीड़े और बीमारी नियंत्रण
• सिंचाई और पानी प्रबंधन
• मौसम के अनुसार खेती की सलाह
• बाजार भाव और बिक्री

कृपया खेती से संबंधित सवाल पूछें। आज आपकी फसल में क्या मदद करूं?`,

    mr: `🌾 मी तुमचा AI कृषी तज्ञ सहाय्यक आहे। मी शेतकऱ्यांना मदत करण्यात माहीर आहे:

• पीक लागवड आणि व्यवस्थापन
• माती आरोग्य आणि खते
• किडे आणि रोग नियंत्रण
• सिंचन आणि पाणी व्यवस्थापन
• हवामान आधारित शेती सल्ला
• बाजार भाव आणि विक्री

कृपया शेतीशी संबंधित प्रश्न विचारा. आज तुमच्या पिकाबद्दल काय मदत करू?`,

    pa: `🌾 ਮੈਂ ਤੁਹਾਡਾ AI ਖੇਤੀਬਾੜੀ ਮਾਹਿਰ ਸਹਾਇਕ ਹਾਂ। ਮੈਂ ਕਿਸਾਨਾਂ ਦੀ ਮਦਦ ਕਰਨ ਵਿੱਚ ਮਾਹਿਰ ਹਾਂ:

• ਫਸਲ ਦੀ ਕਾਸ਼ਤ ਅਤੇ ਪ੍ਰਬੰਧਨ
• ਮਿੱਟੀ ਦੀ ਸਿਹਤ ਅਤੇ ਖਾਦ
• ਕੀੜੇ ਅਤੇ ਬਿਮਾਰੀ ਕੰਟਰੋਲ
• ਸਿੰਚਾਈ ਅਤੇ ਪਾਣੀ ਪ੍ਰਬੰਧਨ
• ਮੌਸਮ ਅਧਾਰਿਤ ਖੇਤੀ ਸਲਾਹ

ਕਿਰਪਾ ਕਰਕੇ ਖੇਤੀ ਨਾਲ ਸਬੰਧਤ ਸਵਾਲ ਪੁੱਛੋ।`,

    ta: `🌾 நான் உங்கள் AI வேளாண் நிபுணர் உதவியாளர். நான் விவசாயிகளுக்கு உதவுவதில் நிபுணர்:

• பயிர் சாகுபடி & மேலாண்மை
• மண் ஆரோக்கியம் & உரங்கள்
• பூச்சி & நோய் கட்டுப்பாடு
• நீர்ப்பாசனம் & நீர் மேலாண்மை

தயவுசெய்து விவசாயம் தொடர்பான கேள்விகளை கேளுங்கள்.`
  };
  
  return responses[language] || responses['en'];
}

// Check if query is a simple greeting
export function isGreeting(text: string): boolean {
  const greetings = [
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
    'namaste', 'namaskar', 'jai hind', 'jai kisaan',
    'नमस्ते', 'नमस्कार', 'जय हिंद', 'जय किसान', 'प्रणाम',
    'नमस्कार', 'जय किसान', 'प्रणाम',
    'வணக்கம்', 'నమస్కారం', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ'
  ];
  
  const lowerText = text.toLowerCase().trim();
  return greetings.some(g => lowerText === g || lowerText.startsWith(g + ' '));
}
