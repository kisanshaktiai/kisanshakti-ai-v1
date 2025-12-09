// OPTIMIZED AI CROP SCHEDULE GENERATOR
// Fixed: Added serve(), imports, CORS, timeout, proper error handling

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token",
};

// ═══════════════════════════════════════════════════════════════════════
// COMPACT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════

const COMPACT_CROP_NAMES: Record<string, Record<string, string>> = {
  hi: { wheat: "गेहूं", rice: "धान", cotton: "कपास", soybean: "सोयाबीन", sugarcane: "गन्ना", maize: "मक्का", groundnut: "मूंगफली", onion: "प्याज", tomato: "टमाटर", potato: "आलू" },
  mr: { wheat: "गहू", rice: "भात", cotton: "कापूस", soybean: "सोयाबीन", sugarcane: "ऊस", maize: "मका", groundnut: "भुईमूग", onion: "कांदा", tomato: "टोमॅटो", potato: "बटाटा" },
  en: { wheat: "Wheat", rice: "Rice", cotton: "Cotton", soybean: "Soybean", sugarcane: "Sugarcane", maize: "Maize", groundnut: "Groundnut", onion: "Onion", tomato: "Tomato", potato: "Potato" },
};

const STAGE_ESSENTIALS: Record<string, { days: number; cat: string; tasks: number }> = {
  planning: { days: -7, cat: "planning", tasks: 2 },
  land_preparation: { days: -5, cat: "land_preparation", tasks: 2 },
  sowing: { days: 0, cat: "sowing", tasks: 3 },
  germination: { days: 7, cat: "irrigation", tasks: 2 },
  vegetative: { days: 30, cat: "fertilizer", tasks: 3 },
  reproductive: { days: 60, cat: "pest_control", tasks: 3 },
  maturity: { days: 90, cat: "irrigation", tasks: 2 },
  harvest: { days: 120, cat: "harvest", tasks: 2 },
  post_harvest: { days: 125, cat: "post_harvest", tasks: 2 },
};

const FARMING_RULES: Record<string, string> = {
  organic_only: "ONLY: FYM, Vermicompost, Neem, Trichoderma. NO chemicals.",
  fertilizer_pesticide: "USE: Urea, DAP, MOP, Pesticides. Brands: IFFCO, Bayer, Syngenta",
  organic_fertilizer: "Balanced: Organic first, then fertilizers if needed",
};

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function safeParsePrice(priceRange: unknown): number {
  if (!priceRange) return 0;
  if (typeof priceRange === "number") return priceRange;
  if (typeof priceRange === "string") {
    const match = priceRange.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  return 0;
}

function buildCompactPrompt(params: {
  cropName: string;
  translatedName: string;
  acres: number;
  farmingType: string;
  language: string;
  soilType: string;
  state: string;
  nDeficit: number;
  pDeficit: number;
  kDeficit: number;
  stageKeys: string[];
}): { system: string; user: string } {
  const { translatedName, acres, farmingType, language, soilType, state, nDeficit, pDeficit, kDeficit, stageKeys } = params;

  const system = `Expert agricultural scientist. Create ${translatedName} crop schedule.

CRITICAL RULES:
1. Crop name "${translatedName}" MUST appear in EVERY task_name
2. Language: ${language} rural dialect ONLY
3. Farming: ${FARMING_RULES[farmingType] || FARMING_RULES.organic_fertilizer}
4. Cover ALL ${stageKeys.length} stages: ${stageKeys.join(", ")}

LAND: ${acres} acres, ${soilType} soil, ${state}
NPK deficit: N=${nDeficit}, P=${pDeficit}, K=${kDeficit} kg/ha`;

  const user = `Generate ${translatedName} schedule:
- 18-27 tasks (2-3 per stage)
- task_name format: "${translatedName} - [action in ${language}]"
- Include: costs, products with brand names, yield impact
- All stages required: ${stageKeys.join(", ")}`;

  return { system, user };
}

function getMinimalSchema(translatedName: string, stages: string[]) {
  return {
    type: "function",
    function: {
      name: "create_schedule",
      description: `Create ${translatedName} farming schedule`,
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task_name: { type: "string", description: `Must contain "${translatedName}"` },
                stage: { type: "string", enum: stages },
                days: { type: "integer" },
                category: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                desc: { type: "string" },
                yield_impact: { type: "string" },
                cost: { type: "number" },
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      brand: { type: "string" },
                      dose: { type: "string" },
                      price: { type: "number" },
                    },
                  },
                },
                steps: { type: "array", items: { type: "string" } },
              },
              required: ["task_name", "stage", "days", "desc", "cost", "steps"],
            },
          },
          total_cost: { type: "number" },
          expected_yield: { type: "number" },
        },
        required: ["tasks"],
      },
    },
  };
}

function generateSmartFallback(missingStage: string, translatedName: string, acres: number, lang: string): Record<string, unknown> | null {
  const essentials = STAGE_ESSENTIALS[missingStage];
  if (!essentials) return null;

  const templates: Record<string, string> = {
    hi: `${translatedName} - ${missingStage} कार्य`,
    mr: `${translatedName} - ${missingStage} काम`,
    en: `${translatedName} - ${missingStage} task`,
  };

  return {
    task_name: templates[lang] || templates.en,
    stage: missingStage,
    days: essentials.days,
    category: essentials.cat,
    priority: "medium",
    desc: `Complete ${missingStage} for ${translatedName}`,
    yield_impact: "15-20%",
    cost: Math.round(acres * 300),
    steps: [`Execute ${missingStage} properly`],
    products: [],
    is_fallback: true,
  };
}

function validateAndFixTask(task: Record<string, unknown>, translatedName: string, farmingType: string): Record<string, unknown> {
  const taskName = String(task.task_name || "");
  
  // Fix 1: Ensure crop name is in task_name
  if (!taskName.includes(translatedName)) {
    task.task_name = `${translatedName} - ${taskName}`;
  }

  // Fix 2: Farming type compliance
  if (farmingType === "organic_only" && task.products) {
    const products = task.products as Array<Record<string, unknown>>;
    task.products = products.map((p) => {
      const name = String(p.name || "").toLowerCase();
      if (name.includes("urea") || name.includes("dap") || name.includes("mop")) {
        return { name: "Vermicompost", brand: "Organic", dose: "500kg/acre", price: 6000 };
      }
      if (name.includes("pesticide") || name.includes("imidacloprid") || name.includes("carbendazim")) {
        return { name: "Neem Oil", brand: "Organic India", dose: "2L/acre", price: 760 };
      }
      // Fix price handling
      p.price = safeParsePrice(p.price);
      return p;
    });
  }

  // Fix 3: Ensure cost is a number
  task.cost = safeParsePrice(task.cost) || Math.round((task.products as Array<Record<string, unknown>> || []).reduce((sum: number, p: Record<string, unknown>) => sum + safeParsePrice(p.price), 0)) || 500;

  return task;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("📅 [AI-Schedule] Request received");

  try {
    // Validate OpenAI key
    const OPENAI_API_KEY = validateOpenAIKey();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const body = await req.json();
    const { landId, cropName, sowingDate, language = "hi", farmingType = "organic_fertilizer" } = body;
    
    console.log("📥 [AI-Schedule] Input:", { landId, cropName, sowingDate, language, farmingType });

    if (!landId || !cropName || !sowingDate) {
      throw new Error("Missing required fields: landId, cropName, or sowingDate");
    }

    // Get translated crop name
    const langCrops = COMPACT_CROP_NAMES[language] || COMPACT_CROP_NAMES.en;
    const translatedName = langCrops[cropName.toLowerCase()] || cropName;
    console.log("🌾 [AI-Schedule] Crop:", { original: cropName, translated: translatedName });

    // Fetch land data and stages in parallel
    const [landResult, stagesResult] = await Promise.all([
      supabase.from("lands").select("*").eq("id", landId).single(),
      supabase.from("farming_stages").select("stage_key, stage_order, stage_name").eq("is_active", true).order("stage_order"),
    ]);

    if (landResult.error) {
      console.error("❌ [AI-Schedule] Land fetch error:", landResult.error);
      throw new Error(`Land not found: ${landResult.error.message}`);
    }
    if (stagesResult.error) {
      console.error("❌ [AI-Schedule] Stages fetch error:", stagesResult.error);
      throw new Error(`Stages not found: ${stagesResult.error.message}`);
    }

    const landData = landResult.data;
    const stageKeys = stagesResult.data.map((s) => s.stage_key);
    const acres = landData.area_acres || 1;

    console.log("🏞️ [AI-Schedule] Land:", { acres, soil: landData.soil_type, state: landData.state });
    console.log("📋 [AI-Schedule] Stages:", stageKeys);

    // Calculate NPK deficit
    const target = { wheat: 120, rice: 120, cotton: 120, soybean: 30, sugarcane: 150 }[cropName.toLowerCase()] || 100;
    const nDeficit = Math.max(0, target - (landData.nitrogen_kg_ha || 50));
    const pDeficit = Math.max(0, target * 0.5 - (landData.phosphorus_kg_ha || 25));
    const kDeficit = Math.max(0, target * 0.4 - (landData.potassium_kg_ha || 25));

    // Build prompt
    const prompts = buildCompactPrompt({
      cropName,
      translatedName,
      acres,
      farmingType,
      language,
      soilType: landData.soil_type || "black",
      state: landData.state || "Maharashtra",
      nDeficit,
      pDeficit,
      kDeficit,
      stageKeys,
    });

    console.log(`🤖 [AI-Schedule] Prompt size: ${prompts.system.length + prompts.user.length} chars`);

    // AI call with timeout and retry
    let aiResponse: Response | null = null;
    let lastError = "";
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [AI-Schedule] AI call attempt ${attempt}/${maxRetries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.REQUEST_TIMEOUT);

        aiResponse = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: AI_CONFIG.MODEL,
            max_tokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
            messages: [
              { role: "system", content: prompts.system },
              { role: "user", content: prompts.user },
            ],
            tools: [getMinimalSchema(translatedName, stageKeys)],
            tool_choice: { type: "function", function: { name: "create_schedule" } },
          }),
        });

        clearTimeout(timeoutId);

        if (aiResponse.ok) {
          console.log(`✅ [AI-Schedule] AI call succeeded on attempt ${attempt}`);
          break;
        }

        if (aiResponse.status === 502 || aiResponse.status === 503 || aiResponse.status === 504) {
          lastError = `Gateway error ${aiResponse.status}`;
          console.warn(`⚠️ [AI-Schedule] ${lastError}, retrying...`);
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
          }
        }

        const errorText = await aiResponse.text();
        lastError = `AI API error: ${aiResponse.status}`;
        console.error(`❌ [AI-Schedule] AI error:`, aiResponse.status, errorText.substring(0, 500));
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          lastError = `AI request timed out after ${AI_CONFIG.REQUEST_TIMEOUT}ms`;
        } else {
          lastError = `Network error: ${fetchError}`;
        }
        console.error(`❌ [AI-Schedule] Fetch error on attempt ${attempt}:`, lastError);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      throw new Error(lastError || "AI API failed after retries");
    }

    // Parse AI response
    const aiData = await aiResponse.json();
    console.log("📊 [AI-Schedule] AI response received");

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("❌ [AI-Schedule] Invalid AI response structure:", JSON.stringify(aiData).substring(0, 500));
      throw new Error("AI returned invalid response structure");
    }

    const scheduleData = JSON.parse(toolCall.function.arguments);
    console.log(`✅ [AI-Schedule] Parsed ${scheduleData.tasks?.length || 0} tasks from AI`);

    // Validate and fix tasks
    const validatedTasks = (scheduleData.tasks || [])
      .filter((t: Record<string, unknown>) => t.task_name && String(t.task_name).trim())
      .map((t: Record<string, unknown>) => validateAndFixTask(t, translatedName, farmingType));

    // Check stage coverage
    const covered = new Set(validatedTasks.map((t: Record<string, unknown>) => t.stage));
    const missing = stageKeys.filter((s) => !covered.has(s));
    console.log(`📋 [AI-Schedule] Stage coverage: ${covered.size}/${stageKeys.length}, missing: ${missing.join(", ") || "none"}`);

    // Generate fallbacks for missing stages
    const fallbacks = missing
      .map((stage) => generateSmartFallback(stage, translatedName, acres, language))
      .filter(Boolean);

    const allTasks = [...validatedTasks, ...fallbacks];
    console.log(`📦 [AI-Schedule] Total tasks: ${allTasks.length} (${validatedTasks.length} AI + ${fallbacks.length} fallback)`);

    // Get tenant and farmer from headers
    const tenantId = req.headers.get("x-tenant-id");
    const farmerId = req.headers.get("x-farmer-id");

    // Save schedule to DB
    const totalCost = scheduleData.total_cost || allTasks.reduce((sum: number, t: Record<string, unknown>) => sum + (safeParsePrice(t.cost) || 0), 0);
    const expectedYield = scheduleData.expected_yield || acres * 25;

    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: cropName,
        sowing_date: sowingDate,
        total_estimated_cost: totalCost,
        expected_yield_quintals: expectedYield,
        ai_model: AI_CONFIG.MODEL,
        is_active: true,
        farming_type: farmingType,
        generation_language: language,
        tasks_total_count: allTasks.length,
        metadata: {
          translated_crop_name: translatedName,
          execution_time_ms: Date.now() - startTime,
          stages_covered: Array.from(covered),
          fallback_stages: missing,
        },
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("❌ [AI-Schedule] Schedule save error:", scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    console.log(`💾 [AI-Schedule] Schedule saved: ${savedSchedule.id}`);

    // Prepare and insert tasks
    const tasksToInsert = allTasks.map((task: Record<string, unknown>, idx: number) => {
      const daysFromSowing = Number(task.days) || 0;
      const taskDate = new Date(new Date(sowingDate).getTime() + daysFromSowing * 86400000);
      
      return {
        schedule_id: savedSchedule.id,
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        task_name: task.task_name,
        task_type: task.category || "general",
        task_date: taskDate.toISOString().split("T")[0],
        days_from_sowing: daysFromSowing,
        priority: task.priority || "medium",
        task_description: task.desc || "",
        instructions: task.steps || [],
        stage_key: task.stage,
        yield_impact: task.yield_impact || "",
        product_recommendations: (task.products as Array<Record<string, unknown>> || []).map((p) => ({
          ...p,
          price: safeParsePrice(p.price),
        })),
        estimated_cost: safeParsePrice(task.cost),
        status: "pending",
        sequence_order: idx + 1,
      };
    });

    const { error: tasksError } = await supabase.from("schedule_tasks").insert(tasksToInsert);

    if (tasksError) {
      console.error("❌ [AI-Schedule] Tasks save error:", tasksError);
      throw new Error(`Failed to save tasks: ${tasksError.message}`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [AI-Schedule] Complete! ${allTasks.length} tasks in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName,
        translatedName,
        tasks: allTasks.length,
        executionTimeMs: executionTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ [AI-Schedule] Error after ${executionTime}ms:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: executionTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
