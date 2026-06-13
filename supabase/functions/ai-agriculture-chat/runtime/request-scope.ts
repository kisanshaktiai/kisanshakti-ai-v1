/**
 * RequestScope — per-turn causal container for the symbolic decision brain.
 *
 * Solves the warm-isolate cross-tenant leakage problem by ensuring every piece
 * of mutable state (authoritative context, clarification answers, DB client,
 * caches, trace events) lives on a per-request object and dies when the
 * request ends. No module-level mutable state allowed.
 *
 * Every function in decision/ and agents/ that needs request-scoped data
 * must take `scope: RequestScope` as its first parameter.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface TraceEvent {
  /** Milliseconds since scope creation */
  ts: number;
  /** Inherited from scope */
  traceId: string;
  /** Pipeline stage emitting the event */
  stage: string;
  /** Kind of event */
  kind: 'read' | 'derive' | 'decide' | 'block' | 'emit' | 'error';
  /** Free-form structured payload */
  payload: Record<string, unknown>;
}

/**
 * Source provenance for AuthoritativeContext.
 * Union of the new RequestScope vocabulary AND the legacy vocabulary used by
 * `decision/canonical-state-invariants.ts` so call-site migration is non-breaking.
 */
export type AuthoritativeContextSource =
  | 'CROP_SCHEDULE'
  | 'OBSERVATION'
  | 'FARMER_INPUT'
  | 'NDVI'
  | 'INFERRED'
  | 'LAND_STATE'
  | 'CONFIRMED';

export interface AuthoritativeContext {
  land_id: string;
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  /** Symptoms confirmed via clarification (kept for invariant-checker compatibility). */
  confirmed_symptoms?: string[];
  source: AuthoritativeContextSource;
  locked_at: number;
}

export interface ConfirmedDiagnosis {
  hypothesis_id: string;
  confidence: number;
  confirmed_at: number;
}

export interface RequestScope {
  // Identity
  readonly traceId: string;
  readonly tenantId: string;
  readonly farmerId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly startedAt: number;

  // Resources (per-request, never shared)
  readonly db: SupabaseClient;

  // Mutable turn state (was module-level — never again)
  authoritativeContext: AuthoritativeContext | null;
  confirmedDiagnosis: ConfirmedDiagnosis | null;
  answeredClarifications: Set<string>;

  // Per-turn caches (die at request end)
  readonly turnCache: {
    rules: Map<string, unknown>;
    observations: Map<string, unknown>;
    hypotheses: Map<string, unknown>;
    /**
     * Free-form per-turn state keyed by module namespace.
     * Modules that previously held module-level `let _state` variables
     * MUST stash their per-turn state here instead.
     * Convention: keys are `<module-name>:<field>` (e.g. `invariants:state`).
     */
    engineState: Map<string, unknown>;
  };

  // Causal trace
  readonly events: TraceEvent[];
  emit(event: Omit<TraceEvent, 'ts' | 'traceId'>): void;
}

export interface CreateScopeInput {
  tenantId: string;
  farmerId: string;
  sessionId: string;
  turnId: string;
  /**
   * Optional pre-built client. When provided, the scope reuses it instead of
   * constructing a new one (useful for tests and for the entry-point path
   * that already validated the JWT against the service-role client).
   */
  db?: SupabaseClient;
}

export function createRequestScope(input: CreateScopeInput): RequestScope {
  let db = input.db;
  if (!db) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    }
    db = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const traceId = crypto.randomUUID();
  const startedAt = performance.now();
  const events: TraceEvent[] = [];

  const scope: RequestScope = {
    traceId,
    tenantId: input.tenantId,
    farmerId: input.farmerId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    startedAt,
    db,
    authoritativeContext: null,
    confirmedDiagnosis: null,
    answeredClarifications: new Set<string>(),
    turnCache: {
      rules: new Map(),
      observations: new Map(),
      hypotheses: new Map(),
      engineState: new Map(),
    },
    events,
    emit(e) {
      events.push({
        ...e,
        ts: performance.now() - startedAt,
        traceId,
      });
    },
  };

  // Object.seal prevents accidental property addition without freezing the
  // mutable fields we genuinely need to update (authoritativeContext, etc.)
  return Object.seal(scope);
}

/**
 * Typed error classes — fail-closed boundaries throughout the engine.
 * The orchestrator's top-level try/catch in index.ts converts these to
 * `{ error, trace_id }` 500 responses with full causal trace in logs.
 */
export class InvariantViolation extends Error {
  constructor(public code: string, public details?: Record<string, unknown>) {
    super(`Invariant violation: ${code}`);
    this.name = 'InvariantViolation';
  }
}

export class IntentResolutionError extends Error {
  constructor(public code: string, public details?: Record<string, unknown>) {
    super(`Intent resolution failed: ${code}`);
    this.name = 'IntentResolutionError';
  }
}

/**
 * Generic engine data error — for fail-closed conversion of silent `return []`
 * sites in decision/ and agents/ where a DB failure must not be hidden.
 */
export class EngineDataError extends Error {
  constructor(public code: string, public details?: Record<string, unknown>) {
    super(`Engine data error: ${code}`);
    this.name = 'EngineDataError';
  }
}
