/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-09 03:15 UTC — FIX 1 (STATE_SYNC). Added
 *   `syncCanonicalStateFromSnapshot(state, snapshot, opts)` — the ONLY
 *   writer of `candidate_hypothesis_count` / `matched_rules_count` /
 *   `hypothesis_ids` / `rule_ids` / `orphan_rule_ids` on CanonicalState.
 *   Emits `[STATE_SYNC] source=GRAPH_RUNTIME` exactly once per turn.
 *   Idempotent; second call with same snapshot is a no-op; mismatch logs
 *   `GRAPH_CONTRACT_VIOLATION` and rewrites (fail-loud, no silent drift).
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ============= CANONICAL STATE BUILDER =============

import { normalizeCropCode as unifiedNormalizeCropCode, getFullCropName } from '../utils/crop-code-normalizer.ts';
import { classifyEvidence } from '../runtime/evidence-classifier.ts';
import type { BiologicalState } from './biological-state.ts';
import type { GraphRuntimeSnapshot } from '../runtime/graph-snapshot.ts';


// ==================== CLOSED WORLD ENUMS ====================
// These are the ONLY allowed values - no free text in decision brain

export enum CropType {
  WHEAT = 'WHEAT',
  RICE = 'RICE',
  SUGARCANE = 'SUGARCANE',
  COTTON = 'COTTON',
  SOYBEAN = 'SOYBEAN',
  MAIZE = 'MAIZE',
  BAJRA = 'BAJRA',
  JOWAR = 'JOWAR',
  GROUNDNUT = 'GROUNDNUT',
  ONION = 'ONION',
  TOMATO = 'TOMATO',
  POTATO = 'POTATO',
  CHILLI = 'CHILLI',
  GRAPES = 'GRAPES',
  POMEGRANATE = 'POMEGRANATE',
  BANANA = 'BANANA',
  MANGO = 'MANGO',
  TURMERIC = 'TURMERIC',
  GINGER = 'GINGER',
  CHICKPEA = 'CHICKPEA',
  PIGEON_PEA = 'PIGEON_PEA',
  MUSTARD = 'MUSTARD',
  SUNFLOWER = 'SUNFLOWER',
  RAGI = 'RAGI',
  UNKNOWN = 'UNKNOWN'
}

export enum CropStage {
  GERMINATION = 'GERMINATION',
  SEEDLING = 'SEEDLING',
  VEGETATIVE = 'VEGETATIVE',
  TILLERING = 'TILLERING',
  GRAND_GROWTH = 'GRAND_GROWTH',
  BOOTING = 'BOOTING',
  HEADING = 'HEADING',
  FLOWERING = 'FLOWERING',
  FRUITING = 'FRUITING',
  BOLL_FORMATION = 'BOLL_FORMATION',
  BOLL_OPENING = 'BOLL_OPENING',
  GRAIN_FILLING = 'GRAIN_FILLING',
  MATURITY = 'MATURITY',
  HARVEST = 'HARVEST',
  UNKNOWN = 'UNKNOWN'
}

export enum DaysAfterSowingBucket {
  D0_7 = 'D0_7',
  D8_15 = 'D8_15',
  D16_30 = 'D16_30',
  D31_60 = 'D31_60',
  D61_90 = 'D61_90',
  D91_120 = 'D91_120',
  D121_180 = 'D121_180',
  D180_PLUS = 'D180_PLUS',
  UNKNOWN = 'UNKNOWN'
}

// Visual symptoms - ONLY what is SEEN, not interpreted
// PHASE-12: Added generic insect observation symptoms that work across ALL crops
export enum VisualSymptom {
  NONE = 'NONE',
  GENERAL_YELLOWING = 'GENERAL_YELLOWING',
  INTERVEINAL_YELLOWING = 'INTERVEINAL_YELLOWING',
  LEAF_EDGE_BURN = 'LEAF_EDGE_BURN',
  LEAF_TIP_BURN = 'LEAF_TIP_BURN',
  LEAF_CURLING = 'LEAF_CURLING',
  LEAF_ROLLING = 'LEAF_ROLLING',
  CURLED_LEAVES = 'CURLED_LEAVES',
  SPOTS_CIRCULAR = 'SPOTS_CIRCULAR',
  SPOTS_IRREGULAR = 'SPOTS_IRREGULAR',
  SPOTS_ANGULAR = 'SPOTS_ANGULAR',
  SPOTS_POWDERY = 'SPOTS_POWDERY',
  ANGULAR_SPOTS = 'ANGULAR_SPOTS',
  POWDERY_COATING = 'POWDERY_COATING',
  WHITE_POWDER = 'WHITE_POWDER',
  DOWNY_GROWTH = 'DOWNY_GROWTH',
  WILTING = 'WILTING',
  PLANT_DEATH = 'PLANT_DEATH',         // CRITICAL: Terminal damage - plants have died
  SEEDLING_DEATH = 'SEEDLING_DEATH',   // CRITICAL: Seedlings/young plants died
  STUNTED_GROWTH = 'STUNTED_GROWTH',
  PLANT_LODGING = 'PLANT_LODGING',
  STEM_BORING = 'STEM_BORING',
  STEM_DISCOLORATION = 'STEM_DISCOLORATION',
  HOLES_IN_STEM = 'HOLES_IN_STEM',
  ROOT_DAMAGE = 'ROOT_DAMAGE',
  ROOT_DISCOLORATION = 'ROOT_DISCOLORATION',
  FRUIT_DAMAGE = 'FRUIT_DAMAGE',
  BOLL_DAMAGE = 'BOLL_DAMAGE',
  ROSETTE_FLOWER = 'ROSETTE_FLOWER',
  LARGE_HOLES = 'LARGE_HOLES',
  DEAD_HEART = 'DEAD_HEART',
  WHITE_EAR = 'WHITE_EAR',
  WEBBING = 'WEBBING',
  HOLES_IN_LEAVES = 'HOLES_IN_LEAVES',
  LEAF_HOLES = 'LEAF_HOLES',  // PHASE-12: Generic leaf holes - works for any crop
  DEFOLIATION = 'DEFOLIATION',
  SOOTY_MOLD = 'SOOTY_MOLD',
  STICKY_LEAVES = 'STICKY_LEAVES',
  HONEYDEW = 'HONEYDEW',
  YELLOW_STRIPES = 'YELLOW_STRIPES',
  PUSTULES = 'PUSTULES',
  WATER_SOAKED_LESIONS = 'WATER_SOAKED_LESIONS',
  SILVERING = 'SILVERING',
  LEAF_DISTORTION = 'LEAF_DISTORTION',
  
  // PHASE-12: GENERIC INSECT OBSERVATION SYMPTOMS (Crop-Agnostic)
  SMALL_INSECTS_VISIBLE = 'SMALL_INSECTS_VISIBLE',       // Generic - visible small insects
  FLYING_INSECTS_VISIBLE = 'FLYING_INSECTS_VISIBLE',     // Behavior observed - flying
  CRAWLING_INSECTS_VISIBLE = 'CRAWLING_INSECTS_VISIBLE', // Behavior observed - crawling
  JUMPING_INSECTS_VISIBLE = 'JUMPING_INSECTS_VISIBLE',   // Behavior observed - jumping
  INSECT_PRESENT_NO_DAMAGE = 'INSECT_PRESENT_NO_DAMAGE', // Insects seen but no plant damage
  INSECT_EGGS_VISIBLE = 'INSECT_EGGS_VISIBLE',           // Egg masses visible
  LARVAE_VISIBLE = 'LARVAE_VISIBLE',                      // Caterpillars/grubs/larvae
  
  UNKNOWN = 'UNKNOWN'
}

export enum SymptomDistribution {
  UNIFORM = 'UNIFORM',
  PATCHY = 'PATCHY',
  BORDER_ONLY = 'BORDER_ONLY',
  RANDOM = 'RANDOM',
  SPREADING = 'SPREADING',
  CLUSTERED = 'CLUSTERED',
  UNKNOWN = 'UNKNOWN'
}

export enum SeverityLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

// NDVI State - bucketed, not raw numbers
export enum NDVILevel {
  VERY_LOW = 'VERY_LOW',       // < 0.2
  LOW = 'LOW',                 // 0.2 - 0.35
  BELOW_NORMAL = 'BELOW_NORMAL', // 0.35 - 0.45
  NORMAL = 'NORMAL',           // 0.45 - 0.65
  HIGH = 'HIGH',               // 0.65 - 0.8
  VERY_HIGH = 'VERY_HIGH',     // > 0.8
  UNKNOWN = 'UNKNOWN'
}

export enum NDVITrend {
  SHARP_IMPROVING = 'SHARP_IMPROVING',  // > +0.05/week
  IMPROVING = 'IMPROVING',              // +0.02 to +0.05/week
  STABLE = 'STABLE',                    // -0.02 to +0.02/week
  DECLINING = 'DECLINING',              // -0.02 to -0.05/week
  SHARP_DECLINE = 'SHARP_DECLINE',      // < -0.05/week
  UNKNOWN = 'UNKNOWN'
}

export enum VegetationUniformity {
  UNIFORM = 'UNIFORM',                  // CV < 10%
  MODERATE_VARIATION = 'MODERATE_VARIATION', // CV 10-20%
  HIGH_VARIATION = 'HIGH_VARIATION',    // CV > 20%
  UNKNOWN = 'UNKNOWN'
}

// Soil Health State - bucketed
export enum SoilNitrogen {
  VERY_LOW = 'VERY_LOW',       // < 140 kg/ha
  LOW = 'LOW',                 // 140 - 280 kg/ha
  ADEQUATE = 'ADEQUATE',       // 280 - 560 kg/ha
  HIGH = 'HIGH',               // 560 - 700 kg/ha
  EXCESS = 'EXCESS',           // > 700 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPhosphorus {
  VERY_LOW = 'VERY_LOW',       // < 10 kg/ha
  LOW = 'LOW',                 // 10 - 25 kg/ha
  ADEQUATE = 'ADEQUATE',       // 25 - 50 kg/ha
  HIGH = 'HIGH',               // > 50 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPotassium {
  VERY_LOW = 'VERY_LOW',       // < 110 kg/ha
  LOW = 'LOW',                 // 110 - 280 kg/ha
  ADEQUATE = 'ADEQUATE',       // 280 - 400 kg/ha
  HIGH = 'HIGH',               // > 400 kg/ha
  UNKNOWN = 'UNKNOWN'
}

export enum SoilPH {
  STRONGLY_ACIDIC = 'STRONGLY_ACIDIC',       // < 5.0
  MODERATELY_ACIDIC = 'MODERATELY_ACIDIC',   // 5.0 - 6.0
  SLIGHTLY_ACIDIC = 'SLIGHTLY_ACIDIC',       // 6.0 - 6.5
  NEUTRAL = 'NEUTRAL',                       // 6.5 - 7.5
  SLIGHTLY_ALKALINE = 'SLIGHTLY_ALKALINE',   // 7.5 - 8.0
  MODERATELY_ALKALINE = 'MODERATELY_ALKALINE', // 8.0 - 8.5
  STRONGLY_ALKALINE = 'STRONGLY_ALKALINE',   // > 8.5
  UNKNOWN = 'UNKNOWN'
}

export enum SoilOrganicCarbon {
  VERY_LOW = 'VERY_LOW',       // < 0.25%
  LOW = 'LOW',                 // 0.25 - 0.50%
  MEDIUM = 'MEDIUM',           // 0.50 - 0.75%
  HIGH = 'HIGH',               // > 0.75%
  UNKNOWN = 'UNKNOWN'
}

// Water & Weather Stress State
export enum WaterStress {
  NONE = 'NONE',
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  WATERLOGGED = 'WATERLOGGED',
  UNKNOWN = 'UNKNOWN'
}

export enum RainfallRecent {
  NO_RAIN = 'NO_RAIN',         // 0 mm in last 7 days
  LIGHT = 'LIGHT',             // 1-10 mm
  MODERATE = 'MODERATE',       // 10-50 mm
  HEAVY = 'HEAVY',             // 50-100 mm
  EXCESSIVE = 'EXCESSIVE',     // > 100 mm
  UNKNOWN = 'UNKNOWN'
}

export enum TemperatureStress {
  NONE = 'NONE',
  COLD_STRESS = 'COLD_STRESS',           // < 10°C for warm season crops
  MILD_COLD = 'MILD_COLD',               // 10-15°C
  OPTIMAL = 'OPTIMAL',                   // 15-35°C (crop dependent)
  MILD_HEAT = 'MILD_HEAT',               // 35-40°C
  HEAT_STRESS = 'HEAT_STRESS',           // 40-45°C
  EXTREME_HEAT = 'EXTREME_HEAT',         // > 45°C
  UNKNOWN = 'UNKNOWN'
}

export enum HumidityLevel {
  VERY_LOW = 'VERY_LOW',       // < 30%
  LOW = 'LOW',                 // 30-50%
  NORMAL = 'NORMAL',           // 50-70%
  HIGH = 'HIGH',               // 70-85%
  VERY_HIGH = 'VERY_HIGH',     // > 85%
  UNKNOWN = 'UNKNOWN'
}

// Confidence & Risk State (SAFETY LAYER)
export enum DataConfidence {
  VERY_LOW = 'VERY_LOW',       // Only farmer description, no data
  LOW = 'LOW',                 // 1 data source (e.g., only NDVI)
  MEDIUM = 'MEDIUM',           // 2-3 data sources
  HIGH = 'HIGH'                // 4+ data sources with recent timestamps
}

export enum AdvisoryRiskLevel {
  SAFE = 'SAFE',
  CAUTION = 'CAUTION',
  HIGH_RISK = 'HIGH_RISK',
  DO_NOT_ADVISE = 'DO_NOT_ADVISE'
}

// Pest/Disease observation state
export enum PestPresence {
  NONE_OBSERVED = 'NONE_OBSERVED',
  BELOW_ETL = 'BELOW_ETL',
  AT_ETL = 'AT_ETL',
  ABOVE_ETL = 'ABOVE_ETL',
  OUTBREAK = 'OUTBREAK',
  UNKNOWN = 'UNKNOWN'
}

export enum DiseasePresence {
  NONE_OBSERVED = 'NONE_OBSERVED',
  EARLY_SYMPTOMS = 'EARLY_SYMPTOMS',
  ESTABLISHED = 'ESTABLISHED',
  SPREADING = 'SPREADING',
  SEVERE = 'SEVERE',
  UNKNOWN = 'UNKNOWN'
}

// ==================== CANONICAL STATE INTERFACE ====================

export interface CanonicalState {
  // Crop Context (MANDATORY)
  crop_type: CropType | string;
  crop_stage: CropStage | string;
  days_after_sowing: DaysAfterSowingBucket;
  days_after_sowing_exact?: number;
  /** days after transplant (nursery-independent clock); null when not transplanted */
  days_after_transplant?: number | null;
  
  // NEURO-SYMBOLIC PASSTHROUGH — FIRST-CLASS OBSERVATION CODES
  observation_codes: string[];

  // Visual Symptom State — LEGACY COMPATIBILITY LABELS ONLY.
  // Do NOT branch decisions on `visual_symptom`; use `observation_codes`.
  visual_symptom: VisualSymptom | string;
  secondary_symptoms: (VisualSymptom | string)[];
  symptom_distribution: SymptomDistribution;
  severity: SeverityLevel;
  affected_plant_parts: string[];
  
  // NDVI / Satellite State
  ndvi_level: NDVILevel;
  ndvi_trend: NDVITrend;
  ndvi_value?: number;
  vegetation_uniformity: VegetationUniformity;
  ndvi_data_age_hours?: number;
  
  // Soil Health State
  soil_nitrogen: SoilNitrogen;
  soil_phosphorus: SoilPhosphorus;
  soil_potassium: SoilPotassium;
  soil_ph: SoilPH;
  soil_organic_carbon: SoilOrganicCarbon;
  soil_data_age_days?: number;
  
  // Water & Weather Stress State
  water_stress: WaterStress;
  rainfall_recent: RainfallRecent;
  temperature_stress: TemperatureStress;
  humidity_level: HumidityLevel;
  weather_data_age_hours?: number;
  
  // Pest/Disease State
  pest_presence: PestPresence;
  disease_presence: DiseasePresence;
  suspected_pest?: string;
  suspected_disease?: string;
  
  // Farmer Context
  recent_fertilizer_applied: boolean;
  recent_pesticide_applied: boolean;
  irrigation_type?: string;
  farming_mode?: 'ORGANIC' | 'CONVENTIONAL' | 'INTEGRATED' | 'UNKNOWN';
  
  // Location Context
  district?: string;
  state?: string;
  agro_climatic_zone?: string;
  
  // Confidence & Safety (CRITICAL)
  data_confidence: DataConfidence;
  advisory_risk_level: AdvisoryRiskLevel;
  
  // Data Sources Present (for confidence calculation)
  data_sources: {
    farmer_description: boolean;
    ndvi_data: boolean;
    soil_test: boolean;
    weather_data: boolean;
    image_analysis: boolean;
    historical_data: boolean;
  };
  
  // Evidence Metrics (for prescription safety override)
  symptom_count?: number;
  data_completeness?: number; // 0-1 symptom evidence completeness
  
  // Timestamps
  state_built_at: string;
  land_id?: string;
  // FIX 4 (2026-08-29): land region ('IN-MH') for decision_rules.region_code gating; null = unresolved.
  region_code?: string | null;
  farmer_id?: string;
}

// ==================== MAPPING FUNCTIONS ====================

export function mapDaysToSowingBucket(days: number | null | undefined): DaysAfterSowingBucket {
  // FIX: Handle null explicitly - null means UNKNOWN, not D0_7
  if (days === undefined || days === null || isNaN(days)) return DaysAfterSowingBucket.UNKNOWN;
  if (days <= 7) return DaysAfterSowingBucket.D0_7;
  if (days <= 15) return DaysAfterSowingBucket.D8_15;
  if (days <= 30) return DaysAfterSowingBucket.D16_30;
  if (days <= 60) return DaysAfterSowingBucket.D31_60;
  if (days <= 90) return DaysAfterSowingBucket.D61_90;
  if (days <= 120) return DaysAfterSowingBucket.D91_120;
  if (days <= 180) return DaysAfterSowingBucket.D121_180;
  return DaysAfterSowingBucket.D180_PLUS;
}

export function mapNDVIToLevel(ndvi: number | undefined): NDVILevel {
  if (ndvi === undefined || ndvi === null || isNaN(ndvi)) return NDVILevel.UNKNOWN;
  if (ndvi < 0.2) return NDVILevel.VERY_LOW;
  if (ndvi < 0.35) return NDVILevel.LOW;
  if (ndvi < 0.45) return NDVILevel.BELOW_NORMAL;
  if (ndvi < 0.65) return NDVILevel.NORMAL;
  if (ndvi < 0.8) return NDVILevel.HIGH;
  return NDVILevel.VERY_HIGH;
}

export function mapNDVITrendToEnum(trend: number | string | undefined): NDVITrend {
  if (trend === undefined || trend === null) return NDVITrend.UNKNOWN;
  
  // If string, parse it
  if (typeof trend === 'string') {
    const lowerTrend = trend.toLowerCase();
    if (lowerTrend.includes('sharp') && lowerTrend.includes('improv')) return NDVITrend.SHARP_IMPROVING;
    if (lowerTrend.includes('improv') || lowerTrend.includes('increas')) return NDVITrend.IMPROVING;
    if (lowerTrend.includes('sharp') && lowerTrend.includes('declin')) return NDVITrend.SHARP_DECLINE;
    if (lowerTrend.includes('declin') || lowerTrend.includes('decreas')) return NDVITrend.DECLINING;
    if (lowerTrend.includes('stable') || lowerTrend.includes('steady')) return NDVITrend.STABLE;
    return NDVITrend.UNKNOWN;
  }
  
  // If number (slope per week)
  if (trend > 0.05) return NDVITrend.SHARP_IMPROVING;
  if (trend > 0.02) return NDVITrend.IMPROVING;
  if (trend > -0.02) return NDVITrend.STABLE;
  if (trend > -0.05) return NDVITrend.DECLINING;
  return NDVITrend.SHARP_DECLINE;
}

export function mapNitrogenToEnum(nKgHa: number | undefined): SoilNitrogen {
  if (nKgHa === undefined || nKgHa === null || isNaN(nKgHa)) return SoilNitrogen.UNKNOWN;
  if (nKgHa < 140) return SoilNitrogen.VERY_LOW;
  if (nKgHa < 280) return SoilNitrogen.LOW;
  if (nKgHa < 560) return SoilNitrogen.ADEQUATE;
  if (nKgHa < 700) return SoilNitrogen.HIGH;
  return SoilNitrogen.EXCESS;
}

export function mapPhosphorusToEnum(pKgHa: number | undefined): SoilPhosphorus {
  if (pKgHa === undefined || pKgHa === null || isNaN(pKgHa)) return SoilPhosphorus.UNKNOWN;
  if (pKgHa < 10) return SoilPhosphorus.VERY_LOW;
  if (pKgHa < 25) return SoilPhosphorus.LOW;
  if (pKgHa < 50) return SoilPhosphorus.ADEQUATE;
  return SoilPhosphorus.HIGH;
}

export function mapPotassiumToEnum(kKgHa: number | undefined): SoilPotassium {
  if (kKgHa === undefined || kKgHa === null || isNaN(kKgHa)) return SoilPotassium.UNKNOWN;
  if (kKgHa < 110) return SoilPotassium.VERY_LOW;
  if (kKgHa < 280) return SoilPotassium.LOW;
  if (kKgHa < 400) return SoilPotassium.ADEQUATE;
  return SoilPotassium.HIGH;
}

export function mapPHToEnum(ph: number | undefined): SoilPH {
  if (ph === undefined || ph === null || isNaN(ph)) return SoilPH.UNKNOWN;
  if (ph < 5.0) return SoilPH.STRONGLY_ACIDIC;
  if (ph < 6.0) return SoilPH.MODERATELY_ACIDIC;
  if (ph < 6.5) return SoilPH.SLIGHTLY_ACIDIC;
  if (ph < 7.5) return SoilPH.NEUTRAL;
  if (ph < 8.0) return SoilPH.SLIGHTLY_ALKALINE;
  if (ph < 8.5) return SoilPH.MODERATELY_ALKALINE;
  return SoilPH.STRONGLY_ALKALINE;
}

export function mapOrganicCarbonToEnum(oc: number | undefined): SoilOrganicCarbon {
  if (oc === undefined || oc === null || isNaN(oc)) return SoilOrganicCarbon.UNKNOWN;
  if (oc < 0.25) return SoilOrganicCarbon.VERY_LOW;
  if (oc < 0.50) return SoilOrganicCarbon.LOW;
  if (oc < 0.75) return SoilOrganicCarbon.MEDIUM;
  return SoilOrganicCarbon.HIGH;
}

export function mapRainfallToEnum(mmLast7Days: number | undefined): RainfallRecent {
  if (mmLast7Days === undefined || mmLast7Days === null || isNaN(mmLast7Days)) return RainfallRecent.UNKNOWN;
  if (mmLast7Days === 0) return RainfallRecent.NO_RAIN;
  if (mmLast7Days <= 10) return RainfallRecent.LIGHT;
  if (mmLast7Days <= 50) return RainfallRecent.MODERATE;
  if (mmLast7Days <= 100) return RainfallRecent.HEAVY;
  return RainfallRecent.EXCESSIVE;
}

export function mapTemperatureToStress(tempC: number | undefined, cropType: CropType | string): TemperatureStress {
  if (tempC === undefined || tempC === null || isNaN(tempC)) return TemperatureStress.UNKNOWN;
  
  // Crop-specific thresholds (simplified)
  const warmSeasonCrops: string[] = [CropType.RICE, CropType.SUGARCANE, CropType.COTTON, CropType.MAIZE];
  const isWarmSeasonCrop = warmSeasonCrops.includes(String(cropType));
  
  if (isWarmSeasonCrop) {
    if (tempC < 10) return TemperatureStress.COLD_STRESS;
    if (tempC < 15) return TemperatureStress.MILD_COLD;
  } else {
    if (tempC < 5) return TemperatureStress.COLD_STRESS;
    if (tempC < 10) return TemperatureStress.MILD_COLD;
  }
  
  if (tempC <= 35) return TemperatureStress.OPTIMAL;
  if (tempC <= 40) return TemperatureStress.MILD_HEAT;
  if (tempC <= 45) return TemperatureStress.HEAT_STRESS;
  return TemperatureStress.EXTREME_HEAT;
}

export function mapHumidityToEnum(humidity: number | undefined): HumidityLevel {
  if (humidity === undefined || humidity === null || isNaN(humidity)) return HumidityLevel.UNKNOWN;
  if (humidity < 30) return HumidityLevel.VERY_LOW;
  if (humidity < 50) return HumidityLevel.LOW;
  if (humidity < 70) return HumidityLevel.NORMAL;
  if (humidity < 85) return HumidityLevel.HIGH;
  return HumidityLevel.VERY_HIGH;
}

// CROP RESOLVER — DB ONTOLOGY PASSTHROUGH
export function mapCropNameToEnum(cropName: string | undefined): CropType | string {
  if (!cropName) return CropType.UNKNOWN;
  const shortCode = unifiedNormalizeCropCode(cropName);
  const fullName = getFullCropName(shortCode);
  // Pure passthrough: return the DB canonical string. No hidden alias map.
  return (fullName && fullName !== 'UNKNOWN') ? fullName : CropType.UNKNOWN;
}

// STAGE RESOLVER — STRICT DB PASSTHROUGH
export function mapStageToEnum(stage: string | undefined): CropStage | string {
  if (!stage) return CropStage.UNKNOWN;
  const normalized = String(stage).trim().toUpperCase().replace(/[\s-]/g, '_');
  if (!normalized) return CropStage.UNKNOWN;
  // Pass ANY canonical DB stage through unchanged. Do NOT collapse unknowns
  // into CropStage.UNKNOWN — that erases DB ontology intelligence.
  return normalized;
}

// OBSERVATION → SYMBOL — STRICT DB PASSTHROUGH
export function mapObservationsToSymptom(observations: string[]): { primary: VisualSymptom | string; secondary: (VisualSymptom | string)[] } {
  if (!Array.isArray(observations) || observations.length === 0) {
    return { primary: VisualSymptom.UNKNOWN, secondary: [] };
  }

  const detected: string[] = [];
  const seen = new Set<string>();

  for (const obs of observations) {
    if (obs === null || obs === undefined) continue;
    const raw = String(obs).trim();
    if (!raw) continue;
    const normalized = raw.toUpperCase().replace(/[\s-]/g, '_');
    // Accept ANY canonical UPPER_SNAKE code produced by the ontology layer.
    if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    detected.push(normalized);
  }

  if (detected.length === 0) {
    return { primary: VisualSymptom.UNKNOWN, secondary: [] };
  }
  return { primary: detected[0], secondary: detected.slice(1) };
}


// Map a symptom string to a canonical symbol. PASSTHROUGH ONLY — no vernacular
export function mapVisualSymptomToEnum(symptom: string | undefined): VisualSymptom | string {
  if (!symptom) return VisualSymptom.UNKNOWN;
  const normalized = symptom.toUpperCase().replace(/-/g, '_').replace(/\s+/g, '_');
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    console.warn(`[CANONICAL_AUTHORITY] non-canonical symptom string rejected: "${symptom}" — resolve upstream via observation_aliases/observation_translations`);
    return VisualSymptom.UNKNOWN;
  }
  // Pass the canonical code through unchanged; do NOT re-map or infer.
  return normalized;
}

// ==================== MAIN STATE BUILDER ====================

// Extended input interface that supports both flat properties AND nested objects
// This ensures the function works with the orchestrator's actual call pattern
export interface BuildCanonicalStateInput {
  // NEW: CANONICAL CONTEXT (HIGHEST AUTHORITY when provided)
  canonicalContext?: {
    readonly crop_code: string;
    readonly crop_name: string;
    readonly growth_stage: string;
    readonly days_since_sowing: number | null;
    readonly ndvi: {
      readonly value: number | null;
      readonly trend: string | null;
    };
    readonly soil: {
      readonly nitrogen: number | null;
      readonly phosphorus: number | null;
      readonly potassium: number | null;
      readonly ph: number | null;
    };
    readonly is_locked: boolean;
  };
  
  // NESTED OBJECTS (from orchestrator - THESE ARE THE PRIMARY SOURCES)
  landContext?: {
    current_crop?: string;
    crop?: string;
    crop_code?: string;
    growth_stage?: string;
    stage?: string;
    days_since_sowing?: number;
    days_after_sowing?: number;
    sowing_date?: string;
    area_acres?: number;
    land_id?: string;
    region_code?: string | null; // FIX 4
    farmer_id?: string;
    district?: string;
    state?: string;
    irrigation_type?: string;
    farming_mode?: string;
    // PHASE 1 — Immutable BiologicalState (SSOT). When is_locked=true, its
    // growth_stage / das MUST override GDD and any heuristic writer.
    biological_state?: BiologicalState | null;
    ndvi?: {
      value?: number;
      mean_ndvi?: number;
      ndvi_trend?: string;
      captured_at?: string;
    };
    soil_health?: {
      nitrogen_kg_per_ha?: number;
      phosphorus_kg_per_ha?: number;
      potassium_kg_per_ha?: number;
      ph_level?: number;
      organic_carbon?: number;
      test_date?: string;
    };
  };
  
  soilData?: {
    nitrogen_kg_per_ha?: number;
    phosphorus_kg_per_ha?: number;
    potassium_kg_per_ha?: number;
    ph_level?: number;
    organic_carbon?: number;
    test_date?: string;
  };
  
  ndviData?: {
    value?: number;
    mean_ndvi?: number;
    trend?: string;
    ndvi_trend?: string;
    captured_at?: string;
  };
  
  weatherData?: {
    temperature?: number;
    humidity?: number;
    rainfall_last_7_days?: number;
    rain_probability?: number;
    timestamp?: string;
  };
  
  // GDD Phenology Result (MOST AUTHORITATIVE for stage)
  gddResult?: {
    growth_stage?: string;
    stage_name?: string;
    accumulated_gdd?: number;
  };
  
  // NLU Output
  nluOutput?: {
    crop_identification?: {
      crop_code?: string;
      crop_name?: string;
    };
    symptom_extraction?: {
      visual_symptoms?: Array<{ symptom_code: string }>;
    };
  };
  
  // FLAT PROPERTIES (legacy support - FALLBACK only if nested not provided)
  cropName?: string;
  cropStage?: string;
  daysAfterSowing?: number;
  landId?: string;
  farmerId?: string;
  district?: string;
  state?: string;
  
  // Farmer Observations
  farmerObservations?: string[];
  severity?: string;
  symptomDistribution?: string;
  
  // NDVI Data (flat)
  ndviValue?: number;
  ndviTrend?: number | string;
  ndviDataTimestamp?: string;
  
  // Soil Data (flat)
  nitrogenKgHa?: number;
  phosphorusKgHa?: number;
  potassiumKgHa?: number;
  soilPH?: number;
  organicCarbon?: number;
  soilDataTimestamp?: string;
  
  // Weather Data (flat)
  currentTempC?: number;
  humidityPercent?: number;
  rainfallLast7DaysMm?: number;
  weatherDataTimestamp?: string;
  
  // Additional Context
  recentFertilizerApplied?: boolean;
  recentPesticideApplied?: boolean;
  irrigationType?: string;
  farmingMode?: string;
  
  // Image Analysis Results
  imageAnalysisSymptoms?: string[];
  visionConfidence?: number;
}

export function buildCanonicalState(input: BuildCanonicalStateInput): CanonicalState {
  const now = new Date();
  
  // PHASE 2.5 FIX: AUTHORITATIVE SOURCE EXTRACTION
  
  const canonicalCtx = input.canonicalContext;
  const landContext = input.landContext;
  const gddResult = input.gddResult;
  const nluOutput = input.nluOutput;
  const soilData = input.soilData || landContext?.soil_health;
  const ndviData = input.ndviData || landContext?.ndvi;
  const weatherData = input.weatherData;
  
  // 1. CROP SOURCE PRIORITY (UPDATED: canonicalContext is HIGHEST when locked)
  const cropNameRaw = 
    (canonicalCtx?.is_locked && canonicalCtx?.crop_code && canonicalCtx.crop_code !== 'UNKNOWN')
      ? canonicalCtx.crop_code :           // ✅ HIGHEST: Locked canonical context
    landContext?.current_crop ||           // a) landContext.current_crop (database)
    landContext?.crop ||                   // a.1) alternative field name
    nluOutput?.crop_identification?.crop_code ||  // c) nluOutput crop
    nluOutput?.crop_identification?.crop_name ||
    input.cropName ||                      // d) flat property fallback
    'UNKNOWN';
  
  const cropSource = 
    (canonicalCtx?.is_locked && canonicalCtx?.crop_code && canonicalCtx.crop_code !== 'UNKNOWN')
      ? 'canonicalContext' 
    : landContext?.current_crop || landContext?.crop 
      ? 'landContext' 
    : nluOutput?.crop_identification?.crop_code 
      ? 'nluOutput' 
    : input.cropName 
      ? 'flat_input' 
      : 'none';
  
  // 2. STAGE SOURCE PRIORITY — BIOLOGICAL AUTHORITY FIRST
  const bioState = landContext?.biological_state;
  const bioStageLocked =
    !!bioState?.is_locked && !!bioState?.growth_stage &&
    String(bioState.growth_stage).toUpperCase() !== 'UNKNOWN';

  const cropStageRaw = 
    (canonicalCtx?.is_locked && canonicalCtx?.growth_stage && canonicalCtx.growth_stage !== 'UNKNOWN')
      ? canonicalCtx.growth_stage :
    bioStageLocked
      ? String(bioState!.growth_stage) :
    landContext?.growth_stage ||
    landContext?.stage ||
    gddResult?.growth_stage ||               // demoted below SSOT sources
    gddResult?.stage_name ||
    input.cropStage ||
    'UNKNOWN';
  
  const stageSource = 
    (canonicalCtx?.is_locked && canonicalCtx?.growth_stage && canonicalCtx.growth_stage !== 'UNKNOWN')
      ? 'canonicalContext'
    : bioStageLocked
      ? 'biological_state_ssot'
    : landContext?.growth_stage || landContext?.stage
      ? 'landContext'
    : gddResult?.growth_stage || gddResult?.stage_name
      ? 'GDD'
    : input.cropStage
      ? 'flat_input'
      : 'none';
  
  // 3b. DAYS AFTER TRANSPLANT (bioState locked > landContext). Distinct clock.
  const daysAfterTransplant =
    (bioState?.is_locked && (bioState as any).dat !== null && (bioState as any).dat !== undefined)
      ? (bioState as any).dat
      : ((landContext as any)?.days_after_transplant ?? (landContext as any)?.current_dat ?? null);

  // 3. DAYS AFTER SOWING (bioState locked > canonicalContext > landContext > flat)
  const daysAfterSowing = 
    (bioState?.is_locked && bioState.das !== null && bioState.das !== undefined)
      ? bioState.das :
    (canonicalCtx?.is_locked && canonicalCtx?.days_since_sowing !== null && canonicalCtx.days_since_sowing !== undefined)
      ? canonicalCtx.days_since_sowing :
    landContext?.days_since_sowing ??
    landContext?.days_after_sowing ??
    input.daysAfterSowing ??
    null;  // ✅ FIX: null = unknown, NOT 0 (which triggers young crop logic)
  
  // 4. NDVI SOURCE (per requirement: NOT_AVAILABLE vs UNKNOWN distinction)
  const ndviValue = ndviData?.value ?? ndviData?.mean_ndvi ?? input.ndviValue;
  const ndviTrend = ndviData?.trend || ndviData?.ndvi_trend || input.ndviTrend;
  const ndviTimestamp = ndviData?.captured_at || input.ndviDataTimestamp;
  const ndviAvailable = ndviValue !== undefined && ndviValue !== null;
  
  // 5. SOIL SOURCE (per requirement: NOT_TESTED vs missing distinction)
  const soilN = soilData?.nitrogen_kg_per_ha ?? input.nitrogenKgHa;
  const soilP = soilData?.phosphorus_kg_per_ha ?? input.phosphorusKgHa;
  const soilK = soilData?.potassium_kg_per_ha ?? input.potassiumKgHa;
  const soilPH = soilData?.ph_level ?? input.soilPH;
  const soilOC = soilData?.organic_carbon ?? input.organicCarbon;
  const soilTimestamp = soilData?.test_date || input.soilDataTimestamp;
  const soilTested = soilN !== undefined || soilP !== undefined || soilK !== undefined;
  
  // 6. WEATHER DATA
  const tempC = weatherData?.temperature ?? input.currentTempC;
  const humidity = weatherData?.humidity ?? input.humidityPercent;
  const rainfall = weatherData?.rainfall_last_7_days ?? input.rainfallLast7DaysMm;
  const weatherTimestamp = weatherData?.timestamp || input.weatherDataTimestamp;
  
  // 7. OTHER CONTEXT
  const landId = landContext?.land_id || input.landId;
  const farmerId = landContext?.farmer_id || input.farmerId;
  const district = landContext?.district || input.district;
  const state = landContext?.state || input.state;
  const irrigationType = landContext?.irrigation_type || input.irrigationType;
  const farmingMode = landContext?.farming_mode || input.farmingMode;
  const areaAcres = landContext?.area_acres;
  
  // LOG AUTHORITATIVE SOURCE SELECTION (for debugging)
  console.log(`📊 [CanonicalState] Built from authoritative sources:
    Crop: ${cropNameRaw} (source: ${cropSource})
    Stage: ${cropStageRaw} (source: ${stageSource})
    DAS: ${daysAfterSowing}
    NDVI: ${ndviAvailable ? ndviValue : 'NOT_AVAILABLE'} (trend: ${ndviTrend || 'UNKNOWN'})
    Soil: N=${soilN ?? 'NOT_TESTED'}, P=${soilP ?? 'NOT_TESTED'}, K=${soilK ?? 'NOT_TESTED'}
    Area: ${areaAcres ?? 'UNKNOWN'} acres
  `);
  
  // Map crop and stage using the extracted values (pure passthrough resolvers)
  const cropType = mapCropNameToEnum(cropNameRaw);
  const cropStage = mapStageToEnum(cropStageRaw);

  // CANONICAL_MUTATION_CHECK — STAGE
  const lockedStageRaw =
    (canonicalCtx?.is_locked && canonicalCtx?.growth_stage && canonicalCtx.growth_stage !== 'UNKNOWN')
      ? String(canonicalCtx.growth_stage)
      : null;
  if (lockedStageRaw) {
    const lockedNorm = lockedStageRaw.trim().toUpperCase().replace(/[\s-]/g, '_');
    const resolvedNorm = String(cropStage).toUpperCase();
    if (resolvedNorm !== lockedNorm) {
      throw new Error(
        `CANONICAL_AUTHORITY_VIOLATION: stage mutated from "${lockedNorm}" to "${resolvedNorm}" — ` +
        `crop_stage_master / BiologicalState is the SSOT; code must not reinterpret.`
      );
    }
  }
  // Also enforce input→output stage identity when no lock is present but a
  // raw stage was supplied.
  if (!lockedStageRaw && cropStageRaw && cropStageRaw !== 'UNKNOWN') {
    const inputNorm = String(cropStageRaw).trim().toUpperCase().replace(/[\s-]/g, '_');
    const resolvedNorm = String(cropStage).toUpperCase();
    if (inputNorm && resolvedNorm !== 'UNKNOWN' && resolvedNorm !== inputNorm) {
      throw new Error(
        `CANONICAL_AUTHORITY_VIOLATION: stage mutated from "${inputNorm}" to "${resolvedNorm}" — ` +
        `stage resolver must pass DB ontology strings through unchanged.`
      );
    }
  }

  // OBSERVATION_CODES — FIRST-CLASS ONTOLOGY PASSTHROUGH (SSOT)
  const rawObservations = [
    ...(input.farmerObservations || []),
    ...(input.imageAnalysisSymptoms || []),
  ]
    .map(o => (o == null ? '' : String(o).trim()))
    .filter(Boolean);

  const observationCodes: string[] = [];
  const seenObs = new Set<string>();
  for (const obs of rawObservations) {
    const upper = obs.toUpperCase().replace(/[\s-]/g, '_');
    if (!/^[A-Z][A-Z0-9_]*$/.test(upper)) continue;
    // Preserve original as-provided token (poor_germination stays lowercase)
    if (!seenObs.has(obs)) { seenObs.add(obs); observationCodes.push(obs); }
    // Also expose the canonical UPPER form when it differs
    if (upper !== obs && !seenObs.has(upper)) { seenObs.add(upper); observationCodes.push(upper); }
  }

  const allObservations = rawObservations;
  const normalizedObservationSet = new Set(
    allObservations.map(o => o.toUpperCase().replace(/[\s-]/g, '_')).filter(Boolean),
  );
  // BUG-3 FIX: symptom_count MUST count real farmer/sensor evidence only.
  const evidenceClass = classifyEvidence(Array.from(normalizedObservationSet));
  const symptomCount = evidenceClass.real_symptom_count;
  console.log(
    `[EVIDENCE_CLASSIFICATION] raw_count=${evidenceClass.raw_count} ` +
    `real_symptom_count=${evidenceClass.real_symptom_count} ` +
    `ignored_metadata_count=${evidenceClass.ignored_metadata_count} ` +
    `real=[${evidenceClass.real_codes.slice(0, 8).join(',')}] ` +
    `ignored=[${evidenceClass.ignored_codes.slice(0, 8).join(',')}]`
  );
  console.log(
    `[OBSERVATION_CODES_PASSTHROUGH] count=${observationCodes.length} ` +
    `codes=[${observationCodes.slice(0, 8).join(',')}]`
  );
  // SPRINT 3 FIX: Adaptive denominator (min 4) — see orchestrator coverage-gate notes.
  const symptomDataCompleteness = Math.min(1, symptomCount / Math.max(4, Math.min(8, symptomCount || 4)));
  const { primary: visualSymptom, secondary: secondarySymptoms } = mapObservationsToSymptom(allObservations);

  // GRAPH_AUTHORITY_VIOLATION — input observation set must survive intact.
  if (evidenceClass.real_symptom_count > 0 && observationCodes.length === 0) {
    throw new Error(
      `GRAPH_AUTHORITY_VIOLATION: real_symptom_count=${evidenceClass.real_symptom_count} ` +
      `but observation_codes=[] — canonical-state must transport ontology codes, not drop them.`
    );
  }


  // CANONICAL_MUTATION_CHECK — OBSERVATION
  const firstRealCode = evidenceClass.real_codes[0];
  if (firstRealCode) {
    const beforeNorm = firstRealCode.toUpperCase();
    const afterNorm = String(visualSymptom).toUpperCase();
    if (afterNorm !== 'UNKNOWN' && afterNorm !== beforeNorm) {
      throw new Error(
        `CANONICAL_AUTHORITY_VIOLATION: observation mutated from "${beforeNorm}" to "${afterNorm}" — ` +
        `observation_master / observation_aliases is the SSOT; canonical-state must transport, not translate.`
      );
    }
  }



  
  // Calculate data ages
  const ndviAgeHours = ndviTimestamp 
    ? (now.getTime() - new Date(ndviTimestamp).getTime()) / (1000 * 60 * 60)
    : undefined;
  
  const soilAgeDays = soilTimestamp
    ? (now.getTime() - new Date(soilTimestamp).getTime()) / (1000 * 60 * 60 * 24)
    : undefined;
  
  const weatherAgeHours = weatherTimestamp
    ? (now.getTime() - new Date(weatherTimestamp).getTime()) / (1000 * 60 * 60)
    : undefined;
  
  // Track data sources
  const dataSources = {
    farmer_description: (input.farmerObservations?.length || 0) > 0,
    ndvi_data: ndviAvailable,
    soil_test: soilTested,
    weather_data: tempC !== undefined || rainfall !== undefined,
    image_analysis: (input.imageAnalysisSymptoms?.length || 0) > 0,
    historical_data: false // TODO: implement historical data check
  };
  
  // Calculate data confidence
  const dataConfidence = calculateDataConfidence(dataSources, {
    ndviAgeHours,
    soilAgeDays,
    weatherAgeHours,
    visionConfidence: input.visionConfidence
  });
  
  // Map severity
  let severity = SeverityLevel.UNKNOWN;
  if (input.severity) {
    const s = input.severity.toLowerCase();
    if (s.includes('critical') || s.includes('severe')) severity = SeverityLevel.CRITICAL;
    else if (s.includes('high')) severity = SeverityLevel.HIGH;
    else if (s.includes('moderate') || s.includes('medium')) severity = SeverityLevel.MODERATE;
    else if (s.includes('low') || s.includes('mild')) severity = SeverityLevel.LOW;
    else if (s.includes('none')) severity = SeverityLevel.NONE;
  }
  
  // Map symptom distribution
  let symptomDist = SymptomDistribution.UNKNOWN;
  if (input.symptomDistribution) {
    const d = input.symptomDistribution.toLowerCase();
    if (d.includes('uniform') || d.includes('all')) symptomDist = SymptomDistribution.UNIFORM;
    else if (d.includes('patch') || d.includes('spot')) symptomDist = SymptomDistribution.PATCHY;
    else if (d.includes('border') || d.includes('edge')) symptomDist = SymptomDistribution.BORDER_ONLY;
    else if (d.includes('random') || d.includes('scatter')) symptomDist = SymptomDistribution.RANDOM;
    else if (d.includes('spread')) symptomDist = SymptomDistribution.SPREADING;
    else if (d.includes('cluster')) symptomDist = SymptomDistribution.CLUSTERED;
  }
  
  // Determine advisory risk level
  let advisoryRisk = AdvisoryRiskLevel.SAFE;
  if (dataConfidence === DataConfidence.VERY_LOW) {
    advisoryRisk = AdvisoryRiskLevel.DO_NOT_ADVISE;
  } else if (dataConfidence === DataConfidence.LOW) {
    advisoryRisk = AdvisoryRiskLevel.HIGH_RISK;
  } else if (severity === SeverityLevel.CRITICAL) {
    advisoryRisk = AdvisoryRiskLevel.CAUTION;
  }
  
  return {
    // Crop Context
    crop_type: cropType,
    crop_stage: cropStage,
    days_after_sowing: mapDaysToSowingBucket(daysAfterSowing),
    days_after_sowing_exact: daysAfterSowing,
    days_after_transplant: daysAfterTransplant,
    
    // Observation codes (FIRST-CLASS ontology passthrough — SSOT for rules)
    observation_codes: observationCodes,

    // Visual Symptoms (legacy label surface — do NOT branch decisions here)
    visual_symptom: visualSymptom,
    secondary_symptoms: secondarySymptoms,
    symptom_distribution: symptomDist,
    severity,
    affected_plant_parts: [],
    
    // NDVI (with NOT_AVAILABLE distinction)
    ndvi_level: ndviAvailable ? mapNDVIToLevel(ndviValue) : NDVILevel.UNKNOWN,
    ndvi_trend: mapNDVITrendToEnum(ndviTrend),
    ndvi_value: ndviValue,
    vegetation_uniformity: VegetationUniformity.UNKNOWN,
    ndvi_data_age_hours: ndviAgeHours,
    
    // Soil (with NOT_TESTED distinction) - FIXED: Use correct enum types
    soil_nitrogen: soilTested ? mapNitrogenToEnum(soilN) : SoilNitrogen.UNKNOWN,
    soil_phosphorus: soilTested ? mapPhosphorusToEnum(soilP) : SoilPhosphorus.UNKNOWN,
    soil_potassium: soilTested ? mapPotassiumToEnum(soilK) : SoilPotassium.UNKNOWN,
    soil_ph: mapPHToEnum(soilPH),
    soil_organic_carbon: mapOrganicCarbonToEnum(soilOC),
    soil_data_age_days: soilAgeDays,
    
    // Weather
    water_stress: WaterStress.UNKNOWN,
    rainfall_recent: mapRainfallToEnum(rainfall),
    temperature_stress: mapTemperatureToStress(tempC, cropType),
    humidity_level: mapHumidityToEnum(humidity),
    weather_data_age_hours: weatherAgeHours,
    
    // Pest/Disease
    pest_presence: PestPresence.UNKNOWN,
    disease_presence: DiseasePresence.UNKNOWN,
    
    // Farmer Context
    recent_fertilizer_applied: input.recentFertilizerApplied || false,
    recent_pesticide_applied: input.recentPesticideApplied || false,
    irrigation_type: irrigationType,
    farming_mode: (farmingMode?.toUpperCase() as any) || 'UNKNOWN',
    
    // Location
    district: district,
    state: state,
    
    // Safety
    data_confidence: dataConfidence,
    advisory_risk_level: advisoryRisk,
    data_sources: dataSources,
    symptom_count: symptomCount,
    data_completeness: symptomDataCompleteness,
    
    // Meta
    state_built_at: now.toISOString(),
    land_id: landId,
    region_code: input.landContext?.region_code ?? null, // FIX 4
    farmer_id: farmerId
  };
}

// ==================== DATA CONFIDENCE CALCULATOR ====================

export function calculateDataConfidence(
  sources: CanonicalState['data_sources'],
  ages: {
    ndviAgeHours?: number;
    soilAgeDays?: number;
    weatherAgeHours?: number;
    visionConfidence?: number;
  }
): DataConfidence {
  let score = 0;
  
  // Base score from data sources present
  if (sources.farmer_description) score += 1;
  if (sources.ndvi_data) score += 2;
  if (sources.soil_test) score += 2;
  if (sources.weather_data) score += 1;
  if (sources.image_analysis) score += 2;
  if (sources.historical_data) score += 1;
  
  // Penalties for stale data
  if (ages.ndviAgeHours !== undefined) {
    if (ages.ndviAgeHours > 168) score -= 2;  // > 7 days
    else if (ages.ndviAgeHours > 72) score -= 1; // > 3 days
  }
  
  if (ages.soilAgeDays !== undefined) {
    if (ages.soilAgeDays > 365) score -= 2;  // > 1 year
    else if (ages.soilAgeDays > 180) score -= 1; // > 6 months
  }
  
  if (ages.weatherAgeHours !== undefined) {
    if (ages.weatherAgeHours > 24) score -= 1;  // > 1 day
    else if (ages.weatherAgeHours > 6) score -= 0.5; // > 6 hours
  }
  
  // Vision confidence bonus/penalty
  if (ages.visionConfidence !== undefined) {
    if (ages.visionConfidence > 0.8) score += 1;
    else if (ages.visionConfidence < 0.5) score -= 1;
  }
  
  // Map score to confidence level
  if (score >= 6) return DataConfidence.HIGH;
  if (score >= 3) return DataConfidence.MEDIUM;
  if (score >= 1) return DataConfidence.LOW;
  return DataConfidence.VERY_LOW;
}

// ==================== PRESCRIPTION GATE ====================

export interface PrescriptionGateResult {
  allowed: boolean;
  reason: string;
  requiredData?: string[];
}

export function checkPrescriptionGate(state: CanonicalState): PrescriptionGateResult {
  // BUG-3 FIX: confirmed_observation_count MUST derive from real farmer/sensor
  const gateCodes: string[] = [
    state.visual_symptom as any,
    ...((state.secondary_symptoms as any[]) || []),
    ...(((state as any).confirmed_observations as any[]) || []),
  ];
  const gateClass = classifyEvidence(gateCodes);
  const confirmedObservationCount = gateClass.real_symptom_count;
  const candidateHypothesisCount = Number((state as any).candidate_hypothesis_count ?? 0);
  const matchedRulesCount = Number((state as any).matched_rules_count ?? 0);
  console.log(
    `[EVIDENCE_CLASSIFICATION] site=prescription_gate raw_count=${gateClass.raw_count} ` +
    `real_symptom_count=${gateClass.real_symptom_count} ` +
    `ignored_metadata_count=${gateClass.ignored_metadata_count}`
  );
  console.log(
    `[EVIDENCE_COUNT_TRACE] confirmed_observations=${confirmedObservationCount} ` +
    `candidate_hypotheses=${candidateHypothesisCount} matched_rules=${matchedRulesCount}`
  );

  // Gate 1: Data confidence must be at least MEDIUM
  if (state.data_confidence === DataConfidence.VERY_LOW) {
    return {
      allowed: false,
      reason: 'Insufficient data for prescription. Need more information.',
      requiredData: ['photo', 'soil_test', 'ndvi']
    };
  }
  
  if (state.data_confidence === DataConfidence.LOW) {
    // FIX 3: use confirmedObservationCount ONLY. Do not mix candidates/rules.
    const symptomCount = confirmedObservationCount;
    const directCompleteness = Number((state as any).data_completeness ?? 0);
    const inferredCompleteness = Math.min(1, symptomCount / Math.max(4, Math.min(8, symptomCount || 4)));
    const dataCompleteness = Math.max(directCompleteness, inferredCompleteness);
    const hasStrongEvidence = symptomCount >= 5 || dataCompleteness >= 0.7;
    
    if (hasStrongEvidence) {
      console.log(`   ✅ [PrescriptionGate] LOW confidence OVERRIDDEN — strong CONFIRMED evidence (confirmed_observations=${symptomCount}, completeness=${(dataCompleteness * 100).toFixed(0)}%)`);
      return {
        allowed: true,
        reason: 'Low data confidence overridden by strong confirmed observation evidence.',
        requiredData: getRequiredDataForConfidence(state)
      };
    }
    
    // Original block remains for cases with no/weak symptom evidence
    console.log(`   ⚠️ [PrescriptionGate] BLOCKED — LOW confidence, weak CONFIRMED evidence (confirmed_observations=${symptomCount}, completeness=${(dataCompleteness * 100).toFixed(0)}%)`);
    return {
      allowed: false,
      reason: 'Can diagnose but cannot prescribe treatment with low confidence.',
      requiredData: getRequiredDataForConfidence(state)
    };
  }
  
  // Gate 2: Advisory risk level check
  if (state.advisory_risk_level === AdvisoryRiskLevel.DO_NOT_ADVISE) {
    return {
      allowed: false,
      reason: 'Safety rules prevent giving advice in this situation.',
      requiredData: []
    };
  }
  
  // Gate 3: Crop type must be known
  if (state.crop_type === CropType.UNKNOWN) {
    return {
      allowed: false,
      reason: 'Cannot prescribe without knowing the crop type.',
      requiredData: ['crop_name']
    };
  }
  
  // Gate 4: Crop stage should be known for many prescriptions
  if (state.crop_stage === CropStage.UNKNOWN) {
    // Allow some prescriptions but flag it
    return {
      allowed: true,
      reason: 'Prescription allowed but accuracy may be limited without growth stage.',
      requiredData: ['sowing_date']
    };
  }
  
  return {
    allowed: true,
    reason: 'All gates passed. Prescription allowed.',
    requiredData: []
  };
}

// ==================== STATE SYNC (FIX 1) ====================
// SINGLE writer of graph-derived counts onto CanonicalState.
export function syncCanonicalStateFromSnapshot(
  state: CanonicalState,
  snapshot: GraphRuntimeSnapshot | null | undefined,
  opts: { trace_id?: string } = {},
): void {
  const anyState = state as any;
  if (!snapshot) {
    console.log(
      `[STATE_SYNC] trace=${opts.trace_id ?? 'n/a'} source=GRAPH_RUNTIME ` +
      `snapshot=absent hypotheses=0 rules=0`,
    );
    return;
  }
  const hypCount = snapshot.hypotheses.length;
  const ruleCount = snapshot.rules.length;
  const hypIds = snapshot.hypotheses.map((h) => h.id);
  const ruleIds = [...snapshot.rules];
  const orphanIds = [...snapshot.orphan_rule_ids];

  if (anyState.__graphStateSynced === true) {
    const priorH = Number(anyState.candidate_hypothesis_count ?? 0);
    const priorR = Number(anyState.matched_rules_count ?? 0);
    if (priorH !== hypCount || priorR !== ruleCount) {
      console.error(
        `[GRAPH_CONTRACT_VIOLATION] STATE_SYNC re-sync mismatch ` +
        `trace=${opts.trace_id ?? 'n/a'} prior_hyp=${priorH} prior_rules=${priorR} ` +
        `snapshot_hyp=${hypCount} snapshot_rules=${ruleCount}`,
      );
    } else {
      return; // idempotent no-op
    }
  }

  anyState.candidate_hypothesis_count = hypCount;
  anyState.matched_rules_count       = ruleCount;
  anyState.hypothesis_ids            = hypIds;
  anyState.rule_ids                  = ruleIds;
  anyState.orphan_rule_ids           = orphanIds;
  anyState.__graphStateSynced        = true;
  anyState.__graph_snapshot__        = snapshot;

  console.log(
    `[STATE_SYNC] trace=${opts.trace_id ?? 'n/a'} source=GRAPH_RUNTIME ` +
    `hypotheses=${hypCount} rules=${ruleCount} orphans=${orphanIds.length} ` +
    `state=${snapshot.graph_state}`,
  );
}


function getRequiredDataForConfidence(state: CanonicalState): string[] {
  const required: string[] = [];
  
  if (!state.data_sources.ndvi_data) required.push('ndvi_data');
  if (!state.data_sources.soil_test) required.push('soil_test');
  if (!state.data_sources.image_analysis) required.push('photo');
  if (!state.data_sources.weather_data) required.push('weather_data');
  
  return required;
}

// ==================== EXPORTS ====================

export const CanonicalStateBuilder = {
  build: buildCanonicalState,
  calculateConfidence: calculateDataConfidence,
  checkPrescriptionGate,
  syncCanonicalStateFromSnapshot,
  
  // Mappers
  mapCrop: mapCropNameToEnum,
  mapStage: mapStageToEnum,
  mapDays: mapDaysToSowingBucket,
  mapNDVI: mapNDVIToLevel,
  mapNDVITrend: mapNDVITrendToEnum,
  mapNitrogen: mapNitrogenToEnum,
  mapPhosphorus: mapPhosphorusToEnum,
  mapPotassium: mapPotassiumToEnum,
  mapPH: mapPHToEnum,
  mapOC: mapOrganicCarbonToEnum,
  mapRainfall: mapRainfallToEnum,
  mapTemperature: mapTemperatureToStress,
  mapHumidity: mapHumidityToEnum,
  mapObservations: mapObservationsToSymptom
};

// PHASE 5 — CANONICAL PROJECTION FROM GRAPH TRUTH
export interface CanonicalContextMetadata {
  crop_identified: boolean;
  photo: boolean;
  timing: string | null;
  ignored_codes: string[];
}

export function projectCanonicalStateFromGraphTruth(
  state: CanonicalState,
  graphTruth: {
    crop_code: string | null;
    biological_stage: string | null;
    canonical_observations: readonly string[];
    hash: string;
  } | null | undefined,
): CanonicalState {
  if (!graphTruth) {
    console.warn('[CANONICAL_PROJECTION_ONLY] skipped=no_graph_truth');
    return state;
  }

  const classified = classifyEvidence([...graphTruth.canonical_observations]);
  const ignoredUpper = classified.ignored_codes.map(c => c.toUpperCase());
  const metadata: CanonicalContextMetadata = {
    crop_identified: ignoredUpper.includes('CROP_IDENTIFIED'),
    photo: !ignoredUpper.includes('PHOTO_NOT_PROVIDED'),
    timing: ignoredUpper.includes('TIMING_UNKNOWN') ? null : null,
    ignored_codes: classified.ignored_codes,
  };

  const before = {
    crop: state.crop_type,
    stage: state.crop_stage,
    obs_len: state.observation_codes?.length ?? 0,
  };

  // Authoritative overwrite — GraphTruth wins.
  if (graphTruth.crop_code) state.crop_type = graphTruth.crop_code as any;
  if (graphTruth.biological_stage) state.crop_stage = graphTruth.biological_stage as any;
  state.observation_codes = [...classified.real_codes];
  (state as any).context_metadata = metadata;
  state.symptom_count = classified.real_symptom_count;

  console.log(
    `[CANONICAL_PROJECTION_ONLY] hash=${graphTruth.hash} ` +
      `crop:${before.crop}->${state.crop_type} ` +
      `stage:${before.stage}->${state.crop_stage} ` +
      `obs:${before.obs_len}->${state.observation_codes.length} ` +
      `real=[${state.observation_codes.join(',')}] ` +
      `ignored=[${classified.ignored_codes.join(',')}]`,
  );

  return state;
}

