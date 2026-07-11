/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 1 — IMMUTABLE BIOLOGICAL STATE (Single Source of Truth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The BiologicalState object is the ONLY authoritative representation of a
 * crop's biological phenology at request time. It is produced EXACTLY ONCE
 * per turn from the SQL function `resolve_crop_phenology(p_land_id)` and
 * then frozen. No downstream module may mutate growth_stage, DAS, stage_code,
 * or crop identity after this point.
 *
 * Hard invariants:
 *   1. Only `buildBiologicalState()` may construct a BiologicalState.
 *   2. The object is `Object.freeze()`-d — reassignment throws in strict mode.
 *   3. Consumers read `state.growth_stage`, `state.das`, etc. They MUST NOT
 *      overwrite `landContext.growth_stage` when `landContext.biological_state`
 *      is present and `is_locked === true`.
 *   4. Guard callers use `assertBiologicalStateLocked(landContext)` to fail
 *      fast if a code path tries to mutate stage after lock.
 *
 * Producers other than resolve_crop_phenology (GDD engine, contextValidation
 * reconciler, sanity-check overrides in index.ts) must SKIP their write when
 * biological_state is locked and log a `[BIO_STATE_WRITE_BLOCKED]` line.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface BiologicalState {
  readonly is_locked: true;
  readonly version: 'v1';
  readonly built_at: string;                // ISO timestamp

  readonly land_id: string;
  readonly crop_code: string | null;
  readonly crop_variety: string | null;

  readonly growth_stage: string | null;     // canonical label (e.g. TILLERING)
  readonly stage_code:   string | null;     // ontology code
  readonly stage_uuid:   string | null;

  readonly das: number | null;              // days after sowing (authoritative)
  readonly gdd_accumulated: number | null;
  readonly sowing_date: string | null;      // ISO yyyy-mm-dd

  readonly confidence: number;              // 0..1
  readonly source: string;                  // 'phenology_ssot' | ...
  readonly resolver_version: string | null;

  /**
   * PATCH v4-P1 — Predicted-stage confidence (0..1). Starts at `confidence`
   * and is decayed by biological_constraints[].severity via runtime graph
   * math (SEVERITY_WEIGHTS). NEVER contains agronomy.
   */
  readonly predicted_stage_confidence: number;

  /**
   * PATCH v4-P1 — Biological CONSTRAINTS (not stages).
   * Codes are emitted by DB constraint rules (e.g. decision_rules with
   * category='BIOLOGICAL_CONSTRAINT'). Runtime NEVER invents these codes.
   * Empty [] until DB rules are seeded — inert but downstream-readable.
   */
  readonly biological_constraints: ReadonlyArray<BiologicalConstraint>;

  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * PATCH v4-P1 — Biological constraint DTO. `code` and `source` are opaque
 * strings owned by the DB. TS never synthesises these values.
 */
export interface BiologicalConstraint {
  readonly code: string;                                     // e.g. EMERGENCE_NOT_CONFIRMED
  readonly severity: 'INFO' | 'WARN' | 'BLOCK';
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly source: string;                                   // DB rule id
}

/** Graph-math weights for severity — NOT agronomy. */
const SEVERITY_WEIGHTS: Readonly<Record<'INFO' | 'WARN' | 'BLOCK', number>> = Object.freeze({
  INFO: 0,
  WARN: 0.2,
  BLOCK: 0.6,
});

function decayConfidence(base: number, cs: ReadonlyArray<BiologicalConstraint>): number {
  if (!Array.isArray(cs) || cs.length === 0) return base;
  const decay = cs.reduce((s, c) => s + (SEVERITY_WEIGHTS[c.severity] ?? 0), 0);
  return Math.max(0, Math.min(1, base * Math.max(0, 1 - decay)));
}

export interface RawPhenologyRow {
  crop_code?: string | null;
  crop_variety?: string | null;
  growth_stage?: string | null;
  stage_code?: string | null;
  stage_uuid?: string | null;
  current_das?: number | null;
  gdd_accumulated?: number | null;
  sowing_date?: string | null;
  confidence?: number | null;
  source?: string | null;
  resolver_version?: string | null;
  [k: string]: unknown;
}

/**
 * Build an immutable BiologicalState from the phenology resolver row.
 * Returns `null` when the resolver produced no row — callers must treat this
 * as "no biological authority" and fall back to legacy heuristics safely.
 */
export function buildBiologicalState(
  landId: string,
  phenology: RawPhenologyRow | null | undefined,
): BiologicalState | null {
  if (!phenology) return null;

  const state: BiologicalState = {
    is_locked: true,
    version: 'v1',
    built_at: new Date().toISOString(),

    land_id: landId,
    crop_code:    phenology.crop_code    ?? null,
    crop_variety: phenology.crop_variety ?? null,

    growth_stage: phenology.growth_stage ?? null,
    stage_code:   phenology.stage_code   ?? null,
    stage_uuid:   phenology.stage_uuid   ?? null,

    das: typeof phenology.current_das === 'number' ? phenology.current_das : null,
    gdd_accumulated:
      typeof phenology.gdd_accumulated === 'number' ? phenology.gdd_accumulated : null,
    sowing_date: phenology.sowing_date ?? null,

    confidence: typeof phenology.confidence === 'number' ? phenology.confidence : 0,
    source: phenology.source ?? 'phenology_ssot',
    resolver_version: phenology.resolver_version ?? null,

    raw: Object.freeze({ ...phenology }),
  };

  // GRAPH_NODE_TRACE — BIO_STATE (single line at lock time)
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[GRAPH_NODE_TRACE][bio-lock] node=BIO_STATE ` +
        JSON.stringify({
          crop: state.crop_code,
          variety: state.crop_variety,
          das: state.das,
          gdd: state.gdd_accumulated,
          biological_stage: state.growth_stage,
          stage_uuid: state.stage_uuid,
          source: state.source,
          resolver_version: state.resolver_version,
          confidence: state.confidence,
        }),
    );
  } catch {/* trace must not throw */}

  return Object.freeze(state);
}

/**
 * Returns true when the landContext carries a locked BiologicalState.
 * Downstream stage-writer paths call this and abort their write when true.
 */
export function isBiologicalStateLocked(landContext: unknown): boolean {
  if (!landContext || typeof landContext !== 'object') return false;
  const bs = (landContext as Record<string, unknown>).biological_state as
    | BiologicalState
    | undefined;
  return !!(bs && bs.is_locked === true);
}

/**
 * Fail-fast guard for code paths that MUST run before the biological state
 * is locked. Throws immediately if lock is already in place.
 */
export function assertBiologicalStateUnlocked(landContext: unknown, site: string): void {
  if (isBiologicalStateLocked(landContext)) {
    throw new Error(
      `[BIO_STATE_INVARIANT] Attempted mutation at "${site}" after biological_state was locked. ` +
        `Only resolve_crop_phenology() may set growth_stage. Remove this write.`,
    );
  }
}

/**
 * Log-only helper used at competing writer sites (GDD engine, reconcilers,
 * sanity-check overrides). Returns true when the caller should SKIP its
 * write because the biological state is already locked.
 */
export function blockStageWriteIfLocked(
  landContext: unknown,
  site: string,
  attemptedStage: string | null | undefined,
): boolean {
  if (!isBiologicalStateLocked(landContext)) return false;
  const bs = (landContext as Record<string, unknown>).biological_state as BiologicalState;
  console.warn(
    `[BIO_STATE_WRITE_BLOCKED] site=${site} attempted=${attemptedStage ?? 'null'} ` +
      `locked_stage=${bs.growth_stage} source=${bs.source} v=${bs.resolver_version}`,
  );
  return true;
}
