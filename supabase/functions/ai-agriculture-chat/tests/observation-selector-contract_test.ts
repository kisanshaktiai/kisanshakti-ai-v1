/**
 * OBSERVATION_SELECTOR_CONTRACT — regression tests
 *
 * CHANGE LOG (newest first):
 *   2026-07-09 13:58 UTC — Added response-derived mapped_observation
 *     regressions for empty DECISION_PROVIDED stage fallback.
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ensureObservationSelectorContract } from '../runtime/observation-selector-contract.ts';

function emptyStageFallback(mappedObservation?: string) {
  return {
    type: 'DECISION_PROVIDED',
    decision_output: {
      status: 'STAGE_FALLBACK',
      actions_returned: [],
      metadata: {
        ...(mappedObservation ? { mapped_observation: mappedObservation } : {}),
        rules_matched: 0,
      },
    },
    metadata: {},
  } as any;
}

Deno.test('OBS_SELECTOR · empty DECISION_PROVIDED degrades when mapped_observation exists in response', async () => {
  const response = emptyStageFallback('OBS_RICE_NO_EMERGENCE');

  const result = await ensureObservationSelectorContract(response, {
    supabase: {},
    cropCode: 'Rice',
    growthStage: 'transplanting',
    language: 'mr',
    traceId: 'trace_contract_response_derived_obs',
    daysSinceSowing: 31,
    realObservationCount: 0,
  });

  assertEquals(response.type, 'DIAGNOSTIC_ESCALATION');
  assertEquals(response.metadata.orchestrator_type, 'DIAGNOSTIC_ESCALATION');
  assertEquals(response.metadata.observation_required, false);
  assertEquals(response.metadata.confirmed_observation_count, 1);
  assertEquals(result.reason, 'degraded_to_escalation_no_rules_after_observation');
});

Deno.test('OBS_SELECTOR · empty DECISION_PROVIDED still throws when no confirmed observation exists', async () => {
  const response = emptyStageFallback();

  await assertRejects(
    () => ensureObservationSelectorContract(response, {
      supabase: {},
      cropCode: 'Rice',
      growthStage: 'transplanting',
      language: 'mr',
      traceId: 'trace_contract_true_leak',
      daysSinceSowing: 31,
      realObservationCount: 0,
    }),
    Error,
    'OBSERVATION_CONTRACT_VIOLATION: empty_options type=DECISION_PROVIDED',
  );
});