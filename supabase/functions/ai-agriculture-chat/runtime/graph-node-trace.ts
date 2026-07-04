/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH NODE TRACE — Uniform per-node structured log line
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every node in the Neuro-Symbolic Decision Brain (INTENT, OBSERVATION,
 * BIO_STATE, EVIDENCE, HYPOTHESIS, RULE_ENGINE, SCIENTIFIC_GATE,
 * FINAL_RESPONSE) emits exactly ONE line via `emitNodeTrace()` so the whole
 * turn can be reconstructed from Supabase edge logs by grepping on trace_id.
 *
 * The payload is trimmed to keep the log line under ~1kB (Supabase truncates
 * beyond a few kB). Arrays are capped at 12 elements with a `+N more` tail.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type GraphNodeName =
  | 'INTENT'
  | 'OBSERVATION'
  | 'BIO_STATE'
  | 'STAGE_DECISION'
  | 'EVIDENCE'
  | 'HYPOTHESIS'
  | 'RULE_ENGINE'
  | 'SCIENTIFIC_GATE'
  | 'FINAL_RESPONSE';

const ARRAY_CAP = 12;

function trimValue(v: unknown): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) {
    if (v.length <= ARRAY_CAP) return v.map(trimValue);
    return [...v.slice(0, ARRAY_CAP).map(trimValue), `+${v.length - ARRAY_CAP} more`];
  }
  if (typeof v === 'string' && v.length > 240) return v.slice(0, 240) + '…';
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = trimValue(val);
    }
    return out;
  }
  return v;
}

export function emitNodeTrace(
  trace_id: string | null | undefined,
  node: GraphNodeName,
  payload: Record<string, unknown>,
): void {
  try {
    const trimmed = trimValue(payload) as Record<string, unknown>;
    // eslint-disable-next-line no-console
    console.log(`[GRAPH_NODE_TRACE][${trace_id ?? 'no-trace'}] node=${node} ${JSON.stringify(trimmed)}`);
  } catch (e) {
    console.warn(`[GRAPH_NODE_TRACE_ERR] node=${node} err=${e instanceof Error ? e.message : String(e)}`);
  }
}
