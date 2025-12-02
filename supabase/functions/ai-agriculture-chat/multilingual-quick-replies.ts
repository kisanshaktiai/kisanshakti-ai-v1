// ============= MULTILINGUAL QUICK REPLIES GENERATOR =============

export interface QuickReplyTemplates {
  watering: string[];
  fertilizer: string[];
  pest: string[];
  health: string[];
  market: string[];
  general: string[];
}

const QUICK_REPLY_TEMPLATES: Record<string, QuickReplyTemplates> = {
  en: {
    watering: ["💧 When to water?", "💦 How much water?", "☁️ Will it rain?", "📅 Next irrigation?"],
    fertilizer: ["🌱 Which fertilizer?", "📊 How much NPK?", "💬 When to apply?", "💰 Fertilizer cost?"],
    pest: ["🐛 Pest control spray?", "🍃 Leaves yellowing?", "🐞 Insects visible?", "💊 Medicine name?"],
    health: ["🌾 Crop condition?", "📈 Growth status?", "🌡️ Temperature OK?", "💧 Soil moisture?"],
    market: ["💰 Today's price?", "📊 When to sell?", "📈 Market trend?", "🚜 Harvest time?"],
    general: ["🌅 What to do today?", "💧 Need watering?", "🌾 How's the crop?", "📅 Next task?"]
  },
  
  hi: {
    watering: ["💧 पानी कब दूं?", "💦 कितना पानी?", "☁️ बारिश आएगी?", "📅 अगली सिंचाई?"],
    fertilizer: ["🌱 कौनसी खाद?", "📊 NPK कितना?", "💬 खाद कब डालें?", "💰 खाद की कीमत?"],
    pest: ["🐛 दवाई छिड़कें?", "🍃 पत्ते पीले हैं?", "🐞 कीड़े दिख रहे?", "💊 दवा का नाम?"],
    health: ["🌾 फसल कैसी है?", "📈 बढ़वार कैसी?", "🌡️ तापमान ठीक?", "💧 मिट्टी में नमी?"],
    market: ["💰 आज का भाव?", "📊 बेचें कब?", "📈 बाजार कैसा?", "🚜 कटाई कब?"],
    general: ["🌅 आज क्या करूं?", "💧 पानी देना है?", "🌾 फसल कैसी है?", "📅 अगला काम?"]
  },
  
  mr: {
    watering: ["💧 पाणी कधी द्यावे?", "💦 किती पाणी?", "☁️ पाऊस येईल का?", "📅 पुढची पाणीपुरवठा?"],
    fertilizer: ["🌱 कोणते खत?", "📊 NPK किती?", "💬 खत कधी टाकावे?", "💰 खताची किंमत?"],
    pest: ["🐛 औषध फवारावे?", "🍃 पाने पिवळी?", "🐞 किडे दिसतात?", "💊 औषधाचे नाव?"],
    health: ["🌾 पीक कसे आहे?", "📈 वाढ कशी?", "🌡️ तापमान ठीक?", "💧 मातीत ओलावा?"],
    market: ["💰 आजचा भाव?", "📊 कधी विकावे?", "📈 बाजार कसा?", "🚜 कापणी कधी?"],
    general: ["🌅 आज काय करावे?", "💧 पाणी द्यावे का?", "🌾 पीक कसे आहे?", "📅 पुढील काम?"]
  },
  
  ta: {
    watering: ["💧 எப்போது நீர்?", "💦 எவ்வளவு நீர்?", "☁️ மழை வருமா?", "📅 அடுத்த நீர்ப்பாசனம்?"],
    fertilizer: ["🌱 எந்த உரம்?", "📊 NPK எவ்வளவு?", "💬 உரம் எப்போது?", "💰 உர விலை?"],
    pest: ["🐛 மருந்து தெளிக்கவா?", "🍃 இலைகள் மஞ்சள்?", "🐞 பூச்சிகள்?", "💊 மருந்து பெயர்?"],
    health: ["🌾 பயிர் நிலை?", "📈 வளர்ச்சி?", "🌡️ வெப்பநிலை சரியா?", "💧 மண் ஈரம்?"],
    market: ["💰 இன்றைய விலை?", "📊 எப்போது விற்க?", "📈 சந்தை நிலை?", "🚜 அறுவடை?"],
    general: ["🌅 இன்று என்ன?", "💧 நீர் தேவையா?", "🌾 பயிர் எப்படி?", "📅 அடுத்த வேலை?"]
  },
  
  te: {
    watering: ["💧 నీరు ఎప్పుడు?", "💦 ఎంత నీరు?", "☁️ వర్షం వస్తుందా?", "📅 తదుపరి నీరు?"],
    fertilizer: ["🌱 ఏ ఎరువు?", "📊 NPK ఎంత?", "💬 ఎరువు ఎప్పుడు?", "💰 ఎరువు ధర?"],
    pest: ["🐛 మందు స్ప్రే?", "🍃 ఆకులు పసుపు?", "🐞 పురుగులు?", "💊 మందు పేరు?"],
    health: ["🌾 పంట స్థితి?", "📈 పెరుగుదల?", "🌡️ ఉష్ణోగ్రత?", "💧 నేల తేమ?"],
    market: ["💰 నేటి ధర?", "📊 ఎప్పుడు అమ్మాలి?", "📈 మార్కెట్?", "🚜 కోత?"],
    general: ["🌅 ఈరోజు ఏమి?", "💧 నీరు కావాలా?", "🌾 పంట ఎలా?", "📅 తదుపరి పని?"]
  },
  
  pa: {
    watering: ["💧 ਪਾਣੀ ਕਦੋਂ?", "💦 ਕਿੰਨਾ ਪਾਣੀ?", "☁️ ਮੀਂਹ ਆਵੇਗਾ?", "📅 ਅਗਲੀ ਸਿੰਚਾਈ?"],
    fertilizer: ["🌱 ਕਿਹੜੀ ਖਾਦ?", "📊 NPK ਕਿੰਨੀ?", "💬 ਖਾਦ ਕਦੋਂ?", "💰 ਖਾਦ ਕੀਮਤ?"],
    pest: ["🐛 ਦਵਾਈ ਛਿੜਕਣੀ?", "🍃 ਪੱਤੇ ਪੀਲੇ?", "🐞 ਕੀੜੇ ਦਿਸਦੇ?", "💊 ਦਵਾਈ ਨਾਮ?"],
    health: ["🌾 ਫਸਲ ਕਿਹੋ ਜਿਹੀ?", "📈 ਵਾਧਾ ਕਿਵੇਂ?", "🌡️ ਤਾਪਮਾਨ ਠੀਕ?", "💧 ਮਿੱਟੀ ਨਮੀ?"],
    market: ["💰 ਅੱਜ ਦਾ ਭਾਅ?", "📊 ਕਦੋਂ ਵੇਚਣਾ?", "📈 ਮੰਡੀ ਕਿਵੇਂ?", "🚜 ਵਾਢੀ ਕਦੋਂ?"],
    general: ["🌅 ਅੱਜ ਕੀ ਕਰਨਾ?", "💧 ਪਾਣੀ ਚਾਹੀਦਾ?", "🌾 ਫਸਲ ਕਿਵੇਂ?", "📅 ਅਗਲਾ ਕੰਮ?"]
  },
  
  gu: {
    watering: ["💧 પાણી ક્યારે?", "💦 કેટલું પાણી?", "☁️ વરસાદ આવશે?", "📅 આગલું સિંચન?"],
    fertilizer: ["🌱 કયું ખાતર?", "📊 NPK કેટલું?", "💬 ખાતર ક્યારે?", "💰 ખાતર કિંમત?"],
    pest: ["🐛 દવા છાંટવી?", "🍃 પાંદડા પીળા?", "🐞 જંતુઓ?", "💊 દવા નામ?"],
    health: ["🌾 પાક કેવો?", "📈 વૃદ્ધિ કેવી?", "🌡️ તાપમાન બરાબર?", "💧 જમીન ભેજ?"],
    market: ["💰 આજનો ભાવ?", "📊 ક્યારે વેચવું?", "📈 બજાર કેવું?", "🚜 કાપણી ક્યારે?"],
    general: ["🌅 આજે શું કરવું?", "💧 પાણી જોઈએ?", "🌾 પાક કેવો છે?", "📅 આગળનું કામ?"]
  },
  
  kn: {
    watering: ["💧 ನೀರು ಯಾವಾಗ?", "💦 ಎಷ್ಟು ನೀರು?", "☁️ ಮಳೆ ಬರುತ್ತದೆಯೇ?", "📅 ಮುಂದಿನ ನೀರಾವರಿ?"],
    fertilizer: ["🌱 ಯಾವ ಗೊಬ್ಬರ?", "📊 NPK ಎಷ್ಟು?", "💬 ಗೊಬ್ಬರ ಯಾವಾಗ?", "💰 ಗೊಬ್ಬರ ಬೆಲೆ?"],
    pest: ["🐛 ಔಷಧ ಸಿಂಪಡಿಸಬೇಕೇ?", "🍃 ಎಲೆಗಳು ಹಳದಿ?", "🐞 ಕೀಟಗಳು?", "💊 ಔಷಧ ಹೆಸರು?"],
    health: ["🌾 ಬೆಳೆ ಸ್ಥಿತಿ?", "📈 ಬೆಳವಣಿಗೆ?", "🌡️ ತಾಪಮಾನ ಸರಿ?", "💧 ಮಣ್ಣು ತೇವ?"],
    market: ["💰 ಇಂದಿನ ಬೆಲೆ?", "📊 ಯಾವಾಗ ಮಾರಾಟ?", "📈 ಮಾರುಕಟ್ಟೆ?", "🚜 ಕೊಯ್ಲು?"],
    general: ["🌅 ಇಂದು ಏನು?", "💧 ನೀರು ಬೇಕೇ?", "🌾 ಬೆಳೆ ಹೇಗಿದೆ?", "📅 ಮುಂದಿನ ಕೆಲಸ?"]
  },
  
  ml: {
    watering: ["💧 വെള്ളം എപ്പോൾ?", "💦 എത്ര വെള്ളം?", "☁️ മഴ വരുമോ?", "📅 അടുത്ത ജലസേചനം?"],
    fertilizer: ["🌱 ഏത് വളം?", "📊 NPK എത്ര?", "💬 വളം എപ്പോൾ?", "💰 വള വില?"],
    pest: ["🐛 മരുന്ന് തളിക്കണോ?", "🍃 ഇലകൾ മഞ്ഞ?", "🐞 പുഴുക്കൾ?", "💊 മരുന്ന് പേര്?"],
    health: ["🌾 വിള നില?", "📈 വളർച്ച?", "🌡️ താപനില ശരിയാണോ?", "💧 മണ്ണ് ഈർപ്പം?"],
    market: ["💰 ഇന്നത്തെ വില?", "📊 എപ്പോൾ വിൽക്കണം?", "📈 കമ്പോളം?", "🚜 വിളവെടുപ്പ്?"],
    general: ["🌅 ഇന്ന് എന്ത്?", "💧 വെള്ളം വേണോ?", "🌾 വിള എങ്ങനെ?", "📅 അടുത്ത ജോലി?"]
  },
  
  bn: {
    watering: ["💧 জল কখন?", "💦 কত জল?", "☁️ বৃষ্টি হবে?", "📅 পরবর্তী সেচ?"],
    fertilizer: ["🌱 কোন সার?", "📊 NPK কত?", "💬 সার কখন?", "💰 সারের দাম?"],
    pest: ["🐛 ওষুধ স্প্রে?", "🍃 পাতা হলুদ?", "🐞 পোকা দেখা যাচ্ছে?", "💊 ওষুধের নাম?"],
    health: ["🌾 ফসলের অবস্থা?", "📈 বৃদ্ধি কেমন?", "🌡️ তাপমাত্রা ঠিক?", "💧 মাটির আর্দ্রতা?"],
    market: ["💰 আজকের দাম?", "📊 কখন বিক্রি?", "📈 বাজার কেমন?", "🚜 ফসল কাটা?"],
    general: ["🌅 আজ কী করব?", "💧 জল লাগবে?", "🌾 ফসল কেমন?", "📅 পরবর্তী কাজ?"]
  },
  
  or: {
    watering: ["💧 ପାଣି କେବେ?", "💦 କେତେ ପାଣି?", "☁️ ବର୍ଷା ହେବ?", "📅 ପରବର୍ତ୍ତୀ ଜଳସେଚନ?"],
    fertilizer: ["🌱 କେଉଁ ସାର?", "📊 NPK କେତେ?", "💬 ସାର କେବେ?", "💰 ସାର ମୂଲ୍ୟ?"],
    pest: ["🐛 ଔଷଧ ସ୍ପ୍ରେ?", "🍃 ପତ୍ର ହଳଦିଆ?", "🐞 କୀଟ?", "💊 ଔଷଧ ନାମ?"],
    health: ["🌾 ଫସଲ ସ୍ଥିତି?", "📈 ବୃଦ୍ଧି?", "🌡️ ତାପମାତ୍ରା ଠିକ୍?", "💧 ମାଟି ଆର୍ଦ୍ରତା?"],
    market: ["💰 ଆଜିର ମୂଲ୍ୟ?", "📊 କେବେ ବିକ୍ରି?", "📈 ବଜାର?", "🚜 ଅମଳ?"],
    general: ["🌅 ଆଜି କଣ?", "💧 ପାଣି ଦରକାର?", "🌾 ଫସଲ କେମିତି?", "📅 ପରବର୍ତ୍ତୀ କାମ?"]
  }
};

export function generateMultilingualQuickReplies(
  queryType: string,
  language: string,
  aiResponse: string = ''
): string[] {
  // Get templates for the specified language, fallback to English
  const templates = QUICK_REPLY_TEMPLATES[language] || QUICK_REPLY_TEMPLATES['en'];
  
  // Determine query type from AI response if not provided
  let detectedType = queryType;
  if (aiResponse) {
    const lowerResponse = aiResponse.toLowerCase();
    if (lowerResponse.includes('water') || lowerResponse.includes('irrigat') || lowerResponse.includes('पानी') || lowerResponse.includes('पाणी')) {
      detectedType = 'watering';
    } else if (lowerResponse.includes('fertilizer') || lowerResponse.includes('खाद') || lowerResponse.includes('खत')) {
      detectedType = 'fertilizer';
    } else if (lowerResponse.includes('pest') || lowerResponse.includes('disease') || lowerResponse.includes('कीड़') || lowerResponse.includes('किडे')) {
      detectedType = 'pest';
    } else if (lowerResponse.includes('health') || lowerResponse.includes('ndvi') || lowerResponse.includes('स्वास्थ्य')) {
      detectedType = 'health';
    } else if (lowerResponse.includes('market') || lowerResponse.includes('price') || lowerResponse.includes('बाज') || lowerResponse.includes('भाव')) {
      detectedType = 'market';
    }
  }
  
  // Return the appropriate quick replies
  return templates[detectedType] || templates['general'];
}
