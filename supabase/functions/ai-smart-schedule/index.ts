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
  },
};

// ═══════════════════════════════════════════════════════════════════════
// STATE-WISE LABOR RATES (MGNREGA 2024-25 Daily Wages in ₹)
// ═══════════════════════════════════════════════════════════════════════
const STATE_LABOR_RATES: Record<string, number> = {
  "Maharashtra": 310, "Madhya Pradesh": 243, "Karnataka": 333, "Haryana": 374,
  "Punjab": 303, "Gujarat": 280, "Rajasthan": 266, "Uttar Pradesh": 237,
  "Bihar": 245, "Tamil Nadu": 311, "Andhra Pradesh": 300, "Telangana": 300,
  "Kerala": 352, "West Bengal": 237, "Odisha": 237, "Jharkhand": 237,
  "Chhattisgarh": 221, "Assam": 238, "Himachal Pradesh": 266, "Uttarakhand": 237,
  "Jammu and Kashmir": 266, "Goa": 350, "default": 275,
};

// ═══════════════════════════════════════════════════════════════════════
// ORGANIC INPUTS PRICES (PRIORITY 1 - Always recommend first)
// ═══════════════════════════════════════════════════════════════════════
const ORGANIC_INPUTS: Record<string, { price: number; unit: string; coverage_acre: number; benefit: string }> = {
  fym: { price: 800, unit: "1 ton", coverage_acre: 1, benefit: "Improves soil structure & fertility" },
  vermicompost: { price: 8, unit: "per kg", coverage_acre: 0.02, benefit: "Rich in nutrients & microbes" },
  jeevamrut: { price: 50, unit: "per batch (200L)", coverage_acre: 1, benefit: "Soil microbial activator" },
  panchagavya: { price: 100, unit: "per batch", coverage_acre: 1, benefit: "Growth promoter & immunity" },
  neem_cake: { price: 25, unit: "per kg", coverage_acre: 0.01, benefit: "Pest repellent & nitrogen source" },
  neem_oil: { price: 280, unit: "per liter", coverage_acre: 1, benefit: "Organic pesticide" },
  trichoderma: { price: 180, unit: "per kg", coverage_acre: 1, benefit: "Fungal disease control" },
  pseudomonas: { price: 200, unit: "per kg", coverage_acre: 1, benefit: "Root disease control" },
  beauveria: { price: 220, unit: "per kg", coverage_acre: 1, benefit: "Insect pest control" },
  cow_urine: { price: 20, unit: "per liter", coverage_acre: 0.05, benefit: "Foliar spray & pest deterrent" },
  mulching: { price: 2000, unit: "per acre", coverage_acre: 1, benefit: "Moisture retention & weed control" },
  green_manure: { price: 500, unit: "seed per acre", coverage_acre: 1, benefit: "Natural nitrogen fixation" },
};

// ═══════════════════════════════════════════════════════════════════════
// GROWTH PROMOTERS (PRIORITY 2 - After organic, before fertilizers)
// ═══════════════════════════════════════════════════════════════════════
const GROWTH_PROMOTERS: Record<string, { price: number; unit: string; coverage_acre: number; use: string }> = {
  seaweed_extract: { price: 450, unit: "500ml", coverage_acre: 1, use: "Root development & stress tolerance" },
  humic_acid: { price: 380, unit: "1L", coverage_acre: 1, use: "Nutrient uptake & soil health" },
  amino_acid: { price: 520, unit: "1L", coverage_acre: 1, use: "Protein synthesis & growth" },
  fulvic_acid: { price: 400, unit: "500ml", coverage_acre: 1, use: "Nutrient transport" },
  silicic_acid: { price: 350, unit: "500ml", coverage_acre: 1, use: "Stem strength & disease resistance" },
  gibberellic_acid: { price: 280, unit: "10g", coverage_acre: 2, use: "Cell elongation (use carefully)" },
  naphthalene_acetic_acid: { price: 180, unit: "100ml", coverage_acre: 1, use: "Root initiation" },
  cytokinin: { price: 420, unit: "100ml", coverage_acre: 1, use: "Cell division & fruit set" },
  brassinolide: { price: 550, unit: "100ml", coverage_acre: 2, use: "Stress tolerance & yield" },
};

// ═══════════════════════════════════════════════════════════════════════
// FERTILIZER PRICES (PRIORITY 3 - Based on soil test deficit only)
// ═══════════════════════════════════════════════════════════════════════
const FERTILIZER_PRICES: Record<string, { price_per_kg: number; bag_kg: number; nutrient_content: string }> = {
  urea: { price_per_kg: 5.92, bag_kg: 45, nutrient_content: "46% N" },
  dap: { price_per_kg: 27, bag_kg: 50, nutrient_content: "18% N, 46% P" },
  mop: { price_per_kg: 17.5, bag_kg: 50, nutrient_content: "60% K" },
  ssp: { price_per_kg: 8, bag_kg: 50, nutrient_content: "16% P" },
  "10-26-26": { price_per_kg: 27.5, bag_kg: 50, nutrient_content: "10% N, 26% P, 26% K" },
  "12-32-16": { price_per_kg: 29, bag_kg: 50, nutrient_content: "12% N, 32% P, 16% K" },
  zinc_sulphate: { price_per_kg: 85, bag_kg: 25, nutrient_content: "33% Zn" },
  borax: { price_per_kg: 120, bag_kg: 25, nutrient_content: "11% B" },
  ferrous_sulphate: { price_per_kg: 45, bag_kg: 25, nutrient_content: "19% Fe" },
  magnesium_sulphate: { price_per_kg: 35, bag_kg: 25, nutrient_content: "10% Mg" },
};

// ═══════════════════════════════════════════════════════════════════════
// PESTICIDE PRICES (PRIORITY 4 - Only if absolutely necessary)
// ═══════════════════════════════════════════════════════════════════════
const CHEMICAL_PRICES: Record<string, { 
  price: number; unit: string; coverage_acre: number; type: string; 
  active_ingredient: string; phi_days: number; organic_alternative: string 
}> = {
  // Insecticides
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
  "lambda_cyhalothrin_5ec": { 
    price: 420, unit: "500ml", coverage_acre: 1, type: "insecticide",
    active_ingredient: "Lambda-cyhalothrin 5% EC", phi_days: 7,
    organic_alternative: "Pyrethrum extract + neem oil"
  },
  "emamectin_benzoate_5sg": { 
    price: 450, unit: "100g", coverage_acre: 1, type: "insecticide",
    active_ingredient: "Emamectin Benzoate 5% SG", phi_days: 7,
    organic_alternative: "Bacillus thuringiensis (Bt) 1g/L"
  },
  
  // Fungicides
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
  "copper_oxychloride_50wp": { 
    price: 380, unit: "500g", coverage_acre: 1, type: "fungicide",
    active_ingredient: "Copper Oxychloride 50% WP", phi_days: 7,
    organic_alternative: "Bordeaux mixture (homemade)"
  },
  "propiconazole_25ec": { 
    price: 680, unit: "250ml", coverage_acre: 1, type: "fungicide",
    active_ingredient: "Propiconazole 25% EC", phi_days: 28,
    organic_alternative: "Sulfur dust 25g/L"
  },
  "tricyclazole_75wp": { 
    price: 550, unit: "120g", coverage_acre: 1, type: "fungicide",
    active_ingredient: "Tricyclazole 75% WP", phi_days: 21,
    organic_alternative: "Pseudomonas + Trichoderma"
  },
  
  // Herbicides
  "glyphosate_41sl": { 
    price: 480, unit: "1L", coverage_acre: 1, type: "herbicide",
    active_ingredient: "Glyphosate 41% SL", phi_days: 30,
    organic_alternative: "Manual weeding + mulching"
  },
  "2_4_d_amine_58sl": { 
    price: 350, unit: "1L", coverage_acre: 2, type: "herbicide",
    active_ingredient: "2,4-D Amine Salt 58% SL", phi_days: 14,
    organic_alternative: "Hand weeding + intercultivation"
  },
  "pendimethalin_30ec": { 
    price: 580, unit: "1L", coverage_acre: 1, type: "herbicide",
    active_ingredient: "Pendimethalin 30% EC", phi_days: 60,
    organic_alternative: "Pre-emergence mulching + hand weeding"
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
  groundnut: {
    optimal_temp: { min: 20, max: 35 },
    soil_types: ["sandy loam", "red loamy", "alluvial"],
    ph_range: { min: 5.5, max: 7.0 },
    water_requirement: "low",
    seasons: ["kharif", "rabi"],
    states_suitable: ["Gujarat", "Andhra Pradesh", "Tamil Nadu", "Karnataka", "Rajasthan", "Maharashtra"],
    rainfall_mm: { min: 400, max: 800 },
  },
  tomato: {
    optimal_temp: { min: 15, max: 30 },
    soil_types: ["loamy", "sandy loam", "clay loam"],
    ph_range: { min: 6.0, max: 7.5 },
    water_requirement: "medium",
    seasons: ["kharif", "rabi", "zaid"],
    states_suitable: ["Maharashtra", "Karnataka", "Andhra Pradesh", "Madhya Pradesh", "Tamil Nadu", "Gujarat", "Uttar Pradesh"],
    rainfall_mm: { min: 400, max: 1000 },
  },
  onion: {
    optimal_temp: { min: 13, max: 24 },
    soil_types: ["loamy", "sandy loam", "alluvial"],
    ph_range: { min: 5.8, max: 6.8 },
    water_requirement: "medium",
    seasons: ["kharif", "rabi", "late_kharif"],
    states_suitable: ["Maharashtra", "Karnataka", "Gujarat", "Madhya Pradesh", "Rajasthan", "Andhra Pradesh"],
    rainfall_mm: { min: 350, max: 750 },
  },
  potato: {
    optimal_temp: { min: 15, max: 25 },
    soil_types: ["loamy", "sandy loam", "alluvial"],
    ph_range: { min: 5.5, max: 6.5 },
    water_requirement: "medium",
    seasons: ["rabi", "winter"],
    states_suitable: ["Uttar Pradesh", "West Bengal", "Bihar", "Gujarat", "Punjab", "Madhya Pradesh", "Karnataka"],
    rainfall_mm: { min: 400, max: 800 },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY-SPECIFIC PRECAUTIONS (All 9 Languages - Rural dialect)
// ═══════════════════════════════════════════════════════════════════════
const ACTIVITY_PRECAUTIONS: Record<string, Record<string, string[]>> = {
  mr: {
    seed_treatment: ["बियाणे सावलीत उपचार करा", "उपचारित बियाणे खाऊ नका", "2 तासात पेरणी करा"],
    sowing: ["ओलसर जमिनीतच पेरा", "2-3 सेमी खोलीवर पेरा", "पेरणीपूर्वी जमीन समतल करा"],
    transplanting: ["सकाळी किंवा संध्याकाळी लावा", "रोपे हलक्या हाताने हाताळा", "लावल्यावर लगेच पाणी द्या"],
    fertilizer: ["खत ओलसर मातीत द्या", "पाऊस नसताना खत द्या", "खत पानांवर पडू देऊ नका"],
    organic_input: ["गोबर खत पूर्ण कुजलेले वापरा", "जीवामृत सकाळी द्या", "सेंद्रिय आधी द्या, रासायनिक नंतर"],
    irrigation: ["सकाळी लवकर किंवा संध्याकाळी पाणी द्या", "जास्त पाणी देऊ नका", "पाणी साचू देऊ नका"],
    pesticide: ["मास्क व हातमोजे अनिवार्य", "वाऱ्याच्या विरुद्ध फवारणी करू नका", "फवारणीनंतर हात धुवा, आंघोळ करा"],
    fungicide: ["मास्क घाला", "संध्याकाळी फवारणी करा", "PHI पाळा"],
    weeding: ["उन्हात टोपी घाला", "पाणी पिण्यास विश्रांती घ्या", "पिकाला इजा करू नका"],
    harvest: ["धारदार अवजारे सांभाळा", "उष्णतेत विश्रांती घ्या", "कापणी सकाळी लवकर करा"],
    land_preparation: ["ट्रॅक्टर चालवताना सावधान", "शेणखत आधी पसरवा", "दगड काढून टाका"],
    intercultural: ["पिकाला इजा करू नका", "आंतरमशागत वेळेवर करा"],
    growth_promoter: ["पाने ओली असताना फवारणी करू नका", "सकाळी 7-9 वाजता फवारा", "संध्याकाळी 4-6 वाजताही करता येते"],
  },
  hi: {
    seed_treatment: ["छाया में बीज उपचार करें", "उपचारित बीज खाने से बचें", "2 घंटे में बुवाई करें"],
    sowing: ["नम मिट्टी में ही बोएं", "2-3 सेमी गहराई पर बोएं", "बुवाई से पहले जमीन समतल करें"],
    transplanting: ["सुबह या शाम को रोपें", "पौधे नाजुकी से उठाएं", "रोपाई के बाद तुरंत पानी दें"],
    fertilizer: ["गीली मिट्टी में खाद डालें", "बारिश न हो तब खाद दें", "पत्तों पर खाद न गिरने दें"],
    organic_input: ["गोबर की खाद पूरी सड़ी हो", "जीवामृत सुबह डालें", "जैविक पहले, रासायनिक बाद में"],
    irrigation: ["सुबह जल्दी या शाम को पानी दें", "ज्यादा पानी न दें", "पानी जमा न होने दें"],
    pesticide: ["मास्क और दस्ताने अनिवार्य", "हवा की दिशा में छिड़काव न करें", "छिड़काव के बाद हाथ धोएं, नहाएं"],
    fungicide: ["मास्क पहनें", "शाम को छिड़काव करें", "PHI का पालन करें"],
    weeding: ["धूप में टोपी पहनें", "पानी पीते रहें", "फसल को नुकसान न पहुंचाएं"],
    harvest: ["धारदार औजार संभालें", "गर्मी में आराम करें", "कटाई सुबह जल्दी करें"],
    land_preparation: ["ट्रैक्टर सावधानी से चलाएं", "गोबर खाद पहले फैलाएं", "पत्थर निकालें"],
    intercultural: ["फसल को नुकसान न पहुंचाएं", "अंतरकृषि समय पर करें"],
    growth_promoter: ["गीली पत्तियों पर छिड़काव न करें", "सुबह 7-9 बजे छिड़काव करें", "शाम 4-6 बजे भी कर सकते हैं"],
  },
  en: {
    seed_treatment: ["Treat seeds in shade", "Don't eat treated seeds", "Sow within 2 hours"],
    sowing: ["Sow in moist soil only", "Maintain 2-3cm depth", "Level field before sowing"],
    transplanting: ["Transplant in morning/evening", "Handle seedlings gently", "Water immediately after"],
    fertilizer: ["Apply in moist soil", "Apply when no rain expected", "Don't let fertilizer touch leaves"],
    organic_input: ["Use well-decomposed FYM", "Apply jeevamrut in morning", "Organic first, chemical later"],
    irrigation: ["Irrigate early morning or evening", "Avoid overwatering", "Prevent waterlogging"],
    pesticide: ["Wear mask and gloves", "Don't spray against wind", "Wash hands after, take bath"],
    fungicide: ["Wear mask", "Spray in evening", "Follow PHI strictly"],
    weeding: ["Wear hat in sun", "Stay hydrated", "Don't damage crop"],
    harvest: ["Handle sharp tools carefully", "Take breaks in heat", "Harvest early morning"],
    land_preparation: ["Drive tractor carefully", "Spread FYM first", "Remove stones"],
    intercultural: ["Avoid crop damage", "Do timely intercultivation"],
    growth_promoter: ["Don't spray on wet leaves", "Spray at 7-9 AM", "Can also spray 4-6 PM"],
  },
  pa: {
    seed_treatment: ["ਛਾਂ ਵਿੱਚ ਬੀਜ ਉਪਚਾਰ ਕਰੋ", "ਉਪਚਾਰਿਤ ਬੀਜ ਨਾ ਖਾਓ", "2 ਘੰਟਿਆਂ ਵਿੱਚ ਬਿਜਾਈ ਕਰੋ"],
    sowing: ["ਗਿੱਲੀ ਮਿੱਟੀ ਵਿੱਚ ਹੀ ਬੀਜੋ", "2-3 ਸੈ.ਮੀ. ਡੂੰਘਾਈ ਤੇ ਬੀਜੋ", "ਬਿਜਾਈ ਤੋਂ ਪਹਿਲਾਂ ਜ਼ਮੀਨ ਪੱਧਰੀ ਕਰੋ"],
    transplanting: ["ਸਵੇਰੇ ਜਾਂ ਸ਼ਾਮ ਨੂੰ ਲਾਓ", "ਬੂਟੇ ਹੌਲੀ-ਹੌਲੀ ਚੁੱਕੋ", "ਲਾਉਣ ਤੋਂ ਬਾਅਦ ਤੁਰੰਤ ਪਾਣੀ ਦਿਓ"],
    fertilizer: ["ਗਿੱਲੀ ਮਿੱਟੀ ਵਿੱਚ ਖਾਦ ਪਾਓ", "ਮੀਂਹ ਨਾ ਹੋਵੇ ਤਾਂ ਖਾਦ ਦਿਓ", "ਪੱਤਿਆਂ ਤੇ ਖਾਦ ਨਾ ਪਵੇ"],
    organic_input: ["ਗੋਬਰ ਖਾਦ ਚੰਗੀ ਤਰ੍ਹਾਂ ਸੜੀ ਹੋਵੇ", "ਜੀਵਾਮ੍ਰਿਤ ਸਵੇਰੇ ਦਿਓ", "ਜੈਵਿਕ ਪਹਿਲਾਂ, ਰਸਾਇਣਿਕ ਬਾਅਦ"],
    irrigation: ["ਸਵੇਰੇ ਜਾਂ ਸ਼ਾਮ ਪਾਣੀ ਦਿਓ", "ਬਹੁਤਾ ਪਾਣੀ ਨਾ ਦਿਓ", "ਪਾਣੀ ਖੜ੍ਹਾ ਨਾ ਹੋਣ ਦਿਓ"],
    pesticide: ["ਮਾਸਕ ਤੇ ਦਸਤਾਨੇ ਪਾਓ", "ਹਵਾ ਵੱਲ ਸਪਰੇਅ ਨਾ ਕਰੋ", "ਸਪਰੇਅ ਤੋਂ ਬਾਅਦ ਹੱਥ ਧੋਵੋ, ਨਹਾਓ"],
    fungicide: ["ਮਾਸਕ ਲਾਓ", "ਸ਼ਾਮ ਨੂੰ ਛਿੜਕਾਅ ਕਰੋ", "PHI ਦਾ ਪਾਲਣ ਕਰੋ"],
    weeding: ["ਧੁੱਪ ਵਿੱਚ ਟੋਪੀ ਪਾਓ", "ਪਾਣੀ ਪੀਂਦੇ ਰਹੋ", "ਫ਼ਸਲ ਨੂੰ ਨੁਕਸਾਨ ਨਾ ਪਹੁੰਚਾਓ"],
    harvest: ["ਤਿੱਖੇ ਔਜ਼ਾਰ ਸੰਭਾਲੋ", "ਗਰਮੀ ਵਿੱਚ ਆਰਾਮ ਕਰੋ", "ਵਾਢੀ ਸਵੇਰੇ ਕਰੋ"],
    land_preparation: ["ਟਰੈਕਟਰ ਸਾਵਧਾਨੀ ਨਾਲ ਚਲਾਓ", "ਰੂੜੀ ਖਾਦ ਪਹਿਲਾਂ ਪਾਓ", "ਪੱਥਰ ਹਟਾਓ"],
    intercultural: ["ਫ਼ਸਲ ਨੂੰ ਨੁਕਸਾਨ ਨਾ ਪਹੁੰਚਾਓ", "ਅੰਤਰਕਾਸ਼ਤ ਸਮੇਂ ਸਿਰ ਕਰੋ"],
    growth_promoter: ["ਗਿੱਲੇ ਪੱਤਿਆਂ ਤੇ ਸਪਰੇਅ ਨਾ ਕਰੋ", "ਸਵੇਰੇ 7-9 ਵਜੇ ਸਪਰੇਅ ਕਰੋ", "ਸ਼ਾਮ 4-6 ਵਜੇ ਵੀ ਕਰ ਸਕਦੇ ਹੋ"],
  },
  ta: {
    seed_treatment: ["நிழலில் விதை சிகிச்சை செய்", "சிகிச்சை செய்த விதை சாப்பிடாதே", "2 மணி நேரத்தில் விதைக்கவும்"],
    sowing: ["ஈரமான மண்ணில் மட்டும் விதை", "2-3 செ.மீ ஆழத்தில் விதை", "விதைக்கு முன் நிலம் சமப்படுத்து"],
    transplanting: ["காலை அல்லது மாலையில் நடவு செய்", "நாற்றுகளை மெதுவாக கையாள்", "நடவுக்கு பின் உடனே தண்ணீர் கொடு"],
    fertilizer: ["ஈரமான மண்ணில் உரமிடு", "மழை இல்லாத போது உரமிடு", "இலைகளில் உரம் படாமல் பார்"],
    organic_input: ["நன்கு மக்கிய சாணம் பயன்படுத்து", "ஜீவாமிர்தம் காலையில் கொடு", "இயற்கை முதலில், ரசாயனம் பின்"],
    irrigation: ["காலை அல்லது மாலையில் தண்ணீர் பாய்ச்சு", "அதிக தண்ணீர் தவிர்", "தண்ணீர் தேங்காமல் பார்"],
    pesticide: ["முகமூடி மற்றும் கையுறை அணி", "காற்றின் திசையில் தெளிக்காதே", "தெளித்த பிறகு கை கழுவு, குளி"],
    fungicide: ["முகமூடி அணி", "மாலையில் தெளி", "PHI பின்பற்று"],
    weeding: ["வெயிலில் தொப்பி அணி", "நீர் அருந்து", "பயிரை சேதப்படுத்தாதே"],
    harvest: ["கூர்மையான கருவிகளை கவனமாக கையாள்", "வெப்பத்தில் ஓய்வு எடு", "காலையில் அறுவடை செய்"],
    land_preparation: ["டிராக்டர் கவனமாக ஓட்டு", "சாணம் முதலில் போடு", "கற்களை அகற்று"],
    intercultural: ["பயிர் சேதம் தவிர்", "சரியான நேரத்தில் இடைப்பயிர் செய்"],
    growth_promoter: ["ஈரமான இலைகளில் தெளிக்காதே", "காலை 7-9 மணிக்கு தெளி", "மாலை 4-6 மணிக்கும் தெளிக்கலாம்"],
  },
  te: {
    seed_treatment: ["నీడలో విత్తన శుద్ధి చేయి", "శుద్ధి చేసిన విత్తనం తినకు", "2 గంటల్లో విత్తు"],
    sowing: ["తేమ నేలలో మాత్రమే విత్తు", "2-3 సెం.మీ లోతులో విత్తు", "విత్తడానికి ముందు నేల చదును చేయి"],
    transplanting: ["ఉదయం లేదా సాయంత్రం నాటు", "మొక్కలను జాగ్రత్తగా తీసుకో", "నాటిన తర్వాత వెంటనే నీరు పెట్టు"],
    fertilizer: ["తేమ నేలలో ఎరువు వేయి", "వర్షం రానప్పుడు ఎరువు వేయి", "ఆకులపై ఎరువు పడకుండా చూడు"],
    organic_input: ["బాగా కుళ్ళిన పేడ వాడు", "జీవామృతం ఉదయం వేయి", "సేంద్రియం ముందు, రసాయనం తర్వాత"],
    irrigation: ["ఉదయం లేదా సాయంత్రం నీరు పెట్టు", "ఎక్కువ నీరు వద్దు", "నీరు నిలవ కుండా చూడు"],
    pesticide: ["మాస్క్ మరియు గ్లోవ్స్ ధరించు", "గాలి దిశలో స్ప్రే చేయకు", "స్ప్రే తర్వాత చేతులు కడుగు, స్నానం చేయి"],
    fungicide: ["మాస్క్ ధరించు", "సాయంత్రం స్ప్రే చేయి", "PHI పాటించు"],
    weeding: ["ఎండలో టోపీ ధరించు", "నీరు త్రాగుతూ ఉండు", "పంటకు హాని చేయకు"],
    harvest: ["పదునైన పరికరాలను జాగ్రత్తగా వాడు", "వేడిలో విశ్రాంతి తీసుకో", "ఉదయం కోత కోయి"],
    land_preparation: ["ట్రాక్టర్ జాగ్రత్తగా నడుపు", "పేడ ఎరువు ముందు వేయి", "రాళ్లు తీసేయి"],
    intercultural: ["పంటకు హాని చేయకు", "సకాలంలో అంతరసేద్యం చేయి"],
    growth_promoter: ["తడి ఆకులపై స్ప్రే చేయకు", "ఉదయం 7-9 గంటలకు స్ప్రే చేయి", "సాయంత్రం 4-6 గంటలకు కూడా చేయవచ్చు"],
  },
  bn: {
    seed_treatment: ["ছায়ায় বীজ শোধন করো", "শোধিত বীজ খেও না", "২ ঘণ্টায় বপন করো"],
    sowing: ["ভেজা মাটিতেই বপন করো", "২-৩ সে.মি. গভীরতায় বপন করো", "বপনের আগে জমি সমান করো"],
    transplanting: ["সকালে বা সন্ধ্যায় রোপণ করো", "চারা আলতোভাবে ধরো", "রোপণের পর সঙ্গে সঙ্গে জল দাও"],
    fertilizer: ["ভেজা মাটিতে সার দাও", "বৃষ্টি না হলে সার দাও", "পাতায় সার যেন না পড়ে"],
    organic_input: ["ভালো করে পচা গোবর সার ব্যবহার করো", "জীবামৃত সকালে দাও", "জৈব আগে, রাসায়নিক পরে"],
    irrigation: ["সকালে বা সন্ধ্যায় জল দাও", "বেশি জল দিও না", "জল জমতে দিও না"],
    pesticide: ["মাস্ক ও দস্তানা পরো", "বাতাসের দিকে স্প্রে করো না", "স্প্রের পর হাত ধুয়ে স্নান করো"],
    fungicide: ["মাস্ক পরো", "সন্ধ্যায় স্প্রে করো", "PHI মেনে চলো"],
    weeding: ["রোদে টুপি পরো", "জল খেতে থাকো", "ফসলের ক্ষতি করো না"],
    harvest: ["ধারালো যন্ত্রপাতি সাবধানে ধরো", "গরমে বিশ্রাম নাও", "সকালে ফসল কাটো"],
    land_preparation: ["ট্রাক্টর সাবধানে চালাও", "গোবর সার আগে ছড়াও", "পাথর সরাও"],
    intercultural: ["ফসলের ক্ষতি করো না", "সঠিক সময়ে মধ্যচাষ করো"],
    growth_promoter: ["ভেজা পাতায় স্প্রে করো না", "সকাল ৭-৯টায় স্প্রে করো", "বিকেল ৪-৬টায়ও করা যায়"],
  },
  gu: {
    seed_treatment: ["છાયામાં બીજ સારવાર કરો", "સારવાર કરેલ બીજ ખાશો નહીં", "2 કલાકમાં વાવણી કરો"],
    sowing: ["ભીની માટીમાં જ વાવો", "2-3 સેમી ઊંડાઈએ વાવો", "વાવણી પહેલાં જમીન સમતળ કરો"],
    transplanting: ["સવારે કે સાંજે રોપો", "રોપાઓને નાજુકાઈથી ઉઠાવો", "રોપ્યા પછી તરત જ પાણી આપો"],
    fertilizer: ["ભીની માટીમાં ખાતર આપો", "વરસાદ ન હોય ત્યારે ખાતર આપો", "પાંદડા પર ખાતર ન પડે"],
    organic_input: ["સારી રીતે સડેલું છાણ વાપરો", "જીવામૃત સવારે આપો", "જૈવિક પહેલાં, રાસાયણિક પછી"],
    irrigation: ["સવારે કે સાંજે પાણી આપો", "વધારે પાણી ટાળો", "પાણી ભરાવા ન દો"],
    pesticide: ["માસ્ક અને મોજા પહેરો", "પવનની દિશામાં છંટકાવ ન કરો", "છંટકાવ પછી હાથ ધોવો, નહાવો"],
    fungicide: ["માસ્ક પહેરો", "સાંજે છંટકાવ કરો", "PHI અનુસરો"],
    weeding: ["તડકામાં ટોપી પહેરો", "પાણી પીતા રહો", "પાકને નુકસાન ન પહોંચાડો"],
    harvest: ["ધારદાર સાધનો સંભાળો", "ગરમીમાં આરામ કરો", "સવારે લણણી કરો"],
    land_preparation: ["ટ્રેક્ટર સાવધાનીથી ચલાવો", "છાણ ખાતર પહેલાં પાથરો", "પથ્થરો દૂર કરો"],
    intercultural: ["પાકને નુકસાન ન પહોંચાડો", "સમયસર આંતરખેડ કરો"],
    growth_promoter: ["ભીના પાંદડા પર છંટકાવ ન કરો", "સવારે 7-9 વાગે છંટકાવ કરો", "સાંજે 4-6 વાગે પણ કરી શકાય"],
  },
  kn: {
    seed_treatment: ["ನೆರಳಿನಲ್ಲಿ ಬೀಜೋಪಚಾರ ಮಾಡಿ", "ಉಪಚರಿಸಿದ ಬೀಜ ತಿನ್ನಬೇಡಿ", "2 ಗಂಟೆಯಲ್ಲಿ ಬಿತ್ತನೆ ಮಾಡಿ"],
    sowing: ["ಒದ್ದೆ ಮಣ್ಣಿನಲ್ಲಿ ಮಾತ್ರ ಬಿತ್ತಿ", "2-3 ಸೆಂ.ಮೀ ಆಳದಲ್ಲಿ ಬಿತ್ತಿ", "ಬಿತ್ತನೆಗೆ ಮೊದಲು ಭೂಮಿ ಸಮಪಾಟು ಮಾಡಿ"],
    transplanting: ["ಬೆಳಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನಾಟಿ ಮಾಡಿ", "ಸಸಿಗಳನ್ನು ಮೃದುವಾಗಿ ಹಿಡಿಯಿರಿ", "ನಾಟಿ ನಂತರ ತಕ್ಷಣ ನೀರು ಕೊಡಿ"],
    fertilizer: ["ಒದ್ದೆ ಮಣ್ಣಿನಲ್ಲಿ ಗೊಬ್ಬರ ಹಾಕಿ", "ಮಳೆ ಇಲ್ಲದಿರುವಾಗ ಗೊಬ್ಬರ ಹಾಕಿ", "ಎಲೆಗಳ ಮೇಲೆ ಗೊಬ್ಬರ ಬೀಳದಂತೆ ನೋಡಿ"],
    organic_input: ["ಚೆನ್ನಾಗಿ ಕೊಳೆತ ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ ಬಳಸಿ", "ಜೀವಾಮೃತ ಬೆಳಗ್ಗೆ ಕೊಡಿ", "ಸಾವಯವ ಮೊದಲು, ರಾಸಾಯನಿಕ ನಂತರ"],
    irrigation: ["ಬೆಳಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನೀರು ಕೊಡಿ", "ಹೆಚ್ಚು ನೀರು ಬೇಡ", "ನೀರು ನಿಲ್ಲದಂತೆ ನೋಡಿ"],
    pesticide: ["ಮಾಸ್ಕ್ ಮತ್ತು ಕೈಗವಸು ಧರಿಸಿ", "ಗಾಳಿಯ ದಿಕ್ಕಿಗೆ ಸಿಂಪಡಿಸಬೇಡಿ", "ಸಿಂಪಡಣೆ ನಂತರ ಕೈ ತೊಳೆಯಿರಿ, ಸ್ನಾನ ಮಾಡಿ"],
    fungicide: ["ಮಾಸ್ಕ್ ಧರಿಸಿ", "ಸಂಜೆ ಸಿಂಪಡಿಸಿ", "PHI ಅನುಸರಿಸಿ"],
    weeding: ["ಬಿಸಿಲಿನಲ್ಲಿ ಟೊಪ್ಪಿ ಧರಿಸಿ", "ನೀರು ಕುಡಿಯುತ್ತಿರಿ", "ಬೆಳೆಗೆ ಹಾನಿ ಮಾಡಬೇಡಿ"],
    harvest: ["ಚೂಪು ಉಪಕರಣಗಳನ್ನು ಜಾಗ್ರತೆಯಿಂದ ಬಳಸಿ", "ಬಿಸಿಯಲ್ಲಿ ವಿಶ್ರಾಂತಿ ತೆಗೆದುಕೊಳ್ಳಿ", "ಬೆಳಗ್ಗೆ ಕೊಯ್ಲು ಮಾಡಿ"],
    land_preparation: ["ಟ್ರಾಕ್ಟರ್ ಜಾಗ್ರತೆಯಿಂದ ಓಡಿಸಿ", "ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ ಮೊದಲು ಹರಡಿ", "ಕಲ್ಲುಗಳನ್ನು ತೆಗೆಯಿರಿ"],
    intercultural: ["ಬೆಳೆಗೆ ಹಾನಿ ಮಾಡಬೇಡಿ", "ಸಕಾಲದಲ್ಲಿ ಅಂತರ ಬೇಸಾಯ ಮಾಡಿ"],
    growth_promoter: ["ಒದ್ದೆ ಎಲೆಗಳ ಮೇಲೆ ಸಿಂಪಡಿಸಬೇಡಿ", "ಬೆಳಗ್ಗೆ 7-9 ಗಂಟೆಗೆ ಸಿಂಪಡಿಸಿ", "ಸಂಜೆ 4-6 ಗಂಟೆಗೂ ಮಾಡಬಹುದು"],
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
  other: { productMin: 0, laborDays: 0.5, description: "General task" },
};

// ═══════════════════════════════════════════════════════════════════════
// CROP SUITABILITY VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════
interface SuitabilityResult {
  isSuitable: boolean;
  score: number;
  warnings: string[];
  risks: string[];
  alternatives: { crop: string; reason: string; success_rate: number }[];
}

function validateCropSuitability(
  cropName: string,
  land: any,
  currentMonth: number,
  language: string
): SuitabilityResult {
  const cropLower = cropName.toLowerCase();
  const suitability = CROP_SUITABILITY[cropLower];
  
  const warnings: string[] = [];
  const risks: string[] = [];
  let score = 100;
  
  // If no suitability data, allow with warning
  if (!suitability) {
    return {
      isSuitable: true,
      score: 70,
      warnings: [language === "hi" ? `${cropName} की विस्तृत जानकारी उपलब्ध नहीं, सामान्य अनुशंसाएं दी गई हैं` : 
                 language === "mr" ? `${cropName} ची संपूर्ण माहिती उपलब्ध नाही, सामान्य शिफारशी दिल्या आहेत` :
                 `Detailed data for ${cropName} not available, general recommendations provided`],
      risks: [],
      alternatives: [],
    };
  }
  
  const state = land.state || land.district?.split(",").pop()?.trim() || "";
  const soilType = (land.soil_type || "").toLowerCase();
  const soilPh = land.soil_ph || 7.0;
  const irrigationType = (land.irrigation_type || "manual").toLowerCase();
  
  // Check season suitability
  const currentSeason = getCurrentSeason(currentMonth);
  if (!suitability.seasons.includes(currentSeason)) {
    score -= 30;
    const seasonWarning = {
      hi: `${cropName} ${currentSeason === "kharif" ? "खरीफ" : currentSeason === "rabi" ? "रबी" : "गर्मी"} मौसम में उपयुक्त नहीं`,
      mr: `${cropName} ${currentSeason === "kharif" ? "खरीप" : currentSeason === "rabi" ? "रब्बी" : "उन्हाळी"} हंगामात योग्य नाही`,
      en: `${cropName} not ideal for ${currentSeason} season`,
    };
    warnings.push(seasonWarning[language as keyof typeof seasonWarning] || seasonWarning.en);
  }
  
  // Check state suitability
  if (state && !suitability.states_suitable.some(s => state.toLowerCase().includes(s.toLowerCase()))) {
    score -= 15;
    const stateWarning = {
      hi: `${state} में ${cropName} की खेती कम होती है`,
      mr: `${state} मध्ये ${cropName} शेती कमी होते`,
      en: `${cropName} cultivation is less common in ${state}`,
    };
    warnings.push(stateWarning[language as keyof typeof stateWarning] || stateWarning.en);
  }
  
  // Check soil type
  if (soilType && !suitability.soil_types.some(s => soilType.includes(s))) {
    score -= 20;
    const soilWarning = {
      hi: `${soilType} मिट्टी ${cropName} के लिए आदर्श नहीं`,
      mr: `${soilType} माती ${cropName} साठी आदर्श नाही`,
      en: `${soilType} soil is not ideal for ${cropName}`,
    };
    warnings.push(soilWarning[language as keyof typeof soilWarning] || soilWarning.en);
  }
  
  // Check pH
  if (soilPh < suitability.ph_range.min || soilPh > suitability.ph_range.max) {
    score -= 15;
    const phRisk = {
      hi: `मिट्टी का pH ${soilPh} (अनुशंसित: ${suitability.ph_range.min}-${suitability.ph_range.max})`,
      mr: `मातीचा pH ${soilPh} (शिफारशीत: ${suitability.ph_range.min}-${suitability.ph_range.max})`,
      en: `Soil pH ${soilPh} (recommended: ${suitability.ph_range.min}-${suitability.ph_range.max})`,
    };
    risks.push(phRisk[language as keyof typeof phRisk] || phRisk.en);
  }
  
  // Check water availability
  if (suitability.water_requirement === "high" && irrigationType === "rainfed") {
    score -= 25;
    const waterRisk = {
      hi: `${cropName} को अधिक पानी चाहिए, लेकिन सिंचाई उपलब्ध नहीं`,
      mr: `${cropName} ला जास्त पाणी लागते, पण सिंचन उपलब्ध नाही`,
      en: `${cropName} needs more water but irrigation not available`,
    };
    risks.push(waterRisk[language as keyof typeof waterRisk] || waterRisk.en);
  }
  
  // Generate alternatives if score is low
  const alternatives: { crop: string; reason: string; success_rate: number }[] = [];
  if (score < 70) {
    // Find suitable crops for this region/season
    for (const [altCrop, altData] of Object.entries(CROP_SUITABILITY)) {
      if (altCrop === cropLower) continue;
      if (altData.seasons.includes(currentSeason)) {
        if (!state || altData.states_suitable.some(s => state.toLowerCase().includes(s.toLowerCase()))) {
          const reason = {
            hi: `${currentSeason === "kharif" ? "खरीफ" : "रबी"} में उपयुक्त, ${state || "आपके क्षेत्र"} में अच्छी उपज`,
            mr: `${currentSeason === "kharif" ? "खरीप" : "रब्बी"} मध्ये योग्य, ${state || "तुमच्या प्रदेशात"} चांगले उत्पादन`,
            en: `Suitable for ${currentSeason}, good yield in ${state || "your region"}`,
          };
          alternatives.push({
            crop: altCrop.charAt(0).toUpperCase() + altCrop.slice(1),
            reason: reason[language as keyof typeof reason] || reason.en,
            success_rate: 85 + Math.floor(Math.random() * 10),
          });
          if (alternatives.length >= 3) break;
        }
      }
    }
  }
  
  return {
    isSuitable: score >= 50,
    score,
    warnings,
    risks,
    alternatives,
  };
}

function getCurrentSeason(month: number): string {
  // Kharif: June-October (6-10), Rabi: November-March (11-3), Zaid: April-May (4-5)
  if (month >= 6 && month <= 10) return "kharif";
  if (month >= 11 || month <= 3) return "rabi";
  return "zaid";
}

// ═══════════════════════════════════════════════════════════════════════
// COST CALCULATION FUNCTION WITH FULL BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════
interface CostCalculationParams {
  taskCategory: string;
  taskName: string;
  landAcres: number;
  state: string;
  aiProductCost?: number;
  aiLaborCost?: number;
  isMachineWork?: boolean;
  machineryType?: string;
  isSeedTask?: boolean;
  seedCost?: number;
  isFertilizerTask?: boolean;
  fertilizerCost?: number;
  isOrganicTask?: boolean;
  organicCost?: number;
  isGrowthPromoterTask?: boolean;
  growthPromoterCost?: number;
  language?: string;
}

interface CostResult {
  totalCost: number;
  laborCost: number;
  productCost: number;
  laborDays: number;
  sprayingCost: number;
  machineryCost: number;
  breakdown: string;
}

function calculateTaskCostWithValidation(params: CostCalculationParams): CostResult {
  const {
    taskCategory,
    taskName,
    landAcres,
    state,
    aiProductCost = 0,
    aiLaborCost = 0,
    isMachineWork = false,
    machineryType,
    isSeedTask = false,
    seedCost = 0,
    isFertilizerTask = false,
    fertilizerCost = 0,
    isOrganicTask = false,
    organicCost = 0,
    isGrowthPromoterTask = false,
    growthPromoterCost = 0,
    language = "hi",
  } = params;

  const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];
  const categoryConfig = CATEGORY_MIN_COSTS[taskCategory] || CATEGORY_MIN_COSTS["other"];

  // Determine labor category based on work type
  let laborCategory = taskCategory;
  if (taskCategory === "weeding" && isMachineWork) laborCategory = "weeding_chemical";
  if (taskCategory === "weeding" && !isMachineWork) laborCategory = "weeding_manual";
  if (taskCategory === "harvest" && isMachineWork) laborCategory = "harvest_machine";
  if (taskCategory === "harvest" && !isMachineWork) laborCategory = "harvest_manual";
  if (taskCategory === "sowing" && isMachineWork) laborCategory = "sowing_machine";
  if (isOrganicTask) laborCategory = "fym_application";
  if (isGrowthPromoterTask) laborCategory = "growth_promoter";

  // Calculate labor
  const laborReq = ACTIVITY_LABOR[laborCategory] || ACTIVITY_LABOR[taskCategory] || { labor_per_acre: categoryConfig.laborDays };
  const laborDays = laborReq.labor_per_acre * landAcres;
  let laborCost = Math.round(laborDays * laborRate);

  // If AI gave labor cost, use max
  if (aiLaborCost > 0) {
    laborCost = Math.max(laborCost, aiLaborCost);
  }

  // Calculate product cost with category-specific logic
  let productCost = aiProductCost;
  const minProductCost = Math.round(categoryConfig.productMin * landAcres);

  // ORGANIC TASK: Include organic input costs
  if (isOrganicTask && organicCost > 0) {
    productCost = Math.max(productCost, organicCost);
  }

  // GROWTH PROMOTER TASK
  if (isGrowthPromoterTask && growthPromoterCost > 0) {
    productCost = Math.max(productCost, growthPromoterCost);
  }

  // SEED TASK: Must include seed cost
  if (isSeedTask && seedCost > 0) {
    if (taskCategory === "seed_treatment" || taskName.toLowerCase().includes("उपचार") || taskName.toLowerCase().includes("treatment")) {
      const treatmentCost = Math.round(50 * landAcres);
      productCost = seedCost + treatmentCost;
    } else if (taskCategory === "sowing") {
      productCost = seedCost;
    }
  }

  // FERTILIZER TASK
  if (isFertilizerTask && fertilizerCost > 0) {
    productCost = Math.max(productCost, fertilizerCost);
  }

  // Ensure minimum product cost
  if (productCost < minProductCost && minProductCost > 0) {
    productCost = minProductCost;
  }

  // Add spraying cost for pest/disease/growth promoter tasks
  let sprayingCost = 0;
  if (["pest_control", "disease_control", "growth_promoter"].includes(taskCategory)) {
    sprayingCost = Math.round(SPRAYING_COSTS.manual_knapsack * landAcres);
  }

  // Add machinery cost
  let machineryCost = 0;
  if (machineryType && MACHINERY_COSTS[machineryType]) {
    machineryCost = Math.round(MACHINERY_COSTS[machineryType] * landAcres);
  } else if (taskCategory === "land_preparation") {
    machineryCost = Math.round(MACHINERY_COSTS.tractor_plowing * landAcres);
  }

  const totalCost = productCost + laborCost + sprayingCost + machineryCost;

  // Build breakdown string based on language
  const terms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
  let breakdown = "";
  
  const parts: string[] = [];
  if (productCost > 0) parts.push(`${terms.cost}: ₹${productCost}`);
  if (laborDays > 0) parts.push(`${terms.labor} (${laborDays.toFixed(1)} दिन × ₹${laborRate}): ₹${laborCost}`);
  if (sprayingCost > 0) parts.push(`${terms.spray}: ₹${sprayingCost}`);
  if (machineryCost > 0) parts.push(`मशीन: ₹${machineryCost}`);
  
  breakdown = parts.length > 0 ? `${parts.join(" + ")} = कुल: ₹${totalCost}` : `कुल: ₹${totalCost}`;

  return { totalCost, laborCost, productCost, laborDays, sprayingCost, machineryCost, breakdown };
}

function getPrecautionType(category: string, taskName: string): string {
  const nameLower = taskName.toLowerCase();
  
  if (category === "seed_treatment" || nameLower.includes("बीज") || nameLower.includes("बियाणे") || nameLower.includes("seed")) {
    return "seed_treatment";
  }
  if (category === "sowing" || nameLower.includes("बुवाई") || nameLower.includes("पेरणी") || nameLower.includes("sow")) {
    return "sowing";
  }
  if (category === "transplanting" || nameLower.includes("रोप") || nameLower.includes("लाव") || nameLower.includes("transplant")) {
    return "transplanting";
  }
  if (category === "fertilizer" || nameLower.includes("खाद") || nameLower.includes("खत") || nameLower.includes("urea") || nameLower.includes("dap")) {
    return "fertilizer";
  }
  if (nameLower.includes("जैविक") || nameLower.includes("सेंद्रिय") || nameLower.includes("गोबर") || nameLower.includes("शेण") || nameLower.includes("organic") || nameLower.includes("fym") || nameLower.includes("jeevamrut")) {
    return "organic_input";
  }
  if (nameLower.includes("growth") || nameLower.includes("promoter") || nameLower.includes("humic") || nameLower.includes("seaweed") || nameLower.includes("amino")) {
    return "growth_promoter";
  }
  if (category === "pest_control" || nameLower.includes("कीट") || nameLower.includes("किडी") || nameLower.includes("pest") || nameLower.includes("insect")) {
    return "pesticide";
  }
  if (category === "disease_control" || nameLower.includes("फफूंद") || nameLower.includes("बुरशी") || nameLower.includes("fungus") || nameLower.includes("disease")) {
    return "fungicide";
  }
  if (category === "irrigation" || nameLower.includes("पानी") || nameLower.includes("सिंचाई") || nameLower.includes("water") || nameLower.includes("irrigation")) {
    return "irrigation";
  }
  if (category === "weeding" || nameLower.includes("निराई") || nameLower.includes("निंदणी") || nameLower.includes("weed")) {
    return "weeding";
  }
  if (category === "harvest" || nameLower.includes("कटाई") || nameLower.includes("कापणी") || nameLower.includes("harvest")) {
    return "harvest";
  }
  if (category === "land_preparation" || nameLower.includes("जुताई") || nameLower.includes("नांगरणी") || nameLower.includes("plowing")) {
    return "land_preparation";
  }
  
  return "intercultural";
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

    const { landId, cropName, cropVariety, sowingDate, language = "hi", isReadyMadePlant = false } = await req.json();
    const tenantId = req.headers.get("x-tenant-id") || "";
    const farmerId = req.headers.get("x-farmer-id") || "";

    console.log(`🌾 [AI-Schedule] Starting: ${cropName} on ${sowingDate} for land ${landId}`);

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, farmerId, tenantId, "schedule");
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateLimitResult.retryAfter }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch land data
    const { data: land, error: landError } = await supabase
      .from("lands")
      .select("*")
      .eq("id", landId)
      .single();

    if (landError || !land) {
      throw new Error(`Land not found: ${landError?.message}`);
    }

    const languageName = LANGUAGES[language] || "Hindi";
    const langKey = language as keyof typeof ACTIVITY_PRECAUTIONS;
    const ruralTerms = RURAL_TERMS[language] || RURAL_TERMS["hi"];
    const state = land.state || land.district?.split(",").pop()?.trim() || "Maharashtra";
    const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];
    const landAreaHa = land.area_acres * 0.4047;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: VALIDATE CROP SUITABILITY
    // ═══════════════════════════════════════════════════════════════════
    const sowingMonth = new Date(sowingDate).getMonth() + 1;
    const suitabilityCheck = validateCropSuitability(cropName, land, sowingMonth, language);
    
    console.log(`🔍 [Suitability] Score: ${suitabilityCheck.score}, Suitable: ${suitabilityCheck.isSuitable}`);
    
    // If not suitable and score is very low, return warning
    if (!suitabilityCheck.isSuitable && suitabilityCheck.score < 40) {
      return new Response(
        JSON.stringify({
          success: false,
          warning: true,
          suitability: suitabilityCheck,
          message: language === "hi" 
            ? `${cropName} आपकी जमीन और मौसम के लिए उपयुक्त नहीं है।`
            : language === "mr"
            ? `${cropName} तुमच्या जमिनी आणि हंगामासाठी योग्य नाही।`
            : `${cropName} is not suitable for your land and season.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: CALCULATE SEED, FERTILIZER, ORGANIC COSTS
    // ═══════════════════════════════════════════════════════════════════
    const cropLower = cropName.toLowerCase().replace(/\s+/g, "");
    const seedData = SEED_RATES[cropLower] || { rate_kg_per_acre: 10, spacing_cm: "Standard", price_per_kg: 50, treatment: "Trichoderma 4g/kg" };
    const exactSeedQty = Math.round(seedData.rate_kg_per_acre * land.area_acres * 10) / 10;
    const seedCost = Math.round(exactSeedQty * seedData.price_per_kg);

    // NPK calculation
    const target = NPK_TARGETS[cropLower] || NPK_TARGETS["default"];
    const currentN = land.nitrogen_kg_ha || 50;
    const currentP = land.phosphorus_kg_ha || 25;
    const currentK = land.potassium_kg_ha || 25;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // FYM (organic first!)
    const fymTons = Math.round(5 * land.area_acres * 10) / 10; // 5 tons/acre
    const fymCost = Math.round(fymTons * 800);

    // Calculate fertilizers based on NPK deficit (only if needed)
    const ureaKg = Math.round((nDeficit * landAreaHa) / 0.46);
    const dapKg = Math.round((pDeficit * landAreaHa) / 0.46);
    const mopKg = Math.round((kDeficit * landAreaHa) / 0.60);
    const ureaCost = Math.round(ureaKg * FERTILIZER_PRICES.urea.price_per_kg);
    const dapCost = Math.round(dapKg * FERTILIZER_PRICES.dap.price_per_kg);
    const mopCost = Math.round(mopKg * FERTILIZER_PRICES.mop.price_per_kg);
    const totalFertilizerCost = ureaCost + dapCost + mopCost;

    // Growth promoter costs
    const seaweedCost = Math.round(GROWTH_PROMOTERS.seaweed_extract.price * land.area_acres);
    const humicCost = Math.round(GROWTH_PROMOTERS.humic_acid.price * land.area_acres);

    // Irrigation rules
    const irrigationType = land.irrigation_type || "manual";
    const irrigationRules = buildIrrigationRules(irrigationType);
    const soilRecommendations = buildSoilRecommendations(land);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: BUILD COMPREHENSIVE SYSTEM PROMPT
    // ═══════════════════════════════════════════════════════════════════
    const systemPrompt = `You are a senior agricultural expert from India's Krishi Vigyan Kendra with 40+ years of experience working directly with farmers.

═══════════════════════════════════════════════════════════════
🗣️ LANGUAGE RULES (CRITICAL!)
═══════════════════════════════════════════════════════════════
1. Think and plan in English internally
2. Output ALL farmer messages in ${languageName} using PURE RURAL VILLAGE DIALECT
3. NEVER use English agriculture terms! Use local words:
   - "fertilizer" → "${ruralTerms.fertilizer}"
   - "irrigation" → "${ruralTerms.irrigation}"  
   - "pesticide" → "${ruralTerms.pesticide}"
   - "organic" → "${ruralTerms.organic}"
   - "seeds" → "${ruralTerms.seeds}"
   - "sowing" → "${ruralTerms.sowing}"
   - "weeding" → "${ruralTerms.weeding}"
   - "harvesting" → "${ruralTerms.harvesting}"
   - "FYM" → "${ruralTerms.fym}"
   - "cost" → "${ruralTerms.cost}"
   - "labor" → "${ruralTerms.labor}"
4. Keep sentences SHORT and PRACTICAL like a village elder speaks
5. NO formal/bookish language - use spoken village style

═══════════════════════════════════════════════════════════════
🌱 CROP & LAND DETAILS
═══════════════════════════════════════════════════════════════
CROP: ${cropName} ${cropVariety ? `(${cropVariety})` : ""}
LOCATION: ${land.village || ""}, ${land.taluka || ""}, ${land.district || ""}, ${state}
AREA: ${land.area_acres} acres (${landAreaHa.toFixed(2)} hectares)
SOIL: ${land.soil_type || "Black"} | pH: ${land.soil_ph || 7.0} | OC: ${land.organic_carbon_percent || 0.5}%
IRRIGATION: ${irrigationType.toUpperCase()}
PREVIOUS CROP: ${land.previous_crop || "Unknown"}

${suitabilityCheck.warnings.length > 0 ? `⚠️ SUITABILITY WARNINGS:\n${suitabilityCheck.warnings.join("\n")}` : ""}

═══════════════════════════════════════════════════════════════
📋 RECOMMENDATION ORDER (MANDATORY!)
═══════════════════════════════════════════════════════════════
Follow this STRICT order when creating schedule:

(1) 🌿 ORGANIC INPUTS FIRST (Always start with these!)
    • ${ruralTerms.fym}: ${fymTons} tons @ ₹800/ton = ₹${fymCost}
    • जीवामृत/Jeevamrut: ₹50/batch × ${land.area_acres} = ₹${Math.round(50 * land.area_acres)}
    • ${ruralTerms.neem} (pest): ₹280/L × ${land.area_acres} = ₹${Math.round(280 * land.area_acres)}
    • Trichoderma/Pseudomonas (disease): ₹180-200/kg
    • Mulching if possible

(2) 🌱 GROWTH PROMOTERS (After organic, before fertilizers)
    • Seaweed extract: ₹${seaweedCost} (${land.area_acres} acres)
    • Humic acid: ₹${humicCost} (${land.area_acres} acres)
    • Amino acids: ₹${Math.round(520 * land.area_acres)}
    • Use 2-3 times during crop cycle

(3) 💊 FERTILIZERS (ONLY based on soil test deficit!)
    NPK Status: N=${currentN}, P=${currentP}, K=${currentK} kg/ha
    Deficit: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha
    
    CALCULATED DOSES:
    | ${ruralTerms.fertilizer} | Qty | Rate | Cost |
    |-----------|-----|------|------|
    | ${ruralTerms.fym} | ${fymTons} टन | ₹800/टन | ₹${fymCost} |
    | ${ruralTerms.urea} | ${ureaKg} kg | ₹${FERTILIZER_PRICES.urea.price_per_kg}/kg | ₹${ureaCost} |
    | ${ruralTerms.dap} | ${dapKg} kg | ₹${FERTILIZER_PRICES.dap.price_per_kg}/kg | ₹${dapCost} |
    | MOP | ${mopKg} kg | ₹${FERTILIZER_PRICES.mop.price_per_kg}/kg | ₹${mopCost} |
    
    ⚠️ Apply in SPLIT DOSES (2-3 times), not all at once!
    ⚠️ DON'T recommend more than calculated quantity!

(4) ⚠️ PESTICIDES (ONLY IF ABSOLUTELY NECESSARY!)
    First try: Neem oil, Trichoderma, Beauveria, pheromone traps
    If pest/disease crosses Economic Threshold Level (ETL):
    - Mention: Active ingredient + Brand + Dose + PHI days
    - Include: Organic alternative option
    - Warning: Weather conditions, safety precautions
    
    PRICES FOR REFERENCE:
    | Chemical | Price | Dose |
    |----------|-------|------|
    | Imidacloprid 17.8SL | ₹450/250ml | 0.3ml/L |
    | Chlorpyriphos 20EC | ₹380/1L | 2ml/L |
    | Carbendazim 50WP | ₹180/100g | 1g/L |
    | Mancozeb 75WP | ₹320/500g | 2.5g/L |

═══════════════════════════════════════════════════════════════
💰 COST CALCULATION RULES (MANDATORY!)
═══════════════════════════════════════════════════════════════
LABOR RATE (${state}): ₹${laborRate}/day

For EVERY task, calculate:
1. Product/Material cost = Price × Quantity for ${land.area_acres} acres
2. Labor cost = Labor days × ₹${laborRate}
3. Spraying cost (if applicable) = ₹${SPRAYING_COSTS.manual_knapsack} × ${land.area_acres} = ₹${Math.round(SPRAYING_COSTS.manual_knapsack * land.area_acres)}
4. Total = Product + Labor + Spraying

LABOR REQUIREMENTS (per acre):
• ${ruralTerms.sowing}: 0.5 days → ${(0.5 * land.area_acres).toFixed(1)} days = ₹${Math.round(0.5 * land.area_acres * laborRate)}
• ${ruralTerms.transplanting}: 4 days → ${(4 * land.area_acres).toFixed(1)} days = ₹${Math.round(4 * land.area_acres * laborRate)}
• ${ruralTerms.weeding}: 3 days → ${(3 * land.area_acres).toFixed(1)} days = ₹${Math.round(3 * land.area_acres * laborRate)}
• ${ruralTerms.spray}: 0.5 days → ${(0.5 * land.area_acres).toFixed(1)} days = ₹${Math.round(0.5 * land.area_acres * laborRate)}
• ${ruralTerms.harvesting}: 4 days → ${(4 * land.area_acres).toFixed(1)} days = ₹${Math.round(4 * land.area_acres * laborRate)}
• ${ruralTerms.fertilizer} application: 0.3 days → ${(0.3 * land.area_acres).toFixed(1)} days = ₹${Math.round(0.3 * land.area_acres * laborRate)}
• ${ruralTerms.fym} spreading: 1.5 days → ${(1.5 * land.area_acres).toFixed(1)} days = ₹${Math.round(1.5 * land.area_acres * laborRate)}

═══════════════════════════════════════════════════════════════
🌾 SEED DATA
═══════════════════════════════════════════════════════════════
SEED RATE: ${seedData.rate_kg_per_acre} kg/acre
QUANTITY: ${exactSeedQty} kg (for ${land.area_acres} acres)
PRICE: ₹${seedData.price_per_kg}/kg
TOTAL SEED COST: ₹${seedCost}
TREATMENT: ${seedData.treatment}

${isReadyMadePlant ? "⚠️ Ready-made plants - Calculate nursery/seedling cost instead!" : ""}

═══════════════════════════════════════════════════════════════
🚿 IRRIGATION: ${irrigationType.toUpperCase()}
═══════════════════════════════════════════════════════════════
${irrigationRules}

${soilRecommendations}

═══════════════════════════════════════════════════════════════
📝 OUTPUT FORMAT (MANDATORY!)
═══════════════════════════════════════════════════════════════
1. DESCRIPTION: Max 2 lines (40 words). Village-style language.
   Example: "${exactSeedQty} किलो ${ruralTerms.seeds} में ${ruralTerms.fym} मिलाकर बोएं। 2-3 सेमी गहरा बोएं।"

2. INSTRUCTIONS: Max 4 steps. Each step 1 line only.
   Example: ["${exactSeedQty} किलो बीज तौलें", "ट्राइकोडर्मा 4ग्राम/किलो मिलाएं", "2 सेमी गहराई पर बोएं", "बुवाई के बाद पानी दें"]

3. PRECAUTIONS: Max 3 points. Activity-specific!
   ❌ BAD for sowing: "मास्क पहनें" (irrelevant!)
   ✅ GOOD for sowing: "गीली मिट्टी में बोएं", "सही गहराई रखें"

4. COST BREAKDOWN: Show calculation clearly
   Format: "सामग्री ₹X + मजूरी (Y दिन × ₹${laborRate}) ₹Z = कुल ₹Total"`;

    const userPrompt = `Generate complete ${cropName} schedule for ${land.area_acres} acres starting ${sowingDate}.

MUST INCLUDE (in this ORDER):
1. Land preparation with ${ruralTerms.fym} application (₹${fymCost})
2. ${isReadyMadePlant ? "Seedling preparation" : "Seed treatment"} with ₹${seedCost} seeds
3. ${isReadyMadePlant ? ruralTerms.transplanting : ruralTerms.sowing} 
4. Growth promoter application (Seaweed/Humic)
5. ${ruralTerms.fertilizer} applications (split dose): DAP+Urea at sowing, then top-dressing
6. ${ruralTerms.irrigation} schedule based on ${irrigationType}
7. ${ruralTerms.weeding} (2 times minimum)
8. Organic pest/disease management first, then chemical if needed
9. ${ruralTerms.harvesting}

Total 14-18 tasks. Output in ${languageName} rural dialect.

IMPORTANT:
• EVERY task MUST have realistic cost with breakdown
• Use village language, not formal terms
• Follow organic → growth promoter → fertilizer → pesticide order
• Include labor cost in EVERY task`;

    console.log("🤖 [AI] Calling API with comprehensive prompt");

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
              name: "create_crop_schedule",
              description: `Create ${cropName} schedule for ${land.area_acres} acres in ${languageName} rural dialect with accurate costs`,
              parameters: {
                type: "object",
                properties: {
                  crop_name: { type: "string" },
                  total_duration_days: { type: "integer" },
                  expected_yield_quintals: { type: "number" },
                  total_estimated_cost: { type: "number" },
                  total_labor_cost: { type: "number" },
                  total_material_cost: { type: "number" },
                  expected_profit: { type: "number" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task_name: { type: "string", description: "Brief task name in rural dialect (max 5 words)" },
                        category: { 
                          type: "string", 
                          enum: ["land_preparation", "organic_input", "seed_treatment", "sowing", "transplanting", 
                                 "growth_promoter", "fertilizer", "irrigation", "weeding", "pest_control", 
                                 "disease_control", "intercultural", "harvest", "other"],
                        },
                        days_from_sowing: { type: "integer" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        description: { type: "string", description: "Brief village-style description (max 40 words)" },
                        quantity: { type: "string" },
                        product_details: { type: "string" },
                        product_cost: { type: "number" },
                        labor_days: { type: "number" },
                        labor_cost: { type: "number" },
                        spraying_cost: { type: "number" },
                        estimated_cost: { type: "number" },
                        cost_breakdown: { type: "string" },
                        instructions: { type: "array", items: { type: "string" } },
                        precautions: { type: "array", items: { type: "string" } },
                        organic_alternative: { type: "string", description: "Organic alternative for chemical tasks" },
                        weather_dependent: { type: "boolean" },
                        yield_impact: { type: "string" },
                        skip_penalty: { type: "string" },
                      },
                      required: ["task_name", "category", "days_from_sowing", "priority", "description", 
                                 "labor_cost", "estimated_cost", "cost_breakdown", "instructions", "precautions"],
                    },
                  },
                },
                required: ["crop_name", "total_duration_days", "tasks", "total_labor_cost", "total_material_cost"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_crop_schedule" } },
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
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks`);

    if (!scheduleData.tasks?.length) {
      throw new Error("AI returned empty schedule");
    }

    // ═══════════════════════════════════════════════════════════════════
    // POST-PROCESS: Validate and correct costs
    // ═══════════════════════════════════════════════════════════════════
    let totalLaborCost = 0;
    let totalMaterialCost = 0;

    const processedTasks = scheduleData.tasks.map((task: any, idx: number) => {
      const category = task.category || "other";
      const taskName = task.task_name || "";
      
      // Get correct precautions
      const precautionType = getPrecautionType(category, taskName);
      const langPrecautions = ACTIVITY_PRECAUTIONS[langKey] || ACTIVITY_PRECAUTIONS["hi"];
      const activityPrecautions = langPrecautions[precautionType] || langPrecautions["intercultural"];
      
      // Check for generic precautions in non-chemical tasks
      const aiPrecautions = task.precautions || [];
      const hasGenericPrecautions = aiPrecautions.some((p: string) => 
        (p.includes("मास्क") || p.includes("mask") || p.includes("दस्ताने") || p.includes("gloves"))
      );
      
      const isChemicalTask = ["pest_control", "disease_control"].includes(category.toLowerCase()) ||
                            taskName.toLowerCase().includes("कीट") ||
                            taskName.toLowerCase().includes("किडी") ||
                            taskName.toLowerCase().includes("spray") ||
                            taskName.toLowerCase().includes("फवारणी");
      
      let finalPrecautions = aiPrecautions;
      if (!isChemicalTask && hasGenericPrecautions) {
        finalPrecautions = activityPrecautions;
      }

      // Determine task type for cost calculation
      const isSeedTask = category === "seed_treatment" || category === "sowing";
      const isFertilizerTask = category === "fertilizer";
      const isOrganicTask = category === "organic_input" || 
                           taskName.toLowerCase().includes("गोबर") ||
                           taskName.toLowerCase().includes("शेण") ||
                           taskName.toLowerCase().includes("fym") ||
                           taskName.toLowerCase().includes("जैविक");
      const isGrowthPromoterTask = category === "growth_promoter" ||
                                  taskName.toLowerCase().includes("seaweed") ||
                                  taskName.toLowerCase().includes("humic");

      // Calculate individual costs
      let taskFertilizerCost = 0;
      let taskOrganicCost = 0;
      let taskGrowthPromoterCost = 0;
      
      if (isOrganicTask) {
        taskOrganicCost = fymCost;
      }
      
      if (isGrowthPromoterTask) {
        taskGrowthPromoterCost = seaweedCost;
      }
      
      if (isFertilizerTask) {
        const desc = (task.description || "").toLowerCase() + taskName.toLowerCase();
        if (desc.includes("dap") || desc.includes("फॉस्फेट")) {
          taskFertilizerCost = dapCost;
        } else if (desc.includes("urea") || desc.includes("यूरिया")) {
          taskFertilizerCost = ureaCost;
        } else if (desc.includes("mop") || desc.includes("पोटाश")) {
          taskFertilizerCost = mopCost;
        } else {
          taskFertilizerCost = Math.round(totalFertilizerCost / 3);
        }
      }

      // Calculate validated costs
      const costResult = calculateTaskCostWithValidation({
        taskCategory: category,
        taskName,
        landAcres: land.area_acres,
        state,
        aiProductCost: task.product_cost || 0,
        aiLaborCost: task.labor_cost || 0,
        isMachineWork: category === "land_preparation" || (task.product_details || "").includes("machine"),
        isSeedTask,
        seedCost: isSeedTask ? seedCost : 0,
        isFertilizerTask,
        fertilizerCost: taskFertilizerCost,
        isOrganicTask,
        organicCost: taskOrganicCost,
        isGrowthPromoterTask,
        growthPromoterCost: taskGrowthPromoterCost,
        language,
      });

      totalLaborCost += costResult.laborCost;
      totalMaterialCost += costResult.productCost;

      return {
        ...task,
        precautions: finalPrecautions.slice(0, 3),
        product_cost: costResult.productCost,
        labor_cost: costResult.laborCost,
        labor_days: costResult.laborDays,
        spraying_cost: costResult.sprayingCost,
        machinery_cost: costResult.machineryCost,
        estimated_cost: costResult.totalCost,
        cost_breakdown: costResult.breakdown,
      };
    });

    const correctedTotalCost = totalLaborCost + totalMaterialCost;

    // Save schedule to database with training-data ready format
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        // Core identification
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: cropName,
        crop_variety: cropVariety || cropName,
        sowing_date: sowingDate,
        expected_harvest_date: scheduleData.harvest_date,
        
        // Cost breakdown (training: predicted costs)
        total_estimated_cost: correctedTotalCost,
        total_labor_cost: totalLaborCost,
        total_material_cost: totalMaterialCost,
        expected_yield_quintals: scheduleData.expected_yield_quintals,
        expected_profit: scheduleData.expected_profit || (scheduleData.expected_yield_quintals * 2500 - correctedTotalCost),
        
        // Generation metadata
        ai_model: AI_CONFIG.MODEL,
        is_active: true,
        status: "active",
        generation_language: language,
        calculated_for_area_acres: landAreaAcres,
        total_duration_days: scheduleData.total_duration_days,
        
        // Fertilizer/seed data (training: input quantities)
        seed_quantity_kg: exactSeedQty,
        fertilizer_n_kg: ureaKg * 0.46,
        fertilizer_p_kg: dapKg * 0.46,
        fertilizer_k_kg: mopKg * 0.60,
        organic_manure_kg: fymTons * 1000,
        
        // Training-specific fields
        suitability_score: suitabilityCheck.score,
        suitability_warnings: suitabilityCheck.warnings || [],
        recommendation_order: "organic → growth_promoter → fertilizer → pesticide",
        state_region: state,
        labor_rate_used: laborRate,
        agro_climatic_zone: land?.agro_climatic_zone || null,
        
        // Input context for training (what the model saw)
        input_soil_data: land?.soil_data || null,
        input_weather_data: scheduleData.weather_context || null,
        input_land_coordinates: land?.boundary_coordinates ? { 
          lat: land.latitude, 
          lng: land.longitude,
          boundary: land.boundary_coordinates 
        } : null,
        
        // Metadata for extended training context
        metadata: {
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          fertilizer_data: { urea_kg: ureaKg, dap_kg: dapKg, mop_kg: mopKg, fym_tons: fymTons, total_cost: totalFertilizerCost + fymCost },
          labor_rate_source: "MGNREGA_2024_25",
          pricing_date: new Date().toISOString().split("T")[0],
          ai_version: AI_CONFIG.MODEL,
          generation_timestamp: new Date().toISOString(),
        },
        
        // Training pipeline flags
        is_training_candidate: true,
        training_processed: false,
        tasks_total_count: processedTasks.length,
        tasks_completed_count: 0,
        tasks_on_time_count: 0,
        
        // Generation params (legacy)
        generation_params: {
          suitability_score: suitabilityCheck.score,
          labor_rate: laborRate,
          state,
          recommendation_order: "organic → growth_promoter → fertilizer → pesticide",
        },
      })
      .select()
      .single();

    if (scheduleError) {
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    // Save tasks
    const tasksToInsert = processedTasks.map((task: any, idx: number) => ({
      schedule_id: savedSchedule.id,
      farmer_id: farmerId,
      tenant_id: tenantId,
      task_name: task.task_name,
      category: task.category,
      scheduled_date: new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      days_from_sowing: task.days_from_sowing,
      priority: task.priority,
      description: task.description,
      instructions: task.instructions,
      precautions: task.precautions,
      weather_dependent: task.weather_dependent,
      status: "pending",
      sequence_order: idx + 1,
      resources: {
        quantity: task.quantity,
        product_details: task.product_details,
        product_cost: task.product_cost,
        labor_days: task.labor_days,
        labor_cost: task.labor_cost,
        spraying_cost: task.spraying_cost,
        machinery_cost: task.machinery_cost,
        cost_breakdown: task.cost_breakdown,
        organic_alternative: task.organic_alternative,
        yield_impact: task.yield_impact,
        skip_penalty: task.skip_penalty,
      },
      estimated_cost: task.estimated_cost,
      currency: "INR",
    }));

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
        cropName,
        sowingDate,
        suitability: suitabilityCheck,
        totalTasks: processedTasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: correctedTotalCost,
        totalLaborCost,
        totalMaterialCost,
        expectedProfit: scheduleData.expected_profit,
        seedData: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
        organicData: { fym: fymTons, cost: fymCost },
        fertilizerData: { urea: ureaKg, dap: dapKg, mop: mopKg, total: totalFertilizerCost },
        laborRate,
        state,
        language,
        executionTimeMs: executionTime,
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

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════
function buildIrrigationRules(irrigationType: string): string {
  const rules: Record<string, string> = {
    drip: `DRIP IRRIGATION
✅ Fertigation possible - dissolve water-soluble fertilizers
✅ Daily small doses, calculate L/plant/day
⚠️ Check emitters weekly`,

    sprinkler: `SPRINKLER SYSTEM
✅ Good for standing crops
⚠️ Avoid during flowering (fungal risk)
⚠️ Don't spray chemicals same day`,

    manual: `MANUAL IRRIGATION (NO drip/sprinkler!)
✅ Use: Flood irrigation, furrow, ring basin
✅ Calculate liters per irrigation
⚠️ Irrigate morning or evening only
❌ DON'T recommend drip/sprinkler tasks!`,

    well: `WELL-BASED SYSTEM
✅ Plan around electricity timing
✅ Use pump efficiently
⚠️ Don't over-irrigate`,

    canal: `CANAL WATER
⚠️ Water depends on rotation schedule
✅ Plan tasks around canal days
✅ Store water if possible`,

    rainfed: `RAINFED (NO IRRIGATION!)
❌ DO NOT include irrigation tasks!
✅ Focus on: Mulching, rainwater harvesting
✅ Drought-tolerant varieties
✅ In-situ moisture conservation`,
  };

  return rules[irrigationType] || rules["manual"];
}

function buildSoilRecommendations(land: any): string {
  const recs: string[] = [];

  if (land.soil_ph) {
    if (land.soil_ph < 6.0) {
      recs.push(`⚠️ ACIDIC SOIL (pH ${land.soil_ph}): Apply lime 2-4 quintals/acre @ ₹8/kg`);
    } else if (land.soil_ph > 7.8) {
      recs.push(`⚠️ ALKALINE SOIL (pH ${land.soil_ph}): Apply gypsum 3-4 quintals/acre @ ₹5/kg`);
    }
  }

  if (land.organic_carbon_percent && land.organic_carbon_percent < 0.5) {
    recs.push(`⚠️ LOW ORGANIC CARBON (${land.organic_carbon_percent}%): Add extra FYM 2-3 tons/acre`);
  }

  if (land.previous_crop) {
    const legumes = ["soybean", "groundnut", "moong", "urad", "gram", "tur", "चना", "मूंग", "उडीद"];
    if (legumes.some(l => land.previous_crop.toLowerCase().includes(l))) {
      recs.push(`✅ Previous legume (${land.previous_crop}): Reduce nitrogen by 20-25%`);
    }
  }

  return recs.length > 0 ? "\n═══════════════════════════════════════════════════════════════\n🌍 SOIL AMENDMENTS\n═══════════════════════════════════════════════════════════════\n" + recs.join("\n") : "";
}
