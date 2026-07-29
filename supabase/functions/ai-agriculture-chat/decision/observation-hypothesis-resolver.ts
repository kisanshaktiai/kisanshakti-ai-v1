/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-25 UTC — Batch A / P1 + P2: tiered DB-driven seed expansion.
 *   Tier 0 = canonical symbol resolution (unresolved codes now PASS THROUGH
 *   normalized instead of being silently dropped). Tier 1 = observation_aliases
 *   closure. Tier 2 = intent_observation_mapping peer expansion. Each tier only
 *   runs when the previous one produced zero surviving hypotheses, so the happy
 *   path is byte-identical. `attempted_edges` is now classified per code
 *   (MATCHED | PARTIAL_MATCH_ONLY | NO_MATCH) and the graph's
 *   `structured_gap_reason` is surfaced on the result.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mandatory Observation → Hypothesis graph resolver.
 *
 * Uses DB graph edges only:
 * observation_master / observation_aliases → hypothesis_conditions →
 * hypothesis_master → hypothesis_rule_mapping.
 *
 * NO hardcoded agronomy. Every expansion tier is a pure identity/adjacency
 * lookup against curated tables.
 */

import {
  evaluateHypothesisGraph,
  type GraphHypothesisResult,
  type GraphStructuredGapReason,
} from './hypothesis-graph-evaluator.ts';
import { resolveObservationSymbols, type ResolvedObservationSymbol } from './symbol-resolver.ts';
import { classifyEvidence } from '../runtime/evidence-classifier.ts';
import {
  expandObservationVocabularyViaAliases,
  expandSeedsViaIntentPeers,
} from './observation-code-mapper.ts';

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

export type ObservationEdgeResult = 'MATCHED' | 'PARTIAL_MATCH_ONLY' | 'NO_MATCH';

export type SeedExpansionTier = 'CANONICAL' | 'ALIAS_CLOSURE' | 'INTENT_PEERS';

export interface ObservationHypothesisResolverResult {
  resolved_symbols: ResolvedObservationSymbol[];
  hypotheses: ObservationHypothesisResolution[];
  attempted_edges: Array<{ observation_code: string; result: ObservationEdgeResult }>;
  real_observations: string[];
  /** Canonical codes actually handed to the graph (post-expansion). */
  canonical_confirmed: string[];
  /** Which expansion tier produced the returned hypothesis set. */
  seed_expansion_tier: SeedExpansionTier;
  /** Codes that resolved to no observation_master/alias row (passed through). */
  unresolved_codes: string[];
  /** Machine-readable graph gap classification (null when hypotheses exist). */
  structured_gap_reason: GraphStructuredGapReason | null;
  ignored_context_symbols: string[];
  nearest_hypotheses: ObservationHypothesisResolution[];
  graph_contract_error: null | {
    code: 'GRAPH_CONTRACT_ERROR' | 'GRAPH_NEEDS_DISAMBIGUATION';
    confirmed_observation_ids: string[];
    resolved_symbols: Array<string | null>;
    attempted_edges: Array<{ observation_code: string; result: ObservationEdgeResult }>;
    ignored_context_symbols: string[];
    structured_gap_reason: GraphStructuredGapReason | null;
  };
}

/** DB-canonical form used by observation_master.observation_code (lowercase). */
function dbCanonical(code: string): string {
  return String(code ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const toResolution = (c: any): ObservationHypothesisResolution => ({
  hypothesis_id: c.hypothesis_id,
  matched_conditions: c.positive_matches ?? [],
  missing_conditions: c.missing_required ?? [],
  confidence_score: Number(c.confidence ?? 0),
  candidate_rule_ids: c.candidate_rule_ids ?? [],
});

export async function resolveHypothesesFromObservations(
  input: ObservationHypothesisResolverInput,
): Promise<ObservationHypothesisResolverResult> {
  const trace = input.trace_id ?? `obs_hyp_${Date.now()}`;
  const evidence = classifyEvidence((input.observations ?? []).map((o) => String(o ?? '')));
  const resolved = await resolveObservationSymbols(input.supabase, evidence.real_codes);

  // ── Tier 0: canonical resolution ────────────────────────────────────────
  const canonicalSeeds: string[] = [];
  const unresolved_codes: string[] = [];
  for (const r of resolved) {
    const code = r.canonical_observation_code
      ? dbCanonical(r.canonical_observation_code)
      : dbCanonical(String(r.graph_symbol ?? r.raw_symbol ?? ''));
    if (!code) continue;
    if (!r.canonical_observation_code) unresolved_codes.push(code);
    if (!canonicalSeeds.includes(code)) canonicalSeeds.push(code);
  }

  if (unresolved_codes.length > 0) {
    console.warn(
      `[OBS_CANONICAL_PASSTHROUGH] trace=${trace} unresolved=[${unresolved_codes.join(',')}] ` +
        `action=passed_through_to_graph reason=missing_observation_alias_or_master_row`,
    );
  }

  const runGraph = (codes: string[]): Promise<GraphHypothesisResult> =>
    evaluateHypothesisGraph({
      crop_code: input.crop_context?.crop_code ?? null,
      crop_group: input.crop_context?.crop_group ?? input.crop_context?.crop_code ?? null,
      growth_stage: input.crop_context?.growth_stage ?? null,
      das: input.crop_context?.das ?? null,
      observation_codes: codes,
      supabase: input.supabase,
      trace_id: trace,
    });

  let seedExpansionTier: SeedExpansionTier = 'CANONICAL';
  let seeds = canonicalSeeds;
  let graphOut = await runGraph(seeds);

  // ── Tier 1: observation_aliases closure ─────────────────────────────────
  if (graphOut.candidates.length === 0 && canonicalSeeds.length > 0) {
    try {
      const { expanded_codes, trace: aliasTrace } = await expandObservationVocabularyViaAliases(
        canonicalSeeds,
        input.supabase,
      );
      const aliasSeeds = Array.from(new Set(expanded_codes.map(dbCanonical).filter(Boolean)));
      const added = aliasSeeds.filter((c) => !canonicalSeeds.includes(c));
      if (added.length > 0) {
        console.log(
          `[OBS_CANONICAL_EXPAND] trace=${trace} tier=ALIAS_CLOSURE added=${added.length} ` +
            `codes=[${added.slice(0, 20).join(',')}] trace_edges=[${aliasTrace.slice(0, 10).join(',')}]`,
        );
        const aliasOut = await runGraph(aliasSeeds);
        if (aliasOut.candidates.length > 0) {
          graphOut = aliasOut;
          seeds = aliasSeeds;
          seedExpansionTier = 'ALIAS_CLOSURE';
        }
      }
    } catch (e) {
      console.warn(`[OBS_CANONICAL_EXPAND] trace=${trace} tier=ALIAS_CLOSURE failed=${(e as Error).message}`);
    }
  }

  // ── Tier 2: intent_observation_mapping peers ────────────────────────────
  if (graphOut.candidates.length === 0 && canonicalSeeds.length > 0) {
    try {
      const { peer_codes } = await expandSeedsViaIntentPeers(
        canonicalSeeds,
        {
          crop_code: input.crop_context?.crop_code ?? null,
          growth_stage: input.crop_context?.growth_stage ?? null,
          das: input.crop_context?.das ?? null,
        },
        input.supabase,
      );
      if (peer_codes.length > 0) {
        const peerSeeds = Array.from(new Set([...seeds, ...peer_codes]));
        console.log(
          `[OBS_CANONICAL_EXPAND] trace=${trace} tier=INTENT_PEERS added=${peer_codes.length} ` +
            `codes=[${peer_codes.slice(0, 20).join(',')}]`,
        );
        const peerOut = await runGraph(peerSeeds);
        if (peerOut.candidates.length > 0) {
          graphOut = peerOut;
          seeds = peerSeeds;
          seedExpansionTier = 'INTENT_PEERS';
        }
      }
    } catch (e) {
      console.warn(`[OBS_CANONICAL_EXPAND] trace=${trace} tier=INTENT_PEERS failed=${(e as Error).message}`);
    }
  }

  const hypotheses = graphOut.candidates.map(toResolution);
  const nearest_hypotheses = graphOut.eliminated
    .filter((c: any) => (c.positive_matches ?? []).length > 0)
    .map(toResolution);

  // ── P2: per-code edge classification ────────────────────────────────────
  const matchedInSurvivors = new Set<string>();
  for (const h of hypotheses) for (const c of h.matched_conditions) matchedInSurvivors.add(dbCanonical(c));
  const matchedInEliminated = new Set<string>();
  for (const h of nearest_hypotheses) for (const c of h.matched_conditions) matchedInEliminated.add(dbCanonical(c));

  const attempted_edges = canonicalSeeds.map((observation_code) => {
    const key = dbCanonical(observation_code);
    const result: ObservationEdgeResult = matchedInSurvivors.has(key)
      ? 'MATCHED'
      : matchedInEliminated.has(key)
        ? 'PARTIAL_MATCH_ONLY'
        : 'NO_MATCH';
    return { observation_code, result };
  });

  const structured_gap_reason: GraphStructuredGapReason | null =
    hypotheses.length > 0 ? null : (graphOut.structured_gap_reason ?? 'NO_DISCOVERY_SEEDS');

  const gapCode: 'GRAPH_NEEDS_DISAMBIGUATION' | 'GRAPH_CONTRACT_ERROR' = nearest_hypotheses.length > 0
    ? 'GRAPH_NEEDS_DISAMBIGUATION'
    : 'GRAPH_CONTRACT_ERROR';

  const graph_contract_error = canonicalSeeds.length > 0 && hypotheses.length === 0
    ? {
        code: gapCode,
        confirmed_observation_ids: canonicalSeeds,
        resolved_symbols: resolved.map((r) => r.canonical_observation_code),
        attempted_edges,
        ignored_context_symbols: evidence.ignored_codes,
        structured_gap_reason,
      }
    : null;

  if (graph_contract_error) {
    console.error(
      `[GRAPH_CONTRACT_ERROR] trace=${trace} confirmed_observation_ids=[${canonicalSeeds.join(',')}] ` +
      `real_observations=${canonicalSeeds.length} ignored_context_symbols=${evidence.ignored_codes.length} ` +
      `structured_gap_reason=${structured_gap_reason} tiers_tried=${seedExpansionTier} ` +
      `unresolved=[${unresolved_codes.join(',')}] ` +
      `attempted_edges=${JSON.stringify(attempted_edges)} action=clarification_or_graph_gap`,
    );
  } else {
    console.log(
      `[OBS_HYP_RESOLVER] trace=${trace} real_observations=${canonicalSeeds.length} ` +
      `seed_expansion_tier=${seedExpansionTier} seeds_used=${seeds.length} ` +
      `ignored_context_symbols=${evidence.ignored_codes.length} hypotheses=${hypotheses.length}`,
    );
  }

  return {
    resolved_symbols: resolved,
    hypotheses,
    attempted_edges,
    real_observations: canonicalSeeds,
    canonical_confirmed: seeds,
    seed_expansion_tier: seedExpansionTier,
    unresolved_codes,
    structured_gap_reason,
    ignored_context_symbols: evidence.ignored_codes,
    nearest_hypotheses,
    graph_contract_error,
  };
}
