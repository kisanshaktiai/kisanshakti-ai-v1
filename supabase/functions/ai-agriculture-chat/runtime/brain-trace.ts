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
}

export function emitBrainTrace(s: ConversationState, p: BrainTracePhases = {}): void {
  const line =
    `[BRAIN_TRACE] trace=${s.trace_id} ` +
    `intent=${s.intent}(${s.intent_confidence.toFixed(2)}) ` +
    `mode=${s.mode} direct=${s.direct_mode} ` +
    `crop=${s.crop ?? '?'} stage=${s.stage ?? '?'}(${s.stage_source}) das=${s.das ?? '?'} ` +
    `confirmed=${s.confirmed.length}(info=${s.informative_count}) ` +
    `inferred=${s.inferred.length} unknown=${s.unknown.length} hyp=${s.hypotheses.length} ` +
    `coverage=${s.coverage.toFixed(2)} ` +
    `clarify=${s.clarification_required}(${s.clarification_reason}) ` +
    `semantic=${s.semantic_status} symbolic=${s.symbolic_enabled} ` +
    `authority=${s.authority_status} ` +
    `candidates=${p.rule_candidates ?? 0} eligible=${p.rule_eligible ?? 0} ` +
    `winner=${p.rule_winner ?? 'none'} sci=${p.scientific_ok ?? 'n/a'} ` +
    `builder=${p.builder ?? 'n/a'} translation=${p.translation ?? 'n/a'} ` +
    `total_ms=${p.total_ms ?? 0}`;
  console.log(line);
}
