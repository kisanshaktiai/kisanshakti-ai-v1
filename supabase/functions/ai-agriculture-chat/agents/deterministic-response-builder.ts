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
  else if (regStatus === 'UNKNOWN' && ruleData.active_ingredient) {
    score -= 0.1; // P1-2: Penalty for unverified chemicals
  }
  
  // P0-3: Cross-validate bee_toxicity vs farmer_safety_level
  const farmerSafety = (ruleData.farmer_safety_level || '').toUpperCase();
  if (beeTox === 'HIGH' && farmerSafety === 'SAFE') {
    console.error(`⚠️ [SafetyScore] CONTRADICTION: ${ruleData.rule_id} has bee_toxicity=HIGH but safety=SAFE`);
    score -= 0.2; // Additional penalty for contradictory safety data
  }
  if (regStatus === 'RESTRICTED' && farmerSafety === 'SAFE') {
    console.error(`⚠️ [SafetyScore] CONTRADICTION: ${ruleData.rule_id} has regulatory=RESTRICTED but safety=SAFE`);
    score -= 0.15; // P1-3: RESTRICTED + SAFE contradiction
  }
  
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
  // Phase G — G2: action-text coalescer. If the primary rule was approved but
  // `action_text` is empty, fall back to reason_text/knowledge_text/cause so we
  // never emit an empty action object for an approved decision.
  const coalescedActionText =
    (ruleData.action_text && ruleData.action_text.trim()) ||
    (ruleData.reason_text && ruleData.reason_text.trim()) ||
    (ruleData.knowledge_text && ruleData.knowledge_text.trim()) ||
    (ruleData.cause && String(ruleData.cause).trim()) ||
    '';
  if (!ruleData.action_text && coalescedActionText) {
    console.warn(`[BRAIN_TRACE][BUILDER][ACTION_COALESCED] rule=${ruleData.rule_id} source=${ruleData.reason_text ? 'reason_text' : (ruleData.knowledge_text ? 'knowledge_text' : 'cause')}`);
  }
  if (ruleData.rule_id && !coalescedActionText) {
    console.error(`[BRAIN_TRACE][BUILDER][ACTION_LOSS] rule=${ruleData.rule_id} approved but no action/reason/knowledge text — emitting empty action`);
  }
  const action = {
    action_text: coalescedActionText,
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

/**
 * Translate an array of indicator codes using observation_translations DB table.
 * SSOT: All translations come from database, not hardcoded dictionaries.
 */
async function translateIndicatorArray(
  indicators: string[] | string | undefined | null,
  lang: string,
  supabaseClient: any
): Promise<string> {
  if (!indicators) return '';
  
  const indicatorList = Array.isArray(indicators) 
    ? indicators 
    : (typeof indicators === 'string' 
        ? (indicators.startsWith('[') ? JSON.parse(indicators) : [indicators]) 
        : []);
  
  if (indicatorList.length === 0) return '';
  
  const cleanCodes = indicatorList.map((ind: string) => 
    ind.replace(/[\[\]"']/g, '').trim().toUpperCase()
  ).filter((c: string) => c.length > 0);
  
  if (!supabaseClient || lang === 'en') {
    // For English or no DB client, format codes as title case
    return cleanCodes.map((code: string) => 
      code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
    ).join(', ');
  }
  
  try {
    const labelMap = await loadObservationLabels(supabaseClient, cleanCodes, lang);
    
    return cleanCodes.map((code: string) => {
      const label = labelMap.get(code);
      if (label && label.display_text) {
        return label.display_text;
      }
      // Fallback: raw code with spaces (avoid English title-case for non-English)
      return code.replace(/_/g, ' ').toLowerCase();
    }).join(', ');
  } catch (e) {
    console.warn(`⚠️ [DeterministicBuilder] translateIndicatorArray error: ${e}`);
    return cleanCodes.map((code: string) => code.replace(/_/g, ' ').toLowerCase()).join(', ');
  }
}

/**
 * Translate a technical term (action_type, target_stage, etc.) using DB.
 * Uses observation_translations table with the code as observation_code.
 */
async function translateTechnicalTerm(
  term: string | undefined | null,
  lang: string,
  supabaseClient: any
): Promise<string> {
  if (!term) return '';
  
  const termUpper = term.toUpperCase().trim();
  
  // For English, just format nicely
  if (lang === 'en' || !supabaseClient) {
    return term.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
  
  try {
    // Try observation_translations table
    const labelMap = await loadObservationLabels(supabaseClient, [termUpper], lang);
    const label = labelMap.get(termUpper);
    
    if (label && label.display_text && label.display_text !== termUpper.replace(/_/g, ' ')) {
      return label.display_text;
    }
    
    // Try i18n translation loader cache
    const translated = getTranslation(termUpper, lang);
    if (translated && translated !== termUpper.replace(/_/g, ' ')) {
      return translated;
    }
  } catch (e) {
    console.warn(`⚠️ [DeterministicBuilder] translateTechnicalTerm error: ${e}`);
  }
  
  // Fallback: formatted code (avoid English for non-English)
  return term.replace(/_/g, ' ').toLowerCase();
}

export async function formatStructuredResponseForLLM(
  response: StructuredFarmerResponse, 
  lang?: string,
  supabaseClient?: any
): Promise<string> {
  const parts: string[] = [];
  
  // Use language parameter for localized output (defaults to 'en' for LLM prompt usage)
  const l = lang || 'en';
  
  // Initialize translation cache if supabaseClient available
  if (supabaseClient) {
    try {
      await initializeTranslationCache(supabaseClient);
    } catch (e) {
      console.warn(`⚠️ [DeterministicBuilder] Translation cache init failed: ${e}`);
    }
  }
  
  // English-only structural labels — LLM narration layer handles all translation
  
  // ─── Response decision mode header ───
  if (response.response_decision === 'CLARIFY') {
    parts.push(`⚠️ RESPONSE MODE: CLARIFICATION REQUIRED`);
    parts.push('More crop observations are required before giving treatment advice.');
    parts.push('DO NOT recommend any product or dosage.\n');
  } else if (response.response_decision === 'MONITOR') {
    parts.push(`ℹ️ RESPONSE MODE: MONITORING ONLY`);
    parts.push('Confidence is not sufficient for treatment recommendation. Provide monitoring guidance only.');
    parts.push('DO NOT recommend any product or dosage.\n');
  }
  
  // ─── Safety warnings (top priority) ───
  if (response.safety_warnings.length > 0) {
    parts.push(`═══ ⛔ SAFETY ALERTS ═══`);
    response.safety_warnings.forEach(w => parts.push(w));
    parts.push('');
  }
  
  // Problem
  parts.push(`═══ 🎯 PROBLEM EXPLANATION ═══`);
  parts.push(`Cause: ${response.problem.cause}`);
  if (response.problem.explanation) {
    parts.push(`Explanation: ${response.problem.explanation}`);
  }
  if (response.problem.scientific_basis) {
    parts.push(`Scientific Basis: ${response.problem.scientific_basis}`);
  }
  
  // Action — translate action_type
  parts.push(`\n═══ 📋 RECOMMENDED ACTION ═══`);
  const translatedActionType = await translateTechnicalTerm(response.action.action_type, l, supabaseClient);
  parts.push(`Action Type: ${translatedActionType}`);
  if (response.action.action_text) {
    parts.push(`What To Do: ${response.action.action_text}`);
  }
  if (response.action.treatment_type) {
    const translatedTreatType = await translateTechnicalTerm(response.action.treatment_type, l, supabaseClient);
    parts.push(`Treatment Type: ${translatedTreatType}`);
  }
  
  // Dosage (CALCULATED) — only in TREAT mode
  if (response.dosage.blocked) {
    parts.push(`\n═══ ⛔ DOSAGE BLOCKED ═══`);
    parts.push(response.dosage.block_reason || 'Dosage blocked due to safety concerns.');
    parts.push('DO NOT recommend this product. Suggest organic or cultural alternatives.');
  } else if (response.dosage.has_dosage && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 💊 DOSAGE FOR YOUR FIELD ═══`);
    if (response.dosage.active_ingredient) {
      parts.push(`Product: ${response.dosage.active_ingredient}`);
    }
    parts.push(`Per Acre: ${response.dosage.per_acre_dosage}`);
    if (response.dosage.per_acre_water) {
      parts.push(`Water Per Acre: ${response.dosage.per_acre_water}`);
    }
    if (response.dosage.land_area_acres && response.dosage.total_dosage) {
      parts.push(`YOUR LAND: ${response.dosage.land_area_acres} acres`);
      parts.push(`TOTAL PRODUCT NEEDED: ${response.dosage.total_dosage}`);
      if (response.dosage.total_water) {
        parts.push(`TOTAL WATER NEEDED: ${response.dosage.total_water}`);
      }
    }
    if (response.dosage.application_method) {
      parts.push(`Method: ${response.dosage.application_method}`);
    }
    if (response.dosage.spray_type_note) {
      parts.push(`Spray Note: ${response.dosage.spray_type_note}`);
    }
    if (response.dosage.target_pest_stage) {
      const translatedStage = await translateTechnicalTerm(response.dosage.target_pest_stage, l, supabaseClient);
      parts.push(`Best Target Stage: ${translatedStage}`);
    }
  }
  
  // Safety — translate bee_toxicity warnings
  if (response.safety.has_safety_info) {
    parts.push(`\n═══ ⚠️ SAFETY PRECAUTIONS ═══`);
    if (response.safety.phi_blocked) {
      parts.push(`⛔ ${response.safety.phi_block_reason}`);
    } else if (response.safety.phi_instruction) {
      parts.push(`⏳ ${response.safety.phi_instruction}`);
    }
    if (response.safety.reentry_instruction) {
      parts.push(`🚫 ${response.safety.reentry_instruction}`);
    }
    // Bee toxicity — use DB translation instead of hardcoded English
    if (response.safety.bee_toxicity) {
      const beeToxUpper = response.safety.bee_toxicity.toUpperCase();
      if (beeToxUpper === 'HIGH' || beeToxUpper === 'MODERATE') {
        const beeWarningKey = `BEE_WARNING_${beeToxUpper}`;
        const translatedBeeWarning = await translateTechnicalTerm(beeWarningKey, l, supabaseClient);
        if (translatedBeeWarning && translatedBeeWarning !== beeWarningKey.replace(/_/g, ' ').toLowerCase()) {
          parts.push(`🐝 ${translatedBeeWarning}`);
        } else if (response.safety.bee_spray_time) {
          parts.push(response.safety.bee_spray_time);
        } else if (response.safety.bee_warning) {
          parts.push(`🐝 ${response.safety.bee_warning}`);
        }
      }
    } else if (response.safety.bee_spray_time) {
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
  
  // Organic/IPM — translate ipm_label
  if (response.organic.has_alternative) {
    parts.push(`\n═══ 🌿 ORGANIC/IPM ALTERNATIVE ═══`);
    if (response.organic.organic_alternative) {
      parts.push(`🌿 Organic Option: ${response.organic.organic_alternative}`);
    }
    if (response.organic.ipm_label) {
      const translatedIpm = await translateTechnicalTerm(response.organic.ipm_label, l, supabaseClient);
      parts.push(`IPM Level: ${translatedIpm}`);
    }
  }
  
  // Cost — only in TREAT mode
  if (response.cost.has_cost && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 💰 ESTIMATED COST ═══`);
    if (response.cost.total_material_cost) {
      parts.push(`Material Cost (total): ${response.cost.total_material_cost}`);
    } else if (response.cost.per_acre_material_min || response.cost.per_acre_material_max) {
      parts.push(`Material Cost: ₹${response.cost.per_acre_material_min || 0}-${response.cost.per_acre_material_max || 0}/acre`);
    }
    if (response.cost.total_labor_cost) {
      parts.push(`Labor Cost (total): ${response.cost.total_labor_cost}`);
    }
    if (response.cost.labor_hours_per_acre) {
      parts.push(`Labor Time: ${response.cost.labor_hours_per_acre} hours/acre`);
    }
    if (response.cost.equipment_required?.length) {
      parts.push(`Equipment: ${response.cost.equipment_required.join(', ')}`);
    }
    if (response.cost.total_estimated) {
      parts.push(`TOTAL ESTIMATED COST: ${response.cost.total_estimated}`);
    }
  }
  
  // ROI — only in TREAT mode
  if (response.roi.has_roi && response.response_decision === 'TREAT') {
    parts.push(`\n═══ 📈 EXPECTED RETURN ═══`);
    if (response.roi.yield_gain_pct) {
      parts.push(`📈 Expected Yield Increase: ${response.roi.yield_gain_pct}%`);
    }
    if (response.roi.cost_saved_range) {
      parts.push(`💰 Cost Savings: ${response.roi.cost_saved_range}`);
    }
  }
  
  // Monitoring — translate indicator arrays via DB
  if (response.monitoring.has_monitoring) {
    parts.push(`\n═══ ✅ MONITORING AFTER APPLICATION ═══`);
    if (response.monitoring.success_indicators?.length) {
      const successText = await translateIndicatorArray(response.monitoring.success_indicators, l, supabaseClient);
      parts.push(`✅ Success Signs (check after 5-7 days): ${successText}`);
    }
    if (response.monitoring.failure_indicators?.length) {
      const failureText = await translateIndicatorArray(response.monitoring.failure_indicators, l, supabaseClient);
      parts.push(`❌ Failure Signs (re-treat if seen): ${failureText}`);
    }
  }
  
  // Environmental
  if (response.environment.has_conditions) {
    parts.push(`\n═══ 🌤️ SPRAY WINDOW CONDITIONS ═══`);
    if (response.environment.spray_blocked) {
      parts.push(`⛔ ${response.environment.spray_block_reason}`);
    }
    if (response.environment.spray_window_instruction) {
      parts.push(`🌤️ ${response.environment.spray_window_instruction}`);
    }
  }
  
  // CLARIFY / MONITOR footer
  if (response.response_decision === 'CLARIFY') {
    parts.push(`\n═══ FARMER INSTRUCTION ═══`);
    parts.push('More crop observations are required before giving treatment advice.');
    parts.push('Ask the farmer to describe symptoms in more detail or send a photo.');
  } else if (response.response_decision === 'MONITOR') {
    parts.push(`\n═══ FARMER INSTRUCTION ═══`);
    parts.push('Continue monitoring the crop. Check again after 3-5 days.');
    parts.push('If symptoms worsen, contact the advisory system again with detailed observations.');
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
// RULE ATOMICITY: Chemical mismatch detection utility
// Prevents cross-rule contamination where chemical A's name appears
// in rule B's dosage string (e.g., Chlorpyrifos product + Fipronil dosage)
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_ACTIVE_INGREDIENTS = [
  'chlorpyrifos', 'fipronil', 'imidacloprid', 'thiamethoxam', 'acetamiprid',
  'carbendazim', 'mancozeb', 'metalaxyl', 'tricyclazole', 'propiconazole',
  'hexaconazole', 'tebuconazole', 'azoxystrobin', 'difenoconazole',
  'lambda-cyhalothrin', 'cypermethrin', 'deltamethrin', 'profenofos',
  'acephate', 'monocrotophos', 'dimethoate', 'quinalphos', 'phorate',
  'cartap', 'flubendiamide', 'chlorantraniliprole', 'emamectin',
  'spinosad', 'abamectin', 'novaluron', 'lufenuron', 'diafenthiuron',
  'spiromesifen', 'pyriproxyfen', 'buprofezin', 'triazophos',
  'ethion', 'malathion', 'carbaryl', 'methomyl', 'thiodicarb',
  'indoxacarb', 'neem', 'beauveria', 'metarhizium', 'trichoderma',
  'pseudomonas', 'bacillus', 'copper oxychloride', 'copper hydroxide',
  'sulphur', 'glyphosate', 'paraquat', 'atrazine', '2,4-D',
];

export function detectChemicalMismatch(activeIngredient?: string, dosageString?: string): boolean {
  if (!activeIngredient || !dosageString) return false;
  
  const ingredientLower = activeIngredient.toLowerCase().trim();
  const dosageLower = dosageString.toLowerCase();
  
  // Check if any DIFFERENT known chemical name appears in dosage string
  for (const chemical of KNOWN_ACTIVE_INGREDIENTS) {
    if (dosageLower.includes(chemical)) {
      // Found a chemical name in dosage — check if it matches the active_ingredient
      if (!ingredientLower.includes(chemical) && !chemical.includes(ingredientLower.split(' ')[0])) {
        console.error(`🚨 [RuleAtomicity] CROSS_RULE_CONTAMINATION_DETECTED: active_ingredient="${activeIngredient}" but dosage contains "${chemical}" → dosage="${dosageString}"`);
        return true; // MISMATCH
      }
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE INTEGRITY VALIDATOR
// Ensures treatment fields are internally consistent within a single rule.
// If mismatch detected, nullifies contaminated fields to prevent bad advice.
// ═══════════════════════════════════════════════════════════════════════════

export function validateRuleIntegrity(ruleData: RichRuleData): RichRuleData {
  const ruleId = ruleData.rule_id || 'UNKNOWN';
  
  // Log every advisory build for traceability
  console.log(`📋 [ADVISORY_BUILD] rule_id=${ruleId} | active_ingredient=${ruleData.active_ingredient || 'NONE'} | dosage_per_acre=${ruleData.dosage_per_acre || 'NONE'}`);
  
  // Detect chemical/dosage mismatch
  if (detectChemicalMismatch(ruleData.active_ingredient, ruleData.dosage_per_acre)) {
    console.error(`🚨 [RULE_INTEGRITY_ERROR] rule_id=${ruleId}: Chemical mismatch detected. Nullifying contaminated dosage to prevent bad advice.`);
    // Keep active_ingredient (from primary rule), nullify contaminated dosage
    return {
      ...ruleData,
      dosage_per_acre: undefined,
      water_volume_per_acre: undefined,
    };
  }
  
  return ruleData;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT RichRuleData from application_details (pipeline bridge)
// ═══════════════════════════════════════════════════════════════════════════
// RULE ATOMICITY PRINCIPLE:
// Treatment-critical fields MUST come from primaryDecision ONLY.
// appDetails fallback is ONLY allowed if appDetails.rule_id matches
// primaryDecision.rule_id, preventing cross-rule data contamination.
// ═══════════════════════════════════════════════════════════════════════════

export function extractRichRuleData(
  primaryDecision: any,
  appDetails: Record<string, any>
): RichRuleData {
  const primaryRuleId = primaryDecision.rule_id || 'UNKNOWN';
  const appDetailsRuleId = appDetails.rule_id || appDetails.ruleId;
  
  // RULE ATOMICITY GUARD: Only allow appDetails fallback for treatment fields
  // if appDetails originates from the SAME rule as primaryDecision
  const appDetailsSameRule = appDetailsRuleId && appDetailsRuleId === primaryRuleId;
  
  // Safe fallback helper: only falls through to appDetails if same rule_id
  const treatmentField = (primaryVal: any, appVal: any) => {
    if (primaryVal != null && primaryVal !== '') return primaryVal;
    if (appDetailsSameRule && appVal != null && appVal !== '') return appVal;
    // BLOCKED: appDetails has different/unknown rule_id — do NOT use for treatment
    if (!appDetailsSameRule && appVal != null) {
      console.warn(`⚠️ [RuleAtomicity] Blocked cross-rule fallback for treatment field. primary_rule=${primaryRuleId}, appDetails_rule=${appDetailsRuleId || 'NONE'}`);
    }
    return undefined;
  };
  
  // Non-treatment fields (context/economics/environment) can use appDetails freely
  const contextField = (primaryVal: any, appVal: any) => {
    return primaryVal ?? appVal ?? undefined;
  };
  
  const ruleData: RichRuleData = {
    rule_id: primaryRuleId,
    action_type: primaryDecision.action_type || 'MONITOR',
    // Narrative fields — safe to merge
    cause: contextField(primaryDecision.cause, appDetails.cause),
    reason_text: contextField(primaryDecision.reason_text, appDetails.reason_text),
    knowledge_text: contextField(primaryDecision.knowledge_text, appDetails.knowledge_text),
    scientific_basis: appDetails.scientific_basis || undefined,
    action_text: contextField(primaryDecision.action_text, appDetails.action_text),
    
    // ═══ TREATMENT-CRITICAL FIELDS: Primary rule ONLY ═══
    treatment_type: treatmentField(primaryDecision.treatment_type, appDetails.treatment_type),
    active_ingredient: treatmentField(primaryDecision.active_ingredient, appDetails.active_ingredient),
    dosage_per_acre: treatmentField(primaryDecision.dosage_per_acre, appDetails.dosage_per_acre),
    water_volume_per_acre: treatmentField(primaryDecision.water_volume_per_acre, appDetails.water_volume_per_acre),
    application_method: treatmentField(primaryDecision.application_method, appDetails.application_method || appDetails.method),
    target_pest_stage: treatmentField(primaryDecision.target_pest_stage, appDetails.target_pest_stage),
    chemical_class: treatmentField(primaryDecision.chemical_class, appDetails.chemical_class),
    mode_of_action: treatmentField(primaryDecision.mode_of_action, appDetails.mode_of_action),
    resistance_group: treatmentField(primaryDecision.resistance_group, appDetails.resistance_group),
    phi_days: treatmentField(primaryDecision.phi_days, appDetails.phi_days),
    reentry_interval_hours: treatmentField(primaryDecision.reentry_interval_hours, appDetails.reentry_interval_hours),
    bee_toxicity: treatmentField(primaryDecision.bee_toxicity, appDetails.bee_toxicity),
    aquatic_toxicity: treatmentField(primaryDecision.aquatic_toxicity, appDetails.aquatic_toxicity),
    farmer_safety_level: treatmentField(primaryDecision.farmer_safety_level, appDetails.farmer_safety_level),
    regulatory_status: treatmentField(primaryDecision.regulatory_status, appDetails.regulatory_status),
    organic_alternative: treatmentField(primaryDecision.organic_alternative, appDetails.organic_alternative),
    biological_group: treatmentField(primaryDecision.biological_group, appDetails.biological_group),
    ipm_level: appDetails.ipm_level || undefined,
    
    // Economics — context, safe to merge
    material_cost_per_acre_min: appDetails.material_cost_per_acre_min || undefined,
    material_cost_per_acre_max: appDetails.material_cost_per_acre_max || undefined,
    labor_cost_per_acre_min: appDetails.labor_cost_per_acre_min || undefined,
    labor_cost_per_acre_max: appDetails.labor_cost_per_acre_max || undefined,
    labor_hours_per_acre: appDetails.labor_hours_per_acre || undefined,
    equipment_required: appDetails.equipment_required || undefined,
    equipment_cost_per_acre: appDetails.equipment_cost_per_acre || undefined,
    total_cost_estimated: appDetails.total_cost_estimated || undefined,
    roi_yield_gain_pct: contextField(primaryDecision.roi_yield_gain_pct, appDetails.roi_yield_gain_pct),
    roi_cost_saved_min: appDetails.roi_cost_saved_min || undefined,
    roi_cost_saved_max: appDetails.roi_cost_saved_max || undefined,
    roi_net_score: appDetails.roi_net_score || undefined,
    roi_confidence: appDetails.roi_confidence || undefined,
    
    // Monitoring — context
    success_indicators: contextField(primaryDecision.success_indicators, appDetails.success_indicators),
    failure_indicators: contextField(primaryDecision.failure_indicators, appDetails.failure_indicators),
    
    // Environment — context
    min_temperature: appDetails.min_temperature || undefined,
    max_temperature: appDetails.max_temperature || undefined,
    max_wind_speed: appDetails.max_wind_speed || undefined,
    rain_delay_hours: appDetails.rain_delay_hours || undefined,
    weather_dependency: appDetails.weather_dependency || undefined,
    
    // Traceability — context
    scientific_source: appDetails.scientific_source || undefined,
    icar_package_ref: appDetails.icar_package_ref || undefined,
    university_source: appDetails.university_source || undefined,
    confidence_score: primaryDecision.confidence_score || primaryDecision.weighted_confidence || undefined,
    risk_level: appDetails.risk_level || undefined,
    response_severity: appDetails.response_severity || undefined,
    data_authority_rank: appDetails.data_authority_rank || undefined,
  };
  
  // Run integrity validation before returning
  return validateRuleIntegrity(ruleData);
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
