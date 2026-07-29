/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL CONTEXT CONTRACT (v2.1.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Define a SINGLE, IMMUTABLE canonical context object that is passed by
 * reference through the entire decision flow:
 *
 *   orchestrator → hypothesis-evaluator → clarification-generator → UI
 *
 * HARD INVARIANTS:
 * 1. CanonicalContext is created EXACTLY ONCE per turn
 * 2. Once created, it CANNOT be modified, rebuilt, or partially reconstructed
 * 3. If hasContext=true but context is incomplete, the system MUST fail fast
 * 4. No function may infer or reconstruct land/crop context - use passed object
 *
 * AGRONOMIST PRINCIPLE:
 * "Once I know the crop, stage, and land - I NEVER forget it during diagnosis"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * 2026-07-12 — v2.2.0 biological_profile authority. cultivation_method is now
 *   sourced from the biological_state produced by resolve_crop_phenology_for_land
 *   (which composes resolve_biological_profile → pure resolve_crop_phenology).
 *   Falls back through crop_schedules → landContext.cultivation_method for
 *   pre-v7 call paths. Contract shape unchanged (still optional/nullable).
 * 2026-07-11 — v2.1.0 context-preservation extension. Added additive optional
 *   field-twin fields (crop lifecycle dates from crop_schedules, biological_state
 *   ref, soil extras, water/irrigation, weather forecast + rainfall_after_sowing,
 *   ndvi reliability, geo, area_acres) plus a `sources` provenance sub-tree.
 *   Strict authority: crop identity / variety / lifecycle dates MUST originate
 *   from `crop_schedules`; stage from `biological_state`. Soil / NDVI / weather
 *   may legitimately fall back to `lands_cache` — logged, not errored. Existing
 *   lock invariants untouched; all additions are optional/nullable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { BiologicalState } from '../agents/biological-state.ts';

export const CANONICAL_CONTEXT_CONTRACT_VERSION = '2.1.0';

// FAIL-FAST ASSERTION (MANDATORY GUARD)

// Assert that canonical context is locked and non-null.
export function assertCanonicalContextLocked(
  context: CanonicalContext | null,
  location: string
): asserts context is CanonicalContext {
  if (!context) {
    console.error(`🚨 [FATAL @ ${location}] CanonicalContext is null but was expected!`);
    throw new Error(`FATAL @ ${location}: CanonicalContext is null. Context MUST be built once in Phase-1 and passed by reference.`);
  }
  
  if (!context.is_locked) {
    console.error(`🚨 [FATAL @ ${location}] CanonicalContext exists but is_locked=false!`);
    throw new Error(`FATAL @ ${location}: CanonicalContext is not locked. This violates Phase-1 immutability.`);
  }
  
  if (context.crop_code === 'UNKNOWN' || context.growth_stage === 'UNKNOWN') {
    console.error(`🚨 [FATAL @ ${location}] CanonicalContext has UNKNOWN crop/stage!`);
    console.error(`   Crop: ${context.crop_code}, Stage: ${context.growth_stage}`);
    throw new Error(`FATAL @ ${location}: CanonicalContext has UNKNOWN values. Context was not properly built.`);
  }
}

// CANONICAL CONTEXT TYPE (SINGLE SOURCE OF TRUTH)

// The unified canonical context object.
export interface CanonicalContext {
  // HARD INVARIANTS: These CANNOT be UNKNOWN once set
  readonly crop_code: string;
  readonly crop_name: string;
  readonly growth_stage: string;
  readonly days_since_sowing: number | null;
  
  // OPTIONAL DATA: Can be null but still tracked
  readonly ndvi: {
    readonly value: number | null;
    readonly trend: string | null;
    readonly interpretation: string | null;
    // v2.1.0 additions (optional/nullable)
    readonly reliability?: number | null;
    readonly observed_at?: string | null;
  };
  
  readonly soil: {
    readonly nitrogen: number | null;
    readonly phosphorus: number | null;
    readonly potassium: number | null;
    readonly ph: number | null;
    // v2.1.0 additions
    readonly type?: string | null;
    readonly organic_carbon_percent?: number | null;
    readonly moisture_status?: string | null;
    readonly confidence?: number | null;
  };
  
  readonly weather: {
    readonly temperature: number | null;
    readonly humidity: number | null;
    readonly rainfall_mm: number | null;
    // v2.1.0 additions
    readonly rainfall_after_sowing_mm?: number | null;
    readonly forecast_7d?: readonly any[] | null;
  };

  // v2.1.0 — crop lifecycle (AUTHORITY: crop_schedules only)
  readonly sowing_date?: string | null;
  readonly transplant_date?: string | null;
  readonly expected_harvest_date?: string | null;
  readonly crop_cycle?: string | null;
  readonly variety_id?: string | null;
  readonly crop_variety?: string | null;
  // v6 — cultivation_method (AUTHORITY: crop_schedules). Values:
  readonly cultivation_method?: string | null;


  // v2.1.0 — biological state reference (already immutable object)
  readonly biological_state?: Readonly<BiologicalState> | null;

  // v2.1.0 — water/irrigation (AUTHORITY: lands)
  readonly water?: {
    readonly irrigation_source?: string | null;
    readonly water_source?: string | null;
    readonly irrigation_type?: string | null;
  };

  // v2.1.0 — geo (AUTHORITY: lands)
  readonly geo?: {
    readonly village?: string | null;
    readonly taluka?: string | null;
    readonly district?: string | null;
    readonly state?: string | null;
    readonly gps_lat?: number | null;
    readonly gps_lng?: number | null;
    readonly elevation?: number | null;
    readonly slope?: number | null;
  };

  // v2.1.0 — land meta
  readonly area_acres?: number | null;
  
  // METADATA
  readonly land_id: string | null;
  readonly farmer_id: string | null;
  readonly source: 'BIOLOGICAL_STATE' | 'BIOLOGICAL_STATE_UNAVAILABLE' | 'CROP_SCHEDULES' | 'LAND_DATA' | 'INFERRED';
  readonly created_at: number;

  // v2.1.0 — per-field provenance (locked shape)
  readonly sources?: Readonly<{
    crop: 'crop_schedules';
    stage: 'biological_state' | 'crop_schedules';
    soil: Readonly<{ primary: 'soil_health'; fallback: 'lands_cache' | null; used: 'primary' | 'fallback' | 'none' }>;
    ndvi: Readonly<{ primary: 'ndvi_data'; fallback: 'lands_cache' | null; used: 'primary' | 'fallback' | 'none' }>;
    weather: Readonly<{
      current: 'weather_current';
      forecast: 'weather_forecasts';
      history: 'weather_aggregates';
    }>;
    water: 'lands';
    geo: 'lands';
  }>;
  
  // LOCK FLAGS: Once true, this context CANNOT be modified
  readonly is_locked: true;
  
  // Phase-1 lock flag - indicates context was built in orchestrator Phase-1
  readonly phase1_locked: true;
}

// Lightweight flag to indicate context presence without full object.
export interface ContextPresenceFlags {
  readonly has_crop: boolean;
  readonly has_stage: boolean;
  readonly has_land: boolean;
  readonly has_ndvi: boolean;
  readonly has_soil: boolean;
  readonly has_weather: boolean;
}

// BUILDER FUNCTION: Creates canonical context from landContext

// Build a canonical context from the orchestrator's landContext.
export function buildCanonicalContext(
  landContext: any,
  hasLandContext: boolean
): CanonicalContext | null {
  // FAIL-FAST INVARIANT CHECK
  if (hasLandContext && !landContext) {
    console.error(`🚨 [FAIL-FAST] hasLandContext=true but landContext is null/undefined`);
    throw new Error(`INVARIANT VIOLATION: hasLandContext=true but landContext is missing. Context MUST be a single canonical object.`);
  }
  
  if (!landContext) {
    return null; // No context available - this is valid for general queries
  }
  
  // Extract crop and stage - these are MANDATORY if context exists
  const cropCode = landContext.crop_code || landContext.current_crop?.toUpperCase() || null;
  const cropName = landContext.current_crop || landContext.crop_name || null;
  const growthStage = landContext.growth_stage || null;
  const daysSinceSowing = landContext.days_since_sowing ?? null;
  
  // FAIL-FAST: If we have landContext but missing critical fields
  if (hasLandContext && (!cropCode || cropCode === 'UNKNOWN' || !growthStage || growthStage === 'UNKNOWN')) {
    console.error(`🚨 [FAIL-FAST] hasLandContext=true but context is incomplete:`);
    console.error(`   Crop: ${cropCode || 'MISSING'}`);
    console.error(`   Stage: ${growthStage || 'MISSING'}`);
    throw new Error(`INVARIANT VIOLATION: hasLandContext=true but crop/stage is incomplete. Cannot proceed with partial context.`);
  }
  
  // Extract NDVI with fallback chain (primary: ndvi_data → cache: lands)
  const ndviObj = landContext.ndvi ?? null;
  const ndviValue =
    ndviObj?.latest_value ??
    ndviObj?.value ??
    landContext.ndvi_value ??
    landContext.last_ndvi_value ??
    null;

  const ndviTrend =
    ndviObj?.trend ??
    landContext.ndvi_trend ??
    null;

  const ndviInterpretation =
    ndviObj?.interpretation ??
    landContext.ndvi_interpretation ??
    null;

  const ndviReliability =
    ndviObj?.reliability ??
    landContext.ndvi_reliability ??
    null;
  const ndviObservedAt =
    ndviObj?.observed_at ??
    ndviObj?.captured_at ??
    landContext.last_ndvi_date ??
    null;
  // Fallback detection: value present but no ndvi_data-shaped object → lands cache
  const ndviUsedFallback =
    ndviValue != null && !ndviObj?.latest_value && !ndviObj?.value;

  // Extract soil data (primary: soil_health → cache: lands)
  const soilObj = landContext.soil ?? null;
  const soilHealthObj = landContext.soil_health ?? null;
  const soilN = soilHealthObj?.nitrogen ?? soilObj?.nitrogen ?? landContext.soil_n ?? null;
  const soilP = soilHealthObj?.phosphorus ?? soilObj?.phosphorus ?? landContext.soil_p ?? null;
  const soilK = soilHealthObj?.potassium ?? soilObj?.potassium ?? landContext.soil_k ?? null;
  const soilPH = soilHealthObj?.ph ?? soilObj?.ph ?? landContext.soil_ph ?? null;
  const soilType = soilHealthObj?.soil_type ?? soilObj?.type ?? landContext.soil_type ?? null;
  const soilOC =
    soilHealthObj?.organic_carbon_percent ?? soilObj?.organic_carbon_percent ??
    landContext.organic_carbon_percent ?? null;
  const soilMoisture =
    landContext.current_moisture_status ?? soilObj?.moisture_status ?? soilHealthObj?.moisture_status ?? null;
  const soilConfidence = soilHealthObj?.confidence ?? soilObj?.confidence ?? null;
  const soilUsedFallback = !soilHealthObj && (soilN != null || soilP != null || soilK != null || soilPH != null);

  // Extract weather data
  const weatherObj = landContext.weather ?? null;
  const temp = weatherObj?.temperature ?? weatherObj?.temp ?? null;
  const humidity = weatherObj?.humidity ?? null;
  const rainfall = weatherObj?.rainfall_mm ?? weatherObj?.rain_mm ?? null;
  const rainAfterSowing =
    weatherObj?.rainfall_after_sowing_mm ??
    landContext.rainfall_after_sowing_mm ?? null;
  const forecast7d =
    weatherObj?.forecast_7d ??
    landContext.weather_forecast_7d ?? null;

  // Crop lifecycle — AUTHORITY: crop_schedules ONLY (never lands.last_sowing_date)
  const cropSchedule = landContext.crop_schedule ?? landContext.current_crop_schedule ?? null;
  const sowingDate =
    cropSchedule?.sowing_date ??
    landContext.sowing_date_from_schedule ??
    null;
  const transplantDate =
    cropSchedule?.transplant_date ??
    landContext.transplant_date_from_schedule ??
    null;
  const expectedHarvestDate =
    cropSchedule?.expected_harvest_date ??
    landContext.expected_harvest_date_from_schedule ??
    null;
  const cropCycle =
    cropSchedule?.crop_cycle ??
    landContext.crop_cycle ??
    null;
  const varietyId =
    cropSchedule?.variety_id ??
    landContext.current_crop_variety_id ??
    landContext.variety_id ??
    null;
  const cropVariety =
    cropSchedule?.crop_variety ??
    landContext.current_crop_variety ??
    landContext.crop_variety ??
    null;

  // v6 — cultivation_method: crop_schedules is authoritative; biological_state
  const cultivationMethod =
    (landContext.biological_state as BiologicalState | null | undefined)?.cultivation_method ??
    cropSchedule?.cultivation_method ??
    landContext.cultivation_method ??
    null;

  // Biological state reference (already immutable)
  const biologicalState = (landContext.biological_state ?? null) as BiologicalState | null;
  const stageSource: 'biological_state' | 'crop_schedules' =
    biologicalState?.is_locked ? 'biological_state' : 'crop_schedules';


  // Water / irrigation — lands
  const waterBlock = Object.freeze({
    irrigation_source: landContext.irrigation_source ?? null,
    water_source: landContext.water_source ?? null,
    irrigation_type: landContext.irrigation_type ?? null,
  });

  // Geo — lands
  const geoBlock = Object.freeze({
    village: landContext.village ?? null,
    taluka: landContext.taluka ?? null,
    district: landContext.district ?? null,
    state: landContext.state ?? null,
    gps_lat: landContext.gps_lat ?? landContext.center_lat ?? null,
    gps_lng: landContext.gps_lng ?? landContext.center_lng ?? null,
    elevation: landContext.elevation ?? null,
    slope: landContext.slope ?? null,
  });

  const sourcesBlock = Object.freeze({
    crop: 'crop_schedules' as const,
    stage: stageSource,
    soil: Object.freeze({
      primary: 'soil_health' as const,
      fallback: 'lands_cache' as const,
      used: (soilHealthObj ? 'primary' : soilUsedFallback ? 'fallback' : 'none') as 'primary' | 'fallback' | 'none',
    }),
    ndvi: Object.freeze({
      primary: 'ndvi_data' as const,
      fallback: 'lands_cache' as const,
      used: (ndviObj?.latest_value != null || ndviObj?.value != null
        ? 'primary'
        : ndviUsedFallback
          ? 'fallback'
          : 'none') as 'primary' | 'fallback' | 'none',
    }),
    weather: Object.freeze({
      current: 'weather_current' as const,
      forecast: 'weather_forecasts' as const,
      history: 'weather_aggregates' as const,
    }),
    water: 'lands' as const,
    geo: 'lands' as const,
  });

  // Build the immutable canonical context
  const canonicalContext: CanonicalContext = Object.freeze({
    crop_code: cropCode || 'UNKNOWN',
    crop_name: cropName || 'Unknown',
    growth_stage: growthStage || 'UNKNOWN',
    days_since_sowing: daysSinceSowing,

    ndvi: Object.freeze({
      value: ndviValue,
      trend: ndviTrend,
      interpretation: ndviInterpretation,
      reliability: ndviReliability,
      observed_at: ndviObservedAt,
    }),

    soil: Object.freeze({
      nitrogen: soilN,
      phosphorus: soilP,
      potassium: soilK,
      ph: soilPH,
      type: soilType,
      organic_carbon_percent: soilOC,
      moisture_status: soilMoisture,
      confidence: soilConfidence,
    }),

    weather: Object.freeze({
      temperature: temp,
      humidity: humidity,
      rainfall_mm: rainfall,
      rainfall_after_sowing_mm: rainAfterSowing,
      forecast_7d: forecast7d ? Object.freeze([...forecast7d]) : null,
    }),

    sowing_date: sowingDate,
    transplant_date: transplantDate,
    expected_harvest_date: expectedHarvestDate,
    crop_cycle: cropCycle,
    cultivation_method: cultivationMethod
      ? String(cultivationMethod).toLowerCase()
      : null,
    variety_id: varietyId,
    crop_variety: cropVariety,


    biological_state: biologicalState,

    water: waterBlock,
    geo: geoBlock,

    area_acres: landContext.area_acres ?? landContext.total_area_acres ?? null,

    land_id: landContext.land_id || null,
    farmer_id: landContext.farmer_id || null,
    source: landContext.source || 'LAND_DATA',
    created_at: Date.now(),

    sources: sourcesBlock,

    is_locked: true,
    phase1_locked: true,
  });

  console.log(`✅ [CanonicalContext] Built and LOCKED:`);
  console.log(`   Crop=${canonicalContext.crop_code}, Stage=${canonicalContext.growth_stage}`);
  console.log(`   DAS=${canonicalContext.days_since_sowing}, NDVI=${canonicalContext.ndvi.value}`);
  console.log(`   Source=${canonicalContext.source}, is_locked=true`);
  console.log(
    `[CANONICAL_CONTEXT_SRC] src.crop=crop_schedules src.stage=${sourcesBlock.stage} ` +
    `src.soil=${sourcesBlock.soil.used}(${sourcesBlock.soil.primary}|${sourcesBlock.soil.fallback}) ` +
    `src.ndvi=${sourcesBlock.ndvi.used}(${sourcesBlock.ndvi.primary}|${sourcesBlock.ndvi.fallback}) ` +
    `bio_locked=${!!biologicalState?.is_locked} ` +
    `cultivation_method=${cultivationMethod ?? 'null'} ` +
    `resolved_stage=${biologicalState?.resolved_stage ?? biologicalState?.growth_stage ?? 'null'} ` +
    `stage_code=${biologicalState?.stage_code ?? 'null'} ` +
    `stage_source=${biologicalState?.stage_source ?? biologicalState?.source ?? 'null'} ` +
    `sowing=${sowingDate ?? 'null'} transplant=${transplantDate ?? 'null'}`
  );


  return canonicalContext;
}

// VALIDATION FUNCTIONS

// Check if canonical context is complete enough for DIAGNOSTIC_CONFIRMATION
export function hasDiagnosticContext(context: CanonicalContext | null): boolean {
  if (!context) return false;
  return (
    context.crop_code !== 'UNKNOWN' && 
    context.growth_stage !== 'UNKNOWN' && 
    context.is_locked === true
  );
}

// Extract presence flags from canonical context
export function getContextPresenceFlags(context: CanonicalContext | null): ContextPresenceFlags {
  if (!context) {
    return {
      has_crop: false,
      has_stage: false,
      has_land: false,
      has_ndvi: false,
      has_soil: false,
      has_weather: false
    };
  }
  
  return {
    has_crop: context.crop_code !== 'UNKNOWN',
    has_stage: context.growth_stage !== 'UNKNOWN',
    has_land: context.land_id !== null,
    has_ndvi: context.ndvi.value !== null,
    has_soil: context.soil.nitrogen !== null || context.soil.phosphorus !== null || context.soil.potassium !== null,
    has_weather: context.weather.temperature !== null || context.weather.humidity !== null
  };
}

// Validate that context integrity is maintained.
export function validateContextIntegrity(
  context: CanonicalContext | null,
  hasContextFlag: boolean,
  location: string
): void {
  if (hasContextFlag && !context) {
    console.error(`🚨 [FAIL-FAST @ ${location}] hasContext=true but context is null!`);
    throw new Error(`INVARIANT VIOLATION @ ${location}: hasContext=true but context is missing.`);
  }
  
  if (hasContextFlag && context && (context.crop_code === 'UNKNOWN' || context.growth_stage === 'UNKNOWN')) {
    console.error(`🚨 [FAIL-FAST @ ${location}] hasContext=true but crop/stage is UNKNOWN!`);
    console.error(`   Crop: ${context.crop_code}, Stage: ${context.growth_stage}`);
    throw new Error(`INVARIANT VIOLATION @ ${location}: hasContext=true but crop/stage is UNKNOWN.`);
  }
  
  if (context && !context.is_locked) {
    console.error(`🚨 [FAIL-FAST @ ${location}] Context exists but is_locked is false!`);
    throw new Error(`INVARIANT VIOLATION @ ${location}: Context must always be locked.`);
  }
}

// TERMINAL DAMAGE DETECTION

// Terminal damage indicators that trigger DIAGNOSTIC_CONFIRMATION mode.
export const TERMINAL_DAMAGE_INDICATORS = [
  'SEEDLING_DIED',
  'PLANT_DIED',
  'AFFECTED_PART_WHOLE',
  'ESTABLISHMENT_FAILURE',
  'PATCHY_DAMAGE',
  'GAPS_IN_FIELD',
  'PLANT_DEATH',
  'CROP_FAILURE',
  'DEAD_SEEDLINGS',
  'PLANT_DRYING',
  'WILTING_SEVERE'
];

// High severity indicators that combine with PATCHY_DAMAGE to trigger DIAGNOSTIC_CONFIRMATION.
export const HIGH_SEVERITY_INDICATORS = [
  'SEVERITY_HIGH',
  'ENTIRE_FIELD_AFFECTED',
  'SEVERITY_CRITICAL',
  'AFFECTED_PERCENTAGE_HIGH'
];

// Check if terminal damage indicators are present in observations.
export function hasTerminalDamage(observations: Set<string> | string[]): boolean {
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  
  // Check for direct terminal damage indicators
  const hasTerminal = TERMINAL_DAMAGE_INDICATORS.some(ind => obsSet.has(ind));
  
  // Check for PATCHY_DAMAGE + SEVERITY_HIGH combination
  const hasPatchyWithHighSeverity = 
    obsSet.has('PATCHY_DAMAGE') && 
    HIGH_SEVERITY_INDICATORS.some(ind => obsSet.has(ind));
  
  return hasTerminal || hasPatchyWithHighSeverity;
}

// Get the specific terminal damage indicators that were detected.
export function getDetectedTerminalDamage(observations: Set<string> | string[]): string[] {
  const obsSet = observations instanceof Set ? observations : new Set(observations);
  const detected: string[] = [];
  
  TERMINAL_DAMAGE_INDICATORS.forEach(ind => {
    if (obsSet.has(ind)) detected.push(ind);
  });
  
  if (obsSet.has('PATCHY_DAMAGE')) {
    HIGH_SEVERITY_INDICATORS.forEach(ind => {
      if (obsSet.has(ind)) detected.push(`PATCHY_DAMAGE+${ind}`);
    });
  }
  
  return detected;
}

// LOGGING HELPERS

// Log canonical context in production format for audit trail.
export function logCanonicalContextAudit(
  context: CanonicalContext | null,
  scope: string,
  source: string
): void {
  console.log(`\n✅ [ProductionAudit] Canonical Context State:`);
  console.log(`   Scope=${scope}`);
  console.log(`   Source=${source}`);
  console.log(`   CanonicalContext=LOCKED`);
  
  if (context) {
    console.log(`   Crop=${context.crop_code} (INVARIANT)`);
    console.log(`   Stage=${context.growth_stage} (INVARIANT)`);
    console.log(`   DAS=${context.days_since_sowing} (INVARIANT)`);
    console.log(`   NDVI=${context.ndvi.value} (INVARIANT)`);
    console.log(`   ContextPreserved=true`);
  } else {
    console.log(`   Context=NULL (General Query Mode)`);
  }
}
