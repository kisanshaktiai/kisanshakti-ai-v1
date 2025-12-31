/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VARIETY RECOMMENDATION RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3/P4 (Preventive/Economic)
 * 
 * These rules detect when a farmer's current variety is suboptimal
 * and recommend superior resistant/tolerant varieties
 */

import {
  CauseRule,
  Cause,
  CropStage,
  DecisionInput,
  PriorityLevel
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE-RESISTANT VARIETY RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_RESISTANT_VARIETY_RULES: CauseRule[] = [
  // WHEAT RUST - Recommend rust-resistant varieties
  {
    rule_id: 'VAR_WHEAT_RUST_001',
    category: 'variety',
    crop_code: 'wheat',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasRustHistory = (input.metadata?.field_history_diseases as string[] | undefined)?.includes('RUST');
      const highRustRisk = (input.metadata?.regional_disease_pressure as Record<string, string> | undefined)?.rust === 'HIGH';
      const currentVariety = input.metadata?.current_variety as string | undefined;
      
      // Check if current variety is not rust-resistant
      const isNonResistant = currentVariety && 
        !['HD3226', 'DBW187', 'HD3086', 'PBW725'].includes(currentVariety);
      
      return input.crop_code === 'wheat' && 
             (hasRustHistory || highRustRisk) &&
             isNonResistant === true;
    },
    cause: Cause.VARIETY_DISEASE_RESISTANT_AVAILABLE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IARI + AICW&BIP',
    scientific_basis: 'Rust-resistant varieties like HD 3226, DBW 187 provide genetic resistance, reducing fungicide dependency by 60-80%. Cost of resistant seed (₹35/kg) recovered in first spray saving (₹1500/ha).',
    icar_package: 'ICAR Wheat Variety Catalog 2024'
  },

  // RICE BLAST - Recommend blast-resistant varieties
  {
    rule_id: 'VAR_RICE_BLAST_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasBlastHistory = (input.metadata?.field_history_diseases as string[] | undefined)?.includes('BLAST');
      const highBlastRisk = input.weather_state === 'HIGH_HUMIDITY' &&
                           input.metadata?.blast_favorable_weather === true;
      
      return input.crop_code === 'rice' && 
             (hasBlastHistory || highBlastRisk);
    },
    cause: Cause.VARIETY_DISEASE_RESISTANT_AVAILABLE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CRRI + ICAR-IIRR',
    scientific_basis: 'Blast-resistant varieties (Improved Samba Mahsuri, MTU 1010, DRR Dhan 45) carry Pi genes providing durable resistance. Reduces blast incidence from 40-60% to <5%.',
    icar_package: 'ICAR Rice Variety Recommendations'
  },

  // COTTON WILT - Recommend wilt-resistant varieties
  {
    rule_id: 'VAR_COTTON_WILT_001',
    category: 'variety',
    crop_code: 'cotton',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasWiltHistory = (input.metadata?.field_history_diseases as string[] | undefined)?.includes('WILT');
      const wiltProneArea = input.metadata?.soil_type === 'black_cotton' &&
                           input.metadata?.wilt_endemic_area === true;
      
      return input.crop_code === 'cotton' && 
             (hasWiltHistory || wiltProneArea);
    },
    cause: Cause.VARIETY_DISEASE_RESISTANT_AVAILABLE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CICR Nagpur',
    scientific_basis: 'Wilt-resistant varieties (Suraj/HD-432, Phule Dhanwantary) provide field resistance to Fusarium oxysporum f.sp. vasinfectum. No chemical control available for wilt - variety is only solution.',
    icar_package: 'ICAR-CICR Cotton Varieties 2024'
  },

  // SOYBEAN YELLOW MOSAIC - Recommend resistant varieties
  {
    rule_id: 'VAR_SOYBEAN_YMV_001',
    category: 'variety',
    crop_code: 'soybean',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const hasYMVHistory = (input.metadata?.field_history_diseases as string[] | undefined)?.includes('YELLOW_MOSAIC');
      const whiteflyPressure = input.metadata?.whitefly_pressure === 'HIGH';
      
      return input.crop_code === 'soybean' && 
             (hasYMVHistory || whiteflyPressure);
    },
    cause: Cause.VARIETY_DISEASE_RESISTANT_AVAILABLE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IISR Indore',
    scientific_basis: 'Yellow Mosaic Virus (YMV) resistant varieties (JS 95-60, JS 20-34) provide genetic resistance. No chemical control for virus - resistant variety is only solution.',
    icar_package: 'ICAR Soybean Variety Catalog 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// ABIOTIC STRESS TOLERANT VARIETY RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const STRESS_TOLERANT_VARIETY_RULES: CauseRule[] = [
  // HEAT TOLERANCE - Terminal heat stress areas
  {
    rule_id: 'VAR_WHEAT_HEAT_001',
    category: 'variety',
    crop_code: 'wheat',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const terminalHeatRisk = input.metadata?.terminal_heat_risk === 'HIGH';
      const lateSowingArea = typeof input.metadata?.typical_sowing_date === 'string' && 
                            input.metadata.typical_sowing_date > '2024-11-30';
      
      return input.crop_code === 'wheat' && 
             (terminalHeatRisk || lateSowingArea);
    },
    cause: Cause.VARIETY_HEAT_TOLERANT_AVAILABLE,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IARI Karnal',
    scientific_basis: 'Heat-tolerant varieties (DBW 187, HD 3059) maintain grain filling under terminal heat stress (>35°C at grain filling). Yield advantage: 15-25% in late-sown conditions.',
    icar_package: 'ICAR Heat-Tolerant Wheat Package'
  },

  // SUBMERGENCE TOLERANCE - Flood-prone areas
  {
    rule_id: 'VAR_RICE_SUBMERGENCE_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const floodProneArea = input.metadata?.flood_prone_area === true;
      const hasFloodHistory = input.metadata?.field_history_floods === true;
      
      return input.crop_code === 'rice' && 
             (floodProneArea || hasFloodHistory);
    },
    cause: Cause.VARIETY_DROUGHT_TOLERANT_AVAILABLE, // Using drought for submergence
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CRRI + IRRI',
    scientific_basis: 'Sub1 varieties (Swarna Sub-1, Samba Mahsuri Sub-1, IR64 Sub-1) carry SUB1A gene allowing 14-18 day submergence tolerance. Prevents total crop loss in flood-prone areas.',
    icar_package: 'ICAR Climate-Resilient Rice Varieties'
  },

  // SALINITY TOLERANCE
  {
    rule_id: 'VAR_RICE_SALINITY_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const soilEC = input.metadata?.soil_ec_ds_m;
      const salineArea = typeof soilEC === 'number' && soilEC > 4.0;
      const coastalArea = input.metadata?.coastal_saline_area === true;
      
      return input.crop_code === 'rice' && 
             (salineArea || coastalArea);
    },
    cause: Cause.VARIETY_SALINITY_TOLERANT_AVAILABLE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CRRI + CSSRI',
    scientific_basis: 'Salt-tolerant varieties (CSR 36, Lunishree, Bhura rata 3-20) tolerate EC 6-8 dS/m. Only viable option for coastal saline areas.',
    icar_package: 'ICAR Saline Agriculture Package'
  },

  // DROUGHT TOLERANCE - Rainfed areas
  {
    rule_id: 'VAR_GROUNDNUT_DROUGHT_001',
    category: 'variety',
    crop_code: 'groundnut',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const rainfedArea = input.metadata?.irrigation_source === 'RAINFED';
      const droughtProneArea = input.metadata?.drought_prone_area === true;
      
      return input.crop_code === 'groundnut' && 
             (rainfedArea || droughtProneArea);
    },
    cause: Cause.VARIETY_DROUGHT_TOLERANT_AVAILABLE,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-DGR Junagadh',
    scientific_basis: 'Drought-tolerant groundnut varieties (GG 20, ICGV 91114) maintain pod yield under moisture stress. 15-25% yield advantage in drought years.',
    icar_package: 'ICAR Groundnut Drought Management'
  },

  // LODGING RESISTANCE - High input areas
  {
    rule_id: 'VAR_WHEAT_LODGING_001',
    category: 'variety',
    crop_code: 'wheat',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const highNitrogenUse = input.metadata?.nitrogen_applied_kg_ha;
      const lodgingRisk = typeof highNitrogenUse === 'number' && highNitrogenUse > 150;
      const windProneArea = input.metadata?.wind_prone_area === true;
      
      return input.crop_code === 'wheat' && 
             (lodgingRisk || windProneArea);
    },
    cause: Cause.VARIETY_LODGING_RESISTANT_AVAILABLE,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Semi-dwarf lodging-resistant varieties (HD 3226, DBW 187) with shorter stature resist lodging under high fertility and storm conditions. Prevents 20-40% harvest losses.',
    icar_package: 'ICAR Wheat Variety Selection Guide'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// BIOFORTIFIED VARIETY RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const BIOFORTIFIED_VARIETY_RULES: CauseRule[] = [
  // ZINC-BIOFORTIFIED WHEAT
  {
    rule_id: 'VAR_WHEAT_ZINC_001',
    category: 'variety',
    crop_code: 'wheat',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const nutritionFocusArea = input.metadata?.nutrition_program_area === true;
      const lowZincRegion = input.metadata?.population_zinc_deficiency === 'HIGH';
      
      return input.crop_code === 'wheat' && 
             (nutritionFocusArea || lowZincRegion);
    },
    cause: Cause.VARIETY_BIOFORTIFIED_AVAILABLE,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IARI + HarvestPlus',
    scientific_basis: 'Zinc-biofortified wheat (HI 8777/WB 02) contains 40 ppm Zn vs 25 ppm in regular wheat. Addresses hidden hunger while maintaining yield.',
    icar_package: 'ICAR Biofortification Program'
  },

  // ZINC-BIOFORTIFIED RICE
  {
    rule_id: 'VAR_RICE_ZINC_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const nutritionFocusArea = input.metadata?.nutrition_program_area === true;
      const lowZincRegion = input.metadata?.population_zinc_deficiency === 'HIGH';
      
      return input.crop_code === 'rice' && 
             (nutritionFocusArea || lowZincRegion);
    },
    cause: Cause.VARIETY_BIOFORTIFIED_AVAILABLE,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-IIRR + HarvestPlus',
    scientific_basis: 'Zinc-biofortified rice (DRR Dhan 45) contains 22.6 ppm Zn vs 15 ppm in regular rice. Addresses micronutrient malnutrition in rice-consuming populations.',
    icar_package: 'ICAR Biofortification Program'
  },

  // IRON-BIOFORTIFIED PEARL MILLET
  {
    rule_id: 'VAR_BAJRA_IRON_001',
    category: 'variety',
    crop_code: 'bajra',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const nutritionFocusArea = input.metadata?.nutrition_program_area === true;
      const anemiaPrevalence = input.metadata?.population_anemia === 'HIGH';
      
      return input.crop_code === 'bajra' && 
             (nutritionFocusArea || anemiaPrevalence);
    },
    cause: Cause.VARIETY_BIOFORTIFIED_AVAILABLE,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'ICAR-ICRISAT + HarvestPlus',
    scientific_basis: 'Iron-biofortified pearl millet (Dhanashakti) contains 70+ ppm Fe. Addresses anemia in tribal and rural populations where bajra is staple.',
    icar_package: 'ICAR-ICRISAT Biofortified Millets'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// REGIONAL VARIETY RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const REGIONAL_VARIETY_RULES: CauseRule[] = [
  // BASMATI QUALITY VARIETIES - Export zones
  {
    rule_id: 'VAR_RICE_BASMATI_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const basmatiZone = input.metadata?.agro_climatic_zone === 'ZONE_6_TRANS_GANGETIC';
      const exportMarket = input.metadata?.target_market === 'EXPORT';
      
      return input.crop_code === 'rice' && 
             (basmatiZone && exportMarket);
    },
    cause: Cause.VARIETY_QUALITY_SUPERIOR_AVAILABLE,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IARI + APEDA',
    scientific_basis: 'Premium basmati varieties (Pusa Basmati 1718, Pusa Basmati 1121) fetch 40-60% higher prices in export market. Grain length >8mm, excellent aroma required.',
    icar_package: 'ICAR Basmati Rice Export Package'
  },

  // EARLY MATURITY - Monsoon uncertainty areas
  {
    rule_id: 'VAR_RICE_EARLY_001',
    category: 'variety',
    crop_code: 'rice',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const shortSeasonArea = input.metadata?.growing_season_days;
      const limitedSeason = typeof shortSeasonArea === 'number' && shortSeasonArea < 120;
      const doublecroppingSystem = input.metadata?.cropping_system === 'DOUBLE_CROPPING';
      
      return input.crop_code === 'rice' && 
             (limitedSeason || doublecroppingSystem);
    },
    cause: Cause.VARIETY_EARLY_MATURITY_AVAILABLE,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Early maturing rice varieties (Sahbhagi Dhan, Pusa 44) mature in 90-100 days, allowing timely wheat sowing and avoiding terminal drought.',
    icar_package: 'ICAR Rice-Wheat Cropping System'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const VARIETY_RECOMMENDATION_RULES: CauseRule[] = [
  ...DISEASE_RESISTANT_VARIETY_RULES,
  ...STRESS_TOLERANT_VARIETY_RULES,
  ...BIOFORTIFIED_VARIETY_RULES,
  ...REGIONAL_VARIETY_RULES
];

export default VARIETY_RECOMMENDATION_RULES;
