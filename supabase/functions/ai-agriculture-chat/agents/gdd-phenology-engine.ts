/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GROWING DEGREE DAYS (GDD) PHENOLOGY ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * World-Class Crop Stage Calculation using Thermal Unit Accumulation
 * 
 * CRITICAL FIX: Replaces fixed DAS-based stage calculation with GDD-based
 * phenology that accounts for temperature variations across regions.
 * 
 * Scientific Sources:
 * - ICAR-IARI Wheat Phenology Models
 * - Iowa State University Corn GDD Calculator
 * - UC Davis Thermal Unit Systems
 * - Zadoks Cereal Development Scale
 * - BBCH Scale (Germany - International Standard)
 * 
 * Version: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface GDDConfig {
  base_temp_c: number;           // Minimum temperature for crop development
  max_temp_c: number;            // Temperature at which development slows/stops
  calculation_method: 'SIMPLE' | 'SINE' | 'MODIFIED';
}

export interface GDDStageThreshold {
  stage_code: string;
  stage_name: string;
  gdd_min: number;
  gdd_max: number;
  zadoks_code?: string;          // For cereals (e.g., 'Z21' for tillering)
  bbch_code?: string;            // For other crops
  critical_irrigation: boolean;
  critical_nutrition: boolean;
  pest_monitoring_priority: string[];
  typical_das_range: { min: number; max: number }; // Fallback for when no temp data
}

export interface PhenologyResult {
  crop_code: string;
  current_stage: string;
  stage_name: string;
  zadoks_code?: string;
  bbch_code?: string;
  
  // GDD-based calculation
  accumulated_gdd: number;
  gdd_source: 'CALCULATED' | 'ESTIMATED_FROM_AVG' | 'FALLBACK_DAS';
  
  // Days-based fallback
  days_after_sowing: number;
  
  // Stage progress
  stage_progress_percent: number;
  days_to_next_stage?: number;
  next_stage?: string;
  
  // Critical alerts
  is_critical_stage: boolean;
  critical_irrigation_needed: boolean;
  critical_nutrition_needed: boolean;
  pest_monitoring_priority: string[];
  
  // Confidence
  confidence: number;
  warnings: string[];
}

export interface WeatherDataForGDD {
  date: string;
  tmax: number;
  tmin: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC GDD CONFIGURATIONS (ICAR/FAO Standards)
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GDD_CONFIG: Record<string, GDDConfig> = {
  'WHEAT': { base_temp_c: 0, max_temp_c: 30, calculation_method: 'MODIFIED' },
  'RICE': { base_temp_c: 10, max_temp_c: 40, calculation_method: 'SIMPLE' },
  'MAIZE': { base_temp_c: 10, max_temp_c: 30, calculation_method: 'SINE' },
  'COTTON': { base_temp_c: 15, max_temp_c: 37, calculation_method: 'MODIFIED' },
  'SOYBEAN': { base_temp_c: 10, max_temp_c: 30, calculation_method: 'SIMPLE' },
  'SUGARCANE': { base_temp_c: 12, max_temp_c: 38, calculation_method: 'SIMPLE' },
  'GROUNDNUT': { base_temp_c: 13, max_temp_c: 33, calculation_method: 'SIMPLE' },
  'TOMATO': { base_temp_c: 10, max_temp_c: 35, calculation_method: 'SIMPLE' },
  'ONION': { base_temp_c: 7, max_temp_c: 30, calculation_method: 'SIMPLE' },
  'CHILLI': { base_temp_c: 10, max_temp_c: 35, calculation_method: 'SIMPLE' },
  'POTATO': { base_temp_c: 7, max_temp_c: 25, calculation_method: 'SIMPLE' },
  'GRAM': { base_temp_c: 5, max_temp_c: 30, calculation_method: 'SIMPLE' },
  'TUR': { base_temp_c: 10, max_temp_c: 35, calculation_method: 'SIMPLE' },
  // Default for unknown crops
  'DEFAULT': { base_temp_c: 10, max_temp_c: 35, calculation_method: 'SIMPLE' },
};

// ═══════════════════════════════════════════════════════════════════════════
// ZADOKS SCALE THRESHOLDS FOR WHEAT (ICAR-IARI)
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_PHENOLOGY: GDDStageThreshold[] = [
  {
    stage_code: 'GERMINATION',
    stage_name: 'Germination & Emergence',
    gdd_min: 0,
    gdd_max: 130,
    zadoks_code: 'Z00-Z09',
    critical_irrigation: true,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 0, max: 7 },
  },
  {
    stage_code: 'SEEDLING',
    stage_name: 'Seedling (1-3 leaves)',
    gdd_min: 130,
    gdd_max: 250,
    zadoks_code: 'Z10-Z19',
    critical_irrigation: false,
    critical_nutrition: true, // Basal fertilizer
    pest_monitoring_priority: ['APHID', 'TERMITE'],
    typical_das_range: { min: 7, max: 21 },
  },
  {
    stage_code: 'CROWN_ROOT_INITIATION',
    stage_name: 'Crown Root Initiation (CRI)', // CRITICAL STAGE
    gdd_min: 250,
    gdd_max: 350,
    zadoks_code: 'Z20-Z21',
    critical_irrigation: true, // MOST CRITICAL IRRIGATION
    critical_nutrition: true,  // First top dressing N
    pest_monitoring_priority: ['APHID', 'ARMYWORM'],
    typical_das_range: { min: 21, max: 28 },
  },
  {
    stage_code: 'TILLERING',
    stage_name: 'Tillering',
    gdd_min: 350,
    gdd_max: 600,
    zadoks_code: 'Z21-Z29',
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: ['APHID', 'RUST'],
    typical_das_range: { min: 28, max: 45 },
  },
  {
    stage_code: 'JOINTING',
    stage_name: 'Jointing (Node Visible)',
    gdd_min: 600,
    gdd_max: 850,
    zadoks_code: 'Z30-Z39',
    critical_irrigation: true, // Second critical irrigation
    critical_nutrition: true,  // Second top dressing N
    pest_monitoring_priority: ['RUST', 'POWDERY_MILDEW'],
    typical_das_range: { min: 45, max: 65 },
  },
  {
    stage_code: 'BOOT',
    stage_name: 'Boot Stage',
    gdd_min: 850,
    gdd_max: 1000,
    zadoks_code: 'Z40-Z49',
    critical_irrigation: true, // Boot stage irrigation
    critical_nutrition: false,
    pest_monitoring_priority: ['RUST', 'KARNAL_BUNT'],
    typical_das_range: { min: 65, max: 80 },
  },
  {
    stage_code: 'HEADING',
    stage_name: 'Heading & Flowering',
    gdd_min: 1000,
    gdd_max: 1200,
    zadoks_code: 'Z50-Z69',
    critical_irrigation: true, // Flowering irrigation
    critical_nutrition: false,
    pest_monitoring_priority: ['RUST', 'POWDERY_MILDEW', 'LOOSE_SMUT'],
    typical_das_range: { min: 80, max: 95 },
  },
  {
    stage_code: 'MILK_DOUGH',
    stage_name: 'Grain Filling (Milk to Dough)',
    gdd_min: 1200,
    gdd_max: 1500,
    zadoks_code: 'Z70-Z85',
    critical_irrigation: true, // Last irrigation at dough stage
    critical_nutrition: false,
    pest_monitoring_priority: ['APHID'],
    typical_das_range: { min: 95, max: 115 },
  },
  {
    stage_code: 'MATURITY',
    stage_name: 'Physiological Maturity',
    gdd_min: 1500,
    gdd_max: 1800,
    zadoks_code: 'Z87-Z92',
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 115, max: 130 },
  },
  {
    stage_code: 'HARVEST',
    stage_name: 'Harvest Ready',
    gdd_min: 1800,
    gdd_max: 99999,
    zadoks_code: 'Z93-Z99',
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 130, max: 150 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RICE PHENOLOGY (ICAR-CRRI Standards)
// ═══════════════════════════════════════════════════════════════════════════

export const RICE_PHENOLOGY: GDDStageThreshold[] = [
  {
    stage_code: 'GERMINATION',
    stage_name: 'Germination & Seedling',
    gdd_min: 0,
    gdd_max: 150,
    bbch_code: '00-09',
    critical_irrigation: true, // Maintain nursery water
    critical_nutrition: true,  // Nursery bed fertilizer
    pest_monitoring_priority: [],
    typical_das_range: { min: 0, max: 10 },
  },
  {
    stage_code: 'TRANSPLANTING',
    stage_name: 'Transplanting/Establishment',
    gdd_min: 150,
    gdd_max: 300,
    bbch_code: '10-19',
    critical_irrigation: true,
    critical_nutrition: false,
    pest_monitoring_priority: ['STEM_BORER', 'LEAF_FOLDER'],
    typical_das_range: { min: 10, max: 20 },
  },
  {
    stage_code: 'ACTIVE_TILLERING',
    stage_name: 'Active Tillering',
    gdd_min: 300,
    gdd_max: 700,
    bbch_code: '20-29',
    critical_irrigation: true, // Maintain 5cm standing water
    critical_nutrition: true,  // First N topdressing at 21 DAT
    pest_monitoring_priority: ['STEM_BORER', 'BROWN_PLANTHOPPER', 'BLAST'],
    typical_das_range: { min: 20, max: 45 },
  },
  {
    stage_code: 'PANICLE_INITIATION',
    stage_name: 'Panicle Initiation (PI)', // MOST CRITICAL N
    gdd_min: 700,
    gdd_max: 1000,
    bbch_code: '30-39',
    critical_irrigation: true, // Critical water at PI
    critical_nutrition: true,  // CRITICAL: Second N at PI
    pest_monitoring_priority: ['BLAST', 'SHEATH_BLIGHT', 'STEM_BORER'],
    typical_das_range: { min: 45, max: 60 },
  },
  {
    stage_code: 'BOOTING',
    stage_name: 'Booting Stage',
    gdd_min: 1000,
    gdd_max: 1200,
    bbch_code: '40-49',
    critical_irrigation: true,
    critical_nutrition: true, // K important at booting
    pest_monitoring_priority: ['NECK_BLAST', 'SHEATH_BLIGHT'],
    typical_das_range: { min: 60, max: 75 },
  },
  {
    stage_code: 'HEADING',
    stage_name: 'Heading & Flowering',
    gdd_min: 1200,
    gdd_max: 1400,
    bbch_code: '50-69',
    critical_irrigation: true,
    critical_nutrition: false,
    pest_monitoring_priority: ['NECK_BLAST', 'FALSE_SMUT'],
    typical_das_range: { min: 75, max: 90 },
  },
  {
    stage_code: 'GRAIN_FILLING',
    stage_name: 'Grain Filling & Development',
    gdd_min: 1400,
    gdd_max: 1800,
    bbch_code: '70-89',
    critical_irrigation: true, // Maintain water until dough
    critical_nutrition: false,
    pest_monitoring_priority: ['STINK_BUG'],
    typical_das_range: { min: 90, max: 115 },
  },
  {
    stage_code: 'MATURITY',
    stage_name: 'Physiological Maturity',
    gdd_min: 1800,
    gdd_max: 2100,
    bbch_code: '90-99',
    critical_irrigation: false, // Drain field for harvest
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 115, max: 130 },
  },
  {
    stage_code: 'HARVEST',
    stage_name: 'Harvest Ready',
    gdd_min: 2100,
    gdd_max: 99999,
    bbch_code: '99',
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 130, max: 150 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COTTON PHENOLOGY (ICAR-CICR Standards)
// ═══════════════════════════════════════════════════════════════════════════

export const COTTON_PHENOLOGY: GDDStageThreshold[] = [
  {
    stage_code: 'GERMINATION',
    stage_name: 'Germination & Emergence',
    gdd_min: 0,
    gdd_max: 100,
    critical_irrigation: true,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 0, max: 10 },
  },
  {
    stage_code: 'SEEDLING',
    stage_name: 'Seedling Establishment',
    gdd_min: 100,
    gdd_max: 300,
    critical_irrigation: false,
    critical_nutrition: true, // Basal application
    pest_monitoring_priority: ['APHID', 'JASSID', 'THRIPS'],
    typical_das_range: { min: 10, max: 25 },
  },
  {
    stage_code: 'VEGETATIVE',
    stage_name: 'Vegetative Growth',
    gdd_min: 300,
    gdd_max: 550,
    critical_irrigation: false,
    critical_nutrition: true, // First N split
    pest_monitoring_priority: ['APHID', 'JASSID', 'WHITEFLY', 'MEALYBUG'],
    typical_das_range: { min: 25, max: 50 },
  },
  {
    stage_code: 'SQUARING',
    stage_name: 'Square Formation', // CRITICAL PEST MONITORING
    gdd_min: 550,
    gdd_max: 800,
    critical_irrigation: true, // Pre-squaring irrigation
    critical_nutrition: true,  // Second N split
    pest_monitoring_priority: ['BOLLWORM', 'SPODOPTERA', 'WHITEFLY'],
    typical_das_range: { min: 50, max: 70 },
  },
  {
    stage_code: 'FLOWERING',
    stage_name: 'Flowering Peak',
    gdd_min: 800,
    gdd_max: 1200,
    critical_irrigation: true, // Peak water requirement
    critical_nutrition: true,  // K important for boll dev
    pest_monitoring_priority: ['PINK_BOLLWORM', 'AMERICAN_BOLLWORM', 'WHITEFLY'],
    typical_das_range: { min: 70, max: 100 },
  },
  {
    stage_code: 'BOLL_DEVELOPMENT',
    stage_name: 'Boll Development', // CRITICAL K Stage
    gdd_min: 1200,
    gdd_max: 1700,
    critical_irrigation: true,
    critical_nutrition: true, // Critical K for fiber quality
    pest_monitoring_priority: ['PINK_BOLLWORM', 'SPOTTED_BOLLWORM'],
    typical_das_range: { min: 100, max: 130 },
  },
  {
    stage_code: 'BOLL_OPENING',
    stage_name: 'Boll Opening',
    gdd_min: 1700,
    gdd_max: 2100,
    critical_irrigation: false, // Reduce for maturity
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 130, max: 160 },
  },
  {
    stage_code: 'HARVEST',
    stage_name: 'Harvest Ready',
    gdd_min: 2100,
    gdd_max: 99999,
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 160, max: 200 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE PHENOLOGY (ICAR-SBI Standards) - Long Duration Crop
// ═══════════════════════════════════════════════════════════════════════════

export const SUGARCANE_PHENOLOGY: GDDStageThreshold[] = [
  {
    stage_code: 'GERMINATION',
    stage_name: 'Germination (Bud Sprouting)',
    gdd_min: 0,
    gdd_max: 400,
    critical_irrigation: true, // Every 7-10 days
    critical_nutrition: false,
    pest_monitoring_priority: ['SHOOT_BORER', 'TERMITE'],
    typical_das_range: { min: 0, max: 35 },
  },
  {
    stage_code: 'TILLERING',
    stage_name: 'Tillering Phase', // CRITICAL N Stage
    gdd_min: 400,
    gdd_max: 1200,
    critical_irrigation: true,
    critical_nutrition: true, // 2/3 of N at tillering
    pest_monitoring_priority: ['SHOOT_BORER', 'EARLY_SHOOT_BORER', 'PYRILLA'],
    typical_das_range: { min: 35, max: 100 },
  },
  {
    stage_code: 'GRAND_GROWTH',
    stage_name: 'Grand Growth Phase', // Maximum Growth
    gdd_min: 1200,
    gdd_max: 3500,
    critical_irrigation: true, // Heavy water demand
    critical_nutrition: true,  // Remaining N + K
    pest_monitoring_priority: ['INTERNODE_BORER', 'TOP_BORER', 'WOOLLY_APHID', 'RED_ROT'],
    typical_das_range: { min: 100, max: 270 },
  },
  {
    stage_code: 'MATURITY',
    stage_name: 'Maturity & Ripening',
    gdd_min: 3500,
    gdd_max: 4500,
    critical_irrigation: false, // Reduce/stop for ripening
    critical_nutrition: false,
    pest_monitoring_priority: ['SMUT', 'WILT'],
    typical_das_range: { min: 270, max: 330 },
  },
  {
    stage_code: 'HARVEST',
    stage_name: 'Harvest Ready',
    gdd_min: 4500,
    gdd_max: 99999,
    critical_irrigation: false,
    critical_nutrition: false,
    pest_monitoring_priority: [],
    typical_das_range: { min: 330, max: 400 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHENOLOGY MAP BY CROP
// ═══════════════════════════════════════════════════════════════════════════

const CROP_PHENOLOGY_MAP: Record<string, GDDStageThreshold[]> = {
  'WHEAT': WHEAT_PHENOLOGY,
  'RICE': RICE_PHENOLOGY,
  'COTTON': COTTON_PHENOLOGY,
  'SUGARCANE': SUGARCANE_PHENOLOGY,
};

// Default phenology for crops without specific thresholds
const DEFAULT_PHENOLOGY: GDDStageThreshold[] = [
  { stage_code: 'GERMINATION', stage_name: 'Germination', gdd_min: 0, gdd_max: 150, critical_irrigation: true, critical_nutrition: false, pest_monitoring_priority: [], typical_das_range: { min: 0, max: 10 } },
  { stage_code: 'SEEDLING', stage_name: 'Seedling', gdd_min: 150, gdd_max: 350, critical_irrigation: false, critical_nutrition: true, pest_monitoring_priority: [], typical_das_range: { min: 10, max: 25 } },
  { stage_code: 'VEGETATIVE', stage_name: 'Vegetative', gdd_min: 350, gdd_max: 800, critical_irrigation: true, critical_nutrition: true, pest_monitoring_priority: [], typical_das_range: { min: 25, max: 60 } },
  { stage_code: 'FLOWERING', stage_name: 'Flowering', gdd_min: 800, gdd_max: 1200, critical_irrigation: true, critical_nutrition: false, pest_monitoring_priority: [], typical_das_range: { min: 60, max: 90 } },
  { stage_code: 'MATURITY', stage_name: 'Maturity', gdd_min: 1200, gdd_max: 1600, critical_irrigation: false, critical_nutrition: false, pest_monitoring_priority: [], typical_das_range: { min: 90, max: 120 } },
  { stage_code: 'HARVEST', stage_name: 'Harvest', gdd_min: 1600, gdd_max: 99999, critical_irrigation: false, critical_nutrition: false, pest_monitoring_priority: [], typical_das_range: { min: 120, max: 150 } },
];

// ═══════════════════════════════════════════════════════════════════════════
// GDD CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate single day GDD using simple average method
 * GDD = ((Tmax + Tmin) / 2) - Base_Temp
 */
export function calculateDailyGDD(
  tmax: number,
  tmin: number,
  baseTemp: number,
  maxTemp: number = 40
): number {
  // Constrain temperatures
  const adjustedTmax = Math.min(tmax, maxTemp);
  const adjustedTmin = Math.max(tmin, baseTemp);
  
  // Calculate average temperature
  const avgTemp = (adjustedTmax + adjustedTmin) / 2;
  
  // GDD cannot be negative
  const gdd = Math.max(0, avgTemp - baseTemp);
  
  return gdd;
}

/**
 * Calculate accumulated GDD from weather history
 */
export function calculateAccumulatedGDD(
  weatherData: WeatherDataForGDD[],
  cropCode: string
): { accumulated_gdd: number; days_counted: number } {
  const config = CROP_GDD_CONFIG[cropCode.toUpperCase()] || CROP_GDD_CONFIG['DEFAULT'];
  
  let totalGDD = 0;
  let daysWithData = 0;
  
  for (const day of weatherData) {
    if (day.tmax !== undefined && day.tmin !== undefined) {
      totalGDD += calculateDailyGDD(day.tmax, day.tmin, config.base_temp_c, config.max_temp_c);
      daysWithData++;
    }
  }
  
  return {
    accumulated_gdd: Math.round(totalGDD),
    days_counted: daysWithData,
  };
}

/**
 * Estimate GDD from regional average temperature when daily data unavailable
 */
export function estimateGDDFromAverage(
  daysSinceSowing: number,
  avgDailyTemp: number,
  cropCode: string
): number {
  const config = CROP_GDD_CONFIG[cropCode.toUpperCase()] || CROP_GDD_CONFIG['DEFAULT'];
  const dailyGDD = Math.max(0, avgDailyTemp - config.base_temp_c);
  return Math.round(dailyGDD * daysSinceSowing);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PHENOLOGY CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate current phenological stage using GDD or fallback to DAS
 * This is the primary function for crop stage determination
 */
export function calculatePhenologicalStage(
  cropCode: string,
  daysSinceSowing: number,
  weatherHistory?: WeatherDataForGDD[],
  avgRegionalTemp?: number,
  latitude?: number
): PhenologyResult {
  const cropUpper = cropCode.toUpperCase();
  const phenologyStages = CROP_PHENOLOGY_MAP[cropUpper] || DEFAULT_PHENOLOGY;
  const warnings: string[] = [];
  
  let accumulatedGDD = 0;
  let gddSource: 'CALCULATED' | 'ESTIMATED_FROM_AVG' | 'FALLBACK_DAS' = 'FALLBACK_DAS';
  
  // Priority 1: Calculate from actual weather data
  if (weatherHistory && weatherHistory.length >= daysSinceSowing * 0.7) {
    const gddCalc = calculateAccumulatedGDD(weatherHistory, cropUpper);
    accumulatedGDD = gddCalc.accumulated_gdd;
    gddSource = 'CALCULATED';
    
    if (gddCalc.days_counted < daysSinceSowing) {
      warnings.push(`GDD calculated from ${gddCalc.days_counted}/${daysSinceSowing} days of weather data`);
    }
  }
  // Priority 2: Estimate from regional average
  else if (avgRegionalTemp !== undefined) {
    accumulatedGDD = estimateGDDFromAverage(daysSinceSowing, avgRegionalTemp, cropUpper);
    gddSource = 'ESTIMATED_FROM_AVG';
    warnings.push('GDD estimated from regional average temperature');
  }
  // Priority 3: Fallback to DAS-based lookup
  else {
    gddSource = 'FALLBACK_DAS';
    warnings.push('No temperature data available - using DAS-based stage estimation');
    // FORENSIC AUDIT P2: Emit machine-readable data-quality code so downstream
    // gates can mark gdd_min/gdd_max conditions as soft (non-required) and
    // surface a degraded-mode flag in the response envelope. See
    // .lovable/plan.md §P2 GDD wiring + degraded-mode label.
    warnings.push('DATA_QUALITY:gdd_unwired');
    console.warn(`⚠️ [GDD] DATA_QUALITY:gdd_unwired — weather feed not wired into GDD engine; rule conditions on gdd_min/gdd_max should be treated as soft.`);
  }
  
  // Find current stage based on GDD or DAS fallback
  let currentStage: GDDStageThreshold | undefined;
  
  // CRITICAL: Ensure daysSinceSowing is a valid number
  const safeDASSinceSowing = typeof daysSinceSowing === 'number' && !isNaN(daysSinceSowing) ? daysSinceSowing : 0;
  console.log(`[GDD] Safe DAS value: ${safeDASSinceSowing} (original: ${daysSinceSowing})`);
  
  if (gddSource === 'FALLBACK_DAS') {
    console.log(`[GDD] DAS Fallback for ${cropUpper}: ${safeDASSinceSowing} DAS`);
    
    // Use DAS-based lookup with explicit stage matching
    for (let i = 0; i < phenologyStages.length; i++) {
      const stage = phenologyStages[i];
      console.log(`  Checking stage ${stage.stage_code}: ${stage.typical_das_range.min}-${stage.typical_das_range.max} DAS`);
      
      if (safeDASSinceSowing >= stage.typical_das_range.min && 
          safeDASSinceSowing <= stage.typical_das_range.max) {
        currentStage = stage;
        console.log(`  ✓ Matched: ${stage.stage_code}`);
        break;
      }
    }
    
    // CRITICAL FIX: If no match found, find the NEAREST stage instead of defaulting to HARVEST
    if (!currentStage) {
      console.log(`[GDD] No exact DAS match for ${safeDASSinceSowing}, finding nearest stage...`);
      
      // Find stage where DAS is between current and next stage
      for (let i = 0; i < phenologyStages.length - 1; i++) {
        const current = phenologyStages[i];
        const next = phenologyStages[i + 1];
        if (safeDASSinceSowing > current.typical_das_range.max && 
            safeDASSinceSowing < next.typical_das_range.min) {
          // Use the earlier (more conservative) stage
          currentStage = current;
          warnings.push(`DAS ${safeDASSinceSowing} between stages, using ${current.stage_code}`);
          console.log(`  ✓ Gap match: ${current.stage_code} (between ${current.stage_code} and ${next.stage_code})`);
          break;
        }
      }
      
      // SAFETY NET: If DAS is very low but no stage matched, use GERMINATION
      if (!currentStage && safeDASSinceSowing < 100) {
        currentStage = phenologyStages[0]; // GERMINATION
        warnings.push(`Low DAS (${safeDASSinceSowing}) with no stage match, defaulting to GERMINATION`);
        console.log(`  ✓ Safety net: GERMINATION (DAS ${safeDASSinceSowing} < 100)`);
      }
      
      // Only use last stage if DAS is genuinely high (> minimum harvest DAS for crop)
      if (!currentStage) {
        const lastStage = phenologyStages[phenologyStages.length - 1];
        // Only default to HARVEST if DAS exceeds the minimum harvest threshold
        if (safeDASSinceSowing >= lastStage.typical_das_range.min) {
          currentStage = lastStage;
          console.log(`  ✓ Genuine harvest: ${lastStage.stage_code} (DAS ${safeDASSinceSowing} >= ${lastStage.typical_das_range.min})`);
        } else {
          // CRITICAL: Still shouldn't reach harvest, use second-to-last stage
          currentStage = phenologyStages[Math.max(0, phenologyStages.length - 2)];
          warnings.push(`DAS ${safeDASSinceSowing} below harvest threshold, using ${currentStage.stage_code}`);
          console.log(`  ✓ Pre-harvest fallback: ${currentStage.stage_code}`);
        }
      }
    }
  } else {
    // Use GDD-based lookup
    for (const stage of phenologyStages) {
      if (accumulatedGDD >= stage.gdd_min && accumulatedGDD < stage.gdd_max) {
        currentStage = stage;
        break;
      }
    }
    if (!currentStage) {
      currentStage = phenologyStages[phenologyStages.length - 1];
    }
  }
  
  // Calculate stage progress
  let stageProgress = 0;
  if (currentStage) {
    if (gddSource !== 'FALLBACK_DAS') {
      const stageRange = currentStage.gdd_max - currentStage.gdd_min;
      stageProgress = Math.min(100, Math.round(((accumulatedGDD - currentStage.gdd_min) / stageRange) * 100));
    } else {
      const dasRange = currentStage.typical_das_range.max - currentStage.typical_das_range.min;
      stageProgress = Math.min(100, Math.round(((daysSinceSowing - currentStage.typical_das_range.min) / dasRange) * 100));
    }
  }
  
  // Find next stage
  const currentIndex = phenologyStages.findIndex(s => s.stage_code === currentStage?.stage_code);
  const nextStage = currentIndex < phenologyStages.length - 1 ? phenologyStages[currentIndex + 1] : undefined;
  
  // Calculate days to next stage (rough estimate)
  let daysToNextStage: number | undefined;
  if (nextStage && gddSource !== 'FALLBACK_DAS' && avgRegionalTemp) {
    const config = CROP_GDD_CONFIG[cropUpper] || CROP_GDD_CONFIG['DEFAULT'];
    const dailyGDD = Math.max(0, avgRegionalTemp - config.base_temp_c);
    if (dailyGDD > 0) {
      const gddNeeded = nextStage.gdd_min - accumulatedGDD;
      daysToNextStage = Math.ceil(gddNeeded / dailyGDD);
    }
  } else if (nextStage) {
    daysToNextStage = nextStage.typical_das_range.min - daysSinceSowing;
  }
  
  // Determine if this is a critical stage
  const isCritical = currentStage?.critical_irrigation || currentStage?.critical_nutrition || false;
  
  // Calculate confidence
  let confidence = 0.9;
  if (gddSource === 'ESTIMATED_FROM_AVG') confidence = 0.75;
  if (gddSource === 'FALLBACK_DAS') confidence = 0.6;
  if (warnings.length > 0) confidence -= 0.05 * warnings.length;
  
  return {
    crop_code: cropUpper,
    current_stage: currentStage?.stage_code || 'UNKNOWN',
    stage_name: currentStage?.stage_name || 'Unknown Stage',
    zadoks_code: currentStage?.zadoks_code,
    bbch_code: currentStage?.bbch_code,
    accumulated_gdd: accumulatedGDD,
    gdd_source: gddSource,
    days_after_sowing: daysSinceSowing,
    stage_progress_percent: stageProgress,
    days_to_next_stage: daysToNextStage && daysToNextStage > 0 ? daysToNextStage : undefined,
    next_stage: nextStage?.stage_code,
    is_critical_stage: isCritical,
    critical_irrigation_needed: currentStage?.critical_irrigation || false,
    critical_nutrition_needed: currentStage?.critical_nutrition || false,
    pest_monitoring_priority: currentStage?.pest_monitoring_priority || [],
    confidence: Math.max(0.5, confidence),
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTOPERIOD SENSITIVITY (For day-length dependent crops)
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoperiodInfo {
  day_length_hours: number;
  is_long_day: boolean;        // > 13 hours
  is_short_day: boolean;       // < 12 hours
  bulbing_trigger_onion: boolean;  // Onion bulbs at 12+ hours
  flowering_inhibited_sd_rice: boolean; // SD rice won't flower if days too long
}

/**
 * Calculate approximate day length for a given latitude and day of year
 * Uses simplified formula - actual solar calculations more complex
 */
export function calculateDayLength(latitude: number, dayOfYear: number): number {
  const latRad = latitude * (Math.PI / 180);
  const declination = 23.45 * Math.sin((360/365) * (dayOfYear - 81) * (Math.PI / 180));
  const declRad = declination * (Math.PI / 180);
  
  const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(declRad));
  const dayLengthHours = (2 * hourAngle * 180 / Math.PI) / 15;
  
  return Math.min(24, Math.max(0, dayLengthHours));
}

/**
 * Get photoperiod information for crop recommendations
 */
export function getPhotoperiodInfo(
  latitude: number,
  dayOfYear: number,
  cropCode: string
): PhotoperiodInfo {
  const dayLength = calculateDayLength(latitude, dayOfYear);
  
  return {
    day_length_hours: Math.round(dayLength * 100) / 100,
    is_long_day: dayLength > 13,
    is_short_day: dayLength < 12,
    bulbing_trigger_onion: dayLength >= 12, // Onion bulbing threshold
    flowering_inhibited_sd_rice: dayLength > 13.5, // Some rice varieties
  };
}

// Export version
export const GDD_PHENOLOGY_VERSION = '1.0.0';
