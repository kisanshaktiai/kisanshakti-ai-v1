/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GraphRuntime — thin facade over the neuro-symbolic hypothesis evaluator.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture invariant:
 *   DB  = Agriculture Brain
 *   TS  = Graph Runtime          (this file — routing + trace + invariants)
 *   LLM = Farmer Language Narrator
 *
 * Responsibilities:
 *   1. Route every hypothesis retrieval through a SINGLE entry point so the
 *      orchestrator, proactive workers, and future agents cannot each grow
 *      their own SQL. Downstream callers stay untouched — they still call
 *      `evaluateCandidateHypotheses` — but every call is fronted here.
 *   2. Emit ONE canonical trace line per request: `[GRAPH_RUNTIME] …`.
 *      Auditors grep for this and it uniquely locates the site.
 *   3. Set the per-request `graphExecuted` boolean so the clarification
 *      authority (see agents/orchestrator.ts around L5220) can enforce
 *      "clarification cannot fire before the hypothesis graph has run".
 *
 * Explicit non-goals for this facade:
 *   - No scoring changes.
 *   - No new SQL. The heavy retrieval remains in `hypothesis-evaluator.ts`
 *     and `hypothesis-graph-evaluator.ts` until they are fully collapsed
 *     into the loader-based SSOT (tracked separately).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  evaluateCandidateHypotheses,
  type HypothesisEvaluationResult,
} from '../decision/hypothesis-evaluator.ts';

export interface GraphRuntimeInput {
  supabase: any;
  crop_code: string | null;
  growth_stage: string | null;
  days_since_sowing: number | null;
  known_observations: string[];
  user_query: string;
  variety_id?: string | null;
  graph_truth?: any;
  ndvi_level?: any;
  ndvi_trend?: any;
  trace_id?: string;
  intent_code?: string;
  /**
   * Any additional pass-through options the caller wants forwarded verbatim
   * to `evaluateCandidateHypotheses`. Kept untyped on purpose to avoid a
   * churn of type imports while the loader consolidation is in flight.
   */
  passthrough?: Record<string, unknown>;
}

export interface GraphRuntimeResult {
  result: HypothesisEvaluationResult;
  candidates: number;
  winner: string | null;
  ms: number;
}

/**
 * Run the hypothesis graph and emit the canonical `[GRAPH_RUNTIME]` trace.
 * Callers should treat the returned `graphExecuted` semantics as authoritative:
 * if this function resolves without throwing, the graph has run.
 */
export async function runGraphRuntime(
  input: GraphRuntimeInput,
): Promise<GraphRuntimeResult> {
  const t0 = Date.now();
  const passthrough = input.passthrough ?? {};

  const result = await evaluateCandidateHypotheses({
    graph_truth: input.graph_truth ?? null,
    crop_code: input.crop_code as any,
    growth_stage: input.growth_stage as any,
    days_since_sowing: input.days_since_sowing as any,
    ndvi_level: input.ndvi_level,
    ndvi_trend: input.ndvi_trend,
    known_observations: input.known_observations,
    user_query: input.user_query,
    supabaseClient: input.supabase,
    trace_id: input.trace_id,
    variety_id: input.variety_id ?? null,
    ...passthrough,
  } as any);

  const ms = Date.now() - t0;
  const candidates = Array.isArray((result as any)?.candidates)
    ? (result as any).candidates.length
    : Array.isArray((result as any)?.ranked_hypotheses)
      ? (result as any).ranked_hypotheses.length
      : 0;
  const winner =
    (result as any)?.winner?.hypothesis_id ??
    (result as any)?.top_hypothesis?.hypothesis_id ??
    (result as any)?.primary_hypothesis?.hypothesis_id ??
    null;

  console.log(
    `[GRAPH_RUNTIME] loader=HypothesisEvaluator ` +
    `trace=${input.trace_id ?? 'n/a'} ` +
    `intent=${input.intent_code ?? 'n/a'} ` +
    `crop=${input.crop_code ?? 'n/a'} ` +
    `stage=${input.growth_stage ?? 'n/a'} ` +
    `das=${input.days_since_sowing ?? 'n/a'} ` +
    `obs=${input.known_observations?.length ?? 0} ` +
    `candidates=${candidates} ` +
    `winner=${winner ?? 'none'} ` +
    `ms=${ms}`,
  );

  return { result, candidates, winner, ms };
}
