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
 * CHANGE LOG
 *   2026-07-11 UTC — v5-P8: activated biological constraint producer.
 *     New export `evaluateBiologicalConstraints(supabase, canonicalDraft,
 *     cropCode)` reads `decision_rules` WHERE category='BIOLOGICAL_CONSTRAINT'
 *     (crop-scoped OR crop_code IS NULL) and evaluates each rule's
 *     `conditions_json.canonical` predicate map via `resolvePath` +
 *     `comparePredicate`. Emits BiologicalConstraint[] whose `code`,
 *     `severity`, and `source` all originate in DB rows — zero TS agronomy.
 *     Orchestrator now passes the result as the 3rd arg to
 *     `buildBiologicalState`, so `predicted_stage_confidence` finally
 *     decays when the field twin contradicts the calendar-picked stage.
 *   2026-07-11 UTC — v4-P1 (generic all-crop): additive fields
 *     `predicted_stage_confidence` and `biological_constraints[]` +
 *     `BiologicalConstraint` DTO. Constraints are DB-authored (opaque codes);
 *     runtime graph-math weights (SEVERITY_WEIGHTS: INFO=0/WARN=0.2/BLOCK=0.6)
 *     decay predicted-stage confidence without ever mutating growth_stage.
 *     `NOT_ESTABLISHED` explicitly rejected as a stage — it is a constraint.
 *     Existing callers unaffected: `buildBiologicalState(landId, phenology)`
 *     still works; `biologicalConstraints` param defaults to [].
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { resolvePath, comparePredicate } from '../decision/hypothesis-evaluator.ts';

export interface BiologicalState {
  readonly is_locked: true;
  readonly version: 'v1';
  readonly built_at: string;                // ISO timestamp

  readonly land_id: string;
  readonly crop_code: string | null;
  readonly crop_variety: string | null;
  /**
   * v6 — cultivation_method carried through from `crop_schedules` via
   * `resolve_crop_phenology`. Values: 'direct_seeded' | 'transplanted' |
   * 'any' | null. Consumed by CANONICAL_CONTEXT_SRC and downstream logs.
   * NEVER used to branch biology in TS — biology remains DB-owned.
   */
  readonly cultivation_method: string | null;

  readonly growth_stage: string | null;     // canonical label (e.g. TILLERING)
  readonly stage_code:   string | null;     // ontology code
  readonly stage_uuid:   string | null;
  /**
   * v6 — resolved_stage is an alias for `growth_stage` exposed under the
   * name mandated by the biological-model contract. It always equals
   * `growth_stage`. Kept as a distinct field so downstream code can assert
   * it explicitly without depending on legacy field names.
   */
  readonly resolved_stage: string | null;
  /**
   * v6 — stage_source labels the authority behind the stage decision. Mirror
   * of `source` (e.g. 'crop_stage_ssot', 'gdd_model',
   * 'completed_stage_transitions'). Preserved separately so the canonical
   * context can log a stable, contract-named field.
   */
  readonly stage_source: string;

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
  /** v6 — cultivation_method from resolve_crop_phenology (crop_schedules). */
  cultivation_method?: string | null;
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
 *
 * PATCH v4-P1 — optional `biologicalConstraints` are additive DB-emitted
 * constraint records; they DECAY predicted_stage_confidence but never
 * overwrite growth_stage. Defaults to [] (inert).
 */
export function buildBiologicalState(
  landId: string,
  phenology: RawPhenologyRow | null | undefined,
  biologicalConstraints: ReadonlyArray<BiologicalConstraint> = [],
): BiologicalState | null {
  if (!phenology) return null;

  const baseConfidence = typeof phenology.confidence === 'number' ? phenology.confidence : 0;
  const constraints: ReadonlyArray<BiologicalConstraint> = Object.freeze(
    (biologicalConstraints ?? []).map((c) =>
      Object.freeze({
        code: String(c.code),
        severity: (c.severity === 'BLOCK' || c.severity === 'WARN' ? c.severity : 'INFO') as
          | 'INFO' | 'WARN' | 'BLOCK',
        evidence: Object.freeze({ ...(c.evidence ?? {}) }),
        source: String(c.source ?? 'db_rule'),
      }),
    ),
  );

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

    confidence: baseConfidence,
    source: phenology.source ?? 'phenology_ssot',
    resolver_version: phenology.resolver_version ?? null,

    predicted_stage_confidence: decayConfidence(baseConfidence, constraints),
    biological_constraints: constraints,

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
          predicted_stage_confidence: state.predicted_stage_confidence,
          constraints: constraints.map((c) => `${c.code}(${c.severity})`),
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

// ═══════════════════════════════════════════════════════════════════════════
// v5-P8 — Biological Constraint Producer (DB-driven, crop-agnostic)
// ───────────────────────────────────────────────────────────────────────────
// Reads `decision_rules WHERE category='BIOLOGICAL_CONSTRAINT'` and evaluates
// each rule's `conditions_json.canonical` predicate map against a lightweight
// canonical field-twin draft. Emits BiologicalConstraint[] whose codes,
// severities, and thresholds all originate in DB rows.
//
// Runtime does NOT understand agronomy — it only:
//   1. resolves dotted paths (`weather.rainfall_after_sowing_mm`, ...)
//   2. compares against predicate literals (`{ eq }`, `{ in }`, `{ lt }`, ...)
//   3. AND-matches all canonical predicates → emits the constraint row as-is.
// Expected DB rule shape (owned by DB rule authors, not TS):
//   conditions_json = {
//     "constraint_code": "EMERGENCE_NOT_CONFIRMED",
//     "severity":       "BLOCK" | "WARN" | "INFO",
//     "canonical": {
//       "weather.rainfall_after_sowing_mm": { "eq": 0 },
//       "soil.moisture_status":              { "in": ["DRY","VERY_DRY"] },
//       "ndvi.value":                        { "present": false }
//     }
//   }
// Rules apply to a specific crop_code OR globally when crop_code IS NULL.
// ═══════════════════════════════════════════════════════════════════════════
export async function evaluateBiologicalConstraints(
  supabase: any,
  canonicalDraft: unknown,
  cropCode: string | null | undefined,
  traceId?: string | null,
): Promise<BiologicalConstraint[]> {
  const trace = traceId ?? `bio_${Date.now()}`;
  const emitted: BiologicalConstraint[] = [];
  const matchedRules: string[] = [];

  try {
    let q = supabase
      .from('decision_rules')
      .select('id, rule_id, crop_code, conditions_json')
      .eq('category', 'BIOLOGICAL_CONSTRAINT')
      .eq('is_active', true);
    if (cropCode) q = q.or(`crop_code.eq.${cropCode},crop_code.is.null`);
    else          q = q.is('crop_code', null);

    const { data: rows, error } = await q;
    if (error) {
      console.warn(`[BIO_CONSTRAINT_GRAPH] query_error trace=${trace} msg=${error.message}`);
      return [];
    }

    for (const r of (rows ?? [])) {
      const cj = r?.conditions_json ?? {};
      const code = cj.constraint_code ?? cj.code ?? null;
      const rawSev = String(cj.severity ?? 'INFO').toUpperCase();
      const severity: 'INFO' | 'WARN' | 'BLOCK' =
        rawSev === 'BLOCK' || rawSev === 'WARN' ? rawSev : 'INFO';
      const canonical = cj.canonical && typeof cj.canonical === 'object' ? cj.canonical : null;
      if (!code || !canonical) continue;

      const evidence: Record<string, unknown> = {};
      let allPass = true;
      for (const [path, expected] of Object.entries(canonical)) {
        const actual = resolvePath(canonicalDraft, path);
        const pass = comparePredicate(actual, expected);
        evidence[path] = actual;
        if (!pass) { allPass = false; break; }
      }
      if (!allPass) continue;

      const ruleId = String(r.rule_id ?? r.id ?? 'db_rule');
      matchedRules.push(ruleId);
      emitted.push({
        code: String(code),
        severity,
        evidence,
        source: ruleId,
      });
    }
  } catch (e) {
    console.warn(`[BIO_CONSTRAINT_GRAPH] threw trace=${trace} err=${(e as Error).message}`);
    return [];
  }

  console.log(
    `[BIO_CONSTRAINT_GRAPH] trace=${trace} crop=${cropCode ?? 'null'} ` +
      `constraints_count=${emitted.length} matched_rules=[${matchedRules.join(',')}]`,
  );

  return emitted;
}

