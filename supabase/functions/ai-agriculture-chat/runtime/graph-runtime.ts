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
 *   2026-07-11 UTC — Context preservation: accept optional `canonical_context`
 *     (frozen CanonicalContext v2.1.0), enforce strict split-check on
 *     authority-owned fields (crop_code, growth_stage, DAS, variety_id, NDVI
 *     primitives + sources.crop === 'crop_schedules' + sources.stage present),
 *     forward the full canonical object into the evaluator via `passthrough`
 *     so DB predicates that reference soil.moisture, weather.forecast_7d,
 *     transplant_date, irrigation_type, biological_state.stage_uuid can now
 *     resolve. Soil/NDVI/weather fallback to lands_cache is legitimate — logged,
 *     never errored. Emits one additive audit line [CANONICAL_CONTEXT_FLOW].
 *   2026-07-09 09:25 UTC — Added final OBS_GATE runtime invariant: diagnostic
 *     calls with zero confirmed observations return WAITING_FOR_OBSERVATION
 *     and do not execute evaluateCandidateHypotheses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  evaluateCandidateHypotheses,
  type HypothesisEvaluationOutput,
} from '../decision/hypothesis-evaluator.ts';
import type { CanonicalContext } from '../decision/canonical-context-contract.ts';

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
   * v2.1.0 — Full frozen CanonicalContext. When present, forwarded into
   * the evaluator via passthrough so DB predicates that reference the
   * field-twin can resolve. Also triggers the strict split-check against
   * the primitive counterparts on authority-owned fields.
   */
  canonical_context?: CanonicalContext | null;
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
  const cctx = input.canonical_context ?? null;

  // ─── Split-check on authority-owned fields (crop/stage/dates only) ─────
  // Soil / NDVI / weather are intentionally excluded — lands_cache is a
  // legitimate fallback for those and is recorded in cctx.sources.
  if (cctx) {
    const norm = (v: unknown) => (v == null ? null : String(v).toUpperCase());
    const mismatches: string[] = [];
    if (input.crop_code != null && norm(input.crop_code) !== norm(cctx.crop_code)) {
      mismatches.push(`crop_code(primitive=${input.crop_code} canonical=${cctx.crop_code})`);
    }
    if (input.growth_stage != null && norm(input.growth_stage) !== norm(cctx.growth_stage)) {
      mismatches.push(`growth_stage(primitive=${input.growth_stage} canonical=${cctx.growth_stage})`);
    }
    if (
      input.days_since_sowing != null &&
      cctx.days_since_sowing != null &&
      Number(input.days_since_sowing) !== Number(cctx.days_since_sowing)
    ) {
      mismatches.push(`days_since_sowing(primitive=${input.days_since_sowing} canonical=${cctx.days_since_sowing})`);
    }
    if (
      input.variety_id != null &&
      cctx.variety_id != null &&
      String(input.variety_id) !== String(cctx.variety_id)
    ) {
      mismatches.push(`variety_id(primitive=${input.variety_id} canonical=${cctx.variety_id})`);
    }
    // Provenance guard — crop identity MUST originate from crop_schedules;
    // stage MUST originate from biological_state or crop_schedules.
    if (cctx.sources) {
      if (cctx.sources.crop !== 'crop_schedules') {
        mismatches.push(`sources.crop(expected=crop_schedules got=${cctx.sources.crop})`);
      }
      if (cctx.sources.stage !== 'biological_state' && cctx.sources.stage !== 'crop_schedules') {
        mismatches.push(`sources.stage(expected=biological_state|crop_schedules got=${cctx.sources.stage})`);
      }
    }
    if (mismatches.length > 0) {
      const msg =
        `GRAPH_CONTEXT_SPLIT_ERROR trace=${input.trace_id ?? 'n/a'} fields=[${mismatches.join('; ')}]`;
      console.error(`[GRAPH_CONTEXT_SPLIT_ERROR] ${msg}`);
      throw new Error(msg);
    }
  }

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
    // Forward the frozen canonical context so DB predicates that reference
    // soil.moisture, weather.forecast_7d, transplant_date, irrigation_type,
    // biological_state.stage_uuid, etc. can resolve.
    canonical_context: cctx,
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

  if (cctx) {
    const s = cctx.sources;
    console.log(
      `[CANONICAL_CONTEXT_FLOW] trace=${input.trace_id ?? 'n/a'} ` +
      `crop=${cctx.crop_code} stage=${cctx.growth_stage} das=${cctx.days_since_sowing ?? 'null'} ` +
      `sowing=${cctx.sowing_date ?? 'null'} transplant=${cctx.transplant_date ?? 'null'} ` +
      `irrig=${cctx.water?.irrigation_type ?? 'null'} moisture=${cctx.soil?.moisture_status ?? 'null'} ` +
      `bio_locked=${!!cctx.biological_state?.is_locked} ` +
      `src.crop=${s?.crop ?? 'n/a'} src.stage=${s?.stage ?? 'n/a'} ` +
      `src.soil=${s?.soil.used ?? 'n/a'} src.ndvi=${s?.ndvi.used ?? 'n/a'}`
    );
  }

  return { result, candidates, winner, ms, state: 'READY_FOR_GRAPH' };
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH v4-P7 — INTENT ≠ OBSERVATION safety guard
// ═══════════════════════════════════════════════════════════════════════════
// Intent codes (opened by the classifier) MUST NEVER leak into the
// confirmed/known/inferred observation arrays. Only outputs of the DB
// observation candidate loader, image classifier, or explicit farmer
// confirmation may enter those arrays.
//
// This is a runtime invariant guard. It is intentionally NON-THROWING for
// the initial rollout to avoid production blast-radius; a `[OBS_INTENT_LEAK]`
// log line is emitted so ingestion can convert to an alert. Flip to
// `throw`-mode once the leak count is proven zero for 7 days.
// ═══════════════════════════════════════════════════════════════════════════

let __INTENT_CODE_SET: Set<string> | null = null;

/** Called once at boot with the current intent_master code set. */
export function registerIntentCodeSet(codes: Iterable<string>): void {
  __INTENT_CODE_SET = new Set(
    Array.from(codes)
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .map((c) => c.toUpperCase()),
  );
}

/**
 * Assert that `obsCode` is NOT a known intent code. Returns true when the
 * code is safe to push into an observation array; false when it looks like
 * an intent leak (guard logs and lets caller decide whether to drop).
 */
export function assertNotAnIntentCode(
  obsCode: string | null | undefined,
  site: string,
): boolean {
  if (!obsCode || typeof obsCode !== 'string') return true;
  const up = obsCode.toUpperCase();
  if (__INTENT_CODE_SET && __INTENT_CODE_SET.has(up)) {
    console.warn(`[OBS_INTENT_LEAK] site=${site} code=${up} rejected — intent codes must not enter observation arrays`);
    return false;
  }
  return true;
}

