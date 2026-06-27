/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER-OBSERVABLE ONTOLOGY GATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INVARIANT (single source of truth for the clarification graph):
 *
 *   Every observation_key presented to the farmer as a clarification option
 *   MUST correspond to a row in `observation_master` with
 *     is_active = true  AND  is_farmer_observable = true.
 *
 * Anything else (diagnosis-level codes such as TUNGRO_YELLOW_STUNT, system
 * predictions such as PREDICTED_NUTRIENT_DEMAND, internal workflow concepts
 * such as WEEKLY_SUMMARY) is dropped here and logged as a vocabulary gap.
 *
 * This module is the only place that enforces the invariant. Callers in
 *   - decision/hypothesis-evaluator.ts (synthetic obs from conditions_json)
 *   - agents/clarification-strategy.ts (rule-driven options → UI)
 *   - agents/dynamic-clarification-generator.ts (hypothesis-driven options)
 *   - agents/clarification-renderer.ts (defence in depth before render)
 * must funnel through `assertFarmerObservable()`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SupabaseClientLike = {
  from: (table: string) => any;
};

export interface OntologyGateReport {
  candidates_in: number;
  candidates_kept: number;
  dropped_unknown: string[];          // not present in observation_master
  dropped_not_observable: string[];   // present but is_farmer_observable=false
  dropped_inactive: string[];         // present but is_active=false
}

export interface OntologyGateResult {
  validKeys: Set<string>;
  report: OntologyGateReport;
}

// Canonical observation identifier: lower_snake_case.
// `observation_master.observation_code` is stored lowercase; comparisons
// must therefore use lowercase to avoid silent gate-drops.
const normalize = (k: string): string =>
  String(k || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Bulk-validate candidate observation keys against `observation_master`.
 * Returns the set of keys that are (a) present, (b) active, (c) farmer-observable.
 * Records vocabulary gaps in `observation_vocabulary_gaps` for everything dropped
 * (best-effort; failures are logged but never thrown).
 */
export async function assertFarmerObservable(
  supabaseClient: SupabaseClientLike,
  candidateKeys: Iterable<string>,
  context: {
    source: string;                   // e.g. 'CLARIFICATION_STRATEGY', 'HYPOTHESIS_EVAL_SYNTHETIC'
    crop_code?: string;
    stage?: string;
    rule_ids?: string[];              // rules that produced these keys (for gap attribution)
    trace_id?: string;
  }
): Promise<OntologyGateResult> {
  const normalized = new Set<string>();
  for (const k of candidateKeys) {
    const n = normalize(k);
    if (n) normalized.add(n);
  }

  const report: OntologyGateReport = {
    candidates_in: normalized.size,
    candidates_kept: 0,
    dropped_unknown: [],
    dropped_not_observable: [],
    dropped_inactive: [],
  };

  if (normalized.size === 0) {
    logReport(report, context);
    return { validKeys: new Set(), report };
  }

  const keys = [...normalized];

  // Single batched query against observation_master
  let rows: any[] = [];
  try {
    const { data, error } = await supabaseClient
      .from('observation_master')
      .select('observation_code, is_active, is_farmer_observable')
      .in('observation_code', keys);
    if (error) {
      console.error(`   ❌ [ONTOLOGY_GATE] observation_master lookup failed: ${error.message}`);
    } else {
      rows = data || [];
    }
  } catch (e) {
    console.error(`   ❌ [ONTOLOGY_GATE] observation_master lookup threw:`, e);
  }

  const seen = new Map<string, { is_active: boolean; is_farmer_observable: boolean }>();
  for (const r of rows) {
    seen.set(normalize(String(r.observation_code)), {
      is_active: r.is_active !== false,
      is_farmer_observable: r.is_farmer_observable === true,
    });
  }

  const valid = new Set<string>();
  for (const key of keys) {
    const meta = seen.get(key);
    if (!meta) {
      report.dropped_unknown.push(key);
      continue;
    }
    if (!meta.is_active) {
      report.dropped_inactive.push(key);
      continue;
    }
    if (!meta.is_farmer_observable) {
      report.dropped_not_observable.push(key);
      continue;
    }
    valid.add(key);
  }
  report.candidates_kept = valid.size;

  logReport(report, context);
  // Fire-and-forget gap recording
  void recordVocabularyGaps(supabaseClient, report, context);

  return { validKeys: valid, report };
}

function logReport(report: OntologyGateReport, context: { source: string; crop_code?: string; stage?: string; trace_id?: string }) {
  const tag = context.trace_id ? `[${context.trace_id}] ` : '';
  console.log(
    `   🛡️  ${tag}[ONTOLOGY_GATE:${context.source}] ` +
    `crop=${context.crop_code || '?'} stage=${context.stage || '?'} ` +
    `in=${report.candidates_in} kept=${report.candidates_kept} ` +
    `dropped_unknown=${report.dropped_unknown.length} ` +
    `dropped_not_observable=${report.dropped_not_observable.length} ` +
    `dropped_inactive=${report.dropped_inactive.length}`
  );
  if (report.dropped_not_observable.length > 0) {
    console.warn(
      `   🚫 [ONTOLOGY_GATE:${context.source}] DIAGNOSIS-LEVEL CODES REJECTED: ` +
      report.dropped_not_observable.slice(0, 10).join(', ')
    );
  }
  if (report.dropped_unknown.length > 0) {
    console.warn(
      `   🚫 [ONTOLOGY_GATE:${context.source}] UNKNOWN CODES REJECTED: ` +
      report.dropped_unknown.slice(0, 10).join(', ')
    );
  }
}

async function recordVocabularyGaps(
  supabaseClient: SupabaseClientLike,
  report: OntologyGateReport,
  context: { source: string; crop_code?: string; rule_ids?: string[] }
) {
  const rows: any[] = [];
  const now = new Date().toISOString();
  const stamp = (key: string, reason: string) => ({
    token_raw: key,
    token_normalized: key,
    language: 'en',
    source: `ONTOLOGY_GATE:${context.source}`,
    occurrences: 1,
    first_seen_at: now,
    last_seen_at: now,
    resolved: false,
    metadata: {
      reason,
      crop_code: context.crop_code || null,
      rule_ids: context.rule_ids && context.rule_ids.length > 0 ? context.rule_ids : null,
    },
  });
  for (const k of report.dropped_unknown) rows.push(stamp(k, 'NOT_IN_MASTER'));
  for (const k of report.dropped_not_observable) rows.push(stamp(k, 'NOT_FARMER_OBSERVABLE'));
  for (const k of report.dropped_inactive) rows.push(stamp(k, 'INACTIVE'));
  if (rows.length === 0) return;

  try {
    await supabaseClient.from('observation_vocabulary_gaps').insert(rows);
  } catch (e) {
    // Non-fatal — diagnostics only.
    console.log(`   ℹ️ [ONTOLOGY_GATE] vocabulary-gap insert skipped: ${(e as Error)?.message}`);
  }
}
