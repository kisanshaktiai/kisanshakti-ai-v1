// 2026-09-05 — reproduces both live failures of this date.
import { assertEquals, assert } from './assert.ts';
const BASE = Deno.env.get('BRAIN_SRC') ?? '../../supabase/functions/ai-agriculture-chat';
const lre = await import(`${BASE}/agents/layered-rule-evaluator.ts`);
const ftf = await import(`${BASE}/utils/farmer-text-filter.ts`);
const RC = lre.RuleCategory;
function rule(row: any, cat = RC.DIAGNOSIS) {
  return { id: row.rule_id, condition_code: row.condition_code, category: cat, priority: row.priority,
    when: { custom: () => true }, then: { possible_cause: row.cause, cause_confidence: 0.8, action_type: row.action_type,
    action_details: { rule_id: row.rule_id, condition_code: row.condition_code, action_type: row.action_type, action_text: row.action_text,
      reason_text: row.reason_text ?? '', data_authority_rank: 92, active_ingredient: row.active_ingredient ?? null, dosage_per_acre: row.dosage ?? null,
      conditions_json: { observations: row.observations }, trigger_class: row.trigger_class ?? null, rule_intent: row.rule_intent ?? null,
      crop_age_days_min: row.mn ?? null, crop_age_days_max: row.mx ?? null } }, active: true };
}
// live decision_rules row (verbatim action_text prefix)
const DIAG = rule({ rule_id: 'RICE_DIAG_YELLOW_LEAVES_001', priority: 9, action_type: 'recommend', condition_code: 'stage_general',
  observations: ['n_deficiency_rice','fe_deficiency_rice','k_deficiency_rice','diagnostic_uncertainty'], cause: 'Yellow leaves - differential diagnosis',
  action_text: 'YELLOW LEAVES DIFFERENTIAL: Ask: (1) Where on plant? OLDER LEAVES first yellow = N deficiency or K. YOUNGER LEAVES first = Zn (Khaira), Fe, S.' });
const KDEF = rule({ rule_id: 'RICE_NUTR_K_DEFICIT_001', priority: 7, action_type: 'recommend', condition_code: 'k_deficiency_rice', observations: ['k_deficiency_rice'],
  cause: 'Potassium deficiency', action_text: 'Apply MOP 25 kg/acre top-dress', active_ingredient: 'MOP', dosage: '25 kg/acre' });
const st = (confirmed: string[]) => ({ crop_type: 'rice', crop: 'rice', crop_code: 'rice', crop_stage: 'booting', growth_stage: 'booting', days_since_sowing: 89,
  ndvi_value: 0.726, data_confidence: 'LOW', data_sources: { ndvi_data: true, soil_test: false, image_analysis: false, weather_data: true },
  confirmed_observations: confirmed, visual_symptoms: confirmed, known_observations: confirmed, user_query: 'x' } as any);

Deno.test('B1 live trace_mtolayjn_3vtgc8: a DIFFERENTIAL diagnosis rule is the only match → primary NULL, not a hollow card', () => {
  assertEquals(ftf.isDifferentialText(DIAG.then.action_details.action_text), true); // the renderer would blank it
  const r = lre.evaluateRulesLayered([DIAG], st(['zn_deficiency_khaira','s_deficiency_rice']), { traceId: 'b1', prescriptionGateOverride: true });
  assertEquals(r.rules_matched, 1);                 // still matched/applied (feeds hypotheses)
  assertEquals(r.primary_decision, null);           // but never the farmer-facing answer
});
Deno.test('B2 diagnosis rule + renderable K rule: K leads even though DIAG has higher priority', () => {
  const r = lre.evaluateRulesLayered([DIAG, KDEF], st(['k_deficiency_rice']), { traceId: 'b2', prescriptionGateOverride: true });
  assertEquals(r.primary_decision?.rule_id, 'RICE_NUTR_K_DEFICIT_001');
  assert(r.rules_applied.includes('RICE_DIAG_YELLOW_LEAVES_001'));
});
Deno.test('B3 router exemption predicate (orchestrator): DIRECT/0 + context primary → router must not null it', () => {
  // exact expression from agents/orchestrator.ts (2026-09-05)
  const layeredRuleResult: any = { primary_decision: { rule_id: 'RICE_NUTR_LATE_N_BLOCK_001', action_type: 'block' } };
  const self: any = { __directContractNoSymptoms: true, _evidenceFrozen: true };
  const _obsToHyp = 0, _hypIds: string[] = [], requiresAgronomicReasoningIntent = (_: string) => true;
  const laneOwns = self.__directContractNoSymptoms === true && !!layeredRuleResult?.primary_decision?.rule_id;
  const routerFires = !(laneOwns) && self._evidenceFrozen && _obsToHyp === 0 && _hypIds.length === 0 && requiresAgronomicReasoningIntent('FERTILIZER_SCHEDULE');
  assertEquals(laneOwns, true);
  assertEquals(routerFires, false);
  // symptom turn with no context primary: router still fires (observation cards)
  const laneOwns2 = self.__directContractNoSymptoms === true && !!({} as any)?.primary_decision?.rule_id;
  assertEquals(laneOwns2, false);
});
