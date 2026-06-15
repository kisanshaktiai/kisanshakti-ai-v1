# Phase 7 — AI Runtime Audit

Extends `_audit/2026-06-13-leakage-inventory.md`. Re-verified on 2026-06-15.

## RequestScope adoption

`runtime/request-scope.ts` is in place and the scope contract (per-turn `authoritativeContext`, `confirmedDiagnosis`, `answeredClarifications`, `turnCache`, typed errors) is enforced. ✅

**Still pending:**
- 13 of 16 `createClient(` sites should switch to `scope.db` (see Phase 6).
- 2 module-level mutable refs (`_validIntentCodes`, `_cachedRules`) — read-only/TTL caches over global data; safe but should be commented as such or moved to a shared `globalCache` module.

## Cross-tenant cache safety

Module-level `Map` caches identified:

| File | Cache | Tenant-safe? | Why |
|---|---|---|---|
| `agents/market-product-lookup.ts` | `ingredientProductCache` | ✅ | Keys by active_ingredient (global) |
| `bundled-rules/loader.ts` | `conditionLedgerCache` | ✅ | Keys by condition_code (global) |
| `decision/causal-hypothesis-engine.ts` | `hypothesisCache` | ✅ | Keys by `${crop_code}:${stage}` (global ontology) |
| `decision/observation-code-mapper.ts` | `OBS_ALIAS_CACHE` | ✅ | Global alias table |
| `agents/intent-classifier.ts` | `_validIntentCodes` | ✅ | Global intent vocabulary |

**Verify:** add a sentinel test in `_tests/cross-tenant-leakage_test.ts` that flips tenant between two requests and asserts none of these caches leak tenant-specific data.

## Fail-closed boundaries

`request-scope.ts` exports `InvariantViolation`, `IntentResolutionError`, `EngineDataError`. Spot-check: many `agents/*` files still use `console.warn(...); return []` for DB failures. **Convert to throwing `EngineDataError`** so the orchestrator's top-level try/catch can surface 500s with trace_id rather than serving empty results.

Candidates (grep `return \[\];` in catch blocks):
- `agents/canonical-observation-loader.ts`
- `agents/intent-classifier.ts`
- `decision/observation-code-mapper.ts`

## Determinism

`Date.now()` and `Math.random()` are present in the decision path:
- `runtime/request-scope.ts` (timestamps in trace events — acceptable, not consumed by deciders)
- `agents/*` files — verify no random tiebreak in rule selection (none expected; `observation-rule-lookup.ts` is deterministic on `priority + rule_id`).

## Unbounded growth

No truly unbounded module-level Map identified. TTL bounds present where data could grow (`_cachedAt`, `OBS_ALIAS_CACHE_TTL_MS`).

## Conclusion

Runtime is **production-grade with documented gaps**. Top remaining items:
1. Finish `createClient → scope.db` migration (13 sites).
2. Convert silent `return []` to `EngineDataError`.
3. Add cross-tenant cache leakage test.
