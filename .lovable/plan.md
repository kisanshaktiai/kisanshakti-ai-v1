
# Fix Plan — Rice Transplanting DAS 29 → wrong INVARIANT_FALLBACK

The uploaded audit already isolated the three verified bugs. The full "rewrite everything to DB-driven, purge every module-level state, wire RequestScope end-to-end" ask is a multi-week refactor across ~40 files that I will NOT attempt in one shot — it would destabilize the already-fragile pipeline. I propose landing the three surgical fixes that make the failing trace behave correctly and honor the DB contract, then discuss the larger refactor scope separately.

## Scope of this PR (blocking bug fix)

### Fix 1 — `utils/stage-normalizer.ts` (Root Cause 1, blocking)
Remove agronomically wrong lumping:
- Remove `planting`, `sowing`, `transplanting`, `post_planting`, `pre_sowing` from `SEEDLING_STAGES`.
- Remove `'transplanting': 'germination'`, `'sowing': 'germination'`, `'transplanting': 'germination'`, `'post_planting': 'planting'`, `'sowing': 'germination'`, `'transplanting': 'germination'` mis-mappings from `STAGE_DB_MAP`.
- Add `transplanting` → its own key mapping to itself; treat it as a `VEGETATIVE` category member alongside `tillering` (matches `crop_stage_graph` TRANSPLANTING→TILLERING edge already present in DB).
- Keep the module as a static fallback only. Fully DB-backed resolver is Fix 3.

Effect: `calculateStageRelevanceScore([SEEDLING,NURSERY,GERMINATION], 'TRANSPLANTING')` drops from `0.7` → `0.1`, germination rules get skipped at the `< 0.2` cutoff, and transplanting-applicable hypotheses (Khaira, N-deficiency…) become winners from DB.

### Fix 2 — Honor `hypothesis_conditions.is_required=true` (Root Cause 3, blocking)
In `decision/hypothesis-evaluator.ts` (and the parallel path in `hypothesis-graph-evaluator.ts` if reached), before scoring each candidate:

1. Read the candidate's `hypothesis_conditions` rows already loaded from DB.
2. For every row where `is_required = true`:
   - `condition_type='STAGE'` → eliminate if current stage not in the allowed list.
   - `condition_type='DAS_RANGE'` → eliminate if current DAS is outside `[min,max]`.
3. Emit `[HYP_ELIMINATED] reason=REQUIRED_STAGE_FAILED|REQUIRED_DAS_FAILED hypothesis_id=… required=… actual=…`.

No soft matching, no penalty. Pure gate.

### Fix 3 — Wire `stage-family-shim.ts` to `crop_stage_graph` (Root Cause 2)
Convert the shim into `StageGraphReader`:
- On cold start (per isolate), lazy-load `crop_stage_graph` into a versioned in-memory reference cache (hashed by `max(updated_at)` for invalidation).
- Expose `stageFamily(crop, stage)`, `stagesEquivalent(crop, a, b)`, `nextStages(crop, stage)` backed by DB rows.
- Keep `STAGE_FAMILIES` static object ONLY as fallback for crops/stages missing from `crop_stage_graph`, with a `[STAGE_GRAPH_FALLBACK]` warning trace.
- All callers (`contradiction-engine`, `navigator-adapter`, `layered-rule-evaluator`) updated to pass `crop` in.

## Traces added
- `[HYP_ELIMINATED] reason=… hypothesis_id=… required=… actual=…`
- `[HYP_SURVIVED] hypothesis_id=… conditions_passed=…`
- `[STAGE_GRAPH_LOOKUP] crop=… stage=… source=DB|FALLBACK family=[…]`
- Existing `[HYP_TO_RULE]`, `[RULE_STAGE_TRACE]`, `[RULE_WINNER]` left as-is.

## Regression test (`tests/graph-integrity_test.ts`)
Add case:
```
crop=RICE stage=transplanting DAS=29 msg="पिक अजून उगवले नाही"
assert: RICE_GERMINATION_FAILURE NOT in surviving hypotheses
assert: [HYP_ELIMINATED reason=REQUIRED_STAGE_FAILED] emitted for it
assert: at least one transplanting-applicable hypothesis surfaced OR
        clarification requested (never INVARIANT_FALLBACK with MONITOR_ONLY)
```

## Explicitly OUT of scope for this PR (needs separate plan)
The user's brief also asks for:
- Full RequestScope object plumbing across the whole edge function.
- Purge of every module-level `let _authoritativeContext`, `let _confirmedDiagnosis`, `let _answeredClarifications`.
- Search-and-destroy of all `YOUNG_CROP_MAX_DAYS`, `STAGE_ORDER`, `ICAR_CALENDARS`, `NDVI_THRESHOLDS` constants (dozens of files).
- Ban on all singleton decision state, replace with per-request scope.

These are correct long-term goals but each touches 20–40 files and would need its own PR with its own regression suite. I recommend landing the three blocking fixes first, verifying the trace, then tackling the RequestScope refactor as PR-2 and the hardcoded-agronomy purge as PR-3.

## Files changed in this PR
- `supabase/functions/ai-agriculture-chat/utils/stage-normalizer.ts` — remove wrong lumping.
- `supabase/functions/ai-agriculture-chat/runtime/stage-family-shim.ts` → replaced by `runtime/stage-graph-reader.ts`; shim re-exports for back-compat.
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` — hard `is_required` gate + eliminations traces.
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-graph-evaluator.ts` — same gate on the parallel path.
- `supabase/functions/ai-agriculture-chat/tests/graph-integrity_test.ts` — regression test.

Approve to implement, or say "expand to RequestScope refactor too" and I'll extend the plan (larger, riskier).
