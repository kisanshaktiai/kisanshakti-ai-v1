/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 2: ROOT DOMINANCE PHASE LOGIC
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Defines first 25-30% of crop life as ROOT PRIORITY phase.
 * 
 * Rules:
 * - Reduce early nitrogen dominance
 * - Increase phosphorus efficiency, calcium, humic/seaweed support
 * - Root health decisions precede shoot expansion
 * 
 * ICAR ALIGNMENT: Based on ICAR's emphasis on root establishment.
 * Extends by adding biostimulant recommendations.
 * 
 * Version: 2.0.0
 */

import { CropStage, SoilPState, SoilOCState } from '../types';
import {
  AdvancedCauseRule,
  AdvancedDecisionInput,
  ROOT_DOMINANCE_THRESHOLD,
  SOIL_OC_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 RULES: Root Dominance Phase
// ═══════════════════════════════════════════════════════════════════════════

export const ROOT_DOMINANCE_RULES: AdvancedCauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // RD_001: Early crop life → Root priority phase
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_RD_001',
    layer: 2,
    category: 'root_dominance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      
      return (
        cropLifePercent <= ROOT_DOMINANCE_THRESHOLD &&
        (input.crop_stage === CropStage.GERMINATION || 
         input.crop_stage === CropStage.VEGETATIVE)
      );
    },
    
    cause: 'ROOT_PRIORITY_PHASE',
    priority: 8,
    
    yield_impact_percent: { min: 15, max: 35 },
    
    scientific_source: 'FAO Root Development + ICAR Establishment',
    scientific_basis: 'Strong root development in first 25-30% of crop life determines final yield potential. Plants with deeper, healthier roots can access more water and nutrients, withstand stress better.',
    global_practice_ref: 'Australia Dryland Farming, Israel Desert Agriculture',
    icar_alignment: 'ICAR emphasizes early establishment. This extends with specific root support protocols.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RD_002: Root phase + low phosphorus → Critical P application
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_RD_002',
    layer: 2,
    category: 'root_dominance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      
      return (
        cropLifePercent <= ROOT_DOMINANCE_THRESHOLD &&
        input.soil_states.p === SoilPState.LOW_P
      );
    },
    
    cause: 'ROOT_PHOSPHORUS_CRITICAL',
    priority: 9,
    
    yield_impact_percent: { min: 20, max: 40 },
    
    scientific_source: 'ICAR-IISS + Global P Research',
    scientific_basis: 'Phosphorus is immobile in soil. Early application is critical for root development. P deficiency in root phase causes PERMANENT yield reduction that cannot be corrected later.',
    global_practice_ref: 'CIMMYT P Management, Brazil Cerrado Protocol',
    icar_alignment: 'Directly supports ICAR phosphorus basal application recommendation'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RD_003: Root phase + low organic carbon → Biostimulant window
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_RD_003',
    layer: 2,
    category: 'root_dominance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      const soilOC = input.soil_states.organic_carbon;
      
      return (
        cropLifePercent <= ROOT_DOMINANCE_THRESHOLD &&
        (soilOC === SoilOCState.LOW_OC || soilOC === SoilOCState.MEDIUM_OC)
      );
    },
    
    cause: 'ROOT_BIOSTIMULANT_WINDOW',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 25 },
    
    scientific_source: 'European Biostimulant Research + ICAR Organic',
    scientific_basis: 'Low organic carbon soils lack natural root-supporting compounds. Humic acid and seaweed extracts provide auxin-like stimulation, improving root mass by 20-40%.',
    global_practice_ref: 'EU Biostimulant Regulations, China Seaweed Research',
    icar_alignment: 'Complements ICAR organic matter recommendations'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RD_004: Root phase + alkaline soil → Calcium support
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_RD_004',
    layer: 2,
    category: 'root_dominance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      
      return (
        cropLifePercent <= ROOT_DOMINANCE_THRESHOLD &&
        input.soil_states.ph === 'ALKALINE'
      );
    },
    
    cause: 'ROOT_CALCIUM_NEEDED',
    priority: 6,
    
    yield_impact_percent: { min: 5, max: 15 },
    
    scientific_source: 'ICAR Soil Science + Global Research',
    scientific_basis: 'Alkaline soils often have calcium present but in unavailable form (CaCO3). Gypsum provides available calcium for root cell wall development without raising pH further.',
    global_practice_ref: 'USA Midwest Farming, Australian Alkaline Soils',
    icar_alignment: 'Extends ICAR gypsum recommendation with timing specificity'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RD_005: Early vegetative → Reduce N, boost root support
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ADV_RD_005',
    layer: 2,
    category: 'root_dominance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const cropLifePercent = input.crop_life_percent ?? 0;
      const das = input.days_after_sowing;
      
      // Very early vegetative (15-25% of crop life)
      return (
        cropLifePercent >= 0.15 &&
        cropLifePercent <= 0.25 &&
        das >= 15 && das <= 35  // Typical early vegetative window
      );
    },
    
    cause: 'EARLY_ROOT_DEVELOPMENT',
    priority: 7,
    
    yield_impact_percent: { min: 10, max: 20 },
    
    scientific_source: 'Plant Physiology Research',
    scientific_basis: 'Excessive early nitrogen promotes shoot growth at root expense. Balanced nutrition with emphasis on P, Ca, and biostimulants creates stronger root-shoot ratio.',
    global_practice_ref: 'Japan Rice Research, Netherlands Horticulture',
    icar_alignment: 'Supports ICAR split N application by justifying delayed first N dose'
  }
];

/**
 * Check if crop is in root dominance phase
 */
export function isInRootDominancePhase(input: AdvancedDecisionInput): boolean {
  const cropLifePercent = input.crop_life_percent ?? 0;
  return cropLifePercent <= ROOT_DOMINANCE_THRESHOLD;
}

/**
 * Get root dominance recommendations
 */
export function evaluateRootDominanceRules(
  input: AdvancedDecisionInput
): AdvancedCauseRule[] {
  return ROOT_DOMINANCE_RULES.filter(rule => {
    // Check stage applicability
    if (!rule.stage_applicable.includes(input.crop_stage)) {
      return false;
    }
    
    // Check crop code
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) {
      return false;
    }
    
    // Check conditions
    return rule.conditions(input);
  });
}
