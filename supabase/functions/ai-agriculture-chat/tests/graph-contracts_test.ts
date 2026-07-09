/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH CONTRACTS — regression harness (crop-agnostic)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CHANGE LOG (newest first):
 *   2026-07-09 04:18 UTC — Initial. Covers v4 patches:
 *     T1 FOREIGN_ORGAN_SYMBOL — cross-crop organ codes dropped for any crop
 *     T2 UNIVERSAL_SYMPTOM   — generic symptoms accepted across crops
 *     T3 FAMILY_SHARED       — solanaceae family sharing (applicable_groups)
 *     T4 GRAPH_AUTHORITY_GATE — hyp=0 diagnostic blocks evaluator
 *     T5 GRAPH_ONLY_RULES    — evaluator pool ⊆ snapshot.rule_ids
 *     T6 GRAPH_EDGE_MISSING  — missing HYP→RULE surfaces, no silent orphan
 *     T7 DECISION_OUTPUT     — 4 valid kinds + NONE degradation
 *     T8 UNKNOWN_SYMBOL      — obs/hyp/rule identity failures logged & dropped
 *     T9 LLM_DIAGNOSIS_ATTEMPT — narrator-only invariant enforced upstream
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  assertObservationsExist,
  assertHypothesesExist,
  assertRulesExist,
  filterByBiologicalScope,
  graphAuthorityGate,
  enforceGraphOnlyRules,
  validateDecisionOutput,
} from '../runtime/graph-contracts.ts';

// ───────────────────────── in-memory supabase mock ────────────────────────

interface Row { [k: string]: any }
function makeStub(rows: Record<string, Row[]>) {
  return {
    from(table: string) {
      const data = rows[table] ?? [];
      const chain: any = {
        _table: table,
        _data: data,
        _filters: [] as Array<(r: Row) => boolean>,
        _cols: [] as string[],
        select(cols: string) {
          chain._cols = cols.split(',').map((c) => c.trim());
          return chain;
        },
        in(col: string, vals: any[]) {
          const set = new Set(vals.map(String));
          chain._filters.push((r: Row) => set.has(String(r[col])));
          return chain;
        },
        eq(col: string, val: any) {
          chain._filters.push((r: Row) => String(r[col]) === String(val));
          return chain;
        },
        ilike(col: string, val: string) {
          const v = val.toLowerCase();
          chain._filters.push((r: Row) => String(r[col] ?? '').toLowerCase() === v);
          return chain;
        },
        limit() { return chain; },
        async maybeSingle() {
          const out = chain._data.filter((r: Row) => chain._filters.every((f: any) => f(r)));
          return { data: out[0] ?? null, error: null };
        },
        then(res: any) {
          const out = chain._data.filter((r: Row) => chain._filters.every((f: any) => f(r)));
          return Promise.resolve({ data: out, error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

// ─────────────────────────────── T1 · P1 ──────────────────────────────────

Deno.test('T1 FOREIGN_ORGAN_SYMBOL — cross-crop codes dropped for every crop', async () => {
  const master: Row[] = [
    // Rice-cereals scoped
    { observation_code: 'RICE_TILLER_YELLOW', crop_group: 'cereals', applicable_crop_groups: ['cereals', 'rice'], observation_type: 'PRIMARY', is_active: true },
    // Brinjal-specific organ symptom
    { observation_code: 'BRINJAL_OBS_STUNTED_PLANT', crop_group: 'brinjal', applicable_crop_groups: ['brinjal', 'vegetables'], observation_type: 'PRIMARY', is_active: true },
    // Sugarcane organ-specific
    { observation_code: 'STUNTED_CANES', crop_group: 'sugarcane', applicable_crop_groups: ['sugarcane'], observation_type: 'PRIMARY', is_active: true },
    // Universal
    { observation_code: 'STUNTED_PLANTS', crop_group: null, applicable_crop_groups: ['universal'], observation_type: 'GENERIC', is_active: true },
  ];
  const supabase = makeStub({ observation_master: master });

  for (const [crop, group] of [['rice', 'cereals'], ['sugarcane', 'sugarcane'], ['cotton', 'cotton'], ['onion', 'allium'], ['tomato', 'solanaceae'], ['grapes', 'horticulture']]) {
    const res = await filterByBiologicalScope(
      supabase as any,
      { crop_code: crop, crop_group: group },
      ['BRINJAL_OBS_STUNTED_PLANT', 'STUNTED_CANES', 'STUNTED_PLANTS'],
    );
    // Universal always accepted; foreign organ codes dropped unless current crop matches
    const acceptedUniversal = res.accepted.includes('STUNTED_PLANTS');
    assertEquals(acceptedUniversal, true, `${crop} must accept universal STUNTED_PLANTS`);
    if (crop !== 'brinjal') {
      const rejectedBrinjal = res.dropped_cross_crop.some((d) => d.code === 'BRINJAL_OBS_STUNTED_PLANT');
      assertEquals(rejectedBrinjal, true, `${crop} must reject BRINJAL_OBS_STUNTED_PLANT`);
    }
    if (crop !== 'sugarcane') {
      const rejectedCane = res.dropped_cross_crop.some((d) => d.code === 'STUNTED_CANES');
      assertEquals(rejectedCane, true, `${crop} must reject STUNTED_CANES`);
    }
  }
});

// ─────────────────────────────── T2 · P1 ──────────────────────────────────

Deno.test('T2 UNIVERSAL_SYMPTOM — YELLOWING accepted across crops', async () => {
  const master: Row[] = [
    { observation_code: 'YELLOWING', crop_group: null, applicable_crop_groups: ['universal'], observation_type: 'GENERIC', is_active: true },
  ];
  const supabase = makeStub({ observation_master: master });
  for (const crop of ['rice', 'cotton', 'sugarcane', 'onion']) {
    const res = await filterByBiologicalScope(supabase as any, { crop_code: crop }, ['YELLOWING']);
    assertEquals(res.accepted, ['YELLOWING']);
    assertEquals(res.dropped_cross_crop.length, 0);
  }
});

// ─────────────────────────────── T3 · P1 ──────────────────────────────────

Deno.test('T3 FAMILY_SHARED_SYMPTOM — bacterial wilt accepted for solanaceae members', async () => {
  const master: Row[] = [
    { observation_code: 'BACTERIAL_WILT', crop_group: null, applicable_crop_groups: ['solanaceae', 'tomato', 'brinjal', 'chilli', 'potato'], observation_type: 'PRIMARY', is_active: true },
  ];
  const supabase = makeStub({ observation_master: master });
  for (const [crop, group] of [['tomato', 'solanaceae'], ['brinjal', 'solanaceae'], ['chilli', 'solanaceae'], ['potato', 'solanaceae']]) {
    const res = await filterByBiologicalScope(supabase as any, { crop_code: crop, crop_group: group }, ['BACTERIAL_WILT']);
    assertEquals(res.accepted, ['BACTERIAL_WILT']);
  }
});

// ─────────────────────────────── T4 · P2 ──────────────────────────────────

Deno.test('T4 GRAPH_AUTHORITY_GATE — blocks evaluator when hypotheses=0', () => {
  const d = graphAuthorityGate({
    is_diagnostic_intent: true,
    graph_executed: true,
    confirmed_observations_count: 5,
    hypotheses_count: 0,
  });
  assertEquals(d.block_rule_evaluator, true);
  assertEquals(d.outcome, 'INSUFFICIENT_KNOWLEDGE');
  assertEquals(d.gap_reason, 'NO_HYPOTHESIS_EDGE');

  const proceed = graphAuthorityGate({
    is_diagnostic_intent: true,
    graph_executed: true,
    confirmed_observations_count: 5,
    hypotheses_count: 2,
  });
  assertEquals(proceed.block_rule_evaluator, false);
  assertEquals(proceed.outcome, 'PROCEED');
});

// ─────────────────────────────── T5 · P3 ──────────────────────────────────

Deno.test('T5 GRAPH_ONLY_RULES — candidate pool constrained to snapshot ids', () => {
  const candidates = [
    { rule_id: 'RICE_STAGE_001', category: 'diagnostic' },
    { rule_id: 'CROT_ROTATION_045', category: 'rotation' },
    { rule_id: 'PROACTIVE_FLOOD_PREPAREDNESS_001', category: 'proactive' },
  ];
  const res = enforceGraphOnlyRules({
    is_diagnostic_intent: true,
    snapshot_rule_ids: ['RICE_STAGE_001'],
    candidate_rules: candidates,
  });
  assertEquals(res.admitted.map((r) => r.rule_id), ['RICE_STAGE_001']);
  assertEquals(res.rejected_ids.length, 2);
});

// ─────────────────────────────── T6 · P3 ──────────────────────────────────

Deno.test('T6 GRAPH_EDGE_MISSING — snapshot id not in candidate pool surfaces without silent orphan', () => {
  const res = enforceGraphOnlyRules({
    is_diagnostic_intent: true,
    snapshot_rule_ids: ['HYP_HAS_EDGE_BUT_RULE_MISSING'],
    candidate_rules: [],
  });
  assertEquals(res.admitted.length, 0);
  assertEquals(res.edge_missing.includes('HYP_HAS_EDGE_BUT_RULE_MISSING'), true);
});

// ─────────────────────────────── T7 · P4 ──────────────────────────────────

Deno.test('T7 DECISION_OUTPUT_CONTRACT — 4 valid kinds plus NONE degradation', () => {
  assertEquals(validateDecisionOutput({ kind: 'ACTION', rule_id: 'R1', action_type: 'SPRAY', action_text: 'apply X', reason_text: 'because Y' }).valid, true);
  assertEquals(validateDecisionOutput({ kind: 'MONITORING_PLAN', monitoring_window_days: 3, reason_text: 'observe' }).valid, true);
  assertEquals(validateDecisionOutput({ kind: 'CLARIFICATION_REQUEST', clarification_questions: [{ q: '?' }] }).valid, true);
  assertEquals(validateDecisionOutput({ kind: 'NO_ACTION_REASON', no_action_reason: 'HEALTHY', reason_text: 'no anomaly' }).valid, true);

  const invalidAction = validateDecisionOutput({ kind: 'ACTION' });
  assertEquals(invalidAction.valid, false);
  assertEquals(invalidAction.missing.length > 0, true);

  const none = validateDecisionOutput({ kind: undefined });
  assertEquals(none.kind, 'NONE');
});

// ─────────────────────────────── T8 · P5 ──────────────────────────────────

Deno.test('T8 UNKNOWN_SYMBOL — obs/hyp/rule identity failures reported', async () => {
  const supabase = makeStub({
    observation_master: [{ observation_code: 'REAL_OBS' }],
    hypothesis_master: [{ hypothesis_id: 'REAL_HYP' }],
    decision_rules: [{ rule_id: 'REAL_RULE' }],
  });
  const o = await assertObservationsExist(supabase as any, ['REAL_OBS', 'GHOST_OBS']);
  assertEquals(o.known, ['REAL_OBS']);
  assertEquals(o.unknown, ['GHOST_OBS']);

  const h = await assertHypothesesExist(supabase as any, ['REAL_HYP', 'GHOST_HYP']);
  assertEquals(h.unknown, ['GHOST_HYP']);

  const r = await assertRulesExist(supabase as any, ['REAL_RULE', 'GHOST_RULE']);
  assertEquals(r.unknown, ['GHOST_RULE']);
});

// ─────────────────────────────── T9 · Invariant ───────────────────────────

Deno.test('T9 LLM_DIAGNOSIS_ATTEMPT — decision output missing kind is rejected', () => {
  const rogue = { rule_id: undefined, action_text: 'LLM-invented diagnosis', reason_text: 'because ai said so' } as any;
  const v = validateDecisionOutput(rogue);
  // Missing `kind` → NONE → invalid (narrator cannot introduce a new decision)
  assertEquals(v.valid, false);
  assertEquals(v.kind, 'NONE');
});
