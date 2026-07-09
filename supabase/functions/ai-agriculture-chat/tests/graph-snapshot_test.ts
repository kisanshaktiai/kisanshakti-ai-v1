/**
 * GraphRuntimeSnapshot contract tests — guarantees the unified graph
 * result never loses hypotheses between engines A and B, and that a
 * dropped projection throws GRAPH_STATE_CORRUPTION_ERROR.
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  buildGraphRuntimeSnapshot,
  assertSnapshotNotCorrupt,
} from '../runtime/graph-snapshot.ts';

Deno.test('snapshot unions Engine A + Engine B hypotheses', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't1',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{
        rule_id: 'RICE_GERMINATION_FAILURE',
        total_score: 0.7,
        matched_conditions: ['POOR_EMERGENCE'],
        candidate_rule_ids: ['RICE_SOIL_CRUST_BREAKING_001'],
      }],
    },
    engineB: { candidates: [] }, // stage-mismatch kill
  });
  assertEquals(snap.hypotheses.length, 1);
  assertEquals(snap.hypotheses[0].id, 'RICE_GERMINATION_FAILURE');
  assertEquals(snap.rules.length, 1);
  assertEquals(snap.source, 'REAL_GRAPH_PATH');
  assert(snap.graph_state === 'READY_FOR_DECISION' || snap.graph_state === 'NEED_MORE_EVIDENCE');
});

Deno.test('snapshot merges same hypothesis from both engines', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't2',
    observations: ['POOR_EMERGENCE'],
    engineA: {
      candidates: [{ rule_id: 'RICE_GERMINATION_FAILURE', total_score: 0.6, candidate_rule_ids: ['R1'] }],
    },
    engineB: {
      candidates: [{ hypothesis_id: 'RICE_GERMINATION_FAILURE', confidence: 0.8, positive_matches: ['POOR_EMERGENCE'], candidate_rule_ids: ['R2'] }],
    },
  });
  assertEquals(snap.hypotheses.length, 1);
  assertEquals(snap.hypotheses[0].source, 'BOTH');
  assertEquals(snap.hypotheses[0].confidence, 0.8); // max wins
  assertEquals([...snap.rules].sort(), ['R1', 'R2']);
});

Deno.test('empty engines yield NO_HYPOTHESIS state', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't3',
    observations: [],
    engineA: null,
    engineB: null,
  });
  assertEquals(snap.hypotheses.length, 0);
  assertEquals(snap.graph_state, 'NO_HYPOTHESIS');
});

Deno.test('assertSnapshotNotCorrupt throws GRAPH_STATE_CORRUPTION_ERROR when projection drops hypotheses', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't4',
    observations: ['POOR_EMERGENCE'],
    engineA: { candidates: [{ rule_id: 'H1', total_score: 0.7 }] },
    engineB: null,
  });
  assertThrows(
    () => assertSnapshotNotCorrupt(snap, 0, 't4'),
    Error,
    'GRAPH_STATE_CORRUPTION_ERROR',
  );
});

Deno.test('assertSnapshotNotCorrupt passes when projection matches snapshot', () => {
  const snap = buildGraphRuntimeSnapshot({
    trace_id: 't5',
    observations: [],
    engineA: { candidates: [{ rule_id: 'H1', total_score: 0.7 }] },
    engineB: null,
  });
  assertSnapshotNotCorrupt(snap, 1, 't5'); // must not throw
});
