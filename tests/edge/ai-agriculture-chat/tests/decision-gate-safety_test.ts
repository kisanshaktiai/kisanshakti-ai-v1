// CHANGE LOG (newest first)
// 2026-10-27 17:56 UTC — Guard emergency/denial authority and navigator exhaustion in pure-function regressions.
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { navigate } from '../../../../supabase/functions/ai-agriculture-chat/runtime/decision-graph-navigator.ts';
import {
  applySuppressionGuard, evaluateUnifiedGate,
} from '../../../../supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts';

Deno.test('navigator exhaustion is not proof of a missing required predicate', () => {
  const result = navigate({
    hypotheses: [{
      id: 'H_TEST', prior: 0.5, posterior: 0.9,
      requires: ['evidence_needed'], blocks: [],
    }],
    confirmed: new Set(), denied: new Set(),
    context: { crop_code: 'crop_test', growth_stage: 'stage_test' },
    allowedEvidenceKeys: new Set(['evidence_needed']),
    thresholds: { stage_margin: 0.15, max_clarification_rounds: 1 },
    turn: 2,
  });
  assertEquals(result.decision, 'INSUFFICIENT_EVIDENCE');
  assertEquals(result.stopping.predicatesSatisfied, false);
});

Deno.test('suppression logging cannot overturn a denied treatment', () => {
  const denied = {
    treatments_allowed: false, gate_status: 'FAIL', response_mode: 'INFORMATION',
    authority_decision: { authority: 'CROP', treatments_allowed: false },
  } as any;
  const result = applySuppressionGuard(denied, {
    rules_fired: ['R1'],
    actions_returned: [{ action_type: 'apply_treatment', product_name: 'TEST' }],
    matched_responses: ['R1'],
  });
  assertEquals(result.treatments_allowed, false);
  assertEquals(result.gate_status, 'FAIL');
});

Deno.test('urgent indicator does not skip authority checks', () => {
  const result = evaluateUnifiedGate({
    has_emergency_indicators: true,
    authority_decision: {
      authority: 'NONE', authority_status: 'UNCONFIRMED',
      treatments_allowed: false, reason: 'unresolved',
    },
    symbolic_decision: null,
  } as any);
  assertEquals(result.treatments_allowed, false);
});
