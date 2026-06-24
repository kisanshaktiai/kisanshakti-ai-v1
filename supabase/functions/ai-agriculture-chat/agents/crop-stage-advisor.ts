/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP STAGE ADVISOR - Stage-Specific Decision Trees
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ DEPRECATION NOTICE:
 * This file contains hardcoded agronomic knowledge that should be migrated
 * to the `decision_rules` database table for SSOT compliance.
 * 
 * CURRENT STATUS: Used as STAGE_ADVISORY_FALLBACK when zero rules fire
 * from the database for stage-specific queries.
 * 
 * MIGRATION TARGET: Create `crop_stage_knowledge` DB table to replace
 * all hardcoded StageAdvice objects below.
 * 
 * Tagged: STAGE_ADVISORY_FALLBACK (documented in memory)
 * 
 * PHASE 5: Provides stage-specific agronomic advice for each crop
 * All text is English-only — LLM narration layer translates at runtime.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface StageAdvice {
  water: string;
  fertilizer: string;
  pest_watch: string[];
  disease_watch: string[];
  critical_actions: string[];
  avoid_actions: string[];
  expected_ndvi_range: { min: number; max: number };
  yield_impact_if_stressed: string;
}

export interface CropStageAdvisor {
  crop_code: string;
  stages: Record<string, StageAdvice>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT STAGE-SPECIFIC ADVISOR (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

const WHEAT_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'WHEAT',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation if soil is dry. Avoid waterlogging.',
      fertilizer: 'Basal dose should already be applied at sowing.',
      pest_watch: ['Termite'],
      disease_watch: [],
      critical_actions: ['Ensure uniform germination', 'Check seed-soil contact'],
      avoid_actions: ['Heavy irrigation', 'Fertilizer application'],
      expected_ndvi_range: { min: 0.08, max: 0.15 },
      yield_impact_if_stressed: '10-15% reduced plant stand',
    },
    'SEEDLING': {
      water: 'Keep soil moist but not waterlogged. First irrigation may be due.',
      fertilizer: 'No fertilizer needed until CRI stage.',
      pest_watch: ['Aphid', 'Armyworm'],
      disease_watch: ['Loose smut (seed-borne)'],
      critical_actions: ['Gap filling if needed', 'Weed management'],
      avoid_actions: ['Heavy nitrogen application', 'Deep irrigation'],
      expected_ndvi_range: { min: 0.15, max: 0.30 },
      yield_impact_if_stressed: '15-20% reduced tillers',
    },
    'TILLERING': {
      water: 'CRI irrigation CRITICAL at 21-25 DAS. Plan 2nd irrigation at 40-45 DAS.',
      fertilizer: 'Apply 1/3 N as top dressing with CRI irrigation.',
      pest_watch: ['Aphid', 'Pink stem borer'],
      disease_watch: ['Yellow rust (North India)', 'Loose smut'],
      critical_actions: [
        'CRI irrigation is MOST CRITICAL - missing reduces yield 40-50%',
        'Apply 1/3 nitrogen now',
        'Scout for rust symptoms',
      ],
      avoid_actions: ['Skip CRI irrigation', 'Delay nitrogen top dressing'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '40-50% yield loss if CRI irrigation missed',
    },
    'STEM_ELONGATION': {
      water: 'Regular irrigation every 20-25 days based on soil moisture.',
      fertilizer: 'Complete remaining nitrogen application.',
      pest_watch: ['Aphid'],
      disease_watch: ['Brown rust', 'Powdery mildew'],
      critical_actions: ['Complete N application', 'Disease scouting'],
      avoid_actions: ['Nitrogen after this stage'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '20-30% reduced grain count',
    },
    'FLOWERING': {
      water: 'Critical irrigation during flowering. Do not stress the crop.',
      fertilizer: 'No nitrogen needed. Consider micronutrient spray.',
      pest_watch: ['Aphid peak infestation'],
      disease_watch: ['Yellow rust', 'Brown rust', 'Ear head blight'],
      critical_actions: ['Maintain irrigation schedule', 'Aphid control if ETL crossed'],
      avoid_actions: ['Water stress', 'Heavy pesticide spray during pollination'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-40% reduced grain setting',
    },
    'GRAIN_FILLING': {
      water: 'Light irrigation to maintain grain weight. Avoid waterlogging.',
      fertilizer: 'Foliar spray of 2% urea if yellowing seen.',
      pest_watch: ['Aphid'],
      disease_watch: ['Karnal bunt (humid areas)'],
      critical_actions: ['Maintain leaf health', 'Protect from lodging'],
      avoid_actions: ['Heavy irrigation', 'Late pesticide spray'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '15-20% reduced grain weight',
    },
    'MATURITY': {
      water: 'Stop irrigation 10-15 days before harvest.',
      fertilizer: 'No fertilizer application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check grain moisture for harvest timing', 'Prepare for harvest'],
      avoid_actions: ['Irrigation', 'Any chemical spray'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Minimal at this stage',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RICE STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const RICE_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'RICE',
  stages: {
    'GERMINATION': {
      water: 'Maintain thin layer of water in nursery. Drain for 2 days after sowing.',
      fertilizer: 'Apply nursery dose as per recommendation.',
      pest_watch: ['Stem borer egg masses'],
      disease_watch: ['Bacterial leaf blight (nursery)'],
      critical_actions: ['Maintain water level', 'Seed treatment effectiveness check'],
      avoid_actions: ['Deep flooding', 'Urea in nursery'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Seedling mortality',
    },
    'SEEDLING': {
      water: 'Maintain 2-3 cm water level. Drain before transplanting.',
      fertilizer: 'No additional fertilizer in nursery.',
      pest_watch: ['Leaf folder', 'Stem borer'],
      disease_watch: ['Blast (if nitrogen excess)'],
      critical_actions: ['Prepare for transplanting at 21-25 days'],
      avoid_actions: ['Excess nitrogen in nursery'],
      expected_ndvi_range: { min: 0.18, max: 0.35 },
      yield_impact_if_stressed: 'Weak seedlings, poor transplant survival',
    },
    'TILLERING': {
      water: 'Maintain 3-5 cm standing water. AWD (Alternate Wetting Drying) can start.',
      fertilizer: 'Apply 1/2 nitrogen as first split at 21 DAT.',
      pest_watch: ['Stem borer', 'Leaf folder', 'BPH'],
      disease_watch: ['Blast', 'Sheath blight'],
      critical_actions: [
        'First N split at 21 DAT is critical',
        'Maximum tillering determines yield potential',
        'Scout for stem borer dead hearts',
      ],
      avoid_actions: ['Water stress during tillering', 'Delayed nitrogen'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: '30-40% reduced tillers = 30-40% yield loss',
    },
    'PANICLE_INITIATION': {
      water: 'Critical - maintain 5 cm water. No water stress allowed.',
      fertilizer: 'Apply remaining 1/4 nitrogen.',
      pest_watch: ['Stem borer', 'Gall midge', 'BPH'],
      disease_watch: ['Sheath blight', 'Blast'],
      critical_actions: ['Final N split', 'Scout for BPH'],
      avoid_actions: ['Water stress', 'Skip final N'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '40-50% spikelet sterility',
    },
    'FLOWERING': {
      water: 'CRITICAL - maintain continuous flooding. No drainage.',
      fertilizer: 'No fertilizer application.',
      pest_watch: ['BPH', 'Neck blast'],
      disease_watch: ['Neck blast', 'False smut'],
      critical_actions: ['Maintain water', 'Control BPH if ETL crossed'],
      avoid_actions: ['Any water stress', 'Fungicide during anthesis'],
      expected_ndvi_range: { min: 0.60, max: 0.80 },
      yield_impact_if_stressed: '60-70% unfilled grains',
    },
    'GRAIN_FILLING': {
      water: 'Maintain 2-3 cm water. Begin drainage 10-15 days before harvest.',
      fertilizer: 'No application.',
      pest_watch: ['BPH (hopper burn)'],
      disease_watch: ['Sheath rot', 'Grain discoloration'],
      critical_actions: ['Monitor BPH population'],
      avoid_actions: ['Early drainage'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: '10-20% chaffy grains',
    },
    'MATURITY': {
      water: 'Drain field completely. Allow drying for 7-10 days.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check grain moisture (20-22% for harvest)', 'Plan harvest logistics'],
      avoid_actions: ['Delayed harvest (shattering losses)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Shattering if harvest delayed',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const SUGARCANE_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'SUGARCANE',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation every 7-10 days. Avoid waterlogging.',
      fertilizer: 'Basal dose of P and K should be applied at planting.',
      pest_watch: ['Termite', 'Early shoot borer egg masses'],
      disease_watch: ['Sett rot'],
      critical_actions: ['Ensure proper germination', 'Gap filling at 30 DAS'],
      avoid_actions: ['Heavy flooding', 'Nitrogen at this stage'],
      expected_ndvi_range: { min: 0.10, max: 0.25 },
      yield_impact_if_stressed: '15-20% poor stand',
    },
    'TILLERING': {
      water: 'Irrigation every 10-12 days. Critical for tiller formation.',
      fertilizer: 'Apply 1/3 nitrogen at 45 DAS with earthing up.',
      pest_watch: ['Early shoot borer (30-45 DAS)', 'Pyrilla'],
      disease_watch: ['Red rot (planting material)'],
      critical_actions: [
        'Earthing up at 45 DAS',
        '1/3 N application',
        'Scout for dead hearts (shoot borer)',
      ],
      avoid_actions: ['Water stress during tillering'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '25-35% reduced tillers',
    },
    'GRAND_GROWTH': {
      water: 'Maximum water demand. Irrigate every 7-10 days.',
      fertilizer: 'Apply remaining 2/3 nitrogen in 2 splits at 90 and 120 DAS.',
      pest_watch: ['Internode borer', 'Top borer', 'Pyrilla', 'Woolly aphid'],
      disease_watch: ['Red rot', 'Smut'],
      critical_actions: [
        'This is the CRITICAL GROWTH PHASE',
        'Any stress here = major yield loss',
        'Complete nitrogen by 120 DAS',
        'Second earthing up at 90 DAS',
      ],
      avoid_actions: ['Water stress', 'Delayed nitrogen application'],
      expected_ndvi_range: { min: 0.55, max: 0.80 },
      yield_impact_if_stressed: '40-60% yield reduction',
    },
    'MATURITY': {
      water: 'Reduce irrigation. Stop 3-4 weeks before harvest.',
      fertilizer: 'No nitrogen after 120 DAS.',
      pest_watch: ['Top borer', 'Scale insect'],
      disease_watch: ['Smut', 'Wilt'],
      critical_actions: ['Monitor sugar accumulation', 'Plan harvest timing'],
      avoid_actions: ['Nitrogen application', 'Excess water'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'Reduced sugar recovery',
    },
    'RIPENING': {
      water: 'Withhold irrigation. Allow natural drying.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: [],
      critical_actions: ['Check Brix for harvest readiness', 'Coordinate with mill'],
      avoid_actions: ['Irrigation', 'Late ratoon damage'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Low sugar recovery if harvested early',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COTTON STAGE-SPECIFIC ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

const COTTON_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'COTTON',
  stages: {
    'GERMINATION': {
      water: 'Light irrigation if soil is dry. Seed should germinate in 5-7 days.',
      fertilizer: 'Basal dose should be applied at sowing.',
      pest_watch: ['Cutworm', 'Termite'],
      disease_watch: [],
      critical_actions: ['Check for uniform germination'],
      avoid_actions: ['Heavy irrigation'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Poor stand establishment',
    },
    'SEEDLING': {
      water: 'Keep soil moist. Irrigate every 10-12 days.',
      fertilizer: 'No additional fertilizer yet.',
      pest_watch: ['Jassid', 'Aphid', 'Thrips'],
      disease_watch: ['Root rot', 'Bacterial blight'],
      critical_actions: ['Thinning if needed', 'First weeding'],
      avoid_actions: ['Waterlogging'],
      expected_ndvi_range: { min: 0.18, max: 0.35 },
      yield_impact_if_stressed: '15-20% plant mortality',
    },
    'VEGETATIVE': {
      water: 'Regular irrigation every 10-12 days.',
      fertilizer: 'Apply 1/2 nitrogen at 30 DAS.',
      pest_watch: ['Jassid', 'Aphid', 'Whitefly'],
      disease_watch: ['Bacterial blight', 'Grey mildew'],
      critical_actions: ['First N split', 'Inter-cultivation', 'Pest scouting'],
      avoid_actions: ['Skip nitrogen application'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: '20-25% reduced boll setting',
    },
    'SQUARING': {
      water: 'Critical irrigation phase. Do not stress.',
      fertilizer: 'Apply remaining nitrogen at squaring.',
      pest_watch: ['Bollworm (American/Pink)', 'Aphid', 'Whitefly'],
      disease_watch: ['Grey mildew'],
      critical_actions: ['Complete N application', 'Install pheromone traps'],
      avoid_actions: ['Water stress - causes square shedding'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-40% square shedding',
    },
    'FLOWERING': {
      water: 'Maximum water demand. Irrigate every 7-10 days.',
      fertilizer: 'Foliar micronutrients if deficiency seen.',
      pest_watch: ['Bollworm', 'Pink bollworm', 'Mealybug', 'Whitefly'],
      disease_watch: ['Leaf curl virus (via whitefly)'],
      critical_actions: ['Bollworm monitoring', 'Timely pest control'],
      avoid_actions: ['Water stress', 'Heavy insecticide during bee activity'],
      expected_ndvi_range: { min: 0.60, max: 0.80 },
      yield_impact_if_stressed: '40-50% boll shedding',
    },
    'BOLL_FORMATION': {
      water: 'Continue irrigation. Reduce frequency as bolls mature.',
      fertilizer: 'No nitrogen application.',
      pest_watch: ['Pink bollworm', 'Mealybug'],
      disease_watch: ['Boll rot'],
      critical_actions: ['Pink bollworm control', 'Maintain plant health'],
      avoid_actions: ['Late nitrogen (delays maturity)'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '20-30% boll damage',
    },
    'BOLL_OPENING': {
      water: 'Reduce irrigation. Allow bolls to open.',
      fertilizer: 'No application.',
      pest_watch: ['Pink bollworm (rosette flowers)'],
      disease_watch: [],
      critical_actions: ['Plan picking schedule', 'Reduce water'],
      avoid_actions: ['Irrigation', 'Pesticide near harvest'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Fiber quality loss',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// AI-AUTHORED ADVISORS — PENDING AGRONOMIST REVIEW (2026-06-24)
// ═══════════════════════════════════════════════════════════════════════════
// The 7 advisors below (BRINJAL, CHILLI, MAIZE, ONION, POTATO, SOYBEAN,
// TOMATO) were authored by Claude from general ICAR Package-of-Practices
// knowledge to close the gap where these crops (present in crop_stage_master
// and farmer-facing) had zero stage-advisory fallback coverage and silently
// returned null. Stage keys match crop_stage_master.growth_stage values
// (uppercased) for each crop so no alias layer is needed.
//
// These are a STARTING POINT, not verified field data — DAS windows,
// thresholds, and pest/disease lists should be checked against current
// regional ICAR/SAU advisories before this is trusted as a production
// safety-net (per the file's own STAGE_ADVISORY_FALLBACK / migrate-to-DB
// notice above). Do not remove this notice until reviewed.
// ═══════════════════════════════════════════════════════════════════════════

const TOMATO_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'TOMATO',
  stages: {
    'NURSERY': {
      water: 'Light overhead irrigation/misting to keep nursery bed moist, not waterlogged.',
      fertilizer: 'Basal FYM in nursery bed only; no additional fertilizer.',
      pest_watch: ['Aphid', 'Whitefly (virus vector)'],
      disease_watch: ['Damping-off', 'Seedling blight'],
      critical_actions: ['Shade net over nursery bed', 'Seed treatment with Trichoderma/Carbendazim'],
      avoid_actions: ['Overwatering (damping-off risk)', 'Sowing in unshaded bed during peak heat'],
      expected_ndvi_range: { min: 0.10, max: 0.25 },
      yield_impact_if_stressed: 'Weak/leggy seedlings, poor transplant survival',
    },
    'TRANSPLANTING': {
      water: 'Irrigate immediately after transplanting to settle roots; light irrigation for first week.',
      fertilizer: 'Basal dose (FYM + half N + full P + half K) at transplanting.',
      pest_watch: ['Cutworm'],
      disease_watch: ['Transplant shock related wilting'],
      critical_actions: ['Transplant in evening hours', 'Maintain 60x45cm (open) or 90x60cm (indeterminate) spacing'],
      avoid_actions: ['Midday transplanting', 'Transplanting overgrown (>30 day) seedlings'],
      expected_ndvi_range: { min: 0.15, max: 0.30 },
      yield_impact_if_stressed: 'Stand establishment loss',
    },
    'ESTABLISHMENT': {
      water: 'Irrigate every 5-7 days depending on soil type.',
      fertilizer: 'No additional fertilizer until vegetative top-dress.',
      pest_watch: ['Whitefly', 'Leaf miner'],
      disease_watch: ['Bacterial wilt', 'Damping-off carryover'],
      critical_actions: ['Gap filling within 7-10 days', 'Staking preparation for indeterminate types'],
      avoid_actions: ['Water stress during establishment'],
      expected_ndvi_range: { min: 0.20, max: 0.35 },
      yield_impact_if_stressed: 'Poor plant stand, delayed flowering',
    },
    'VEGETATIVE': {
      water: 'Irrigate every 7-10 days; avoid waterlogging.',
      fertilizer: 'First N top-dress at 25 DAT.',
      pest_watch: ['Whitefly', 'Aphid', 'Leaf miner'],
      disease_watch: ['Early blight', 'Leaf curl virus (whitefly-borne)'],
      critical_actions: ['First N top-dress', 'Staking/pruning for indeterminate types', 'Whitefly control to limit virus spread'],
      avoid_actions: ['Excess nitrogen (delays flowering, promotes foliage)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Delayed flowering, reduced fruit set potential',
    },
    'FLOWERING': {
      water: 'Maintain steady soil moisture; avoid moisture swings (BER risk).',
      fertilizer: 'Calcium and boron foliar spray; avoid heavy N.',
      pest_watch: ['Fruit borer (early oviposition)', 'Whitefly'],
      disease_watch: ['Early blight', 'Flower drop from heat (>32°C)'],
      critical_actions: ['Ca + B foliar spray', 'Monitor for flower drop above 32°C'],
      avoid_actions: ['Irregular irrigation', 'Heavy nitrogen at flowering'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: 'Flower drop, reduced fruit set',
    },
    'FLOWERING_FRUIT_SET': {
      water: 'Maintain steady moisture; second N top-dress with irrigation.',
      fertilizer: 'Second N top-dress at 45 DAT.',
      pest_watch: ['Fruit borer', 'Whitefly'],
      disease_watch: ['Early blight', 'BER (physiological, Ca-linked)'],
      critical_actions: ['Second N top-dress', 'Begin fruit borer scouting'],
      avoid_actions: ['Moisture stress (BER and fruit cracking risk)'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'BER, fruit cracking, reduced set',
    },
    'FRUIT_SET': {
      water: 'Critical irrigation regularity — irregular moisture is the leading BER cause.',
      fertilizer: 'No nitrogen; Ca spray continues if BER symptoms seen.',
      pest_watch: ['Fruit borer'],
      disease_watch: ['Blossom-End Rot (BER)'],
      critical_actions: ['Maintain irrigation regularity', 'Calcium spray if BER appears'],
      avoid_actions: ['Letting soil dry out between irrigations'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'BER incidence, marketable yield loss',
    },
    'FRUIT_DEVELOPMENT': {
      water: 'Critical irrigation phase — K and Ca demand peak.',
      fertilizer: 'Foliar K spray to support fruit enlargement.',
      pest_watch: ['Fruit borer (peak)', 'Fruit fly'],
      disease_watch: ['Late blight (humid conditions)', 'BER'],
      critical_actions: ['Fruit borer control (ETL-based)', 'Maintain irrigation for fruit enlargement'],
      avoid_actions: ['Irregular irrigation', 'Pesticide spray near harvest without checking PHI'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'Smaller fruit size, cracking',
    },
    'HARVEST_MATURITY': {
      water: 'Reduce irrigation slightly as fruit ripens; do not let plants wilt.',
      fertilizer: 'No further fertilizer application.',
      pest_watch: ['Fruit fly', 'Fruit borer'],
      disease_watch: ['Fruit rot in overripe/damaged fruit'],
      critical_actions: ['Pick at breaker/full-color stage per market need', 'Plan picking every 3-5 days'],
      avoid_actions: ['Delaying harvest (over-ripening, cracking, pest damage)'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Overripe loss, reduced shelf life',
    },
  },
};

const POTATO_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'POTATO',
  stages: {
    'SPROUTING': {
      water: 'Light irrigation after planting if soil is dry; avoid waterlogging seed tubers.',
      fertilizer: 'Full basal dose (FYM + P + K + half N) at planting.',
      pest_watch: ['Cutworm'],
      disease_watch: ['Seed tuber rot (poor drainage)'],
      critical_actions: ['Ensure well-drained ridges', 'Use disease-free certified seed tubers'],
      avoid_actions: ['Waterlogging at planting'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Poor/delayed emergence',
    },
    'VEGETATIVE': {
      water: 'Irrigate every 7-10 days.',
      fertilizer: 'Remaining half N top-dress with earthing-up before tuber initiation.',
      pest_watch: ['Aphid (virus vector)'],
      disease_watch: ['Early blight'],
      critical_actions: ['Earthing-up before tuberization begins', 'Aphid control to limit virus spread'],
      avoid_actions: ['Delaying earthing-up (greening/poor tuber set)'],
      expected_ndvi_range: { min: 0.30, max: 0.50 },
      yield_impact_if_stressed: 'Reduced canopy, fewer tubers initiated',
    },
    'TUBER_INITIATION': {
      water: 'Critical irrigation — moisture stress now reduces tuber number.',
      fertilizer: 'Nutrient demand rising; ensure K availability.',
      pest_watch: ['Aphid', 'Leafhopper'],
      disease_watch: ['Late blight (cool humid weather)'],
      critical_actions: ['Maintain consistent soil moisture', 'Begin late blight scouting in humid weather'],
      avoid_actions: ['Moisture stress at stolon/tuber initiation'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: '20-30% fewer tubers set',
    },
    'TUBER_BULKING': {
      water: 'Maximum water demand — irrigate every 7-8 days, do not let soil dry.',
      fertilizer: 'No more N; ensure K sufficiency for bulking.',
      pest_watch: ['Aphid'],
      disease_watch: ['Late blight (highest risk stage)'],
      critical_actions: ['THE most critical irrigation phase', 'Late blight fungicide spray on first symptom/forecast'],
      avoid_actions: ['Moisture stress (cracking, hollow heart)', 'Skipping blight scouting'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-50% yield loss if stressed or blight uncontrolled',
    },
    'MATURATION': {
      water: 'Reduce irrigation as haulm yellows; stop 7-10 days before haulm cutting.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Tuber blight (if foliage infected late)'],
      critical_actions: ['Allow skin-set before harvest', 'Stop irrigation to firm skin'],
      avoid_actions: ['Late irrigation (delays skin-set, storage rot risk)'],
      expected_ndvi_range: { min: 0.30, max: 0.50 },
      yield_impact_if_stressed: 'Poor skin-set, storage losses',
    },
    'HARVEST': {
      water: 'No irrigation.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Storage rot if tubers wet/damaged at lifting'],
      critical_actions: ['Cut haulm 7-14 days before lifting', 'Cure tubers before storage'],
      avoid_actions: ['Lifting immediately after irrigation/rain', 'Rough handling (skin damage → storage rot)'],
      expected_ndvi_range: { min: 0.10, max: 0.30 },
      yield_impact_if_stressed: 'Storage and handling losses',
    },
  },
};

const ONION_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'ONION',
  stages: {
    'NURSERY': {
      water: 'Frequent light irrigation/misting to keep nursery bed moist.',
      fertilizer: 'Basal FYM in nursery bed only.',
      pest_watch: ['Thrips'],
      disease_watch: ['Damping-off'],
      critical_actions: ['Raised nursery bed for drainage', 'Thin out overcrowded seedlings'],
      avoid_actions: ['Overwatering nursery bed'],
      expected_ndvi_range: { min: 0.10, max: 0.20 },
      yield_impact_if_stressed: 'Weak, thin seedlings unfit for transplant',
    },
    'TRANSPLANTING': {
      water: 'Irrigate immediately at transplanting; light irrigation for first week.',
      fertilizer: 'Basal dose (FYM + full P + half N + half K) at transplanting.',
      pest_watch: ['Thrips'],
      disease_watch: ['Transplant shock'],
      critical_actions: ['Transplant 6-8 week pencil-thick seedlings only', '15x10cm spacing on raised beds'],
      avoid_actions: ['Transplanting overgrown or thin/weak seedlings'],
      expected_ndvi_range: { min: 0.12, max: 0.25 },
      yield_impact_if_stressed: 'Poor stand establishment',
    },
    'ESTABLISHMENT': {
      water: 'Irrigate every 7-10 days for establishment.',
      fertilizer: 'No additional fertilizer until first top-dress.',
      pest_watch: ['Thrips'],
      disease_watch: ['Purple blotch (early)'],
      critical_actions: ['Gap filling', 'Thrips monitoring (vector for some viruses)'],
      avoid_actions: ['Water stress during establishment'],
      expected_ndvi_range: { min: 0.20, max: 0.35 },
      yield_impact_if_stressed: 'Stand loss, delayed vegetative growth',
    },
    'VEGETATIVE': {
      water: 'Irrigate every 7-10 days.',
      fertilizer: 'First top-dress N at 30 DAT.',
      pest_watch: ['Thrips (peak risk)'],
      disease_watch: ['Purple blotch'],
      critical_actions: ['First N top-dress', 'Thrips control (ETL-based) — major yield-limiting pest'],
      avoid_actions: ['Ignoring thrips buildup (direct leaf damage reduces bulb size)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '15-25% reduced bulb size from thrips/water stress',
    },
    'BULB_INITIATION': {
      water: 'Most water-critical phase — do not allow moisture stress.',
      fertilizer: 'Second top-dress N at 45 DAT; this is the last N application.',
      pest_watch: ['Thrips'],
      disease_watch: ['Purple blotch', 'Stemphylium blight'],
      critical_actions: ['Second/final N top-dress', 'Maintain consistent irrigation — bulb initiation is photoperiod + moisture sensitive'],
      avoid_actions: ['Nitrogen after this stage (delays maturity, poor bulb keeping quality)', 'Moisture stress'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: '30-40% reduced bulb size if stressed now',
    },
    'BULB_DEVELOPMENT': {
      water: 'Continue regular irrigation; stop nitrogen entirely.',
      fertilizer: 'No nitrogen; K and S support bulb quality and pungency.',
      pest_watch: ['Thrips'],
      disease_watch: ['Purple blotch', 'Stemphylium blight (humid conditions)'],
      critical_actions: ['Stop N by 60 DAT', 'Disease scouting in humid weather'],
      avoid_actions: ['Late nitrogen application (causes neck thickness, poor storage)'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: 'Smaller bulbs, poor storage quality',
    },
    'MATURATION_HARVEST': {
      water: 'Stop irrigation 2-3 weeks before harvest to allow neck fall and curing.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Neck rot (if harvested wet)'],
      critical_actions: ['Harvest at 50-75% neck fall', 'Cure bulbs in field/shade before storage'],
      avoid_actions: ['Irrigating near harvest', 'Storing uncured/wet bulbs'],
      expected_ndvi_range: { min: 0.20, max: 0.40 },
      yield_impact_if_stressed: 'Storage rot, reduced shelf life',
    },
  },
};

const BRINJAL_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'BRINJAL',
  stages: {
    'NURSERY': {
      water: 'Light misting to keep nursery bed moist, not waterlogged.',
      fertilizer: 'Basal FYM in nursery bed only.',
      pest_watch: ['Aphid', 'Whitefly'],
      disease_watch: ['Damping-off'],
      critical_actions: ['Raised nursery bed', 'Seed treatment with Trichoderma/Carbendazim'],
      avoid_actions: ['Overwatering nursery bed'],
      expected_ndvi_range: { min: 0.10, max: 0.20 },
      yield_impact_if_stressed: 'Weak seedlings, poor transplant survival',
    },
    'TRANSPLANTING': {
      water: 'Irrigate immediately after transplanting.',
      fertilizer: 'Basal dose (FYM + full P + half N + half K) at transplanting.',
      pest_watch: ['Cutworm'],
      disease_watch: ['Transplant shock'],
      critical_actions: ['Transplant 4-6 leaf, 12-15cm seedlings', 'Evening transplanting'],
      avoid_actions: ['Midday transplanting', 'Overgrown seedlings'],
      expected_ndvi_range: { min: 0.12, max: 0.25 },
      yield_impact_if_stressed: 'Poor stand establishment',
    },
    'VEGETATIVE': {
      water: 'Irrigate every 7-10 days.',
      fertilizer: 'First N top-dress around branching.',
      pest_watch: ['Shoot and fruit borer (early oviposition)', 'Aphid', 'Whitefly'],
      disease_watch: ['Bacterial wilt', 'Phomopsis blight'],
      critical_actions: ['First N top-dress', 'Install pheromone traps for fruit borer early'],
      avoid_actions: ['Excess nitrogen (promotes foliage over branching)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Delayed flowering, reduced branching',
    },
    'FLOWERING': {
      water: 'Maintain steady irrigation through flowering.',
      fertilizer: 'Boron/calcium foliar spray; avoid heavy N.',
      pest_watch: ['Shoot and fruit borer (critical control window)', 'Whitefly'],
      disease_watch: ['Bacterial wilt'],
      critical_actions: ['Prune borer-damaged shoots and destroy', 'Continue pheromone trap monitoring'],
      avoid_actions: ['Ignoring early shoot borer damage (compounds into fruit borer losses)'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: '20-30% flower/shoot loss to borer',
    },
    'FRUITING': {
      water: 'Critical irrigation regularity for fruit development.',
      fertilizer: 'Foliar K for fruit quality.',
      pest_watch: ['Fruit borer (peak — single biggest yield threat)', 'Mealybug'],
      disease_watch: ['Fruit rot', 'Phomopsis blight'],
      critical_actions: ['Fruit borer control before fruit entry (ETL-based)', 'Remove and destroy borer-damaged fruit'],
      avoid_actions: ['Delaying borer control until damage visible inside fruit'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: '30-50% marketable yield loss to fruit borer',
    },
    'HARVEST': {
      water: 'Maintain regular irrigation through the harvest window — plant continues fruiting.',
      fertilizer: 'Light maintenance N/K dose between pickings to sustain successive flushes.',
      pest_watch: ['Fruit borer (continuous risk through harvest)'],
      disease_watch: ['Fruit rot in overripe fruit'],
      critical_actions: ['Pick every 3-5 days at glossy-skin stage', 'Remove overripe/damaged fruit promptly'],
      avoid_actions: ['Delayed picking (seediness, reduced market value)', 'Stopping pest control once harvest starts'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Reduced picking frequency, lower cumulative yield',
    },
  },
};

const CHILLI_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'CHILLI',
  stages: {
    'NURSERY': {
      water: 'Light misting; raised bed or pro-tray to avoid waterlogging.',
      fertilizer: 'Basal FYM in nursery bed/tray media only.',
      pest_watch: ['Thrips'],
      disease_watch: ['Damping-off (primary nursery risk)'],
      critical_actions: ['Use pro-trays or raised beds', 'Seed treatment with Trichoderma/Carbendazim'],
      avoid_actions: ['Overwatering (damping-off)', 'Sowing in waterlogged beds'],
      expected_ndvi_range: { min: 0.10, max: 0.20 },
      yield_impact_if_stressed: 'Seedling mortality from damping-off',
    },
    'TRANSPLANT_ESTABLISHMENT': {
      water: 'Critical irrigation for transplant recovery; avoid moisture stress in first week.',
      fertilizer: 'Basal dose at transplanting; no foliar spray for first 7 days (avoid further shock).',
      pest_watch: ['Thrips', 'Whitefly'],
      disease_watch: ['Transplant shock', 'Damping-off carryover'],
      critical_actions: ['Transplant 4-5 leaf seedlings only', 'Avoid foliar spray during first 7 DAT'],
      avoid_actions: ['Foliar spray within first week', 'Moisture stress during establishment'],
      expected_ndvi_range: { min: 0.12, max: 0.25 },
      yield_impact_if_stressed: 'Poor recovery, stand loss',
    },
    'VEGETATIVE': {
      water: 'Irrigate every 7-10 days.',
      fertilizer: 'First N+K top-dress at canopy building stage.',
      pest_watch: ['Thrips', 'Whitefly', 'Aphid (all 3 are virus vectors)'],
      disease_watch: ['Leaf curl virus (thrips/whitefly-borne)'],
      critical_actions: ['First N+K top-dress', 'Vector pest control to limit virus spread — single biggest risk to yield potential'],
      avoid_actions: ['Ignoring early thrips/whitefly buildup'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: '20-40% yield loss if leaf curl virus establishes',
    },
    'FLOWERING_INITIATION': {
      water: 'Maintain steady moisture; heat above 35°C causes flower drop.',
      fertilizer: 'Calcium + boron foliar critical at flowering.',
      pest_watch: ['Thrips (curling new growth)'],
      disease_watch: ['Flower drop (heat-related, physiological)'],
      critical_actions: ['Ca + B foliar spray', 'Avoid stress during heat spells'],
      avoid_actions: ['Moisture stress', 'Spraying during peak heat (>35°C)'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Flower drop, reduced fruit set',
    },
    'FRUIT_SETTING': {
      water: 'Critical Ca + B + irrigation regularity to prevent BER and fruit cracking.',
      fertilizer: 'Continue Ca + B foliar; maintain K for fruit development.',
      pest_watch: ['Fruit borer', 'Thrips'],
      disease_watch: ['Blossom-End Rot (BER)', 'Anthracnose (early warning in humid spells)'],
      critical_actions: ['Maintain irrigation regularity', 'Begin anthracnose scouting in humid weather'],
      avoid_actions: ['Irregular irrigation (BER and cracking risk)'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: 'BER, fruit cracking, reduced first-picking yield',
    },
    'FIRST_PICKING': {
      water: 'Continue regular irrigation to sustain ongoing flowering/fruiting.',
      fertilizer: 'Maintenance N+K dose to support sustained yield through pickings.',
      pest_watch: ['Fruit borer', 'Thrips'],
      disease_watch: ['Anthracnose (risk rising)'],
      critical_actions: ['Begin 7-10 day picking interval', 'Continue fertilizer/irrigation for sustained yield'],
      avoid_actions: ['Stopping inputs once picking starts (reduces successive flush yield)'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: 'Reduced successive flush yield',
    },
    'SUCCESSIVE_HARVEST': {
      water: 'Continue regular irrigation — concurrent flowering and fruiting through this phase.',
      fertilizer: 'Periodic maintenance N+K between picking rounds.',
      pest_watch: ['Fruit borer', 'Thrips', 'Mites'],
      disease_watch: ['Anthracnose (peak risk in this phase)'],
      critical_actions: ['Anthracnose fungicide spray on first symptom/humid forecast', 'Remove and destroy infected fruit'],
      avoid_actions: ['Delaying anthracnose control once symptoms appear'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: '20-40% loss to anthracnose if uncontrolled',
    },
    'RED_RIPE_DRY': {
      water: 'Reduce/stop irrigation if drying for red chili; maintain light irrigation if continuing green picking.',
      fertilizer: 'No further fertilizer application.',
      pest_watch: ['Storage insect pests post-harvest'],
      disease_watch: ['Aflatoxin risk if drying is delayed or done on damp ground'],
      critical_actions: ['Sun-dry on raised platforms, not bare ground', 'Dry to safe moisture before storage'],
      avoid_actions: ['Drying directly on soil/damp ground (aflatoxin risk)', 'Storing before fully dried'],
      expected_ndvi_range: { min: 0.20, max: 0.40 },
      yield_impact_if_stressed: 'Aflatoxin contamination, storage loss',
    },
  },
};

const MAIZE_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'MAIZE',
  stages: {
    'EMERGENCE': {
      water: 'Light irrigation if soil is dry; avoid waterlogging at emergence.',
      fertilizer: 'Basal dose (full P + K + starter N) at sowing.',
      pest_watch: ['Cutworm', 'Termite', 'Fall armyworm (early scouting)'],
      disease_watch: ['Seed/seedling rot in waterlogged soil'],
      critical_actions: ['Ensure uniform emergence', 'Scout for fall armyworm from emergence onward'],
      avoid_actions: ['Waterlogging', 'Delayed fall armyworm scouting'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Poor stand establishment',
    },
    'EARLY_VEGETATIVE': {
      water: 'Irrigate every 8-10 days depending on soil moisture.',
      fertilizer: 'No additional fertilizer until knee-high top-dress.',
      pest_watch: ['Fall armyworm (whorl damage)', 'Stem borer'],
      disease_watch: ['Leaf blight (early)'],
      critical_actions: ['Fall armyworm control if whorl damage seen (ETL-based)', 'Gap filling'],
      avoid_actions: ['Ignoring early fall armyworm whorl damage'],
      expected_ndvi_range: { min: 0.25, max: 0.45 },
      yield_impact_if_stressed: 'Reduced plant vigor, delayed knee-high stage',
    },
    'KNEE_HIGH': {
      water: 'Irrigation important now; root system establishing.',
      fertilizer: 'CRITICAL first N top-dress + earthing-up at knee-high.',
      pest_watch: ['Stem borer', 'Fall armyworm'],
      disease_watch: ['Leaf blight'],
      critical_actions: ['First N top-dress is critical — missing reduces yield significantly', 'Earthing-up for root support'],
      avoid_actions: ['Skipping or delaying first N top-dress'],
      expected_ndvi_range: { min: 0.45, max: 0.65 },
      yield_impact_if_stressed: '20-30% yield reduction if N top-dress missed',
    },
    'TASSELING': {
      water: 'Heat-sensitive period — avoid water stress.',
      fertilizer: 'Second N top-dress at tasseling.',
      pest_watch: ['Fall armyworm (tassel/ear damage)', 'Stem borer'],
      disease_watch: ['Turcicum leaf blight', 'Rust'],
      critical_actions: ['Second N top-dress', 'Avoid stress during pollen shed'],
      avoid_actions: ['Heat/water stress during tasseling (pollen viability loss)'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: 'Poor pollination, reduced kernel set',
    },
    'SILKING': {
      water: 'MOST water-critical stage — no stress allowed.',
      fertilizer: 'No more N; ensure K availability for grain fill.',
      pest_watch: ['Fall armyworm (ear damage)', 'Pink borer'],
      disease_watch: ['Banded leaf and sheath blight'],
      critical_actions: ['Maintain irrigation at all costs', 'Ear damage scouting'],
      avoid_actions: ['ANY water stress during silking (direct kernel-number loss)'],
      expected_ndvi_range: { min: 0.60, max: 0.80 },
      yield_impact_if_stressed: '40-50% kernel loss if water-stressed at silking',
    },
    'GRAIN_FILLING': {
      water: 'Maintain irrigation through blister-milk-dough stages.',
      fertilizer: 'No application.',
      pest_watch: ['Fall armyworm (ear feeding)'],
      disease_watch: ['Ear rot (humid/wet conditions)'],
      critical_actions: ['Maintain irrigation for grain weight', 'Monitor ear rot in wet weather'],
      avoid_actions: ['Early irrigation withdrawal'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'Reduced grain weight',
    },
    'MATURITY': {
      water: 'Stop irrigation as black layer forms.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Ear rot if harvest delayed in wet weather'],
      critical_actions: ['Check for black layer formation', 'Plan harvest timing'],
      avoid_actions: ['Delayed harvest in wet conditions (ear rot, aflatoxin risk)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Field losses if harvest delayed',
    },
    'HARVEST': {
      water: 'No irrigation.',
      fertilizer: 'No application.',
      pest_watch: ['Storage insect pests'],
      disease_watch: ['Aflatoxin risk if dried/stored above safe moisture'],
      critical_actions: ['Dry to 13-14% moisture for safe storage', 'Avoid delayed harvest'],
      avoid_actions: ['Storing above safe moisture (aflatoxin risk)'],
      expected_ndvi_range: { min: 0.20, max: 0.40 },
      yield_impact_if_stressed: 'Aflatoxin contamination, storage loss',
    },
  },
};

const SOYBEAN_STAGE_ADVISOR: CropStageAdvisor = {
  crop_code: 'SOYBEAN',
  stages: {
    'EMERGENCE': {
      water: 'Light irrigation only if soil is dry; avoid waterlogging.',
      fertilizer: 'Basal P+K dose with Rhizobium/PSB seed inoculation at sowing.',
      pest_watch: ['Stem fly', 'Cutworm'],
      disease_watch: ['Seedling rot (waterlogged soil)'],
      critical_actions: ['Ensure Rhizobium inoculation was applied at sowing', 'Uniform emergence check'],
      avoid_actions: ['Waterlogging', 'Sowing without inoculation (poor nodulation)'],
      expected_ndvi_range: { min: 0.08, max: 0.18 },
      yield_impact_if_stressed: 'Poor stand, weak nodulation',
    },
    'EARLY_VEGETATIVE': {
      water: 'Irrigate if dry spell during this window.',
      fertilizer: 'No N top-dress needed if nodulation is active.',
      pest_watch: ['Stem fly', 'Cutworm', 'Early girdle beetle'],
      disease_watch: [],
      critical_actions: ['Pre/early post-emergence weed control', 'Check nodulation by 25-30 DAS'],
      avoid_actions: ['Delayed weed control (soybean is weak weed-competitor early)'],
      expected_ndvi_range: { min: 0.25, max: 0.45 },
      yield_impact_if_stressed: 'Weed competition losses, poor branching',
    },
    'LATE_VEGETATIVE': {
      water: 'Irrigate if dry; canopy closing reduces evaporative loss.',
      fertilizer: 'No N needed; watch for herbicide carryover symptoms.',
      pest_watch: ['Girdle beetle (peak appearance approaching)'],
      disease_watch: ['Atrazine carryover symptoms (if rotated from maize)'],
      critical_actions: ['Scout for girdle beetle on stems', 'Monitor canopy closure'],
      avoid_actions: ['Ignoring early girdle beetle stem damage'],
      expected_ndvi_range: { min: 0.40, max: 0.60 },
      yield_impact_if_stressed: 'Stem damage from girdle beetle reduces plant vigor',
    },
    'FLOWERING': {
      water: 'Pollination-sensitive; avoid heat/water stress.',
      fertilizer: 'No fertilizer; foliar micronutrient if deficiency seen.',
      pest_watch: ['Girdle beetle (peak)', 'Pod borer (early)'],
      disease_watch: [],
      critical_actions: ['Girdle beetle control if ETL crossed', 'Avoid stress during flowering'],
      avoid_actions: ['Water stress during flowering (flower drop)'],
      expected_ndvi_range: { min: 0.50, max: 0.70 },
      yield_impact_if_stressed: 'Flower drop, reduced pod set',
    },
    'POD_FORMATION': {
      water: 'Maintain steady moisture for pod development.',
      fertilizer: 'No application.',
      pest_watch: ['Pod borer', 'Stem fly (late infestation)'],
      disease_watch: ['Anthracnose', 'Rhizoctonia aerial blight (rising risk)'],
      critical_actions: ['Pod borer scouting and control (ETL-based)', 'Monitor for aerial blight in humid weather'],
      avoid_actions: ['Ignoring early aerial blight symptoms'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: 'Reduced pod number',
    },
    'SEED_FILL': {
      water: 'MOST water-critical stage — no stress allowed.',
      fertilizer: 'No application.',
      pest_watch: ['Pod borer (peak)'],
      disease_watch: ['Rust', 'Aerial blight (peak risk)'],
      critical_actions: ['Maintain irrigation at all costs', 'Pod borer + rust control if ETL crossed'],
      avoid_actions: ['ANY water stress during seed fill (direct seed-weight loss)'],
      expected_ndvi_range: { min: 0.55, max: 0.75 },
      yield_impact_if_stressed: '30-40% yield loss if water-stressed during seed fill',
    },
    'BEGIN_MATURITY': {
      water: 'Stop irrigation as pods begin changing color.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Pod/seed rot if wet weather persists near maturity'],
      critical_actions: ['Stop irrigation', 'Monitor foliar drying progress'],
      avoid_actions: ['Continued irrigation after this stage (delays harvest, quality loss)'],
      expected_ndvi_range: { min: 0.35, max: 0.55 },
      yield_impact_if_stressed: 'Delayed/uneven maturity',
    },
    'MATURITY': {
      water: 'No irrigation.',
      fertilizer: 'No application.',
      pest_watch: [],
      disease_watch: ['Pod shatter losses if harvest delayed'],
      critical_actions: ['Harvest within 5-10 days at 13-14% seed moisture', 'Avoid delay (shattering losses)'],
      avoid_actions: ['Delayed harvest after full maturity (shattering)'],
      expected_ndvi_range: { min: 0.20, max: 0.40 },
      yield_impact_if_stressed: 'Shattering losses if harvest delayed',
    },
    'HARVEST': {
      water: 'No irrigation.',
      fertilizer: 'No application.',
      pest_watch: ['Storage insect pests'],
      disease_watch: ['Storage mold if moisture above safe level'],
      critical_actions: ['Harvest at 13-14% moisture', 'Dry and clean before storage'],
      avoid_actions: ['Storing above safe moisture'],
      expected_ndvi_range: { min: 0.15, max: 0.35 },
      yield_impact_if_stressed: 'Storage losses',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP ADVISOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const CROP_ADVISORS: Record<string, CropStageAdvisor> = {
  'WHEAT': WHEAT_STAGE_ADVISOR,
  'RICE': RICE_STAGE_ADVISOR,
  'SUGARCANE': SUGARCANE_STAGE_ADVISOR,
  'COTTON': COTTON_STAGE_ADVISOR,
  'TOMATO': TOMATO_STAGE_ADVISOR,
  'POTATO': POTATO_STAGE_ADVISOR,
  'ONION': ONION_STAGE_ADVISOR,
  'BRINJAL': BRINJAL_STAGE_ADVISOR,
  'CHILLI': CHILLI_STAGE_ADVISOR,
  'MAIZE': MAIZE_STAGE_ADVISOR,
  'SOYBEAN': SOYBEAN_STAGE_ADVISOR,
};

// ═══════════════════════════════════════════════════════════════════════════
// STAGE ALIASES — maps `crop_stage_master.growth_stage` labels that have no
// directly-authored entry above onto the entry that already covers the same
// DAS window and agronomic content, per crop_stage_master's own
// `stage_description` text (e.g. sugarcane's "cane_formation" row is
// documented in the DB as "alias for GRAND_GROWTH"). Only mappings backed by
// an explicit DB-documented equivalence or an identical DAS window are
// included here — stages with no authored equivalent are left as genuine
// gaps (logged, not guessed).
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_ALIASES: Record<string, Record<string, string>> = {
  RICE: {
    NURSERY: 'SEEDLING', // DB: "Overlaps SEEDLING in DAS; nursery is a parent category for pre-transplant ops"
    HARVEST: 'MATURITY', // DB harvest (140-160) overlaps MATURITY (130-150); MATURITY text already covers harvest prep
  },
  WHEAT: {
    SOWING: 'GERMINATION', // DB sowing (0-7) is a subset of GERMINATION (0-10)
    CRI: 'TILLERING', // CRI irrigation guidance is authored inside the existing TILLERING entry
    CRI_STAGE: 'TILLERING', // duplicate row of CRI (same DAS window, case-alias) in crop_stage_master
    JOINTING: 'STEM_ELONGATION', // same DAS window (50-70), DB uses agronomic stage name, advisor uses growth-phase name
    HARVEST: 'MATURITY', // DB harvest (145-160) overlaps MATURITY (130-150) tail; MATURITY text covers harvest prep
  },
  COTTON: {
    BOLL_DEVELOPMENT: 'BOLL_FORMATION', // same DAS window (100-140), naming mismatch only
    MATURITY: 'BOLL_OPENING', // same DAS window (140-180); BOLL_OPENING text already covers this phase
    HARVEST: 'BOLL_OPENING',
  },
  SUGARCANE: {
    CANE_FORMATION: 'GRAND_GROWTH', // DB: "Cane elongation phase (alias for GRAND_GROWTH)"
    MATURATION: 'MATURITY', // DB: "Final maturation (alias for MATURITY)"
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get stage-specific advice for a crop
 */
export function getStageSpecificAdvice(
  cropCode: string,
  stage: string
): StageAdvice | null {
  const cropU = cropCode.toUpperCase();
  const advisor = CROP_ADVISORS[cropU];
  if (!advisor) {
    console.log(`[CROP_STAGE_ADVISOR] No advisor found for crop: ${cropCode}`);
    return null;
  }

  const stageU = stage.toUpperCase();
  const resolvedStage = advisor.stages[stageU] ? stageU : (STAGE_ALIASES[cropU]?.[stageU] ?? stageU);
  const stageAdvice = advisor.stages[resolvedStage];
  if (!stageAdvice) {
    console.log(`[CROP_STAGE_ADVISOR] No advice for stage: ${stage} in crop: ${cropCode}`);
    return null;
  }

  return stageAdvice;
}

/**
 * Get water-specific advice for current crop and stage
 */
export function getWaterAdvice(
  cropCode: string,
  stage: string,
  daysSinceSowing: number
): string {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return `Regular irrigation based on soil moisture and weather. Crop is ${daysSinceSowing} days old.`;
  }

  return advice.water;
}

/**
 * Get critical actions for current stage
 */
export function getCriticalActions(
  cropCode: string,
  stage: string
): string[] {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return ['Monitor crop regularly', 'Maintain irrigation schedule'];
  }

  return advice.critical_actions;
}

/**
 * Get pests to watch for at current stage
 */
export function getPestWatch(
  cropCode: string,
  stage: string
): string[] {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return [];
  }

  return advice.pest_watch;
}

/**
 * Check if an action should be avoided at current stage
 */
export function shouldAvoidAction(
  cropCode: string,
  stage: string,
  action: string
): { avoid: boolean; reason?: string } {
  const advice = getStageSpecificAdvice(cropCode, stage);
  if (!advice) {
    return { avoid: false };
  }

  const actionLower = action.toLowerCase();
  for (const avoidAction of advice.avoid_actions) {
    if (actionLower.includes(avoidAction.toLowerCase())) {
      return {
        avoid: true,
        reason: `${avoidAction} should be avoided during ${stage} stage`,
      };
    }
  }

  return { avoid: false };
}

/**
 * Get all available crop advisors
 */
export function getAvailableCropAdvisors(): string[] {
  return Object.keys(CROP_ADVISORS);
}

export const CROP_STAGE_ADVISOR_VERSION = '1.0.0';
