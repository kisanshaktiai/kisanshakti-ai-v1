// FACT EXTRACTOR - OBSERVATION TO SYMBOLIC FACT CONVERSION
//
// CHANGE LOG (newest first)
//   2026-08-27 — P0 FINAL PRODUCTION FIX (fact-extractor lane of the
//     graph-authority fix). ZERO agronomic constants in this file.
//     (a) critical_stage: hardcoded stage-name list REMOVED. Read only from
//         authoritative stage metadata (`landState.crop.is_critical_stage`,
//         boolean, supplied by the state loader / phenology SSOT). Absent ⇒
//         critical_stage=false, critical_stage_known=false ⇒ NON-EVALUABLE.
//     (b) soil_moisture_estimated: rainfall-derived WET/MOIST/DRY REMOVED.
//         Read `landState.soil.moisture_status` (validated measurement/model)
//         or UNKNOWN.
//     (c) soil_*_status / ndvi_status / stress_level: local N-P-K and NDVI
//         bands REMOVED. Read `landState.derived.*` — the SSOT interpretation
//         computed by authoritative-state-loader from `system_config` rows —
//         or UNKNOWN.
//     (d) recent_rain: no mm threshold. true iff a measured 24h rainfall
//         value > 0 exists. The raw value is exposed as `rainfall_24h_mm` so
//         rules threshold it in `conditions_json` (data in DB, not code).
//     (e) has_pest_evidence: legacy in-code pest code list REMOVED. DB-SSOT
//         `isPestIndicator` (observation_master) only; false when unloaded.
//     (f) risk_level: in-code stress/severity heuristic REMOVED. Read
//         `landState.derived.risk_level` or UNKNOWN.
//     (h) 4.2.0: exposes `cultivation_method` (landState.crop.cultivation_method,
//         canonical) so CONTEXT_SUFFICIENT rules can evaluate it exactly.
//     (g) EVIDENCE LEAK CLOSED: primary_symptom is no longer pushed into
//         all_observations. all_observations = caller-supplied codes only;
//         the SymbolicReasoner re-gates them to CONFIRMED ∪ PERCEIVED.

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { CanonicalState } from '../agents/canonical-state-builder.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';
import { canonicalObsCode } from '../utils/canonical-code.ts';
import { isPestIndicator, phase1CacheReady } from '../utils/db-ssot/phase1-caches.ts';

export const FACT_EXTRACTOR_VERSION = '4.2.0';

// Uppercase SSOT label or 'UNKNOWN'. Never derives a band from a raw number.
function ssotStatus(v: unknown): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().toUpperCase() : 'UNKNOWN';
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// FACT EXTRACTOR CLASS

export class FactExtractor {

  // Extract structured facts from observations and authoritative state
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

    // 2. Symptom facts — CONTEXT ONLY (never evidence)
    const symptomFacts = this.extractSymptomFacts(observation, canonicalState);

    // 3. Environmental facts (SSOT or UNKNOWN)
    const envFacts = this.extractEnvironmentalFacts(landState);

    // 4. Soil facts (SSOT or UNKNOWN)
    const soilFacts = this.extractSoilFacts(landState);

    // 5. Derived facts (authoritative metadata or UNKNOWN)
    const derivedFacts = this.extractDerivedFacts(coreFacts, envFacts, soilFacts, landState);

    // 6. Observation array — caller-supplied codes ONLY, canonical, deduped.
    const obsArray = Array.from(
      new Set((allObservations || []).map((o) => canonicalObsCode(o)).filter((c) => c.length > 0)),
    );
    // DB-SSOT only (observation_master). When the cache is cold the flag is
    // reported as unknown-false and logged; the reasoner surfaces `taxonomy_guard`.
    const pestCacheReady = phase1CacheReady();
    if (!pestCacheReady) console.warn('   ⚠️ [FactExtractor] phase1 DB cache cold — has_pest_evidence cannot be determined (false, unverified)');
    const hasPestEvidence = pestCacheReady && obsArray.some((obs) => isPestIndicator(obs));

    console.log(`   Core: crop=${coreFacts.crop}, stage=${coreFacts.growth_stage}, DOS=${coreFacts.dos}`);
    console.log(`   Symptom(context): ${symptomFacts.primary_symptom}, severity=${symptomFacts.severity}`);
    console.log(`   Derived: stress=${derivedFacts.stress_level}, critical_stage=${derivedFacts.critical_stage}(known=${derivedFacts.critical_stage_known})`);
    console.log(`   Observations: ${obsArray.length} caller-supplied, pest_evidence=${hasPestEvidence}`);

    const morph = observation?.morphology_evidence || (landState as any)?.morphology_evidence;

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
      morphology_evidence: morph
        ? {
            overall_status: morph.overall_status,
            stage_shift_hint: morph.stage_shift_hint ?? null,
            confidence_delta: morph.confidence_delta ?? 0,
            ndvi_status: morph.ndvi?.status ?? 'UNKNOWN',
            height_status: morph.height_cm?.status ?? 'UNKNOWN',
            leaf_status: morph.leaf_count?.status ?? 'UNKNOWN',
          }
        : null
    };
  }

  // Extract core context facts from authoritative sources
  private extractCoreFacts(
    canonicalState: CanonicalState,
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'crop' | 'crop_code' | 'dos' | 'growth_stage' | 'land_area_acres' | 'cultivation_method'> {
    const rawCrop = landState?.crop?.current_crop || canonicalState.crop_type || 'UNKNOWN';
    const rawStage = landState?.crop?.growth_stage || canonicalState.crop_stage || 'UNKNOWN';

    // CANONICAL-TO-RULE NORMALIZATION
    const normalizedCropCode = rawCrop === 'UNKNOWN' ? '' : rawCrop.toLowerCase().replace(/-/g, '_');
    const normalizedStage = rawStage === 'UNKNOWN' ? 'unknown' : rawStage.toLowerCase().replace(/-/g, '_');

    console.log(`   📐 [FactExtractor] Normalization: crop=${rawCrop}→${normalizedCropCode}, stage=${rawStage}→${normalizedStage}`);

    return {
      crop: rawCrop,
      crop_code: normalizedCropCode,
      dos: landState?.crop?.days_since_sowing || canonicalState.days_after_sowing_exact || 0,
      growth_stage: normalizedStage,
      land_area_acres: landState?.area_acres || 0,
      // crop_schedules.cultivation_method lane (F1) — exact context condition for rules
      cultivation_method: landState?.crop?.cultivation_method ? canonicalObsCode(landState.crop.cultivation_method) : null,
    };
  }

  // Extract symptom facts from canonical state — context only
  private extractSymptomFacts(
    observation: any,
    canonicalState: CanonicalState
  ): Pick<SymbolicFact, 'primary_symptom' | 'affected_part' | 'distribution' | 'severity' | 'progression'> {
    const cs = canonicalState as any;
    return {
      primary_symptom: cs.visual_symptom || observation?.primary_symptom || 'UNKNOWN',
      affected_part: observation?.affected_part || cs.affected_part || 'unknown',
      distribution: observation?.distribution || cs.distribution || 'unknown',
      severity: observation?.severity || cs.severity || 'unknown',
      progression: observation?.timing || 'unknown'
    };
  }

  // Extract environmental facts — SSOT interpretations only
  private extractEnvironmentalFacts(
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'ndvi' | 'ndvi_trend' | 'ndvi_status' | 'temperature' | 'humidity' | 'rainfall_24h_mm' | 'recent_rain' | 'soil_moisture_estimated'> {
    const derived: any = landState?.derived ?? {};
    const rainfall = numOrNull(landState?.weather?.rainfall_last_24h);

    return {
      ndvi: numOrNull(landState?.ndvi?.latest_value),
      ndvi_trend: ssotStatus(landState?.ndvi?.trend),
      ndvi_status: ssotStatus(derived.ndvi_status),
      temperature: numOrNull(landState?.weather?.temperature),
      humidity: numOrNull(landState?.weather?.humidity),
      rainfall_24h_mm: rainfall,
      recent_rain: rainfall !== null && rainfall > 0,
      soil_moisture_estimated: ssotStatus((landState?.soil as any)?.moisture_status)
    };
  }

  // Extract soil facts — raw values pass through; status labels come from SSOT
  private extractSoilFacts(
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'soil_n' | 'soil_n_status' | 'soil_p' | 'soil_p_status' | 'soil_k' | 'soil_k_status' | 'soil_ph'
    | 'soil_zn_ppm' | 'soil_fe_ppm' | 'soil_mn_ppm' | 'soil_mg_cmol' | 'soil_s_ppm' | 'soil_b_ppm'> {
    const derived: any = landState?.derived ?? {};
    const soil: any = landState?.soil ?? {};
    return {
      soil_n: numOrNull(soil.nitrogen_kg_per_ha),
      soil_n_status: ssotStatus(derived.nitrogen_level),
      soil_p: numOrNull(soil.phosphorus_kg_per_ha),
      soil_p_status: ssotStatus(derived.phosphorus_level),
      soil_k: numOrNull(soil.potassium_kg_per_ha),
      soil_k_status: ssotStatus(derived.potassium_level),
      soil_ph: numOrNull(soil.ph),
      soil_zn_ppm: numOrNull(soil.zinc_ppm),
      soil_fe_ppm: numOrNull(soil.iron_ppm),
      soil_mn_ppm: numOrNull(soil.manganese_ppm),
      soil_mg_cmol: numOrNull(soil.magnesium_cmol),
      soil_s_ppm: numOrNull(soil.sulphur_ppm),
      soil_b_ppm: numOrNull(soil.boron_ppm),
    };
  }

  // Derived facts — authoritative metadata only, no local heuristics
  private extractDerivedFacts(
    coreFacts: any,
    envFacts: any,
    soilFacts: any,
    landState: AuthoritativeLandState | null
  ): Pick<SymbolicFact, 'stress_level' | 'critical_stage' | 'critical_stage_known' | 'data_completeness' | 'risk_level'> {
    const derived: any = landState?.derived ?? {};

    // Critical stage: authoritative stage metadata ONLY (boolean on crop context)
    const criticalMeta = (landState?.crop as any)?.is_critical_stage;
    const criticalStageKnown = typeof criticalMeta === 'boolean';

    // Data completeness — a count of available authoritative inputs
    const present = [
      coreFacts.crop !== 'UNKNOWN',
      coreFacts.dos > 0,
      envFacts.ndvi !== null,
      soilFacts.soil_n !== null,
      envFacts.temperature !== null,
    ];
    const dataCompleteness = (present.filter(Boolean).length / present.length) * 100;

    return {
      stress_level: ssotStatus(derived.water_stress_level),
      critical_stage: criticalMeta === true,
      critical_stage_known: criticalStageKnown,
      data_completeness: dataCompleteness,
      risk_level: ssotStatus(derived.risk_level)
    };
  }
}

// SINGLETON INSTANCE

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
