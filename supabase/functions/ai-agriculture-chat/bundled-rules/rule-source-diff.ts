/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE SOURCE DIFF — Wave B1 (shadow-mode comparator)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Compares two rule_id sets:
 *   - `bundled_fired`: rules that actually fired this turn (in-memory path)
 *   - `db_candidates`: rules the SQL-pushdown path would consider candidates
 *
 * Returns a compact, log-safe summary suitable for
 * `ai_decision_log.output_data.rule_source_diff`. Bounded payload (top 25
 * IDs per bucket) so a high-churn turn cannot blow up the log row.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface RuleSourceDiff {
  bundled_count: number;
  db_candidate_count: number;
  intersection_count: number;
  only_bundled_count: number;
  only_db_count: number;
  /** Top 25 IDs that fired in bundled path but DB query never offered. */
  only_bundled_sample: string[];
  /** Top 25 IDs DB offered but bundled path never fired (could mean cache stale OR genuine miss). */
  only_db_sample: string[];
  /** Bundled coverage of the DB candidate set, 0–1. 1.0 = all bundled-fired rules were also offered by DB. */
  bundled_in_db_ratio: number;
  /** Heuristic flag: true when divergence is large enough to warrant review. */
  divergence_alert: boolean;
  /** Wall-clock taken by the DB query, for perf budgeting. */
  db_elapsed_ms?: number;
  /** Optional error from DB selector (timeout, permission, etc.). */
  db_error?: string;
}

const SAMPLE_CAP = 25;
const DIVERGENCE_THRESHOLD = 0.2; // >20 % delta in either direction = alert

export function computeRuleSourceDiff(
  bundledFired: string[],
  dbCandidates: string[],
  meta: { db_elapsed_ms?: number; db_error?: string } = {}
): RuleSourceDiff {
  const bundled = new Set(bundledFired.filter(Boolean));
  const db = new Set(dbCandidates.filter(Boolean));

  const intersection: string[] = [];
  const onlyBundled: string[] = [];
  const onlyDb: string[] = [];

  for (const id of bundled) (db.has(id) ? intersection : onlyBundled).push(id);
  for (const id of db) if (!bundled.has(id)) onlyDb.push(id);

  const bundledCount = bundled.size;
  const dbCount = db.size;
  const interCount = intersection.length;
  const ratio = bundledCount === 0 ? 1 : interCount / bundledCount;

  const delta = bundledCount === 0 && dbCount === 0
    ? 0
    : Math.abs(bundledCount - dbCount) / Math.max(bundledCount, dbCount, 1);

  return {
    bundled_count: bundledCount,
    db_candidate_count: dbCount,
    intersection_count: interCount,
    only_bundled_count: onlyBundled.length,
    only_db_count: onlyDb.length,
    only_bundled_sample: onlyBundled.slice(0, SAMPLE_CAP),
    only_db_sample: onlyDb.slice(0, SAMPLE_CAP),
    bundled_in_db_ratio: Number(ratio.toFixed(3)),
    divergence_alert: delta >= DIVERGENCE_THRESHOLD || (bundledCount > 0 && ratio < 1 - DIVERGENCE_THRESHOLD),
    db_elapsed_ms: meta.db_elapsed_ms,
    db_error: meta.db_error,
  };
}
