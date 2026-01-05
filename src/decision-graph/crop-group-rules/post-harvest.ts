/**
 * POST-HARVEST MANAGEMENT RULES
 * Coverage: Storage pest management, Drying/Curing, Quality preservation, Storage conditions
 * Total: 50+ rules
 * Sources: ICAR-CIPHET, ICAR-IARI, FAO Post-Harvest Guidelines
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// STORED GRAIN PEST RULES (15 rules)
// Source: ICAR-CIPHET Ludhiana
// ═══════════════════════════════════════════════════════════════════════════

export const STORED_GRAIN_PEST_RULES: CauseRule[] = [
  // Rice Weevil
  {
    rule_id: 'C_POSTHARVEST_PEST_001',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['rice', 'wheat', 'maize', 'sorghum', 'barley'].includes(input.crop_code),
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Rice weevil (Sitophilus oryzae) is primary pest of stored cereals. Adults bore into grain, larvae develop inside. Fumigate with Aluminium phosphide 3 tablets/tonne.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Lesser Grain Borer
  {
    rule_id: 'C_POSTHARVEST_PEST_002',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['wheat', 'rice', 'maize'].includes(input.crop_code),
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Lesser grain borer (Rhyzopertha dominica) causes severe damage in wheat. Both adults and larvae feed on grain. Maintain grain moisture below 12%.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Khapra Beetle
  {
    rule_id: 'C_POSTHARVEST_PEST_003',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 9,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Khapra beetle (Trogoderma granarium) is quarantine pest. Thrives in hot dry conditions (>35°C). Larvae cause 70-80% damage. Methyl bromide fumigation required.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Pulse Beetle
  {
    rule_id: 'C_POSTHARVEST_PEST_004',
    category: 'pest',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['chickpea', 'pigeon_pea', 'mung', 'urad', 'lentil'].includes(input.crop_code),
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Pulse beetle (Callosobruchus chinensis) infests from field. Larvae develop inside seed. Treat with neem oil 10ml/kg or mix with ash 10%.',
    icar_package: 'ICAR-IIPR Pulse Storage'
  },

  // Red Flour Beetle
  {
    rule_id: 'C_POSTHARVEST_PEST_005',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Red flour beetle (Tribolium castaneum) is secondary pest feeding on damaged grain and flour. Indicates existing infestation. Clean storage area thoroughly.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Indian Meal Moth
  {
    rule_id: 'C_POSTHARVEST_PEST_006',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Indian meal moth (Plodia interpunctella) larvae spin webbing on grain surface. Use pheromone traps for monitoring. Fumigate if >5 moths/trap/week.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Angoumois Grain Moth
  {
    rule_id: 'C_POSTHARVEST_PEST_007',
    category: 'pest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['rice', 'maize', 'sorghum'].includes(input.crop_code),
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Angoumois grain moth (Sitotroga cerealella) infests paddy in field. Single larva per grain. Sun-dry grain to 12% moisture before storage.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Groundnut Bruchid
  {
    rule_id: 'C_POSTHARVEST_PEST_008',
    category: 'pest',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'groundnut',
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Groundnut bruchid (Caryedon serratus) damages stored pods. Dry pods to 8% moisture. Store in airtight containers or treat with neem oil.',
    icar_package: 'ICAR-DGR Groundnut Post-Harvest'
  },

  // Coffee Berry Borer (Storage)
  {
    rule_id: 'C_POSTHARVEST_PEST_009',
    category: 'pest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'coffee',
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Coffee berry borer (Hypothenemus hampei) continues in stored coffee. Dry to 11% moisture, use hermetic storage. Screen and remove infested beans.',
    icar_package: 'ICAR-CCRI Coffee Post-Harvest'
  },

  // Tobacco Beetle (Spices)
  {
    rule_id: 'C_POSTHARVEST_PEST_010',
    category: 'pest',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['turmeric', 'ginger', 'chilli', 'black_pepper'].includes(input.crop_code),
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Cigarette beetle (Lasioderma serricorne) damages stored spices. Dry spices to safe moisture, fumigate with phosphine, use airtight packaging.',
    icar_package: 'ICAR-IISR Spice Storage'
  },

  // Potato Tuber Moth
  {
    rule_id: 'C_POSTHARVEST_PEST_011',
    category: 'pest',
    crop_code: 'potato',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'potato',
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Potato tuber moth (Phthorimaea operculella) larvae tunnel tubers. Store in dark, cool (4°C) conditions. Cover heaps with dry leaves of Lantana/Eucalyptus.',
    icar_package: 'ICAR-CPRI Potato Storage'
  },

  // Onion Thrips (Storage)
  {
    rule_id: 'C_POSTHARVEST_PEST_012',
    category: 'pest',
    crop_code: 'onion',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'onion',
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Thrips survive on stored onions. Cure onions properly, remove neck tissue, store in well-ventilated structures at 25-30°C, 65-70% RH.',
    icar_package: 'ICAR-DOGR Onion Storage'
  },

  // Fruit Fly (Mango)
  {
    rule_id: 'C_POSTHARVEST_PEST_013',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'mango',
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Fruit fly (Bactrocera dorsalis) maggots develop in stored fruit. Hot water treatment (48°C for 60 min) before storage kills eggs and larvae.',
    icar_package: 'ICAR-IIHR Mango Post-Harvest'
  },

  // Rodent Damage
  {
    rule_id: 'C_POSTHARVEST_PEST_014',
    category: 'pest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Rodents (Rattus rattus) cause 5-10% storage loss. Use rodent-proof structures, zinc phosphide baits, or fumigation with aluminium phosphide.',
    icar_package: 'ICAR-CIPHET Storage Guidelines'
  },

  // Mold/Aflatoxin Risk
  {
    rule_id: 'C_POSTHARVEST_PEST_015',
    category: 'disease',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 9,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Aspergillus flavus produces aflatoxin in stored grains >14% moisture. Dry to safe moisture, use proper aeration. Reject heavily infected lots.',
    icar_package: 'ICAR-CIPHET Food Safety Guidelines'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// DRYING AND CURING RULES (12 rules)
// Source: ICAR-CIPHET, ICAR-IISR
// ═══════════════════════════════════════════════════════════════════════════

export const DRYING_CURING_RULES: CauseRule[] = [
  // Cereal Drying
  {
    rule_id: 'C_POSTHARVEST_DRY_001',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      ['rice', 'wheat', 'maize'].includes(input.crop_code),
    cause: Cause.GRAIN_DRYING_REQUIRED,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Dry cereals to 12-14% moisture for safe storage. Sun drying on tarpaulin, turn every 2 hours. Mechanical drying at 40-45°C for seed, 50-55°C for grain.',
    icar_package: 'ICAR-CIPHET Drying Guidelines'
  },

  // Pulse Drying
  {
    rule_id: 'C_POSTHARVEST_DRY_002',
    category: 'harvest',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      ['chickpea', 'pigeon_pea', 'mung', 'urad', 'lentil'].includes(input.crop_code),
    cause: Cause.GRAIN_DRYING_REQUIRED,
    priority: 7,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Dry pulses to 9-10% moisture. Avoid cracking by slow drying. Thresh when pods are dry but not brittle.',
    icar_package: 'ICAR-IIPR Pulse Post-Harvest'
  },

  // Turmeric Curing
  {
    rule_id: 'C_POSTHARVEST_CURE_001',
    category: 'harvest',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'turmeric',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Cure turmeric rhizomes in boiling water with sodium bicarbonate (0.1%) for 45-60 min. Dry to 8-10% moisture. Improves color and reduces drying time.',
    icar_package: 'ICAR-IISR Turmeric Processing'
  },

  // Ginger Curing
  {
    rule_id: 'C_POSTHARVEST_CURE_002',
    category: 'harvest',
    crop_code: 'ginger',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'ginger',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'For dry ginger: Scrape skin, soak in water overnight, dry in sun for 7-10 days to 10% moisture. For fresh ginger: Wash, grade, store at 13°C, 65% RH.',
    icar_package: 'ICAR-IISR Ginger Processing'
  },

  // Chilli Drying
  {
    rule_id: 'C_POSTHARVEST_DRY_003',
    category: 'harvest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'chilli',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Sun dry chillies on raised platform for 8-10 days to 10% moisture. Avoid ground drying (contamination). Solar tunnel drying retains color better.',
    icar_package: 'ICAR-IIHR Chilli Post-Harvest'
  },

  // Black Pepper Drying
  {
    rule_id: 'C_POSTHARVEST_DRY_004',
    category: 'harvest',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'black_pepper',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Harvest when 1-2 berries turn red. Thresh, blanch in boiling water for 1 min, sun dry 3-4 days to 10-11% moisture for black pepper.',
    icar_package: 'ICAR-IISR Black Pepper Processing'
  },

  // Onion Curing
  {
    rule_id: 'C_POSTHARVEST_CURE_003',
    category: 'harvest',
    crop_code: 'onion',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'onion',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Cure onions in field for 3-4 days with tops covering bulbs. Then cure in shade for 10-12 days. Neck should be completely dry before storage.',
    icar_package: 'ICAR-DOGR Onion Post-Harvest'
  },

  // Garlic Curing
  {
    rule_id: 'C_POSTHARVEST_CURE_004',
    category: 'harvest',
    crop_code: 'garlic',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'garlic',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Cure garlic in shade for 7-10 days. Remove roots and tops, leaving 2.5cm neck. Store at 0-4°C, 60-70% RH for long storage.',
    icar_package: 'ICAR-DOGR Garlic Post-Harvest'
  },

  // Groundnut Drying
  {
    rule_id: 'C_POSTHARVEST_DRY_005',
    category: 'harvest',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'groundnut',
    cause: Cause.GRAIN_DRYING_REQUIRED,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Dry pods to 8-9% kernel moisture (pods rattle when shaken). Avoid over-drying which causes brittleness. Critical for aflatoxin prevention.',
    icar_package: 'ICAR-DGR Groundnut Post-Harvest'
  },

  // Copra Making (Coconut)
  {
    rule_id: 'C_POSTHARVEST_DRY_006',
    category: 'harvest',
    crop_code: 'coconut',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'coconut',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-CPCRI',
    scientific_basis: 'Split mature nuts, dry in sun 5-6 days or kiln dry for 8-10 hours. Good copra: 6% moisture, white color, no mold. Smoke drying causes discoloration.',
    icar_package: 'ICAR-CPCRI Coconut Processing'
  },

  // Coffee Processing
  {
    rule_id: 'C_POSTHARVEST_DRY_007',
    category: 'harvest',
    crop_code: 'coffee',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'coffee',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Wet processing: Pulp within 24h, ferment 24-36h, wash, dry to 11% moisture. Dry processing: Dry whole cherry to 12%, then hull. Avoid re-wetting.',
    icar_package: 'ICAR-CCRI Coffee Processing'
  },

  // Tea Processing
  {
    rule_id: 'C_POSTHARVEST_DRY_008',
    category: 'harvest',
    crop_code: 'tea',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      (input.crop_stage === CropStage.HARVEST || input.crop_stage === CropStage.POST_HARVEST) &&
      input.crop_code === 'tea',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-TRA',
    scientific_basis: 'Process green leaf within 6 hours. Wither to 60-65% moisture loss, roll, ferment (CTC: 2-3h, Orthodox: 3-4h), dry at 80-90°C to 3% moisture.',
    icar_package: 'ICAR-TRA Tea Processing'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY PRESERVATION RULES (12 rules)
// Source: ICAR-CIPHET, FAO
// ═══════════════════════════════════════════════════════════════════════════

export const QUALITY_PRESERVATION_RULES: CauseRule[] = [
  // Hermetic Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_001',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['rice', 'wheat', 'maize', 'sorghum'].includes(input.crop_code),
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Hermetic (airtight) storage in GrainPro bags or metal bins kills insects through O2 depletion. Effective for 6-12 months storage without chemicals.',
    icar_package: 'ICAR-CIPHET Storage Technology'
  },

  // Cold Storage (Potato)
  {
    rule_id: 'C_POSTHARVEST_QUAL_002',
    category: 'harvest',
    crop_code: 'potato',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'potato',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Store seed potato at 2-4°C, 90-95% RH. Table potato at 10-12°C. CIPC treatment (20-30 ppm) prevents sprouting. Avoid storing with onion/garlic.',
    icar_package: 'ICAR-CPRI Potato Cold Storage'
  },

  // Mango Ripening
  {
    rule_id: 'C_POSTHARVEST_QUAL_003',
    category: 'harvest',
    crop_code: 'mango',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'mango',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Ripen mango using ethylene (100 ppm) in ripening chamber at 20-22°C, 85-90% RH for 48-72h. Avoid calcium carbide (banned, causes health hazards).',
    icar_package: 'ICAR-IIHR Mango Post-Harvest'
  },

  // Banana Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_004',
    category: 'harvest',
    crop_code: 'banana',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'banana',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-NRC Banana',
    scientific_basis: 'Store green banana at 13-14°C, 85-90% RH for 2-3 weeks. Below 12°C causes chilling injury. Ripen with ethylene at 15-20°C.',
    icar_package: 'ICAR-NRC Banana Post-Harvest'
  },

  // Citrus Waxing
  {
    rule_id: 'C_POSTHARVEST_QUAL_005',
    category: 'harvest',
    crop_code: 'citrus',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['orange', 'mandarin', 'lime', 'lemon'].includes(input.crop_code),
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Wash, treat with 2% sodium bicarbonate, wax with carnauba/shellac wax. Store oranges at 5-7°C, mandarins at 4-5°C, 85-90% RH.',
    icar_package: 'ICAR-CCRI Citrus Post-Harvest'
  },

  // Grape Pre-cooling
  {
    rule_id: 'C_POSTHARVEST_QUAL_006',
    category: 'harvest',
    crop_code: 'grapes',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'grapes',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Pre-cool within 6 hours of harvest to 0°C. Fumigate with SO2 (100 ppm). Store at -1 to 0°C, 90-95% RH. Use SO2-releasing pads in cartons.',
    icar_package: 'ICAR-NRC Grapes Post-Harvest'
  },

  // Pomegranate Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_007',
    category: 'harvest',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'pomegranate',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Store at 5-7°C, 90-95% RH for 2-3 months. Pre-cool to remove field heat. Wax coating extends shelf life. Avoid storing below 5°C (chilling injury).',
    icar_package: 'ICAR-NRC Pomegranate Post-Harvest'
  },

  // Tomato Ripening
  {
    rule_id: 'C_POSTHARVEST_QUAL_008',
    category: 'harvest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'tomato',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Harvest at mature green/breaker stage for distant markets. Ripen at 20-25°C. Store ripe tomatoes at 10-15°C, 85-90% RH. Never refrigerate below 10°C.',
    icar_package: 'ICAR-IIHR Tomato Post-Harvest'
  },

  // Apple Cold Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_009',
    category: 'harvest',
    crop_code: 'apple',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.crop_code === 'apple',
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-CITH',
    scientific_basis: 'Store apples at -1 to 0°C, 90-95% RH. Controlled atmosphere (2% O2, 2% CO2) extends storage to 6-8 months. 1-MCP treatment delays ripening.',
    icar_package: 'ICAR-CITH Apple Post-Harvest'
  },

  // Spice Storage Conditions
  {
    rule_id: 'C_POSTHARVEST_QUAL_010',
    category: 'harvest',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['turmeric', 'ginger', 'chilli', 'black_pepper', 'cardamom'].includes(input.crop_code),
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Store dried spices at 10-12% moisture in airtight containers away from light. Vacuum packaging retains volatile oils. Cool, dry conditions essential.',
    icar_package: 'ICAR-IISR Spice Storage'
  },

  // Seed Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_011',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Seed storage: Moisture + Temperature (°F) should not exceed 100. Store at 8-10% moisture, 15-20°C, 40-50% RH. Treat with thiram/captan before storage.',
    icar_package: 'ICAR-IARI Seed Storage'
  },

  // Organic Storage
  {
    rule_id: 'C_POSTHARVEST_QUAL_012',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 6,
    scientific_source: 'ICAR-IIFSR',
    scientific_basis: 'Organic storage: Use neem leaf powder (2%), turmeric powder, or diatomaceous earth. Hermetic storage or triple bagging effective. No synthetic chemicals allowed.',
    icar_package: 'ICAR-IIFSR Organic Storage'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE INFRASTRUCTURE RULES (11 rules)
// Source: ICAR-CIPHET, FCI Guidelines
// ═══════════════════════════════════════════════════════════════════════════

export const STORAGE_INFRASTRUCTURE_RULES: CauseRule[] = [
  // Traditional Storage Improvement
  {
    rule_id: 'C_POSTHARVEST_INFRA_001',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 6,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Improve traditional bins (kothi/bharoli) with cement plaster, polyethylene lining. Raise on platform, coat with mud+cow dung. Capacity 2-10 quintals.',
    icar_package: 'ICAR-CIPHET Farm Storage'
  },

  // Metal Bin Storage
  {
    rule_id: 'C_POSTHARVEST_INFRA_002',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 7,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Use galvanized metal bins (Pusa bin) for safe storage. Airtight construction prevents insects. Capacity 100-3000 kg. Paint externally to prevent corrosion.',
    icar_package: 'ICAR-CIPHET Metal Bin'
  },

  // Warehouse Requirements
  {
    rule_id: 'C_POSTHARVEST_INFRA_003',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 7,
    scientific_source: 'FCI Guidelines',
    scientific_basis: 'Warehouse: Moisture-proof floor, 60cm above ground on dunnage, stack 6m from walls, proper ventilation. Maintain temperature <27°C, RH <65%.',
    icar_package: 'FCI Storage Guidelines'
  },

  // CAP Storage (Cover and Plinth)
  {
    rule_id: 'C_POSTHARVEST_INFRA_004',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.weather_state === WeatherState.RAIN_EXPECTED,
    cause: Cause.MOISTURE_HIGH_STORAGE_RISK,
    priority: 8,
    scientific_source: 'FCI Guidelines',
    scientific_basis: 'CAP storage for buffer stock: 450mm raised plinth, LDPE sheet lining, proper slope for drainage. Cover with 250 micron LDPE. Maximum stack: 6 bags high.',
    icar_package: 'FCI CAP Storage'
  },

  // Fumigation Protocol
  {
    rule_id: 'C_POSTHARVEST_INFRA_005',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Fumigation: Aluminium phosphide 3 tablets (3g)/tonne for 5-7 days. Cover with gas-proof sheets. Safety: 48h ventilation before entry. Trained personnel only.',
    icar_package: 'ICAR-CIPHET Fumigation'
  },

  // Temperature Monitoring
  {
    rule_id: 'C_POSTHARVEST_INFRA_006',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.QUALITY_DEGRADATION_RISK,
    priority: 6,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Monitor grain temperature weekly. Rising temperature indicates insect activity or moisture migration. Aerate or fumigate if temp rises >5°C above ambient.',
    icar_package: 'ICAR-CIPHET Storage Monitoring'
  },

  // Moisture Monitoring
  {
    rule_id: 'C_POSTHARVEST_INFRA_007',
    category: 'harvest',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.MOISTURE_HIGH_STORAGE_RISK,
    priority: 8,
    scientific_source: 'ICAR-CIPHET',
    scientific_basis: 'Check grain moisture monthly using moisture meter. Moisture >14% in cereals, >10% in oilseeds indicates spoilage risk. Re-dry or aerate immediately.',
    icar_package: 'ICAR-CIPHET Moisture Management'
  },

  // Silo Storage
  {
    rule_id: 'C_POSTHARVEST_INFRA_008',
    category: 'harvest',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 7,
    scientific_source: 'FCI Guidelines',
    scientific_basis: 'Modern silo storage: Continuous temperature monitoring, aeration system, automated unloading. Capacity 25,000-100,000 MT. Suitable for bulk handling.',
    icar_package: 'FCI Silo Storage'
  },

  // Cold Chain for Perishables
  {
    rule_id: 'C_POSTHARVEST_INFRA_009',
    category: 'harvest',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST &&
      ['mango', 'banana', 'grapes', 'apple', 'citrus'].includes(input.crop_code),
    cause: Cause.QUALITY_DEGRADATION_RISK,
    priority: 8,
    scientific_source: 'NCCD Guidelines',
    scientific_basis: 'Maintain cold chain: Pre-cooling within 6h, reefer transport, cold storage. Break in cold chain causes condensation and rapid spoilage.',
    icar_package: 'NCCD Cold Chain'
  },

  // Pack House Operations
  {
    rule_id: 'C_POSTHARVEST_INFRA_010',
    category: 'harvest',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: 7,
    scientific_source: 'APEDA Guidelines',
    scientific_basis: 'Pack house: Sorting, grading, washing, drying, packing. Use potable water, hygienic handling. Pre-cool before packing for export.',
    icar_package: 'APEDA Pack House'
  },

  // Phytosanitary Treatment
  {
    rule_id: 'C_POSTHARVEST_INFRA_011',
    category: 'harvest',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    priority: 7,
    scientific_source: 'NPPO Guidelines',
    scientific_basis: 'Export: Hot water treatment (mango: 48°C/60min), vapor heat treatment (47-48°C/90min), or irradiation. Required for fruit fly quarantine compliance.',
    icar_package: 'NPPO Phytosanitary'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED POST-HARVEST RULES
// ═══════════════════════════════════════════════════════════════════════════

export const POST_HARVEST_RULES: CauseRule[] = [
  ...STORED_GRAIN_PEST_RULES,
  ...DRYING_CURING_RULES,
  ...QUALITY_PRESERVATION_RULES,
  ...STORAGE_INFRASTRUCTURE_RULES
];

export default POST_HARVEST_RULES;
