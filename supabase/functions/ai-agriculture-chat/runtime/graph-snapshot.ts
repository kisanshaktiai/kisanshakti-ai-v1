/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH SNAPSHOT — immutable per-turn result of the graph runtime.
 *
 * Ontology (strict, non-negotiable):
 *
 *     Observation ─▶ Hypothesis ─▶ Rule
 *
 * A `rule_id` is NEVER a `hypothesis_id`. The two node types are disjoint.
 * Hypotheses merge by `hypothesis_id` only. Engine A candidates are keyed
 * by `rule_id` and are promoted to hypotheses ONLY through an explicit
 * `edges.ruleToHypothesis` map supplied by the caller — the builder itself
 * is a pure function and performs zero I/O.
 *
 * Engines consolidated here:
 *   Engine A: decision/hypothesis-evaluator  (rule-centric candidates)
 *   Engine B: decision/hypothesis-graph-evaluator (hypothesis-centric)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type GraphState =
  | 'READY_FOR_DECISION'
  | 'NEED_MORE_EVIDENCE'
  | 'NO_HYPOTHESIS'
  | 'GRAPH_EXHAUSTED';

export type EngineSource = 'ENGINE_A' | 'ENGINE_B';

/** Pure hypothesis node — never mixes rule identity. */
export interface HypothesisNode {
  readonly hypothesis_id: string;
  readonly confidence: number;
  readonly matched_observations: readonly string[];
  readonly sources: readonly EngineSource[];
}

/** Pure rule node — parent_hypothesis_id is null iff orphaned. */
export interface RuleNode {
  readonly rule_id: string;
  readonly parent_hypothesis_id: string | null;
}

/**
 * Back-compat view expected by legacy orchestrator readers.
 * `id` is ALWAYS a hypothesis_id (never a rule_id). `candidate_rule_ids`
 * is the projection of child rules for that hypothesis.
 */
export interface GraphSnapshotHypothesis {
  readonly id: string;
  readonly confidence: number;
  readonly matched_conditions: readonly string[];
  readonly candidate_rule_ids: readonly string[];
  readonly source: EngineSource | 'BOTH';
}

export interface GraphRuntimeSnapshot {
  readonly trace_id: string;
  readonly observations: readonly string[];
  /** Back-compat projection — one entry per HypothesisNode. */
  readonly hypotheses: readonly GraphSnapshotHypothesis[];
  /** Raw hypothesis nodes (authoritative). */
  readonly hypothesis_nodes: readonly HypothesisNode[];
  /** Raw rule nodes (authoritative), including orphans. */
  readonly rule_nodes: readonly RuleNode[];
  /** Back-compat flat rule id list (only non-orphan rules). */
  readonly rules: readonly string[];
  /** Rules with no known parent hypothesis. */
  readonly orphan_rule_ids: readonly string[];
  readonly graph_state: GraphState;
  readonly source: 'REAL_GRAPH_PATH';
  readonly reason?: string;
}

const TAU_DECISION = 0.6;

function canonicalId(raw: unknown): string {
  return String(raw ?? '').trim();
}

export class GraphOntologyError extends Error {
  constructor(msg: string) {
    super(`GRAPH_ONTOLOGY_ERROR: ${msg}`);
    this.name = 'GraphOntologyError';
  }
}

export interface BuildGraphSnapshotInput {
  trace_id: string;
  observations: readonly string[];
  engineA?: {
    candidates: ReadonlyArray<{
      rule_id?: string;
      total_score?: number;
      confidence?: number;
      matched_conditions?: readonly string[];
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
  edges?: {
    /** Map<rule_id, hypothesis_id> — supplied by orchestrator (from hypothesis_rule_mapping). */
    ruleToHypothesis?: ReadonlyMap<string, string> | Record<string, string>;
  };
  reason?: string;
}

/**
 * Pure builder. No async, no DB, no fetch. Union both engines through
 * the injected rule→hypothesis edge map. Never fabricates hypotheses.
 */
export function buildGraphRuntimeSnapshot(args: BuildGraphSnapshotInput): GraphRuntimeSnapshot {
  const trace = args.trace_id;
  const edgeMap: ReadonlyMap<string, string> = args.edges?.ruleToHypothesis instanceof Map
    ? (args.edges.ruleToHypothesis as ReadonlyMap<string, string>)
    : new Map(Object.entries((args.edges?.ruleToHypothesis ?? {}) as Record<string, string>));

  // — hypothesis merge table (keyed strictly by hypothesis_id) —
  const hyps = new Map<string, {
    hypothesis_id: string;
    confidence: number;
    matched: Set<string>;
    sources: Set<EngineSource>;
    rules: Set<string>;
  }>();

  const upsertHyp = (
    hid: string,
    confidence: number,
    matched: readonly string[] | undefined,
    src: EngineSource,
  ) => {
    if (!hid) return;
    const existing = hyps.get(hid);
    const conf = Number.isFinite(confidence) ? confidence : 0;
    if (existing) {
      existing.confidence = Math.max(existing.confidence, conf);
      for (const m of matched ?? []) existing.matched.add(m);
      existing.sources.add(src);
    } else {
      hyps.set(hid, {
        hypothesis_id: hid,
        confidence: conf,
        matched: new Set(matched ?? []),
        sources: new Set([src]),
        rules: new Set(),
      });
    }
  };

  // — rule merge table (keyed strictly by rule_id) —
  const ruleParents = new Map<string, string | null>();
  const orphans = new Set<string>();

  const attachRule = (rid: string, parentHid: string | null, src: EngineSource) => {
    if (!rid) return;
    const prev = ruleParents.get(rid);
    if (prev === undefined) {
      ruleParents.set(rid, parentHid);
    } else if (prev === null && parentHid !== null) {
      // orphan → resolved; Engine B parent wins
      ruleParents.set(rid, parentHid);
      orphans.delete(rid);
    } else if (prev !== null && parentHid !== null && prev !== parentHid) {
      // conflict — prefer Engine B (typically arrives second here, but log unconditionally)
      if (src === 'ENGINE_B') ruleParents.set(rid, parentHid);
      console.warn(
        `[GRAPH_ONTOLOGY] RULE_PARENT_CONFLICT rule_id=${rid} ` +
        `existing=${prev} incoming=${parentHid} src=${src} trace=${trace}`,
      );
    }
    if (parentHid === null) orphans.add(rid);
    else {
      const h = hyps.get(parentHid);
      if (h) h.rules.add(rid);
    }
  };

  // ─── Engine A adapter ────────────────────────────────────────────────────
  for (const c of args.engineA?.candidates ?? []) {
    const rid = canonicalId((c as any).rule_id);
    if (!rid) continue;
    const conf = Number(c.confidence ?? c.total_score ?? 0);
    const matched = c.matched_conditions;
    const hasEvidence = (matched?.length ?? 0) > 0;
    const hid = canonicalId(edgeMap.get(rid) ?? '');
    if (hid && hasEvidence) {
      upsertHyp(hid, conf, matched, 'ENGINE_A');
      attachRule(rid, hid, 'ENGINE_A');
    } else {
      attachRule(rid, null, 'ENGINE_A');
      console.warn(
        `[GRAPH_ONTOLOGY] RULE_WITHOUT_HYPOTHESIS_EDGE rule_id=${rid} ` +
        `mapped=${hid ? 'yes' : 'no'} evidence=${hasEvidence ? 'yes' : 'no'} trace=${trace}`,
      );
    }
  }

  // ─── Engine B adapter ────────────────────────────────────────────────────
  for (const c of args.engineB?.candidates ?? []) {
    const hid = canonicalId(c.hypothesis_id);
    if (!hid) continue;
    upsertHyp(hid, Number(c.confidence ?? 0), c.matched_conditions ?? c.positive_matches, 'ENGINE_B');
    for (const rid of c.candidate_rule_ids ?? []) {
      const canonical = canonicalId(rid);
      if (canonical) attachRule(canonical, hid, 'ENGINE_B');
    }
  }

  // ─── Freeze layers ───────────────────────────────────────────────────────
  const hypothesis_nodes: HypothesisNode[] = [...hyps.values()].map(h => Object.freeze({
    hypothesis_id: h.hypothesis_id,
    confidence: h.confidence,
    matched_observations: Object.freeze([...h.matched]),
    sources: Object.freeze([...h.sources]),
  }) as HypothesisNode);
  hypothesis_nodes.sort((a, b) => b.confidence - a.confidence);

  const rule_nodes: RuleNode[] = [...ruleParents.entries()].map(([rid, parent]) => Object.freeze({
    rule_id: rid,
    parent_hypothesis_id: parent,
  }) as RuleNode);

  const orphan_rule_ids = rule_nodes
    .filter(r => r.parent_hypothesis_id === null)
    .map(r => r.rule_id);

  // Back-compat projection: hypotheses[] mirrors hypothesis_nodes.
  const hypotheses: GraphSnapshotHypothesis[] = hypothesis_nodes.map(h => {
    const parent = hyps.get(h.hypothesis_id)!;
    const src: EngineSource | 'BOTH' = parent.sources.size === 2
      ? 'BOTH'
      : (parent.sources.has('ENGINE_A') ? 'ENGINE_A' : 'ENGINE_B');
    return Object.freeze({
      id: h.hypothesis_id,
      confidence: h.confidence,
      matched_conditions: h.matched_observations,
      candidate_rule_ids: Object.freeze([...parent.rules]),
      source: src,
    }) as GraphSnapshotHypothesis;
  });

  const rules = rule_nodes
    .filter(r => r.parent_hypothesis_id !== null)
    .map(r => r.rule_id);

  // ─── Contract guards ─────────────────────────────────────────────────────
  const nonOrphanRules = rule_nodes.some(r => r.parent_hypothesis_id !== null);
  let graph_state: GraphState;
  let downgradeReason: string | undefined = args.reason;

  if (hypothesis_nodes.length === 0 && nonOrphanRules) {
    // G1 — impossible by construction (rules with parent imply hypothesis upsert),
    // but assert loudly to catch future regressions.
    throw new GraphOntologyError(
      `BROKEN_HYP_RULE_EDGE: ${rule_nodes.length} rules have parent_hypothesis_id ` +
      `but zero hypothesis nodes exist (trace=${trace})`,
    );
  }

  if (hypothesis_nodes.length === 0 && rule_nodes.length > 0) {
    // G2 — orphan-only rule set with no hypothesis
    if ((globalThis as any).Deno?.env?.get?.('GRAPH_STRICT') === '1') {
      throw new GraphOntologyError(
        `orphan-only rules with no hypothesis (rules=${rule_nodes.length} trace=${trace})`,
      );
    }
    console.warn(
      `[GRAPH_ONTOLOGY] downgraded_to_exhausted rules=${rule_nodes.length} ` +
      `orphans=${orphan_rule_ids.length} trace=${trace}`,
    );
    graph_state = 'GRAPH_EXHAUSTED';
    downgradeReason = downgradeReason ?? 'GRAPH_ONTOLOGY_VIOLATION';
  } else if (hypothesis_nodes.length === 0) {
    graph_state = downgradeReason ? 'GRAPH_EXHAUSTED' : 'NO_HYPOTHESIS';
  } else {
    const top = hypothesis_nodes[0];
    const topRules = hyps.get(top.hypothesis_id)!.rules.size;
    graph_state = (top.confidence >= TAU_DECISION && topRules > 0)
      ? 'READY_FOR_DECISION'
      : 'NEED_MORE_EVIDENCE';
  }

  return Object.freeze({
    trace_id: trace,
    observations: Object.freeze([...args.observations]),
    hypotheses: Object.freeze(hypotheses),
    hypothesis_nodes: Object.freeze(hypothesis_nodes),
    rule_nodes: Object.freeze(rule_nodes),
    rules: Object.freeze(rules),
    orphan_rule_ids: Object.freeze(orphan_rule_ids),
    graph_state,
    source: 'REAL_GRAPH_PATH',
    reason: downgradeReason,
  }) as GraphRuntimeSnapshot;
}

/** Invert `Map<hypothesis_id, rule_id[]>` (as returned by queryRuleMapping) into `Map<rule_id, hypothesis_id>`. */
export function invertRuleMapping(hypToRules: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [hid, rids] of hypToRules) {
    for (const rid of rids ?? []) {
      if (!rid) continue;
      // First writer wins (deterministic); conflicts are already logged in the mapping table.
      if (!out.has(rid)) out.set(rid, hid);
    }
  }
  return out;
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
