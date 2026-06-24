/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEAN PROMPT BUILDER - Reasoning-Only AI Prompts
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * AI should ONLY do:
 * - Task prioritization
 * - Scientific reasoning
 * - Risk & uncertainty explanation
 * 
 * AI should NOT do:
 * - Translate language
 * - Convert dialect
 * - Calculate costs
 * - Enforce banned words
 * - Decide chemical legality
 * 
 * This module builds minimal, stable prompts that reference rule_ids.
 * 
 * Version: 2.0.0
 * Target: 70-80% token reduction
 */

import { 
  NPK_TARGETS, 
  SEED_RATES, 
  CROP_DURATIONS,
  IRRIGATION_REQUIREMENTS,
  calculateNPKDeficit,
  getSplitSchedule
} from './agro-knowledge-base.ts';

import { 
  DecisionGraphOutput, 
  formatForAIPrompt 
} from './decision-graph-integration.ts';

export interface PromptContext {
  cropName: string;
  landAreaAcres: number;
  sowingDate: string;
  farmingType: 'organic_only' | 'fertilizer_pesticide' | 'organic_fertilizer';
  soilData: {
    ph: number;
    n: number;
    p: number;
    k: number;
    organic_carbon?: number;
    soil_type?: string;
  };
  weatherContext?: {
    rainfall_forecast: string;
    temperature_range: string;
    humidity: number;
  };
  ndviData?: {
    current: number;
    trend: 'improving' | 'declining' | 'stable';
  };
  stages: { stage_key: string; stage_name: string }[];
  isReadyMadePlant?: boolean;
  nurseryDays?: number;
}

export interface LeanPrompt {
  system: string;
  user: string;
  estimatedTokens: number;
}

/**
 * Build a lean, reasoning-focused system prompt
 * Target: <1000 tokens
 */
export function buildLeanSystemPrompt(): string {
  return `You are an AI Agricultural Scientist. Your role is REASONING and TASK PRIORITIZATION only.

## OUTPUT FORMAT (JSON)
Return ONLY a JSON object with this structure:
{
  "crop_name": "string",
  "total_duration_days": number,
  "expected_yield_quintals": number,
  "yield_multiplier_target": number,
  "tasks": [
    {
      "task_name": "string (English, concise action)",
      "stage_key": "string (from provided stages)",
      "days_from_sowing": number,
      "category": "string (fertilizer|pest_control|disease_control|irrigation|seed_treatment|sowing|harvesting|growth_promoter|organic_input|weeding|other)",
      "priority": "high|medium|low",
      "description": "string (1-2 sentences, scientific rationale)",
      "instructions": ["step1", "step2", "step3"],
      "based_on": ["rule_id or data source"],
      "confidence_score": 0.0-1.0,
      "risk_if_ignored": "string (yield/economic impact)",
      "scientific_reason": "string (why this task matters)",
      "product_hints": ["generic product type, not brand"]
    }
  ]
}

## CRITICAL RULES
1. Generate 2-3 tasks per stage
2. Use rule_ids in based_on (e.g., "NPK_WHEAT_001", "IPM_APHID_001")
3. Reference soil data in reasoning
4. Include confidence_score based on data quality
5. Express uncertainty when data is weak
6. DO NOT include: translated text, costs, specific brands, banned word checks
7. Keep task_name in English (translation happens post-AI)
8. Keep descriptions brief and scientific`;
}

/**
 * Build a lean user prompt with essential data only
 * Target: <2000 tokens (vs current 6000+)
 */
export function buildLeanUserPrompt(context: PromptContext): string {
  const cropLower = context.cropName.toLowerCase();
  
  // Get rule references
  const npkTarget = NPK_TARGETS[cropLower] || NPK_TARGETS.default;
  const seedRate = SEED_RATES[cropLower];
  const cropDuration = CROP_DURATIONS[cropLower] || CROP_DURATIONS.default;
  const irrigationReq = IRRIGATION_REQUIREMENTS[cropLower];
  
  // Calculate NPK deficit
  const npkDeficit = calculateNPKDeficit(cropLower, context.soilData.n, context.soilData.p, context.soilData.k);
  const splitSchedule = getSplitSchedule(cropLower, npkDeficit.n_deficit, npkDeficit.p_deficit, npkDeficit.k_deficit);
  
  // Build compact stage list
  const stagesCompact = context.stages.map(s => s.stage_key).join(', ');
  
  // Build minimal prompt
  let prompt = `## SCHEDULE REQUEST
Crop: ${context.cropName}
Area: ${context.landAreaAcres.toFixed(2)} acres
Sowing: ${context.sowingDate}
Mode: ${context.farmingType}

## SOIL DATA (rule: ${npkDeficit.rule_id})
pH: ${context.soilData.ph} | N: ${context.soilData.n} kg/ha | P: ${context.soilData.p} kg/ha | K: ${context.soilData.k} kg/ha
Type: ${context.soilData.soil_type || 'Unknown'}

## NPK PRESCRIPTION
N deficit: ${npkDeficit.n_deficit} kg/ha
P deficit: ${npkDeficit.p_deficit} kg/ha  
K deficit: ${npkDeficit.k_deficit} kg/ha
Split: ${splitSchedule.map(s => `${s.stage}(N:${s.n_kg},P:${s.p_kg},K:${s.k_kg})`).join(' → ')}`;

  // Add seed reference if available
  if (seedRate) {
    prompt += `\n\n## SEED (rule: ${seedRate.rule_id})
Rate: ${seedRate.rate_kg_per_acre} kg/acre
Spacing: ${seedRate.spacing_cm}
Treatment: ${context.farmingType === 'organic_only' ? seedRate.organic_treatment : seedRate.treatment}`;
  }

  // Add irrigation reference if available
  if (irrigationReq) {
    prompt += `\n\n## IRRIGATION (rule: ${irrigationReq.rule_id})
Interval: ${irrigationReq.interval_days} days
Critical stages: ${irrigationReq.critical_stages.join(', ')}`;
  }

  // Add NDVI if available
  if (context.ndviData) {
    prompt += `\n\n## NDVI DATA
Current: ${context.ndviData.current}
Trend: ${context.ndviData.trend}
${context.ndviData.trend === 'declining' ? '⚠️ NDVI declining - prioritize corrective measures' : ''}`;
  }

  // Add weather if available
  if (context.weatherContext) {
    prompt += `\n\n## WEATHER CONTEXT
Rainfall: ${context.weatherContext.rainfall_forecast}
Temp: ${context.weatherContext.temperature_range}
Humidity: ${context.weatherContext.humidity}%`;
  }

  // Add stages
  prompt += `\n\n## REQUIRED STAGES (${context.stages.length} stages)
${stagesCompact}

## DURATION (rule: ${cropDuration.rule_id})
Total: ${cropDuration.duration_days} days
Min tasks: ${cropDuration.min_tasks}`;

  // Add ready-made plant note if applicable
  if (context.isReadyMadePlant && context.nurseryDays) {
    prompt += `\n\n## READY-MADE PLANTS
Nursery age: ${context.nurseryDays} days
→ SKIP seed_treatment, START from transplanting`;
  }

  // Add farming mode constraints
  prompt += `\n\n## FARMING MODE: ${context.farmingType.toUpperCase()}`;
  if (context.farmingType === 'organic_only') {
    prompt += `\n→ Only organic inputs (Trichoderma, Neem, Vermicompost, FYM, Jeevamrut, Panchagavya)
→ Reference organic alternatives in product_hints`;
  } else if (context.farmingType === 'fertilizer_pesticide') {
    prompt += `\n→ Chemical inputs allowed (Urea, DAP, MOP, approved pesticides)`;
  }

  prompt += `\n\n## GENERATE SCHEDULE
- Create ${cropDuration.min_tasks}+ tasks across all stages
- Reference rule_ids in based_on field
- Include confidence_score based on data certainty
- Explain risk_if_ignored for each task
- Keep task_name in English (post-processing translates)`;

  return prompt;
}

/**
 * Build complete lean prompt package
 */
export function buildLeanPrompt(context: PromptContext): LeanPrompt {
  const system = buildLeanSystemPrompt();
  const user = buildLeanUserPrompt(context);
  
  // Rough token estimation (1 token ≈ 4 chars)
  const estimatedTokens = Math.ceil((system.length + user.length) / 4);
  
  return {
    system,
    user,
    estimatedTokens
  };
}

/**
 * Build function/tool schema for structured output
 * This ensures AI returns properly structured JSON
 */
export function buildToolSchema() {
  return {
    type: "function",
    function: {
      name: "generate_crop_schedule",
      description: "Generate a scientifically-validated crop schedule with reasoning",
      parameters: {
        type: "object",
        properties: {
          crop_name: { type: "string", description: "Crop name in English" },
          total_duration_days: { type: "number", description: "Total crop duration" },
          expected_yield_quintals: { type: "number", description: "Expected yield per acre" },
          yield_multiplier_target: { type: "number", description: "Yield improvement target (e.g., 3 for 3x)" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task_name: { type: "string", description: "Concise action in English" },
                stage_key: { type: "string", description: "Stage key from provided list" },
                days_from_sowing: { type: "number", description: "Days after sowing" },
                category: { 
                  type: "string", 
                  enum: ["fertilizer", "pest_control", "disease_control", "irrigation", "seed_treatment", "sowing", "harvesting", "growth_promoter", "organic_input", "weeding", "land_preparation", "monitoring", "other"]
                },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                description: { type: "string", description: "1-2 sentence scientific rationale" },
                instructions: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "2-4 concise steps"
                },
                based_on: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Rule IDs or data sources used"
                },
                confidence_score: { 
                  type: "number", 
                  minimum: 0, 
                  maximum: 1,
                  description: "Confidence in recommendation (0-1)"
                },
                risk_if_ignored: { type: "string", description: "Impact if task skipped" },
                scientific_reason: { type: "string", description: "Why this task is important" },
                product_hints: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Generic product types (not brands)"
                }
              },
              required: ["task_name", "stage_key", "days_from_sowing", "category", "priority", "description", "based_on", "confidence_score"]
            }
          }
        },
        required: ["crop_name", "total_duration_days", "expected_yield_quintals", "tasks"]
      }
    }
  };
}

/**
 * Compare token usage: old vs new
 */
export function getTokenSavingsEstimate(oldTokens: number, newTokens: number): {
  reduction: number;
  percentageSaved: number;
  costSavingsPerRequest: number;
} {
  const reduction = oldTokens - newTokens;
  const percentageSaved = Math.round((reduction / oldTokens) * 100);
  // Approximate cost at $0.002 per 1K tokens (GPT-4)
  const costSavingsPerRequest = (reduction / 1000) * 0.002;
  
  return {
    reduction,
    percentageSaved,
    costSavingsPerRequest
  };
}

/**
 * Validate AI response structure
 */
export function validateAIResponse(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!response.crop_name) errors.push('Missing crop_name');
  if (!response.total_duration_days) errors.push('Missing total_duration_days');
  if (!response.tasks || !Array.isArray(response.tasks)) errors.push('Missing or invalid tasks array');
  
  if (response.tasks) {
    response.tasks.forEach((task: any, i: number) => {
      if (!task.task_name) errors.push(`Task ${i}: missing task_name`);
      if (!task.stage_key) errors.push(`Task ${i}: missing stage_key`);
      if (typeof task.days_from_sowing !== 'number') errors.push(`Task ${i}: invalid days_from_sowing`);
      if (!task.category) errors.push(`Task ${i}: missing category`);
      if (!task.based_on || task.based_on.length === 0) errors.push(`Task ${i}: missing based_on references`);
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
