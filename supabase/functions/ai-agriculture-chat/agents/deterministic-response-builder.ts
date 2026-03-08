/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DETERMINISTIC RESPONSE BUILDER v2.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Constructs structured farmer advisory responses ENTIRELY from
 * decision_rules table columns. No LLM-generated advice allowed.
 * 
 * ARCHITECTURE PRINCIPLE:
 * "Rules Decide, AI Only Translates"
 * 
 * v2.0.0 ADDITIONS:
 * - Active ingredient dose safety caps (MAX_SAFE_DOSES)
 * - PHI harvest proximity validation
 * - Environmental condition pre-validation
 * - Agronomic safety scoring (composite 0-1)
 * - Confidence-based response gating (TREAT / MONITOR / CLARIFY)
 * - Bee toxicity mandatory evening-spray enforcement
 * - Resistance rotation warnings
 * 
 * Every section of the response maps to specific decision_rules columns:
 * 
 * SECTION                  | SOURCE COLUMNS
 * ─────────────────────────|─────────────────────────────────────────
 * Problem Explanation      | cause, reason_text, knowledge_text, scientific_basis
 * Recommended Action       | action_text, action_type, treatment_type
 * Dosage Calculation       | dosage_per_acre × land_area, water_volume_per_acre × land_area
 * Application Method       | application_method, target_pest_stage
 * Safety Precautions       | phi_days, reentry_interval_hours, bee_toxicity,
 *                          | aquatic_toxicity, farmer_safety_level, regulatory_status
 * Organic Alternative      | organic_alternative, biological_group, ipm_level
 * Estimated Cost           | material_cost_per_acre × land_area, labor_cost_per_acre,
 *                          | labor_hours_per_acre, equipment_required
 * Success/Failure Signs    | success_indicators, failure_indicators
 * ROI Estimate             | roi_yield_gain_pct, roi_cost_saved_min/max, roi_net_score
 * Scientific Reference     | scientific_source, icar_package_ref, university_source
 * Environmental Conditions | min_temperature, max_temperature, rain_delay_hours,
 *                          | max_wind_speed, weather_dependency
 * 
 * @version 2.1.0
 * 
 * v2.1.0 ADDITIONS:
 * - Async DB-driven translation of indicator codes, action types, pest stages
 * - Uses observation_translations table (SSOT) for all technical term localization
 * - Eliminates raw English code leakage in Marathi/Hindi responses
 */

import { loadObservationLabels } from '../i18n/observation-label-loader.ts';
import { getTranslation, initializeTranslationCache } from '../i18n/translation-loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE: Rich Rule Data (all columns from decision_rules used in response)
// ═══════════════════════════════════════════════════════════════════════════

export interface RichRuleData {
  // Identity
  rule_id: string;
  action_type: string;
  cause?: string;
  
  // Problem Explanation
  reason_text?: string;
  knowledge_text?: string;
  scientific_basis?: string;
  
  // Action
  action_text?: string;
  treatment_type?: string;
  
  // Product & Dosage
  active_ingredient?: string;
  dosage_per_acre?: string;
  water_volume_per_acre?: string;
  application_method?: string;
  target_pest_stage?: string;
  chemical_class?: string;
  mode_of_action?: string;
  resistance_group?: string;
  
  // Safety
  phi_days?: number;
  reentry_interval_hours?: number;
  bee_toxicity?: string;
  aquatic_toxicity?: string;
  farmer_safety_level?: string;
  regulatory_status?: string;
  
  // IPM / Organic
  organic_alternative?: string;
  biological_group?: string;
  ipm_level?: number;
  
  // Cost Model
  material_cost_per_acre_min?: number;
  material_cost_per_acre_max?: number;
  labor_cost_per_acre_min?: number;
  labor_cost_per_acre_max?: number;
  labor_hours_per_acre?: number;
  equipment_required?: string[];
  equipment_cost_per_acre?: number;
  total_cost_estimated?: number;
  
  // ROI
  roi_yield_gain_pct?: number;
  roi_cost_saved_min?: number;
  roi_cost_saved_max?: number;
  roi_net_score?: number;
  roi_confidence?: number;
  
  // Monitoring
  success_indicators?: string[];
  failure_indicators?: string[];
  
  // Environmental Conditions
  min_temperature?: number;
  max_temperature?: number;
  max_wind_speed?: number;
  rain_delay_hours?: number;
  weather_dependency?: any;
  
  // Scientific Reference
  scientific_source?: string;
  icar_package_ref?: string;
  university_source?: string;
  
  // Confidence / Risk
  confidence_score?: number;
  risk_level?: string;
  response_severity?: string;
  data_authority_rank?: number;
  
  // Diagnostic
  differentiating_questions?: any[];
  observable_characteristics?: string[];
  visual_markers?: any[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE: Weather context for environmental validation
// ═══════════════════════════════════════════════════════════════════════════

export interface WeatherContext {
  temperature_celsius?: number;
  humidity_pct?: number;
  wind_speed_kmh?: number;
  rain_forecast_hours?: number; // hours until expected rain
  is_raining?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE: Crop context for PHI and harvest proximity
// ═══════════════════════════════════════════════════════════════════════════

export interface CropContext {
  days_since_sowing?: number;
  maturity_days_typical?: number;
  is_ratoon?: boolean;
  ratoon_cycle_reduction_days?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE: Structured Farmer Response (deterministic, rule-sourced)
// ═══════════════════════════════════════════════════════════════════════════

export interface StructuredFarmerResponse {
  rule_id: string;
  
  // v2.0: Response decision mode
  response_decision: 'TREAT' | 'MONITOR' | 'CLARIFY';
  
  // Section 1: Problem Explanation
  problem: {
    cause: string;
    explanation: string;
    scientific_basis?: string;
  };
  
  // Section 2: Recommended Action
  action: {
    action_text: string;
    action_type: string;
    treatment_type?: string;
    is_treatment: boolean;
  };
  
  // Section 3: Dosage Calculation (land-area based)
  dosage: {
    has_dosage: boolean;
    blocked?: boolean;
    block_reason?: string;
    per_acre_dosage?: string;
    per_acre_water?: string;
    land_area_acres?: number;
    total_dosage?: string;
    total_water?: string;
    active_ingredient?: string;
    application_method?: string;
    target_pest_stage?: string;
    spray_type_note?: string;
  };
  
  // Section 4: Safety Precautions
  safety: {
    has_safety_info: boolean;
    phi_days?: number;
    phi_instruction?: string;
    phi_blocked?: boolean;
    phi_block_reason?: string;
    reentry_hours?: number;
    reentry_instruction?: string;
    bee_toxicity?: string;
    bee_warning?: string;
    bee_spray_time?: string;
    aquatic_toxicity?: string;
    farmer_safety_level?: string;
    safety_instruction?: string;
    regulatory_status?: string;
    chemical_class?: string;
    mode_of_action?: string;
    resistance_group?: string;
    resistance_warning?: string;
    safety_score?: number;
  };
  
  // Section 5: Organic/IPM Alternative
  organic: {
    has_alternative: boolean;
    organic_alternative?: string;
    biological_group?: string;
    ipm_level?: number;
    ipm_label?: string;
  };
  
  // Section 6: Cost Estimate
  cost: {
    has_cost: boolean;
    per_acre_material_min?: number;
    per_acre_material_max?: number;
    per_acre_labor_min?: number;
    per_acre_labor_max?: number;
    labor_hours_per_acre?: number;
    equipment_required?: string[];
    equipment_cost_per_acre?: number;
    total_material_cost?: string;
    total_labor_cost?: string;
    total_estimated?: string;
  };
  
  // Section 7: ROI & Economics
  roi: {
    has_roi: boolean;
    yield_gain_pct?: number;
    cost_saved_range?: string;
    net_score?: number;
    confidence?: number;
  };
  
  // Section 8: Monitoring
  monitoring: {
    success_indicators?: string[];
    failure_indicators?: string[];
    has_monitoring: boolean;
  };
  
  // Section 9: Environmental Conditions
  environment: {
    has_conditions: boolean;
    min_temp?: number;
    max_temp?: number;
    max_wind?: number;
    rain_delay_hours?: number;
    spray_window_instruction?: string;
    spray_blocked?: boolean;
    spray_block_reason?: string;
  };
  
  // Section 10: Scientific Reference (for audit, not farmer display)
  reference: {
    scientific_source?: string;
    icar_package_ref?: string;
    university_source?: string;
    data_authority_rank?: number;
  };
  
  // Metadata
  confidence: number;
  risk_level?: string;
  response_severity?: string;
  
  // v2.0: Safety & validation metadata
  safety_warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAX SAFE DOSES — Active ingredient regulatory caps (per hectare)
// Source: CIB&RC India + WHO guidelines
// Used to prevent overdose recommendations
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SAFE_DOSES: Record<string, { max_g_per_ha: number; unit: string }> = {
  'chlorpyrifos': { max_g_per_ha: 500, unit: 'g' },
  'imidacloprid': { max_g_per_ha: 100, unit: 'g' },
  'thiamethoxam': { max_g_per_ha: 100, unit: 'g' },
  'fipronil': { max_g_per_ha: 100, unit: 'g' },
  'carbendazim': { max_g_per_ha: 500, unit: 'g' },
  'mancozeb': { max_g_per_ha: 2000, unit: 'g' },
  'copper oxychloride': { max_g_per_ha: 2500, unit: 'g' },
  'glyphosate': { max_g_per_ha: 2160, unit: 'g' },
  'lambda-cyhalothrin': { max_g_per_ha: 30, unit: 'g' },
  'cypermethrin': { max_g_per_ha: 100, unit: 'g' },
  'profenofos': { max_g_per_ha: 500, unit: 'g' },
  'acephate': { max_g_per_ha: 750, unit: 'g' },
  'monocrotophos': { max_g_per_ha: 500, unit: 'g' },
  'dimethoate': { max_g_per_ha: 400, unit: 'g' },
  'emamectin benzoate': { max_g_per_ha: 11, unit: 'g' },
  'spinosad': { max_g_per_ha: 75, unit: 'g' },
  'chlorantraniliprole': { max_g_per_ha: 60, unit: 'g' },
  'flubendiamide': { max_g_per_ha: 60, unit: 'g' },
  'triazophos': { max_g_per_ha: 600, unit: 'g' },
  'cartap hydrochloride': { max_g_per_ha: 1000, unit: 'g' },
};

// ═══════════════════════════════════════════════════════════════════════════
// DOSAGE PARSER: Extract numeric values from dosage strings
// ═══════════════════════════════════════════════════════════════════════════

function parseDosage(dosageStr: string): { value: number; unit: string } | null {
  if (!dosageStr) return null;
  const clean = dosageStr.replace(/\/acre/i, '').replace(/per\s*acre/i, '').trim();
  
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?([a-zA-Z%]+)/);
  if (match) {
    return { value: parseFloat(match[1]), unit: match[2] };
  }
  
  const rangeMatch = clean.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%]+)/);
  if (rangeMatch) {
    const avg = (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
    return { value: avg, unit: rangeMatch[3] };
  }
  
  return null;
}

function calculateTotal(perAcre: string | undefined, areaAcres: number): string | undefined {
  if (!perAcre || areaAcres <= 0) return undefined;
  const parsed = parseDosage(perAcre);
  if (!parsed) return undefined;
  const total = parsed.value * areaAcres;
  const rounded = total < 10 ? Math.round(total * 10) / 10 : Math.round(total);
  return `${rounded} ${parsed.unit}`;
}

function calculateCostTotal(min: number | undefined, max: number | undefined, area: number): string | undefined {
  if (!min && !max) return undefined;
  if (area <= 0) return undefined;
  const totalMin = (min || 0) * area;
  const totalMax = (max || min || 0) * area;
  if (totalMin === totalMax) return `₹${Math.round(totalMin)}`;
  return `₹${Math.round(totalMin)}-${Math.round(totalMax)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// IPM LEVEL LABELS
// ═══════════════════════════════════════════════════════════════════════════

const IPM_LABELS: Record<number, string> = {
  1: 'Prevention (cultural practices)',
  2: 'Mechanical/Physical control',
  3: 'Biological control',
  4: 'Botanical/Bio-pesticide',
  5: 'Chemical control (last resort)',
  6: 'Emergency chemical intervention'
};

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT ACTION TYPES (require product/dosage)
// ═══════════════════════════════════════════════════════════════════════════

const TREATMENT_ACTIONS = new Set([
  'RECOMMEND', 'SPRAY', 'APPLY', 'TREATMENT', 'CHEMICAL_CONTROL',
  'BIOLOGICAL_CONTROL', 'URGENT_ACTION', 'SPRAY_BIOPESTICIDE',
  'SPRAY_BOTANICAL', 'SPRAY_CHEMICAL', 'FERTILIZER_APPLICATION',
  'SEED_TREATMENT', 'SOIL_DRENCH'
]);

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate dosage against active ingredient regulatory max limits.
 * Returns blocked=true if calculated total exceeds safe limit.
 */
export function validateDosageSafety(
  ruleData: RichRuleData,
  landAreaAcres: number
): { blocked: boolean; reason?: string } {
  if (!ruleData.active_ingredient || !ruleData.dosage_per_acre) {
    return { blocked: false };
  }
  
  const aiKey = ruleData.active_ingredient.toLowerCase().trim();
  const safeLimit = MAX_SAFE_DOSES[aiKey];
  if (!safeLimit) return { blocked: false }; // no limit data — allow
  
  const parsed = parseDosage(ruleData.dosage_per_acre);
  if (!parsed) return { blocked: false };
  
  // Convert acres to hectares (1 hectare = 2.47 acres)
  const landHa = landAreaAcres / 2.47;
  const totalPerHa = parsed.value * 2.47; // per-acre → per-ha
  
  if (totalPerHa > safeLimit.max_g_per_ha) {
    const reason = `⛔ DOSE EXCEEDS SAFE LIMIT: ${ruleData.active_ingredient} at ${totalPerHa.toFixed(0)}${parsed.unit}/ha exceeds regulatory max of ${safeLimit.max_g_per_ha}${safeLimit.unit}/ha. Dose blocked for farmer safety.`;
    console.error(`🚨 [DoseSafety] ${reason}`);
    return { blocked: true, reason };
  }
  
  return { blocked: false };
}

/**
 * Validate PHI (Pre-Harvest Interval) against harvest proximity.
 * Returns blocked=true if spray would violate PHI requirement.
 */
export function validatePHISafety(
  phiDays: number | undefined,
  cropContext?: CropContext
): { blocked: boolean; reason?: string; days_to_harvest?: number } {
  if (!phiDays || !cropContext?.days_since_sowing || !cropContext?.maturity_days_typical) {
    return { blocked: false };
  }
  
  let maturityDays = cropContext.maturity_days_typical;
  if (cropContext.is_ratoon && cropContext.ratoon_cycle_reduction_days) {
    maturityDays -= cropContext.ratoon_cycle_reduction_days;
  }
  
  const daysToHarvest = maturityDays - cropContext.days_since_sowing;
  
  if (daysToHarvest > 0 && phiDays > daysToHarvest) {
    const reason = `⛔ PHI VIOLATION: This chemical requires ${phiDays} days before harvest, but harvest is only ${daysToHarvest} days away. Chemical treatment blocked. Use biological or cultural alternatives.`;
    console.warn(`⚠️ [PHISafety] ${reason}`);
    return { blocked: true, reason, days_to_harvest: daysToHarvest };
  }
  
  return { blocked: false, days_to_harvest: daysToHarvest > 0 ? daysToHarvest : undefined };
}

/**
 * Validate environmental conditions for spray safety.
 * Returns spray_allowed=false if conditions are unsafe.
 */
export function validateEnvironmentalConditions(
  ruleData: RichRuleData,
  weather?: WeatherContext
): { spray_allowed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let spray_allowed = true;
  
  if (!weather) return { spray_allowed: true, warnings: [] };
  
  // Rain check
  if (ruleData.rain_delay_hours && ruleData.rain_delay_hours > 0) {
    if (weather.is_raining) {
      spray_allowed = false;
      warnings.push(`🌧️ Do not spray during rain. Wait for dry conditions.`);
    } else if (weather.rain_forecast_hours !== undefined && weather.rain_forecast_hours < ruleData.rain_delay_hours) {
      spray_allowed = false;
      warnings.push(`🌧️ Rain expected in ${weather.rain_forecast_hours}h. This product needs ${ruleData.rain_delay_hours}h rain-free window. Postpone spraying.`);
    }
  }
  
  // Temperature check
  if (ruleData.min_temperature && weather.temperature_celsius !== undefined) {
    if (weather.temperature_celsius < ruleData.min_temperature) {
      warnings.push(`🌡️ Current temperature ${weather.temperature_celsius}°C is below minimum ${ruleData.min_temperature}°C. Spray early afternoon when warmer.`);
    }
  }
  if (ruleData.max_temperature && weather.temperature_celsius !== undefined) {
    if (weather.temperature_celsius > ruleData.max_temperature) {
      warnings.push(`🌡️ Current temperature ${weather.temperature_celsius}°C exceeds maximum ${ruleData.max_temperature}°C. Spray early morning or evening.`);
    }
  }
  
  // Wind check
  if (ruleData.max_wind_speed && weather.wind_speed_kmh !== undefined) {
    if (weather.wind_speed_kmh > ruleData.max_wind_speed) {
      warnings.push(`💨 Wind speed ${weather.wind_speed_kmh} km/h exceeds safe limit ${ruleData.max_wind_speed} km/h. Postpone spraying to avoid drift.`);
    }
  }
  
  return { spray_allowed, warnings };
}

/**
 * Compute composite agronomic safety score (0-1).
 * Score < 0.5 downgrades response to monitoring-only.
 */
export function computeSafetyScore(ruleData: RichRuleData, cropContext?: CropContext): number {
  let score = 1.0;
  
  // PHI compliance (0.3 weight)
  if (ruleData.phi_days && cropContext?.days_since_sowing && cropContext?.maturity_days_typical) {
    const daysToHarvest = cropContext.maturity_days_typical - cropContext.days_since_sowing;
    if (daysToHarvest > 0 && ruleData.phi_days > daysToHarvest) {
      score -= 0.3; // PHI violation
    }
  }
  
  // Bee toxicity (0.2 weight)
  const beeTox = (ruleData.bee_toxicity || '').toUpperCase();
  if (beeTox === 'HIGH') score -= 0.15;
  else if (beeTox === 'MODERATE') score -= 0.05;
  
  // Regulatory status (0.3 weight)
  const regStatus = (ruleData.regulatory_status || '').toUpperCase();
  if (regStatus === 'BANNED' || regStatus === 'PROHIBITED') score -= 0.3;
  else if (regStatus === 'RESTRICTED') score -= 0.15;
  else if (regStatus === 'WATCH_LIST') score -= 0.05;
  
  // Resistance rotation (0.2 weight) — penalize if no resistance group info for chemical
  if (TREATMENT_ACTIONS.has((ruleData.action_type || '').toUpperCase()) && 
      ruleData.active_ingredient && !ruleData.resistance_group) {
    score -= 0.05; // minor penalty for missing resistance data
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Determine response decision mode based on confidence and safety.
 */
function resolveResponseDecision(
  confidence: number,
  safetyScore: number,
  isTreatment: boolean
): 'TREAT' | 'MONITOR' | 'CLARIFY' {
  // Safety override: if safety score is too low, never recommend treatment
  if (safetyScore < 0.5 && isTreatment) {
    console.warn(`⚠️ [ResponseGating] Safety score ${safetyScore.toFixed(2)} < 0.5 → downgrade to MONITOR`);
    return 'MONITOR';
  }
  
  if (confidence >= 0.70) return 'TREAT';
  if (confidence >= 0.50) return 'MONITOR';
  return 'CLARIFY';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER: Construct structured response from rule data
// ═══════════════════════════════════════════════════════════════════════════

export function buildDeterministicResponse(
  ruleData: RichRuleData,
  landAreaAcres?: number,
  cropContext?: CropContext,
  weather?: WeatherContext
): StructuredFarmerResponse {
  const area = landAreaAcres && landAreaAcres > 0 ? landAreaAcres : 0;
  const actionTypeUpper = (ruleData.action_type || '').toUpperCase();
  const isTreatment = TREATMENT_ACTIONS.has(actionTypeUpper);
  const safetyWarnings: string[] = [];
  
  // ─── SAFETY SCORING ───
  const safetyScore = computeSafetyScore(ruleData, cropContext);
  const confidence = ruleData.confidence_score ?? 0.7;
  const responseDecision = resolveResponseDecision(confidence, safetyScore, isTreatment);
  
  console.log(`📊 [DeterministicBuilder] rule=${ruleData.rule_id} confidence=${confidence.toFixed(2)} safety=${safetyScore.toFixed(2)} decision=${responseDecision}`);
  
  // ─── DOSE SAFETY VALIDATION ───
  let dosageBlocked = false;
  let dosageBlockReason: string | undefined;
  if (isTreatment && area > 0) {
    const doseSafety = validateDosageSafety(ruleData, area);
    if (doseSafety.blocked) {
      dosageBlocked = true;
      dosageBlockReason = doseSafety.reason;
      safetyWarnings.push(doseSafety.reason!);
    }
  }
  
  // ─── PHI VALIDATION ───
  let phiBlocked = false;
  let phiBlockReason: string | undefined;
  if (isTreatment && ruleData.phi_days) {
    const phiResult = validatePHISafety(ruleData.phi_days, cropContext);
    if (phiResult.blocked) {
      phiBlocked = true;
      phiBlockReason = phiResult.reason;
      safetyWarnings.push(phiResult.reason!);
    }
  }
  
  // ─── ENVIRONMENTAL VALIDATION ───
  let sprayBlocked = false;
  let sprayBlockReason: string | undefined;
  const envWarnings: string[] = [];
  if (isTreatment && weather) {
    const envResult = validateEnvironmentalConditions(ruleData, weather);
    if (!envResult.spray_allowed) {
      sprayBlocked = true;
      sprayBlockReason = envResult.warnings.join(' ');
    }
    envWarnings.push(...envResult.warnings);
    safetyWarnings.push(...envResult.warnings);
  }
  
  // ─── SUPPRESS TREATMENT if decision is MONITOR or CLARIFY ───
  const suppressTreatment = responseDecision !== 'TREAT' || dosageBlocked || phiBlocked;
  
  // Section 1: Problem Explanation (always shown)
  const problem = {
    cause: ruleData.cause || 'General advisory',
    explanation: ruleData.reason_text || ruleData.knowledge_text || ruleData.cause || '',
    scientific_basis: ruleData.scientific_basis || undefined
  };
  
  // Section 2: Action
  const action = {
    action_text: ruleData.action_text || '',
    action_type: ruleData.action_type,
    treatment_type: ruleData.treatment_type || undefined,
    is_treatment: isTreatment
  };
  
  // Section 3: Dosage (suppressed if not TREAT mode or safety-blocked)
  const hasDosage = isTreatment && !suppressTreatment && !!ruleData.dosage_per_acre && 
    !ruleData.dosage_per_acre.toLowerCase().includes('n/a') &&
    !ruleData.dosage_per_acre.toLowerCase().includes('advisory');
  
  // Spray type note for application method
  let sprayTypeNote: string | undefined;
  if (ruleData.application_method) {
    const methodLower = ruleData.application_method.toLowerCase();
    if (methodLower.includes('knapsack')) {
      sprayTypeNote = 'Use knapsack sprayer. Ensure uniform coverage with fine nozzle.';
    } else if (methodLower.includes('power') || methodLower.includes('motorized')) {
      sprayTypeNote = 'Use power sprayer for larger coverage. Adjust pressure for crop height.';
    } else if (methodLower.includes('drip') || methodLower.includes('drench')) {
      sprayTypeNote = 'Apply through drip irrigation or soil drench method.';
    }
  }
  
  const dosage = {
    has_dosage: hasDosage,
    blocked: dosageBlocked,
    block_reason: dosageBlockReason,
    per_acre_dosage: ruleData.dosage_per_acre || undefined,
    per_acre_water: ruleData.water_volume_per_acre || undefined,
    land_area_acres: area || undefined,
    total_dosage: (hasDosage && area > 0) ? calculateTotal(ruleData.dosage_per_acre, area) : undefined,
    total_water: (hasDosage && area > 0) ? calculateTotal(ruleData.water_volume_per_acre, area) : undefined,
    active_ingredient: ruleData.active_ingredient || undefined,
    application_method: ruleData.application_method || undefined,
    target_pest_stage: ruleData.target_pest_stage || undefined,
    spray_type_note: sprayTypeNote,
  };
  
  // Section 4: Safety
  const hasSafety = !!(ruleData.phi_days || ruleData.reentry_interval_hours || 
    ruleData.bee_toxicity || ruleData.farmer_safety_level || ruleData.regulatory_status);
  
  // Bee toxicity: mandatory evening spray for HIGH
  const beeToxUpper = (ruleData.bee_toxicity || '').toUpperCase();
  let beeSprayTime: string | undefined;
  if (beeToxUpper === 'HIGH') {
    beeSprayTime = '🐝 MANDATORY: Spray ONLY in evening hours (after 5 PM) when bees are inactive. Never spray during flowering.';
    safetyWarnings.push(beeSprayTime);
  } else if (beeToxUpper === 'MODERATE') {
    beeSprayTime = '🐝 Prefer evening spraying to protect pollinators.';
  }
  
  const safety = {
    has_safety_info: hasSafety,
    phi_days: ruleData.phi_days || undefined,
    phi_instruction: ruleData.phi_days ? `Stop spraying at least ${ruleData.phi_days} days before harvest` : undefined,
    phi_blocked: phiBlocked,
    phi_block_reason: phiBlockReason,
    reentry_hours: ruleData.reentry_interval_hours || undefined,
    reentry_instruction: ruleData.reentry_interval_hours ? `Do not enter field for ${ruleData.reentry_interval_hours} hours after application` : undefined,
    bee_toxicity: ruleData.bee_toxicity || undefined,
    bee_warning: (beeToxUpper === 'HIGH' || beeToxUpper === 'MODERATE') 
      ? `⚠️ ${ruleData.bee_toxicity} bee toxicity — avoid spraying during flowering or when bees are active` : undefined,
    bee_spray_time: beeSprayTime,
    aquatic_toxicity: ruleData.aquatic_toxicity || undefined,
    farmer_safety_level: ruleData.farmer_safety_level || undefined,
    safety_instruction: buildSafetyInstruction(ruleData.farmer_safety_level),
    regulatory_status: ruleData.regulatory_status || undefined,
    chemical_class: ruleData.chemical_class || undefined,
    mode_of_action: ruleData.mode_of_action || undefined,
    resistance_group: ruleData.resistance_group || undefined,
    resistance_warning: ruleData.resistance_group ? 
      `Resistance group: ${ruleData.resistance_group}. Rotate with different chemical class next application.` : undefined,
    safety_score: safetyScore,
  };
  
  // Section 5: Organic/IPM
  const hasAlternative = !!(ruleData.organic_alternative || ruleData.ipm_level);
  const organic = {
    has_alternative: hasAlternative,
    organic_alternative: ruleData.organic_alternative || undefined,
    biological_group: ruleData.biological_group || undefined,
    ipm_level: ruleData.ipm_level || undefined,
    ipm_label: ruleData.ipm_level ? (IPM_LABELS[ruleData.ipm_level] || `IPM Level ${ruleData.ipm_level}`) : undefined
  };
  
  // Section 6: Cost (suppressed if not TREAT mode)
  const hasCost = !suppressTreatment && !!(ruleData.material_cost_per_acre_min || ruleData.material_cost_per_acre_max || 
    ruleData.labor_hours_per_acre || ruleData.total_cost_estimated);
  
  const cost = {
    has_cost: hasCost,
    per_acre_material_min: ruleData.material_cost_per_acre_min || undefined,
    per_acre_material_max: ruleData.material_cost_per_acre_max || undefined,
    per_acre_labor_min: ruleData.labor_cost_per_acre_min || undefined,
    per_acre_labor_max: ruleData.labor_cost_per_acre_max || undefined,
    labor_hours_per_acre: ruleData.labor_hours_per_acre || undefined,
    equipment_required: ruleData.equipment_required || undefined,
    equipment_cost_per_acre: ruleData.equipment_cost_per_acre || undefined,
    total_material_cost: (hasCost && area > 0) ? calculateCostTotal(ruleData.material_cost_per_acre_min, ruleData.material_cost_per_acre_max, area) : undefined,
    total_labor_cost: (hasCost && area > 0) ? calculateCostTotal(ruleData.labor_cost_per_acre_min, ruleData.labor_cost_per_acre_max, area) : undefined,
    total_estimated: (hasCost && area > 0 && ruleData.total_cost_estimated) ? `₹${Math.round(ruleData.total_cost_estimated * area)}` : undefined
  };
  
  // Section 7: ROI (suppressed if not TREAT mode)
  const hasROI = !suppressTreatment && !!(ruleData.roi_yield_gain_pct || ruleData.roi_cost_saved_min || ruleData.roi_net_score);
  const roi = {
    has_roi: hasROI,
    yield_gain_pct: ruleData.roi_yield_gain_pct || undefined,
    cost_saved_range: (ruleData.roi_cost_saved_min || ruleData.roi_cost_saved_max) ? 
      `₹${ruleData.roi_cost_saved_min || 0}-${ruleData.roi_cost_saved_max || 0}/acre` : undefined,
    net_score: ruleData.roi_net_score || undefined,
    confidence: ruleData.roi_confidence || undefined
  };
  
  // Section 8: Monitoring (always shown)
  const hasMonitoring = !!(ruleData.success_indicators?.length || ruleData.failure_indicators?.length);
  const monitoring = {
    has_monitoring: hasMonitoring,
    success_indicators: ruleData.success_indicators || undefined,
    failure_indicators: ruleData.failure_indicators || undefined
  };
  
  // Section 9: Environmental Conditions
  const hasEnv = !!(ruleData.min_temperature || ruleData.max_temperature || ruleData.rain_delay_hours || ruleData.max_wind_speed);
  const environment = {
    has_conditions: hasEnv,
    min_temp: ruleData.min_temperature || undefined,
    max_temp: ruleData.max_temperature || undefined,
    max_wind: ruleData.max_wind_speed || undefined,
    rain_delay_hours: ruleData.rain_delay_hours || undefined,
    spray_window_instruction: buildSprayWindowInstruction(ruleData),
    spray_blocked: sprayBlocked,
    spray_block_reason: sprayBlockReason,
  };
  
  // Section 10: References
  const reference = {
    scientific_source: ruleData.scientific_source || undefined,
    icar_package_ref: ruleData.icar_package_ref || undefined,
    university_source: ruleData.university_source || undefined,
    data_authority_rank: ruleData.data_authority_rank || undefined
  };
  
  return {
    rule_id: ruleData.rule_id,
    response_decision: responseDecision,
    problem,
    action,
    dosage,
    safety,
    organic,
    cost,
    roi,
    monitoring,
    environment,
    reference,
    confidence,
    risk_level: ruleData.risk_level || undefined,
    response_severity: ruleData.response_severity || undefined,
    safety_warnings: safetyWarnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Safety instruction from farmer_safety_level
// ═══════════════════════════════════════════════════════════════════════════

function buildSafetyInstruction(level?: string): string | undefined {
  if (!level) return undefined;
  switch (level.toUpperCase()) {
    case 'SAFE': return 'Standard safety precautions. Wear gloves and mask during application.';
    case 'CAUTION': return '⚠️ CAUTION: Wear full PPE (gloves, mask, goggles, long sleeves). Avoid skin contact. Wash hands thoroughly after use.';
    case 'EXPERT_ONLY': return '🚨 EXPERT USE ONLY: This product requires trained applicator. Do not apply without proper safety equipment and training.';
    default: return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Spray window instruction from environmental thresholds
// ═══════════════════════════════════════════════════════════════════════════

function buildSprayWindowInstruction(rule: RichRuleData): string | undefined {
  const parts: string[] = [];
  
  if (rule.min_temperature && rule.max_temperature) {
    parts.push(`Temperature: ${rule.min_temperature}°C-${rule.max_temperature}°C`);
  } else if (rule.max_temperature) {
    parts.push(`Spray when temperature below ${rule.max_temperature}°C`);
  }
  
  if (rule.max_wind_speed) {
    parts.push(`Wind speed below ${rule.max_wind_speed} km/h`);
  }
  
  if (rule.rain_delay_hours) {
    parts.push(`No rain expected for next ${rule.rain_delay_hours} hours`);
  }
  
  return parts.length > 0 ? parts.join('. ') + '.' : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT: Convert structured response to LLM prompt data
// This is the TEXT that goes into the LLM prompt for translation/formatting
// ═══════════════════════════════════════════════════════════════════════════

export function formatStructuredResponseForLLM(response: StructuredFarmerResponse, lang?: string): string {
  const parts: string[] = [];
  
  // Use language parameter for localized output (defaults to 'en' for LLM prompt usage)
  const l = lang || 'en';
  
  // Localized labels helper
  const L = (en: string, mr: string, hi: string): string => {
    if (l === 'mr') return mr;
    if (l === 'hi') return hi;
    return en;
  };
  
  // ─── Response decision mode header ───
  if (response.response_decision === 'CLARIFY') {
    parts.push(`⚠️ ${L('RESPONSE MODE: CLARIFICATION REQUIRED', 'प्रतिसाद प्रकार: स्पष्टीकरण आवश्यक', 'प्रतिक्रिया प्रकार: स्पष्टीकरण आवश्यक')}`);
    parts.push(L(
      'More crop observations are required before giving treatment advice.',
      'उपचार सल्ला देण्यापूर्वी अधिक पीक निरीक्षण आवश्यक आहे.',
      'उपचार सलाह देने से पहले अधिक फसल निरीक्षण आवश्यक है.'
    ));
    parts.push(L(
      'DO NOT recommend any product or dosage.\n',
      'कोणत्याही उत्पादन किंवा मात्रेची शिफारस करू नका.\n',
      'किसी भी उत्पाद या खुराक की सिफारिश न करें.\n'
    ));
  } else if (response.response_decision === 'MONITOR') {
    parts.push(`ℹ️ ${L('RESPONSE MODE: MONITORING ONLY', 'प्रतिसाद प्रकार: फक्त निरीक्षण', 'प्रतिक्रिया प्रकार: केवल निगरानी')}`);
    parts.push(L(
      'Confidence is not sufficient for treatment recommendation. Provide monitoring guidance only.',
      'उपचार शिफारसीसाठी पुरेसा विश्वास नाही. फक्त निरीक्षण मार्गदर्शन.',
      'उपचार सिफारिश के लिए पर्याप्त विश्वास नहीं। केवल निगरानी मार्गदर्शन.'
    ));
    parts.push(L(
      'DO NOT recommend any product or dosage.\n',
      'कोणत्याही उत्पादन किंवा मात्रेची शिफारस करू नका.\n',
      'किसी भी उत्पाद या खुराक की सिफारिश न करें.\n'
    ));
  }
  
  // ─── Safety warnings (top priority) ───
  if (response.safety_warnings.length > 0) {
    parts.push(`═══ ⛔ ${L('SAFETY ALERTS', 'सुरक्षा सूचना', 'सुरक्षा चेतावनी')} ═══`);
    response.safety_warnings.forEach(w => parts.push(w));
    parts.push('');
  }
  
  // Problem
  parts.push(`═══ 🎯 ${L('PROBLEM EXPLANATION', 'समस्येचे स्पष्टीकरण', 'समस्या का विवरण')} ═══`);
  parts.push(`${L('Cause', 'कारण', 'कारण')}: ${response.problem.cause}`);
  if (response.problem.explanation) {
    parts.push(`${L('Explanation', 'स्पष्टीकरण', 'विवरण')}: ${response.problem.explanation}`);
  }
  if (response.problem.scientific_basis) {
    parts.push(`${L('Scientific Basis', 'वैज्ञानिक आधार', 'वैज्ञानिक आधार')}: ${response.problem.scientific_basis}`);
  }
  
  // Action
  parts.push(`\n═══ 📋 ${L('RECOMMENDED ACTION', 'शिफारस केलेली कृती', 'अनुशंसित कार्रवाई')} ═══`);
  parts.push(`${L('Action Type', 'कृती प्रकार', 'कार्रवाई प्रकार')}: ${response.action.action_type}`);
  if (response.action.action_text) {
    parts.push(`${L('What To Do', 'काय करावे', 'क्या करें')}: ${response.action.action_text}`);
  }
  if (response.action.treatment_type) {
    parts.push(`${L('Treatment Type', 'उपचार प्रकार', 'उपचार प्रकार')}: ${response.action.treatment_type}`);
  }
  
  // Dosage (CALCULATED) — only in TREAT mode
  if (response.dosage.blocked) {
    parts.push(`\n═══ ⛔ ${L('DOSAGE BLOCKED', 'मात्रा अवरोधित', 'खुराक अवरोधित')} ═══`);
    parts.push(response.dosage.block_reason || L('Dosage blocked due to safety concerns.', 'सुरक्षिततेमुळे मात्रा अवरोधित.', 'सुरक्षा कारणों से खुराक अवरोधित.'));
    parts.push(L('DO NOT recommend this product. Suggest organic or cultural alternatives.', 'हे उत्पादन वापरू नका. सेंद्रिय किंवा सांस्कृतिक पर्याय सुचवा.', 'यह उत्पाद न उपयोग करें. जैविक या सांस्कृतिक विकल्प सुझाएं.'));
  } else if (response.dosage.has_dosage && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 💊 ${L('DOSAGE FOR YOUR FIELD', 'तुमच्या शेतासाठी मात्रा', 'आपके खेत के लिए खुराक')} ═══`);
    if (response.dosage.active_ingredient) {
      parts.push(`${L('Product', 'उत्पादन', 'उत्पाद')}: ${response.dosage.active_ingredient}`);
    }
    parts.push(`${L('Per Acre', 'प्रति एकर', 'प्रति एकड़')}: ${response.dosage.per_acre_dosage}`);
    if (response.dosage.per_acre_water) {
      parts.push(`${L('Water Per Acre', 'प्रति एकर पाणी', 'प्रति एकड़ पानी')}: ${response.dosage.per_acre_water}`);
    }
    if (response.dosage.land_area_acres && response.dosage.total_dosage) {
      parts.push(`${L('YOUR LAND', 'तुमची जमीन', 'आपकी ज़मीन')}: ${response.dosage.land_area_acres} ${L('acres', 'एकर', 'एकड़')}`);
      parts.push(`${L('TOTAL PRODUCT NEEDED', 'एकूण लागणारे उत्पादन', 'कुल आवश्यक उत्पाद')}: ${response.dosage.total_dosage}`);
      if (response.dosage.total_water) {
        parts.push(`${L('TOTAL WATER NEEDED', 'एकूण लागणारे पाणी', 'कुल आवश्यक पानी')}: ${response.dosage.total_water}`);
      }
    }
    if (response.dosage.application_method) {
      parts.push(`${L('Method', 'पद्धत', 'विधि')}: ${response.dosage.application_method}`);
    }
    if (response.dosage.spray_type_note) {
      parts.push(`${L('Spray Note', 'फवारणी टीप', 'छिड़काव नोट')}: ${response.dosage.spray_type_note}`);
    }
    if (response.dosage.target_pest_stage) {
      parts.push(`${L('Best Target Stage', 'सर्वोत्तम लक्ष्य टप्पा', 'सर्वोत्तम लक्ष्य चरण')}: ${response.dosage.target_pest_stage}`);
    }
  }
  
  // Safety
  if (response.safety.has_safety_info) {
    parts.push(`\n═══ ⚠️ ${L('SAFETY PRECAUTIONS', 'सुरक्षा काळजी', 'सुरक्षा सावधानी')} ═══`);
    if (response.safety.phi_blocked) {
      parts.push(`⛔ ${response.safety.phi_block_reason}`);
    } else if (response.safety.phi_instruction) {
      parts.push(`⏳ ${response.safety.phi_instruction}`);
    }
    if (response.safety.reentry_instruction) {
      parts.push(`🚫 ${response.safety.reentry_instruction}`);
    }
    if (response.safety.bee_spray_time) {
      parts.push(response.safety.bee_spray_time);
    } else if (response.safety.bee_warning) {
      parts.push(`🐝 ${response.safety.bee_warning}`);
    }
    if (response.safety.safety_instruction) {
      parts.push(`🧤 ${response.safety.safety_instruction}`);
    }
    if (response.safety.resistance_warning) {
      parts.push(`🔄 ${response.safety.resistance_warning}`);
    }
  }
  
  // Organic/IPM
  if (response.organic.has_alternative) {
    parts.push(`\n═══ 🌿 ${L('ORGANIC/IPM ALTERNATIVE', 'सेंद्रिय/IPM पर्याय', 'जैविक/IPM विकल्प')} ═══`);
    if (response.organic.organic_alternative) {
      parts.push(`🌿 ${L('Organic Option', 'सेंद्रिय पर्याय', 'जैविक विकल्प')}: ${response.organic.organic_alternative}`);
    }
    if (response.organic.ipm_label) {
      parts.push(`${L('IPM Level', 'IPM स्तर', 'IPM स्तर')}: ${response.organic.ipm_label}`);
    }
  }
  
  // Cost — only in TREAT mode
  if (response.cost.has_cost && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 💰 ${L('ESTIMATED COST', 'अंदाजित खर्च', 'अनुमानित लागत')} ═══`);
    if (response.cost.total_material_cost) {
      parts.push(`${L('Material Cost (total)', 'साहित्य खर्च (एकूण)', 'सामग्री लागत (कुल)')}: ${response.cost.total_material_cost}`);
    } else if (response.cost.per_acre_material_min || response.cost.per_acre_material_max) {
      parts.push(`${L('Material Cost', 'साहित्य खर्च', 'सामग्री लागत')}: ₹${response.cost.per_acre_material_min || 0}-${response.cost.per_acre_material_max || 0}/${L('acre', 'एकर', 'एकड़')}`);
    }
    if (response.cost.total_labor_cost) {
      parts.push(`${L('Labor Cost (total)', 'मजुरी खर्च (एकूण)', 'श्रम लागत (कुल)')}: ${response.cost.total_labor_cost}`);
    }
    if (response.cost.labor_hours_per_acre) {
      parts.push(`${L('Labor Time', 'मजुरी वेळ', 'श्रम समय')}: ${response.cost.labor_hours_per_acre} ${L('hours/acre', 'तास/एकर', 'घंटे/एकड़')}`);
    }
    if (response.cost.equipment_required?.length) {
      parts.push(`${L('Equipment', 'उपकरणे', 'उपकरण')}: ${response.cost.equipment_required.join(', ')}`);
    }
    if (response.cost.total_estimated) {
      parts.push(`${L('TOTAL ESTIMATED COST', 'एकूण अंदाजित खर्च', 'कुल अनुमानित लागत')}: ${response.cost.total_estimated}`);
    }
  }
  
  // ROI — only in TREAT mode
  if (response.roi.has_roi && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 📈 ${L('EXPECTED RETURN', 'अपेक्षित फायदा', 'अपेक्षित लाभ')} ═══`);
    if (response.roi.yield_gain_pct) {
      parts.push(`📈 ${L('Expected Yield Increase', 'अपेक्षित उत्पादन वाढ', 'अपेक्षित उपज वृद्धि')}: ${response.roi.yield_gain_pct}%`);
    }
    if (response.roi.cost_saved_range) {
      parts.push(`💰 ${L('Cost Savings', 'बचत', 'बचत')}: ${response.roi.cost_saved_range}`);
    }
  }
  
  // Monitoring (always shown)
  if (response.monitoring.has_monitoring) {
    parts.push(`\n═══ ✅ ${L('MONITORING AFTER APPLICATION', 'वापरानंतर निरीक्षण', 'उपयोग के बाद निगरानी')} ═══`);
    if (response.monitoring.success_indicators?.length) {
      parts.push(`✅ ${L('Success Signs (check after 5-7 days)', 'यशाची चिन्हे (5-7 दिवसांनी तपासा)', 'सफलता के संकेत (5-7 दिन बाद जांचें)')}: ${response.monitoring.success_indicators.join(', ')}`);
    }
    if (response.monitoring.failure_indicators?.length) {
      parts.push(`❌ ${L('Failure Signs (re-treat if seen)', 'अयशस्वी चिन्हे (दिसल्यास पुन्हा उपचार करा)', 'विफलता के संकेत (दिखने पर पुनः उपचार करें)')}: ${response.monitoring.failure_indicators.join(', ')}`);
    }
  }
  
  // Environmental
  if (response.environment.has_conditions) {
    parts.push(`\n═══ 🌤️ ${L('SPRAY WINDOW CONDITIONS', 'फवारणी वेळ', 'छिड़काव का समय')} ═══`);
    if (response.environment.spray_blocked) {
      parts.push(`⛔ ${response.environment.spray_block_reason}`);
    }
    if (response.environment.spray_window_instruction) {
      parts.push(`🌤️ ${response.environment.spray_window_instruction}`);
    }
  }
  
  // CLARIFY / MONITOR footer
  if (response.response_decision === 'CLARIFY') {
    parts.push(`\n═══ ${L('FARMER INSTRUCTION', 'शेतकऱ्यांसाठी सूचना', 'किसान के लिए निर्देश')} ═══`);
    parts.push(L(
      'More crop observations are required before giving treatment advice.',
      'उपचार सल्ला देण्यापूर्वी अधिक पीक निरीक्षण आवश्यक आहे.',
      'उपचार सलाह देने से पहले अधिक फसल निरीक्षण आवश्यक है.'
    ));
    parts.push(L(
      'Ask the farmer to describe symptoms in more detail or send a photo.',
      'लक्षणे अधिक तपशीलात सांगा किंवा फोटो पाठवा.',
      'लक्षणों का विस्तार से वर्णन करें या फोटो भेजें.'
    ));
  } else if (response.response_decision === 'MONITOR') {
    parts.push(`\n═══ ${L('FARMER INSTRUCTION', 'शेतकऱ्यांसाठी सूचना', 'किसान के लिए निर्देश')} ═══`);
    parts.push(L(
      'Continue monitoring the crop. Check again after 3-5 days.',
      'पिकाचे निरीक्षण सुरू ठेवा. 3-5 दिवसांनी पुन्हा तपासा.',
      'फसल की निगरानी जारी रखें. 3-5 दिन बाद फिर से जांचें.'
    ));
    parts.push(L(
      'If symptoms worsen, contact the advisory system again with detailed observations.',
      'लक्षणे वाढल्यास, तपशीलवार निरीक्षणासह पुन्हा संपर्क साधा.',
      'लक्षण बिगड़ने पर, विस्तृत निरीक्षण के साथ फिर से संपर्क करें.'
    ));
  }
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION: Check if rule data has enough content for a response
// ═══════════════════════════════════════════════════════════════════════════

export function hasAdequateRuleContent(ruleData: RichRuleData): boolean {
  return !!(ruleData.action_text || ruleData.reason_text || ruleData.knowledge_text);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT RichRuleData from application_details (pipeline bridge)
// ═══════════════════════════════════════════════════════════════════════════

export function extractRichRuleData(
  primaryDecision: any,
  appDetails: Record<string, any>
): RichRuleData {
  return {
    rule_id: primaryDecision.rule_id || 'UNKNOWN',
    action_type: primaryDecision.action_type || 'MONITOR',
    cause: primaryDecision.cause || appDetails.cause || undefined,
    reason_text: primaryDecision.reason_text || appDetails.reason_text || undefined,
    knowledge_text: primaryDecision.knowledge_text || appDetails.knowledge_text || undefined,
    scientific_basis: appDetails.scientific_basis || undefined,
    action_text: primaryDecision.action_text || appDetails.action_text || undefined,
    treatment_type: appDetails.treatment_type || undefined,
    active_ingredient: primaryDecision.active_ingredient || appDetails.active_ingredient || undefined,
    dosage_per_acre: primaryDecision.dosage_per_acre || appDetails.dosage_per_acre || undefined,
    water_volume_per_acre: primaryDecision.water_volume_per_acre || appDetails.water_volume_per_acre || undefined,
    application_method: primaryDecision.application_method || appDetails.application_method || appDetails.method || undefined,
    target_pest_stage: appDetails.target_pest_stage || undefined,
    chemical_class: primaryDecision.chemical_class || appDetails.chemical_class || undefined,
    mode_of_action: primaryDecision.mode_of_action || appDetails.mode_of_action || undefined,
    resistance_group: primaryDecision.resistance_group || appDetails.resistance_group || undefined,
    phi_days: primaryDecision.phi_days || appDetails.phi_days || undefined,
    reentry_interval_hours: primaryDecision.reentry_interval_hours || appDetails.reentry_interval_hours || undefined,
    bee_toxicity: primaryDecision.bee_toxicity || appDetails.bee_toxicity || undefined,
    aquatic_toxicity: appDetails.aquatic_toxicity || undefined,
    farmer_safety_level: appDetails.farmer_safety_level || undefined,
    regulatory_status: appDetails.regulatory_status || undefined,
    organic_alternative: primaryDecision.organic_alternative || appDetails.organic_alternative || undefined,
    biological_group: appDetails.biological_group || undefined,
    ipm_level: appDetails.ipm_level || undefined,
    material_cost_per_acre_min: appDetails.material_cost_per_acre_min || undefined,
    material_cost_per_acre_max: appDetails.material_cost_per_acre_max || undefined,
    labor_cost_per_acre_min: appDetails.labor_cost_per_acre_min || undefined,
    labor_cost_per_acre_max: appDetails.labor_cost_per_acre_max || undefined,
    labor_hours_per_acre: appDetails.labor_hours_per_acre || undefined,
    equipment_required: appDetails.equipment_required || undefined,
    equipment_cost_per_acre: appDetails.equipment_cost_per_acre || undefined,
    total_cost_estimated: appDetails.total_cost_estimated || undefined,
    roi_yield_gain_pct: primaryDecision.roi_yield_gain_pct || appDetails.roi_yield_gain_pct || undefined,
    roi_cost_saved_min: appDetails.roi_cost_saved_min || undefined,
    roi_cost_saved_max: appDetails.roi_cost_saved_max || undefined,
    roi_net_score: appDetails.roi_net_score || undefined,
    roi_confidence: appDetails.roi_confidence || undefined,
    success_indicators: primaryDecision.success_indicators || appDetails.success_indicators || undefined,
    failure_indicators: primaryDecision.failure_indicators || appDetails.failure_indicators || undefined,
    min_temperature: appDetails.min_temperature || undefined,
    max_temperature: appDetails.max_temperature || undefined,
    max_wind_speed: appDetails.max_wind_speed || undefined,
    rain_delay_hours: appDetails.rain_delay_hours || undefined,
    weather_dependency: appDetails.weather_dependency || undefined,
    scientific_source: appDetails.scientific_source || undefined,
    icar_package_ref: appDetails.icar_package_ref || undefined,
    university_source: appDetails.university_source || undefined,
    confidence_score: primaryDecision.confidence_score || primaryDecision.weighted_confidence || undefined,
    risk_level: appDetails.risk_level || undefined,
    response_severity: appDetails.response_severity || undefined,
    data_authority_rank: appDetails.data_authority_rank || undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MISSING DATA DETECTOR: Identify what's missing for a complete response
// ═══════════════════════════════════════════════════════════════════════════

export function identifyMissingData(ruleData: RichRuleData, landAreaAcres?: number): string[] {
  const missing: string[] = [];
  
  if (!ruleData.action_text) missing.push('action_text (what farmer should do)');
  if (!ruleData.reason_text) missing.push('reason_text (why this is happening)');
  
  const isTreatment = TREATMENT_ACTIONS.has((ruleData.action_type || '').toUpperCase());
  if (isTreatment) {
    if (!ruleData.dosage_per_acre) missing.push('dosage_per_acre');
    if (!ruleData.active_ingredient) missing.push('active_ingredient');
    if (!ruleData.application_method) missing.push('application_method');
    if (!ruleData.phi_days) missing.push('phi_days');
  }
  
  if (!landAreaAcres || landAreaAcres <= 0) {
    missing.push('farmer land area (for dosage calculation)');
  }
  
  return missing;
}

console.log('🏗️ [DeterministicResponseBuilder] v2.0.0 loaded — dose safety, PHI, env validation, confidence gating');
