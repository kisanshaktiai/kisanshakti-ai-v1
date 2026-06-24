/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXT TRACER (v2.0.0 — scope-aware)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tracks crop/stage/DAS resolution through the execution path to detect
 * where context data is lost or incorrectly transformed.
 *
 * v2.0 CHANGES (Task 4):
 *   - Removed unbounded module-level `Map<traceId, ContextTracePoint[]>` —
 *     trace points now live on `RequestScope.turnCache.engineState['tracer:points']`
 *     when a scope is passed, eliminating the per-turn-id memory leak.
 *   - The pre-Task-7 legacy fallback (no scope) uses a bounded LRU
 *     (MAX_LEGACY_TRACES) so an isolate cannot grow forever.
 *   - `clearTrace` is a structural no-op when scope is provided (state dies
 *     with the scope).
 *
 * TRACE POINTS:
 * 1. LAND_FETCH          - After fetchComprehensiveLandContext()
 * 2. CANONICAL_CONTEXT   - After buildCanonicalContextContract()
 * 3. CANONICAL_STATE     - Before buildCanonicalState()
 * 4. OPTION_SELECTED     - At clarification rebuild path
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RequestScope } from '../runtime/request-scope.ts';

export const CONTEXT_TRACER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

export interface TraceInput {
  crop?: string | null;
  crop_code?: string | null;
  stage?: string | null;
  das?: number | null;
  ndvi?: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE — scope-aware with bounded LRU legacy fallback
// ═══════════════════════════════════════════════════════════════════════════

const TRACER_SLOT = 'tracer:points';

/** Bounded fallback storage for callers that have not yet threaded scope.
 * MUST stay small; the bound is the guardrail against the v1 leak. */
const MAX_LEGACY_TRACES = 64;
const legacyTraces: Map<string, ContextTracePoint[]> = new Map();

function getPointsForScope(scope: RequestScope): ContextTracePoint[] {
  let points = scope.turnCache.engineState.get(TRACER_SLOT) as
    | ContextTracePoint[]
    | undefined;
  if (!points) {
    points = [];
    scope.turnCache.engineState.set(TRACER_SLOT, points);
  }
  return points;
}

function getLegacyPoints(traceId: string): ContextTracePoint[] {
  let points = legacyTraces.get(traceId);
  if (!points) {
    points = [];
    // Evict oldest insertion if at cap (Map preserves insertion order).
    if (legacyTraces.size >= MAX_LEGACY_TRACES) {
      const oldest = legacyTraces.keys().next().value;
      if (oldest !== undefined) legacyTraces.delete(oldest);
    }
    legacyTraces.set(traceId, points);
  }
  return points;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize trace for a new turn.
 * When `scope` is provided this is a structural no-op (storage lives on scope).
 */
export function initializeTrace(traceId: string, scope?: RequestScope): void {
  if (scope) {
    scope.turnCache.engineState.set(TRACER_SLOT, []);
    console.log(`📍 [ContextTracer] Initialized trace on scope: ${scope.traceId}`);
    return;
  }
  getLegacyPoints(traceId).length = 0;
  console.log(`📍 [ContextTracer] Initialized trace (legacy): ${traceId}`);
}

/**
 * Clear trace at end of turn. No-op when `scope` is provided (dies with scope).
 */
export function clearTrace(traceId: string, scope?: RequestScope): void {
  if (scope) return;
  legacyTraces.delete(traceId);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACE POINT CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a trace point and store it for the current turn.
 * Prefer passing `scope`. The `traceId` overload is preserved for legacy
 * callers and stores into the bounded legacy Map.
 */
export function traceContextPoint(
  location: TraceLocation,
  data: TraceInput,
  source: string,
  traceIdOrScope?: string | RequestScope
): ContextTracePoint {
  const point: ContextTracePoint = {
    location,
    crop_name: data.crop || null,
    crop_code: data.crop_code || null,
    growth_stage: data.stage || null,
    days_since_sowing: data.das ?? null,
    ndvi_value: data.ndvi ?? null,
    source,
    timestamp: Date.now(),
  };

  if (traceIdOrScope && typeof traceIdOrScope === 'object' && 'turnCache' in traceIdOrScope) {
    const scope = traceIdOrScope as RequestScope;
    getPointsForScope(scope).push(point);
    scope.emit({
      stage: 'context-tracer',
      kind: 'derive',
      payload: { location, source, ...data },
    });
  } else if (typeof traceIdOrScope === 'string') {
    getLegacyPoints(traceIdOrScope).push(point);
  }

  console.log(`📍 [ContextTracer] TRACE @ ${location}:`);
  console.log(`   Crop: ${point.crop_name || point.crop_code || 'NULL'}`);
  console.log(`   Stage: ${point.growth_stage || 'NULL'}`);
  console.log(`   DAS: ${point.days_since_sowing !== null ? point.days_since_sowing : 'NULL'}`);
  console.log(`   NDVI: ${point.ndvi_value !== null ? point.ndvi_value : 'NULL'}`);
  console.log(`   Source: ${source}`);

  return point;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT HELPERS FOR DIFFERENT DATA SHAPES
// ═══════════════════════════════════════════════════════════════════════════

export function traceFromLandContext(
  location: TraceLocation,
  landContext: any,
  traceIdOrScope?: string | RequestScope
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: landContext?.current_crop,
      crop_code: landContext?.crop_code || landContext?.current_crop?.toUpperCase(),
      stage: landContext?.growth_stage,
      das: landContext?.days_since_sowing ?? landContext?.days_after_sowing,
      ndvi: landContext?.ndvi?.value ?? landContext?.ndvi?.mean_ndvi ?? landContext?.ndvi_value,
    },
    'landContext',
    traceIdOrScope
  );
}

export function traceFromCanonicalContext(
  location: TraceLocation,
  canonicalContext: any,
  traceIdOrScope?: string | RequestScope
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: canonicalContext?.crop_name,
      crop_code: canonicalContext?.crop_code,
      stage: canonicalContext?.growth_stage,
      das: canonicalContext?.days_since_sowing,
      ndvi: canonicalContext?.ndvi?.value,
    },
    'CanonicalContext',
    traceIdOrScope
  );
}

export function traceFromCanonicalState(
  location: TraceLocation,
  canonicalState: any,
  traceIdOrScope?: string | RequestScope
): ContextTracePoint {
  return traceContextPoint(
    location,
    {
      crop: canonicalState?.crop_type,
      crop_code: canonicalState?.crop_type,
      stage: canonicalState?.crop_stage,
      das: canonicalState?.days_after_sowing_exact,
      ndvi: canonicalState?.ndvi_value,
    },
    'CanonicalState',
    traceIdOrScope
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectContextDrift(
  point1: ContextTracePoint,
  point2: ContextTracePoint
): ContextDriftReport {
  const driftDetails: DriftDetail[] = [];

  const crop1 = (point1.crop_code || point1.crop_name || '').toUpperCase();
  const crop2 = (point2.crop_code || point2.crop_name || '').toUpperCase();
  if (crop1 && crop2 && crop1 !== crop2 && crop1 !== 'UNKNOWN' && crop2 !== 'UNKNOWN') {
    driftDetails.push({ field: 'crop', value1: crop1, value2: crop2, severity: 'CRITICAL' });
  }

  const stage1 = (point1.growth_stage || '').toUpperCase();
  const stage2 = (point2.growth_stage || '').toUpperCase();
  if (stage1 && stage2 && stage1 !== stage2 && stage1 !== 'UNKNOWN' && stage2 !== 'UNKNOWN') {
    driftDetails.push({ field: 'growth_stage', value1: stage1, value2: stage2, severity: 'CRITICAL' });
  }

  if (point1.days_since_sowing !== null && point2.days_since_sowing === null) {
    driftDetails.push({
      field: 'days_since_sowing',
      value1: point1.days_since_sowing,
      value2: point2.days_since_sowing,
      severity: 'CRITICAL',
    });
  } else if (
    point1.days_since_sowing !== null &&
    point2.days_since_sowing === 0 &&
    point1.days_since_sowing !== 0
  ) {
    driftDetails.push({
      field: 'days_since_sowing',
      value1: point1.days_since_sowing,
      value2: point2.days_since_sowing,
      severity: 'CRITICAL',
    });
  }

  if (point1.ndvi_value !== null && point2.ndvi_value === null) {
    driftDetails.push({
      field: 'ndvi_value',
      value1: point1.ndvi_value,
      value2: point2.ndvi_value,
      severity: 'WARNING',
    });
  }

  const hasDrift = driftDetails.length > 0;
  if (hasDrift) {
    console.error(
      `🚨 [ContextTracer] DRIFT DETECTED between ${point1.location} → ${point2.location}:`
    );
    driftDetails.forEach((d) => {
      const icon = d.severity === 'CRITICAL' ? '❌' : d.severity === 'WARNING' ? '⚠️' : 'ℹ️';
      console.error(`   ${icon} ${d.field}: ${d.value1} → ${d.value2} [${d.severity}]`);
    });
  }

  return { has_drift: hasDrift, drift_details: driftDetails, point1, point2 };
}

function resolvePoints(traceIdOrScope: string | RequestScope): ContextTracePoint[] {
  if (typeof traceIdOrScope === 'object' && 'turnCache' in traceIdOrScope) {
    return getPointsForScope(traceIdOrScope);
  }
  return legacyTraces.get(traceIdOrScope as string) ?? [];
}

export function logSessionDrifts(traceIdOrScope: string | RequestScope): void {
  const points = resolvePoints(traceIdOrScope);
  const traceId =
    typeof traceIdOrScope === 'object' ? traceIdOrScope.traceId : traceIdOrScope;

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
    if (drift.has_drift) driftCount++;
  }

  if (driftCount === 0) {
    console.log(`   ✅ No context drift detected across all trace points`);
  } else {
    console.error(`   ❌ ${driftCount} drift(s) detected in execution path`);
  }
  console.log(`📍 [ContextTracer] ═══ END DRIFT ANALYSIS ═══\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANT ASSERTION (unchanged — pure function over its inputs)
// ═══════════════════════════════════════════════════════════════════════════

export function assertAndCorrectContextAlignment(
  canonicalContext: any,
  canonicalState: any,
  location: string
): any {
  if (!canonicalContext || !canonicalState) return canonicalState;

  const contextCrop = (canonicalContext.crop_code || '').toUpperCase();
  const stateCrop = (canonicalState.crop_type || '').toUpperCase();
  const contextStage = (canonicalContext.growth_stage || '').toUpperCase();
  const stateStage = (canonicalState.crop_stage || '').toUpperCase();

  let corrected = false;

  if (contextCrop && contextCrop !== 'UNKNOWN' && stateCrop !== contextCrop) {
    console.error(
      `🚨 [INVARIANT @ ${location}] Crop drift: CanonicalContext=${contextCrop}, CanonicalState=${stateCrop}`
    );
    console.log(`   🔧 Correcting CanonicalState.crop_type to ${contextCrop}`);
    canonicalState.crop_type = contextCrop;
    corrected = true;
  }

  if (contextStage && contextStage !== 'UNKNOWN' && stateStage !== contextStage) {
    console.error(
      `🚨 [INVARIANT @ ${location}] Stage drift: CanonicalContext=${contextStage}, CanonicalState=${stateStage}`
    );
    console.log(`   🔧 Correcting CanonicalState.crop_stage to ${contextStage}`);
    canonicalState.crop_stage = contextStage;
    corrected = true;
  }

  if (
    canonicalContext.days_since_sowing !== null &&
    canonicalState.days_after_sowing_exact !== canonicalContext.days_since_sowing
  ) {
    console.error(
      `🚨 [INVARIANT @ ${location}] DAS drift: CanonicalContext=${canonicalContext.days_since_sowing}, CanonicalState=${canonicalState.days_after_sowing_exact}`
    );
    console.log(
      `   🔧 Correcting CanonicalState.days_after_sowing_exact to ${canonicalContext.days_since_sowing}`
    );
    canonicalState.days_after_sowing_exact = canonicalContext.days_since_sowing;
    corrected = true;
  }

  if (corrected) console.log(`   ✅ CanonicalState corrected to match CanonicalContext`);

  return canonicalState;
}

export function getTraceSummary(traceIdOrScope: string | RequestScope): string {
  const points = resolvePoints(traceIdOrScope);
  const traceId =
    typeof traceIdOrScope === 'object' ? traceIdOrScope.traceId : traceIdOrScope;
  if (!points || points.length === 0) return `No trace points for ${traceId}`;
  return points
    .map(
      (p, i) =>
        `${i + 1}. ${p.location}: crop=${p.crop_name || p.crop_code || 'NULL'}, stage=${p.growth_stage || 'NULL'}, DAS=${p.days_since_sowing ?? 'NULL'}`
    )
    .join('\n');
}
