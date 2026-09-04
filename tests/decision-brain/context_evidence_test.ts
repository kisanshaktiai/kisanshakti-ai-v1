// Reproduces live trace_mtn1l8je_iv4uhe: a CONTEXT_BLOCK matched by stage/DAS was never selected
// as primary because evidence was scored on observation overlap (0/1).
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const lre = await import(`${BASE}/agents/layered-rule-evaluator.ts`);
const RC = lre.RuleCategory;
function rule(row: any) {
  return { id: row.rule_id, condition_code: row.condition_code, category: RC.DIAGNOSIS, priority: row.priority,
    when: { custom: () => true }, then: { possible_cause: row.cause, cause_confidence: 0.86, action_type: row.action_type,
    action_details: { rule_id: row.rule_id, condition_code: row.condition_code, action_type: row.action_type, action_text: row.action_text,
      reason_text: row.reason_text, data_authority_rank: 92, active_ingredient: row.active_ingredient ?? null, dosage_per_acre: row.dosage ?? null,
      conditions_json: { observations: row.observations }, trigger_class: row.trigger_class ?? null, rule_intent: row.rule_intent ?? null,
      crop_age_days_min: row.mn ?? null, crop_age_days_max: row.mx ?? null } }, active: true };
}
// live decision_rules row
const LATE_N = rule({ rule_id: 'RICE_NUTR_LATE_N_BLOCK_001', priority: 9, action_type: 'block', rule_intent: 'block', trigger_class: 'CONTEXT_BLOCK',
  condition_code: 'n_deficiency_rice', observations: ['management_planning'], mn: 75, mx: 130,
  action_text: 'No nitrogen after booting', reason_text: 'late N delays maturity', cause: 'late nitrogen' });
const state = (das: number, confirmed: string[] = []) => ({ crop_type: 'rice', crop: 'rice', crop_code: 'rice', crop_stage: 'booting', growth_stage: 'booting',
  days_since_sowing: das, ndvi_value: 0.726, data_confidence: 'LOW', data_sources: { ndvi_data: true, soil_test: false, image_analysis: false, weather_data: true },
  confirmed_observations: confirmed, visual_symptoms: confirmed, known_observations: confirmed, user_query: 'आता कोणते खत द्यावे' } as any);
const run = (rules: any[], st: any) => lre.evaluateRulesLayered(rules, st, { traceId: 'ctx', prescriptionGateOverride: true });

Deno.test('CE1 live turn: zero symptoms, DAS 88 → CONTEXT_BLOCK becomes primary (was NULL)', () => {
  const r = run([LATE_N], state(88));
  assertEquals(r.primary_decision?.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');
  assertEquals(r.primary_decision?.action_type, 'block');
});
Deno.test('CE2 DAS outside the authored window → no context evidence → primary stays NULL', () => {
  const r = run([LATE_N], state(60));
  assertEquals(r.primary_decision, null);
});
Deno.test('CE3 an observation-driven rule is unaffected (no trigger_class → observation scoring)', () => {
  const K = rule({ rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'recommend', condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'],
    action_text: 'Apply MOP 25 kg/acre', reason_text: 'K deficiency', cause: 'Potassium deficiency', active_ingredient: 'MOP', dosage: '25 kg/acre' });
  const none = run([K], state(88));                       // no confirmed → 0/1 → gated
  assertEquals(none.primary_decision, null);
  const conf = run([K], state(88, ['k_deficiency_rice'])); // confirmed → primary
  assertEquals(conf.primary_decision?.rule_id, 'RICE_NUTR_K_DEFICIT_001');
});
Deno.test('CE4 confirmed symptom rule and context block together: symptom rule leads (context does not outrank evidence)', () => {
  const K = rule({ rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'recommend', condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'],
    action_text: 'Apply MOP 25 kg/acre', reason_text: 'K deficiency', cause: 'Potassium deficiency', active_ingredient: 'MOP', dosage: '25 kg/acre' });
  const r = run([LATE_N, K], state(88, ['k_deficiency_rice']));
  assert(r.primary_decision != null);
  assert(r.rules_applied.includes('RICE_NUTR_LATE_N_BLOCK_001') && r.rules_applied.includes('RICE_NUTR_K_DEFICIT_001'));
});

// ── CE5–CE7 (2026-09-04, live trace_mtn7mf2w_wyixre): the block is category 'nutrition'
// → RuleCategory.PRESCRIPTION. Zero symptoms + LOW confidence → prescription gate BLOCKED.
const asPrescription = (r: any) => ({ ...r, category: RC.PRESCRIPTION });
const LATE_N_RX = asPrescription(LATE_N);

Deno.test('CE5 PRESCRIPTION-category context block, gate BLOCKED (0 symptoms, LOW confidence) → still primary', () => {
  const r = lre.evaluateRulesLayered([LATE_N_RX], state(88), { traceId: 'ce5' }); // NO override → gate blocks
  assertEquals(r.prescription_allowed, false);
  assertEquals(r.primary_decision?.rule_id, 'RICE_NUTR_LATE_N_BLOCK_001');
  assertEquals(r.primary_decision?.action_type, 'block');
});
Deno.test('CE6 gate BLOCKED still silences an observation-driven PRESCRIPTION (no bypass for non-context rows)', () => {
  const K_RX = asPrescription(rule({ rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'recommend', condition_code: 'k_deficiency_rice',
    observations: ['k_deficiency_rice'], action_text: 'Apply MOP 25 kg/acre', reason_text: 'K deficiency', cause: 'Potassium deficiency',
    active_ingredient: 'MOP', dosage: '25 kg/acre' }));
  const r = lre.evaluateRulesLayered([K_RX], state(88), { traceId: 'ce6' });
  assertEquals(r.prescription_allowed, false);
  assertEquals(r.rules_matched, 0);
  assertEquals(r.primary_decision, null);
});
Deno.test('CE7 PRESCRIPTION-category context block outside its DAS window is not promoted', () => {
  const r = lre.evaluateRulesLayered([LATE_N_RX], state(60), { traceId: 'ce7' });
  assertEquals(r.primary_decision, null);
});
