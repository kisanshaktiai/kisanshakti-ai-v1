/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL CONTEXT CONTRACT (v1.0.0)
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
 */

export const CANONICAL_CONTEXT_CONTRACT_VERSION = '2.0.0'; // v2: Phase-1 locking enforcement

// ═══════════════════════════════════════════════════════════════════════════
// FAIL-FAST ASSERTION (MANDATORY GUARD)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assert that canonical context is locked and non-null.
 * Call this at the START of any function that requires context.
 * This is the PRIMARY enforcement mechanism for canonical immutability.
 * 
 * @throws Error if context is null when it shouldn't be
 */
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
  
  // NO_ACTIVE_CROP is a legitimate state (e.g. harvested land). It must not
  // trip diagnostic invariant checks; downstream callers gate on `status`.
  if (context.status === 'NO_ACTIVE_CROP') return;

  if (context.crop_code === 'UNKNOWN' || context.growth_stage === 'UNKNOWN' ||
      !context.crop_code || !context.growth_stage) {
    console.error(`🚨 [FATAL @ ${location}] CanonicalContext has UNKNOWN crop/stage!`);
    console.error(`   Crop: ${context.crop_code}, Stage: ${context.growth_stage}`);
    throw new Error(`FATAL @ ${location}: CanonicalContext has UNKNOWN values. Context was not properly built.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL CONTEXT TYPE (SINGLE SOURCE OF TRUTH)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The unified canonical context object.
 * This is the ONLY context object that flows through the decision pipeline.
 * All other context types (landContext, cropContext, preservedContext) are DEPRECATED.
 */
export interface CanonicalContext {
  /**
   * ACTIVE      → land has a live crop schedule (crop_code/growth_stage set).
   * NO_ACTIVE_CROP → land exists but currently has no active crop (e.g. just
   *                 harvested). Diagnostic pipeline MUST short-circuit.
   */
  readonly status: 'ACTIVE' | 'NO_ACTIVE_CROP';

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD INVARIANTS for status=ACTIVE; null when status=NO_ACTIVE_CROP
  // ═══════════════════════════════════════════════════════════════════════════
  readonly crop_code: string | null;
  readonly crop_name: string | null;
  readonly growth_stage: string | null;
  readonly days_since_sowing: number | null;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL DATA: Can be null but still tracked
  // ═══════════════════════════════════════════════════════════════════════════
  readonly ndvi: {
    readonly value: number | null;
    readonly trend: string | null;
    readonly interpretation: string | null;
  };
  
  readonly soil: {
    readonly nitrogen: number | null;
    readonly phosphorus: number | null;
    readonly potassium: number | null;
    readonly ph: number | null;
    // v3.0 EXTENSIONS for NEXT_CROP_RECOMMENDATION symbolic brain
    readonly organic_carbon: number | null;
    readonly texture: string | null;     // e.g. 'CLAY', 'SANDY_LOAM'
    readonly agro_zone: string | null;   // ICAR/state agro-ecological zone code
    readonly irrigation_type: string | null; // 'DRIP'|'FLOOD'|'RAINFED'|...
  };

  readonly weather: {
    readonly temperature: number | null;
    readonly humidity: number | null;
    readonly rainfall_mm: number | null;
  };

  /** Populated when status=NO_ACTIVE_CROP and a prior schedule exists. */
  readonly last_harvest: {
    readonly crop_name: string;
    readonly crop_variety: string | null;
    readonly sowing_date: string | null;
    readonly actual_harvest_date: string | null;
  } | null;

  /**
   * Multi-season rotation history (most recent first) — sourced from
   * authoritative-state-loader's harvested crop_schedules. Used by the
   * NEXT_CROP_RECOMMENDATION lane to compute legume/cereal balance,
   * pest carryover, and rotation breaks.
   */
  readonly rotation_history: ReadonlyArray<{
    readonly crop_code: string;
    readonly crop_name: string;
    readonly crop_variety: string | null;
    readonly sowing_date: string | null;
    readonly harvest_date: string | null;
    readonly season: string | null;
  }>;

  /**
   * Variety profile — DB-sourced from master_products (product_type='seed').
   * Optional: null when the land's variety pointer is unset OR the crop has
   * no varieties seeded in master_products. When present, downstream layers
   * (LLM formatter prompt, symbolic rule evaluator, schedule planner) MUST
   * treat it as authoritative for maturity windows, resistance gating, and
   * yield expectations.
   */
  readonly variety: {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly maturity_days_min: number | null;
    readonly maturity_days_max: number | null;
    readonly state_match: boolean;
    readonly source: string;
    readonly resistance: ReadonlyArray<{
      readonly pathogen: string;
      readonly level: string;
      readonly observation_code: string | null;
    }>;
  } | null;

  
  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  readonly land_id: string | null;
  readonly farmer_id: string | null;
  readonly source: 'CROP_SCHEDULES' | 'LAND_DATA' | 'INFERRED';
  readonly created_at: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LOCK FLAGS: Once true, this context CANNOT be modified
  // ═══════════════════════════════════════════════════════════════════════════
  readonly is_locked: true;
  
  /**
   * Phase-1 lock flag - indicates context was built in orchestrator Phase-1
   * and must NOT be rebuilt anywhere else in the pipeline.
   */
  readonly phase1_locked: true;
}

/**
 * Lightweight flag to indicate context presence without full object.
 * Used for quick checks before accessing full context.
 */
export interface ContextPresenceFlags {
  readonly has_crop: boolean;
  readonly has_stage: boolean;
  readonly has_land: boolean;
  readonly has_ndvi: boolean;
  readonly has_soil: boolean;
  readonly has_weather: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION: Creates canonical context from landContext
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a canonical context from the orchestrator's landContext.
 * This function is called EXACTLY ONCE at the start of a turn.
 * 
 * @throws Error if landContext is flagged as present but incomplete
 */
export function buildCanonicalContext(
  landContext: any,
  hasLandContext: boolean
): CanonicalContext | null {
  // ═══════════════════════════════════════════════════════════════════════════
  // FAIL-FAST INVARIANT CHECK
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NO_ACTIVE_CROP: landContext exists but no active crop (e.g. harvested).
  // This is NOT an invariant violation — it's a legitimate state. Build a
  // status='NO_ACTIVE_CROP' context so downstream code can branch on it
  // instead of attempting diagnosis on an empty field.
  // ═══════════════════════════════════════════════════════════════════════════
  const isActive = !!cropCode && cropCode !== 'UNKNOWN' && !!growthStage && growthStage !== 'UNKNOWN';

  // Extract NDVI with fallback chain
  const ndviValue = 
    landContext.ndvi?.latest_value ?? 
    landContext.ndvi?.value ?? 
    landContext.ndvi_value ?? 
    null;
  
  const ndviTrend = 
    landContext.ndvi?.trend ?? 
    landContext.ndvi_trend ?? 
    null;
  
  const ndviInterpretation = 
    landContext.ndvi?.interpretation ?? 
    landContext.ndvi_interpretation ?? 
    null;
  
  // Extract soil data
  const soilN = landContext.soil?.nitrogen ?? landContext.soil_n ?? null;
  const soilP = landContext.soil?.phosphorus ?? landContext.soil_p ?? null;
  const soilK = landContext.soil?.potassium ?? landContext.soil_k ?? null;
  const soilPH = landContext.soil?.ph ?? landContext.soil_ph ?? null;
  const soilOC =
    landContext.soil?.organic_carbon ??
    landContext.soil?.oc ??
    landContext.soil_oc ??
    null;
  const soilTexture =
    landContext.soil?.texture ??
    landContext.soil_texture ??
    null;
  const agroZone =
    landContext.agro_zone ??
    landContext.agro_ecological_zone ??
    landContext.zone_code ??
    null;
  const irrigationType =
    landContext.irrigation_type ??
    landContext.irrigation?.type ??
    landContext.irrigation_method ??
    null;

  // Extract weather data
  const temp = landContext.weather?.temperature ?? landContext.weather?.temp ?? null;
  const humidity = landContext.weather?.humidity ?? null;
  const rainfall = landContext.weather?.rainfall_mm ?? landContext.weather?.rain_mm ?? null;

  const lastHarvestSrc = landContext.last_harvested_schedule || null;
  const lastHarvest = lastHarvestSrc
    ? Object.freeze({
        crop_name: lastHarvestSrc.crop_name,
        crop_variety: lastHarvestSrc.crop_variety ?? null,
        sowing_date: lastHarvestSrc.sowing_date ?? null,
        actual_harvest_date: lastHarvestSrc.actual_harvest_date ?? lastHarvestSrc.expected_harvest_date ?? null
      })
    : null;

  // Rotation history (most recent first). Loader populates either
  // `rotation_history` or `harvested_schedules`. Limit to last 5.
  const rotationSrc: any[] = Array.isArray(landContext.rotation_history)
    ? landContext.rotation_history
    : Array.isArray(landContext.harvested_schedules)
      ? landContext.harvested_schedules
      : [];
  const rotationHistory = Object.freeze(
    rotationSrc.slice(0, 5).map((r: any) => Object.freeze({
      crop_code: r.crop_code || r.crop?.toUpperCase?.() || 'UNKNOWN',
      crop_name: r.crop_name || r.crop || 'Unknown',
      crop_variety: r.crop_variety ?? r.variety ?? null,
      sowing_date: r.sowing_date ?? null,
      harvest_date: r.actual_harvest_date ?? r.expected_harvest_date ?? r.harvest_date ?? null,
      season: r.season ?? null,
    }))
  );
  
  // Build the immutable canonical context
  const canonicalContext: CanonicalContext = Object.freeze({
    status: isActive ? 'ACTIVE' : 'NO_ACTIVE_CROP',
    crop_code: isActive ? cropCode : null,
    crop_name: isActive ? (cropName || 'Unknown') : null,
    growth_stage: isActive ? growthStage : null,
    days_since_sowing: isActive ? daysSinceSowing : null,
    
    ndvi: Object.freeze({
      value: ndviValue,
      trend: ndviTrend,
      interpretation: ndviInterpretation
    }),
    
    soil: Object.freeze({
      nitrogen: soilN,
      phosphorus: soilP,
      potassium: soilK,
      ph: soilPH,
      organic_carbon: soilOC,
      texture: soilTexture,
      agro_zone: agroZone,
      irrigation_type: irrigationType,
    }),
    
    weather: Object.freeze({
      temperature: temp,
      humidity: humidity,
      rainfall_mm: rainfall
    }),

    last_harvest: lastHarvest,
    rotation_history: rotationHistory,

    // Variety profile — frozen snapshot of master_products row (if available)
    variety: landContext.variety_profile ? Object.freeze({
      id: landContext.variety_profile.variety_id,
      name: landContext.variety_profile.name,
      code: landContext.variety_profile.variety_code ?? null,
      maturity_days_min: landContext.variety_profile.maturity_days_min ?? null,
      maturity_days_max: landContext.variety_profile.maturity_days_max ?? null,
      state_match: !!landContext.variety_profile.state_match,
      source: landContext.variety_profile.source || 'none',
      resistance: Object.freeze(
        (landContext.variety_profile.resistance || []).map((r: any) => Object.freeze({
          pathogen: r.pathogen,
          level: r.level,
          observation_code: r.observation_code ?? null,
        }))
      ),
    }) : null,

    land_id: landContext.land_id || null,
    farmer_id: landContext.farmer_id || null,
    source: landContext.source || 'LAND_DATA',
    created_at: Date.now(),
    is_locked: true,
    phase1_locked: true
  });
  
  console.log(`✅ [CanonicalContext] Built and LOCKED (status=${canonicalContext.status}):`);
  console.log(`   Crop=${canonicalContext.crop_code}, Stage=${canonicalContext.growth_stage}`);
  console.log(`   DAS=${canonicalContext.days_since_sowing}, NDVI=${canonicalContext.ndvi.value}`);
  if (canonicalContext.variety) {
    console.log(`   Variety=${canonicalContext.variety.name} [${canonicalContext.variety.code || '-'}] ` +
      `maturity=${canonicalContext.variety.maturity_days_min || '?'}-${canonicalContext.variety.maturity_days_max || '?'}d ` +
      `resistance=${canonicalContext.variety.resistance.length} state_match=${canonicalContext.variety.state_match}`);
  }
  if (canonicalContext.status === 'NO_ACTIVE_CROP') {
    console.log(`   ℹ️ Land has no active crop. last_harvest=${lastHarvest?.crop_name || 'none'}`);
  }
  console.log(`   Source=${canonicalContext.source}, is_locked=true`);
  
  return canonicalContext;
}


// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if canonical context is complete enough for DIAGNOSTIC_CONFIRMATION
 */
export function hasDiagnosticContext(context: CanonicalContext | null): boolean {
  if (!context) return false;
  if (context.status !== 'ACTIVE') return false;
  return (
    !!context.crop_code &&
    context.crop_code !== 'UNKNOWN' &&
    !!context.growth_stage &&
    context.growth_stage !== 'UNKNOWN' &&
    context.is_locked === true
  );
}

/**
 * Extract presence flags from canonical context
 */
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
    has_crop: !!context.crop_code && context.crop_code !== 'UNKNOWN',
    has_stage: !!context.growth_stage && context.growth_stage !== 'UNKNOWN',
    has_land: context.land_id !== null,
    has_ndvi: context.ndvi.value !== null,
    has_soil: context.soil.nitrogen !== null || context.soil.phosphorus !== null || context.soil.potassium !== null,
    has_weather: context.weather.temperature !== null || context.weather.humidity !== null
  };
}

/**
 * Validate that context integrity is maintained.
 * Call this at critical points to catch violations early.
 */
export function validateContextIntegrity(
  context: CanonicalContext | null,
  hasContextFlag: boolean,
  location: string
): void {
  if (hasContextFlag && !context) {
    console.error(`🚨 [FAIL-FAST @ ${location}] hasContext=true but context is null!`);
    throw new Error(`INVARIANT VIOLATION @ ${location}: hasContext=true but context is missing.`);
  }

  // NO_ACTIVE_CROP is a legitimate state — skip crop/stage invariant.
  if (context && context.status === 'ACTIVE') {
    if (!context.crop_code || context.crop_code === 'UNKNOWN' ||
        !context.growth_stage || context.growth_stage === 'UNKNOWN') {
      console.error(`🚨 [FAIL-FAST @ ${location}] status=ACTIVE but crop/stage is UNKNOWN!`);
      console.error(`   Crop: ${context.crop_code}, Stage: ${context.growth_stage}`);
      throw new Error(`INVARIANT VIOLATION @ ${location}: status=ACTIVE but crop/stage is UNKNOWN.`);
    }
  }
  
  if (context && !context.is_locked) {
    console.error(`🚨 [FAIL-FAST @ ${location}] Context exists but is_locked is false!`);
    throw new Error(`INVARIANT VIOLATION @ ${location}: Context must always be locked.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL DAMAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Terminal damage indicators that trigger DIAGNOSTIC_CONFIRMATION mode.
 * When these are detected, we CONFIRM THE CAUSE - not ask about location.
 */
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

/**
 * High severity indicators that combine with PATCHY_DAMAGE to trigger DIAGNOSTIC_CONFIRMATION.
 */
export const HIGH_SEVERITY_INDICATORS = [
  'SEVERITY_HIGH',
  'ENTIRE_FIELD_AFFECTED',
  'SEVERITY_CRITICAL',
  'AFFECTED_PERCENTAGE_HIGH'
];

/**
 * Check if terminal damage indicators are present in observations.
 */
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

/**
 * Get the specific terminal damage indicators that were detected.
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log canonical context in production format for audit trail.
 */
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
