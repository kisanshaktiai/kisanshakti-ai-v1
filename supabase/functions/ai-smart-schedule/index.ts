import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id",
};

// Language mapping
const LANGUAGES: Record<string, string> = {
  hi: "Hindi", mr: "Marathi", pa: "Punjabi", ta: "Tamil",
  te: "Telugu", bn: "Bengali", gu: "Gujarati", kn: "Kannada", en: "English",
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
// STANDARD FERTILIZER PRICES (2024-25 MRP in ₹)
// ═══════════════════════════════════════════════════════════════════════
const FERTILIZER_PRICES: Record<string, { price_per_kg: number; bag_kg: number }> = {
  urea: { price_per_kg: 5.92, bag_kg: 45 },           // ₹266.50/45kg (subsidized)
  dap: { price_per_kg: 27, bag_kg: 50 },              // ₹1350/50kg
  mop: { price_per_kg: 17.5, bag_kg: 50 },            // ₹875/50kg
  ssp: { price_per_kg: 8, bag_kg: 50 },               // ₹400/50kg
  "10-26-26": { price_per_kg: 27.5, bag_kg: 50 },     // ₹1375/50kg
  "12-32-16": { price_per_kg: 29, bag_kg: 50 },       // ₹1450/50kg
  fym: { price_per_kg: 0.8, bag_kg: 1000 },           // ₹800/ton
  vermicompost: { price_per_kg: 8, bag_kg: 50 },      // ₹400/50kg
  zinc_sulphate: { price_per_kg: 85, bag_kg: 25 },    // ₹2125/25kg
  borax: { price_per_kg: 120, bag_kg: 25 },           // ₹3000/25kg
};

// ═══════════════════════════════════════════════════════════════════════
// STANDARD CHEMICAL/PESTICIDE PRICES (2024-25 Market Rates in ₹)
// ═══════════════════════════════════════════════════════════════════════
const CHEMICAL_PRICES: Record<string, { price: number; unit: string; coverage_acre: number; type: string }> = {
  // Insecticides
  "imidacloprid_17.8sl": { price: 450, unit: "250ml", coverage_acre: 1, type: "insecticide" },
  "chlorpyriphos_20ec": { price: 380, unit: "1L", coverage_acre: 2, type: "insecticide" },
  "thiamethoxam_25wg": { price: 650, unit: "100g", coverage_acre: 1, type: "insecticide" },
  "acetamiprid_20sp": { price: 280, unit: "100g", coverage_acre: 1, type: "insecticide" },
  "lambda_cyhalothrin_5ec": { price: 420, unit: "500ml", coverage_acre: 1, type: "insecticide" },
  "emamectin_benzoate_5sg": { price: 450, unit: "100g", coverage_acre: 1, type: "insecticide" },
  
  // Fungicides
  "carbendazim_50wp": { price: 180, unit: "100g", coverage_acre: 1, type: "fungicide" },
  "mancozeb_75wp": { price: 320, unit: "500g", coverage_acre: 1, type: "fungicide" },
  "copper_oxychloride_50wp": { price: 380, unit: "500g", coverage_acre: 1, type: "fungicide" },
  "propiconazole_25ec": { price: 680, unit: "250ml", coverage_acre: 1, type: "fungicide" },
  "tricyclazole_75wp": { price: 550, unit: "120g", coverage_acre: 1, type: "fungicide" },
  "hexaconazole_5ec": { price: 380, unit: "250ml", coverage_acre: 1, type: "fungicide" },
  
  // Herbicides
  "glyphosate_41sl": { price: 480, unit: "1L", coverage_acre: 1, type: "herbicide" },
  "2_4_d_amine_58sl": { price: 350, unit: "1L", coverage_acre: 2, type: "herbicide" },
  "pendimethalin_30ec": { price: 580, unit: "1L", coverage_acre: 1, type: "herbicide" },
  "atrazine_50wp": { price: 280, unit: "500g", coverage_acre: 1, type: "herbicide" },
  "paraquat_24sl": { price: 420, unit: "1L", coverage_acre: 1, type: "herbicide" },
  
  // Bio-pesticides
  "neem_oil": { price: 280, unit: "1L", coverage_acre: 1, type: "bio" },
  "beauveria_bassiana": { price: 220, unit: "1kg", coverage_acre: 1, type: "bio" },
  "trichoderma_viride": { price: 180, unit: "1kg", coverage_acre: 1, type: "bio" },
  
  // Generic rates for AI calculation
  "generic_insecticide": { price: 400, unit: "1L", coverage_acre: 1, type: "insecticide" },
  "generic_fungicide": { price: 350, unit: "500g", coverage_acre: 1, type: "fungicide" },
  "generic_herbicide": { price: 450, unit: "1L", coverage_acre: 1, type: "herbicide" },
};

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY-WISE LABOR REQUIREMENTS (person-days per acre)
// ═══════════════════════════════════════════════════════════════════════
const ACTIVITY_LABOR: Record<string, { labor_per_acre: number; description_en: string }> = {
  land_preparation: { labor_per_acre: 0, description_en: "Tractor/machine work" },
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
  intercultural: { labor_per_acre: 1, description_en: "Intercultural operations" },
  harvest_manual: { labor_per_acre: 4, description_en: "Manual harvesting" },
  harvest_machine: { labor_per_acre: 0.5, description_en: "Machine harvesting" },
  post_harvest: { labor_per_acre: 2, description_en: "Threshing/cleaning" },
};

// ═══════════════════════════════════════════════════════════════════════
// SPRAYING & MACHINERY COSTS (₹ per acre)
// ═══════════════════════════════════════════════════════════════════════
const SPRAYING_COSTS: Record<string, number> = {
  manual_knapsack: 150,   // Farmer's own sprayer
  power_sprayer: 300,     // Hired power sprayer
  tractor_mounted: 500,   // Large area
  drone_spray: 400,       // Emerging tech
};

const MACHINERY_COSTS: Record<string, number> = {
  tractor_plowing: 1500,       // Per acre
  tractor_rotavator: 1200,     // Per acre
  seed_drill: 800,             // Per acre
  combine_harvester: 2500,     // Per acre
  thresher: 600,               // Per quintal
  transplanter: 1500,          // Per acre
};

// ═══════════════════════════════════════════════════════════════════════
// VERIFIED SEED RATES (kg/acre) - ICAR & State Agri Dept Data
// ═══════════════════════════════════════════════════════════════════════
const SEED_RATES: Record<string, { rate_kg_per_acre: number; spacing_cm: string; price_per_kg: number; treatment: string }> = {
  wheat: { rate_kg_per_acre: 40, spacing_cm: "22.5 row spacing", price_per_kg: 35, treatment: "Thiram @ 2.5g/kg" },
  rice: { rate_kg_per_acre: 20, spacing_cm: "20x15 cm", price_per_kg: 45, treatment: "Carbendazim @ 2g/kg" },
  cotton: { rate_kg_per_acre: 1.5, spacing_cm: "90x60 cm", price_per_kg: 850, treatment: "Imidacloprid @ 5g/kg" },
  soybean: { rate_kg_per_acre: 30, spacing_cm: "45x5 cm", price_per_kg: 90, treatment: "Thiram+Carbendazim @ 2+1g/kg" },
  maize: { rate_kg_per_acre: 8, spacing_cm: "60x20 cm", price_per_kg: 350, treatment: "Thiram @ 3g/kg" },
  sugarcane: { rate_kg_per_acre: 0, spacing_cm: "90x30 cm", price_per_kg: 0, treatment: "Carbendazim dip" },
  groundnut: { rate_kg_per_acre: 50, spacing_cm: "30x10 cm", price_per_kg: 80, treatment: "Thiram @ 3g/kg + Rhizobium" },
  tomato: { rate_kg_per_acre: 0.15, spacing_cm: "60x45 cm", price_per_kg: 3500, treatment: "Trichoderma @ 4g/kg" },
  onion: { rate_kg_per_acre: 4, spacing_cm: "15x10 cm", price_per_kg: 1200, treatment: "Thiram @ 2g/kg" },
  potato: { rate_kg_per_acre: 800, spacing_cm: "60x20 cm", price_per_kg: 25, treatment: "Mancozeb dip" },
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
  default: { n: 100, p: 50, k: 40 },
};

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY-SPECIFIC PRECAUTIONS (All 9 Languages)
// ═══════════════════════════════════════════════════════════════════════
const ACTIVITY_PRECAUTIONS: Record<string, Record<string, string[]>> = {
  mr: {
    seed_treatment: ["बियाणे उपचार सावलीत करा", "उपचारित बियाणे खाऊ नका", "2 तासात पेरणी करा"],
    sowing: ["ओलसर जमिनीतच पेरा", "योग्य खोलीवर पेरा (2-3 सेमी)", "पेरणी यंत्र स्वच्छ करा"],
    transplanting: ["सकाळी किंवा संध्याकाळी लावा", "रोपे हलक्या हाताने हाताळा", "लगेच पाणी द्या"],
    fertilizer: ["खत ओलसर जमिनीत द्या", "संध्याकाळी खत द्या", "खताला पाण्याचा थेट संपर्क टाळा"],
    irrigation: ["सकाळी लवकर किंवा संध्याकाळी पाणी द्या", "साचलेले पाणी काढून टाका", "जास्त पाणी टाळा"],
    pesticide: ["मास्क व हातमोजे अनिवार्य", "वाऱ्याच्या दिशेने फवारणी टाळा", "फवारणीनंतर हात धुवा"],
    fungicide: ["मास्क घाला", "संध्याकाळी फवारणी करा", "PHI पाळा"],
    weeding: ["उन्हात टोपी घाला", "पाणी पिण्यास विश्रांती घ्या", "यंत्र वापरताना सावधान"],
    harvest: ["धारदार अवजारे सांभाळा", "उष्णतेत विश्रांती घ्या", "कापणी यंत्र सुरक्षितपणे वापरा"],
    land_preparation: ["ट्रॅक्टर चालवताना सावधान", "नांगरणी एकसमान करा", "दगड काढून टाका"],
    intercultural: ["पिकाला इजा करू नका", "तणनाशक पिकावर पडणार नाही याची काळजी घ्या"],
  },
  hi: {
    seed_treatment: ["बीज उपचार छाया में करें", "उपचारित बीज खाने से बचें", "2 घंटे में बुवाई करें"],
    sowing: ["नम मिट्टी में ही बोएं", "सही गहराई पर बोएं (2-3 सेमी)", "बुवाई यंत्र साफ करें"],
    transplanting: ["सुबह या शाम को लगाएं", "पौधे नाजुकी से उठाएं", "तुरंत पानी दें"],
    fertilizer: ["खाद नम मिट्टी में डालें", "शाम को खाद दें", "खाद को पानी से सीधे संपर्क से बचाएं"],
    irrigation: ["सुबह जल्दी या शाम को पानी दें", "जमा पानी निकालें", "अधिक पानी से बचें"],
    pesticide: ["मास्क और दस्ताने अनिवार्य", "हवा की दिशा में छिड़काव न करें", "छिड़काव के बाद हाथ धोएं"],
    fungicide: ["मास्क पहनें", "शाम को छिड़काव करें", "PHI का पालन करें"],
    weeding: ["धूप में टोपी पहनें", "पानी पीते रहें", "यंत्र से सावधान"],
    harvest: ["धारदार औजार संभालें", "गर्मी में आराम करें", "मशीन सुरक्षित चलाएं"],
    land_preparation: ["ट्रैक्टर चलाते समय सावधान", "जुताई समान करें", "पत्थर हटाएं"],
    intercultural: ["फसल को नुकसान न पहुंचाएं", "खरपतवारनाशी फसल पर न गिरे"],
  },
  en: {
    seed_treatment: ["Treat seeds in shade", "Don't eat treated seeds", "Sow within 2 hours"],
    sowing: ["Sow in moist soil only", "Maintain proper depth (2-3cm)", "Clean sowing equipment"],
    transplanting: ["Transplant in morning/evening", "Handle seedlings gently", "Water immediately after"],
    fertilizer: ["Apply in moist soil", "Apply in evening", "Avoid direct water contact"],
    irrigation: ["Irrigate early morning or evening", "Drain excess water", "Avoid waterlogging"],
    pesticide: ["Wear mask and gloves", "Don't spray against wind", "Wash hands after spraying"],
    fungicide: ["Wear mask", "Spray in evening", "Follow PHI strictly"],
    weeding: ["Wear hat in sun", "Stay hydrated", "Be careful with tools"],
    harvest: ["Handle sharp tools carefully", "Take breaks in heat", "Operate machinery safely"],
    land_preparation: ["Drive tractor carefully", "Ensure uniform plowing", "Remove stones"],
    intercultural: ["Avoid crop damage", "Keep herbicide away from crop"],
  },
  pa: {
    seed_treatment: ["ਬੀਜ ਛਾਂ ਵਿੱਚ ਉਪਚਾਰ ਕਰੋ", "ਉਪਚਾਰਿਤ ਬੀਜ ਨਾ ਖਾਓ", "2 ਘੰਟੇ ਵਿੱਚ ਬਿਜਾਈ ਕਰੋ"],
    sowing: ["ਗਿੱਲੀ ਮਿੱਟੀ ਵਿੱਚ ਹੀ ਬੀਜੋ", "ਸਹੀ ਡੂੰਘਾਈ ਤੇ ਬੀਜੋ", "ਬਿਜਾਈ ਮਸ਼ੀਨ ਸਾਫ਼ ਕਰੋ"],
    transplanting: ["ਸਵੇਰੇ ਜਾਂ ਸ਼ਾਮ ਨੂੰ ਲਾਓ", "ਬੂਟੇ ਧਿਆਨ ਨਾਲ ਚੁੱਕੋ", "ਤੁਰੰਤ ਪਾਣੀ ਦਿਓ"],
    fertilizer: ["ਖਾਦ ਗਿੱਲੀ ਮਿੱਟੀ ਵਿੱਚ ਪਾਓ", "ਸ਼ਾਮ ਨੂੰ ਖਾਦ ਦਿਓ", "ਖਾਦ ਨੂੰ ਪਾਣੀ ਤੋਂ ਬਚਾਓ"],
    irrigation: ["ਸਵੇਰੇ ਜਾਂ ਸ਼ਾਮ ਪਾਣੀ ਦਿਓ", "ਖੜਾ ਪਾਣੀ ਕੱਢੋ", "ਬਹੁਤਾ ਪਾਣੀ ਨਾ ਦਿਓ"],
    pesticide: ["ਮਾਸਕ ਤੇ ਦਸਤਾਨੇ ਪਾਓ", "ਹਵਾ ਵੱਲ ਸਪਰੇਅ ਨਾ ਕਰੋ", "ਸਪਰੇਅ ਤੋਂ ਬਾਅਦ ਹੱਥ ਧੋਵੋ"],
    fungicide: ["ਮਾਸਕ ਲਾਓ", "ਸ਼ਾਮ ਨੂੰ ਛਿੜਕਾਅ ਕਰੋ", "PHI ਦਾ ਪਾਲਣ ਕਰੋ"],
    weeding: ["ਧੁੱਪ ਵਿੱਚ ਟੋਪੀ ਪਾਓ", "ਪਾਣੀ ਪੀਂਦੇ ਰਹੋ", "ਔਜ਼ਾਰਾਂ ਤੋਂ ਸਾਵਧਾਨ"],
    harvest: ["ਤਿੱਖੇ ਔਜ਼ਾਰ ਸੰਭਾਲੋ", "ਗਰਮੀ ਵਿੱਚ ਆਰਾਮ ਕਰੋ", "ਮਸ਼ੀਨ ਸੁਰੱਖਿਅਤ ਚਲਾਓ"],
    land_preparation: ["ਟਰੈਕਟਰ ਸਾਵਧਾਨੀ ਨਾਲ ਚਲਾਓ", "ਵਾਹੀ ਬਰਾਬਰ ਕਰੋ", "ਪੱਥਰ ਹਟਾਓ"],
    intercultural: ["ਫ਼ਸਲ ਨੂੰ ਨੁਕਸਾਨ ਨਾ ਪਹੁੰਚਾਓ", "ਨਦੀਨਨਾਸ਼ਕ ਫ਼ਸਲ ਤੇ ਨਾ ਪਵੇ"],
  },
  ta: {
    seed_treatment: ["நிழலில் விதை சிகிச்சை செய்யுங்கள்", "சிகிச்சை செய்த விதைகளை சாப்பிடாதீர்கள்", "2 மணி நேரத்தில் விதைக்கவும்"],
    sowing: ["ஈரமான மண்ணில் மட்டும் விதைக்கவும்", "சரியான ஆழத்தில் விதைக்கவும்", "விதைப்பு இயந்திரத்தை சுத்தம் செய்யுங்கள்"],
    transplanting: ["காலை அல்லது மாலையில் நடவு செய்யுங்கள்", "நாற்றுகளை மெதுவாக கையாளுங்கள்", "உடனே தண்ணீர் கொடுங்கள்"],
    fertilizer: ["ஈரமான மண்ணில் உரமிடுங்கள்", "மாலையில் உரமிடுங்கள்", "உரத்தை நேரடி நீர் தொடர்பிலிருந்து காப்பாற்றுங்கள்"],
    irrigation: ["காலை அல்லது மாலையில் நீர்ப்பாசனம்", "தேங்கிய நீரை வெளியேற்றுங்கள்", "அதிக நீர் தவிர்க்கவும்"],
    pesticide: ["முகமூடி மற்றும் கையுறை அணியுங்கள்", "காற்றின் திசையில் தெளிக்காதீர்கள்", "தெளித்த பிறகு கைகளை கழுவுங்கள்"],
    fungicide: ["முகமூடி அணியுங்கள்", "மாலையில் தெளியுங்கள்", "PHI பின்பற்றுங்கள்"],
    weeding: ["வெயிலில் தொப்பி அணியுங்கள்", "நீர் அருந்துங்கள்", "கருவிகளை கவனமாக பயன்படுத்துங்கள்"],
    harvest: ["கூர்மையான கருவிகளை கவனமாக கையாளுங்கள்", "வெப்பத்தில் ஓய்வு எடுங்கள்", "இயந்திரங்களை பாதுகாப்பாக இயக்குங்கள்"],
    land_preparation: ["டிராக்டரை கவனமாக ஓட்டுங்கள்", "சீரான உழவு செய்யுங்கள்", "கற்களை அகற்றுங்கள்"],
    intercultural: ["பயிரை சேதப்படுத்தாதீர்கள்", "களைக்கொல்லி பயிரில் படாமல் பார்க்கவும்"],
  },
  te: {
    seed_treatment: ["నీడలో విత్తన శుద్ధి చేయండి", "శుద్ధి చేసిన విత్తనాలు తినకండి", "2 గంటల్లో విత్తండి"],
    sowing: ["తేమ నేలలో మాత్రమే విత్తండి", "సరైన లోతులో విత్తండి", "విత్తన యంత్రం శుభ్రం చేయండి"],
    transplanting: ["ఉదయం లేదా సాయంత్రం నాటండి", "మొక్కలను జాగ్రత్తగా తీసుకోండి", "వెంటనే నీరు ఇవ్వండి"],
    fertilizer: ["తేమ నేలలో ఎరువు వేయండి", "సాయంత్రం ఎరువు వేయండి", "ఎరువును నేరుగా నీటి నుండి కాపాడండి"],
    irrigation: ["ఉదయం లేదా సాయంత్రం నీరు ఇవ్వండి", "నిలిచిన నీటిని తీసేయండి", "ఎక్కువ నీరు వద్దు"],
    pesticide: ["మాస్క్ మరియు గ్లోవ్స్ ధరించండి", "గాలి దిశలో స్ప్రే చేయకండి", "స్ప్రే తర్వాత చేతులు కడగండి"],
    fungicide: ["మాస్క్ ధరించండి", "సాయంత్రం స్ప్రే చేయండి", "PHI పాటించండి"],
    weeding: ["ఎండలో టోపీ ధరించండి", "నీరు త్రాగుతూ ఉండండి", "పరికరాలతో జాగ్రత్త"],
    harvest: ["పదునైన పరికరాలను జాగ్రత్తగా వాడండి", "వేడిలో విశ్రాంతి తీసుకోండి", "యంత్రాలను సురక్షితంగా నడపండి"],
    land_preparation: ["ట్రాక్టర్ జాగ్రత్తగా నడపండి", "సమానంగా దున్నండి", "రాళ్లు తీసేయండి"],
    intercultural: ["పంటకు హాని చేయకండి", "కలుపు మందు పంటపై పడకుండా చూడండి"],
  },
  bn: {
    seed_treatment: ["ছায়ায় বীজ শোধন করুন", "শোধিত বীজ খাবেন না", "২ ঘণ্টায় বপন করুন"],
    sowing: ["ভেজা মাটিতেই বপন করুন", "সঠিক গভীরতায় বপন করুন", "বীজ যন্ত্র পরিষ্কার করুন"],
    transplanting: ["সকালে বা সন্ধ্যায় রোপণ করুন", "চারা আলতোভাবে ধরুন", "সঙ্গে সঙ্গে জল দিন"],
    fertilizer: ["ভেজা মাটিতে সার দিন", "সন্ধ্যায় সার দিন", "সার সরাসরি জলের সংস্পর্শ থেকে বাঁচান"],
    irrigation: ["সকালে বা সন্ধ্যায় জল দিন", "জমা জল বের করুন", "বেশি জল দেবেন না"],
    pesticide: ["মাস্ক ও দস্তানা পরুন", "বাতাসের দিকে স্প্রে করবেন না", "স্প্রে-র পর হাত ধুয়ে নিন"],
    fungicide: ["মাস্ক পরুন", "সন্ধ্যায় স্প্রে করুন", "PHI মেনে চলুন"],
    weeding: ["রোদে টুপি পরুন", "জল খেতে থাকুন", "যন্ত্রপাতি সাবধানে ব্যবহার করুন"],
    harvest: ["ধারালো যন্ত্রপাতি সাবধানে ধরুন", "গরমে বিশ্রাম নিন", "যন্ত্র নিরাপদে চালান"],
    land_preparation: ["ট্রাক্টর সাবধানে চালান", "সমান চাষ করুন", "পাথর সরান"],
    intercultural: ["ফসলের ক্ষতি করবেন না", "আগাছানাশক ফসলে পড়তে দেবেন না"],
  },
  gu: {
    seed_treatment: ["છાયામાં બીજ સારવાર કરો", "સારવાર કરેલ બીજ ખાશો નહીં", "2 કલાકમાં વાવણી કરો"],
    sowing: ["ભીની માટીમાં જ વાવો", "યોગ્ય ઊંડાઈએ વાવો", "વાવણી સાધન સાફ કરો"],
    transplanting: ["સવારે કે સાંજે રોપો", "રોપાઓને નાજુકાઈથી ઉઠાવો", "તરત જ પાણી આપો"],
    fertilizer: ["ભીની માટીમાં ખાતર આપો", "સાંજે ખાતર આપો", "ખાતરને સીધા પાણીથી બચાવો"],
    irrigation: ["સવારે કે સાંજે પાણી આપો", "ભરાયેલું પાણી કાઢો", "વધારે પાણી ટાળો"],
    pesticide: ["માસ્ક અને મોજા પહેરો", "પવનની દિશામાં છંટકાવ ન કરો", "છંટકાવ પછી હાથ ધોવો"],
    fungicide: ["માસ્ક પહેરો", "સાંજે છંટકાવ કરો", "PHI અનુસરો"],
    weeding: ["તડકામાં ટોપી પહેરો", "પાણી પીતા રહો", "સાધનોથી સાવધાન"],
    harvest: ["ધારદાર સાધનો સંભાળો", "ગરમીમાં આરામ કરો", "મશીન સુરક્ષિત ચલાવો"],
    land_preparation: ["ટ્રેક્ટર સાવધાનીથી ચલાવો", "સમાન ખેડ કરો", "પથ્થરો દૂર કરો"],
    intercultural: ["પાકને નુકસાન ન પહોંચાડો", "નીંદણનાશક પાક પર ન પડે"],
  },
  kn: {
    seed_treatment: ["ನೆರಳಿನಲ್ಲಿ ಬೀಜೋಪಚಾರ ಮಾಡಿ", "ಉಪಚರಿಸಿದ ಬೀಜ ತಿನ್ನಬೇಡಿ", "2 ಗಂಟೆಯಲ್ಲಿ ಬಿತ್ತನೆ ಮಾಡಿ"],
    sowing: ["ಒದ್ದೆ ಮಣ್ಣಿನಲ್ಲಿ ಮಾತ್ರ ಬಿತ್ತಿ", "ಸರಿಯಾದ ಆಳದಲ್ಲಿ ಬಿತ್ತಿ", "ಬಿತ್ತನೆ ಉಪಕರಣ ಸ್ವಚ್ಛ ಮಾಡಿ"],
    transplanting: ["ಬೆಳಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನಾಟಿ ಮಾಡಿ", "ಸಸಿಗಳನ್ನು ಮೃದುವಾಗಿ ಹಿಡಿಯಿರಿ", "ತಕ್ಷಣ ನೀರು ಕೊಡಿ"],
    fertilizer: ["ಒದ್ದೆ ಮಣ್ಣಿನಲ್ಲಿ ಗೊಬ್ಬರ ಹಾಕಿ", "ಸಂಜೆ ಗೊಬ್ಬರ ಹಾಕಿ", "ಗೊಬ್ಬರವನ್ನು ನೇರ ನೀರಿನಿಂದ ರಕ್ಷಿಸಿ"],
    irrigation: ["ಬೆಳಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನೀರು ಕೊಡಿ", "ನಿಂತ ನೀರು ಹೊರಹಾಕಿ", "ಹೆಚ್ಚು ನೀರು ಬೇಡ"],
    pesticide: ["ಮಾಸ್ಕ್ ಮತ್ತು ಕೈಗವಸು ಧರಿಸಿ", "ಗಾಳಿಯ ದಿಕ್ಕಿಗೆ ಸಿಂಪಡಿಸಬೇಡಿ", "ಸಿಂಪಡಣೆ ನಂತರ ಕೈ ತೊಳೆಯಿರಿ"],
    fungicide: ["ಮಾಸ್ಕ್ ಧರಿಸಿ", "ಸಂಜೆ ಸಿಂಪಡಿಸಿ", "PHI ಅನುಸರಿಸಿ"],
    weeding: ["ಬಿಸಿಲಿನಲ್ಲಿ ಟೊಪ್ಪಿ ಧರಿಸಿ", "ನೀರು ಕುಡಿಯುತ್ತಿರಿ", "ಉಪಕರಣಗಳೊಂದಿಗೆ ಎಚ್ಚರ"],
    harvest: ["ಚೂಪು ಉಪಕರಣಗಳನ್ನು ಜಾಗ್ರತೆಯಿಂದ ಬಳಸಿ", "ಬಿಸಿಯಲ್ಲಿ ವಿಶ್ರಾಂತಿ ತೆಗೆದುಕೊಳ್ಳಿ", "ಯಂತ್ರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ನಡೆಸಿ"],
    land_preparation: ["ಟ್ರಾಕ್ಟರ್ ಜಾಗ್ರತೆಯಿಂದ ಓಡಿಸಿ", "ಸಮನಾಗಿ ಉಳುಮೆ ಮಾಡಿ", "ಕಲ್ಲುಗಳನ್ನು ತೆಗೆಯಿರಿ"],
    intercultural: ["ಬೆಳೆಗೆ ಹಾನಿ ಮಾಡಬೇಡಿ", "ಕಳೆನಾಶಕ ಬೆಳೆ ಮೇಲೆ ಬೀಳದಂತೆ ನೋಡಿ"],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// MINIMUM COSTS BY CATEGORY (Realistic floor values per acre)
// ═══════════════════════════════════════════════════════════════════════
const CATEGORY_MIN_COSTS: Record<string, { productMin: number; laborDays: number; description: string }> = {
  land_preparation: { productMin: 0, laborDays: 0, description: "Tractor work" },
  seed_treatment: { productMin: 50, laborDays: 0.25, description: "Treatment chemicals" }, // Thiram/Carbendazim ~₹50/acre
  sowing: { productMin: 0, laborDays: 0.5, description: "Manual sowing" }, // Seed cost added separately
  transplanting: { productMin: 500, laborDays: 4, description: "Seedlings/nursery" },
  fertilizer: { productMin: 200, laborDays: 0.3, description: "Fertilizer per application" },
  irrigation: { productMin: 0, laborDays: 0.2, description: "Water management" },
  weeding: { productMin: 0, laborDays: 3, description: "Manual weeding" },
  pest_control: { productMin: 350, laborDays: 0.5, description: "Insecticide + spraying" },
  disease_control: { productMin: 250, laborDays: 0.5, description: "Fungicide + spraying" },
  intercultural: { productMin: 0, laborDays: 1, description: "Cultivation work" },
  harvest: { productMin: 0, laborDays: 4, description: "Manual harvest" },
  other: { productMin: 0, laborDays: 0.5, description: "General task" },
};

// ═══════════════════════════════════════════════════════════════════════
// COST CALCULATION FUNCTION WITH VALIDATION
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
    language = "hi",
  } = params;

  const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];
  const categoryConfig = CATEGORY_MIN_COSTS[taskCategory] || CATEGORY_MIN_COSTS["other"];

  // Determine labor category based on machine work
  let laborCategory = taskCategory;
  if (taskCategory === "weeding" && isMachineWork) laborCategory = "weeding_chemical";
  if (taskCategory === "weeding" && !isMachineWork) laborCategory = "weeding_manual";
  if (taskCategory === "harvest" && isMachineWork) laborCategory = "harvest_machine";
  if (taskCategory === "harvest" && !isMachineWork) laborCategory = "harvest_manual";
  if (taskCategory === "sowing" && isMachineWork) laborCategory = "sowing_machine";

  // Calculate labor
  const laborReq = ACTIVITY_LABOR[laborCategory] || ACTIVITY_LABOR[taskCategory] || { labor_per_acre: categoryConfig.laborDays };
  const laborDays = laborReq.labor_per_acre * landAcres;
  let laborCost = Math.round(laborDays * laborRate);

  // If AI gave labor cost, use max of AI value and calculated value
  if (aiLaborCost > 0) {
    laborCost = Math.max(laborCost, aiLaborCost);
  }

  // Calculate product cost with category-specific logic
  let productCost = aiProductCost;
  const minProductCost = Math.round(categoryConfig.productMin * landAcres);

  // SEED TASK: Must include seed cost
  if (isSeedTask && seedCost > 0) {
    // Seed treatment: add treatment chemical cost on top of seed cost
    if (taskCategory === "seed_treatment" || taskName.toLowerCase().includes("उपचार") || taskName.toLowerCase().includes("treatment")) {
      const treatmentCost = Math.round(50 * landAcres); // ~₹50/acre for treatment chemicals
      productCost = seedCost + treatmentCost;
      console.log(`💰 [Cost] Seed treatment: Seed ₹${seedCost} + Treatment ₹${treatmentCost} = ₹${productCost}`);
    } else if (taskCategory === "sowing") {
      // Sowing task: include seed cost
      productCost = seedCost;
      console.log(`💰 [Cost] Sowing: Seed cost ₹${seedCost}`);
    }
  }

  // FERTILIZER TASK: Use calculated fertilizer cost if provided
  if (isFertilizerTask && fertilizerCost > 0) {
    productCost = Math.max(productCost, fertilizerCost);
    console.log(`💰 [Cost] Fertilizer: Using ₹${fertilizerCost} (provided), AI was ₹${aiProductCost}`);
  }

  // Ensure minimum product cost for category
  if (productCost < minProductCost && minProductCost > 0) {
    console.log(`💰 [Cost] ${taskCategory}: AI ₹${productCost} < min ₹${minProductCost}, adjusting`);
    productCost = minProductCost;
  }

  // Add spraying cost for pest/disease control
  let sprayingCost = 0;
  if (["pest_control", "disease_control"].includes(taskCategory)) {
    sprayingCost = Math.round(SPRAYING_COSTS.manual_knapsack * landAcres);
  }

  // Add machinery cost if applicable
  let machineryCost = 0;
  if (machineryType && MACHINERY_COSTS[machineryType]) {
    machineryCost = Math.round(MACHINERY_COSTS[machineryType] * landAcres);
  } else if (taskCategory === "land_preparation") {
    // Default to tractor plowing for land preparation
    machineryCost = Math.round(MACHINERY_COSTS.tractor_plowing * landAcres);
  }

  const totalCost = productCost + laborCost + sprayingCost + machineryCost;

  // Build breakdown string based on language
  const labels = language === "mr" 
    ? { product: "सामग्री", labor: "मजूरी", days: "दिन", spray: "फवारणी", machine: "यंत्र", total: "एकूण" }
    : language === "en"
    ? { product: "Material", labor: "Labor", days: "days", spray: "Spraying", machine: "Machinery", total: "Total" }
    : { product: "सामग्री", labor: "मजूरी", days: "दिन", spray: "फवारणी", machine: "यंत्र", total: "कुल" };

  const parts: string[] = [];
  if (productCost > 0) parts.push(`${labels.product}: ₹${productCost}`);
  if (laborCost > 0) parts.push(`${labels.labor} (${laborDays.toFixed(1)} ${labels.days} × ₹${laborRate}): ₹${laborCost}`);
  if (sprayingCost > 0) parts.push(`${labels.spray}: ₹${sprayingCost}`);
  if (machineryCost > 0) parts.push(`${labels.machine}: ₹${machineryCost}`);

  const breakdown = parts.length > 0 
    ? parts.join(" + ") + ` = ${labels.total}: ₹${totalCost}` 
    : `${labels.total}: ₹${totalCost}`;

  return { totalCost, laborCost, productCost, laborDays, sprayingCost, machineryCost, breakdown };
}

// Legacy function for backward compatibility
function calculateTaskCost(
  taskCategory: string,
  landAcres: number,
  state: string,
  productCost: number = 0,
  isMachineWork: boolean = false,
  machineryType?: string
): { totalCost: number; laborCost: number; productCost: number; laborDays: number; breakdown: string } {
  const result = calculateTaskCostWithValidation({
    taskCategory,
    taskName: "",
    landAcres,
    state,
    aiProductCost: productCost,
    isMachineWork,
    machineryType,
  });
  return {
    totalCost: result.totalCost,
    laborCost: result.laborCost,
    productCost: result.productCost,
    laborDays: result.laborDays,
    breakdown: result.breakdown,
  };
}

// Map task categories to precaution types
function getPrecautionType(category: string, taskName: string): string {
  const lowerName = taskName.toLowerCase();
  const lowerCat = category.toLowerCase();
  
  if (lowerName.includes("seed") && (lowerName.includes("treat") || lowerName.includes("उपचार"))) return "seed_treatment";
  if (lowerCat === "sowing" || lowerName.includes("बुवाई") || lowerName.includes("पेरणी") || lowerName.includes("बीज")) return "sowing";
  if (lowerCat === "transplanting" || lowerName.includes("रोपण") || lowerName.includes("लावणी") || lowerName.includes("नाटी")) return "transplanting";
  if (lowerCat === "fertilizer" || lowerName.includes("खाद") || lowerName.includes("खत") || lowerName.includes("ऊरिया") || lowerName.includes("यूरिया")) return "fertilizer";
  if (lowerCat === "irrigation" || lowerName.includes("सिंचाई") || lowerName.includes("पाणी") || lowerName.includes("सिंचन")) return "irrigation";
  if (lowerCat === "pest_control" || lowerName.includes("कीट") || lowerName.includes("pesticide") || lowerName.includes("कीड")) return "pesticide";
  if (lowerCat === "disease_control" || lowerName.includes("फफूंद") || lowerName.includes("fungic") || lowerName.includes("रोग")) return "fungicide";
  if (lowerCat === "weeding" || lowerName.includes("निराई") || lowerName.includes("तण") || lowerName.includes("खरपतवार")) return "weeding";
  if (lowerCat === "harvest" || lowerName.includes("कटाई") || lowerName.includes("काढणी") || lowerName.includes("कापणी")) return "harvest";
  if (lowerCat === "land_preparation" || lowerName.includes("जुताई") || lowerName.includes("नांगरणी") || lowerName.includes("खेत")) return "land_preparation";
  if (lowerCat === "intercultural" || lowerName.includes("अंतर") || lowerName.includes("गोड़ाई") || lowerName.includes("खुरपणी")) return "intercultural";
  
  return "intercultural";
}

serve(async (req) => {
  console.log("🚀 [AI-Schedule] Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const tenantId = req.headers.get("x-tenant-id");
    const farmerId = req.headers.get("x-farmer-id");

    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: "Missing headers", details: "x-tenant-id and x-farmer-id required" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const {
      landId, cropName, cropVariety, sowingDate,
      isReadyMadePlant = false, weather, regenerate,
      language = "hi", forceGenerate = false,
    } = body;

    console.log("📋 [AI-Schedule] Request:", { landId, cropName, sowingDate, language, isReadyMadePlant });

    if (!landId || !cropName || !sowingDate) {
      return new Response(
        JSON.stringify({ error: "Missing fields", details: "landId, cropName, sowingDate required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(`${tenantId}:${farmerId}`, "ai-smart-schedule", {
      maxRequests: 30, windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
    }

    // Fetch land data with all details
    const { data: land, error: landError } = await supabase
      .from("lands")
      .select("*")
      .eq("id", landId)
      .single();

    if (landError || !land) {
      console.error("❌ Land fetch error:", landError);
      return new Response(JSON.stringify({ error: "Land not found" }), { status: 404, headers: corsHeaders });
    }

    const state = land.state || "Maharashtra";
    const laborRate = STATE_LABOR_RATES[state] || STATE_LABOR_RATES["default"];

    console.log("📍 [Land Data]:", {
      area: land.area_acres,
      soil: land.soil_type,
      irrigation: land.irrigation_type,
      ph: land.soil_ph,
      location: `${land.district}, ${state}`,
      laborRate,
    });

    // Parse sowing date
    const [year, month, day] = sowingDate.split("-").map(Number);
    const sowingDateParsed = new Date(year, month - 1, day);

    // Get crop-specific data
    const cropKey = cropName.toLowerCase().replace(/\s+/g, "");
    const seedData = SEED_RATES[cropKey] || { 
      rate_kg_per_acre: 10, spacing_cm: "45x30 cm", price_per_kg: 100, treatment: "Thiram @ 2g/kg" 
    };
    
    // Calculate exact seed quantity for this land
    const exactSeedQty = parseFloat((seedData.rate_kg_per_acre * land.area_acres).toFixed(1));
    const seedCost = Math.round(exactSeedQty * seedData.price_per_kg);

    // NPK calculations
    const target = NPK_TARGETS[cropKey] || NPK_TARGETS["default"];
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // Exact fertilizer quantities and costs
    const ureaKg = Math.round((nDeficit * landAreaHa) / 0.46);
    const dapKg = Math.round((pDeficit * landAreaHa) / 0.18);
    const mopKg = Math.round((kDeficit * landAreaHa) / 0.6);
    const fymTons = parseFloat((land.area_acres * 2.5).toFixed(1));
    
    // Calculate fertilizer costs
    const ureaCost = Math.round(ureaKg * FERTILIZER_PRICES.urea.price_per_kg);
    const dapCost = Math.round(dapKg * FERTILIZER_PRICES.dap.price_per_kg);
    const mopCost = Math.round(mopKg * FERTILIZER_PRICES.mop.price_per_kg);
    const fymCost = Math.round(fymTons * 1000 * FERTILIZER_PRICES.fym.price_per_kg);
    const totalFertilizerCost = ureaCost + dapCost + mopCost + fymCost;

    // Get irrigation type rules
    const irrigationType = (land.irrigation_type || "manual").toLowerCase();
    const irrigationRules = buildIrrigationRules(irrigationType);

    // Get soil health recommendations
    const soilRecommendations = buildSoilRecommendations(land);

    const languageName = LANGUAGES[language] || "Hindi";
    const langKey = language in ACTIVITY_PRECAUTIONS ? language : (language === "hi" ? "hi" : "en");

    // Build pricing reference for AI
    const pricingReference = buildPricingReference(land.area_acres, state, laborRate);

    // Build comprehensive system prompt with VERIFIED data
    const systemPrompt = `You are an expert agricultural scientist with 50+ years of field experience.
Generate crop schedule in ${languageName} using RURAL VILLAGE language (not formal/bookish terms).

═══════════════════════════════════════════════════════════════
🌱 CROP & LAND DETAILS (USE EXACTLY!)
═══════════════════════════════════════════════════════════════
CROP: ${cropName} ${cropVariety ? `(${cropVariety})` : ""}
LOCATION: ${land.village || ""}, ${land.taluka || ""}, ${land.district || "Unknown"}, ${state}
AREA: ${land.area_acres} acres (${landAreaHa.toFixed(2)} hectares)
SOIL TYPE: ${land.soil_type || "Black soil"}
SOIL pH: ${land.soil_ph || "7.0"} ${land.soil_ph && land.soil_ph < 6 ? "⚠️ ACIDIC" : land.soil_ph && land.soil_ph > 8 ? "⚠️ ALKALINE" : ""}
ORGANIC CARBON: ${land.organic_carbon_percent || "0.5"}%
PREVIOUS CROP: ${land.previous_crop || "Unknown"}

═══════════════════════════════════════════════════════════════
💰 LABOR RATES FOR ${state.toUpperCase()} (MGNREGA 2024-25)
═══════════════════════════════════════════════════════════════
DAILY WAGE: ₹${laborRate}/day
ALWAYS INCLUDE LABOR COST IN EVERY TASK!

Labor requirements per acre:
- Sowing (manual): 0.5 person-days × ${land.area_acres} acres = ${(0.5 * land.area_acres).toFixed(1)} days
- Transplanting: 4 person-days × ${land.area_acres} acres = ${(4 * land.area_acres).toFixed(1)} days
- Weeding (manual): 3 person-days × ${land.area_acres} acres = ${(3 * land.area_acres).toFixed(1)} days
- Spraying: 0.5 person-days × ${land.area_acres} acres = ${(0.5 * land.area_acres).toFixed(1)} days
- Harvesting (manual): 4 person-days × ${land.area_acres} acres = ${(4 * land.area_acres).toFixed(1)} days
- Fertilizer application: 0.3 person-days × ${land.area_acres} acres = ${(0.3 * land.area_acres).toFixed(1)} days

SPRAYING COST: ₹${Math.round(SPRAYING_COSTS.manual_knapsack * land.area_acres)} (₹150/acre for knapsack)

═══════════════════════════════════════════════════════════════
🌾 VERIFIED SEED DATA (MANDATORY VALUES!)
═══════════════════════════════════════════════════════════════
SEED RATE: ${seedData.rate_kg_per_acre} kg/acre
EXACT QUANTITY FOR ${land.area_acres} ACRES: ${exactSeedQty} kg
SEED PRICE: ₹${seedData.price_per_kg}/kg
TOTAL SEED COST: ₹${seedCost}
SPACING: ${seedData.spacing_cm}
SEED TREATMENT: ${seedData.treatment}
${isReadyMadePlant ? "⚠️ TRANSPLANTING - Calculate nursery/seedlings instead!" : ""}

═══════════════════════════════════════════════════════════════
🧪 FERTILIZER PRICES & QUANTITIES (2024-25 RATES)
═══════════════════════════════════════════════════════════════
NPK Status (kg/ha):
- Nitrogen: ${currentN} | Need: ${target.n} | Deficit: ${nDeficit.toFixed(0)}
- Phosphorus: ${currentP} | Need: ${target.p} | Deficit: ${pDeficit.toFixed(0)}
- Potassium: ${currentK} | Need: ${target.k} | Deficit: ${kDeficit.toFixed(0)}

CALCULATED FERTILIZERS FOR ${land.area_acres} ACRES:
| Fertilizer | Qty | Rate | Cost |
|------------|-----|------|------|
| FYM/Compost | ${fymTons} tons | ₹800/ton | ₹${fymCost} |
| Urea (46% N) | ${ureaKg} kg | ₹${FERTILIZER_PRICES.urea.price_per_kg}/kg | ₹${ureaCost} |
| DAP (18-46-0) | ${dapKg} kg | ₹${FERTILIZER_PRICES.dap.price_per_kg}/kg | ₹${dapCost} |
| MOP (0-0-60) | ${mopKg} kg | ₹${FERTILIZER_PRICES.mop.price_per_kg}/kg | ₹${mopCost} |
| TOTAL FERTILIZER COST: ₹${totalFertilizerCost} |

+ Labor for application: ${(0.3 * land.area_acres * 3).toFixed(1)} days × ₹${laborRate} = ₹${Math.round(0.3 * land.area_acres * 3 * laborRate)}

═══════════════════════════════════════════════════════════════
💊 PESTICIDE/CHEMICAL PRICES (2024-25 MARKET RATES)
═══════════════════════════════════════════════════════════════
${pricingReference}

═══════════════════════════════════════════════════════════════
🚿 IRRIGATION RULES (STRICT!)
═══════════════════════════════════════════════════════════════
${irrigationRules}

${soilRecommendations}

═══════════════════════════════════════════════════════════════
📝 OUTPUT FORMAT RULES (MANDATORY!)
═══════════════════════════════════════════════════════════════
1. DESCRIPTION: Maximum 2 lines (40 words). Be DIRECT and ACTIONABLE.
   ❌ BAD: "This is an important task where you need to carefully apply fertilizer..."
   ✅ GOOD: "${ureaKg}kg Urea + ${dapKg}kg DAP मिट्टी में मिलाएं। अगले दिन सिंचाई करें।"

2. INSTRUCTIONS: Maximum 4 steps. Each step 1 line only.
   ❌ BAD: Long paragraphs with detailed explanations
   ✅ GOOD: ["${ureaKg}kg Urea तौलें", "समान रूप से छिड़कें", "मिट्टी में मिलाएं", "24 घंटे बाद पानी दें"]

3. PRECAUTIONS: Maximum 3 points. ACTIVITY-SPECIFIC ONLY!
   ❌ BAD for sowing: "मास्क पहनें" (irrelevant!)
   ✅ GOOD for sowing: "नम मिट्टी में ही बोएं", "2-3 सेमी गहराई रखें"
   ✅ GOOD for pesticide: "मास्क और दस्ताने पहनें", "हवा की दिशा में न छिड़कें"

4. COST BREAKDOWN (MANDATORY IN EVERY TASK!):
   Format: "सामग्री: ₹X + मजूरी (Y दिन × ₹${laborRate}): ₹Z = कुल: ₹Total"
   Example for weeding: "मजूरी (${(3 * land.area_acres).toFixed(1)} दिन × ₹${laborRate}): ₹${Math.round(3 * land.area_acres * laborRate)} = कुल: ₹${Math.round(3 * land.area_acres * laborRate)}"

═══════════════════════════════════════════════════════════════
⚠️ CRITICAL RULES (VIOLATIONS = FAILURE!)
═══════════════════════════════════════════════════════════════
1. SEED QUANTITY: MUST be EXACTLY ${exactSeedQty} kg (NOT 54kg or any other value!)
2. SEED COST: MUST be ₹${seedCost}
3. EVERY TASK MUST have labor_cost calculated
4. IRRIGATION: Follow ${irrigationType} method ONLY
5. Use REALISTIC 2024-25 market prices from the tables above
6. CHEMICALS: Include Brand + Active Ingredient + Dose/acre + PHI`;

    const userPrompt = `Generate complete ${cropName} schedule for ${land.area_acres} acres starting ${sowingDate}.

MUST INCLUDE:
- ${isReadyMadePlant ? "Transplanting/sapling preparation" : "Seed treatment & sowing"} with EXACT ${exactSeedQty} kg seeds
- All fertilizer applications (FYM, Urea, DAP, MOP) with calculated doses & costs
- Pest/disease management with brand names + doses + labor + spraying costs
- Weeding with labor cost (${(3 * land.area_acres).toFixed(1)} days × ₹${laborRate} = ₹${Math.round(3 * land.area_acres * laborRate)})
- Irrigation based on ${irrigationType} system
- Harvest with labor cost (${(4 * land.area_acres).toFixed(1)} days × ₹${laborRate} = ₹${Math.round(4 * land.area_acres * laborRate)})

Generate 12-18 tasks. Output in ${languageName} rural language.
IMPORTANT: 
- Each task's precautions MUST be relevant to that specific activity!
- Each task MUST include labor_cost and cost_breakdown!
- Keep descriptions brief (2 lines max)!
- Keep instructions to 4 steps max!`;

    console.log("🤖 [AI] Calling API with verified pricing data");

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
              description: `Create verified ${cropName} schedule for ${land.area_acres} acres in ${languageName} with accurate pricing`,
              parameters: {
                type: "object",
                properties: {
                  crop_name: { type: "string" },
                  total_duration_days: { type: "integer" },
                  expected_yield_quintals: { type: "number" },
                  total_estimated_cost: { type: "number" },
                  total_labor_cost: { type: "number", description: "Sum of all labor costs" },
                  total_material_cost: { type: "number", description: "Sum of all product/material costs" },
                  expected_profit: { type: "number" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task_name: { type: "string", description: "Brief task name in selected language (max 5 words)" },
                        category: { 
                          type: "string", 
                          enum: ["land_preparation", "seed_treatment", "sowing", "transplanting", "fertilizer", 
                                 "irrigation", "weeding", "pest_control", "disease_control", "intercultural", "harvest", "other"],
                        },
                        days_from_sowing: { type: "integer" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        description: { type: "string", description: "Brief 2-line description (max 40 words)" },
                        quantity: { type: "string", description: "Exact quantity with unit" },
                        product_details: { type: "string", description: "Brand + Active ingredient + concentration" },
                        product_cost: { type: "number", description: "Cost of materials/products only" },
                        labor_days: { type: "number", description: "Number of labor days required" },
                        labor_cost: { type: "number", description: "Labor cost (days × daily wage)" },
                        spraying_cost: { type: "number", description: "Spraying equipment cost if applicable" },
                        estimated_cost: { type: "number", description: "Total cost = product + labor + spraying" },
                        cost_breakdown: { type: "string", description: "Format: सामग्री: ₹X + मजूरी: ₹Y = कुल: ₹Z" },
                        instructions: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "Max 4 steps, each 1 line only"
                        },
                        precautions: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "Max 3 points, ACTIVITY-SPECIFIC only!"
                        },
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

    // POST-PROCESS: Validate precautions and RECALCULATE COSTS properly
    let totalLaborCost = 0;
    let totalMaterialCost = 0;

    const processedTasks = scheduleData.tasks.map((task: any, idx: number) => {
      const category = task.category || "other";
      const taskName = task.task_name || "";
      
      // Determine precaution type
      const precautionType = getPrecautionType(category, taskName);
      const langPrecautions = ACTIVITY_PRECAUTIONS[langKey] || ACTIVITY_PRECAUTIONS["hi"];
      const activityPrecautions = langPrecautions[precautionType] || langPrecautions["intercultural"];
      
      // Check for generic precautions in non-chemical tasks
      const aiPrecautions = task.precautions || [];
      const hasGenericPrecautions = aiPrecautions.some((p: string) => 
        (p.includes("मास्क") || p.includes("mask") || p.includes("दस्ताने") || p.includes("gloves") || 
         p.includes("मुखौटा") || p.includes("ముఖమూడి") || p.includes("முகமூடி"))
      );
      
      const isChemicalTask = ["pest_control", "disease_control"].includes(category.toLowerCase()) ||
                            taskName.toLowerCase().includes("फवारणी") ||
                            taskName.toLowerCase().includes("spray") ||
                            taskName.toLowerCase().includes("कीट") ||
                            taskName.toLowerCase().includes("फफूंद") ||
                            (task.product_details || "").toLowerCase().includes("pesticide") ||
                            (task.product_details || "").toLowerCase().includes("fungicide");
      
      let finalPrecautions = aiPrecautions;
      if (!isChemicalTask && hasGenericPrecautions) {
        finalPrecautions = activityPrecautions;
        console.log(`🔄 [Precaution] Replaced for ${taskName} with ${precautionType} precautions`);
      }

      // Determine if this is a seed-related or fertilizer-related task
      const isSeedTask = category === "seed_treatment" || category === "sowing" ||
                        taskName.toLowerCase().includes("बीज") || 
                        taskName.toLowerCase().includes("बियाणे") ||
                        taskName.toLowerCase().includes("seed");
      
      const isFertilizerTask = category === "fertilizer" ||
                              taskName.toLowerCase().includes("खाद") ||
                              taskName.toLowerCase().includes("खत") ||
                              taskName.toLowerCase().includes("उर्वरक") ||
                              taskName.toLowerCase().includes("urea") ||
                              taskName.toLowerCase().includes("dap") ||
                              taskName.toLowerCase().includes("fertilizer");

      // Calculate individual fertilizer cost for this task
      let taskFertilizerCost = 0;
      if (isFertilizerTask) {
        // Determine which fertilizer application this is based on task name/description
        const desc = (task.description || "").toLowerCase() + (taskName || "").toLowerCase();
        if (desc.includes("fym") || desc.includes("सड़ी") || desc.includes("शेणखत") || desc.includes("गोबर")) {
          taskFertilizerCost = fymCost;
        } else if (desc.includes("dap") || desc.includes("फॉस्फेट")) {
          taskFertilizerCost = dapCost + Math.round(0.3 * land.area_acres * laborRate);
        } else if (desc.includes("urea") || desc.includes("यूरिया") || desc.includes("ऊरिया")) {
          taskFertilizerCost = ureaCost + Math.round(0.3 * land.area_acres * laborRate);
        } else if (desc.includes("mop") || desc.includes("पोटाश")) {
          taskFertilizerCost = mopCost + Math.round(0.3 * land.area_acres * laborRate);
        } else {
          // General fertilizer task - use portion of total
          taskFertilizerCost = Math.round(totalFertilizerCost / 3) + Math.round(0.3 * land.area_acres * laborRate);
        }
      }

      // RECALCULATE COSTS using our validated function
      const costResult = calculateTaskCostWithValidation({
        taskCategory: category,
        taskName: taskName,
        landAcres: land.area_acres,
        state,
        aiProductCost: task.product_cost || 0,
        aiLaborCost: task.labor_cost || 0,
        isMachineWork: category === "land_preparation" || (task.product_details || "").toLowerCase().includes("tractor"),
        machineryType: category === "land_preparation" ? "tractor_plowing" : 
                       category === "harvest" && (task.product_details || "").toLowerCase().includes("combine") ? "combine_harvester" : undefined,
        isSeedTask,
        seedCost: isSeedTask ? seedCost : 0,
        isFertilizerTask,
        fertilizerCost: taskFertilizerCost,
        language,
      });

      // Log significant cost corrections
      if (Math.abs((task.estimated_cost || 0) - costResult.totalCost) > 100) {
        console.log(`💰 [Cost Correction] ${taskName}: AI ₹${task.estimated_cost || 0} → Calculated ₹${costResult.totalCost}`);
      }

      totalLaborCost += costResult.laborCost;
      totalMaterialCost += costResult.productCost;

      return {
        ...task,
        product_cost: costResult.productCost,
        labor_cost: costResult.laborCost,
        labor_days: costResult.laborDays,
        spraying_cost: costResult.sprayingCost,
        machinery_cost: costResult.machineryCost,
        estimated_cost: costResult.totalCost,
        cost_breakdown: costResult.breakdown,
        precautions: finalPrecautions.length > 0 ? finalPrecautions.slice(0, 3) : activityPrecautions.slice(0, 3),
        instructions: (task.instructions || [task.description]).slice(0, 4),
      };
    });

    // Recalculate schedule totals
    const correctedTotalCost = processedTasks.reduce((sum: number, t: any) => sum + (t.estimated_cost || 0), 0);
    console.log(`💰 [Total Cost] AI: ₹${scheduleData.total_estimated_cost} → Calculated: ₹${correctedTotalCost}`);
    console.log(`💰 [Labor Total]: ₹${totalLaborCost} | [Material Total]: ₹${totalMaterialCost}`);

    // Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from("crop_schedules").update({ is_active: false }).eq("land_id", landId).eq("is_active", true);
    }

    // Calculate harvest date
    const harvestDate = new Date(sowingDateParsed);
    harvestDate.setDate(harvestDate.getDate() + (scheduleData.total_duration_days || 120));
    const harvestDateStr = harvestDate.toISOString().split("T")[0];

    // Save schedule with CORRECTED totals
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety || scheduleData.crop_variety,
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        expected_yield_quintals: scheduleData.expected_yield_quintals,
        total_estimated_cost: correctedTotalCost, // Use corrected total, not AI total
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          isReadyMadePlant,
          land_area: land.area_acres,
          state,
          labor_rate: laborRate,
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          fertilizer_data: { urea: ureaKg, dap: dapKg, mop: mopKg, fym: fymTons, total_cost: totalFertilizerCost },
          npk_deficit: { n: nDeficit, p: pDeficit, k: kDeficit },
          irrigation_type: irrigationType,
          total_labor_cost: totalLaborCost,     // Use corrected labor total
          total_material_cost: totalMaterialCost, // Use corrected material total
          ai_original_cost: scheduleData.total_estimated_cost, // Store AI's original for comparison
        },
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("❌ Schedule save error:", scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // Prepare and insert tasks with validated precautions and costs
    const tasksToInsert = processedTasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDateParsed);
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing ?? index * 7));

      return {
        schedule_id: savedSchedule.id,
        task_date: taskDate.toISOString().split("T")[0],
        task_type: task.category || "other",
        task_name: task.task_name,
        task_description: task.description,
        status: "pending",
        priority: task.priority || "medium",
        weather_dependent: task.weather_dependent || false,
        instructions: task.instructions || [task.description],
        precautions: task.precautions,
        resources: {
          quantity: task.quantity || `${land.area_acres} acres`,
          product_details: task.product_details,
          product_cost: task.product_cost,       // Validated product cost
          labor_days: task.labor_days,           // Validated labor days
          labor_cost: task.labor_cost,           // Validated labor cost
          spraying_cost: task.spraying_cost,     // Validated spraying cost
          machinery_cost: task.machinery_cost,   // Machinery cost
          cost_breakdown: task.cost_breakdown,   // Formatted breakdown
          yield_impact: task.yield_impact,
          skip_penalty: task.skip_penalty,
          days_from_sowing: task.days_from_sowing,
        },
        estimated_cost: task.estimated_cost,     // Validated total
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
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks with validated pricing`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule complete in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName,
        sowingDate,
        totalTasks: processedTasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: correctedTotalCost,           // Corrected total
        totalLaborCost: totalLaborCost,          // Corrected labor
        totalMaterialCost: totalMaterialCost,    // Corrected material
        expectedProfit: scheduleData.expected_profit,
        seedData: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
        fertilizerData: { urea: ureaKg, dap: dapKg, mop: mopKg, fym: fymTons, totalCost: totalFertilizerCost },
        laborRate,
        state,
        executionTimeMs: executionTime,
        costValidation: {
          aiOriginal: scheduleData.total_estimated_cost,
          calculated: correctedTotalCost,
          difference: correctedTotalCost - (scheduleData.total_estimated_cost || 0),
        },
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

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function buildIrrigationRules(irrigationType: string): string {
  const rules: Record<string, string> = {
    drip: `IRRIGATION: Drip irrigation available
✅ Use: Drip scheduling, fertigation
✅ Calculate: Liters/hour per plant`,

    sprinkler: `IRRIGATION: Sprinkler system available
✅ Use: Sprinkler schedules
⚠️ Avoid during high humidity (fungal risk)`,

    manual: `IRRIGATION: MANUAL only (NO drip/sprinkler!)
❌ DO NOT recommend drip or sprinkler
✅ Use: Flood, furrow, ring basin
✅ Calculate: Liters per irrigation`,

    well: `IRRIGATION: Well-based system
✅ Use: Pump schedules
⚠️ Plan around electricity availability`,

    canal: `IRRIGATION: Canal water
⚠️ Water depends on rotation
✅ Plan around canal days`,

    rainfed: `IRRIGATION: RAINFED (NO irrigation!)
❌ DO NOT include irrigation tasks!
✅ Focus: Rainwater harvesting, mulching`,
  };

  return rules[irrigationType] || rules["manual"];
}

function buildSoilRecommendations(land: any): string {
  const recs: string[] = [];

  if (land.soil_ph) {
    if (land.soil_ph < 6.0) {
      recs.push(`⚠️ ACIDIC SOIL (pH ${land.soil_ph}): Apply lime 2-4 quintals/acre @ ₹8/kg = ₹${Math.round(3 * 100 * 8 * land.area_acres)}`);
    } else if (land.soil_ph > 7.8) {
      recs.push(`⚠️ ALKALINE SOIL (pH ${land.soil_ph}): Apply gypsum 3-4 quintals/acre @ ₹5/kg = ₹${Math.round(3.5 * 100 * 5 * land.area_acres)}`);
    }
  }

  if (land.organic_carbon_percent && land.organic_carbon_percent < 0.5) {
    recs.push(`⚠️ LOW ORGANIC CARBON (${land.organic_carbon_percent}%): Add FYM 5-10 tons/acre @ ₹800/ton = ₹${Math.round(7.5 * 800 * land.area_acres)}`);
  }

  if (land.previous_crop) {
    const legumes = ["soybean", "groundnut", "moong", "urad", "gram", "tur", "चना", "मूंग"];
    if (legumes.some(l => land.previous_crop.toLowerCase().includes(l))) {
      recs.push(`✅ Previous legume (${land.previous_crop}): Reduce nitrogen by 20-25% (save ₹${Math.round(land.area_acres * 200)})`);
    }
  }

  return recs.length > 0 ? "\n═══════════════════════════════════════════════════════════════\n🌍 SOIL AMENDMENTS\n═══════════════════════════════════════════════════════════════\n" + recs.join("\n") : "";
}

function buildPricingReference(landAcres: number, state: string, laborRate: number): string {
  return `
INSECTICIDES (per acre):
| Product | Price | Unit |
|---------|-------|------|
| Imidacloprid 17.8SL | ₹450 | 250ml |
| Chlorpyriphos 20EC | ₹190 | 500ml |
| Thiamethoxam 25WG | ₹650 | 100g |
| Lambda Cyhalothrin 5EC | ₹420 | 500ml |
| Emamectin Benzoate 5SG | ₹450 | 100g |

FUNGICIDES (per acre):
| Product | Price | Unit |
|---------|-------|------|
| Carbendazim 50WP | ₹180 | 100g |
| Mancozeb 75WP | ₹320 | 500g |
| Copper Oxychloride 50WP | ₹380 | 500g |
| Propiconazole 25EC | ₹680 | 250ml |

HERBICIDES (per acre):
| Product | Price | Unit |
|---------|-------|------|
| Pendimethalin 30EC | ₹580 | 1L |
| 2,4-D Amine 58SL | ₹175 | 500ml |
| Atrazine 50WP | ₹280 | 500g |

SPRAYING COST: ₹${SPRAYING_COSTS.manual_knapsack}/acre (knapsack) | ₹${SPRAYING_COSTS.power_sprayer}/acre (power sprayer)
For ${landAcres} acres: Knapsack = ₹${Math.round(SPRAYING_COSTS.manual_knapsack * landAcres)} | Power = ₹${Math.round(SPRAYING_COSTS.power_sprayer * landAcres)}

MACHINERY COSTS:
| Operation | Cost/acre | For ${landAcres} acres |
|-----------|-----------|----------------------|
| Tractor plowing | ₹1500 | ₹${Math.round(1500 * landAcres)} |
| Rotavator | ₹1200 | ₹${Math.round(1200 * landAcres)} |
| Seed drill | ₹800 | ₹${Math.round(800 * landAcres)} |
| Combine harvester | ₹2500 | ₹${Math.round(2500 * landAcres)} |`;
}
