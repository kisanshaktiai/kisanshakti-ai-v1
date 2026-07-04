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
  
  if (context.crop_code === 'UNKNOWN' || context.growth_stage === 'UNKNOWN') {
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
  // ═══════════════════════════════════════════════════════════════════════════
  // HARD INVARIANTS: These CANNOT be UNKNOWN once set
  // ═══════════════════════════════════════════════════════════════════════════
  readonly crop_code: string;
  readonly crop_name: string;
  readonly growth_stage: string;
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
  };
  
  readonly weather: {
    readonly temperature: number | null;
    readonly humidity: number | null;
    readonly rainfall_mm: number | null;
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  readonly land_id: string | null;
  readonly farmer_id: string | null;
  readonly source: 'BIOLOGICAL_STATE' | 'BIOLOGICAL_STATE_UNAVAILABLE' | 'CROP_SCHEDULES' | 'LAND_DATA' | 'INFERRED';
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
  // FAIL-FAST: If we have landContext but missing critical fields
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasLandContext && (!cropCode || cropCode === 'UNKNOWN' || !growthStage || growthStage === 'UNKNOWN')) {
    console.error(`🚨 [FAIL-FAST] hasLandContext=true but context is incomplete:`);
    console.error(`   Crop: ${cropCode || 'MISSING'}`);
    console.error(`   Stage: ${growthStage || 'MISSING'}`);
    throw new Error(`INVARIANT VIOLATION: hasLandContext=true but crop/stage is incomplete. Cannot proceed with partial context.`);
  }
  
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
  
  // Extract weather data
  const temp = landContext.weather?.temperature ?? landContext.weather?.temp ?? null;
  const humidity = landContext.weather?.humidity ?? null;
  const rainfall = landContext.weather?.rainfall_mm ?? landContext.weather?.rain_mm ?? null;
  
  // Build the immutable canonical context
  const canonicalContext: CanonicalContext = Object.freeze({
    crop_code: cropCode || 'UNKNOWN',
    crop_name: cropName || 'Unknown',
    growth_stage: growthStage || 'UNKNOWN',
    days_since_sowing: daysSinceSowing,
    
    ndvi: Object.freeze({
      value: ndviValue,
      trend: ndviTrend,
      interpretation: ndviInterpretation
    }),
    
    soil: Object.freeze({
      nitrogen: soilN,
      phosphorus: soilP,
      potassium: soilK,
      ph: soilPH
    }),
    
    weather: Object.freeze({
      temperature: temp,
      humidity: humidity,
      rainfall_mm: rainfall
    }),
    
    land_id: landContext.land_id || null,
    farmer_id: landContext.farmer_id || null,
    source: landContext.source || 'LAND_DATA',
    created_at: Date.now(),
    is_locked: true,
    phase1_locked: true
  });
  
  console.log(`✅ [CanonicalContext] Built and LOCKED:`);
  console.log(`   Crop=${canonicalContext.crop_code}, Stage=${canonicalContext.growth_stage}`);
  console.log(`   DAS=${canonicalContext.days_since_sowing}, NDVI=${canonicalContext.ndvi.value}`);
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
  return (
    context.crop_code !== 'UNKNOWN' && 
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
    has_crop: context.crop_code !== 'UNKNOWN',
    has_stage: context.growth_stage !== 'UNKNOWN',
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
