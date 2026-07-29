// DECISION GRAPH NAVIGATOR — v3 SOLE reasoning owner

export interface GraphNode {
  readonly id: string;                       // hypothesis / rule id
  readonly prior: number;                    // [0,1]
  readonly posterior: number;                // [0,1] (current)
  readonly requires: readonly string[];      // canonical lower_snake_case evidence keys
  readonly blocks:   readonly string[];      // evidence keys whose confirmation eliminates this node
  readonly predicates?: readonly string[];   // union(requires, blocks) — optional pre-extract
  readonly stage_scope?: readonly string[];  // [] / undefined ⇒ all stages
  readonly crop_scope?:  readonly string[];
}

export interface EvidenceRequest {
  readonly evidence_key: string;
  readonly prunes_hypotheses:   readonly string[];
  readonly confirms_hypotheses: readonly string[];
  readonly graph_pruning_score: number;
  readonly supporting: ReadonlyArray<{ hypothesis_id: string; reason: string }>;
}

export type NavigationDecision =
  | 'PROCEED'
  | 'ASK'
  | 'CONTEXT_CONTRADICTION'
  | 'INSUFFICIENT_EVIDENCE';

export interface NavigationStopping {
  readonly confidence: number;
  readonly margin: number;
  readonly activeHypotheses: number;
  readonly predicatesSatisfied: boolean;
  readonly turn: number;
  readonly maxRounds: number;
}

export interface NavigationResult {
  readonly decision: NavigationDecision;
  readonly reason: string;
  readonly ranked: readonly EvidenceRequest[];
  readonly stopping: NavigationStopping;
  readonly activeNodeIds: readonly string[];
}

export interface NavigatorInput {
  readonly hypotheses: readonly GraphNode[];
  readonly confirmed: ReadonlySet<string>;        // canonical lower_snake_case
  readonly denied:    ReadonlySet<string>;
  readonly context: {
    readonly crop_code: string;
    readonly growth_stage: string;
  };
  /** Allowlist of farmer-observable evidence keys for this turn (IOM ∩ master).  */
  readonly allowedEvidenceKeys: ReadonlySet<string>;
  readonly thresholds: {
    readonly stage_margin: number;                // e.g. 0.15
    readonly max_clarification_rounds: number;    // from intent contract
  };
  readonly turn: number;
  readonly contradictionFlagged?: boolean;        // set by ContradictionEngine
}

// ─── helpers ──────────────────────────────────────────────────────────────
const norm = (s: string): string =>
  String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function inScope(node: GraphNode, ctx: NavigatorInput['context']): boolean {
  const crop = norm(ctx.crop_code);
  const stage = norm(ctx.growth_stage);
  if (node.crop_scope && node.crop_scope.length > 0) {
    const ok = node.crop_scope.some(c => norm(c) === crop || norm(c) === 'all');
    if (!ok) return false;
  }
  if (node.stage_scope && node.stage_scope.length > 0) {
    const ok = node.stage_scope.some(s => norm(s) === stage || norm(s) === 'all');
    if (!ok) return false;
  }
  return true;
}

function isActive(
  node: GraphNode,
  confirmed: ReadonlySet<string>,
  denied: ReadonlySet<string>,
  ctx: NavigatorInput['context'],
): boolean {
  if (!inScope(node, ctx)) return false;
  // blocks: if any confirmed key blocks this node, it is dead
  for (const b of node.blocks || []) {
    if (confirmed.has(norm(b))) return false;
  }
  // requires: if any required key has been explicitly denied, node is dead
  for (const r of node.requires || []) {
    if (denied.has(norm(r))) return false;
  }
  return true;
}

// ─── main ────────────────────────────────────────────────────────────────
export function navigate(input: NavigatorInput): NavigationResult {
  const {
    hypotheses, confirmed, denied, context,
    allowedEvidenceKeys, thresholds, turn, contradictionFlagged,
  } = input;

  if (contradictionFlagged) {
    return Object.freeze({
      decision: 'CONTEXT_CONTRADICTION' as const,
      reason: 'contradiction_engine_flagged_turn',
      ranked: [],
      stopping: freezeStopping({ confidence: 0, margin: 0, activeHypotheses: 0, predicatesSatisfied: false, turn, maxRounds: thresholds.max_clarification_rounds }),
      activeNodeIds: [],
    });
  }

  // 1. Activate
  const active = hypotheses.filter(h => isActive(h, confirmed, denied, context));
  const activeIds = active.map(h => h.id);

  if (active.length === 0) {
    return Object.freeze({
      decision: 'INSUFFICIENT_EVIDENCE' as const,
      reason: 'no_active_hypotheses_after_context_and_evidence_filters',
      ranked: [],
      stopping: freezeStopping({ confidence: 0, margin: 0, activeHypotheses: 0, predicatesSatisfied: false, turn, maxRounds: thresholds.max_clarification_rounds }),
      activeNodeIds: [],
    });
  }

  // 2. Score & sort by posterior
  const sorted = [...active].sort((a, b) => (b.posterior ?? 0) - (a.posterior ?? 0));
  const top = sorted[0];
  const second = sorted[1];
  const margin = (top.posterior ?? 0) - (second?.posterior ?? 0);

  // 3. Stopping check (PROCEED)
  const requiresSatisfied = (top.requires || []).every(r => confirmed.has(norm(r)));
  const blocksClean       = (top.blocks   || []).every(b => denied.has(norm(b)) || !confirmed.has(norm(b)));
  const dominant = active.length <= 1 || margin >= thresholds.stage_margin;
  const turnsExhausted = turn > thresholds.max_clarification_rounds;

  if (dominant && requiresSatisfied && blocksClean) {
    return Object.freeze({
      decision: 'PROCEED' as const,
      reason: active.length <= 1 ? 'single_active_hypothesis_predicates_satisfied' : 'margin_above_threshold_predicates_satisfied',
      ranked: [],
      stopping: freezeStopping({
        confidence: top.posterior ?? 0,
        margin,
        activeHypotheses: active.length,
        predicatesSatisfied: true,
        turn,
        maxRounds: thresholds.max_clarification_rounds,
      }),
      activeNodeIds: activeIds,
    });
  }

  if (turnsExhausted) {
    return Object.freeze({
      decision: 'PROCEED' as const,
      reason: 'max_clarification_rounds_exhausted_returning_top',
      ranked: [],
      stopping: freezeStopping({
        confidence: top.posterior ?? 0,
        margin,
        activeHypotheses: active.length,
        predicatesSatisfied: requiresSatisfied,
        turn,
        maxRounds: thresholds.max_clarification_rounds,
      }),
      activeNodeIds: activeIds,
    });
  }

  // 4. Enumerate candidate evidence from active node predicates
  const candidates = new Map<string, {
    prunes: Set<string>;
    confirms: Set<string>;
    supporting: Array<{ hypothesis_id: string; reason: string }>;
  }>();

  const touch = (key: string) => {
    const k = norm(key);
    if (!k) return null;
    if (!allowedEvidenceKeys.has(k)) return null; // ontology gate
    if (confirmed.has(k) || denied.has(k)) return null; // already resolved
    let c = candidates.get(k);
    if (!c) {
      c = { prunes: new Set(), confirms: new Set(), supporting: [] };
      candidates.set(k, c);
    }
    return c;
  };

  for (const h of active) {
    for (const b of h.blocks || []) {
      const c = touch(b);
      if (c) {
        c.prunes.add(h.id);
        c.supporting.push({ hypothesis_id: h.id, reason: 'confirmation_blocks_hypothesis' });
      }
    }
    for (const r of h.requires || []) {
      const c = touch(r);
      if (c) {
        // If denied → falsifies h; if confirmed → satisfies h.
        c.prunes.add(h.id);
        c.confirms.add(h.id);
        c.supporting.push({ hypothesis_id: h.id, reason: 'required_predicate_for_hypothesis' });
      }
    }
  }

  if (candidates.size === 0) {
    return Object.freeze({
      decision: 'INSUFFICIENT_EVIDENCE' as const,
      reason: 'no_farmer_observable_discriminator_remaining',
      ranked: [],
      stopping: freezeStopping({
        confidence: top.posterior ?? 0,
        margin,
        activeHypotheses: active.length,
        predicatesSatisfied: false,
        turn,
        maxRounds: thresholds.max_clarification_rounds,
      }),
      activeNodeIds: activeIds,
    });
  }

  // 5. Rank by pruning power
  const ranked: EvidenceRequest[] = [];
  for (const [key, agg] of candidates) {
    const score = agg.prunes.size + agg.confirms.size; // redundancy already removed via confirmed/denied skip
    ranked.push(Object.freeze({
      evidence_key: key,
      prunes_hypotheses:   Object.freeze([...agg.prunes]),
      confirms_hypotheses: Object.freeze([...agg.confirms]),
      graph_pruning_score: score,
      supporting: Object.freeze(agg.supporting),
    }) as EvidenceRequest);
  }
  ranked.sort((a, b) => b.graph_pruning_score - a.graph_pruning_score);

  return Object.freeze({
    decision: 'ASK' as const,
    reason: 'discriminating_evidence_required',
    ranked: Object.freeze(ranked),
    stopping: freezeStopping({
      confidence: top.posterior ?? 0,
      margin,
      activeHypotheses: active.length,
      predicatesSatisfied: false,
      turn,
      maxRounds: thresholds.max_clarification_rounds,
    }),
    activeNodeIds: activeIds,
  });
}

function freezeStopping(s: NavigationStopping): NavigationStopping {
  return Object.freeze({ ...s });
}
