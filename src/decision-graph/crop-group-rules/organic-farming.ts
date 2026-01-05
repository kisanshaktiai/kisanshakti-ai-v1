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
      (input.crop_group === 'VEGETABLES' || input.crop_code?.includes('vegetable')),
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
      input.crop_group === 'FRUITS',
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
      input.soil_states?.nitrogen === SoilNState.LOW_N,
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
      input.soil_states?.nitrogen === SoilNState.LOW_N,
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
      input.soil_states?.phosphorus === SoilPState.LOW_P,
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
      input.soil_states?.potassium === SoilKState.LOW_K,
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
      input.crop_group === 'CEREALS',
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Azospirillum for cereal nitrogen',
    scientific_basis: 'Apply Azospirillum brasilense at 5 kg/ha as seed treatment and soil application at sowing + 30 DAS.',
  },
  {
    rule_id: 'ORG_NUT_007',
    category: 'biological',
    crop_code: 'legumes',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === 'PULSES',
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 4,
    scientific_source: 'Rhizobium for legume nitrogen fixation',
    scientific_basis: 'Inoculate seeds with crop-specific Rhizobium at 200g/10kg seed just before sowing. Shade-dry after treatment.',
  },
  {
    rule_id: 'ORG_NUT_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.phosphorus === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'VAM fungi for phosphorus mobilization',
    scientific_basis: 'Apply VAM (Glomus sp.) at 5 kg/ha in planting hole or root zone at transplanting or sowing.',
  },
  {
    rule_id: 'ORG_NUT_009',
    category: 'biological',
    crop_code: 'fruits',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.potassium === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'KMB for potassium mobilization',
    scientific_basis: 'Apply Frateuria aurantia (KMB) at 5 kg/ha + wood ash 300 kg/ha at flowering and fruit development.',
  },
  {
    rule_id: 'ORG_NUT_010',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 4,
    scientific_source: 'Building soil organic matter',
    scientific_basis: 'Apply FYM 10-15 t/ha or compost 5 t/ha + green manure incorporation 3-4 weeks before sowing.',
  },
  {
    rule_id: 'ORG_NUT_011',
    category: 'nutrient',
    crop_code: 'oilseeds',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_group === 'OILSEEDS',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Organic sulfur sources',
    scientific_basis: 'Apply gypsum 400 kg/ha for oilseeds. Full basal, essential for oil quality.',
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
    scientific_source: 'Seaweed extract for micronutrient supply',
    scientific_basis: 'Apply seaweed extract (Kappaphycus/Ascophyllum) at 2-3 ml/L as foliar spray at vegetative growth and pre-flowering.',
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
    scientific_source: 'Vermicompost production and application',
    scientific_basis: 'Prepare and apply vermicompost at 5 t/ha using Eisenia fetida 2-3 weeks before sowing.',
  },
  {
    rule_id: 'ORG_NUT_014',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Jeevamrut and other liquid organic fertilizers',
    scientific_basis: 'Prepare and apply Jeevamrut (200L/acre) or Panchagavya (3%) as soil drench every 15 days.',
  },
  {
    rule_id: 'ORG_NUT_015',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 4,
    scientific_source: 'Green manuring for soil organic matter',
    scientific_basis: 'Grow and incorporate Dhaincha/Sunhemp at flowering (45 DAS) during summer fallow, 3 weeks before main crop.',
  },
  {
    rule_id: 'ORG_NUT_016',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 6,
    scientific_source: 'Organic mulching for soil health',
    scientific_basis: 'Apply organic mulch (straw, leaves) at 5 t/ha after crop establishment to conserve moisture and add OM.',
  },
  {
    rule_id: 'ORG_NUT_017',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Biochar for long-term carbon sequestration',
    scientific_basis: 'Apply biochar at 2-5 t/ha to improve soil carbon and water retention. One-time basal application.',
  },
  {
    rule_id: 'ORG_NUT_018',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_stage === CropStage.HARVEST,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 6,
    scientific_source: 'Crop residue recycling',
    scientific_basis: 'Shred and incorporate crop residue instead of burning. Add decomposer culture for faster decomposition.',
  },
];

// ============================================================================
// CROP ROTATION AND CERTIFICATION RULES (15 rules)
// ============================================================================

const CROP_ROTATION_CERTIFICATION_RULES: CauseRule[] = [
  {
    rule_id: 'ORG_ROT_001',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 5,
    scientific_source: 'Crop rotation for pest and disease break',
    scientific_basis: 'Follow 3-4 year rotation: Cereal → Legume → Oilseed → Vegetable to break pest cycles. Maintain rotation records.',
  },
  {
    rule_id: 'ORG_ROT_002',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.nitrogen === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Legume inclusion in rotation for N building',
    scientific_basis: 'Include legume crop in rotation to fix 50-100 kg N/ha for subsequent crop. Plan legume every 2-3 seasons.',
  },
  {
    rule_id: 'ORG_ROT_003',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 5,
    scientific_source: 'Avoid same family crops in succession',
    scientific_basis: 'Avoid planting same family crops (e.g., Solanaceae) for 3+ years in same field. Maintain field history records.',
  },
  {
    rule_id: 'ORG_CERT_001',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    priority: 4,
    scientific_source: 'NPOP organic certification compliance',
    scientific_basis: 'Maintain complete input records, field history, and avoid prohibited substances for NPOP compliance. 36-month conversion period.',
  },
  {
    rule_id: 'ORG_CERT_002',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    priority: 5,
    scientific_source: 'PGS-India organic certification',
    scientific_basis: 'Join local organic cluster, participate in peer inspections, maintain farm diary for ongoing PGS participation.',
  },
  {
    rule_id: 'ORG_CERT_003',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_CERTIFICATION_BLOCK,
    priority: 4,
    scientific_source: 'Buffer zone management for organic certification',
    scientific_basis: 'Maintain 7.5m buffer zone from conventional fields. Plant hedgerow as barrier at conversion start.',
  },
  {
    rule_id: 'ORG_CERT_004',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST, CropStage.POST_HARVEST],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_CERTIFICATION_VIOLATION,
    priority: 3,
    scientific_source: 'Contamination prevention in organic systems',
    scientific_basis: 'Use dedicated organic equipment, clean storage, separate processing to prevent contamination. Maintain traceability.',
  },
  {
    rule_id: 'ORG_CERT_005',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_CERTIFICATION_BLOCK,
    priority: 5,
    scientific_source: 'Organic seed sourcing requirements',
    scientific_basis: 'Use organic/untreated seeds. Maintain seed production plot if organic seeds unavailable. Pre-season procurement planning.',
  },
  {
    rule_id: 'ORG_CERT_006',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 5,
    scientific_source: 'Cover cropping for soil health',
    scientific_basis: 'Grow cover crops (legume-grass mix) during fallow to prevent erosion and add OM. Terminate before main crop planting.',
  },
  {
    rule_id: 'ORG_CERT_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Biodynamic preparations',
    scientific_basis: 'Apply BD 500 (cow horn manure) in evening and BD 501 (horn silica) in morning as per biodynamic calendar.',
  },
  {
    rule_id: 'ORG_CERT_008',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'NADEP composting method',
    scientific_basis: 'Prepare NADEP compost using crop residue, soil, and cow dung layering. 90-120 days before use, apply 10 t/ha.',
  },
  {
    rule_id: 'ORG_CERT_009',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.soil_states?.phosphorus === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Enriched compost preparation',
    scientific_basis: 'Prepare enriched compost with rock phosphate, neem cake, and Trichoderma during composting process.',
  },
  {
    rule_id: 'ORG_CERT_010',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.PEST_OUTBREAK_DETECTED,
    priority: 5,
    scientific_source: 'Intercropping for pest management',
    scientific_basis: 'Practice intercropping with trap crops and repellent plants to reduce pest pressure naturally.',
  },
  {
    rule_id: 'ORG_CERT_011',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 6,
    scientific_source: 'Beneficial insect conservation',
    scientific_basis: 'Maintain habitat for beneficial insects. Avoid broad-spectrum treatments even if organically approved.',
  },
  {
    rule_id: 'ORG_CERT_012',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    priority: 5,
    scientific_source: 'Organic record keeping',
    scientific_basis: 'Maintain detailed farm diary documenting all inputs, practices, and yields for certification audit.',
  },
  {
    rule_id: 'ORG_CERT_013',
    category: 'cultural',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_CULTURAL_SUFFICIENT,
    priority: 5,
    scientific_source: 'Agroforestry integration',
    scientific_basis: 'Integrate trees for microclimate, nutrient cycling, and biodiversity. Essential for long-term organic sustainability.',
  },
  {
    rule_id: 'ORG_CERT_014',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY &&
      input.crop_code === 'groundnut',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Organic calcium for groundnut',
    scientific_basis: 'Apply gypsum 500 kg/ha at pegging for groundnut. Ensure calcium in pod zone for proper development.',
  },
  {
    rule_id: 'ORG_CERT_015',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 5,
    scientific_source: 'Seed treatment with bioagents',
    scientific_basis: 'Treat seeds with Trichoderma viride 4g/kg + Pseudomonas fluorescens 10g/kg for comprehensive protection.',
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const ORGANIC_FARMING_RULES: CauseRule[] = [
  ...ORGANIC_PEST_MANAGEMENT_RULES,
  ...ORGANIC_DISEASE_MANAGEMENT_RULES,
  ...ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  ...CROP_ROTATION_CERTIFICATION_RULES,
];

export {
  ORGANIC_PEST_MANAGEMENT_RULES,
  ORGANIC_DISEASE_MANAGEMENT_RULES,
  ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  CROP_ROTATION_CERTIFICATION_RULES,
};

export default ORGANIC_FARMING_RULES;
