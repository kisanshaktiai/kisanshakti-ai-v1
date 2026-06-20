/**
 * Regression tests — observation-driven young-crop bypass + rule text lookup.
 *
 * Production symptom (trace_mqe472gj_h1vwoq):
 *   - Farmer: "भात अजून उगवले नाही" → OBS_RICE_NO_EMERGENCE confirmed
 *   - Crop young (DAS=6, GERMINATION) → Unified Gate blocks treatments
 *   - Response collapses to generic monitoring template
 *   - Even though decision_rules has RICE_GERMINATION_DIAGNOSTIC_001 (SAFE, GERMINATION)
 *
 * Fix:
 *   1. unified-decision-gate input grows `confirmed_observation_has_safe_rule`
 *      flag; young-crop branch bypasses when set.
 *   2. New `observation-rule-lookup.ts` finds the rule + localized text.
 *   3. index.ts wires the lookup before gate eval and uses rule text in
 *      the OBSERVATION fallback branch.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  evaluateUnifiedGate,
  type UnifiedGateInput,
} from '../decision/unified-decision-gate.ts';
import {
  GateStatus,
  ResponseMode,
  DecisionAuthority,
  AuthorityStatus,
  GateAction,
} from '../decision/authority-types.ts';
import {
  extractObservationCodes,
  lookupSafeRuleForObservations,
} from '../decision/observation-rule-lookup.ts';

const baseAuthority = {
  authority: DecisionAuthority.CROP,
  authority_status: AuthorityStatus.CONFIRMED,
  treatments_allowed: true,
  reason: 'test',
  gate_action: GateAction.ALLOW_TREATMENT,
} as any;

Deno.test('young-crop bypass: confirmed observation + safe rule → gate PASS, OBSERVATION mode', () => {
  const result = evaluateUnifiedGate({
    authority_decision: baseAuthority,
    symbolic_decision: { decision_brain_source: true } as any,
    crop_name: 'RICE',
    growth_stage: 'GERMINATION',
    days_since_sowing: 6,
    stage_source: 'CONFIRMED',
    symptom_keys: ['OBS_RICE_NO_EMERGENCE'],
    confirmed_observation_has_safe_rule: true,
    confirmed_observation_rule_id: 'RICE_GERMINATION_DIAGNOSTIC_001',
    confirmed_observation_codes: ['OBS_RICE_NO_EMERGENCE'],
  } as UnifiedGateInput);

  assertEquals(result.gate_status, GateStatus.PASS);
  assertEquals(result.response_mode, ResponseMode.OBSERVATION);
  assert(
    result.reason.startsWith('bypass:confirmed_safe_rule_exists'),
    `expected bypass reason, got "${result.reason}"`,
  );
  assertEquals((result as any).confirmed_observation_codes ?? undefined, undefined); // not echoed back
});

Deno.test('young-crop without bypass flag still hits the existing block', () => {
  const result = evaluateUnifiedGate({
    authority_decision: baseAuthority,
    symbolic_decision: { decision_brain_source: true } as any,
    crop_name: 'RICE',
    growth_stage: 'GERMINATION',
    days_since_sowing: 6,
    stage_source: 'CONFIRMED',
    symptom_keys: ['OBS_RICE_NO_EMERGENCE'],
  } as UnifiedGateInput);

  // Without the bypass flag, gate must still protect (any non-PASS status).
  assert(result.gate_status !== GateStatus.PASS, 'gate must not auto-pass without flag');
});

Deno.test('extractObservationCodes filters OBS_* prefixed keys', () => {
  const codes = extractObservationCodes([
    'OBS_RICE_NO_EMERGENCE',
    'SOMETHING_ELSE',
    'OBS_LEAF_YELLOWING',
    null as any,
    '',
  ]);
  assertEquals(codes, ['OBS_RICE_NO_EMERGENCE', 'OBS_LEAF_YELLOWING']);
});

Deno.test('lookupSafeRuleForObservations returns null when no observations', async () => {
  const fakeDb = {
    from() {
      throw new Error('should not query');
    },
  } as any;
  const hit = await lookupSafeRuleForObservations(fakeDb, {
    confirmedObservations: [],
    cropCode: 'RICE',
    growthStage: 'GERMINATION',
  });
  assertEquals(hit, null);
});

Deno.test('lookupSafeRuleForObservations picks lowest-priority SAFE rule and uses MR translation', async () => {
  // Minimal fake supabase client mimicking the chained PostgREST builder used
  // by the lookup. Order of awaited builders:
  //   1. decision_rules .select.in.eq.eq.in  (await → { data, error })
  //   2. decision_rules_translations_archive .select.eq.maybeSingle
  let stage = 0;
  const fakeDb = {
    from(table: string) {
      if (table === 'decision_rules') {
        const builder: any = {
          select() { return builder; },
          in() { return builder; },
          eq() { return builder; },
          then(resolve: any) {
            stage = 1;
            resolve({
              data: [
                {
                  rule_id: 'RICE_GERMINATION_DIAGNOSTIC_001',
                  condition_code: 'OBS_RICE_NO_EMERGENCE',
                  crop_code: 'RICE',
                  growth_stage: 'GERMINATION',
                  action_text: 'Inspect 5 random spots in field...',
                  action_type: 'RECOMMEND',
                  farmer_safety_level: 'SAFE',
                  priority: 1,
                },
                {
                  rule_id: 'RICE_GERMINATION_RESOW_DECISION_001',
                  condition_code: 'OBS_RICE_NO_EMERGENCE',
                  crop_code: 'RICE',
                  growth_stage: 'GERMINATION',
                  action_text: 'URGENT — count emergence in 1 sq.m...',
                  action_type: 'URGENT_ACTION',
                  farmer_safety_level: 'CAUTION',
                  priority: 2,
                },
              ],
              error: null,
            });
          },
        };
        return builder;
      }
      if (table === 'decision_rules_translations_archive') {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          maybeSingle() {
            stage = 2;
            return Promise.resolve({
              data: { response_mr: 'शेतात ५ ठिकाणी तपासणी करा...', response_hi: 'खेत में 5 जगहों पर...' },
              error: null,
            });
          },
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;

  const hit = await lookupSafeRuleForObservations(fakeDb, {
    confirmedObservations: ['OBS_RICE_NO_EMERGENCE'],
    cropCode: 'RICE',
    growthStage: 'GERMINATION',
    language: 'mr',
  });

  assert(hit !== null, 'expected a rule hit');
  assertEquals(hit!.rule_id, 'RICE_GERMINATION_DIAGNOSTIC_001');
  assertEquals(hit!.source, 'rule_action_text');
  assert(hit!.text.includes('५ ठिकाणी'), `expected Marathi text, got "${hit!.text}"`);
  assertEquals(stage, 2);
});
