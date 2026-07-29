// PHASE 3: ETL (ECONOMIC THRESHOLD LEVEL) SAFETY GATE

export const ETL_GATE_VERSION = '2.1.0';

// ETL STANDARDS CACHE (from etl_standards table)

interface ETLStandard {
  pest_code: string;
  crop_code: string;
  etl_value: number;
  etl_unit: string;
  growth_stage: string[];
  sampling_method: string;
  sampling_unit: string | null;
  action_threshold: number | null;
  is_active: boolean;
}

let etlStandardsCache: ETLStandard[] | null = null;

// Pre-load ETL standards from database.
export async function loadETLStandards(supabaseClient: any): Promise<void> {
  if (etlStandardsCache) return; // Already loaded
  
  try {
    const { data, error } = await supabaseClient
      .from('etl_standards')
      .select('pest_code, crop_code, etl_value, etl_unit, growth_stage, sampling_method, sampling_unit, action_threshold, is_active')
      .eq('is_active', true);
    
    if (error) {
      console.warn(`⚠️ [ETL Gate] Failed to load etl_standards: ${error.message}`);
      etlStandardsCache = [];
      return;
    }
    
    etlStandardsCache = (data || []) as ETLStandard[];
    console.log(`✅ [ETL Gate] Loaded ${etlStandardsCache.length} active ETL standards from DB`);
  } catch (e) {
    console.warn(`⚠️ [ETL Gate] etl_standards load error:`, e instanceof Error ? e.message : 'unknown');
    etlStandardsCache = [];
  }
}

// Look up ETL threshold from etl_standards table by pest/crop context.
export function lookupETLFromStandards(
  pestCode: string | undefined,
  cropCode: string | undefined,
  growthStage: string | undefined
): { etl_value_min?: number; etl_value_max?: number; sampling_method?: string } | null {
  if (!etlStandardsCache || !pestCode) return null;
  
  const matches = etlStandardsCache.filter(s => {
    if (s.pest_code !== pestCode) return false;
    if (cropCode && s.crop_code !== cropCode) return false;
    if (growthStage && s.growth_stage?.length > 0 && !s.growth_stage.includes(growthStage)) return false;
    return true;
  });
  
  if (matches.length === 0) return null;
  
  const best = matches[0];
  return {
    etl_value_min: best.etl_value,
    etl_value_max: best.action_threshold ?? best.etl_value,
    sampling_method: best.sampling_method,
    sampling_unit: best.sampling_unit ?? undefined
  };
}

// TYPE DEFINITIONS

export interface ETLInput {
  rule_id: string;
  etl_applicable?: boolean;
  etl_value_min?: number;
  etl_value_max?: number;
  action_type?: string;
  ipm_level?: number;
}

export interface ETLContext {
  observed_pest_count?: number;
  pest_per_plant?: number;
  damage_percentage?: number;
  affected_area_percentage?: number;
  has_photo_confirmation?: boolean;
}

export interface ETLValidationResult {
  spray_allowed: boolean;
  etl_crossed: boolean;
  observed_value: number | null;
  threshold_min: number | null;
  threshold_max: number | null;
  gap_to_threshold: number | null;
  recommendation: 'SPRAY_ALLOWED' | 'MONITOR_ONLY' | 'ETL_NOT_APPLICABLE' | 'INSUFFICIENT_DATA';
  reason: string;
  monitoring_advice?: string;
}

// ACTION TYPES THAT REQUIRE ETL CHECK

const SPRAY_ACTION_TYPES = new Set([
  'treatment',
  'urgent_treatment',
  'APPLY_PESTICIDE',
  'APPLY_FUNGICIDE',
  'APPLY_INSECTICIDE',
  'APPLY_SPRAY',
  'FOLIAR_SPRAY',
  'CHEMICAL_CONTROL'
]);

// CORE ETL VALIDATION

// Check if observed pest level crosses ETL threshold
export function checkETLThreshold(
  observedValue: number | null | undefined,
  minThreshold: number | null | undefined,
  maxThreshold: number | null | undefined
): { crossed: boolean; gap: number | null } {
  // If no observation, cannot determine
  if (observedValue === null || observedValue === undefined) {
    return { crossed: false, gap: null };
  }
  
  // If minThreshold defined, check against it
  if (minThreshold !== null && minThreshold !== undefined) {
    if (observedValue >= minThreshold) {
      return { crossed: true, gap: observedValue - minThreshold };
    }
    return { crossed: false, gap: minThreshold - observedValue };
  }
  
  // If only maxThreshold defined
  if (maxThreshold !== null && maxThreshold !== undefined) {
    if (observedValue >= maxThreshold) {
      return { crossed: true, gap: observedValue - maxThreshold };
    }
    return { crossed: false, gap: maxThreshold - observedValue };
  }
  
  // No thresholds defined - allow spray (fail-open)
  return { crossed: true, gap: null };
}

// Determine if spray recommendation should be blocked based on ETL
export function shouldBlockSpray(
  rule: ETLInput,
  context: ETLContext
): ETLValidationResult {
  const actionType = rule.action_type?.toLowerCase() || '';
  
  // If not a spray action type, ETL doesn't apply
  if (!SPRAY_ACTION_TYPES.has(actionType) && !SPRAY_ACTION_TYPES.has(rule.action_type || '')) {
    return {
      spray_allowed: true,
      etl_crossed: true,
      observed_value: null,
      threshold_min: null,
      threshold_max: null,
      gap_to_threshold: null,
      recommendation: 'ETL_NOT_APPLICABLE',
      reason: `Action type '${rule.action_type}' does not require ETL check`
    };
  }
  
  // If ETL not applicable for this rule, allow spray
  if (rule.etl_applicable === false) {
    return {
      spray_allowed: true,
      etl_crossed: true,
      observed_value: null,
      threshold_min: null,
      threshold_max: null,
      gap_to_threshold: null,
      recommendation: 'ETL_NOT_APPLICABLE',
      reason: 'Rule marked as ETL not applicable'
    };
  }
  
  // Determine observed value (use pest count, then damage %, then affected area %)
  const observedValue = context.observed_pest_count ?? 
                        context.pest_per_plant ?? 
                        context.damage_percentage ?? 
                        context.affected_area_percentage ?? 
                        null;
  
  // If no observation data and no photo confirmation, recommend monitoring
  if (observedValue === null && !context.has_photo_confirmation) {
    return {
      spray_allowed: false,
      etl_crossed: false,
      observed_value: null,
      threshold_min: rule.etl_value_min ?? null,
      threshold_max: rule.etl_value_max ?? null,
      gap_to_threshold: null,
      recommendation: 'INSUFFICIENT_DATA',
      reason: 'No pest count or damage data available - recommend monitoring first',
      monitoring_advice: 'Continue field scouting and count pests per plant before applying spray'
    };
  }
  
  // Check ETL threshold
  const etlCheck = checkETLThreshold(
    observedValue,
    rule.etl_value_min,
    rule.etl_value_max
  );
  
  if (etlCheck.crossed) {
    return {
      spray_allowed: true,
      etl_crossed: true,
      observed_value: observedValue,
      threshold_min: rule.etl_value_min ?? null,
      threshold_max: rule.etl_value_max ?? null,
      gap_to_threshold: etlCheck.gap,
      recommendation: 'SPRAY_ALLOWED',
      reason: `ETL crossed: observed ${observedValue} >= threshold ${rule.etl_value_min ?? rule.etl_value_max}`
    };
  }
  
  // ETL not crossed - block spray
  return {
    spray_allowed: false,
    etl_crossed: false,
    observed_value: observedValue,
    threshold_min: rule.etl_value_min ?? null,
    threshold_max: rule.etl_value_max ?? null,
    gap_to_threshold: etlCheck.gap,
    recommendation: 'MONITOR_ONLY',
    reason: `ETL not crossed: observed ${observedValue} < threshold ${rule.etl_value_min ?? rule.etl_value_max}`,
    monitoring_advice: getMonitoringAdvice(observedValue ?? 0, rule.etl_value_min ?? 0)
  };
}

// MONITORING ADVICE

// Generate monitoring advice when ETL not crossed
function getMonitoringAdvice(observedValue: number, threshold: number): string {
  const percentage = Math.round((observedValue / threshold) * 100);
  
  if (percentage < 50) {
    return 'Pest pressure low. Continue weekly monitoring. No spray needed.';
  } else if (percentage < 75) {
    return 'Pest pressure moderate. Monitor every 3-4 days. Consider cultural controls.';
  } else {
    return 'Approaching ETL. Monitor daily. Prepare spray but wait for threshold.';
  }
}

// Get localized ETL advice
export function getETLAdvice(
  result: ETLValidationResult,
  language: string
): string {
  if (result.spray_allowed) {
    const templates: Record<string, string> = {
      mr: `⚠️ किडींची संख्या (${result.observed_value}) आर्थिक नुकसान पातळी ओलांडली आहे. फवारणी करा.`,
      hi: `⚠️ कीटों की संख्या (${result.observed_value}) आर्थिक क्षति स्तर पार कर गई है। स्प्रे करें।`,
      en: `⚠️ Pest count (${result.observed_value}) crossed Economic Threshold Level. Spray recommended.`
    };
    return templates[language] || templates['en'];
  }
  
  const templates: Record<string, string> = {
    mr: `📊 किडींची संख्या (${result.observed_value ?? 0}) अजून कमी आहे (ETL: ${result.threshold_min}). फवारणी करू नका - निरीक्षण सुरू ठेवा.`,
    hi: `📊 कीटों की संख्या (${result.observed_value ?? 0}) अभी कम है (ETL: ${result.threshold_min})। स्प्रे न करें - निगरानी जारी रखें।`,
    en: `📊 Pest count (${result.observed_value ?? 0}) below threshold (ETL: ${result.threshold_min}). Do NOT spray - continue monitoring.`
  };
  return templates[language] || templates['en'];
}

// LOGGING

export function logETLValidation(
  ruleId: string,
  result: ETLValidationResult,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  
  if (result.recommendation === 'ETL_NOT_APPLICABLE') {
    console.log(`${prefix} ⏭️ [ETL Gate] Rule ${ruleId}: ETL not applicable`);
    return;
  }
  
  if (result.spray_allowed) {
    console.log(`${prefix} ✅ [ETL Gate] Rule ${ruleId}: ETL crossed (${result.observed_value} >= ${result.threshold_min}). Spray allowed.`);
  } else {
    console.warn(`${prefix} 🚫 [ETL Gate] Rule ${ruleId}: ETL NOT crossed (${result.observed_value ?? 'unknown'} < ${result.threshold_min}). SPRAY BLOCKED.`);
    if (result.monitoring_advice) {
      console.log(`${prefix}    Advice: ${result.monitoring_advice}`);
    }
  }
}

export default {
  ETL_GATE_VERSION,
  checkETLThreshold,
  shouldBlockSpray,
  getETLAdvice,
  logETLValidation,
  loadETLStandards,
  lookupETLFromStandards
};
