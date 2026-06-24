/**
 * Case-insensitive accessor for mixed-case JSON keys in decision_rules.conditions_json.
 * Some legacy rows still use mixed-case keys (ETL, DAS_min, BPH_buildup_conditions,
 * soil_test_S_ppm_below). The DB intentionally preserves them; this helper lets the
 * rule evaluator read by canonical lowercase key regardless of stored casing.
 */
export function jsonGetCI(obj: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return (obj as Record<string, unknown>)[key];
  const lowerKey = key.toLowerCase();
  const found = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
  return found ? (obj as Record<string, unknown>)[found] : undefined;
}

/** Variant: get multiple keys at once (returns object of found values). */
export function jsonPickCI(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = jsonGetCI(obj, k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
