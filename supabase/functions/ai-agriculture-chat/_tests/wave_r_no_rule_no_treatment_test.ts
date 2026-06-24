/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WAVE-R REGRESSION — "No rule fired ⇒ no treatment" (universal contract)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These tests exercise the symbolic-invariant gate in isolation. They DO NOT
 * require network or Supabase credentials — the safety-metrics insert path is
 * fail-soft (logs a warning and continues when no SUPABASE_URL is present).
 *
 * Run:
 *   deno test supabase/functions/ai-agriculture-chat/_tests/wave_r_no_rule_no_treatment_test.ts --allow-net --allow-env
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enforceNoRuleNoTreatment } from '../decision/symbolic-invariant-gate.ts';
import { firedRuleIds, rulesActuallyFired, isRuleFired } from '../runtime/rules-fired.ts';

const TRACE = 'wave-r-test';
const CTX = { trace_id: TRACE, crop_code: 'rice', language: 'mr' };

Deno.test('rules_fired SSOT: matched_responses do NOT inflate count', () => {
  const dec = {
    rules_applied: [],
    matched_responses: [{ rule_id: 'RICE_GERMINATION_RESOW_DECISION_001' }],
    candidate_rules: [{ rule_id: 'X' }],
  };
  assertEquals(rulesActuallyFired(dec), 0);
  assertEquals(firedRuleIds(dec).length, 0);
  assertEquals(isRuleFired(dec, 'RICE_GERMINATION_RESOW_DECISION_001'), false);
});

Deno.test('rules_fired SSOT: accepts string and {rule_id} entries', () => {
  assertEquals(rulesActuallyFired({ rules_applied: ['A', { rule_id: 'B' }, null] }), 2);
  assertEquals(firedRuleIds({ rules_applied: ['A', { rule_id: 'B' }, null] }), ['A', 'B']);
});

Deno.test('rice germination: 0 fired + matched candidate → SCRUB_NO_RULES', async () => {
  const dec: any = {
    primary_decision: {
      rule_id: 'RICE_GERMINATION_RESOW_DECISION_001',
      application_details: { action_text: 'Carbendazim seed treatment' },
    },
    matched_responses: [
      { rule_id: 'RICE_GERMINATION_RESOW_DECISION_001', action_text: 'Resow' },
    ],
    rules_applied: [],
  };
  const res = await enforceNoRuleNoTreatment(dec, CTX);
  assertEquals(res.gate_action, 'SCRUB_NO_RULES');
  assertEquals(res.reason, 'NO_RULES_FIRED_HARD_GATE');
  // Farmer surface scrubbed
  assertEquals(dec.primary_decision, null);
  assertEquals(dec.response_payload.primary_decision, null);
  assertEquals(dec.response_payload.matched_responses, []);
  assertEquals(dec.response_mode, 'OBSERVATION');
  // Forensic preservation
  assert(dec.internal_candidates, 'internal_candidates must exist');
  assertEquals(dec.internal_candidates.matched_responses.length, 1);
  assert(dec.internal_candidates.primary_decision_candidate);
});

Deno.test('rules fired + identity match → PASS preserves primary', async () => {
  const dec: any = {
    primary_decision: { rule_id: 'RULE_A', application_details: { action_text: 'spray X' } },
    matched_responses: [{ rule_id: 'RULE_A' }, { rule_id: 'RULE_GHOST' }],
    secondary_recommendations: [{ rule_id: 'RULE_A' }, { rule_id: 'RULE_GHOST' }],
    rules_applied: ['RULE_A'],
  };
  const res = await enforceNoRuleNoTreatment(dec, CTX);
  assertEquals(res.gate_action, 'PASS');
  assertEquals(res.rules_fired_count, 1);
  assertEquals(dec.response_payload.primary_decision.rule_id, 'RULE_A');
  // Ghost dropped from farmer surface, preserved internally
  assertEquals(dec.response_payload.matched_responses.length, 1);
  assertEquals(dec.response_payload.secondary_recommendations.length, 1);
  assert(dec.internal_candidates.matched_responses_dropped.length === 1);
  assert(dec.internal_candidates.secondary_dropped.length === 1);
});

Deno.test('identity mismatch: emitted rule_id NOT in fired → SCRUB_IDENTITY_MISMATCH', async () => {
  const dec: any = {
    primary_decision: { rule_id: 'RULE_B', application_details: { action_text: 'spray Y' } },
    matched_responses: [{ rule_id: 'RULE_B' }],
    rules_applied: [{ rule_id: 'RULE_A' }],
  };
  const res = await enforceNoRuleNoTreatment(dec, CTX);
  assertEquals(res.gate_action, 'SCRUB_IDENTITY_MISMATCH');
  assertEquals(res.reason, 'RULE_EMISSION_MISMATCH_HARD_GATE');
  assertEquals(dec.primary_decision, null);
  assertEquals(dec.response_payload.primary_decision, null);
  // Forensic
  assertEquals(dec.internal_candidates.primary_decision_mismatch.rule_id, 'RULE_B');
});

Deno.test('observation_rule_hit alone does NOT count as rules_fired', async () => {
  const dec: any = {
    primary_decision: null,
    matched_responses: [],
    rules_applied: [],
  };
  const res = await enforceNoRuleNoTreatment(dec, {
    ...CTX,
    observation_rule_hit: {
      rule_id: 'RICE_GERMINATION_RESOW_DECISION_001',
      text: 'Resow advisory',
      source: 'rule_action_text_advisory',
      requires_rules_fired: true,
    },
  });
  assertEquals(res.gate_action, 'SCRUB_NO_RULES');
  // Hit preserved internally only
  assertEquals(
    dec.internal_candidates.observation_rule_hit.rule_id,
    'RICE_GERMINATION_RESOW_DECISION_001',
  );
  assertEquals(dec.response_payload.matched_responses, []);
});

Deno.test('cotton pest unknown: 0 rules fired ⇒ no treatment text at any surface', async () => {
  const dec: any = {
    primary_decision: {
      rule_id: 'COTTON_PINK_BOLLWORM_002',
      application_details: {
        action_text: 'Apply emamectin benzoate 5% SG @ 200g/acre',
        reason_text: 'High infestation',
      },
    },
    matched_responses: [{ rule_id: 'COTTON_PINK_BOLLWORM_002' }],
    rules_applied: [],
  };
  const res = await enforceNoRuleNoTreatment(dec, { ...CTX, crop_code: 'cotton' });
  assertEquals(res.gate_action, 'SCRUB_NO_RULES');
  // Defence-in-depth: legacy top-level fields are nulled too
  assertEquals(dec.primary_decision, null);
  assertEquals(dec.matched_responses, []);
  assertEquals(dec.actions_returned, []);
});

Deno.test('non-object decision_output is a safe no-op (fail-soft)', async () => {
  const res = await enforceNoRuleNoTreatment(null, CTX);
  assertEquals(res.gate_action, 'PASS');
  assertEquals(res.rules_fired_count, 0);
});

Deno.test('secondary recommendations filtered to fired set only', async () => {
  const dec: any = {
    primary_decision: { rule_id: 'A' },
    secondary_recommendations: [
      { rule_id: 'A' },
      { rule_id: 'B' },
      { rule_id: 'C' },
    ],
    matched_responses: [],
    rules_applied: ['A'],
  };
  const res = await enforceNoRuleNoTreatment(dec, CTX);
  assertEquals(res.gate_action, 'PASS');
  assertEquals(dec.response_payload.secondary_recommendations.length, 1);
  assertEquals(
    (dec.response_payload.secondary_recommendations[0] as any).rule_id,
    'A',
  );
  assertEquals(dec.internal_candidates.secondary_dropped.length, 2);
});
