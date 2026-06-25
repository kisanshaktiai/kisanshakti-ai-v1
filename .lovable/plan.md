
# Runtime Invariants Repair — ConversationState, Semantic Gate, Stage Master

## What the audit actually found

I cross-checked the production edge log against the live DB schema and the runtime code. The report's symptoms map to **three column-name mismatches** and **one missing pipeline emission**. The architecture is wired; the queries silently fail and a clarification short-circuit skips the invariant trace.

### Bug 1 — `crop_stage_master` query uses wrong columns (P0, explains `master=0`)

`supabase/functions/ai-agriculture-chat/utils/stage-knowledge-cache.ts` lines 47–84 selects:

```
crop_code, stage_code, stage_category, das_start, das_end, display_name
```

Live `public.crop_stage_master` schema (verified):

```
crop_code, growth_stage, das_min, das_max, stage_description
```

PostgREST returns a `42703` error → the `try/catch` swallows it → `master.length === 0`. DB actually has **111 rows**. Same loader also writes the lookup map with `r.stage_code` (undefined) so even after fixing the select, the map key would be `crop|undefined`.

Fix: change the select list and the `StageMasterRow` interface to `growth_stage / das_min / das_max / stage_description`, and use `growth_stage` (not `stage_code`) for the cache key and `getStageByDAS` window check.

### Bug 2 — `intent_semantic_class_allowlist` query uses wrong columns (P0, explains `SEMANTIC_GATE FAIL_OPEN`)

`supabase/functions/ai-agriculture-chat/decision/semantic-validator.ts` lines 57–60 selects:

```
intent, semantic_class
```

Live schema: `intent_code` + `allowed_classes text[]` (1 row per intent, classes as an array). 90 rows exist. Query errors → `byIntent` empty → every request logs `FAIL_OPEN`.

Fix: select `intent_code, allowed_classes`, and expand the array into the `Set<string>` per intent.

### Bug 3 — `ConversationState` never built on the clarification short-circuit (P0)

`agents/orchestrator.ts` lines ~1716–2080 handle the "farmer answered a pending clarification" branch and `return` a response after `evaluateRulesLayered(...)`, well before the main pipeline reaches `buildConversationState(...)` at line 3804 and `emitBrainTrace(...)` at line 3821.

The trace in the report (`option_selected: "🔍 MANAGEMENT PLANNING"` → `Total rules for option selection: 76` → `STAGE_FALLBACK`) is exactly this branch — so neither `[CONVERSATION_STATE]` nor `[BRAIN_TRACE]` ever logs for these turns.

Fix: just before the early `return` in the OPTION_SELECTED branch, build a `ConversationState` from the locally-available crop, stage, observations (`allObservations`), and rule result, then call `emitBrainTrace(state, …)`. Reuse the existing helpers — no logic changes, just emission, so the invariant becomes observable on every execution path.

### Bug 4 — Stage-knowledge cache key drift (P1, secondary effect of Bug 1's interface)

After Bug 1 is corrected, ensure `byCropStage` and `knowledgeByCropStage` keys both use `(crop_code, growth_stage)` so `getStageRow` / `getStageKnowledge` actually hit. `crop_stage_knowledge` already exposes `growth_stage`; today the map writes `r.stage_code` (undefined) — both maps need the same key function.

## Scope of changes

Only three files; no DB migrations needed (data is fine, columns just need to be addressed correctly):

1. `supabase/functions/ai-agriculture-chat/utils/stage-knowledge-cache.ts`
   - Update `StageMasterRow` / `StageKnowledgeRow` interfaces.
   - Fix `.select(...)` for `crop_stage_master`.
   - Change cache key from `stage_code` → `growth_stage` for both maps.
   - Fix `getStageByDAS` to use `das_min`/`das_max`.

2. `supabase/functions/ai-agriculture-chat/decision/semantic-validator.ts`
   - Fix `loadAllowlist` to select `intent_code, allowed_classes` and iterate the array.

3. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
   - In the OPTION_SELECTED early-return block (≈ lines 2016–2080), call `buildConversationState({...})` from the locally available `cropName`, `growthStage`, `allObservations`, `ruleResult` and `emitBrainTrace(state, { total_ms })` before each `return`.
   - No other behavior changes; legacy decision state remains, the canonical state is added on top so the invariant is now provable in logs.

## Validation after the fix

Trigger one diagnosis + one clarification reply against the deployed function and confirm in `ai-agriculture-chat` edge logs:

- `[STAGE_KNOWLEDGE] loaded master=111 knowledge=79` (not `master=0`).
- For an intent that has allowlist rows: no `[BRAIN_TRACE][SEMANTIC_GATE] FAIL_OPEN` — instead a `kept/dropped` line.
- Every response (including OPTION_SELECTED replies) emits a `[CONVERSATION_STATE]` line and a `[BRAIN_TRACE]` line.

I will not touch the database, rule engine, or routing logic — those areas of the report are downstream symptoms that resolve once these four runtime invariants are restored.
