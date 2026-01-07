/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DISEASE MANAGEMENT RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3-P4 (Crop Stage & Economic)
 * Based on: ICAR-IIHR Disease Diagnostic Manual, FRAC Guidelines
 * 
 * Scientific References:
 * - ICAR-IIHR Disease Diagnostic Manual 2022
 * - FRAC (Fungicide Resistance Action Committee) Code List 2023
 * - Brent & Hollomon 2007 - Fungicide resistance management
 * - Shtienberg 2013 - Disease forecasting and timing
 * - Madden et al. 2017 - The Study of Plant Disease Epidemics
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  FungicideGroup,
  DiseaseSeverityIndex,
  DecisionInput 
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  return defaultValue;
}

function str(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE SEVERITY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiseaseThreshold {
  cropType: 'HIGH_VALUE' | 'FIELD';
  preventiveThreshold: number;
  actionThreshold: number;
  emergencyThreshold: number;
}

export const DISEASE_THRESHOLDS: DiseaseThreshold[] = [
  { cropType: 'HIGH_VALUE', preventiveThreshold: 5, actionThreshold: 10, emergencyThreshold: 25 },
  { cropType: 'FIELD', preventiveThreshold: 10, actionThreshold: 20, emergencyThreshold: 40 },
];

// ═══════════════════════════════════════════════════════════════════════════
// BACTERIAL VS FUNGAL DIFFERENTIATION
// ═══════════════════════════════════════════════════════════════════════════

export interface DiseaseIndicator {
  type: 'BACTERIAL' | 'FUNGAL';
  indicators: string[];
  treatment: string;
  prevention: string;
}

export const DISEASE_INDICATORS: DiseaseIndicator[] = [
  {
    type: 'BACTERIAL',
    indicators: [
      'Angular spots (limited by leaf veins)',
      'Water-soaked appearance',
      'Bacterial ooze/exudate visible',
      'Rapid spread in warm, humid conditions',
      'Foul odor (some bacterial diseases)',
      'Systemic wilting without root damage',
    ],
    treatment: 'Copper-based bactericides, streptomycin (limited), sanitation',
    prevention: 'Avoid overhead irrigation, tool sanitation critical',
  },
  {
    type: 'FUNGAL',
    indicators: [
      'Circular to irregular spots',
      'Fungal growth/spores visible (white, gray, black)',
      'Gradual spread',
      'Responds to humidity cycles',
      'Powdery or fuzzy appearance',
    ],
    treatment: 'Fungicides effective, multiple chemical classes',
    prevention: 'Improve air circulation, reduce humidity',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNGICIDE MOA ROTATION DATA (FRAC Groups)
// ═══════════════════════════════════════════════════════════════════════════

export interface FungicideMOAData {
  group: FungicideGroup;
  fracCode: string;
  examples: string[];
  mode: string;
  resistanceRisk: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';
  use: string;
  maxApplicationsPerSeason: number;
}

export const FUNGICIDE_MOA_DATA: FungicideMOAData[] = [
  {
    group: FungicideGroup.GROUP_M_MULTISITE,
    fracCode: 'M',
    examples: ['Mancozeb', 'Chlorothalonil', 'Copper oxychloride'],
    mode: 'Multi-site contact',
    resistanceRisk: 'VERY_LOW',
    use: 'Preventive, protectant',
    maxApplicationsPerSeason: 8,
  },
  {
    group: FungicideGroup.GROUP_3_DMI_TRIAZOLES,
    fracCode: '3',
    examples: ['Propiconazole', 'Tebuconazole', 'Hexaconazole'],
    mode: 'Sterol biosynthesis inhibitor (DMI)',
    resistanceRisk: 'MEDIUM',
    use: 'Curative, systemic',
    maxApplicationsPerSeason: 3,
  },
  {
    group: FungicideGroup.GROUP_7_SDHI,
    fracCode: '7',
    examples: ['Boscalid', 'Fluxapyroxad'],
    mode: 'Respiration inhibitor (Complex II)',
    resistanceRisk: 'MEDIUM_HIGH',
    use: 'Preventive + curative',
    maxApplicationsPerSeason: 2,
  },
  {
    group: FungicideGroup.GROUP_11_STROBILURINS,
    fracCode: '11',
    examples: ['Azoxystrobin', 'Pyraclostrobin'],
    mode: 'Respiration inhibitor (Complex III)',
    resistanceRisk: 'HIGH',
    use: 'Curative, systemic',
    maxApplicationsPerSeason: 2,
  },
  {
    group: FungicideGroup.GROUP_BIOLOGICAL,
    fracCode: 'BM',
    examples: ['Trichoderma viride', 'Pseudomonas fluorescens'],
    mode: 'Competitive exclusion, antibiosis',
    resistanceRisk: 'VERY_LOW',
    use: 'Preventive, soil/seed treatment',
    maxApplicationsPerSeason: 10,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMAL FUNGICIDE ROTATION SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════

export const OPTIMAL_ROTATION_SEQUENCE: { spray: number; group: string; purpose: string }[] = [
  { spray: 1, group: 'Group M (Multi-site)', purpose: 'Preventive protection' },
  { spray: 2, group: 'Group 3 (Triazole)', purpose: 'If disease appears - curative' },
  { spray: 3, group: 'Group M (Multi-site)', purpose: 'Protectant' },
  { spray: 4, group: 'Group 11 (Strobilurin)', purpose: 'If disease persists - strong curative' },
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE-SPECIFIC TIMING DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface DiseaseTimingData {
  disease: string;
  crop: string;
  trigger: string;
  sprayInterval: { low: string; medium: string; high: string };
  stopCondition: string;
}

export const DISEASE_TIMING_DATA: DiseaseTimingData[] = [
  {
    disease: 'Late Blight',
    crop: 'Potato/Tomato',
    trigger: 'DSV (Disease Severity Values) accumulation or humid conditions',
    sprayInterval: { low: '10-14 days', medium: '7-10 days', high: '5-7 days' },
    stopCondition: 'Dry weather or harvest',
  },
  {
    disease: 'Powdery Mildew',
    crop: 'Multiple',
    trigger: 'First sign of white powdery growth',
    sprayInterval: { low: '10-14 days', medium: '7-10 days', high: '7 days' },
    stopCondition: 'When weather <20°C and low humidity',
  },
  {
    disease: 'Downy Mildew',
    crop: 'Grapes/Vegetables',
    trigger: 'Cool nights + humid days',
    sprayInterval: { low: '10-14 days', medium: '7-10 days', high: '7 days' },
    stopCondition: 'Dry weather stabilizes',
  },
  {
    disease: 'Rice Blast',
    crop: 'Rice',
    trigger: 'High humidity >90% + temperature 25-30°C',
    sprayInterval: { low: '10-14 days', medium: '7-10 days', high: '5-7 days' },
    stopCondition: 'Weather becomes unfavorable',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE MANAGEMENT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_MANAGEMENT_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE IDENTIFICATION RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_001',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const symptoms = Array.isArray(input.metadata?.diseaseSymptoms) ? input.metadata.diseaseSymptoms as string[] : [];
      const bacterialIndicators = ['angular_spots', 'water_soaked', 'bacterial_ooze', 'foul_odor'];
      const bacterialCount = symptoms.filter((s: string) => bacterialIndicators.includes(s)).length;
      return bacterialCount >= 2;
    },
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Bacterial disease indicators: angular spots, water-soaked lesions, bacterial ooze. Treatment: Copper-based bactericides only.',
    icar_package: 'ICAR Bacterial Disease Management',
  },
  
  {
    rule_id: 'DISEASE_002',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const symptoms = Array.isArray(input.metadata?.diseaseSymptoms) ? input.metadata.diseaseSymptoms as string[] : [];
      const fungalIndicators = ['circular_spots', 'fungal_growth', 'powdery_coating', 'fuzzy_appearance'];
      const fungalCount = symptoms.filter((s: string) => fungalIndicators.includes(s)).length;
      return fungalCount >= 2;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Fungal disease indicators: circular spots, visible spores/growth. Multiple fungicide options available.',
    icar_package: 'ICAR Fungal Disease Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WILT DISEASE ZERO TOLERANCE RULE
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_003',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const wiltDetected = bool(input.metadata?.wiltDiseaseDetected);
      return wiltDetected;
    },
    cause: Cause.WILT_ZERO_TOLERANCE,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR Wilt Management Guidelines',
    scientific_basis: 'Wilt diseases (Fusarium/Verticillium) are soilborne, systemic, with no cure once established. ACTION: 1 plant wilted = remove immediately, burn/bury deep, treat soil 1m radius, avoid replanting susceptible crop.',
    icar_package: 'ICAR Wilt Disease Protocol',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE SEVERITY THRESHOLD RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_004',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const isHighValue = bool(input.metadata?.highValueCrop);
      // High value crops: preventive threshold at 5%
      return isHighValue && dsi > 5 && dsi <= 10;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'James & Teng 1979 - Disease severity assessment',
    scientific_basis: 'High value crops (vegetables, fruits): preventive threshold DSI > 5%. Apply protectant fungicide (Group M).',
    icar_package: 'ICAR Disease Threshold Guidelines',
  },
  
  {
    rule_id: 'DISEASE_005',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const isHighValue = bool(input.metadata?.highValueCrop);
      // High value crops: action threshold at 10%
      return isHighValue && dsi > 10 && dsi <= 25;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Disease Assessment Keys',
    scientific_basis: 'High value crops action threshold DSI > 10%. Apply systemic fungicide (Group 3 or 11).',
    icar_package: 'ICAR Disease Action Protocol',
  },
  
  {
    rule_id: 'DISEASE_006',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const isHighValue = bool(input.metadata?.highValueCrop);
      // High value crops: emergency threshold at 25%
      return isHighValue && dsi > 25;
    },
    cause: Cause.DISEASE_OUTBREAK_DETECTED,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'FAO Emergency Disease Protocol',
    scientific_basis: 'Emergency threshold DSI > 25% for high value crops. Immediate intensive treatment + sanitation required.',
    icar_package: 'ICAR Emergency Disease Management',
  },
  
  {
    rule_id: 'DISEASE_007',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const isFieldCrop = !bool(input.metadata?.highValueCrop);
      // Field crops: action threshold at 20%
      return isFieldCrop && dsi > 20 && dsi <= 40;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Field Crop Disease Management',
    scientific_basis: 'Field crops (cotton, rice, wheat) action threshold DSI > 20%. Fungicide application recommended.',
    icar_package: 'ICAR Field Crop Disease Protocol',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL STAGE THRESHOLD ADJUSTMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_008',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const isReproductive = input.crop_stage === CropStage.REPRODUCTIVE;
      // Flowering to grain filling: reduce threshold by 50%
      return isReproductive && dsi > 5;
    },
    cause: Cause.CRITICAL_STAGE_THRESHOLD_ADJUSTED,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Critical Stage Protection',
    scientific_basis: 'Flowering to grain filling is maximum vulnerability period. Threshold reduced by 50%. Protect at all costs.',
    icar_package: 'ICAR Reproductive Stage Disease Protection',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // FUNGICIDE ROTATION RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_009',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const lastFungicideGroup = str(input.metadata?.lastFungicideGroup);
      const currentPlanned = str(input.metadata?.plannedFungicideGroup);
      // Same group used consecutively
      return lastFungicideGroup !== '' && 
             lastFungicideGroup === currentPlanned &&
             lastFungicideGroup !== FungicideGroup.GROUP_M_MULTISITE; // Multi-site OK to repeat
    },
    cause: Cause.FUNGICIDE_ROTATION_NEEDED,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'FRAC (Fungicide Resistance Action Committee) Code List 2023',
    scientific_basis: 'Never use same fungicide mode of action consecutively. Minimum 3 different modes per season. Rotate to prevent resistance.',
    icar_package: 'ICAR Fungicide Resistance Management',
  },
  
  {
    rule_id: 'DISEASE_010',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const strobilurinCount = num(input.metadata?.strobilurinApplicationsThisSeason);
      return strobilurinCount >= 2;
    },
    cause: Cause.RESISTANCE_RISK_HIGH,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'Brent & Hollomon 2007 - Fungicide resistance management',
    scientific_basis: 'Strobilurins (Group 11) have HIGH resistance risk. Maximum 2 applications per season. Switch to different MOA.',
    icar_package: 'ICAR Strobilurin Use Guidelines',
  },
  
  {
    rule_id: 'DISEASE_011',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const triazoleCount = num(input.metadata?.triazoleApplicationsThisSeason);
      return triazoleCount >= 3;
    },
    cause: Cause.FUNGICIDE_ROTATION_NEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'FRAC Guidelines',
    scientific_basis: 'Triazoles (Group 3) have MEDIUM resistance risk. Maximum 3 applications per season. Rotate with multi-site or biologicals.',
    icar_package: 'ICAR DMI Fungicide Guidelines',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE-SPECIFIC RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_012',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const isTomato = str(input.crop_code).toLowerCase().includes('tomato');
      const humidity = num(input.weather?.humidity);
      const temp = num(input.weather?.temperature);
      // Late blight favorable: 15-25°C, >90% humidity
      return isTomato && humidity > 85 && temp >= 15 && temp <= 25;
    },
    cause: Cause.LATE_BLIGHT_RISK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'Blitecast Model, Shtienberg 2013',
    scientific_basis: 'Late blight favorable conditions: 15-25°C with >85% humidity. Apply prophylactic fungicide. Spray interval: 5-7 days.',
    icar_package: 'ICAR Late Blight Management',
  },
  
  {
    rule_id: 'DISEASE_013',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const powderyMildewDetected = bool(input.metadata?.powderyMildewObserved);
      const temp = num(input.weather?.temperature);
      const humidity = num(input.weather?.humidity);
      // Powdery mildew favorable: moderate temp, not too humid
      return powderyMildewDetected || (temp >= 20 && temp <= 30 && humidity >= 40 && humidity <= 70);
    },
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Powdery Mildew Management',
    scientific_basis: 'Powdery mildew: first sign of white powdery growth triggers action. Spray interval 7-10 days. Stop when <20°C and low humidity.',
    icar_package: 'ICAR Powdery Mildew Control',
  },
  
  {
    rule_id: 'DISEASE_014',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const downyMildewRisk = bool(input.metadata?.downyMildewRisk);
      const coolNights = num(input.weather?.temperature) < 20;
      const humidDays = num(input.weather?.humidity) > 80;
      return downyMildewRisk || (coolNights && humidDays);
    },
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Downy Mildew Management',
    scientific_basis: 'Downy mildew: cool nights + humid days trigger. Apply preventive fungicide before symptoms. Spray interval 7-14 days.',
    icar_package: 'ICAR Downy Mildew Protocol',
  },
  
  {
    rule_id: 'DISEASE_015',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const isRice = str(input.crop_code).toLowerCase().includes('rice');
      const humidity = num(input.weather?.humidity);
      const temp = num(input.weather?.temperature);
      // Rice blast favorable: >90% humidity, 25-30°C
      return isRice && humidity > 90 && temp >= 25 && temp <= 30;
    },
    cause: Cause.RICE_BLAST_RISK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR-CRRI Rice Blast Management',
    scientific_basis: 'Rice blast: humidity >90%, temperature 25-30°C. Apply Tricyclazole or Isoprothiolane. Critical at tillering and panicle initiation.',
    icar_package: 'ICAR Rice Blast IPM',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // APPLICATION TIMING OPTIMIZATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_016',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const symptoms = Array.isArray(input.metadata?.diseaseSymptoms) ? input.metadata.diseaseSymptoms : [];
      const diseaseDetected = symptoms.length > 0;
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      // Early curative window: <5% severity
      return diseaseDetected && dsi > 0 && dsi < 5;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'Shtienberg 2013 - Disease forecasting and timing',
    scientific_basis: 'Early curative window (DSI <5%): apply systemic fungicide within 24-48 hours of first symptoms. Efficacy 80-90%.',
    icar_package: 'ICAR Early Disease Intervention',
  },
  
  {
    rule_id: 'DISEASE_017',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      // Late curative: >10% severity - damage already done
      return dsi > 10;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'Madden et al. 2017 - Plant Disease Epidemics',
    scientific_basis: 'Late curative (DSI >10%): use systemic + contact mixture. Efficacy 50-70%. Focus on preventing further spread. Damage already done.',
    icar_package: 'ICAR Late Stage Disease Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER-DEPENDENT TIMING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_018',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const humidity = num(input.weather?.humidity);
      const continuousHumidDays = num(input.metadata?.continuousHighHumidityDays);
      // Disease favorable: >3 days continuous high humidity
      return humidity > 80 && continuousHumidDays >= 3;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'Disease Forecasting Models',
    scientific_basis: 'Preventive application trigger: >3 days continuous humidity >80%. Apply protectant fungicide (Group M) before disease appears.',
    icar_package: 'ICAR Weather-Based Disease Forecasting',
  },
  
  {
    rule_id: 'DISEASE_019',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const historicalDisease = bool(input.metadata?.diseaseHistoryInField);
      const susceptibleStage = input.crop_stage === CropStage.REPRODUCTIVE;
      return historicalDisease && susceptibleStage;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Integrated Disease Management',
    scientific_basis: 'Historical disease pressure in field + susceptible growth stage = preventive fungicide application recommended.',
    icar_package: 'ICAR Preventive Disease Strategy',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // BIOLOGICAL CONTROL INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'DISEASE_020',
    category: 'disease',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input: DecisionInput): boolean => {
      const earlyCropStage = input.crop_stage === CropStage.SOWING || input.crop_stage === CropStage.GERMINATION;
      const soilborneDiseaseRisk = bool(input.metadata?.soilborneDiseaseHistory);
      return earlyCropStage && soilborneDiseaseRisk;
    },
    cause: Cause.ROOT_ROT_RISK,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Biological Disease Control',
    scientific_basis: 'Soilborne disease risk: apply Trichoderma viride seed treatment (10g/kg seed) + soil application. Prevents damping off and root rot.',
    icar_package: 'ICAR Trichoderma Application Protocol',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get disease threshold based on crop type
 */
export function getDiseaseThreshold(isHighValueCrop: boolean): DiseaseThreshold {
  return isHighValueCrop ? DISEASE_THRESHOLDS[0] : DISEASE_THRESHOLDS[1];
}

/**
 * Differentiate bacterial vs fungal disease
 */
export function differentiateDisease(symptoms: string[]): { type: 'BACTERIAL' | 'FUNGAL' | 'UNCLEAR'; confidence: number } {
  const bacterialIndicators = DISEASE_INDICATORS[0].indicators;
  const fungalIndicators = DISEASE_INDICATORS[1].indicators;
  
  const bacterialScore = symptoms.filter(s => 
    bacterialIndicators.some(i => s.toLowerCase().includes(i.toLowerCase()))
  ).length;
  
  const fungalScore = symptoms.filter(s => 
    fungalIndicators.some(i => s.toLowerCase().includes(i.toLowerCase()))
  ).length;
  
  if (bacterialScore > fungalScore + 2) {
    return { type: 'BACTERIAL', confidence: bacterialScore / (bacterialScore + fungalScore) };
  } else if (fungalScore > bacterialScore + 2) {
    return { type: 'FUNGAL', confidence: fungalScore / (bacterialScore + fungalScore) };
  }
  return { type: 'UNCLEAR', confidence: 0.5 };
}

/**
 * Get fungicide MOA data
 */
export function getFungicideMOAData(group: FungicideGroup): FungicideMOAData | undefined {
  return FUNGICIDE_MOA_DATA.find(f => f.group === group);
}

/**
 * Get recommended fungicide rotation
 */
export function getRotationRecommendation(lastGroup: FungicideGroup): FungicideGroup[] {
  const allGroups = Object.values(FungicideGroup);
  return allGroups.filter(g => g !== lastGroup && g !== FungicideGroup.GROUP_UNKNOWN);
}

/**
 * Calculate Disease Severity Index
 */
export function calculateDSI(
  ratings: { rating: number; plants: number }[],
  maxRating: number = 5
): number {
  const sumProducts = ratings.reduce((sum, r) => sum + (r.rating * r.plants), 0);
  const totalPlants = ratings.reduce((sum, r) => sum + r.plants, 0);
  return (sumProducts / (totalPlants * maxRating)) * 100;
}

/**
 * Get disease timing data
 */
export function getDiseaseTimingData(disease: string): DiseaseTimingData | undefined {
  return DISEASE_TIMING_DATA.find(d => d.disease.toLowerCase() === disease.toLowerCase());
}

/**
 * Get spray interval based on disease pressure
 */
export function getSprayInterval(
  disease: string,
  pressure: 'low' | 'medium' | 'high'
): string {
  const timingData = getDiseaseTimingData(disease);
  if (!timingData) return '7-10 days';
  return timingData.sprayInterval[pressure];
}

export default DISEASE_MANAGEMENT_RULES;
