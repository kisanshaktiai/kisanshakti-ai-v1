## Verified bug (real, not already fixed)

`lockStageForTurn` was refactored in Task 2 to take `scope: RequestScope` as its first parameter, but the **only** call site (`orchestrator.ts:1265`) was never updated. It still passes the old 4-arg signature:

```ts
// agents/clarification-strategy.ts:197-203 (current)
export function lockStageForTurn(
  scope: RequestScope,
  cropCode: string,
  growthStage: string,
  daysSinceSowing: number,
  source: LockedStageContext['source']
): LockedStageContext

// agents/orchestrator.ts:1265-1270 (current — BROKEN)
lockStageForTurn(
  landContext.current_crop,      // → goes into `scope`
  landContext.growth_stage,      // → goes into `cropCode`
  landContext.days_since_sowing, // → goes into `growthStage` (number!)
  stageSource                    // → goes into `daysSinceSowing`
);
// `source` is undefined; then `growthStage.toUpperCase()` is called on a number → TypeError
```

This matches the production symptom. The report's "Option A" diagnosis is right; the suggested defensive rewrite is overkill. None of the three "scope.turnCache.engineState reads back as object" theories apply — there is only one caller and `getLockedStage` is unused outside the module.

## Fix (minimal, surgical)

### 1. `agents/orchestrator.ts:1265` — pass `scope` as first arg

```ts
lockStageForTurn(
  scope,
  landContext.current_crop,
  landContext.growth_stage,
  landContext.days_since_sowing || 0,
  stageSource
);
```

Guard with `if (scope)` since legacy paths may still call `orchestrate` without scope (line 1176: `const scope = options.scope`). If `scope` is absent, skip the lock and emit a console warning — do not throw, since this codepath is reached on every turn.

### 2. `agents/clarification-strategy.ts:197` — add lightweight input validation

Keep the current 5-arg signature (no defensive object/string union). Add a single guard so future signature drift fails loudly instead of silently in `.toUpperCase()`:

```ts
if (typeof cropCode !== 'string' || typeof growthStage !== 'string') {
  throw new InvariantViolation('lockStageForTurn_invalid_args', {
    cropCode_type: typeof cropCode,
    growthStage_type: typeof growthStage,
  });
}
```

This converts the silent template-fallback into a visible error caught by the orchestrator's try/catch + `scope.emit({kind:'error'})`, surfacing it in traces.

### 3. Regression test — `_tests/lock_stage_for_turn_test.ts`

Three Deno tests:
- `lockStageForTurn stores stage on scope.turnCache.engineState` (happy path)
- `lockStageForTurn throws InvariantViolation when cropCode is not a string` (catches the orchestrator bug class)
- `lockStageForTurn throws InvariantViolation when growthStage is a number` (the exact production failure mode)

Skip the report's "golden conversations" suite and curl smoke test — those require a running local server which we can't reliably spin up here. The unit test + the existing `no-forbidden-patterns_test.ts` regression dam are sufficient to prevent recurrence.

### 4. Verify

Run `supabase--test_edge_functions` for `ai-agriculture-chat` — all existing tests + 3 new tests must pass.

## What this plan does NOT do

- Does not add the multi-form `string | StageContextLock` union from the report. The function has one caller; defensive overloading is dead weight and hides real signature mismatches.
- Does not add a golden-conversations harness or curl smoke step (no local server in this environment; would have to be a follow-up if you want it).
- Does not touch `getLockedStage` / `isStageLockedForTurn` / `clearLockedStage` — they're correct.

Reply **go** to execute.