// deno test --allow-read --allow-env --allow-net --no-lock --node-modules-dir=none --no-check decision_coherence_test.ts
//
// Reproduces live trace_mtlqnztb_h8x51x (2026-09-03, land 30197c15, rice/booting/DAS 87):
// farmer confirmed [k_deficiency_rice, water_deficit_visible]; winning hypothesis
// HYP_RICE_K_DEFICIT_001; rule engine served RICE_IRRIG_DROUGHT_RESPONSE_001
// (drought hypothesis, priority 8, condition rice_drought_rolled = NOT confirmed)
// over RICE_NUTR_K_DEFICIT_001 (winning hypothesis's only rule, priority 7,
// condition k_deficiency_rice = confirmed).
//
// Rule/hypothesis rows below are copied from the live decision_rules /
// hypothesis_master / hypothesis_conditions / hypothesis_rule_mapping tables.
// Both rules MATCH (as they did live: matched=6); this suite exercises the
// SELECTION path of evaluateRulesLayered, not condition matching.
import { assertEquals, assert } from './assert.ts';
import { makeMockSupabase } from './mock_supabase.ts';

const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const lre = await import(`${BASE}/agents/layered-rule-evaluator.ts`);
const hge = await import(`${BASE}/decision/hypothesis-graph-evaluator.ts`);

const RuleCategory = lre.RuleCategory;

/** Build a Rule in the shape convertBundledToRule() emits, from live decision_rules columns. */
function rule(row: {
  rule_id: string; priority: number; action_type: string; condition_code: string;
  observations: string[]; action_text: string; reason_text: string; data_authority_rank: number;
  confidence_score: number; cause: string; active_ingredient: string; dosage_per_acre: string;
}) {
  return {
    id: row.rule_id,
    condition_code: row.condition_code,
    category: RuleCategory.DIAGNOSIS,
    priority: row.priority,
    when: { custom: () => true }, // both matched live
    then: {
      possible_cause: row.cause,
      cause_confidence: row.confidence_score,
      action_type: row.action_type,
      action_details: {
        rule_id: row.rule_id,
        condition_code: row.condition_code,
        action_type: row.action_type,
        action_text: row.action_text,
        reason_text: row.reason_text,
        data_authority_rank: row.data_authority_rank,
        active_ingredient: row.active_ingredient,
        dosage_per_acre: row.dosage_per_acre,
        conditions_json: { observations: row.observations },
      },
    },
    active: true,
  };
}

// live decision_rules rows (2026-09-03)
const DROUGHT = rule({
  rule_id: 'RICE_IRRIG_DROUGHT_RESPONSE_001', priority: 8, action_type: 'urgent_action',
  condition_code: 'rice_drought_rolled', observations: ['rice_drought_rolled', 'water_deficit_visible'],
  action_text: 'IF leaves rolled + soil dry: IRRIGATE IMMEDIATELY if water available. Otherwise: foliar K2SO4',
  reason_text: '', data_authority_rank: 92, confidence_score: 0.88, cause: 'Drought / water stress',
  active_ingredient: 'Potassium Sulphate (foliar)', dosage_per_acre: '2 kg foliar',
});
const KDEF = rule({
  rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'recommend',
  condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'],
  action_text: 'IF leaf-tip burn observed: Apply MOP 25 kg/acre top-dress with 5cm standing water OR foliar',
  reason_text: 'Leaf-tip and margin scorch on older leaves with weak stems indicates potassium deficiency',
  data_authority_rank: 92, confidence_score: 0.86, cause: 'Potassium deficiency',
  active_ingredient: 'MOP (Muriate of Potash)', dosage_per_acre: '25 kg/acre',
});

const LIVE_STATE = {
  crop_type: 'rice', crop: 'rice', crop_code: 'rice', crop_stage: 'booting', growth_stage: 'booting',
  days_after_sowing_exact: 87, ndvi_value: 0.726, data_confidence: 'LOW',
  // live: has_ndvi=true, has_soil_health=false, no photo, weather_current found
  data_sources: { ndvi_data: true, soil_test: false, image_analysis: false, weather_data: true },
  confirmed_observations: ['k_deficiency_rice', 'water_deficit_visible'],
  visual_symptoms: ['k_deficiency_rice', 'water_deficit_visible'],
  known_observations: ['k_deficiency_rice', 'water_deficit_visible'],
  user_query: 'जुन्या पानांच्या कडा व टोके करपल्यासारखी तपकिरी होतात; झाडे कमकुवत राहतात, पाण्याची कमतरता दिसणे',
};

function evaluate(extra: Record<string, unknown>) {
  return lre.evaluateRulesLayered([DROUGHT, KDEF], { ...LIVE_STATE, ...extra } as any, {
    traceId: 'coherence-test', prescriptionGateOverride: true,
  });
}

// ── C1: the live turn, with the winning hypothesis fed in — K rule must lead
Deno.test('C1 live turn: winning_hyp=HYP_RICE_K_DEFICIT_001 → primary is RICE_NUTR_K_DEFICIT_001, drought demoted', () => {
  const r = evaluate({
    winning_hypothesis_id: 'HYP_RICE_K_DEFICIT_001',
    winning_hypothesis_rule_ids: ['RICE_NUTR_K_DEFICIT_001'], // live hypothesis_rule_mapping
  });
  assertEquals(r.primary_decision?.rule_id, 'RICE_NUTR_K_DEFICIT_001');
  assertEquals(r.rules_matched, 2);
  assert(r.rules_applied.includes('RICE_IRRIG_DROUGHT_RESPONSE_001'), 'drought rule still matched (secondary), not dropped');
  assertEquals(r.safety_blocks.length, 0);
});

// ── C2: authored-trigger key alone (no hypothesis inputs) is sufficient here
Deno.test('C2 P0b alone: confirmed condition_code (k_deficiency_rice) beats unconfirmed (rice_drought_rolled)', () => {
  const r = evaluate({});
  assertEquals(r.primary_decision?.rule_id, 'RICE_NUTR_K_DEFICIT_001');
});

// ── C3: when the drought hypothesis genuinely wins and its trigger is confirmed, it leads
Deno.test('C3 farmer confirms leaf rolling; winning_hyp=DROUGHT → drought rule leads (coherence is not a K bias)', () => {
  const r = evaluate({
    confirmed_observations: ['rice_drought_rolled', 'water_deficit_visible'],
    visual_symptoms: ['rice_drought_rolled', 'water_deficit_visible'],
    winning_hypothesis_id: 'HYP_RICE_DROUGHT_001',
    winning_hypothesis_rule_ids: ['RICE_IRRIG_DROUGHT_RESPONSE_001', 'PROACTIVE_WATER_STRESS_RICE_001'],
  });
  assertEquals(r.primary_decision?.rule_id, 'RICE_IRRIG_DROUGHT_RESPONSE_001');
});

// ── C4: the safety/category override (≥20 gap) still precedes coherence.
Deno.test('C4 category override precedence: ≥20 category gap beats coherence; <20 gap lets coherence decide', () => {
  // HIGHCAT = urgent_action(90), NOT in winning hyp, trigger unconfirmed.
  const HIGHCAT = rule({
    rule_id: 'TEST_URGENT_ROW', priority: 1, action_type: 'urgent_action',
    // shares the confirmed obs so both rules land in the same semantic tier;
    // only then does the ≥20 category comparator decide between them.
    condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'], action_text: 'x', reason_text: '',
    data_authority_rank: 92, confidence_score: 0.5, cause: 'c', active_ingredient: '', dosage_per_acre: '',
  });
  const winInputs = { winning_hypothesis_id: 'HYP_RICE_K_DEFICIT_001',
    winning_hypothesis_rule_ids: ['RICE_NUTR_K_DEFICIT_001'], confirmed_observations: ['k_deficiency_rice'],
    visual_symptoms: ['k_deficiency_rice'], known_observations: ['k_deficiency_rice'] };
  // K is 'recommend'(80): 90-80=10 <20 → coherence decides → K wins.
  const r1 = lre.evaluateRulesLayered([HIGHCAT, KDEF], { ...LIVE_STATE, ...winInputs } as any,
    { traceId: 'c4a', prescriptionGateOverride: true });
  assertEquals(r1.primary_decision?.rule_id, 'RICE_NUTR_K_DEFICIT_001');
  // K rebuilt as cultural_practice(40): 90-40=50 ≥20 → category wins before coherence.
  const KLOW = rule({
    rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'cultural_practice',
    condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'],
    action_text: 'Apply MOP 25 kg/acre', reason_text: 'K deficiency', data_authority_rank: 92,
    confidence_score: 0.86, cause: 'Potassium deficiency', active_ingredient: 'MOP', dosage_per_acre: '25 kg/acre',
  });
  const r2 = lre.evaluateRulesLayered([HIGHCAT, KLOW], { ...LIVE_STATE, ...winInputs } as any,
    { traceId: 'c4b', prescriptionGateOverride: true });
  assertEquals(r2.primary_decision?.rule_id, 'TEST_URGENT_ROW');
});

// ── C5: winning hypothesis owns no eligible candidate → coherence keys inert,
// selection falls through to the normal path with NO suppression (no starvation).
Deno.test('C5 winning hypothesis with zero eligible rules does not suppress or drop any matched rule', () => {
  const withHyp = evaluate({
    winning_hypothesis_id: 'HYP_RICE_SOMETHING_ELSE', winning_hypothesis_rule_ids: ['RULE_NOT_IN_CANDIDATES'],
  });
  const baseline = evaluate({}); // no coherence inputs at all
  assert(withHyp.primary_decision != null, 'primary must not be starved to null');
  assertEquals(withHyp.rules_matched, 2);
  // an inert (unsatisfiable) winning hypothesis must not change the outcome
  assertEquals(withHyp.primary_decision?.rule_id, baseline.primary_decision?.rule_id);
  assertEquals([...withHyp.rules_applied].sort(), [...baseline.rules_applied].sort());
});

// ── S1: biological stage gate honours hypothesis_conditions.is_required
const FX = JSON.parse(await Deno.readTextFile(new URL('./fixture_hypothesis_graph.json', import.meta.url)));
Deno.test('S1 N-deficiency (STAGE is_required=false: tillering|PI) is NOT hard-eliminated at booting; K survives', async () => {
  const { client } = makeMockSupabase(FX);
  const out = await hge.evaluateHypothesisGraph({
    crop_code: 'rice', crop_group: 'rice', growth_stage: 'booting', das: 87,
    observation_codes: ['n_deficiency_rice', 'k_deficiency_rice'],
    supabase: client, trace_id: 'S1', predicted_stage_confidence: 1.0,
  });
  const ids = out.candidates.map((c: any) => c.hypothesis_id);
  assert(ids.includes('HYP_RICE_K_DEFICIT_001'), `K must survive: ${ids}`);
  assert(ids.includes('HYP_RICE_N_DEFICIT_001'), `N must survive at booting (soft stage): ${ids}`);
  const elimN = (out.eliminated ?? []).find((e: any) => e.hypothesis_id === 'HYP_RICE_N_DEFICIT_001');
  assertEquals(elimN, undefined);
  const n = out.candidates.find((c: any) => c.hypothesis_id === 'HYP_RICE_N_DEFICIT_001');
  assert(n.candidate_rule_ids.includes('RICE_NUTR_LATE_N_BLOCK_001'), 'late-N block travels with the N hypothesis at booting');
});

Deno.test('S1b a required STAGE mismatch is still a hard elimination (is_required=true)', async () => {
  const fx = JSON.parse(JSON.stringify(FX));
  for (const c of fx.hypothesis_conditions) if (c.hypothesis_id === 'HYP_RICE_N_DEFICIT_001' && c.condition_type === 'STAGE') c.is_required = true;
  const { client } = makeMockSupabase(fx);
  const out = await hge.evaluateHypothesisGraph({
    crop_code: 'rice', crop_group: 'rice', growth_stage: 'booting', das: 87,
    observation_codes: ['n_deficiency_rice', 'k_deficiency_rice'],
    // 0.95 (not 1.00) → distinct graphMemoKey from S1, still ≥ bio_stage_hard_gate_threshold (0.6)
    // so the hard stage gate is active in both; isolates the is_required flip.
    supabase: client, trace_id: 'S1b', predicted_stage_confidence: 0.95,
  });
  const ids = out.candidates.map((c: any) => c.hypothesis_id);
  assert(!ids.includes('HYP_RICE_N_DEFICIT_001'), 'required stage mismatch must eliminate');
  assert(ids.includes('HYP_RICE_K_DEFICIT_001'));
});
