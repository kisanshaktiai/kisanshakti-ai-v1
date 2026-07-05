/**
 * RuleGraphLoader — DB-driven rule + product retrieval.
 *
 * Reads:
 *   - decision_rules        (rule metadata, thresholds live in the row)
 *   - rule_product_mapping  (rule_id → product_id)
 *
 * Contract:
 *   No crop / pest / stage filter in TS. Callers pass rule_ids the graph
 *   already selected. Returns raw rows + attached product_ids.
 *
 * Additive: not wired.
 */
import type { RequestCache } from './loader-cache.ts';
import type { RuleNode, RuleId } from './loader-types.ts';

export class RuleGraphLoader {
  constructor(private supabase: any, private cache: RequestCache) {}

  async getRules(ruleIds: RuleId[]): Promise<RuleNode[]> {
    const uniq = Array.from(new Set(ruleIds.filter(Boolean)));
    if (uniq.length === 0) return [];
    const cacheKey = `rule.get:${uniq.sort().join(',')}`;
    return this.cache.memo(cacheKey, async () => {
      const { data: rules, error } = await this.supabase
        .from('decision_rules')
        .select('*')
        .in('rule_id', uniq)
        .eq('is_active', true);
      if (error) {
        console.warn(`[GRAPH_LOADER][rule.get] error=${error.message}`);
        return [];
      }

      const { data: rpmRows } = await this.supabase
        .from('rule_product_mapping')
        .select('rule_id, product_id, priority, is_primary')
        .in('rule_id', uniq)
        .order('is_primary', { ascending: false })
        .order('priority', { ascending: false });
      const products = new Map<string, string[]>();
      for (const r of rpmRows ?? []) {
        const list = products.get(r.rule_id) ?? [];
        list.push(r.product_id);
        products.set(r.rule_id, list);
      }

      return (rules ?? []).map((r: any) => ({
        rule_id: r.rule_id,
        category: r.category ?? null,
        metadata: r,
        product_ids: products.get(r.rule_id) ?? [],
      })) as RuleNode[];
    });
  }
}
