/**
 * Regression test — DiagnosticDecisionAuthority SSOT invariants.
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/ai-agriculture-chat/_tests/diagnostic_authority_ssot_test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

import {
  decideAuthority,
  enforceAuthorityOnPayload,
  TREATMENT_CERTAINTY_THRESHOLD,
  type AuthoritySignals,
} from '../decision/authority/diagnostic-decision-authority.ts';
import { rankQuestionsByInformationGain } from '../decision/authority/information-gain-engine.ts';

function baseSignals(overrides: Partial<AuthoritySignals> = {}): AuthoritySignals {
  return {
    trace_id: 't-test',
    has_symptoms: true,
    has_photo: false,
    visual_confirmation_required: false,
    confirmed_observations: [],
    required_observations_missing: [],
    hypotheses: [],
    contradictions_count: 0,
    observation_confidence: 0,
    visual_confidence: 0,
    rule_confidence: 0,
    rules_fired_count: 0,
    upstream_clarification_required: false,
    upstream_has_recommendations: false,
    ...overrides,
  };
}

Deno.test('marathi germination intent → CLARIFICATION when no evidence', () => {
  // Simulates "भात अजून उगवले नाही" reaching the authority with no confirmed obs
  // and multiple candidate hypotheses (seed rot, waterlogging, deep sowing, etc.)
  const verdict = decideAuthority(baseSignals({
    confirmed_observations: [],
    required_observations_missing: ['SEED_ROT', 'WATERLOGGING', 'DEEP_SOWING', 'SOIL_CRUST'],
    hypotheses: [
      { id: 'SEED_ROT', confidence: 0.35 },
      { id: 'WATERLOGGING', confidence: 0.30 },
      { id: 'DEEP_SOWING', confidence: 0.20 },
      { id: 'POOR_SEED', confidence: 0.15 },
    ],
    rule_confidence: 0,
    rules_fired_count: 0,
  }));

  assertEquals(verdict.response_mode, 'CLARIFICATION');
  assertEquals(verdict.clarification_required, true);
  assertEquals(verdict.recommendation_allowed, false);
  assert(verdict.diagnostic_certainty < TREATMENT_CERTAINTY_THRESHOLD);
  assert(verdict.certainty_breakdown.competing_hypotheses >= 2);
});

Deno.test('rules_fired_count > 0 does NOT alone unlock TREATMENT', () => {
  const verdict = decideAuthority(baseSignals({
    confirmed_observations: ['SEED_ROT'],
    required_observations_missing: ['DEEP_SOWING'],
    hypotheses: [
      { id: 'SEED_ROT', confidence: 0.55 },
      { id: 'DEEP_SOWING', confidence: 0.45 },
    ],
    rule_confidence: 0.8,
    rules_fired_count: 3, // ← "rules matched" is NOT proof
  }));

  // 2 competing hypotheses ⇒ must remain CLARIFICATION
  assertEquals(verdict.response_mode, 'CLARIFICATION');
  assertEquals(verdict.recommendation_allowed, false);
});

Deno.test('confirmed single hypothesis with rules → TREATMENT', () => {
  const verdict = decideAuthority(baseSignals({
    confirmed_observations: ['SEED_ROT', 'WATERLOGGING_PRESENT', 'SEED_DEPTH_OK'],
    required_observations_missing: [],
    hypotheses: [
      { id: 'SEED_ROT', confidence: 0.92 },
      { id: 'DEEP_SOWING', confidence: 0.05 },
    ],
    observation_confidence: 0.9,
    rule_confidence: 0.85,
    rules_fired_count: 2,
  }));

  assertEquals(verdict.response_mode, 'TREATMENT');
  assertEquals(verdict.recommendation_allowed, true);
  assert(verdict.diagnostic_certainty >= TREATMENT_CERTAINTY_THRESHOLD);
});

Deno.test('enforceAuthorityOnPayload strips recommendations when CLARIFICATION', () => {
  const verdict = decideAuthority(baseSignals({
    hypotheses: [
      { id: 'A', confidence: 0.4 },
      { id: 'B', confidence: 0.4 },
    ],
    required_observations_missing: ['X'],
  }));

  const payload: Record<string, any> = {
    response_mode: 'TREATMENT',
    clarification_required: false,
    actions: [{ type: 'primary', product: 'foo' }],
    primary_decision: { rule_id: 'r1' },
    matched_responses: [{ rule_id: 'r1' }],
    metadata: {},
  };
  const r = enforceAuthorityOnPayload(payload, verdict);

  assertEquals(payload.response_mode, 'CLARIFICATION');
  assertEquals(payload.clarification_required, true);
  assert(r.stripped.includes('actions'));
  assertEquals(payload.actions.length, 0);
  assertEquals(payload.primary_decision, null);
});

Deno.test('information gain engine prefers discriminating questions', () => {
  const hyps = [
    { id: 'SEED_ROT', prior: 0.4, requires_obs: ['SEED_DARK_SOFT'] },
    { id: 'WATERLOGGING', prior: 0.3, requires_obs: ['WATER_STANDING'] },
    { id: 'DEEP_SOWING', prior: 0.3, requires_obs: ['SEED_DEPTH_GT_5CM'] },
  ];
  const ranked = rankQuestionsByInformationGain(hyps, [
    { observation_key: 'SEED_DARK_SOFT' },
    { observation_key: 'WATER_STANDING' },
    { observation_key: 'IRRELEVANT_OBS' },
  ], 3);

  // IRRELEVANT_OBS must NOT appear (it doesn't discriminate)
  assert(ranked.every(r => r.observation_key !== 'IRRELEVANT_OBS'));
  assert(ranked.length >= 2);
  assert(ranked[0].information_gain > 0);
});
