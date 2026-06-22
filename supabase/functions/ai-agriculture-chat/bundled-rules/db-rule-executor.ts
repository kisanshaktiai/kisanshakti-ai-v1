/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DB RULE EXECUTOR — Wave B1 (SQL-pushdown selector)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The existing bundled loader (`loader.ts`) pulls ALL active rules into a
 * 1h in-memory cache and filters them in JS. That works, but:
 *   1. It can drift from the DB until cache TTL expires (up to 1h stale).
 *   2. It evaluates 1,800+ rules per turn even though <5 typically match.
 *   3. It can't easily honour DB-only governance fields
 *      (priority, expert_approved, deprecation, applicability_scope).
 *
 * This module is the **DB-driven shadow path**. Given a `DecisionInput` it
 * issues a single indexed SQL query and returns the candidate rule_id set.
 * In `RULE_SOURCE=shadow` mode (the default for Wave B) we compare this set
 * against what the in-memory path actually fired, and log the diff to
 * `ai_decision_log.output_data.rule_source_diff`. Zero farmer-visible change.
 *
 * Flip `RULE_SOURCE=db` only AFTER ≥7 days of shadow data shows the diff is
 * either empty or explicitly understood.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getCropCodeVariants } from '../utils/crop-code-normalizer.ts';
import type { DecisionInput } from './loader.ts';

export interface DbRuleSelection {
  rule_ids: string[];
  elapsed_ms: number;
  filters: {
    crop_codes: string[];
    stage?: string | null;
    category?: string | null;
  };
  error?: string;
}

let _client: ReturnType<typeof createClient> | null = null;
function client() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE env missing');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/**
 * SQL-pushdown candidate selector.
 *
 * Returns the set of `rule_id`s that *could* match the input, filtered at the
 * DB level by crop, active flag, and (when present) stage. The caller is
 * still responsible for evaluating `conditions_json` against the input — this
 * function only narrows the candidate space, it does NOT decide.
 *
 * Indexes used (already present, verified via pg_indexes):
 *   - idx_decision_rules_crop_code_active  (crop_code, is_active) WHERE is_active
 *   - idx_decision_rules_stage_applicable_gin  (stage_applicable) GIN
 */
export async function selectCandidateRuleIdsFromDb(
  input: DecisionInput,
  opts: { timeout_ms?: number } = {}
): Promise<DbRuleSelection> {
  const t0 = Date.now();
  const timeout = opts.timeout_ms ?? 2500;
  const cropCode = (input.crop_code || '').toString();
  const variants = cropCode
    ? Array.from(new Set(getCropCodeVariants(cropCode).map(v => v.toLowerCase())))
    : [];
  // Always include the universal buckets so safety / cross-crop rules stay in
  // the candidate set.
  const cropFilter = variants.length > 0
    ? Array.from(new Set([...variants, 'all', '*', 'universal']))
    : ['all', '*', 'universal'];

  const stage = input.crop_stage ? String(input.crop_stage).toLowerCase() : null;

  const filters = { crop_codes: cropFilter, stage, category: null };

  try {
    const queryPromise = (async () => {
      let q = client()
        .from('decision_rules')
        .select('rule_id, stage_applicable, crop_code')
        .eq('is_active', true)
        .in('crop_code', cropFilter)
        .limit(500); // hard ceiling — diagnostic, never user-facing

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    })();

    const timeoutPromise = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('db-rule-executor timeout')), timeout)
    );

    const rows = await Promise.race([queryPromise, timeoutPromise]) as Array<{
      rule_id: string;
      stage_applicable: string[] | null;
      crop_code: string | null;
    }>;

    // Stage filter applied in JS so we honour both array and null stage_applicable
    // (null/empty means "any stage").
    const filtered = stage
      ? rows.filter(r => {
          const arr = r.stage_applicable;
          if (!arr || (Array.isArray(arr) && arr.length === 0)) return true;
          return Array.isArray(arr)
            ? arr.some(s => String(s).toLowerCase() === stage)
            : String(arr).toLowerCase() === stage;
        })
      : rows;

    return {
      rule_ids: filtered.map(r => r.rule_id).filter(Boolean),
      elapsed_ms: Date.now() - t0,
      filters,
    };
  } catch (e) {
    return {
      rule_ids: [],
      elapsed_ms: Date.now() - t0,
      filters,
      error: (e as Error).message,
    };
  }
}
