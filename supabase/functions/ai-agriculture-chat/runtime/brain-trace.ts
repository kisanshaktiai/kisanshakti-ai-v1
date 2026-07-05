/**
 * Phase I — Single [BRAIN_TRACE] block per request.
 * Read-only over a frozen ConversationState plus pipeline phase outcomes.
 */
import type { ConversationState } from './conversation-state.ts';

export interface BrainTracePhases {
  rule_candidates?: number;
  rule_eligible?:  number;
  rule_winner?:    string | null;
  scientific_ok?:  boolean | null;
  authority?:      string | null;
  builder?:        string | null;
  translation?:    string | null;
  total_ms?:       number;
  /**
   * Override for `hyp` count. ConversationState is built BEFORE the hypothesis
   * graph runs, so its `hypotheses` array is empty at construction. Callers
   * that emit BRAIN_TRACE after the graph MUST pass the real graph count here
   * so the log stops lying (`hyp=0` while graph produced N candidates).
   */
  hypotheses_count?: number;
  obs_to_hyp_edges?: number;
  hyp_to_rule_edges?: number;
  sequence?: number;
  /**
   * OBSERVATION_REQUIRED contract flags — set by the boundary hydrator in
   * index.ts (ensureObservationSelectorContract). Emitted on the single
   * [BRAIN_TRACE] line so audits can grep for symptom-picker turns.
   */
  observation_required?: boolean;
  observation_option_count?: number;
}

export function emitBrainTrace(s: ConversationState, p: BrainTracePhases = {}): void {
  const hypCount = typeof p.hypotheses_count === 'number'
    ? p.hypotheses_count
    : s.hypotheses.length;
  const line =
    `[BRAIN_TRACE] trace=${s.trace_id} ` +
    `sequence=${p.sequence ?? 'n/a'} ` +
    `intent=${s.intent}(${s.intent_confidence.toFixed(2)}) ` +
    `mode=${s.mode} direct=${s.direct_mode} ` +
    `crop=${s.crop ?? '?'} stage=${s.stage ?? '?'}(${s.stage_source}) das=${s.das ?? '?'} ` +
    `confirmed=${s.confirmed.length}(info=${s.informative_count}) ` +
    `inferred=${s.inferred.length} unknown=${s.unknown.length} hyp=${hypCount} ` +
    `coverage=${s.coverage.toFixed(2)} ` +
    `clarify=${s.clarification_required}(${s.clarification_reason}) ` +
    `semantic=${s.semantic_status} symbolic=${s.symbolic_enabled} ` +
    `authority=${s.authority_status} ` +
    `obs_to_hyp=${p.obs_to_hyp_edges ?? 0} hyp_to_rule=${p.hyp_to_rule_edges ?? 0} ` +
    `candidates=${p.rule_candidates ?? 0} eligible=${p.rule_eligible ?? 0} ` +
    `winner=${p.rule_winner ?? 'none'} sci=${p.scientific_ok ?? 'n/a'} ` +
    `builder=${p.builder ?? 'n/a'} translation=${p.translation ?? 'n/a'} ` +
    `observation_required=${p.observation_required ?? false} observation_option_count=${p.observation_option_count ?? 0} ` +
    `total_ms=${p.total_ms ?? 0}`;
  console.log(line);
}
