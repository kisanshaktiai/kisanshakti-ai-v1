# Single-Phase Runtime Repair — Neuro-Symbolic Brain

One surgical pass. No schema changes, no new agents, no contract changes. Each fix is scoped to a known file and verified through `[BRAIN_TRACE]` logs + a regression run.

## Scope guardrails
- No edits to: DB schema, response JSON shape, edge function entrypoint contract, LLM prompts.
- Edits restricted to: `agents/`, `decision/`, `bundled-rules/`, `utils/`, `runtime/`, knowledge cache loaders, and one SQL string in `market-product-lookup.ts`.

## Fix list (executed together in one phase)

### 1. Rule ranking — intent must beat generic stress (P0)
- File: `agents/layered-rule-evaluator.ts` (scorer ~L963–1010) + `bundled-rules/loader.ts` (`filterRulesByIntent`, `_genericPenalty`).
- Repair: enforce ordered priority `intent > semantic > hypothesis > generic` by:
  1. Hard-gating candidates with `filterRulesByIntent(intent)` **before** scoring (drop generic rules entirely when ≥1 intent-specific rule survives semantic gate).
  2. Strengthening `_genericPenalty` from 0.85 → tiered: intent-match `×1.0`, semantic-only `×0.7`, generic `×0.4`.
  3. Adding hypothesis-contribution term (`+0.15` when winning hypothesis's `causes` ∋ rule.category).
  4. Tie-break on `rule_intent === intent` before raw score.
- Trace: emit candidates, per-component scores, winner reason.

### 2. Action extraction — no silent loss (P0)
- File: `decision/deterministic-builder.ts` + `agents/orchestrator.ts` response projection + `index.ts:3582` (authority gate).
- Repair:
  1. Trace where `actions` becomes `[]` despite `rules_fired>0`. Most likely cause: authority gate strips card without re-projecting rule actions, or builder reads `rule.actions` while loader stores `rule.action_codes`/`rule.recommended_actions`.
  2. Normalize action source: builder must read in order `rule.actions → rule.recommended_actions → rule.action_codes`, then resolve via `action_master` (already cached).
  3. Invariant guard: if `authority.recommendation_allowed && winner_rule && actions.length===0` → log `[ACTION_LOSS]` with rule id + raw fields and fall back to action_codes resolution rather than emitting zero.

### 3. Scientific baseline cache hit
- File: `decision/scientific-validator.ts` + `utils/crop-baseline-cache.ts` (or wherever `getBaselineForCrop` lives, also used in `irrigation-decision-module.ts`).
- Repair:
  1. Normalize cache key: `${crop_code_lower}::${stage_category_upper}` for both writer and reader.
  2. Add DAS-window fallback (`stage = resolveStageByDAS(crop, das)`) before declaring "no baseline".
  3. Only emit `default cropMinAge=120` when DB row truly absent; log `[BASELINE_FALLBACK reason=...]` with crop/stage/das.

### 4. Knowledge preload (`agro-zone-cache`)
- File: `utils/agro-zone-cache.ts` + `decision/pipeline-self-check.ts` dynamic imports.
- Repair: fix import path / export name mismatch causing preload failure (self-check uses `import()` so a wrong specifier throws silently). Ensure module exports `preload()` and is registered in the cache init list. Add explicit error log with module name.

### 5. MarketProductLookup JSONB SQL
- File: `runtime/market-product-lookup.ts`.
- Bug: `column ~~* value` against jsonb (e.g. filtering `target_pests ILIKE`). Fix by casting (`target_pests::text ILIKE ...`) or using `jsonb` containment `@>` / `jsonb_path_exists`. Use containment when matching canonical codes; cast-to-text ILIKE only for free-text fields.

### 6. Stage provenance — single source per request
- File: `agents/orchestrator.ts` (stage resolution chain) + `utils/stage-knowledge-cache.ts`.
- Repair: introduce a single `resolveStage(ctx)` that returns `{ stage, source }` once per request, stored on `RequestContext`. All downstream reads use `ctx.stage`. Remove the second pass that sets `UNKNOWN` after SSOT resolution. Trace `[STAGE_SOURCE]` exactly once.

### 7. Verification (in same phase)
- Add a `/tmp/regression/` Deno script (or reuse `pipeline-self-check`) that drives 7 canned queries (emergence/germination/irrigation/pest/disease/nutrient/weather-stress) against the deployed function and asserts:
  - winning rule's `rule_intent` matches detected intent (or no intent-rule existed),
  - `actions.length ≥ 1` when `recommendation_allowed`,
  - one `[STAGE_SOURCE]` line per request,
  - no `[BASELINE_FALLBACK reason=cache_miss]`,
  - no `operator does not exist: jsonb ~~*`.

## Mandatory `[BRAIN_TRACE]` fields per request
`intent`, `semantic_pass`, `hypothesis`, `rule_candidates[]`, `rule_scores[]`, `winning_rule`, `scientific_validation`, `authority_decision`, `builder_output_keys`, `action_count`, `translation_status`, `pipeline_ms`.

## Acceptance gate (all must pass)
- EMERGENCE_FAILURE → never selects `RICE_STRESS_CYCLONE_RECOVERY_001`.
- Intent-specific rule always outranks generic when both pass gates.
- Approved rule ⇒ `action_count ≥ 1` (zero `[ACTION_LOSS]` events).
- `crop_baseline_guidelines_v2` hits cache for seeded crops; fallback only when row truly missing.
- All knowledge caches preload without error.
- Market product SQL executes cleanly.
- Exactly one stage source per request.
- Response JSON shape, DB schema, and architecture unchanged.

## Files touched (estimate)
`agents/layered-rule-evaluator.ts`, `agents/orchestrator.ts`, `bundled-rules/loader.ts`, `decision/deterministic-builder.ts`, `decision/scientific-validator.ts`, `decision/pipeline-self-check.ts`, `runtime/market-product-lookup.ts`, `utils/agro-zone-cache.ts`, `utils/crop-baseline-cache.ts`, `utils/stage-knowledge-cache.ts`, `index.ts` (authority gate only).

Approve to execute all seven fixes in one build pass.
