/**
 * Mandatory Observation → Hypothesis graph resolver.
 *
 * Uses DB graph edges only:
 * observation_master / observation_aliases → hypothesis_conditions →
 * hypothesis_master → hypothesis_rule_mapping.
 */

import { evaluateHypothesisGraph } from './hypothesis-graph-evaluator.ts';
import { resolveObservationSymbols, type ResolvedObservationSymbol } from './symbol-resolver.ts';
import { classifyEvidence } from '../runtime/evidence-classifier.ts';

export interface ObservationHypothesisResolverInput {
  supabase: any;
  observations: ReadonlyArray<unknown>;
  crop_context?: {
    crop_code?: string | null;
    crop_group?: string | null;
    growth_stage?: string | null;
    das?: number | null;
  } | null;
  trace_id?: string | null;
}

export interface ObservationHypothesisResolution {
  hypothesis_id: string;
  matched_conditions: string[];
  missing_conditions: string[];
  confidence_score: number;
  candidate_rule_ids: string[];
}

export interface ObservationHypothesisResolverResult {
  resolved_symbols: ResolvedObservationSymbol[];
  hypotheses: ObservationHypothesisResolution[];
  attempted_edges: Array<{ observation_code: string; result: string }>;
  real_observations: string[];
  ignored_context_symbols: string[];
  nearest_hypotheses: ObservationHypothesisResolution[];
  graph_contract_error: null | {
    code: 'GRAPH_CONTRACT_ERROR' | 'GRAPH_NEEDS_DISAMBIGUATION';
    confirmed_observation_ids: string[];
    resolved_symbols: Array<string | null>;
    attempted_edges: Array<{ observation_code: string; result: string }>;
    ignored_context_symbols: string[];
  };
}

export async function resolveHypothesesFromObservations(
  input: ObservationHypothesisResolverInput,
): Promise<ObservationHypothesisResolverResult> {
  const trace = input.trace_id ?? `obs_hyp_${Date.now()}`;
  const evidence = classifyEvidence((input.observations ?? []).map((o) => String(o ?? '')));
  const resolved = await resolveObservationSymbols(input.supabase, evidence.real_codes);
  const canonical = resolved
    .map((r) => r.canonical_observation_code)
    .filter((x): x is string => !!x);

  const graphOut = await evaluateHypothesisGraph({
    crop_code: input.crop_context?.crop_code ?? null,
    crop_group: input.crop_context?.crop_group ?? input.crop_context?.crop_code ?? null,
    growth_stage: input.crop_context?.growth_stage ?? null,
    das: input.crop_context?.das ?? null,
    observation_codes: canonical,
    supabase: input.supabase,
    trace_id: trace,
  });

  const toResolution = (c: any): ObservationHypothesisResolution => ({
    hypothesis_id: c.hypothesis_id,
    matched_conditions: c.positive_matches ?? [],
    missing_conditions: c.missing_required ?? [],
    confidence_score: Number(c.confidence ?? 0),
    candidate_rule_ids: c.candidate_rule_ids ?? [],
  });
  const hypotheses = graphOut.candidates.map(toResolution);
  const nearest_hypotheses = graphOut.eliminated
    .filter((c: any) => (c.positive_matches ?? []).length > 0)
    .map(toResolution);

  const attempted_edges = canonical.map((observation_code) => ({
    observation_code,
    result: hypotheses.some((h) => h.matched_conditions.includes(observation_code))
      ? 'MATCHED'
      : 'NO_MATCH',
  }));

  const gapCode: 'GRAPH_NEEDS_DISAMBIGUATION' | 'GRAPH_CONTRACT_ERROR' = nearest_hypotheses.length > 0
    ? 'GRAPH_NEEDS_DISAMBIGUATION'
    : 'GRAPH_CONTRACT_ERROR';

  const graph_contract_error = canonical.length > 0 && hypotheses.length === 0
    ? {
        code: gapCode,
        confirmed_observation_ids: canonical,
        resolved_symbols: resolved.map((r) => r.canonical_observation_code),
        attempted_edges,
        ignored_context_symbols: evidence.ignored_codes,
      }
    : null;

  if (graph_contract_error) {
    console.error(
      `[GRAPH_CONTRACT_ERROR] trace=${trace} confirmed_observation_ids=[${canonical.join(',')}] ` +
      `real_observations=${canonical.length} ignored_context_symbols=${evidence.ignored_codes.length} ` +
      `attempted_edges=${JSON.stringify(attempted_edges)} action=clarification_or_graph_gap`,
    );
  } else {
    console.log(
      `[OBS_HYP_RESOLVER] trace=${trace} real_observations=${canonical.length} ` +
      `ignored_context_symbols=${evidence.ignored_codes.length} hypotheses=${hypotheses.length}`,
    );
  }

  return {
    resolved_symbols: resolved,
    hypotheses,
    attempted_edges,
    real_observations: canonical,
    ignored_context_symbols: evidence.ignored_codes,
    nearest_hypotheses,
    graph_contract_error,
  };
}
