/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POSITIVE DIAGNOSIS GENERATOR - GAP #1 FIX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Generate "NO_INTERVENTION_REQUIRED" as a POSITIVE terminal diagnosis
 * when crop is healthy and no treatment is needed.
 * 
 * AGRONOMIC RATIONALE:
 * 40-55% of early crop complaints are "monitor only" cases.
 * This is a SUCCESS, not a failure state.
 * 
 * VERSION: 1.0.0
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';

export const POSITIVE_DIAGNOSIS_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PositiveDiagnosisInput {
  ndvi_value: number | null;
  ndvi_trend: string | null;
  symptoms_count: number;
  symptoms_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'unknown';
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  rules_matched: number;
  land_state?: AuthoritativeLandState | null;
}

export interface PositiveDiagnosisOutput {
  is_positive: boolean;
  diagnosis_type: 'NO_INTERVENTION_REQUIRED' | 'MONITOR_AND_WAIT' | 'NEEDS_INVESTIGATION';
  confidence: number;
  follow_up_days: number;
  reason: string;
  reason_code: PositiveReasonCode;
  recommendations: string[];
}

export type PositiveReasonCode = 
  | 'HEALTHY_NDVI'
  | 'MILD_SYMPTOMS_NORMAL_GROWTH'
  | 'EARLY_STAGE_ADJUSTMENT'
  | 'NO_SPECIFIC_THREAT'
  | 'SEASONAL_VARIATION'
  | 'NEEDS_CLARIFICATION';

// ═══════════════════════════════════════════════════════════════════════════
// NDVI HEALTH THRESHOLDS BY STAGE
// ═══════════════════════════════════════════════════════════════════════════

const NDVI_HEALTHY_THRESHOLDS: Record<string, number> = {
  'GERMINATION': 0.25,
  'SEEDLING': 0.30,
  'TILLERING': 0.40,
  'VEGETATIVE': 0.45,
  'GRAND_GROWTH': 0.50,
  'FLOWERING': 0.48,
  'FRUITING': 0.45,
  'MATURITY': 0.35,
  'HARVEST': 0.25,
  'DEFAULT': 0.40
};

/**
 * Get NDVI health threshold for a specific growth stage
 */
function getNDVIThreshold(stage: string): number {
  const normalizedStage = stage.toUpperCase().replace(/[\s-]/g, '_');
  return NDVI_HEALTHY_THRESHOLDS[normalizedStage] || NDVI_HEALTHY_THRESHOLDS['DEFAULT'];
}

/**
 * Check if NDVI indicates healthy crop
 */
function isNDVIHealthy(ndviValue: number | null, stage: string): boolean {
  if (ndviValue === null) return false;
  const threshold = getNDVIThreshold(stage);
  return ndviValue >= threshold;
}

// ═══════════════════════════════════════════════════════════════════════════
// MILD SYMPTOM INDICATORS
// ═══════════════════════════════════════════════════════════════════════════

const MILD_SYMPTOM_INDICATORS = [
  'MILD_YELLOWING',
  'SLIGHT_WILTING',
  'MINOR_SPOTS',
  'LOWER_LEAF_YELLOWING',
  'EDGE_BROWNING'
];

/**
 * Check if symptoms indicate mild, non-critical issues
 */
function areSymptomsNonCritical(severity: string, symptomCount: number): boolean {
  if (severity === 'HIGH' || severity === 'CRITICAL') return false;
  if (symptomCount > 3) return false;
  return severity === 'LOW' || severity === 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN POSITIVE DIAGNOSIS EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate if the current state warrants a POSITIVE "no intervention" diagnosis.
 * 
 * This is a SUCCESS state, not a fallback.
 * 
 * Conditions for positive diagnosis:
 * 1. NDVI is healthy for the growth stage
 * 2. Symptoms are mild or non-specific
 * 3. No specific rules matched (meaning no clear pest/disease)
 * 4. Crop stage is progressing normally
 */
export function evaluatePositiveDiagnosis(
  input: PositiveDiagnosisInput
): PositiveDiagnosisOutput {
  console.log(`🌿 [PositiveDiagnosis] Evaluating healthy crop scenario...`);
  console.log(`   NDVI: ${input.ndvi_value}, Stage: ${input.growth_stage}, Symptoms: ${input.symptoms_count}`);
  
  const ndviHealthy = isNDVIHealthy(input.ndvi_value, input.growth_stage);
  const symptomsNonCritical = areSymptomsNonCritical(input.symptoms_severity, input.symptoms_count);
  const noRulesMatched = input.rules_matched === 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 1: HEALTHY NDVI + MILD SYMPTOMS + NO RULES → NO INTERVENTION REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (ndviHealthy && symptomsNonCritical && noRulesMatched) {
    console.log(`   ✅ POSITIVE DIAGNOSIS: Healthy crop, no intervention required`);
    
    return {
      is_positive: true,
      diagnosis_type: 'NO_INTERVENTION_REQUIRED',
      confidence: 0.85,
      follow_up_days: calculateFollowUpDays(input.growth_stage),
      reason: 'Crop is progressing well. Observed symptoms are within normal range for this growth stage.',
      reason_code: 'HEALTHY_NDVI',
      recommendations: [
        'Continue regular monitoring',
        'Maintain current irrigation schedule',
        'No treatment needed at this time'
      ]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 2: EARLY STAGE ADJUSTMENT (DAS < 30 with mild symptoms)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (input.days_since_sowing !== null && 
      input.days_since_sowing < 30 && 
      symptomsNonCritical && 
      noRulesMatched) {
    console.log(`   ✅ POSITIVE DIAGNOSIS: Early stage adjustment period`);
    
    return {
      is_positive: true,
      diagnosis_type: 'MONITOR_AND_WAIT',
      confidence: 0.78,
      follow_up_days: 7,
      reason: 'Crop is in early establishment phase. Mild symptoms often resolve as roots develop.',
      reason_code: 'EARLY_STAGE_ADJUSTMENT',
      recommendations: [
        'Allow 7 days for natural adjustment',
        'Ensure adequate soil moisture',
        'Avoid unnecessary interventions',
        'Report if symptoms worsen significantly'
      ]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 3: MILD SYMPTOMS WITH NORMAL GROWTH
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (symptomsNonCritical && input.symptoms_count <= 2 && noRulesMatched) {
    console.log(`   ✅ POSITIVE DIAGNOSIS: Mild symptoms, monitor only`);
    
    return {
      is_positive: true,
      diagnosis_type: 'MONITOR_AND_WAIT',
      confidence: 0.72,
      follow_up_days: 5,
      reason: 'Symptoms are mild and may be due to temporary environmental factors.',
      reason_code: 'MILD_SYMPTOMS_NORMAL_GROWTH',
      recommendations: [
        'Observe for 5-7 days',
        'Take photos if symptoms change',
        'No spray needed at this time'
      ]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 4: NOT A POSITIVE CASE → NEEDS INVESTIGATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`   ⚠️ NOT a positive diagnosis case - needs further investigation`);
  
  return {
    is_positive: false,
    diagnosis_type: 'NEEDS_INVESTIGATION',
    confidence: 0.50,
    follow_up_days: 3,
    reason: 'Symptoms require further investigation or clarification.',
    reason_code: 'NEEDS_CLARIFICATION',
    recommendations: []
  };
}

/**
 * Calculate appropriate follow-up days based on growth stage
 */
function calculateFollowUpDays(stage: string): number {
  const normalizedStage = stage.toUpperCase();
  
  // Early stages - more frequent monitoring
  if (['GERMINATION', 'SEEDLING'].includes(normalizedStage)) {
    return 5;
  }
  
  // Active growth - weekly monitoring
  if (['TILLERING', 'VEGETATIVE', 'GRAND_GROWTH'].includes(normalizedStage)) {
    return 7;
  }
  
  // Critical reproductive stages - careful monitoring
  if (['FLOWERING', 'FRUITING'].includes(normalizedStage)) {
    return 5;
  }
  
  // Late stages - can wait longer
  if (['MATURITY', 'HARVEST'].includes(normalizedStage)) {
    return 10;
  }
  
  return 7; // Default weekly check
}

// ═══════════════════════════════════════════════════════════════════════════
// TRILINGUAL POSITIVE DIAGNOSIS MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export const POSITIVE_DIAGNOSIS_MESSAGES: Record<PositiveReasonCode, { mr: string; hi: string; en: string }> = {
  'HEALTHY_NDVI': {
    mr: '✅ तुमचे पीक चांगले वाढत आहे. सध्या कोणत्याही उपचाराची गरज नाही. {follow_up_days} दिवसांनी पुन्हा तपासा.',
    hi: '✅ आपकी फसल अच्छी तरह बढ़ रही है। अभी कोई उपचार नहीं चाहिए। {follow_up_days} दिनों बाद फिर जांच करें।',
    en: '✅ Your crop is growing well. No treatment needed at this time. Check again in {follow_up_days} days.'
  },
  'MILD_SYMPTOMS_NORMAL_GROWTH': {
    mr: '🌱 हे लक्षणे सौम्य आहेत आणि सामान्यतः स्वतःच बरे होतात. {follow_up_days} दिवस निरीक्षण करा.',
    hi: '🌱 ये लक्षण हल्के हैं और आमतौर पर अपने आप ठीक हो जाते हैं। {follow_up_days} दिन निगरानी करें।',
    en: '🌱 These symptoms are mild and often resolve naturally. Monitor for {follow_up_days} days.'
  },
  'EARLY_STAGE_ADJUSTMENT': {
    mr: '🌾 पीक सुरुवातीच्या टप्प्यात आहे. मुळे विकसित होताना ही लक्षणे सामान्य असतात. {follow_up_days} दिवस थांबा.',
    hi: '🌾 फसल शुरुआती चरण में है। जड़ें विकसित होते समय ये लक्षण सामान्य हैं। {follow_up_days} दिन प्रतीक्षा करें।',
    en: '🌾 Crop is in early stage. These symptoms are normal as roots develop. Wait {follow_up_days} days.'
  },
  'NO_SPECIFIC_THREAT': {
    mr: '👍 कोणताही विशिष्ट धोका आढळला नाही. नियमित निरीक्षण सुरू ठेवा.',
    hi: '👍 कोई विशेष खतरा नहीं मिला। नियमित निगरानी जारी रखें।',
    en: '👍 No specific threat detected. Continue regular monitoring.'
  },
  'SEASONAL_VARIATION': {
    mr: '🌤️ हे हंगामातील सामान्य बदल आहेत. काळजी करण्याची गरज नाही.',
    hi: '🌤️ ये मौसमी सामान्य परिवर्तन हैं। चिंता की जरूरत नहीं।',
    en: '🌤️ These are normal seasonal variations. No cause for concern.'
  },
  'NEEDS_CLARIFICATION': {
    mr: 'अधिक माहिती आवश्यक आहे.',
    hi: 'अधिक जानकारी आवश्यक है।',
    en: 'More information needed.'
  }
};

/**
 * Get formatted positive diagnosis message in specified language
 */
export function getPositiveDiagnosisMessage(
  output: PositiveDiagnosisOutput,
  language: 'mr' | 'hi' | 'en'
): string {
  const template = POSITIVE_DIAGNOSIS_MESSAGES[output.reason_code][language];
  return template.replace('{follow_up_days}', output.follow_up_days.toString());
}
