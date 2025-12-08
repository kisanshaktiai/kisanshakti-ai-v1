import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id",
};

// ═══════════════════════════════════════════════════════════════════════
// FARMING STAGES - 9 Sequential Stages (fetched from DB at runtime)
// ═══════════════════════════════════════════════════════════════════════
interface FarmingStage {
  id: string;
  stage_key: string;
  stage_name: string;
  stage_description: string;
  stage_icon: string;
  stage_order: number;
}

// Yield boosting techniques per stage (3x-7x yield potential)
const YIELD_BOOST_TECHNIQUES: Record<string, {
  techniques: string[];
  yieldImpact: string;
  skipPenalty: string;
}> = {
  planning: {
    techniques: ["High-yielding certified seed selection", "Soil test-based planning", "Optimal sowing window calculation"],
    yieldImpact: "Foundation for 3x-7x yield - wrong variety can waste entire season",
    skipPenalty: "50% yield loss risk with wrong variety/timing",
  },
  land_preparation: {
    techniques: ["Deep plowing 25-30cm for root development", "FYM/compost 5-10 tons/acre", "Soil pH correction with lime/gypsum", "Green manure incorporation"],
    yieldImpact: "30% yield boost from improved soil structure & fertility",
    skipPenalty: "Poor root development, nutrient lockout, 20-30% yield loss",
  },
  sowing: {
    techniques: ["Optimal seed rate (not over/under)", "Correct spacing for light & air", "Seed treatment with Trichoderma/Rhizobium", "Line sowing for intercultural ops"],
    yieldImpact: "25% yield boost from proper plant population & treated seeds",
    skipPenalty: "Uneven crop stand, disease entry, 15-25% yield loss",
  },
  germination: {
    techniques: ["Gap filling within 7-10 days", "Bird scaring devices", "Moisture conservation mulching", "Early pest scouting"],
    yieldImpact: "15% yield protection through uniform crop establishment",
    skipPenalty: "Uneven stand, pest damage, 10-20% yield loss",
  },
  vegetative_growth: {
    techniques: ["Split nitrogen application (30% basal, 40% tillering, 30% panicle)", "Growth promoters (seaweed/humic acid)", "Timely weeding before 25 DAS", "Micronutrient sprays (Zn/Fe)"],
    yieldImpact: "40% yield boost from optimized nutrition & weed-free crop",
    skipPenalty: "Stunted growth, weed competition, 30-40% yield loss",
  },
  reproductive: {
    techniques: ["Micronutrient spray (Boron/Zinc) at flowering", "IPM-based pest monitoring", "Optimal irrigation at critical stage", "Growth regulators for fruit set"],
    yieldImpact: "35% yield boost from maximum flower/fruit retention",
    skipPenalty: "Flower drop, poor grain filling, 25-40% yield loss",
  },
  maturity: {
    techniques: ["Stop irrigation 15-20 days before harvest", "Monitor grain moisture (20-22%)", "Potash spray for grain filling", "Disease prevention for storage quality"],
    yieldImpact: "20% yield boost from proper grain filling & quality",
    skipPenalty: "Shriveled grains, low test weight, 15-20% yield loss",
  },
  harvest: {
    techniques: ["Harvest at optimal moisture (14-18%)", "Minimize shattering losses", "Timely cutting before over-ripening", "Clean harvesting equipment"],
    yieldImpact: "15% yield protection through loss prevention",
    skipPenalty: "Shattering, spoilage, 10-20% harvest loss",
  },
  post_harvest: {
    techniques: ["Proper sun drying to 12-13% moisture", "Grading for premium price", "Scientific storage (fumigation)", "Market timing for best price"],
    yieldImpact: "25% income boost through quality & market timing",
    skipPenalty: "Storage loss, low price, 20-30% income loss",
  },
  fallow_restoration: {
    techniques: ["Green manuring with Dhaincha/Sunhemp", "Crop rotation planning", "Soil testing for next crop", "Deep plowing for aeration", "Organic matter incorporation"],
    yieldImpact: "20-30% yield boost in next crop through soil health restoration",
    skipPenalty: "Soil degradation, nutrient depletion, reduced yield potential in subsequent crops",
  },
};

// Stage to category mapping
const STAGE_CATEGORY_MAP: Record<string, string[]> = {
  planning: ["planning", "other"],
  land_preparation: ["land_preparation", "organic_input"],
  sowing: ["seed_treatment", "sowing", "transplanting"],
  germination: ["irrigation", "other"],
  vegetative_growth: ["growth_promoter", "fertilizer", "weeding", "irrigation", "intercultural"],
  reproductive: ["pest_control", "disease_control", "fertilizer", "irrigation"],
  maturity: ["irrigation", "fertilizer", "disease_control"],
  harvest: ["harvest"],
  post_harvest: ["post_harvest", "other"],
  fallow_restoration: ["land_preparation", "organic_input", "other"],
};

// ═══════════════════════════════════════════════════════════════════════
// LANGUAGE MAPPING & RURAL DIALECT DICTIONARY
// ═══════════════════════════════════════════════════════════════════════
const LANGUAGES: Record<string, string> = {
  hi: "Hindi", mr: "Marathi", pa: "Punjabi", ta: "Tamil",
  te: "Telugu", bn: "Bengali", gu: "Gujarati", kn: "Kannada", en: "English",
};

// Rural village language dictionary - DO NOT use formal/English terms
const RURAL_TERMS: Record<string, Record<string, string>> = {
  hi: {
    fertilizer: "खाद", urea: "यूरिया खाद", dap: "डीएपी खाद", 
    irrigation: "पानी देना", pesticide: "कीड़े की दवा", fungicide: "फफूंद की दवा",
    spray: "छिड़काव", sowing: "बुवाई/बीज बोना", weeding: "निराई-गुड़ाई",
    harvesting: "कटाई", transplanting: "रोपाई", seeds: "बीज", seedlings: "पौधे/रोपे",
    organic: "देसी/जैविक", fym: "गोबर की खाद/सड़ी खाद", vermicompost: "केंचुआ खाद",
    neem: "नीम का तेल", soil: "मिट्टी", water: "पानी", field: "खेत",
    morning: "सुबह जल्दी", evening: "शाम को", sunlight: "धूप", rain: "बारिश",
    growth: "बढ़वार", pest: "कीड़े-मकोड़े", disease: "बीमारी/रोग",
    labor: "मजदूरी", cost: "खर्चा", yield: "पैदावार", profit: "मुनाफा",
    stage: "चरण", planning: "योजना", preparation: "तैयारी",
  },
  mr: {
    fertilizer: "खत", urea: "युरिया खत", dap: "डीएपी खत",
    irrigation: "पाणी देणे", pesticide: "किडीची औषध", fungicide: "बुरशीची औषध",
    spray: "फवारणी", sowing: "पेरणी", weeding: "निंदणी/खुरपणी",
    harvesting: "कापणी", transplanting: "लागवड/रोपणी", seeds: "बियाणे", seedlings: "रोपे",
    organic: "सेंद्रिय/देशी", fym: "शेणखत/गोठ्याचे खत", vermicompost: "गांडूळ खत",
    neem: "कडुनिंबाचे तेल", soil: "माती/जमीन", water: "पाणी", field: "शेत",
    morning: "सकाळी लवकर", evening: "संध्याकाळी", sunlight: "ऊन", rain: "पाऊस",
    growth: "वाढ", pest: "किडी", disease: "रोग",
    labor: "मजुरी", cost: "खर्च", yield: "उत्पादन", profit: "नफा",
    stage: "टप्पा", planning: "नियोजन", preparation: "तयारी",
  },
  pa: {
    fertilizer: "ਖਾਦ", urea: "ਯੂਰੀਆ ਖਾਦ", dap: "ਡੀਏਪੀ ਖਾਦ",
    irrigation: "ਪਾਣੀ ਦੇਣਾ", pesticide: "ਕੀੜੇ ਦੀ ਦਵਾਈ", fungicide: "ਫੰਗਸ ਦੀ ਦਵਾਈ",
    spray: "ਸਪਰੇਅ", sowing: "ਬਿਜਾਈ", weeding: "ਗੋਡਾਈ/ਨਦੀਨ ਕੱਢਣਾ",
    harvesting: "ਵਾਢੀ", transplanting: "ਲਾਉਣਾ", seeds: "ਬੀਜ", seedlings: "ਬੂਟੇ",
    organic: "ਦੇਸੀ/ਜੈਵਿਕ", fym: "ਰੂੜੀ ਦੀ ਖਾਦ", vermicompost: "ਕੀੜੇ ਦੀ ਖਾਦ",
    neem: "ਨਿੰਮ ਦਾ ਤੇਲ", soil: "ਮਿੱਟੀ", water: "ਪਾਣੀ", field: "ਖੇਤ",
    morning: "ਸਵੇਰੇ", evening: "ਸ਼ਾਮੀਂ", sunlight: "ਧੁੱਪ", rain: "ਮੀਂਹ",
    growth: "ਵਾਧਾ", pest: "ਕੀੜੇ", disease: "ਬਿਮਾਰੀ/ਰੋਗ",
    labor: "ਮਜ਼ਦੂਰੀ", cost: "ਖਰਚਾ", yield: "ਝਾੜ", profit: "ਮੁਨਾਫ਼ਾ",
    stage: "ਪੜਾਅ", planning: "ਯੋਜਨਾ", preparation: "ਤਿਆਰੀ",
  },
  ta: {
    fertilizer: "உரம்", urea: "யூரியா உரம்", dap: "டிஏபி உரம்",
    irrigation: "தண்ணீர் பாய்ச்சுதல்", pesticide: "பூச்சிக்கொல்லி", fungicide: "பூஞ்சாணக்கொல்லி",
    spray: "தெளிப்பு", sowing: "விதைப்பு", weeding: "களை எடுத்தல்",
    harvesting: "அறுவடை", transplanting: "நடவு", seeds: "விதைகள்", seedlings: "நாற்றுகள்",
    organic: "இயற்கை", fym: "சாணம்/தொழுவுரம்", vermicompost: "மண்புழு உரம்",
    neem: "வேப்பெண்ணெய்", soil: "மண்", water: "தண்ணீர்", field: "வயல்",
    morning: "காலையில்", evening: "மாலையில்", sunlight: "வெயில்", rain: "மழை",
    growth: "வளர்ச்சி", pest: "பூச்சிகள்", disease: "நோய்",
    labor: "கூலி", cost: "செலவு", yield: "மகசூல்", profit: "லாபம்",
    stage: "நிலை", planning: "திட்டமிடல்", preparation: "தயாரிப்பு",
  },
  te: {
    fertilizer: "ఎరువు", urea: "యూరియా ఎరువు", dap: "డీఏపీ ఎరువు",
    irrigation: "నీరు పెట్టడం", pesticide: "పురుగుల మందు", fungicide: "తెగులు మందు",
    spray: "పిచికారీ", sowing: "విత్తనం వేయడం", weeding: "కలుపు తీయడం",
    harvesting: "కోత", transplanting: "నాట్లు వేయడం", seeds: "విత్తనాలు", seedlings: "మొక్కలు",
    organic: "సేంద్రియ/దేశీ", fym: "పశువుల పేడ/పెంట ఎరువు", vermicompost: "వర్మీ కంపోస్ట్",
    neem: "వేప నూనె", soil: "నేల/మట్టి", water: "నీరు", field: "పొలం",
    morning: "పొద్దున", evening: "సాయంత్రం", sunlight: "ఎండ", rain: "వర్షం",
    growth: "పెరుగుదల", pest: "పురుగులు", disease: "తెగులు/వ్యాధి",
    labor: "కూలి", cost: "ఖర్చు", yield: "దిగుబడి", profit: "లాభం",
    stage: "దశ", planning: "ప్రణాళిక", preparation: "సన్నాహం",
  },
  bn: {
    fertilizer: "সার", urea: "ইউরিয়া সার", dap: "ডিএপি সার",
    irrigation: "জল দেওয়া/সেচ", pesticide: "কীটনাশক", fungicide: "ছত্রাকনাশক",
    spray: "স্প্রে/ছিটানো", sowing: "বপন", weeding: "আগাছা তোলা",
    harvesting: "ফসল কাটা", transplanting: "রোপণ", seeds: "বীজ", seedlings: "চারা",
    organic: "জৈব/দেশী", fym: "গোবর সার", vermicompost: "কেঁচো সার",
    neem: "নিম তেল", soil: "মাটি", water: "জল", field: "জমি/ক্ষেত",
    morning: "সকালে", evening: "সন্ধ্যায়", sunlight: "রোদ", rain: "বৃষ্টি",
    growth: "বৃদ্ধি", pest: "পোকামাকড়", disease: "রোগ",
    labor: "মজুরি", cost: "খরচ", yield: "ফলন", profit: "লাভ",
    stage: "পর্যায়", planning: "পরিকল্পনা", preparation: "প্রস্তুতি",
  },
  gu: {
    fertilizer: "ખાતર", urea: "યુરિયા ખાતર", dap: "ડીએપી ખાતર",
    irrigation: "પાણી આપવું", pesticide: "જીવાતની દવા", fungicide: "ફૂગની દવા",
    spray: "છંટકાવ", sowing: "વાવણી", weeding: "નીંદામણ",
    harvesting: "લણણી", transplanting: "રોપણી", seeds: "બીજ", seedlings: "રોપા",
    organic: "જૈવિક/દેશી", fym: "છાણીયું ખાતર", vermicompost: "અળસિયાનું ખાતર",
    neem: "લીમડાનું તેલ", soil: "માટી/જમીન", water: "પાણી", field: "ખેતર",
    morning: "સવારે", evening: "સાંજે", sunlight: "તડકો", rain: "વરસાદ",
    growth: "વૃદ્ધિ", pest: "જીવાત", disease: "રોગ",
    labor: "મજૂરી", cost: "ખર્ચ", yield: "ઉત્પાદન", profit: "નફો",
    stage: "તબક્કો", planning: "આયોજન", preparation: "તૈયારી",
  },
  kn: {
    fertilizer: "ಗೊಬ್ಬರ", urea: "ಯೂರಿಯಾ ಗೊಬ್ಬರ", dap: "ಡಿಎಪಿ ಗೊಬ್ಬರ",
    irrigation: "ನೀರು ಕೊಡುವುದು", pesticide: "ಕೀಟನಾಶಕ", fungicide: "ಶಿಲೀಂಧ್ರನಾಶಕ",
    spray: "ಸಿಂಪಡಣೆ", sowing: "ಬಿತ್ತನೆ", weeding: "ಕಳೆ ಕೀಳುವುದು",
    harvesting: "ಕೊಯ್ಲು", transplanting: "ನಾಟಿ", seeds: "ಬೀಜಗಳು", seedlings: "ಸಸಿಗಳು",
    organic: "ಸಾವಯವ/ದೇಸಿ", fym: "ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ", vermicompost: "ಎರೆಹುಳು ಗೊಬ್ಬರ",
    neem: "ಬೇವಿನ ಎಣ್ಣೆ", soil: "ಮಣ್ಣು", water: "ನೀರು", field: "ಹೊಲ",
    morning: "ಬೆಳಗ್ಗೆ", evening: "ಸಂಜೆ", sunlight: "ಬಿಸಿಲು", rain: "ಮಳೆ",
    growth: "ಬೆಳವಣಿಗೆ", pest: "ಕೀಟಗಳು", disease: "ರೋಗ",
    labor: "ಕೂಲಿ", cost: "ವೆಚ್ಚ", yield: "ಇಳುವರಿ", profit: "ಲಾಭ",
    stage: "ಹಂತ", planning: "ಯೋಜನೆ", preparation: "ತಯಾರಿ",
  },
  en: {
    fertilizer: "manure/fertilizer", urea: "urea", dap: "DAP",
    irrigation: "watering", pesticide: "pest medicine", fungicide: "disease medicine",
    spray: "spraying", sowing: "sowing", weeding: "weeding",
    harvesting: "harvesting", transplanting: "transplanting", seeds: "seeds", seedlings: "seedlings",
    organic: "organic/natural", fym: "farmyard manure", vermicompost: "vermicompost",
    neem: "neem oil", soil: "soil", water: "water", field: "field",
    morning: "early morning", evening: "evening", sunlight: "sunlight", rain: "rain",
    growth: "growth", pest: "pests", disease: "disease",
    labor: "labor", cost: "cost", yield: "yield", profit: "profit",
    stage: "stage", planning: "planning", preparation: "preparation",
  },
};

// ═══════════════════════════════════════════════════════════════════════
// REGIONAL DIALECT MAPPING (Maharashtra Districts)
// For words that vary by region, we show both terms: "Local/General"
// ═══════════════════════════════════════════════════════════════════════
const MAHARASHTRA_REGIONS: Record<string, string[]> = {
  vidarbha: ["Nagpur", "Amravati", "Akola", "Yavatmal", "Chandrapur", "Wardha", "Bhandara", "Gondia", "Gadchiroli", "Buldhana", "Washim"],
  marathwada: ["Aurangabad", "Chhatrapati Sambhaji Nagar", "Latur", "Osmanabad", "Dharashiv", "Nanded", "Beed", "Parbhani", "Jalna", "Hingoli"],
  western_maha: ["Pune", "Kolhapur", "Sangli", "Satara", "Solapur"],
  konkan: ["Mumbai", "Thane", "Raigad", "Ratnagiri", "Sindhudurg", "Palghar"],
  north_maha: ["Nashik", "Jalgaon", "Dhule", "Nandurbar", "Ahmednagar"],
  khandesh: ["Jalgaon", "Dhule", "Nandurbar"],
};

const REGIONAL_TERMS: Record<string, Record<string, Record<string, string>>> = {
  mr: {
    vidarbha: {
      weeding: "निंदणी",
      irrigation: "पाणी देणे",
      harvesting: "कापणी",
      fertilizer: "खत/खाद",
      sowing: "पेरणी",
      transplanting: "लागवड",
    },
    western_maha: {
      weeding: "खुरपणी/काट काढणे",
      irrigation: "पाणी सोडणे",
      harvesting: "काढणी",
      fertilizer: "खत",
      sowing: "पेरणी",
      transplanting: "रोपणी",
    },
    marathwada: {
      weeding: "खोदणी/निवडणी",
      irrigation: "ओलित करणे",
      harvesting: "कापणी",
      fertilizer: "खत",
      sowing: "पेरणी",
      transplanting: "लागवड",
    },
    konkan: {
      weeding: "निंदणी",
      irrigation: "पाणी घालणे",
      harvesting: "काढणी",
      fertilizer: "खत",
      sowing: "पेरणी",
      transplanting: "रोपणे",
    },
    north_maha: {
      weeding: "खुरपणी",
      irrigation: "पाणी देणे",
      harvesting: "कापणी",
      fertilizer: "खत",
      sowing: "पेरणी",
      transplanting: "लावणी",
    },
    khandesh: {
      weeding: "निंदाई",
      irrigation: "पाणी देणं",
      harvesting: "कापणी",
      fertilizer: "खत",
      sowing: "पेरणी",
      transplanting: "लावणी",
    },
  },
};

function getRegionFromDistrict(district: string, state: string): string {
  if (state?.toLowerCase() !== "maharashtra") return "default";
  
  const districtLower = district?.toLowerCase() || "";
  
  for (const [region, districts] of Object.entries(MAHARASHTRA_REGIONS)) {
    if (districts.some(d => districtLower.includes(d.toLowerCase()))) {
      return region;
    }
  }
  return "western_maha"; // Default for Maharashtra
}

function getRegionalDialectTerms(language: string, region: string): Record<string, string> {
  const regionalTerms = REGIONAL_TERMS[language]?.[region];
  const baseTerms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
  
  if (!regionalTerms) return baseTerms;
  
  // Merge regional terms with base terms
  return { ...baseTerms, ...regionalTerms };
}

function buildRegionalLanguageRules(language: string, region: string, district: string): string {
  if (language !== "mr" || !REGIONAL_TERMS[language]?.[region]) {
    return "";
  }
  
  const regionalTerms = REGIONAL_TERMS[language][region];
  const baseTerms = RURAL_TERMS[language];
  
  const termMappings: string[] = [];
  for (const [key, localTerm] of Object.entries(regionalTerms)) {
    const generalTerm = baseTerms[key];
    if (localTerm !== generalTerm) {
      termMappings.push(`${key}: "${localTerm}/${generalTerm}" (use local term first)`);
    }
  }
  
  if (termMappings.length === 0) return "";
  
  return `
═══════════════════════════════════════════════════════════════
📍 REGIONAL DIALECT ADAPTATION (${district}, ${region.replace("_", " ").toUpperCase()})
═══════════════════════════════════════════════════════════════
For agricultural terms with regional variations, show BOTH terms:
${termMappings.join("\n")}

Example output: "खुरपणी/निंदणी करा" (shows local term first, then general term)
This helps farmers from different areas understand the content.
`;
}

// ═══════════════════════════════════════════════════════════════════════
// STATE-WISE LABOR RATES (MGNREGA 2024-25 Daily Wages in ₹) - UPDATED
// Source: Ministry of Rural Development, Govt of India
// ═══════════════════════════════════════════════════════════════════════
const STATE_LABOR_RATES: Record<string, number> = {
  "Maharashtra": 310, "Madhya Pradesh": 243, "Karnataka": 349, "Haryana": 374,
  "Punjab": 321, "Gujarat": 311, "Rajasthan": 266, "Uttar Pradesh": 237,
  "Bihar": 245, "Tamil Nadu": 311, "Andhra Pradesh": 300, "Telangana": 300,
  "Kerala": 352, "West Bengal": 237, "Odisha": 237, "Jharkhand": 237,
  "Chhattisgarh": 243, "Assam": 238, "Himachal Pradesh": 266, "Uttarakhand": 237,
  "Jammu and Kashmir": 266, "Goa": 350, "default": 290,
};

// ═══════════════════════════════════════════════════════════════════════
// ORGANIC INPUTS PRICES (2024-25 Indian Market Rates) - UPDATED
// Source: IFFCO, Coromandel, Local Agri-input dealers
// ═══════════════════════════════════════════════════════════════════════
const ORGANIC_INPUTS: Record<string, { price: number; unit: string; coverage_acre: number; benefit: string }> = {
  fym: { price: 1200, unit: "1 ton", coverage_acre: 1, benefit: "Improves soil structure & fertility" },
  vermicompost: { price: 12, unit: "per kg", coverage_acre: 0.02, benefit: "Rich in nutrients & microbes" },
  jeevamrut: { price: 80, unit: "per batch (200L)", coverage_acre: 1, benefit: "Soil microbial activator" },
  panchagavya: { price: 150, unit: "per batch", coverage_acre: 1, benefit: "Growth promoter & immunity" },
  neem_cake: { price: 32, unit: "per kg", coverage_acre: 0.01, benefit: "Pest repellent & nitrogen source" },
  neem_oil: { price: 380, unit: "per liter", coverage_acre: 1, benefit: "Organic pesticide" },
  trichoderma: { price: 280, unit: "per kg", coverage_acre: 1, benefit: "Fungal disease control" },
  pseudomonas: { price: 320, unit: "per kg", coverage_acre: 1, benefit: "Root disease control" },
  beauveria: { price: 350, unit: "per kg", coverage_acre: 1, benefit: "Insect pest control" },
  cow_urine: { price: 30, unit: "per liter", coverage_acre: 0.05, benefit: "Foliar spray & pest deterrent" },
  mulching: { price: 2500, unit: "per acre", coverage_acre: 1, benefit: "Moisture retention & weed control" },
  green_manure: { price: 600, unit: "seed per acre", coverage_acre: 1, benefit: "Natural nitrogen fixation" },
};

// ═══════════════════════════════════════════════════════════════════════
// GROWTH PROMOTERS (2024-25 Market Rates) - USED IN BOTH ORGANIC & FERTILIZER
// ═══════════════════════════════════════════════════════════════════════
const GROWTH_PROMOTERS: Record<string, { price: number; unit: string; coverage_acre: number; use: string }> = {
  seaweed_extract: { price: 550, unit: "500ml", coverage_acre: 1, use: "Root development & stress tolerance" },
  humic_acid: { price: 480, unit: "1L", coverage_acre: 1, use: "Nutrient uptake & soil health" },
  amino_acid: { price: 620, unit: "1L", coverage_acre: 1, use: "Protein synthesis & growth" },
  fulvic_acid: { price: 520, unit: "500ml", coverage_acre: 1, use: "Nutrient transport" },
  silicic_acid: { price: 450, unit: "500ml", coverage_acre: 1, use: "Stem strength & disease resistance" },
  gibberellic_acid: { price: 380, unit: "10g", coverage_acre: 2, use: "Cell elongation (use carefully)" },
  naphthalene_acetic_acid: { price: 280, unit: "100ml", coverage_acre: 1, use: "Root initiation" },
  cytokinin: { price: 520, unit: "100ml", coverage_acre: 1, use: "Cell division & fruit set" },
  brassinolide: { price: 680, unit: "100ml", coverage_acre: 2, use: "Stress tolerance & yield" },
};

// ═══════════════════════════════════════════════════════════════════════
// FERTILIZER PRICES (2024-25 Subsidized Rates) - ONLY FOR FERTILIZER MODE
// Source: Department of Fertilizers, Govt of India
// ═══════════════════════════════════════════════════════════════════════
const FERTILIZER_PRICES: Record<string, { price_per_kg: number; bag_kg: number; nutrient_content: string }> = {
  urea: { price_per_kg: 6.5, bag_kg: 45, nutrient_content: "46% N" },
  dap: { price_per_kg: 30, bag_kg: 50, nutrient_content: "18% N, 46% P" },
  mop: { price_per_kg: 20, bag_kg: 50, nutrient_content: "60% K" },
  ssp: { price_per_kg: 9, bag_kg: 50, nutrient_content: "16% P" },
  "10-26-26": { price_per_kg: 32, bag_kg: 50, nutrient_content: "10% N, 26% P, 26% K" },
  "12-32-16": { price_per_kg: 34, bag_kg: 50, nutrient_content: "12% N, 32% P, 16% K" },
  zinc_sulphate: { price_per_kg: 110, bag_kg: 25, nutrient_content: "33% Zn" },
  borax: { price_per_kg: 150, bag_kg: 25, nutrient_content: "11% B" },
  ferrous_sulphate: { price_per_kg: 60, bag_kg: 25, nutrient_content: "19% Fe" },
  magnesium_sulphate: { price_per_kg: 48, bag_kg: 25, nutrient_content: "10% Mg" },
};

// ═══════════════════════════════════════════════════════════════════════
// PESTICIDE PRICES (PRIORITY 4 - Only if absolutely necessary)
// ═══════════════════════════════════════════════════════════════════════
const CHEMICAL_PRICES: Record<string, { 
  price: number; unit: string; coverage_acre: number; type: string; 
  active_ingredient: string; phi_days: number; organic_alternative: string 
}> = {
  "imidacloprid_17.8sl": { 
    price: 450, unit: "250ml", coverage_acre: 1, type: "insecticide",
    active_ingredient: "Imidacloprid 17.8% SL", phi_days: 14,
    organic_alternative: "Neem oil 3ml/L + garlic extract"
  },
  "chlorpyriphos_20ec": { 
    price: 380, unit: "1L", coverage_acre: 2, type: "insecticide",
    active_ingredient: "Chlorpyriphos 20% EC", phi_days: 21,
    organic_alternative: "Beauveria bassiana 5g/L"
  },
  "thiamethoxam_25wg": { 
    price: 650, unit: "100g", coverage_acre: 1, type: "insecticide",
    active_ingredient: "Thiamethoxam 25% WG", phi_days: 14,
    organic_alternative: "Neem seed kernel extract 5%"
  },
  "carbendazim_50wp": { 
    price: 180, unit: "100g", coverage_acre: 1, type: "fungicide",
    active_ingredient: "Carbendazim 50% WP", phi_days: 14,
    organic_alternative: "Trichoderma viride 5g/L"
  },
  "mancozeb_75wp": { 
    price: 320, unit: "500g", coverage_acre: 1, type: "fungicide",
    active_ingredient: "Mancozeb 75% WP", phi_days: 21,
    organic_alternative: "Pseudomonas fluorescens 10g/L"
  },
};

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY-WISE LABOR REQUIREMENTS (person-days per acre)
// ═══════════════════════════════════════════════════════════════════════
const ACTIVITY_LABOR: Record<string, { labor_per_acre: number; description_en: string }> = {
  land_preparation: { labor_per_acre: 0, description_en: "Tractor/machine work" },
  fym_application: { labor_per_acre: 1.5, description_en: "FYM spreading & mixing" },
  seed_treatment: { labor_per_acre: 0.25, description_en: "Seed preparation" },
  sowing: { labor_per_acre: 0.5, description_en: "Manual sowing" },
  sowing_machine: { labor_per_acre: 0.15, description_en: "Machine sowing" },
  transplanting: { labor_per_acre: 4, description_en: "Transplanting labor" },
  fertilizer: { labor_per_acre: 0.3, description_en: "Fertilizer application" },
  irrigation: { labor_per_acre: 0.2, description_en: "Water management" },
  weeding_manual: { labor_per_acre: 3, description_en: "Manual weeding" },
  weeding_chemical: { labor_per_acre: 0.5, description_en: "Herbicide application" },
  pest_control: { labor_per_acre: 0.5, description_en: "Spraying labor" },
  disease_control: { labor_per_acre: 0.5, description_en: "Spraying labor" },
  growth_promoter: { labor_per_acre: 0.3, description_en: "Spray/drench application" },
  intercultural: { labor_per_acre: 1, description_en: "Intercultural operations" },
  harvest_manual: { labor_per_acre: 4, description_en: "Manual harvesting" },
  harvest_machine: { labor_per_acre: 0.5, description_en: "Machine harvesting" },
  post_harvest: { labor_per_acre: 2, description_en: "Threshing/cleaning" },
};

// ═══════════════════════════════════════════════════════════════════════
// SPRAYING & MACHINERY COSTS (₹ per acre)
// ═══════════════════════════════════════════════════════════════════════
const SPRAYING_COSTS: Record<string, number> = {
  manual_knapsack: 150,
  power_sprayer: 300,
  tractor_mounted: 500,
  drone_spray: 400,
};

const MACHINERY_COSTS: Record<string, number> = {
  tractor_plowing: 1500,
  tractor_rotavator: 1200,
  seed_drill: 800,
  combine_harvester: 2500,
  thresher: 600,
  transplanter: 1500,
  cultivator: 800,
};

// ═══════════════════════════════════════════════════════════════════════
// VERIFIED SEED RATES (kg/acre) - ICAR & State Agri Dept Data
// ═══════════════════════════════════════════════════════════════════════
const SEED_RATES: Record<string, { rate_kg_per_acre: number; spacing_cm: string; price_per_kg: number; treatment: string }> = {
  wheat: { rate_kg_per_acre: 40, spacing_cm: "22.5 row spacing", price_per_kg: 35, treatment: "Thiram @ 2.5g/kg or Trichoderma 4g/kg" },
  rice: { rate_kg_per_acre: 20, spacing_cm: "20x15 cm", price_per_kg: 45, treatment: "Carbendazim @ 2g/kg or Trichoderma 4g/kg" },
  cotton: { rate_kg_per_acre: 1.5, spacing_cm: "90x60 cm", price_per_kg: 850, treatment: "Imidacloprid @ 5g/kg or neem oil soak" },
  soybean: { rate_kg_per_acre: 30, spacing_cm: "45x5 cm", price_per_kg: 90, treatment: "Thiram+Rhizobium or Trichoderma+Rhizobium" },
  maize: { rate_kg_per_acre: 8, spacing_cm: "60x20 cm", price_per_kg: 350, treatment: "Thiram @ 3g/kg" },
  sugarcane: { rate_kg_per_acre: 0, spacing_cm: "90x30 cm", price_per_kg: 0, treatment: "Carbendazim dip or lime water soak" },
  groundnut: { rate_kg_per_acre: 50, spacing_cm: "30x10 cm", price_per_kg: 80, treatment: "Thiram @ 3g/kg + Rhizobium" },
  tomato: { rate_kg_per_acre: 0.15, spacing_cm: "60x45 cm", price_per_kg: 3500, treatment: "Trichoderma @ 4g/kg" },
  onion: { rate_kg_per_acre: 4, spacing_cm: "15x10 cm", price_per_kg: 1200, treatment: "Thiram @ 2g/kg" },
  potato: { rate_kg_per_acre: 800, spacing_cm: "60x20 cm", price_per_kg: 25, treatment: "Mancozeb dip or boric acid" },
  chilli: { rate_kg_per_acre: 0.2, spacing_cm: "60x45 cm", price_per_kg: 2500, treatment: "Trichoderma @ 4g/kg" },
  brinjal: { rate_kg_per_acre: 0.15, spacing_cm: "75x60 cm", price_per_kg: 2800, treatment: "Trichoderma @ 4g/kg" },
  okra: { rate_kg_per_acre: 4, spacing_cm: "45x30 cm", price_per_kg: 400, treatment: "Carbendazim @ 2g/kg" },
  moong: { rate_kg_per_acre: 8, spacing_cm: "30x10 cm", price_per_kg: 120, treatment: "Thiram @ 2.5g/kg + Rhizobium" },
  urad: { rate_kg_per_acre: 8, spacing_cm: "30x10 cm", price_per_kg: 130, treatment: "Thiram @ 2.5g/kg + Rhizobium" },
  tur: { rate_kg_per_acre: 6, spacing_cm: "90x30 cm", price_per_kg: 150, treatment: "Thiram @ 2.5g/kg + Rhizobium" },
  gram: { rate_kg_per_acre: 30, spacing_cm: "30x10 cm", price_per_kg: 80, treatment: "Thiram+Carbendazim @ 2+1g/kg" },
  mustard: { rate_kg_per_acre: 2, spacing_cm: "45x15 cm", price_per_kg: 100, treatment: "Thiram @ 2.5g/kg" },
  sunflower: { rate_kg_per_acre: 3, spacing_cm: "60x30 cm", price_per_kg: 180, treatment: "Imidacloprid @ 5g/kg" },
  jowar: { rate_kg_per_acre: 4, spacing_cm: "45x15 cm", price_per_kg: 60, treatment: "Thiram @ 3g/kg" },
  bajra: { rate_kg_per_acre: 2, spacing_cm: "45x15 cm", price_per_kg: 120, treatment: "Thiram @ 2g/kg" },
};

// NPK targets by crop (kg/ha) - ICAR recommendations
const NPK_TARGETS: Record<string, { n: number; p: number; k: number }> = {
  wheat: { n: 120, p: 60, k: 40 }, rice: { n: 120, p: 60, k: 40 },
  cotton: { n: 120, p: 60, k: 50 }, maize: { n: 150, p: 75, k: 50 },
  sugarcane: { n: 250, p: 115, k: 115 }, soybean: { n: 30, p: 60, k: 40 },
  groundnut: { n: 25, p: 50, k: 45 }, tomato: { n: 100, p: 60, k: 80 },
  onion: { n: 100, p: 50, k: 50 }, potato: { n: 150, p: 80, k: 100 },
  chilli: { n: 100, p: 50, k: 50 }, brinjal: { n: 100, p: 50, k: 50 },
  okra: { n: 80, p: 40, k: 40 }, default: { n: 100, p: 50, k: 40 },
};

// ═══════════════════════════════════════════════════════════════════════
// CROP SUITABILITY DATABASE (Agro-climatic zones)
// ═══════════════════════════════════════════════════════════════════════
const CROP_SUITABILITY: Record<string, {
  optimal_temp: { min: number; max: number };
  soil_types: string[];
  ph_range: { min: number; max: number };
  water_requirement: string;
  seasons: string[];
  states_suitable: string[];
  rainfall_mm: { min: number; max: number };
}> = {
  wheat: {
    optimal_temp: { min: 10, max: 25 },
    soil_types: ["alluvial", "loamy", "clay loam", "black"],
    ph_range: { min: 6.0, max: 8.5 },
    water_requirement: "medium",
    seasons: ["rabi", "winter"],
    states_suitable: ["Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Rajasthan", "Bihar", "Gujarat"],
    rainfall_mm: { min: 400, max: 1000 },
  },
  rice: {
    optimal_temp: { min: 20, max: 35 },
    soil_types: ["clay", "alluvial", "loamy", "silty clay"],
    ph_range: { min: 5.5, max: 7.5 },
    water_requirement: "high",
    seasons: ["kharif", "monsoon"],
    states_suitable: ["West Bengal", "Uttar Pradesh", "Punjab", "Bihar", "Tamil Nadu", "Andhra Pradesh", "Odisha", "Karnataka"],
    rainfall_mm: { min: 1000, max: 2500 },
  },
  cotton: {
    optimal_temp: { min: 21, max: 35 },
    soil_types: ["black", "alluvial", "red loamy"],
    ph_range: { min: 5.5, max: 8.0 },
    water_requirement: "medium",
    seasons: ["kharif", "monsoon"],
    states_suitable: ["Gujarat", "Maharashtra", "Telangana", "Andhra Pradesh", "Punjab", "Haryana", "Rajasthan", "Karnataka"],
    rainfall_mm: { min: 600, max: 1500 },
  },
  soybean: {
    optimal_temp: { min: 20, max: 30 },
    soil_types: ["black", "clay loam", "loamy"],
    ph_range: { min: 6.0, max: 7.5 },
    water_requirement: "medium",
    seasons: ["kharif", "monsoon"],
    states_suitable: ["Madhya Pradesh", "Maharashtra", "Rajasthan", "Karnataka", "Telangana"],
    rainfall_mm: { min: 500, max: 1200 },
  },
  maize: {
    optimal_temp: { min: 18, max: 32 },
    soil_types: ["loamy", "alluvial", "sandy loam", "black"],
    ph_range: { min: 5.5, max: 8.0 },
    water_requirement: "medium",
    seasons: ["kharif", "rabi", "zaid"],
    states_suitable: ["Karnataka", "Madhya Pradesh", "Rajasthan", "Bihar", "Uttar Pradesh", "Maharashtra", "Tamil Nadu"],
    rainfall_mm: { min: 500, max: 1000 },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// MINIMUM COSTS BY CATEGORY (Realistic floor values per acre)
// ═══════════════════════════════════════════════════════════════════════
const CATEGORY_MIN_COSTS: Record<string, { productMin: number; laborDays: number; description: string }> = {
  land_preparation: { productMin: 0, laborDays: 0, description: "Tractor work" },
  organic_input: { productMin: 800, laborDays: 1.5, description: "FYM/compost application" },
  seed_treatment: { productMin: 50, laborDays: 0.25, description: "Treatment chemicals" },
  sowing: { productMin: 0, laborDays: 0.5, description: "Manual sowing" },
  transplanting: { productMin: 500, laborDays: 4, description: "Seedlings/nursery" },
  growth_promoter: { productMin: 300, laborDays: 0.3, description: "Growth promoter spray" },
  fertilizer: { productMin: 200, laborDays: 0.3, description: "Fertilizer per application" },
  irrigation: { productMin: 0, laborDays: 0.2, description: "Water management" },
  weeding: { productMin: 0, laborDays: 3, description: "Manual weeding" },
  pest_control: { productMin: 350, laborDays: 0.5, description: "Pesticide + spraying" },
  disease_control: { productMin: 250, laborDays: 0.5, description: "Fungicide + spraying" },
  intercultural: { productMin: 0, laborDays: 1, description: "Cultivation work" },
  harvest: { productMin: 0, laborDays: 4, description: "Manual harvest" },
  post_harvest: { productMin: 0, laborDays: 2, description: "Threshing/drying" },
  other: { productMin: 0, laborDays: 0.5, description: "General task" },
};

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════
function getCurrentSeason(month: number): string {
  if (month >= 6 && month <= 10) return "kharif";
  if (month >= 11 || month <= 2) return "rabi";
  return "zaid";
}

interface SuitabilityResult {
  isSuitable: boolean;
  score: number;
  warnings: string[];
  risks: string[];
  alternatives: { crop: string; reason: string; success_rate: number }[];
}

function validateCropSuitability(cropName: string, land: any, currentMonth: number, language: string): SuitabilityResult {
  const cropLower = cropName.toLowerCase();
  const suitability = CROP_SUITABILITY[cropLower];
  
  const warnings: string[] = [];
  const risks: string[] = [];
  let score = 100;
  
  if (!suitability) {
    return { isSuitable: true, score: 70, warnings: ["General recommendations provided"], risks: [], alternatives: [] };
  }
  
  const state = land.state || "";
  const soilType = (land.soil_type || "").toLowerCase();
  const currentSeason = getCurrentSeason(currentMonth);
  
  if (!suitability.seasons.includes(currentSeason)) {
    score -= 30;
    warnings.push(`Not ideal for ${currentSeason} season`);
  }
  
  if (soilType && !suitability.soil_types.some(s => soilType.includes(s))) {
    score -= 20;
    warnings.push(`Soil type ${soilType} may not be optimal`);
  }
  
  return { isSuitable: score >= 50, score, warnings, risks, alternatives: [] };
}

function mapCategoryToStage(category: string, farmingStages: FarmingStage[]): FarmingStage | null {
  for (const stage of farmingStages) {
    const stageCategories = STAGE_CATEGORY_MAP[stage.stage_key] || [];
    if (stageCategories.includes(category)) {
      return stage;
    }
  }
  return farmingStages.find(s => s.stage_key === "vegetative_growth") || null;
}

function calculateTaskCost(
  category: string, taskName: string, landAcres: number, laborRate: number,
  seedCost: number, fertilizerCost: number, fymCost: number, language: string
): { totalCost: number; laborCost: number; productCost: number; laborDays: number; breakdown: string } {
  const categoryConfig = CATEGORY_MIN_COSTS[category] || CATEGORY_MIN_COSTS["other"];
  const laborDays = categoryConfig.laborDays * landAcres;
  const laborCost = Math.round(laborDays * laborRate);
  
  let productCost = Math.round(categoryConfig.productMin * landAcres);
  
  if (category === "seed_treatment" || category === "sowing") {
    productCost = seedCost;
  } else if (category === "fertilizer") {
    productCost = Math.round(fertilizerCost / 3);
  } else if (category === "organic_input") {
    productCost = fymCost;
  }
  
  const totalCost = productCost + laborCost;
  const breakdown = `सामग्री ₹${productCost} + मजदूरी (${laborDays.toFixed(1)} दिन × ₹${laborRate}) = ₹${totalCost}`;
  
  return { totalCost, laborCost, productCost, laborDays, breakdown };
}

// ═══════════════════════════════════════════════════════════════════════
// FETCH PRODUCTS FROM master_products TABLE
// ═══════════════════════════════════════════════════════════════════════
async function fetchRecommendedProducts(
  supabase: any, cropName: string, stageKey: string, problemType: string | null
): Promise<any[]> {
  try {
    let query = supabase
      .from("master_products")
      .select("id, name, product_type, active_ingredients, dosage_instructions, application_method, price_range, safety_level, organic_certified, suitable_crops")
      .eq("status", "active")
      .eq("ai_recommendable", true)
      .limit(5);
    
    if (problemType) {
      query = query.or(`product_type.ilike.%${problemType}%`);
    }
    
    const { data, error } = await query;
    
    if (error || !data) {
      console.log("No products found:", error?.message);
      return [];
    }
    
    // Sort by priority: organic first, then by effectiveness
    return data.sort((a: any, b: any) => {
      if (a.organic_certified && !b.organic_certified) return -1;
      if (!a.organic_certified && b.organic_certified) return 1;
      return 0;
    });
  } catch (e) {
    console.error("Error fetching products:", e);
    return [];
  }
}

function buildIrrigationRules(irrigationType: string): string {
  const rules: Record<string, string> = {
    drip: "DRIP: Fertigation possible, daily small doses",
    sprinkler: "SPRINKLER: Good for standing crops, avoid during flowering",
    manual: "MANUAL: Flood/furrow irrigation, morning or evening only",
    rainfed: "RAINFED: Focus on mulching, rainwater harvesting, moisture conservation",
  };
  return rules[irrigationType] || rules["manual"];
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { landId, cropName, cropVariety, sowingDate, language = "hi", isReadyMadePlant = false, farmingType = "organic_fertilizer" } = await req.json();
    const tenantId = req.headers.get("x-tenant-id") || "";
    const farmerId = req.headers.get("x-farmer-id") || "";

    console.log(`🌾 [AI-Schedule] Starting ${farmingType} schedule: ${cropName} on ${sowingDate}`);

    // Rate limiting
    const rateLimitResult = await checkRateLimit(
      `${farmerId}-${tenantId}`,
      "ai-smart-schedule",
      { maxRequests: 20, windowMs: 60000 }
    );
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateLimitResult.retryAfter }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: FETCH FARMING STAGES FROM DATABASE
    // ═══════════════════════════════════════════════════════════════════
    const { data: farmingStages, error: stagesError } = await supabase
      .from("farming_stages")
      .select("*")
      .eq("is_active", true)
      .order("stage_order", { ascending: true });

    if (stagesError || !farmingStages?.length) {
      console.error("Failed to fetch farming stages:", stagesError);
      throw new Error("Farming stages not configured");
    }

    console.log(`📋 [Stages] Loaded ${farmingStages.length} farming stages`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: FETCH LAND DATA
    // ═══════════════════════════════════════════════════════════════════
    const { data: land, error: landError } = await supabase
      .from("lands")
      .select("*")
      .eq("id", landId)
      .single();

    if (landError || !land) {
      throw new Error(`Land not found: ${landError?.message}`);
    }

    const languageName = LANGUAGES[language] || "Hindi";
    const ruralTerms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
    const state = land.state || land.district?.split(",").pop()?.trim() || "Maharashtra";
    const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];
    const landAreaAcres = land.area_acres || land.area_in_acres || 1;
    const landAreaHa = landAreaAcres * 0.4047;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: VALIDATE CROP SUITABILITY
    // ═══════════════════════════════════════════════════════════════════
    const sowingMonth = new Date(sowingDate).getMonth() + 1;
    const suitabilityCheck = validateCropSuitability(cropName, land, sowingMonth, language);
    
    console.log(`🔍 [Suitability] Score: ${suitabilityCheck.score}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: CALCULATE COSTS
    // ═══════════════════════════════════════════════════════════════════
    const cropLower = cropName.toLowerCase().replace(/\s+/g, "");
    const seedData = SEED_RATES[cropLower] || { rate_kg_per_acre: 10, spacing_cm: "Standard", price_per_kg: 50, treatment: "Trichoderma 4g/kg" };
    const exactSeedQty = Math.round(seedData.rate_kg_per_acre * landAreaAcres * 10) / 10;
    const seedCost = Math.round(exactSeedQty * seedData.price_per_kg);

    const target = NPK_TARGETS[cropLower] || NPK_TARGETS["default"];
    const currentN = land.nitrogen_kg_ha || 50;
    const currentP = land.phosphorus_kg_ha || 25;
    const currentK = land.potassium_kg_ha || 25;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    const fymTons = Math.round(5 * landAreaAcres * 10) / 10;
    const fymCost = Math.round(fymTons * 800);

    const ureaKg = Math.round((nDeficit * landAreaHa) / 0.46);
    const dapKg = Math.round((pDeficit * landAreaHa) / 0.46);
    const mopKg = Math.round((kDeficit * landAreaHa) / 0.60);
    const ureaCost = Math.round(ureaKg * FERTILIZER_PRICES.urea.price_per_kg);
    const dapCost = Math.round(dapKg * FERTILIZER_PRICES.dap.price_per_kg);
    const mopCost = Math.round(mopKg * FERTILIZER_PRICES.mop.price_per_kg);
    const totalFertilizerCost = ureaCost + dapCost + mopCost;

    const seaweedCost = Math.round(GROWTH_PROMOTERS.seaweed_extract.price * landAreaAcres);
    const humicCost = Math.round(GROWTH_PROMOTERS.humic_acid.price * landAreaAcres);
    const irrigationRules = buildIrrigationRules(land.irrigation_type || "manual");

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: BUILD STAGE-BASED AI PROMPT - ALL 10 STAGES MANDATORY
    // ═══════════════════════════════════════════════════════════════════
    const totalStages = farmingStages.length;
    console.log(`📋 [AI] Building prompt for ALL ${totalStages} farming stages`);
    
    const stagesPrompt = farmingStages.map((stage: FarmingStage) => {
      const yieldTech = YIELD_BOOST_TECHNIQUES[stage.stage_key] || { 
        techniques: ["Follow standard practices"], 
        yieldImpact: "Optimal yield through proper management", 
        skipPenalty: "Potential yield loss if skipped" 
      };
      return `
══════════════════════════════════════════════════════════════
MANDATORY STAGE ${stage.stage_order} of ${totalStages}: ${stage.stage_name} (stage_key: "${stage.stage_key}")
══════════════════════════════════════════════════════════════
${stage.stage_icon} ${stage.stage_description}
YIELD BOOST TECHNIQUES: ${yieldTech.techniques.join(", ")}
YIELD IMPACT: ${yieldTech.yieldImpact}
SKIP PENALTY: ${yieldTech.skipPenalty}

⚠️ YOU MUST GENERATE 2-4 TASKS FOR THIS STAGE. DO NOT SKIP THIS STAGE.
Each task must have: task_name, description (100+ words), yield_impact, skip_penalty, instructions (5+ steps)`;
    }).join("\n\n");
    
    // Create list of all stage keys that MUST be covered
    const allStageKeys = farmingStages.map((s: FarmingStage) => s.stage_key);
    console.log(`📋 [AI] Required stages: ${allStageKeys.join(", ")}`);

    // Build farming type specific rules for 3 modes
    const district = land.district || "";
    const region = getRegionFromDistrict(district, state);
    const regionalDialectTerms = getRegionalDialectTerms(language, region);
    const regionalLanguageRules = buildRegionalLanguageRules(language, region, district);
    
    let farmingTypeRules = "";
    if (farmingType === "organic_only") {
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🌿 100% ORGANIC FARMING MODE (पूर्ण जैविक खेती / संपूर्ण सेंद्रिय शेती)
═══════════════════════════════════════════════════════════════
This farmer wants ZERO chemicals. Premium pricing for organic produce.

✅ ALLOWED PRODUCTS (100% organic):
- Organic manures: FYM (${regionalDialectTerms.fym}), Vermicompost, Jeevamrut, Panchagavya
- Bio-fertilizers: Rhizobium, Azotobacter, PSB, KSB, Azospirillum
- Bio-pesticides: Trichoderma, Pseudomonas, Beauveria, Metarhizium, Verticillium
- Botanical pesticides: Neem oil, Neem cake, Garlic extract, Chilli extract
- Growth promoters: Seaweed extract, Humic acid, Amino acids, Fulvic acid
- Soil amendments: Green manure, Mulching, Cover crops

❌ STRICTLY NOT ALLOWED - DO NOT RECOMMEND:
- Chemical fertilizers (Urea, DAP, MOP, NPK complexes, SSP)
- Chemical pesticides/insecticides (Imidacloprid, Chlorpyriphos, etc.)
- Chemical fungicides (Carbendazim, Mancozeb, etc.)
- Synthetic growth regulators

💰 ORGANIC INPUT COSTS (2024-25 Rates):
- FYM: ₹1200/ton | Vermicompost: ₹12/kg | Neem oil: ₹380/L
- Trichoderma: ₹280/kg | Pseudomonas: ₹320/kg | Beauveria: ₹350/kg
- Seaweed: ₹550/500ml | Humic acid: ₹480/L | Amino acid: ₹620/L
- Jeevamrut: ₹80/batch | Panchagavya: ₹150/batch`;
    } else if (farmingType === "organic_fertilizer") {
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🌱🧪 ORGANIC + FERTILIZER MODE (जैविक + रासायनिक / सेंद्रिय + रासायनिक)
═══════════════════════════════════════════════════════════════
Best of both worlds - 60% organic base, 40% chemical boost. IPM approach.

✅ ALLOWED PRODUCTS (in priority order):
1. ORGANIC BASE (60%): 
   - FYM ${fymTons} tons = ₹${fymCost} | Vermicompost for nursery
   - Green manure incorporation | Mulching where possible
   
2. GROWTH PROMOTERS (mandatory for yield boost):
   - Seaweed extract ₹${seaweedCost} | Humic acid ₹${humicCost}
   - Amino acids for stress tolerance | Fulvic acid for nutrient transport
   
3. CHEMICAL FERTILIZERS (40% - soil test based):
   - Urea ${ureaKg}kg = ₹${ureaCost} | DAP ${dapKg}kg = ₹${dapCost} | MOP ${mopKg}kg = ₹${mopCost}
   - Micronutrients: Zinc Sulphate, Borax as needed
   
4. IPM-BASED PEST CONTROL (bio-first approach):
   - First choice: Trichoderma, Pseudomonas, Beauveria, Neem
   - If severe: Use chemical with proper PHI compliance

💰 2024-25 RATES:
- Organic: FYM ₹1200/ton | Vermicompost ₹12/kg
- Fertilizers: Urea ₹6.5/kg | DAP ₹30/kg | MOP ₹20/kg`;
    } else {
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🧪🐛 FULL CHEMICAL FARMING MODE (पूर्ण रासायनिक / पूर्ण रासायनिक)
═══════════════════════════════════════════════════════════════
Maximum yield focus. Full chemical program with 20% organic base.

✅ ALLOWED PRODUCTS (in priority order):
1. ORGANIC BASE (20%): FYM 2 tons/acre for soil health
   
2. GROWTH PROMOTERS (for maximum yield):
   - Seaweed, Humic acid, Amino acids, Gibberellic acid
   - Brassinolide for stress tolerance
   
3. CHEMICAL FERTILIZERS (full program):
   - Urea ${ureaKg}kg = ₹${ureaCost} | DAP ${dapKg}kg = ₹${dapCost} | MOP ${mopKg}kg = ₹${mopCost}
   - NPK complexes as per crop stage | All micronutrients
   
4. FULL PEST & DISEASE CONTROL:
   - Insecticides: Imidacloprid, Thiamethoxam, Chlorpyriphos
   - Fungicides: Carbendazim, Mancozeb, Copper fungicides
   - ⚠️ ALWAYS include PHI (Pre-Harvest Interval) warnings

❌ NOT ALLOWED:
- Banned pesticides (Endosulfan, Monocrotophos, etc.)

💰 2024-25 RATES:
- Fertilizers: Urea ₹6.5/kg | DAP ₹30/kg | MOP ₹20/kg
- Pesticides: Imidacloprid ₹450/250ml | Chlorpyriphos ₹380/L`;
    }

    const systemPrompt = `You are a senior agricultural expert from India's Krishi Vigyan Kendra with 40+ years of experience.

═══════════════════════════════════════════════════════════════
🚨 CRITICAL MANDATE: COMPLETE ${totalStages}-STAGE SCHEDULE GENERATION
═══════════════════════════════════════════════════════════════
You MUST generate tasks for ALL ${totalStages} farming stages listed below. 
EVERY stage_key MUST appear in your output: [${allStageKeys.join(", ")}]
NEVER skip, reorder, merge, or omit ANY stage.
Generate 2-4 practical tasks per stage = MINIMUM ${totalStages * 2} tasks total.
FAILURE TO COVER ALL STAGES IS UNACCEPTABLE.

${stagesPrompt}

${farmingTypeRules}

═══════════════════════════════════════════════════════════════
🗣️ LANGUAGE RULES (CRITICAL!)
═══════════════════════════════════════════════════════════════
1. Think in English, output in ${languageName} PURE RURAL VILLAGE DIALECT
2. Use local words: "${regionalDialectTerms.fertilizer}", "${regionalDialectTerms.sowing}", "${regionalDialectTerms.weeding}"
3. Keep sentences SHORT and PRACTICAL like a village elder speaks
4. Each task description should be 100-200 words with DETAILED PRACTICAL information
5. Include 5-7 step-by-step instructions per task

${regionalLanguageRules}

═══════════════════════════════════════════════════════════════
📝 DETAILED TASK REQUIREMENTS (VERY IMPORTANT)
═══════════════════════════════════════════════════════════════
Each task MUST include detailed information:

1. DESCRIPTION (100-200 words): 
   - WHY this task is important
   - WHAT exactly to do (specific quantities, methods)
   - HOW to do it correctly (technique details)
   - WHEN is the best time (morning/evening, weather conditions)
   - WHAT to observe/check before and after

2. INSTRUCTIONS (5-7 practical steps):
   - Step-by-step actions a farmer can follow
   - Include timing (e.g., "Do in early morning 6-8 AM")
   - Include tools needed
   - Include safety precautions where relevant

3. YIELD_IMPACT: Explain percentage increase and scientific reason
4. SKIP_PENALTY: Explain percentage loss and visible symptoms
5. PRODUCT_RECOMMENDATIONS: Complete product details with dose, method, timing

═══════════════════════════════════════════════════════════════
🌱 CROP & LAND DETAILS
═══════════════════════════════════════════════════════════════
CROP: ${cropName} ${cropVariety ? `(${cropVariety})` : ""}
LOCATION: ${land.village || ""}, ${land.district || ""}, ${state}
REGIONAL DIALECT ZONE: ${region}
AREA: ${landAreaAcres} acres (${landAreaHa.toFixed(2)} hectares)
SOIL: ${land.soil_type || "Black"} | pH: ${land.soil_ph || 7.0}
IRRIGATION: ${land.irrigation_type || "manual"}
${irrigationRules}

═══════════════════════════════════════════════════════════════
💧 WATER REQUIREMENT CALCULATION
═══════════════════════════════════════════════════════════════
Calculate water needs based on:
- Land area: ${landAreaAcres} acres
- Irrigation type: ${land.irrigation_type || "manual"}
- Soil type: ${land.soil_type || "black"} (affects water retention)
- Include water_required_liters for irrigation tasks

═══════════════════════════════════════════════════════════════
💰 COST RULES (2024-25 INDIAN MARKET RATES)
═══════════════════════════════════════════════════════════════
LABOR RATE (${state}): ₹${laborRate}/day (MGNREGA 2024-25)
SEED: ${exactSeedQty} kg × ₹${seedData.price_per_kg} = ₹${seedCost}
MACHINERY: Tractor ₹1800/acre, Harvester ₹2800/acre, Rotavator ₹1400/acre
SPRAYING: Manual ₹200/acre, Power sprayer ₹400/acre

For EVERY task calculate: Product + Labor + Spraying = Total
Show detailed cost breakdown in cost_breakdown field`;

    const userPrompt = `Generate COMPLETE stage-based ${cropName} schedule for ${landAreaAcres} acres starting ${sowingDate}.

FARMING MODE: ${farmingType.toUpperCase().replace("_", " ")}

🚨 MANDATORY REQUIREMENTS - READ CAREFULLY:

1. ✅ COVER ALL ${totalStages} FARMING STAGES - NO EXCEPTIONS:
   Required stages: [${allStageKeys.join(", ")}]
   EVERY single stage MUST have 2-4 tasks. Check your output before finishing.

2. ✅ MINIMUM ${totalStages * 2} TASKS TOTAL (2-4 per stage × ${totalStages} stages)

3. ✅ DETAILED DESCRIPTIONS (100-200 words per task) explaining:
   - WHY this task is critical for yield
   - WHAT exactly to do (specific quantities, methods)
   - HOW to do it correctly (technique details)
   - WHEN is the best time (morning/evening, weather conditions)

4. ✅ 5-7 STEP-BY-STEP INSTRUCTIONS per task that a farmer can follow

5. ✅ Include yield_impact with percentage and scientific reason

6. ✅ Include skip_penalty with percentage loss and visible symptoms

7. ✅ Include product_recommendations with COMPLETE details (product_type, dose, method, timing, precautions, price)

8. ✅ Calculate stage-wise cost breakdown

9. ✅ Output in ${languageName} rural dialect

YIELD TARGET: ${farmingType === 'organic_only' ? '1.5x-2.5x' : farmingType === 'organic_fertilizer' ? '3x-5x' : '5x-7x'} increase through proper agronomy techniques

BEFORE SUBMITTING: Double-check that you have tasks for ALL ${totalStages} stages: ${allStageKeys.join(", ")}`;

    console.log("🤖 [AI] Calling API with enhanced ${totalStages}-stage prompt, max_tokens: ${AI_CONFIG.MAX_TOKENS_SCHEDULE}");

    const aiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_CONFIG.MODEL,
        max_completion_tokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_stage_based_schedule",
              description: `Create ${cropName} schedule covering all 9 farming stages with yield boosting techniques`,
              parameters: {
                type: "object",
                properties: {
                  crop_name: { type: "string" },
                  total_duration_days: { type: "integer" },
                  expected_yield_quintals: { type: "number" },
                  yield_multiplier_target: { type: "number", description: "Target yield multiplier (3-7)" },
                  total_estimated_cost: { type: "number" },
                  total_labor_cost: { type: "number" },
                  total_material_cost: { type: "number" },
                  expected_profit: { type: "number" },
                  stages_covered: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of stage_keys covered"
                  },
                  cost_by_stage: {
                    type: "object",
                    description: "Cost breakdown per stage"
                  },
                  cost_by_category: {
                    type: "object",
                    description: "Cost by category: seed, organic, fertilizer, labor, etc."
                  },
                  yield_boosting_techniques: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of yield boosting techniques applied"
                  },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task_name: { type: "string", description: "Brief task name in rural dialect" },
                        stage_key: { type: "string", description: "farming_stages.stage_key this task belongs to" },
                        stage_order: { type: "integer", description: "Stage order (1-9)" },
                        category: { 
                          type: "string", 
                          enum: ["land_preparation", "organic_input", "seed_treatment", "sowing", "transplanting", 
                                 "growth_promoter", "fertilizer", "irrigation", "weeding", "pest_control", 
                                 "disease_control", "intercultural", "harvest", "post_harvest", "other"],
                        },
                        days_from_sowing: { type: "integer" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        description: { type: "string", description: "Detailed village-style description (100-200 words) explaining WHY, WHAT, HOW, WHEN" },
                        yield_impact: { type: "string", description: "Detailed yield impact with percentage and scientific reason (e.g., '20-30% yield increase due to improved nutrient uptake')" },
                        skip_penalty: { type: "string", description: "Detailed skip penalty with percentage loss and visible symptoms (e.g., '15-25% yield loss, yellowing leaves, stunted growth')" },
                        yield_impact_details: {
                          type: "object",
                          properties: {
                            percentage_increase: { type: "string" },
                            scientific_reason: { type: "string" },
                            farmer_benefit: { type: "string" }
                          },
                          description: "Structured yield impact details"
                        },
                        skip_penalty_details: {
                          type: "object",
                          properties: {
                            percentage_loss: { type: "string" },
                            symptoms: { type: "array", items: { type: "string" } },
                            recovery_possible: { type: "boolean" }
                          },
                          description: "Structured skip penalty details"
                        },
                        yield_boost_technique: { type: "string", description: "Specific yield boosting technique" },
                        detailed_steps: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              step_number: { type: "integer" },
                              action: { type: "string" },
                              timing: { type: "string", description: "e.g., 'Morning 6-8 AM' or 'Evening 4-6 PM'" },
                              weather_condition: { type: "string" },
                              tools_needed: { type: "string" }
                            }
                          },
                          description: "5-7 detailed steps with timing and tools"
                        },
                        product_recommendations: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              product_name: { type: "string" },
                              product_type: { type: "string", enum: ["organic", "growth_promoter", "fertilizer", "pesticide"] },
                              active_ingredient: { type: "string" },
                              dose_per_acre: { type: "string" },
                              application_method: { type: "string", description: "spray/drench/broadcast/soil application" },
                              timing: { type: "string", description: "Best time to apply (morning/evening, crop stage)" },
                              precautions: { type: "string" },
                              weather_conditions: { type: "string", description: "Avoid rain, avoid hot sun, etc." },
                              price_estimate: { type: "number" },
                              phi_days: { type: "integer", description: "Pre-harvest interval for pesticides" }
                            }
                          }
                        },
                        product_cost: { type: "number" },
                        labor_days: { type: "number" },
                        labor_cost: { type: "number" },
                        spraying_cost: { type: "number" },
                        machinery_cost: { type: "number" },
                        estimated_cost: { type: "number" },
                        cost_breakdown: { type: "string" },
                        instructions: { type: "array", items: { type: "string" } },
                        precautions: { type: "array", items: { type: "string" } },
                        weather_dependent: { type: "boolean" },
                      },
                      required: ["task_name", "stage_key", "stage_order", "category", "days_from_sowing", "priority", 
                                "description", "yield_impact", "skip_penalty", "estimated_cost", "cost_breakdown", 
                                "instructions", "precautions"],
                    },
                  },
                },
                required: ["crop_name", "total_duration_days", "tasks", "stages_covered", "yield_multiplier_target"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_stage_based_schedule" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("❌ AI error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const message = aiData.choices[0].message;

    if (!message.tool_calls?.[0]) {
      throw new Error("AI did not return structured schedule");
    }

    const scheduleData = JSON.parse(message.tool_calls[0].function.arguments);
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks covering ${scheduleData.stages_covered?.length || 0} stages`);

    if (!scheduleData.tasks?.length) {
      throw new Error("AI returned empty schedule");
    }

    // ═══════════════════════════════════════════════════════════════════
    // POST-PROCESS: Validate stage coverage and costs
    // ═══════════════════════════════════════════════════════════════════
    const stagesCovered = new Set(scheduleData.tasks.map((t: any) => t.stage_key));
    const missingStages = farmingStages.filter((s: FarmingStage) => !stagesCovered.has(s.stage_key));
    
    if (missingStages.length > 0) {
      console.warn(`⚠️ Missing stages: ${missingStages.map((s: FarmingStage) => s.stage_key).join(", ")}`);
    }

    let totalLaborCost = 0;
    let totalMaterialCost = 0;
    const costByStage: Record<string, number> = {};
    const costByCategory: Record<string, number> = {
      seed: seedCost,
      organic: fymCost,
      growth_promoter: 0,
      fertilizer: 0,
      pesticide: 0,
      labor: 0,
      irrigation: 0,
      machinery: 0,
    };

    const processedTasks = scheduleData.tasks.map((task: any, idx: number) => {
      const category = task.category || "other";
      const stageKey = task.stage_key || "vegetative_growth";
      
      // Find matching stage
      const matchingStage = farmingStages.find((s: FarmingStage) => s.stage_key === stageKey);
      const stageName = matchingStage?.stage_name || stageKey;
      const stageOrder = matchingStage?.stage_order || task.stage_order || 5;

      // Calculate costs
      const costResult = calculateTaskCost(
        category, task.task_name, landAreaAcres, laborRate,
        seedCost, totalFertilizerCost, fymCost, language
      );

      totalLaborCost += costResult.laborCost;
      totalMaterialCost += costResult.productCost;

      // Track stage costs
      if (!costByStage[stageKey]) costByStage[stageKey] = 0;
      costByStage[stageKey] += costResult.totalCost;

      // Track category costs
      if (category === "fertilizer") costByCategory.fertilizer += costResult.productCost;
      if (category === "growth_promoter") costByCategory.growth_promoter += costResult.productCost;
      if (category === "pest_control" || category === "disease_control") costByCategory.pesticide += costResult.productCost;
      costByCategory.labor += costResult.laborCost;

      return {
        ...task,
        stage_key: stageKey,
        stage_order: stageOrder,
        stage_name: stageName,
        product_cost: costResult.productCost,
        labor_cost: costResult.laborCost,
        labor_days: costResult.laborDays,
        estimated_cost: costResult.totalCost,
        cost_breakdown: costResult.breakdown,
        product_recommendations: task.product_recommendations || [],
      };
    });

    // Sort by stage order and days from sowing
    processedTasks.sort((a: any, b: any) => {
      if (a.stage_order !== b.stage_order) return a.stage_order - b.stage_order;
      return a.days_from_sowing - b.days_from_sowing;
    });

    const correctedTotalCost = totalLaborCost + totalMaterialCost;

    // ═══════════════════════════════════════════════════════════════════
    // SAVE TO DATABASE
    // ═══════════════════════════════════════════════════════════════════
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: cropName,
        crop_variety: cropVariety || cropName,
        sowing_date: sowingDate,
        regional_dialect_zone: region,
        district_name: district,
        taluka_name: land.taluka || null,
        total_estimated_cost: correctedTotalCost,
        total_labor_cost: totalLaborCost,
        total_material_cost: totalMaterialCost,
        expected_yield_quintals: scheduleData.expected_yield_quintals,
        expected_profit: scheduleData.expected_profit || (scheduleData.expected_yield_quintals * 2500 - correctedTotalCost),
        ai_model: AI_CONFIG.MODEL,
        is_active: true,
        status: "active",
        generation_language: language,
        calculated_for_area_acres: landAreaAcres,
        total_duration_days: scheduleData.total_duration_days,
        seed_quantity_kg: exactSeedQty,
        fertilizer_n_kg: ureaKg * 0.46,
        fertilizer_p_kg: dapKg * 0.46,
        fertilizer_k_kg: mopKg * 0.60,
        organic_manure_kg: fymTons * 1000,
        suitability_score: suitabilityCheck.score,
        suitability_warnings: suitabilityCheck.warnings || [],
        recommendation_order: "organic → growth_promoter → fertilizer → pesticide",
        state_region: state,
        labor_rate_used: laborRate,
        // New stage-based fields
        cost_by_stage: costByStage,
        cost_by_category: costByCategory,
        yield_multiplier_target: scheduleData.yield_multiplier_target || 3,
        yield_boosting_techniques: scheduleData.yield_boosting_techniques || [],
        stages_covered: [...stagesCovered],
        products_recommended_count: processedTasks.reduce((sum: number, t: any) => sum + (t.product_recommendations?.length || 0), 0),
        // New farming type and water fields
        farming_type: farmingType,
        water_requirement_liters_total: landAreaAcres * 50000 * (land.irrigation_type === 'drip' ? 0.6 : 1),
        water_per_irrigation_liters: landAreaAcres * 5000 * (land.irrigation_type === 'drip' ? 0.6 : 1),
        irrigation_count_total: Math.round(scheduleData.total_duration_days / 7),
        weather_auto_update_enabled: true,
        is_training_candidate: true,
        training_processed: false,
        tasks_total_count: processedTasks.length,
        tasks_completed_count: 0,
        tasks_on_time_count: 0,
        metadata: {
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          fertilizer_data: { urea_kg: ureaKg, dap_kg: dapKg, mop_kg: mopKg, fym_tons: fymTons },
          yield_boost_strategy: "9-stage-sequential",
          ai_version: AI_CONFIG.MODEL,
          generation_timestamp: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (scheduleError) {
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    // Save tasks with stage information
    const tasksToInsert = processedTasks.map((task: any, idx: number) => ({
      schedule_id: savedSchedule.id,
      farmer_id: farmerId,
      tenant_id: tenantId,
      task_name: task.task_name,
      task_type: task.category || "general",
      task_date: new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      days_from_sowing: task.days_from_sowing,
      priority: task.priority || "medium",
      task_description: task.description || "",
      instructions: task.instructions || [],
      precautions: task.precautions || [],
      weather_dependent: task.weather_dependent || false,
      status: "pending",
      sequence_order: idx + 1,
      // Stage-based fields
      stage_key: task.stage_key,
      stage_order: task.stage_order,
      stage_name: task.stage_name,
      yield_impact: task.yield_impact,
      skip_penalty: task.skip_penalty,
      yield_boost_technique: task.yield_boost_technique,
      product_recommendations: task.product_recommendations || [],
      resources: {
        quantity: task.quantity,
        product_details: task.product_details,
        product_cost: task.product_cost,
        labor_days: task.labor_days,
        labor_cost: task.labor_cost,
        spraying_cost: task.spraying_cost,
        machinery_cost: task.machinery_cost,
        cost_breakdown: task.cost_breakdown,
      },
      estimated_cost: task.estimated_cost || 0,
      currency: "INR",
    }));

    const { data: insertedTasks, error: tasksError } = await supabase
      .from("schedule_tasks")
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error("❌ Tasks insert error:", tasksError);
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} stage-based tasks`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Stage-based schedule complete in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        landId,
        farmerId,
        tenantId,
        cropName,
        cropVariety: cropVariety || cropName,
        sowingDate,
        suitability: {
          score: suitabilityCheck.score,
          suitable: suitabilityCheck.isSuitable,
          warnings: suitabilityCheck.warnings,
        },
        stages: {
          total: farmingStages.length,
          covered: stagesCovered.size,
          missing: missingStages.map((s: FarmingStage) => s.stage_key),
          costByStage,
        },
        tasks: {
          total: processedTasks.length,
          categories: [...new Set(processedTasks.map((t: any) => t.category))],
          durationDays: scheduleData.total_duration_days,
        },
        costs: {
          total: correctedTotalCost,
          labor: totalLaborCost,
          material: totalMaterialCost,
          byCategory: costByCategory,
          byStage: costByStage,
          currency: "INR",
        },
        yield: {
          expectedQuintals: scheduleData.expected_yield_quintals,
          multiplierTarget: scheduleData.yield_multiplier_target || 3,
          boostingTechniques: scheduleData.yield_boosting_techniques || [],
          expectedProfit: scheduleData.expected_profit,
        },
        inputs: {
          seed: { quantityKg: exactSeedQty, ratePerAcre: seedData.rate_kg_per_acre },
          fertilizer: { ureaKg, dapKg, mopKg },
          organic: { fymTons },
        },
        context: {
          landAreaAcres,
          state,
          laborRate,
          language,
          irrigationType: land.irrigation_type || "manual",
        },
        recommendationOrder: "organic → growth_promoter → fertilizer → pesticide",
        aiModel: AI_CONFIG.MODEL,
        executionTimeMs: executionTime,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ [AI-Schedule] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Schedule generation failed",
        executionTimeMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
