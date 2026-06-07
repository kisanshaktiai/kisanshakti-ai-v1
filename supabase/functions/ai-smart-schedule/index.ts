import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { 
  AI_CONFIG, 
  AIProvider, 
  getAPIEndpoint, 
  getAPIKey, 
  getModel, 
  buildAIRequest,
  getProviderFromModel 
} from "../_shared/aiConfig.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { loadVarietyProfile, formatVarietyProfileForPrompt, type VarietyProfile } from "../_shared/variety-context.ts";
import { applyVarietyOverrides } from "./variety-aware-planner.ts";

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

// ═══════════════════════════════════════════════════════════════════════
// CROP NAME TRANSLATIONS - MINIMAL FALLBACK
// Authoritative source is the `crops.label_*` columns in DB (queried at runtime).
// This 5-row fallback only kicks in if the DB lookup fails for very common crops.
// ═══════════════════════════════════════════════════════════════════════
const CROP_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { wheat: "Wheat", rice: "Rice", cotton: "Cotton", sugarcane: "Sugarcane", maize: "Maize" },
  hi: { wheat: "गेहूं", rice: "धान/चावल", cotton: "कपास", sugarcane: "गन्ना", maize: "मक्का" },
  mr: { wheat: "गहू", rice: "भात/तांदूळ", cotton: "कापूस", sugarcane: "ऊस", maize: "मका" },
};

// Function to get translated crop name (DB lookup happens upstream; this is fallback only)
function getTranslatedCropName(cropName: string, language: string): string {
  const cropKey = cropName.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  const langDict = CROP_TRANSLATIONS[language] || CROP_TRANSLATIONS["en"];

  // Try exact match first
  if (langDict[cropKey]) return langDict[cropKey];

  // Try partial match
  for (const [key, value] of Object.entries(langDict)) {
    if (cropKey.includes(key) || key.includes(cropKey)) {
      return value;
    }
  }

  // If no translation found, return original with first letter capitalized
  return cropName.charAt(0).toUpperCase() + cropName.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════
// FARMING TYPE VALIDATION - STRICT ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════
const FARMING_TYPE_BANNED_WORDS: Record<string, string[]> = {
  organic_only: [
    "urea",
    "dap",
    "mop",
    "ssp",
    "npk",
    "यूरिया",
    "डीएपी",
    "युरिया",
    "imidacloprid",
    "chlorpyriphos",
    "thiamethoxam",
    "carbendazim",
    "mancozeb",
    "chemical",
    "रासायनिक",
    "रासायनिक खाद",
    "chemical fertilizer",
    "insecticide",
    "fungicide",
    "कीटनाशक",
    "फफूंदनाशक",
    "किडीनाशक",
    "बुरशीनाशक",
  ],
  fertilizer_pesticide: [], // No banned words for this mode
  organic_fertilizer: [], // No banned words for this mode
};

const FARMING_TYPE_REQUIRED_WORDS: Record<string, string[]> = {
  organic_only: [
    "organic",
    "जैविक",
    "सेंद्रिय",
    "देशी",
    "natural",
    "bio",
    "neem",
    "trichoderma",
    "fym",
    "vermicompost",
    "jeevamrut",
    "गोबर",
    "शेणखत",
    "गांडूळ",
    "नीम",
    "ट्रायकोडर्मा",
  ],
  fertilizer_pesticide: [
    "urea",
    "dap",
    "mop",
    "fertilizer",
    "pesticide",
    "यूरिया",
    "डीएपी",
    "खाद",
    "कीटनाशक",
    "युरिया",
    "खत",
  ],
  organic_fertilizer: [], // Balanced, no strict requirements
};

function validateTaskForFarmingType(
  task: any,
  farmingType: string,
  language: string,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const bannedWords = FARMING_TYPE_BANNED_WORDS[farmingType] || [];

  const taskText = [
    task.task_name || "",
    task.description || "",
    JSON.stringify(task.product_recommendations || []),
    (task.instructions || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  // Check for banned words
  for (const banned of bannedWords) {
    if (taskText.includes(banned.toLowerCase())) {
      issues.push(`Contains banned term "${banned}" for ${farmingType} mode`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function fixTaskForFarmingType(task: any, farmingType: string, language: string, translatedCropName: string): any {
  if (farmingType !== "organic_only") return task;

  const organicReplacements: Record<string, { name: string; type: string }> = {
    urea: {
      name: language === "mr" ? "गांडूळ खत" : language === "hi" ? "केंचुआ खाद" : "Vermicompost",
      type: "organic",
    },
    dap: { name: language === "mr" ? "शेणखत" : language === "hi" ? "गोबर की खाद" : "FYM", type: "organic" },
    mop: { name: language === "mr" ? "राख" : language === "hi" ? "राख" : "Wood Ash", type: "organic" },
    imidacloprid: {
      name: language === "mr" ? "कडुनिंबाचे तेल" : language === "hi" ? "नीम का तेल" : "Neem Oil",
      type: "organic",
    },
    chlorpyriphos: {
      name: language === "mr" ? "ब्युवेरिया" : language === "hi" ? "ब्यूवेरिया" : "Beauveria bassiana",
      type: "organic",
    },
    carbendazim: {
      name: language === "mr" ? "ट्रायकोडर्मा" : language === "hi" ? "ट्राइकोडर्मा" : "Trichoderma viride",
      type: "organic",
    },
    mancozeb: {
      name: language === "mr" ? "स्यूडोमोनास" : language === "hi" ? "स्यूडोमोनास" : "Pseudomonas fluorescens",
      type: "organic",
    },
  };

  // Fix product recommendations
  if (task.product_recommendations) {
    task.product_recommendations = task.product_recommendations.map((prod: any) => {
      const prodNameLower = (prod.product_name || "").toLowerCase();
      for (const [chemical, organic] of Object.entries(organicReplacements)) {
        if (prodNameLower.includes(chemical)) {
          return {
            ...prod,
            product_name: organic.name,
            product_type: organic.type,
            active_ingredient: "100% organic/natural",
            precautions:
              language === "mr"
                ? "सुरक्षित, कोणतीही रासायनिक हानी नाही"
                : language === "hi"
                  ? "सुरक्षित, कोई रासायनिक नुकसान नहीं"
                  : "Safe, no chemical harm",
          };
        }
      }
      return prod;
    });
  }

  return task;
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATE CROP NAME IN TASK - CRITICAL FIX
// ═══════════════════════════════════════════════════════════════════════
function validateAndFixTaskCropName(
  task: any,
  translatedCropName: string,
  originalCropName: string,
  language: string,
): any {
  const taskName = task.task_name || "";

  // Get all possible crop names to check against
  const allCropNames = Object.values(CROP_TRANSLATIONS).flatMap((dict) => Object.values(dict));

  // Check if task name contains a WRONG crop name
  let hasWrongCrop = false;
  let wrongCropFound = "";

  for (const cropName of allCropNames) {
    if (cropName.length > 2 && taskName.includes(cropName)) {
      // Check if this is NOT the correct crop
      const correctCropLower = translatedCropName.toLowerCase();
      const originalLower = originalCropName.toLowerCase();
      const foundLower = cropName.toLowerCase();

      if (
        !correctCropLower.includes(foundLower) &&
        !foundLower.includes(correctCropLower) &&
        !originalLower.includes(foundLower) &&
        !foundLower.includes(originalLower)
      ) {
        hasWrongCrop = true;
        wrongCropFound = cropName;
        break;
      }
    }
  }

  // Fix the task name if it has wrong crop
  if (hasWrongCrop) {
    console.warn(
      `⚠️ [CropFix] Replacing wrong crop "${wrongCropFound}" with correct crop "${translatedCropName}" in task: ${taskName}`,
    );
    task.task_name = taskName.replace(wrongCropFound, translatedCropName);

    // Also fix description if it has wrong crop
    if (task.description && task.description.includes(wrongCropFound)) {
      task.description = task.description.split(wrongCropFound).join(translatedCropName);
    }
  }

  // Ensure crop name is present in task name
  if (!taskName.includes(translatedCropName) && !taskName.includes(originalCropName)) {
    // Add crop name to task if missing
    task.task_name = `${translatedCropName} - ${taskName}`;
  }

  return task;
}

// Yield boosting techniques per stage (3x-7x yield potential)
const YIELD_BOOST_TECHNIQUES: Record<
  string,
  {
    techniques: string[];
    yieldImpact: string;
    skipPenalty: string;
  }
> = {
  planning: {
    techniques: [
      "High-yielding certified seed selection",
      "Soil test-based planning",
      "Optimal sowing window calculation",
    ],
    yieldImpact: "Foundation for 3x-7x yield - wrong variety can waste entire season",
    skipPenalty: "50% yield loss risk with wrong variety/timing",
  },
  land_preparation: {
    techniques: [
      "Deep plowing 25-30cm for root development",
      "FYM/compost 5-10 tons/acre",
      "Soil pH correction with lime/gypsum",
      "Green manure incorporation",
    ],
    yieldImpact: "30% yield boost from improved soil structure & fertility",
    skipPenalty: "Poor root development, nutrient lockout, 20-30% yield loss",
  },
  sowing: {
    techniques: [
      "Optimal seed rate (not over/under)",
      "Correct spacing for light & air",
      "Seed treatment with Trichoderma/Rhizobium",
      "Line sowing for intercultural ops",
    ],
    yieldImpact: "25% yield boost from proper plant population & treated seeds",
    skipPenalty: "Uneven crop stand, disease entry, 15-25% yield loss",
  },
  germination: {
    techniques: [
      "Gap filling within 7-10 days",
      "Bird scaring devices",
      "Moisture conservation mulching",
      "Early pest scouting",
    ],
    yieldImpact: "15% yield protection through uniform crop establishment",
    skipPenalty: "Uneven stand, pest damage, 10-20% yield loss",
  },
  vegetative_growth: {
    techniques: [
      "Split nitrogen application (30% basal, 40% tillering, 30% panicle)",
      "Growth promoters (seaweed/humic acid)",
      "Timely weeding before 25 DAS",
      "Micronutrient sprays (Zn/Fe)",
    ],
    yieldImpact: "40% yield boost from optimized nutrition & weed-free crop",
    skipPenalty: "Stunted growth, weed competition, 30-40% yield loss",
  },
  reproductive: {
    techniques: [
      "Micronutrient spray (Boron/Zinc) at flowering",
      "IPM-based pest monitoring",
      "Optimal irrigation at critical stage",
      "Growth regulators for fruit set",
    ],
    yieldImpact: "35% yield boost from maximum flower/fruit retention",
    skipPenalty: "Flower drop, poor grain filling, 25-40% yield loss",
  },
  maturity: {
    techniques: [
      "Stop irrigation 15-20 days before harvest",
      "Monitor grain moisture (20-22%)",
      "Potash spray for grain filling",
      "Disease prevention for storage quality",
    ],
    yieldImpact: "20% yield boost from proper grain filling & quality",
    skipPenalty: "Shriveled grains, low test weight, 15-20% yield loss",
  },
  harvest: {
    techniques: [
      "Harvest at optimal moisture (14-18%)",
      "Minimize shattering losses",
      "Timely cutting before over-ripening",
      "Clean harvesting equipment",
    ],
    yieldImpact: "15% yield protection through loss prevention",
    skipPenalty: "Shattering, spoilage, 10-20% harvest loss",
  },
  post_harvest: {
    techniques: [
      "Proper sun drying to 12-13% moisture",
      "Grading for premium price",
      "Scientific storage (fumigation)",
      "Market timing for best price",
    ],
    yieldImpact: "25% income boost through quality & market timing",
    skipPenalty: "Storage loss, low price, 20-30% income loss",
  },
  fallow_restoration: {
    techniques: [
      "Green manuring with Dhaincha/Sunhemp",
      "Crop rotation planning",
      "Soil testing for next crop",
      "Deep plowing for aeration",
      "Organic matter incorporation",
    ],
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
  hi: "Hindi",
  mr: "Marathi",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  gu: "Gujarati",
  kn: "Kannada",
  en: "English",
};

// Rural village language dictionary - DO NOT use formal/English terms
const RURAL_TERMS: Record<string, Record<string, string>> = {
  hi: {
    fertilizer: "खाद",
    urea: "यूरिया खाद",
    dap: "डीएपी खाद",
    irrigation: "पानी देना",
    pesticide: "कीड़े की दवा",
    fungicide: "फफूंद की दवा",
    spray: "छिड़काव",
    sowing: "बुवाई/बीज बोना",
    weeding: "निराई-गुड़ाई",
    harvesting: "कटाई",
    transplanting: "रोपाई",
    seeds: "बीज",
    seedlings: "पौधे/रोपे",
    organic: "देसी/जैविक",
    fym: "गोबर की खाद/सड़ी खाद",
    vermicompost: "केंचुआ खाद",
    neem: "नीम का तेल",
    soil: "मिट्टी",
    water: "पानी",
    field: "खेत",
    morning: "सुबह जल्दी",
    evening: "शाम को",
    sunlight: "धूप",
    rain: "बारिश",
    growth: "बढ़वार",
    pest: "कीड़े-मकोड़े",
    disease: "बीमारी/रोग",
    labor: "मजदूरी",
    cost: "खर्चा",
    yield: "पैदावार",
    profit: "मुनाफा",
    stage: "चरण",
    planning: "योजना",
    preparation: "तैयारी",
  },
  mr: {
    fertilizer: "खत",
    urea: "युरिया खत",
    dap: "डीएपी खत",
    irrigation: "पाणी देणे",
    pesticide: "किडीची औषध",
    fungicide: "बुरशीची औषध",
    spray: "फवारणी",
    sowing: "पेरणी",
    weeding: "निंदणी/खुरपणी",
    harvesting: "कापणी",
    transplanting: "लागवड/रोपणी",
    seeds: "बियाणे",
    seedlings: "रोपे",
    organic: "सेंद्रिय/देशी",
    fym: "शेणखत/गोठ्याचे खत",
    vermicompost: "गांडूळ खत",
    neem: "कडुनिंबाचे तेल",
    soil: "माती/जमीन",
    water: "पाणी",
    field: "शेत",
    morning: "सकाळी लवकर",
    evening: "संध्याकाळी",
    sunlight: "ऊन",
    rain: "पाऊस",
    growth: "वाढ",
    pest: "किडी",
    disease: "रोग",
    labor: "मजुरी",
    cost: "खर्च",
    yield: "उत्पादन",
    profit: "नफा",
    stage: "टप्पा",
    planning: "नियोजन",
    preparation: "तयारी",
  },
  pa: {
    fertilizer: "ਖਾਦ",
    urea: "ਯੂਰੀਆ ਖਾਦ",
    dap: "ਡੀਏਪੀ ਖਾਦ",
    irrigation: "ਪਾਣੀ ਦੇਣਾ",
    pesticide: "ਕੀੜੇ ਦੀ ਦਵਾਈ",
    fungicide: "ਫੰਗਸ ਦੀ ਦਵਾਈ",
    spray: "ਸਪਰੇਅ",
    sowing: "ਬਿਜਾਈ",
    weeding: "ਗੋਡਾਈ/ਨਦੀਨ ਕੱਢਣਾ",
    harvesting: "ਵਾਢੀ",
    transplanting: "ਲਾਉਣਾ",
    seeds: "ਬੀਜ",
    seedlings: "ਬੂਟੇ",
    organic: "ਦੇਸੀ/ਜੈਵਿਕ",
    fym: "ਰੂੜੀ ਦੀ ਖਾਦ",
    vermicompost: "ਕੀੜੇ ਦੀ ਖਾਦ",
    neem: "ਨਿੰਮ ਦਾ ਤੇਲ",
    soil: "ਮਿੱਟੀ",
    water: "ਪਾਣੀ",
    field: "ਖੇਤ",
    morning: "ਸਵੇਰੇ",
    evening: "ਸ਼ਾਮੀਂ",
    sunlight: "ਧੁੱਪ",
    rain: "ਮੀਂਹ",
    growth: "ਵਾਧਾ",
    pest: "ਕੀੜੇ",
    disease: "ਬਿਮਾਰੀ/ਰੋਗ",
    labor: "ਮਜ਼ਦੂਰੀ",
    cost: "ਖਰਚਾ",
    yield: "ਝਾੜ",
    profit: "ਮੁਨਾਫ਼ਾ",
    stage: "ਪੜਾਅ",
    planning: "ਯੋਜਨਾ",
    preparation: "ਤਿਆਰੀ",
  },
  ta: {
    fertilizer: "உரம்",
    urea: "யூரியா உரம்",
    dap: "டிஏபி உரம்",
    irrigation: "தண்ணீர் பாய்ச்சுதல்",
    pesticide: "பூச்சிக்கொல்லி",
    fungicide: "பூஞ்சாணக்கொல்லி",
    spray: "தெளிப்பு",
    sowing: "விதைப்பு",
    weeding: "களை எடுத்தல்",
    harvesting: "அறுவடை",
    transplanting: "நடவு",
    seeds: "விதைகள்",
    seedlings: "நாற்றுகள்",
    organic: "இயற்கை",
    fym: "சாணம்/தொழுவுரம்",
    vermicompost: "மண்புழு உரம்",
    neem: "வேப்பெண்ணெய்",
    soil: "மண்",
    water: "தண்ணீர்",
    field: "வயல்",
    morning: "காலையில்",
    evening: "மாலையில்",
    sunlight: "வெயில்",
    rain: "மழை",
    growth: "வளர்ச்சி",
    pest: "பூச்சிகள்",
    disease: "நோய்",
    labor: "கூலி",
    cost: "செலவு",
    yield: "மகசூல்",
    profit: "லாபம்",
    stage: "நிலை",
    planning: "திட்டமிடல்",
    preparation: "தயாரிப்பு",
  },
  te: {
    fertilizer: "ఎరువు",
    urea: "యూరియా ఎరువు",
    dap: "డీఏపీ ఎరువు",
    irrigation: "నీరు పెట్టడం",
    pesticide: "పురుగుల మందు",
    fungicide: "తెగులు మందు",
    spray: "పిచికారీ",
    sowing: "విత్తనం వేయడం",
    weeding: "కలుపు తీయడం",
    harvesting: "కోత",
    transplanting: "నాట్లు వేయడం",
    seeds: "విత్తనాలు",
    seedlings: "మొక్కలు",
    organic: "సేంద్రియ/దేశీ",
    fym: "పశువుల పేడ/పెంట ఎరువు",
    vermicompost: "వర్మీ కంపోస్ట్",
    neem: "వేప నూనె",
    soil: "నేల/మట్టి",
    water: "నీరు",
    field: "పొలం",
    morning: "పొద్దున",
    evening: "సాయంత్రం",
    sunlight: "ఎండ",
    rain: "వర్షం",
    growth: "పెరుగుదల",
    pest: "పురుగులు",
    disease: "తెగులు/వ్యాధి",
    labor: "కూలి",
    cost: "ఖర్చు",
    yield: "దిగుబడి",
    profit: "లాభం",
    stage: "దశ",
    planning: "ప్రణాళిక",
    preparation: "సన్నాహం",
  },
  bn: {
    fertilizer: "সার",
    urea: "ইউরিয়া সার",
    dap: "ডিএপি সার",
    irrigation: "জল দেওয়া/সেচ",
    pesticide: "কীটনাশক",
    fungicide: "ছত্রাকনাশক",
    spray: "স্প্রে/ছিটানো",
    sowing: "বপন",
    weeding: "আগাছা তোলা",
    harvesting: "ফসল কাটা",
    transplanting: "রোপণ",
    seeds: "বীজ",
    seedlings: "চারা",
    organic: "জৈব/দেশী",
    fym: "গোবর সার",
    vermicompost: "কেঁচো সার",
    neem: "নিম তেল",
    soil: "মাটি",
    water: "জল",
    field: "জমি/ক্ষেত",
    morning: "সকালে",
    evening: "সন্ধ্যায়",
    sunlight: "রোদ",
    rain: "বৃষ্টি",
    growth: "বৃদ্ধি",
    pest: "পোকামাকড়",
    disease: "রোগ",
    labor: "মজুরি",
    cost: "খরচ",
    yield: "ফলন",
    profit: "লাভ",
    stage: "পর্যায়",
    planning: "পরিকল্পনা",
    preparation: "প্রস্তুতি",
  },
  gu: {
    fertilizer: "ખાતર",
    urea: "યુરિયા ખાતર",
    dap: "ડીએપી ખાતર",
    irrigation: "પાણી આપવું",
    pesticide: "જીવાતની દવા",
    fungicide: "ફૂગની દવા",
    spray: "છંટકાવ",
    sowing: "વાવણી",
    weeding: "નીંદામણ",
    harvesting: "લણણી",
    transplanting: "રોપણી",
    seeds: "બીજ",
    seedlings: "રોપા",
    organic: "જૈવિક/દેશી",
    fym: "છાણીયું ખાતર",
    vermicompost: "અળસિયાનું ખાતર",
    neem: "લીમડાનું તેલ",
    soil: "માટી/જમીન",
    water: "પાણી",
    field: "ખેતર",
    morning: "સવારે",
    evening: "સાંજે",
    sunlight: "તડકો",
    rain: "વરસાદ",
    growth: "વૃદ્ધિ",
    pest: "જીવાત",
    disease: "રોગ",
    labor: "મજૂરી",
    cost: "ખર્ચ",
    yield: "ઉત્પાદન",
    profit: "નફો",
    stage: "તબક્કો",
    planning: "આયોજન",
    preparation: "તૈયારી",
  },
  kn: {
    fertilizer: "ಗೊಬ್ಬರ",
    urea: "ಯೂರಿಯಾ ಗೊಬ್ಬರ",
    dap: "ಡಿಎಪಿ ಗೊಬ್ಬರ",
    irrigation: "ನೀರು ಕೊಡುವುದು",
    pesticide: "ಕೀಟನಾಶಕ",
    fungicide: "ಶಿಲೀಂಧ್ರನಾಶಕ",
    spray: "ಸಿಂಪಡಣೆ",
    sowing: "ಬಿತ್ತನೆ",
    weeding: "ಕಳೆ ಕೀಳುವುದು",
    harvesting: "ಕೊಯ್ಲು",
    transplanting: "ನಾಟಿ",
    seeds: "ಬೀಜಗಳು",
    seedlings: "ಸಸಿಗಳು",
    organic: "ಸಾವಯವ/ದೇಸಿ",
    fym: "ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ",
    vermicompost: "ಎರೆಹುಳು ಗೊಬ್ಬರ",
    neem: "ಬೇವಿನ ಎಣ್ಣೆ",
    soil: "ಮಣ್ಣು",
    water: "ನೀರು",
    field: "ಹೊಲ",
    morning: "ಬೆಳಗ್ಗೆ",
    evening: "ಸಂಜೆ",
    sunlight: "ಬಿಸಿಲು",
    rain: "ಮಳೆ",
    growth: "ಬೆಳವಣಿಗೆ",
    pest: "ಕೀಟಗಳು",
    disease: "ರೋಗ",
    labor: "ಕೂಲಿ",
    cost: "ವೆಚ್ಚ",
    yield: "ಇಳುವರಿ",
    profit: "ಲಾಭ",
    stage: "ಹಂತ",
    planning: "ಯೋಜನೆ",
    preparation: "ತಯಾರಿ",
  },
  en: {
    fertilizer: "manure/fertilizer",
    urea: "urea",
    dap: "DAP",
    irrigation: "watering",
    pesticide: "pest medicine",
    fungicide: "disease medicine",
    spray: "spraying",
    sowing: "sowing",
    weeding: "weeding",
    harvesting: "harvesting",
    transplanting: "transplanting",
    seeds: "seeds",
    seedlings: "seedlings",
    organic: "organic/natural",
    fym: "farmyard manure",
    vermicompost: "vermicompost",
    neem: "neem oil",
    soil: "soil",
    water: "water",
    field: "field",
    morning: "early morning",
    evening: "evening",
    sunlight: "sunlight",
    rain: "rain",
    growth: "growth",
    pest: "pests",
    disease: "disease",
    labor: "labor",
    cost: "cost",
    yield: "yield",
    profit: "profit",
    stage: "stage",
    planning: "planning",
    preparation: "preparation",
  },
};

// ═══════════════════════════════════════════════════════════════════════
// REGIONAL DIALECT MAPPING (Maharashtra Districts)
// ═══════════════════════════════════════════════════════════════════════
const MAHARASHTRA_REGIONS: Record<string, string[]> = {
  vidarbha: [
    "Nagpur",
    "Amravati",
    "Akola",
    "Yavatmal",
    "Chandrapur",
    "Wardha",
    "Bhandara",
    "Gondia",
    "Gadchiroli",
    "Buldhana",
    "Washim",
  ],
  marathwada: [
    "Aurangabad",
    "Chhatrapati Sambhaji Nagar",
    "Latur",
    "Osmanabad",
    "Dharashiv",
    "Nanded",
    "Beed",
    "Parbhani",
    "Jalna",
    "Hingoli",
  ],
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
    if (districts.some((d) => districtLower.includes(d.toLowerCase()))) return region;
  }
  return "western_maha";
}

function getRegionalDialectTerms(language: string, region: string): Record<string, string> {
  const regionalTerms = REGIONAL_TERMS[language]?.[region];
  const baseTerms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
  if (!regionalTerms) return baseTerms;
  return { ...baseTerms, ...regionalTerms };
}

function buildRegionalLanguageRules(language: string, region: string, district: string): string {
  if (language !== "mr" || !REGIONAL_TERMS[language]?.[region]) return "";
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
📍 REGIONAL DIALECT (${district}, ${region.replace("_", " ").toUpperCase()}):
${termMappings.join("\n")}`;
}

// ═══════════════════════════════════════════════════════════════════════
// COST DATA & RATES (2024-25)
// ═══════════════════════════════════════════════════════════════════════
const STATE_LABOR_RATES: Record<string, number> = {
  Maharashtra: 310,
  "Madhya Pradesh": 243,
  Karnataka: 349,
  Haryana: 374,
  Punjab: 321,
  Gujarat: 311,
  Rajasthan: 266,
  "Uttar Pradesh": 237,
  Bihar: 245,
  "Tamil Nadu": 311,
  "Andhra Pradesh": 300,
  Telangana: 300,
  Kerala: 352,
  "West Bengal": 237,
  Odisha: 237,
  Jharkhand: 237,
  Chhattisgarh: 243,
  Assam: 238,
  "Himachal Pradesh": 266,
  Uttarakhand: 237,
  "Jammu and Kashmir": 266,
  Goa: 350,
  default: 290,
};

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
};

const GROWTH_PROMOTERS: Record<string, { price: number; unit: string; coverage_acre: number; use: string }> = {
  seaweed_extract: { price: 550, unit: "500ml", coverage_acre: 1, use: "Root development & stress tolerance" },
  humic_acid: { price: 480, unit: "1L", coverage_acre: 1, use: "Nutrient uptake & soil health" },
  amino_acid: { price: 620, unit: "1L", coverage_acre: 1, use: "Protein synthesis & growth" },
  fulvic_acid: { price: 520, unit: "500ml", coverage_acre: 1, use: "Nutrient transport" },
};

const FERTILIZER_PRICES: Record<string, { price_per_kg: number; bag_kg: number; nutrient_content: string }> = {
  urea: { price_per_kg: 6.5, bag_kg: 45, nutrient_content: "46% N" },
  dap: { price_per_kg: 30, bag_kg: 50, nutrient_content: "18% N, 46% P" },
  mop: { price_per_kg: 20, bag_kg: 50, nutrient_content: "60% K" },
  ssp: { price_per_kg: 9, bag_kg: 50, nutrient_content: "16% P" },
  "10-26-26": { price_per_kg: 32, bag_kg: 50, nutrient_content: "10% N, 26% P, 26% K" },
  zinc_sulphate: { price_per_kg: 110, bag_kg: 25, nutrient_content: "33% Zn" },
  borax: { price_per_kg: 150, bag_kg: 25, nutrient_content: "11% B" },
};

// ═══════════════════════════════════════════════════════════════════════
// SEED RATES & PRICES - UPDATED 2024-25 INDIAN MARKET RATES
// Sources: ICAR, Krishi Vigyan Kendras, State Seed Corporations
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// EXPERT CROP SCIENCE: NPK SPLIT APPLICATION SCHEDULE (3x-7x Yield)
// Based on ICAR/IARI research - Crop physiology based nutrition
// ═══════════════════════════════════════════════════════════════════════
const EXPERT_NPK_SPLIT_SCHEDULE: Record<string, {
  n_splits: Array<{ stage: string; percent: number; das_range: string; method: string; why: string }>;
  p_application: { timing: string; method: string; why: string };
  k_splits: Array<{ stage: string; percent: number; das_range: string; method: string; why: string }>;
  micronutrients: Array<{ nutrient: string; dose_per_acre: string; timing: string; method: string; deficiency_signs: string }>;
  growth_boosters: Array<{ name: string; dose_per_acre: string; timing: string; yield_impact: string }>;
}> = {
  wheat: {
    n_splits: [
      { stage: 'basal', percent: 33, das_range: '0 DAS', method: 'broadcasting', why: 'Root establishment' },
      { stage: 'crown_root', percent: 33, das_range: '21-25 DAS', method: 'top_dressing', why: 'Tillering boost - 50% yield decided here' },
      { stage: 'flag_leaf', percent: 34, das_range: '45-50 DAS', method: 'top_dressing', why: 'Grain protein & weight' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'drilling', why: 'P immobile in soil, must be near roots' },
    k_splits: [
      { stage: 'basal', percent: 50, das_range: '0 DAS', method: 'broadcasting', why: 'Root development' },
      { stage: 'flowering', percent: 50, das_range: '60-65 DAS', method: 'foliar_spray', why: 'Grain filling & lodging resistance' },
    ],
    micronutrients: [
      { nutrient: 'Zinc Sulphate', dose_per_acre: '10 kg soil + 0.5% foliar', timing: 'Basal + 45 DAS', method: 'soil + foliar', deficiency_signs: 'Khaira disease, stunted' },
      { nutrient: 'Iron Sulphate', dose_per_acre: '0.5% foliar', timing: '30 & 50 DAS', method: 'foliar_spray', deficiency_signs: 'Interveinal chlorosis' },
      { nutrient: 'Boron', dose_per_acre: '0.2% Borax', timing: '45-50 DAS', method: 'foliar_spray', deficiency_signs: 'Empty grains, poor pollination' },
    ],
    growth_boosters: [
      { name: 'Seaweed Extract', dose_per_acre: '500ml', timing: '25 & 50 DAS', yield_impact: '+15-20% tillering' },
      { name: 'Humic Acid', dose_per_acre: '1L', timing: 'With first irrigation', yield_impact: '+10-15% root mass' },
      { name: '0:52:34 (MKP)', dose_per_acre: '1kg foliar', timing: '70-80 DAS', yield_impact: '+12% grain weight' },
    ],
  },
  rice: {
    n_splits: [
      { stage: 'basal', percent: 25, das_range: '0-3 DAT', method: 'broadcasting', why: 'Initial establishment' },
      { stage: 'active_tillering', percent: 40, das_range: '21-25 DAT', method: 'top_dressing', why: 'Maximum tiller production' },
      { stage: 'panicle_initiation', percent: 35, das_range: '45-50 DAT', method: 'top_dressing', why: 'Spikelet number & filling' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'incorporation', why: 'P fixes quickly in flooded conditions' },
    k_splits: [
      { stage: 'basal', percent: 50, das_range: '0-3 DAT', method: 'broadcasting', why: 'Root & tiller development' },
      { stage: 'panicle', percent: 50, das_range: '45-50 DAT', method: 'top_dressing', why: 'Grain filling, disease resistance' },
    ],
    micronutrients: [
      { nutrient: 'Zinc Sulphate', dose_per_acre: '10 kg', timing: 'Basal', method: 'soil_application', deficiency_signs: 'Khaira - bronze/rusty leaves' },
      { nutrient: 'Iron Sulphate', dose_per_acre: '1% foliar', timing: '25 & 45 DAT', method: 'foliar_spray', deficiency_signs: 'Yellowing in alkaline soils' },
    ],
    growth_boosters: [
      { name: 'Silica (Potassium Silicate)', dose_per_acre: '2kg', timing: '30 DAT', yield_impact: '+20% lodging resistance' },
      { name: 'Seaweed Extract', dose_per_acre: '500ml', timing: '20 & 45 DAT', yield_impact: '+15% tiller count' },
    ],
  },
  cotton: {
    n_splits: [
      { stage: 'basal', percent: 20, das_range: '0 DAS', method: 'band_placement', why: 'Early vegetative' },
      { stage: 'squaring', percent: 30, das_range: '35-40 DAS', method: 'side_dressing', why: 'Square formation' },
      { stage: 'flowering', percent: 30, das_range: '60-70 DAS', method: 'fertigation/foliar', why: 'Boll retention' },
      { stage: 'boll_development', percent: 20, das_range: '90-100 DAS', method: 'foliar_spray', why: 'Boll weight' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'band_placement', why: 'Deep root P access' },
    k_splits: [
      { stage: 'basal', percent: 25, das_range: '0 DAS', method: 'broadcasting', why: 'Root development' },
      { stage: 'squaring', percent: 25, das_range: '35-40 DAS', method: 'side_dressing', why: 'Fiber initiation' },
      { stage: 'flowering', percent: 25, das_range: '60-70 DAS', method: 'fertigation', why: 'Boll retention' },
      { stage: 'boll_opening', percent: 25, das_range: '100-110 DAS', method: 'foliar_spray', why: 'Fiber quality' },
    ],
    micronutrients: [
      { nutrient: 'Magnesium Sulphate', dose_per_acre: '5kg soil + 1% foliar', timing: '40 & 70 DAS', method: 'soil + foliar', deficiency_signs: 'Reddening between veins' },
      { nutrient: 'Boron', dose_per_acre: '0.2% Borax', timing: '50 & 80 DAS', method: 'foliar_spray', deficiency_signs: 'Square/boll drop' },
      { nutrient: 'Zinc Sulphate', dose_per_acre: '0.5% foliar', timing: '30 & 60 DAS', method: 'foliar_spray', deficiency_signs: 'Bronzing, small leaves' },
    ],
    growth_boosters: [
      { name: 'NAA (Planofix)', dose_per_acre: '40ml', timing: '60 & 90 DAS', yield_impact: '+25% boll retention' },
      { name: 'Mepiquat Chloride', dose_per_acre: '250ml', timing: '80-90 DAS', yield_impact: 'Controls vegetative growth' },
    ],
  },
  sugarcane: {
    n_splits: [
      { stage: 'basal', percent: 10, das_range: '0 DAP', method: 'furrow_application', why: 'Germination' },
      { stage: 'tillering', percent: 30, das_range: '45-60 DAP', method: 'side_dressing', why: 'Tiller production' },
      { stage: 'grand_growth', percent: 35, das_range: '90-120 DAP', method: 'earthing_up', why: 'Cane elongation' },
      { stage: 'maturity', percent: 25, das_range: '150-180 DAP', method: 'fertigation', why: 'Sugar accumulation' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'furrow_application', why: 'Root zone placement' },
    k_splits: [
      { stage: 'basal', percent: 25, das_range: '0 DAP', method: 'furrow_application', why: 'Root development' },
      { stage: 'tillering', percent: 25, das_range: '45-60 DAP', method: 'side_dressing', why: 'Tiller strength' },
      { stage: 'grand_growth', percent: 25, das_range: '90-120 DAP', method: 'earthing_up', why: 'Cane quality' },
      { stage: 'maturity', percent: 25, das_range: '210-240 DAP', method: 'foliar_spray', why: 'Sugar recovery' },
    ],
    micronutrients: [
      { nutrient: 'Ferrous Sulphate', dose_per_acre: '25kg soil', timing: 'Basal', method: 'soil_application', deficiency_signs: 'Yellowing in ratoon' },
      { nutrient: 'Zinc Sulphate', dose_per_acre: '10kg', timing: 'Basal', method: 'soil_application', deficiency_signs: 'Stunted internodes' },
      { nutrient: 'Manganese Sulphate', dose_per_acre: '5kg', timing: '60 DAP', method: 'soil_application', deficiency_signs: 'Grey specks' },
    ],
    growth_boosters: [
      { name: 'Ethrel (Ethephon)', dose_per_acre: '200ml', timing: '30 days before harvest', yield_impact: '+1-2% sugar recovery' },
      { name: 'Gibberellic Acid', dose_per_acre: '35gm', timing: '90 & 150 DAP', yield_impact: '+15-20% cane weight' },
    ],
  },
  soybean: {
    n_splits: [
      { stage: 'starter', percent: 100, das_range: 'Basal only', method: 'band_placement', why: 'Starter dose only - Rhizobium fixes rest' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'band_placement', why: 'Nodulation & root development' },
    k_splits: [
      { stage: 'basal', percent: 50, das_range: '0 DAS', method: 'broadcasting', why: 'Root establishment' },
      { stage: 'pod_filling', percent: 50, das_range: '50-60 DAS', method: 'foliar_spray', why: 'Seed weight' },
    ],
    micronutrients: [
      { nutrient: 'Sulphur', dose_per_acre: '20kg Gypsum', timing: 'Basal', method: 'soil_application', deficiency_signs: 'Pale green, stunted' },
      { nutrient: 'Molybdenum', dose_per_acre: '50gm Ammonium Molybdate', timing: 'Seed treatment', method: 'seed_coating', deficiency_signs: 'Poor nodulation' },
      { nutrient: 'Boron', dose_per_acre: '0.2% Borax', timing: '35 & 55 DAS', method: 'foliar_spray', deficiency_signs: 'Hollow heart in seeds' },
    ],
    growth_boosters: [
      { name: 'Rhizobium Culture', dose_per_acre: '200gm/10kg seed', timing: 'Seed treatment', yield_impact: '+20-25% yield via N fixation' },
      { name: 'PSB Culture', dose_per_acre: '200gm/10kg seed', timing: 'Seed treatment', yield_impact: '+15% P availability' },
    ],
  },
  default: {
    n_splits: [
      { stage: 'basal', percent: 33, das_range: '0 DAS', method: 'broadcasting', why: 'Initial growth' },
      { stage: 'vegetative', percent: 33, das_range: '25-30 DAS', method: 'top_dressing', why: 'Vegetative growth' },
      { stage: 'reproductive', percent: 34, das_range: '50-60 DAS', method: 'top_dressing', why: 'Reproductive growth' },
    ],
    p_application: { timing: 'Basal (100%)', method: 'broadcasting', why: 'Root zone availability' },
    k_splits: [
      { stage: 'basal', percent: 50, das_range: '0 DAS', method: 'broadcasting', why: 'Root development' },
      { stage: 'reproductive', percent: 50, das_range: '50-60 DAS', method: 'top_dressing', why: 'Fruit/grain quality' },
    ],
    micronutrients: [
      { nutrient: 'Zinc Sulphate', dose_per_acre: '0.5% foliar', timing: '25 & 50 DAS', method: 'foliar_spray', deficiency_signs: 'Interveinal chlorosis' },
    ],
    growth_boosters: [
      { name: 'Seaweed Extract', dose_per_acre: '500ml', timing: '25 & 50 DAS', yield_impact: '+10-15% growth' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// EXPERT IPM THRESHOLDS - Economic Threshold Levels (ETL)
// Based on ICAR-NCIPM guidelines for decision-making
// ═══════════════════════════════════════════════════════════════════════
const IPM_THRESHOLDS: Record<string, Array<{
  pest: string;
  local_name: string;
  etl: string;
  monitoring_method: string;
  organic_control: string;
  chemical_control: string;
  critical_stage: string;
}>> = {
  cotton: [
    { pest: 'American Bollworm', local_name: 'अमेरिकी बोंडअळी', etl: '1 larva/plant or 5% damaged squares', monitoring_method: 'Pheromone trap: 8-10 moths/trap/week', organic_control: 'Trichogramma cards 50000/acre + NPV @ 250LE', chemical_control: 'Emamectin Benzoate 5SG @ 100gm/acre', critical_stage: 'Squaring to boll formation' },
    { pest: 'Pink Bollworm', local_name: 'गुलाबी बोंडअळी', etl: '8-10 moths/pheromone trap', monitoring_method: 'Pheromone trap weekly check', organic_control: 'Mass trapping + Bt spray', chemical_control: 'Profenofos 50EC @ 600ml/acre', critical_stage: 'Flowering onwards' },
    { pest: 'Whitefly', local_name: 'पांढरी माशी', etl: '5-10 adults/leaf or 30% honeydew', monitoring_method: 'Yellow sticky traps + visual count', organic_control: 'Neem oil 2% + Verticillium lecanii', chemical_control: 'Diafenthiuron 50WP @ 250gm/acre', critical_stage: 'Throughout' },
    { pest: 'Aphids', local_name: 'मावा', etl: '10-15% infested plants', monitoring_method: 'Visual observation on tender parts', organic_control: 'Neem soap spray + Ladybird beetle release', chemical_control: 'Imidacloprid 17.8SL @ 60ml/acre', critical_stage: 'Seedling & flowering' },
  ],
  rice: [
    { pest: 'Stem Borer', local_name: 'खोड किडा', etl: '5% dead hearts or 2% white ear', monitoring_method: 'Count dead hearts/white ears in 20 hills', organic_control: 'Trichogramma japonicum 50000/acre + Neem cake', chemical_control: 'Cartap Hydrochloride 4G @ 10kg/acre', critical_stage: 'Tillering & flowering' },
    { pest: 'BPH (Brown Planthopper)', local_name: 'तपकिरी फुदका', etl: '5-10 hoppers/hill', monitoring_method: 'Tap base of plant, count fallen hoppers', organic_control: 'Alternate wetting-drying + Neem oil', chemical_control: 'Pymetrozine 50WG @ 120gm/acre', critical_stage: 'Tillering to maturity' },
    { pest: 'Leaf Folder', local_name: 'पान गुंडाळ्या अळी', etl: '2 damaged leaves/hill', monitoring_method: 'Count folded leaves in 20 hills', organic_control: 'Bt spray + Trichogramma', chemical_control: 'Chlorantraniliprole 18.5SC @ 60ml/acre', critical_stage: 'Tillering' },
  ],
  wheat: [
    { pest: 'Aphids', local_name: 'माव्हा', etl: '5-10 aphids/ear', monitoring_method: 'Count on 10 random ears', organic_control: 'Neem oil 2% + Ladybird beetle', chemical_control: 'Thiamethoxam 25WG @ 50gm/acre', critical_stage: 'Ear emergence to milky stage' },
    { pest: 'Termites', local_name: 'वाळवी', etl: '5% damaged plants', monitoring_method: 'Check wilted/dead patches', organic_control: 'Neem cake 80kg/acre + flood irrigation', chemical_control: 'Chlorpyriphos 20EC @ 2L/acre (drench)', critical_stage: 'Seedling & grain filling' },
  ],
  sugarcane: [
    { pest: 'Early Shoot Borer', local_name: 'सुरुवातीचा खोड किडा', etl: '10% dead hearts', monitoring_method: 'Count dead hearts in 100 clumps', organic_control: 'Trichogramma chilonis 50000/acre', chemical_control: 'Chlorantraniliprole 0.4GR @ 8kg/acre', critical_stage: '1-3 months' },
    { pest: 'Internode Borer', local_name: 'कांडी पोखरणारी अळी', etl: '5% bored internodes', monitoring_method: 'Light trap: >25 moths/week', organic_control: 'Trichogramma + trash mulching', chemical_control: 'Monocrotophos 36SL @ 500ml/acre', critical_stage: '4-7 months' },
    { pest: 'Top Borer', local_name: 'शेंडा पोखरणारी अळी', etl: '5% dead hearts/bunchy top', monitoring_method: 'Count dead hearts + bunchy tops', organic_control: 'Detrashing + Trichogramma', chemical_control: 'Carbofuran 3G @ 13kg/acre', critical_stage: 'Grand growth' },
  ],
  soybean: [
    { pest: 'Girdle Beetle', local_name: 'देठ पोखरणारा भुंगा', etl: '2-3 girdled plants/meter row', monitoring_method: 'Count girdled stems in 5 spots', organic_control: 'Collection & destruction + Neem spray', chemical_control: 'Triazophos 40EC @ 400ml/acre', critical_stage: 'Flowering to pod formation' },
    { pest: 'Tobacco Caterpillar', local_name: 'तंबाखूची पाने खाणारी अळी', etl: '4-5 larvae/meter row or 25% defoliation', monitoring_method: 'Pheromone trap + visual', organic_control: 'NPV @ 250LE + Neem', chemical_control: 'Emamectin Benzoate 5SG @ 100gm/acre', critical_stage: 'Vegetative & pod filling' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// EXPERT DISEASE MANAGEMENT - Disease-specific recommendations
// ═══════════════════════════════════════════════════════════════════════
const DISEASE_MANAGEMENT: Record<string, Array<{
  disease: string;
  local_name: string;
  symptoms: string;
  favorable_conditions: string;
  organic_control: string;
  chemical_control: string;
  preventive_measures: string;
}>> = {
  wheat: [
    { disease: 'Yellow Rust', local_name: 'पिवळा तांबेरा', symptoms: 'Yellow stripes on leaves', favorable_conditions: 'Cool (10-15°C), humid weather', organic_control: 'Resistant varieties + Trichoderma', chemical_control: 'Propiconazole 25EC @ 200ml/acre at first sign', preventive_measures: 'Early sowing, resistant varieties (HD3086, DBW187)' },
    { disease: 'Loose Smut', local_name: 'कांगियारी', symptoms: 'Black powdery mass instead of grain', favorable_conditions: 'Seed-borne, moderate temp', organic_control: 'Hot water seed treatment (52°C, 10 min)', chemical_control: 'Carboxin+Thiram @ 2.5gm/kg seed', preventive_measures: 'Certified seed, seed treatment mandatory' },
  ],
  rice: [
    { disease: 'Blast', local_name: 'कडक्या/ब्लास्ट', symptoms: 'Diamond shaped lesions on leaves/neck', favorable_conditions: 'High humidity, 25-28°C, excess N', organic_control: 'Pseudomonas fluorescens seed treatment', chemical_control: 'Tricyclazole 75WP @ 240gm/acre', preventive_measures: 'Balanced N, avoid late planting, resistant varieties' },
    { disease: 'Bacterial Leaf Blight', local_name: 'जिवाणूजन्य पान करपा', symptoms: 'Water-soaked lesions, milky ooze', favorable_conditions: 'Heavy rain, wounds, high N', organic_control: 'Streptocyclin 6gm + COC 500gm in 200L water', chemical_control: 'Same as organic (antibiotic needed)', preventive_measures: 'Avoid clipping seedlings, balanced N, drainage' },
  ],
  cotton: [
    { disease: 'Root Rot/Wilt', local_name: 'मूळ कुज/मर रोग', symptoms: 'Sudden wilting, brown roots', favorable_conditions: 'Waterlogging, high temp', organic_control: 'Trichoderma viride @ 2.5kg/acre soil application', chemical_control: 'Carbendazim drench @ 1gm/L', preventive_measures: 'Good drainage, crop rotation, seed treatment' },
    { disease: 'Grey Mildew', local_name: 'राखाडी बुरशी', symptoms: 'Angular grey spots on leaves', favorable_conditions: 'Cool nights, humid', organic_control: 'Wettable Sulphur 80WP @ 1kg/acre', chemical_control: 'Carbendazim 50WP @ 200gm/acre', preventive_measures: 'Avoid excess N, good spacing' },
  ],
  sugarcane: [
    { disease: 'Red Rot', local_name: 'तांबडा सडणे', symptoms: 'Red internal tissue, vinegar smell', favorable_conditions: 'Waterlogging, susceptible variety', organic_control: 'Hot water treatment of setts (50°C, 2hrs)', chemical_control: 'Carbendazim dip @ 0.1%', preventive_measures: 'Resistant varieties (Co 86032), healthy setts' },
    { disease: 'Smut', local_name: 'काजळी', symptoms: 'Black whip-like structure from top', favorable_conditions: 'Drought stress, infected setts', organic_control: 'Roguing infected clumps + burning', chemical_control: 'Propiconazole dip for setts', preventive_measures: 'Resistant varieties, healthy seed material' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC PRODUCT RECOMMENDATIONS - DYNAMIC AI-BASED (NOT HARDCODED DB)
// These replace the master_products table dependency
// ═══════════════════════════════════════════════════════════════════════
const CROP_SPECIFIC_PRODUCTS: Record<string, Record<string, Array<{
  name: string;
  type: string;
  dose: string;
  price_per_acre: number;
  active_ingredient?: string;
  application_method: string;
  precautions?: string;
}>>> = {
  sugarcane: {
    seed_treatment: [
      { name: 'कार्बेन्डाझिम', type: 'fungicide', dose: '2gm/kg बेणे', price_per_acre: 180, active_ingredient: 'Carbendazim 50%WP', application_method: 'seed_coating', precautions: 'सावल्यात वाळवा' },
      { name: 'ट्रायकोडर्मा विरिडी', type: 'bio_fertilizer', dose: '10gm/kg बेणे', price_per_acre: 200, active_ingredient: 'Trichoderma spores 2×10⁹', application_method: 'seed_inoculation' },
    ],
    fertilizer: [
      { name: 'एसएसपी (SSP)', type: 'fertilizer', dose: '125 kg/एकर', price_per_acre: 1125, active_ingredient: '16% P₂O₅', application_method: 'basal_application' },
      { name: 'एमओपी (MOP)', type: 'fertilizer', dose: '50 kg/एकर', price_per_acre: 1000, active_ingredient: '60% K₂O', application_method: 'basal_application' },
      { name: 'युरिया', type: 'fertilizer', dose: '60 kg/एकर', price_per_acre: 390, active_ingredient: '46% N', application_method: 'top_dressing' },
      { name: 'DAP', type: 'fertilizer', dose: '50 kg/एकर', price_per_acre: 1500, active_ingredient: '18%N-46%P', application_method: 'basal_application' },
    ],
    pest_control: [
      { name: 'क्लोरपायरीफॉस', type: 'pesticide', dose: '1 L/एकर', price_per_acre: 550, active_ingredient: 'Chlorpyriphos 20%EC', application_method: 'soil_drenching', precautions: 'मुळांजवळ ओतणे' },
      { name: 'कार्बोफ्युरान', type: 'pesticide', dose: '8 kg/एकर', price_per_acre: 800, active_ingredient: 'Carbofuran 3%CG', application_method: 'soil_application', precautions: 'रांगोळी पद्धतीने' },
      { name: 'ब्युव्हेरिया बॅसियाना', type: 'bio_pesticide', dose: '1 kg/एकर', price_per_acre: 400, active_ingredient: 'Beauveria spores', application_method: 'foliar_spray' },
    ],
    growth_promoter: [
      { name: 'ह्युमिक ॲसिड', type: 'growth_promoter', dose: '1 L/एकर', price_per_acre: 450, application_method: 'fertigation' },
      { name: 'सीव्हीड अर्क', type: 'growth_promoter', dose: '500 ml/एकर', price_per_acre: 550, application_method: 'foliar_spray' },
    ],
    organic_input: [
      { name: 'शेणखत (FYM)', type: 'organic', dose: '10 टन/एकर', price_per_acre: 8000, application_method: 'soil_application' },
      { name: 'गांडूळ खत', type: 'organic', dose: '500 kg/एकर', price_per_acre: 4000, application_method: 'soil_application' },
      { name: 'जीवामृत', type: 'organic', dose: '200 L/एकर', price_per_acre: 150, application_method: 'drenching' },
    ],
    disease_control: [
      { name: 'कॉपर ऑक्सिक्लोराईड', type: 'fungicide', dose: '2 kg/एकर', price_per_acre: 500, active_ingredient: 'COC 50%WP', application_method: 'foliar_spray' },
      { name: 'मॅन्कोझेब', type: 'fungicide', dose: '2 kg/एकर', price_per_acre: 450, active_ingredient: 'Mancozeb 75%WP', application_method: 'foliar_spray' },
    ],
  },
  wheat: {
    seed_treatment: [
      { name: 'थायरम', type: 'fungicide', dose: '2.5gm/kg बीज', price_per_acre: 120, active_ingredient: 'Thiram 75%WP', application_method: 'seed_coating' },
      { name: 'ट्राइकोडर्मा', type: 'bio_fertilizer', dose: '4gm/kg बीज', price_per_acre: 150, application_method: 'seed_inoculation' },
    ],
    fertilizer: [
      { name: 'DAP', type: 'fertilizer', dose: '50 kg/एकड़', price_per_acre: 1500, application_method: 'basal_application' },
      { name: 'यूरिया', type: 'fertilizer', dose: '80 kg/एकड़', price_per_acre: 520, application_method: 'top_dressing' },
      { name: 'जिंक सल्फेट', type: 'micronutrient', dose: '10 kg/एकड़', price_per_acre: 850, application_method: 'soil_application' },
    ],
    pest_control: [
      { name: 'इमिडाक्लोप्रिड', type: 'pesticide', dose: '100 ml/एकड़', price_per_acre: 350, application_method: 'foliar_spray' },
    ],
    growth_promoter: [
      { name: 'ह्यूमिक एसिड', type: 'growth_promoter', dose: '1 L/एकड़', price_per_acre: 450, application_method: 'foliar_spray' },
    ],
  },
  soybean: {
    seed_treatment: [
      { name: 'थायरम + राइज़ोबियम', type: 'bio_fertilizer', dose: '2.5gm + 10gm/kg', price_per_acre: 200, application_method: 'seed_inoculation' },
      { name: 'ट्राइकोडर्मा', type: 'bio_fertilizer', dose: '4gm/kg बीज', price_per_acre: 150, application_method: 'seed_inoculation' },
    ],
    fertilizer: [
      { name: 'SSP', type: 'fertilizer', dose: '125 kg/एकड़', price_per_acre: 1125, application_method: 'basal_application' },
      { name: 'MOP', type: 'fertilizer', dose: '25 kg/एकड़', price_per_acre: 500, application_method: 'basal_application' },
    ],
    pest_control: [
      { name: 'क्विनालफॉस', type: 'pesticide', dose: '500 ml/एकड़', price_per_acre: 400, application_method: 'foliar_spray' },
      { name: 'नीम तेल', type: 'bio_pesticide', dose: '2 L/एकड़', price_per_acre: 700, application_method: 'foliar_spray' },
    ],
    disease_control: [
      { name: 'कार्बेंडाज़िम', type: 'fungicide', dose: '500gm/एकड़', price_per_acre: 380, application_method: 'foliar_spray' },
    ],
    growth_promoter: [
      { name: 'सीव्हीड अर्क', type: 'growth_promoter', dose: '500 ml/एकड़', price_per_acre: 550, application_method: 'foliar_spray' },
    ],
  },
  cotton: {
    seed_treatment: [
      { name: 'इमिडाक्लोप्रिड', type: 'pesticide', dose: '5gm/kg बीज', price_per_acre: 200, application_method: 'seed_coating' },
    ],
    fertilizer: [
      { name: 'DAP', type: 'fertilizer', dose: '50 kg/एकड़', price_per_acre: 1500, application_method: 'basal_application' },
      { name: 'यूरिया', type: 'fertilizer', dose: '80 kg/एकड़', price_per_acre: 520, application_method: 'top_dressing' },
      { name: 'MOP', type: 'fertilizer', dose: '40 kg/एकड़', price_per_acre: 800, application_method: 'basal_application' },
    ],
    pest_control: [
      { name: 'स्पिनोसैड', type: 'pesticide', dose: '100 ml/एकड़', price_per_acre: 650, application_method: 'foliar_spray' },
      { name: 'एसीफेट', type: 'pesticide', dose: '300gm/एकड़', price_per_acre: 450, application_method: 'foliar_spray' },
    ],
    growth_promoter: [
      { name: 'नेप्थालीन एसिटिक एसिड', type: 'growth_promoter', dose: '50 ml/एकड़', price_per_acre: 350, application_method: 'foliar_spray' },
    ],
  },
  rice: {
    seed_treatment: [
      { name: 'कार्बेंडाज़िम', type: 'fungicide', dose: '2gm/kg बीज', price_per_acre: 120, application_method: 'seed_coating' },
      { name: 'एज़ोस्पिरिलम', type: 'bio_fertilizer', dose: '10gm/kg बीज', price_per_acre: 100, application_method: 'seed_inoculation' },
    ],
    fertilizer: [
      { name: 'DAP', type: 'fertilizer', dose: '50 kg/एकड़', price_per_acre: 1500, application_method: 'basal_application' },
      { name: 'यूरिया', type: 'fertilizer', dose: '100 kg/एकड़', price_per_acre: 650, application_method: 'top_dressing' },
      { name: 'जिंक सल्फेट', type: 'micronutrient', dose: '10 kg/एकड़', price_per_acre: 850, application_method: 'soil_application' },
    ],
    pest_control: [
      { name: 'क्लोरपायरीफॉस', type: 'pesticide', dose: '1 L/एकड़', price_per_acre: 550, application_method: 'foliar_spray' },
      { name: 'कार्टैप हाइड्रोक्लोराइड', type: 'pesticide', dose: '500gm/एकड़', price_per_acre: 450, application_method: 'foliar_spray' },
    ],
    disease_control: [
      { name: 'ट्राइसाइक्लाज़ोल', type: 'fungicide', dose: '300gm/एकड़', price_per_acre: 600, application_method: 'foliar_spray' },
    ],
  },
  maize: {
    seed_treatment: [
      { name: 'थायरम', type: 'fungicide', dose: '3gm/kg बीज', price_per_acre: 100, application_method: 'seed_coating' },
    ],
    fertilizer: [
      { name: 'DAP', type: 'fertilizer', dose: '60 kg/एकड़', price_per_acre: 1800, application_method: 'basal_application' },
      { name: 'यूरिया', type: 'fertilizer', dose: '120 kg/एकड़', price_per_acre: 780, application_method: 'top_dressing' },
      { name: 'MOP', type: 'fertilizer', dose: '40 kg/एकड़', price_per_acre: 800, application_method: 'basal_application' },
    ],
    pest_control: [
      { name: 'स्पिनोसैड', type: 'pesticide', dose: '100 ml/एकड़', price_per_acre: 650, application_method: 'foliar_spray' },
    ],
  },
  // Default products for crops not specifically listed
  default: {
    seed_treatment: [
      { name: 'ट्राइकोडर्मा विरिडी', type: 'bio_fertilizer', dose: '4gm/kg बीज', price_per_acre: 150, application_method: 'seed_inoculation' },
    ],
    fertilizer: [
      { name: 'DAP', type: 'fertilizer', dose: '50 kg/एकड़', price_per_acre: 1500, application_method: 'basal_application' },
      { name: 'यूरिया', type: 'fertilizer', dose: '60 kg/एकड़', price_per_acre: 390, application_method: 'top_dressing' },
    ],
    pest_control: [
      { name: 'नीम तेल', type: 'bio_pesticide', dose: '2 L/एकड़', price_per_acre: 700, application_method: 'foliar_spray' },
    ],
    growth_promoter: [
      { name: 'ह्यूमिक एसिड', type: 'growth_promoter', dose: '1 L/एकड़', price_per_acre: 450, application_method: 'foliar_spray' },
    ],
    organic_input: [
      { name: 'शेणखत (FYM)', type: 'organic', dose: '5 टन/एकड़', price_per_acre: 4000, application_method: 'soil_application' },
      { name: 'गांडूळ खत', type: 'organic', dose: '300 kg/एकड़', price_per_acre: 2400, application_method: 'soil_application' },
    ],
    disease_control: [
      { name: 'मॅन्कोझेब', type: 'fungicide', dose: '2 kg/एकड़', price_per_acre: 450, application_method: 'foliar_spray' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// CROP WATER REQUIREMENTS - FOR LAND-SPECIFIC WATER PRESCRIPTION
// ═══════════════════════════════════════════════════════════════════════
const CROP_WATER_REQUIREMENTS: Record<string, { 
  etc_mm_per_day: number; // Crop evapotranspiration
  total_mm: number; // Total water need for full cycle
  critical_stages: string[];
  irrigation_interval_days: number;
}> = {
  wheat: { etc_mm_per_day: 4.5, total_mm: 450, critical_stages: ['crown_root', 'flowering', 'grain_filling'], irrigation_interval_days: 20 },
  rice: { etc_mm_per_day: 6.0, total_mm: 1200, critical_stages: ['transplanting', 'tillering', 'flowering'], irrigation_interval_days: 3 },
  cotton: { etc_mm_per_day: 5.5, total_mm: 700, critical_stages: ['flowering', 'boll_formation'], irrigation_interval_days: 12 },
  sugarcane: { etc_mm_per_day: 7.0, total_mm: 2000, critical_stages: ['tillering', 'grand_growth'], irrigation_interval_days: 10 },
  okra: { etc_mm_per_day: 4.0, total_mm: 400, critical_stages: ['flowering', 'fruiting'], irrigation_interval_days: 5 },
  tomato: { etc_mm_per_day: 5.0, total_mm: 600, critical_stages: ['flowering', 'fruit_setting'], irrigation_interval_days: 4 },
  onion: { etc_mm_per_day: 3.5, total_mm: 350, critical_stages: ['bulb_formation'], irrigation_interval_days: 7 },
  potato: { etc_mm_per_day: 4.5, total_mm: 500, critical_stages: ['tuber_initiation', 'tuber_bulking'], irrigation_interval_days: 7 },
  maize: { etc_mm_per_day: 5.0, total_mm: 500, critical_stages: ['tasseling', 'silking', 'grain_filling'], irrigation_interval_days: 10 },
  soybean: { etc_mm_per_day: 4.0, total_mm: 400, critical_stages: ['flowering', 'pod_filling'], irrigation_interval_days: 12 },
  groundnut: { etc_mm_per_day: 4.0, total_mm: 450, critical_stages: ['flowering', 'pegging', 'pod_development'], irrigation_interval_days: 10 },
  chilli: { etc_mm_per_day: 4.5, total_mm: 550, critical_stages: ['flowering', 'fruit_development'], irrigation_interval_days: 5 },
  brinjal: { etc_mm_per_day: 4.5, total_mm: 500, critical_stages: ['flowering', 'fruiting'], irrigation_interval_days: 5 },
  default: { etc_mm_per_day: 4.5, total_mm: 500, critical_stages: ['vegetative', 'reproductive'], irrigation_interval_days: 7 }
};

// ═══════════════════════════════════════════════════════════════════════
// CROP TASK MULTIPLIERS - MINIMUM TASKS FOR LONG-DURATION CROPS
// ═══════════════════════════════════════════════════════════════════════
const CROP_TASK_MULTIPLIERS: Record<string, { minTasks: number; durationDays: number; mandatoryCategories: string[] }> = {
  sugarcane: { 
    minTasks: 30, 
    durationDays: 365,
    mandatoryCategories: ['irrigation', 'fertilizer', 'weeding', 'pest_control', 'earthing', 'harvest']
  },
  banana: { minTasks: 28, durationDays: 300, mandatoryCategories: ['irrigation', 'fertilizer', 'pest_control', 'desuckering'] },
  turmeric: { minTasks: 25, durationDays: 270, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding', 'earthing'] },
  ginger: { minTasks: 25, durationDays: 240, mandatoryCategories: ['irrigation', 'fertilizer', 'mulching', 'earthing'] },
  cotton: { minTasks: 22, durationDays: 180, mandatoryCategories: ['irrigation', 'fertilizer', 'pest_control', 'weeding'] },
  rice: { minTasks: 18, durationDays: 130, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding', 'pest_control'] },
  wheat: { minTasks: 15, durationDays: 120, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding'] },
  soybean: { minTasks: 16, durationDays: 100, mandatoryCategories: ['weeding', 'pest_control', 'fertilizer'] },
  maize: { minTasks: 16, durationDays: 110, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding'] },
  groundnut: { minTasks: 15, durationDays: 110, mandatoryCategories: ['weeding', 'pest_control', 'earthing'] },
  onion: { minTasks: 18, durationDays: 140, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding'] },
  tomato: { minTasks: 20, durationDays: 100, mandatoryCategories: ['irrigation', 'fertilizer', 'pest_control', 'staking'] },
  default: { minTasks: 15, durationDays: 100, mandatoryCategories: ['irrigation', 'fertilizer', 'weeding'] },
};

// ═══════════════════════════════════════════════════════════════════════
// REALISTIC LABOR REQUIREMENTS - WORKER × DAYS MODEL (NOT FRACTIONAL)
// Based on actual Indian agricultural practices (ICAR/KVK guidelines)
// ═══════════════════════════════════════════════════════════════════════
const LABOR_REQUIREMENTS: Record<string, { baseWorkers: number; baseDays: number; perAcreMultiplier: number; description: string }> = {
  // Heavy labor tasks
  land_preparation: { baseWorkers: 2, baseDays: 2, perAcreMultiplier: 0.5, description: 'Ploughing with tractor + leveling' },
  transplanting: { baseWorkers: 6, baseDays: 1, perAcreMultiplier: 1.0, description: 'Transplanting seedlings' },
  harvesting: { baseWorkers: 5, baseDays: 2, perAcreMultiplier: 0.8, description: 'Crop cutting and bundling' },
  harvest: { baseWorkers: 5, baseDays: 2, perAcreMultiplier: 0.8, description: 'Crop harvesting' },
  weeding: { baseWorkers: 4, baseDays: 1, perAcreMultiplier: 0.75, description: 'Manual weeding' },
  weed_management: { baseWorkers: 4, baseDays: 1, perAcreMultiplier: 0.75, description: 'Manual weeding' },
  earthing: { baseWorkers: 3, baseDays: 1, perAcreMultiplier: 0.6, description: 'Earthing up operation' },
  
  // Medium labor tasks  
  sowing: { baseWorkers: 3, baseDays: 1, perAcreMultiplier: 0.5, description: 'Seed sowing' },
  fertilizer: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.5, description: 'Fertilizer application' },
  fertilizer_application: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.5, description: 'Fertilizer mixing & applying' },
  nutrient_management: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.5, description: 'Nutrient application' },
  post_harvest: { baseWorkers: 3, baseDays: 1, perAcreMultiplier: 0.5, description: 'Threshing, cleaning' },
  organic_input: { baseWorkers: 2, baseDays: 1, perAcreMultiplier: 0.5, description: 'Organic manure application' },
  mulching: { baseWorkers: 2, baseDays: 1, perAcreMultiplier: 0.6, description: 'Laying mulch material' },
  intercultural: { baseWorkers: 2, baseDays: 1, perAcreMultiplier: 0.5, description: 'Intercultural operations' },
  pruning: { baseWorkers: 2, baseDays: 1, perAcreMultiplier: 0.6, description: 'Pruning and training' },
  
  // Light labor tasks
  pest_control: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Pesticide spraying' },
  disease_control: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Fungicide spraying' },
  pest_management: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Pest management' },
  disease_management: { baseWorkers: 2, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Disease management' },
  growth_promoter: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Growth promoter spraying' },
  growth_management: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'Growth promoter application' },
  seed_treatment: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.2, description: 'Seed treatment' },
  irrigation: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.2, description: 'Irrigation management' },
  watering: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.2, description: 'Watering plants' },
  monitoring: { baseWorkers: 1, baseDays: 0.25, perAcreMultiplier: 0.1, description: 'Field inspection' },
  field_visit: { baseWorkers: 1, baseDays: 0.25, perAcreMultiplier: 0.1, description: 'Field visit' },
  planning: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.1, description: 'Planning work' },
  other: { baseWorkers: 1, baseDays: 0.5, perAcreMultiplier: 0.3, description: 'General farm work' },
};

// Function to calculate realistic labor cost using worker × days model
function calculateRealisticLaborCost(
  category: string,
  landAreaAcres: number,
  dailyWageRate: number
): { workers: number; days: number; totalLaborDays: number; laborCost: number; description: string } {
  const laborReq = LABOR_REQUIREMENTS[category] || LABOR_REQUIREMENTS['other'];
  
  // Calculate workers needed for this land area (minimum 1)
  const workersNeeded = Math.max(1, Math.ceil(laborReq.baseWorkers + (laborReq.perAcreMultiplier * (landAreaAcres - 1))));
  
  // Calculate days needed (round to nearest 0.5 for realistic half-day/full-day work)
  let daysNeeded = laborReq.baseDays;
  if (landAreaAcres > 2) {
    daysNeeded = laborReq.baseDays + Math.ceil((landAreaAcres - 2) * laborReq.perAcreMultiplier * 0.5) * 0.5;
  }
  daysNeeded = Math.max(0.5, Math.round(daysNeeded * 2) / 2); // Round to nearest 0.5
  
  // Total labor-days = workers × days (NOT multiplied by area again!)
  const totalLaborDays = workersNeeded * daysNeeded;
  
  // Labor cost
  const laborCost = Math.round(totalLaborDays * dailyWageRate);
  
  return {
    workers: workersNeeded,
    days: daysNeeded,
    totalLaborDays,
    laborCost,
    description: laborReq.description
  };
}

// Function to get crop-specific products
function getCropSpecificProducts(
  cropName: string,
  category: string,
  farmingType: string,
  landAreaAcres: number
): Array<{
  product_name: string;
  product_type: string;
  dose_per_acre: string;
  price_estimate: number;
  active_ingredient?: string;
  application_method: string;
  precautions?: string;
}> {
  const cropKey = cropName.toLowerCase().replace(/\s+/g, '');
  const cropProducts = CROP_SPECIFIC_PRODUCTS[cropKey] || CROP_SPECIFIC_PRODUCTS['default'];
  const categoryProducts = cropProducts[category] || [];
  
  // Filter based on farming type
  let filteredProducts = categoryProducts;
  if (farmingType === 'organic_only') {
    filteredProducts = categoryProducts.filter(p => 
      ['organic', 'bio_fertilizer', 'bio_pesticide', 'growth_promoter'].includes(p.type)
    );
    // If no organic products for this category, use organic alternatives from default
    if (filteredProducts.length === 0) {
      const defaultProducts = CROP_SPECIFIC_PRODUCTS['default'][category] || [];
      filteredProducts = defaultProducts.filter(p => 
        ['organic', 'bio_fertilizer', 'bio_pesticide', 'growth_promoter'].includes(p.type)
      );
    }
  }
  
  // Return products with calculated prices for land area
  return filteredProducts.slice(0, 3).map(p => ({
    product_name: p.name,
    product_type: p.type,
    dose_per_acre: p.dose,
    price_estimate: Math.round(p.price_per_acre * landAreaAcres),
    active_ingredient: p.active_ingredient,
    application_method: p.application_method,
    precautions: p.precautions
  }));
}

const SEED_RATES: Record<
  string,
  { rate_kg_per_acre: number; spacing_cm: string; price_per_kg: number; treatment: string }
> = {
  // CEREALS - 2024-25 Updated Prices
  wheat: {
    rate_kg_per_acre: 40,
    spacing_cm: "22.5 row spacing",
    price_per_kg: 55,  // Updated: Certified seed ₹45-65/kg
    treatment: "Thiram @ 2.5g/kg or Trichoderma 4g/kg",
  },
  rice: {
    rate_kg_per_acre: 20,
    spacing_cm: "20x15 cm",
    price_per_kg: 75,  // Updated: Certified seed ₹60-90/kg
    treatment: "Carbendazim @ 2g/kg or Trichoderma 4g/kg",
  },
  maize: { 
    rate_kg_per_acre: 8, 
    spacing_cm: "60x20 cm", 
    price_per_kg: 450,  // Updated: Hybrid seed ₹350-550/kg
    treatment: "Thiram @ 3g/kg" 
  },
  jowar: { 
    rate_kg_per_acre: 4, 
    spacing_cm: "45x15 cm", 
    price_per_kg: 180,  // Updated: Hybrid ₹150-220/kg
    treatment: "Thiram @ 2.5g/kg" 
  },
  bajra: { 
    rate_kg_per_acre: 2, 
    spacing_cm: "45x15 cm", 
    price_per_kg: 350,  // Updated: Hybrid ₹280-420/kg
    treatment: "Thiram @ 2.5g/kg" 
  },
  
  // PULSES - 2024-25 Updated Prices
  soybean: {
    rate_kg_per_acre: 30,
    spacing_cm: "45x5 cm",
    price_per_kg: 120,  // Updated: Certified ₹100-150/kg
    treatment: "Thiram+Rhizobium or Trichoderma+Rhizobium",
  },
  moong: { 
    rate_kg_per_acre: 8, 
    spacing_cm: "30x10 cm", 
    price_per_kg: 180,  // Updated: ₹150-220/kg
    treatment: "Rhizobium + Trichoderma @ 4g/kg" 
  },
  urad: { 
    rate_kg_per_acre: 8, 
    spacing_cm: "30x10 cm", 
    price_per_kg: 200,  // Updated: ₹170-240/kg
    treatment: "Rhizobium + Trichoderma @ 4g/kg" 
  },
  tur: { 
    rate_kg_per_acre: 6, 
    spacing_cm: "90x30 cm", 
    price_per_kg: 280,  // Updated: ₹220-350/kg
    treatment: "Rhizobium + Trichoderma @ 4g/kg" 
  },
  gram: { 
    rate_kg_per_acre: 30, 
    spacing_cm: "30x10 cm", 
    price_per_kg: 85,   // Updated: ₹70-100/kg
    treatment: "Rhizobium + Trichoderma @ 4g/kg" 
  },
  groundnut: {
    rate_kg_per_acre: 50,
    spacing_cm: "30x10 cm",
    price_per_kg: 120,  // Updated: ₹90-150/kg
    treatment: "Thiram @ 3g/kg + Rhizobium",
  },
  
  // CASH CROPS - 2024-25 Updated Prices  
  cotton: {
    rate_kg_per_acre: 1.5,
    spacing_cm: "90x60 cm",
    price_per_kg: 1200,  // Updated: BG-II ₹800-1600/packet (450gm)
    treatment: "Imidacloprid @ 5g/kg or neem oil soak",
  },
  sugarcane: {
    rate_kg_per_acre: 0,
    spacing_cm: "90x30 cm",
    price_per_kg: 0,
    treatment: "Carbendazim dip or lime water soak",
  },
  
  // VEGETABLES - 2024-25 Updated Prices (per kg)
  tomato: { 
    rate_kg_per_acre: 0.15, 
    spacing_cm: "60x45 cm", 
    price_per_kg: 45000,  // Updated: Hybrid ₹35000-55000/kg (10gm = ₹350-550)
    treatment: "Trichoderma @ 4g/kg" 
  },
  onion: { 
    rate_kg_per_acre: 4, 
    spacing_cm: "15x10 cm", 
    price_per_kg: 1800,   // Updated: ₹1500-2200/kg
    treatment: "Thiram @ 2g/kg" 
  },
  potato: { 
    rate_kg_per_acre: 800, 
    spacing_cm: "60x20 cm", 
    price_per_kg: 45,     // Updated: Seed potato ₹35-55/kg
    treatment: "Mancozeb dip or boric acid" 
  },
  chilli: { 
    rate_kg_per_acre: 0.2, 
    spacing_cm: "60x45 cm", 
    price_per_kg: 35000,  // Updated: Hybrid ₹25000-45000/kg (10gm = ₹250-450)
    treatment: "Trichoderma @ 4g/kg" 
  },
  brinjal: { 
    rate_kg_per_acre: 0.2, 
    spacing_cm: "75x60 cm", 
    price_per_kg: 32000,  // Updated: Hybrid ₹25000-40000/kg
    treatment: "Trichoderma @ 4g/kg" 
  },
  cabbage: { 
    rate_kg_per_acre: 0.15, 
    spacing_cm: "60x45 cm", 
    price_per_kg: 28000,  // Updated: Hybrid ₹22000-35000/kg
    treatment: "Thiram @ 2g/kg" 
  },
  okra: { 
    rate_kg_per_acre: 4, 
    spacing_cm: "45x30 cm", 
    price_per_kg: 650,    // Updated: Hybrid ₹500-800/kg
    treatment: "Carbendazim @ 2g/kg" 
  },
  
  // OILSEEDS - 2024-25 Updated Prices
  mustard: { 
    rate_kg_per_acre: 2, 
    spacing_cm: "45x15 cm", 
    price_per_kg: 180,    // Updated: ₹140-220/kg
    treatment: "Thiram @ 2.5g/kg" 
  },
  sunflower: { 
    rate_kg_per_acre: 3, 
    spacing_cm: "60x30 cm", 
    price_per_kg: 380,    // Updated: Hybrid ₹300-460/kg
    treatment: "Imidacloprid @ 5g/kg" 
  },
};

const NPK_TARGETS: Record<string, { n: number; p: number; k: number }> = {
  wheat: { n: 120, p: 60, k: 40 },
  rice: { n: 120, p: 60, k: 40 },
  cotton: { n: 120, p: 60, k: 50 },
  maize: { n: 150, p: 75, k: 50 },
  sugarcane: { n: 250, p: 115, k: 115 },
  soybean: { n: 30, p: 60, k: 40 },
  groundnut: { n: 25, p: 50, k: 45 },
  tomato: { n: 100, p: 60, k: 80 },
  onion: { n: 100, p: 50, k: 50 },
  potato: { n: 150, p: 80, k: 100 },
  default: { n: 100, p: 50, k: 40 },
};

const CROP_SUITABILITY: Record<
  string,
  {
    optimal_temp: { min: number; max: number };
    soil_types: string[];
    ph_range: { min: number; max: number };
    water_requirement: string;
    seasons: string[];
    states_suitable: string[];
  }
> = {
  wheat: {
    optimal_temp: { min: 10, max: 25 },
    soil_types: ["alluvial", "loamy", "clay loam", "black"],
    ph_range: { min: 6.0, max: 8.5 },
    water_requirement: "medium",
    seasons: ["rabi", "winter"],
    states_suitable: ["Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Rajasthan"],
  },
  rice: {
    optimal_temp: { min: 20, max: 35 },
    soil_types: ["clay", "alluvial", "loamy", "silty clay"],
    ph_range: { min: 5.5, max: 7.5 },
    water_requirement: "high",
    seasons: ["kharif", "monsoon"],
    states_suitable: ["West Bengal", "Punjab", "Uttar Pradesh", "Andhra Pradesh", "Tamil Nadu"],
  },
  cotton: {
    optimal_temp: { min: 21, max: 35 },
    soil_types: ["black", "alluvial", "loamy"],
    ph_range: { min: 6.0, max: 8.0 },
    water_requirement: "medium",
    seasons: ["kharif"],
    states_suitable: ["Gujarat", "Maharashtra", "Andhra Pradesh", "Telangana", "Madhya Pradesh"],
  },
  soybean: {
    optimal_temp: { min: 20, max: 30 },
    soil_types: ["black", "loamy", "clay loam"],
    ph_range: { min: 6.0, max: 7.5 },
    water_requirement: "medium",
    seasons: ["kharif"],
    states_suitable: ["Madhya Pradesh", "Maharashtra", "Rajasthan", "Karnataka"],
  },
  sugarcane: {
    optimal_temp: { min: 20, max: 35 },
    soil_types: ["alluvial", "loamy", "clay loam"],
    ph_range: { min: 6.5, max: 8.0 },
    water_requirement: "very high",
    seasons: ["all"],
    states_suitable: ["Uttar Pradesh", "Maharashtra", "Karnataka", "Tamil Nadu", "Gujarat"],
  },
};

const CATEGORY_MIN_COSTS: Record<string, { laborDays: number; productMin: number }> = {
  land_preparation: { laborDays: 0, productMin: 1500 },
  organic_input: { laborDays: 1.5, productMin: 1200 },
  seed_treatment: { laborDays: 0.25, productMin: 200 },
  sowing: { laborDays: 0.5, productMin: 0 },
  transplanting: { laborDays: 4, productMin: 0 },
  growth_promoter: { laborDays: 0.3, productMin: 500 },
  fertilizer: { laborDays: 0.3, productMin: 400 },
  irrigation: { laborDays: 0.2, productMin: 100 },
  weeding: { laborDays: 3, productMin: 0 },
  pest_control: { laborDays: 0.5, productMin: 400 },
  disease_control: { laborDays: 0.5, productMin: 350 },
  intercultural: { laborDays: 1, productMin: 200 },
  harvest: { laborDays: 4, productMin: 0 },
  post_harvest: { laborDays: 2, productMin: 500 },
  other: { laborDays: 0.5, productMin: 200 },
  planning: { laborDays: 0.5, productMin: 100 },
};

function getCurrentSeason(month: number): string {
  if (month >= 6 && month <= 10) return "kharif";
  if (month >= 11 || month <= 3) return "rabi";
  return "summer";
}

function validateCropSuitability(
  cropName: string,
  land: any,
  sowingMonth: number,
  language: string,
): { isSuitable: boolean; score: number; warnings: string[]; recommendations: string[] } {
  const cropKey = cropName.toLowerCase().replace(/\s+/g, "");
  const suitability = CROP_SUITABILITY[cropKey];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  if (!suitability) {
    return { isSuitable: true, score: 80, warnings: [], recommendations: [] };
  }

  const currentSeason = getCurrentSeason(sowingMonth);
  if (
    suitability.seasons.length > 0 &&
    !suitability.seasons.includes(currentSeason) &&
    !suitability.seasons.includes("all")
  ) {
    warnings.push(
      language === "mr"
        ? `हंगाम योग्य नाही. शिफारस: ${suitability.seasons.join("/")}`
        : `Season mismatch. Recommended: ${suitability.seasons.join("/")}`,
    );
    score -= 20;
  }

  const soilType = (land.soil_type || "").toLowerCase();
  if (soilType && !suitability.soil_types.some((s) => soilType.includes(s))) {
    score -= 10;
  }

  const ph = land.soil_ph || 7.0;
  if (ph < suitability.ph_range.min || ph > suitability.ph_range.max) {
    score -= 10;
  }

  return { isSuitable: score >= 60, score: Math.max(0, score), warnings, recommendations };
}

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// APPLICATION METHOD HELPER - INTELLIGENT DETECTION BASED ON PRODUCT FORM
// ═══════════════════════════════════════════════════════════════════════
// CRITICAL FIX: Solid fertilizers (DAP, Urea, MOP, NPK) cannot be sprayed!
// This function determines correct application method based on product form.

// PRODUCT FORM DATABASE - Defines physical form of products
const SOLID_GRANULAR_PRODUCTS = [
  'urea', 'युरिया', 'यूरिया',
  'dap', 'डीएपी', 'डीएपी',
  'mop', 'एमओपी', 
  'npk', 'एनपीके',
  'ssp', 'एसएसपी',
  'superphosphate', 'सुपरफॉस्फेट',
  'ammonium sulphate', 'अमोनियम सल्फेट',
  'potash', 'पोटाश',
  'calcium ammonium nitrate', 'can',
  'zinc sulphate', 'जिंक सल्फेट', 'जस्त सल्फेट',
  'ferrous sulphate', 'फेरस सल्फेट',
  'borax', 'बोरेक्स',
  'gypsum', 'जिप्सम',
  'lime', 'चुना', 'stone chalk',
  'carbofuran', 'कार्बोफ्युरान', 'furadan',
  'phorate', 'फोरेट',
  'fym', 'farm yard manure', 'शेणखत', 'गोबर खाद', 'गोबर की खाद',
  'vermicompost', 'गांडूळ खत', 'केंचुआ खाद',
  'compost', 'कंपोस्ट',
  'neem cake', 'निंबोळी पेंड', 'neem khali',
  'bone meal', 'हाड चूर्ण',
  'rock phosphate', 'रॉक फॉस्फेट',
];

const LIQUID_SPRAY_PRODUCTS = [
  'imidacloprid', 'इमिडाक्लोप्रिड',
  'chlorpyriphos', 'क्लोरपायरीफॉस',
  'monocrotophos', 'मोनोक्रोटोफॉस',
  'acephate', 'एसीफेट',
  'spinosad', 'स्पिनोसैड',
  'emamectin', 'एमामेक्टिन',
  'cypermethrin', 'सायपरमेथ्रिन',
  'lambda cyhalothrin', 'लॅम्बडा',
  'thiamethoxam', 'थियामेथोक्सम',
  'acetamiprid', 'एसीटामिप्रिड',
  'fipronil', 'फिप्रोनिल',
  'neem oil', 'नीम तेल', 'नीम का तेल',
  'mancozeb', 'मॅन्कोझेब',
  'carbendazim', 'कार्बेंडाज़िम',
  'propiconazole', 'प्रोपिकोनाझोल',
  'tricyclazole', 'ट्राइसाइक्लाज़ोल',
  'hexaconazole', 'हेक्साकोनाझोल',
  'copper oxychloride', 'कॉपर ऑक्सिक्लोराईड', 'coc',
  'bordeaux mixture', 'बोर्डो मिश्रण',
  'humic acid', 'ह्यूमिक एसिड', 'ह्युमिक ॲसिड',
  'fulvic acid', 'फुल्विक एसिड',
  'seaweed', 'सीव्हीड', 'समुद्री शैवाल',
  'amino acid', 'अमीनो एसिड',
  'gibberellic acid', 'ga3', 'जिब्बेरेलिक',
  'naa', 'naphthalene acetic', 'नेप्थालीन',
  '2,4-d', '2,4-डी',
  'glyphosate', 'ग्लायफोसेट',
  'paraquat', 'पैराक्वाट',
  'pendimethalin', 'पेंडीमेथालिन',
  'quizalofop', 'क्विज़ालोफॉप',
  'beauveria', 'ब्युव्हेरिया',
  'metarhizium', 'मेटारायझियम',
  'npv', 'nuclear polyhedrosis',
  'bt', 'bacillus thuringiensis',
];

const SEED_TREATMENT_PRODUCTS = [
  'thiram', 'थायरम',
  'captan', 'कैप्टन',
  'vitavax', 'विटावैक्स',
  'carboxin', 'कार्बोक्सिन',
  'trichoderma', 'ट्रायकोडर्मा', 'ट्राइकोडर्मा',
  'rhizobium', 'राइज़ोबियम',
  'azotobacter', 'एज़ोटोबैक्टर',
  'azospirillum', 'एज़ोस्पिरिलम',
  'psb', 'फॉस्फेट सोल्युबिलाइजिंग',
  'mycorrhiza', 'माइकोराइजा',
  'pseudomonas', 'स्यूडोमोनास',
  'beejamrut', 'बीजामृत',
];

const DRENCH_PRODUCTS = [
  'jeevamrut', 'जीवामृत',
  'panchagavya', 'पंचगव्य',
  'amritpani', 'अमृतपानी',
  'cow urine', 'गोमूत्र', 'गौमूत्र',
  'buttermilk', 'ताक', 'छाछ',
  'trichoderma liquid', 'द्रव ट्रायकोडर्मा',
  'pseudomonas liquid', 'द्रव स्यूडोमोनास',
];

function getApplicationMethod(productName: string, productType: string, taskCategory: string): string {
  const nameLower = (productName || "").toLowerCase();
  const typeLower = (productType || "").toLowerCase();
  const categoryLower = (taskCategory || "").toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 1: CHECK PRODUCT NAME FOR SOLID GRANULAR PRODUCTS
  // These CANNOT be applied via foliar spray - CRITICAL CHECK FIRST!
  // ═══════════════════════════════════════════════════════════════════════
  for (const solidProduct of SOLID_GRANULAR_PRODUCTS) {
    if (nameLower.includes(solidProduct)) {
      // Determine exact method based on product sub-type
      if (solidProduct.includes('carbofuran') || solidProduct.includes('phorate')) {
        return 'soil_application';  // ग्रॅन्युल्स मातीत टाकणे
      }
      if (solidProduct.includes('fym') || solidProduct.includes('शेणखत') || solidProduct.includes('गोबर') || 
          solidProduct.includes('vermicompost') || solidProduct.includes('गांडूळ') || solidProduct.includes('compost') ||
          solidProduct.includes('केंचुआ')) {
        return 'basal_application';  // पायाभूत खत / मातीत मिश्रण
      }
      if (solidProduct.includes('lime') || solidProduct.includes('gypsum') || solidProduct.includes('चुना')) {
        return 'soil_application';  // माती सुधारक
      }
      if (solidProduct.includes('urea') || solidProduct.includes('युरिया') || solidProduct.includes('यूरिया')) {
        // Urea can be basal or top_dressing depending on timing
        if (categoryLower.includes('sowing') || categoryLower.includes('basal')) {
          return 'basal_application';  // पेरणीवेळी पायाभूत
        }
        return 'top_dressing';  // वाढीच्या वेळी वरून टाकणे
      }
      if (solidProduct.includes('dap') || solidProduct.includes('डीएपी')) {
        return 'basal_application';  // DAP नेहमी पायाभूत
      }
      if (solidProduct.includes('mop') || solidProduct.includes('एमओपी') || solidProduct.includes('potash')) {
        return 'basal_application';  // MOP नेहमी पायाभूत
      }
      if (solidProduct.includes('npk') || solidProduct.includes('एनपीके')) {
        return 'broadcasting';  // NPK विखुरणे / पसरवणे
      }
      if (solidProduct.includes('ssp') || solidProduct.includes('superphosphate')) {
        return 'basal_application';  // SSP पायाभूत
      }
      if (solidProduct.includes('zinc') || solidProduct.includes('जिंक') || solidProduct.includes('जस्त') ||
          solidProduct.includes('ferrous') || solidProduct.includes('borax') || solidProduct.includes('बोरेक्स')) {
        return 'soil_application';  // सूक्ष्म अन्नद्रव्ये मातीत
      }
      if (solidProduct.includes('neem cake') || solidProduct.includes('निंबोळी') || solidProduct.includes('khali')) {
        return 'basal_application';  // पेंड पायाभूत
      }
      // Default for other solid products
      return 'broadcasting';  // छिड़काव / विखुरणे
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 2: CHECK FOR SEED TREATMENT PRODUCTS
  // ═══════════════════════════════════════════════════════════════════════
  for (const seedProduct of SEED_TREATMENT_PRODUCTS) {
    if (nameLower.includes(seedProduct)) {
      if (seedProduct.includes('trichoderma') || seedProduct.includes('rhizobium') || 
          seedProduct.includes('azotobacter') || seedProduct.includes('psb') || seedProduct.includes('mycorrhiza')) {
        return 'seed_inoculation';  // जैविक बीज उपचार
      }
      return 'seed_coating';  // बीज लेपन
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 3: CHECK FOR DRENCH PRODUCTS
  // ═══════════════════════════════════════════════════════════════════════
  for (const drenchProduct of DRENCH_PRODUCTS) {
    if (nameLower.includes(drenchProduct)) {
      return 'drenching';  // आळवणी / जड़ों में डालें
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY 4: CHECK FOR LIQUID SPRAY PRODUCTS  
  // ═══════════════════════════════════════════════════════════════════════
  for (const liquidProduct of LIQUID_SPRAY_PRODUCTS) {
    if (nameLower.includes(liquidProduct)) {
      // Check for herbicides - need specific spray type
      if (liquidProduct.includes('pendimethalin') || liquidProduct.includes('atrazine')) {
        return 'pre_emergence_spray';  // पेरणीपूर्व फवारणी
      }
      if (liquidProduct.includes('2,4-d') || liquidProduct.includes('quizalofop') || 
          liquidProduct.includes('glyphosate') || liquidProduct.includes('paraquat')) {
        return 'post_emergence_spray';  // तणांवर फवारणी
      }
      return 'foliar_spray';  // पानांवर फवारणी
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FALLBACK: CATEGORY-BASED DETECTION (if product not in known lists)
  // ═══════════════════════════════════════════════════════════════════════
  
  // SEED TREATMENT by category
  if (categoryLower.includes('seed') || typeLower.includes('seed')) {
    return 'seed_treatment';
  }
  
  // FERTILIZER category - defaults to broadcasting/soil
  if (categoryLower.includes('fertilizer') || typeLower.includes('fertilizer') || categoryLower.includes('nutrient')) {
    if (typeLower.includes('micro') || nameLower.includes('micro')) {
      return 'foliar_spray';  // Micronutrients can be sprayed if in chelated liquid form
    }
    return 'broadcasting';  // Default for unrecognized fertilizers
  }
  
  // ORGANIC category
  if (typeLower.includes('organic') || categoryLower.includes('organic')) {
    if (nameLower.includes('liquid') || nameLower.includes('द्रव')) {
      return 'drenching';
    }
    return 'soil_application';
  }
  
  // BIO-FERTILIZER category
  if (typeLower.includes('bio')) {
    return 'soil_drenching';
  }
  
  // GROWTH PROMOTER category
  if (categoryLower.includes('growth') || typeLower.includes('growth')) {
    return 'foliar_spray';  // Most growth promoters are liquid sprays
  }
  
  // PEST CONTROL category
  if (categoryLower.includes('pest') || typeLower.includes('pesticide') || typeLower.includes('insecticide')) {
    if (nameLower.includes('granule') || nameLower.includes('gr ') || nameLower.includes('g ') || nameLower.includes('cg')) {
      return 'soil_application';
    }
    if (nameLower.includes('trap') || nameLower.includes('pheromone')) {
      return 'trap_installation';
    }
    if (nameLower.includes('dust') || nameLower.includes('dp')) {
      return 'dusting';
    }
    return 'foliar_spray';
  }
  
  // DISEASE CONTROL category
  if (categoryLower.includes('disease') || typeLower.includes('fungicide')) {
    if (nameLower.includes('drench') || nameLower.includes('root') || nameLower.includes('मुळ')) {
      return 'soil_drenching';
    }
    return 'foliar_spray';
  }
  
  // WEED CONTROL category
  if (categoryLower.includes('weed') || typeLower.includes('herbicide')) {
    return 'directed_spray';
  }
  
  // IRRIGATION category - should have water amount, not spray
  if (categoryLower.includes('irrigation') || categoryLower.includes('watering')) {
    return 'irrigation';  // पाणी देणे
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FINAL DEFAULT: If nothing matched, use category-aware default
  // NOT blindly foliar_spray - prevent DAP spray bug!
  // ═══════════════════════════════════════════════════════════════════════
  console.warn(`⚠️ [ApplicationMethod] Unknown product: "${productName}", type: "${productType}", category: "${taskCategory}" - using safe default`);
  
  // Check if product name suggests solid form
  if (nameLower.includes('kg') || nameLower.includes('granule') || nameLower.includes('powder') || 
      nameLower.includes('चूर्ण') || nameLower.includes('पावडर')) {
    return 'soil_application';
  }
  
  // Check if product name suggests liquid form
  if (nameLower.includes('ml') || nameLower.includes('liter') || nameLower.includes('liquid') || 
      nameLower.includes('द्रव') || nameLower.includes('ec') || nameLower.includes('sl') || nameLower.includes('sc')) {
    return 'foliar_spray';
  }
  
  // Ultimate fallback based on most common category defaults
  if (categoryLower.includes('fertilizer')) return 'broadcasting';
  if (categoryLower.includes('organic')) return 'soil_application';
  
  return 'soil_application';  // Safe default - can't go wrong with soil application
}

// ═══════════════════════════════════════════════════════════════════════
// FALLBACK TASK TEMPLATES WITH PROPER TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════
const FALLBACK_TASK_TEMPLATES: Record<
  string,
  {
    task_name_en: string;
    task_name_hi: string;
    task_name_mr: string;
    category: string;
    days_offset: number;
    description_en: string;
    priority: string;
    seed_details?: {
      treatment_organic: string;
      treatment_chemical: string;
      beejamrut: string;
      depth_cm: string;
      spacing_note: string;
    };
  }
> = {
  planning: {
    task_name_en: "Crop planning, seed selection and procurement",
    task_name_hi: "फसल योजना, बीज चयन और खरीद",
    task_name_mr: "पीक नियोजन, बियाणे निवड आणि खरेदी",
    category: "planning",
    days_offset: -7,
    description_en: "Select high-yielding certified seeds from trusted sources, prepare land plan, calculate input requirements, and arrange all inputs",
    priority: "high",
  },
  land_preparation: {
    task_name_en: "Land preparation, FYM application and soil treatment",
    task_name_hi: "खेत तैयारी, गोबर खाद और मिट्टी उपचार",
    task_name_mr: "जमीन तयारी, शेणखत आणि माती सुधारणा",
    category: "land_preparation",
    days_offset: -5,
    description_en: "Deep plowing 25-30cm, 2-3 harrowing, leveling, FYM 5-10 tons/acre application, and soil treatment for optimal growth",
    priority: "critical",
  },
  sowing: {
    task_name_en: "Seed treatment and sowing",
    task_name_hi: "बीज उपचार और बुवाई",
    task_name_mr: "बियाणे प्रक्रिया आणि पेरणी",
    category: "sowing",
    days_offset: 0,
    description_en: "Treat seeds with Trichoderma/Rhizobium, sow at optimal spacing and depth for uniform germination",
    priority: "critical",
    seed_details: {
      treatment_organic: "Trichoderma viride @ 4g/kg + Rhizobium/Azotobacter",
      treatment_chemical: "Thiram @ 2.5g/kg or Carbendazim @ 2g/kg",
      beejamrut: "Soak seeds in Beejamrut for 20-30 minutes",
      depth_cm: "3-5 cm depending on seed size",
      spacing_note: "Maintain proper row and plant spacing"
    }
  },
  germination: {
    task_name_en: "Germination monitoring and gap filling",
    task_name_hi: "अंकुरण निगरानी और गैप भरना",
    task_name_mr: "उगवण तपासणी आणि रिकाम्या जागा भरणे",
    category: "irrigation",
    days_offset: 7,
    description_en: "Check germination percentage and fill gaps within 7-10 days",
    priority: "high",
  },
  vegetative_growth: {
    task_name_en: "Vegetative growth management",
    task_name_hi: "वनस्पति वृद्धि प्रबंधन",
    task_name_mr: "वाढीचे व्यवस्थापन",
    category: "growth_promoter",
    days_offset: 30,
    description_en: "Apply growth promoters and manage plant nutrition during vegetative stage",
    priority: "high",
  },
  reproductive: {
    task_name_en: "Flowering and fruit setting care",
    task_name_hi: "फूल और फल आने का ध्यान",
    task_name_mr: "फुलोरा आणि फळ धारणा काळजी",
    category: "fertilizer",
    days_offset: 60,
    description_en: "Provide proper nutrition during flowering and fruiting for maximum yield",
    priority: "critical",
  },
  maturity: {
    task_name_en: "Crop maturity observation",
    task_name_hi: "फसल पकने की निगरानी",
    task_name_mr: "पीक पक्वता निरीक्षण",
    category: "irrigation",
    days_offset: 90,
    description_en: "Monitor crop maturity signs and prepare for harvest",
    priority: "medium",
  },
  harvest: {
    task_name_en: "Harvesting",
    task_name_hi: "फसल कटाई",
    task_name_mr: "काढणी/कापणी",
    category: "harvest",
    days_offset: 120,
    description_en: "Harvest the crop at optimal maturity for best quality and yield",
    priority: "critical",
  },
  post_harvest: {
    task_name_en: "Post-harvest processing",
    task_name_hi: "कटाई के बाद प्रक्रिया",
    task_name_mr: "काढणी नंतर प्रक्रिया",
    category: "post_harvest",
    days_offset: 125,
    description_en: "Process, dry, grade and store the harvested produce properly",
    priority: "high",
  },
  fallow_restoration: {
    task_name_en: "Soil restoration and preparation",
    task_name_hi: "मिट्टी सुधार और तैयारी",
    task_name_mr: "माती सुधारणा आणि तयारी",
    category: "land_preparation",
    days_offset: 130,
    description_en: "Restore soil health after harvest through green manuring and organic inputs",
    priority: "medium",
  },
};

function generateFallbackTask(
  stage: FarmingStage,
  translatedCropName: string,
  landAreaAcres: number,
  farmingType: string,
  language: string,
): any {
  const template = FALLBACK_TASK_TEMPLATES[stage.stage_key];
  if (!template) {
    return {
      task_name: `${stage.stage_name} - ${translatedCropName}`,
      stage_key: stage.stage_key,
      stage_order: stage.stage_order,
      category: "other",
      days_from_sowing: stage.stage_order * 15,
      priority: "medium",
      description: `${stage.stage_name} ${language === "mr" ? "साठी कार्य" : language === "hi" ? "के लिए कार्य" : "task for"} ${translatedCropName}`,
      instructions: [
        `${stage.stage_name.toLowerCase()} ${language === "mr" ? "पूर्ण करा" : language === "hi" ? "पूरा करें" : "complete"}`,
      ],
      yield_impact: "15-20% yield improvement",
      skip_penalty: "10-15% yield loss",
      estimated_cost: Math.round(landAreaAcres * 200),
      is_fallback: true,
    };
  }

  // Select task name based on language - CRITICAL: Use translated crop name
  let taskName = template.task_name_en;
  if (language === "hi") taskName = template.task_name_hi;
  if (language === "mr") taskName = template.task_name_mr;

  // CRITICAL FIX: Append translated crop name, not English
  const fullTaskName = `${translatedCropName} - ${taskName}`;

  // Generate language-appropriate description
  let description = template.description_en;
  if (language === "mr") {
    description = `${translatedCropName} पिकासाठी ${template.description_en.toLowerCase()} करणे आवश्यक आहे. हे कार्य योग्यरित्या केल्यास उत्पादन वाढेल.`;
  } else if (language === "hi") {
    description = `${translatedCropName} फसल के लिए ${template.description_en.toLowerCase()} करना जरूरी है। यह कार्य सही तरीके से करने से उपज बढ़ेगी।`;
  }

  // Generate language-appropriate instructions
  let instructions: string[] = [];
  if (language === "mr") {
    instructions = [
      `${translatedCropName} पिकाची चांगली वाढ होण्यासाठी हे कार्य करा`,
      `${landAreaAcres} एकर क्षेत्रासाठी योग्य प्रमाणात साधने वापरा`,
      `${farmingType === "organic_only" ? "सेंद्रिय पद्धतीने" : "योग्य पद्धतीने"} कार्य करा`,
      `सकाळी लवकर किंवा संध्याकाळी कार्य करा`,
      `हवामानाची माहिती घ्या आणि त्यानुसार नियोजन करा`,
    ];
  } else if (language === "hi") {
    instructions = [
      `${translatedCropName} फसल की अच्छी बढ़वार के लिए यह कार्य करें`,
      `${landAreaAcres} एकड़ क्षेत्र के लिए उचित मात्रा में सामग्री उपयोग करें`,
      `${farmingType === "organic_only" ? "जैविक तरीके से" : "उचित तरीके से"} कार्य करें`,
      `सुबह जल्दी या शाम को कार्य करें`,
      `मौसम की जानकारी लें और उसके अनुसार योजना बनाएं`,
    ];
  } else {
    instructions = [
      `Complete this task for healthy ${translatedCropName} growth`,
      `Use appropriate quantities for ${landAreaAcres} acres`,
      `Follow ${farmingType === "organic_only" ? "organic" : "recommended"} practices`,
      `Work in early morning or evening hours`,
      `Check weather conditions before planning`,
    ];
  }

  return {
    task_name: fullTaskName,
    stage_key: stage.stage_key,
    stage_order: stage.stage_order,
    category: template.category,
    days_from_sowing: template.days_offset,
    priority: template.priority,
    description: description,
    instructions: instructions,
    yield_impact: YIELD_BOOST_TECHNIQUES[stage.stage_key]?.yieldImpact || "15-20% yield improvement",
    skip_penalty: YIELD_BOOST_TECHNIQUES[stage.stage_key]?.skipPenalty || "10-15% yield loss",
    estimated_cost: Math.round(landAreaAcres * 300),
    is_fallback: true,
    product_recommendations: [],
  };
}

function calculateTaskCost(
  category: string,
  taskName: string,
  landAcres: number,
  laborRate: number,
  seedCost: number,
  fertilizerCost: number,
  fymCost: number,
  language: string,
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

  let breakdown = "";
  if (language === "mr") {
    breakdown = `साहित्य ₹${productCost} + मजुरी (${laborDays.toFixed(1)} दिवस × ₹${laborRate}) = ₹${totalCost}`;
  } else if (language === "hi") {
    breakdown = `सामग्री ₹${productCost} + मजदूरी (${laborDays.toFixed(1)} दिन × ₹${laborRate}) = ₹${totalCost}`;
  } else {
    breakdown = `Material ₹${productCost} + Labor (${laborDays.toFixed(1)} days × ₹${laborRate}) = ₹${totalCost}`;
  }

  return { totalCost, laborCost, productCost, laborDays, breakdown };
}

// ═══════════════════════════════════════════════════════════════════════
// FETCH PRODUCTS FROM master_products TABLE
// ═══════════════════════════════════════════════════════════════════════
async function fetchRecommendedProducts(
  supabase: any,
  cropName: string,
  stageKey: string,
  category: string,
  farmingType: string,
): Promise<any[]> {
  try {
    let query = supabase
      .from("master_products")
      .select(
        "id, name, product_type, active_ingredients, dosage_instructions, application_method, price_range, safety_level, organic_certified, suitable_crops, brand",
      )
      .eq("status", "active")
      .eq("ai_recommendable", true)
      .limit(5);

    // Filter by organic certification for organic farming mode
    if (farmingType === "organic_only") {
      query = query.eq("organic_certified", true);
    }

    // Filter by category/product type
    if (category) {
      const productTypeMap: Record<string, string[]> = {
        fertilizer: ["fertilizer", "nutrient"],
        growth_promoter: ["growth_promoter", "biostimulant"],
        pest_control: ["pesticide", "insecticide", "bio-pesticide"],
        disease_control: ["fungicide", "bio-fungicide"],
        organic_input: ["organic", "bio-fertilizer"],
      };
      const types = productTypeMap[category];
      if (types) {
        query = query.in("product_type", types);
      }
    }

    const { data, error } = await query;

    if (error || !data) {
      console.log("📦 [Products] No products found:", error?.message);
      return [];
    }

    console.log(`📦 [Products] Found ${data.length} products for ${category}/${stageKey}`);

    // Sort by priority: organic first, then by effectiveness
    return data.sort((a: any, b: any) => {
      if (a.organic_certified && !b.organic_certified) return -1;
      if (!a.organic_certified && b.organic_certified) return 1;
      return 0;
    });
  } catch (e) {
    console.error("📦 [Products] Error:", e);
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
// CONTEXT SECTION BUILDER - LANGUAGE-AWARE (reduces token bloat significantly)
// ═══════════════════════════════════════════════════════════════════════
function buildContextSection(language: string, languageName: string): string {
  // Only include language-specific examples for that language
  const styleExamples = language === 'mr' ? `
EXAMPLE PHRASES (Marathi rural dialect):
- "शेतकरी बंधूंनो, आज आपल्या पिकाला पाणी द्यायची वेळ झाली..."
- "जसं आपण आपल्या मुलांना वेळेवर जेवण देतो, तसंच पिकालाही वेळेवर खत द्यायला हवं"
` : language === 'hi' ? `
EXAMPLE PHRASES (Hindi rural dialect):
- "किसान भाइयों, आज अपनी फसल को पानी देने का समय आ गया है..."
- "जैसे हम अपने बच्चों को समय पर खाना खिलाते हैं, वैसे ही फसल को भी समय पर खाद देनी चाहिए"
` : `
EXAMPLE PHRASES (English - clear, practical):
- "Farmer friend, today is the right time to water your crop..."
- "Just as we feed children on time, crops need timely nutrition too"
`;

  // For English, use simpler context without Hindi/Marathi text
  if (language === 'en') {
    return `
You are Dr. AgriGenius - Agricultural Scientist with 45+ years of field experience at ICAR-IARI, New Delhi.

COMMUNICATION STYLE:
- Use CLEAR, PRACTICAL English suitable for farmers
- Include actionable timing (early morning, evening)
- Explain why each step matters (yield impact, cost savings)
${styleExamples}

WRITING RULES (COMPACT OUTPUT):
1. Descriptions: 15-25 words MAX per task
2. Instructions: 2-3 short bullet points (10-15 words each)
3. Include timing and yield impact briefly`;
  }

  // For Hindi/Marathi, include rural dialect guidance
  return `
You are Dr. AgriGenius - Agricultural Scientist with 45+ years experience at ICAR-IARI.

COMMUNICATION STYLE (${languageName}):
- Speak like a wise village elder farmer
- Use WARM, ENCOURAGING, CONVERSATIONAL rural dialect
- Make every instruction ACTIONABLE with clear timing
${styleExamples}

WRITING RULES (COMPACT OUTPUT):
1. Descriptions: 15-25 words MAX per task
2. Instructions: 2-3 short bullet points (10-15 words each)
3. Include timing and yield impact briefly`;
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
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const reqBody = await req.json();
    const {
      landId,
      cropName,
      cropVariety,
      sowingDate,
      isReadyMadePlant = false,
      nurseryDays = 0,
      localizedCropName = "",
      farmingType = "organic_fertilizer",
      aiProvider: requestedProvider,
      // NEW: Multi-crop support (array of up to 3 intercrops)
      intercrops = [],
      backdatedConsent = false,
    } = reqBody;
    
    // Parse intercrops array - support both new array format and legacy single intercrop
    const intercropArray: Array<{cropName: string; localizedCropName?: string; cropVariety?: string; areaPercent?: number}> = 
      Array.isArray(intercrops) ? intercrops : 
      (reqBody.intercrop ? [reqBody.intercrop] : []);
    
    const intercrop1 = intercropArray[0] || null;
    const intercrop2 = intercropArray[1] || null;
    const intercrop3 = intercropArray[2] || null;
    
    console.log(`🌿 [AI-Schedule] Intercrops received: ${intercropArray.length} (max 3)`);
    if (intercrop1) console.log(`  1️⃣ ${intercrop1.cropName} - ${intercrop1.areaPercent}%`);
    if (intercrop2) console.log(`  2️⃣ ${intercrop2.cropName} - ${intercrop2.areaPercent}%`);
    if (intercrop3) console.log(`  3️⃣ ${intercrop3.cropName} - ${intercrop3.areaPercent}%`);
    
    // CRITICAL: Use the app language from request, default to English if not provided
    // This ensures schedule is generated in the user's selected app language
    const language = reqBody.language || "en";
    console.log(`🌐 [AI-Schedule] Using language: ${language} (from request: ${reqBody.language || 'not provided, defaulting to en'})`);
    
    const tenantId = req.headers.get("x-tenant-id") || "";
    const farmerId = req.headers.get("x-farmer-id") || "";
    
    // Determine AI provider - PRODUCTION: prioritize Gemini 2.5 Flash if key is available
    const headerProvider = req.headers.get("x-ai-provider") as AIProvider | null;
    
    // Check for GEMINI_API_KEY in Supabase secrets (best for rural agriculture language)
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    let aiProvider: AIProvider;
    
    if (geminiKey && geminiKey.trim() !== "") {
      aiProvider = "gemini";
      console.log(`✅ [AI-Schedule] Using Gemini 2.5 Flash with GEMINI_API_KEY from Supabase secrets`);
      console.log(`🌾 [AI-Schedule] Enhanced rural agriculture language support enabled`);
    } else {
      aiProvider = requestedProvider || headerProvider || AI_CONFIG.DEFAULT_PROVIDER;
      console.log(`⚠️ [AI-Schedule] GEMINI_API_KEY not found, using ${aiProvider} provider`);
    }
    
    // Get API key and model for the selected provider - all from secrets
    const apiKey = getAPIKey(aiProvider);
    const apiEndpoint = getAPIEndpoint(aiProvider);
    const model = getModel(aiProvider, "default");
    const fallbackModel = getModel(aiProvider, "fallback");
    
    console.log(`🤖 [AI-Schedule] Provider: ${aiProvider} | Model: ${model}`);
    console.log(`📡 [AI-Schedule] Endpoint: ${apiEndpoint}`);
    console.log(`🌾 [AI-Schedule] isReadyMadePlant: ${isReadyMadePlant}, nurseryDays: ${nurseryDays}`);

    // ═══════════════════════════════════════════════════════════════════
    // FETCH CROP TRANSLATION FROM DATABASE FIRST
    // ═══════════════════════════════════════════════════════════════════
    let translatedCropName = localizedCropName || "";
    
    // Try to fetch from crops table for accurate translation
    const { data: cropData, error: cropError } = await supabase
      .from('crops')
      .select('label, label_hi, label_mr')
      .or(`label.ilike.%${cropName}%,label_hi.ilike.%${cropName}%,label_mr.ilike.%${cropName}%`)
      .limit(1)
      .single();
    
    if (cropData && !cropError) {
      if (language === 'mr' && cropData.label_mr) {
        translatedCropName = cropData.label_mr;
      } else if (language === 'hi' && cropData.label_hi) {
        translatedCropName = cropData.label_hi;
      } else if (cropData.label) {
        translatedCropName = cropData.label;
      }
      console.log(`📦 [DB] Fetched crop translation from DB: ${translatedCropName}`);
    }
    
    // Fallback to hardcoded translations if DB fetch failed
    if (!translatedCropName) {
      translatedCropName = getTranslatedCropName(cropName, language);
      console.log(`📦 [Fallback] Using hardcoded translation: ${translatedCropName}`);
    }
    
    console.log(`🌾 [AI-Schedule] Crop: ${cropName} → ${translatedCropName} (${language})`);
    console.log(`🌾 [AI-Schedule] Starting ${farmingType} schedule for ${translatedCropName} on ${sowingDate}`);

    // Rate limiting
    const rateLimitResult = await checkRateLimit(`${farmerId}-${tenantId}`, "ai-smart-schedule", {
      maxRequests: 20,
      windowMs: 60000,
    });
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateLimitResult.retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      console.error("❌ Failed to fetch farming stages:", stagesError);
      throw new Error("Farming stages not configured");
    }

    console.log(`📋 [Stages] Loaded ${farmingStages.length} farming stages`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: FETCH LAND DATA
    // ═══════════════════════════════════════════════════════════════════
    const { data: land, error: landError } = await supabase.from("lands").select("*").eq("id", landId).single();

    if (landError || !land) {
      throw new Error(`Land not found: ${landError?.message}`);
    }

    const languageName = LANGUAGES[language] || "Hindi";
    const ruralTerms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
    const state = land.state || land.district?.split(",").pop()?.trim() || "Maharashtra";
    const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];

    // ═══════════════════════════════════════════════════════════════════
    // VARIETY CONTEXT (DB-authoritative — Phase 3 variety-aware scheduling)
    // ═══════════════════════════════════════════════════════════════════
    let varietyProfile: VarietyProfile | null = null;
    try {
      varietyProfile = await loadVarietyProfile(supabase, {
        cropName,
        cropVariety,
        stateName: state,
        // Land's canonical variety column is `current_crop_variety_id` (UUID → master_products.id, seed only).
        landVarietyId: (land as any).current_crop_variety_id || (land as any).variety_id || null,
      });
      if (varietyProfile) {
        console.log(
          `🌾 [Variety] Resolved "${cropVariety}" → ${varietyProfile.name} ` +
          `[${varietyProfile.source}] state_match=${varietyProfile.state_match} ` +
          `conf=${varietyProfile.data_confidence_score}`
        );
      } else if (cropVariety) {
        console.log(`🌾 [Variety] No registry match for "${cropVariety}" — falling back to generic crop defaults`);
      }
    } catch (e) {
      console.warn(`⚠️ [Variety] loader failed: ${(e as Error).message}`);
    }
    const varietyPromptBlock = formatVarietyProfileForPrompt(varietyProfile, language);
    
    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL: ACCURATE LAND AREA CALCULATION
    // ═══════════════════════════════════════════════════════════════════
    // Convert all area units to acres for consistent calculations
    // 1 acre = 40 guntha, 1 hectare = 2.471 acres
    let landAreaAcres = 0;
    if (land.area_acres && land.area_acres > 0) {
      landAreaAcres = land.area_acres;
    } else if (land.area_in_acres && land.area_in_acres > 0) {
      landAreaAcres = land.area_in_acres;
    } else if (land.area_guntas && land.area_guntas > 0) {
      landAreaAcres = land.area_guntas / 40; // 40 guntha = 1 acre
    } else if (land.area_hectares && land.area_hectares > 0) {
      landAreaAcres = land.area_hectares * 2.471;
    } else {
      landAreaAcres = 1; // Default to 1 acre if no area specified
    }
    
    const landAreaHa = landAreaAcres * 0.4047;
    const landAreaGuntha = Math.round(landAreaAcres * 40);
    
    console.log(`📐 [Land] Area: ${landAreaAcres.toFixed(2)} acres (${landAreaGuntha} guntha, ${landAreaHa.toFixed(2)} ha)`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2.5: FETCH SOIL HEALTH DATA FOR ACCURATE DOSE ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════
    let soilData: any = null;
    let soilPh = 7.0; // Default neutral pH
    let soilN = 50, soilP = 25, soilK = 25; // Default NPK values in kg/ha
    let soilPhAdvice = "";
    
    try {
      const { data: latestSoilData, error: soilError } = await supabase
        .from("soil_health")
        .select("ph_level, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, organic_carbon, soil_type, fertility_class")
        .eq("land_id", landId)
        .order("test_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!soilError && latestSoilData) {
        soilData = latestSoilData;
        soilPh = latestSoilData.ph_level || 7.0;
        soilN = latestSoilData.nitrogen_kg_per_ha || 50;
        soilP = latestSoilData.phosphorus_kg_per_ha || 25;
        soilK = latestSoilData.potassium_kg_per_ha || 25;
        
        console.log(`🧪 [Soil] Found soil data: pH=${soilPh}, N=${soilN}, P=${soilP}, K=${soilK} kg/ha`);
        
        // Generate pH-based fertilizer advice
        if (soilPh < 6.0) {
          soilPhAdvice = language === "mr" 
            ? "अत्यंत आम्लयुक्त माती: चुना वापरा (200-400 kg/acre), अमोनियम सल्फेट वापरा, युरिया टाळा"
            : language === "hi"
            ? "अत्यंत अम्लीय मिट्टी: चूना डालें (200-400 kg/acre), अमोनियम सल्फेट उपयोग करें, यूरिया बचें"
            : "Highly acidic soil: Apply lime (200-400 kg/acre), use ammonium sulfate, avoid urea";
        } else if (soilPh < 6.5) {
          soilPhAdvice = language === "mr"
            ? "सौम्य आम्लयुक्त माती: थोडा चुना वापरा, सेंद्रिय खत वाढवा"
            : language === "hi"
            ? "हल्की अम्लीय मिट्टी: थोड़ा चूना डालें, जैविक खाद बढ़ाएं"
            : "Mildly acidic soil: Apply some lime, increase organic matter";
        } else if (soilPh <= 7.5) {
          soilPhAdvice = language === "mr"
            ? "संतुलित pH: सर्व खते योग्य, शिफारसीप्रमाणे वापरा"
            : language === "hi"
            ? "संतुलित pH: सभी खाद उपयुक्त, सिफारिश के अनुसार उपयोग करें"
            : "Neutral pH: All fertilizers suitable, use as recommended";
        } else if (soilPh <= 8.5) {
          soilPhAdvice = language === "mr"
            ? "क्षारयुक्त माती: जिप्सम वापरा (500 kg/acre), SSP वापरा, DAP टाळा, सेंद्रिय खत वाढवा"
            : language === "hi"
            ? "क्षारीय मिट्टी: जिप्सम डालें (500 kg/acre), SSP उपयोग करें, DAP बचें, जैविक खाद बढ़ाएं"
            : "Alkaline soil: Apply gypsum (500 kg/acre), use SSP, avoid DAP, increase organic matter";
        } else {
          soilPhAdvice = language === "mr"
            ? "अत्यंत क्षारयुक्त माती: भारी जिप्सम (800+ kg/acre), आम्लयुक्त खते वापरा, सेंद्रिय शेती करा"
            : language === "hi"
            ? "अत्यंत क्षारीय मिट्टी: भारी जिप्सम (800+ kg/acre), अम्लीय खाद उपयोग करें, जैविक खेती करें"
            : "Highly alkaline soil: Heavy gypsum (800+ kg/acre), use acidic fertilizers, practice organic farming";
        }
      } else {
        console.log(`⚠️ [Soil] No soil data found for land ${landId}, using defaults`);
      }
    } catch (e) {
      console.error(`❌ [Soil] Error fetching soil data:`, e);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: VALIDATE CROP SUITABILITY
    // ═══════════════════════════════════════════════════════════════════
    const sowingMonth = new Date(sowingDate).getMonth() + 1;
    const suitabilityCheck = validateCropSuitability(cropName, land, sowingMonth, language);

    console.log(`🔍 [Suitability] Score: ${suitabilityCheck.score}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: CALCULATE COSTS BASED ON ACTUAL SOIL DATA
    // ═══════════════════════════════════════════════════════════════════
    const cropLower = cropName.toLowerCase().replace(/\s+/g, "");
    const seedData = SEED_RATES[cropLower] || {
      rate_kg_per_acre: 10,
      spacing_cm: "Standard",
      price_per_kg: 50,
      treatment: "Trichoderma 4g/kg",
    };
    // Calculate exact seed quantity for THIS land area
    const exactSeedQty = Math.round(seedData.rate_kg_per_acre * landAreaAcres * 10) / 10;
    const seedCost = Math.round(exactSeedQty * seedData.price_per_kg);

    const target = NPK_TARGETS[cropLower] || NPK_TARGETS["default"];
    // Use ACTUAL soil data values, not land table values
    const currentN = soilN;
    const currentP = soilP;
    const currentK = soilK;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // Calculate FYM for THIS land area
    const fymTons = Math.round(5 * landAreaAcres * 10) / 10;
    const fymCost = Math.round(fymTons * 800);

    // Calculate fertilizer quantities for THIS land area
    const ureaKg = Math.round((nDeficit * landAreaHa) / 0.46);
    const dapKg = Math.round((pDeficit * landAreaHa) / 0.46);
    const mopKg = Math.round((kDeficit * landAreaHa) / 0.6);
    const ureaCost = Math.round(ureaKg * FERTILIZER_PRICES.urea.price_per_kg);
    const dapCost = Math.round(dapKg * FERTILIZER_PRICES.dap.price_per_kg);
    const mopCost = Math.round(mopKg * FERTILIZER_PRICES.mop.price_per_kg);
    const totalFertilizerCost = ureaCost + dapCost + mopCost;
    
    console.log(`💰 [Cost] Seed: ₹${seedCost}, Fertilizer: ₹${totalFertilizerCost}, FYM: ₹${fymCost}`);

    const irrigationRules = buildIrrigationRules(land.irrigation_type || "manual");

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: BUILD STAGE-BASED AI PROMPT - ALL STAGES MANDATORY
    // ═══════════════════════════════════════════════════════════════════
    const totalStages = farmingStages.length;
    
    // GET MINIMUM TASK COUNT FOR THIS CROP (addresses Issue #3 - sugarcane needs 30+ tasks)
    const cropTaskConfig = CROP_TASK_MULTIPLIERS[cropLower] || CROP_TASK_MULTIPLIERS['default'];
    // CAP task count to prevent JSON truncation (max 20 tasks to stay well within token limits)
    // Long duration crops like Sugarcane still get good coverage with fewer, more comprehensive tasks
    const rawMinTasks = Math.max(totalStages * 2, Math.min(cropTaskConfig.minTasks, 20));
    const minTaskCount = Math.min(rawMinTasks, 20);
    // VARIETY-FIRST DURATION: variety.maturity_days_max wins over crop default.
    // Per consumer contract (mem://database/variety-master-schema-v1 §2) and the
    // user-spec ("Rice Ambemohar 130d → sowing+130d"), the variety profile is
    // the authoritative source for total crop duration. The hard-coded
    // CROP_TASK_MULTIPLIERS value is only used when no variety is resolved.
    const cropDurationDays =
      varietyProfile?.maturity_days_max ||
      varietyProfile?.maturity_days_min ||
      cropTaskConfig.durationDays;
    console.log(
      `📋 [AI] Building prompt for ${totalStages} stages, min ${minTaskCount} tasks for ${cropDurationDays}-day crop ` +
      `(source: ${varietyProfile?.maturity_days_max ? 'variety.maturity_days_max' : varietyProfile?.maturity_days_min ? 'variety.maturity_days_min' : 'crop_default'})`
    );

    // OPTIMIZED: Force a compact output size (prevents JSON truncation)
    const tasksPerStage = Math.ceil(minTaskCount / totalStages);
    const stagesPrompt = farmingStages
      .map((stage: FarmingStage) => {
        return `${stage.stage_order}. ${stage.stage_name} (${stage.stage_key}): ${stage.stage_description} - exactly ${tasksPerStage} tasks`;
      })
      .join("\n");

    const allStageKeys = farmingStages.map((s: FarmingStage) => s.stage_key);
    console.log(`📋 [AI] Required stages: ${allStageKeys.join(", ")}`);

    // Build farming type specific rules
    const district = land.district || "";
    const region = getRegionFromDistrict(district, state);
    const regionalDialectTerms = getRegionalDialectTerms(language, region);
    const regionalLanguageRules = buildRegionalLanguageRules(language, region, district);

    let farmingTypeRules = "";
    let farmingTypeLabel = "";

    if (farmingType === "organic_only") {
      farmingTypeLabel =
        language === "mr" ? "100% सेंद्रिय शेती" : language === "hi" ? "100% जैविक खेती" : "100% ORGANIC FARMING";
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🌿 ${farmingTypeLabel}
═══════════════════════════════════════════════════════════════
✅ ALLOWED: FYM, Vermicompost, Jeevamrut, Panchagavya, Neem oil, Trichoderma, Pseudomonas, Beauveria, Seaweed, Humic acid
❌ BANNED: Urea, DAP, MOP, NPK, Imidacloprid, Chlorpyriphos, Carbendazim, Mancozeb, ANY chemical

PRODUCT BRANDS TO RECOMMEND:
- Organic: Dr. Earth, Coromandel Gromor Organic, Iffco Organic, IARI Bio-fertilizers
- Bio-pesticides: Multiplex Bio, Anand Agro, T-Stanes Trichoderma`;
    } else if (farmingType === "fertilizer_pesticide") {
      farmingTypeLabel =
        language === "mr"
          ? "रासायनिक खत + किडनाशक"
          : language === "hi"
            ? "रासायनिक खाद + कीटनाशक"
            : "CHEMICAL FERTILIZER + PESTICIDE";
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🧪 ${farmingTypeLabel}
═══════════════════════════════════════════════════════════════
✅ RECOMMEND chemical fertilizers and pesticides for MAXIMUM yield
- Fertilizers: Urea (₹6.5/kg), DAP (₹30/kg), MOP (₹20/kg), NPK complexes
- Pesticides: Imidacloprid, Thiamethoxam, Chlorpyriphos for insects
- Fungicides: Carbendazim, Mancozeb, Copper oxychloride for diseases

PRODUCT BRANDS TO RECOMMEND:
- Fertilizers: IFFCO, Coromandel, Yara, UPL, Zuari
- Pesticides: Bayer, Syngenta, UPL, Dhanuka, Rallis India
- Fungicides: BASF, Corteva, FMC, PI Industries`;
    } else {
      farmingTypeLabel =
        language === "mr"
          ? "सेंद्रिय + रासायनिक (संतुलित)"
          : language === "hi"
            ? "जैविक + रासायनिक (संतुलित)"
            : "ORGANIC + CHEMICAL (BALANCED)";
      farmingTypeRules = `
═══════════════════════════════════════════════════════════════
🌱🧪 ${farmingTypeLabel}
═══════════════════════════════════════════════════════════════
PRIORITY ORDER: Organic FIRST → Growth Promoters → Fertilizers → Pesticides (LAST)
- Start with: FYM, Vermicompost, Bio-fertilizers
- Add: Seaweed, Humic acid for growth
- Supplement: Urea, DAP, MOP based on soil test
- Use pesticides: ONLY when pest threshold exceeded (IPM approach)

PRODUCT BRANDS TO RECOMMEND:
- Organic: Multiplex Bio, Iffco Bio, IARI cultures
- Fertilizers: IFFCO, Coromandel, Yara
- IPM Products: Neem-based + chemical backup`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // WORLD-CLASS AGRICULTURE SCIENTIST AI PROMPT
    // Using CTID Framework: Context → Task → Instruction → Data
    // ═══════════════════════════════════════════════════════════════════
    
    // Build seed preparation details
    const seedInfo = SEED_RATES[cropLower] || {
      rate_kg_per_acre: 10,
      spacing_cm: "Standard",
      price_per_kg: 50,
      treatment: "Trichoderma 4g/kg",
    };
    
    // Build seed preparation or nursery plant details
    let seedPreparationDetails = "";
    
    if (isReadyMadePlant && nurseryDays > 0) {
      // READY-MADE NURSERY PLANTS - Skip seed preparation
      const nurseryLabel = language === "mr" ? "तयार रोपे वापरत आहात" :
                          language === "hi" ? "तैयार पौधे उपयोग कर रहे हैं" :
                          "USING READY-MADE NURSERY PLANTS";
      
      seedPreparationDetails = `
═══════════════════════════════════════════════════════════════
🌱 ${nurseryLabel}
═══════════════════════════════════════════════════════════════
⚠️ CRITICAL: User is using READY-MADE NURSERY PLANTS (${nurseryDays} days old)
- DO NOT include seed_treatment task
- DO NOT include seed sowing task  
- START schedule from transplanting stage
- Nursery plant age: ${nurseryDays} days from seed sowing
- All days_from_sowing should be calculated from transplanting date (day 0)
- Seed preparation was already done ${nurseryDays} days ago in nursery

TRANSPLANTING DETAILS:
- Number of plants needed: ${Math.round(landAreaAcres * 10000 / 2)} plants (approx. 2 sq ft spacing)
- Transplanting depth: 3-5 cm
- Water immediately after transplanting
- Apply root dip solution (Trichoderma @ 10g/liter)`;
    } else {
      // REGULAR SOWING - Include full seed preparation
      seedPreparationDetails = `
SEED PREPARATION (बियाणे तयारी):
- Seed Rate: ${seedInfo.rate_kg_per_acre} kg/acre (${Math.round(seedInfo.rate_kg_per_acre * landAreaAcres)} kg total)
- Spacing: ${seedInfo.spacing_cm}
- Treatment: ${seedInfo.treatment}
- Cost: ₹${seedInfo.price_per_kg}/kg (Total: ₹${seedCost})
${farmingType === "organic_only" ? "- Use Trichoderma viride @ 4g/kg + Rhizobium for legumes" : ""}
${farmingType === "organic_only" ? "- Avoid chemical seed treatment, use Beejamrut soak (1 liter)" : "- Seed treatment: Thiram/Carbendazim @ 2-3g/kg"}

SEED TREATMENT TASK IS MANDATORY:
- Include detailed seed_treatment task in sowing stage
- Specify exact treatment method, duration, and drying time
- Include Beejamrut/Trichoderma for organic farming
- Include Thiram/Carbendazim for chemical farming`;
    }

    // CONTEXT Section - LANGUAGE-AWARE (reduces token bloat)
    const contextSection = buildContextSection(language, languageName);

    // ═══════════════════════════════════════════════════════════════════
    // WATER REQUIREMENT CALCULATIONS FOR THIS LAND
    // ═══════════════════════════════════════════════════════════════════
    const waterReq = CROP_WATER_REQUIREMENTS[cropLower] || CROP_WATER_REQUIREMENTS.default;
    const totalWaterLiters = Math.round(waterReq.total_mm * landAreaHa * 10000); // mm to liters/ha
    const perIrrigationLiters = Math.round(waterReq.etc_mm_per_day * waterReq.irrigation_interval_days * landAreaHa * 10000);
    const irrigationType = land.irrigation_type || 'manual';
    
    // Adjust water based on irrigation type efficiency
    let adjustedWaterPerIrrigation = perIrrigationLiters;
    let irrigationEfficiencyNote = "";
    if (irrigationType === 'drip') {
      adjustedWaterPerIrrigation = Math.round(perIrrigationLiters * 0.5);
      irrigationEfficiencyNote = language === "mr" 
        ? `✅ ठिबक सिंचन: 40-60% पाणी बचत, प्रत्येक सिंचनासाठी ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लागेल`
        : language === "hi"
        ? `✅ ड्रिप सिंचाई: 40-60% पानी बचत, हर सिंचाई में ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लगेगा`
        : `✅ DRIP: Save 40-60% water, apply ${Math.round(adjustedWaterPerIrrigation / 1000)} KL per irrigation`;
    } else if (irrigationType === 'sprinkler') {
      adjustedWaterPerIrrigation = Math.round(perIrrigationLiters * 0.7);
      irrigationEfficiencyNote = language === "mr"
        ? `✅ तुषार सिंचन: 30% पाणी बचत, प्रत्येक सिंचनासाठी ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लागेल`
        : language === "hi"
        ? `✅ स्प्रिंकलर सिंचाई: 30% पानी बचत, हर सिंचाई में ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लगेगा`
        : `✅ SPRINKLER: Save 30% water, apply ${Math.round(adjustedWaterPerIrrigation / 1000)} KL per irrigation`;
    } else {
      adjustedWaterPerIrrigation = Math.round(perIrrigationLiters * 1.2);
      irrigationEfficiencyNote = language === "mr"
        ? `⚠️ मॅन्युअल/पूर सिंचन: पाण्याचा अपव्यय, प्रत्येक सिंचनासाठी ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लागेल`
        : language === "hi"
        ? `⚠️ मैन्युअल/बाढ़ सिंचाई: पानी की बर्बादी, हर सिंचाई में ${Math.round(adjustedWaterPerIrrigation / 1000)} KL लगेगा`
        : `⚠️ FLOOD/MANUAL: Wasteful, apply ${Math.round(adjustedWaterPerIrrigation / 1000)} KL per irrigation`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRESCRIPTION FRAMING - SOIL TEST CONDITIONAL LOGIC
    // ═══════════════════════════════════════════════════════════════════
    const hasSoilData = soilData && (soilData.ph_level || soilData.nitrogen_kg_per_ha);
    const soilTestDate = soilData?.test_date || null;
    const isSoilTestRecent = soilTestDate && 
      (new Date().getTime() - new Date(soilTestDate).getTime()) < 180 * 24 * 60 * 60 * 1000; // Less than 6 months
    
    let prescriptionFraming = "";
    let soilTestInstruction = "";
    
    if (hasSoilData) {
      prescriptionFraming = language === "mr" ? `
═══════════════════════════════════════════════════════════════
🩺 माती आरोग्य अहवाल उपलब्ध - औषध मोड
═══════════════════════════════════════════════════════════════
⚠️ महत्त्वाचे: शेतकऱ्याने आधीच माती परीक्षण केले आहे!
❌ "माती परीक्षण करा" किंवा "Soil Test" टास्क देऊ नका - आधीच झाले!
✅ खालील माती डेटा तुमचे DIAGNOSIS आहे
✅ तुमच्या शिफारसी या जमिनीसाठी औषध (उपचार) आहेत

हे रक्त तपासणी अहवालासारखे आहे → तुम्ही नेमके औषध देता, "रक्त तपासणी करा" असे सांगत नाही!
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
🩺 मिट्टी स्वास्थ्य रिपोर्ट उपलब्ध - दवाई मोड
═══════════════════════════════════════════════════════════════
⚠️ महत्वपूर्ण: किसान ने पहले ही मिट्टी परीक्षण किया है!
❌ "मिट्टी परीक्षण करें" या "Soil Test" टास्क मत दें - पहले ही हो गया!
✅ नीचे दिया गया मिट्टी डेटा आपका DIAGNOSIS है
✅ आपकी सिफारिशें इस जमीन के लिए दवाई (इलाज) हैं

यह खून की जांच रिपोर्ट जैसा है → आप सही दवाई देते हैं, "खून की जांच करो" नहीं कहते!
` : `
═══════════════════════════════════════════════════════════════
🩺 SOIL HEALTH REPORT ALREADY AVAILABLE - PRESCRIPTION MODE
═══════════════════════════════════════════════════════════════
⚠️ CRITICAL: Farmer has ALREADY conducted soil test!
❌ DO NOT recommend "माती परीक्षण करा" or "Soil Test" - ALREADY DONE!
✅ USE the existing soil data below as your DIAGNOSIS
✅ Your recommendations are MEDICINE (औषध/उपचार) for this specific land

This is like a BLOOD REPORT → You prescribe exact medicine, not "get a blood test"!
`;
      soilTestInstruction = language === "mr" 
        ? `❌ "Soil Test" टास्क टाळा - वैध माती अहवाल अस्तित्वात आहे`
        : language === "hi"
        ? `❌ "Soil Test" टास्क छोड़ें - वैध मिट्टी रिपोर्ट मौजूद है`
        : `❌ SKIP "Soil Test" task - Valid soil report exists`;
    } else {
      prescriptionFraming = language === "mr" ? `
⚠️ या जमिनीसाठी माती परीक्षण डेटा उपलब्ध नाही
✅ नियोजन टप्प्यात "माती परीक्षण" टास्क समाविष्ट करा
` : language === "hi" ? `
⚠️ इस जमीन के लिए मिट्टी परीक्षण डेटा उपलब्ध नहीं है
✅ योजना चरण में "मिट्टी परीक्षण" टास्क शामिल करें
` : `
⚠️ No soil test data available for this land
✅ Include "Soil Test" task in planning stage
`;
      soilTestInstruction = language === "mr"
        ? `✅ "माती परीक्षण" टास्क समाविष्ट करा - अलीकडील माती डेटा उपलब्ध नाही`
        : language === "hi"
        ? `✅ "मिट्टी परीक्षण" टास्क शामिल करें - हाल का मिट्टी डेटा उपलब्ध नहीं`
        : `✅ Include "Soil Test" task - No recent soil data available`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // NPK PRESCRIPTION - DEFICIT-BASED DOSING (NOT GENERIC)
    // ═══════════════════════════════════════════════════════════════════
    let npkPrescription = "";
    if (hasSoilData) {
      // Calculate organic alternatives
      const vermicompostKgForN = nDeficit > 0 ? Math.round((nDeficit * landAreaHa) / 0.015) : 0; // ~1.5% N in vermicompost
      const bonemealKgForP = pDeficit > 0 ? Math.round((pDeficit * landAreaHa) / 0.23) : 0; // ~23% P in bone meal
      const woodashKgForK = kDeficit > 0 ? Math.round((kDeficit * landAreaHa) / 0.05) : 0; // ~5% K in wood ash
      
      npkPrescription = language === "mr" ? `
═══════════════════════════════════════════════════════════════
💊 NPK औषध - नेमके या कमतरता भरून काढा
═══════════════════════════════════════════════════════════════
निदान (DIAGNOSIS):
- सध्याचे N: ${soilN} kg/ha | आवश्यक: ${target.n} kg/ha | कमतरता: ${nDeficit} kg/ha
- सध्याचे P: ${soilP} kg/ha | आवश्यक: ${target.p} kg/ha | कमतरता: ${pDeficit} kg/ha  
- सध्याचे K: ${soilK} kg/ha | आवश्यक: ${target.k} kg/ha | कमतरता: ${kDeficit} kg/ha

${landAreaAcres.toFixed(2)} एकर साठी औषध (PRESCRIPTION):
${nDeficit > 0 ? `- N कमतरता: ${ureaKg} kg युरिया द्या किंवा ${vermicompostKgForN} kg गांडूळखत (सेंद्रिय)` : '- N: पुरेसे ✓ - युरिया/N खत लागत नाही'}
${pDeficit > 0 ? `- P कमतरता: ${dapKg} kg DAP/SSP द्या किंवा ${bonemealKgForP} kg हाडांची पूड (सेंद्रिय)` : '- P: पुरेसे ✓ - DAP/P खत लागत नाही'}
${kDeficit > 0 ? `- K कमतरता: ${mopKg} kg MOP द्या किंवा ${woodashKgForK} kg राख (सेंद्रिय)` : '- K: पुरेसे ✓ - MOP/K खत लागत नाही'}

⚠️ महत्त्वाचे: फक्त कमतरता असलेले खत द्या! जास्त खत देऊ नका!
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
💊 NPK दवाई - केवल इन कमियों को पूरा करें
═══════════════════════════════════════════════════════════════
निदान (DIAGNOSIS):
- वर्तमान N: ${soilN} kg/ha | आवश्यक: ${target.n} kg/ha | कमी: ${nDeficit} kg/ha
- वर्तमान P: ${soilP} kg/ha | आवश्यक: ${target.p} kg/ha | कमी: ${pDeficit} kg/ha  
- वर्तमान K: ${soilK} kg/ha | आवश्यक: ${target.k} kg/ha | कमी: ${kDeficit} kg/ha

${landAreaAcres.toFixed(2)} एकड़ के लिए दवाई (PRESCRIPTION):
${nDeficit > 0 ? `- N कमी: ${ureaKg} kg यूरिया डालें या ${vermicompostKgForN} kg वर्मीकम्पोस्ट (जैविक)` : '- N: पर्याप्त ✓ - यूरिया/N खाद की जरूरत नहीं'}
${pDeficit > 0 ? `- P कमी: ${dapKg} kg DAP/SSP डालें या ${bonemealKgForP} kg हड्डी का चूरा (जैविक)` : '- P: पर्याप्त ✓ - DAP/P खाद की जरूरत नहीं'}
${kDeficit > 0 ? `- K कमी: ${mopKg} kg MOP डालें या ${woodashKgForK} kg राख (जैविक)` : '- K: पर्याप्त ✓ - MOP/K खाद की जरूरत नहीं'}

⚠️ महत्वपूर्ण: केवल कमी वाले खाद डालें! अधिक खाद मत डालें!
` : `
═══════════════════════════════════════════════════════════════
💊 NPK PRESCRIPTION - BALANCE THESE EXACT DEFICITS
═══════════════════════════════════════════════════════════════
DIAGNOSIS:
- Current N: ${soilN} kg/ha | Target: ${target.n} kg/ha | DEFICIT: ${nDeficit} kg/ha
- Current P: ${soilP} kg/ha | Target: ${target.p} kg/ha | DEFICIT: ${pDeficit} kg/ha  
- Current K: ${soilK} kg/ha | Target: ${target.k} kg/ha | DEFICIT: ${kDeficit} kg/ha

PRESCRIPTION FOR ${landAreaAcres.toFixed(2)} ACRES:
${nDeficit > 0 ? `- N Deficiency: Apply ${ureaKg} kg Urea OR ${vermicompostKgForN} kg Vermicompost (organic)` : '- N: SUFFICIENT ✓ - No urea/N fertilizer needed'}
${pDeficit > 0 ? `- P Deficiency: Apply ${dapKg} kg DAP/SSP OR ${bonemealKgForP} kg Bone meal (organic)` : '- P: SUFFICIENT ✓ - No DAP/P fertilizer needed'}
${kDeficit > 0 ? `- K Deficiency: Apply ${mopKg} kg MOP OR ${woodashKgForK} kg Wood ash (organic)` : '- K: SUFFICIENT ✓ - No MOP/K fertilizer needed'}

⚠️ CRITICAL: Only prescribe what's DEFICIENT! Do not over-fertilize!
`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // pH-BASED FERTILIZER COMPATIBILITY RULES
    // ═══════════════════════════════════════════════════════════════════
    let phCompatibility = "";
    if (hasSoilData) {
      if (soilPh < 6.5) {
        const limeKg = Math.round(landAreaAcres * 200);
        phCompatibility = language === "mr" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खत सुसंगतता (pH = ${soilPh.toFixed(1)} - आम्लयुक्त)
═══════════════════════════════════════════════════════════════
❌ टाळा: अमोनियम सल्फेट, सल्फर (जमीन अजून आम्लयुक्त होईल)
✅ वापरा: युरिया, कॅल्शियम अमोनियम नायट्रेट
💊 औषध: खत देण्यापूर्वी ${limeKg} kg चुना द्या
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खाद संगतता (pH = ${soilPh.toFixed(1)} - अम्लीय)
═══════════════════════════════════════════════════════════════
❌ बचें: अमोनियम सल्फेट, सल्फर (मिट्टी और अम्लीय होगी)
✅ उपयोग करें: यूरिया, कैल्शियम अमोनियम नाइट्रेट
💊 दवाई: खाद देने से पहले ${limeKg} kg चूना डालें
` : `
═══════════════════════════════════════════════════════════════
⚗️ pH-BASED FERTILIZER COMPATIBILITY (pH = ${soilPh.toFixed(1)} - ACIDIC)
═══════════════════════════════════════════════════════════════
❌ AVOID: Ammonium sulfate, Elemental sulfur (will further acidify)
✅ USE: Urea, Calcium Ammonium Nitrate, Lime application first
💊 PRESCRIPTION: Apply ${limeKg} kg lime before fertilizers
`;
      } else if (soilPh > 7.5) {
        const gypsumKg = Math.round(landAreaAcres * 500);
        phCompatibility = language === "mr" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खत सुसंगतता (pH = ${soilPh.toFixed(1)} - क्षारयुक्त)
═══════════════════════════════════════════════════════════════
❌ टाळा: युरिया (N वाया जातो), DAP (P लॉक होतो)
✅ वापरा: अमोनियम सल्फेट, SSP, जिप्सम
💊 औषध: लागवडीपूर्वी ${gypsumKg} kg जिप्सम द्या
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खाद संगतता (pH = ${soilPh.toFixed(1)} - क्षारीय)
═══════════════════════════════════════════════════════════════
❌ बचें: यूरिया (N बर्बाद होगा), DAP (P लॉक होगा)
✅ उपयोग करें: अमोनियम सल्फेट, SSP, जिप्सम
💊 दवाई: रोपण से पहले ${gypsumKg} kg जिप्सम डालें
` : `
═══════════════════════════════════════════════════════════════
⚗️ pH-BASED FERTILIZER COMPATIBILITY (pH = ${soilPh.toFixed(1)} - ALKALINE)
═══════════════════════════════════════════════════════════════
❌ AVOID: Urea (high N loss at alkaline pH), DAP (P locks up)
✅ USE: Ammonium sulfate, SSP, Gypsum for soil correction
💊 PRESCRIPTION: Apply ${gypsumKg} kg gypsum before planting
`;
      } else {
        phCompatibility = language === "mr" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खत सुसंगतता (pH = ${soilPh.toFixed(1)} - संतुलित)
═══════════════════════════════════════════════════════════════
✅ तटस्थ pH: सर्व खते योग्य
💊 वरील औषधानुसार मानक खते वापरा
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
⚗️ pH आधारित खाद संगतता (pH = ${soilPh.toFixed(1)} - संतुलित)
═══════════════════════════════════════════════════════════════
✅ तटस्थ pH: सभी खाद उपयुक्त
💊 ऊपर दी गई दवाई के अनुसार मानक खाद उपयोग करें
` : `
═══════════════════════════════════════════════════════════════
⚗️ pH-BASED FERTILIZER COMPATIBILITY (pH = ${soilPh.toFixed(1)} - NEUTRAL)
═══════════════════════════════════════════════════════════════
✅ NEUTRAL pH: All fertilizers compatible
💊 Use standard fertilizers as prescribed above
`;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // WATER PRESCRIPTION SECTION
    // ═══════════════════════════════════════════════════════════════════
    const waterPrescription = language === "mr" ? `
═══════════════════════════════════════════════════════════════
💧 पाणी औषध - ${landAreaAcres.toFixed(2)} एकर साठी
═══════════════════════════════════════════════════════════════
- एकूण हंगाम पाणी गरज: ${Math.round(totalWaterLiters / 1000)} KL (${totalWaterLiters.toLocaleString()} लिटर)
- प्रत्येक सिंचन: ${Math.round(adjustedWaterPerIrrigation / 1000)} KL दर ${waterReq.irrigation_interval_days} दिवसांनी
- गंभीर टप्पे: ${waterReq.critical_stages.join(', ')} (दुप्पट पाणी द्या)
- सिंचन प्रकार: ${irrigationType}
${irrigationEfficiencyNote}

⚠️ प्रत्येक सिंचन टास्कमध्ये water_required_liters समाविष्ट करा!
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
💧 पानी दवाई - ${landAreaAcres.toFixed(2)} एकड़ के लिए
═══════════════════════════════════════════════════════════════
- कुल सीजन पानी जरूरत: ${Math.round(totalWaterLiters / 1000)} KL (${totalWaterLiters.toLocaleString()} लीटर)
- प्रत्येक सिंचाई: ${Math.round(adjustedWaterPerIrrigation / 1000)} KL हर ${waterReq.irrigation_interval_days} दिन
- गंभीर चरण: ${waterReq.critical_stages.join(', ')} (दुगना पानी दें)
- सिंचाई प्रकार: ${irrigationType}
${irrigationEfficiencyNote}

⚠️ हर सिंचाई टास्क में water_required_liters शामिल करें!
` : `
═══════════════════════════════════════════════════════════════
💧 WATER PRESCRIPTION FOR ${landAreaAcres.toFixed(2)} ACRES
═══════════════════════════════════════════════════════════════
- Total Season Water Need: ${Math.round(totalWaterLiters / 1000)} KL (${totalWaterLiters.toLocaleString()} liters)
- Per Irrigation: ${Math.round(adjustedWaterPerIrrigation / 1000)} KL every ${waterReq.irrigation_interval_days} days
- Critical Stages: ${waterReq.critical_stages.join(', ')} (double water)
- Irrigation Type: ${irrigationType}
${irrigationEfficiencyNote}

⚠️ Include water_required_liters in each irrigation task!
`;

    // ═══════════════════════════════════════════════════════════════════
    // APPLICATION METHOD RULES (FOR CORRECT METHODS IN AI OUTPUT)
    // ═══════════════════════════════════════════════════════════════════
    const applicationMethodRules = language === "mr" ? `
═══════════════════════════════════════════════════════════════
📋 योग्य वापर पद्धती (सही तरीका)
═══════════════════════════════════════════════════════════════
खते:
- युरिया/DAP/MOP/NPK → "broadcasting" किंवा "band_placement" (फवारणी नाही!)
- सूक्ष्म अन्नद्रव्ये (जस्त/बोरॉन/लोह) → "foliar_spray" (2-3 फवारण्या)
- सेंद्रिय (शेणखत/गांडूळखत) → "basal_application" (पेरणीपूर्वी)
- जीवामृत/पंचगव्य → "drenching" (आळवणी)

किडनाशके:
- द्रव किडनाशके → "foliar_spray" शिफारस केलेल्या पाण्यासह
- दाणेदार (कार्बोफ्युरान/फोरेट) → "soil_application" मुळांजवळ
- प्रणालीगत → "seed_treatment" किंवा "root_dip"

बुरशीनाशके:
- बीज-जन्य रोग → "seed_treatment"
- पानावरील रोग → "foliar_spray"
- माती/मूळ रोग → "soil_drenching"

⚠️ घन खतांसाठी किंवा शेणखतासाठी "foliar_spray" वापरू नका!
` : language === "hi" ? `
═══════════════════════════════════════════════════════════════
📋 सही उपयोग विधि (सही तरीका)
═══════════════════════════════════════════════════════════════
खाद:
- यूरिया/DAP/MOP/NPK → "broadcasting" या "band_placement" (फोलियर स्प्रे नहीं!)
- सूक्ष्म पोषक (जिंक/बोरान/आयरन) → "foliar_spray" (2-3 छिड़काव)
- जैविक (FYM/वर्मीकम्पोस्ट) → "basal_application" (बुवाई से पहले)
- जीवामृत/पंचगव्य → "drenching" (आलवणी)

कीटनाशक:
- तरल कीटनाशक → "foliar_spray" अनुशंसित पानी मात्रा के साथ
- दानेदार (कार्बोफ्यूरान/फोरेट) → "soil_application" जड़ क्षेत्र में
- प्रणालीगत → "seed_treatment" या "root_dip"

फफूंदनाशक:
- बीज जनित रोग → "seed_treatment"
- पत्ती रोग → "foliar_spray"
- मिट्टी/जड़ रोग → "soil_drenching"

⚠️ ठोस खाद या FYM के लिए "foliar_spray" का उपयोग न करें!
` : `
═══════════════════════════════════════════════════════════════
📋 CORRECT APPLICATION METHODS (सही तरीका)
═══════════════════════════════════════════════════════════════
FERTILIZERS:
- Urea/DAP/MOP/NPK → "broadcasting" or "band_placement" (NOT foliar_spray!)
- Micronutrients (Zinc/Boron/Iron) → "foliar_spray" (2-3 sprays)
- Organic (FYM/Vermicompost) → "basal_application" (before sowing)
- Jeevamrut/Panchagavya → "drenching" (आळवणी)

PESTICIDES:
- Liquid concentrates → "foliar_spray" with recommended water volume
- Granules (Carbofuran/Phorate) → "soil_application" near root zone
- Systemic → "seed_treatment" or "root_dip"

FUNGICIDES:
- Seed-borne diseases → "seed_treatment" 
- Foliar diseases → "foliar_spray"
- Soil-borne/Root → "soil_drenching"

⚠️ NEVER use "foliar_spray" for solid fertilizers or FYM!
`;

    // TASK Section - Language-aware, compact
    const taskSectionHeader = language === 'mr' ? '🎯 कार्य' : language === 'hi' ? '🎯 कार्य' : '🎯 TASK';
    const soilReportLabel = language === 'mr' ? 'माती आरोग्य अहवाल' : language === 'hi' ? 'मिट्टी स्वास्थ्य रिपोर्ट' : 'SOIL HEALTH REPORT';
    const phLabels = language === 'en' 
      ? { acidic: 'Acidic', alkaline: 'Alkaline', neutral: 'Neutral' }
      : language === 'mr'
      ? { acidic: 'आम्लयुक्त', alkaline: 'क्षारयुक्त', neutral: 'संतुलित' }
      : { acidic: 'अम्लीय', alkaline: 'क्षारीय', neutral: 'संतुलित' };
    
    // ═══════════════════════════════════════════════════════════════════
    // INTERCROP CONTEXT SECTION - CRITICAL FOR MULTI-CROP SCHEDULE
    // ═══════════════════════════════════════════════════════════════════
    let intercropSection = "";
    const hasIntercrops = intercropArray.length > 0;
    
    if (hasIntercrops) {
      // Get translated names for intercrops
      const intercropDetails = intercropArray.map((ic, idx) => {
        const translatedName = getTranslatedCropName(ic.cropName, language);
        return {
          index: idx + 1,
          name: ic.cropName,
          translatedName,
          variety: ic.cropVariety || '',
          areaPercent: ic.areaPercent || 0
        };
      });
      
      // Calculate primary crop area percentage
      const intercropTotalArea = intercropDetails.reduce((sum, ic) => sum + ic.areaPercent, 0);
      const primaryCropAreaPercent = 100 - intercropTotalArea;
      
      const intercropLabel = language === 'mr' ? '🌱 आंतरपीक (INTERCROP)' 
        : language === 'hi' ? '🌱 अंतरफसल (INTERCROP)' 
        : '🌱 INTERCROPPING SYSTEM';
      
      const intercropListStr = intercropDetails.map(ic => 
        `   ${ic.index}. ${ic.translatedName} (${ic.name})${ic.variety ? ` - ${ic.variety}` : ''} → ${ic.areaPercent}% क्षेत्र`
      ).join('\n');
      
      intercropSection = language === 'mr' ? `
═══════════════════════════════════════════════════════════════
${intercropLabel}
═══════════════════════════════════════════════════════════════
या शेतात आंतरपीक पद्धत वापरली आहे:

🌾 मुख्य पीक (PRIMARY): ${translatedCropName} → ${primaryCropAreaPercent}% क्षेत्र
${intercropListStr}

⚠️ महत्त्वाचे आंतरपीक नियम:
1. मुख्य पिकासाठी ${Math.ceil(primaryCropAreaPercent/100 * 25)} टास्क + प्रत्येक आंतरपिकासाठी 5-8 टास्क
2. आंतरपिकांसाठी टास्क नाव: "[आंतरपीक नाव] - [कार्य]" (उदा: "${intercropDetails[0]?.translatedName || 'गहू'} - पेरणी")
3. आंतरपिकांचे खत मुख्य पिकापेक्षा कमी (क्षेत्र टक्केवारीनुसार)
4. आंतरपिकांची पेरणी मुख्य पिकानंतर 7-15 दिवसांनी
5. प्रत्येक आंतरपिकासाठी स्वतंत्र बियाणे उपचार, सिंचन, खत टास्क
` : language === 'hi' ? `
═══════════════════════════════════════════════════════════════
${intercropLabel}
═══════════════════════════════════════════════════════════════
इस खेत में अंतरफसल प्रणाली का उपयोग किया गया है:

🌾 मुख्य फसल (PRIMARY): ${translatedCropName} → ${primaryCropAreaPercent}% क्षेत्र
${intercropListStr}

⚠️ महत्वपूर्ण अंतरफसल नियम:
1. मुख्य फसल के लिए ${Math.ceil(primaryCropAreaPercent/100 * 25)} टास्क + प्रत्येक अंतरफसल के लिए 5-8 टास्क
2. अंतरफसलों के लिए टास्क नाम: "[अंतरफसल नाम] - [कार्य]" (उदा: "${intercropDetails[0]?.translatedName || 'गेहूं'} - बुवाई")
3. अंतरफसलों का खाद मुख्य फसल से कम (क्षेत्र प्रतिशत के अनुसार)
4. अंतरफसलों की बुवाई मुख्य फसल के 7-15 दिन बाद
5. प्रत्येक अंतरफसल के लिए अलग बीज उपचार, सिंचाई, खाद टास्क
` : `
═══════════════════════════════════════════════════════════════
${intercropLabel}
═══════════════════════════════════════════════════════════════
This field uses INTERCROPPING SYSTEM:

🌾 PRIMARY CROP: ${translatedCropName} → ${primaryCropAreaPercent}% area
${intercropListStr}

⚠️ CRITICAL INTERCROP RULES:
1. Generate ${Math.ceil(primaryCropAreaPercent/100 * 25)} tasks for PRIMARY + 5-8 tasks per INTERCROP
2. Intercrop task names: "[Intercrop Name] - [action]" (e.g., "${intercropDetails[0]?.translatedName || 'Wheat'} - Sowing")
3. Intercrop fertilizer doses REDUCED based on area percentage
4. Intercrop sowing 7-15 days AFTER primary crop sowing
5. Each intercrop needs SEPARATE seed treatment, irrigation, fertilizer tasks
`;
      
      console.log(`🌱 [AI-Schedule] Intercrop context added: ${intercropDetails.map(ic => `${ic.name} (${ic.areaPercent}%)`).join(', ')}`);
    }

    const taskSection = `
${taskSectionHeader}
Generate crop schedule for ${translatedCropName} (${cropName}) cultivation.
${prescriptionFraming}
Land Area: ${landAreaAcres.toFixed(2)} acres (${landAreaGuntha} guntha / ${landAreaHa.toFixed(2)} hectares)

CROP: ${translatedCropName} ${cropVariety ? `(${cropVariety})` : ""}
Sowing: ${sowingDate} | Location: ${district}, ${state}
${varietyPromptBlock ? "\n" + varietyPromptBlock + "\n" : ""}
Soil: ${soilData?.soil_type || land.soil_type || "Black/Alluvial"} | Irrigation: ${land.irrigation_type || "manual"}
${intercropSection}
${soilReportLabel}:
- pH: ${soilPh.toFixed(1)} (${soilPh < 6.5 ? phLabels.acidic : soilPh > 7.5 ? phLabels.alkaline : phLabels.neutral})
- N: ${soilN} kg/ha | P: ${soilP} kg/ha | K: ${soilK} kg/ha
${npkPrescription}
${phCompatibility}
${waterPrescription}
${applicationMethodRules}

FARMING MODE: ${farmingTypeLabel}
${farmingTypeRules}
${seedPreparationDetails}
${soilTestInstruction}
Labor Rate: ₹${laborRate}/day`;

    // INSTRUCTION Section - Language-aware
    const seedRulesLabel = language === 'mr' ? 'तयार रोपे नियम' : language === 'hi' ? 'तैयार पौधे नियम' : 'READY-MADE PLANT RULES';
    const seedRules = isReadyMadePlant ? `
3. ${seedRulesLabel}:
   - DO NOT include seed_treatment or seed sowing tasks
   - START from transplanting (day 0 is transplanting date)
   - Nursery plant age: ${nurseryDays} days
` : `
3. SEED PREPARATION RULES:
   - ALWAYS include seed treatment task
   - Include seed rate, spacing, and depth
`;

    // Product name examples based on language
    const productExamples = language === 'mr' 
      ? 'युरिया, डीएपी, गांडूळ खत' 
      : language === 'hi' 
      ? 'यूरिया, डीएपी, केंचुआ खाद' 
      : 'Urea, DAP, Vermicompost';

    // Build intercrop task instruction if intercrops exist
    const intercropTaskInstruction = hasIntercrops ? `
8. INTERCROP TASKS (MANDATORY if intercrops exist):
   ${intercropArray.map((ic, idx) => {
     const translatedName = getTranslatedCropName(ic.cropName, language);
     return `- ${translatedName}: Generate 5-8 tasks (sowing +7-15 days, fertilizer reduced to ${ic.areaPercent}% dose)`;
   }).join('\n   ')}
   - Each intercrop needs: seed treatment, sowing, fertilizer (2-3 splits), pest control, irrigation
   - Intercrop task_name format: "[Intercrop Name] - [action]"
` : '';

    const instructionSection = `
📋 INSTRUCTIONS

1. MANDATORY STAGES (all ${totalStages} required):
${stagesPrompt}

2. TASK REQUIREMENTS:
   - Generate 2-3 tasks per stage for PRIMARY CROP
   - Each PRIMARY task MUST include: "${translatedCropName} - [action]" in ${languageName}
   ${hasIntercrops ? `- ALSO generate 5-8 tasks for EACH intercrop with "[Intercrop Name] - [action]"` : ''}
   - Include quantities, product brands, prices
${seedRules}

4. FERTILIZER DOSES (use prescription):
   ${nDeficit <= 0 ? '- SKIP N fertilizers (sufficient)' : `- Urea: ${ureaKg} kg total`}
   ${pDeficit <= 0 ? '- SKIP P fertilizers (sufficient)' : `- DAP/SSP: ${dapKg} kg total`}
   ${kDeficit <= 0 ? '- SKIP K fertilizers (sufficient)' : `- MOP: ${mopKg} kg total`}

5. APPLICATION METHODS:
   - Solid fertilizers → "broadcasting" or "band_placement"
   - Micronutrients → "foliar_spray"
   - Organic matter → "basal_application"
   - Liquid pesticides → "foliar_spray"

6. LANGUAGE: Write ALL content in ${languageName}
   - Product examples: ${productExamples}
   ${language !== 'en' ? `- Use rural dialect terms` : ''}
   ${regionalLanguageRules}

7. WEATHER: Mark irrigation, spraying as weather_dependent: true
${intercropTaskInstruction}`;

    // DATA Section (compact to reduce token usage / latency)
    // DATA Section (compact)
    const dataSection = `
📊 KEY NUMBERS (${landAreaAcres.toFixed(2)} ACRES):
- FYM: ${fymTons} tons = ₹${fymCost}
- Urea: ${ureaKg} kg = ₹${ureaCost}
- DAP: ${dapKg} kg = ₹${dapCost}
- MOP: ${mopKg} kg = ₹${mopCost}
- Water/irrigation: ${adjustedWaterPerIrrigation} liters
`;

    // Calculate expected total tasks (primary + intercrops)
    const expectedPrimaryTasks = totalStages * tasksPerStage;
    const expectedIntercropTasks = hasIntercrops ? intercropArray.length * 6 : 0; // ~6 tasks per intercrop
    const expectedTotalTasks = expectedPrimaryTasks + expectedIntercropTasks;

    // Build intercrop task name examples for JSON format
    const intercropTaskNameExamples = hasIntercrops 
      ? intercropArray.slice(0, 2).map(ic => {
          const translatedName = getTranslatedCropName(ic.cropName, language);
          return `"${translatedName} - <task description>"`;
        }).join(',\n      ')
      : '';

    // Combine all sections into system prompt
    const systemPrompt = `${contextSection}
${taskSection}
${instructionSection}
${dataSection}

═══════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════════════════════════
1. Return a valid JSON object with the exact structure shown below
2. PRIMARY crop tasks: "${translatedCropName} - [action]"
${hasIntercrops ? `2b. INTERCROP tasks: Each intercrop needs 5-8 tasks with "[Intercrop Name] - [action]"` : ''}
3. All ${totalStages} stages (${allStageKeys.join(", ")}) MUST have at least 1 task
4. ${hasSoilData ? 'DO NOT include soil test task - soil data already exists!' : 'Include soil test task in planning stage'}
5. Use PRESCRIPTION doses from NPK PRESCRIPTION section above - NOT generic doses
6. Use CORRECT application_method for each product type
7. Include water_required_liters for irrigation tasks: ${adjustedWaterPerIrrigation} liters
${hasIntercrops ? `8. TOTAL TASKS EXPECTED: ~${expectedTotalTasks} (${expectedPrimaryTasks} primary + ${expectedIntercropTasks} intercrop)` : ''}

EXACT JSON OUTPUT FORMAT (follow this exactly):
{
  "crop_name": "${translatedCropName}",
  "total_duration_days": ${cropDurationDays},
  "expected_yield_quintals": <number>,
  "yield_multiplier_target": 3,
  "stages_covered": ["planning", "land_preparation", "sowing", "germination", "vegetative_growth", "reproductive", "maturity", "harvest", "post_harvest", "fallow_restoration"],
  "tasks": [
    {
      "task_name": "${translatedCropName} - <task description>",
      "stage_key": "<one of: planning|land_preparation|sowing|germination|vegetative_growth|reproductive|maturity|harvest|post_harvest|fallow_restoration>",
      "stage_order": <1-10>,
      "category": "<fertilizer|pest_control|irrigation|sowing|harvest|monitoring|land_preparation|growth_promoter|other>",
      "days_from_sowing": <integer, can be negative for planning>",
      "priority": "<critical|high|medium|low>",
      "description": "<detailed description in ${languageName}>",
      "instructions": ["<step 1>", "<step 2>", "..."],
      "quantity": "<e.g., 50 kg, 2 liters>",
      "estimated_cost": <number in INR>,
      "weather_dependent": <true|false>,
      "yield_impact": "<e.g., 20% yield boost>",
      "product_names": "<comma-separated product names>",
      "product_doses": "<comma-separated doses>",
      "product_prices": "<comma-separated prices in INR>"
    }
  ]
}`;

    // Build mandatory task categories string for long-duration crops
    const mandatoryCategoriesPrompt = cropTaskConfig.mandatoryCategories.length > 0
      ? `\nMANDATORY TASK TYPES for ${translatedCropName}: ${cropTaskConfig.mandatoryCategories.join(', ')}`
      : '';

    // Language-specific dialect label
    const dialectLabel = language === 'mr' ? 'ग्रामीण भाषा' : language === 'hi' ? 'ग्रामीण भाषा' : 'practical language';

    // Build intercrop checklist item if intercrops exist
    const intercropChecklist = hasIntercrops 
      ? `✓ INTERCROP tasks: ${intercropArray.map(ic => `${getTranslatedCropName(ic.cropName, language)} (5-8 tasks)`).join(', ')}\n` 
      : '';

    const userPrompt = `Generate ${translatedCropName}${hasIntercrops ? ' + INTERCROPS' : ''} crop schedule as JSON.

CHECKLIST:
✓ All ${totalStages} stages: ${allStageKeys.join(", ")}
✓ PRIMARY: ${expectedPrimaryTasks} tasks for ${translatedCropName} (${tasksPerStage}/stage)
${intercropChecklist}✓ Short descriptions (≤240 chars), 2-5 instruction bullets
✓ All content in ${languageName} (${dialectLabel})${mandatoryCategoriesPrompt}
${hasIntercrops ? `⚠️ INTERCROP tasks REQUIRED - don't skip them!` : ''}

OUTPUT: JSON only, no markdown. Start with { end with }`;

    console.log(`🤖 [AI] Calling ${aiProvider}/${model} with optimized ${totalStages}-stage prompt`);

    // Tool schema for OpenAI/Google (not used for Gemini)
    const toolSchema = {
      type: "function",
      function: {
        name: "create_schedule",
        description: `Create ${translatedCropName} crop schedule with ${totalStages} stages`,
        parameters: {
          type: "object",
          properties: {
            crop_name: { type: "string" },
            total_duration_days: { type: "integer" },
            stages_covered: { 
              type: "array", 
              items: { type: "string" }
            },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task_name: { type: "string" },
                  stage_key: { type: "string" },
                  stage_order: { type: "integer" },
                  category: { type: "string" },
                  days_from_sowing: { type: "integer" },
                  priority: { type: "string" },
                  description: { type: "string" },
                  instructions: { type: "array", items: { type: "string" } },
                  quantity: { type: "string" },
                  estimated_cost: { type: "number" },
                  weather_dependent: { type: "boolean" },
                  yield_impact: { type: "string" },
                  product_names: { type: "string" },
                  product_doses: { type: "string" },
                  product_prices: { type: "string" }
                },
                required: ["task_name", "stage_key", "days_from_sowing", "description", "instructions", "priority"]
              }
            }
          },
          required: ["crop_name", "tasks", "stages_covered", "total_duration_days"]
        }
      }
    };

    // Retry logic for handling 502/503/429 errors with provider fallback
    let aiResponse: Response | null = null;
    let lastError = "";
    const maxRetries = 3;
    let currentModel = model;
    let currentProvider = aiProvider;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [AI] Attempt ${attempt}/${maxRetries} with ${currentProvider}/${currentModel}`);
        
        const currentEndpoint = getAPIEndpoint(currentProvider);
        const currentApiKey = getAPIKey(currentProvider);

        // Build request payload - Gemini uses JSON mode, others use function calling
        const requestPayload = buildAIRequest(
          currentProvider,
          currentModel,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          currentProvider === "gemini" 
            ? {
                // CRITICAL: Use Gemini 2.5 Flash's actual max output (16384 tokens) to prevent truncation
                maxTokens: 16384,
                useJsonMode: true, // Use JSON mode for Gemini
              }
            : {
                maxTokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
                tools: [toolSchema],
                toolChoice: { type: "function", function: { name: "create_schedule" } },
                useJsonMode: false,
              }
        );
        
        console.log(`📤 [AI] Request mode: ${currentProvider === "gemini" ? "JSON mode" : "Function calling"}`);

        aiResponse = await fetch(currentEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${currentApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        if (aiResponse.ok) {
          console.log(`✅ [AI] Request succeeded on attempt ${attempt} with ${currentProvider}/${currentModel}`);
          break;
        }

        // Handle rate limits (429) and gateway errors (502/503)
        if (aiResponse.status === 429) {
          lastError = `Rate limit exceeded (429)`;
          console.warn(`⚠️ [AI] ${lastError} on attempt ${attempt}`);
          
          // Switch to fallback model or provider
          if (currentModel === model) {
            currentModel = fallbackModel;
            console.log(`🔄 [AI] Switching to fallback model: ${currentModel}`);
          } else if (currentProvider === "google" && attempt < maxRetries) {
            // Try OpenAI as backup if Google is rate limited
            try {
              currentProvider = "openai";
              currentModel = getModel("openai", "default");
              console.log(`🔄 [AI] Switching to backup provider: ${currentProvider}/${currentModel}`);
            } catch (e) {
              console.warn(`⚠️ [AI] OpenAI not available as backup`);
            }
          }
          
          await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        
        if (aiResponse.status === 502 || aiResponse.status === 503) {
          lastError = `Gateway error ${aiResponse.status}`;
          console.warn(`⚠️ [AI] ${lastError} on attempt ${attempt}, will retry...`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
            continue;
          }
        }

        const errorText = await aiResponse.text();
        lastError = `AI API error: ${aiResponse.status} - ${errorText.substring(0, 100)}`;
        console.error(`❌ AI error:`, aiResponse.status, errorText.substring(0, 300));
        
        // Try switching provider on error
        if (currentProvider === "google" && attempt < maxRetries) {
          try {
            currentProvider = "openai";
            currentModel = getModel("openai", "default");
            console.log(`🔄 [AI] Error occurred, switching to: ${currentProvider}/${currentModel}`);
            continue;
          } catch (e) {
            console.warn(`⚠️ [AI] OpenAI not available as backup`);
          }
        }
      } catch (fetchError) {
        lastError = `Network error: ${fetchError}`;
        console.error(`❌ [AI] Fetch error on attempt ${attempt}:`, fetchError);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      throw new Error(lastError || "AI API failed after retries");
    }

    const aiData = await aiResponse.json();
    const message = aiData.choices?.[0]?.message;
    
    console.log(`📥 [AI] Response received, parsing...`);

    // Parse schedule data - handle both tool calls and text responses
    let scheduleData: any = null;
    
    // Method 1: Check for tool_calls (OpenAI style)
    if (message?.tool_calls?.[0]?.function?.arguments) {
      try {
        scheduleData = JSON.parse(message.tool_calls[0].function.arguments);
        console.log(`✅ [AI] Parsed from tool_calls`);
      } catch (e) {
        console.warn(`⚠️ [AI] Failed to parse tool_calls arguments:`, e);
      }
    }
    
    // Method 2: Check for function_call (older OpenAI format)
    if (!scheduleData && message?.function_call?.arguments) {
      try {
        scheduleData = JSON.parse(message.function_call.arguments);
        console.log(`✅ [AI] Parsed from function_call`);
      } catch (e) {
        console.warn(`⚠️ [AI] Failed to parse function_call arguments:`, e);
      }
    }
    
    // Method 3: Try to parse JSON from text content (Gemini JSON-mode returns content)
    if (!scheduleData && message?.content) {
      const content = String(message.content ?? "").trim();
      const finishReason = aiData.choices?.[0]?.finish_reason as string | undefined;

      const tryParse = (raw: string) => {
        try {
          return JSON.parse(raw);
        } catch { /* ignore */ }
        // Fix #1: literal newlines/tabs inside JSON strings
        try {
          return JSON.parse(raw.replace(/[\r\n\t]+/g, " "));
        } catch { /* ignore */ }
        // Fix #2: strip ALL control chars (0x00-0x1F except already-handled) + trailing commas
        try {
          const cleaned = raw
            .replace(/[\u0000-\u001F\u007F]/g, " ")
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");
          return JSON.parse(cleaned);
        } catch { /* ignore */ }
        return null;
      };

      console.log(`📝 [AI] Attempting to parse JSON from message.content...`, {
        finishReason,
        contentLength: content.length,
      });

      // First try: content is the JSON object
      scheduleData = tryParse(content);

      // Second try: extract JSON object from surrounding text (greedy from first { to last })
      if (!scheduleData) {
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          scheduleData = tryParse(content.substring(firstBrace, lastBrace + 1));
          if (scheduleData) console.log(`✅ [AI] Extracted JSON from text content`);
        }
      }

      // Third try: markdown code block
      if (!scheduleData) {
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch?.[1]) {
          scheduleData = tryParse(codeBlockMatch[1].trim());
          if (scheduleData) console.log(`✅ [AI] Extracted JSON from code block`);
        }
      }
    }


    // If still no schedule data, check for truncation and handle gracefully
    if (!scheduleData) {
      const finishReason = aiData.choices?.[0]?.finish_reason as string | undefined;
      
      // CRITICAL: Handle truncation by building minimal fallback schedule
      if (finishReason === "length") {
        console.warn("⚠️ [AI] Response truncated (finish_reason=length). Building minimal schedule...");
        
        // Extract partial data if available from truncated response
        const partialContent = aiData.choices?.[0]?.message?.content || "";
        let partialTasks: any[] = [];
        
        // Try to extract any valid tasks from partial response
        try {
          const tasksMatch = partialContent.match(/"tasks"\s*:\s*\[([\s\S]*)/);
          if (tasksMatch) {
            // Try to find complete task objects
            const taskPattern = /\{[^{}]*"task_name"[^{}]*"stage_key"[^{}]*\}/g;
            const matches = partialContent.match(taskPattern);
            if (matches) {
              partialTasks = matches.slice(0, 10).map((m: string) => {
                try { return JSON.parse(m); } catch { return null; }
              }).filter(Boolean);
            }
          }
        } catch (e) {
          console.warn("⚠️ [AI] Could not extract partial tasks:", e);
        }

        // Build minimal schedule with extracted or default tasks
        if (partialTasks.length >= 3) {
          console.log(`✅ [AI] Recovered ${partialTasks.length} tasks from truncated response`);
          scheduleData = {
            crop_name: translatedCropName,
            total_duration_days: cropDurationDays,
            expected_yield_quintals: 20,
            yield_multiplier_target: 3,
            stages_covered: allStageKeys,
            tasks: partialTasks
          };
        } else {
          // Deterministic fallback: never fail hard on truncation.
          // Build a compact, stage-complete schedule using pre-defined fallback templates.
          console.warn("🛟 [AI] Truncated response could not be recovered. Using deterministic fallback schedule.");

          const fallbackTasks = farmingStages.map((stage: FarmingStage) =>
            generateFallbackTask(stage, translatedCropName, landAreaAcres, farmingType, language)
          );

          scheduleData = {
            crop_name: translatedCropName,
            total_duration_days: cropDurationDays,
            expected_yield_quintals: 20,
            yield_multiplier_target: 3,
            stages_covered: allStageKeys,
            tasks: fallbackTasks,
            is_fallback_schedule: true,
          };

          console.log(`✅ [AI] Fallback schedule built with ${fallbackTasks.length} tasks`);
        }
      } else {
        console.error("❌ [AI] No structured data found - using deterministic fallback.", {
          finishReason,
          snippet: JSON.stringify(aiData).substring(0, 800),
        });

        // Do NOT throw — build deterministic fallback schedule so farmer always gets a result
        const fallbackTasks = farmingStages.map((stage: FarmingStage) =>
          generateFallbackTask(stage, translatedCropName, landAreaAcres, farmingType, language)
        );

        scheduleData = {
          crop_name: translatedCropName,
          total_duration_days: cropDurationDays,
          expected_yield_quintals: 20,
          yield_multiplier_target: 3,
          stages_covered: allStageKeys,
          tasks: fallbackTasks,
          is_fallback_schedule: true,
        };

        console.log(`🛟 [AI] Deterministic fallback built with ${fallbackTasks.length} tasks (parse failed)`);
      }

    }
    
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks`);

    if (!scheduleData.tasks?.length) {
      console.error("❌ [AI] Schedule has no tasks:", JSON.stringify(scheduleData).substring(0, 500));
      throw new Error("AI returned empty schedule - no tasks generated");
    }

    // ═══════════════════════════════════════════════════════════════════
    // POST-PROCESSING: VALIDATE & FIX ALL TASKS
    // ═══════════════════════════════════════════════════════════════════
    console.log("🔧 [PostProcess] Validating and fixing tasks...");

    let validTasks = scheduleData.tasks.filter((task: any) => {
      if (!task.task_name || task.task_name.trim() === "") {
        console.warn(`⚠️ [Filter] Removing task with empty name in stage: ${task.stage_key}`);
        return false;
      }
      return true;
    });

    // Fix crop names, farming type compliance, and parse flat product fields
    validTasks = validTasks.map((task: any) => {
      // Step 1: Fix crop name
      task = validateAndFixTaskCropName(task, translatedCropName, cropName, language);

      // Step 2: Validate and fix farming type compliance
      const validation = validateTaskForFarmingType(task, farmingType, language);
      if (!validation.valid) {
        console.warn(`⚠️ [FarmingType] Task "${task.task_name}" has issues:`, validation.issues);
        task = fixTaskForFarmingType(task, farmingType, language, translatedCropName);
      }

      // Step 3: Convert flat product fields to product_recommendations array
      // CRITICAL: Only for categories that need products, not labor-only tasks
      const LABOR_ONLY_CATEGORIES_CHECK = ['irrigation', 'watering', 'land_preparation', 'ploughing', 
        'leveling', 'harvesting', 'harvest', 'post_harvest', 'monitoring', 'field_visit', 
        'inspection', 'observation', 'pruning', 'training', 'staking', 'mulching', 
        'intercultural', 'gap_filling', 'other', 'general'];
      
      const taskCategory = (task.category || "other").toLowerCase();
      const isLaborOnlyCategory = LABOR_ONLY_CATEGORIES_CHECK.some(cat => 
        taskCategory.includes(cat) || cat.includes(taskCategory)
      );
      
      // Skip adding products for labor-only categories
      if (isLaborOnlyCategory) {
        task.product_recommendations = [];
        console.log(`📦 [Products] Skipped AI products for labor-only: ${task.task_name} (${taskCategory})`);
      } else if (!task.product_recommendations && task.product_names) {
        const names = (task.product_names || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const doses = (task.product_doses || "").split(",").map((s: string) => s.trim());
        const prices = (task.product_prices || "").split(",").map((s: string) => parseInt(s.trim()));
        
        // REALISTIC INDIAN MARKET PRICES (2024-25) - Per Acre basis
        const indianMarketPrices: Record<string, { perUnit: number; unitsPerAcre: number; unit: string }> = {
          // Fertilizers
          'urea': { perUnit: 267, unitsPerAcre: 1.5, unit: '50kg bag' }, // ₹267/bag govt rate
          'dap': { perUnit: 1350, unitsPerAcre: 1, unit: '50kg bag' },
          'mop': { perUnit: 1700, unitsPerAcre: 0.5, unit: '50kg bag' },
          'npk': { perUnit: 1400, unitsPerAcre: 1, unit: '50kg bag' },
          '10-26-26': { perUnit: 1470, unitsPerAcre: 1, unit: '50kg bag' },
          '12-32-16': { perUnit: 1470, unitsPerAcre: 1, unit: '50kg bag' },
          'ssp': { perUnit: 400, unitsPerAcre: 2, unit: '50kg bag' },
          'zinc_sulphate': { perUnit: 85, unitsPerAcre: 10, unit: 'kg' },
          'boron': { perUnit: 350, unitsPerAcre: 2, unit: 'kg' },
          // Organic
          'vermicompost': { perUnit: 8, unitsPerAcre: 500, unit: 'kg' }, // ₹8/kg
          'neem_cake': { perUnit: 25, unitsPerAcre: 100, unit: 'kg' },
          'bio_fertilizer': { perUnit: 150, unitsPerAcre: 4, unit: 'liter' },
          'humic_acid': { perUnit: 450, unitsPerAcre: 2, unit: 'liter' },
          'seaweed_extract': { perUnit: 550, unitsPerAcre: 1, unit: 'liter' },
          'trichoderma': { perUnit: 200, unitsPerAcre: 2, unit: 'kg' },
          'panchagavya': { perUnit: 150, unitsPerAcre: 5, unit: 'liter' },
          // Pesticides
          'chlorpyrifos': { perUnit: 550, unitsPerAcre: 1, unit: 'liter' },
          'imidacloprid': { perUnit: 750, unitsPerAcre: 0.5, unit: '250ml' },
          'thiamethoxam': { perUnit: 850, unitsPerAcre: 0.4, unit: '250gm' },
          'cypermethrin': { perUnit: 380, unitsPerAcre: 1, unit: 'liter' },
          'neem_oil': { perUnit: 350, unitsPerAcre: 2, unit: 'liter' },
          'beauveria': { perUnit: 280, unitsPerAcre: 2, unit: 'kg' },
          // Fungicides
          'mancozeb': { perUnit: 450, unitsPerAcre: 2, unit: 'kg' },
          'carbendazim': { perUnit: 380, unitsPerAcre: 1, unit: '500gm' },
          'copper_oxychloride': { perUnit: 420, unitsPerAcre: 2, unit: 'kg' },
          'propiconazole': { perUnit: 850, unitsPerAcre: 0.5, unit: '250ml' },
          'pseudomonas': { perUnit: 200, unitsPerAcre: 2, unit: 'liter' },
          // Seeds (per kg rates)
          'hybrid_seed': { perUnit: 3500, unitsPerAcre: 2, unit: 'kg' },
          'certified_seed': { perUnit: 450, unitsPerAcre: 40, unit: 'kg' },
          'vegetable_seed': { perUnit: 1200, unitsPerAcre: 0.5, unit: 'kg' },
          // Growth promoters
          'humic_granules': { perUnit: 120, unitsPerAcre: 10, unit: 'kg' },
          'amino_acid': { perUnit: 650, unitsPerAcre: 1, unit: 'liter' },
          'gibberellic_acid': { perUnit: 180, unitsPerAcre: 1, unit: 'gm' },
        };
        
        // Category-wise realistic price ranges (per acre)
        const categoryPriceRanges: Record<string, { min: number; max: number; avgPerAcre: number }> = {
          organic: { min: 400, max: 2500, avgPerAcre: 1200 },
          fertilizer: { min: 400, max: 2000, avgPerAcre: 800 },
          pesticide: { min: 350, max: 1500, avgPerAcre: 650 },
          fungicide: { min: 400, max: 1200, avgPerAcre: 700 },
          growth_promoter: { min: 300, max: 1000, avgPerAcre: 550 },
          seed: { min: 800, max: 18000, avgPerAcre: 3500 },
          herbicide: { min: 400, max: 1200, avgPerAcre: 600 },
          micronutrient: { min: 300, max: 900, avgPerAcre: 500 },
          other: { min: 300, max: 1000, avgPerAcre: 500 }
        };
        
        const taskCategory = task.category || "other";
        const priceRange = categoryPriceRanges[taskCategory] || categoryPriceRanges.other;
        
        task.product_recommendations = names.map((name: string, i: number) => {
          // Try to match with known Indian market prices
          const nameLower = name.toLowerCase();
          let pricePerAcre = 0;
          
          for (const [key, priceInfo] of Object.entries(indianMarketPrices)) {
            if (nameLower.includes(key.replace('_', ' ')) || nameLower.includes(key)) {
              pricePerAcre = Math.round(priceInfo.perUnit * priceInfo.unitsPerAcre);
              break;
            }
          }
          
          // If no match, use category average with variation
          if (pricePerAcre <= 0) {
            const variation = (i % 3) * 150; // Adds variety
            pricePerAcre = priceRange.avgPerAcre + variation;
          }
          
          // Calculate total for land area
          const totalPriceForLand = Math.round(pricePerAcre * landAreaAcres);
          
          // CORRECT APPLICATION METHOD BASED ON PRODUCT TYPE/CATEGORY
          const applicationMethod = getApplicationMethod(name, taskCategory, taskCategory);
          
          return {
            product_name: name,
            brand: "",
            product_type: farmingType === "organic_only" ? "organic" : taskCategory,
            dose_per_acre: doses[i] || "",
            price_estimate: totalPriceForLand,
            application_method: applicationMethod
          };
        });
        
        // ADD LABOR CHARGES - USING REALISTIC WORKER × DAYS MODEL (2024-25)
        // Daily wage rates vary by region: ₹300-500/day (MGNREGA standard: ₹349/day)
        const dailyWageRate = laborRate || 350;
        
        // Use the new realistic labor calculation function
        const category = (task.category || "other").toLowerCase();
        const laborCalc = calculateRealisticLaborCost(category, landAreaAcres, dailyWageRate);
        
        // Store detailed labor breakdown
        task.labor_cost = laborCalc.laborCost;
        task.labor_workers = laborCalc.workers;
        task.labor_days_per_acre = laborCalc.days;
        task.labor_total_days = laborCalc.totalLaborDays;
        task.labor_description = laborCalc.description;
        task.labor_daily_wage = dailyWageRate;
      } else if (!task.product_recommendations || task.product_recommendations.length === 0) {
        // No AI products provided - try to get crop-specific products
        const category = (task.category || "other").toLowerCase();
        const cropProducts = getCropSpecificProducts(cropName, category, farmingType, landAreaAcres);
        
        if (cropProducts.length > 0) {
          task.product_recommendations = cropProducts;
          console.log(`📦 [Products] Added ${cropProducts.length} crop-specific products for: ${task.task_name}`);
        }
        
        // Add labor cost using realistic model
        const dailyWageRate = laborRate || 350;
        const laborCalc = calculateRealisticLaborCost(category, landAreaAcres, dailyWageRate);
        task.labor_cost = laborCalc.laborCost;
        task.labor_workers = laborCalc.workers;
        task.labor_days_per_acre = laborCalc.days;
        task.labor_total_days = laborCalc.totalLaborDays;
        task.labor_description = laborCalc.description;
        task.labor_daily_wage = dailyWageRate;
      }

      return task;
    });

    console.log(`✅ [PostProcess] ${validTasks.length} valid tasks after fixes`);

    // Check stage coverage and generate fallback tasks
    const stagesCovered = new Set(validTasks.map((t: any) => t.stage_key));
    const missingStages = farmingStages.filter((s: FarmingStage) => !stagesCovered.has(s.stage_key));

    const fallbackTasks: any[] = [];
    if (missingStages.length > 0) {
      console.warn(
        `⚠️ [Fallback] Missing ${missingStages.length} stages: ${missingStages.map((s: FarmingStage) => s.stage_key).join(", ")}`,
      );

      for (const stage of missingStages) {
        // CRITICAL: Pass translatedCropName, not original cropName
        const fallbackTask = generateFallbackTask(stage, translatedCropName, landAreaAcres, farmingType, language);
        fallbackTasks.push(fallbackTask);
        stagesCovered.add(stage.stage_key);
      }
      console.log(`✅ [Fallback] Generated ${fallbackTasks.length} fallback tasks with correct crop name`);
    }

    const allTasks = [...validTasks, ...fallbackTasks];
    console.log(`📋 [Total] ${allTasks.length} tasks ready for processing`);

    // ═══════════════════════════════════════════════════════════════════
    // FETCH REAL PRODUCTS FROM DATABASE FOR EACH TASK
    // ═══════════════════════════════════════════════════════════════════
    console.log("📦 [Products] Fetching real product recommendations...");

    // CRITICAL: Only these categories need product recommendations
    // Tasks like irrigation, monitoring, harvesting (labor-only) should NOT have products
    const PRODUCT_REQUIRED_CATEGORIES = [
      'fertilizer', 'fertilizer_application', 'nutrient_management',
      'pest_control', 'pest_management', 'disease_control', 'disease_management',
      'organic_input', 'organic_application',
      'growth_promoter', 'growth_management',
      'seed_treatment', 'sowing',
      'fungicide', 'herbicide', 'weed_management',
      'micronutrient'
    ];
    
    // Categories that are LABOR-ONLY (no products needed)
    const LABOR_ONLY_CATEGORIES = [
      'irrigation', 'watering',
      'land_preparation', 'ploughing', 'leveling',
      'harvesting', 'harvest', 'post_harvest',
      'monitoring', 'field_visit', 'inspection', 'observation',
      'pruning', 'training', 'staking',
      'mulching', 'intercultural', 'gap_filling',
      'other', 'general'
    ];

    for (const task of allTasks) {
      const category = (task.category || "other").toLowerCase();
      
      // Check if this task category needs products
      const needsProducts = PRODUCT_REQUIRED_CATEGORIES.some(cat => 
        category.includes(cat) || cat.includes(category)
      );
      const isLaborOnly = LABOR_ONLY_CATEGORIES.some(cat => 
        category.includes(cat) || cat.includes(category)
      );
      
      // ONLY fetch/add products for categories that actually need them
      if (needsProducts && !isLaborOnly && (!task.product_recommendations || task.product_recommendations.length === 0)) {
        const dbProducts = await fetchRecommendedProducts(supabase, cropName, task.stage_key, category, farmingType);

        if (dbProducts.length > 0) {
          task.product_recommendations = dbProducts.slice(0, 2).map((p: any, idx: number) => {
            // Handle price_range safely - can be string, object, number, or null
            let priceEstimate = 0;
            if (p.price_range) {
              if (typeof p.price_range === 'string') {
                // Parse price range like "200-500" and take average
                const parts = p.price_range.split("-").map((s: string) => parseInt(s.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                  priceEstimate = Math.round((parts[0] + parts[1]) / 2);
                } else {
                  priceEstimate = parseInt(p.price_range) || 0;
                }
              } else if (typeof p.price_range === 'number') {
                priceEstimate = p.price_range;
              } else if (typeof p.price_range === 'object') {
                priceEstimate = p.price_range.avg || p.price_range.min || p.price_range.price || p.price_range.value || 0;
              }
            }
            
            // REALISTIC INDIAN MARKET PRICES (2024-25) - Per Acre
            if (!priceEstimate || priceEstimate <= 0) {
              const typePricesPerAcre: Record<string, number> = {
                fertilizer: 800 + idx * 200,      // NPK, DAP etc
                pesticide: 650 + idx * 150,       // Insecticides
                fungicide: 700 + idx * 180,       // Fungicides
                organic: 1200 + idx * 300,        // Organic products
                bio_fertilizer: 600 + idx * 150,  // Bio products
                growth_promoter: 550 + idx * 120, // Growth hormones
                seed: 3500 + idx * 500,           // Seeds (most expensive)
                herbicide: 600 + idx * 100,       // Weedicides
                micronutrient: 500 + idx * 100,   // Zinc, Boron etc
              };
              priceEstimate = typePricesPerAcre[p.product_type || "fertilizer"] || (600 + idx * 150);
            }
            
            // Calculate total cost for the land area
            const totalPriceForLand = Math.round(priceEstimate * landAreaAcres);
            
            // CORRECT APPLICATION METHOD - Use DB value or determine from type
            const applicationMethod = p.application_method || getApplicationMethod(p.name, p.product_type, category);
            
            return {
              product_name: p.name,
              brand: p.brand || "",
              product_type: p.organic_certified ? "organic" : p.product_type,
              active_ingredient: p.active_ingredients || "",
              dose_per_acre: p.dosage_instructions || "",
              application_method: applicationMethod,
              price_estimate: totalPriceForLand,
            };
          });
          
          // Add REAL labor cost calculation using realistic model
          const dailyWageRate = laborRate || 350;
          const laborCalc = calculateRealisticLaborCost(category, landAreaAcres, dailyWageRate);
          task.labor_cost = laborCalc.laborCost;
          task.labor_workers = laborCalc.workers;
          task.labor_days_per_acre = laborCalc.days;
          task.labor_total_days = laborCalc.totalLaborDays;
          task.labor_description = laborCalc.description;
          task.labor_daily_wage = dailyWageRate;
          
          console.log(`📦 [Products] Added ${task.product_recommendations.length} DB products + labor for: ${task.task_name}`);
        } else {
          // No DB products - use crop-specific products
          const cropProducts = getCropSpecificProducts(cropName, category, farmingType, landAreaAcres);
          if (cropProducts.length > 0) {
            task.product_recommendations = cropProducts;
            console.log(`📦 [Products] Added ${cropProducts.length} crop-specific products for: ${task.task_name}`);
          }
          
          // Add labor cost
          const dailyWageRate = laborRate || 350;
          const laborCalc = calculateRealisticLaborCost(category, landAreaAcres, dailyWageRate);
          task.labor_cost = laborCalc.laborCost;
          task.labor_workers = laborCalc.workers;
          task.labor_days_per_acre = laborCalc.days;
          task.labor_total_days = laborCalc.totalLaborDays;
          task.labor_description = laborCalc.description;
          task.labor_daily_wage = dailyWageRate;
        }
      } else if (isLaborOnly) {
        // CRITICAL: Clear any products for labor-only tasks (AI might have incorrectly added them)
        task.product_recommendations = [];
        
        // Add REAL labor cost for labor-only categories
        const dailyWageRate = laborRate || 350;
        const laborRequirementsPerAcre: Record<string, { workers: number; days: number; description: string }> = {
          'land_preparation': { workers: 2, days: 4, description: 'Ploughing and leveling' },
          'irrigation': { workers: 1, days: 0.5, description: 'Irrigation management' },
          'watering': { workers: 1, days: 0.5, description: 'Watering plants' },
          'harvesting': { workers: 6, days: 3, description: 'Crop harvesting' },
          'harvest': { workers: 6, days: 3, description: 'Crop cutting' },
          'post_harvest': { workers: 3, days: 2, description: 'Post harvest processing' },
          'monitoring': { workers: 1, days: 0.25, description: 'Field monitoring' },
          'field_visit': { workers: 1, days: 0.25, description: 'Field inspection' },
          'mulching': { workers: 2, days: 1.5, description: 'Mulch application' },
          'intercultural': { workers: 2, days: 1.5, description: 'Intercultural operations' },
          'pruning': { workers: 3, days: 2, description: 'Pruning and training' },
          'other': { workers: 1, days: 1, description: 'General farm work' },
        };
        const stageKey = task.stage_key || task.category || "other";
        const laborReq = laborRequirementsPerAcre[stageKey] || laborRequirementsPerAcre[category] || laborRequirementsPerAcre['other'];
        const totalLaborDays = laborReq.workers * laborReq.days * landAreaAcres;
        task.labor_cost = Math.round(totalLaborDays * dailyWageRate);
        task.labor_workers = laborReq.workers;
        task.labor_days_per_acre = laborReq.days;
        task.labor_total_days = Math.round(totalLaborDays * 10) / 10;
        task.labor_description = laborReq.description;
        console.log(`📦 [Products] Labor-only task: ${task.task_name} (${category}) - ${laborReq.workers} workers × ${laborReq.days} days × ${landAreaAcres.toFixed(2)} acres = ₹${task.labor_cost}`);
      }
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

    const processedTasks = allTasks.map((task: any, idx: number) => {
      const category = task.category || "other";
      const stageKey = task.stage_key || "vegetative_growth";

      const matchingStage = farmingStages.find((s: FarmingStage) => s.stage_key === stageKey);
      const stageName = matchingStage?.stage_name || stageKey;
      const stageOrder = matchingStage?.stage_order || task.stage_order || 5;

      const costResult = calculateTaskCost(
        category,
        task.task_name,
        landAreaAcres,
        laborRate,
        seedCost,
        totalFertilizerCost,
        fymCost,
        language,
      );

      totalLaborCost += costResult.laborCost;
      totalMaterialCost += costResult.productCost;

      if (!costByStage[stageKey]) costByStage[stageKey] = 0;
      costByStage[stageKey] += costResult.totalCost;

      if (category === "fertilizer") costByCategory.fertilizer += costResult.productCost;
      if (category === "growth_promoter") costByCategory.growth_promoter += costResult.productCost;
      if (category === "pest_control" || category === "disease_control")
        costByCategory.pesticide += costResult.productCost;
      costByCategory.labor += costResult.laborCost;

      // Calculate REAL estimated_cost from actual product prices + labor
      const productRecsTotal = (task.product_recommendations || []).reduce(
        (sum: number, p: any) => sum + (p.price_estimate || 0), 0
      );
      const taskLaborCost = task.labor_cost || costResult.laborCost || 0;
      const realEstimatedCost = productRecsTotal + taskLaborCost;
      
      return {
        ...task,
        stage_key: stageKey,
        stage_order: stageOrder,
        stage_name: stageName,
        product_cost: productRecsTotal,
        labor_cost: taskLaborCost,
        labor_days: costResult.laborDays,
        estimated_cost: realEstimatedCost > 0 ? realEstimatedCost : costResult.totalCost,
        cost_breakdown: costResult.breakdown,
        product_recommendations: task.product_recommendations || [],
      };
    });

    processedTasks.sort((a: any, b: any) => {
      if (a.stage_order !== b.stage_order) return a.stage_order - b.stage_order;
      return a.days_from_sowing - b.days_from_sowing;
    });

    const correctedTotalCost = totalLaborCost + totalMaterialCost;

    // ═══════════════════════════════════════════════════════════════════
    // VARIETY-AWARE OVERRIDES (deterministic, DB-driven)
    // Clamps LLM-drafted maturity / yield / irrigation to variety facts and
    // surfaces climate/soil/regional fit warnings. No-op when no variety.
    // ═══════════════════════════════════════════════════════════════════
    const plannerOut = applyVarietyOverrides({
      varietyProfile,
      scheduleData,
      landAreaAcres,
      irrigationType: (land as any).irrigation_type || null,
      soilType: (land as any).soil_type || soilData?.soil_type || null,
      soilPh: soilPh,
      state,
      language,
      cropName,
      isReadyMadePlant,
      nurseryDays,
    });
    if (Object.keys(plannerOut.applied_overrides).length) {
      console.log(`🌱 [Variety-Planner] Applied overrides:`, plannerOut.applied_overrides);
    }
    if (plannerOut.sowing_method) {
      console.log(`🌾 [Rice-Method] ${plannerOut.sowing_method}: ${plannerOut.sowing_method_note}`);
    }
    // Merge variety warnings into the suitability warnings surface.
    suitabilityCheck.warnings = [
      ...(suitabilityCheck.warnings || []),
      ...plannerOut.warnings,
    ];

    // SAVE TO DATABASE
    // ═══════════════════════════════════════════════════════════════════
    // HARVEST DATE — farmer-selected `sowingDate` IS the real anchor day.
    //   • Regular sowing : harvest = sowingDate + variety.maturity_days
    //   • Nursery mode   : sowingDate = transplanting day; the seed was
    //                      sown nurseryDays ago, so the remaining field
    //                      horizon is (maturity - nurseryDays).
    // No more silent crop-default override — duration comes from variety.
    const sowingDateObj = new Date(sowingDate);
    const fieldDays = plannerOut.effective_field_days || plannerOut.total_duration_days;
    const harvestDate = new Date(sowingDateObj.getTime() + fieldDays * 24 * 60 * 60 * 1000);
    const harvestDateStr = harvestDate.toISOString().split("T")[0];
    console.log(
      `📅 [Harvest] sowingDate=${sowingDate} + ${fieldDays}d field horizon ` +
      `(seed-to-harvest=${plannerOut.total_duration_days}d, nurseryDays=${nurseryDays}, ` +
      `isReadyMadePlant=${isReadyMadePlant}) → harvest=${harvestDateStr}`
    );
    
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: cropName,
        crop_variety: cropVariety || cropName,
        variety_id: varietyProfile?.variety_id || null,
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr, // CRITICAL: Set actual harvest date
        regional_dialect_zone: region,
        district_name: district,
        taluka_name: land.taluka || null,
        total_estimated_cost: correctedTotalCost,
        total_labor_cost: totalLaborCost,
        total_material_cost: totalMaterialCost,
        expected_yield_quintals: plannerOut.expected_yield_quintals,
        expected_profit:
          scheduleData.expected_profit || plannerOut.expected_yield_quintals * 2500 - correctedTotalCost,
        ai_model: currentModel,
        is_active: true,
        status: "active",
        generation_language: language,
        calculated_for_area_acres: landAreaAcres,
        total_duration_days: plannerOut.total_duration_days,
        seed_quantity_kg: exactSeedQty,
        fertilizer_n_kg: ureaKg * 0.46,
        fertilizer_p_kg: dapKg * 0.46,
        fertilizer_k_kg: mopKg * 0.6,
        organic_manure_kg: fymTons * 1000,
        suitability_score: suitabilityCheck.score,
        suitability_warnings: suitabilityCheck.warnings || [],
        recommendation_order: "organic → growth_promoter → fertilizer → pesticide",
        state_region: state,
        labor_rate_used: laborRate,
        cost_by_stage: costByStage,
        cost_by_category: costByCategory,
        yield_multiplier_target: scheduleData.yield_multiplier_target || 3,
        yield_boosting_techniques: scheduleData.yield_boosting_techniques || [],
        stages_covered: [...stagesCovered],
        products_recommended_count: processedTasks.reduce(
          (sum: number, t: any) => sum + (t.product_recommendations?.length || 0),
          0,
        ),
        farming_type: farmingType,
        // Variety-aware irrigation plan
        water_requirement_liters_total: plannerOut.water_requirement_liters_total,
        water_per_irrigation_liters: plannerOut.water_per_irrigation_liters,
        irrigation_count_total: plannerOut.irrigation_count_total,
        tasks_total_count: processedTasks.length,
        tasks_completed_count: 0,
        // NEW: Multi-intercrop support (up to 3 intercrops)
        intercrop_name: intercrop1?.cropName || null,
        intercrop_variety: intercrop1?.cropVariety || null,
        intercrop_area_percent: intercrop1?.areaPercent || 0,
        intercrop_sowing_date: sowingDate,
        // Intercrop 2
        intercrop_2_name: intercrop2?.cropName || null,
        intercrop_2_variety: intercrop2?.cropVariety || null,
        intercrop_2_area_percent: intercrop2?.areaPercent || 0,
        intercrop_2_sowing_date: intercrop2 ? sowingDate : null,
        // Intercrop 3
        intercrop_3_name: intercrop3?.cropName || null,
        intercrop_3_variety: intercrop3?.cropVariety || null,
        intercrop_3_area_percent: intercrop3?.areaPercent || 0,
        intercrop_3_sowing_date: intercrop3 ? sowingDate : null,
        // NEW: Backdated consent tracking
        backdated_consent: backdatedConsent || false,
        backdated_consent_at: backdatedConsent ? new Date().toISOString() : null,
        metadata: {
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          fertilizer_data: { urea_kg: ureaKg, dap_kg: dapKg, mop_kg: mopKg, fym_tons: fymTons },
          translated_crop_name: translatedCropName,
          ai_version: AI_CONFIG.MODEL,
          generation_timestamp: new Date().toISOString(),
          harvest_date: harvestDateStr,
          intercrops: intercropArray,
          backdated_consent: backdatedConsent || false,
          variety: varietyProfile ? {
            id: varietyProfile.variety_id,
            name: varietyProfile.name,
            code: varietyProfile.variety_code,
            source: varietyProfile.source,
            state_match: varietyProfile.state_match,
            data_confidence_score: varietyProfile.data_confidence_score,
            maturity_window: varietyProfile.maturity_days_min && varietyProfile.maturity_days_max
              ? `${varietyProfile.maturity_days_min}-${varietyProfile.maturity_days_max}d` : null,
            yield_potential_qtl_per_acre: varietyProfile.yield_potential_qtl_per_acre,
          } : null,
          variety_overrides: plannerOut.applied_overrides,
        },
      })
      .select()
      .single();

    if (scheduleError) {
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    const baseSowingDate = new Date(sowingDate);
    if (isNaN(baseSowingDate.getTime())) {
      throw new Error(`Invalid sowing date: ${sowingDate}`);
    }

    const tasksToInsert = processedTasks.map((task: any, idx: number) => {
      const daysFromSowing =
        typeof task.days_from_sowing === "number" && !isNaN(task.days_from_sowing) ? task.days_from_sowing : 0;
      const taskDate = new Date(baseSowingDate.getTime() + daysFromSowing * 24 * 60 * 60 * 1000);
      const taskDateStr = taskDate.toISOString().split("T")[0];

      return {
        schedule_id: savedSchedule.id,
        farmer_id: farmerId,
        tenant_id: tenantId,
        task_name: task.task_name,
        task_type: task.category || "general",
        task_date: taskDateStr,
        days_from_sowing: daysFromSowing,
        priority: task.priority || "medium",
        task_description: task.description || "",
        instructions: task.instructions || [],
        precautions: task.precautions || [],
        weather_dependent: task.weather_dependent || false,
        status: "pending",
        sequence_order: idx + 1,
        stage_key: task.stage_key,
        stage_order: task.stage_order,
        stage_name: task.stage_name,
        yield_impact: task.yield_impact,
        skip_penalty: task.skip_penalty,
        yield_boost_technique: task.yield_boost_technique,
        product_recommendations: task.product_recommendations || [],
        ideal_weather: task.ideal_weather || null,
        resources: {
          quantity: task.quantity,
          product_details: task.product_details,
          product_cost: task.product_cost,
          labor_days: task.labor_total_days || task.labor_days,
          labor_cost: task.labor_cost,
          labor_workers: task.labor_workers,
          labor_days_per_acre: task.labor_days_per_acre,
          labor_daily_wage: task.labor_daily_wage || 350,
          labor_description: task.labor_description,
          cost_breakdown: task.cost_breakdown,
          icar_guideline: task.icar_guideline,
          climate_risk: task.climate_risk,
        },
        estimated_cost: task.estimated_cost || 0,
        currency: "INR",
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from("schedule_tasks")
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error("❌ Tasks insert error:", tasksError);
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔗 CRITICAL: SYNC CROP TO LANDS TABLE
    // This ensures lands.current_crop matches the schedule's crop
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🔄 [Sync] Updating lands table with schedule crop...');
    
    // 1. Move current crop to previous_crop (for rotation tracking)
    const { data: landBeforeUpdate } = await supabase
      .from("lands")
      .select("current_crop, current_crop_id")
      .eq("id", landId)
      .single();
    
    // 2. Update lands table with new crop info - CRITICAL FIX: Also update cultivation_date
    const { error: landUpdateError } = await supabase
      .from("lands")
      .update({
        current_crop: cropName,
        cultivation_date: sowingDate, // CRITICAL: Sync cultivation_date with schedule sowing_date
        // If previous crop exists, move it to previous_crop
        previous_crop: landBeforeUpdate?.current_crop || null,
        previous_crop_id: landBeforeUpdate?.current_crop_id || null,
        last_harvest_date: landBeforeUpdate?.current_crop ? new Date().toISOString().split("T")[0] : null,
        planting_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", landId);
    
    if (landUpdateError) {
      console.error("⚠️ Land sync warning:", landUpdateError.message);
    } else {
      console.log(`✅ [Sync] Land ${landId} updated: current_crop = "${cropName}"`);
    }
    
    // 3. Insert/Update land_crops entry for multi-crop tracking
    const { error: landCropsError } = await supabase
      .from("land_crops")
      .upsert({
        land_id: landId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        crop_name: cropName,
        crop_name_local: translatedCropName,
        crop_variety: cropVariety || null,
        crop_type: 'major', // Main crop from schedule
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        area_percentage: 100,
        area_acres: landAreaAcres,
        schedule_id: savedSchedule.id,
        is_active: true,
        status: 'growing',
        farming_type: farmingType,
        metadata: {
          schedule_crop_name: cropName,
          translated_name: translatedCropName,
          generated_at: new Date().toISOString()
        }
      }, {
        onConflict: 'land_id,crop_type,is_active',
        ignoreDuplicates: false
      });
    
    if (landCropsError) {
      // Try insert if upsert fails (no conflict columns might exist yet)
      const { error: insertError } = await supabase
        .from("land_crops")
        .insert({
          land_id: landId,
          tenant_id: tenantId,
          farmer_id: farmerId,
          crop_name: cropName,
          crop_name_local: translatedCropName,
          crop_variety: cropVariety || null,
          crop_type: 'major',
          sowing_date: sowingDate,
          expected_harvest_date: harvestDateStr,
          area_percentage: 100,
          area_acres: landAreaAcres,
          schedule_id: savedSchedule.id,
          is_active: true,
          status: 'growing',
          farming_type: farmingType,
        });
      
      if (insertError) {
        console.warn("⚠️ land_crops insert warning:", insertError.message);
      } else {
        console.log(`✅ [Sync] land_crops entry created for major crop "${cropName}"`);
      }
    } else {
      console.log(`✅ [Sync] land_crops entry updated for major crop "${cropName}"`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🌿 INSERT INTERCROP ENTRIES TO land_crops TABLE
    // ═══════════════════════════════════════════════════════════════════════
    for (let i = 0; i < intercropArray.length; i++) {
      const ic = intercropArray[i];
      if (ic?.cropName) {
        console.log(`🌿 [Sync] Inserting intercrop ${i + 1}: ${ic.cropName} (${ic.areaPercent}%)`);
        
        const { error: icInsertError } = await supabase
          .from("land_crops")
          .insert({
            land_id: landId,
            tenant_id: tenantId,
            farmer_id: farmerId,
            crop_name: ic.cropName,
            crop_name_local: ic.localizedCropName || ic.cropName,
            crop_variety: ic.cropVariety || null,
            crop_type: 'intercrop',
            crop_sequence: i + 1,
            sowing_date: sowingDate,
            expected_harvest_date: harvestDateStr,
            area_percentage: ic.areaPercent || 0,
            area_acres: (landAreaAcres * (ic.areaPercent || 0)) / 100,
            schedule_id: savedSchedule.id,
            is_active: true,
            status: 'growing',
            farming_type: farmingType,
            metadata: {
              parent_crop: cropName,
              intercrop_index: i + 1,
            }
          });
        
        if (icInsertError) {
          console.warn(`⚠️ land_crops intercrop ${i + 1} insert warning:`, icInsertError.message);
        } else {
          console.log(`✅ [Sync] land_crops entry created for intercrop ${i + 1}: "${ic.cropName}"`);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule complete in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        landId,
        farmerId,
        tenantId,
        cropName,
        translatedCropName,
        cropVariety: cropVariety || cropName,
        sowingDate,
        farmingType,
        language,
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
        },
        aiModel: currentModel,
        aiProvider: currentProvider,
        totalTasks: processedTasks.length,
        executionTimeMs: executionTime,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("❌ [AI-Schedule] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Schedule generation failed",
        executionTimeMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
