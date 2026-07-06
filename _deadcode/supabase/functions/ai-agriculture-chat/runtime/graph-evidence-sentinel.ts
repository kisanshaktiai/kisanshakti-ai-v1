/**
 * Step 1 — GRAPH_NEEDS_MORE_EVIDENCE sentinel.
 *
 * When the symbolic Decision Brain reaches an observation node but the
 * evidence in `GraphTruth.canonical_observations` is insufficient to select
 * a rule (multiple hypotheses within tie-band, no pathognomonic marker, or
 * missing differentiating observation), the pipeline MUST emit this sentinel
 * instead of falling back to a fabricated MONITOR advisory.
 *
 * The sentinel is intentionally minimal: it carries only the graph facts a
 * downstream renderer needs to look up authoritative differential-question
 * text via `readDifferentialQuestion()`.
 *
 * Hard invariants (checked in production trace logs):
 *   1. NO hardcoded agronomy in this file.
 *   2. NO LLM generation of question text — text comes from
 *      `public.observation_differential_questions`.
 *   3. Emitters MUST pass at least one `pending_observation_code`.
 *   4. Callers MUST render the DB question, not synthesize replacement text.
 */

import type { DifferentialQuestion } from './differential-questions-reader.ts';
import { readDifferentialQuestions } from './differential-questions-reader.ts';

export const GRAPH_NEEDS_MORE_EVIDENCE = 'GRAPH_NEEDS_MORE_EVIDENCE' as const;
export type GraphEvidenceSentinelKind = typeof GRAPH_NEEDS_MORE_EVIDENCE;

/**
 * Reason codes are graph-structural, not agronomic. They describe WHY the
 * graph could not select a decision — never WHAT the farmer should do.
 */
export type NeedsMoreEvidenceReason =
  | 'AMBIGUOUS_OBSERVATION'        // one observation, multiple hypotheses in tie-band
  | 'HYPOTHESIS_TIE'               // ≥2 hypotheses within the arbitration margin
  | 'MISSING_DIFFERENTIATOR'       // hypothesis-conditions require an unseen observation
  | 'COVERAGE_BELOW_THRESHOLD'     // rule requires min_data_completeness not met
  | 'NO_PATHOGNOMONIC_MARKER';     // graph carries only generic observations

export interface NeedsMoreEvidenceSentinel {
  kind: GraphEvidenceSentinelKind;
  reason: NeedsMoreEvidenceReason;

  /** GraphTruth facts (immutable copies) used to look up DB questions. */
  graph: {
    crop_code: string | null;
    biological_stage: string | null;
    das: number | null;
    canonical_observations: string[];
    /** Observation codes the graph would need to confirm/deny to progress. */
    pending_observation_codes: string[];
    /** Hypothesis IDs still in contention (top-k, ordered by symbolic conf). */
    contending_hypothesis_ids: string[];
    /** Frozen GraphTruth hash — for trace correlation. */
    graph_hash: string | null;
  };

  /** Resolved differential-question rows from the DB (may be empty). */
  differential_questions: DifferentialQuestion[];

  /** Structural provenance for the [BRAIN_TRACE] emitter. */
  provenance: {
    emitted_by: string;                 // module path
    trace_id: string;
    timestamp: string;                  // ISO
  };
}

export interface BuildSentinelInput {
  reason: NeedsMoreEvidenceReason;
  graph: NeedsMoreEvidenceSentinel['graph'];
  language: string;
  emitted_by: string;
  trace_id: string;
}

/**
 * Build a sentinel and resolve its DB-authoritative differential questions.
 * Callers must NOT construct sentinels by hand — this factory is the only
 * approved entry point so the DB read (and the "no synthesized text" rule)
 * is enforced in one place.
 */
export async function buildNeedsMoreEvidenceSentinel(
  input: BuildSentinelInput,
): Promise<NeedsMoreEvidenceSentinel> {
  const { reason, graph, language, emitted_by, trace_id } = input;

  if (!graph.pending_observation_codes || graph.pending_observation_codes.length === 0) {
    console.warn(
      `[GRAPH_EVIDENCE_SENTINEL] emitted with zero pending observations trace=${trace_id} by=${emitted_by} reason=${reason}`,
    );
  }

  const questionsMap = await readDifferentialQuestions(
    graph.pending_observation_codes,
    language,
    graph.crop_code,
  );
  const differential_questions = graph.pending_observation_codes
    .map((code) => questionsMap.get(code))
    .filter((q): q is DifferentialQuestion => q != null);

  const sentinel: NeedsMoreEvidenceSentinel = {
    kind: GRAPH_NEEDS_MORE_EVIDENCE,
    reason,
    graph: {
      crop_code: graph.crop_code,
      biological_stage: graph.biological_stage,
      das: graph.das,
      canonical_observations: [...graph.canonical_observations],
      pending_observation_codes: [...graph.pending_observation_codes],
      contending_hypothesis_ids: [...graph.contending_hypothesis_ids],
      graph_hash: graph.graph_hash,
    },
    differential_questions,
    provenance: {
      emitted_by,
      trace_id,
      timestamp: new Date().toISOString(),
    },
  };

  console.log(
    `[GRAPH_NEEDS_MORE_EVIDENCE] trace=${trace_id} reason=${reason} ` +
      `crop=${graph.crop_code ?? '?'} stage=${graph.biological_stage ?? '?'} das=${graph.das ?? '?'} ` +
      `pending=[${graph.pending_observation_codes.join(',')}] ` +
      `hyps=[${graph.contending_hypothesis_ids.join(',')}] ` +
      `questions_resolved=${differential_questions.length}/${graph.pending_observation_codes.length} ` +
      `graph_hash=${graph.graph_hash ?? 'null'} by=${emitted_by}`,
  );

  return sentinel;
}

/** Type guard for downstream code paths. */
export function isNeedsMoreEvidenceSentinel(
  value: unknown,
): value is NeedsMoreEvidenceSentinel {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === GRAPH_NEEDS_MORE_EVIDENCE
  );
}
