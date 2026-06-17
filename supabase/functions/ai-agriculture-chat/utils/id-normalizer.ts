/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ID NORMALIZER — Stage-2 Dual-Read Shim
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Post-migration (2026-06-17) the symbolic tables expose generated lowercase
 * sidecar columns:
 *
 *   decision_rules.rule_id_lc        = 'rule_' || lower(strip_prefix(rule_id))
 *   hypothesis_master.hypothesis_id_lc = 'hyp_'  || lower(strip_prefix(hypothesis_id))
 *
 * Canonical PK is still UPPER_SNAKE today (Stage 1 was additive). Stage 4 will
 * flip canonical to lowercase. To survive both worlds, every id lookup must:
 *
 *   1. Try the id as-given against the canonical column.
 *   2. Fall back to the lowercase form against the *_lc column.
 *
 * The helpers below centralize that contract so individual call sites never
 * need to know about the migration. When Stage 4 lands, the fallbacks become
 * no-ops (id_lc === rule_id) and the shim can be deleted in one PR.
 *
 * DO NOT add any agronomic logic here. This file is naming/identity only.
 */

const RULE_PREFIX_RE = /^(rule_|RULE_)/i;
const HYP_PREFIX_RE = /^(hyp_|HYP_)/i;

/** Produce the canonical lowercase form of a rule id (matches rule_id_lc DDL). */
export function ruleIdLc(id: string): string {
  if (!id) return id;
  return 'rule_' + id.replace(RULE_PREFIX_RE, '').toLowerCase();
}

/** Produce the canonical lowercase form of a hypothesis id (matches hypothesis_id_lc DDL). */
export function hypothesisIdLc(id: string): string {
  if (!id) return id;
  return 'hyp_' + id.replace(HYP_PREFIX_RE, '').toLowerCase();
}

/**
 * Dual-read a single row by rule_id. Returns the row regardless of which
 * column the input matched. `select` follows PostgREST select syntax.
 */
export async function selectRuleByAnyId(
  supabase: any,
  id: string,
  select = '*',
  extraFilters: (q: any) => any = (q) => q,
): Promise<any | null> {
  if (!id) return null;
  // Try canonical first — this is the hot path until Stage 4.
  let q = supabase.from('decision_rules').select(select).eq('rule_id', id);
  q = extraFilters(q);
  const { data: byCanonical } = await q.maybeSingle();
  if (byCanonical) return byCanonical;
  // Fallback to lowercase sidecar (handles callers that already pass lc ids).
  let q2 = supabase.from('decision_rules').select(select).eq('rule_id_lc', ruleIdLc(id));
  q2 = extraFilters(q2);
  const { data: byLc } = await q2.maybeSingle();
  return byLc ?? null;
}

/**
 * Dual-read multiple rules by id list. Splits the input into canonical /
 * lowercase buckets so PostgREST `.in()` is used exactly twice (worst case).
 */
export async function selectRulesByAnyIds(
  supabase: any,
  ids: string[],
  select = '*',
): Promise<any[]> {
  if (!ids || ids.length === 0) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  // First pass: canonical column.
  const { data: byCanonical } = await supabase
    .from('decision_rules')
    .select(select)
    .in('rule_id', unique);
  const found = new Set<string>((byCanonical || []).map((r: any) => r.rule_id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length === 0) return byCanonical || [];
  // Second pass: lowercase sidecar for ids the first pass did not satisfy.
  const lcMissing = missing.map(ruleIdLc);
  const { data: byLc } = await supabase
    .from('decision_rules')
    .select(select)
    .in('rule_id_lc', lcMissing);
  return [...(byCanonical || []), ...(byLc || [])];
}
