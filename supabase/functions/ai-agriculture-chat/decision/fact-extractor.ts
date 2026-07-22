/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT EXTRACTOR - OBSERVATION TO SYMBOLIC FACT CONVERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts farmer observations + authoritative state into structured symbolic
 * facts that can be evaluated by the rule engine.
 * 
 * REFACTORED: Phase-1 SSOT Compliance
 * - Removed hardcoded Marathi/Hindi/English symptom mappings
 * - Now relies on pre-extracted canonical symptoms from Language Induction Layer
 * - Language-agnostic logic for production readiness
 * 
 * VERSION: 3.0.0
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';

export const FACT_EXTRACTOR_VERSION = '3.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// PEST INDICATORS - Phase 1 DB-SSOT
// ───────────────────────────────────────────────────────────────────────────
// Source: observation_master WHERE semantic_class='pest' AND is_diagnostic=true
// (248 rows verified 2026-07-22). The tiny legacy set below is retained ONLY
// as cold-boot fallback used while the DB cache preloads.
// ═══════════════════════════════════════════════════════════════════════════
import { isPestIndicator as _isPestIndicatorDb, phase1CacheReady as _phase1CacheReady } from '../utils/db-ssot/phase1-caches.ts';

const _LEGACY_PEST_INDICATORS: ReadonlySet<string> = new Set([
  'DEAD_HEART_PRESENT', 'DEAD_HEART', 'STEM_BORING_MARKS', 'BORE_HOLES_AT_BASE',
  'BORE_HOLES_VISIBLE', 'FRASS_VISIBLE', 'FRASS_IN_TUNNEL', 'LARVAE_PRESENT',
  'INSECTS_VISIBLE', 'HONEYDEW_PRESENT', 'SMALL_INSECTS_VISIBLE',
  'SHOOT_BORER', 'STEM_BORER', 'BOLLWORM', 'APHID_INFESTATION',
  'WHITEFLY_INFESTATION', 'MEALYBUG_INFESTATION', 'THRIPS_DAMAGE',
  'LEAF_MINER_TRAILS', 'WEBBING_VISIBLE', 'CATERPILLAR_PRESENT',
]);

function isPestIndicator(code: string): boolean {
  const key = code.toUpperCase().replace(/[\s-]/g, '_');
  if (_phase1CacheReady()) return _isPestIndicatorDb(key);
  return _LEGACY_PEST_INDICATORS.has(key);
}

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
    userQuery: string,
    allObservations?: string[]
  ): SymbolicFact {
    console.log(`📊 [FactExtractor v${FACT_EXTRACTOR_VERSION}] Extracting symbolic facts...`);
    
    // 1. Core context facts (from authoritative sources)
    const coreFacts = this.extractCoreFacts(canonicalState, landState);
    
    // 2. Symptom facts (from canonical state - already extracted by Language Induction Layer)
    const symptomFacts = this.extractSymptomFacts(observation, canonicalState);
    
    // 3. Environmental facts
    const envFacts = this.extractEnvironmentalFacts(landState);
    
    // 4. Soil facts
    const soilFacts = this.extractSoilFacts(landState);
    
    // 5. Derived facts
    const derivedFacts = this.calculateDerivedFacts(coreFacts, symptomFacts, envFacts, soilFacts);
    
    // 6. Bug 2 Fix: Build all_observations array and detect pest evidence
    const obsArray = allObservations || [];
    // Also include primary_symptom if not already present
    if (symptomFacts.primary_symptom && symptomFacts.primary_symptom !== 'UNKNOWN' && !obsArray.includes(symptomFacts.primary_symptom)) {
      obsArray.push(symptomFacts.primary_symptom);
    }
    const hasPestEvidence = obsArray.some(obs => PEST_INDICATORS.has(obs.toUpperCase().replace(/[\s-]/g, '_')));
    
    console.log(`   Core: crop=${coreFacts.crop}, stage=${coreFacts.growth_stage}, DOS=${coreFacts.dos}`);
    console.log(`   Symptom: ${symptomFacts.primary_symptom}, severity=${symptomFacts.severity}`);
    console.log(`   Derived: stress=${derivedFacts.stress_level}, risk=${derivedFacts.risk_level}`);
    console.log(`   Observations: ${obsArray.length} total, pest_evidence=${hasPestEvidence}`);
    
    return {
      ...coreFacts,
      ...symptomFacts,
      ...envFacts,
      ...soilFacts,
      ...derivedFacts,
      all_observations: obsArray,
      has_pest_evidence: hasPestEvidence,
      user_query: userQuery,
      recent_treatments: observation?.recent_actions || [],
      // PHASE C — pass-through morphology evidence when orchestrator attaches it
      morphology_evidence: (observation?.morphology_evidence || (landState as any)?.morphology_evidence)
        ? {
            overall_status: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).overall_status,
            stage_shift_hint: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).stage_shift_hint ?? null,
            confidence_delta: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).confidence_delta ?? 0,
            ndvi_status: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).ndvi?.status ?? 'UNKNOWN',
            height_status: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).height_cm?.status ?? 'UNKNOWN',
            leaf_status: (observation?.morphology_evidence || (landState as any)?.morphology_evidence).leaf_count?.status ?? 'UNKNOWN',
          }
        : null
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
   * Extract symptom facts from canonical state (already extracted by Language Induction Layer)
   * SSOT-COMPLIANT: No language-specific keyword matching here
   */
  private extractSymptomFacts(
    observation: any,
    canonicalState: CanonicalState
  ): Pick<SymbolicFact, 'primary_symptom' | 'affected_part' | 'distribution' | 'severity' | 'progression'> {
    // Get canonical symptom from canonical state (already extracted by Language Induction Layer)
    const primarySymptom = canonicalState.visual_symptom || observation?.primary_symptom || 'UNKNOWN';
    
    return {
      primary_symptom: primarySymptom,
      affected_part: observation?.affected_part || canonicalState.affected_part || 'unknown',
      distribution: observation?.distribution || canonicalState.distribution || 'unknown',
      severity: observation?.severity || canonicalState.severity || 'unknown',
      progression: observation?.timing || 'unknown'
    };
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
  userQuery: string,
  allObservations?: string[]
): SymbolicFact {
  const extractor = getFactExtractor();
  return extractor.extractFacts(observation, canonicalState, landState, userQuery, allObservations);
}
