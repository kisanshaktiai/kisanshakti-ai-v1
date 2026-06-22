/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED QUERY ROUTER - Production-Grade Intent Classification
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Routes farmer questions to the appropriate handler:
 * 1. STATIC_DATA → Direct DB lookup (crop name, land area, sowing date)
 * 2. PEST_DISEASE_TREATMENT → Full Decision Brain pipeline
 * 3. IRRIGATION_SCHEDULING → Irrigation Decision Module
 * 4. WEATHER_SPRAY_TIMING → Weather API + spray window calculation
 * 5. MARKET_PRICE → Market Intelligence API
 * 6. GENERAL_INFO → LLM Direct with agricultural context
 * 
 * VERSION: 1.0.0 - Production implementation
 */

export type QueryRoute = 
  | 'STATIC_DATA'
  | 'PEST_DISEASE_TREATMENT'
  | 'IRRIGATION_SCHEDULING'
  | 'WEATHER_SPRAY_TIMING'
  | 'MARKET_PRICE'
  | 'GENERAL_INFO'
  | 'FOLLOW_UP'
  | 'GREETING'
  | 'CROP_HEALTH'   // P1-A: "how is my crop" queries
  | 'FERTILIZER_NUTRITION';  // Stage-based fertilizer / preventive spray scheduling (no symptoms)

export interface QueryRoutingResult {
  route: QueryRoute;
  confidence: number;
  detected_entities: {
    crop?: string;
    pest?: string;
    disease?: string;
    symptom?: string;
    action_requested?: string;
  };
  requires_decision_brain: boolean;
  requires_weather_api: boolean;
  requires_market_api: boolean;
  is_follow_up: boolean;
  context_hints: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DEFINITIONS FOR ROUTING
// ═══════════════════════════════════════════════════════════════════════════

// Static data queries (no AI needed)
const STATIC_DATA_PATTERNS = [
  // Land info queries
  /माझ्या जमिनीचे?\s*(क्षेत्रफळ|नाव|area|size)/i,
  /मेरी जमीन.*कितनी/i,
  /my (land|farm|field).*(area|size|name|location)/i,
  /जमीन.*किती\s*(एकर|हेक्टर)/i,
  
  // Crop info queries
  /कोणते\s*पीक\s*(आहे|लावले)/i,
  /कौन\s*सी\s*फसल/i,
  /what\s*(crop|is planted)/i,
  /पीक\s*काय\s*आहे/i,
  
  // Sowing date queries
  /केव्हा\s*(पेरणी|लावणी)/i,
  /कब\s*बुवाई/i,
  /when.*sow/i,
  /पेरणी.*तारीख/i,
  /sowing\s*date/i,
  
  // Days since sowing
  /किती\s*दिवस\s*झाले/i,
  /कितने\s*दिन\s*हुए/i,
  /how\s*many\s*days/i,
  /DAS|days\s*after\s*sowing/i
];

// Pest/Disease treatment (needs Decision Brain)
const PEST_DISEASE_PATTERNS = [
  // CRITICAL: Dying/Dead crop patterns (MUST trigger PEST_DISEASE route)
  /मेला|मेले|मेलेला|मेलेले|मेलेली/i,       // Marathi: "died"
  /मर\s*गय|मर\s*रह|मरने\s*लग/i,            // Hindi: "dying/died"
  /dead|dying|died|kill/i,                    // English: death keywords
  /सुक\s*(गय|रह|ले)|सुखले|सुखलेल/i,         // "dried/drying"
  /जळालेल|जळून|करपले/i,                    // "burned/scorched"
  
  // Pest mentions
  /किडी|किडे|किड|कीड़|कीड|माशी|मावा|इल्ली|अळी|pest|insect|bug|कीट|कीटक/i,
  /whitefly|aphid|borer|thrips|mealybug|jassid/i,
  /पांढर्या?\s*माशी|मावा|तेला|बोरर/i,
  /shoot\s*borer|stem\s*borer|fruit\s*borer|bollworm/i,
  /termite|वाळवी|दीमक/i,
  
  // Romanized pest/disease patterns (Marathi/Hindi in Latin script)
  /kidi|kida|mashi|mava|ali|illi|rog|bimari|upay|ilaj|aushadh|davai/i,
  /favarni|spray|kay karu|kya kare|ilaj karo/i,
  /mela|mele|sukla|sukle|jalla|karpa|tambera/i,
  
  // Disease mentions
  /रोग|बीमारी|disease|infection|बुरशी|फफूंद/i,
  /विल्ट|करपा|ब्लाइट|rust|mildew/i,
  /पानावर\s*डाग|पानी\s*पिवळी/i,
  /leaf\s*(spot|curl|blight)/i,
  
  // Symptom descriptions
  /मधली\s*सुरळी|dead\s*heart|सुरळी.*वाळ/i,
  /पाने?\s*(पिवळ|सुक|वाळ|गळ)/i,
  /पौधा?\s*(मुरझ|सूख)/i,
  /कमकुवत|कमज़ोर|weak/i,
  /holes?\s*in\s*(leaves?|bolls?|fruits?|stem|stalk)/i,
  /wilting|yellowing|drying|rotting/i,
  /खराब|damage|नुकसान/i,
  // Marathi/Hindi symptom descriptions - stem/stalk damage
  /छिद्र|भोक|छेद|खोड.*भोक|खोड.*छिद्र|तना.*छेद/i,
  /खोडात|खोडाला|खोडावर|तना\s*में/i,
  
  // Treatment requests
  /फवारणी|स्प्रे|spray|छिड़काव/i,
  /उपाय|इलाज|treatment|remedy|solution/i,
  /काय\s*करू|क्या\s*करूं|what\s*(should|can|to)\s*do/i,
  /औषध|दवाई|medicine|chemical|pesticide/i
];

// Irrigation queries
const IRRIGATION_PATTERNS = [
  /पाणी|पानी|water|irrigat/i,
  /सिंचाई|ठिबक|drip/i,
  /ओलावा|नमी|moisture/i,
  /केव्हा\s*पाणी|कब\s*पानी|when.*water/i,
  /किती\s*पाणी|कितना\s*पानी|how\s*much\s*water/i,
  /पाणी\s*(द्यायचे|देना|give)/i,
  /water\s*schedule|irrigation\s*plan/i,
  // Romanized irrigation patterns
  /pani|paani|sinchai|thibak|olava|nami/i,
  /kiti pani|kitna pani|pani dyayche|pani dena|pani dya/i
];

// Weather/Spray timing queries
const WEATHER_SPRAY_PATTERNS = [
  /हवामान|मौसम|weather/i,
  /पाऊस|बारिश|rain/i,
  /फवारणी\s*करू\s*का|spray.*when|can\s*i\s*spray/i,
  /आज\s*फवारणी|today.*spray/i,
  /स्प्रे.*टायमिंग|spray.*timing/i,
  /वारा|हवा|wind/i,
  /तापमान|temperature/i,
  /उद्या\s*पाऊस|tomorrow.*rain/i,
  // Romanized weather patterns
  /havaman|mausam|paus|barish|varsha/i,
  /favarni karu ka|spray kadhI|aaj paus/i
];

// Market price queries
const MARKET_PATTERNS = [
  /भाव|किंमत|price|rate|दर/i,
  /विक्री|बेचना|sell/i,
  /मंडी|market|बाजार/i,
  /msp|minimum\s*support/i,
  /किती\s*मिळेल|कितना\s*मिलेगा|how\s*much.*get/i,
  /best\s*time\s*to\s*sell/i,
  // Romanized market patterns
  /bhav|kimmat|vikri|bechna|mandi|bajar|dar/i
];

// Follow-up patterns
const FOLLOW_UP_PATTERNS = [
  /आणखी\s*(काय|माहिती)/i,
  /और\s*(क्या|जानकारी)/i,
  /what\s*else|more\s*(info|options|details)/i,
  /हे\s*केले.*आता\s*काय/i,
  /यह\s*किया.*अब\s*क्या/i,
  /i\s*did\s*(this|that).*now\s*what/i,
  /काम\s*झाले?\s*नाही/i,
  /didn't\s*work|not\s*working/i,
  /alternative|other\s*option/i,
  /दुसरा\s*उपाय|और\s*कोई\s*तरीका/i
];

// Greeting patterns
const GREETING_PATTERNS = [
  /^(नमस्ते|नमस्कार|hello|hi|hey|good\s*(morning|evening|afternoon))$/i,
  /^(जय\s*हिंद|जय\s*श्रीराम|जय\s*जवान)/i,
  // Romanized greetings
  /^(namaste|namaskar|jai hind|jai shriram)$/i
];

// P1-A: Crop Health / Status Check patterns
const CROP_HEALTH_PATTERNS = [
  // Marathi
  /माझे?\s*पीक\s*कसे?\s*(आहे|दिसतंय|दिसतय)/i,
  /पिकाची\s*स्थिती/i,
  /पीक\s*(काय|कशी)\s*आहे/i,
  /पिकाची\s*आरोग्य/i,
  /शेताची?\s*(स्थिती|परिस्थिती)/i,
  /पीक\s*चांगले\s*आहे\s*का/i,
  
  // Hindi  
  /मेर[ाी]\s*फसल\s*कैस[ाी]/i,
  /फसल\s*की\s*स्थिति/i,
  /खेत\s*की\s*(स्थिति|हालत)/i,
  /फसल\s*ठीक\s*है/i,
  
  // English
  /how\s*(is|are)?\s*my\s*(crop|field|farm)/i,
  /crop\s*(status|health|condition)/i,
  /is\s*my\s*crop\s*(ok|fine|healthy|good)/i,
  /check\s*(my)?\s*(crop|field)/i,
  /what('?s)?\s*(the)?\s*crop\s*(status|condition)/i,
  
  // Romanized crop health patterns
  /majhe pik|mera fasal|pik kase|fasal kaisi/i,
  /pik changla ahe ka|fasal theek hai/i,
  /shetat kay challay|khet kaisa hai/i
];

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER / NUTRITION SCHEDULING PATTERNS
// Pure scheduling questions ("which fertilizer / which spray now") — NOT
// symptom reports. Must route to FERTILIZER_NUTRITION, not PEST_DISEASE.
// ═══════════════════════════════════════════════════════════════════════════
const FERTILIZER_NUTRITION_PATTERNS = [
  // Devanagari (Marathi + Hindi)
  /खत|खाद|उर्वरक|पोषण|पोषक|fertili[sz]er|nutrient/i,
  /कोणते?\s*खत|कौन\s*सा\s*खाद|कोणत[ेी]\s*खाद/i,
  /सध्या.*खत|आता.*खत|अभी.*खाद|now.*fertili[sz]er/i,
  /खत\s*(देवू|द्या|द्यायचे|दूं|डालू|डालें|कधी|कब|कोणते|कौनसा)/i,
  /(बेसल|बेसळ|basal|टॉप\s*ड्रेस|top\s*dress|युरिया|urea|डीएपी|DAP|पोटॅश|potash|MOP|एनपीके|NPK)/i,
  // Romanized
  /\bkhat\b|\bkhaad\b|\bkhad\b|\burvarak\b|\bposhan\b/i,
  /khat\s*(devu|dya|kadhi|kab|kontya|kounsa)/i
];

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM TOKENS — actual disease/pest evidence (used to differentiate
// "spray for treatment" from "preventive spray scheduling")
// ═══════════════════════════════════════════════════════════════════════════
const SYMPTOM_TOKENS = [
  // Color / damage
  /पिवळ|पीला|yellow|पान.*रंग|\bpival[ae]?\b|\bpivla\b|\bpila\b/i,
  /डाग|धब्बे|spots?|patches?|lesion|dag\b|dhabbe/i,
  /छिद्र|भोक|छेद|holes?|tunnel/i,
  // Death / wilting
  /मेला|मेले|मरत|मरून|मर\s*गय|मर\s*रह|dead|dying|died|kill/i,
  /सुक|सुख|वाळ|wilt|droop|dried|drying|कोमेज/i,
  /जळ|जळून|करपा|burn|scorched/i,
  // Pests / diseases
  /किडा|किडे|कीट|कीड़|pest|insect|bug|borer|अळी|whitefly|aphid|thrips|mealybug|jassid/i,
  /रोग|बीमारी|disease|fungus|बुरशी|फफूंद|infection|करपा|तांबेरा|rust|mildew|blight|wilt/i,
  /\bkidi\b|\bkida\b|\bali\b|\bmel[ae]\b|\bsukl[ae]\b|\brog\b|\btambera\b|\bkarpa\b/i
];

// Generic "treatment-action" tokens that, on their own (without SYMPTOM_TOKENS),
// are NOT enough to declare a pest/disease problem. They often appear in
// scheduling questions like "now which spray should I take".
const GENERIC_ACTION_TOKENS = [
  /फवारणी|स्प्रे|spray|छिड़काव|favarni/i,
  /काय\s*करू|क्या\s*करूं|what\s*(should|can|to)\s*do/i,
  /उपाय|इलाज|treatment|remedy|solution|upay/i,
  /औषध|दवाई|medicine|chemical|pesticide/i
];

function hasAnySymptomToken(message: string): boolean {
  return SYMPTOM_TOKENS.some(p => p.test(message));
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN ROUTING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function routeQuery(
  message: string, 
  sessionContext?: {
    lastPest?: string;
    lastDisease?: string;
    lastCrop?: string;
    turnCount?: number;
  }
): QueryRoutingResult {
  const normalizedMessage = message.trim().toLowerCase();
  
  // Initialize result
  const result: QueryRoutingResult = {
    route: 'GENERAL_INFO',
    confidence: 0.5,
    detected_entities: {},
    requires_decision_brain: false,
    requires_weather_api: false,
    requires_market_api: false,
    is_follow_up: false,
    context_hints: []
  };
  
  // Priority 1: Check for greetings (highest specificity, lowest priority)
  if (GREETING_PATTERNS.some(p => p.test(normalizedMessage))) {
    result.route = 'GREETING';
    result.confidence = 0.95;
    return result;
  }
  
  // Priority 2: Check for follow-ups (needs session context)
  if (sessionContext?.turnCount && sessionContext.turnCount > 0) {
    if (FOLLOW_UP_PATTERNS.some(p => p.test(message))) {
      result.route = 'FOLLOW_UP';
      result.confidence = 0.85;
      result.is_follow_up = true;
      
      // Inject previous context
      if (sessionContext.lastPest) {
        result.detected_entities.pest = sessionContext.lastPest;
        result.requires_decision_brain = true;
      }
      if (sessionContext.lastDisease) {
        result.detected_entities.disease = sessionContext.lastDisease;
        result.requires_decision_brain = true;
      }
      if (sessionContext.lastCrop) {
        result.detected_entities.crop = sessionContext.lastCrop;
      }
      result.context_hints.push('CONTINUATION_FROM_PREVIOUS');
      return result;
    }
  }
  
  // Priority 3: Static data queries (fastest response, no AI needed)
  const staticScore = countPatternMatches(message, STATIC_DATA_PATTERNS);
  if (staticScore >= 1) {
    result.route = 'STATIC_DATA';
    result.confidence = Math.min(0.95, 0.7 + staticScore * 0.1);
    result.context_hints.push('DB_LOOKUP_ONLY');
    return result;
  }
  
  // Priority 3.5: P1-A Crop Health queries (use land context + NDVI + weather)
  const cropHealthScore = countPatternMatches(message, CROP_HEALTH_PATTERNS);
  if (cropHealthScore >= 1) {
    result.route = 'CROP_HEALTH';
    result.confidence = Math.min(0.95, 0.75 + cropHealthScore * 0.1);
    result.requires_decision_brain = false;  // Use direct NDVI/soil assessment
    result.requires_weather_api = true;
    result.context_hints.push('CROP_HEALTH_ASSESSMENT', 'NDVI_REQUIRED', 'SOIL_REQUIRED');
    return result;
  }
  
  // Priority 3.7: FERTILIZER / NUTRITION scheduling (no symptoms)
  // Farmer asks "what fertilizer/spray to take now" → stage-based plan,
  // NOT a diagnostic pest/disease flow.
  const fertilizerScore = countPatternMatches(message, FERTILIZER_NUTRITION_PATTERNS);
  const hasSymptoms = hasAnySymptomToken(message);
  if (fertilizerScore >= 1 && !hasSymptoms) {
    result.route = 'FERTILIZER_NUTRITION';
    result.confidence = Math.min(0.95, 0.75 + fertilizerScore * 0.1);
    result.requires_decision_brain = true;   // Use symbolic rule engine (FERTILIZER_SCHEDULE rules)
    result.requires_weather_api = true;      // Preventive spray window needs weather
    result.context_hints.push('FERTILIZER_SCHEDULE', 'STAGE_BASED', 'NO_SYMPTOMS');
    return result;
  }

  // Priority 4: Pest/Disease treatment (needs full Decision Brain)
  // GUARD: if the only PEST_DISEASE matches are generic action tokens
  // (spray/उपाय/treatment) and there are NO actual symptom tokens, this is
  // a scheduling request — fall through to fertilizer/general routes.
  const pestDiseaseScore = countPatternMatches(message, PEST_DISEASE_PATTERNS);
  if (pestDiseaseScore >= 1) {
    const genericActionScore = countPatternMatches(message, GENERIC_ACTION_TOKENS);
    const symptomDrivenScore = pestDiseaseScore - genericActionScore;
    const onlyGenericAction = symptomDrivenScore <= 0 && !hasSymptoms;

    if (onlyGenericAction) {
      // Demote: treat as scheduling, not diagnostic.
      if (fertilizerScore >= 1) {
        result.route = 'FERTILIZER_NUTRITION';
        result.confidence = 0.7;
        result.requires_decision_brain = true;
        result.requires_weather_api = true;
        result.context_hints.push('FERTILIZER_SCHEDULE', 'DEMOTED_FROM_PEST_DISEASE');
        return result;
      }
      // No fertilizer hint either — let downstream routes (weather/general) handle it.
    } else {
      result.route = 'PEST_DISEASE_TREATMENT';
      result.confidence = Math.min(0.95, 0.6 + pestDiseaseScore * 0.1);
      result.requires_decision_brain = true;
      result.requires_weather_api = true; // For spray timing

      // Extract entities for context
      result.detected_entities = extractPestDiseaseEntities(message);
      result.context_hints.push('FULL_DECISION_BRAIN_REQUIRED');
      return result;
    }
  }
  
  // Priority 5: Weather/Spray timing
  const weatherScore = countPatternMatches(message, WEATHER_SPRAY_PATTERNS);
  if (weatherScore >= 1) {
    result.route = 'WEATHER_SPRAY_TIMING';
    result.confidence = Math.min(0.95, 0.7 + weatherScore * 0.1);
    result.requires_weather_api = true;
    result.context_hints.push('WEATHER_API_REQUIRED');
    return result;
  }
  
  // Priority 6: Irrigation queries
  const irrigationScore = countPatternMatches(message, IRRIGATION_PATTERNS);
  if (irrigationScore >= 1) {
    result.route = 'IRRIGATION_SCHEDULING';
    result.confidence = Math.min(0.95, 0.7 + irrigationScore * 0.1);
    result.requires_weather_api = true; // For rain forecast
    result.context_hints.push('IRRIGATION_MODULE_REQUIRED');
    return result;
  }
  
  // Priority 7: Market queries
  const marketScore = countPatternMatches(message, MARKET_PATTERNS);
  if (marketScore >= 1) {
    result.route = 'MARKET_PRICE';
    result.confidence = Math.min(0.95, 0.7 + marketScore * 0.1);
    result.requires_market_api = true;
    result.context_hints.push('MARKET_API_REQUIRED');
    return result;
  }
  
  // Default: General info (LLM direct)
  result.route = 'GENERAL_INFO';
  result.confidence = 0.5;
  result.context_hints.push('LLM_DIRECT');
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function countPatternMatches(message: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(message)).length;
}

function extractPestDiseaseEntities(message: string): QueryRoutingResult['detected_entities'] {
  const entities: QueryRoutingResult['detected_entities'] = {};
  
  // Pest extraction
  const pestPatterns: [RegExp, string][] = [
    [/whitefly|पांढर्या?\s*माशी|सफेद\s*मक्खी/i, 'WHITEFLY'],
    [/aphid|मावा|माहू/i, 'APHID'],
    [/shoot\s*borer|शूट\s*बोरर|सुरळी/i, 'SHOOT_BORER'],
    [/stem\s*borer|खोड\s*किडा|तना\s*छेदक/i, 'STEM_BORER'],
    [/bollworm|बोंड\s*अळी|कपास\s*कीट/i, 'BOLLWORM'],
    [/thrips|तुडतुडे|थ्रिप्स/i, 'THRIPS'],
    [/mealybug|ढेकूण|मिलीबग/i, 'MEALYBUG'],
    [/jassid|तेला|हरा\s*तेला/i, 'JASSID'],
    [/armyworm|लष्करी\s*अळी|सेना\s*कीट/i, 'ARMYWORM'],
    [/fall\s*armyworm|FAW|लष्करी/i, 'FALL_ARMYWORM']
  ];
  
  for (const [pattern, code] of pestPatterns) {
    if (pattern.test(message)) {
      entities.pest = code;
      break;
    }
  }
  
  // Disease extraction
  const diseasePatterns: [RegExp, string][] = [
    [/leaf\s*curl|पान\s*वळ|पत्ता\s*मोड/i, 'LEAF_CURL'],
    [/powdery\s*mildew|पांढरी\s*भुकटी|सफेद\s*चूर्ण/i, 'POWDERY_MILDEW'],
    [/downy\s*mildew|मृदुरोमिल/i, 'DOWNY_MILDEW'],
    [/wilt|मर|मुरझा/i, 'WILT'],
    [/root\s*rot|मूळ\s*कुज|जड़\s*सड़न/i, 'ROOT_ROT'],
    [/blight|करपा|झुलसा/i, 'BLIGHT'],
    [/rust|तांबेरा|गेरुई/i, 'RUST'],
    [/anthracnose|अँथ्रॅक्नोज/i, 'ANTHRACNOSE'],
    [/red\s*rot|लाल\s*कुज/i, 'RED_ROT']
  ];
  
  for (const [pattern, code] of diseasePatterns) {
    if (pattern.test(message)) {
      entities.disease = code;
      break;
    }
  }
  
  // Symptom extraction
  const symptomPatterns: [RegExp, string][] = [
    [/dead\s*heart|मधली\s*सुरळी.*वाळ|सुखी\s*सुरळी/i, 'DEAD_HEART'],
    [/yellow.*leaves?|पान.*पिवळ|पत्ते?\s*पील/i, 'YELLOWING'],
    [/wilting|सुक|मुरझ/i, 'WILTING'],
    [/holes?|छिद्र|छेद/i, 'HOLES'],
    [/spots?|डाग|धब्बे/i, 'SPOTS'],
    [/powder|भुकटी|चूर्ण/i, 'POWDER_COATING']
  ];
  
  for (const [pattern, symptom] of symptomPatterns) {
    if (pattern.test(message)) {
      entities.symptom = symptom;
      break;
    }
  }
  
  // Crop extraction
  const cropPatterns: [RegExp, string][] = [
    [/sugarcane|ऊस|गन्ना/i, 'SUGARCANE'],
    [/cotton|कापूस|कपास/i, 'COTTON'],
    [/soybean|सोयाबीन/i, 'SOYBEAN'],
    [/tomato|टोमॅटो|टमाटर/i, 'TOMATO'],
    [/onion|कांदा|प्याज/i, 'ONION'],
    [/chilli|मिरची|मिर्च/i, 'CHILLI'],
    [/rice|भात|धान|चावल/i, 'RICE'],
    [/wheat|गहू|गेहूं/i, 'WHEAT'],
    [/maize|मका|मक्का/i, 'MAIZE']
  ];
  
  for (const [pattern, code] of cropPatterns) {
    if (pattern.test(message)) {
      entities.crop = code;
      break;
    }
  }
  
  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE REQUIREMENT CHECKER
// ═══════════════════════════════════════════════════════════════════════════

export function getRouteRequirements(route: QueryRoute): {
  needs_land_context: boolean;
  needs_weather: boolean;
  needs_soil_data: boolean;
  needs_ndvi: boolean;
  needs_market_data: boolean;
  needs_decision_brain: boolean;
  needs_llm: boolean;
  max_response_time_ms: number;
} {
  switch (route) {
    case 'STATIC_DATA':
      return {
        needs_land_context: true,
        needs_weather: false,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: false,
        max_response_time_ms: 200
      };
    
    case 'PEST_DISEASE_TREATMENT':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: true,
        needs_ndvi: true,
        needs_market_data: false,
        needs_decision_brain: true,
        needs_llm: true,
        max_response_time_ms: 8000
      };
    
    case 'IRRIGATION_SCHEDULING':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: true,
        needs_ndvi: true,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: true,
        max_response_time_ms: 3000
      };
    
    case 'WEATHER_SPRAY_TIMING':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: true,
        max_response_time_ms: 2000
      };
    
    case 'MARKET_PRICE':
      return {
        needs_land_context: true,
        needs_weather: false,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: true,
        needs_decision_brain: false,
        needs_llm: true,
        max_response_time_ms: 3000
      };
    
    case 'FOLLOW_UP':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: true,
        needs_llm: true,
        max_response_time_ms: 5000
      };
    
    case 'GREETING':
      return {
        needs_land_context: false,
        needs_weather: false,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: false,
        max_response_time_ms: 100
      };
    
    // P1-A: Crop Health requires land context, NDVI, soil, but NOT decision brain
    case 'CROP_HEALTH':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: true,
        needs_ndvi: true,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: true,
        max_response_time_ms: 3000
      };

    // FERTILIZER / NUTRITION: stage-based, uses crop_schedules + symbolic rules
    case 'FERTILIZER_NUTRITION':
      return {
        needs_land_context: true,
        needs_weather: true,
        needs_soil_data: true,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: true,
        needs_llm: true,
        max_response_time_ms: 6000
      };

    
    case 'GENERAL_INFO':
    default:
      return {
        needs_land_context: true,
        needs_weather: false,
        needs_soil_data: false,
        needs_ndvi: false,
        needs_market_data: false,
        needs_decision_brain: false,
        needs_llm: true,
        max_response_time_ms: 4000
      };
  }
}

export default routeQuery;
