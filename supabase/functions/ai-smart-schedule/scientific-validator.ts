/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCIENTIFIC VALIDATION LAYER - ICAR/SAU/KVK Standards
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates AI-generated tasks against scientific rules.
 * Ensures ETL thresholds, dosage limits, crop stage compatibility.
 * 
 * Version: 2.0.0
 */

import { 
  NPK_TARGETS, 
  IPM_THRESHOLDS, 
  SEED_RATES, 
  FERTILIZERS, 
  PESTICIDES, 
  DISEASES,
  IRRIGATION_REQUIREMENTS,
  CROP_DURATIONS,
  getIPMThresholdForPest,
  calculateNPKDeficit
} from './agro-knowledge-base.ts';

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  corrections: TaskCorrection[];
  confidence_score: number;
}

export interface ValidationIssue {
  type: 'critical' | 'major' | 'minor';
  field: string;
  message: string;
  rule_id: string;
  auto_correctable: boolean;
}

export interface ValidationWarning {
  type: 'info' | 'caution';
  message: string;
  rule_id?: string;
}

export interface TaskCorrection {
  task_index: number;
  field: string;
  original_value: any;
  corrected_value: any;
  reason: string;
  rule_id: string;
}

export interface ScientificTask {
  task_name: string;
  stage_key: string;
  category: string;
  days_from_sowing: number;
  product_recommendations?: ProductRecommendation[];
  description?: string;
  instructions?: string[];
  confidence_score?: number;
  based_on?: string[];
  risk_if_ignored?: string;
  scientific_reason?: string;
}

export interface ProductRecommendation {
  product_name: string;
  product_type: string;
  dose_per_acre?: string;
  application_method?: string;
  active_ingredient?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateSchedule(
  tasks: ScientificTask[],
  cropName: string,
  farmingType: string,
  soilData: { n: number; p: number; k: number; ph: number },
  ndviTrend?: { current: number; previous: number; trend: 'improving' | 'declining' | 'stable' }
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationWarning[] = [];
  const corrections: TaskCorrection[] = [];
  let totalConfidence = 0;
  
  const cropLower = cropName.toLowerCase();
  
  tasks.forEach((task, index) => {
    // 1. Validate ETL thresholds for pest/disease tasks
    if (task.category === 'pest_control' || task.category === 'disease_control') {
      const etlValidation = validateETLThreshold(task, cropLower);
      if (!etlValidation.valid) {
        issues.push({
          type: 'major',
          field: 'pest_control',
          message: etlValidation.message,
          rule_id: etlValidation.rule_id,
          auto_correctable: false
        });
      }
      if (etlValidation.warning) {
        warnings.push({
          type: 'caution',
          message: etlValidation.warning,
          rule_id: etlValidation.rule_id
        });
      }
    }
    
    // 2. Validate crop stage compatibility
    const stageValidation = validateCropStageCompatibility(task, cropLower);
    if (!stageValidation.valid) {
      issues.push({
        type: 'minor',
        field: 'stage_key',
        message: stageValidation.message,
        rule_id: stageValidation.rule_id,
        auto_correctable: true
      });
      if (stageValidation.correction) {
        corrections.push({
          task_index: index,
          field: 'days_from_sowing',
          original_value: task.days_from_sowing,
          corrected_value: stageValidation.correction.days,
          reason: stageValidation.message,
          rule_id: stageValidation.rule_id
        });
      }
    }
    
    // 3. Validate dosage safety limits
    if (task.product_recommendations) {
      task.product_recommendations.forEach((prod, prodIndex) => {
        const dosageValidation = validateDosageSafety(prod, cropLower, farmingType);
        if (!dosageValidation.valid) {
          issues.push({
            type: dosageValidation.severity,
            field: `product_recommendations[${prodIndex}].dose`,
            message: dosageValidation.message,
            rule_id: dosageValidation.rule_id,
            auto_correctable: true
          });
          if (dosageValidation.correction) {
            corrections.push({
              task_index: index,
              field: `product_recommendations[${prodIndex}].dose_per_acre`,
              original_value: prod.dose_per_acre,
              corrected_value: dosageValidation.correction,
              reason: dosageValidation.message,
              rule_id: dosageValidation.rule_id
            });
          }
        }
      });
    }
    
    // 4. Validate farming mode compliance
    const modeValidation = validateFarmingModeCompliance(task, farmingType);
    if (!modeValidation.valid) {
      issues.push({
        type: 'critical',
        field: 'product_recommendations',
        message: modeValidation.message,
        rule_id: 'FARMING_MODE_VIOLATION',
        auto_correctable: true
      });
      if (modeValidation.corrections) {
        modeValidation.corrections.forEach(corr => {
          corrections.push({
            task_index: index,
            ...corr
          });
        });
      }
    }
    
    // 5. Validate NDVI consistency
    if (ndviTrend) {
      const ndviValidation = validateNDVIConsistency(task, ndviTrend);
      if (!ndviValidation.valid) {
        warnings.push({
          type: 'caution',
          message: ndviValidation.message,
          rule_id: 'NDVI_CONSISTENCY'
        });
      }
    }
    
    // Calculate task confidence
    const taskConfidence = calculateTaskConfidence(task, soilData, ndviTrend);
    totalConfidence += taskConfidence;
  });
  
  // 6. Validate NPK prescription
  const npkValidation = validateNPKPrescription(tasks, cropLower, soilData);
  if (!npkValidation.valid) {
    issues.push({
      type: 'major',
      field: 'fertilizer_tasks',
      message: npkValidation.message,
      rule_id: npkValidation.rule_id,
      auto_correctable: false
    });
  }
  
  const avgConfidence = tasks.length > 0 ? totalConfidence / tasks.length : 0;
  
  return {
    valid: issues.filter(i => i.type === 'critical').length === 0,
    issues,
    warnings,
    corrections,
    confidence_score: Math.round(avgConfidence * 100) / 100
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ETL THRESHOLD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateETLThreshold(task: ScientificTask, crop: string): {
  valid: boolean;
  message: string;
  rule_id: string;
  warning?: string;
} {
  // Extract pest/disease name from task
  const taskNameLower = task.task_name.toLowerCase();
  const descLower = (task.description || '').toLowerCase();
  const combinedText = taskNameLower + ' ' + descLower;
  
  // Check if spray is recommended without ETL justification
  const isSprayTask = combinedText.includes('spray') || 
                      combinedText.includes('फवारणी') || 
                      combinedText.includes('छिड़काव');
  
  if (isSprayTask) {
    // Look for matching IPM threshold
    const matchingThreshold = IPM_THRESHOLDS.find(t => 
      t.crop.includes(crop) && 
      (combinedText.includes(t.pest_name.toLowerCase()) ||
       Object.values(t.pest_name_local).some(local => combinedText.includes(local.toLowerCase())))
    );
    
    if (matchingThreshold) {
      // Check if task has ETL justification in based_on
      const hasETLJustification = task.based_on?.some(b => 
        b.includes('ETL') || b.includes('threshold') || b.includes(matchingThreshold.rule_id)
      );
      
      if (!hasETLJustification) {
        return {
          valid: false,
          message: `Spray recommended without ETL verification. ${matchingThreshold.pest_name} ETL: ${matchingThreshold.etl} ${matchingThreshold.etl_unit}`,
          rule_id: matchingThreshold.rule_id,
          warning: `Verify pest count before spraying. ${matchingThreshold.sampling_method}`
        };
      }
    }
    
    // Generic spray task without specific pest - add warning
    if (!matchingThreshold && !task.based_on?.length) {
      return {
        valid: true,
        message: '',
        rule_id: 'IPM_GENERAL',
        warning: 'Spray task should specify pest/disease and ETL threshold for scientific credibility'
      };
    }
  }
  
  return { valid: true, message: '', rule_id: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

function validateCropStageCompatibility(task: ScientificTask, crop: string): {
  valid: boolean;
  message: string;
  rule_id: string;
  correction?: { days: number };
} {
  const cropDuration = CROP_DURATIONS[crop] || CROP_DURATIONS.default;
  
  // Calculate expected day range for this stage
  let expectedMinDay = 0;
  let expectedMaxDay = 0;
  let cumulativeDays = 0;
  
  for (const stage of cropDuration.stages) {
    if (stage.name === task.stage_key) {
      expectedMinDay = cumulativeDays;
      expectedMaxDay = cumulativeDays + stage.days;
      break;
    }
    cumulativeDays += stage.days;
  }
  
  // Validate days_from_sowing falls within expected range
  if (task.days_from_sowing < expectedMinDay || task.days_from_sowing > expectedMaxDay) {
    const midPoint = Math.round((expectedMinDay + expectedMaxDay) / 2);
    return {
      valid: false,
      message: `Task "${task.task_name}" at day ${task.days_from_sowing} doesn't match ${task.stage_key} stage (expected: day ${expectedMinDay}-${expectedMaxDay})`,
      rule_id: cropDuration.rule_id,
      correction: { days: midPoint }
    };
  }
  
  return { valid: true, message: '', rule_id: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOSAGE SAFETY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateDosageSafety(
  product: ProductRecommendation, 
  crop: string,
  farmingType: string
): {
  valid: boolean;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  rule_id: string;
  correction?: string;
} {
  const productNameLower = product.product_name.toLowerCase();
  
  // Check fertilizers
  for (const [key, fert] of Object.entries(FERTILIZERS)) {
    if (productNameLower.includes(key) || productNameLower.includes(fert.active_ingredient.toLowerCase())) {
      // Check if exceeds max dose
      if (product.dose_per_acre) {
        const doseMatch = product.dose_per_acre.match(/(\d+(?:\.\d+)?)/);
        if (doseMatch) {
          const dose = parseFloat(doseMatch[1]);
          if (dose > fert.max_dose_kg_per_acre) {
            return {
              valid: false,
              severity: 'major',
              message: `${product.product_name} dose ${dose}kg exceeds safe limit of ${fert.max_dose_kg_per_acre}kg/acre`,
              rule_id: fert.rule_id,
              correction: `${fert.max_dose_kg_per_acre}kg/acre`
            };
          }
        }
      }
      
      // Check if allowed for farming mode
      if (!fert.allowed_modes.includes(farmingType as any)) {
        return {
          valid: false,
          severity: 'critical',
          message: `${product.product_name} not allowed in ${farmingType} mode`,
          rule_id: fert.rule_id,
          correction: fert.organic_alternative
        };
      }
    }
  }
  
  // Check pesticides
  for (const [key, pest] of Object.entries(PESTICIDES)) {
    if (productNameLower.includes(key) || productNameLower.includes(pest.active_ingredient.toLowerCase())) {
      // Check regulatory status
      if (pest.regulatory_status === 'banned') {
        return {
          valid: false,
          severity: 'critical',
          message: `${product.product_name} (${pest.active_ingredient}) is BANNED`,
          rule_id: pest.rule_id,
          correction: pest.organic_alternative
        };
      }
      
      if (pest.regulatory_status === 'restricted') {
        return {
          valid: true,
          severity: 'minor',
          message: `${product.product_name} is restricted - use with caution`,
          rule_id: pest.rule_id
        };
      }
      
      // Check farming mode
      if (!pest.allowed_modes.includes(farmingType as any)) {
        return {
          valid: false,
          severity: 'critical',
          message: `${product.product_name} not allowed in ${farmingType} mode`,
          rule_id: pest.rule_id,
          correction: pest.organic_alternative
        };
      }
    }
  }
  
  return { valid: true, severity: 'minor', message: '', rule_id: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMING MODE COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════

function validateFarmingModeCompliance(task: ScientificTask, farmingType: string): {
  valid: boolean;
  message: string;
  corrections?: { field: string; original_value: any; corrected_value: any; reason: string; rule_id: string }[];
} {
  if (farmingType !== 'organic_only') {
    return { valid: true, message: '' };
  }
  
  const corrections: any[] = [];
  
  // Check each product for organic compliance
  if (task.product_recommendations) {
    task.product_recommendations.forEach((prod, i) => {
      const productLower = prod.product_name.toLowerCase();
      
      // Check against synthetic fertilizers
      const syntheticFerts = ['urea', 'dap', 'mop', 'npk', 'ssp'];
      for (const synth of syntheticFerts) {
        if (productLower.includes(synth)) {
          const fert = FERTILIZERS[synth];
          if (fert && fert.organic_alternative) {
            corrections.push({
              field: `product_recommendations[${i}].product_name`,
              original_value: prod.product_name,
              corrected_value: fert.organic_alternative,
              reason: `${synth.toUpperCase()} not allowed in organic farming`,
              rule_id: fert.rule_id
            });
          }
        }
      }
      
      // Check against synthetic pesticides
      const syntheticPests = ['imidacloprid', 'chlorpyrifos', 'cypermethrin', 'thiamethoxam'];
      for (const synth of syntheticPests) {
        if (productLower.includes(synth)) {
          const pest = PESTICIDES[synth];
          if (pest && pest.organic_alternative) {
            corrections.push({
              field: `product_recommendations[${i}].product_name`,
              original_value: prod.product_name,
              corrected_value: pest.organic_alternative,
              reason: `${synth} not allowed in organic farming`,
              rule_id: pest.rule_id
            });
          }
        }
      }
    });
  }
  
  if (corrections.length > 0) {
    return {
      valid: false,
      message: `${corrections.length} products violate organic farming mode`,
      corrections
    };
  }
  
  return { valid: true, message: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// NDVI CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

function validateNDVIConsistency(
  task: ScientificTask, 
  ndviTrend: { current: number; previous: number; trend: 'improving' | 'declining' | 'stable' }
): {
  valid: boolean;
  message: string;
} {
  // If NDVI is declining and task is growth promoter, validate urgency
  if (ndviTrend.trend === 'declining' && ndviTrend.current < 0.4) {
    if (task.category === 'growth_promoter' || task.category === 'fertilizer') {
      // This is appropriate - validate it's marked urgent
      if (task.priority !== 'high') {
        return {
          valid: false,
          message: `NDVI declining (${ndviTrend.current}) - fertilizer/growth task should be high priority`
        };
      }
    }
  }
  
  // If NDVI is healthy but recommending heavy fertilization
  if (ndviTrend.current > 0.7 && ndviTrend.trend === 'stable') {
    if (task.category === 'fertilizer') {
      return {
        valid: false,
        message: `NDVI is healthy (${ndviTrend.current}) - reduce fertilizer application to avoid over-fertilization`
      };
    }
  }
  
  return { valid: true, message: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// NPK PRESCRIPTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateNPKPrescription(
  tasks: ScientificTask[], 
  crop: string,
  soilData: { n: number; p: number; k: number; ph: number }
): {
  valid: boolean;
  message: string;
  rule_id: string;
} {
  const deficit = calculateNPKDeficit(crop, soilData.n, soilData.p, soilData.k);
  
  // Count fertilizer tasks
  const fertTasks = tasks.filter(t => t.category === 'fertilizer');
  
  // If no deficit but still recommending fertilizers
  if (deficit.n_deficit === 0 && deficit.p_deficit === 0 && deficit.k_deficit === 0) {
    if (fertTasks.length > 0) {
      return {
        valid: false,
        message: 'Soil NPK is sufficient. Fertilizer tasks should be minimal or maintenance-only.',
        rule_id: deficit.rule_id
      };
    }
  }
  
  // If deficit exists but no fertilizer tasks
  if ((deficit.n_deficit > 20 || deficit.p_deficit > 10 || deficit.k_deficit > 10) && fertTasks.length === 0) {
    return {
      valid: false,
      message: `Soil has nutrient deficits (N: ${deficit.n_deficit}kg, P: ${deficit.p_deficit}kg, K: ${deficit.k_deficit}kg) but no fertilizer tasks recommended.`,
      rule_id: deficit.rule_id
    };
  }
  
  return { valid: true, message: '', rule_id: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateTaskConfidence(
  task: ScientificTask,
  soilData: { n: number; p: number; k: number; ph: number },
  ndviTrend?: { current: number; previous: number; trend: string }
): number {
  let confidence = 0.5; // Base confidence
  
  // Has scientific justification
  if (task.based_on && task.based_on.length > 0) {
    confidence += 0.15;
  }
  
  // Has rule_id references
  if (task.based_on?.some(b => b.match(/[A-Z]+_[A-Z]+_\d+/))) {
    confidence += 0.1;
  }
  
  // Has risk assessment
  if (task.risk_if_ignored) {
    confidence += 0.1;
  }
  
  // Soil data available
  if (soilData.n > 0 && soilData.p > 0 && soilData.k > 0) {
    confidence += 0.1;
  }
  
  // NDVI data available
  if (ndviTrend && ndviTrend.current > 0) {
    confidence += 0.05;
  }
  
  return Math.min(confidence, 1.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-CORRECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function applyCorrections(
  tasks: ScientificTask[], 
  corrections: TaskCorrection[]
): ScientificTask[] {
  const correctedTasks = [...tasks];
  
  for (const correction of corrections) {
    const task = correctedTasks[correction.task_index];
    if (!task) continue;
    
    // Apply correction based on field path
    if (correction.field.includes('[')) {
      // Array field like product_recommendations[0].dose_per_acre
      const match = correction.field.match(/(\w+)\[(\d+)\]\.(\w+)/);
      if (match) {
        const [_, arrayField, index, property] = match;
        if ((task as any)[arrayField] && (task as any)[arrayField][parseInt(index)]) {
          (task as any)[arrayField][parseInt(index)][property] = correction.corrected_value;
        }
      }
    } else {
      // Simple field
      (task as any)[correction.field] = correction.corrected_value;
    }
    
    // Add correction note to task
    if (!task.based_on) task.based_on = [];
    task.based_on.push(`Auto-corrected: ${correction.reason} (${correction.rule_id})`);
  }
  
  return correctedTasks;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENRICHMENT FUNCTION - Add scientific metadata to tasks
// ═══════════════════════════════════════════════════════════════════════════

export function enrichTasksWithScientificData(
  tasks: ScientificTask[],
  cropName: string,
  soilData: { n: number; p: number; k: number; ph: number },
  ndviTrend?: { current: number; previous: number; trend: string }
): ScientificTask[] {
  const cropLower = cropName.toLowerCase();
  
  return tasks.map(task => {
    const enrichedTask = { ...task };
    
    // Add based_on if missing
    if (!enrichedTask.based_on) {
      enrichedTask.based_on = [];
    }
    
    // Add soil data reference
    enrichedTask.based_on.push(`Soil: N=${soilData.n}, P=${soilData.p}, K=${soilData.k}, pH=${soilData.ph}`);
    
    // Add NDVI reference if available
    if (ndviTrend) {
      enrichedTask.based_on.push(`NDVI: ${ndviTrend.current} (${ndviTrend.trend})`);
    }
    
    // Add rule_id for category
    if (task.category === 'fertilizer') {
      const npk = NPK_TARGETS[cropLower] || NPK_TARGETS.default;
      enrichedTask.based_on.push(npk.rule_id);
    }
    
    if (task.category === 'seed_treatment' || task.category === 'sowing') {
      const seed = SEED_RATES[cropLower];
      if (seed) enrichedTask.based_on.push(seed.rule_id);
    }
    
    // Calculate and set confidence score
    enrichedTask.confidence_score = calculateTaskConfidence(task, soilData, ndviTrend as any);
    
    // Set risk_if_ignored if not present
    if (!enrichedTask.risk_if_ignored) {
      enrichedTask.risk_if_ignored = getDefaultRiskStatement(task.category);
    }
    
    // Set scientific_reason if not present
    if (!enrichedTask.scientific_reason) {
      enrichedTask.scientific_reason = getDefaultScientificReason(task.category, cropName);
    }
    
    return enrichedTask;
  });
}

function getDefaultRiskStatement(category: string): string {
  const risks: Record<string, string> = {
    fertilizer: '10-25% yield loss due to nutrient deficiency',
    pest_control: '15-40% crop damage if pest population exceeds ETL',
    disease_control: '20-50% yield loss from disease spread',
    irrigation: '30-60% yield reduction from water stress',
    seed_treatment: '15-30% germination failure and seedling diseases',
    sowing: '20-40% yield loss from improper sowing timing/depth',
    harvesting: '10-20% post-harvest loss from delayed harvesting',
    growth_promoter: '10-15% suboptimal growth and delayed maturity'
  };
  return risks[category] || '10-20% productivity loss';
}

function getDefaultScientificReason(category: string, crop: string): string {
  const reasons: Record<string, string> = {
    fertilizer: `Balanced nutrition ensures optimal ${crop} growth as per ICAR recommendations`,
    pest_control: 'IPM-based pest management protects yield while preserving beneficial insects',
    disease_control: 'Timely disease management prevents epidemic spread',
    irrigation: 'Critical stage irrigation maximizes water use efficiency',
    seed_treatment: 'Seed treatment protects against soil-borne pathogens and improves germination',
    sowing: 'Optimal sowing time and spacing maximizes resource utilization',
    harvesting: 'Timely harvest at optimal moisture prevents quality and quantity losses',
    growth_promoter: 'Growth promoters enhance plant vigor and stress tolerance'
  };
  return reasons[category] || 'Follows ICAR/SAU recommended practices for optimal results';
}
