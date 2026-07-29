// CONFIDENCE CALCULATOR - MULTI-FACTOR CONFIDENCE SCORING

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { SymbolicFact, Hypothesis, FiredRule } from './symbolic-reasoner.ts';

// TYPE DEFINITIONS

export interface ConfidenceScore {
  overall: number;  // 0-1
  breakdown: {
    rule_matching: number;
    data_quality: number;
    data_freshness: number;
    symptom_specificity: number;
    historical_success: number;
  };
  level: ConfidenceLevel;
  explanation: string;
  
  // PART 8: DUAL INDEPENDENT CONFIDENCE SIGNALS
  data_quality_confidence: number;      // 0-1: How well we can recommend specific doses
  symptom_diagnosis_confidence: number; // 0-1: How confidently we can name the cause
}

export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';

export interface ConfidenceInput {
  diagnosis: Hypothesis | null;
  firedRules: FiredRule[];
  facts: SymbolicFact;
  landState: AuthoritativeLandState | null;
}

// STAGE-SPECIFIC CONFIDENCE THRESHOLDS (ICAR-aligned)

export const STAGE_CONFIDENCE_THRESHOLDS: Record<string, number> = {
  'GERMINATION': 0.90,      // Critical - wrong treatment kills seedlings
  'SEEDLING': 0.88,         // Very sensitive stage
  'TILLERING': 0.80,        // Moderate tolerance
  'VEGETATIVE': 0.75,       // Can recover from minor mistakes
  'GRAND_GROWTH': 0.70,     // Most resilient stage
  'FLOWERING': 0.85,        // Critical for yield - pollinator safety
  'FRUITING': 0.80,         // PHI concerns become relevant
  'MATURITY': 0.65,         // Harvest approaching
  'HARVEST': 0.60,          // Low risk at this stage
  'SQUARING': 0.85,         // Cotton critical stage
  'BOLL_FORMATION': 0.80,   // Cotton yield critical
  'DEFAULT': 0.75           // Fallback
};

export const CROP_CONFIDENCE_ADJUSTMENTS: Record<string, number> = {
  // High-value crops need higher confidence
  'TOMATO': 0.05,
  'COTTON': 0.05,
  'GRAPE': 0.08,
  'POMEGRANATE': 0.08,
  'ONION': 0.03,
  // Staple crops have slightly lower threshold
  'RICE': -0.02,
  'WHEAT': -0.02,
  'SUGARCANE': 0,
  'SOYBEAN': 0,
  'DEFAULT': 0
};

// Get calibrated confidence threshold for specific crop + stage combination
export function getCalibratedThreshold(cropCode: string, growthStage: string): number {
  const baseThreshold = STAGE_CONFIDENCE_THRESHOLDS[growthStage?.toUpperCase()] || 
                        STAGE_CONFIDENCE_THRESHOLDS['DEFAULT'];
  const cropAdjustment = CROP_CONFIDENCE_ADJUSTMENTS[cropCode?.toUpperCase()] || 
                         CROP_CONFIDENCE_ADJUSTMENTS['DEFAULT'];
  
  // Clamp between 0.60 and 0.95
  return Math.min(0.95, Math.max(0.60, baseThreshold + cropAdjustment));
}

// CONFIDENCE CALCULATOR CLASS

export class ConfidenceCalculator {
  
  // Calculate comprehensive confidence score with stage-aware thresholds
  calculateConfidence(input: ConfidenceInput): ConfidenceScore {
    console.log('📊 [ConfidenceCalculator] Calculating multi-factor confidence...');
    
    const { diagnosis, firedRules, facts, landState } = input;
    
    // 1. Rule-based confidence
    const ruleMatching = this.calculateRuleConfidence(firedRules, diagnosis);
    console.log(`   Rule matching: ${(ruleMatching * 100).toFixed(0)}%`);
    
    // 2. Data quality (completeness)
    const dataQuality = this.calculateDataQuality(facts, landState);
    console.log(`   Data quality: ${(dataQuality * 100).toFixed(0)}%`);
    
    // 3. Data freshness
    const dataFreshness = this.calculateDataFreshness(landState);
    console.log(`   Data freshness: ${(dataFreshness * 100).toFixed(0)}%`);
    
    // 4. Symptom specificity
    const symptomSpecificity = this.calculateSymptomSpecificity(facts);
    console.log(`   Symptom specificity: ${(symptomSpecificity * 100).toFixed(0)}%`);
    
    // 5. Historical success (placeholder - would query from feedback table)
    const historicalSuccess = 0.7; // Default 70% when no historical data
    
    // PART 8: DUAL INDEPENDENT CONFIDENCE COMPUTATION
    
    // Signal 1: Symptom Diagnosis Confidence (can we NAME the cause?)
    // Based on rule matching + symptom specificity (NOT data quality)
    const symptomDiagnosisConfidence = Math.min(0.98,
      ruleMatching * 0.55 + symptomSpecificity * 0.35 + historicalSuccess * 0.10
    );
    
    // Signal 2: Data Quality Confidence (can we recommend specific DOSES?)
    // Based on data quality + data freshness (NOT symptoms)
    const dataQualityConfidence = Math.min(0.98,
      dataQuality * 0.50 + dataFreshness * 0.35 + historicalSuccess * 0.15
    );
    
    console.log(`   🔬 Symptom Diagnosis Confidence: ${(symptomDiagnosisConfidence * 100).toFixed(0)}% (drives cause identification)`);
    console.log(`   📋 Data Quality Confidence: ${(dataQualityConfidence * 100).toFixed(0)}% (drives dosage precision)`);
    
    // Overall: Weighted combination (symptom confidence drives the decision)
    // CRITICAL: symptom_diagnosis dominates — low data quality should NOT block diagnosis
    const weights = {
      rule_matching: 0.35,
      data_quality: 0.15, // REDUCED from 0.20 — data gaps should NOT block diagnosis
      data_freshness: 0.10, // REDUCED from 0.15
      symptom_specificity: 0.30, // INCREASED from 0.20 — symptoms are primary signal
      historical_success: 0.10
    };
    
    const overall = 
      ruleMatching * weights.rule_matching +
      dataQuality * weights.data_quality +
      dataFreshness * weights.data_freshness +
      symptomSpecificity * weights.symptom_specificity +
      historicalSuccess * weights.historical_success;
    
    // Cap at 98%
    const cappedOverall = Math.min(0.98, overall);
    
    // Categorize
    const level = this.categorizeConfidence(cappedOverall);
    const explanation = this.generateExplanation(level, {
      ruleMatching,
      dataQuality,
      dataFreshness,
      symptomSpecificity
    });
    
    console.log(`   Overall: ${(cappedOverall * 100).toFixed(0)}% (${level})`);
    
    return {
      overall: cappedOverall,
      breakdown: {
        rule_matching: ruleMatching,
        data_quality: dataQuality,
        data_freshness: dataFreshness,
        symptom_specificity: symptomSpecificity,
        historical_success: historicalSuccess
      },
      level,
      explanation,
      data_quality_confidence: dataQualityConfidence,
      symptom_diagnosis_confidence: symptomDiagnosisConfidence
    };
  }
  
  // Calculate confidence from rule matching
  private calculateRuleConfidence(firedRules: FiredRule[], diagnosis: Hypothesis | null): number {
    if (!firedRules || firedRules.length === 0) {
      return 0.3; // No rules = low confidence
    }
    
    // Base confidence from number of rules
    let confidence = Math.min(0.5 + (firedRules.length * 0.05), 0.8);
    
    // Boost from diagnosis confidence
    if (diagnosis) {
      confidence = Math.max(confidence, diagnosis.confidence);
    }
    
    // Boost from high-priority rules
    const highPriorityRules = (firedRules || []).filter(r => r.priority >= 80);
    if (highPriorityRules.length > 0) {
      confidence += 0.1;
    }
    
    // Boost from multiple rules supporting same cause
    if ((diagnosis?.supporting_rules?.length ?? 0) > 1) {
      confidence += 0.05 * (diagnosis!.supporting_rules!.length - 1);
    }
    
    return Math.min(confidence, 0.95);
  }
  
  // Calculate data quality score
  private calculateDataQuality(facts: SymbolicFact, landState: AuthoritativeLandState | null): number {
    // BUG 1 FIX: Defensive null safety - prevent crash when facts is undefined/empty
    if (!facts || !facts.crop) {
      console.warn('[ConfidenceCalculator] Missing facts/crop, returning 0');
      return 0;
    }
    
    let score = 0;
    let maxScore = 0;
    
    // Check each data source
    // Crop data (essential)
    maxScore += 20;
    if (facts.crop !== 'UNKNOWN') score += 20;
    
    // Growth stage (essential)
    maxScore += 15;
    if (facts.growth_stage !== 'UNKNOWN') score += 15;
    
    // Days since sowing
    maxScore += 10;
    if (facts.dos > 0) score += 10;
    
    // NDVI data
    maxScore += 15;
    if (facts.ndvi !== null) score += 15;
    
    // Soil data
    maxScore += 15;
    if (facts.soil_n !== null) score += 5;
    if (facts.soil_p !== null) score += 5;
    if (facts.soil_k !== null) score += 5;
    
    // Weather data
    maxScore += 10;
    if (facts.temperature !== null) score += 5;
    if (facts.humidity !== null) score += 5;
    
    // Symptom specificity
    maxScore += 15;
    if (facts.primary_symptom !== 'UNKNOWN') score += 10;
    if (facts.severity !== 'unknown') score += 5;
    
    return maxScore > 0 ? score / maxScore : 0;
  }
  
  // Calculate data freshness score
  private calculateDataFreshness(landState: AuthoritativeLandState | null): number {
    if (!landState) {
      return 0.5; // No land state = moderate freshness
    }
    
    let freshnessPoints = 0;
    let totalPoints = 0;
    
    // NDVI freshness (should be < 7 days)
    totalPoints += 30;
    if (landState.ndvi.data_fresh) {
      freshnessPoints += 30;
    } else if (landState.ndvi.age_days !== null && landState.ndvi.age_days < 14) {
      freshnessPoints += 15;
    }
    
    // Soil data freshness (should be < 90 days)
    totalPoints += 25;
    if (landState.soil.data_fresh) {
      freshnessPoints += 25;
    } else if (landState.soil.test_age_days !== null && landState.soil.test_age_days < 180) {
      freshnessPoints += 12;
    }
    
    // Weather data freshness (should be < 6 hours)
    totalPoints += 25;
    if (landState.weather.data_fresh) {
      freshnessPoints += 25;
    } else if (landState.weather.data_age_hours !== null && landState.weather.data_age_hours < 24) {
      freshnessPoints += 12;
    }
    
    // Crop schedule presence
    totalPoints += 20;
    if (landState?.crop?.schedule_status === 'active') {
      freshnessPoints += 20;
    }
    
    return totalPoints > 0 ? freshnessPoints / totalPoints : 0.5;
  }
  
  // Calculate symptom specificity score
  private calculateSymptomSpecificity(facts: SymbolicFact): number {
    // Defensive null safety
    if (!facts) {
      console.warn('[ConfidenceCalculator] Missing facts for symptom specificity, returning 0.3');
      return 0.3;
    }
    
    let score = 0.3; // Base score
    
    // Primary symptom specified and not UNKNOWN
    if (facts.primary_symptom !== 'UNKNOWN' && facts.primary_symptom !== 'NONE') {
      score += 0.25;
    }
    
    // Severity specified
    if (facts.severity !== 'unknown') {
      score += 0.15;
    }
    
    // Distribution specified
    if (facts.distribution !== 'unknown') {
      score += 0.15;
    }
    
    // Affected part specified
    if (facts.affected_part !== 'unknown') {
      score += 0.10;
    }
    
    // NOTE: Diagnostic confidence boost (1.4x multiplicative) is applied
    const highlySpecificSymptoms = [
      'DEAD_HEART', 'HONEYDEW', 'WEBBING', 'GALLS', 'TUNNELS_IN_STEM',
      'TERMITE_SUSPECTED', 'BORER_SUSPECTED',
      'BORE_HOLES', 'FRASS_EXTRUSION', 'MUD_TUBES_PRESENT',
      'RED_ROT_SYMPTOMS', 'BLACK_WHIP_STRUCTURE', 'BACTERIAL_OOZE',
      'RUST_PUSTULES', 'SOOTY_MOLD'
    ];
    if (highlySpecificSymptoms.includes(facts.primary_symptom)) {
      score += 0.15;
    }
    
    return Math.min(score, 1.0);
  }
  
  // Categorize confidence level
  categorizeConfidence(score: number): ConfidenceLevel {
    if (score >= 0.85) return 'VERY_HIGH';
    if (score >= 0.70) return 'HIGH';
    if (score >= 0.55) return 'MODERATE';
    if (score >= 0.40) return 'LOW';
    return 'VERY_LOW';
  }
  
  // Generate human-readable explanation
  private generateExplanation(
    level: ConfidenceLevel,
    factors: {
      ruleMatching: number;
      dataQuality: number;
      dataFreshness: number;
      symptomSpecificity: number;
    }
  ): string {
    const parts: string[] = [];
    
    if (level === 'VERY_HIGH' || level === 'HIGH') {
      parts.push('Strong rule matches');
      if (factors.dataQuality > 0.7) parts.push('complete data');
      if (factors.symptomSpecificity > 0.7) parts.push('specific symptoms');
    } else if (level === 'MODERATE') {
      parts.push('Partial rule matches');
      if (factors.dataQuality < 0.5) parts.push('some data missing');
      if (factors.symptomSpecificity < 0.5) parts.push('general symptoms');
    } else {
      parts.push('Limited rule matches');
      if (factors.dataQuality < 0.4) parts.push('significant data gaps');
      if (factors.symptomSpecificity < 0.4) parts.push('unclear symptoms');
    }
    
    return parts.join(', ');
  }
  
  // Get confidence stars for display
  getConfidenceStars(score: number): string {
    if (score >= 0.85) return '⭐⭐⭐⭐⭐';
    if (score >= 0.70) return '⭐⭐⭐⭐';
    if (score >= 0.55) return '⭐⭐⭐';
    if (score >= 0.40) return '⭐⭐';
    return '⭐';
  }
}

// SINGLETON INSTANCE

let calculatorInstance: ConfidenceCalculator | null = null;

export function getConfidenceCalculator(): ConfidenceCalculator {
  if (!calculatorInstance) {
    calculatorInstance = new ConfidenceCalculator();
  }
  return calculatorInstance;
}

// Export convenience function
export function calculateDecisionConfidenceV2(input: ConfidenceInput): ConfidenceScore {
  const calculator = getConfidenceCalculator();
  return calculator.calculateConfidence(input);
}
