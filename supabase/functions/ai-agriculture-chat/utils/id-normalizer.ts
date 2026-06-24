import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

/**
 * Normalize a rule_id to its lowercase-snake shadow form.
 * Mirrors the rule_id_lc column generation in the DB.
 */
export function ruleIdLc(ruleId: string): string {
  return String(ruleId ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Dual-read rule lookup: try the canonical rule_id first, then the
 * rule_id_lc shadow column. Returns the first row found or null.
 *
 * @param supabase  Supabase client
 * @param anyId     Either canonical UPPER or already-lowercase rule id
 * @param select    PostgREST select clause (e.g. 'observable_characteristics, conditions_json')
 * @param filter    Optional builder applied to the PostgREST query
 */
export async function selectRuleByAnyId(
  supabase: SupabaseClient,
  anyId: string,
  select: string,
  filter?: (q: any) => any,
): Promise<any | null> {
  const tryQuery = async (col: 'rule_id' | 'rule_id_lc', value: string) => {
    let q = supabase.from('decision_rules').select(select).eq(col, value);
    if (filter) q = filter(q);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  };

  // 1. Try canonical id as-is
  const byId = await tryQuery('rule_id', anyId);
  if (byId) return byId;

  // 2. Fallback: dual-read by lowercase shadow
  const lc = ruleIdLc(anyId);
  if (lc !== anyId) {
    const byLc = await tryQuery('rule_id_lc', lc);
    if (byLc) return byLc;
  }

  return null;
}
