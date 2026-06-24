/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITY TRACE — SSOT Telemetry
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every mutation to a SSOT field (response_mode, clarification_required,
 * recommendation_allowed, diagnostic_state) MUST be logged through this
 * module. CI invariant tests grep for any other writer.
 *
 * This file is read-only consumable by the rest of the codebase; only
 * decision/authority/* may import it as a writer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AuthoritativeField =
  | 'response_mode'
  | 'clarification_required'
  | 'recommendation_allowed'
  | 'diagnostic_state'
  | 'diagnostic_certainty';

export interface AuthorityTraceEntry {
  field: AuthoritativeField;
  old_value: unknown;
  new_value: unknown;
  source: string;            // module:function
  trace_id: string;
  reason: string;
  certainty_snapshot?: number;
  at: string;
}

const _ring: AuthorityTraceEntry[] = [];
const MAX = 200;

export function logAuthorityMutation(entry: Omit<AuthorityTraceEntry, 'at'>): void {
  const full: AuthorityTraceEntry = { ...entry, at: new Date().toISOString() };
  _ring.push(full);
  if (_ring.length > MAX) _ring.shift();
  console.log(
    `🧭 [AuthorityTrace] field=${full.field} ${JSON.stringify(full.old_value)} → ${JSON.stringify(full.new_value)} ` +
      `source=${full.source} trace=${full.trace_id} reason="${full.reason}"` +
      (typeof full.certainty_snapshot === 'number' ? ` certainty=${full.certainty_snapshot.toFixed(3)}` : '')
  );
}

export function getRecentAuthorityTrace(trace_id?: string): AuthorityTraceEntry[] {
  return trace_id ? _ring.filter(e => e.trace_id === trace_id) : _ring.slice();
}
