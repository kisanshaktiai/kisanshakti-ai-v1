/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 5: SOIL MICROBIOLOGY PRIORITY LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Prefer biological solutions when:
 * - Soil organic carbon < threshold
 * - Chemical response efficiency is low
 * - Organic farming mode
 * 
 * Microbes covered:
 * - PSB (Phosphate Solubilizing Bacteria)
 * - KMB (Potash Mobilizing Bacteria)
 * - Zinc solubilizers
 * - Mycorrhiza
 * - Trichoderma
 * 
 * ICAR ALIGNMENT: Based on ICAR biofertilizer recommendations. Extends with
 * efficiency-based prioritization logic.
 * 
 * Version: 2.0.0
 */

import { CropStage, SoilOCState, SoilPState, SoilKState, FarmingMode, SoilZincState } from '../types';
import {
  AdvancedCauseRule,
  AdvancedDecisionInput,
  CHEMICAL_EFFICIENCY_THRESHOLD,
  SOIL_OC_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5 RULES: Soil Microbiology Priority
// ═══════════════════════════════════════════════════════════════════════════

export const SOIL_MICROBIOLOGY_RULES: AdvancedCauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // SM_001: Low OC + low chemical efficiency → Microbiology priority
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_001',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING, CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const soilOC = input.soil_states.organic_carbon;
      const chemicalEfficiency = input.chemical_response_efficiency ?? 0.7;
      
      return (
        soilOC === SoilOCState.LOW_OC &&
        chemicalEfficiency < CHEMICAL_EFFICIENCY_THRESHOLD
      );
    },
    
    cause: 'MICROBIOLOGY_PRIORITY',
    priority: 8,
    
    yield_impact_percent: { min: 15, max: 30 },
    
    scientific_source: 'ICAR Biofertilizer + Global Soil Biology',
    scientific_basis: 'Low organic carbon soils lack microbial diversity for nutrient cycling. Chemical fertilizers have 40-50% lower efficiency. Biofertilizers restore soil biology and improve long-term fertility.',
    global_practice_ref: 'Brazil Bio-based Agriculture, European Organic Standards',
    icar_alignment: 'Directly supports ICAR biofertilizer integration'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_002: Low P + any stage → PSB recommended
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_002',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING, CropStage.GERMINATION],
    
    conditions: (input) => {
      return (
        input.soil_states.p === SoilPState.LOW_P &&
        input.soil_states.ph !== 'ACIDIC'  // PSB works best in neutral-alkaline
      );
    },
    
    cause: 'PSB_RECOMMENDED',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 20 },
    
    scientific_source: 'ICAR-IARI Biofertilizer Research',
    scientific_basis: 'PSB (Bacillus megaterium, Pseudomonas striata) solubilizes fixed P, increasing plant-available P by 20-30%. Most effective in alkaline soils where P is locked.',
    global_practice_ref: 'India National Biofertilizer Program',
    icar_alignment: 'ICAR recommends PSB for P management - this adds timing logic'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_003: Low K + vegetative → KMB recommended
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_003',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      return (
        input.soil_states.k === SoilKState.LOW_K &&
        input.crop_stage !== CropStage.REPRODUCTIVE  // KMB needs time to establish
      );
    },
    
    cause: 'KMB_RECOMMENDED',
    priority: 6,
    
    yield_impact_percent: { min: 8, max: 15 },
    
    scientific_source: 'ICAR Biofertilizer Guide',
    scientific_basis: 'KMB (Frateuria aurantia) mobilizes fixed K from soil minerals. Reduces K fertilizer requirement by 25-30%. Apply at sowing or early vegetative for best results.',
    global_practice_ref: 'India Biofertilizer Development',
    icar_alignment: 'Supports ICAR KMB recommendation with stage specificity'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_004: Alkaline soil + zinc deficiency → Zinc solubilizer
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_004',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const soilZn = input.soil_states.zinc;
      
      return (
        input.soil_states.ph === 'ALKALINE' &&
        soilZn === SoilZincState.LOW_ZN
      );
    },
    
    cause: 'ZINC_SOLUBILIZER_NEEDED',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'ICAR Micronutrient Research',
    scientific_basis: 'Zinc is severely locked in alkaline soils (pH > 7.5). ZnSB (Thiobacillus thiooxidans) acidifies rhizosphere locally, increasing Zn availability without soil acidification.',
    global_practice_ref: 'Global Zinc Deficiency Management',
    icar_alignment: 'Extends ICAR Zn recommendations with biological option'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_005: Root disease risk + early stage → Mycorrhiza + Trichoderma
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_005',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    
    conditions: (input) => {
      const biologicalActivity = input.biological_activity_score ?? 0.5;
      
      return (
        biologicalActivity < 0.5 &&
        (input.crop_stage === CropStage.SOWING || input.crop_stage === CropStage.GERMINATION)
      );
    },
    
    cause: 'MYCORRHIZA_BENEFICIAL',
    priority: 7,
    
    yield_impact_percent: { min: 15, max: 35 },
    
    scientific_source: 'Global Mycorrhiza Research + ICAR',
    scientific_basis: 'Mycorrhiza (VAM) extends root surface area by 700%. Provides disease protection, drought tolerance, and P uptake. Must be applied at sowing - cannot establish in mature plants.',
    global_practice_ref: 'European Organic Certification, USA Regenerative Ag',
    icar_alignment: 'ICAR recommends VAM - this adds biological activity trigger'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_006: Organic farming mode → Always prioritize biology
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_006',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING, CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      return input.farming_mode === FarmingMode.ORGANIC_ONLY;
    },
    
    cause: 'MICROBIOLOGY_PRIORITY',
    priority: 9,
    
    yield_impact_percent: { min: 20, max: 40 },
    
    scientific_source: 'Organic Farming Standards + ICAR Organic',
    scientific_basis: 'Organic farming requires biological nutrient cycling. Comprehensive biofertilizer program (PSB + KMB + Azotobacter + VAM + Trichoderma) is mandatory for organic certification.',
    global_practice_ref: 'IFOAM Organic Standards, PGS-India',
    icar_alignment: 'Core to ICAR organic farming package'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SM_007: High humidity + any stage → Trichoderma priority
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_SM_007',
    layer: 5,
    category: 'soil_microbiology',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const forecast3day = input.weather_forecast_3day ?? [];
      
      // High humidity conditions favor fungal diseases
      const diseaseConditions = 
        input.weather_state === 'HIGH_HUMIDITY' ||
        forecast3day.some(w => w === 'HIGH_HUMIDITY');
      
      return diseaseConditions;
    },
    
    cause: 'TRICHODERMA_PRIORITY',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'ICAR IPM + Global Biocontrol',
    scientific_basis: 'Trichoderma viride/harzianum outcompetes pathogenic fungi and produces antifungal compounds. Preventive application before disease-favorable conditions is more effective than rescue.',
    global_practice_ref: 'FAO IPM Guidelines',
    icar_alignment: 'ICAR recommends Trichoderma in IPM - this adds weather trigger'
  }
];

/**
 * Check if biological solution should be prioritized
 */
export function shouldPrioritizeBiology(input: AdvancedDecisionInput): {
  prioritize: boolean;
  reason: string;
  recommended_biofertilizers: string[];
} {
  const soilOC = input.soil_states.organic_carbon;
  const chemicalEfficiency = input.chemical_response_efficiency ?? 0.7;
  const farmingMode = input.farming_mode;
  
  const recommended: string[] = [];
  
  // Always prioritize for organic
  if (farmingMode === FarmingMode.ORGANIC_ONLY) {
    recommended.push('PSB', 'KMB', 'Azotobacter', 'VAM', 'Trichoderma');
    return {
      prioritize: true,
      reason: 'Organic farming mode - biology is primary nutrient source',
      recommended_biofertilizers: recommended
    };
  }
  
  // Low OC + low efficiency
  if (soilOC === SoilOCState.LOW_OC && chemicalEfficiency < CHEMICAL_EFFICIENCY_THRESHOLD) {
    if (input.soil_states.p === SoilPState.LOW_P) recommended.push('PSB');
    if (input.soil_states.k === SoilKState.LOW_K) recommended.push('KMB');
    recommended.push('Azotobacter', 'VAM');
    
    return {
      prioritize: true,
      reason: 'Low organic carbon and poor chemical response - biology will improve efficiency',
      recommended_biofertilizers: recommended
    };
  }
  
  return {
    prioritize: false,
    reason: 'Conventional approach appropriate',
    recommended_biofertilizers: []
  };
}

/**
 * Evaluate soil microbiology rules
 */
export function evaluateSoilMicrobiologyRules(
  input: AdvancedDecisionInput
): AdvancedCauseRule[] {
  return SOIL_MICROBIOLOGY_RULES.filter(rule => {
    if (!rule.stage_applicable.includes(input.crop_stage)) {
      return false;
    }
    
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) {
      return false;
    }
    
    return rule.conditions(input);
  });
}
