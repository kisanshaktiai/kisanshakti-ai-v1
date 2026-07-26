/**
 * ─────────────────────────────────────────────────────────────────────────
 * Phase A regression — EvidenceRoundSnapshot freeze + observation-loop gate.
 *
 * These tests pin the two invariants that stop the "observation → observation"
 * loop in `agents/orchestrator.ts`:
 *
 *   1. `graph.freezeEvidenceRound(...)` is freeze-once per request and
 *      rejects a second freeze (mirrors canonical_context / intent_node).
 *   2. The published gate expression
 *          !!graph.evidence_round?.round_completed &&
 *          graph.evidence_round.round_index >= graph.evidence_round.max_rounds
 *      evaluates true exactly when the DB round budget is exhausted, so the
 *      two `CLARIFICATION_QUESTION` sites at orchestrator.ts:~2500 fall
 *      through to the hypothesis/decision path.
 *
 * Deno test — crop/stage/intent agnostic on purpose.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  GraphRuntimeState,
  GraphStateDriftError,
  SymbolicIdLeakError,
} from '../../../../supabase/functions/ai-agriculture-chat/runtime/graph-runtime-state.ts';

Deno.test('EvidenceRoundSnapshot: freeze-once — second freeze throws GraphStateDriftError', () => {
  const g = new GraphRuntimeState('trace_freeze_once');
  g.freezeEvidenceRound({
    crop_code: 'RICE',
    growth_stage: 'VEGETATIVE',
    days_since_sowing: 45,
    selected_observations: ['LEAF_YELLOWING'],
    intent_code: 'CLARIFICATION_REPLY',
    round_index: 1,
    max_rounds: 1,
  });
  assertThrows(
    () =>
      g.freezeEvidenceRound({
        crop_code: 'RICE',
        growth_stage: 'VEGETATIVE',
        days_since_sowing: 45,
        selected_observations: ['LEAF_YELLOWING'],
        intent_code: 'CLARIFICATION_REPLY',
        round_index: 2,
        max_rounds: 1,
      }),
    GraphStateDriftError,
    'EVIDENCE_ROUND_FREEZE',
  );
});

Deno.test('EvidenceRoundSnapshot: rejects non-canonical observation codes (SYMBOLIC_ID_LEAK)', () => {
  const g = new GraphRuntimeState('trace_leak');
  assertThrows(
    () =>
      g.freezeEvidenceRound({
        crop_code: 'COTTON',
        growth_stage: 'FLOWERING',
        days_since_sowing: 90,
        selected_observations: ['leaf yellowing'], // presentation label, not canonical
        intent_code: 'CLARIFICATION_REPLY',
        round_index: 1,
        max_rounds: 1,
      }),
    SymbolicIdLeakError,
    'evidence_round.selected_observations',
  );
});

Deno.test('EvidenceRoundSnapshot: round_completed=true and index/max defaults clamp to >=1', () => {
  const g = new GraphRuntimeState('trace_clamp');
  g.freezeEvidenceRound({
    crop_code: null,
    growth_stage: null,
    days_since_sowing: null,
    selected_observations: [],
    intent_code: null,
    round_index: 0,      // clamp → 1
    max_rounds: 0,       // clamp → 1
  });
  const snap = g.evidence_round!;
  assertEquals(snap.round_completed, true);
  assertEquals(snap.round_index, 1);
  assertEquals(snap.max_rounds, 1);
  assertEquals(snap.selected_observations.length, 0);
});

Deno.test('OBS_LOOP_GATE: exhausted when round_index === max_rounds', () => {
  const g = new GraphRuntimeState('trace_gate_exhausted');
  g.freezeEvidenceRound({
    crop_code: 'SUGARCANE',
    growth_stage: 'GERMINATION',
    days_since_sowing: 15,
    selected_observations: ['NO_GERMINATION'],
    intent_code: 'DIAGNOSE_CROP_DAMAGE',
    round_index: 1,
    max_rounds: 1,
  });
  const exhausted =
    !!g.evidence_round?.round_completed &&
    g.evidence_round.round_index >= g.evidence_round.max_rounds;
  assertEquals(exhausted, true, 'gate must block re-ask when budget is used up');
});

Deno.test('OBS_LOOP_GATE: NOT exhausted when max_rounds allows another round', () => {
  const g = new GraphRuntimeState('trace_gate_open');
  g.freezeEvidenceRound({
    crop_code: 'TOMATO',
    growth_stage: 'FRUITING',
    days_since_sowing: 60,
    selected_observations: ['FRUIT_DROP'],
    intent_code: 'DIAGNOSE_CROP_DAMAGE',
    round_index: 1,
    max_rounds: 2,
  });
  const exhausted =
    !!g.evidence_round?.round_completed &&
    g.evidence_round.round_index >= g.evidence_round.max_rounds;
  assertEquals(exhausted, false, 'gate must allow a second observation round when DB permits');
});

Deno.test('OBS_LOOP_GATE: NOT exhausted before any freeze (evidence_round is null)', () => {
  const g = new GraphRuntimeState('trace_gate_prefreeze');
  const exhausted =
    !!g.evidence_round?.round_completed &&
    (g.evidence_round?.round_index ?? 0) >= (g.evidence_round?.max_rounds ?? 0);
  assertEquals(exhausted, false, 'without freeze the gate is inert (first-turn ask is allowed)');
});

Deno.test('EvidenceRoundSnapshot: appears in snapshot() for trace persistence', () => {
  const g = new GraphRuntimeState('trace_snapshot');
  g.freezeEvidenceRound({
    crop_code: 'WHEAT',
    growth_stage: 'BOOTING',
    days_since_sowing: 75,
    selected_observations: ['LEAF_RUST', 'YELLOWING_TIPS'],
    intent_code: 'DIAGNOSE_CROP_DAMAGE',
    round_index: 1,
    max_rounds: 1,
  });
  const snap = g.snapshot() as any;
  assertEquals(snap.evidence_round.crop_code, 'WHEAT');
  assertEquals(snap.evidence_round.round_completed, true);
  assertEquals(snap.evidence_round.selected_observations.length, 2);
});
