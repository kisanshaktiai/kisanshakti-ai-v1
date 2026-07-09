/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH SNAPSHOT — single immutable per-turn result of the graph runtime.
 *
 * Consolidates the two historical graph engines into ONE authoritative
 * object so downstream traces / invariants / clarification triggers can
 * never disagree about what the graph produced:
 *
 *   Engine A: evaluateCandidateHypotheses  (runGraphRuntime)
 *   Engine B: evaluateHypothesisGraph      (hypothesis-graph-evaluator)
 *
 * All fields are readonly. Callers MUST replace the whole snapshot rather
 * than mutate it — that is what stops the "graph found hypothesis but final
 * trace says hyp=0" corruption seen in production logs.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type GraphState =
  | 'READY_FOR_DECISION'
  | 'NEED_MORE_EVIDENCE'
  | 'NO_HYPOTHESIS'
  | 'GRAPH_EXHAUSTED';

export interface GraphSnapshotHypothesis {
  readonly id: string;
  readonly confidence: number;
  readonly matched_conditions: readonly string[];
  readonly candidate_rule_ids: readonly string[];
  readonly source: 'ENGINE_A' | 'ENGINE_B' | 'BOTH';
}

export interface GraphRuntimeSnapshot {
  readonly trace_id: string;
  readonly observations: readonly string[];
  readonly hypotheses: readonly GraphSnapshotHypothesis[];
  readonly rules: readonly string[];
  readonly graph_state: GraphState;
  readonly source: 'REAL_GRAPH_PATH';
  readonly reason?: string;
}

/** Default decision threshold — kept in one place so evaluators & UI agree. */
const TAU_DECISION = 0.6;

function canonicalId(raw: unknown): string {
  return String(raw ?? '').trim();
}

/**
 * Build/merge a single snapshot from either or both engine outputs.
 * Engine A hypothesis identity is `rule_id`, Engine B is `hypothesis_id`.
 * Both are canonical `^[A-Z0-9_]+$` symbols so union-by-id is safe.
 */
export function buildGraphRuntimeSnapshot(args: {
  trace_id: string;
  observations: readonly string[];
  engineA?: {
    candidates: ReadonlyArray<{
      rule_id?: string;
      hypothesis_id?: string;
      total_score?: number;
      confidence?: number;
      matched_conditions?: readonly string[];
      candidate_rule_ids?: readonly string[];
    }>;
  } | null;
  engineB?: {
    candidates: ReadonlyArray<{
      hypothesis_id: string;
      confidence: number;
      positive_matches?: readonly string[];
      matched_conditions?: readonly string[];
      candidate_rule_ids?: readonly string[];
    }>;
  } | null;
  reason?: string;
}): GraphRuntimeSnapshot {
  const merged = new Map<string, {
    id: string;
    confidence: number;
    matched_conditions: Set<string>;
    candidate_rule_ids: Set<string>;
    sources: Set<'ENGINE_A' | 'ENGINE_B'>;
  }>();

  const upsert = (
    id: string,
    confidence: number,
    matched: readonly string[] | undefined,
    rules: readonly string[] | undefined,
    src: 'ENGINE_A' | 'ENGINE_B',
  ) => {
    if (!id) return;
    const existing = merged.get(id);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      for (const m of matched ?? []) existing.matched_conditions.add(m);
      for (const r of rules ?? []) if (r) existing.candidate_rule_ids.add(r);
      existing.sources.add(src);
    } else {
      merged.set(id, {
        id,
        confidence,
        matched_conditions: new Set(matched ?? []),
        candidate_rule_ids: new Set((rules ?? []).filter(Boolean)),
        sources: new Set([src]),
      });
    }
  };

  for (const c of args.engineA?.candidates ?? []) {
    const id = canonicalId(c.rule_id ?? c.hypothesis_id);
    const conf = Number(c.confidence ?? c.total_score ?? 0);
    upsert(id, Number.isFinite(conf) ? conf : 0, c.matched_conditions, c.candidate_rule_ids, 'ENGINE_A');
  }
  for (const c of args.engineB?.candidates ?? []) {
    const id = canonicalId(c.hypothesis_id);
    const conf = Number(c.confidence ?? 0);
    upsert(id, Number.isFinite(conf) ? conf : 0, c.matched_conditions ?? c.positive_matches, c.candidate_rule_ids, 'ENGINE_B');
  }

  const hypotheses: GraphSnapshotHypothesis[] = [];
  const allRules = new Set<string>();
  for (const h of merged.values()) {
    for (const r of h.candidate_rule_ids) allRules.add(r);
    hypotheses.push(Object.freeze({
      id: h.id,
      confidence: h.confidence,
      matched_conditions: Object.freeze([...h.matched_conditions]),
      candidate_rule_ids: Object.freeze([...h.candidate_rule_ids]),
      source: h.sources.size === 2 ? 'BOTH' : (h.sources.has('ENGINE_A') ? 'ENGINE_A' : 'ENGINE_B'),
    }) as GraphSnapshotHypothesis);
  }
  hypotheses.sort((a, b) => b.confidence - a.confidence);

  let graph_state: GraphState;
  if (hypotheses.length === 0) {
    graph_state = args.reason ? 'GRAPH_EXHAUSTED' : 'NO_HYPOTHESIS';
  } else {
    const top = hypotheses[0];
    const hasRules = top.candidate_rule_ids.length > 0;
    graph_state = (top.confidence >= TAU_DECISION && hasRules)
      ? 'READY_FOR_DECISION'
      : 'NEED_MORE_EVIDENCE';
  }

  return Object.freeze({
    trace_id: args.trace_id,
    observations: Object.freeze([...args.observations]),
    hypotheses: Object.freeze(hypotheses),
    rules: Object.freeze([...allRules]),
    graph_state,
    source: 'REAL_GRAPH_PATH',
    reason: args.reason,
  }) as GraphRuntimeSnapshot;
}

/** Fail-loud guard the orchestrator calls before emitting BRAIN_TRACE. */
export function assertSnapshotNotCorrupt(
  snapshot: GraphRuntimeSnapshot | null | undefined,
  projectedHypCount: number,
  trace_id: string,
): void {
  if (!snapshot) return;
  if (snapshot.hypotheses.length > 0 && projectedHypCount === 0) {
    throw new Error(
      `GRAPH_STATE_CORRUPTION_ERROR: snapshot=${snapshot.hypotheses.length} ` +
      `projection=0 trace=${trace_id} — hypothesis engine result discarded downstream`,
    );
  }
}
