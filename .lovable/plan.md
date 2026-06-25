
# Phase H + Phase I — Runtime Stabilization Plan

## Goal
Stop multiple modules from independently recomputing intent, clarification, evidence, stage, and routing. Introduce one immutable `ConversationState`, computed once per request right after observation extraction, consumed everywhere downstream. No DB changes, no API changes, no new agents.

## Architecture

```text
Request
  → Knowledge Initialization (Promise.allSettled, request-scoped)
  → Intent Classification (label only — never routes)
  → Observation Extraction (confirmed | inferred | unknown)
  → BUILD ConversationState (frozen, single authority)
  → Semantic Validation gate
  → Clarification Decision (reads ConversationState only)
  → Hypothesis Generation
  → Rule Eligibility + Evaluation (confirmed obs only)
  → Scientific Validation
  → Authority → Builder → Translation → Response
```

## Files to add

1. `supabase/functions/ai-agriculture-chat/runtime/conversation-state.ts`
   - `ConversationState` type + `buildConversationState()` + `Object.freeze`.
   - Owns: intent, mode (advisory|diagnosis), confirmed[], inferred[], unknown[], hypotheses[], coverage, clarification_required, clarification_reason, stage, stage_source, crop, das, semantic_status, symbolic_enabled, direct_mode, authority_status.
   - Pure function — no IO, no mutation.

2. `supabase/functions/ai-agriculture-chat/runtime/clarification-authority.ts`
   - Single function `decideClarification(state)` → `{required, reason, options?}`.
   - Replaces scattered `directModeBypass`, `UnderstandingChecker` short-circuits, coverage-based skips.

3. `supabase/functions/ai-agriculture-chat/runtime/evidence-coverage.ts`
   - `computeCoverage(confirmed[])` — excludes `*_UNKNOWN`, `ACTION_NONE`, `PHOTO_NOT_PROVIDED`, `CROP_IDENTIFIED`, inferred, hypotheses.
   - Returns 0–1 over informative confirmed observations only.

4. `supabase/functions/ai-agriculture-chat/runtime/brain-trace.ts`
   - `emitBrainTrace(state, phases)` — single `[BRAIN_TRACE]` block per request.

## Files to modify (surgical)

### `agents/orchestrator.ts` (primary)
- **Move knowledge preload** (`loadETLStandards`, `loadAgroZones`, `loadBaselineGuidelines`, `loadCropSynonyms`) from inside the layered-rule branch to **right after `requestCtx` creation** so irrigation/clarification/advisory routes share the same warm caches and emit `[KNOWLEDGE_PRELOAD]` traces.
- **Remove early `directModeBypass`**. Intent classification stays, but routing is deferred until after `ConversationState` is built.
- After observation extraction, call `buildConversationState(...)` and freeze.
- Replace all in-orchestrator clarification triggers (`directModeBypass`, `ADVISORY_DIRECT_ROUTES` short-circuit, `UnderstandingChecker` independent decision, coverage-based skip) with one call to `decideClarification(state)`.
- Gate: `direct_mode = advisoryIntent && state.confirmed.filter(isInformative).length === 0 && state.inferred.length === 0`. Symptom presence always wins.
- Use `state.stage` everywhere — delete secondary stage recomputations downstream of this point.
- Emit final `[BRAIN_TRACE]` block via `emitBrainTrace`.

### `decision/understanding-checker.ts`
- Demote to **pure scorer**. It returns a score + reason; it **never** decides clarification. The orchestrator passes its output into `ConversationState`; `decideClarification` is the sole decider.

### `decision/layered-rule-evaluator.ts`
- Reject rules whose match relies on `*_UNKNOWN`, inferred, or hypothesis-only observations. Eligibility input = `state.confirmed` only.
- Keep G1 3-tier argmax intact.

### `decision/semantic-validator.ts`
- Wrap initialization in a try/catch that sets `state.semantic_status = 'UNAVAILABLE'`. When unavailable, orchestrator must **block symbolic execution** and route to safe clarification (no fail-open).

### `bundled-rules/loader.ts`
- Replace `mapBundledCategory` fallback `Unknown → DIAGNOSIS` with a **preload-time validation error**: log `[CATEGORY_VIOLATION]` and drop the rule. Add `crop_rotation`, `proactive_pest`, `proactive_monitoring`, `management` to the canonical category map (they already exist in DB rows).

### `utils/stage-normalizer.ts`
- Resolve stage exactly once via `crop_stage_master → crop_stage_knowledge → landContext`. Cache on `requestCtx`. Downstream modules read `state.stage`.

### `runtime/observation-resolver.ts` (existing)
- Tag each resolved observation with `{kind: 'confirmed'|'inferred'|'unknown'}`. No merging.

## Behavioural fixes mapped to bugs

- **Bug 1** (intent disarms clarification): fixed by deferring `direct_mode` to after `ConversationState`; symptom signal vetoes advisory bypass.
- **Bug 2** (`_UNKNOWN` inflates coverage): fixed by `computeCoverage` excluding placeholders + inferred + hypotheses.
- **Unknown category warnings**: fixed by category map completion + preload validation.
- **Stage drift**: single resolver, frozen on state.
- **Knowledge preload missing on non-rule routes**: move preload to request init.

## Determinism guarantees (Phase I)

- One pipeline only. No early-return shortcuts; clarification path also passes through `ConversationState`.
- `[BRAIN_TRACE]` emitted on every request with: intent, confirmed, inferred, hypotheses, coverage, clarification, stage, semantic, candidates, eligible, winner, scientific, authority, builder, translation, total_ms.
- Clarification options always preserve `obs_key`, `semantic_class`, `observation_code` (already done in earlier phase — verify in `clarification-payload-builder`).

## Deliverables (markdown reports written to `/mnt/documents/`)

1. `RUNTIME_ROOT_CAUSE_REPORT.md`
2. `CONVERSATION_STATE_REPORT.md`
3. `PIPELINE_VALIDATION_REPORT.md`
4. `REGRESSION_REPORT.md` (Rice/Wheat/Sugarcane/Cotton/Tomato/Maize/Onion × diagnosis/irrigation/nutrition/disease/pest/weather/management/advisory — trace-line table)

## Non-goals
- No DB migrations.
- No new tables, no new edge functions, no new agents.
- No LLM-driven decisions added.
- No response JSON schema changes.

## Validation
- Redeploy `ai-agriculture-chat`.
- Re-run `scripts/regression-fixtures.md` Fixture #1 (Rice emergence Marathi) and Fixture #3 (Sugarcane irrigation) against live edge function.
- Confirm: no `[mapBundledCategory] Unknown category` warnings, `[BRAIN_TRACE]` present on every request, Rice symptom query no longer hits `GENERAL_INFO` short-circuit, coverage excludes `*_UNKNOWN`.

## Risk / scope
- Largest change is in `orchestrator.ts`. Edits are localized to: knowledge preload position, intent→state→route reordering, deletion of duplicate clarification deciders, replacement with `decideClarification`.
- Existing modules (`evidence-ledger`, `confidence-chain`, `scientific-validator`, `authority-trace`) remain — `ConversationState` becomes the input contract they all share.
