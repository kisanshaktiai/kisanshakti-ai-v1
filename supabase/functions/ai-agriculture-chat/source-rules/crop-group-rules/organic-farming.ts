/**
 * Organic Farming Rules
 * Comprehensive rules for organic/sustainable agriculture practices
 * Covers: biological pest control, organic nutrient management, composting
 * Total: 60 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  CropGroup,
  SoilNState,
  SoilPState,
  SoilKState,
  SoilOCState,
  SoilMoistureState,
  WeatherState,
  FarmingMode
} from '../types';

// ============================================================================
// ORGANIC PEST MANAGEMENT RULES (15 rules)
// ============================================================================

const ORGANIC_PEST_MANAGEMENT_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_PEST_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.ndvi_state !== undefined,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'NPOP/IFOAM organic pest management protocols',
    scientific_basis: 'Deploy Trichogramma egg parasitoids at 50,000/ha for lepidopteran pest control. Repeat every 7-10 days.',
  },
  {
    rule_id: 'ORG_PEST_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.ndvi_trend !== undefined,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Neem-based IPM for organic systems',
    scientific_basis: 'Apply neem oil 3% or neem seed kernel extract (NSKE) 5% for sucking pest control. Early morning or evening application.',
  },
  {
    rule_id: 'ORG_PEST_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.moisture === SoilMoistureState.OPTIMAL,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Entomopathogenic fungi for soil pest management',
    scientific_basis: 'Apply Metarhizium anisopliae or Beauveria bassiana at 5 kg/ha for soil pest control before sowing.',
  },
  {
    rule_id: 'ORG_PEST_004',
    category: 'biological',
    crop_code: 'vegetables',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      (input.crop_group === CropGroup.VEGETABLES || input.crop_code?.includes('vegetable')),
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Botanical pesticides for vegetable crops',
    scientific_basis: 'Prepare and spray Dashparni Ark (10-leaf extract) at 3% concentration weekly during pest-prone periods.',
  },
  {
    rule_id: 'ORG_PEST_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Bacillus thuringiensis for lepidopteran borers',
    scientific_basis: 'Apply Bt (Bacillus thuringiensis) formulation at 1-2 kg/ha during early larval stages. Evening application preferred.',
  },
  {
    rule_id: 'ORG_PEST_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 6,
    scientific_source: 'Predator-based aphid management',
    scientific_basis: 'Release Chrysoperla carnea (green lacewing) at 10,000 eggs/ha for aphid control at first appearance.',
  },
  {
    rule_id: 'ORG_PEST_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 6,
    scientific_source: 'Predatory mite release for spider mite control',
    scientific_basis: 'Release predatory mites (Phytoseiulus persimilis) at 20,000/ha when first mite colonies appear. Maintain humidity.',
  },
  {
    rule_id: 'ORG_PEST_008',
    category: 'biological',
    crop_code: 'fruits',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === CropGroup.FRUITS,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Pheromone-based pest monitoring and mass trapping',
    scientific_basis: 'Install pheromone traps at 5/ha for monitoring and mass trapping of fruit flies from flowering to harvest.',
  },
  {
    rule_id: 'ORG_PEST_009',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 7,
    scientific_source: 'Conservation biological control through habitat management',
    scientific_basis: 'Establish beetle banks and flower strips to harbor beneficial insects at season start.',
  },
  {
    rule_id: 'ORG_PEST_010',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 6,
    scientific_source: 'Trap cropping for pest diversion',
    scientific_basis: 'Plant trap crops (mustard for aphids, castor for tobacco caterpillar) on field borders 15-20 days before main crop.',
  },
  {
    rule_id: 'ORG_PEST_011',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: 5,
    scientific_source: 'Organic grain storage pest management',
    scientific_basis: 'Use neem leaves, turmeric powder or sweet flag (Acorus calamus) for stored grain protection.',
  },
  {
    rule_id: 'ORG_PEST_012',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 6,
    scientific_source: 'Ecological rodent management',
    scientific_basis: 'Install owl perches at 10/ha and maintain clean field bunds to reduce rodent habitat.',
  },
  {
    rule_id: 'ORG_PEST_013',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Paecilomyces lilacinus for nematode management',
    scientific_basis: 'Apply Paecilomyces lilacinus at 5 kg/ha mixed with FYM in root zone for root-knot nematode control.',
  },
  {
    rule_id: 'ORG_PEST_014',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 6,
    scientific_source: 'Physical and biological slug/snail management',
    scientific_basis: 'Use ash barriers, beer traps during wet periods. Evening placement recommended.',
  },
  {
    rule_id: 'ORG_PEST_015',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.POLLINATOR_PROTECTION_NEEDED,
    priority: 4,
    scientific_source: 'Pollinator protection in organic systems',
    scientific_basis: 'Schedule any approved spray applications for evening hours to protect pollinators.',
  },
];

// ============================================================================
// ORGANIC DISEASE MANAGEMENT RULES (12 rules)
// ============================================================================

const ORGANIC_DISEASE_MANAGEMENT_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_DIS_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Trichoderma-based biocontrol for fungal diseases',
    scientific_basis: 'Apply Trichoderma viride or T. harzianum at 5 kg/ha for soil-borne fungal disease control at sowing.',
  },
  {
    rule_id: 'ORG_DIS_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Pseudomonas fluorescens for bacterial disease suppression',
    scientific_basis: 'Apply Pseudomonas fluorescens at 5 kg/ha as seed treatment and foliar spray at 30, 45, 60 DAS.',
  },
  {
    rule_id: 'ORG_DIS_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 5,
    scientific_source: 'Milk spray and sulfur for powdery mildew',
    scientific_basis: 'Spray diluted milk (1:9) or wettable sulfur 80WP at 2g/L at first symptoms. Repeat every 7-10 days.',
  },
  {
    rule_id: 'ORG_DIS_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 5,
    scientific_source: 'Copper-based organic fungicides for downy mildew',
    scientific_basis: 'Apply Bordeaux mixture 1% or copper hydroxide (OMRI-listed) preventively before humid periods.',
  },
  {
    rule_id: 'ORG_DIS_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_stage === CropStage.GERMINATION,
    cause: Cause.DAMPING_OFF_RISK,
    priority: 4,
    scientific_source: 'Trichoderma seed treatment for damping-off prevention',
    scientific_basis: 'Treat seeds with Trichoderma at 4g/kg seed and drench nursery beds. Maintain proper drainage.',
  },
  {
    rule_id: 'ORG_DIS_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 5,
    scientific_source: 'Vector control and resistance for viral diseases',
    scientific_basis: 'Control vectors with neem oil, use reflective mulches, rogue infected plants from seedling stage.',
  },
  {
    rule_id: 'ORG_DIS_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 5,
    scientific_source: 'Combined biocontrol for root rots',
    scientific_basis: 'Apply Trichoderma + Pseudomonas consortium at 5 kg each/ha in root zone at sowing and 30 DAS.',
  },
  {
    rule_id: 'ORG_DIS_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 6,
    scientific_source: 'Bioagent foliar sprays for leaf diseases',
    scientific_basis: 'Spray Pseudomonas fluorescens at 5g/L or neem oil 2% at symptom appearance. Repeat every 10 days.',
  },
  {
    rule_id: 'ORG_DIS_009',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 4,
    scientific_source: 'Soil solarization and biocontrol for wilt diseases',
    scientific_basis: 'Perform soil solarization for 6 weeks + apply Trichoderma at 10 kg/ha during summer fallow.',
  },
  {
    rule_id: 'ORG_DIS_010',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.RUST_RISK,
    priority: 5,
    scientific_source: 'Sulfur and bioagents for rust management',
    scientific_basis: 'Apply wettable sulfur 3g/L alternated with Pseudomonas fluorescens 5g/L at first pustule. Weekly intervals.',
  },
  {
    rule_id: 'ORG_DIS_011',
    category: 'biological',
    crop_code: 'fruits',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 5,
    scientific_source: 'Copper and biocontrol for anthracnose',
    scientific_basis: 'Apply Bordeaux mixture 0.5% or Bacillus subtilis preventively before and during flowering. Repeat post-rain.',
  },
  {
    rule_id: 'ORG_DIS_012',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 7,
    scientific_source: 'Compost tea as disease suppressant',
    scientific_basis: 'Spray aerated compost tea at 10% concentration weekly during vegetative growth for general disease suppression.',
  },
];

// ============================================================================
// ORGANIC NUTRIENT MANAGEMENT RULES (18 rules)
// ============================================================================

const ORGANIC_NUTRIENT_MANAGEMENT_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_NUT_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Organic nitrogen sources for crop nutrition',
    scientific_basis: 'Apply vermicompost at 5 t/ha + neem cake at 250 kg/ha for nitrogen supply. Basal application.',
  },
  {
    rule_id: 'ORG_NUT_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Legume residue nitrogen contribution',
    scientific_basis: 'Incorporate legume residue + apply Azotobacter at 5 kg/ha 2-3 weeks before sowing for nitrogen fixation.',
  },
  {
    rule_id: 'ORG_NUT_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Rock phosphate and PSB for organic P nutrition',
    scientific_basis: 'Apply rock phosphate 200 kg/ha + PSB (Bacillus megaterium) 5 kg/ha. Basal application, incorporate well.',
  },
  {
    rule_id: 'ORG_NUT_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.k === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'Organic potassium sources',
    scientific_basis: 'Apply wood ash at 500 kg/ha or banana pseudo-stem compost. Split at sowing and flowering.',
  },
  {
    rule_id: 'ORG_NUT_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 6,
    scientific_source: 'Zinc-enriched organic sources',
    scientific_basis: 'Apply zinc-enriched vermicompost at deficiency symptoms.',
  },
  {
    rule_id: 'ORG_NUT_006',
    category: 'biological',
    crop_code: 'cereals',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === CropGroup.CEREALS,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Azotobacter for cereal nitrogen nutrition',
    scientific_basis: 'Apply Azotobacter chroococcum at 5 kg/ha as seed treatment + soil application for non-symbiotic N fixation.',
  },
  {
    rule_id: 'ORG_NUT_007',
    category: 'biological',
    crop_code: 'pulses',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === CropGroup.PULSES,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 4,
    scientific_source: 'Rhizobium inoculation for legume N fixation',
    scientific_basis: 'Apply crop-specific Rhizobium at 200g/10kg seed as seed treatment. Can fix 50-100 kg N/ha.',
  },
  {
    rule_id: 'ORG_NUT_008',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Bone meal for organic phosphorus',
    scientific_basis: 'Apply steamed bone meal at 500 kg/ha for slow-release organic P. Basal application preferred.',
  },
  {
    rule_id: 'ORG_NUT_009',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.k === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'Seaweed extract for organic potassium',
    scientific_basis: 'Apply seaweed extract foliar spray at 2-3% concentration for K and micronutrient supply. Repeat fortnightly.',
  },
  {
    rule_id: 'ORG_NUT_010',
    category: 'nutrient',
    crop_code: 'oilseeds',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === CropGroup.OILSEEDS,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Sulfur nutrition for oilseeds',
    scientific_basis: 'Apply gypsum at 200-400 kg/ha for organic sulfur supply critical for oil synthesis.',
  },
  {
    rule_id: 'ORG_NUT_011',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 6,
    scientific_source: 'Panchagavya for organic micronutrient supply',
    scientific_basis: 'Apply Panchagavya (5-cow preparation) at 3% foliar spray for micronutrients and growth promotion.',
  },
  {
    rule_id: 'ORG_NUT_012',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 6,
    scientific_source: 'Jeevamrutha for soil biological activation',
    scientific_basis: 'Apply Jeevamrutha at 500 L/ha through irrigation for microbial activation and nutrient availability.',
  },
  {
    rule_id: 'ORG_NUT_013',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 4,
    scientific_source: 'FYM for organic soil health',
    scientific_basis: 'Apply well-decomposed FYM at 10-15 t/ha as basal for soil organic matter and slow nutrient release.',
  },
  {
    rule_id: 'ORG_NUT_014',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Green manuring for nitrogen and organic matter',
    scientific_basis: 'Grow and incorporate Sesbania/Dhaincha at 45-60 DAS before main crop for 60-80 kg N/ha equivalent.',
  },
  {
    rule_id: 'ORG_NUT_015',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'VAM for enhanced P uptake',
    scientific_basis: 'Apply VAM (Glomus species) at 5 kg/ha for enhanced phosphorus uptake especially in P-fixing soils.',
  },
  {
    rule_id: 'ORG_NUT_016',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Biochar for long-term soil carbon',
    scientific_basis: 'Apply biochar at 2-5 t/ha for long-term carbon sequestration and improved nutrient retention.',
  },
  {
    rule_id: 'ORG_NUT_017',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'KMB for potassium mobilization',
    scientific_basis: 'Apply Frateuria aurantia (KMB) at 5 kg/ha for potassium mobilization from soil minerals.',
  },
  {
    rule_id: 'ORG_NUT_018',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 6,
    scientific_source: 'Humic acid for nutrient availability',
    scientific_basis: 'Apply humic acid at 2-3 kg/ha through fertigation for enhanced nutrient availability and root growth.',
  },
];

// ============================================================================
// COMPOSTING AND SOIL HEALTH RULES (8 rules)
// ============================================================================

const COMPOSTING_SOIL_HEALTH_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_COMP_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.POST_HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_stage === CropStage.POST_HARVEST,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Crop residue composting protocols',
    scientific_basis: 'Compost crop residues with Trichoderma/PUSA decomposer. 25:1 C:N ratio, maintain 60% moisture.',
  },
  {
    rule_id: 'ORG_COMP_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 4,
    scientific_source: 'Vermicomposting for quality organic manure',
    scientific_basis: 'Establish vermicompost unit with Eisenia fetida. Apply 5 t/ha of mature vermicompost.',
  },
  {
    rule_id: 'ORG_COMP_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'NADEP composting method',
    scientific_basis: 'Use NADEP method for aerobic composting of farm waste. 90-120 days for mature compost.',
  },
  {
    rule_id: 'ORG_COMP_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.POST_HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Bokashi fermentation for rapid composting',
    scientific_basis: 'Use Bokashi (EM-based fermentation) for kitchen/farm waste. 2-week fermentation + 2-week curing.',
  },
  {
    rule_id: 'ORG_COMP_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Cover cropping for soil protection',
    scientific_basis: 'Grow cover crops during fallow. Sun hemp, cowpea or mixed cover for erosion control and soil biology.',
  },
  {
    rule_id: 'ORG_COMP_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 6,
    scientific_source: 'Living mulch for continuous soil cover',
    scientific_basis: 'Establish living mulch (clovers, grasses) in orchards/plantations for continuous organic matter input.',
  },
  {
    rule_id: 'ORG_COMP_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Crop rotation for organic systems',
    scientific_basis: 'Follow legume-cereal-vegetable rotation. Include deep-rooted crops for subsoil nutrient cycling.',
  },
  {
    rule_id: 'ORG_COMP_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Reduced tillage for organic systems',
    scientific_basis: 'Minimize tillage to protect soil biology. Use surface mulching and biological soil loosening.',
  },
];

// ============================================================================
// ORGANIC CERTIFICATION COMPLIANCE RULES (7 rules)
// ============================================================================

const ORGANIC_CERTIFICATION_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_CERT_001',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NPOP organic certification standards',
    scientific_basis: 'Maintain 3-year conversion period records. Document all inputs used with receipts and invoices.',
  },
  {
    rule_id: 'ORG_CERT_002',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'Buffer zone requirements',
    scientific_basis: 'Maintain 7.5m buffer zone from conventional fields. Plant hedgerow barrier if adjacent to non-organic.',
  },
  {
    rule_id: 'ORG_CERT_003',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 4,
    scientific_source: 'Organic seed requirements',
    scientific_basis: 'Use certified organic or untreated seeds. Document source. Non-GMO declaration required.',
  },
  {
    rule_id: 'ORG_CERT_004',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'Input documentation requirements',
    scientific_basis: 'Record all organic inputs with date, quantity, source. Use only NPOP-approved inputs.',
  },
  {
    rule_id: 'ORG_CERT_005',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 4,
    scientific_source: 'Organic harvest and storage protocols',
    scientific_basis: 'Use clean, dedicated equipment for harvest. Separate storage from conventional produce.',
  },
  {
    rule_id: 'ORG_CERT_006',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 5,
    scientific_source: 'Internal control system requirements',
    scientific_basis: 'Maintain farm diary with all activities. Map organic fields. Keep records for 5 years.',
  },
  {
    rule_id: 'ORG_CERT_007',
    category: 'regulatory',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 5,
    scientific_source: 'Traceability requirements',
    scientific_basis: 'Implement lot/batch tracking from field to sale. Maintain chain of custody documentation.',
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const ORGANIC_FARMING_RULES: CauseRule[] = [
  ...ORGANIC_PEST_MANAGEMENT_RULES,
  ...ORGANIC_DISEASE_MANAGEMENT_RULES,
  ...ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  ...COMPOSTING_SOIL_HEALTH_RULES,
  ...ORGANIC_CERTIFICATION_RULES,
];

export {
  ORGANIC_PEST_MANAGEMENT_RULES,
  ORGANIC_DISEASE_MANAGEMENT_RULES,
  ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  COMPOSTING_SOIL_HEALTH_RULES,
  ORGANIC_CERTIFICATION_RULES,
};

export default ORGANIC_FARMING_RULES;
