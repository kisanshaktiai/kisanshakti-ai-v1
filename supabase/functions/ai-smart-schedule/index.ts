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

// ═══════════════════════════════════════════════════════════════════════
// CROP NAME TRANSLATIONS - CRITICAL FOR CORRECT TASK NAMES
// ═══════════════════════════════════════════════════════════════════════
const CROP_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    wheat: "Wheat",
    rice: "Rice",
    cotton: "Cotton",
    sugarcane: "Sugarcane",
    soybean: "Soybean",
    maize: "Maize",
    groundnut: "Groundnut",
    tomato: "Tomato",
    onion: "Onion",
    potato: "Potato",
    chilli: "Chilli",
    brinjal: "Brinjal",
    okra: "Okra",
    moong: "Moong",
    urad: "Urad",
    tur: "Tur/Pigeon Pea",
    gram: "Gram/Chickpea",
    mustard: "Mustard",
    sunflower: "Sunflower",
    jowar: "Sorghum",
    bajra: "Pearl Millet",
    banana: "Banana",
    mango: "Mango",
    grapes: "Grapes",
    pomegranate: "Pomegranate",
    orange: "Orange",
    turmeric: "Turmeric",
    ginger: "Ginger",
    coriander: "Coriander",
  },
  hi: {
    wheat: "गेहूं",
    rice: "धान/चावल",
    cotton: "कपास",
    sugarcane: "गन्ना",
    soybean: "सोयाबीन",
    maize: "मक्का",
    groundnut: "मूंगफली",
    tomato: "टमाटर",
    onion: "प्याज",
    potato: "आलू",
    chilli: "मिर्च",
    brinjal: "बैंगन",
    okra: "भिंडी",
    moong: "मूंग",
    urad: "उड़द",
    tur: "अरहर/तुअर",
    gram: "चना",
    mustard: "सरसों",
    sunflower: "सूरजमुखी",
    jowar: "ज्वार",
    bajra: "बाजरा",
    banana: "केला",
    mango: "आम",
    grapes: "अंगूर",
    pomegranate: "अनार",
    orange: "संतरा",
    turmeric: "हल्दी",
    ginger: "अदरक",
    coriander: "धनिया",
  },
  mr: {
    wheat: "गहू",
    rice: "भात/तांदूळ",
    cotton: "कापूस",
    sugarcane: "ऊस",
    soybean: "सोयाबीन",
    maize: "मका",
    groundnut: "भुईमूग/शेंगदाणे",
    tomato: "टोमॅटो",
    onion: "कांदा",
    potato: "बटाटा",
    chilli: "मिरची",
    brinjal: "वांगी",
    okra: "भेंडी",
    moong: "मूग",
    urad: "उडीद",
    tur: "तूर",
    gram: "हरभरा",
    mustard: "मोहरी",
    sunflower: "सूर्यफूल",
    jowar: "ज्वारी",
    bajra: "बाजरी",
    banana: "केळी",
    mango: "आंबा",
    grapes: "द्राक्षे",
    pomegranate: "डाळिंब",
    orange: "संत्री/मोसंबी",
    turmeric: "हळद",
    ginger: "आले",
    coriander: "कोथिंबीर",
  },
  pa: {
    wheat: "ਕਣਕ",
    rice: "ਝੋਨਾ/ਚੌਲ",
    cotton: "ਕਪਾਹ/ਨਰਮਾ",
    sugarcane: "ਗੰਨਾ",
    soybean: "ਸੋਇਆਬੀਨ",
    maize: "ਮੱਕੀ",
    groundnut: "ਮੂੰਗਫਲੀ",
    tomato: "ਟਮਾਟਰ",
    onion: "ਪਿਆਜ਼",
    potato: "ਆਲੂ",
    chilli: "ਮਿਰਚ",
    brinjal: "ਬੈਂਗਣ",
    okra: "ਭਿੰਡੀ",
    moong: "ਮੂੰਗ",
    urad: "ਉੜਦ",
    tur: "ਅਰਹਰ",
    gram: "ਛੋਲੇ",
    mustard: "ਸਰ੍ਹੋਂ",
    sunflower: "ਸੂਰਜਮੁਖੀ",
    jowar: "ਜਵਾਰ",
    bajra: "ਬਾਜਰਾ",
    banana: "ਕੇਲਾ",
    mango: "ਅੰਬ",
  },
  ta: {
    wheat: "கோதுமை",
    rice: "நெல்/அரிசி",
    cotton: "பருத்தி",
    sugarcane: "கரும்பு",
    soybean: "சோயா",
    maize: "மக்காச்சோளம்",
    groundnut: "நிலக்கடலை",
    tomato: "தக்காளி",
    onion: "வெங்காயம்",
    potato: "உருளைக்கிழங்கு",
    chilli: "மிளகாய்",
    brinjal: "கத்தரிக்காய்",
    okra: "வெண்டைக்காய்",
    moong: "பச்சைப்பயறு",
    urad: "உளுந்து",
    tur: "துவரை",
    gram: "கொண்டக்கடலை",
    mustard: "கடுகு",
    sunflower: "சூரியகாந்தி",
  },
  te: {
    wheat: "గోధుమ",
    rice: "వరి/బియ్యం",
    cotton: "పత్తి",
    sugarcane: "చెరకు",
    soybean: "సోయాబీన్",
    maize: "మొక్కజొన్న",
    groundnut: "వేరుశెనగ",
    tomato: "టమాటా",
    onion: "ఉల్లిపాయ",
    potato: "బంగాళాదుంప",
    chilli: "మిర్చి",
    brinjal: "వంకాయ",
    okra: "బెండకాయ",
    moong: "పెసర",
    urad: "మినప",
    tur: "కందిపప్పు",
    gram: "శెనగలు",
    mustard: "ఆవాలు",
    sunflower: "పొద్దుతిరుగుడు",
  },
  kn: {
    wheat: "ಗೋಧಿ",
    rice: "ಅಕ್ಕಿ/ಭತ್ತ",
    cotton: "ಹತ್ತಿ",
    sugarcane: "ಕಬ್ಬು",
    soybean: "ಸೋಯಾಬೀನ್",
    maize: "ಮೆಕ್ಕೆಜೋಳ",
    groundnut: "ಕಡಲೆಕಾಯಿ",
    tomato: "ಟೊಮ್ಯಾಟೊ",
    onion: "ಈರುಳ್ಳಿ",
    potato: "ಆಲೂಗಡ್ಡೆ",
    chilli: "ಮೆಣಸಿನಕಾಯಿ",
    brinjal: "ಬದನೆಕಾಯಿ",
    okra: "ಬೆಂಡೆಕಾಯಿ",
    moong: "ಹೆಸರು",
    urad: "ಉದ್ದು",
    tur: "ತೊಗರಿ",
  },
  gu: {
    wheat: "ઘઉં",
    rice: "ડાંગર/ચોખા",
    cotton: "કપાસ",
    sugarcane: "શેરડી",
    soybean: "સોયાબીન",
    maize: "મકાઈ",
    groundnut: "મગફળી/સિંગ",
    tomato: "ટામેટા",
    onion: "ડુંગળી",
    potato: "બટાટા",
    chilli: "મરચાં",
    brinjal: "રીંગણા",
    okra: "ભીંડા",
    moong: "મગ",
    urad: "અડદ",
    tur: "તુવેર",
  },
  bn: {
    wheat: "গম",
    rice: "ধান/চাল",
    cotton: "তুলা",
    sugarcane: "আখ",
    soybean: "সয়াবিন",
    maize: "ভুট্টা",
    groundnut: "চিনাবাদাম",
    tomato: "টমেটো",
    onion: "পেঁয়াজ",
    potato: "আলু",
    chilli: "মরিচ",
    brinjal: "বেগুন",
    okra: "ঢেঁড়স",
    moong: "মুগ",
    urad: "কালো মাষকলাই",
    tur: "অড়হর",
  },
};

// Function to get translated crop name
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

const SEED_RATES: Record<
  string,
  { rate_kg_per_acre: number; spacing_cm: string; price_per_kg: number; treatment: string }
> = {
  wheat: {
    rate_kg_per_acre: 40,
    spacing_cm: "22.5 row spacing",
    price_per_kg: 35,
    treatment: "Thiram @ 2.5g/kg or Trichoderma 4g/kg",
  },
  rice: {
    rate_kg_per_acre: 20,
    spacing_cm: "20x15 cm",
    price_per_kg: 45,
    treatment: "Carbendazim @ 2g/kg or Trichoderma 4g/kg",
  },
  cotton: {
    rate_kg_per_acre: 1.5,
    spacing_cm: "90x60 cm",
    price_per_kg: 850,
    treatment: "Imidacloprid @ 5g/kg or neem oil soak",
  },
  soybean: {
    rate_kg_per_acre: 30,
    spacing_cm: "45x5 cm",
    price_per_kg: 90,
    treatment: "Thiram+Rhizobium or Trichoderma+Rhizobium",
  },
  maize: { rate_kg_per_acre: 8, spacing_cm: "60x20 cm", price_per_kg: 350, treatment: "Thiram @ 3g/kg" },
  sugarcane: {
    rate_kg_per_acre: 0,
    spacing_cm: "90x30 cm",
    price_per_kg: 0,
    treatment: "Carbendazim dip or lime water soak",
  },
  groundnut: {
    rate_kg_per_acre: 50,
    spacing_cm: "30x10 cm",
    price_per_kg: 80,
    treatment: "Thiram @ 3g/kg + Rhizobium",
  },
  tomato: { rate_kg_per_acre: 0.15, spacing_cm: "60x45 cm", price_per_kg: 3500, treatment: "Trichoderma @ 4g/kg" },
  onion: { rate_kg_per_acre: 4, spacing_cm: "15x10 cm", price_per_kg: 1200, treatment: "Thiram @ 2g/kg" },
  potato: { rate_kg_per_acre: 800, spacing_cm: "60x20 cm", price_per_kg: 25, treatment: "Mancozeb dip or boric acid" },
  chilli: { rate_kg_per_acre: 0.2, spacing_cm: "60x45 cm", price_per_kg: 2500, treatment: "Trichoderma @ 4g/kg" },
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
  }
> = {
  planning: {
    task_name_en: "Crop planning and seed selection",
    task_name_hi: "फसल योजना और बीज चयन",
    task_name_mr: "पीक नियोजन आणि बियाणे निवड",
    category: "planning",
    days_offset: -7,
    description_en: "Select high-yielding certified seeds, prepare land plan, and arrange inputs",
    priority: "high",
  },
  land_preparation: {
    task_name_en: "Land preparation and soil treatment",
    task_name_hi: "खेत तैयारी और मिट्टी उपचार",
    task_name_mr: "जमीन तयारी आणि माती सुधारणा",
    category: "land_preparation",
    days_offset: -5,
    description_en: "Deep plowing, leveling, FYM application, and soil treatment for optimal growth",
    priority: "critical",
  },
  sowing: {
    task_name_en: "Sowing and seed treatment",
    task_name_hi: "बुवाई और बीज उपचार",
    task_name_mr: "पेरणी आणि बियाणे प्रक्रिया",
    category: "sowing",
    days_offset: 0,
    description_en: "Treat seeds with Trichoderma/Rhizobium and sow at optimal spacing",
    priority: "critical",
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
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const OPENAI_API_KEY = validateOpenAIKey();

    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const {
      landId,
      cropName,
      cropVariety,
      sowingDate,
      language = "hi",
      isReadyMadePlant = false,
      farmingType = "organic_fertilizer",
    } = await req.json();
    const tenantId = req.headers.get("x-tenant-id") || "";
    const farmerId = req.headers.get("x-farmer-id") || "";

    // CRITICAL: Get translated crop name immediately
    const translatedCropName = getTranslatedCropName(cropName, language);
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
    const seedData = SEED_RATES[cropLower] || {
      rate_kg_per_acre: 10,
      spacing_cm: "Standard",
      price_per_kg: 50,
      treatment: "Trichoderma 4g/kg",
    };
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
    const mopKg = Math.round((kDeficit * landAreaHa) / 0.6);
    const ureaCost = Math.round(ureaKg * FERTILIZER_PRICES.urea.price_per_kg);
    const dapCost = Math.round(dapKg * FERTILIZER_PRICES.dap.price_per_kg);
    const mopCost = Math.round(mopKg * FERTILIZER_PRICES.mop.price_per_kg);
    const totalFertilizerCost = ureaCost + dapCost + mopCost;

    const irrigationRules = buildIrrigationRules(land.irrigation_type || "manual");

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: BUILD STAGE-BASED AI PROMPT - ALL STAGES MANDATORY
    // ═══════════════════════════════════════════════════════════════════
    const totalStages = farmingStages.length;
    console.log(`📋 [AI] Building OPTIMIZED prompt for ${totalStages} stages`);

    // OPTIMIZED: Compact stage prompt to reduce token count
    const stagesPrompt = farmingStages
      .map((stage: FarmingStage) => {
        return `${stage.stage_order}. ${stage.stage_name} (${stage.stage_key}): ${stage.stage_description} - 2-3 tasks`;
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
    // OPTIMIZED AI PROMPT - Reduced token count for stability
    // ═══════════════════════════════════════════════════════════════════
    const systemPrompt = `You are Dr. AgriGenius, Agricultural Scientist from IARI with 40+ years experience.
Create ${translatedCropName} (${cropName}) crop schedule for ${landAreaAcres} acres.

CRITICAL RULES:
1. CROP: "${translatedCropName}" must be in EVERY task_name
2. LANGUAGE: ${languageName} ONLY - rural dialect
3. FARMING: ${farmingTypeLabel}
${
  farmingType === "organic_only"
    ? "   Use ONLY: FYM, Vermicompost, Neem, Trichoderma. NO chemicals."
    : farmingType === "fertilizer_pesticide"
      ? "   Use: Urea, DAP, MOP, pesticides. Brands: IFFCO, Bayer, Syngenta"
      : "   Balanced: Organic first, then fertilizers if needed"
}

STAGES (2-3 tasks each):
${stagesPrompt}

LAND: ${land.village || district}, ${state} | ${land.soil_type || "Black"} soil | ${land.irrigation_type || "manual"} irrigation
SOWING: ${sowingDate}
N/P/K deficit: ${nDeficit}/${pDeficit}/${kDeficit} kg/ha
Labor: ₹${laborRate}/day`;

    const userPrompt = `Generate ${translatedCropName} schedule with ${totalStages * 2}-${totalStages * 3} tasks.
RULES:
- task_name: "${translatedCropName} - [action]" in ${languageName}
- All ${totalStages} stages required: ${allStageKeys.join(", ")}
- Include brand recommendations
- Calculate costs per task`;

    console.log(`🤖 [AI] Calling ${AI_CONFIG.MODEL} with optimized ${totalStages}-stage prompt`);

    // Build simplified tool schema to reduce payload size
    const toolSchema = {
      type: "function",
      function: {
        name: "create_schedule",
        description: `Create ${translatedCropName} schedule`,
        parameters: {
          type: "object",
          properties: {
            crop_name: { type: "string" },
            total_duration_days: { type: "integer" },
            stages_covered: { type: "array", items: { type: "string" } },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task_name: { type: "string" },
                  stage_key: { type: "string", enum: allStageKeys },
                  stage_order: { type: "integer" },
                  category: { type: "string" },
                  days_from_sowing: { type: "integer" },
                  priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                  description: { type: "string" },
                  yield_impact: { type: "string" },
                  skip_penalty: { type: "string" },
                  product_recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_name: { type: "string" },
                        brand: { type: "string" },
                        dose_per_acre: { type: "string" },
                        price_estimate: { type: "number" },
                      },
                    },
                  },
                  estimated_cost: { type: "number" },
                  instructions: { type: "array", items: { type: "string" } },
                },
                required: ["task_name", "stage_key", "days_from_sowing", "description", "instructions"],
              },
            },
          },
          required: ["crop_name", "tasks", "stages_covered"],
        },
      },
    };

    // Retry logic for handling 502/503 errors
    let aiResponse: Response | null = null;
    let lastError = "";
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [AI] Attempt ${attempt}/${maxRetries}`);

        aiResponse = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_CONFIG.MODEL,
            max_tokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [toolSchema],
            tool_choice: { type: "function", function: { name: "create_schedule" } },
          }),
        });

        if (aiResponse.ok) {
          console.log(`✅ [AI] Request succeeded on attempt ${attempt}`);
          break;
        }

        // Handle specific error codes
        if (aiResponse.status === 502 || aiResponse.status === 503) {
          lastError = `Gateway error ${aiResponse.status}`;
          console.warn(`⚠️ [AI] ${lastError} on attempt ${attempt}, will retry...`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
            continue;
          }
        }

        const errorText = await aiResponse.text();
        lastError = `AI API error: ${aiResponse.status}`;
        console.error(`❌ AI error:`, aiResponse.status, errorText.substring(0, 200));
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

    if (!message?.tool_calls?.[0]) {
      console.error("❌ [AI] No tool calls in response:", JSON.stringify(aiData).substring(0, 500));
      throw new Error("AI did not return structured schedule");
    }

    const scheduleData = JSON.parse(message.tool_calls[0].function.arguments);
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks`);

    if (!scheduleData.tasks?.length) {
      throw new Error("AI returned empty schedule");
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

    // Fix crop names and farming type compliance
    validTasks = validTasks.map((task: any) => {
      // Step 1: Fix crop name
      task = validateAndFixTaskCropName(task, translatedCropName, cropName, language);

      // Step 2: Validate and fix farming type compliance
      const validation = validateTaskForFarmingType(task, farmingType, language);
      if (!validation.valid) {
        console.warn(`⚠️ [FarmingType] Task "${task.task_name}" has issues:`, validation.issues);
        task = fixTaskForFarmingType(task, farmingType, language, translatedCropName);
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

    for (const task of allTasks) {
      if (!task.product_recommendations || task.product_recommendations.length === 0) {
        const category = task.category || "other";
        const dbProducts = await fetchRecommendedProducts(supabase, cropName, task.stage_key, category, farmingType);

        if (dbProducts.length > 0) {
          task.product_recommendations = dbProducts.slice(0, 2).map((p: any) => ({
            product_name: p.name,
            brand: p.brand || "",
            product_type: p.organic_certified ? "organic" : p.product_type,
            active_ingredient: p.active_ingredients || "",
            dose_per_acre: p.dosage_instructions || "",
            application_method: p.application_method || "spray",
            price_estimate: parseInt(p.price_range?.split("-")?.[0] || "200"),
          }));
        }
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
        expected_profit:
          scheduleData.expected_profit || scheduleData.expected_yield_quintals * 2500 - correctedTotalCost,
        ai_model: AI_CONFIG.MODEL,
        is_active: true,
        status: "active",
        generation_language: language,
        calculated_for_area_acres: landAreaAcres,
        total_duration_days: scheduleData.total_duration_days,
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
        water_requirement_liters_total: landAreaAcres * 50000 * (land.irrigation_type === "drip" ? 0.6 : 1),
        water_per_irrigation_liters: landAreaAcres * 5000 * (land.irrigation_type === "drip" ? 0.6 : 1),
        irrigation_count_total: Math.round(scheduleData.total_duration_days / 7),
        tasks_total_count: processedTasks.length,
        tasks_completed_count: 0,
        metadata: {
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          fertilizer_data: { urea_kg: ureaKg, dap_kg: dapKg, mop_kg: mopKg, fym_tons: fymTons },
          translated_crop_name: translatedCropName,
          ai_version: AI_CONFIG.MODEL,
          generation_timestamp: new Date().toISOString(),
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
        resources: {
          quantity: task.quantity,
          product_details: task.product_details,
          product_cost: task.product_cost,
          labor_days: task.labor_days,
          labor_cost: task.labor_cost,
          cost_breakdown: task.cost_breakdown,
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
        aiModel: AI_CONFIG.MODEL,
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
