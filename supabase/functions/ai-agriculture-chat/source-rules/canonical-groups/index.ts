/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL RULE GROUPS - 13 GROUP TAXONOMY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * All agricultural rules MUST be classified into exactly ONE of these 13 groups.
 * No rule may exist outside these groups.
 * No rule may exist in multiple groups.
 * 
 * Version: 1.0.0
 * Standard: ICAR/FAO Taxonomy Alignment
 */

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP ENUM - Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════

export enum CanonicalRuleGroup {
  /** Group 1: Crop identification, variety selection, classification */
  CROP_IDENTITY_CLASSIFICATION = 'CROP_IDENTITY_CLASSIFICATION',
  
  /** Group 2: Growth stage determination, phenology, DAS calculations */
  CROP_GROWTH_STAGE = 'CROP_GROWTH_STAGE',
  
  /** Group 3: Visual symptoms, field observations, farmer reports */
  SYMPTOM_OBSERVATION = 'SYMPTOM_OBSERVATION',
  
  /** Group 4: NPK deficiency, micronutrient deficiency, toxicity */
  NUTRIENT_DEFICIENCY_TOXICITY = 'NUTRIENT_DEFICIENCY_TOXICITY',
  
  /** Group 5: Insect pests, mites, nematodes */
  PEST_ENTOMOLOGY = 'PEST_ENTOMOLOGY',
  
  /** Group 6: Fungal, bacterial, viral diseases */
  DISEASE_PATHOLOGY = 'DISEASE_PATHOLOGY',
  
  /** Group 7: Weed identification, herbicide management */
  WEED = 'WEED',
  
  /** Group 8: Soil pH, texture, drainage, salinity, waterlogging */
  SOIL_HEALTH_PHYSICAL = 'SOIL_HEALTH_PHYSICAL',
  
  /** Group 9: Heat stress, cold stress, rainfall, drought */
  WEATHER_CLIMATE_STRESS = 'WEATHER_CLIMATE_STRESS',
  
  /** Group 10: Irrigation scheduling, water management */
  IRRIGATION_WATER = 'IRRIGATION_WATER',
  
  /** Group 11: Fertilizer dosage, application timing, input recommendations */
  FERTILIZER_INPUT = 'FERTILIZER_INPUT',
  
  /** Group 12: Crop rotation, intercropping, companion planting */
  CROPPING_SYSTEM_ROTATION = 'CROPPING_SYSTEM_ROTATION',
  
  /** Group 13: Safety gates, warnings, PHI, emergency advisories */
  RISK_WARNING_ADVISORY = 'RISK_WARNING_ADVISORY',
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE GROUP METADATA
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalGroupMetadata {
  group: CanonicalRuleGroup;
  name: string;
  description: string;
  priority: number; // Lower = higher priority in conflict resolution
  sourceFiles: string[];
  ruleCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPPING: Current Files → Canonical Groups
// ═══════════════════════════════════════════════════════════════════════════

export const CANONICAL_GROUP_MAPPING: Record<CanonicalRuleGroup, CanonicalGroupMetadata> = {
  [CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION]: {
    group: CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION,
    name: 'Crop Identity & Classification',
    description: 'Crop identification, variety selection, hybrid vs. OP classification',
    priority: 1,
    sourceFiles: [
      'intelligence/variety-database.ts',
      'intelligence/variety-recommendation-rules.ts',
    ],
    ruleCount: 0, // Will be calculated
  },
  
  [CanonicalRuleGroup.CROP_GROWTH_STAGE]: {
    group: CanonicalRuleGroup.CROP_GROWTH_STAGE,
    name: 'Crop Growth Stage',
    description: 'Phenology, DAS calculations, stage transitions',
    priority: 2,
    sourceFiles: [
      // Growth stage logic is embedded in cereals.ts, vegetables.ts etc.
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.SYMPTOM_OBSERVATION]: {
    group: CanonicalRuleGroup.SYMPTOM_OBSERVATION,
    name: 'Symptom & Observation',
    description: 'Visual symptoms, farmer observations, field reports',
    priority: 3,
    sourceFiles: [
      'intelligence/universal-observation-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY]: {
    group: CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    name: 'Nutrient Deficiency & Toxicity',
    description: 'NPK deficiency, micronutrient deficiency, toxicity symptoms',
    priority: 4,
    sourceFiles: [
      'crop-group-rules/micronutrients.ts',
      'crop-group-rules/soil-rules/soil-nutrient-rules.ts',
      'safety-rules/nutrient-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.PEST_ENTOMOLOGY]: {
    group: CanonicalRuleGroup.PEST_ENTOMOLOGY,
    name: 'Pest (Entomology)',
    description: 'Insect pests, mites, nematodes, ETL thresholds',
    priority: 5,
    sourceFiles: [
      'safety-rules/ipm-rules.ts',
      'safety-rules/crop-specific-ipm-ladders.ts',
      'safety-rules/economic-threshold-rules.ts',
      'crop-group-rules/wheat-ipm-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.DISEASE_PATHOLOGY]: {
    group: CanonicalRuleGroup.DISEASE_PATHOLOGY,
    name: 'Disease (Pathology)',
    description: 'Fungal, bacterial, viral diseases, forecasting',
    priority: 6,
    sourceFiles: [
      'safety-rules/disease-management-rules.ts',
      'intelligence/disease-forecasting.ts',
      'safety-rules/resistance-management-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.WEED]: {
    group: CanonicalRuleGroup.WEED,
    name: 'Weed',
    description: 'Weed identification, herbicide recommendations, resistance',
    priority: 7,
    sourceFiles: [
      'intelligence/weed-intelligence.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL]: {
    group: CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
    name: 'Soil Health & Physical Constraints',
    description: 'Soil pH, texture, drainage, salinity, waterlogging',
    priority: 8,
    sourceFiles: [
      'crop-group-rules/soil-rules/soil-ph-rules.ts',
      'crop-group-rules/soil-rules/soil-physical-rules.ts',
      'crop-group-rules/soil-rules/soil-biological-rules.ts',
      'safety-rules/soil-ph-interaction-rules.ts',
      'intelligence/soil-test-integration.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.WEATHER_CLIMATE_STRESS]: {
    group: CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    name: 'Weather & Climate Stress',
    description: 'Heat stress, cold stress, rainfall, drought',
    priority: 9,
    sourceFiles: [
      'safety-rules/weather-action-rules.ts',
      'safety-rules/regional-seasonal-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.IRRIGATION_WATER]: {
    group: CanonicalRuleGroup.IRRIGATION_WATER,
    name: 'Irrigation & Water Management',
    description: 'Irrigation scheduling, water stress, critical irrigation',
    priority: 10,
    sourceFiles: [
      'safety-rules/water-rules.ts',
      // Water rules in cereals.ts, vegetables.ts etc.
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.FERTILIZER_INPUT]: {
    group: CanonicalRuleGroup.FERTILIZER_INPUT,
    name: 'Fertilizer & Input Recommendation',
    description: 'Fertilizer dosage, application timing, split recommendations',
    priority: 11,
    sourceFiles: [
      'advanced-rules/precision-fertigation-rules.ts',
      'advanced-rules/pgr-hormone-rules.ts',
      'advanced-rules/microbiome-biological-rules.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION]: {
    group: CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
    name: 'Cropping System & Rotation',
    description: 'Crop rotation, intercropping, companion planting',
    priority: 12,
    sourceFiles: [
      'intelligence/intercropping-rules.ts',
      'intelligence/organic-intelligence.ts',
      'crop-group-rules/organic-farming.ts',
    ],
    ruleCount: 0,
  },
  
  [CanonicalRuleGroup.RISK_WARNING_ADVISORY]: {
    group: CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    name: 'Risk, Warning & Advisory Gates',
    description: 'Safety gates, PHI, pollinator protection, emergency',
    priority: 13,
    sourceFiles: [
      'safety-rules/chemical-safety-rules.ts',
      'safety-rules/phi-withdrawal-rules.ts',
      'safety-rules/emergency-rules.ts',
      'safety-rules/harvest-quality-rules.ts',
      'intelligence/resistance-management.ts',
    ],
    ruleCount: 0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RULE CLASSIFICATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a rule into its canonical group based on category
 */
export function classifyRuleToCanonicalGroup(ruleCategory: string): CanonicalRuleGroup {
  const categoryToGroup: Record<string, CanonicalRuleGroup> = {
    // Group 1: Crop Identity
    'variety': CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION,
    'variety-selection': CanonicalRuleGroup.CROP_IDENTITY_CLASSIFICATION,
    
    // Group 2: Growth Stage
    'phenology': CanonicalRuleGroup.CROP_GROWTH_STAGE,
    'stage': CanonicalRuleGroup.CROP_GROWTH_STAGE,
    
    // Group 3: Symptom & Observation
    'observation': CanonicalRuleGroup.SYMPTOM_OBSERVATION,
    'symptom': CanonicalRuleGroup.SYMPTOM_OBSERVATION,
    'universal': CanonicalRuleGroup.SYMPTOM_OBSERVATION,
    
    // Group 4: Nutrient
    'nutrient': CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    'micronutrient': CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    'deficiency': CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    'toxicity': CanonicalRuleGroup.NUTRIENT_DEFICIENCY_TOXICITY,
    
    // Group 5: Pest
    'pest': CanonicalRuleGroup.PEST_ENTOMOLOGY,
    'ipm': CanonicalRuleGroup.PEST_ENTOMOLOGY,
    'entomology': CanonicalRuleGroup.PEST_ENTOMOLOGY,
    'etl': CanonicalRuleGroup.PEST_ENTOMOLOGY,
    
    // Group 6: Disease
    'disease': CanonicalRuleGroup.DISEASE_PATHOLOGY,
    'pathology': CanonicalRuleGroup.DISEASE_PATHOLOGY,
    'fungal': CanonicalRuleGroup.DISEASE_PATHOLOGY,
    'bacterial': CanonicalRuleGroup.DISEASE_PATHOLOGY,
    'viral': CanonicalRuleGroup.DISEASE_PATHOLOGY,
    
    // Group 7: Weed
    'weed': CanonicalRuleGroup.WEED,
    'herbicide': CanonicalRuleGroup.WEED,
    
    // Group 8: Soil Health
    'soil': CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
    'soil-ph': CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
    'soil-texture': CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
    'salinity': CanonicalRuleGroup.SOIL_HEALTH_PHYSICAL,
    
    // Group 9: Weather
    'weather': CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    'climate': CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    'heat-stress': CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    'cold-stress': CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    'drought': CanonicalRuleGroup.WEATHER_CLIMATE_STRESS,
    
    // Group 10: Irrigation
    'water': CanonicalRuleGroup.IRRIGATION_WATER,
    'irrigation': CanonicalRuleGroup.IRRIGATION_WATER,
    
    // Group 11: Fertilizer
    'fertilizer': CanonicalRuleGroup.FERTILIZER_INPUT,
    'fertigation': CanonicalRuleGroup.FERTILIZER_INPUT,
    'pgr': CanonicalRuleGroup.FERTILIZER_INPUT,
    'biostimulant': CanonicalRuleGroup.FERTILIZER_INPUT,
    
    // Group 12: Cropping System
    'rotation': CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
    'intercropping': CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
    'organic': CanonicalRuleGroup.CROPPING_SYSTEM_ROTATION,
    
    // Group 13: Risk & Safety
    'safety': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'chemical-safety': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'phi': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'emergency': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'warning': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'harvest': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
    'resistance': CanonicalRuleGroup.RISK_WARNING_ADVISORY,
  };
  
  const normalizedCategory = ruleCategory.toLowerCase().trim();
  return categoryToGroup[normalizedCategory] || CanonicalRuleGroup.RISK_WARNING_ADVISORY;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION: Ensure no rule exists outside canonical groups
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleValidationResult {
  isValid: boolean;
  ruleId: string;
  assignedGroup: CanonicalRuleGroup | null;
  violations: string[];
}

export function validateRuleClassification(
  ruleId: string,
  category: string
): RuleValidationResult {
  const group = classifyRuleToCanonicalGroup(category);
  const violations: string[] = [];
  
  // Check if classification was found
  const isKnownCategory = Object.keys(CANONICAL_GROUP_MAPPING).includes(group);
  if (!isKnownCategory) {
    violations.push(`ONTOLOGY_VIOLATION: Rule ${ruleId} has unknown category "${category}"`);
  }
  
  return {
    isValid: violations.length === 0,
    ruleId,
    assignedGroup: group,
    violations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default CANONICAL_GROUP_MAPPING;
