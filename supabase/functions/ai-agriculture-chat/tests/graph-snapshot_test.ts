/**
 * GraphRuntimeSnapshot contract tests.
 *
 * Enforces the Observation → Hypothesis → Rule ontology:
 *   - Engine A rule_ids are promoted to hypotheses ONLY via edges.ruleToHypothesis.
 *   - Missing mappings → orphan_rule_ids (never a fake hypothesis).
 *   - Same hypothesis from both engines merges once with source=BOTH.
 *   - BRAIN_TRACE reads hyp count from the snapshot; projection drop throws.
 *   - Orphan-only rules downgrade to GRAPH_EXHAUSTED (or throw under GRAPH_STRICT).
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  buildGraphRuntimeSnapshot,
  assertSnapshotNotCorrupt,
  invertRuleMapping,
} from '../runtime/graph-snapshot.ts';

Deno.test('Test 1 — Engine A rule promotes to hypothesis via ruleToHypothesis map', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't1',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{
        rule_id: 'RICE_SOIL_CRUST_BREAKING_001',
        total_score: 0.7,
        matched_conditions: ['POOR_EMERGENCE'],
      }],
    },
    engineB: { candidates: [] },
    edges: {
      ruleToHypothesis: new Map([['RICE_SOIL_CRUST_BREAKING_001', 'RICE_GERMINATION_FAILURE']]),
    },
  });
  assertEquals(snap.hypotheses.length, 1);
  assertEquals(snap.hypotheses[0].id, 'RICE_GERMINATION_FAILURE');
  assertEquals(snap.rule_nodes.length, 1);
  assertEquals(snap.rule_nodes[0].rule_id, 'RICE_SOIL_CRUST_BREAKING_001');
  assertEquals(snap.rule_nodes[0].parent_hypothesis_id, 'RICE_GERMINATION_FAILURE');
  assertEquals(snap.orphan_rule_ids.length, 0);
  assertEquals(snap.rules, ['RICE_SOIL_CRUST_BREAKING_001']);
});

Deno.test('Test 2 — missing mapping yields orphan_rule_candidate, no fake hypothesis', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't2',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{
        rule_id: 'UNMAPPED_RULE_999',
        total_score: 0.8,
        matched_conditions: ['POOR_EMERGENCE'],
      }],
    },
    engineB: { candidates: [] },
    edges: { ruleToHypothesis: new Map() },
  });
  assertEquals(snap.hypotheses.length, 0);
  assertEquals(snap.orphan_rule_ids, ['UNMAPPED_RULE_999']);
  assertEquals(snap.rule_nodes[0].parent_hypothesis_id, null);
  assertEquals(snap.rules.length, 0);
  assertEquals(snap.graph_state, 'GRAPH_EXHAUSTED');
});

Deno.test('Test 3 — same hypothesis from Engine A and Engine B merges once with source=BOTH', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't3',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{
        rule_id: 'RICE_SOIL_CRUST_BREAKING_001',
        total_score: 0.6,
        matched_conditions: ['POOR_EMERGENCE'],
      }],
    },
    engineB: {
      candidates: [{
        hypothesis_id: 'RICE_GERMINATION_FAILURE',
        confidence: 0.85,
        positive_matches: ['POOR_EMERGENCE'],
        candidate_rule_ids: ['RICE_SOIL_CRUST_BREAKING_001'],
      }],
    },
    edges: {
      ruleToHypothesis: new Map([['RICE_SOIL_CRUST_BREAKING_001', 'RICE_GERMINATION_FAILURE']]),
    },
  });
  assertEquals(snap.hypotheses.length, 1);
  assertEquals(snap.hypotheses[0].source, 'BOTH');
  assertEquals(snap.hypotheses[0].confidence, 0.85); // max wins
  assertEquals(snap.rule_nodes.length, 1);            // dedup by rule_id
});

Deno.test('Test 4 — BRAIN_TRACE parity: snapshot.hypotheses=1 must not be dropped downstream', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't4',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{
        rule_id: 'RICE_SOIL_CRUST_BREAKING_001',
        total_score: 0.7,
        matched_conditions: ['POOR_EMERGENCE'],
      }],
    },
    engineB: null,
    edges: {
      ruleToHypothesis: new Map([['RICE_SOIL_CRUST_BREAKING_001', 'RICE_GERMINATION_FAILURE']]),
    },
  });
  assertEquals(snap.hypotheses.length, 1);
  // projection=1 → passes
  assertSnapshotNotCorrupt(snap, 1, 't4');
  // projection=0 while snapshot has hypotheses → GRAPH_STATE_CORRUPTION_ERROR
  assertThrows(
    () => assertSnapshotNotCorrupt(snap, 0, 't4'),
    Error,
    'GRAPH_STATE_CORRUPTION_ERROR',
  );
});

Deno.test('Test 5 — invertRuleMapping produces Map<rule_id, hypothesis_id>', () => {
  const hypToRules = new Map<string, string[]>([
    ['H_A', ['R1', 'R2']],
    ['H_B', ['R3']],
  ]);
  const inv = invertRuleMapping(hypToRules);
  assertEquals(inv.get('R1'), 'H_A');
  assertEquals(inv.get('R2'), 'H_A');
  assertEquals(inv.get('R3'), 'H_B');
  assertEquals(inv.size, 3);
});

Deno.test('Test 6 — empty engines yield NO_HYPOTHESIS state', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't6',
    observations: [],
    engineA: null,
    engineB: null,
  });
  assertEquals(snap.hypotheses.length, 0);
  assertEquals(snap.rule_nodes.length, 0);
  assertEquals(snap.graph_state, 'NO_HYPOTHESIS');
});

Deno.test('Test 7 — Engine A with matched_conditions=[] is treated as orphan (no evidence)', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't7',
    observations: [],
    engineA: {
      candidates: [{ rule_id: 'R_NOEV', total_score: 0.9, matched_conditions: [] }],
    },
    engineB: null,
    edges: {
      ruleToHypothesis: new Map([['R_NOEV', 'H_X']]),
    },
  });
  assertEquals(snap.hypotheses.length, 0);
  assertEquals(snap.orphan_rule_ids, ['R_NOEV']);
});
