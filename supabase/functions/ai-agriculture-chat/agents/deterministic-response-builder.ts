/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DETERMINISTIC RESPONSE BUILDER v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Constructs structured farmer advisory responses ENTIRELY from
 * decision_rules table columns. No LLM-generated advice allowed.
 * 
 * ARCHITECTURE PRINCIPLE:
 * "Rules Decide, AI Only Translates"
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
 * @version 1.0.0
 */

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
// TYPE: Structured Farmer Response (deterministic, rule-sourced)
// ═══════════════════════════════════════════════════════════════════════════

export interface StructuredFarmerResponse {
  rule_id: string;
  
  // Section 1: Problem Explanation
  problem: {
    cause: string;
    explanation: string;           // reason_text or knowledge_text
    scientific_basis?: string;
  };
  
  // Section 2: Recommended Action
  action: {
    action_text: string;           // What farmer should do
    action_type: string;           // SPRAY, CULTURAL, MONITOR, etc.
    treatment_type?: string;       // CURATIVE, PREVENTIVE, etc.
    is_treatment: boolean;         // Whether this involves product application
  };
  
  // Section 3: Dosage Calculation (land-area based)
  dosage: {
    has_dosage: boolean;
    per_acre_dosage?: string;
    per_acre_water?: string;
    land_area_acres?: number;
    total_dosage?: string;         // CALCULATED: dosage × area
    total_water?: string;          // CALCULATED: water × area
    active_ingredient?: string;
    application_method?: string;
    target_pest_stage?: string;
  };
  
  // Section 4: Safety Precautions
  safety: {
    has_safety_info: boolean;
    phi_days?: number;
    phi_instruction?: string;      // "Stop spraying X days before harvest"
    reentry_hours?: number;
    reentry_instruction?: string;  // "Do not enter field for X hours"
    bee_toxicity?: string;
    bee_warning?: string;
    aquatic_toxicity?: string;
    farmer_safety_level?: string;
    safety_instruction?: string;
    regulatory_status?: string;
    chemical_class?: string;
    mode_of_action?: string;
    resistance_group?: string;
    resistance_warning?: string;
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
    total_material_cost?: string;  // CALCULATED: cost × area
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
}

// ═══════════════════════════════════════════════════════════════════════════
// DOSAGE PARSER: Extract numeric values from dosage strings
// Handles: "60 ml", "500g", "2-3 kg", "100ml/acre", "N/A", etc.
// ═══════════════════════════════════════════════════════════════════════════

function parseDosage(dosageStr: string): { value: number; unit: string } | null {
  if (!dosageStr) return null;
  const clean = dosageStr.replace(/\/acre/i, '').replace(/per\s*acre/i, '').trim();
  
  // Match patterns like "60 ml", "500g", "2.5 kg", "100-200ml"
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?([a-zA-Z%]+)/);
  if (match) {
    return { value: parseFloat(match[1]), unit: match[2] };
  }
  
  // Match range pattern "2-3 kg" (use average)
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
  // Round to reasonable precision
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
// MAIN BUILDER: Construct structured response from rule data
// ═══════════════════════════════════════════════════════════════════════════

export function buildDeterministicResponse(
  ruleData: RichRuleData,
  landAreaAcres?: number
): StructuredFarmerResponse {
  const area = landAreaAcres && landAreaAcres > 0 ? landAreaAcres : 0;
  const actionTypeUpper = (ruleData.action_type || '').toUpperCase();
  const isTreatment = TREATMENT_ACTIONS.has(actionTypeUpper);
  
  // Section 1: Problem Explanation
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
  
  // Section 3: Dosage (calculated for farmer's land)
  const hasDosage = isTreatment && !!ruleData.dosage_per_acre && 
    !ruleData.dosage_per_acre.toLowerCase().includes('n/a') &&
    !ruleData.dosage_per_acre.toLowerCase().includes('advisory');
  
  const dosage = {
    has_dosage: hasDosage,
    per_acre_dosage: ruleData.dosage_per_acre || undefined,
    per_acre_water: ruleData.water_volume_per_acre || undefined,
    land_area_acres: area || undefined,
    total_dosage: area > 0 ? calculateTotal(ruleData.dosage_per_acre, area) : undefined,
    total_water: area > 0 ? calculateTotal(ruleData.water_volume_per_acre, area) : undefined,
    active_ingredient: ruleData.active_ingredient || undefined,
    application_method: ruleData.application_method || undefined,
    target_pest_stage: ruleData.target_pest_stage || undefined
  };
  
  // Section 4: Safety
  const hasSafety = !!(ruleData.phi_days || ruleData.reentry_interval_hours || 
    ruleData.bee_toxicity || ruleData.farmer_safety_level || ruleData.regulatory_status);
  
  const safety = {
    has_safety_info: hasSafety,
    phi_days: ruleData.phi_days || undefined,
    phi_instruction: ruleData.phi_days ? `Stop spraying at least ${ruleData.phi_days} days before harvest` : undefined,
    reentry_hours: ruleData.reentry_interval_hours || undefined,
    reentry_instruction: ruleData.reentry_interval_hours ? `Do not enter field for ${ruleData.reentry_interval_hours} hours after application` : undefined,
    bee_toxicity: ruleData.bee_toxicity || undefined,
    bee_warning: (ruleData.bee_toxicity === 'HIGH' || ruleData.bee_toxicity === 'MODERATE') 
      ? `⚠️ ${ruleData.bee_toxicity} bee toxicity — avoid spraying during flowering or when bees are active` : undefined,
    aquatic_toxicity: ruleData.aquatic_toxicity || undefined,
    farmer_safety_level: ruleData.farmer_safety_level || undefined,
    safety_instruction: buildSafetyInstruction(ruleData.farmer_safety_level),
    regulatory_status: ruleData.regulatory_status || undefined,
    chemical_class: ruleData.chemical_class || undefined,
    mode_of_action: ruleData.mode_of_action || undefined,
    resistance_group: ruleData.resistance_group || undefined,
    resistance_warning: ruleData.resistance_group ? 
      `Resistance group: ${ruleData.resistance_group}. Rotate with different chemical class next application.` : undefined
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
  
  // Section 6: Cost
  const hasCost = !!(ruleData.material_cost_per_acre_min || ruleData.material_cost_per_acre_max || 
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
    total_material_cost: area > 0 ? calculateCostTotal(ruleData.material_cost_per_acre_min, ruleData.material_cost_per_acre_max, area) : undefined,
    total_labor_cost: area > 0 ? calculateCostTotal(ruleData.labor_cost_per_acre_min, ruleData.labor_cost_per_acre_max, area) : undefined,
    total_estimated: area > 0 && ruleData.total_cost_estimated ? `₹${Math.round(ruleData.total_cost_estimated * area)}` : undefined
  };
  
  // Section 7: ROI
  const hasROI = !!(ruleData.roi_yield_gain_pct || ruleData.roi_cost_saved_min || ruleData.roi_net_score);
  const roi = {
    has_roi: hasROI,
    yield_gain_pct: ruleData.roi_yield_gain_pct || undefined,
    cost_saved_range: (ruleData.roi_cost_saved_min || ruleData.roi_cost_saved_max) ? 
      `₹${ruleData.roi_cost_saved_min || 0}-${ruleData.roi_cost_saved_max || 0}/acre` : undefined,
    net_score: ruleData.roi_net_score || undefined,
    confidence: ruleData.roi_confidence || undefined
  };
  
  // Section 8: Monitoring
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
    spray_window_instruction: buildSprayWindowInstruction(ruleData)
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
    confidence: ruleData.confidence_score ?? 0.7,
    risk_level: ruleData.risk_level || undefined,
    response_severity: ruleData.response_severity || undefined
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

export function formatStructuredResponseForLLM(response: StructuredFarmerResponse): string {
  const parts: string[] = [];
  
  // Problem
  parts.push(`═══ PROBLEM EXPLANATION ═══`);
  parts.push(`Cause: ${response.problem.cause}`);
  if (response.problem.explanation) {
    parts.push(`Explanation: ${response.problem.explanation}`);
  }
  if (response.problem.scientific_basis) {
    parts.push(`Scientific Basis: ${response.problem.scientific_basis}`);
  }
  
  // Action
  parts.push(`\n═══ RECOMMENDED ACTION ═══`);
  parts.push(`Action Type: ${response.action.action_type}`);
  if (response.action.action_text) {
    parts.push(`What To Do: ${response.action.action_text}`);
  }
  if (response.action.treatment_type) {
    parts.push(`Treatment Type: ${response.action.treatment_type}`);
  }
  
  // Dosage (CALCULATED)
  if (response.dosage.has_dosage) {
    parts.push(`\n═══ DOSAGE FOR YOUR FIELD ═══`);
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
    if (response.dosage.target_pest_stage) {
      parts.push(`Best Target Stage: ${response.dosage.target_pest_stage}`);
    }
  }
  
  // Safety
  if (response.safety.has_safety_info) {
    parts.push(`\n═══ SAFETY PRECAUTIONS ═══`);
    if (response.safety.phi_instruction) {
      parts.push(`⏳ ${response.safety.phi_instruction}`);
    }
    if (response.safety.reentry_instruction) {
      parts.push(`🚫 ${response.safety.reentry_instruction}`);
    }
    if (response.safety.bee_warning) {
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
    parts.push(`\n═══ ORGANIC/IPM ALTERNATIVE ═══`);
    if (response.organic.organic_alternative) {
      parts.push(`🌿 Organic Option: ${response.organic.organic_alternative}`);
    }
    if (response.organic.ipm_label) {
      parts.push(`IPM Level: ${response.organic.ipm_label}`);
    }
  }
  
  // Cost
  if (response.cost.has_cost) {
    parts.push(`\n═══ ESTIMATED COST ═══`);
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
  
  // ROI
  if (response.roi.has_roi) {
    parts.push(`\n═══ EXPECTED RETURN ═══`);
    if (response.roi.yield_gain_pct) {
      parts.push(`📈 Expected Yield Increase: ${response.roi.yield_gain_pct}%`);
    }
    if (response.roi.cost_saved_range) {
      parts.push(`💰 Cost Savings: ${response.roi.cost_saved_range}`);
    }
  }
  
  // Monitoring
  if (response.monitoring.has_monitoring) {
    parts.push(`\n═══ MONITORING AFTER APPLICATION ═══`);
    if (response.monitoring.success_indicators?.length) {
      parts.push(`✅ Success Signs (check after 5-7 days): ${response.monitoring.success_indicators.join(', ')}`);
    }
    if (response.monitoring.failure_indicators?.length) {
      parts.push(`❌ Failure Signs (re-treat if seen): ${response.monitoring.failure_indicators.join(', ')}`);
    }
  }
  
  // Environmental
  if (response.environment.has_conditions) {
    parts.push(`\n═══ SPRAY WINDOW CONDITIONS ═══`);
    if (response.environment.spray_window_instruction) {
      parts.push(`🌤️ ${response.environment.spray_window_instruction}`);
    }
  }
  
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION: Check if rule data has enough content for a response
// ═══════════════════════════════════════════════════════════════════════════

export function hasAdequateRuleContent(ruleData: RichRuleData): boolean {
  // Must have at least one of: action_text, reason_text, knowledge_text
  return !!(ruleData.action_text || ruleData.reason_text || ruleData.knowledge_text);
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
