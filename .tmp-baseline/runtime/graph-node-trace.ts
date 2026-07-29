// GRAPH NODE TRACE — Uniform per-node structured log line

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
