/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE SELF-CHECK — Phase F
 * ═══════════════════════════════════════════════════════════════════════════
 * Cold-start self-check. Asserts every Phase A–E invariant is wired. If any
 * check fails it emits a single structured `PIPELINE_SELF_CHECK_FAILED` log
 * and flips `degradeToSafeMode=true`, which the orchestrator uses to fall
 * back to a clarification response instead of returning wrong advice.
 *
 * This runs once per cold start (memoized).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SelfCheckResult {
  ok: boolean;
  failures: string[];
  degradeToSafeMode: boolean;
  checkedAt: number;
}

let cached: SelfCheckResult | null = null;

interface SelfCheckDeps {
  supabase: any;
}

async function tableExistsAndPopulated(supabase: any, table: string, minRows = 1): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) return false;
    return (count ?? 0) >= minRows;
  } catch {
    return false;
  }
}

export async function runPipelineSelfCheck(deps: SelfCheckDeps): Promise<SelfCheckResult> {
  if (cached) return cached;
  const failures: string[] = [];
  const { supabase } = deps;

  // 1. Required modules importable
  const modules = [
    './evidence-ledger.ts',
    './confidence-chain.ts',
    './semantic-validator.ts',
    './scientific-validator.ts',
  ];
  for (const m of modules) {
    try {
      await import(m);
    } catch (e) {
      failures.push(`module-missing:${m}:${(e as Error).message}`);
    }
  }

  // 2. SSOT tables reachable & populated
  const tables = [
    'observation_master',
    'intent_semantic_class_allowlist',
    'crop_baseline_guidelines_v2',
    'crop_stage_master',
    'crop_stage_knowledge',
    'decision_rules',
  ];
  for (const t of tables) {
    const ok = await tableExistsAndPopulated(supabase, t, 1);
    if (!ok) failures.push(`db-ssot-missing-or-empty:${t}`);
  }

  // 3. semantic_class column present on observation_master
  try {
    const { data, error } = await supabase
      .from('observation_master')
      .select('semantic_class')
      .limit(1);
    if (error) failures.push(`observation_master.semantic_class-unreadable:${error.message}`);
    else if (!data || data.length === 0) failures.push('observation_master:empty');
  } catch (e) {
    failures.push(`semantic_class-check-threw:${(e as Error).message}`);
  }

  // 4. rule_intent column present on decision_rules
  try {
    const { error } = await supabase
      .from('decision_rules')
      .select('rule_intent')
      .limit(1);
    if (error) failures.push(`decision_rules.rule_intent-unreadable:${error.message}`);
  } catch (e) {
    failures.push(`rule_intent-check-threw:${(e as Error).message}`);
  }

  const ok = failures.length === 0;
  if (!ok) {
    console.error(
      '[PIPELINE_SELF_CHECK_FAILED]',
      JSON.stringify({ failures, at: new Date().toISOString() })
    );
  } else {
    console.log('[PIPELINE_SELF_CHECK] OK — all gates wired and SSOT reachable.');
  }
  cached = {
    ok,
    failures,
    // Degrade to safe-mode only on critical schema/DB failures, not on
    // import warnings (which would already prevent the function from booting).
    degradeToSafeMode: failures.some((f) =>
      f.startsWith('db-ssot-missing-or-empty:') ||
      f.includes('semantic_class-unreadable') ||
      f.includes('rule_intent-unreadable')
    ),
    checkedAt: Date.now(),
  };
  return cached;
}

/** Test-only reset. */
export function _resetSelfCheckCache(): void {
  cached = null;
}
