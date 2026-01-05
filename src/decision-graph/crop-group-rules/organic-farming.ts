/**
 * Organic Farming Rules
 * Comprehensive rules for organic/sustainable agriculture practices
 * Covers: biological pest control, organic nutrient management, composting,
 * green manuring, crop rotation, and certification compliance
 * Total: 60 rules
 */

import { CauseRule, Cause, RuleCategory } from '../types';

// ============================================================================
// ORGANIC PEST MANAGEMENT RULES (15 rules)
// ============================================================================

const ORGANIC_PEST_MANAGEMENT_RULES: CauseRule[] = [
  {
    id: 'ORG_PEST_001',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_pressure: 'high',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'NPOP/IFOAM organic pest management protocols',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'biological_control',
      description: 'Deploy Trichogramma egg parasitoids at 50,000/ha for lepidopteran pest control',
      timing: 'At first sign of moth activity, repeat every 7-10 days',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_002',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_type: 'sucking_pests',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Neem-based IPM for organic systems',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'organic_spray',
      description: 'Apply neem oil 3% or neem seed kernel extract (NSKE) 5% for sucking pest control',
      timing: 'Early morning or evening, avoid hot hours',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_003',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_type: 'soil_pests',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Entomopathogenic fungi for soil pest management',
    yield_impact: { min: 8, max: 20 },
    action: {
      type: 'biological_control',
      description: 'Apply Metarhizium anisopliae or Beauveria bassiana at 5 kg/ha for soil pest control',
      timing: 'Before sowing, incorporate into soil with adequate moisture',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_004',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      crop_group: 'vegetables',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Botanical pesticides for vegetable crops',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'organic_spray',
      description: 'Prepare and spray Dashparni Ark (10-leaf extract) at 3% concentration',
      timing: 'Weekly sprays during pest-prone periods',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_005',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_type: 'borers',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Bacillus thuringiensis for lepidopteran borers',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'biological_control',
      description: 'Apply Bt (Bacillus thuringiensis) formulation at 1-2 kg/ha',
      timing: 'During early larval stages, evening application preferred',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_006',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_type: 'aphids',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Predator-based aphid management',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'biological_control',
      description: 'Release Chrysoperla carnea (green lacewing) at 10,000 eggs/ha for aphid control',
      timing: 'At first aphid appearance, repeat if needed',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_007',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_type: 'mites',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Predatory mite release for spider mite control',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'biological_control',
      description: 'Release predatory mites (Phytoseiulus persimilis) at 20,000/ha',
      timing: 'When first mite colonies appear, maintain humidity',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_008',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      crop_group: 'fruits',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Pheromone-based pest monitoring and mass trapping',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Install pheromone traps at 5/ha for monitoring and mass trapping of fruit flies',
      timing: 'From flowering to harvest, service weekly',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_009',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      pest_severity: 'emergency',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Pyrethrin-based emergency organic pest control',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'organic_spray',
      description: 'Apply natural pyrethrin extract at recommended dose as emergency measure',
      timing: 'Evening application, last resort for severe outbreaks',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_010',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      habitat_management: 'needed',
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Conservation biological control through habitat management',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Establish beetle banks and flower strips to harbor beneficial insects',
      timing: 'Season start, maintain throughout crop cycle',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_011',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      trap_crop_suitable: true,
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Trap cropping for pest diversion',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'cultural_practice',
      description: 'Plant trap crops (mustard for aphids, castor for tobacco caterpillar) on field borders',
      timing: '15-20 days before main crop sowing',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_012',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      stored_grain: true,
    },
    priority: 1,
    category: 'harvest' as RuleCategory,
    scientific_basis: 'Organic grain storage pest management',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Use neem leaves, turmeric powder or sweet flag (Acorus calamus) for stored grain protection',
      timing: 'At storage, layer with grains',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_013',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      rodent_problem: true,
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Ecological rodent management',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'cultural_practice',
      description: 'Install owl perches at 10/ha and maintain clean field bunds to reduce rodent habitat',
      timing: 'Pre-season installation, maintain throughout',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_014',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      nematode_problem: true,
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Paecilomyces lilacinus for nematode management',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'biological_control',
      description: 'Apply Paecilomyces lilacinus at 5 kg/ha for root-knot nematode control',
      timing: 'At sowing, mix with FYM and apply in root zone',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_PEST_015',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      snail_slug_problem: true,
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Physical and biological slug/snail management',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'cultural_practice',
      description: 'Use ash barriers, beer traps, and encourage ducks/poultry access for slug control',
      timing: 'During wet periods, evening placement',
      organic_approved: true,
    },
  },
];

// ============================================================================
// ORGANIC DISEASE MANAGEMENT RULES (12 rules)
// ============================================================================

const ORGANIC_DISEASE_MANAGEMENT_RULES: CauseRule[] = [
  {
    id: 'ORG_DIS_001',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'fungal',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Trichoderma-based biocontrol for fungal diseases',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'biological_control',
      description: 'Apply Trichoderma viride or T. harzianum at 5 kg/ha for soil-borne fungal disease control',
      timing: 'Seed treatment and soil application at sowing',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_002',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'bacterial',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Pseudomonas fluorescens for bacterial disease suppression',
    yield_impact: { min: 8, max: 20 },
    action: {
      type: 'biological_control',
      description: 'Apply Pseudomonas fluorescens at 5 kg/ha as seed treatment and foliar spray',
      timing: 'Seed treatment + foliar at 30, 45, 60 DAS',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_003',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'powdery_mildew',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Milk spray and sulfur for powdery mildew',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'organic_spray',
      description: 'Spray diluted milk (1:9) or wettable sulfur 80WP at 2g/L for powdery mildew',
      timing: 'At first symptoms, repeat every 7-10 days',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_004',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'downy_mildew',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Copper-based organic fungicides for downy mildew',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'organic_spray',
      description: 'Apply Bordeaux mixture 1% or copper hydroxide (OMRI-listed) for downy mildew',
      timing: 'Preventive application before humid periods',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_005',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'damping_off',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Trichoderma seed treatment for damping-off prevention',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'biological_control',
      description: 'Treat seeds with Trichoderma at 4g/kg seed and drench nursery beds',
      timing: 'Before sowing, maintain proper drainage',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_006',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'viral',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Vector control and resistance for viral diseases',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Control vectors with neem oil, use reflective mulches, rogue infected plants',
      timing: 'From seedling stage, continuous monitoring',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_007',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'root_rot',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Combined biocontrol for root rots',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'biological_control',
      description: 'Apply Trichoderma + Pseudomonas consortium at 5 kg each/ha in root zone',
      timing: 'At sowing and 30 DAS as soil drench',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_008',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'leaf_spot',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Bioagent foliar sprays for leaf diseases',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'organic_spray',
      description: 'Spray Pseudomonas fluorescens at 5g/L or neem oil 2% for leaf spot control',
      timing: 'At symptom appearance, repeat every 10 days',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_009',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'wilt',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Soil solarization and biocontrol for wilt diseases',
    yield_impact: { min: 15, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Perform soil solarization for 6 weeks + apply Trichoderma at 10 kg/ha',
      timing: 'Summer fallow period, before planting',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_010',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'rust',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Sulfur and bioagents for rust management',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'organic_spray',
      description: 'Apply wettable sulfur 3g/L alternated with Pseudomonas fluorescens 5g/L',
      timing: 'At first pustule appearance, weekly intervals',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_011',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      disease_type: 'anthracnose',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Copper and biocontrol for anthracnose',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'organic_spray',
      description: 'Apply Bordeaux mixture 0.5% or Bacillus subtilis formulation preventively',
      timing: 'Before and during flowering, repeat post-rain',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_DIS_012',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      compost_tea: 'available',
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Compost tea as disease suppressant',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'organic_spray',
      description: 'Spray aerated compost tea at 10% concentration for general disease suppression',
      timing: 'Weekly foliar application during vegetative growth',
      organic_approved: true,
    },
  },
];

// ============================================================================
// ORGANIC NUTRIENT MANAGEMENT RULES (15 rules)
// ============================================================================

const ORGANIC_NUTRIENT_MANAGEMENT_RULES: CauseRule[] = [
  {
    id: 'ORG_NUT_001',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic nitrogen sources for crop nutrition',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply vermicompost at 5 t/ha + neem cake at 250 kg/ha for nitrogen supply',
      timing: 'Basal application, split with irrigation',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_002',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      legume_residue: 'available',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Legume residue nitrogen contribution',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'cultural_practice',
      description: 'Incorporate legume residue + apply Azotobacter at 5 kg/ha for nitrogen fixation',
      timing: '2-3 weeks before sowing main crop',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_003',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Rock phosphate and PSB for organic P nutrition',
    yield_impact: { min: 8, max: 20 },
    action: {
      type: 'fertilizer',
      description: 'Apply rock phosphate 200 kg/ha + PSB (Bacillus megaterium) 5 kg/ha',
      timing: 'Basal application, incorporate well',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_004',
    cause: Cause.POTASSIUM_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic potassium sources',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Apply wood ash at 500 kg/ha or banana pseudo-stem compost for potassium',
      timing: 'Split application at sowing and flowering',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_005',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      deficiency_type: 'zinc',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Zinc-enriched organic sources',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply zinc-enriched vermicompost or zinc sulfate (if naturally mined) at 25 kg/ha',
      timing: 'Basal or foliar at deficiency symptoms',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_006',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      deficiency_type: 'iron',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic iron management',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply ferrous sulfate (natural) 10 kg/ha or foliar spray of fermented iron solution',
      timing: 'When chlorosis appears, repeat every 15 days',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_007',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      crop_type: 'cereals',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Azospirillum for cereal nitrogen',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'biological_control',
      description: 'Apply Azospirillum brasilense at 5 kg/ha as seed treatment and soil application',
      timing: 'At sowing + 30 DAS in root zone',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_008',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      crop_type: 'legumes',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Rhizobium for legume nitrogen fixation',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'biological_control',
      description: 'Inoculate seeds with crop-specific Rhizobium at 200g/10kg seed',
      timing: 'Just before sowing, shade-dry after treatment',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_009',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      mycorrhiza_suitable: true,
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'VAM fungi for phosphorus mobilization',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'biological_control',
      description: 'Apply VAM (Glomus sp.) at 5 kg/ha in planting hole or root zone',
      timing: 'At transplanting or sowing',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_010',
    cause: Cause.POTASSIUM_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      crop_type: 'fruits',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'KMB for potassium mobilization',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'biological_control',
      description: 'Apply Frateuria aurantia (KMB) at 5 kg/ha + wood ash 300 kg/ha',
      timing: 'At flowering and fruit development',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_011',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Building soil organic matter',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply FYM 10-15 t/ha or compost 5 t/ha + green manure incorporation',
      timing: '3-4 weeks before sowing, incorporate well',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_012',
    cause: Cause.SULFUR_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic sulfur sources',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply gypsum 200 kg/ha (natural mineral) or sulfur-rich organic manures',
      timing: 'Basal application for oilseeds and pulses',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_013',
    cause: Cause.CALCIUM_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic calcium sources',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'fertilizer',
      description: 'Apply dolomite lime or calcified seaweed for calcium supply',
      timing: 'Based on soil test, 2-4 weeks before planting',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_014',
    cause: Cause.BORON_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Organic boron supplementation',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply borax (natural) at 10 kg/ha for boron-sensitive crops',
      timing: 'Basal for cauliflower, foliar for fruits',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_NUT_015',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      deficiency_type: 'multiple',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Seaweed extract for micronutrient supply',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'organic_spray',
      description: 'Apply seaweed extract (Kappaphycus/Ascophyllum) at 2-3 ml/L as foliar spray',
      timing: 'At vegetative growth and pre-flowering',
      organic_approved: true,
    },
  },
];

// ============================================================================
// COMPOSTING AND ORGANIC MATTER RULES (10 rules)
// ============================================================================

const COMPOSTING_ORGANIC_MATTER_RULES: CauseRule[] = [
  {
    id: 'ORG_COMP_001',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      compost_method: 'vermicompost',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Vermicompost production and application',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Prepare and apply vermicompost at 5 t/ha using Eisenia fetida',
      timing: '2-3 weeks before sowing, incorporate in soil',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_002',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      compost_method: 'nadep',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'NADEP composting method',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Prepare NADEP compost using crop residue, soil, and cow dung layering',
      timing: '90-120 days before use, apply 10 t/ha',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_003',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      enrichment: 'needed',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Enriched compost preparation',
    yield_impact: { min: 12, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Prepare enriched compost with rock phosphate, neem cake, and Trichoderma',
      timing: 'Add enrichments during composting process',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_004',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      liquid_fertilizer: true,
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Jeevamrut and other liquid organic fertilizers',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Prepare and apply Jeevamrut (200L/acre) or Panchagavya (3%) as soil drench',
      timing: 'Every 15 days during crop growth',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_005',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      green_manure: 'suitable',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Green manuring for soil organic matter',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'cultural_practice',
      description: 'Grow and incorporate Dhaincha/Sunhemp at flowering (45 DAS) for green manuring',
      timing: 'Summer fallow, 3 weeks before main crop',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_006',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      mulching: 'suitable',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Organic mulching for soil health',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Apply organic mulch (straw, leaves) at 5 t/ha to conserve moisture and add OM',
      timing: 'After crop establishment, maintain 5-10 cm layer',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_007',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      biochar: 'available',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Biochar for long-term carbon sequestration',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'fertilizer',
      description: 'Apply biochar at 2-5 t/ha to improve soil carbon and water retention',
      timing: 'One-time basal application, long-term benefit',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_008',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      residue_management: 'needed',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Crop residue recycling',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Shred and incorporate crop residue instead of burning, add decomposer culture',
      timing: 'Immediately after harvest, 2-3 weeks for decomposition',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_009',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      biodynamic: true,
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Biodynamic preparations',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply BD 500 (cow horn manure) and BD 501 (horn silica) as per biodynamic calendar',
      timing: 'BD 500 in evening, BD 501 in morning',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_COMP_010',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      farming_mode: 'organic',
      cover_crop: 'suitable',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Cover cropping for soil health',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Grow cover crops (legume-grass mix) during fallow to prevent erosion and add OM',
      timing: 'Off-season, terminate before main crop planting',
      organic_approved: true,
    },
  },
];

// ============================================================================
// CROP ROTATION AND CERTIFICATION RULES (8 rules)
// ============================================================================

const CROP_ROTATION_CERTIFICATION_RULES: CauseRule[] = [
  {
    id: 'ORG_ROT_001',
    cause: Cause.PEST_OUTBREAK_RISK,
    conditions: {
      farming_mode: 'organic',
      crop_rotation: 'needed',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Crop rotation for pest and disease break',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Follow 3-4 year rotation: Cereal → Legume → Oilseed → Vegetable to break pest cycles',
      timing: 'Season planning, maintain rotation records',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_ROT_002',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      farming_mode: 'organic',
      previous_crop: 'non_legume',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Legume inclusion in rotation for N building',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'cultural_practice',
      description: 'Include legume crop in rotation to fix 50-100 kg N/ha for subsequent crop',
      timing: 'Plan legume every 2-3 seasons',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_ROT_003',
    cause: Cause.DISEASE_RISK,
    conditions: {
      farming_mode: 'organic',
      same_family_rotation: true,
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Avoid same family crops in succession',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Avoid planting same family crops (e.g., Solanaceae) for 3+ years in same field',
      timing: 'Maintain field history records for planning',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_CERT_001',
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    conditions: {
      farming_mode: 'organic',
      certification: 'npop',
    },
    priority: 1,
    category: 'harvest' as RuleCategory,
    scientific_basis: 'NPOP organic certification compliance',
    yield_impact: { min: 0, max: 0 },
    action: {
      type: 'documentation',
      description: 'Maintain complete input records, field history, and avoid prohibited substances for NPOP compliance',
      timing: 'Continuous documentation, 36-month conversion period',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_CERT_002',
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    conditions: {
      farming_mode: 'organic',
      certification: 'pgs',
    },
    priority: 2,
    category: 'harvest' as RuleCategory,
    scientific_basis: 'PGS-India organic certification',
    yield_impact: { min: 0, max: 0 },
    action: {
      type: 'documentation',
      description: 'Join local organic cluster, participate in peer inspections, maintain farm diary',
      timing: 'Ongoing participation, annual renewal',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_CERT_003',
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    conditions: {
      farming_mode: 'organic',
      buffer_zone: 'needed',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Buffer zone management for organic certification',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain 7.5m buffer zone from conventional fields, plant hedgerow as barrier',
      timing: 'Establish at conversion start, maintain permanently',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_CERT_004',
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    conditions: {
      farming_mode: 'organic',
      contamination_risk: true,
    },
    priority: 1,
    category: 'harvest' as RuleCategory,
    scientific_basis: 'Contamination prevention in organic systems',
    yield_impact: { min: 0, max: 0 },
    action: {
      type: 'cultural_practice',
      description: 'Use dedicated organic equipment, clean storage, separate processing to prevent contamination',
      timing: 'From harvest to storage, maintain traceability',
      organic_approved: true,
    },
  },
  {
    id: 'ORG_CERT_005',
    cause: Cause.EXPORT_GRADE_REQUIREMENTS,
    conditions: {
      farming_mode: 'organic',
      seed_source: 'needed',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Organic seed sourcing requirements',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'cultural_practice',
      description: 'Use organic/untreated seeds, maintain seed production plot if organic seeds unavailable',
      timing: 'Pre-season seed procurement planning',
      organic_approved: true,
    },
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const ORGANIC_FARMING_RULES: CauseRule[] = [
  ...ORGANIC_PEST_MANAGEMENT_RULES,
  ...ORGANIC_DISEASE_MANAGEMENT_RULES,
  ...ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  ...COMPOSTING_ORGANIC_MATTER_RULES,
  ...CROP_ROTATION_CERTIFICATION_RULES,
];

export {
  ORGANIC_PEST_MANAGEMENT_RULES,
  ORGANIC_DISEASE_MANAGEMENT_RULES,
  ORGANIC_NUTRIENT_MANAGEMENT_RULES,
  COMPOSTING_ORGANIC_MATTER_RULES,
  CROP_ROTATION_CERTIFICATION_RULES,
};

export default ORGANIC_FARMING_RULES;
