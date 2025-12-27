/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURE DECISION BRAIN - TYPE SYSTEM v2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive symbolic enums and interfaces for the deterministic decision engine.
 * This is the single source of truth for all type definitions.
 * 
 * CRITICAL: All logic operates on these symbols ONLY - NO raw values
 * 
 * Version: 2.0.0
 * Standards: ICAR, FAO, NASA, ESA, WHO, CIB&RC
 * 
 * PRIORITY HIERARCHY (P0-P6):
 * P0 - Emergency Override (Absolute) - Banned chemicals, Poisoning risk
 * P1 - Regulatory Compliance - MRL violations, Legal restrictions
 * P2 - Weather & Environmental Safety - Rain forecast, Temperature extremes
 * P3 - Crop Stage Requirements - Flowering restrictions, Pre-harvest
 * P4 - Economic Threshold - Unviable interventions
 * P5 - IPM Preference - Prefer biological over chemical
 * P6 - Optimization - Best timing, method selection
 */

// ═══════════════════════════════════════════════════════════════════════════
// SOIL STATE SYMBOLS - Pre-calculated from soil test data
// ═══════════════════════════════════════════════════════════════════════════

/** Nitrogen availability state based on ICAR soil testing standards */
export enum SoilNState {
  LOW_N = 'LOW_N',           // < 60% of crop requirement
  ADEQUATE_N = 'ADEQUATE_N', // 60-120% of crop requirement  
  HIGH_N = 'HIGH_N'          // > 120% of crop requirement
}

/** Phosphorus availability state based on ICAR soil testing standards */
export enum SoilPState {
  LOW_P = 'LOW_P',           // < 60% of crop requirement
  ADEQUATE_P = 'ADEQUATE_P', // 60-120% of crop requirement
  HIGH_P = 'HIGH_P'          // > 120% of crop requirement
}

/** Potassium availability state based on ICAR soil testing standards */
export enum SoilKState {
  LOW_K = 'LOW_K',           // < 60% of crop requirement
  ADEQUATE_K = 'ADEQUATE_K', // 60-120% of crop requirement
  HIGH_K = 'HIGH_K'          // > 120% of crop requirement
}

/** Soil pH state based on ICAR soil classification */
export enum SoilPHState {
  ACIDIC = 'ACIDIC',         // pH < 6.0
  NEUTRAL = 'NEUTRAL',       // pH 6.0 - 7.5
  ALKALINE = 'ALKALINE'      // pH > 7.5
}

/** Soil moisture state based on field capacity */
export enum SoilMoistureState {
  DRY = 'DRY',               // < 30% field capacity
  OPTIMAL = 'OPTIMAL',       // 30-80% field capacity
  WATERLOGGED = 'WATERLOGGED' // > 80% field capacity or standing water
}

/** Zinc availability state - critical for rice */
export enum SoilZincState {
  LOW_ZN = 'LOW_ZN',         // < 0.6 ppm
  ADEQUATE_ZN = 'ADEQUATE_ZN', // 0.6-2.0 ppm
  HIGH_ZN = 'HIGH_ZN'        // > 2.0 ppm
}

/** Organic carbon state */
export enum SoilOCState {
  LOW_OC = 'LOW_OC',         // < 0.5%
  MEDIUM_OC = 'MEDIUM_OC',   // 0.5-0.75%
  HIGH_OC = 'HIGH_OC'        // > 0.75%
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL TEXTURE - For fertilizer adjustments (STEP 2)
// ═══════════════════════════════════════════════════════════════════════════

/** Soil texture classification based on USDA/ICAR standards */
export enum SoilTexture {
  SANDY = 'SANDY',           // >85% sand, rapid drainage, low nutrient retention
  SANDY_LOAM = 'SANDY_LOAM', // 70-85% sand, good drainage
  LOAMY = 'LOAMY',           // Balanced texture, ideal for most crops
  CLAY_LOAM = 'CLAY_LOAM',   // 25-40% clay, moderate drainage
  CLAY = 'CLAY'              // >40% clay, slow drainage, high nutrient retention
}

// ═══════════════════════════════════════════════════════════════════════════
// NDVI STATE SYMBOLS - Based on NASA/ESA/ICAR standards
// ═══════════════════════════════════════════════════════════════════════════

/** NDVI health state based on scientific thresholds (ndviScience.ts) */
export enum NDVIState {
  EXCELLENT = 'EXCELLENT',           // ≥ 0.65 - Dense healthy vegetation
  HEALTHY = 'HEALTHY',               // ≥ 0.50 - Good vegetation cover
  MODERATE_STRESS = 'MODERATE_STRESS', // ≥ 0.35 - Early stress signs
  HIGH_STRESS = 'HIGH_STRESS',       // ≥ 0.20 - Significant stress
  CRITICAL = 'CRITICAL'              // < 0.20 - Bare soil/dead vegetation
}

/** NDVI trend direction based on daily change rate */
export enum NDVITrend {
  RISING = 'RISING',     // > +0.001/day - Improving
  STABLE = 'STABLE',     // -0.001 to +0.001 - Stable
  DECLINING = 'DECLINING' // < -0.001/day - Declining
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER STATE SYMBOLS - Based on IMD/FAO thresholds
// ═══════════════════════════════════════════════════════════════════════════

/** Current weather state affecting farming operations */
export enum WeatherState {
  CLEAR = 'CLEAR',                   // Normal conditions
  RAIN_EXPECTED = 'RAIN_EXPECTED',   // Rain forecast within 24-48 hours
  RAIN_ACTIVE = 'RAIN_ACTIVE',       // Currently raining
  DRY_SPELL = 'DRY_SPELL',           // No rain for 7+ days
  HEAT_STRESS = 'HEAT_STRESS',       // Max temp > 35°C (crops) or > 40°C (general)
  COLD_STRESS = 'COLD_STRESS',       // Min temp < 10°C (tropical crops)
  FROST_RISK = 'FROST_RISK',         // Min temp < 4°C
  HIGH_HUMIDITY = 'HIGH_HUMIDITY',   // RH > 85% - disease favorable
  STRONG_WIND = 'STRONG_WIND',       // Wind > 25 km/h - spray unfavorable
  HAILSTORM_RISK = 'HAILSTORM_RISK'  // Hail warning
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE SYMBOLS - Generic lifecycle stages
// ═══════════════════════════════════════════════════════════════════════════

/** Generic crop growth stages applicable to all crops */
export enum CropStage {
  PLANNING = 'PLANNING',             // Pre-sowing planning
  LAND_PREPARATION = 'LAND_PREPARATION', // Field preparation
  SOWING = 'SOWING',                 // Seed sowing / transplanting
  GERMINATION = 'GERMINATION',       // Emergence to establishment
  VEGETATIVE = 'VEGETATIVE',         // Active vegetative growth
  REPRODUCTIVE = 'REPRODUCTIVE',     // Flowering to grain/fruit formation
  MATURITY = 'MATURITY',             // Ripening to harvest ready
  HARVEST = 'HARVEST',               // Harvesting period
  POST_HARVEST = 'POST_HARVEST'      // Storage and residue management
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC SUB-STAGES (For critical irrigation/fertilizer timing)
// ═══════════════════════════════════════════════════════════════════════════

/** Wheat-specific critical growth stages (ICAR-IARI) */
export enum WheatSubStage {
  CROWN_ROOT = 'CROWN_ROOT',         // 21-25 DAS - Critical irrigation
  TILLERING = 'TILLERING',           // 40-45 DAS
  JOINTING = 'JOINTING',             // 60-65 DAS
  BOOT = 'BOOT',                     // 75-80 DAS
  HEADING = 'HEADING',               // 85-90 DAS
  MILKING = 'MILKING',               // 100-105 DAS
  DOUGH = 'DOUGH'                    // 110-115 DAS
}

/** Rice-specific critical growth stages (ICAR-CRRI) */
export enum RiceSubStage {
  TRANSPLANTING = 'TRANSPLANTING',   // 0 DAT
  RECOVERY = 'RECOVERY',             // 0-7 DAT
  ACTIVE_TILLERING = 'ACTIVE_TILLERING', // 15-40 DAT
  PANICLE_INITIATION = 'PANICLE_INITIATION', // 45-55 DAT - Critical N
  BOOTING = 'BOOTING',               // 60-70 DAT
  HEADING = 'HEADING',               // 75-85 DAT
  FLOWERING = 'FLOWERING',           // 85-95 DAT
  GRAIN_FILLING = 'GRAIN_FILLING'    // 95-115 DAT
}

/** Cotton-specific critical growth stages (ICAR-CICR) */
export enum CottonSubStage {
  SEEDLING = 'SEEDLING',             // 0-20 DAS
  SQUARING = 'SQUARING',             // 35-50 DAS - Square formation
  FLOWERING = 'FLOWERING',           // 50-75 DAS
  BOLL_DEVELOPMENT = 'BOLL_DEVELOPMENT', // 75-110 DAS - Critical K
  BOLL_OPENING = 'BOLL_OPENING',     // 110-140 DAS
  PICKING = 'PICKING'                // 120-180 DAS
}

/** Sugarcane-specific growth stages (ICAR-SBI) */
export enum SugarcaneSubStage {
  GERMINATION = 'GERMINATION',       // 0-35 DAP
  TILLERING = 'TILLERING',           // 35-100 DAP - Critical N
  GRAND_GROWTH = 'GRAND_GROWTH',     // 100-270 DAP - Maximum growth
  MATURITY = 'MATURITY',             // 270-360 DAP - Sucrose accumulation
  HARVEST = 'HARVEST'                // 300-365 DAP
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP GROUP SYMBOLS - For rule organization
// ═══════════════════════════════════════════════════════════════════════════

/** Crop group classification for rule organization */
export enum CropGroup {
  CEREALS = 'cereals',       // Wheat, Rice, Maize, Barley, Millets
  PULSES = 'pulses',         // Gram, Lentil, Moong, Urad, Arhar
  OILSEEDS = 'oilseeds',     // Soybean, Groundnut, Mustard, Sunflower
  FIBER = 'fiber',           // Cotton, Jute, Mesta
  SUGARCANE = 'sugarcane',   // Sugarcane
  VEGETABLES = 'vegetables', // Tomato, Onion, Potato, Brinjal, etc.
  FRUITS = 'fruits',         // Mango, Citrus, Banana, Grapes, etc.
  SPICES = 'spices',         // Turmeric, Ginger, Chilli, etc.
  FODDER = 'fodder'          // Berseem, Lucerne, Napier, etc.
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY HIERARCHY - P0-P6 System
// ═══════════════════════════════════════════════════════════════════════════

/** Priority level hierarchy - P0 is highest (emergency), P6 is lowest (optimization) */
export enum PriorityLevel {
  P0_EMERGENCY = 0,          // Emergency Override (Absolute) - Banned chemicals, Poisoning risk
  P1_REGULATORY = 1,         // Regulatory Compliance - MRL violations, Legal restrictions
  P2_WEATHER_SAFETY = 2,     // Weather & Environmental Safety - Rain forecast, Temperature extremes
  P3_CROP_STAGE = 3,         // Crop Stage Requirements - Flowering restrictions, Pre-harvest
  P4_ECONOMIC = 4,           // Economic Threshold - Unviable interventions
  P5_IPM = 5,                // IPM Preference - Prefer biological over chemical
  P6_OPTIMIZATION = 6        // Optimization - Best timing, method selection
}

/** Map P0-P6 to numeric priority (10 = highest urgency) */
export const PRIORITY_LEVEL_TO_NUMERIC: Record<PriorityLevel, number> = {
  [PriorityLevel.P0_EMERGENCY]: 10,
  [PriorityLevel.P1_REGULATORY]: 9,
  [PriorityLevel.P2_WEATHER_SAFETY]: 8,
  [PriorityLevel.P3_CROP_STAGE]: 7,
  [PriorityLevel.P4_ECONOMIC]: 6,
  [PriorityLevel.P5_IPM]: 5,
  [PriorityLevel.P6_OPTIMIZATION]: 4
};

// ═══════════════════════════════════════════════════════════════════════════
// PEST LIFE STAGE SYMBOLS - Critical for targeted control
// ═══════════════════════════════════════════════════════════════════════════

/** Pest life stage for targeted intervention */
export enum PestLifeStage {
  EGG = 'EGG',                       // Egg stage - parasitoid release effective
  EARLY_LARVA = 'EARLY_LARVA',       // L1-L2 - Bt spray or NPV effective
  LATE_LARVA = 'LATE_LARVA',         // L3+ - Bored into plant, control ineffective
  PUPA = 'PUPA',                     // Pupal stage
  ADULT = 'ADULT',                   // Adult stage - trapping/mating disruption
  UNKNOWN = 'UNKNOWN'                // Requires identification
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE SEVERITY INDEX - For threshold assessment
// ═══════════════════════════════════════════════════════════════════════════

/** Disease Severity Index (DSI) based on affected leaf area */
export enum DiseaseSeverityIndex {
  NONE = 'NONE',                     // 0 - No disease
  TRACE = 'TRACE',                   // 1-10% leaf area affected
  MILD = 'MILD',                     // 11-25% leaf area affected
  MODERATE = 'MODERATE',             // 26-50% leaf area affected
  SEVERE = 'SEVERE',                 // 51-75% leaf area affected
  CRITICAL = 'CRITICAL'              // >75% leaf area affected
}

// ═══════════════════════════════════════════════════════════════════════════
// WHO TOXICITY CLASSIFICATION - Chemical safety
// ═══════════════════════════════════════════════════════════════════════════

/** WHO Pesticide Hazard Classification */
export enum WHOToxicityClass {
  CLASS_IA = 'CLASS_IA',             // Extremely Hazardous - LD50 < 5 mg/kg - DO NOT RECOMMEND
  CLASS_IB = 'CLASS_IB',             // Highly Hazardous - LD50 5-50 mg/kg - Avoid
  CLASS_II = 'CLASS_II',             // Moderately Hazardous - LD50 50-500 mg/kg - Caution
  CLASS_III = 'CLASS_III',           // Slightly Hazardous - LD50 500-2000 mg/kg - Standard precautions
  CLASS_U = 'CLASS_U'                // Unlikely Hazardous - LD50 > 2000 mg/kg - Minimal risk
}

// ═══════════════════════════════════════════════════════════════════════════
// IPM LEVEL CLASSIFICATION - Intervention ladder
// ═══════════════════════════════════════════════════════════════════════════

/** IPM intervention level (0 = prevention, 6 = emergency broad spectrum) */
export enum IPMLevel {
  LEVEL_0_PREVENTION = 0,            // Crop rotation, resistant varieties, sanitation
  LEVEL_1_CULTURAL = 1,              // Hand picking, removal, water/nutrient management - ₹0-500/acre
  LEVEL_2_MECHANICAL = 2,            // Sticky traps, pheromone traps, light traps - ₹500-2000/acre
  LEVEL_3_BIOLOGICAL = 3,            // Predators, parasitoids, pathogens - ₹1000-3000/acre
  LEVEL_4_BOTANICAL = 4,             // Neem oil, pongamia, garlic extract - ₹800-2000/acre
  LEVEL_5_SELECTIVE_CHEMICAL = 5,    // Target-specific chemicals - ₹1500-3000/acre
  LEVEL_6_BROAD_SPECTRUM = 6         // Emergency only, expert approval mandatory
}

// ═══════════════════════════════════════════════════════════════════════════
// INSECTICIDE/FUNGICIDE GROUPS - Resistance management
// ═══════════════════════════════════════════════════════════════════════════

/** IRAC Insecticide Mode of Action Groups */
export enum InsecticideGroup {
  GROUP_1_CARBAMATES = 'GROUP_1_CARBAMATES',           // Carbaryl, Carbofuran
  GROUP_2_ORGANOPHOSPHATES = 'GROUP_2_ORGANOPHOSPHATES', // Chlorpyrifos, Malathion
  GROUP_3_PYRETHROIDS = 'GROUP_3_PYRETHROIDS',         // Cypermethrin, Deltamethrin
  GROUP_4_NEONICOTINOIDS = 'GROUP_4_NEONICOTINOIDS',   // Imidacloprid, Thiamethoxam
  GROUP_5_SPINOSYNS = 'GROUP_5_SPINOSYNS',             // Spinosad, Spinetoram
  GROUP_6_AVERMECTINS = 'GROUP_6_AVERMECTINS',         // Abamectin, Emamectin benzoate
  GROUP_11_BT = 'GROUP_11_BT',                         // Bacillus thuringiensis
  GROUP_BOTANICAL = 'GROUP_BOTANICAL',                 // Neem, botanicals
  GROUP_UNKNOWN = 'GROUP_UNKNOWN'
}

/** FRAC Fungicide Mode of Action Groups */
export enum FungicideGroup {
  GROUP_M_MULTISITE = 'GROUP_M_MULTISITE',             // Mancozeb, Chlorothalonil, Copper - VERY LOW resistance risk
  GROUP_3_DMI_TRIAZOLES = 'GROUP_3_DMI_TRIAZOLES',     // Propiconazole, Tebuconazole - MEDIUM resistance risk
  GROUP_7_SDHI = 'GROUP_7_SDHI',                       // Boscalid, Fluxapyroxad - MEDIUM-HIGH resistance risk
  GROUP_11_STROBILURINS = 'GROUP_11_STROBILURINS',     // Azoxystrobin, Pyraclostrobin - HIGH resistance risk
  GROUP_BIOLOGICAL = 'GROUP_BIOLOGICAL',               // Trichoderma, Pseudomonas
  GROUP_UNKNOWN = 'GROUP_UNKNOWN'
}

// ═══════════════════════════════════════════════════════════════════════════
// SEASONAL CLASSIFICATION - India crop seasons
// ═══════════════════════════════════════════════════════════════════════════

/** Indian crop seasons */
export enum Season {
  KHARIF = 'KHARIF',                 // June-October, monsoon dependent, high humidity
  RABI = 'RABI',                     // October-March, irrigation dependent, cool temperatures
  ZAID = 'ZAID'                      // March-June, hot and dry, summer crops
}

// ═══════════════════════════════════════════════════════════════════════════
// AGRO-CLIMATIC ZONES - India regional classification
// ═══════════════════════════════════════════════════════════════════════════

/** India Agro-Climatic Zones */
export enum AgroClimaticZone {
  ZONE_1_WESTERN_HIMALAYAS = 'ZONE_1_WESTERN_HIMALAYAS',     // Cold, high altitude
  ZONE_2_EASTERN_HIMALAYAS = 'ZONE_2_EASTERN_HIMALAYAS',     // High rainfall, hilly
  ZONE_3_LOWER_GANGETIC = 'ZONE_3_LOWER_GANGETIC',           // Rice-jute zone
  ZONE_4_MIDDLE_GANGETIC = 'ZONE_4_MIDDLE_GANGETIC',         // Rice-wheat zone
  ZONE_5_UPPER_GANGETIC = 'ZONE_5_UPPER_GANGETIC',           // Wheat zone
  ZONE_6_TRANS_GANGETIC = 'ZONE_6_TRANS_GANGETIC',           // Punjab-Haryana
  ZONE_7_EASTERN_PLATEAU = 'ZONE_7_EASTERN_PLATEAU',         // Red-laterite soils
  ZONE_8_CENTRAL_PLATEAU = 'ZONE_8_CENTRAL_PLATEAU',         // Semi-arid, black soils
  ZONE_9_WESTERN_PLATEAU = 'ZONE_9_WESTERN_PLATEAU',         // Cotton-soybean zone
  ZONE_10_SOUTHERN_PLATEAU = 'ZONE_10_SOUTHERN_PLATEAU',     // Deccan plateau
  ZONE_11_EAST_COAST = 'ZONE_11_EAST_COAST',                 // Rice-coastal
  ZONE_12_WEST_COAST = 'ZONE_12_WEST_COAST',                 // High rainfall, humid
  ZONE_13_GUJARAT_PLAINS = 'ZONE_13_GUJARAT_PLAINS',         // Cotton-groundnut
  ZONE_14_WESTERN_DRY = 'ZONE_14_WESTERN_DRY',               // Arid zone
  ZONE_15_ISLANDS = 'ZONE_15_ISLANDS'                        // Andaman & Nicobar, Lakshadweep
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMING MODE SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════

/** Farming mode determines allowed inputs */
export enum FarmingMode {
  ORGANIC_ONLY = 'organic_only',           // No synthetic inputs
  ORGANIC_FERTILIZER = 'organic_fertilizer', // Synthetic fertilizers OK, no pesticides
  CONVENTIONAL = 'fertilizer_pesticide'    // All inputs allowed
}

/** Irrigation source type */
export enum IrrigationSource {
  RAINFED = 'rainfed',       // Rainfall dependent
  BOREWELL = 'borewell',     // Groundwater
  CANAL = 'canal',           // Surface water
  POND = 'pond',             // Farm pond
  RIVER = 'river'            // River water
}

/** Irrigation method type */
export enum IrrigationMethod {
  FLOOD = 'flood',           // Surface flooding
  FURROW = 'furrow',         // Furrow irrigation
  DRIP = 'drip',             // Drip irrigation
  SPRINKLER = 'sprinkler',   // Sprinkler system
  RAINFED = 'rainfed'        // No irrigation
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE SYMBOLS - What the Decision Graph infers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cause symbols represent the inferred reasons for crop stress or optimal growth.
 * These are derived from symbolic facts through rule-based inference.
 * 
 * CRITICAL: AI must NEVER modify these causes - they are deterministic outputs
 */
export enum Cause {
  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT CAUSES (12)
  // ─────────────────────────────────────────────────────────────────────────
  NITROGEN_DEFICIENCY = 'NITROGEN_DEFICIENCY',
  NITROGEN_DEFICIENCY_CRITICAL = 'NITROGEN_DEFICIENCY_CRITICAL',
  PHOSPHORUS_DEFICIENCY = 'PHOSPHORUS_DEFICIENCY',
  PHOSPHORUS_DEFICIENCY_CRITICAL = 'PHOSPHORUS_DEFICIENCY_CRITICAL',
  POTASSIUM_DEFICIENCY = 'POTASSIUM_DEFICIENCY',
  POTASSIUM_DEFICIENCY_CRITICAL = 'POTASSIUM_DEFICIENCY_CRITICAL',
  ZINC_DEFICIENCY = 'ZINC_DEFICIENCY',
  SEVERE_NUTRIENT_DEPLETION = 'SEVERE_NUTRIENT_DEPLETION',
  NUTRIENT_LOCKOUT_ACIDIC = 'NUTRIENT_LOCKOUT_ACIDIC',
  NUTRIENT_LOCKOUT_ALKALINE = 'NUTRIENT_LOCKOUT_ALKALINE',
  EXCESS_NITROGEN_LODGING = 'EXCESS_NITROGEN_LODGING',
  EXCESS_NITROGEN_DISEASE = 'EXCESS_NITROGEN_DISEASE',
  EXCESS_NITROGEN = 'EXCESS_NITROGEN',
  MICRONUTRIENT_DEFICIENCY = 'MICRONUTRIENT_DEFICIENCY',

  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS CAUSES (10)
  // ─────────────────────────────────────────────────────────────────────────
  WATER_STRESS_MILD = 'WATER_STRESS_MILD',
  WATER_STRESS_MODERATE = 'WATER_STRESS_MODERATE',
  WATER_STRESS_CRITICAL = 'WATER_STRESS_CRITICAL',
  WATER_STRESS_WHEAT_CRI = 'WATER_STRESS_WHEAT_CRI',
  WATER_STRESS_RICE_TRANSPLANTING = 'WATER_STRESS_RICE_TRANSPLANTING',
  WATER_STRESS_COTTON_BOLL = 'WATER_STRESS_COTTON_BOLL',
  WATERLOGGING = 'WATERLOGGING',
  WATERLOGGING_SEVERE = 'WATERLOGGING_SEVERE',
  DROUGHT_STRESS = 'DROUGHT_STRESS',
  FLOOD_STRESS = 'FLOOD_STRESS',

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPERATURE STRESS CAUSES (8)
  // ─────────────────────────────────────────────────────────────────────────
  HEAT_STRESS = 'HEAT_STRESS',
  HEAT_STRESS_SEVERE = 'HEAT_STRESS_SEVERE',
  COLD_STRESS = 'COLD_STRESS',
  FROST_DAMAGE_RISK = 'FROST_DAMAGE_RISK',
  TERMINAL_HEAT_WHEAT = 'TERMINAL_HEAT_WHEAT',
  SPIKELET_STERILITY_RICE = 'SPIKELET_STERILITY_RICE',
  HEAT_STRESS_COTTON_SHEDDING = 'HEAT_STRESS_COTTON_SHEDDING',
  TEMPERATURE_FLUCTUATION = 'TEMPERATURE_FLUCTUATION',

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RISK CAUSES (20)
  // ─────────────────────────────────────────────────────────────────────────
  RICE_BLAST_RISK = 'RICE_BLAST_RISK',
  RICE_BACTERIAL_BLIGHT_RISK = 'RICE_BACTERIAL_BLIGHT_RISK',
  RICE_SHEATH_BLIGHT_RISK = 'RICE_SHEATH_BLIGHT_RISK',
  WHEAT_RUST_RISK = 'WHEAT_RUST_RISK',
  WHEAT_LOOSE_SMUT_RISK = 'WHEAT_LOOSE_SMUT_RISK',
  COTTON_BOLL_ROT_RISK = 'COTTON_BOLL_ROT_RISK',
  COTTON_WILT_RISK = 'COTTON_WILT_RISK',
  LATE_BLIGHT_RISK = 'LATE_BLIGHT_RISK',
  EARLY_BLIGHT_RISK = 'EARLY_BLIGHT_RISK',
  PURPLE_BLOTCH_RISK = 'PURPLE_BLOTCH_RISK',
  ROOT_ROT_RISK = 'ROOT_ROT_RISK',
  DAMPING_OFF_RISK = 'DAMPING_OFF_RISK',
  POWDERY_MILDEW_RISK = 'POWDERY_MILDEW_RISK',
  DOWNY_MILDEW_RISK = 'DOWNY_MILDEW_RISK',
  RED_ROT_SUGARCANE_RISK = 'RED_ROT_SUGARCANE_RISK',
  BACTERIAL_WILT_RISK = 'BACTERIAL_WILT_RISK',
  VIRAL_DISEASE_RISK = 'VIRAL_DISEASE_RISK',
  FUNGAL_DISEASE_RISK = 'FUNGAL_DISEASE_RISK',
  RUST_RISK = 'RUST_RISK',

  // ─────────────────────────────────────────────────────────────────────────
  // PEST RISK CAUSES (18)
  // ─────────────────────────────────────────────────────────────────────────
  BOLLWORM_RISK = 'BOLLWORM_RISK',
  APHID_RISK = 'APHID_RISK',
  STEM_BORER_RISK = 'STEM_BORER_RISK',
  WHITEFLY_RISK = 'WHITEFLY_RISK',
  THRIPS_RISK = 'THRIPS_RISK',
  JASSID_RISK = 'JASSID_RISK',
  MITE_RISK = 'MITE_RISK',
  SHOOT_BORER_RISK = 'SHOOT_BORER_RISK',
  FRUIT_BORER_RISK = 'FRUIT_BORER_RISK',
  POD_BORER_RISK = 'POD_BORER_RISK',
  CUTWORM_RISK = 'CUTWORM_RISK',
  TERMITE_RISK = 'TERMITE_RISK',
  MEALYBUG_RISK = 'MEALYBUG_RISK',
  FRUIT_FLY_RISK = 'FRUIT_FLY_RISK',
  ROOT_GRUB_RISK = 'ROOT_GRUB_RISK',
  PEST_GENERAL_RISK = 'PEST_GENERAL_RISK',

  // ─────────────────────────────────────────────────────────────────────────
  // WEED CAUSES (6)
  // ─────────────────────────────────────────────────────────────────────────
  WEED_EMERGENCE_WINDOW = 'WEED_EMERGENCE_WINDOW',
  WEED_COMPETITION_CRITICAL = 'WEED_COMPETITION_CRITICAL',
  HERBICIDE_WINDOW_CLOSING = 'HERBICIDE_WINDOW_CLOSING',
  WEED_SEED_SET_RISK = 'WEED_SEED_SET_RISK',
  PARASITIC_WEED_RISK = 'PARASITIC_WEED_RISK',
  RESISTANT_WEED_RISK = 'RESISTANT_WEED_RISK',

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTHY / POSITIVE CAUSES (6)
  // ─────────────────────────────────────────────────────────────────────────
  OPTIMAL_GROWTH = 'OPTIMAL_GROWTH',
  RECOVERY_TREND = 'RECOVERY_TREND',
  YIELD_POTENTIAL_HIGH = 'YIELD_POTENTIAL_HIGH',
  STRESS_RESOLVED = 'STRESS_RESOLVED',
  HARVEST_READY = 'HARVEST_READY',
  EXCELLENT_ESTABLISHMENT = 'EXCELLENT_ESTABLISHMENT',

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL / EMERGENCY CAUSES (P0 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  CROP_FAILURE_IMMINENT = 'CROP_FAILURE_IMMINENT',
  COMPOUND_STRESS = 'COMPOUND_STRESS',
  MULTIPLE_STRESSOR_EMERGENCY = 'MULTIPLE_STRESSOR_EMERGENCY',
  UNCERTAIN_CRITICAL = 'UNCERTAIN_CRITICAL',
  FORCED_MATURITY_RISK = 'FORCED_MATURITY_RISK',
  EPIDEMIC_RISK = 'EPIDEMIC_RISK',
  TOTAL_CROP_LOSS_RISK = 'TOTAL_CROP_LOSS_RISK',
  SALVAGE_HARVEST_NEEDED = 'SALVAGE_HARVEST_NEEDED',

  // ─────────────────────────────────────────────────────────────────────────
  // CHEMICAL SAFETY / REGULATORY CAUSES (P0-P1 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  BANNED_CHEMICAL_ATTEMPTED = 'BANNED_CHEMICAL_ATTEMPTED',         // P0 - Absolute block
  RESTRICTED_CHEMICAL_NO_LICENSE = 'RESTRICTED_CHEMICAL_NO_LICENSE', // P1 - Requires licensed applicator
  PHI_VIOLATION_RISK = 'PHI_VIOLATION_RISK',                       // P1 - Pre-harvest interval not met
  MRL_EXCEEDANCE_RISK = 'MRL_EXCEEDANCE_RISK',                     // P1 - Maximum residue limit violation
  APPLICATOR_SAFETY_RISK = 'APPLICATOR_SAFETY_RISK',               // P1 - PPE/safety concerns
  HIGH_TOXICITY_CHEMICAL = 'HIGH_TOXICITY_CHEMICAL',               // P1 - WHO Class IA/IB chemical
  POLLINATOR_PROTECTION_NEEDED = 'POLLINATOR_PROTECTION_NEEDED',   // P1 - Bee/pollinator protection

  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER SAFETY CAUSES (P2 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  RAIN_FORECAST_SPRAY_BLOCK = 'RAIN_FORECAST_SPRAY_BLOCK',         // Rain within 6h - contact pesticides
  HIGH_WIND_SPRAY_BLOCK = 'HIGH_WIND_SPRAY_BLOCK',                 // Wind > 15 km/h - spray drift risk
  HIGH_TEMP_SPRAY_BLOCK = 'HIGH_TEMP_SPRAY_BLOCK',                 // Temp > 35°C - evaporation/phytotoxicity
  SULFUR_TEMP_BLOCK = 'SULFUR_TEMP_BLOCK',                         // Temp > 32°C - sulfur phytotoxicity
  OIL_SPRAY_TEMP_BLOCK = 'OIL_SPRAY_TEMP_BLOCK',                   // Temp > 30°C - oil spray leaf burn
  LOW_TEMP_EFFICACY_REDUCED = 'LOW_TEMP_EFFICACY_REDUCED',         // Temp < 15°C - reduced pesticide efficacy
  HAILSTORM_DAMAGE = 'HAILSTORM_DAMAGE',                           // Physical injury requiring response

  // ─────────────────────────────────────────────────────────────────────────
  // ECONOMIC THRESHOLD CAUSES (P4 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  ECONOMIC_THRESHOLD_EXCEEDED = 'ECONOMIC_THRESHOLD_EXCEEDED',     // Pest/disease above ETL
  ECONOMIC_THRESHOLD_NOT_MET = 'ECONOMIC_THRESHOLD_NOT_MET',       // Below threshold - monitor only
  TREATMENT_NOT_ECONOMICAL = 'TREATMENT_NOT_ECONOMICAL',           // B/C ratio < 1
  TREATMENT_MARGINAL_BENEFIT = 'TREATMENT_MARGINAL_BENEFIT',       // B/C ratio 1-1.5
  FARMER_AFFORDABILITY_CONCERN = 'FARMER_AFFORDABILITY_CONCERN',   // Cost > 15% of crop value

  // ─────────────────────────────────────────────────────────────────────────
  // IPM / RESISTANCE MANAGEMENT CAUSES (P5 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  IPM_BIOLOGICAL_PREFERRED = 'IPM_BIOLOGICAL_PREFERRED',           // Biological control more appropriate
  IPM_CULTURAL_SUFFICIENT = 'IPM_CULTURAL_SUFFICIENT',             // Cultural control can handle
  RESISTANCE_RISK_HIGH = 'RESISTANCE_RISK_HIGH',                   // Same MOA used consecutively
  MOA_ROTATION_NEEDED = 'MOA_ROTATION_NEEDED',                     // Switch to different insecticide group
  FUNGICIDE_ROTATION_NEEDED = 'FUNGICIDE_ROTATION_NEEDED',         // Switch to different fungicide group
  BT_REFUGE_MISSING = 'BT_REFUGE_MISSING',                         // Bt cotton without refuge area

  // ─────────────────────────────────────────────────────────────────────────
  // CROP STAGE CAUSES (P3 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  FLOWERING_SPRAY_RESTRICTION = 'FLOWERING_SPRAY_RESTRICTION',     // Flowering stage - limited chemicals
  PRE_HARVEST_RESTRICTION = 'PRE_HARVEST_RESTRICTION',             // Close to harvest - PHI concerns
  SEEDLING_VULNERABILITY = 'SEEDLING_VULNERABILITY',               // Seedling stage protection needed
  CRITICAL_GROWTH_STAGE = 'CRITICAL_GROWTH_STAGE',                 // Critical nutrient/water stage

  // ─────────────────────────────────────────────────────────────────────────
  // HARVEST & QUALITY CAUSES (P3-P6 Priority)
  // ─────────────────────────────────────────────────────────────────────────
  MATURITY_INDICATORS_MET = 'MATURITY_INDICATORS_MET',             // Crop ready for harvest
  EARLY_HARVEST_RECOMMENDED = 'EARLY_HARVEST_RECOMMENDED',         // Weather/pest forces early harvest
  QUALITY_DEGRADATION_RISK = 'QUALITY_DEGRADATION_RISK',           // Post-maturity quality loss risk
  EXPORT_GRADE_REQUIREMENTS = 'EXPORT_GRADE_REQUIREMENTS',         // Stricter MRL/quality for export

  // ─────────────────────────────────────────────────────────────────────────
  // SOIL HEALTH CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  SOIL_PH_CORRECTION_NEEDED = 'SOIL_PH_CORRECTION_NEEDED',         // pH out of optimal range
  ORGANIC_MATTER_LOW = 'ORGANIC_MATTER_LOW',                       // Organic carbon < 1%
  SOIL_HEALTH_DEGRADATION = 'SOIL_HEALTH_DEGRADATION'              // Multiple soil health issues
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION SYMBOLS - What the farmer should do
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Action symbols represent recommended farmer actions.
 * These are mapped from inferred causes through deterministic rules.
 */
export enum Action {
  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  APPLY_NITROGEN = 'APPLY_NITROGEN',
  APPLY_PHOSPHORUS = 'APPLY_PHOSPHORUS',
  APPLY_POTASSIUM = 'APPLY_POTASSIUM',
  APPLY_ZINC = 'APPLY_ZINC',
  APPLY_GYPSUM = 'APPLY_GYPSUM',
  APPLY_LIME = 'APPLY_LIME',
  APPLY_MICRONUTRIENTS = 'APPLY_MICRONUTRIENTS',
  APPLY_ORGANIC_MANURE = 'APPLY_ORGANIC_MANURE',
  SKIP_NITROGEN = 'SKIP_NITROGEN',
  FOLIAR_SPRAY = 'FOLIAR_SPRAY',

  // ─────────────────────────────────────────────────────────────────────────
  // IRRIGATION ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  IRRIGATE_IMMEDIATELY = 'IRRIGATE_IMMEDIATELY',
  IRRIGATE_LIGHT = 'IRRIGATE_LIGHT',
  IRRIGATE_HEAVY = 'IRRIGATE_HEAVY',
  DELAY_IRRIGATION = 'DELAY_IRRIGATION',
  SKIP_IRRIGATION = 'SKIP_IRRIGATION',
  DRAIN_FIELD = 'DRAIN_FIELD',
  DRAIN_EXCESS_WATER = 'DRAIN_EXCESS_WATER',

  // ─────────────────────────────────────────────────────────────────────────
  // PLANT PROTECTION ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  APPLY_FUNGICIDE = 'APPLY_FUNGICIDE',
  APPLY_INSECTICIDE = 'APPLY_INSECTICIDE',
  APPLY_NEEM_OIL = 'APPLY_NEEM_OIL',
  APPLY_BIO_CONTROL = 'APPLY_BIO_CONTROL',
  APPLY_BT_SPRAY = 'APPLY_BT_SPRAY',
  APPLY_TRICHODERMA = 'APPLY_TRICHODERMA',
  DELAY_SPRAY = 'DELAY_SPRAY',
  INSTALL_TRAPS = 'INSTALL_TRAPS',
  INSTALL_PHEROMONE_TRAPS = 'INSTALL_PHEROMONE_TRAPS',
  RELEASE_BIOAGENT = 'RELEASE_BIOAGENT',

  // ─────────────────────────────────────────────────────────────────────────
  // WEED MANAGEMENT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  MECHANICAL_WEEDING = 'MECHANICAL_WEEDING',
  HAND_WEEDING = 'HAND_WEEDING',
  HERBICIDE_PRE_EMERGENCE = 'HERBICIDE_PRE_EMERGENCE',
  HERBICIDE_POST_EMERGENCE = 'HERBICIDE_POST_EMERGENCE',
  APPLY_MULCH = 'APPLY_MULCH',
  STALE_SEEDBED = 'STALE_SEEDBED',

  // ─────────────────────────────────────────────────────────────────────────
  // CLIMATE PROTECTION ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  SHADE_COVER = 'SHADE_COVER',
  FROST_PROTECTION = 'FROST_PROTECTION',
  WINDBREAK = 'WINDBREAK',
  LIGHT_IRRIGATION_COOLING = 'LIGHT_IRRIGATION_COOLING',
  DELAYED_SOWING = 'DELAYED_SOWING',
  EARLY_HARVEST = 'EARLY_HARVEST',

  // ─────────────────────────────────────────────────────────────────────────
  // MONITORING & ADVISORY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  MONITOR_CLOSELY = 'MONITOR_CLOSELY',
  WAIT_AND_WATCH = 'WAIT_AND_WATCH',
  CONSULT_EXPERT = 'CONSULT_EXPERT',
  SOIL_TEST = 'SOIL_TEST',
  TISSUE_TEST = 'TISSUE_TEST',
  CONTINUE_CURRENT = 'CONTINUE_CURRENT',
  SCOUT_FIELD = 'SCOUT_FIELD',

  // ─────────────────────────────────────────────────────────────────────────
  // EMERGENCY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  EMERGENCY_IRRIGATION = 'EMERGENCY_IRRIGATION',
  EMERGENCY_SPRAY = 'EMERGENCY_SPRAY',
  SALVAGE_HARVEST = 'SALVAGE_HARVEST',
  INSURANCE_CLAIM = 'INSURANCE_CLAIM',
  CROP_DESTRUCTION = 'CROP_DESTRUCTION',

  // ─────────────────────────────────────────────────────────────────────────
  // SAFETY & REGULATORY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  BLOCK_BANNED_CHEMICAL = 'BLOCK_BANNED_CHEMICAL',       // Absolute block on banned pesticides
  REQUIRE_PPE = 'REQUIRE_PPE',                           // Mandate personal protective equipment
  REQUIRE_LICENSED_APPLICATOR = 'REQUIRE_LICENSED_APPLICATOR', // Restricted chemical handling
  NOTIFY_BEEKEEPERS = 'NOTIFY_BEEKEEPERS',               // Pollinator protection notification
  EVENING_APPLICATION_ONLY = 'EVENING_APPLICATION_ONLY', // Apply after bees inactive

  // ─────────────────────────────────────────────────────────────────────────
  // IPM & RESISTANCE MANAGEMENT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  ROTATE_INSECTICIDE_MOA = 'ROTATE_INSECTICIDE_MOA',     // Switch to different insecticide group
  ROTATE_FUNGICIDE_MOA = 'ROTATE_FUNGICIDE_MOA',         // Switch to different fungicide group
  ESTABLISH_BT_REFUGE = 'ESTABLISH_BT_REFUGE',           // Create non-Bt refuge area
  RELEASE_TRICHOGRAMMA = 'RELEASE_TRICHOGRAMMA',         // Egg parasitoid release
  RELEASE_NPV = 'RELEASE_NPV',                           // Nuclear polyhedrosis virus
  RELEASE_LADYBIRD = 'RELEASE_LADYBIRD',                 // Ladybird beetle for aphids
  APPLY_BEAUVERIA = 'APPLY_BEAUVERIA',                   // Beauveria bassiana for beetles

  // ─────────────────────────────────────────────────────────────────────────
  // HARVEST & POST-HARVEST ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  HARVEST_IMMEDIATELY = 'HARVEST_IMMEDIATELY',           // Optimal maturity reached
  DELAY_HARVEST = 'DELAY_HARVEST',                       // Maturity not reached
  RAPID_COOLING = 'RAPID_COOLING',                       // Post-harvest cooling
  PROPER_DRYING = 'PROPER_DRYING',                       // Grain drying to safe moisture
  GRADING_FOR_EXPORT = 'GRADING_FOR_EXPORT',             // Export quality sorting

  // ─────────────────────────────────────────────────────────────────────────
  // SOIL HEALTH ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  APPLY_LIME_ACIDIC_SOIL = 'APPLY_LIME_ACIDIC_SOIL',     // pH correction for acidic soil
  APPLY_SULFUR_ALKALINE = 'APPLY_SULFUR_ALKALINE',       // pH correction for alkaline soil
  GREEN_MANURING = 'GREEN_MANURING',                     // Incorporate green manure crop
  ADD_VERMICOMPOST = 'ADD_VERMICOMPOST'                  // Add organic matter
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK LEVEL SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════

/** Risk level for overall advisory */
export enum RiskLevel {
  LOW = 'LOW',           // No immediate action needed
  MEDIUM = 'MEDIUM',     // Action recommended within 3-7 days
  HIGH = 'HIGH',         // Action recommended within 24-48 hours
  CRITICAL = 'CRITICAL'  // Immediate action required
}

/** Action urgency level */
export enum ActionUrgency {
  IMMEDIATE = 'immediate',       // Within hours
  WITHIN_24H = 'within_24h',     // Within 24 hours
  WITHIN_3DAYS = 'within_3days', // Within 3 days
  WITHIN_WEEK = 'within_week',   // Within 1 week
  FLEXIBLE = 'flexible'          // No time constraint
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CONTRACT - What the Decision Graph receives
// ═══════════════════════════════════════════════════════════════════════════

/** Soil state container */
export interface SoilStates {
  n: SoilNState;
  p: SoilPState;
  k: SoilKState;
  ph: SoilPHState;
  moisture: SoilMoistureState;
  zinc?: SoilZincState;
  organic_carbon?: SoilOCState;
  /** Soil texture - affects fertilizer efficiency (STEP 2) */
  texture?: SoilTexture;
}

/** Data confidence levels (0-1) */
export interface DataConfidence {
  soil: number;    // Soil test data confidence
  ndvi: number;    // NDVI data confidence
  weather: number; // Weather forecast confidence
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA TIMESTAMPS - For freshness validation (STEP 3)
// ═══════════════════════════════════════════════════════════════════════════

/** Timestamps for data freshness validation */
export interface DataTimestamps {
  ndvi_timestamp?: string;        // ISO date - NDVI data collection time
  soil_test_timestamp?: string;   // ISO date - Soil test date
  weather_timestamp?: string;     // ISO date - Weather data fetch time
}

/** Data freshness thresholds (hours) */
export const DATA_FRESHNESS_THRESHOLDS = {
  NDVI_MAX_AGE_HOURS: 72,         // 3 days
  SOIL_MAX_AGE_DAYS: 180,         // 6 months
  WEATHER_MAX_AGE_HOURS: 6        // 6 hours
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE LAYER CLASSIFICATION (STEP 1)
// ═══════════════════════════════════════════════════════════════════════════

/** Knowledge layer for rule classification */
export type KnowledgeLayer = 
  | 'ICAR_BASELINE'           // Legally defensible ICAR recommendations
  | 'GLOBAL_ENHANCEMENT'      // FAO/NASA/CGIAR enhancements (clearly labeled)
  | 'ADVANCED_OPTIMIZATION';  // Research-backed yield optimization

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC TIER CLASSIFICATION (STEP 8)
// ═══════════════════════════════════════════════════════════════════════════

/** Economic tier for cost-aware filtering */
export type EconomicTier = 
  | 'FREE'          // No cost (monitoring, timing advice)
  | 'LOW_COST'      // < ₹500/acre
  | 'MEDIUM_COST'   // ₹500-2000/acre
  | 'HIGH_COST';    // > ₹2000/acre

/** Farmer landholding class for economic filtering */
export type LandholdingClass = 
  | 'MARGINAL'      // < 1 hectare
  | 'SMALL'         // 1-2 hectares  
  | 'MEDIUM'        // 2-10 hectares
  | 'LARGE';        // > 10 hectares

/** Farmer behavior profile for priority adjustment */
export interface FarmerProfile {
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  cost_sensitivity: 'high' | 'medium' | 'low';
  /** Landholding class for economic filtering (STEP 8) */
  landholding_class?: LandholdingClass;
  /** Budget level for action filtering */
  budget_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Subsidy eligibility flag */
  subsidy_eligible?: boolean;
}

/**
 * DecisionInput - The complete input to the Decision Graph
 * 
 * CRITICAL: All values must be PRE-CALCULATED symbolic states
 * NO raw numeric values should be in this input
 */
export interface DecisionInput {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────
  farmer_id: string;
  land_id: string;
  tenant_id: string;

  // ─────────────────────────────────────────────────────────────────────────
  // CROP CONTEXT
  // ─────────────────────────────────────────────────────────────────────────
  crop_code: string;          // e.g., 'wheat', 'rice', 'cotton'
  crop_group: CropGroup;      // e.g., CropGroup.CEREALS
  crop_variety?: string;      // Optional variety/hybrid name
  crop_stage: CropStage;      // Current growth stage
  crop_sub_stage?: string;    // Crop-specific sub-stage if applicable
  sowing_date: string;        // ISO date string
  days_after_sowing: number;  // Pre-calculated DAS
  farming_mode: FarmingMode;  // Organic/conventional

  // ─────────────────────────────────────────────────────────────────────────
  // SYMBOLIC STATES (Pre-calculated - NO raw values)
  // ─────────────────────────────────────────────────────────────────────────
  soil_states: SoilStates;
  ndvi_state: NDVIState;
  ndvi_trend: NDVITrend;
  weather_state: WeatherState;
  weather_forecast_3day: WeatherState[]; // Next 3 days

  // ─────────────────────────────────────────────────────────────────────────
  // DATA CONFIDENCE & FRESHNESS (STEPS 3, 5)
  // ─────────────────────────────────────────────────────────────────────────
  data_confidence: DataConfidence;
  
  /** Data timestamps for freshness validation (STEP 3) */
  data_timestamps?: DataTimestamps;
  
  /** Weather forecast confidence 0-1 (STEP 5) */
  weather_forecast_confidence?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // REGIONAL CONTEXT (Optional)
  // ─────────────────────────────────────────────────────────────────────────
  agro_climatic_zone?: string;
  district_code?: string;
  state_code?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // IRRIGATION CONTEXT (Optional)
  // ─────────────────────────────────────────────────────────────────────────
  irrigation_source?: IrrigationSource;
  irrigation_method?: IrrigationMethod;
  water_available?: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // CROPPING SYSTEM (Optional)
  // ─────────────────────────────────────────────────────────────────────────
  previous_crop?: string;
  crop_rotation_year?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // FARMER PROFILE (Optional - affects priority only)
  // ─────────────────────────────────────────────────────────────────────────
  farmer_profile?: FarmerProfile;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT CONTRACT - What the Decision Graph produces
// ═══════════════════════════════════════════════════════════════════════════

/** Individual action with full metadata */
export interface PrioritizedAction {
  action: Action;
  priority: number;           // 1-10 (10 = highest urgency)
  reason: Cause;              // Why this action is needed
  rule_id: string;            // Which rule triggered this
  justification_key: string;  // i18n key for farmer-facing explanation
  scientific_source: string;  // ICAR/FAO/etc. reference
  urgency: ActionUrgency;     // When to act

  // Cost awareness (optional)
  estimated_cost_inr?: number;
  lower_cost_alternative?: Action;

  // Organic alternatives (optional)
  organic_alternative?: Action;
  organic_justification?: string;
}

/** AI augmentation record (for audit) */
export interface AIAdjustments {
  priority_changes: number;      // Total priority adjustments made
  confidence_delta: number;      // Confidence adjustment
  explanation_generated: boolean;
  model_used?: string;
  tokens_used?: number;
}

/**
 * UnifiedAdvisory - The single source of truth output
 * 
 * This is the ONLY object that the UI, AI Chat, and other systems should read.
 * It contains complete decision lineage for auditability.
 */
export interface UnifiedAdvisory {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────
  advisory_id: string;
  generated_at: string;        // ISO timestamp
  engine_version: string;      // Decision graph version

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT SNAPSHOT (For audit and explainability)
  // ─────────────────────────────────────────────────────────────────────────
  facts: {
    soil_states: SoilStates;
    ndvi_state: NDVIState;
    ndvi_trend: NDVITrend;
    weather_state: WeatherState;
    crop_stage: CropStage;
    crop_code: string;
    days_after_sowing: number;
    farming_mode: FarmingMode;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INFERRED CAUSES (Ordered by severity)
  // ─────────────────────────────────────────────────────────────────────────
  causes: Cause[];

  // ─────────────────────────────────────────────────────────────────────────
  // RESOLVED ACTIONS (Ordered by priority, conflicts resolved)
  // ─────────────────────────────────────────────────────────────────────────
  actions: PrioritizedAction[];

  // ─────────────────────────────────────────────────────────────────────────
  // RISK ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────
  risk_level: RiskLevel;
  confidence: number;          // 0-1 overall confidence

  // ─────────────────────────────────────────────────────────────────────────
  // EXPLAINABILITY
  // ─────────────────────────────────────────────────────────────────────────
  reasoning_trace: string[];   // Human-readable reasoning steps
  rules_applied: string[];     // All rule IDs that fired
  conflicts_resolved: string[]; // Conflicts that were resolved

  // ─────────────────────────────────────────────────────────────────────────
  // FARMER-FACING
  // ─────────────────────────────────────────────────────────────────────────
  summary_key: string;         // i18n key for voice/text summary
  action_count: number;        // Number of actions
  primary_concern?: Cause;     // Most important cause to address

  // ─────────────────────────────────────────────────────────────────────────
  // TRUST SIGNALS
  // ─────────────────────────────────────────────────────────────────────────
  scientific_sources: string[]; // All scientific sources cited

  // ─────────────────────────────────────────────────────────────────────────
  // FIELD FEEDBACK (Populated after farmer action)
  // ─────────────────────────────────────────────────────────────────────────
  feedback_status?: 'pending' | 'done' | 'partial' | 'skipped';
  feedback_at?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // AI AUGMENTATION (If applied - for audit)
  // ─────────────────────────────────────────────────────────────────────────
  ai_adjustments?: AIAdjustments;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE RULE INTERFACE - For crop-group rule files
// ═══════════════════════════════════════════════════════════════════════════

/** Rule category for organization */
export type RuleCategory = 
  | 'nutrient' 
  | 'water' 
  | 'temperature' 
  | 'disease' 
  | 'pest' 
  | 'weed' 
  | 'healthy' 
  | 'critical';

/**
 * CauseRule - Individual rule definition
 * 
 * Rules live in crop-group-rules/*.ts files
 * One file per crop GROUP, multiple crop-specific rules inside
 */
export interface CauseRule {
  rule_id: string;                    // Unique: 'C_CEREALS_WHEAT_WATER_004'
  category: RuleCategory;
  crop_code: string | `ALL_${string}`; // 'wheat' or 'ALL_CEREALS'
  stage_applicable: CropStage[];      // Which stages this rule applies

  /** 
   * Condition function - returns true if rule applies
   * MUST be pure, deterministic, no side effects
   */
  conditions: (input: DecisionInput) => boolean;

  cause: Cause;                       // Inferred cause
  priority: number;                   // Base priority 1-10

  scientific_source: string;          // 'ICAR-IARI', 'FAO', etc.
  scientific_basis: string;           // Explanation for audit
  icar_package?: string;              // Specific ICAR package reference

  // ─────────────────────────────────────────────────────────────────────────
  // RULE METADATA (STEP 1)
  // ─────────────────────────────────────────────────────────────────────────
  metadata?: {
    /** Rule version for tracking changes */
    version: string;
    /** Creation date ISO string */
    created_at: string;
    /** Rule author/source */
    author: string;
    /** Knowledge layer classification */
    knowledge_layer: KnowledgeLayer;
    /** Whether this rule is deprecated */
    deprecated?: boolean;
    /** Reason for deprecation */
    deprecation_reason?: string;
    /** ID of replacement rule if deprecated */
    replacement_rule_id?: string;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VARIETY FILTER (STEP 4)
  // ─────────────────────────────────────────────────────────────────────────
  /** Variety-specific rule filtering */
  variety_filter?: {
    /** Only apply to these varieties */
    include?: string[];
    /** Exclude these varieties (e.g., heat-tolerant varieties skip heat rules) */
    exclude?: string[];
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RULE CONFIDENCE (STEP 6)
  // ─────────────────────────────────────────────────────────────────────────
  /** How confident is this rule when it fires (0-1)? Defaults to 0.8 */
  cause_confidence?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // ECONOMIC METADATA (STEP 8)
  // ─────────────────────────────────────────────────────────────────────────
  /** Economic tier for cost-aware filtering */
  economic_tier?: EconomicTier;
  /** Estimated cost in INR per acre */
  estimated_cost_inr?: number;
}

/**
 * ActionMapping - Cause to Action mapping
 */
export interface ActionMapping {
  cause: Cause;
  action: Action;
  base_priority: number;
  urgency: ActionUrgency;
  justification_key: string;          // i18n key
  rule_id: string;                    // Reference
  scientific_source: string;

  // Alternatives
  organic_alternative?: Action;
  lower_cost_alternative?: Action;
}

/**
 * ConflictRule - Action conflict resolution
 */
export interface ConflictRule {
  rule_id: string;
  description: string;
  condition: (actions: PrioritizedAction[], input: DecisionInput) => boolean;
  resolution: (actions: PrioritizedAction[], input: DecisionInput) => PrioritizedAction[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Current engine version */
export const ENGINE_VERSION = '1.0.0';

/** NDVI thresholds (from ndviScience.ts) */
export const NDVI_THRESHOLDS = {
  EXCELLENT: 0.65,
  HEALTHY: 0.50,
  MODERATE: 0.35,
  POOR: 0.20
} as const;

/** NDVI trend thresholds (per day) */
export const NDVI_TREND_THRESHOLDS = {
  RISING: 0.001,
  DECLINING: -0.001
} as const;

/** Soil pH thresholds */
export const SOIL_PH_THRESHOLDS = {
  ACIDIC_MAX: 6.0,
  ALKALINE_MIN: 7.5
} as const;

/** Soil moisture thresholds (% field capacity) */
export const SOIL_MOISTURE_THRESHOLDS = {
  DRY_MAX: 30,
  WATERLOGGED_MIN: 80
} as const;

/** Temperature thresholds (°C) */
export const TEMPERATURE_THRESHOLDS = {
  HEAT_STRESS: 35,
  HEAT_STRESS_SEVERE: 40,
  COLD_STRESS: 10,
  FROST_RISK: 4
} as const;

/** Humidity thresholds (%) */
export const HUMIDITY_THRESHOLDS = {
  HIGH_HUMIDITY: 85,
  DISEASE_FAVORABLE: 90
} as const;
