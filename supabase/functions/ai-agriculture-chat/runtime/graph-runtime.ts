/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE:      supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts
 * ROLE:      SINGLE mandatory entrypoint to the hypothesis graph.
 * AUTHORITY: RUNTIME SSOT — only `runGraphRuntime` may call
 *            `evaluateCandidateHypotheses`. Any other direct import is a P0.
 * STATUS:    ACTIVE
 * VERSION:   v1.0 (introduced by PR-2)
 * LAST_PR:   PR-6 (header stamping, 2026-07-06)
 * STAMPED:   2026-07-06
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture invariant (PR-2, 2026-07-06):
 *   DB  = Agriculture Brain (SSOT)
 *   TS  = Deterministic Graph Runtime            ← this file
 *   LLM = Farmer Language Narrator (never reasons)
 *
 * CONTRACT
 *   • `evaluateCandidateHypotheses` is called from EXACTLY ONE place in the
 *     entire codebase: `runGraphRuntime` below. Any other direct import of
 *     `evaluateCandidateHypotheses` is a P0 violation of the graph pipeline
 *     and must be rewritten to call `runGraphRuntime`.
 *
 *   • Every successful run flips `graphExecuted = true` via the optional
 *     `markExecuted` hook the caller supplies. This is what the downstream
 *     clarification-authority uses to enforce "clarification cannot fire
 *     before the hypothesis graph has run".
 *
 *   • Emits ONE canonical trace line per invocation:
 *         [GRAPH_RUNTIME] loader=HypothesisEvaluator trace=… winner=… ms=…
 *     Auditors grep this to reconstruct any turn.
 *
 * NON-GOALS
 *   • No scoring, no SQL, no agronomy. Heavy retrieval stays in
 *     `../decision/hypothesis-evaluator.ts` until the loader-based SSOT
 *     collapse lands (tracked separately).
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG
 *   2026-07-09 09:25 UTC — Added final OBS_GATE runtime invariant: diagnostic
 *     calls with zero confirmed observations return WAITING_FOR_OBSERVATION
 *     and do not execute evaluateCandidateHypotheses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  evaluateCandidateHypotheses,
  type HypothesisEvaluationOutput,
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
  weather?: any;
  trace_id?: string;
  intent_code?: string;
  /** OBSERVATION_STATE_CONTRACT: true only when caller knows this is diagnostic. */
  diagnostic_intent?: boolean;
  /** CONFIRMED/EXTRACTED farmer evidence only. Defaults to known_observations for legacy callers. */
  confirmed_observations?: string[];
  /** DB-loaded UI candidates to return when waiting for farmer confirmation. */
  candidate_observations?: string[];
  /** Verbatim pass-through to the evaluator for fields not modelled above. */
  passthrough?: Record<string, unknown>;
  /**
   * Caller-supplied hook flipped to true on successful graph execution.
   * Provided as a callback (not a shared object) so this module stays
   * dependency-free and reusable across orchestrator, clarification, and
   * future proactive workers.
   */
  markExecuted?: () => void;
}

export interface GraphRuntimeResult {
  result: HypothesisEvaluationOutput;
  candidates: number;
  winner: string | null;
  ms: number;
  state?: 'WAITING_FOR_OBSERVATION' | 'READY_FOR_GRAPH';
  candidate_observations?: string[];
}

function emptyHypothesisResult(traceId: string | undefined, stage: string | null | undefined): HypothesisEvaluationOutput {
  return {
    candidates: [],
    total_rules_evaluated: 0,
    stage_locked: String(stage ?? 'UNKNOWN'),
    evaluation_method: 'PARTIAL_MATCH',
    timestamp: Date.now(),
    trace_id: String(traceId ?? `obs_gate_${Date.now()}`),
  };
}

export async function runGraphRuntime(
  input: GraphRuntimeInput,
): Promise<GraphRuntimeResult> {
  const t0 = Date.now();
  const passthrough = input.passthrough ?? {};
  const confirmed = input.confirmed_observations ?? input.known_observations ?? [];

  if (input.diagnostic_intent === true && confirmed.length === 0) {
    const ms = Date.now() - t0;
    console.log(
      `[OBS_GATE] awaiting_confirmed_observations trace=${input.trace_id ?? 'n/a'} ` +
      `intent=${input.intent_code ?? 'n/a'} candidates=${input.candidate_observations?.length ?? 0}`,
    );
    return {
      result: emptyHypothesisResult(input.trace_id, input.growth_stage),
      candidates: 0,
      winner: null,
      ms,
      state: 'WAITING_FOR_OBSERVATION',
      candidate_observations: input.candidate_observations ?? [],
    };
  }

  const result = await evaluateCandidateHypotheses({
    graph_truth: input.graph_truth ?? null,
    crop_code: input.crop_code as any,
    growth_stage: input.growth_stage as any,
    days_since_sowing: input.days_since_sowing as any,
    ndvi_level: input.ndvi_level,
    ndvi_trend: input.ndvi_trend,
    weather: input.weather,
    known_observations: input.known_observations,
    user_query: input.user_query,
    supabaseClient: input.supabase,
    trace_id: input.trace_id,
    variety_id: input.variety_id ?? null,
    ...passthrough,
  } as any);

  // Contract flip — MUST happen only after the evaluator resolves without
  // throwing. If the evaluator throws, `graphExecuted` stays false and the
  // MANDATORY_GRAPH_GATE downstream will raise GRAPH_PIPELINE_BYPASSED.
  try { input.markExecuted?.(); } catch { /* caller-side, non-fatal */ }

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
    (result as any)?.ranked_hypotheses?.[0]?.hypothesis_id ??
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

  return { result, candidates, winner, ms, state: 'READY_FOR_GRAPH' };
}
