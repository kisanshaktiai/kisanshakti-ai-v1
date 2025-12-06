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
// VERIFIED SEED RATES (kg/acre) - Based on ICAR & State Agri Dept Data
// ═══════════════════════════════════════════════════════════════════════
const SEED_RATES: Record<string, { rate_kg_per_acre: number; spacing_cm: string; price_per_kg: number; treatment: string }> = {
  wheat: { rate_kg_per_acre: 40, spacing_cm: "22.5 row spacing", price_per_kg: 35, treatment: "Thiram @ 2.5g/kg" },
  rice: { rate_kg_per_acre: 20, spacing_cm: "20x15 cm", price_per_kg: 45, treatment: "Carbendazim @ 2g/kg" },
  cotton: { rate_kg_per_acre: 1.5, spacing_cm: "90x60 cm", price_per_kg: 850, treatment: "Imidacloprid @ 5g/kg" },
  soybean: { rate_kg_per_acre: 30, spacing_cm: "45x5 cm", price_per_kg: 90, treatment: "Thiram+Carbendazim @ 2+1g/kg" },
  maize: { rate_kg_per_acre: 8, spacing_cm: "60x20 cm", price_per_kg: 350, treatment: "Thiram @ 3g/kg" },
  sugarcane: { rate_kg_per_acre: 0, spacing_cm: "90x30 cm", price_per_kg: 0, treatment: "Carbendazim dip" }, // Sets per acre
  groundnut: { rate_kg_per_acre: 50, spacing_cm: "30x10 cm", price_per_kg: 80, treatment: "Thiram @ 3g/kg + Rhizobium" },
  tomato: { rate_kg_per_acre: 0.15, spacing_cm: "60x45 cm", price_per_kg: 3500, treatment: "Trichoderma @ 4g/kg" },
  onion: { rate_kg_per_acre: 4, spacing_cm: "15x10 cm", price_per_kg: 1200, treatment: "Thiram @ 2g/kg" },
  potato: { rate_kg_per_acre: 800, spacing_cm: "60x20 cm", price_per_kg: 25, treatment: "Mancozeb dip" }, // Tubers
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
// ACTIVITY-SPECIFIC PRECAUTIONS (Contextual, not generic!)
// ═══════════════════════════════════════════════════════════════════════
const ACTIVITY_PRECAUTIONS: Record<string, Record<string, string[]>> = {
  mr: {
    seed_treatment: ["बियाणे उपचार सावलीत करा", "उपचारित बियाणे खाणे टाळा", "2 तासात पेरणी करा"],
    sowing: ["ओलसर जमिनीतच पेरा", "योग्य खोलीवर पेरा (2-3 सेमी)", "पेरणी यंत्र स्वच्छ करा"],
    transplanting: ["सकाळी किंवा संध्याकाळी लावा", "रोपे हलक्या हाताने हाताळा", "लगेच पाणी द्या"],
    fertilizer: ["खताला पाण्याशी संपर्क टाळा", "संध्याकाळी खत द्या", "ओलसर जमिनीत खत द्या"],
    irrigation: ["सकाळी लवकर किंवा संध्याकाळी पाणी द्या", "साचलेले पाणी काढून टाका", "जास्त पाणी टाळा"],
    pesticide: ["मास्क व हातमोजे अनिवार्य", "वाऱ्याच्या दिशेने फवारणी टाळा", "फवारणीनंतर हात धुवा", "मुलांना दूर ठेवा"],
    fungicide: ["मास्क घाला", "संध्याकाळी फवारणी करा", "PHI पाळा"],
    weeding: ["उन्हात काम करताना टोपी घाला", "पाणी पिण्यास विश्रांती घ्या", "यंत्र वापरताना सावधान"],
    harvest: ["धारदार अवजारे सांभाळा", "उष्णतेत विश्रांती घ्या", "यंत्र सुरक्षितपणे वापरा"],
    land_preparation: ["ट्रॅक्टर चालवताना सावधान", "नांगरणी एकसमान करा", "दगड काढून टाका"],
    intercultural: ["पिकाला इजा करू नका", "तणनाशक पिकावर पडणार नाही याची काळजी घ्या"],
  },
  hi: {
    seed_treatment: ["बीज उपचार छाया में करें", "उपचारित बीज खाने से बचें", "2 घंटे में बुवाई करें"],
    sowing: ["नम मिट्टी में ही बोएं", "सही गहराई पर बोएं (2-3 सेमी)", "बुवाई यंत्र साफ करें"],
    transplanting: ["सुबह या शाम को लगाएं", "पौधे नाजुकी से उठाएं", "तुरंत पानी दें"],
    fertilizer: ["खाद को पानी से बचाएं", "शाम को खाद दें", "नम मिट्टी में खाद डालें"],
    irrigation: ["सुबह जल्दी या शाम को पानी दें", "जमा पानी निकालें", "अधिक पानी से बचें"],
    pesticide: ["मास्क और दस्ताने अनिवार्य", "हवा की दिशा में छिड़काव न करें", "छिड़काव के बाद हाथ धोएं", "बच्चों को दूर रखें"],
    fungicide: ["मास्क पहनें", "शाम को छिड़काव करें", "PHI का पालन करें"],
    weeding: ["धूप में टोपी पहनें", "पानी पीते रहें", "यंत्र से सावधान"],
    harvest: ["धारदार औजार संभालें", "गर्मी में आराम करें", "मशीन सुरक्षित चलाएं"],
    land_preparation: ["ट्रैक्टर चलाते समय सावधान", "जुताई समान करें", "पत्थर हटाएं"],
    intercultural: ["फसल को नुकसान न पहुंचाएं", "खरपतवारनाशी फसल पर न गिरे"],
  },
  en: {
    seed_treatment: ["Treat seeds in shade", "Avoid eating treated seeds", "Sow within 2 hours of treatment"],
    sowing: ["Sow in moist soil only", "Maintain proper depth (2-3cm)", "Clean sowing equipment"],
    transplanting: ["Transplant in morning/evening", "Handle seedlings gently", "Water immediately after"],
    fertilizer: ["Avoid water contact with fertilizer", "Apply in evening", "Apply in moist soil"],
    irrigation: ["Irrigate early morning or evening", "Drain excess water", "Avoid waterlogging"],
    pesticide: ["Wear mask and gloves mandatory", "Avoid spraying against wind", "Wash hands after spraying", "Keep children away"],
    fungicide: ["Wear mask", "Spray in evening", "Follow PHI strictly"],
    weeding: ["Wear hat in sun", "Stay hydrated", "Be careful with tools"],
    harvest: ["Handle sharp tools carefully", "Take breaks in heat", "Operate machinery safely"],
    land_preparation: ["Drive tractor carefully", "Ensure uniform plowing", "Remove stones"],
    intercultural: ["Avoid crop damage", "Keep herbicide away from crop"],
  },
};

// Map task categories to precaution types
function getPrecautionType(category: string, taskName: string): string {
  const lowerName = taskName.toLowerCase();
  const lowerCat = category.toLowerCase();
  
  if (lowerName.includes("seed") && (lowerName.includes("treat") || lowerName.includes("उपचार"))) return "seed_treatment";
  if (lowerCat === "sowing" || lowerName.includes("बुवाई") || lowerName.includes("पेरणी")) return "sowing";
  if (lowerCat === "transplanting" || lowerName.includes("रोपण") || lowerName.includes("लावणी")) return "transplanting";
  if (lowerCat === "fertilizer" || lowerName.includes("खाद") || lowerName.includes("खत")) return "fertilizer";
  if (lowerCat === "irrigation" || lowerName.includes("सिंचाई") || lowerName.includes("पाणी")) return "irrigation";
  if (lowerCat === "pest_control" || lowerName.includes("कीट") || lowerName.includes("pesticide")) return "pesticide";
  if (lowerCat === "disease_control" || lowerName.includes("फफूंद") || lowerName.includes("fungic")) return "fungicide";
  if (lowerCat === "weeding" || lowerName.includes("निराई") || lowerName.includes("तण")) return "weeding";
  if (lowerCat === "harvest" || lowerName.includes("कटाई") || lowerName.includes("काढणी")) return "harvest";
  if (lowerCat === "land_preparation" || lowerName.includes("जुताई") || lowerName.includes("नांगरणी")) return "land_preparation";
  if (lowerCat === "intercultural" || lowerName.includes("अंतर")) return "intercultural";
  
  return "intercultural"; // Default
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

    console.log("📍 [Land Data]:", {
      area: land.area_acres,
      soil: land.soil_type,
      irrigation: land.irrigation_type,
      ph: land.soil_ph,
      location: `${land.district}, ${land.state}`,
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
    const exactSeedQty = (seedData.rate_kg_per_acre * land.area_acres).toFixed(1);
    const seedCost = (parseFloat(exactSeedQty) * seedData.price_per_kg).toFixed(0);

    // NPK calculations
    const target = NPK_TARGETS[cropKey] || NPK_TARGETS["default"];
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // Exact fertilizer quantities for this land
    const ureaKg = ((nDeficit * landAreaHa) / 0.46).toFixed(0);
    const dapKg = ((pDeficit * landAreaHa) / 0.18).toFixed(0);
    const mopKg = ((kDeficit * landAreaHa) / 0.6).toFixed(0);
    const fymTons = (land.area_acres * 2.5).toFixed(1);

    // Get irrigation type rules
    const irrigationType = (land.irrigation_type || "manual").toLowerCase();
    const irrigationRules = buildIrrigationRules(irrigationType);

    // Get soil health recommendations
    const soilRecommendations = buildSoilRecommendations(land);

    const languageName = LANGUAGES[language] || "Hindi";
    const langKey = language === "mr" ? "mr" : language === "en" ? "en" : "hi";

    // Build comprehensive system prompt with VERIFIED data
    const systemPrompt = `You are an expert agricultural scientist with 50+ years of field experience.
Generate crop schedule in ${languageName} using RURAL VILLAGE language (not formal/bookish terms).

═══════════════════════════════════════════════════════════════
🌱 CROP & LAND DETAILS (USE EXACTLY - NO GUESSING!)
═══════════════════════════════════════════════════════════════
CROP: ${cropName} ${cropVariety ? `(${cropVariety})` : ""}
LOCATION: ${land.village || ""}, ${land.taluka || ""}, ${land.district || "Unknown"}, ${land.state || "India"}
AREA: ${land.area_acres} acres (${landAreaHa.toFixed(2)} hectares)
SOIL TYPE: ${land.soil_type || "Black soil"}
SOIL pH: ${land.soil_ph || "7.0"} ${land.soil_ph && land.soil_ph < 6 ? "⚠️ ACIDIC" : land.soil_ph && land.soil_ph > 8 ? "⚠️ ALKALINE" : ""}
ORGANIC CARBON: ${land.organic_carbon_percent || "0.5"}%
PREVIOUS CROP: ${land.previous_crop || "Unknown"}

═══════════════════════════════════════════════════════════════
🌾 VERIFIED SEED DATA (MANDATORY - USE THESE EXACT VALUES!)
═══════════════════════════════════════════════════════════════
SEED RATE: ${seedData.rate_kg_per_acre} kg/acre
EXACT QUANTITY FOR ${land.area_acres} ACRES: ${exactSeedQty} kg
SEED PRICE: ₹${seedData.price_per_kg}/kg
TOTAL SEED COST: ₹${seedCost}
SPACING: ${seedData.spacing_cm}
SEED TREATMENT: ${seedData.treatment}
${isReadyMadePlant ? "⚠️ TRANSPLANTING - Calculate nursery/seedlings instead!" : ""}

═══════════════════════════════════════════════════════════════
🚿 IRRIGATION RULES (STRICT - NEVER VIOLATE!)
═══════════════════════════════════════════════════════════════
${irrigationRules}

═══════════════════════════════════════════════════════════════
🧪 SOIL & FERTILIZER DATA
═══════════════════════════════════════════════════════════════
NPK Status (kg/ha):
- Nitrogen: ${currentN} | Need: ${target.n} | Deficit: ${nDeficit.toFixed(0)}
- Phosphorus: ${currentP} | Need: ${target.p} | Deficit: ${pDeficit.toFixed(0)}
- Potassium: ${currentK} | Need: ${target.k} | ${currentK > target.k ? "EXCESS" : `Deficit: ${kDeficit.toFixed(0)}`}

CALCULATED FERTILIZER FOR ${land.area_acres} ACRES:
- FYM/Compost: ${fymTons} tons (apply 15-20 days before sowing)
- Urea: ${ureaKg} kg (46% N) - split in 3 doses
- DAP: ${dapKg} kg (18% N, 46% P) - basal + 1 top dress
- MOP: ${mopKg} kg (60% K) - basal application

${soilRecommendations}

═══════════════════════════════════════════════════════════════
⚠️ CRITICAL RULES FOR SCHEDULE GENERATION
═══════════════════════════════════════════════════════════════
1. QUANTITIES: Use ONLY the calculated values above for ${land.area_acres} acres
2. SEED QUANTITY: MUST be ${exactSeedQty} kg (NOT 54kg or any other value!)
3. SEED COST: MUST be ₹${seedCost} (at ₹${seedData.price_per_kg}/kg)
4. IRRIGATION: Follow ${irrigationType} method ONLY - ${irrigationType === "rainfed" ? "NO irrigation tasks!" : irrigationType === "manual" ? "NO drip/sprinkler!" : ""}
5. PRECAUTIONS: Generate ACTIVITY-SPECIFIC precautions, NOT generic mask/gloves for everything
6. PRICES: Use realistic 2024-25 market prices for inputs
7. CHEMICALS: Include Brand + Active Ingredient + Concentration + Dose/acre + PHI

EXAMPLE CORRECT FORMAT:
- Sowing task: "Seed Qty: ${exactSeedQty} kg at ₹${seedData.price_per_kg}/kg = ₹${seedCost}"
- Precaution for sowing: "ओलसर जमिनीतच पेरा" (soil moisture related, NOT mask/gloves)
- Precaution for pesticide: "मास्क व हातमोजे घाला, फवारणीनंतर हात धुवा" (PPE relevant for chemicals)`;

    const userPrompt = `Generate complete ${cropName} schedule for ${land.area_acres} acres starting ${sowingDate}.

MUST INCLUDE:
- ${isReadyMadePlant ? "Transplanting/sapling preparation" : "Seed treatment & sowing"} with EXACT ${exactSeedQty} kg seeds
- All fertilizer applications using calculated doses above
- Pest/disease management with brand names + doses
- Irrigation based on ${irrigationType} system
- Weeding and intercultural operations
- Harvest timing

Generate 12-18 tasks. Output in ${languageName} rural language.
IMPORTANT: Each task's precautions MUST be relevant to that specific activity!`;

    console.log("🤖 [AI] Calling API with verified seed data:", { seedQty: exactSeedQty, seedCost, irrigation: irrigationType });

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
              description: `Create verified ${cropName} schedule for ${land.area_acres} acres in ${languageName}`,
              parameters: {
                type: "object",
                properties: {
                  crop_name: { type: "string" },
                  total_duration_days: { type: "integer" },
                  expected_yield_quintals: { type: "number" },
                  total_estimated_cost: { type: "number" },
                  expected_profit: { type: "number" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task_name: { type: "string", description: "Task name in selected language" },
                        category: { 
                          type: "string", 
                          enum: ["land_preparation", "seed_treatment", "sowing", "transplanting", "fertilizer", 
                                 "irrigation", "weeding", "pest_control", "disease_control", "intercultural", "harvest", "other"],
                        },
                        days_from_sowing: { type: "integer" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        description: { type: "string" },
                        quantity: { type: "string", description: "Exact quantity with unit for this land area" },
                        product_details: { type: "string", description: "Brand + Active ingredient + concentration" },
                        unit_price: { type: "number", description: "Price per unit (kg/liter)" },
                        estimated_cost: { type: "number", description: "Total cost for this task" },
                        instructions: { type: "array", items: { type: "string" } },
                        precautions: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "ACTIVITY-SPECIFIC precautions only! Not generic mask/gloves for non-chemical tasks"
                        },
                        yield_impact: { type: "string" },
                        skip_penalty: { type: "string" },
                      },
                      required: ["task_name", "category", "days_from_sowing", "priority", "description", "instructions", "precautions"],
                    },
                  },
                },
                required: ["crop_name", "total_duration_days", "tasks"],
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

    // POST-PROCESS: Validate and fix precautions
    const processedTasks = scheduleData.tasks.map((task: any) => {
      const precautionType = getPrecautionType(task.category || "other", task.task_name || "");
      const langPrecautions = ACTIVITY_PRECAUTIONS[langKey] || ACTIVITY_PRECAUTIONS["hi"];
      const activityPrecautions = langPrecautions[precautionType] || langPrecautions["intercultural"];
      
      // Use AI precautions if they seem activity-specific, otherwise use our verified ones
      const aiPrecautions = task.precautions || [];
      const hasGenericPrecautions = aiPrecautions.some((p: string) => 
        p.includes("मास्क") || p.includes("mask") || p.includes("दस्ताने") || p.includes("gloves")
      );
      
      // For non-chemical tasks, replace generic precautions with activity-specific ones
      const isChemicalTask = ["pest_control", "disease_control", "fungicide", "pesticide"].includes(task.category?.toLowerCase()) ||
                            task.task_name?.toLowerCase().includes("फवारणी") ||
                            task.task_name?.toLowerCase().includes("spray") ||
                            task.product_details?.toLowerCase().includes("pesticide");
      
      let finalPrecautions = aiPrecautions;
      if (!isChemicalTask && hasGenericPrecautions) {
        // Replace generic mask/gloves with activity-specific precautions
        finalPrecautions = activityPrecautions;
        console.log(`🔄 Replaced generic precautions for ${task.task_name} with ${precautionType} precautions`);
      }

      return {
        ...task,
        precautions: finalPrecautions.length > 0 ? finalPrecautions : activityPrecautions,
      };
    });

    // Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from("crop_schedules").update({ is_active: false }).eq("land_id", landId).eq("is_active", true);
    }

    // Calculate harvest date
    const harvestDate = new Date(sowingDateParsed);
    harvestDate.setDate(harvestDate.getDate() + (scheduleData.total_duration_days || 120));
    const harvestDateStr = harvestDate.toISOString().split("T")[0];

    // Save schedule
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
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          isReadyMadePlant,
          land_area: land.area_acres,
          seed_data: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
          npk_deficit: { n: nDeficit, p: pDeficit, k: kDeficit },
          irrigation_type: irrigationType,
        },
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("❌ Schedule save error:", scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // Prepare and insert tasks with validated precautions
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
          unit_price: task.unit_price,
          yield_impact: task.yield_impact,
          skip_penalty: task.skip_penalty,
          days_from_sowing: task.days_from_sowing,
        },
        estimated_cost: task.estimated_cost,
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
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks with activity-specific precautions`);
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
        totalCost: scheduleData.total_estimated_cost,
        expectedProfit: scheduleData.expected_profit,
        seedData: { quantity: exactSeedQty, rate: seedData.rate_kg_per_acre, cost: seedCost },
        executionTimeMs: executionTime,
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
✅ Use: Drip scheduling, fertigation, water-efficient methods
✅ Calculate: Liters/hour, duration per session`,

    sprinkler: `IRRIGATION: Sprinkler system available
✅ Use: Sprinkler schedules, overhead irrigation
⚠️ Avoid spraying during high humidity (fungal risk)`,

    manual: `IRRIGATION: MANUAL watering only (NO drip/sprinkler!)
❌ DO NOT recommend drip or sprinkler - farmer doesn't have!
✅ Use: Flood irrigation, furrow, ring basin method
✅ Calculate: Water volume in liters per irrigation`,

    well: `IRRIGATION: Well-based system
✅ Use: Pump schedules, consider water table
⚠️ Plan around electricity/fuel availability`,

    canal: `IRRIGATION: Canal water
⚠️ Water depends on rotation schedule
✅ Plan around canal water availability days`,

    rainfed: `IRRIGATION: RAINFED (NO irrigation source!)
❌ DO NOT include any irrigation tasks!
✅ Focus: Rainwater harvesting, mulching, moisture conservation
✅ Use: Drought-tolerant practices`,
  };

  return rules[irrigationType] || rules["manual"];
}

function buildSoilRecommendations(land: any): string {
  const recs: string[] = [];

  if (land.soil_ph) {
    if (land.soil_ph < 6.0) {
      recs.push(`⚠️ ACIDIC SOIL (pH ${land.soil_ph}): Apply lime 2-4 quintals/acre before sowing`);
    } else if (land.soil_ph > 7.8) {
      recs.push(`⚠️ ALKALINE SOIL (pH ${land.soil_ph}): Apply gypsum 3-4 quintals/acre`);
    }
  }

  if (land.organic_carbon_percent && land.organic_carbon_percent < 0.5) {
    recs.push(`⚠️ LOW ORGANIC CARBON (${land.organic_carbon_percent}%): Must add FYM/compost 5-10 tons/acre`);
  }

  if (land.previous_crop) {
    const legumes = ["soybean", "groundnut", "moong", "urad", "gram", "tur", "चना", "मूंग"];
    if (legumes.some(l => land.previous_crop.toLowerCase().includes(l))) {
      recs.push(`✅ Previous legume crop (${land.previous_crop}): Reduce nitrogen by 20-25%`);
    }
  }

  return recs.length > 0 ? "\nSOIL AMENDMENTS REQUIRED:\n" + recs.join("\n") : "";
}
