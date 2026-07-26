/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-09 14:35 UTC — Phase C.1 tests. Verify the four legacy graph
 *   projection fields (hypothesis_ids, hypothesis_rule_ids, obs_to_hyp_edges,
 *   last_real_observations) are now first-class on GraphRuntimeState with
 *   symbolic-id-leak enforcement, and that Phase B (navigator authority)
 *   default is ACTIVE with the OFF blocklist working as an escape hatch.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  GraphRuntimeState,
  SymbolicIdLeakError,
} from '../runtime/graph-runtime-state.ts';
import { resolveNavigatorFlag } from '../runtime/navigator-flag.ts';

// ── Phase C — GraphRuntimeState authority ────────────────────────────────
Deno.test('GraphRuntimeState: hypothesis_ids setter dedupes + enforces canonical', () => {
  const g = new GraphRuntimeState('trace_hyp_ids');
  g.setHypothesisIds(['HYP_A', 'HYP_B', 'HYP_A']);
  assertEquals([...g.hypothesis_ids], ['HYP_A', 'HYP_B']);
});

Deno.test('GraphRuntimeState: hypothesis_ids rejects non-canonical (leak guard)', () => {
  const g = new GraphRuntimeState('trace_hyp_leak');
  assertThrows(
    () => g.setHypothesisIds(['hyp-lowercase']),
    SymbolicIdLeakError,
  );
});

Deno.test('GraphRuntimeState: hypothesis_rule_ids setter mirrors + dedupes', () => {
  const g = new GraphRuntimeState('trace_rule_ids');
  g.setHypothesisRuleIds(['RULE_1', 'RULE_2', 'RULE_1']);
  assertEquals([...g.hypothesis_rule_ids], ['RULE_1', 'RULE_2']);
});

Deno.test('GraphRuntimeState: obs_to_hyp_edges clamps to >=0', () => {
  const g = new GraphRuntimeState('trace_edges');
  g.setObsToHypEdges(5);
  assertEquals(g.obs_to_hyp_edges, 5);
  g.setObsToHypEdges(-9);
  assertEquals(g.obs_to_hyp_edges, 0);
  g.setObsToHypEdges(NaN as unknown as number);
  assertEquals(g.obs_to_hyp_edges, 0);
});

Deno.test('GraphRuntimeState: last_real_observations dedupes and freezes', () => {
  const g = new GraphRuntimeState('trace_lro');
  g.setLastRealObservations(['LEAF_YELLOWING', 'STEM_ROT', 'LEAF_YELLOWING']);
  assertEquals([...g.last_real_observations], ['LEAF_YELLOWING', 'STEM_ROT']);
  // Frozen — pushes on the returned array must not mutate authority state.
  assertThrows(() => (g.last_real_observations as string[]).push('X'));
});

Deno.test('GraphRuntimeState: snapshot() carries the four new projection fields', () => {
  const g = new GraphRuntimeState('trace_snap');
  g.setHypothesisIds(['HYP_A']);
  g.setHypothesisRuleIds(['RULE_1']);
  g.setObsToHypEdges(3);
  g.setLastRealObservations(['LEAF_ROLL']);
  const snap = g.snapshot() as Record<string, unknown>;
  assertEquals((snap.hypothesis_ids as readonly string[])[0], 'HYP_A');
  assertEquals((snap.hypothesis_rule_ids as readonly string[])[0], 'RULE_1');
  assertEquals(snap.obs_to_hyp_edges, 3);
  assertEquals((snap.last_real_observations as readonly string[])[0], 'LEAF_ROLL');
});

// ── Phase B — Navigator flag default is ACTIVE ──────────────────────────
Deno.test('NavigatorFlag: default is ACTIVE (Phase B)', () => {
  // Clear env so we exercise the default branch deterministically.
  Deno.env.delete('DECISION_GRAPH_NAVIGATOR');
  Deno.env.delete('DECISION_GRAPH_NAVIGATOR_TENANTS');
  Deno.env.delete('DECISION_GRAPH_NAVIGATOR_TENANTS_OFF');
  const s = resolveNavigatorFlag({ tenant_id: 't_x' });
  assert(s.active, 'navigator must be ACTIVE by default in Phase B');
  assertEquals(s.reason, 'default_on_phase_b');
});

Deno.test('NavigatorFlag: tenant blocklist takes precedence', () => {
  Deno.env.set('DECISION_GRAPH_NAVIGATOR_TENANTS_OFF', 't_bad');
  const s = resolveNavigatorFlag({ tenant_id: 't_bad' });
  assertEquals(s.active, false);
  assertEquals(s.reason, 'tenant_blocklisted');
  Deno.env.delete('DECISION_GRAPH_NAVIGATOR_TENANTS_OFF');
});

Deno.test('NavigatorFlag: global OFF override still works', () => {
  Deno.env.set('DECISION_GRAPH_NAVIGATOR', 'off');
  const s = resolveNavigatorFlag({ tenant_id: 't_a' });
  assertEquals(s.active, false);
  assertEquals(s.reason, 'global_env_off');
  Deno.env.delete('DECISION_GRAPH_NAVIGATOR');
});
