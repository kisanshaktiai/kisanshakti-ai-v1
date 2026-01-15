/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT EXTRACTOR - OBSERVATION TO SYMBOLIC FACT CONVERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts farmer observations + authoritative state into structured symbolic
 * facts that can be evaluated by the rule engine.
 * 
 * VERSION: 1.0.0
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM CANONICAL MAPPING
// Maps multilingual symptoms to canonical symptom codes
// ═══════════════════════════════════════════════════════════════════════════

const SYMPTOM_CANONICAL_MAP: Record<string, string> = {
  // Marathi symptoms
  'पान पिवळी': 'LEAF_YELLOWING',
  'पान वाळले': 'LEAF_DRYING',
  'पान सुकले': 'LEAF_DRYING',
  'पानावर डाग': 'LEAF_SPOTS',
  'सुरळी वाळली': 'DEAD_HEART',
  'मेले': 'PLANT_DEATH',
  'मेला': 'PLANT_DEATH',
  'वाळवी': 'TERMITE_SUSPECTED',
  'गॅप': 'GAPS_IN_FIELD',
  'उगवले नाही': 'GERMINATION_FAILURE',
  'किडा': 'INSECT_VISIBLE',
  'अळी': 'CATERPILLAR_VISIBLE',
  'छिद्र': 'HOLES_VISIBLE',
  'पांढरे': 'WHITE_SUBSTANCE',
  
  // Hindi symptoms
  'पत्ता पीला': 'LEAF_YELLOWING',
  'पत्ता सूखा': 'LEAF_DRYING',
  'धब्बे': 'LEAF_SPOTS',
  'गोभ सूखी': 'DEAD_HEART',
  'मर गया': 'PLANT_DEATH',
  'दीमक': 'TERMITE_SUSPECTED',
  'उगा नहीं': 'GERMINATION_FAILURE',
  'कीड़ा': 'INSECT_VISIBLE',
  'इल्ली': 'CATERPILLAR_VISIBLE',
  'छेद': 'HOLES_VISIBLE',
  'सफेद': 'WHITE_SUBSTANCE',
  
  // English symptoms
  'yellow leaves': 'LEAF_YELLOWING',
  'yellowing': 'LEAF_YELLOWING',
  'drying': 'LEAF_DRYING',
  'dried': 'LEAF_DRYING',
  'wilting': 'WILTING',
  'wilted': 'WILTING',
  'spots': 'LEAF_SPOTS',
  'dead heart': 'DEAD_HEART',
  'died': 'PLANT_DEATH',
  'termite': 'TERMITE_SUSPECTED',
  'gap': 'GAPS_IN_FIELD',
  'germination': 'GERMINATION_FAILURE',
  'insect': 'INSECT_VISIBLE',
  'caterpillar': 'CATERPILLAR_VISIBLE',
  'borer': 'BORER_SUSPECTED',
  'holes': 'HOLES_VISIBLE',
  'white': 'WHITE_SUBSTANCE'
};

// ═══════════════════════════════════════════════════════════════════════════
// FACT EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class FactExtractor {
  
  /**
   * Extract structured facts from observations and authoritative state
   */
  extractFacts(
    observation: any,
    canonicalState: CanonicalState,
    landState: AuthoritativeLandState | null,
    userQuery: string
  ): SymbolicFact {
    console.log('📊 [FactExtractor] Extracting symbolic facts...');
    
    // 1. Core context facts (from authoritative sources)
    const coreFacts = this.extractCoreFacts(canonicalState, landState);
    
    // 2. Symptom facts (from observations)
    const symptomFacts = this.extractSymptomFacts(observation, canonicalState, userQuery);
    
    // 3. Environmental facts
    const envFacts = this.extractEnvironmentalFacts(landState);
    
    // 4. Soil facts
    const soilFacts = this.extractSoilFacts(landState);
    
    // 5. Derived facts
    const derivedFacts = this.calculateDerivedFacts(coreFacts, symptomFacts, envFacts, soilFacts);
    
    console.log(`   Core: crop=${coreFacts.crop}, stage=${coreFacts.growth_stage}, DOS=${coreFacts.dos}`);
    console.log(`   Symptom: ${symptomFacts.primary_symptom}, severity=${symptomFacts.severity}`);
    console.log(`   Derived: stress=${derivedFacts.stress_level}, risk=${derivedFacts.risk_level}`);
    
    return {
      ...coreFacts,
      ...symptomFacts,
      ...envFacts,
      ...soilFacts,
      ...derivedFacts,
      user_query: userQuery,
      recent_treatments: observation?.recent_actions || []
    };
  }
  
  /**
   * Extract core context facts from authoritative sources
   * CRITICAL: Normalizes crop_code and growth_stage to lowercase for rule matching
   */
  private extractCoreFacts(
    canonicalState: CanonicalState,
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'crop' | 'crop_code' | 'dos' | 'growth_stage' | 'land_area_acres'> {
    // CRITICAL FIX: Safe nested property access with null checks
    const rawCrop = landState?.crop?.current_crop || canonicalState.crop_type || 'UNKNOWN';
    const rawStage = landState?.crop?.growth_stage || canonicalState.crop_stage || 'UNKNOWN';
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CANONICAL-TO-RULE NORMALIZATION
    // Database rules use lowercase snake_case (e.g., "sugarcane", "grand_growth")
    // CanonicalState uses UPPERCASE enums (e.g., "SUGARCANE", "GRAND_GROWTH")
    // ═══════════════════════════════════════════════════════════════════════════
    const normalizedCropCode = rawCrop === 'UNKNOWN' ? '' : rawCrop.toLowerCase().replace(/-/g, '_');
    const normalizedStage = rawStage === 'UNKNOWN' ? 'unknown' : rawStage.toLowerCase().replace(/-/g, '_');
    
    console.log(`   📐 [FactExtractor] Normalization: crop=${rawCrop}→${normalizedCropCode}, stage=${rawStage}→${normalizedStage}`);
    
    return {
      crop: rawCrop,  // Keep original for display
      crop_code: normalizedCropCode,  // Normalized for rule matching
      dos: landState?.crop?.days_since_sowing || canonicalState.days_after_sowing_exact || 0,
      growth_stage: normalizedStage,  // Normalized for rule matching
      land_area_acres: landState?.area_acres || 0
    };
  }
  
  /**
   * Extract symptom facts from farmer observations
   */
  private extractSymptomFacts(
    observation: any,
    canonicalState: CanonicalState,
    userQuery: string
  ): Pick<SymbolicFact, 'primary_symptom' | 'affected_part' | 'distribution' | 'severity' | 'progression'> {
    // Try to get canonical symptom from observation or query
    let primarySymptom = canonicalState.visual_symptom || 'UNKNOWN';
    
    // If still unknown, try to extract from user query
    if (primarySymptom === 'UNKNOWN' || primarySymptom === 'NONE') {
      primarySymptom = this.extractSymptomFromQuery(userQuery);
    }
    
    return {
      primary_symptom: primarySymptom,
      affected_part: observation?.affected_part || canonicalState.affected_part || 'unknown',
      distribution: observation?.distribution || canonicalState.distribution || 'unknown',
      severity: observation?.severity || canonicalState.severity || 'unknown',
      progression: observation?.timing || 'unknown'
    };
  }
  
  /**
   * Extract symptom from user query using keyword matching
   */
  private extractSymptomFromQuery(query: string): string {
    const queryLower = query.toLowerCase();
    
    for (const [keyword, canonical] of Object.entries(SYMPTOM_CANONICAL_MAP)) {
      if (queryLower.includes(keyword.toLowerCase())) {
        return canonical;
      }
    }
    
    return 'UNKNOWN';
  }
  
  /**
   * Extract environmental facts from authoritative state
   */
  private extractEnvironmentalFacts(
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'ndvi' | 'ndvi_trend' | 'ndvi_status' | 'temperature' | 'humidity' | 'recent_rain' | 'soil_moisture_estimated'> {
    // CRITICAL FIX: Safe nested property access with null checks
    const ndviValue = landState?.ndvi?.latest_value ?? null;
    
    // Calculate NDVI status
    let ndviStatus = 'UNKNOWN';
    if (ndviValue !== null) {
      if (ndviValue >= 0.6) ndviStatus = 'HEALTHY';
      else if (ndviValue >= 0.4) ndviStatus = 'MODERATE';
      else if (ndviValue >= 0.25) ndviStatus = 'LOW';
      else ndviStatus = 'CRITICAL';
    }
    
    // Estimate soil moisture from rainfall - with safe access
    const rainfall = landState?.weather?.rainfall_last_24h || 0;
    let soilMoisture = 'UNKNOWN';
    if (landState?.weather) {
      if (rainfall > 20) soilMoisture = 'WET';
      else if (rainfall > 5) soilMoisture = 'MOIST';
      else soilMoisture = 'DRY';
    }
    
    return {
      ndvi: ndviValue,
      ndvi_trend: landState?.ndvi?.trend?.toUpperCase() || 'UNKNOWN',
      ndvi_status: ndviStatus,
      temperature: landState?.weather?.temperature ?? null,
      humidity: landState?.weather?.humidity ?? null,
      recent_rain: rainfall > 5,
      soil_moisture_estimated: soilMoisture
    };
  }
  
  /**
   * Extract soil facts from authoritative state
   */
  private extractSoilFacts(
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'soil_n' | 'soil_n_status' | 'soil_p' | 'soil_p_status' | 'soil_k' | 'soil_k_status' | 'soil_ph'> {
    const getNutrientStatus = (value: number | null, low: number, high: number): string => {
      if (value === null) return 'UNKNOWN';
      if (value < low) return 'LOW';
      if (value > high) return 'HIGH';
      return 'ADEQUATE';
    };
    
    // CRITICAL FIX: Safe nested property access with null checks
    return {
      soil_n: landState?.soil?.nitrogen_kg_per_ha ?? null,
      soil_n_status: getNutrientStatus(landState?.soil?.nitrogen_kg_per_ha ?? null, 200, 400),
      soil_p: landState?.soil?.phosphorus_kg_per_ha ?? null,
      soil_p_status: getNutrientStatus(landState?.soil?.phosphorus_kg_per_ha ?? null, 10, 25),
      soil_k: landState?.soil?.potassium_kg_per_ha ?? null,
      soil_k_status: getNutrientStatus(landState?.soil?.potassium_kg_per_ha ?? null, 120, 280),
      soil_ph: landState?.soil?.ph ?? null
    };
  }
  
  /**
   * Calculate derived facts from primary facts
   */
  private calculateDerivedFacts(
    coreFacts: any,
    symptomFacts: any,
    envFacts: any,
    soilFacts: any
  ): Pick<SymbolicFact, 'stress_level' | 'critical_stage' | 'data_completeness' | 'risk_level'> {
    // Calculate stress level from NDVI
    let stressLevel = 'UNKNOWN';
    if (envFacts.ndvi !== null) {
      if (envFacts.ndvi < 0.3) stressLevel = 'SEVERE';
      else if (envFacts.ndvi < 0.4) stressLevel = 'MODERATE';
      else if (envFacts.ndvi < 0.5) stressLevel = 'MILD';
      else stressLevel = 'NONE';
    }
    
    // Determine if critical stage
    const criticalStages = ['GERMINATION', 'FLOWERING', 'GRAIN_FILLING', 'TILLERING'];
    const criticalStage = criticalStages.includes(coreFacts.growth_stage?.toUpperCase() || '');
    
    // Calculate data completeness
    let dataPoints = 0;
    let totalPoints = 0;
    
    if (coreFacts.crop !== 'UNKNOWN') dataPoints++;
    totalPoints++;
    if (coreFacts.dos > 0) dataPoints++;
    totalPoints++;
    if (envFacts.ndvi !== null) dataPoints++;
    totalPoints++;
    if (soilFacts.soil_n !== null) dataPoints++;
    totalPoints++;
    if (envFacts.temperature !== null) dataPoints++;
    totalPoints++;
    
    const dataCompleteness = totalPoints > 0 ? (dataPoints / totalPoints) * 100 : 0;
    
    // Calculate risk level
    let riskLevel = 'MEDIUM';
    if (stressLevel === 'SEVERE' || symptomFacts.severity === 'CRITICAL') {
      riskLevel = 'HIGH';
    } else if (stressLevel === 'NONE' && symptomFacts.severity === 'MILD') {
      riskLevel = 'LOW';
    }
    
    return {
      stress_level: stressLevel,
      critical_stage: criticalStage,
      data_completeness: dataCompleteness,
      risk_level: riskLevel
    };
  }
  
  /**
   * Map canonical symptom to standardized form
   */
  mapToCanonicalSymptom(symptom: string): string {
    // Already canonical
    if (symptom.toUpperCase() === symptom && symptom.includes('_')) {
      return symptom;
    }
    
    // Try to find in map
    const mapped = SYMPTOM_CANONICAL_MAP[symptom.toLowerCase()];
    if (mapped) return mapped;
    
    return symptom.toUpperCase().replace(/\s+/g, '_');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let extractorInstance: FactExtractor | null = null;

export function getFactExtractor(): FactExtractor {
  if (!extractorInstance) {
    extractorInstance = new FactExtractor();
  }
  return extractorInstance;
}

// Export convenience function
export function extractSymbolicFacts(
  observation: any,
  canonicalState: any,
  landState: AuthoritativeLandState | null,
  userQuery: string
): SymbolicFact {
  const extractor = getFactExtractor();
  return extractor.extractFacts(observation, canonicalState, landState, userQuery);
}
