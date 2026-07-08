## Diagnosis

The failing turn is not a generic Supabase/runtime outage. The trace shows a deterministic path:

```text
farmer says: rice has not emerged
intent: EMERGENCE_FAILURE
crop: RICE
stage: transplanting
matched hypothesis: RICE_GERMINATION_FAILURE
eliminated reason: REQUIRED_STAGE_FAILED(expected germination/nursery/seedling/emergence/establishment, got transplanting)
then orchestrator wraps it as GRAPH_PIPELINE_BYPASSED
then edge function returns 500
```

Do I know what the issue is? Yes.

The root cause is in the graph/orchestrator boundary:

1. `hypothesis-graph-evaluator.ts` hard-eliminates the only matched hypothesis because the DB required stage says germination/emergence, while the authoritative biological state says transplanting.
2. That should be a valid “no surviving hypothesis / ask for clarification or handle stage conflict” graph result, not an exception.
3. `orchestrator.ts` catches the evaluator exception and rethrows it as `GRAPH_PIPELINE_BYPASSED` for diagnostic intents.
4. The deployed edge function is still returning a non-2xx response for that invariant path, causing Supabase JS `FunctionsHttpError` and the blank chat error.
5. Recent PR-4 changes also left stale tests/comments around DAS-to-stage logic and make this regression easy to miss.

## Implementation plan

1. **Fix the graph evaluator contract**
   - Change the “stage filter killed valid diagnosis” path so it does not throw for DB-required `REQUIRED_STAGE_FAILED` / `REQUIRED_DAS_FAILED` eliminations.
   - Return a normal `GraphHypothesisResult` with eliminated candidates and `NO_SURVIVING_HYPOTHESIS` trace.
   - Keep loud logs for audit, but no exception unless there is a true graph corruption case.

2. **Fix orchestrator handling**
   - In the graph evaluator catch block, stop converting known graph no-result/stage-conflict conditions into `GRAPH_PIPELINE_BYPASSED`.
   - Mark the graph as executed once the evaluator has emitted/returned a graph result, even if zero candidates survive.
   - Route zero-survivor diagnostic cases into the existing clarification/observation contract instead of a transport failure.

3. **Keep stage SSOT intact**
   - Do not reintroduce `getStageByDAS` into `context-validator`.
   - Ensure the graph input uses `biological_state.growth_stage` / canonical context first, and only uses persisted land stage as a fallback.
   - Preserve the rule that `transplanting` is post-germination/vegetative, not seedling.

4. **Clean up PR-4 regression tests**
   - Update stale graph tests that still look for a deleted hardcoded rice calendar in `context-validator.ts`.
   - Add/adjust a regression test asserting that the graph evaluator returns a non-throwing empty result when a stage-required hypothesis is eliminated.
   - Add a source-level guard that `context-validator.ts` has no `getStageByDAS` import or call.

5. **Validate locally**
   - Run targeted Deno edge-function tests for `ai-agriculture-chat`.
   - Run the relevant TypeScript/edge-function checks available in the project harness.
   - Confirm there are no remaining `GRAPH_PIPELINE_BYPASSED` throws on the normal zero-survivor graph path.

6. **Redeploy edge function**
   - Deploy `ai-agriculture-chat` after code/test fixes.
   - Re-check recent edge-function logs for the same Marathi rice emergence trace pattern and verify it no longer returns HTTP 500.

## Expected outcome

The same farmer message should no longer blank the chat. The edge function should return a normal response/clarification path, while logs still show the stage conflict for audit and database curation.