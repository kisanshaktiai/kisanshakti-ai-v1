/**
 * OBSERVATION_STATE_CONTRACT — regression tests (crop-agnostic)
 *
 * CHANGE LOG (newest first):
 *   2026-07-09 09:32 UTC — Added T6 for GraphRuntime final OBS_GATE.
 *   2026-07-09 07:58 UTC — Initial. T1..T5 cover:
 *     T1: 0 confirmed + N inferred → clarification required, no graph run.
 *     T2: farmer confirms one candidate → moves to confirmed, gate opens.
 *     T3: terminal-damage priority boost does NOT bypass observation graph.
 *     T4: hyp=0 ∧ observation_required=false ∧ diagnostic → violation.
 *     T5: INFERRED-only evidence never satisfies the trigger gate.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  buildObservationState,
  evaluateObservationGate,
} from '../runtime/observation-state.ts';
import {
  AuthoredObservationSet,
  ObservationAuthority,
} from '../utils/observation-authority.ts';
import {
  assertObservationRequiredWhenNoHypothesis,
  GraphContractViolation,
} from '../runtime/graph-contracts.ts';
import { shouldTriggerClarificationFirst } from '../agents/clarification-strategy.ts';
import { runGraphRuntime } from '../runtime/graph-runtime.ts';

Deno.test('T1 — 0 confirmed + N inferred → WAITING_FOR_OBSERVATION', () => {
  const set = new AuthoredObservationSet();
  set.addAll(['POOR_EMERGENCE', 'SEED_NOT_GERMINATED', 'GERMINATION_FAILURE'],
             ObservationAuthority.INFERRED, 'ALIAS_EXPANSION');
  const state = buildObservationState({ authored: set, candidate_codes: ['OBS_RICE_NO_EMERGENCE'] });

  assertEquals(state.confirmed_observations.length, 0);
  assertEquals(state.inferred_observations.length, 3);
  assertEquals(state.candidate_observations.length, 1);

  const gate = evaluateObservationGate(true, state);
  assertEquals(gate.proceed, false);
  assertEquals(gate.state, 'WAITING_FOR_OBSERVATION');
  assertEquals(gate.source, 'intent_observation_mapping');
});

Deno.test('T2 — farmer confirms one candidate → gate opens', () => {
  const set = new AuthoredObservationSet();
  set.add('OBS_RICE_SEED_ROTTED', ObservationAuthority.CONFIRMED, 'CLARIFICATION_SELECTION');
  const state = buildObservationState({ authored: set });

  assertEquals(state.confirmed_observations.length, 1);
  const gate = evaluateObservationGate(true, state);
  assertEquals(gate.proceed, true);
  assertEquals(gate.state, 'READY_FOR_GRAPH');
});

Deno.test('T3 — terminal-damage priority boost does not bypass observation gate', () => {
  // Terminal-damage codes must be treated like any other observation: they
  // only enter as evidence when farmer-confirmed / farmer-extracted.
  const setInferred = new AuthoredObservationSet();
  setInferred.add('PLANT_DIED', ObservationAuthority.INFERRED, 'ALIAS_EXPANSION');
  const gateInferred = evaluateObservationGate(true, buildObservationState({ authored: setInferred }));
  assertEquals(gateInferred.proceed, false); // still needs confirmation

  const setExtracted = new AuthoredObservationSet();
  setExtracted.add('PLANT_DIED', ObservationAuthority.EXTRACTED, 'FARMER_TEXT_MATCH');
  const gateExtracted = evaluateObservationGate(true, buildObservationState({ authored: setExtracted }));
  assertEquals(gateExtracted.proceed, true); // farmer's own text is confirmed
});

Deno.test('T4 — hyp=0 ∧ obs_required=false ∧ diagnostic → violation (fail-closed)', () => {
  const res = assertObservationRequiredWhenNoHypothesis({
    diagnosticIntent: true,
    hypothesesCount: 0,
    observationRequired: false,
    graphExecuted: true,
    confirmedCount: 0,
    traceId: 'test-T4',
  }, { throwInDev: false });
  assertEquals(res.ok, false);
  assertEquals(res.forced_observation_required, true);
});

Deno.test('T4b — hyp>0 or obs_required=true → ok', () => {
  const okA = assertObservationRequiredWhenNoHypothesis({
    diagnosticIntent: true, hypothesesCount: 2,
    observationRequired: false, graphExecuted: true, confirmedCount: 1,
  });
  const okB = assertObservationRequiredWhenNoHypothesis({
    diagnosticIntent: true, hypothesesCount: 0,
    observationRequired: true, graphExecuted: true, confirmedCount: 0,
  });
  assertEquals(okA.ok, true);
  assertEquals(okB.ok, true);
});

Deno.test('T5 — ClarificationTrigger: diagnostic + confirmed=0 forces clarify regardless of coverage', () => {
  const r = shouldTriggerClarificationFirst({
    crop_known: true,
    stage_known: true,
    symptom_count: 13,           // legacy inflated count (inferred + confirmed)
    symptom_coverage: 1.0,       // legacy "SUFFICIENT" reading
    is_ambiguous: false,
    has_pending_clarification: false,
    clarification_completed: false,
    confirmed_observation_count: 0,   // OBSERVATION_STATE_CONTRACT
    diagnostic_intent: true,
  });
  assertEquals(r.should_clarify, true);
  assertEquals(r.reason, 'NO_CONFIRMED_OBSERVATIONS');
  assertEquals(r.bypass_allowed, false);
});

Deno.test('T6 — GraphRuntime final gate blocks diagnostic graph with 0 confirmed observations', async () => {
  let graphExecuted = false;
  const res = await runGraphRuntime({
    supabase: {},
    crop_code: 'rice',
    growth_stage: 'germination',
    days_since_sowing: 7,
    known_observations: ['POOR_EMERGENCE', 'OBS_RICE_NO_EMERGENCE'],
    confirmed_observations: [],
    candidate_observations: ['OBS_RICE_NO_EMERGENCE'],
    diagnostic_intent: true,
    user_query: 'rice not emerged',
    intent_code: 'EMERGENCE_FAILURE',
    markExecuted: () => { graphExecuted = true; },
  });

  assertEquals(res.state, 'WAITING_FOR_OBSERVATION');
  assertEquals(res.candidates, 0);
  assertEquals(res.candidate_observations, ['OBS_RICE_NO_EMERGENCE']);
  assertEquals(graphExecuted, false);
});
