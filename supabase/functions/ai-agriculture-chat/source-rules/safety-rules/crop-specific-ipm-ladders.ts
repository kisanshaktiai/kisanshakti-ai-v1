/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP-SPECIFIC IPM LADDERS - 15 MAJOR PEST-CROP COMBINATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P5 (IPM Preference)
 * Standards: IRAC (Insecticide Resistance Action Committee)
 *            FRAC (Fungicide Resistance Action Committee)
 *            ICAR-NCIPM IPM Guidelines 2024
 * 
 * Each ladder has specific levels with SPECIFIC protocols for SPECIFIC pest-crop pairs
 * Chemical recommendations include IRAC Group numbers for resistance management
 */

import {
  CauseRule,
  Cause,
  CropStage,
  DecisionInput,
  PriorityLevel
} from '../types';

// Type helpers
function num(value: unknown, defaultValue: number = 0): number {
  return typeof value === 'number' && !isNaN(value) ? value : defaultValue;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TOMATO FRUIT BORER (Helicoverpa armigera) IPM LADDER
// ETL: 10% damaged fruits or 2-3 larvae/plant
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_TOMATO_FRUIT_BORER: CauseRule[] = [
  // LEVEL 1: CULTURAL (0-10% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L1',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage <= 10;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIVR + ICAR-NCIPM',
    scientific_basis: 'Cultural: Hand-pick egg masses and larvae. Destroy damaged fruits immediately. Deep summer plowing kills pupae in soil.',
    icar_package: 'ICAR-IIVR Tomato IPM Package 2024'
  },

  // LEVEL 2: MECHANICAL (10-15% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L2',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage > 10 && damage <= 15;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NCIPM',
    scientific_basis: 'Install pheromone traps @ 12/acre. Light traps @ 1/acre. Monitor and hand-pick egg masses daily.',
    icar_package: 'Pheromone Trap Protocols NCIPM'
  },

  // LEVEL 3: BIOLOGICAL (15-20% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L3',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage > 15 && damage <= 20;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII Bangalore',
    scientific_basis: 'Release Trichogramma pretiosum @ 50,000/acre weekly for 3 weeks. Spray NPV (HaNPV) 250 LE/ha + jaggery 0.5%. Spray at evening for UV protection.',
    icar_package: 'ICAR-NBAII Biocontrol Package'
  },

  // LEVEL 4: BOTANICAL (20-30% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L4',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage > 20 && damage <= 30;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR Organic Farming',
    scientific_basis: 'Neem oil 5ml/L OR NSKE 5% spray. Alternatively Bt (Bacillus thuringiensis) 1kg/ha. Apply at evening. Repeat after 7 days.',
    icar_package: 'Organic Pest Management ICAR'
  },

  // LEVEL 5: SELECTIVE CHEMICAL (30-40% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L5',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage > 30 && damage <= 40;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + ICAR-IIVR',
    scientific_basis: 'ROTATE between: (1) Spinosad 0.3ml/L (IRAC Group 5), (2) Chlorantraniliprole 0.3ml/L (IRAC 28), (3) Indoxacarb 0.5ml/L (IRAC 22). NEVER use same group consecutively. PHI: 3-5 days.',
    icar_package: 'IRAC Resistance Management + IIVR'
  },

  // LEVEL 6: BROAD SPECTRUM EMERGENCY (>40% infestation)
  {
    rule_id: 'IPM_TOMATO_FB_L6',
    category: 'ipm',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'tomato' && 
             input.metadata?.pest_detected === 'FRUIT_BORER' &&
             damage > 40;
    },
    cause: Cause.IPM_TOMATO_FRUIT_BORER_L6,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Emergency Protocol ICAR',
    scientific_basis: 'EMERGENCY ONLY: Emamectin benzoate 0.4g/L (IRAC 6) OR Profenofos 2ml/L (IRAC 1B). MUST consult expert. PHI: 7 days minimum. Document resistance.',
    icar_package: 'ICAR Emergency Pest Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. COTTON BOLLWORM (Helicoverpa armigera) IPM LADDER
// ETL: 1 larva/10 plants OR 10% square/boll damage
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_COTTON_BOLLWORM: CauseRule[] = [
  {
    rule_id: 'IPM_COTTON_BW_L1',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae < 1;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-CICR Nagpur',
    scientific_basis: 'Cultural: Intercrop with marigold (trap crop). Maintain 2:1 cotton:marigold rows. Deep summer plowing kills pupae.',
    icar_package: 'ICAR-CICR Cotton IPM 2024'
  },
  {
    rule_id: 'IPM_COTTON_BW_L2',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae >= 1 && larvae < 2;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Pheromone traps @ 15/acre. Monitor weekly. Hand-pick egg masses and young larvae from terminals.',
    icar_package: 'CICR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_COTTON_BW_L3',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae >= 2 && larvae < 4;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Release Trichogramma chilonis @ 50,000/acre weekly. Spray HaNPV 250 LE/ha at dusk. Chrysoperla release @ 10,000/acre.',
    icar_package: 'NBAII Cotton Biocontrol'
  },
  {
    rule_id: 'IPM_COTTON_BW_L4',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae >= 4 && larvae < 6;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Spray Bt (Bacillus thuringiensis var. kurstaki) 1kg/ha OR Neem oil 5ml/L. Evening application critical.',
    icar_package: 'CICR Botanical Control'
  },
  {
    rule_id: 'IPM_COTTON_BW_L5',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae >= 6 && larvae < 10;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + CICR',
    scientific_basis: 'ROTATE: Spinosad 0.3ml/L (IRAC 5) OR Chlorantraniliprole 0.3ml/L (IRAC 28) OR Flubendiamide 0.2ml/L (IRAC 28). Never repeat same group. PHI: 7 days.',
    icar_package: 'IRAC Bollworm Resistance Management'
  },
  {
    rule_id: 'IPM_COTTON_BW_L6',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_10_plants, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'BOLLWORM' &&
             larvae >= 10;
    },
    cause: Cause.IPM_COTTON_BOLLWORM_L6,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'Emergency ICAR-CICR',
    scientific_basis: 'EMERGENCY: Thiodicarb 1.5g/L (IRAC 1A) OR Profenofos+Cypermethrin (IRAC 1B+3A). Expert consultation mandatory. Document resistance.',
    icar_package: 'CICR Emergency Protocol'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 3. COTTON WHITEFLY (Bemisia tabaci) IPM LADDER
// ETL: 5-6 adults/leaf at squaring
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_COTTON_WHITEFLY: CauseRule[] = [
  {
    rule_id: 'IPM_COTTON_WF_L1',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const adults = num(input.metadata?.whitefly_adults_per_leaf, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'WHITEFLY' &&
             adults < 3;
    },
    cause: Cause.IPM_COTTON_WHITEFLY_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Border crops: Maize/sorghum as barrier. Avoid water stress - stressed plants attract whitefly. Balanced nutrition - avoid excess N.',
    icar_package: 'CICR Whitefly Management 2024'
  },
  {
    rule_id: 'IPM_COTTON_WF_L2',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const adults = num(input.metadata?.whitefly_adults_per_leaf, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'WHITEFLY' &&
             adults >= 3 && adults < 5;
    },
    cause: Cause.IPM_COTTON_WHITEFLY_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'CICR',
    scientific_basis: 'Yellow sticky traps @ 20/acre. Water spray on leaf undersurface to dislodge nymphs.',
    icar_package: 'CICR Mechanical Control'
  },
  {
    rule_id: 'IPM_COTTON_WF_L3',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const adults = num(input.metadata?.whitefly_adults_per_leaf, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'WHITEFLY' &&
             adults >= 5 && adults < 8;
    },
    cause: Cause.IPM_COTTON_WHITEFLY_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'NBAII + CICR',
    scientific_basis: 'Release Chrysoperla carnea @ 10,000/acre. Conserve natural enemies - avoid broad spectrum chemicals.',
    icar_package: 'Biocontrol Whitefly Package'
  },
  {
    rule_id: 'IPM_COTTON_WF_L4',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const adults = num(input.metadata?.whitefly_adults_per_leaf, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'WHITEFLY' &&
             adults >= 8 && adults < 12;
    },
    cause: Cause.IPM_COTTON_WHITEFLY_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'CICR Organic',
    scientific_basis: 'Neem oil 5ml/L + sticker. Spray leaf undersurface thoroughly. Repeat after 7 days.',
    icar_package: 'CICR Botanical Package'
  },
  {
    rule_id: 'IPM_COTTON_WF_L5',
    category: 'ipm',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const adults = num(input.metadata?.whitefly_adults_per_leaf, 0);
      return input.crop_code === 'cotton' && 
             input.metadata?.pest_detected === 'WHITEFLY' &&
             adults >= 12;
    },
    cause: Cause.IPM_COTTON_WHITEFLY_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + CICR',
    scientific_basis: 'ROTATE: Spiromesifen 0.75ml/L (IRAC 23) OR Diafenthiuron 1g/L (IRAC 12A) OR Pyriproxyfen 1ml/L (IRAC 7C). NEVER repeat. PHI: 15 days.',
    icar_package: 'IRAC Whitefly Resistance Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 4. RICE STEM BORER (Scirpophaga incertulas) IPM LADDER
// ETL: 5% dead hearts (vegetative) or 2% white ears (reproductive)
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_RICE_STEM_BORER: CauseRule[] = [
  {
    rule_id: 'IPM_RICE_SB_L1',
    category: 'ipm',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'rice' && 
             input.metadata?.pest_detected === 'STEM_BORER' &&
             deadHearts < 2;
    },
    cause: Cause.IPM_RICE_STEM_BORER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-CRRI Cuttack',
    scientific_basis: 'Cultural: Clip tips during transplanting. Remove and destroy egg masses. Avoid excessive nitrogen. Maintain proper spacing.',
    icar_package: 'ICAR-CRRI Rice IPM Package'
  },
  {
    rule_id: 'IPM_RICE_SB_L2',
    category: 'ipm',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'rice' && 
             input.metadata?.pest_detected === 'STEM_BORER' &&
             deadHearts >= 2 && deadHearts < 5;
    },
    cause: Cause.IPM_RICE_STEM_BORER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'CRRI',
    scientific_basis: 'Install pheromone traps @ 5/acre for monitoring. Light traps @ 1/acre. Pull out and destroy affected tillers.',
    icar_package: 'CRRI Monitoring Protocol'
  },
  {
    rule_id: 'IPM_RICE_SB_L3',
    category: 'ipm',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'rice' && 
             input.metadata?.pest_detected === 'STEM_BORER' &&
             deadHearts >= 5 && deadHearts < 10;
    },
    cause: Cause.IPM_RICE_STEM_BORER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Release Trichogramma japonicum @ 50,000/acre at 30, 37, 44 DAT. Conserve spiders and dragonflies.',
    icar_package: 'NBAII Rice Biocontrol'
  },
  {
    rule_id: 'IPM_RICE_SB_L4',
    category: 'ipm',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'rice' && 
             input.metadata?.pest_detected === 'STEM_BORER' &&
             deadHearts >= 10 && deadHearts < 15;
    },
    cause: Cause.IPM_RICE_STEM_BORER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'CRRI Organic',
    scientific_basis: 'Neem oil 5ml/L OR Bt spray 1kg/ha. Apply in whorl. Evening application preferred.',
    icar_package: 'CRRI Botanical Package'
  },
  {
    rule_id: 'IPM_RICE_SB_L5',
    category: 'ipm',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'rice' && 
             input.metadata?.pest_detected === 'STEM_BORER' &&
             deadHearts >= 15;
    },
    cause: Cause.IPM_RICE_STEM_BORER_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + CRRI',
    scientific_basis: 'ROTATE: Cartap hydrochloride 1kg/ha (IRAC 14) OR Chlorantraniliprole 0.3ml/L (IRAC 28) OR Fipronil 0.3ml/L (IRAC 2B). PHI: 21 days.',
    icar_package: 'IRAC Rice Stem Borer Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 5. WHEAT APHID (Sitobion avenae) IPM LADDER
// ETL: 10-15 aphids/ear at milk stage
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_WHEAT_APHID: CauseRule[] = [
  {
    rule_id: 'IPM_WHEAT_AP_L1',
    category: 'ipm',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const aphids = num(input.metadata?.aphids_per_ear, 0);
      return input.crop_code === 'wheat' && 
             input.metadata?.pest_detected === 'APHID' &&
             aphids < 5;
    },
    cause: Cause.IPM_WHEAT_APHID_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IARI New Delhi',
    scientific_basis: 'Cultural: Timely sowing (avoid late sowing). Balanced nitrogen. Conserve natural enemies like ladybird beetles, syrphid flies.',
    icar_package: 'ICAR-IARI Wheat IPM Package'
  },
  {
    rule_id: 'IPM_WHEAT_AP_L2',
    category: 'ipm',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const aphids = num(input.metadata?.aphids_per_ear, 0);
      return input.crop_code === 'wheat' && 
             input.metadata?.pest_detected === 'APHID' &&
             aphids >= 5 && aphids < 10;
    },
    cause: Cause.IPM_WHEAT_APHID_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IARI',
    scientific_basis: 'Yellow pan water traps for monitoring. Spot treatment of infested patches only. Conserve Coccinellid beetles.',
    icar_package: 'IARI Monitoring Protocol'
  },
  {
    rule_id: 'IPM_WHEAT_AP_L3',
    category: 'ipm',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const aphids = num(input.metadata?.aphids_per_ear, 0);
      return input.crop_code === 'wheat' && 
             input.metadata?.pest_detected === 'APHID' &&
             aphids >= 10 && aphids < 20;
    },
    cause: Cause.IPM_WHEAT_APHID_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Release Chrysoperla carnea @ 10,000/acre. Conserve parasitoids (Aphidius spp.). Avoid broad spectrum chemicals.',
    icar_package: 'NBAII Wheat Biocontrol'
  },
  {
    rule_id: 'IPM_WHEAT_AP_L4',
    category: 'ipm',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const aphids = num(input.metadata?.aphids_per_ear, 0);
      return input.crop_code === 'wheat' && 
             input.metadata?.pest_detected === 'APHID' &&
             aphids >= 20 && aphids < 30;
    },
    cause: Cause.IPM_WHEAT_APHID_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IARI Organic',
    scientific_basis: 'Neem oil 5ml/L + detergent 0.5ml/L. Spray on ears during morning hours. Repeat after 10 days if needed.',
    icar_package: 'IARI Botanical Package'
  },
  {
    rule_id: 'IPM_WHEAT_AP_L5',
    category: 'ipm',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const aphids = num(input.metadata?.aphids_per_ear, 0);
      return input.crop_code === 'wheat' && 
             input.metadata?.pest_detected === 'APHID' &&
             aphids >= 30;
    },
    cause: Cause.IPM_WHEAT_APHID_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IARI',
    scientific_basis: 'ROTATE: Dimethoate 0.03% (IRAC 1B) OR Thiamethoxam 0.2g/L (IRAC 4A) OR Acetamiprid 0.2g/L (IRAC 4A). Single spray usually sufficient. PHI: 15 days.',
    icar_package: 'IRAC Wheat Aphid Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 6. BRINJAL SHOOT & FRUIT BORER (Leucinodes orbonalis) IPM LADDER
// ETL: 5% shoot/fruit damage
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_BRINJAL_SHOOT_FRUIT_BORER: CauseRule[] = [
  {
    rule_id: 'IPM_BRINJAL_SFB_L1',
    category: 'ipm',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.shoot_fruit_damage_percent, 0);
      return input.crop_code === 'brinjal' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage < 5;
    },
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIVR Varanasi',
    scientific_basis: 'Cultural: Clip and destroy infested shoots weekly. Use resistant varieties if available. Proper spacing for ventilation.',
    icar_package: 'ICAR-IIVR Brinjal IPM Package'
  },
  {
    rule_id: 'IPM_BRINJAL_SFB_L2',
    category: 'ipm',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.shoot_fruit_damage_percent, 0);
      return input.crop_code === 'brinjal' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 5 && damage < 10;
    },
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIVR',
    scientific_basis: 'Install pheromone traps @ 20/acre. Collect and destroy infested fruits. Use light traps @ 1/acre.',
    icar_package: 'IIVR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_BRINJAL_SFB_L3',
    category: 'ipm',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.shoot_fruit_damage_percent, 0);
      return input.crop_code === 'brinjal' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 10 && damage < 20;
    },
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Release Trichogramma chilonis @ 50,000/acre at weekly intervals. Spray Bt 1kg/ha at evening.',
    icar_package: 'NBAII Brinjal Biocontrol'
  },
  {
    rule_id: 'IPM_BRINJAL_SFB_L4',
    category: 'ipm',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.shoot_fruit_damage_percent, 0);
      return input.crop_code === 'brinjal' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 20 && damage < 30;
    },
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIVR Organic',
    scientific_basis: 'Neem oil 5ml/L OR NSKE 5%. Spray at 10-day intervals. Target growing tips and developing fruits.',
    icar_package: 'IIVR Botanical Package'
  },
  {
    rule_id: 'IPM_BRINJAL_SFB_L5',
    category: 'ipm',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.shoot_fruit_damage_percent, 0);
      return input.crop_code === 'brinjal' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 30;
    },
    cause: Cause.IPM_BRINJAL_SHOOT_FRUIT_BORER_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IIVR',
    scientific_basis: 'ROTATE: Spinosad 0.3ml/L (IRAC 5) OR Emamectin benzoate 0.4g/L (IRAC 6) OR Chlorantraniliprole 0.3ml/L (IRAC 28). PHI: 3-5 days.',
    icar_package: 'IRAC Brinjal SFBM Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 7. CABBAGE DIAMONDBACK MOTH (Plutella xylostella) IPM LADDER
// ETL: 2-4 larvae/plant
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_CABBAGE_DIAMONDBACK_MOTH: CauseRule[] = [
  {
    rule_id: 'IPM_CABBAGE_DBM_L1',
    category: 'ipm',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_plant, 0);
      return input.crop_code === 'cabbage' && 
             input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
             larvae < 2;
    },
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIHR Bangalore',
    scientific_basis: 'Cultural: Use mustard as trap crop (2 rows around field). Sprinkler irrigation disrupts egg laying. Crop rotation.',
    icar_package: 'ICAR-IIHR Cabbage IPM Package'
  },
  {
    rule_id: 'IPM_CABBAGE_DBM_L2',
    category: 'ipm',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_plant, 0);
      return input.crop_code === 'cabbage' && 
             input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
             larvae >= 2 && larvae < 5;
    },
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR',
    scientific_basis: 'Pheromone traps @ 10/acre for monitoring. Hand-pick larvae in small areas. Light traps @ 1/acre.',
    icar_package: 'IIHR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_CABBAGE_DBM_L3',
    category: 'ipm',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_plant, 0);
      return input.crop_code === 'cabbage' && 
             input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
             larvae >= 5 && larvae < 10;
    },
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Spray Bt (Bacillus thuringiensis var. kurstaki) 1kg/ha. Release Diadegma semiclausum (parasitoid) where available.',
    icar_package: 'NBAII Cabbage Biocontrol'
  },
  {
    rule_id: 'IPM_CABBAGE_DBM_L4',
    category: 'ipm',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_plant, 0);
      return input.crop_code === 'cabbage' && 
             input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
             larvae >= 10 && larvae < 15;
    },
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR Organic',
    scientific_basis: 'Neem oil 5ml/L + garlic extract 2%. Spray at weekly intervals. Evening application preferred.',
    icar_package: 'IIHR Botanical Package'
  },
  {
    rule_id: 'IPM_CABBAGE_DBM_L5',
    category: 'ipm',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const larvae = num(input.metadata?.larvae_per_plant, 0);
      return input.crop_code === 'cabbage' && 
             input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
             larvae >= 15;
    },
    cause: Cause.IPM_CABBAGE_DIAMONDBACK_MOTH_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IIHR',
    scientific_basis: 'ROTATE: Spinosad 0.3ml/L (IRAC 5) OR Emamectin benzoate 0.4g/L (IRAC 6) OR Indoxacarb 0.5ml/L (IRAC 22). DBM has high resistance - rotation critical. PHI: 7 days.',
    icar_package: 'IRAC DBM Resistance Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 8. OKRA SHOOT & FRUIT BORER (Earias vittella/insulana) IPM LADDER
// ETL: 5% damaged fruits
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_OKRA_SHOOT_FRUIT_BORER: CauseRule[] = [
  {
    rule_id: 'IPM_OKRA_SFB_L1',
    category: 'ipm',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'okra' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage < 5;
    },
    cause: Cause.IPM_OKRA_SHOOT_FRUIT_BORER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Cultural: Remove and destroy infested shoots/fruits. Intercrop with maize. Proper spacing for ventilation.',
    icar_package: 'ICAR-IIVR Okra IPM Package'
  },
  {
    rule_id: 'IPM_OKRA_SFB_L2',
    category: 'ipm',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'okra' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 5 && damage < 10;
    },
    cause: Cause.IPM_OKRA_SHOOT_FRUIT_BORER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIVR',
    scientific_basis: 'Pheromone traps @ 10/acre. Light traps @ 1/acre. Collect and destroy infested fruits.',
    icar_package: 'IIVR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_OKRA_SFB_L3',
    category: 'ipm',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'okra' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 10 && damage < 20;
    },
    cause: Cause.IPM_OKRA_SHOOT_FRUIT_BORER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIVR Organic',
    scientific_basis: 'Neem oil 5ml/L OR NSKE 5%. Spray Bt 1kg/ha. Target growing tips and developing fruits.',
    icar_package: 'IIVR Botanical Package'
  },
  {
    rule_id: 'IPM_OKRA_SFB_L4',
    category: 'ipm',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const damage = num(input.metadata?.fruit_damage_percent, 0);
      return input.crop_code === 'okra' && 
             input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
             damage >= 20;
    },
    cause: Cause.IPM_OKRA_SHOOT_FRUIT_BORER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IIVR',
    scientific_basis: 'ROTATE: Spinosad 0.3ml/L (IRAC 5) OR Emamectin benzoate 0.4g/L (IRAC 6). PHI: 3 days for fresh market.',
    icar_package: 'IRAC Okra SFBM Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 9. CHILLI THRIPS (Scirtothrips dorsalis) IPM LADDER
// ETL: 5-10 thrips/leaf
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_CHILLI_THRIPS: CauseRule[] = [
  {
    rule_id: 'IPM_CHILLI_TH_L1',
    category: 'ipm',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_leaf, 0);
      return input.crop_code === 'chilli' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips < 5;
    },
    cause: Cause.IPM_CHILLI_THRIPS_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Cultural: Avoid water stress. Balanced nutrition. Intercrop with maize/sorghum as barrier. Reflective mulches.',
    icar_package: 'ICAR-IIHR Chilli IPM Package'
  },
  {
    rule_id: 'IPM_CHILLI_TH_L2',
    category: 'ipm',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_leaf, 0);
      return input.crop_code === 'chilli' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 5 && thrips < 10;
    },
    cause: Cause.IPM_CHILLI_THRIPS_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR',
    scientific_basis: 'Blue sticky traps @ 20/acre. Overhead irrigation to dislodge thrips. Monitor regularly.',
    icar_package: 'IIHR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_CHILLI_TH_L3',
    category: 'ipm',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_leaf, 0);
      return input.crop_code === 'chilli' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 10 && thrips < 20;
    },
    cause: Cause.IPM_CHILLI_THRIPS_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Conserve predatory thrips and minute pirate bugs. Spray Beauveria bassiana 2kg/ha.',
    icar_package: 'NBAII Chilli Biocontrol'
  },
  {
    rule_id: 'IPM_CHILLI_TH_L4',
    category: 'ipm',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_leaf, 0);
      return input.crop_code === 'chilli' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 20 && thrips < 30;
    },
    cause: Cause.IPM_CHILLI_THRIPS_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR Organic',
    scientific_basis: 'Neem oil 5ml/L + sticker. Spray covering leaf undersurface. Repeat at 7-day intervals.',
    icar_package: 'IIHR Botanical Package'
  },
  {
    rule_id: 'IPM_CHILLI_TH_L5',
    category: 'ipm',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_leaf, 0);
      return input.crop_code === 'chilli' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 30;
    },
    cause: Cause.IPM_CHILLI_THRIPS_L5,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IIHR',
    scientific_basis: 'ROTATE: Spinosad 0.3ml/L (IRAC 5) OR Fipronil 0.3ml/L (IRAC 2B) OR Acetamiprid 0.2g/L (IRAC 4A). Thrips resistance common - rotation critical. PHI: 7 days.',
    icar_package: 'IRAC Thrips Resistance Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 10. MANGO HOPPER (Idioscopus spp.) IPM LADDER
// ETL: 5-10 hoppers/panicle
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_MANGO_HOPPER: CauseRule[] = [
  {
    rule_id: 'IPM_MANGO_HOP_L1',
    category: 'ipm',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const hoppers = num(input.metadata?.hoppers_per_panicle, 0);
      return input.crop_code === 'mango' && 
             input.metadata?.pest_detected === 'HOPPER' &&
             hoppers < 5;
    },
    cause: Cause.IPM_MANGO_HOPPER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Cultural: Proper canopy management. Avoid overcrowding. Orchard sanitation. Plowing to expose pupae.',
    icar_package: 'ICAR-IIHR Mango IPM Package'
  },
  {
    rule_id: 'IPM_MANGO_HOP_L2',
    category: 'ipm',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const hoppers = num(input.metadata?.hoppers_per_panicle, 0);
      return input.crop_code === 'mango' && 
             input.metadata?.pest_detected === 'HOPPER' &&
             hoppers >= 5 && hoppers < 10;
    },
    cause: Cause.IPM_MANGO_HOPPER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR',
    scientific_basis: 'Smoke the orchard during evening. Light traps during active period. Monitor with sweep net.',
    icar_package: 'IIHR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_MANGO_HOP_L3',
    category: 'ipm',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const hoppers = num(input.metadata?.hoppers_per_panicle, 0);
      return input.crop_code === 'mango' && 
             input.metadata?.pest_detected === 'HOPPER' &&
             hoppers >= 10 && hoppers < 20;
    },
    cause: Cause.IPM_MANGO_HOPPER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IIHR Organic',
    scientific_basis: 'Neem oil 5ml/L at panicle emergence. Spray wettable sulphur 3g/L. Evening spray preferred.',
    icar_package: 'IIHR Botanical Package'
  },
  {
    rule_id: 'IPM_MANGO_HOP_L4',
    category: 'ipm',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const hoppers = num(input.metadata?.hoppers_per_panicle, 0);
      return input.crop_code === 'mango' && 
             input.metadata?.pest_detected === 'HOPPER' &&
             hoppers >= 20;
    },
    cause: Cause.IPM_MANGO_HOPPER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IIHR',
    scientific_basis: 'ROTATE: Imidacloprid 0.3ml/L (IRAC 4A) OR Thiamethoxam 0.2g/L (IRAC 4A) OR Lambda-cyhalothrin 0.5ml/L (IRAC 3A). Two sprays at flowering and fruit set. PHI: 15 days.',
    icar_package: 'IRAC Mango Hopper Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 11. SOYBEAN GIRDLE BEETLE (Obereopsis brevis) IPM LADDER
// ETL: 5-10% girdled plants
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_SOYBEAN_GIRDLE_BEETLE: CauseRule[] = [
  {
    rule_id: 'IPM_SOYBEAN_GB_L1',
    category: 'ipm',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const girdled = num(input.metadata?.girdled_plants_percent, 0);
      return input.crop_code === 'soybean' && 
             input.metadata?.pest_detected === 'GIRDLE_BEETLE' &&
             girdled < 5;
    },
    cause: Cause.IPM_SOYBEAN_GIRDLE_BEETLE_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IISR Indore',
    scientific_basis: 'Cultural: Early sowing (June). Timely harvesting. Deep plowing to destroy pupae. Collect and destroy girdled stems.',
    icar_package: 'ICAR-IISR Soybean IPM Package'
  },
  {
    rule_id: 'IPM_SOYBEAN_GB_L2',
    category: 'ipm',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const girdled = num(input.metadata?.girdled_plants_percent, 0);
      return input.crop_code === 'soybean' && 
             input.metadata?.pest_detected === 'GIRDLE_BEETLE' &&
             girdled >= 5 && girdled < 10;
    },
    cause: Cause.IPM_SOYBEAN_GIRDLE_BEETLE_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IISR',
    scientific_basis: 'Hand-pick beetles during morning hours. Destroy girdled portions with grubs inside. Light traps @ 1/acre.',
    icar_package: 'IISR Mechanical Control'
  },
  {
    rule_id: 'IPM_SOYBEAN_GB_L3',
    category: 'ipm',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const girdled = num(input.metadata?.girdled_plants_percent, 0);
      return input.crop_code === 'soybean' && 
             input.metadata?.pest_detected === 'GIRDLE_BEETLE' &&
             girdled >= 10 && girdled < 20;
    },
    cause: Cause.IPM_SOYBEAN_GIRDLE_BEETLE_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IISR Organic',
    scientific_basis: 'Neem oil 5ml/L spray targeting adults. Apply during adult emergence period (August-September).',
    icar_package: 'IISR Botanical Package'
  },
  {
    rule_id: 'IPM_SOYBEAN_GB_L4',
    category: 'ipm',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const girdled = num(input.metadata?.girdled_plants_percent, 0);
      return input.crop_code === 'soybean' && 
             input.metadata?.pest_detected === 'GIRDLE_BEETLE' &&
             girdled >= 20;
    },
    cause: Cause.IPM_SOYBEAN_GIRDLE_BEETLE_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + IISR',
    scientific_basis: 'Triazophos 40EC @ 1.5ml/L (IRAC 1B) OR Quinalphos 25EC @ 2ml/L (IRAC 1B). Target adults during oviposition. PHI: 21 days.',
    icar_package: 'IRAC Girdle Beetle Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 12. GROUNDNUT LEAF MINER (Aproaerema modicella) IPM LADDER
// ETL: 10-15% leaflets mined
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_GROUNDNUT_LEAF_MINER: CauseRule[] = [
  {
    rule_id: 'IPM_GROUNDNUT_LM_L1',
    category: 'ipm',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const mined = num(input.metadata?.leaflets_mined_percent, 0);
      return input.crop_code === 'groundnut' && 
             input.metadata?.pest_detected === 'LEAF_MINER' &&
             mined < 10;
    },
    cause: Cause.IPM_GROUNDNUT_LEAF_MINER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-DGR Junagadh',
    scientific_basis: 'Cultural: Timely sowing. Intercrop with pearl millet. Avoid late sowing. Deep summer plowing.',
    icar_package: 'ICAR-DGR Groundnut IPM Package'
  },
  {
    rule_id: 'IPM_GROUNDNUT_LM_L2',
    category: 'ipm',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const mined = num(input.metadata?.leaflets_mined_percent, 0);
      return input.crop_code === 'groundnut' && 
             input.metadata?.pest_detected === 'LEAF_MINER' &&
             mined >= 10 && mined < 25;
    },
    cause: Cause.IPM_GROUNDNUT_LEAF_MINER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'DGR Organic',
    scientific_basis: 'Neem oil 5ml/L OR NSKE 5%. Pheromone traps @ 5/acre for monitoring. Light traps @ 1/acre.',
    icar_package: 'DGR Botanical Package'
  },
  {
    rule_id: 'IPM_GROUNDNUT_LM_L3',
    category: 'ipm',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const mined = num(input.metadata?.leaflets_mined_percent, 0);
      return input.crop_code === 'groundnut' && 
             input.metadata?.pest_detected === 'LEAF_MINER' &&
             mined >= 25;
    },
    cause: Cause.IPM_GROUNDNUT_LEAF_MINER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + DGR',
    scientific_basis: 'Quinalphos 25EC @ 2ml/L (IRAC 1B) OR Chlorpyrifos 20EC @ 2.5ml/L (IRAC 1B). PHI: 15 days. Spray at 30 and 45 DAS.',
    icar_package: 'IRAC Leaf Miner Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 13. MUSTARD APHID (Lipaphis erysimi) IPM LADDER
// ETL: 25-30 aphids/10cm terminal shoot
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_MUSTARD_APHID: CauseRule[] = [
  {
    rule_id: 'IPM_MUSTARD_AP_L1',
    category: 'ipm',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const infested = num(input.metadata?.infested_plants_percent, 0);
      return input.crop_code === 'mustard' && 
             input.metadata?.pest_detected === 'APHID' &&
             infested < 10;
    },
    cause: Cause.IPM_MUSTARD_APHID_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-DRMR Bharatpur',
    scientific_basis: 'Cultural: Early sowing (October). Use resistant varieties. Conserve natural enemies like Coccinellids, Syrphids.',
    icar_package: 'ICAR-DRMR Mustard IPM Package'
  },
  {
    rule_id: 'IPM_MUSTARD_AP_L2',
    category: 'ipm',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const infested = num(input.metadata?.infested_plants_percent, 0);
      return input.crop_code === 'mustard' && 
             input.metadata?.pest_detected === 'APHID' &&
             infested >= 10 && infested < 25;
    },
    cause: Cause.IPM_MUSTARD_APHID_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'DRMR',
    scientific_basis: 'Yellow pan water traps for monitoring. Overhead irrigation to dislodge aphids. Spot treatment of colonies.',
    icar_package: 'DRMR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_MUSTARD_AP_L3',
    category: 'ipm',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const infested = num(input.metadata?.infested_plants_percent, 0);
      return input.crop_code === 'mustard' && 
             input.metadata?.pest_detected === 'APHID' &&
             infested >= 25 && infested < 50;
    },
    cause: Cause.IPM_MUSTARD_APHID_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'DRMR Organic',
    scientific_basis: 'Neem oil 5ml/L + detergent 1ml/L. Thorough coverage of infested terminals. Repeat after 10 days.',
    icar_package: 'DRMR Botanical Package'
  },
  {
    rule_id: 'IPM_MUSTARD_AP_L4',
    category: 'ipm',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const infested = num(input.metadata?.infested_plants_percent, 0);
      return input.crop_code === 'mustard' && 
             input.metadata?.pest_detected === 'APHID' &&
             infested >= 50;
    },
    cause: Cause.IPM_MUSTARD_APHID_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + DRMR',
    scientific_basis: 'Dimethoate 30EC @ 1ml/L (IRAC 1B) OR Thiamethoxam 25WG @ 0.2g/L (IRAC 4A). Single spray usually sufficient. PHI: 15 days.',
    icar_package: 'IRAC Mustard Aphid Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 14. ONION THRIPS (Thrips tabaci) IPM LADDER
// ETL: 25-30 thrips/plant
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_ONION_THRIPS: CauseRule[] = [
  {
    rule_id: 'IPM_ONION_TH_L1',
    category: 'ipm',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_plant, 0);
      return input.crop_code === 'onion' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips < 10;
    },
    cause: Cause.IPM_ONION_THRIPS_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-DOGR Rajgurunagar',
    scientific_basis: 'Cultural: Proper irrigation. Avoid water stress. Use straw mulch. Intercrop with coriander. Avoid excessive nitrogen.',
    icar_package: 'ICAR-DOGR Onion IPM Package'
  },
  {
    rule_id: 'IPM_ONION_TH_L2',
    category: 'ipm',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_plant, 0);
      return input.crop_code === 'onion' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 10 && thrips < 25;
    },
    cause: Cause.IPM_ONION_THRIPS_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'DOGR',
    scientific_basis: 'Blue sticky traps @ 20/acre. Overhead irrigation to dislodge thrips. Apply straw mulch.',
    icar_package: 'DOGR Monitoring Protocol'
  },
  {
    rule_id: 'IPM_ONION_TH_L3',
    category: 'ipm',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_plant, 0);
      return input.crop_code === 'onion' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 25 && thrips < 50;
    },
    cause: Cause.IPM_ONION_THRIPS_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'DOGR Organic',
    scientific_basis: 'Neem oil 5ml/L + sticker. Spray in leaf axils. Beauveria bassiana 2kg/ha. Repeat at 10-day intervals.',
    icar_package: 'DOGR Botanical Package'
  },
  {
    rule_id: 'IPM_ONION_TH_L4',
    category: 'ipm',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput) => {
      const thrips = num(input.metadata?.thrips_per_plant, 0);
      return input.crop_code === 'onion' && 
             input.metadata?.pest_detected === 'THRIPS' &&
             thrips >= 50;
    },
    cause: Cause.IPM_ONION_THRIPS_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + DOGR',
    scientific_basis: 'ROTATE: Fipronil 5SC @ 1ml/L (IRAC 2B) OR Spinosad 45SC @ 0.3ml/L (IRAC 5) OR Profenofos 50EC @ 2ml/L (IRAC 1B). PHI: 15 days.',
    icar_package: 'IRAC Onion Thrips Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 15. SUGARCANE SHOOT BORER (Chilo infuscatellus) IPM LADDER
// ETL: 10-15% dead hearts
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_SUGARCANE_SHOOT_BORER: CauseRule[] = [
  {
    rule_id: 'IPM_SUGARCANE_SB_L1',
    category: 'ipm',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'sugarcane' && 
             input.metadata?.pest_detected === 'SHOOT_BORER' &&
             deadHearts < 5;
    },
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L1,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-SBI Coimbatore',
    scientific_basis: 'Cultural: Healthy seed setts. Remove and destroy affected tillers. Avoid water stress. Light earthing up at 30-45 DAP.',
    icar_package: 'ICAR-SBI Sugarcane IPM Package'
  },
  {
    rule_id: 'IPM_SUGARCANE_SB_L2',
    category: 'ipm',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'sugarcane' && 
             input.metadata?.pest_detected === 'SHOOT_BORER' &&
             deadHearts >= 5 && deadHearts < 10;
    },
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L2,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'SBI',
    scientific_basis: 'Pheromone traps @ 10/acre. Light traps @ 1/acre. Hand-pick and destroy egg masses from leaves.',
    icar_package: 'SBI Monitoring Protocol'
  },
  {
    rule_id: 'IPM_SUGARCANE_SB_L3',
    category: 'ipm',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'sugarcane' && 
             input.metadata?.pest_detected === 'SHOOT_BORER' &&
             deadHearts >= 10 && deadHearts < 15;
    },
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L3,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-NBAII',
    scientific_basis: 'Release Trichogramma chilonis @ 50,000/acre at 30, 37, 44 DAP. Conserve natural enemies. Spray Bt 1kg/ha.',
    icar_package: 'NBAII Sugarcane Biocontrol'
  },
  {
    rule_id: 'IPM_SUGARCANE_SB_L4',
    category: 'ipm',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) => {
      const deadHearts = num(input.metadata?.dead_hearts_percent, 0);
      return input.crop_code === 'sugarcane' && 
             input.metadata?.pest_detected === 'SHOOT_BORER' &&
             deadHearts >= 15;
    },
    cause: Cause.IPM_SUGARCANE_SHOOT_BORER_L4,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'IRAC + SBI',
    scientific_basis: 'Carbofuran 3G @ 33kg/ha in root zone (IRAC 1A) OR Chlorantraniliprole 0.4G @ 15kg/ha (IRAC 28). Apply with irrigation. PHI: 60 days.',
    icar_package: 'IRAC Sugarcane Shoot Borer Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED EXPORT - ALL 15 CROP-SPECIFIC IPM LADDERS
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_SPECIFIC_IPM_RULES: CauseRule[] = [
  ...IPM_TOMATO_FRUIT_BORER,
  ...IPM_COTTON_BOLLWORM,
  ...IPM_COTTON_WHITEFLY,
  ...IPM_RICE_STEM_BORER,
  ...IPM_WHEAT_APHID,
  ...IPM_BRINJAL_SHOOT_FRUIT_BORER,
  ...IPM_CABBAGE_DIAMONDBACK_MOTH,
  ...IPM_OKRA_SHOOT_FRUIT_BORER,
  ...IPM_CHILLI_THRIPS,
  ...IPM_MANGO_HOPPER,
  ...IPM_SOYBEAN_GIRDLE_BEETLE,
  ...IPM_GROUNDNUT_LEAF_MINER,
  ...IPM_MUSTARD_APHID,
  ...IPM_ONION_THRIPS,
  ...IPM_SUGARCANE_SHOOT_BORER
];

export default CROP_SPECIFIC_IPM_RULES;
