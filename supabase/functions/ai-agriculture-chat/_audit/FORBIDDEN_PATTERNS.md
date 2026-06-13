# Forbidden Patterns — `decision/` + `agents/`

These regex patterns must NOT appear in `supabase/functions/ai-agriculture-chat/decision/`
or `supabase/functions/ai-agriculture-chat/agents/` outside of the explicit allowlist
maintained in `_tests/no-forbidden-patterns_test.ts`.

A regression test enforces this on every CI run. If a new occurrence is added without
an allowlist entry the test fails — that is intentional. Adding a new allowlist entry
requires (a) a comment in this file explaining why it is safe and (b) reviewer sign-off.

## Patterns

| ID  | Regex                                            | Why it is forbidden |
|-----|--------------------------------------------------|---------------------|
| F1  | `^let _\w+`                                      | Module-level mutable state. Cross-tenant leakage vector — state set by tenant A is visible to tenant B's next request in the same isolate. Use `RequestScope` instead. |
| F2  | `^let \w+Instance`                               | Singleton wrapper around a class that owns a DB client or per-request state. Replace with `buildXxx(scope)` factory that returns a fresh instance bound to `scope.db`. |
| F3  | `^(const\|let) \w+\s*[:=].*new Map\(\)`          | Module-level `Map` keyed by request/tenant data — memory leak and cross-tenant leakage vector. Store on `scope` or use a bounded LRU. |
| F4  | `catch (...) { ... return []; }` <br> `if (error) { ... return []; }` | Silent fail-open. A DB error becomes "no rules matched" and the engine fabricates a confident decision from an empty fact set. Throw a typed error and let `index.ts` surface a 500 with the trace id. |

## Allowlist (must stay in sync with the test)

| File | Pattern | Rationale |
|------|---------|-----------|
| `agents/intent-classifier.ts:35-36` | F1 (`_validIntentCodes`, `_validIntentCodesPromise`) | Process-wide cache of **global** intent codes from `observation_intent_master`. Same across all tenants; converting to per-request would force a DB round-trip on every classification. Read-only after first load. |
| `agents/next-crop-recommender.ts:114-115` | F1 (`_cachedRules`, `_cachedAt`) | TTL cache of **global** rotation rules. Same across all tenants. |
| `decision/causal-hypothesis-engine.ts:224-225` | F3 (`hypothesisCache`, `loadingPromise`) | Process-wide cache of **global** hypothesis master data, keyed by crop group (not by tenant). Same content for every tenant. |
| `agents/generic-multi-match-detector.ts:~182` | F4 (`return []`) | Documented FAIL-OPEN BY DESIGN — multi-match clarification is a UX enhancement, not a decision gate. |
| `agents/next-crop-recommender.ts:~132` | F4 (`return []`) | Documented FAIL-OPEN BY DESIGN — next-crop is an advisory feature, not a request-time decision. |
| `agents/feedback-learning.ts:~134` | F4 (`return []`) | Documented FAIL-OPEN BY DESIGN — offline confidence-tuning, never on the live advisory path. |

Every allowlisted F4 occurrence MUST carry a `FAIL-OPEN BY DESIGN` comment on a line
within ±5 lines of the `return [];`. The test verifies this comment is present.
