// CONTEXT TRACER (v1.0.0)

export const CONTEXT_TRACER_VERSION = '1.0.0';

// TYPES

export interface ContextTracePoint {
  readonly location: TraceLocation;
  readonly crop_name: string | null;
  readonly crop_code: string | null;
  readonly growth_stage: string | null;
  readonly days_since_sowing: number | null;
  readonly ndvi_value: number | null;
  readonly source: string;
  readonly timestamp: number;
}

export type TraceLocation = 
  | 'LAND_FETCH'
  | 'CANONICAL_CONTEXT'
  | 'CANONICAL_STATE'
  | 'OPTION_SELECTED'
  | 'CLARIFICATION_REBUILD'
  | 'RULE_EVALUATION';

export interface ContextDriftReport {
  readonly has_drift: boolean;
  readonly drift_details: DriftDetail[];
  readonly point1: ContextTracePoint;
  readonly point2: ContextTracePoint;
}

export interface DriftDetail {
  readonly field: string;
  readonly value1: string | number | null;
  readonly value2: string | number | null;
  readonly severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

// SESSION TRACE STORAGE

// Per-session trace storage (cleared each turn)
let currentTraceId: string | null = null;
const tracePoints: Map<string, ContextTracePoint[]> = new Map();

// Initialize trace for a new turn
export function initializeTrace(traceId: string): void {
  currentTraceId = traceId;
  tracePoints.set(traceId, []);
  console.log(`📍 [ContextTracer] Initialized trace: ${traceId}`);
}

// Clear trace at end of turn
export function clearTrace(traceId: string): void {
  tracePoints.delete(traceId);
  if (currentTraceId === traceId) {
    currentTraceId = null;
  }
}

// TRACE POINT CREATION

export interface TraceInput {
  crop?: string | null;
  crop_code?: string | null;
  stage?: string | null;
  das?: number | null;
  ndvi?: number | null;
}

// Create a trace point and store it for the current session.
export function traceContextPoint(
  location: TraceLocation,
  data: TraceInput,
  source: string,
  traceId?: string
): ContextTracePoint {
  const effectiveTraceId = traceId || currentTraceId;
  
  const point: ContextTracePoint = {
    location,
    crop_name: data.crop || null,
    crop_code: data.crop_code || null,
    growth_stage: data.stage || null,
    days_since_sowing: data.das ?? null,
    ndvi_value: data.ndvi ?? null,
    source,
    timestamp: Date.now()
  };
  
  // Store in session
  if (effectiveTraceId) {
    const points = tracePoints.get(effectiveTraceId) || [];
    points.push(point);
    tracePoints.set(effectiveTraceId, points);
  }
  
  // Log the trace point
  console.log(`📍 [ContextTracer] TRACE @ ${location}:`);
  console.log(`   Crop: ${point.crop_name || point.crop_code || 'NULL'}`);
  console.log(`   Stage: ${point.growth_stage || 'NULL'}`);
  console.log(`   DAS: ${point.days_since_sowing !== null ? point.days_since_sowing : 'NULL'}`);
  console.log(`   NDVI: ${point.ndvi_value !== null ? point.ndvi_value : 'NULL'}`);
  console.log(`   Source: ${source}`);
  
  return point;
}

// CONTEXT HELPERS FOR DIFFERENT DATA SHAPES

// Trace from landContext object
export function traceFromLandContext(
  location: TraceLocation,
  landContext: any,
  traceId?: string
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: landContext?.current_crop,
      crop_code: landContext?.crop_code || landContext?.current_crop?.toUpperCase(),
      stage: landContext?.growth_stage,
      das: landContext?.days_since_sowing ?? landContext?.days_after_sowing,
      ndvi: landContext?.ndvi?.value ?? landContext?.ndvi?.mean_ndvi ?? landContext?.ndvi_value
    },
    'landContext',
    traceId
  );
}

// Trace from CanonicalContext object
export function traceFromCanonicalContext(
  location: TraceLocation,
  canonicalContext: any,
  traceId?: string
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: canonicalContext?.crop_name,
      crop_code: canonicalContext?.crop_code,
      stage: canonicalContext?.growth_stage,
      das: canonicalContext?.days_since_sowing,
      ndvi: canonicalContext?.ndvi?.value
    },
    'CanonicalContext',
    traceId
  );
}

// Trace from CanonicalState object
export function traceFromCanonicalState(
  location: TraceLocation,
  canonicalState: any,
  traceId?: string
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: canonicalState?.crop_type,
      crop_code: canonicalState?.crop_type,
      stage: canonicalState?.crop_stage,
      das: canonicalState?.days_after_sowing_exact,
      ndvi: canonicalState?.ndvi_value
    },
    'CanonicalState',
    traceId
  );
}

// DRIFT DETECTION

// Compare two trace points and detect drift.
export function detectContextDrift(
  point1: ContextTracePoint,
  point2: ContextTracePoint
): ContextDriftReport {
  const driftDetails: DriftDetail[] = [];
  
  // Check crop drift
  const crop1 = (point1.crop_code || point1.crop_name || '').toUpperCase();
  const crop2 = (point2.crop_code || point2.crop_name || '').toUpperCase();
  if (crop1 && crop2 && crop1 !== crop2 && crop1 !== 'UNKNOWN' && crop2 !== 'UNKNOWN') {
    driftDetails.push({
      field: 'crop',
      value1: crop1,
      value2: crop2,
      severity: 'CRITICAL'
    });
  }
  
  // Check stage drift
  const stage1 = (point1.growth_stage || '').toUpperCase();
  const stage2 = (point2.growth_stage || '').toUpperCase();
  if (stage1 && stage2 && stage1 !== stage2 && stage1 !== 'UNKNOWN' && stage2 !== 'UNKNOWN') {
    driftDetails.push({
      field: 'growth_stage',
      value1: stage1,
      value2: stage2,
      severity: 'CRITICAL'
    });
  }
  
  // Check DAS drift (allow for time-based changes, but flag if data was lost)
  if (point1.days_since_sowing !== null && point2.days_since_sowing === null) {
    driftDetails.push({
      field: 'days_since_sowing',
      value1: point1.days_since_sowing,
      value2: point2.days_since_sowing,
      severity: 'CRITICAL' // DAS was LOST - this is serious
    });
  } else if (point1.days_since_sowing !== null && point2.days_since_sowing === 0 && point1.days_since_sowing !== 0) {
    driftDetails.push({
      field: 'days_since_sowing',
      value1: point1.days_since_sowing,
      value2: point2.days_since_sowing,
      severity: 'CRITICAL' // DAS defaulted to 0 - this is the bug!
    });
  }
  
  // Check NDVI drift (data loss, not natural changes)
  if (point1.ndvi_value !== null && point2.ndvi_value === null) {
    driftDetails.push({
      field: 'ndvi_value',
      value1: point1.ndvi_value,
      value2: point2.ndvi_value,
      severity: 'WARNING'
    });
  }
  
  const hasDrift = driftDetails.length > 0;
  
  if (hasDrift) {
    console.error(`🚨 [ContextTracer] DRIFT DETECTED between ${point1.location} → ${point2.location}:`);
    driftDetails.forEach(d => {
      const icon = d.severity === 'CRITICAL' ? '❌' : d.severity === 'WARNING' ? '⚠️' : 'ℹ️';
      console.error(`   ${icon} ${d.field}: ${d.value1} → ${d.value2} [${d.severity}]`);
    });
  }
  
  return {
    has_drift: hasDrift,
    drift_details: driftDetails,
    point1,
    point2
  };
}

// Log all drift between consecutive trace points for a session.
export function logSessionDrifts(traceId: string): void {
  const points = tracePoints.get(traceId);
  if (!points || points.length < 2) {
    console.log(`📍 [ContextTracer] No drift analysis possible - need 2+ trace points`);
    return;
  }
  
  console.log(`\n📍 [ContextTracer] ═══ SESSION DRIFT ANALYSIS ═══`);
  console.log(`   Trace ID: ${traceId}`);
  console.log(`   Total Points: ${points.length}`);
  
  let driftCount = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const drift = detectContextDrift(points[i], points[i + 1]);
    if (drift.has_drift) {
      driftCount++;
    }
  }
  
  if (driftCount === 0) {
    console.log(`   ✅ No context drift detected across all trace points`);
  } else {
    console.error(`   ❌ ${driftCount} drift(s) detected in execution path`);
  }
  console.log(`📍 [ContextTracer] ═══ END DRIFT ANALYSIS ═══\n`);
}

// INVARIANT ASSERTION

// Assert that CanonicalState matches CanonicalContext (the locked authority).
export function assertAndCorrectContextAlignment(
  canonicalContext: any,
  canonicalState: any,
  location: string
): any {
  if (!canonicalContext || !canonicalState) {
    return canonicalState;
  }
  
  const contextCrop = (canonicalContext.crop_code || '').toUpperCase();
  const stateCrop = (canonicalState.crop_type || '').toUpperCase();
  const contextStage = (canonicalContext.growth_stage || '').toUpperCase();
  const stateStage = (canonicalState.crop_stage || '').toUpperCase();
  
  let corrected = false;
  
  // Check crop alignment
  if (contextCrop && contextCrop !== 'UNKNOWN' && stateCrop !== contextCrop) {
    console.error(`🚨 [INVARIANT @ ${location}] Crop drift: CanonicalContext=${contextCrop}, CanonicalState=${stateCrop}`);
    console.log(`   🔧 Correcting CanonicalState.crop_type to ${contextCrop}`);
    canonicalState.crop_type = contextCrop;
    corrected = true;
  }
  
  // Check stage alignment
  if (contextStage && contextStage !== 'UNKNOWN' && stateStage !== contextStage) {
    console.error(`🚨 [INVARIANT @ ${location}] Stage drift: CanonicalContext=${contextStage}, CanonicalState=${stateStage}`);
    console.log(`   🔧 Correcting CanonicalState.crop_stage to ${contextStage}`);
    canonicalState.crop_stage = contextStage;
    corrected = true;
  }
  
  // Check DAS - CanonicalContext has exact value, CanonicalState should match
  if (canonicalContext.days_since_sowing !== null && canonicalState.days_after_sowing_exact !== canonicalContext.days_since_sowing) {
    console.error(`🚨 [INVARIANT @ ${location}] DAS drift: CanonicalContext=${canonicalContext.days_since_sowing}, CanonicalState=${canonicalState.days_after_sowing_exact}`);
    console.log(`   🔧 Correcting CanonicalState.days_after_sowing_exact to ${canonicalContext.days_since_sowing}`);
    canonicalState.days_after_sowing_exact = canonicalContext.days_since_sowing;
    corrected = true;
  }
  
  if (corrected) {
    console.log(`   ✅ CanonicalState corrected to match CanonicalContext`);
  }
  
  return canonicalState;
}

// Get summary of all trace points for debugging
export function getTraceSummary(traceId: string): string {
  const points = tracePoints.get(traceId);
  if (!points || points.length === 0) {
    return `No trace points for ${traceId}`;
  }
  
  const lines = points.map((p, i) => 
    `${i + 1}. ${p.location}: crop=${p.crop_name || p.crop_code || 'NULL'}, stage=${p.growth_stage || 'NULL'}, DAS=${p.days_since_sowing ?? 'NULL'}`
  );
  
  return lines.join('\n');
}
