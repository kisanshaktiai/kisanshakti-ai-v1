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
  OILSEEDS = 'oilseeds',     // Soybean, Groundnut, Mustard, Sunflower, Sesame, Safflower, Linseed
  FIBER = 'fiber',           // Cotton, Jute, Mesta
  SUGARCANE = 'sugarcane',   // Sugarcane
  VEGETABLES = 'vegetables', // Tomato, Onion, Potato, Brinjal, Cabbage, Cauliflower, Cucumber, Okra
  FRUITS = 'fruits',         // Mango, Citrus, Banana, Grapes, Pomegranate, Papaya, Guava, Apple
  SPICES = 'spices',         // Turmeric, Ginger, Chilli, Black Pepper, Cardamom, Cumin, Coriander
  FODDER = 'fodder',         // Berseem, Lucerne, Napier, Oat
  PLANTATION = 'plantation'  // Coconut, Coffee, Tea, Rubber, Arecanut, Cashew
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
  GROUP_28_DIAMIDES = 'GROUP_28_DIAMIDES',             // Chlorantraniliprole, Cyantraniliprole
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
  HIGH_TOXICITY_CHEMICAL_RISK = 'HIGH_TOXICITY_CHEMICAL_RISK',     // P1 - WHO Class IA/IB risk assessment
  POLLINATOR_PROTECTION_NEEDED = 'POLLINATOR_PROTECTION_NEEDED',   // P1 - Bee/pollinator protection
  POLLINATOR_RISK_FLOWERING = 'POLLINATOR_RISK_FLOWERING',         // P1 - Neonicotinoid during flowering
  PPE_REQUIRED_NOT_AVAILABLE = 'PPE_REQUIRED_NOT_AVAILABLE',       // P1 - PPE mandatory but not available
  POISONING_SYMPTOMS_DETECTED = 'POISONING_SYMPTOMS_DETECTED',     // P0 - Applicator poisoning symptoms
  CHEMICAL_INCOMPATIBILITY = 'CHEMICAL_INCOMPATIBILITY',           // P2 - Incompatible chemical mixing
  TEMPERATURE_PHYTOTOXICITY_RISK = 'TEMPERATURE_PHYTOTOXICITY_RISK', // P2 - High temp phytotoxicity
  BEE_ACTIVITY_HOURS_SPRAY = 'BEE_ACTIVITY_HOURS_SPRAY',           // P3 - Spraying during bee activity
  FUMIGANT_SAFETY_VIOLATION = 'FUMIGANT_SAFETY_VIOLATION',         // P0 - Fumigant safety protocol violated

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
  SOIL_HEALTH_DEGRADATION = 'SOIL_HEALTH_DEGRADATION',             // Multiple soil health issues

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE/PEST OUTBREAK CAUSES (P0-P4)
  // ─────────────────────────────────────────────────────────────────────────
  DISEASE_SEVERITY_THRESHOLD_EXCEEDED = 'DISEASE_SEVERITY_THRESHOLD_EXCEEDED', // Disease above action threshold
  PEST_OUTBREAK_DETECTED = 'PEST_OUTBREAK_DETECTED',               // Rapid pest population increase
  DISEASE_OUTBREAK_DETECTED = 'DISEASE_OUTBREAK_DETECTED',         // Disease epidemic conditions
  LOCUST_SWARM_EMERGENCY = 'LOCUST_SWARM_EMERGENCY',               // Locust invasion detected
  ARMYWORM_INVASION = 'ARMYWORM_INVASION',                         // Fall armyworm outbreak
  DROUGHT_EMERGENCY = 'DROUGHT_EMERGENCY',                         // Severe drought conditions
  FLOOD_EMERGENCY = 'FLOOD_EMERGENCY',                             // Flood damage conditions
  HAIL_DAMAGE_EMERGENCY = 'HAIL_DAMAGE_EMERGENCY',                 // Hail storm damage
  HAILSTORM_EMERGENCY = 'HAILSTORM_EMERGENCY',                     // Hailstorm event
  FROST_DAMAGE_EMERGENCY = 'FROST_DAMAGE_EMERGENCY',               // Frost damage to crop
  FROST_EMERGENCY = 'FROST_EMERGENCY',                             // Frost event
  HEAT_WAVE_EMERGENCY = 'HEAT_WAVE_EMERGENCY',                     // Extreme heat event
  CYCLONE_EMERGENCY = 'CYCLONE_EMERGENCY',                         // Cyclone/hurricane event
  EMERGENCY_CHEMICAL_AUTHORIZED = 'EMERGENCY_CHEMICAL_AUTHORIZED', // Emergency chemical use approved
  SALVAGE_HARVEST_RECOMMENDED = 'SALVAGE_HARVEST_RECOMMENDED',     // Salvage harvest recommended
  INSURANCE_CLAIM_ELIGIBLE = 'INSURANCE_CLAIM_ELIGIBLE',           // Eligible for crop insurance claim

  // ─────────────────────────────────────────────────────────────────────────
  // ECONOMIC CAUSES (P4-P6)
  // ─────────────────────────────────────────────────────────────────────────
  TREATMENT_UNAFFORDABLE = 'TREATMENT_UNAFFORDABLE',               // Cost > farmer affordability
  BELOW_ETL_MONITOR = 'BELOW_ETL_MONITOR',                         // Below threshold, monitor only
  CRITICAL_STAGE_THRESHOLD_ADJUSTED = 'CRITICAL_STAGE_THRESHOLD_ADJUSTED', // Threshold adjusted for stage
  WILT_ZERO_TOLERANCE = 'WILT_ZERO_TOLERANCE',                     // Wilt diseases require zero tolerance

  // ─────────────────────────────────────────────────────────────────────────
  // RESISTANCE MANAGEMENT CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  CONSECUTIVE_MOA_DETECTED = 'CONSECUTIVE_MOA_DETECTED',           // Same MOA used consecutively
  RESISTANCE_CONFIRMED = 'RESISTANCE_CONFIRMED',                   // Lab-confirmed resistance
  REGIONAL_RESISTANCE_ALERT = 'REGIONAL_RESISTANCE_ALERT',         // Regional resistance report

  // ─────────────────────────────────────────────────────────────────────────
  // PHI/HARVEST CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  PHI_SAFE = 'PHI_SAFE',                                           // Within safe PHI window
  PHI_UNSAFE = 'PHI_UNSAFE',                                       // PHI violation if applied
  EXPORT_MRL_STRICTER = 'EXPORT_MRL_STRICTER',                     // Export requires stricter MRL
  ORGANIC_CERTIFICATION_BLOCK = 'ORGANIC_CERTIFICATION_BLOCK',     // Would violate organic cert
  MOISTURE_HIGH_STORAGE_RISK = 'MOISTURE_HIGH_STORAGE_RISK',       // Grain moisture too high
  MATURITY_NOT_REACHED = 'MATURITY_NOT_REACHED',                   // Crop not mature yet
  OVER_MATURE_QUALITY_LOSS = 'OVER_MATURE_QUALITY_LOSS',           // Delayed harvest causing loss
  
  // ─────────────────────────────────────────────────────────────────────────
  // HARVEST QUALITY CAUSES (P3-P6)
  // ─────────────────────────────────────────────────────────────────────────
  CROP_APPROACHING_MATURITY = 'CROP_APPROACHING_MATURITY',         // Crop near maturity
  OPTIMAL_HARVEST_WINDOW = 'OPTIMAL_HARVEST_WINDOW',               // Optimal time to harvest
  EARLY_HARVEST_ADVISED_RAIN = 'EARLY_HARVEST_ADVISED_RAIN',       // Early harvest due to rain forecast
  DELAYED_HARVEST_QUALITY_LOSS = 'DELAYED_HARVEST_QUALITY_LOSS',   // Quality loss from delayed harvest
  GRAIN_MOISTURE_SUBOPTIMAL = 'GRAIN_MOISTURE_SUBOPTIMAL',         // Grain moisture not optimal
  SUBOPTIMAL_HARVEST_TIME = 'SUBOPTIMAL_HARVEST_TIME',             // Not optimal time of day for harvest
  EXPORT_QUALITY_NOT_MET = 'EXPORT_QUALITY_NOT_MET',               // Export quality standards not met
  POST_HARVEST_HANDLING_NEEDED = 'POST_HARVEST_HANDLING_NEEDED',   // Post-harvest handling required
  GRAIN_DRYING_REQUIRED = 'GRAIN_DRYING_REQUIRED',                 // Grain needs drying
  STORAGE_PEST_PREVENTION_NEEDED = 'STORAGE_PEST_PREVENTION_NEEDED', // Storage pest prevention needed
  SUGARCANE_BRIX_LOW = 'SUGARCANE_BRIX_LOW',                       // Sugarcane brix too low
  FRUIT_NOT_MATURE_SG_TEST = 'FRUIT_NOT_MATURE_SG_TEST',           // Fruit not mature per specific gravity test
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHI WITHDRAWAL CAUSES (P1)
  // ─────────────────────────────────────────────────────────────────────────
  EXPORT_PHI_VIOLATION_RISK = 'EXPORT_PHI_VIOLATION_RISK',         // Export PHI violation risk
  SHORTER_PHI_ALTERNATIVE_AVAILABLE = 'SHORTER_PHI_ALTERNATIVE_AVAILABLE', // Shorter PHI alternative exists
  ORGANIC_CERTIFICATION_VIOLATION = 'ORGANIC_CERTIFICATION_VIOLATION', // Organic certification violation
  CUMULATIVE_RESIDUE_RISK = 'CUMULATIVE_RESIDUE_RISK',             // Cumulative residue risk
  NON_CHEMICAL_ONLY_NEAR_HARVEST = 'NON_CHEMICAL_ONLY_NEAR_HARVEST', // Non-chemical only near harvest
  BIOPESTICIDE_RECOMMENDED_NEAR_HARVEST = 'BIOPESTICIDE_RECOMMENDED_NEAR_HARVEST', // Biopesticide recommended
  RESIDUE_TESTING_RECOMMENDED = 'RESIDUE_TESTING_RECOMMENDED',     // Residue testing recommended
  EU_MRL_STRICTER = 'EU_MRL_STRICTER',                             // EU MRL stricter than domestic

  // ─────────────────────────────────────────────────────────────────────────
  // EXTENDED PEST CAUSES - Crop-Specific (87+ new codes from ICAR audit)
  // ─────────────────────────────────────────────────────────────────────────
  // MAIZE PESTS
  ARMYWORM_RISK = 'ARMYWORM_RISK',                                 // Spodoptera frugiperda (Fall Armyworm)
  SHOOT_FLY_MAIZE = 'SHOOT_FLY_MAIZE',                             // Atherigona soccata
  PINK_STEM_BORER_MAIZE = 'PINK_STEM_BORER_MAIZE',                 // Sesamia inferens
  
  // RICE PESTS
  GALL_MIDGE_RICE = 'GALL_MIDGE_RICE',                             // Orseolia oryzae (silver shoots)
  LEAF_FOLDER_RICE = 'LEAF_FOLDER_RICE',                           // Cnaphalocrocis medinalis
  WHORL_MAGGOT_RICE = 'WHORL_MAGGOT_RICE',                         // Hydrellia philippina
  BPH_RICE = 'BPH_RICE',                                           // Brown Planthopper - Nilaparvata lugens
  YELLOW_STEM_BORER_RICE = 'YELLOW_STEM_BORER_RICE',               // Scirpophaga incertulas
  
  // WHEAT PESTS
  PINK_BORER_WHEAT = 'PINK_BORER_WHEAT',                           // Sesamia inferens
  
  // TOMATO PESTS
  TUTA_ABSOLUTA = 'TUTA_ABSOLUTA',                                 // South American Tomato Leaf Miner - CRITICAL
  LEAF_MINER_TOMATO = 'LEAF_MINER_TOMATO',                         // Liriomyza
  FRUIT_FLY_TOMATO = 'FRUIT_FLY_TOMATO',                           // Bactrocera dorsalis
  ROOT_KNOT_NEMATODE_TOMATO = 'ROOT_KNOT_NEMATODE_TOMATO',         // Meloidogyne incognita
  SPIDER_MITE_TOMATO = 'SPIDER_MITE_TOMATO',                       // Tetranychus urticae
  APHID_TOMATO = 'APHID_TOMATO',                                   // Aphis gossypii
  
  // POTATO PESTS
  TUBER_MOTH_POTATO = 'TUBER_MOTH_POTATO',                         // Phthorimaea operculella
  WHITE_GRUB_POTATO = 'WHITE_GRUB_POTATO',                         // Holotrichia consanguinea
  POTATO_BEETLE = 'POTATO_BEETLE',                                 // Leptinotarsa decemlineata
  WIREWORM_POTATO = 'WIREWORM_POTATO',                             // Agriotes spp
  
  // ONION PESTS
  ONION_MAGGOT_RISK = 'ONION_MAGGOT_RISK',                         // Delia antiqua
  ONION_MITE = 'ONION_MITE',                                       // Aceria tulipae
  
  // COTTON PESTS (Extended)
  STINK_BUG_COTTON = 'STINK_BUG_COTTON',                           // Oxycarenus hyalinipennis (Dusky bug)
  COTTON_APHID = 'COTTON_APHID',                                   // Aphis gossypii
  
  // SUGARCANE PESTS
  EARLY_SHOOT_BORER = 'EARLY_SHOOT_BORER',                         // Chilo infuscatellus
  TOP_BORER = 'TOP_BORER',                                         // Scirpophaga excerptalis
  INTERNODE_BORER = 'INTERNODE_BORER',                             // Chilo sacchariphagus
  WOOLLY_APHID = 'WOOLLY_APHID',                                   // Ceratovacuna lanigera
  SCALE_INSECT = 'SCALE_INSECT',                                   // Melanaspis glomerata
  PYRILLA = 'PYRILLA',                                             // Pyrilla perpusilla
  
  // ─────────────────────────────────────────────────────────────────────────
  // EXTENDED DISEASE CAUSES - Crop-Specific
  // ─────────────────────────────────────────────────────────────────────────
  // RICE DISEASES
  BACTERIAL_BLIGHT_RICE = 'BACTERIAL_BLIGHT_RICE',                 // Xanthomonas oryzae (kresek symptom)
  SHEATH_BLIGHT_RICE = 'SHEATH_BLIGHT_RICE',                       // Rhizoctonia solani
  SHEATH_ROT_RICE = 'SHEATH_ROT_RICE',                             // Sarocladium oryzae
  FALSE_SMUT_RICE = 'FALSE_SMUT_RICE',                             // Ustilaginoidea virens
  TUNGRO_RICE = 'TUNGRO_RICE',                                     // Rice Tungro Virus
  
  // WHEAT DISEASES
  LOOSE_SMUT_WHEAT = 'LOOSE_SMUT_WHEAT',                           // Ustilago tritici
  KARNAL_BUNT_WHEAT = 'KARNAL_BUNT_WHEAT',                         // Tilletia indica (quarantine)
  POWDERY_MILDEW_WHEAT = 'POWDERY_MILDEW_WHEAT',                   // Blumeria graminis
  HEAD_SCAB_WHEAT = 'HEAD_SCAB_WHEAT',                             // Fusarium graminearum
  
  // MAIZE DISEASES
  TURCICUM_BLIGHT_MAIZE = 'TURCICUM_BLIGHT_MAIZE',                 // Exserohilum turcicum (NCLB)
  DOWNY_MILDEW_MAIZE = 'DOWNY_MILDEW_MAIZE',                       // Peronosclerospora sorghi
  STALK_ROT_MAIZE = 'STALK_ROT_MAIZE',                             // Fusarium moniliforme
  MAYDIS_LEAF_BLIGHT = 'MAYDIS_LEAF_BLIGHT',                       // Bipolaris maydis
  
  // TOMATO DISEASES
  SEPTORIA_LEAF_SPOT_TOMATO = 'SEPTORIA_LEAF_SPOT_TOMATO',         // Septoria lycopersici
  BUCKEYE_ROT_TOMATO = 'BUCKEYE_ROT_TOMATO',                       // Phytophthora nicotianae
  TMV_TOMATO = 'TMV_TOMATO',                                       // Tobacco Mosaic Virus
  TOLCV_TOMATO = 'TOLCV_TOMATO',                                   // Tomato Leaf Curl Virus
  TSWV_TOMATO = 'TSWV_TOMATO',                                     // Tomato Spotted Wilt Virus
  FUSARIUM_WILT_TOMATO = 'FUSARIUM_WILT_TOMATO',                   // Fusarium oxysporum f.sp. lycopersici
  VERTICILLIUM_WILT_TOMATO = 'VERTICILLIUM_WILT_TOMATO',           // Verticillium dahliae
  ANTHRACNOSE_TOMATO = 'ANTHRACNOSE_TOMATO',                       // Colletotrichum
  GRAY_MOLD_TOMATO = 'GRAY_MOLD_TOMATO',                           // Botrytis cinerea
  BACTERIAL_CANKER_TOMATO = 'BACTERIAL_CANKER_TOMATO',             // Clavibacter michiganensis
  SOUTHERN_BLIGHT_TOMATO = 'SOUTHERN_BLIGHT_TOMATO',               // Sclerotium rolfsii
  TARGET_SPOT_TOMATO = 'TARGET_SPOT_TOMATO',                       // Corynespora cassiicola
  LATE_BLIGHT_PREVENTIVE = 'LATE_BLIGHT_PREVENTIVE',               // Pre-spray schedule
  LATE_BLIGHT_EMERGENCY = 'LATE_BLIGHT_EMERGENCY',                 // Emergency protocol
  
  // POTATO DISEASES
  BLACK_SCURF_POTATO = 'BLACK_SCURF_POTATO',                       // Rhizoctonia solani
  COMMON_SCAB_POTATO = 'COMMON_SCAB_POTATO',                       // Streptomyces scabies
  DRY_ROT_POTATO = 'DRY_ROT_POTATO',                               // Fusarium (storage)
  PINK_ROT_POTATO = 'PINK_ROT_POTATO',                             // Phytophthora erythroseptica
  BROWN_ROT_POTATO = 'BROWN_ROT_POTATO',                           // Ralstonia solanacearum (bacterial)
  BLACK_LEG_POTATO = 'BLACK_LEG_POTATO',                           // Pectobacterium
  
  // ONION DISEASES
  PURPLE_BLOTCH_SPRAY = 'PURPLE_BLOTCH_SPRAY',                     // Spray schedule
  BASAL_ROT_ONION = 'BASAL_ROT_ONION',                             // Fusarium oxysporum f.sp. cepae
  DOWNY_MILDEW_ONION = 'DOWNY_MILDEW_ONION',                       // Peronospora destructor
  WHITE_ROT_ONION = 'WHITE_ROT_ONION',                             // Sclerotium cepivorum
  PINK_ROOT_ONION = 'PINK_ROOT_ONION',                             // Phoma terrestris
  BLACK_MOLD_ONION = 'BLACK_MOLD_ONION',                           // Aspergillus niger (storage)
  BACTERIAL_SOFT_ROT_ONION = 'BACTERIAL_SOFT_ROT_ONION',           // Erwinia carotovora
  NECK_ROT_ONION = 'NECK_ROT_ONION',                               // Botrytis allii
  
  // COTTON DISEASES (Extended)
  GREY_MILDEW_COTTON = 'GREY_MILDEW_COTTON',                       // Ramularia areola
  FUSARIUM_WILT_COTTON = 'FUSARIUM_WILT_COTTON',                   // Fusarium oxysporum f.sp. vasinfectum
  VERTICILLIUM_WILT_COTTON = 'VERTICILLIUM_WILT_COTTON',           // Verticillium dahliae
  
  // SUGARCANE DISEASES
  RED_ROT_SUGARCANE = 'RED_ROT_SUGARCANE',                         // Colletotrichum falcatum
  SMUT_SUGARCANE = 'SMUT_SUGARCANE',                               // Ustilago scitaminea
  WILT_SUGARCANE = 'WILT_SUGARCANE',                               // Fusarium sacchari
  GSD_SUGARCANE = 'GSD_SUGARCANE',                                 // Grassy Shoot Disease (phytoplasma)
  RATOON_STUNTING = 'RATOON_STUNTING',                             // Leifsonia xyli
  LEAF_SCALD_SUGARCANE = 'LEAF_SCALD_SUGARCANE',                   // Xanthomonas albilineans
  
  // ─────────────────────────────────────────────────────────────────────────
  // EXTENDED NUTRIENT/PHYSIOLOGICAL CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  CALCIUM_DEFICIENCY_BER = 'CALCIUM_DEFICIENCY_BER',               // Blossom End Rot prevention
  MAGNESIUM_DEFICIENCY = 'MAGNESIUM_DEFICIENCY',                   // Interveinal chlorosis
  BORON_DEFICIENCY = 'BORON_DEFICIENCY',                           // Hollow stem, poor fruit set
  SULPHUR_DEFICIENCY = 'SULPHUR_DEFICIENCY',                       // Onion pungency
  IRON_DEFICIENCY = 'IRON_DEFICIENCY',                             // Lime-induced chlorosis
  MANGANESE_DEFICIENCY = 'MANGANESE_DEFICIENCY',                   // Gray speck in oats
  COPPER_DEFICIENCY = 'COPPER_DEFICIENCY',                         // Reclamation disease
  MOLYBDENUM_DEFICIENCY = 'MOLYBDENUM_DEFICIENCY',                 // Whiptail in cauliflower
  
  // ─────────────────────────────────────────────────────────────────────────
  // EXTENDED WATER MANAGEMENT CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  TUBER_INITIATION_CRITICAL = 'TUBER_INITIATION_CRITICAL',         // Potato 30-45 DAP
  TUBER_BULKING_WATER = 'TUBER_BULKING_WATER',                     // Potato 45-70 DAP
  PRE_HARVEST_IRRIGATION_STOP = 'PRE_HARVEST_IRRIGATION_STOP',     // Stop before harvest
  BULB_FORMATION_CRITICAL = 'BULB_FORMATION_CRITICAL',             // Onion bulb development
  FRUIT_DEVELOPMENT_CRITICAL = 'FRUIT_DEVELOPMENT_CRITICAL',       // Tomato 40-80 DAS
  
  // ─────────────────────────────────────────────────────────────────────────
  // RESISTANCE MANAGEMENT EXTENDED
  // ─────────────────────────────────────────────────────────────────────────
  WHITEFLY_RESISTANCE_MANAGEMENT = 'WHITEFLY_RESISTANCE_MANAGEMENT', // Neonicotinoid resistance
  THRIPS_RESISTANCE_MANAGEMENT = 'THRIPS_RESISTANCE_MANAGEMENT',   // Thrips resistance rotation
  LATE_BLIGHT_RESISTANCE_ROTATION = 'LATE_BLIGHT_RESISTANCE_ROTATION', // Fungicide rotation
  
  // ─────────────────────────────────────────────────────────────────────────
  // PGR (PLANT GROWTH REGULATOR) CAUSES - Advanced Technology
  // ─────────────────────────────────────────────────────────────────────────
  GIBBERELLIN_FOR_FRUIT_SET = 'GIBBERELLIN_FOR_FRUIT_SET',         // GA3 under cold stress
  GIBBERELLIN_FOR_ELONGATION = 'GIBBERELLIN_FOR_ELONGATION',       // Fruit sizing
  GIBBERELLIN_FOR_SEEDLESS = 'GIBBERELLIN_FOR_SEEDLESS',           // Parthenocarpy
  CYTOKININ_DELAYED_SENESCENCE = 'CYTOKININ_DELAYED_SENESCENCE',   // Extend productive period
  CYTOKININ_LATERAL_BRANCHING = 'CYTOKININ_LATERAL_BRANCHING',     // Promote branching
  AUXIN_ROOT_DEVELOPMENT = 'AUXIN_ROOT_DEVELOPMENT',               // Root growth
  AUXIN_FRUIT_RETENTION = 'AUXIN_FRUIT_RETENTION',                 // Prevent drop
  AUXIN_PARTHENOCARPY = 'AUXIN_PARTHENOCARPY',                     // Seedless fruit
  ETHEPHON_FLOWERING_SYNC = 'ETHEPHON_FLOWERING_SYNC',             // Synchronize flowering
  ETHEPHON_RIPENING = 'ETHEPHON_RIPENING',                         // Accelerate ripening
  ETHEPHON_BOLL_OPENING = 'ETHEPHON_BOLL_OPENING',                 // Cotton boll sync
  PACLOBUTRAZOL_COMPACT_GROWTH = 'PACLOBUTRAZOL_COMPACT_GROWTH',   // Anti-lodging
  PACLOBUTRAZOL_STRESS_TOLERANCE = 'PACLOBUTRAZOL_STRESS_TOLERANCE', // Stress adaptation
  MEPIQUAT_CHLORIDE_COTTON = 'MEPIQUAT_CHLORIDE_COTTON',           // Cotton growth regulation
  CCC_LODGING_CONTROL = 'CCC_LODGING_CONTROL',                     // Chlormequat wheat
  TRINEXAPAC_LODGING = 'TRINEXAPAC_LODGING',                       // Moddus wheat
  BRASSINOSTEROID_STRESS = 'BRASSINOSTEROID_STRESS',               // Stress recovery
  TRIACONTANOL_PHOTOSYNTHESIS = 'TRIACONTANOL_PHOTOSYNTHESIS',     // Enhanced photosynthesis
  
  // ─────────────────────────────────────────────────────────────────────────
  // PRECISION FERTIGATION CAUSES - Israel/Netherlands Technology
  // ─────────────────────────────────────────────────────────────────────────
  EC_TOO_LOW = 'EC_TOO_LOW',                                       // Increase nutrients
  EC_TOO_HIGH = 'EC_TOO_HIGH',                                     // Flush system
  PH_ACIDIC_CORRECTION = 'PH_ACIDIC_CORRECTION',                   // Add potassium hydroxide
  PH_ALKALINE_CORRECTION = 'PH_ALKALINE_CORRECTION',               // Add phosphoric acid
  VEGETATIVE_FERTIGATION_FORMULA = 'VEGETATIVE_FERTIGATION_FORMULA', // High N formula
  REPRODUCTIVE_FERTIGATION_FORMULA = 'REPRODUCTIVE_FERTIGATION_FORMULA', // High K formula
  VPD_HIGH_IRRIGATION = 'VPD_HIGH_IRRIGATION',                     // Vapor pressure deficit high
  VPD_LOW_IRRIGATION = 'VPD_LOW_IRRIGATION',                       // VPD low
  
  // ─────────────────────────────────────────────────────────────────────────
  // MICROBIOME/BIOLOGICAL CAUSES - Cutting Edge Technology
  // ─────────────────────────────────────────────────────────────────────────
  AZOSPIRILLUM_N_FIXATION = 'AZOSPIRILLUM_N_FIXATION',             // N fixing bacteria
  AZOTOBACTER_N_FIXATION = 'AZOTOBACTER_N_FIXATION',               // Free-living N fixer
  PSB_P_SOLUBILIZATION = 'PSB_P_SOLUBILIZATION',                   // Phosphate solubilizing bacteria
  KSB_K_MOBILIZATION = 'KSB_K_MOBILIZATION',                       // Potassium solubilizing bacteria
  TRICHODERMA_BIOCONTROL = 'TRICHODERMA_BIOCONTROL',               // Fungal biocontrol
  PSEUDOMONAS_BIOCONTROL = 'PSEUDOMONAS_BIOCONTROL',               // Bacterial biocontrol
  VAM_NUTRIENT_UPTAKE = 'VAM_NUTRIENT_UPTAKE',                     // Vesicular arbuscular mycorrhiza
  HUMIC_ACID_APPLICATION = 'HUMIC_ACID_APPLICATION',               // Soil health
  SEAWEED_EXTRACT_BIOSTIMULANT = 'SEAWEED_EXTRACT_BIOSTIMULANT',   // Biostimulant
  SILICON_APPLICATION = 'SILICON_APPLICATION',                      // Stress tolerance (Japan/Korea tech)
  
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RISK CASCADE CAUSES (Pest-Disease Interaction)
  // ─────────────────────────────────────────────────────────────────────────
  SECONDARY_INFECTION_RISK = 'SECONDARY_INFECTION_RISK',           // Secondary pathogen entry via pest wounds
  WOUND_ENTRY_DISEASE = 'WOUND_ENTRY_DISEASE',                     // Disease entry through mechanical/pest wounds
  PEST_DISEASE_CASCADE = 'PEST_DISEASE_CASCADE',                   // Pest attack leading to disease outbreak
  FUNGAL_SECONDARY_INFECTION = 'FUNGAL_SECONDARY_INFECTION',       // Fungal pathogens on pest damage
  BACTERIAL_SECONDARY_INFECTION = 'BACTERIAL_SECONDARY_INFECTION', // Bacterial infection via pest wounds
  
  // ─────────────────────────────────────────────────────────────────────────
  // BAJRA (PEARL MILLET) SPECIFIC CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  BAJRA_DOWNY_MILDEW_RISK = 'BAJRA_DOWNY_MILDEW_RISK',             // Sclerospora graminicola - most destructive
  BAJRA_SHOOT_FLY_RISK = 'BAJRA_SHOOT_FLY_RISK',                   // Atherigona approximata - dead heart
  BAJRA_STEM_BORER_RISK = 'BAJRA_STEM_BORER_RISK',                 // Coniesta ignefusalis
  
  // ─────────────────────────────────────────────────────────────────────────
  // JOWAR (SORGHUM) SPECIFIC CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  JOWAR_SHOOT_FLY_RISK = 'JOWAR_SHOOT_FLY_RISK',                   // Atherigona soccata - THE most destructive
  JOWAR_STEM_BORER_RISK = 'JOWAR_STEM_BORER_RISK',                 // Chilo partellus
  JOWAR_CHARCOAL_ROT_RISK = 'JOWAR_CHARCOAL_ROT_RISK',             // Macrophomina phaseolina
  
  // ─────────────────────────────────────────────────────────────────────────
  // RAGI (FINGER MILLET) SPECIFIC CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  RAGI_BLAST_RISK = 'RAGI_BLAST_RISK',                             // Pyricularia grisea - most serious
  RAGI_FINGER_BLAST_RISK = 'RAGI_FINGER_BLAST_RISK',               // Finger blast at grain filling
  
  // ─────────────────────────────────────────────────────────────────────────
  // MICRONUTRIENT SPECIFIC CAUSES (Critical only - basic ones already exist above)
  // ─────────────────────────────────────────────────────────────────────────
  IRON_CHLOROSIS_CRITICAL = 'IRON_CHLOROSIS_CRITICAL',             // Severe Fe chlorosis in alkaline soil
  BORON_DEFICIENCY_CRITICAL = 'BORON_DEFICIENCY_CRITICAL',         // Critical B deficiency - flower drop
  SULPHUR_DEFICIENCY_CRITICAL = 'SULPHUR_DEFICIENCY_CRITICAL',     // Critical S deficiency - oilseeds
  CALCIUM_DEFICIENCY = 'CALCIUM_DEFICIENCY',                       // Ca deficiency - blossom end rot
  
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL PERIOD WATER STRESS (CPWS) - CROP SPECIFIC
  // ─────────────────────────────────────────────────────────────────────────
  CPWS_RICE_PANICLE_INITIATION = 'CPWS_RICE_PANICLE_INITIATION',   // Rice PI stage - most critical
  CPWS_WHEAT_FLOWERING = 'CPWS_WHEAT_FLOWERING',                   // Wheat flowering - critical 5 days
  CPWS_MAIZE_TASSELING_SILKING = 'CPWS_MAIZE_TASSELING_SILKING',   // Maize ASI critical
  CPWS_COTTON_FLOWERING_BOLL = 'CPWS_COTTON_FLOWERING_BOLL',       // Cotton squaring-boll 30-day window
  CPWS_SOYBEAN_FLOWERING = 'CPWS_SOYBEAN_FLOWERING',               // Soybean flowering-pod critical
  CPWS_GROUNDNUT_PEGGING = 'CPWS_GROUNDNUT_PEGGING',               // Groundnut pegging - unique critical
  CPWS_GRAM_POD_DEVELOPMENT = 'CPWS_GRAM_POD_DEVELOPMENT',         // Gram pod development critical
  CPWS_SUGARCANE_FORMATIVE = 'CPWS_SUGARCANE_FORMATIVE',           // Sugarcane formative phase
  CPWS_TOMATO_FLOWERING = 'CPWS_TOMATO_FLOWERING',                 // Tomato flowering-fruit set
  CPWS_ONION_BULB_INITIATION = 'CPWS_ONION_BULB_INITIATION',       // Onion bulb initiation

  // ─────────────────────────────────────────────────────────────────────────
  // CROP-SPECIFIC IPM LADDER CAUSES - 15 Major Pest-Crop Combinations
  // ─────────────────────────────────────────────────────────────────────────
  // TOMATO FRUIT BORER (Helicoverpa armigera) IPM Ladder
  IPM_TOMATO_FRUIT_BORER_L1 = 'IPM_TOMATO_FRUIT_BORER_L1',         // Cultural control (0-10%)
  IPM_TOMATO_FRUIT_BORER_L2 = 'IPM_TOMATO_FRUIT_BORER_L2',         // Mechanical control (10-15%)
  IPM_TOMATO_FRUIT_BORER_L3 = 'IPM_TOMATO_FRUIT_BORER_L3',         // Biological control (15-20%)
  IPM_TOMATO_FRUIT_BORER_L4 = 'IPM_TOMATO_FRUIT_BORER_L4',         // Botanical control (20-30%)
  IPM_TOMATO_FRUIT_BORER_L5 = 'IPM_TOMATO_FRUIT_BORER_L5',         // Selective chemical (30-40%)
  IPM_TOMATO_FRUIT_BORER_L6 = 'IPM_TOMATO_FRUIT_BORER_L6',         // Emergency broad spectrum (>40%)

  // COTTON BOLLWORM (Helicoverpa armigera) IPM Ladder
  IPM_COTTON_BOLLWORM_L1 = 'IPM_COTTON_BOLLWORM_L1',               // Cultural control (<1 larva/10 plants)
  IPM_COTTON_BOLLWORM_L2 = 'IPM_COTTON_BOLLWORM_L2',               // Mechanical control (1-2 larvae)
  IPM_COTTON_BOLLWORM_L3 = 'IPM_COTTON_BOLLWORM_L3',               // Biological control (2-4 larvae)
  IPM_COTTON_BOLLWORM_L4 = 'IPM_COTTON_BOLLWORM_L4',               // Botanical control (4-6 larvae)
  IPM_COTTON_BOLLWORM_L5 = 'IPM_COTTON_BOLLWORM_L5',               // Selective chemical (6-10 larvae)
  IPM_COTTON_BOLLWORM_L6 = 'IPM_COTTON_BOLLWORM_L6',               // Emergency broad spectrum (>10 larvae)

  // COTTON WHITEFLY (Bemisia tabaci) IPM Ladder
  IPM_COTTON_WHITEFLY_L1 = 'IPM_COTTON_WHITEFLY_L1',               // Cultural control (<3 adults/leaf)
  IPM_COTTON_WHITEFLY_L2 = 'IPM_COTTON_WHITEFLY_L2',               // Mechanical control (3-5 adults)
  IPM_COTTON_WHITEFLY_L3 = 'IPM_COTTON_WHITEFLY_L3',               // Biological control (5-8 adults)
  IPM_COTTON_WHITEFLY_L4 = 'IPM_COTTON_WHITEFLY_L4',               // Botanical control (8-12 adults)
  IPM_COTTON_WHITEFLY_L5 = 'IPM_COTTON_WHITEFLY_L5',               // Selective chemical (>12 adults)

  // RICE STEM BORER (Scirpophaga incertulas) IPM Ladder
  IPM_RICE_STEM_BORER_L1 = 'IPM_RICE_STEM_BORER_L1',               // Cultural control (<2% dead hearts)
  IPM_RICE_STEM_BORER_L2 = 'IPM_RICE_STEM_BORER_L2',               // Mechanical control (2-5%)
  IPM_RICE_STEM_BORER_L3 = 'IPM_RICE_STEM_BORER_L3',               // Biological control (5-10%)
  IPM_RICE_STEM_BORER_L4 = 'IPM_RICE_STEM_BORER_L4',               // Botanical control (10-15%)
  IPM_RICE_STEM_BORER_L5 = 'IPM_RICE_STEM_BORER_L5',               // Selective chemical (>15%)

  // WHEAT APHID (Sitobion avenae) IPM Ladder
  IPM_WHEAT_APHID_L1 = 'IPM_WHEAT_APHID_L1',                       // Cultural control (<5 aphids/ear)
  IPM_WHEAT_APHID_L2 = 'IPM_WHEAT_APHID_L2',                       // Mechanical control (5-10 aphids)
  IPM_WHEAT_APHID_L3 = 'IPM_WHEAT_APHID_L3',                       // Biological control (10-20 aphids)
  IPM_WHEAT_APHID_L4 = 'IPM_WHEAT_APHID_L4',                       // Botanical control (20-30 aphids)
  IPM_WHEAT_APHID_L5 = 'IPM_WHEAT_APHID_L5',                       // Selective chemical (>30 aphids)

  // BRINJAL SHOOT & FRUIT BORER (Leucinodes orbonalis) IPM Ladder
  IPM_BRINJAL_SHOOT_FRUIT_BORER_L1 = 'IPM_BRINJAL_SHOOT_FRUIT_BORER_L1', // Cultural control (<5% damage)
  IPM_BRINJAL_SHOOT_FRUIT_BORER_L2 = 'IPM_BRINJAL_SHOOT_FRUIT_BORER_L2', // Mechanical control (5-10%)
  IPM_BRINJAL_SHOOT_FRUIT_BORER_L3 = 'IPM_BRINJAL_SHOOT_FRUIT_BORER_L3', // Biological control (10-20%)
  IPM_BRINJAL_SHOOT_FRUIT_BORER_L4 = 'IPM_BRINJAL_SHOOT_FRUIT_BORER_L4', // Botanical control (20-30%)
  IPM_BRINJAL_SHOOT_FRUIT_BORER_L5 = 'IPM_BRINJAL_SHOOT_FRUIT_BORER_L5', // Selective chemical (>30%)

  // CABBAGE DIAMONDBACK MOTH (Plutella xylostella) IPM Ladder
  IPM_CABBAGE_DIAMONDBACK_MOTH_L1 = 'IPM_CABBAGE_DIAMONDBACK_MOTH_L1', // Cultural control (<2 larvae/plant)
  IPM_CABBAGE_DIAMONDBACK_MOTH_L2 = 'IPM_CABBAGE_DIAMONDBACK_MOTH_L2', // Mechanical control (2-5 larvae)
  IPM_CABBAGE_DIAMONDBACK_MOTH_L3 = 'IPM_CABBAGE_DIAMONDBACK_MOTH_L3', // Biological control (5-10 larvae)
  IPM_CABBAGE_DIAMONDBACK_MOTH_L4 = 'IPM_CABBAGE_DIAMONDBACK_MOTH_L4', // Botanical control (10-15 larvae)
  IPM_CABBAGE_DIAMONDBACK_MOTH_L5 = 'IPM_CABBAGE_DIAMONDBACK_MOTH_L5', // Selective chemical (>15 larvae)

  // OKRA SHOOT & FRUIT BORER (Earias vittella/insulana) IPM Ladder
  IPM_OKRA_SHOOT_FRUIT_BORER_L1 = 'IPM_OKRA_SHOOT_FRUIT_BORER_L1', // Cultural control (<5% damage)
  IPM_OKRA_SHOOT_FRUIT_BORER_L2 = 'IPM_OKRA_SHOOT_FRUIT_BORER_L2', // Mechanical control (5-10%)
  IPM_OKRA_SHOOT_FRUIT_BORER_L3 = 'IPM_OKRA_SHOOT_FRUIT_BORER_L3', // Botanical control (10-20%)
  IPM_OKRA_SHOOT_FRUIT_BORER_L4 = 'IPM_OKRA_SHOOT_FRUIT_BORER_L4', // Selective chemical (>20%)

  // CHILLI THRIPS (Scirtothrips dorsalis) IPM Ladder
  IPM_CHILLI_THRIPS_L1 = 'IPM_CHILLI_THRIPS_L1',                   // Cultural control (<5 thrips/leaf)
  IPM_CHILLI_THRIPS_L2 = 'IPM_CHILLI_THRIPS_L2',                   // Mechanical control (5-10 thrips)
  IPM_CHILLI_THRIPS_L3 = 'IPM_CHILLI_THRIPS_L3',                   // Biological control (10-20 thrips)
  IPM_CHILLI_THRIPS_L4 = 'IPM_CHILLI_THRIPS_L4',                   // Botanical control (20-30 thrips)
  IPM_CHILLI_THRIPS_L5 = 'IPM_CHILLI_THRIPS_L5',                   // Selective chemical (>30 thrips)

  // MANGO HOPPER (Idioscopus spp.) IPM Ladder
  IPM_MANGO_HOPPER_L1 = 'IPM_MANGO_HOPPER_L1',                     // Cultural control (<5 hoppers/panicle)
  IPM_MANGO_HOPPER_L2 = 'IPM_MANGO_HOPPER_L2',                     // Mechanical control (5-10 hoppers)
  IPM_MANGO_HOPPER_L3 = 'IPM_MANGO_HOPPER_L3',                     // Botanical control (10-20 hoppers)
  IPM_MANGO_HOPPER_L4 = 'IPM_MANGO_HOPPER_L4',                     // Selective chemical (>20 hoppers)

  // SOYBEAN GIRDLE BEETLE (Obereopsis brevis) IPM Ladder
  IPM_SOYBEAN_GIRDLE_BEETLE_L1 = 'IPM_SOYBEAN_GIRDLE_BEETLE_L1',   // Cultural control (<5% girdled plants)
  IPM_SOYBEAN_GIRDLE_BEETLE_L2 = 'IPM_SOYBEAN_GIRDLE_BEETLE_L2',   // Mechanical control (5-10%)
  IPM_SOYBEAN_GIRDLE_BEETLE_L3 = 'IPM_SOYBEAN_GIRDLE_BEETLE_L3',   // Botanical control (10-20%)
  IPM_SOYBEAN_GIRDLE_BEETLE_L4 = 'IPM_SOYBEAN_GIRDLE_BEETLE_L4',   // Selective chemical (>20%)

  // GROUNDNUT LEAF MINER (Aproaerema modicella) IPM Ladder
  IPM_GROUNDNUT_LEAF_MINER_L1 = 'IPM_GROUNDNUT_LEAF_MINER_L1',     // Cultural control (<10% leaflets mined)
  IPM_GROUNDNUT_LEAF_MINER_L2 = 'IPM_GROUNDNUT_LEAF_MINER_L2',     // Botanical control (10-25%)
  IPM_GROUNDNUT_LEAF_MINER_L3 = 'IPM_GROUNDNUT_LEAF_MINER_L3',     // Selective chemical (>25%)

  // MUSTARD APHID (Lipaphis erysimi) IPM Ladder
  IPM_MUSTARD_APHID_L1 = 'IPM_MUSTARD_APHID_L1',                   // Cultural control (<10% infested plants)
  IPM_MUSTARD_APHID_L2 = 'IPM_MUSTARD_APHID_L2',                   // Mechanical control (10-25%)
  IPM_MUSTARD_APHID_L3 = 'IPM_MUSTARD_APHID_L3',                   // Botanical control (25-50%)
  IPM_MUSTARD_APHID_L4 = 'IPM_MUSTARD_APHID_L4',                   // Selective chemical (>50%)

  // ONION THRIPS (Thrips tabaci) IPM Ladder
  IPM_ONION_THRIPS_L1 = 'IPM_ONION_THRIPS_L1',                     // Cultural control (<10 thrips/plant)
  IPM_ONION_THRIPS_L2 = 'IPM_ONION_THRIPS_L2',                     // Mechanical control (10-25 thrips)
  IPM_ONION_THRIPS_L3 = 'IPM_ONION_THRIPS_L3',                     // Botanical control (25-50 thrips)
  IPM_ONION_THRIPS_L4 = 'IPM_ONION_THRIPS_L4',                     // Selective chemical (>50 thrips)

  // SUGARCANE SHOOT BORER (Chilo infuscatellus) IPM Ladder
  IPM_SUGARCANE_SHOOT_BORER_L1 = 'IPM_SUGARCANE_SHOOT_BORER_L1',   // Cultural control (<5% dead hearts)
  IPM_SUGARCANE_SHOOT_BORER_L2 = 'IPM_SUGARCANE_SHOOT_BORER_L2',   // Mechanical control (5-10%)
  IPM_SUGARCANE_SHOOT_BORER_L3 = 'IPM_SUGARCANE_SHOOT_BORER_L3',   // Biological control (10-15%)
  IPM_SUGARCANE_SHOOT_BORER_L4 = 'IPM_SUGARCANE_SHOOT_BORER_L4',   // Selective chemical (>15%)

  // ─────────────────────────────────────────────────────────────────────────
  // VEGETABLE DISEASE CAUSES - Cabbage, Cauliflower, Okra, Beans
  // ─────────────────────────────────────────────────────────────────────────
  CABBAGE_BLACK_ROT_RISK = 'CABBAGE_BLACK_ROT_RISK',               // Xanthomonas campestris
  CABBAGE_CLUBROOT_RISK = 'CABBAGE_CLUBROOT_RISK',                 // Plasmodiophora brassicae
  CAULIFLOWER_DOWNY_MILDEW_RISK = 'CAULIFLOWER_DOWNY_MILDEW_RISK', // Peronospora parasitica
  CAULIFLOWER_BLACK_ROT_RISK = 'CAULIFLOWER_BLACK_ROT_RISK',       // Xanthomonas campestris
  OKRA_YELLOW_VEIN_MOSAIC_RISK = 'OKRA_YELLOW_VEIN_MOSAIC_RISK',   // YVMV - whitefly transmitted
  OKRA_POWDERY_MILDEW_RISK = 'OKRA_POWDERY_MILDEW_RISK',           // Erysiphe cichoracearum
  BEANS_ANTHRACNOSE_RISK = 'BEANS_ANTHRACNOSE_RISK',               // Colletotrichum lindemuthianum
  BEANS_RUST_RISK = 'BEANS_RUST_RISK',                             // Uromyces appendiculatus
  BEANS_ROOT_ROT_RISK = 'BEANS_ROOT_ROT_RISK',                     // Rhizoctonia + Fusarium

  // ─────────────────────────────────────────────────────────────────────────
  // VEGETABLE PEST CAUSES - Cabbage, Cauliflower, Okra, Beans
  // ─────────────────────────────────────────────────────────────────────────
  CABBAGE_DIAMONDBACK_MOTH_RISK = 'CABBAGE_DIAMONDBACK_MOTH_RISK', // Plutella xylostella - THE most serious
  CABBAGE_APHID_RISK = 'CABBAGE_APHID_RISK',                       // Brevicoryne brassicae
  CAULIFLOWER_APHID_RISK = 'CAULIFLOWER_APHID_RISK',               // Aphids on curd
  OKRA_SHOOT_FRUIT_BORER_RISK = 'OKRA_SHOOT_FRUIT_BORER_RISK',     // Earias vittella
  OKRA_JASSID_RISK = 'OKRA_JASSID_RISK',                           // Amrasca biguttula
  OKRA_WHITEFLY_RISK = 'OKRA_WHITEFLY_RISK',                       // Bemisia tabaci - YVMV vector
  BEANS_POD_BORER_RISK = 'BEANS_POD_BORER_RISK',                   // Helicoverpa armigera
  BEANS_APHID_RISK = 'BEANS_APHID_RISK',                           // Aphis craccivora

  // ─────────────────────────────────────────────────────────────────────────
  // SOIL pH INTERACTION CAUSES - Nutrient Availability Matrix
  // ─────────────────────────────────────────────────────────────────────────
  PH_ACIDIC_PULSE_FAILURE = 'PH_ACIDIC_PULSE_FAILURE',             // pH <6.0 Rhizobium failure
  PH_ACIDIC_ALUMINUM_TOXICITY = 'PH_ACIDIC_ALUMINUM_TOXICITY',     // pH <5.5 Al3+ toxicity
  PH_ALKALINE_ZINC_LOCKUP = 'PH_ALKALINE_ZINC_LOCKUP',             // pH >8.0 Zn unavailable
  PH_ALKALINE_IRON_LOCKUP = 'PH_ALKALINE_IRON_LOCKUP',             // pH >8.0 Fe chlorosis
  PH_ALKALINE_PHOSPHORUS_LOCKUP = 'PH_ALKALINE_PHOSPHORUS_LOCKUP', // pH >8.5 P fixation
  PH_CORRECTION_LIME_NEEDED = 'PH_CORRECTION_LIME_NEEDED',         // Acidic soil - lime required
  PH_CORRECTION_SULPHUR_NEEDED = 'PH_CORRECTION_SULPHUR_NEEDED',   // Alkaline soil - sulphur required
  PH_CORRECTION_GYPSUM_NEEDED = 'PH_CORRECTION_GYPSUM_NEEDED',     // Sodic soil - gypsum required
  PH_OPTIMAL_RANGE = 'PH_OPTIMAL_RANGE',                           // pH 6.5-7.5 optimal
  SALINITY_STRESS_HIGH_EC = 'SALINITY_STRESS_HIGH_EC',              // EC >4 dS/m saline stress

  // ─────────────────────────────────────────────────────────────────────────
  // VARIETY/CULTIVAR RECOMMENDATION CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  VARIETY_DISEASE_RESISTANT_AVAILABLE = 'VARIETY_DISEASE_RESISTANT_AVAILABLE',
  VARIETY_PEST_RESISTANT_AVAILABLE = 'VARIETY_PEST_RESISTANT_AVAILABLE',
  VARIETY_HEAT_TOLERANT_AVAILABLE = 'VARIETY_HEAT_TOLERANT_AVAILABLE',
  VARIETY_DROUGHT_TOLERANT_AVAILABLE = 'VARIETY_DROUGHT_TOLERANT_AVAILABLE',
  VARIETY_SALINITY_TOLERANT_AVAILABLE = 'VARIETY_SALINITY_TOLERANT_AVAILABLE',
  VARIETY_LODGING_RESISTANT_AVAILABLE = 'VARIETY_LODGING_RESISTANT_AVAILABLE',
  VARIETY_HIGH_YIELD_POTENTIAL = 'VARIETY_HIGH_YIELD_POTENTIAL',
  VARIETY_EARLY_MATURITY_AVAILABLE = 'VARIETY_EARLY_MATURITY_AVAILABLE',
  VARIETY_QUALITY_SUPERIOR_AVAILABLE = 'VARIETY_QUALITY_SUPERIOR_AVAILABLE',
  VARIETY_BIOFORTIFIED_AVAILABLE = 'VARIETY_BIOFORTIFIED_AVAILABLE',
  VARIETY_REGION_SPECIFIC_RECOMMENDED = 'VARIETY_REGION_SPECIFIC_RECOMMENDED',
  VARIETY_SUBOPTIMAL_CURRENT = 'VARIETY_SUBOPTIMAL_CURRENT',

  // ─────────────────────────────────────────────────────────────────────────
  // RICE ADDITIONAL PESTS/DISEASES (Extended for 80 rules)
  // ─────────────────────────────────────────────────────────────────────────
  BROWN_PLANTHOPPER_RISK = 'BROWN_PLANTHOPPER_RISK',               // BPH - hopper burn
  GALL_MIDGE_RISK = 'GALL_MIDGE_RISK',                             // Silver shoots
  HISPA_RISK = 'HISPA_RISK',                                       // Rice hispa - white streaks
  GREEN_LEAFHOPPER_RISK = 'GREEN_LEAFHOPPER_RISK',                 // Tungro vector
  LEAF_FOLDER_RISK = 'LEAF_FOLDER_RISK',                           // Leaf folder pest
  CASE_WORM_RISK = 'CASE_WORM_RISK',                               // Rice case worm
  BLAST_RISK = 'BLAST_RISK',                                       // Rice blast - most destructive
  SHEATH_BLIGHT_RISK = 'SHEATH_BLIGHT_RISK',                       // Rhizoctonia solani
  BACTERIAL_BLIGHT_RISK = 'BACTERIAL_BLIGHT_RISK',                 // BLB - Xanthomonas
  BROWN_SPOT_RISK = 'BROWN_SPOT_RISK',                             // Helminthosporium
  FALSE_SMUT_RISK = 'FALSE_SMUT_RISK',                             // Rice false smut
  SHEATH_ROT_RISK = 'SHEATH_ROT_RISK',                             // Sarocladium oryzae
  TUNGRO_VIRUS_RISK = 'TUNGRO_VIRUS_RISK',                         // Tungro disease
  KHAIRA_DISEASE_RISK = 'KHAIRA_DISEASE_RISK',                     // Zinc deficiency induced
  RICE_THRIPS_RISK = 'RICE_THRIPS_RISK',                           // Rice thrips
  RICE_ARMYWORM_RISK = 'RICE_ARMYWORM_RISK',                       // Army worm in rice
  RICE_EAR_CUTTING_CATERPILLAR = 'RICE_EAR_CUTTING_CATERPILLAR',   // Ear cutting pest
  RICE_GRAIN_DISCOLORATION = 'RICE_GRAIN_DISCOLORATION',           // Grain discoloration complex

  // ─────────────────────────────────────────────────────────────────────────
  // WHEAT ADDITIONAL PESTS/DISEASES (Extended for 60 rules)
  // ─────────────────────────────────────────────────────────────────────────
  BROWN_RUST_RISK = 'BROWN_RUST_RISK',                             // Puccinia recondita - most common
  YELLOW_RUST_RISK = 'YELLOW_RUST_RISK',                           // Puccinia striiformis - most destructive
  BLACK_RUST_RISK = 'BLACK_RUST_RISK',                             // Ug99 stem rust
  KARNAL_BUNT_RISK = 'KARNAL_BUNT_RISK',                           // Tilletia indica - quarantine
  WHEAT_APHID_RISK = 'WHEAT_APHID_RISK',                           // Sitobion avenae
  WHEAT_THRIPS_RISK = 'WHEAT_THRIPS_RISK',                         // Wheat thrips
  WHEAT_MITE_RISK = 'WHEAT_MITE_RISK',                             // Wheat mite pest
  ROOT_APHID_RISK = 'ROOT_APHID_RISK',                             // Root aphid
  HEAD_BLIGHT_RISK = 'HEAD_BLIGHT_RISK',                           // Fusarium head blight
  FLAG_SMUT_RISK = 'FLAG_SMUT_RISK',                               // Urocystis agropyri
  ALTERNARIA_BLIGHT_RISK = 'ALTERNARIA_BLIGHT_RISK',               // Alternaria triticina
  MOLYA_DISEASE_RISK = 'MOLYA_DISEASE_RISK',                       // Cereal cyst nematode
  WHEAT_SHOOT_FLY_RISK = 'WHEAT_SHOOT_FLY_RISK',                   // Atherigona naqvii
  WHEAT_LODGING_RISK = 'WHEAT_LODGING_RISK',                       // Pre-harvest lodging
  WHEAT_SHRIVELED_GRAIN_RISK = 'WHEAT_SHRIVELED_GRAIN_RISK',       // Heat stress grain
  WHEAT_EARHEAD_DAMAGE_RISK = 'WHEAT_EARHEAD_DAMAGE_RISK',         // Bird/rodent damage

  // ─────────────────────────────────────────────────────────────────────────
  // MAIZE ADDITIONAL PESTS/DISEASES (Extended for 40 rules)
  // ─────────────────────────────────────────────────────────────────────────
  FALL_ARMYWORM_RISK = 'FALL_ARMYWORM_RISK',                       // FAW - invasive pest
  MAIZE_PINK_BORER_RISK = 'MAIZE_PINK_BORER_RISK',                 // Pink stem borer
  MAIZE_SHOOT_FLY_RISK = 'MAIZE_SHOOT_FLY_RISK',                   // Atherigona spp
  MAIZE_TURCICUM_BLIGHT_RISK = 'MAIZE_TURCICUM_BLIGHT_RISK',       // Northern corn leaf blight
  MAIZE_STALK_ROT_RISK = 'MAIZE_STALK_ROT_RISK',                   // Fusarium stalk rot
  MAIZE_EAR_ROT_RISK = 'MAIZE_EAR_ROT_RISK',                       // Ear rot complex
  MAIZE_DOWNY_MILDEW_RISK = 'MAIZE_DOWNY_MILDEW_RISK',             // SDM - Peronosclerospora
  MAIZE_BANDED_LEAF_BLIGHT_RISK = 'MAIZE_BANDED_LEAF_BLIGHT_RISK', // Rhizoctonia solani
  MAIZE_CUTWORM_RISK = 'MAIZE_CUTWORM_RISK',                       // Agrotis spp
  MAIZE_CUT_WORM_RISK = 'MAIZE_CUT_WORM_RISK',                     // Alternative spelling
  MAIZE_COB_BORER_RISK = 'MAIZE_COB_BORER_RISK',                   // Cob borer damage
  MAIZE_APHID_RISK = 'MAIZE_APHID_RISK',                           // Rhopalosiphum maidis
  MAIZE_POST_FLOWERING_STALK_ROT = 'MAIZE_POST_FLOWERING_STALK_ROT', // PFSR
  MAIZE_CHARCOAL_ROT_RISK = 'MAIZE_CHARCOAL_ROT_RISK',             // Macrophomina

  // ─────────────────────────────────────────────────────────────────────────
  // SPICES DISEASES/PESTS - Turmeric, Ginger, Black Pepper, Cardamom
  // ─────────────────────────────────────────────────────────────────────────
  RHIZOME_ROT_RISK = 'RHIZOME_ROT_RISK',                           // Pythium - turmeric/ginger
  TURMERIC_LEAF_SPOT_RISK = 'TURMERIC_LEAF_SPOT_RISK',             // Colletotrichum capsici
  TURMERIC_LEAF_BLOTCH_RISK = 'TURMERIC_LEAF_BLOTCH_RISK',         // Taphrina maculans
  TURMERIC_SCALE_INSECT_RISK = 'TURMERIC_SCALE_INSECT_RISK',       // Aspidiella hartii
  TURMERIC_SHOOT_BORER_RISK = 'TURMERIC_SHOOT_BORER_RISK',         // Conogethes punctiferalis
  TURMERIC_THRIPS_RISK = 'TURMERIC_THRIPS_RISK',                   // Panchaetothrips indicus
  TURMERIC_RHIZOME_FLY_RISK = 'TURMERIC_RHIZOME_FLY_RISK',         // Mimegralla coeruleifrons
  GINGER_SOFT_ROT_RISK = 'GINGER_SOFT_ROT_RISK',                   // Pythium - soft rot
  GINGER_BACTERIAL_WILT_RISK = 'GINGER_BACTERIAL_WILT_RISK',       // Ralstonia solanacearum
  GINGER_SHOOT_BORER_RISK = 'GINGER_SHOOT_BORER_RISK',             // Conogethes punctiferalis
  GINGER_LEAF_SPOT_RISK = 'GINGER_LEAF_SPOT_RISK',                 // Phyllosticta zingiberi
  GINGER_STORAGE_ROT_RISK = 'GINGER_STORAGE_ROT_RISK',             // Fusarium oxysporum
  PEPPER_FOOT_ROT_RISK = 'PEPPER_FOOT_ROT_RISK',                   // Phytophthora capsici
  PEPPER_QUICK_WILT_RISK = 'PEPPER_QUICK_WILT_RISK',               // Quick wilt complex
  PEPPER_POLLU_BEETLE_RISK = 'PEPPER_POLLU_BEETLE_RISK',           // Longitarsus nigripennis
  PEPPER_ANTHRACNOSE_RISK = 'PEPPER_ANTHRACNOSE_RISK',             // Colletotrichum gloeosporioides
  PEPPER_SCALE_INSECT_RISK = 'PEPPER_SCALE_INSECT_RISK',           // Lepidosaphes piperis
  PEPPER_STUNT_DISEASE_RISK = 'PEPPER_STUNT_DISEASE_RISK',         // Viral stunt
  CARDAMOM_THRIPS_RISK = 'CARDAMOM_THRIPS_RISK',                   // Sciothrips cardamomi
  CARDAMOM_SHOOT_BORER_RISK = 'CARDAMOM_SHOOT_BORER_RISK',         // Conogethes punctiferalis
  CARDAMOM_AZHUKAL_RISK = 'CARDAMOM_AZHUKAL_RISK',                 // Capsule rot - Phytophthora
  CARDAMOM_CAPSULE_BORER_RISK = 'CARDAMOM_CAPSULE_BORER_RISK',     // Fruit borer
  CARDAMOM_KATTE_DISEASE_RISK = 'CARDAMOM_KATTE_DISEASE_RISK',     // Viral mosaic
  CARDAMOM_WHITEFLY_RISK = 'CARDAMOM_WHITEFLY_RISK',               // Katte virus vector
  CUMIN_BLIGHT_RISK = 'CUMIN_BLIGHT_RISK',                         // Alternaria burnsii
  CUMIN_WILT_RISK = 'CUMIN_WILT_RISK',                             // Fusarium oxysporum
  CUMIN_APHID_RISK = 'CUMIN_APHID_RISK',                           // Myzus persicae
  CORIANDER_WILT_RISK = 'CORIANDER_WILT_RISK',                     // Fusarium oxysporum
  CORIANDER_POWDERY_MILDEW_RISK = 'CORIANDER_POWDERY_MILDEW_RISK', // Erysiphe polygoni
  CORIANDER_APHID_RISK = 'CORIANDER_APHID_RISK',                   // Hyadaphis coriandri
  CHILLI_ANTHRACNOSE_RISK = 'CHILLI_ANTHRACNOSE_RISK',             // Die-back
  CHILLI_MURDA_COMPLEX_RISK = 'CHILLI_MURDA_COMPLEX_RISK',         // Leaf curl complex
  CHILLI_FRUIT_ROT_RISK = 'CHILLI_FRUIT_ROT_RISK',                 // Colletotrichum
  CHILLI_MITE_RISK = 'CHILLI_MITE_RISK',                           // Polyphagotarsonemus latus

  // ─────────────────────────────────────────────────────────────────────────
  // PLANTATION CROPS - Coconut, Coffee, Tea, Rubber, Arecanut, Cashew
  // ─────────────────────────────────────────────────────────────────────────
  // COCONUT PESTS/DISEASES
  COCONUT_RHINOCEROS_BEETLE_RISK = 'COCONUT_RHINOCEROS_BEETLE_RISK',       // Oryctes rhinoceros
  COCONUT_RED_PALM_WEEVIL_RISK = 'COCONUT_RED_PALM_WEEVIL_RISK',           // Rhynchophorus ferrugineus
  COCONUT_ERIOPHYID_MITE_RISK = 'COCONUT_ERIOPHYID_MITE_RISK',             // Aceria guerreronis
  COCONUT_BLACK_HEADED_CATERPILLAR_RISK = 'COCONUT_BLACK_HEADED_CATERPILLAR_RISK', // Opisina arenosella
  COCONUT_BUD_ROT_RISK = 'COCONUT_BUD_ROT_RISK',                           // Phytophthora palmivora
  COCONUT_ROOT_WILT_RISK = 'COCONUT_ROOT_WILT_RISK',                       // Phytoplasma
  COCONUT_STEM_BLEEDING_RISK = 'COCONUT_STEM_BLEEDING_RISK',               // Thielaviopsis paradoxa
  COCONUT_GREY_LEAF_BLIGHT_RISK = 'COCONUT_GREY_LEAF_BLIGHT_RISK',         // Pestalotiopsis palmarum
  COCONUT_LEAF_ROT_RISK = 'COCONUT_LEAF_ROT_RISK',                         // Bipolaris incurvata
  COCONUT_BASAL_STEM_ROT_RISK = 'COCONUT_BASAL_STEM_ROT_RISK',             // Ganoderma applanatum

  // COFFEE PESTS/DISEASES
  COFFEE_BERRY_BORER_RISK = 'COFFEE_BERRY_BORER_RISK',                     // Hypothenemus hampei - most destructive
  COFFEE_WHITE_STEM_BORER_RISK = 'COFFEE_WHITE_STEM_BORER_RISK',           // Xylotrechus quadripes
  COFFEE_SHOT_HOLE_BORER_RISK = 'COFFEE_SHOT_HOLE_BORER_RISK',             // Xylosandrus compactus
  COFFEE_MEALYBUG_RISK = 'COFFEE_MEALYBUG_RISK',                           // Planococcus citri
  COFFEE_GREEN_SCALE_RISK = 'COFFEE_GREEN_SCALE_RISK',                     // Coccus viridis
  COFFEE_LEAF_RUST_RISK = 'COFFEE_LEAF_RUST_RISK',                         // Hemileia vastatrix
  COFFEE_BLACK_ROT_RISK = 'COFFEE_BLACK_ROT_RISK',                         // Koleroga noxia
  COFFEE_BROWN_EYE_SPOT_RISK = 'COFFEE_BROWN_EYE_SPOT_RISK',               // Cercospora coffeicola
  COFFEE_ROOT_DISEASE_RISK = 'COFFEE_ROOT_DISEASE_RISK',                   // Rosellinia bunodes
  COFFEE_BERRY_BLOTCH_RISK = 'COFFEE_BERRY_BLOTCH_RISK',                   // Cercospora

  // TEA PESTS/DISEASES
  TEA_MOSQUITO_BUG_RISK = 'TEA_MOSQUITO_BUG_RISK',                         // Helopeltis theivora
  TEA_THRIPS_RISK = 'TEA_THRIPS_RISK',                                     // Scirtothrips dorsalis
  TEA_RED_SPIDER_MITE_RISK = 'TEA_RED_SPIDER_MITE_RISK',                   // Oligonychus coffeae
  TEA_JASSID_RISK = 'TEA_JASSID_RISK',                                     // Empoasca flavescens
  TEA_LOOPER_CATERPILLAR_RISK = 'TEA_LOOPER_CATERPILLAR_RISK',             // Hyposidra talaca
  TEA_BLISTER_BLIGHT_RISK = 'TEA_BLISTER_BLIGHT_RISK',                     // Exobasidium vexans - major disease
  TEA_GREY_BLIGHT_RISK = 'TEA_GREY_BLIGHT_RISK',                           // Pestalotiopsis theae
  TEA_RED_RUST_RISK = 'TEA_RED_RUST_RISK',                                 // Cephaleuros parasiticus
  TEA_BLACK_ROT_RISK = 'TEA_BLACK_ROT_RISK',                               // Corticium theae
  TEA_BROWN_BLIGHT_RISK = 'TEA_BROWN_BLIGHT_RISK',                         // Glomerella cingulata

  // RUBBER PESTS/DISEASES
  RUBBER_ABNORMAL_LEAF_FALL_RISK = 'RUBBER_ABNORMAL_LEAF_FALL_RISK',       // Phytophthora - major disease
  RUBBER_POWDERY_MILDEW_RISK = 'RUBBER_POWDERY_MILDEW_RISK',               // Oidium heveae
  RUBBER_PINK_DISEASE_RISK = 'RUBBER_PINK_DISEASE_RISK',                   // Corticium salmonicolor
  RUBBER_BLACK_STRIPE_RISK = 'RUBBER_BLACK_STRIPE_RISK',                   // Phytophthora palmivora
  RUBBER_SCALE_INSECT_RISK = 'RUBBER_SCALE_INSECT_RISK',                   // Saissetia nigra
  RUBBER_MEALYBUG_RISK = 'RUBBER_MEALYBUG_RISK',                           // Ferrisia virgata
  RUBBER_BARK_ROT_RISK = 'RUBBER_BARK_ROT_RISK',                           // Fusarium/Pythium complex
  RUBBER_BROWN_BAST_RISK = 'RUBBER_BROWN_BAST_RISK',                       // Physiological disorder

  // ARECANUT PESTS/DISEASES
  ARECANUT_YELLOW_LEAF_DISEASE_RISK = 'ARECANUT_YELLOW_LEAF_DISEASE_RISK', // Phytoplasma - devastating
  ARECANUT_KOLEROGA_RISK = 'ARECANUT_KOLEROGA_RISK',                       // Phytophthora arecae
  ARECANUT_FRUIT_ROT_RISK = 'ARECANUT_FRUIT_ROT_RISK',                     // Colletotrichum
  ARECANUT_INFLORESCENCE_DIE_BACK_RISK = 'ARECANUT_INFLORESCENCE_DIE_BACK_RISK', // Phytophthora
  ARECANUT_SPINDLE_BUG_RISK = 'ARECANUT_SPINDLE_BUG_RISK',                 // Carvalhoia arecae
  ARECANUT_MITE_RISK = 'ARECANUT_MITE_RISK',                               // Raoiella indica
  ARECANUT_ROOT_GRUB_RISK = 'ARECANUT_ROOT_GRUB_RISK',                     // Leucopholis spp

  // CASHEW PESTS/DISEASES
  CASHEW_TEA_MOSQUITO_BUG_RISK = 'CASHEW_TEA_MOSQUITO_BUG_RISK',           // Helopeltis antonii - major pest
  CASHEW_STEM_BORER_RISK = 'CASHEW_STEM_BORER_RISK',                       // Plocaederus ferrugineus
  CASHEW_SHOOT_BORER_RISK = 'CASHEW_SHOOT_BORER_RISK',                     // Alcides bubo
  CASHEW_ANTHRACNOSE_RISK = 'CASHEW_ANTHRACNOSE_RISK',                     // Colletotrichum gloeosporioides
  CASHEW_DIE_BACK_RISK = 'CASHEW_DIE_BACK_RISK',                           // Lasiodiplodia theobromae
  CASHEW_POWDERY_MILDEW_RISK = 'CASHEW_POWDERY_MILDEW_RISK',               // Oidium anacardii
  CASHEW_INFLORESCENCE_BLIGHT_RISK = 'CASHEW_INFLORESCENCE_BLIGHT_RISK',   // Colletotrichum

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL OILSEEDS - Sesame, Safflower, Linseed, Castor
  // ─────────────────────────────────────────────────────────────────────────
  SESAME_PHYLLODY_RISK = 'SESAME_PHYLLODY_RISK',                           // Phytoplasma - major disease
  SESAME_LEAF_SPOT_RISK = 'SESAME_LEAF_SPOT_RISK',                         // Cercospora/Alternaria
  SESAME_GALL_FLY_RISK = 'SESAME_GALL_FLY_RISK',                           // Asphondylia sesami
  SESAME_SPHINX_MOTH_RISK = 'SESAME_SPHINX_MOTH_RISK',                     // Acherontia styx
  SESAME_WEBWORM_RISK = 'SESAME_WEBWORM_RISK',                             // Antigastra catalaunalis
  SESAME_ROOT_ROT_RISK = 'SESAME_ROOT_ROT_RISK',                           // Macrophomina phaseolina
  SAFFLOWER_APHID_RISK = 'SAFFLOWER_APHID_RISK',                           // Uroleucon compositae
  SAFFLOWER_ALTERNARIA_RISK = 'SAFFLOWER_ALTERNARIA_RISK',                 // Alternaria carthami
  SAFFLOWER_WILT_RISK = 'SAFFLOWER_WILT_RISK',                             // Fusarium oxysporum
  SAFFLOWER_CAPSULE_FLY_RISK = 'SAFFLOWER_CAPSULE_FLY_RISK',               // Acanthophilus helianthi
  LINSEED_RUST_RISK = 'LINSEED_RUST_RISK',                                 // Melampsora lini
  LINSEED_WILT_RISK = 'LINSEED_WILT_RISK',                                 // Fusarium oxysporum f.sp. lini
  LINSEED_BUD_FLY_RISK = 'LINSEED_BUD_FLY_RISK',                           // Dasyneura lini
  LINSEED_ALTERNARIA_RISK = 'LINSEED_ALTERNARIA_RISK',                     // Alternaria linicola
  CASTOR_SEMILOOPER_RISK = 'CASTOR_SEMILOOPER_RISK',                       // Achaea janata
  CASTOR_WILT_RISK = 'CASTOR_WILT_RISK',                                   // Fusarium oxysporum f.sp. ricini
  CASTOR_CAPSULE_BORER_RISK = 'CASTOR_CAPSULE_BORER_RISK',                 // Dichocrocis punctiferalis
  CASTOR_GREY_ROT_RISK = 'CASTOR_GREY_ROT_RISK',                           // Botrytis ricini

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL FRUITS - Pomegranate, Papaya, Guava, Apple
  // ─────────────────────────────────────────────────────────────────────────
  POMEGRANATE_BACTERIAL_BLIGHT_RISK = 'POMEGRANATE_BACTERIAL_BLIGHT_RISK', // Xanthomonas axonopodis - oily spot
  POMEGRANATE_WILT_RISK = 'POMEGRANATE_WILT_RISK',                         // Ceratocystis fimbriata
  POMEGRANATE_FRUIT_BORER_RISK = 'POMEGRANATE_FRUIT_BORER_RISK',           // Deudorix isocrates
  POMEGRANATE_APHID_RISK = 'POMEGRANATE_APHID_RISK',                       // Aphis punicae
  POMEGRANATE_THRIPS_RISK = 'POMEGRANATE_THRIPS_RISK',                     // Rhipiphorothrips cruentatus
  POMEGRANATE_MITE_RISK = 'POMEGRANATE_MITE_RISK',                         // Brevipalpus phoenicis
  POMEGRANATE_ANTHRACNOSE_RISK = 'POMEGRANATE_ANTHRACNOSE_RISK',           // Colletotrichum
  POMEGRANATE_SHOT_HOLE_RISK = 'POMEGRANATE_SHOT_HOLE_RISK',               // Cercospora
  PAPAYA_RING_SPOT_VIRUS_RISK = 'PAPAYA_RING_SPOT_VIRUS_RISK',             // PRSV - devastating
  PAPAYA_MEALYBUG_RISK = 'PAPAYA_MEALYBUG_RISK',                           // Paracoccus marginatus
  PAPAYA_STEM_ROT_RISK = 'PAPAYA_STEM_ROT_RISK',                           // Phytophthora palmivora
  PAPAYA_ANTHRACNOSE_RISK = 'PAPAYA_ANTHRACNOSE_RISK',                     // Colletotrichum
  PAPAYA_FRUIT_FLY_RISK = 'PAPAYA_FRUIT_FLY_RISK',                         // Bactrocera papayae
  PAPAYA_POWDERY_MILDEW_RISK = 'PAPAYA_POWDERY_MILDEW_RISK',               // Oidium caricae
  GUAVA_WILT_RISK = 'GUAVA_WILT_RISK',                                     // Fusarium oxysporum f.sp. psidii
  GUAVA_FRUIT_FLY_RISK = 'GUAVA_FRUIT_FLY_RISK',                           // Bactrocera dorsalis
  GUAVA_ANTHRACNOSE_RISK = 'GUAVA_ANTHRACNOSE_RISK',                       // Colletotrichum gloeosporioides
  GUAVA_STYLAR_END_ROT_RISK = 'GUAVA_STYLAR_END_ROT_RISK',                 // Phomopsis
  GUAVA_BARK_EATING_CATERPILLAR_RISK = 'GUAVA_BARK_EATING_CATERPILLAR_RISK', // Indarbela quadrinotata
  GUAVA_MEALYBUG_RISK = 'GUAVA_MEALYBUG_RISK',                             // Ferrisia virgata
  APPLE_SCAB_RISK = 'APPLE_SCAB_RISK',                                     // Venturia inaequalis
  APPLE_WOOLLY_APHID_RISK = 'APPLE_WOOLLY_APHID_RISK',                     // Eriosoma lanigerum
  APPLE_BITTER_PIT_RISK = 'APPLE_BITTER_PIT_RISK',                         // Calcium deficiency
  APPLE_FIRE_BLIGHT_RISK = 'APPLE_FIRE_BLIGHT_RISK',                       // Erwinia amylovora
  APPLE_CODLING_MOTH_RISK = 'APPLE_CODLING_MOTH_RISK',                     // Cydia pomonella
  APPLE_POWDERY_MILDEW_RISK = 'APPLE_POWDERY_MILDEW_RISK',                 // Podosphaera leucotricha
  APPLE_SAN_JOSE_SCALE_RISK = 'APPLE_SAN_JOSE_SCALE_RISK',                 // Quadraspidiotus perniciosus

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL VEGETABLES - Brinjal, Cabbage, Cauliflower, Cucumber, Okra
  // ─────────────────────────────────────────────────────────────────────────
  BRINJAL_SHOOT_FRUIT_BORER_RISK = 'BRINJAL_SHOOT_FRUIT_BORER_RISK',       // Leucinodes orbonalis - major pest
  BRINJAL_WILT_RISK = 'BRINJAL_WILT_RISK',                                 // Fusarium/Verticillium/Ralstonia
  BRINJAL_PHOMOPSIS_BLIGHT_RISK = 'BRINJAL_PHOMOPSIS_BLIGHT_RISK',         // Phomopsis vexans
  BRINJAL_LITTLE_LEAF_RISK = 'BRINJAL_LITTLE_LEAF_RISK',                   // Phytoplasma
  BRINJAL_JASSID_RISK = 'BRINJAL_JASSID_RISK',                             // Amrasca biguttula
  BRINJAL_MITE_RISK = 'BRINJAL_MITE_RISK',                                 // Tetranychus urticae
  CABBAGE_DIAMOND_BACK_MOTH_RISK = 'CABBAGE_DIAMOND_BACK_MOTH_RISK',       // Plutella xylostella
  CABBAGE_CLUB_ROOT_RISK = 'CABBAGE_CLUB_ROOT_RISK',                       // Plasmodiophora brassicae
  CABBAGE_HEAD_BORER_RISK = 'CABBAGE_HEAD_BORER_RISK',                     // Hellula undalis
  CAULIFLOWER_STALK_ROT_RISK = 'CAULIFLOWER_STALK_ROT_RISK',               // Sclerotinia sclerotiorum
  CAULIFLOWER_CURD_BORER_RISK = 'CAULIFLOWER_CURD_BORER_RISK',             // Hellula undalis
  CAULIFLOWER_WHIPTAIL_RISK = 'CAULIFLOWER_WHIPTAIL_RISK',                 // Molybdenum deficiency
  CUCUMBER_DOWNY_MILDEW_RISK = 'CUCUMBER_DOWNY_MILDEW_RISK',               // Pseudoperonospora cubensis
  CUCUMBER_MOSAIC_VIRUS_RISK = 'CUCUMBER_MOSAIC_VIRUS_RISK',               // CMV
  CUCUMBER_FRUIT_FLY_RISK = 'CUCUMBER_FRUIT_FLY_RISK',                     // Bactrocera cucurbitae
  CUCUMBER_ANTHRACNOSE_RISK = 'CUCUMBER_ANTHRACNOSE_RISK',                 // Colletotrichum
  CUCUMBER_ANGULAR_LEAF_SPOT_RISK = 'CUCUMBER_ANGULAR_LEAF_SPOT_RISK',     // Pseudomonas syringae
  OKRA_FRUIT_BORER_RISK = 'OKRA_FRUIT_BORER_RISK',                         // Earias vittella
  OKRA_ROOT_KNOT_NEMATODE_RISK = 'OKRA_ROOT_KNOT_NEMATODE_RISK',           // Meloidogyne incognita

  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC FARMING & SOIL HEALTH CAUSES
  // ─────────────────────────────────────────────────────────────────────────
  ORGANIC_CERTIFICATION_COMPLIANCE = 'ORGANIC_CERTIFICATION_COMPLIANCE',   // Organic certification compliance requirement
  SOIL_HEALTH_DEGRADED = 'SOIL_HEALTH_DEGRADED',                           // General soil health degradation
  SOIL_COMPACTION_RISK = 'SOIL_COMPACTION_RISK',                           // Soil compaction detected
  SOIL_EROSION_RISK = 'SOIL_EROSION_RISK',                                 // Soil erosion risk
  SOIL_SALINITY_RISK = 'SOIL_SALINITY_RISK',                               // Soil salinity/sodicity risk
  SOIL_DRAINAGE_POOR = 'SOIL_DRAINAGE_POOR',                               // Poor drainage conditions
  SOIL_DRAINAGE_EXCESSIVE = 'SOIL_DRAINAGE_EXCESSIVE',                     // Excessive drainage (sandy soils)
  SOIL_BIOLOGICAL_ACTIVITY_LOW = 'SOIL_BIOLOGICAL_ACTIVITY_LOW',           // Low microbial activity
  SOIL_ORGANIC_MATTER_LOW = 'SOIL_ORGANIC_MATTER_LOW',                     // Low organic matter content
  SOIL_STRUCTURE_DEGRADED = 'SOIL_STRUCTURE_DEGRADED',                     // Poor soil structure/aggregation
  COMPOSTING_RECOMMENDED = 'COMPOSTING_RECOMMENDED',                       // Composting intervention needed
  GREEN_MANURE_RECOMMENDED = 'GREEN_MANURE_RECOMMENDED',                   // Green manuring recommended
  CROP_ROTATION_NEEDED = 'CROP_ROTATION_NEEDED',                           // Crop rotation for soil health
  COVER_CROP_RECOMMENDED = 'COVER_CROP_RECOMMENDED',                       // Cover cropping recommended
  MULCHING_RECOMMENDED = 'MULCHING_RECOMMENDED',                           // Mulching for soil health
  BIOFERTILIZER_RECOMMENDED = 'BIOFERTILIZER_RECOMMENDED',                 // Bio-fertilizer application needed
  VERMICOMPOST_RECOMMENDED = 'VERMICOMPOST_RECOMMENDED'                    // Vermicompost application needed
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
  ADD_VERMICOMPOST = 'ADD_VERMICOMPOST',                 // Add organic matter

  // ─────────────────────────────────────────────────────────────────────────
  // CULTURAL CONTROL ACTIONS (IPM Level 1)
  // ─────────────────────────────────────────────────────────────────────────
  CULTURAL_CONTROL = 'CULTURAL_CONTROL',                 // Cultural practices (healthy setts, debris removal)
  REMOVE_AFFECTED_PLANTS = 'REMOVE_AFFECTED_PLANTS',     // Remove infested/diseased plants
  CROP_ROTATION = 'CROP_ROTATION',                       // Rotate crops to break pest cycle
  INTERCROPPING = 'INTERCROPPING'                        // Companion planting for pest management
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
  /** Organic carbon (alias for backward compatibility) - used in biological rules */
  oc?: SoilOCState;
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

  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER RAW DATA (For safety rules)
  // ─────────────────────────────────────────────────────────────────────────
  weather?: {
    temperature?: number;
    humidity?: number;
    wind_speed?: number;
    rain_probability?: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // METADATA (For safety/chemical rules - extensible context)
  // ─────────────────────────────────────────────────────────────────────────
  metadata?: {
    requestedChemical?: string;
    chemicalToxicityClass?: string;
    chemicalsToMix?: string[];
    chemicalType?: string;
    applicatorHasPPE?: boolean;
    hasApplicatorLicense?: boolean;
    applicatorSymptoms?: string[];
    pestDensity?: number;
    pestType?: string;
    larvaeCount?: number;
    diseaseSeverity?: number;
    fruitDamagePercent?: number;
    deadHeartsPercent?: number;
    whiteEarsPercent?: number;
    aphidCount?: number;
    hoppersPerHill?: number;
    daysToHarvest?: number;
    lastChemicalApplied?: string;
    lastChemicalMOA?: string;
    consecutiveSameMOA?: number;
    isBtCrop?: boolean;
    refugeAreaPercent?: number;
    isFumigant?: boolean;
    hasEnclosedArea?: boolean;
    hasFumigantLicense?: boolean;
    [key: string]: unknown; // Allow additional properties
  };
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
  | 'critical'
  | 'emergency'        // P0 level - life threatening, immediate stop
  | 'regulatory'       // P1 level - legal/compliance requirements
  | 'safety'           // P1-P2 level - chemical/environmental safety
  | 'economic'         // P4 level - economic threshold rules
  | 'ipm'              // P5 level - IPM preference rules
  | 'harvest'          // Harvest timing and quality rules
  | 'resistance'       // Resistance management rules
  | 'seasonal'         // Season-specific rules (Kharif/Rabi/Zaid)
  | 'regional'         // Agro-climatic zone specific rules
  | 'weather_safety'   // Weather-action coupling rules
  | 'variety'          // Variety/cultivar recommendation rules
  | 'pgr_hormone'      // Plant Growth Regulator rules (GA3, NAA, Ethephon, etc.)
  | 'precision_fertigation' // Israel/Netherlands precision fertigation rules
  | 'biological';      // Microbiome and biological control rules

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

// ═══════════════════════════════════════════════════════════════════════════
// VARIETY RECOMMENDATION SYSTEM TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Resistance/Tolerance Level */
export enum ResistanceLevel {
  IMMUNE = 'IMMUNE',                    // No disease/pest damage
  HIGHLY_RESISTANT = 'HIGHLY_RESISTANT', // <5% damage
  RESISTANT = 'RESISTANT',               // 5-10% damage
  MODERATELY_RESISTANT = 'MODERATELY_RESISTANT', // 10-25% damage
  TOLERANT = 'TOLERANT',                 // 25-40% damage (plant survives)
  SUSCEPTIBLE = 'SUSCEPTIBLE'            // >40% damage
}

/** Variety maturity duration */
export enum MaturityDuration {
  EXTRA_EARLY = 'EXTRA_EARLY',   // <90 days
  EARLY = 'EARLY',               // 90-110 days
  MEDIUM = 'MEDIUM',             // 110-130 days
  LATE = 'LATE',                 // 130-150 days
  VERY_LATE = 'VERY_LATE'        // >150 days
}

/** Special quality traits */
export enum QualityTrait {
  HIGH_PROTEIN = 'HIGH_PROTEIN',
  HIGH_OIL = 'HIGH_OIL',
  HIGH_ZINC = 'HIGH_ZINC',           // Biofortified
  HIGH_IRON = 'HIGH_IRON',           // Biofortified
  HIGH_VITAMIN_A = 'HIGH_VITAMIN_A', // Golden rice, orange maize
  BASMATI_QUALITY = 'BASMATI_QUALITY',
  EXPORT_QUALITY = 'EXPORT_QUALITY',
  LOW_GLYCEMIC_INDEX = 'LOW_GLYCEMIC_INDEX'
}

/** Disease resistance profile */
export interface DiseaseResistance {
  disease_name: string;
  disease_code: string;              // e.g., 'BLAST', 'RUST', 'WILT'
  resistance_level: ResistanceLevel;
  pathogen_races?: string[];         // Specific races/biotypes resistant to
  breakdown_risk?: 'LOW' | 'MEDIUM' | 'HIGH'; // Risk of resistance breaking down
}

/** Pest resistance profile */
export interface PestResistance {
  pest_name: string;
  pest_code: string;                 // e.g., 'BOLLWORM', 'STEM_BORER'
  resistance_level: ResistanceLevel;
  resistance_mechanism?: string;     // e.g., 'Bt protein', 'Antibiosis', 'Antixenosis'
}

/** Abiotic stress tolerance */
export interface AbioticTolerance {
  stress_type: 'DROUGHT' | 'HEAT' | 'COLD' | 'SALINITY' | 'WATERLOGGING' | 'LODGING';
  tolerance_level: ResistanceLevel;
  critical_stages?: CropStage[];     // Stages where tolerance is most valuable
}

/** Regional suitability */
export interface RegionalSuitability {
  zone: AgroClimaticZone;
  suitability: 'HIGHLY_SUITABLE' | 'SUITABLE' | 'MODERATELY_SUITABLE' | 'NOT_RECOMMENDED';
  specific_states?: string[];
  specific_districts?: string[];
  soil_type_preference?: string[];
  irrigation_requirement?: 'RAINFED' | 'IRRIGATED' | 'BOTH';
}

/** Complete variety profile */
export interface CropVariety {
  variety_code: string;              // Unique identifier
  variety_name: string;              // Official name
  common_names?: string[];           // Local names
  crop_code: string;                 // Parent crop
  
  // Release information
  released_by: string;               // ICAR institute
  release_year: number;
  notification_number?: string;      // Official gazette notification
  
  // Agronomic characteristics
  maturity_duration: MaturityDuration;
  maturity_days_min: number;
  maturity_days_max: number;
  yield_potential_kg_per_ha: number;
  average_yield_kg_per_ha: number;
  
  // Resistance/Tolerance profiles
  disease_resistances: DiseaseResistance[];
  pest_resistances: PestResistance[];
  abiotic_tolerances: AbioticTolerance[];
  
  // Regional suitability
  regional_suitability: RegionalSuitability[];
  
  // Quality traits
  quality_traits?: QualityTrait[];
  grain_quality_description?: string;
  
  // Seed availability
  seed_available: boolean;
  seed_sources?: string[];           // NSC, State Seed Corps, Private companies
  seed_cost_inr_per_kg?: number;
  
  // Scientific validation
  scientific_source: string;
  icar_package: string;
  trials_conducted?: string[];       // Location of field trials
  
  // Limitations/warnings
  limitations?: string[];
  not_suitable_for?: string[];       // Conditions to avoid
  
  // Replacement tracking
  replaces_varieties?: string[];     // Older varieties this improves upon
  superseded_by?: string;            // If newer variety exists
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
