// CANONICAL FARMER ADVISORY SCHEMA v1.0
//
// CHANGE LOG (newest first)
//   2026-08-20 04:20 UTC — secondary observations keep their own verbatim
//     action_text / dosage_per_acre / organic_alternative (1 rule = 1 block).
//     Cross-rule contamination is prevented by never merging blocks, not by
//     blanking the secondary's own DB text.

import type { RichRuleData, StructuredFarmerResponse } from './deterministic-response-builder.ts';

// CANONICAL ADVISORY INTERFACE

export interface CanonicalFarmerAdvisory {
  version: '1.0';
  
  // Section 1: Diagnosis
  diagnosis: {
    problem: string;
    category: string;
    rule_id: string;
    confidence_score: number;
    response_decision: 'TREAT' | 'MONITOR' | 'CLARIFY';
    risk_level?: string;
  };
  
  // Section 2: Explanation
  explanation: {
    what_is_happening: string;
    why_it_happens: string;
    scientific_basis?: string;
  };
  
  // Section 3: Symptoms to Confirm
  symptoms_to_confirm: string[];
  
  // Section 4: Treatment
  treatment: {
    action_type: string;
    immediate_action: string;
    treatment_type?: string;
    is_treatment: boolean;
    organic_solution?: string;
    chemical_solution?: {
      active_ingredient?: string;
      chemical_class?: string;
      mode_of_action?: string;
      resistance_group?: string;
    };
    dosage?: {
      per_acre: string;
      total?: string;
      land_area_acres?: number;
      water_volume_per_acre?: string;
      total_water?: string;
    };
    application_method?: string;
    target_pest_stage?: string;
  };
  
  // Section 5: Safety
  safety: {
    has_safety_info: boolean;
    farmer_safety_level?: string;
    safety_instruction?: string;
    bee_toxicity?: string;
    bee_warning?: string;
    bee_spray_time?: string;
    aquatic_toxicity?: string;
    phi_days?: number;
    phi_instruction?: string;
    reentry_hours?: number;
    reentry_instruction?: string;
    regulatory_status?: string;
  };
  
  // Section 6: Environment
  environment: {
    has_conditions: boolean;
    temperature_range?: string;
    humidity_range?: string;
    wind_limit?: string;
    rain_delay_hours?: number;
    spray_window_instruction?: string;
    spray_blocked?: boolean;
    spray_block_reason?: string;
  };
  
  // Section 7: Economics
  economics: {
    has_economics: boolean;
    cost_estimate?: string;
    material_cost?: string;
    labor_cost?: string;
    roi_yield_gain?: string;
    roi_risk?: string;
    cost_saved_range?: string;
  };
  
  // Section 8: Monitoring
  monitoring: {
    has_monitoring: boolean;
    success_indicators: string[];
    failure_indicators: string[];
  };
  
  // Section 9: Traceability
  trace: {
    rule_id: string;
    scientific_source?: string;
    icar_package?: string;
    university_source?: string;
    data_authority_rank?: number;
    confidence_score: number;
  };
  
  // Section 10: Multi-rule (if multiple rules matched)
  multi_rule?: {
    has_secondary: boolean;
    secondary_observations: Array<{
      rule_id: string;
      cause: string;
      action_type: string;
      action_text: string;
      dosage_per_acre?: string;
      organic_alternative?: string;
      confidence: number;
    }>;
    monitoring_advice: string[];
  };
  
  // Safety warnings collected during processing
  safety_warnings: string[];
}

// BUILDER: StructuredFarmerResponse + RichRuleData → CanonicalFarmerAdvisory

export function buildCanonicalAdvisory(
  structured: StructuredFarmerResponse,
  ruleData: RichRuleData,
  secondaryDecisions?: any[]
): CanonicalFarmerAdvisory {
  
  // Build temperature range string
  let temperatureRange: string | undefined;
  if (structured.environment.min_temp != null || structured.environment.max_temp != null) {
    const min = structured.environment.min_temp ?? '—';
    const max = structured.environment.max_temp ?? '—';
    temperatureRange = `${min}°C – ${max}°C`;
  }
  
  // Build wind limit string
  let windLimit: string | undefined;
  if (structured.environment.max_wind != null) {
    windLimit = `≤ ${structured.environment.max_wind} km/h`;
  }
  
  // Build ROI strings
  let roiYieldGain: string | undefined;
  if (structured.roi.yield_gain_pct != null) {
    roiYieldGain = `${structured.roi.yield_gain_pct}%`;
  }
  
  let roiRisk: string | undefined;
  if (ruleData.roi_net_score != null) {
    roiRisk = `Net ROI Score: ${ruleData.roi_net_score}`;
  }
  
  // Build symptoms from observable_characteristics + visual_markers
  const symptoms: string[] = [];
  if (ruleData.observable_characteristics) {
    symptoms.push(...ruleData.observable_characteristics);
  }
  if (ruleData.visual_markers) {
    for (const marker of ruleData.visual_markers) {
      if (typeof marker === 'string') {
        symptoms.push(marker);
      } else if (marker?.description) {
        symptoms.push(marker.description);
      }
    }
  }
  
  // ═══ 1 RULE = 1 BLOCK: each secondary keeps its OWN verbatim text + dose ═══
  const secondaryObs = (secondaryDecisions || []).map((d: any) => ({
    rule_id: d.rule_id || 'UNKNOWN',
    cause: d.cause || d.cause_name || '',
    action_type: d.action_type || 'MONITOR',
    action_text: d.action_text || d.reason_text || '',
    dosage_per_acre: d.dosage_per_acre || '',
    organic_alternative: d.organic_alternative || '',
    confidence: d.confidence_score || d.weighted_confidence || 0
  }));
  
  const advisory: CanonicalFarmerAdvisory = {
    version: '1.0',
    
    diagnosis: {
      problem: structured.problem.cause,
      category: ruleData.action_type,
      rule_id: structured.rule_id,
      confidence_score: structured.confidence,
      response_decision: structured.response_decision,
      risk_level: structured.risk_level
    },
    
    explanation: {
      what_is_happening: structured.problem.explanation,
      why_it_happens: ruleData.reason_text || structured.problem.explanation,
      scientific_basis: structured.problem.scientific_basis
    },
    
    symptoms_to_confirm: symptoms,
    
    treatment: {
      action_type: structured.action.action_type,
      immediate_action: structured.action.action_text,
      treatment_type: structured.action.treatment_type,
      is_treatment: structured.action.is_treatment,
      organic_solution: structured.organic.has_alternative ? structured.organic.organic_alternative : undefined,
      chemical_solution: ruleData.active_ingredient ? {
        active_ingredient: ruleData.active_ingredient,
        chemical_class: ruleData.chemical_class,
        mode_of_action: ruleData.mode_of_action,
        resistance_group: ruleData.resistance_group
      } : undefined,
      dosage: structured.dosage.has_dosage ? {
        per_acre: structured.dosage.per_acre_dosage || '',
        total: structured.dosage.total_dosage,
        land_area_acres: structured.dosage.land_area_acres,
        water_volume_per_acre: structured.dosage.per_acre_water,
        total_water: structured.dosage.total_water
      } : undefined,
      application_method: structured.dosage.application_method,
      target_pest_stage: structured.dosage.target_pest_stage
    },
    
    safety: {
      has_safety_info: structured.safety.has_safety_info,
      farmer_safety_level: structured.safety.farmer_safety_level,
      safety_instruction: structured.safety.safety_instruction,
      bee_toxicity: structured.safety.bee_toxicity,
      bee_warning: structured.safety.bee_warning,
      bee_spray_time: structured.safety.bee_spray_time,
      aquatic_toxicity: structured.safety.aquatic_toxicity,
      phi_days: structured.safety.phi_days,
      phi_instruction: structured.safety.phi_instruction,
      reentry_hours: structured.safety.reentry_hours,
      reentry_instruction: structured.safety.reentry_instruction,
      regulatory_status: structured.safety.regulatory_status
    },
    
    environment: {
      has_conditions: structured.environment.has_conditions,
      temperature_range: temperatureRange,
      wind_limit: windLimit,
      rain_delay_hours: structured.environment.rain_delay_hours,
      spray_window_instruction: structured.environment.spray_window_instruction,
      spray_blocked: structured.environment.spray_blocked,
      spray_block_reason: structured.environment.spray_block_reason
    },
    
    economics: {
      has_economics: structured.cost.has_cost || structured.roi.has_roi,
      cost_estimate: structured.cost.total_estimated,
      material_cost: structured.cost.total_material_cost,
      labor_cost: structured.cost.total_labor_cost,
      roi_yield_gain: roiYieldGain,
      roi_risk: roiRisk,
      cost_saved_range: structured.roi.cost_saved_range
    },
    
    monitoring: {
      has_monitoring: structured.monitoring.has_monitoring,
      success_indicators: structured.monitoring.success_indicators || [],
      failure_indicators: structured.monitoring.failure_indicators || []
    },
    
    trace: {
      rule_id: structured.rule_id,
      scientific_source: structured.reference.scientific_source,
      icar_package: structured.reference.icar_package_ref,
      university_source: structured.reference.university_source,
      data_authority_rank: structured.reference.data_authority_rank,
      confidence_score: structured.confidence
    },
    
    multi_rule: secondaryObs.length > 0 ? {
      has_secondary: true,
      secondary_observations: secondaryObs,
      monitoring_advice: []
    } : undefined,
    
    safety_warnings: structured.safety_warnings || []
  };
  
  return advisory;
}

// MULTI-RULE BUILDER: Handles multiple matched rules

export function buildMultiRuleAdvisory(
  primaryAdvisory: CanonicalFarmerAdvisory,
  secondaryDecisions: any[]
): CanonicalFarmerAdvisory {
  if (!secondaryDecisions || secondaryDecisions.length === 0) {
    return primaryAdvisory;
  }
  
  // Sort by priority → confidence → data_authority_rank
  const sorted = [...secondaryDecisions].sort((a, b) => {
    const priDiff = (b.priority || 0) - (a.priority || 0);
    if (priDiff !== 0) return priDiff;
    const confDiff = (b.confidence_score || 0) - (a.confidence_score || 0);
    if (confDiff !== 0) return confDiff;
    return (b.data_authority_rank || 0) - (a.data_authority_rank || 0);
  });
  
  // ═══ 1 RULE = 1 BLOCK ═══
  // Each secondary is a confirmed observation with its OWN DB rule, so it keeps
  // its own verbatim action text and its own dose. Nothing is ever copied
  // between rules — that is what rule atomicity protects against.
  const secondaryObs = sorted.slice(0, 3).map((d: any) => ({
    rule_id: d.rule_id || 'UNKNOWN',
    cause: d.cause || d.cause_name || '',
    action_type: d.action_type || 'MONITOR',
    action_text: d.action_text || d.reason_text || '',
    dosage_per_acre: d.dosage_per_acre || '',
    organic_alternative: d.organic_alternative || '',
    confidence: d.confidence_score || d.weighted_confidence || 0
  }));
  
  // Extract monitoring advice from secondary rules
  const monitoringAdvice: string[] = [];
  for (const d of sorted) {
    if (d.success_indicators) {
      const indicators = Array.isArray(d.success_indicators) ? d.success_indicators : [d.success_indicators];
      monitoringAdvice.push(...indicators.slice(0, 1));
    }
  }
  
  return {
    ...primaryAdvisory,
    multi_rule: {
      has_secondary: true,
      secondary_observations: secondaryObs,
      monitoring_advice: monitoringAdvice.slice(0, 3)
    }
  };
}

console.log('📋 [CanonicalAdvisorySchema] v1.0 loaded');
