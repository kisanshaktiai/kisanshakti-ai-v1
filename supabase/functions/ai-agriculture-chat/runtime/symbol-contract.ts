/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOL CONTRACT — deterministic runtime identity for graph symbols
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owns ONE responsibility: "Are these two symbolic graph nodes identical?"
 *
 * MUST NOT contain agriculture meaning:
 *   - No crop / pest / disease / intent / stage logic
 *   - No observation allowlists
 *   - No prefix assumptions (obs_*, sc_*, etc.)
 *
 * All agricultural authority lives in the database:
 *   - public.observation_master
 *   - public.intent_observation_mapping
 *   - public.hypothesis_conditions / hypothesis_master
 *   - public.decision_rules / hypothesis_rule_mapping
 *
 * This module only normalizes / compares symbolic identity so the DB and the
 * runtime can freely mix cases and separators without breaking graph
 * matching, hashing, cache keys, or deterministic replay.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Symbolic = string | null | undefined;

/**
 * Deterministic graph-symbol normalization.
 *
 *   trim → collapse whitespace → replace ' ' and '-' with '_' → UPPERCASE
 *
 * Returns `null` for empty / non-string inputs so callers can filter safely
 * without exceptions.
 */
export function normalize(input: Symbolic): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  return s.replace(/[\s-]+/g, '_').toUpperCase();
}

/** Same as `normalize` but returns the empty string for null inputs. */
export function normalizeOrEmpty(input: Symbolic): string {
  return normalize(input) ?? '';
}

/** Case/format-insensitive symbol equality. */
export function equals(a: Symbolic, b: Symbolic): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na == null || nb == null) return false;
  return na === nb;
}

/**
 * Deterministic normalized collection. Deduplicated, sorted, upper-cased.
 * Suitable for graph hashing and cache keys — same input set always yields
 * the same array regardless of source ordering / casing.
 */
export function normalizeCollection(
  input: ReadonlyArray<Symbolic> | null | undefined,
): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const n = normalize(raw);
    if (n) seen.add(n);
  }
  return Array.from(seen).sort();
}

/** Membership check using symbol normalization. */
export function containedIn(needle: Symbolic, haystack: ReadonlyArray<Symbolic>): boolean {
  const n = normalize(needle);
  if (!n) return false;
  for (const h of haystack ?? []) {
    if (normalize(h) === n) return true;
  }
  return false;
}

/**
 * Build a normalized Set for O(1) membership tests during graph evaluation.
 * Duplicates and empty/invalid entries are dropped.
 */
export function toNormalizedSet(input: ReadonlyArray<Symbolic> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(input)) return out;
  for (const raw of input) {
    const n = normalize(raw);
    if (n) out.add(n);
  }
  return out;
}

/**
 * Preserves an audit trail: `{ raw_symbol, graph_symbol }` per input.
 * Deduplicated by graph_symbol. First raw form wins for the audit trace.
 */
export function normalizeWithAudit(
  input: ReadonlyArray<Symbolic> | null | undefined,
  source?: string,
): Array<{ raw_symbol: string; graph_symbol: string; source?: string }> {
  const map = new Map<string, string>();
  if (!Array.isArray(input)) return [];
  for (const raw of input) {
    const n = normalize(raw);
    if (!n) continue;
    if (!map.has(n)) map.set(n, String(raw));
  }
  return Array.from(map, ([graph_symbol, raw_symbol]) => ({
    raw_symbol,
    graph_symbol,
    ...(source ? { source } : {}),
  }));
}

/**
 * Guard used by runtime symbol filters. A symbol is "well-formed" iff it
 * normalizes to a non-empty identifier — i.e. any non-blank string. Case,
 * prefix, and length are NOT authority signals; agricultural authority
 * comes from the database.
 */
export function isWellFormedSymbol(input: Symbolic): boolean {
  return normalize(input) !== null;
}

/**
 * Structured symbol extraction. Accepts any of:
 *   - string / number
 *   - { graph_symbol } / { raw_symbol } / { canonical_code }
 *   - { observation_code } / { code } / { symbol } / { value } / { id }
 *
 * DOES NOT throw. If the input is a Promise, an unknown object shape, or
 * otherwise cannot be identified, the returned `symbol` is `null` and
 * `violation` describes why. GraphRuntime — not SymbolContract — decides
 * whether to fail-closed, trace, or route to clarification.
 *
 * Pure identity layer: no crop / stage / intent / observation knowledge.
 */
export type SymbolViolation = 'PROMISE_LEAK' | 'UNKNOWN_SHAPE' | 'EMPTY';

export interface SymbolExtraction {
  symbol: string | null;
  violation?: SymbolViolation;
  source_shape?: 'string' | 'number' | 'object' | 'promise' | 'nullish' | 'other';
}

const SYMBOL_KEYS = [
  'graph_symbol',
  'raw_symbol',
  'canonical_code',
  'observation_code',
  'code',
  'symbol',
  'value',
  'id',
] as const;

function isThenable(x: unknown): x is Promise<unknown> {
  return !!x && (typeof x === 'object' || typeof x === 'function') &&
    typeof (x as { then?: unknown }).then === 'function';
}

export function extract(input: unknown): SymbolExtraction {
  if (input == null) return { symbol: null, violation: 'EMPTY', source_shape: 'nullish' };
  if (isThenable(input)) {
    return { symbol: null, violation: 'PROMISE_LEAK', source_shape: 'promise' };
  }
  if (typeof input === 'string') {
    const n = normalize(input);
    return n ? { symbol: n, source_shape: 'string' } : { symbol: null, violation: 'EMPTY', source_shape: 'string' };
  }
  if (typeof input === 'number') {
    const n = normalize(String(input));
    return n ? { symbol: n, source_shape: 'number' } : { symbol: null, violation: 'EMPTY', source_shape: 'number' };
  }
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    for (const k of SYMBOL_KEYS) {
      const v = o[k];
      if (v == null) continue;
      if (isThenable(v)) return { symbol: null, violation: 'PROMISE_LEAK', source_shape: 'promise' };
      if (typeof v === 'string' || typeof v === 'number') {
        const n = normalize(String(v));
        if (n) return { symbol: n, source_shape: 'object' };
      }
    }
    return { symbol: null, violation: 'UNKNOWN_SHAPE', source_shape: 'object' };
  }
  return { symbol: null, violation: 'UNKNOWN_SHAPE', source_shape: 'other' };
}

export const SymbolContract = {
  normalize,
  normalizeOrEmpty,
  equals,
  normalizeCollection,
  containedIn,
  toNormalizedSet,
  normalizeWithAudit,
  isWellFormedSymbol,
  extract,
};

export default SymbolContract;
