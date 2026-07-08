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

export const SymbolContract = {
  normalize,
  normalizeOrEmpty,
  equals,
  normalizeCollection,
  containedIn,
  toNormalizedSet,
  normalizeWithAudit,
  isWellFormedSymbol,
};

export default SymbolContract;
