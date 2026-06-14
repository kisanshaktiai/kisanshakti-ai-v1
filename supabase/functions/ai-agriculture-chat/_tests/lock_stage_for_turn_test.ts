// Regression test for the W1 Task 2 refactor of `lockStageForTurn`.
//
// History: the function was refactored to accept `scope: RequestScope` as its
// first parameter, but `orchestrator.ts:1265` was not updated and continued to
// pass the old 4-arg signature. The result was `growthStage = <number>`, a
// silent TypeError in `.toUpperCase()`, swallowed by the orchestrator's
// try/catch, and farmers received a generic template instead of a real
// symbolic-brain answer. These tests pin the contract.

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createRequestScope, InvariantViolation } from '../runtime/request-scope.ts';
import { lockStageForTurn } from '../agents/clarification-strategy.ts';

function makeScope() {
  return createRequestScope({
    tenantId: 'tenant-A',
    farmerId: 'farmer-A',
    sessionId: 'session-A',
    turnId: 'turn-A',
    // No db client passed → createRequestScope will try to read env. Provide
    // a stub via the `db` field so the test stays hermetic.
    // deno-lint-ignore no-explicit-any
    db: {} as any,
  });
}

Deno.test('lockStageForTurn stores normalised stage on scope.turnCache.engineState', () => {
  const scope = makeScope();
  const ctx = lockStageForTurn(scope, 'rice', 'germination', 5, 'CROP_SCHEDULE');
  assertEquals(ctx.crop_code, 'RICE');
  assertEquals(ctx.growth_stage, 'GERMINATION');
  assertEquals(ctx.days_since_sowing, 5);

  const stored = scope.turnCache.engineState.get('clarification:stage_lock') as
    | { crop_code: string; growth_stage: string }
    | undefined;
  assertEquals(stored?.crop_code, 'RICE');
  assertEquals(stored?.growth_stage, 'GERMINATION');
});

Deno.test('lockStageForTurn throws InvariantViolation when growthStage is a number (the prod failure mode)', () => {
  const scope = makeScope();
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => lockStageForTurn(scope, 'RICE', 5 as any, 0, 'CROP_SCHEDULE'),
    InvariantViolation,
    'lockStageForTurn_invalid_args',
  );
});

Deno.test('lockStageForTurn throws InvariantViolation when cropCode is not a string', () => {
  const scope = makeScope();
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => lockStageForTurn(scope, undefined as any, 'GERMINATION', 0, 'CROP_SCHEDULE'),
    InvariantViolation,
    'lockStageForTurn_invalid_args',
  );
});
