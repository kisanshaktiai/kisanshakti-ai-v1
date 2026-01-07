/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRECISION FERTIGATION RULES - DRIP IRRIGATION + NUTRITION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Based on:
 * - Israel (Netafim, CropX)
 * - Netherlands (Priva, Hoogendoorn)
 * 
 * Technology: Real-time EC/pH monitoring, Stage-based nutrition
 * Yield Impact: 30-50% increase vs. conventional
 * 
 * Sources:
 * - Netafim Precision Agriculture
 * - Priva Fertigation Controllers
 * - Wageningen Precision Nutrition Research
 */

import {
  CauseRule,
  Cause,
  CropStage,
  SoilMoistureState,
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TOMATO PRECISION FERTIGATION (Israel/Netherlands Greenhouse)
// ═══════════════════════════════════════════════════════════════════════════

export const TOMATO_FERTIGATION_RULES: CauseRule[] = [
  // FERT_TOMATO_001: Vegetative Stage Formula (High N)
  {
    rule_id: 'FERT_TOMATO_001',
    category: 'precision_fertigation',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.days_after_sowing >= 10 && input.days_after_sowing <= 35,
    cause: Cause.VEGETATIVE_FERTIGATION_FORMULA,
    priority: 9,
    scientific_source: 'Israel Netafim + Netherlands Wageningen',
    scientific_basis: 'Israeli commercial tomato fertigation formula for vegetative stage. NPK ratio 1:0.5:1.5 (200N-100P2O5-300K2O ppm). EC target 2.0-2.5 dS/m, pH 5.8-6.2. Daily application through drip, split into 6-8 pulses.',
    icar_package: 'Not in ICAR - Precision System'
  },

  // FERT_TOMATO_002: Reproductive/Fruiting Stage Formula (High K)
  {
    rule_id: 'FERT_TOMATO_002',
    category: 'precision_fertigation',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY) &&
      input.days_after_sowing >= 40,
    cause: Cause.REPRODUCTIVE_FERTIGATION_FORMULA,
    priority: 10,
    scientific_source: 'Israel Netafim + Netherlands Rijk Zwaan',
    scientific_basis: 'Israeli commercial tomato fertigation for fruit stage. NPK ratio 1:0.4:2.5 (180N-75P2O5-450K2O ppm). HIGH POTASSIUM for fruit quality. EC target 2.5-3.5 dS/m. Calcium critical for preventing BER - maintain Ca:K ratio 0.7:1.',
    icar_package: 'Not in ICAR - Precision System'
  },

  // FERT_TOMATO_003: EC Management - Too High (Salt Stress)
  {
    rule_id: 'FERT_TOMATO_003',
    category: 'precision_fertigation',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.moisture === SoilMoistureState.DRY, // Proxy for salt buildup
    cause: Cause.EC_TOO_HIGH,
    priority: 10,
    scientific_source: 'Israel CropX Monitoring Systems',
    scientific_basis: 'Rootzone EC >4.0 dS/m causes osmotic stress, reduces water uptake, wilting despite wet soil. Israeli standard: Flush with plain water (EC <0.5) using 20-30% leaching fraction until rootzone EC drops to target range.',
    icar_package: 'Not in ICAR - Precision Monitoring'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// POTATO PRECISION FERTIGATION
// ═══════════════════════════════════════════════════════════════════════════

export const POTATO_FERTIGATION_RULES: CauseRule[] = [
  // FERT_POTATO_001: Tuber Initiation Stage
  {
    rule_id: 'FERT_POTATO_001',
    category: 'precision_fertigation',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.days_after_sowing >= 30 && input.days_after_sowing <= 45,
    cause: Cause.TUBER_INITIATION_CRITICAL,
    priority: 10,
    scientific_source: 'Israel Potato Growers + ICAR-CPRI',
    scientific_basis: 'Tuber initiation (30-45 DAP) is the most critical water period in potato. Water stress during this 15-day window reduces tuber number by 40-60%. Once tuber set is determined, it cannot be recovered. Irrigate when soil moisture drops to 60-70% field capacity.',
    icar_package: 'ICAR-CPRI Critical Irrigation Stages 2024'
  },

  // FERT_POTATO_002: Tuber Bulking Stage
  {
    rule_id: 'FERT_POTATO_002',
    category: 'precision_fertigation',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 70 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.TUBER_BULKING_WATER,
    priority: 9,
    scientific_source: 'Israel Drip Irrigation + ICAR-CPRI',
    scientific_basis: 'Tuber bulking (45-70 DAP) determines tuber size. Consistent moisture + high K fertigation increases tuber weight by 20-30%. Apply K:N ratio 1.5:1 during this stage.',
    icar_package: 'Not in ICAR - Precision Technology'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ONION PRECISION FERTIGATION
// ═══════════════════════════════════════════════════════════════════════════

export const ONION_FERTIGATION_RULES: CauseRule[] = [
  // FERT_ONION_001: Bulb Formation Critical
  {
    rule_id: 'FERT_ONION_001',
    category: 'precision_fertigation',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.BULB_FORMATION_CRITICAL,
    priority: 9,
    scientific_source: 'Israel Onion Production + ICAR-DOGR',
    scientific_basis: 'Bulb formation requires consistent moisture + high S and K. Israeli formula: NPK 1:0.3:2 with 30% S of total fertilizer. Sulphur is critical for onion pungency and storage quality.',
    icar_package: 'Not in ICAR - Precision Technology'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL FERTIGATION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FERTIGATION_RULES: CauseRule[] = [
  ...TOMATO_FERTIGATION_RULES,
  ...POTATO_FERTIGATION_RULES,
  ...ONION_FERTIGATION_RULES,
];

export default ALL_FERTIGATION_RULES;
