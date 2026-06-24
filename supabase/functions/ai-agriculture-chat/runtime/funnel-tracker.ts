/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FUNNEL TRACKER — Wave C (per-turn pipeline-drop attribution)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WS13 v1 (runtime reachability audit) found that 73 % of turns matching
 * rules never surface a primary_decision. We have NO per-stage drop counters
 * today — the orchestrator logs at most `rules_matched` and `primary_decision`,
 * making it impossible to attribute the drop to arbitration, gates, or the
 * decision-builder.
 *
 * This module is a per-trace singleton funnel recorder. Each pipeline stage
 * (rule loader → evaluator → arbitrator → gate → builder → invariant) calls
 * `funnelRecord(traceId, stage, count, meta?)`. The orchestrator snapshots
 * the funnel into `responsePayload.metadata.funnel` and
 * `ai_decision_log.evaluation_trace.funnel` right before returning, so every
 * turn produces a queryable funnel:
 *
 *   rules_loaded → rules_evaluated → rules_matched → matched_responses
 *   → eligible_for_primary → arbitrated → gate_passed → primary_built
 *   → actions_returned
 *
 * Bounded memory: TTL-evicted (5 min) and hard-capped at 5,000 traces.
 *
 * Zero behavior change. Pure observability.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type FunnelStage =
  | 'rules_loaded'
  | 'rules_evaluated'
  | 'rules_matched'
  | 'matched_responses'
  | 'eligible_for_primary'
  | 'blocked_by_graph'
  | 'blocked_by_etl'
  | 'primary_built'
  | 'gate_passed'
  | 'gate_blocked'
  | 'gate_downgraded'
  | 'clarification_forced'
  | 'invariant_stripped'
  | 'actions_returned';

export interface FunnelSnapshot {
  trace_id: string;
  counters: Partial<Record<FunnelStage, number>>;
  events: Array<{ stage: FunnelStage; at_ms: number; n: number; meta?: unknown }>;
  /** Largest drop between adjacent stages, useful for fast triage. */
  largest_drop?: { from: FunnelStage; to: FunnelStage; from_n: number; to_n: number };
}

interface InternalEntry {
  trace_id: string;
  started_at: number;
  counters: Partial<Record<FunnelStage, number>>;
  events: FunnelSnapshot['events'];
}

const STORE = new Map<string, InternalEntry>();
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5_000;

function evict(now: number) {
  if (STORE.size <= MAX_ENTRIES) {
    // soft TTL pass
    for (const [k, v] of STORE) {
      if (now - v.started_at > TTL_MS) STORE.delete(k);
    }
    return;
  }
  // hard cap — drop oldest
  const sorted = [...STORE.entries()].sort((a, b) => a[1].started_at - b[1].started_at);
  const dropN = STORE.size - MAX_ENTRIES;
  for (let i = 0; i < dropN; i++) STORE.delete(sorted[i][0]);
}

export function funnelStart(traceId: string): void {
  if (!traceId) return;
  const now = Date.now();
  evict(now);
  STORE.set(traceId, { trace_id: traceId, started_at: now, counters: {}, events: [] });
}

export function funnelRecord(
  traceId: string,
  stage: FunnelStage,
  n: number,
  meta?: unknown
): void {
  if (!traceId) return;
  let entry = STORE.get(traceId);
  if (!entry) {
    // Auto-start so callers don't have to know whether funnelStart fired.
    funnelStart(traceId);
    entry = STORE.get(traceId)!;
  }
  // Last-writer-wins for terminal counts (most stages fire once per turn).
  entry.counters[stage] = n;
  entry.events.push({ stage, at_ms: Date.now() - entry.started_at, n, meta });
}

const STAGE_ORDER: FunnelStage[] = [
  'rules_loaded',
  'rules_evaluated',
  'rules_matched',
  'matched_responses',
  'eligible_for_primary',
  'primary_built',
  'gate_passed',
  'actions_returned',
];

export function funnelSnapshot(traceId: string): FunnelSnapshot | null {
  if (!traceId) return null;
  const entry = STORE.get(traceId);
  if (!entry) return null;

  // Find largest drop across the canonical pipeline order, skipping unset stages.
  let largest: FunnelSnapshot['largest_drop'];
  let prevStage: FunnelStage | null = null;
  let prevN: number | null = null;
  for (const s of STAGE_ORDER) {
    const v = entry.counters[s];
    if (typeof v !== 'number') continue;
    if (prevStage !== null && prevN !== null && v < prevN) {
      const dropAbs = prevN - v;
      if (!largest || dropAbs > (largest.from_n - largest.to_n)) {
        largest = { from: prevStage, to: s, from_n: prevN, to_n: v };
      }
    }
    prevStage = s;
    prevN = v;
  }

  return {
    trace_id: traceId,
    counters: { ...entry.counters },
    events: entry.events.slice(-50), // cap event log
    largest_drop: largest,
  };
}

export function funnelEnd(traceId: string): FunnelSnapshot | null {
  const snap = funnelSnapshot(traceId);
  if (traceId) STORE.delete(traceId);
  return snap;
}
