// ============= QUERY-SPECIFIC PROMPTS (~100 tokens each) =============
// Load only what's needed for the specific query type

interface QueryPromptMap {
  [key: string]: {
    [lang: string]: string;
  };
}

const queryPrompts: QueryPromptMap = {
  watering: {
    hi: `💧 सिंचाई सलाह:
- मिट्टी नमी और फसल अवस्था के अनुसार पानी दें
- ड्रिप/स्प्रिंकलर से 40% पानी बचाएं
- सुबह/शाम सिंचाई करें
- बारिश का पूर्वानुमान देखें
आर्थिक लाभ: ₹ प्रति एकड़ बचत बताएं`,
    mr: `💧 सिंचन सल्ला:
- माती ओलावा आणि पीक अवस्थेनुसार पाणी द्या
- ठिबक/तुषार सिंचनाने 40% पाणी वाचवा
- सकाळी/संध्याकाळी सिंचन करा
आर्थिक फायदा: ₹ प्रति एकर बचत सांगा`,
    en: `💧 Irrigation advice:
- Water based on soil moisture & crop stage
- Save 40% water with drip/sprinkler
- Irrigate morning/evening
- Check rainfall forecast
Include: ₹ savings per acre`
  },

  fertilizer: {
    hi: `🌱 खाद सलाह:
- NPK अनुपात फसल अवस्था के अनुसार
- जैविक + रासायनिक संतुलित उपयोग
- स्प्लिट डोज़ में दें (2-3 बार)
- मिट्टी परीक्षण आधारित
सटीक मात्रा: kg/एकड़, समय, विधि बताएं
खर्च बचत: ₹ प्रति एकड़`,
    mr: `🌱 खत सल्ला:
- NPK प्रमाण पीक अवस्थेनुसार
- सेंद्रिय + रासायनिक संतुलित वापर
- विभाजित मात्रेत द्या (2-3 वेळा)
अचूक प्रमाण: kg/एकर, वेळ, पद्धत सांगा`,
    en: `🌱 Fertilizer advice:
- NPK ratio as per crop stage
- Balanced organic + chemical use
- Split dose application (2-3 times)
Include: kg/acre, timing, method, ₹ cost`
  },

  pest: {
    hi: `🐛 कीड़ा/बीमारी का इलाज:
- पहले देशी तरीका (नीम का पानी, गोमूत्र)
- दुकान की दवा: सही वक्त, सही मात्रा
- एक साथ कई तरीके अपनाओ (IPM)
दवाई: नाम, कितनी/लीटर, कब छिड़को
खर्चा: ₹ प्रति एकड़

📸 जरूरी: फोटो खींचकर दिखाओ इस ऐप से!
मैं देखकर बताऊंगा नक्की कौनसा कीड़ा/बीमारी है और कौनसी दवा लगेगी।
[InstaScan से फोटो लो - अचूक पहचान मिलेगी]`,
    mr: `🐛 कीड/रोग कसा घालवायचा:
- आधी देशी उपाय (निंबोळी पाणी, गोमूत्र)
- दुकानाची दवा: योग्य वेळ, योग्य प्रमाण
- एकत्र अनेक उपाय करा (IPM)
औषध: नाव, किती/लिटर, कधी फवारायचं
खर्च: ₹ प्रति एकर

📸 महत्त्वाचं: पानाचा/पिकाचा फोटो काढा या अॅपमधून!
मी बघून सांगतो नक्की काय झालंय आणि कोणतं औषध लागेल।
[InstaScan ने फोटो घ्या - अचूक ओळख मिळेल]`,
    en: `🐛 How to fix pest/disease:
- First try desi methods (neem water, cow urine)
- Shop medicine: right time, right amount
- Use multiple methods together (IPM)
Medicine: name, how much/litre, when to spray
Cost: ₹ per acre

📸 Important: Take a photo with this app!
I'll see and tell you exactly which pest/disease it is and which medicine to use.
[Use InstaScan for accurate identification]`
  },

  health: {
    hi: `🌿 पिकाची तबियत कैसी है:
- सेटेलाइट (NDVI) से देखो पीक कैसा है
- पत्ते पीले/भूरे हो तो खाद की कमी
- तुरंत इलाज बताओ
पैदावार पर असर: कितना % फर्क पड़ेगा

📸 टिप: पीले/खराब पत्ते का फोटो खींचो इस ऐप से - देखकर बताऊंगा क्या कमी है!`,
    mr: `🌿 पिकाची तब्येत कशी आहे:
- सॅटेलाइट (NDVI) वरून बघा पीक कसं आहे
- पान पिवळं/तपकिरी झालं तर खताची कमतरता
- लगेच इलाज सांगा
उत्पादनावर परिणाम: किती % फरक पडेल

📸 टिप: पिवळं/खराब पान फोटो काढा या अॅपमधून - बघून सांगतो काय कमी आहे!`,
    en: `🌿 How is crop health:
- Check from satellite (NDVI) how crop is doing
- Yellow/brown leaves means nutrient deficiency
- Give immediate treatment
Yield impact: how much % difference

📸 Tip: Take photo of yellow/damaged leaf with this app - I'll tell you what's missing!`
  },

  market: {
    hi: `📊 बाजार सलाह:
- वर्तमान मंडी भाव
- बेचने का सही समय
- भंडारण सुझाव
- MSP तुलना
आय अनुमान: ₹ प्रति क्विंटल, कुल आय`,
    mr: `📊 बाजार सल्ला:
- सध्याचे बाजार भाव
- विक्रीची योग्य वेळ
- साठवणूक सूचना
उत्पन्न अंदाज: ₹ प्रति क्विंटल`,
    en: `📊 Market advice:
- Current mandi prices
- Best time to sell
- Storage suggestions
Include: ₹ per quintal, total income estimate`
  },

  general: {
    hi: `🌾 सामान्य कृषि सहायता:
- संक्षिप्त, सटीक उत्तर दें
- व्यावहारिक सलाह प्राथमिकता
- आर्थिक लाभ शामिल करें
- अगर विकास धीमा हो तो ग्रोथ प्रमोटर सुझाएं`,
    mr: `🌾 सामान्य शेती मदत:
- संक्षिप्त, अचूक उत्तर द्या
- व्यावहारिक सल्ला प्राधान्य
- वाढ कमी असल्यास ग्रोथ प्रमोटर सुचवा`,
    en: `🌾 General agriculture help:
- Brief, accurate answers
- Practical advice priority
- Include economic benefit
- Suggest growth promoters if growth is slow`
  },

  harvest: {
    hi: `🌾 कटाई/नई फसल योजना:
- अगली फसल के लिए मिट्टी तैयारी
- फसल चक्र अपनाएं (दाल के बाद अनाज)
- मौसम के अनुसार फसल चुनें
सुझाव: 3 सर्वोत्तम फसलें, अपेक्षित आय`,
    mr: `🌾 काढणी/नवीन पीक योजना:
- पुढील पिकासाठी माती तयारी
- पीक फेरपालट करा
सूचना: 3 सर्वोत्तम पिके, अपेक्षित उत्पन्न`,
    en: `🌾 Harvest/New crop planning:
- Soil preparation for next crop
- Follow crop rotation
Suggest: 3 best crops, expected income`
  },

  growth: {
    hi: `🟣 विकास/बढ़वार समस्या:
- पौधे का विकास धीमा होने के कारण जांचें
- पोषक तत्व कमी या हार्मोन असंतुलन हो सकता है
- प्राकृतिक ग्रोथ प्रमोटर सुझाएं:
  • जिब्रेलिक एसिड (GA3): 10-25 ppm
  • ह्यूमिक एसिड: 2ml/लीटर
  • समुद्री शैवाल अर्क (Seaweed): 2-3ml/लीटर
- ब्रांड सुझाव: Anshul Crop Booster, Multiplex General, Tapas GA3
खर्च: ₹200-400 प्रति एकड़, उपज वृद्धि: 15-30%`,
    mr: `🟣 वाढ/विकास समस्या:
- वाढ मंद होण्याची कारणे तपासा
- पोषक तत्व कमतरता किंवा हार्मोन असंतुलन असू शकते
- नैसर्गिक ग्रोथ प्रमोटर सुचवा:
  • जिबरेलिक अॅसिड (GA3): 10-25 ppm
  • ह्युमिक अॅसिड: 2ml/लिटर
  • सीव्हीड अर्क: 2-3ml/लिटर
- ब्रँड सूचना: Anshul Crop Booster, Multiplex General
खर्च: ₹200-400 प्रति एकर, उत्पादन वाढ: 15-30%`,
    en: `🟣 Growth/Development issues:
- Check reasons for slow growth
- Could be nutrient deficiency or hormone imbalance
- Suggest natural growth promoters:
  • Gibberellic Acid (GA3): 10-25 ppm
  • Humic Acid: 2ml/litre
  • Seaweed Extract: 2-3ml/litre
- Brand suggestions: Anshul Crop Booster, Multiplex General, Tapas GA3
Cost: ₹200-400 per acre, Yield increase: 15-30%`
  },

  planting: {
    hi: `🌱 बुवाई/रोपाई सलाह:
- सही समय, गहराई, दूरी बताएं
- बीज उपचार (बीजामृत/थीरम)
- मिट्टी तैयारी और खाद मिलाएं
- 🟣 बेहतर अंकुरण के लिए: जिब्रेलिक एसिड (GA3) 50ppm में बीज भिगोएं
- ब्रांड: Anshul GA3, Tapas Gibberellic
अपेक्षित उपज: क्विंटल/एकड़, आय: ₹`,
    mr: `🌱 पेरणी/लावणी सल्ला:
- योग्य वेळ, खोली, अंतर सांगा
- बीज प्रक्रिया (बीजामृत/थायरम)
- माती तयारी आणि खत मिसळा
- 🟣 चांगल्या उगवणीसाठी: GA3 50ppm मध्ये बी भिजवा
अपेक्षित उत्पादन: क्विंटल/एकर, उत्पन्न: ₹`,
    en: `🌱 Planting/Sowing advice:
- Correct timing, depth, spacing
- Seed treatment (Beejamrut/Thiram)
- Soil prep and fertilizer mixing
- 🟣 For better germination: Soak seeds in GA3 50ppm
- Brands: Anshul GA3, Tapas Gibberellic
Expected yield: quintal/acre, income: ₹`
  }
};

export function getQueryPrompt(queryType: string, language: string): string {
  const type = queryType || 'general';
  const prompts = queryPrompts[type] || queryPrompts['general'];
  return prompts[language] || prompts['en'] || prompts['hi'];
}

// Detect query type from user message
export function detectQueryType(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  // Water/irrigation keywords
  if (/पानी|सिंचाई|irrigation|water|पाणी|सिंचन|ਪਾਣੀ|நீர்/.test(lowerMsg)) {
    return 'watering';
  }
  
  // Fertilizer keywords
  if (/खाद|उर्वरक|fertilizer|urea|dap|npk|खत|यूरिया|ਖਾਦ|உரம்/.test(lowerMsg)) {
    return 'fertilizer';
  }
  
  // Pest/disease keywords
  if (/कीट|रोग|pest|disease|insect|fungus|कीड|रोग|ਕੀੜੇ|பூச்சி|spray|छिड़काव|फवारणी/.test(lowerMsg)) {
    return 'pest';
  }
  
  // Health/NDVI keywords
  if (/स्वास्थ्य|health|ndvi|yellow|पीला|सुक|आरोग्य|ਸਿਹਤ/.test(lowerMsg)) {
    return 'health';
  }
  
  // Market keywords
  if (/बाजार|market|price|भाव|बेचना|sell|मंडी|விலை|ਮੰਡੀ/.test(lowerMsg)) {
    return 'market';
  }
  
  // Harvest/new crop keywords
  if (/कटाई|harvest|अगली फसल|next crop|काढणी|नवीन पीक/.test(lowerMsg)) {
    return 'harvest';
  }
  
  // Growth issues keywords (triggers hormone/growth promoter suggestions)
  if (/विकास|growth|बढ़वार|slow|धीमा|मंद|छोटा|small|weak|कमजोर|वाढ|not growing|नहीं बढ़|double|दोगुनी|दुप्पट/.test(lowerMsg)) {
    return 'growth';
  }
  
  // Planting/sowing keywords
  if (/बुवाई|sowing|plant|रोपाई|लगाना|पेरणी|लावणी|बोना|how to grow|कैसे उगाएं|कसे पिकवावे/.test(lowerMsg)) {
    return 'planting';
  }
  
  return 'general';
}
