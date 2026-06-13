# Cross-Tenant Leakage Inventory — 2026-06-13

Audit baseline for the W1 hardening pass on `ai-agriculture-chat`. Every
mutable cross-request surface in the edge function, classified.

## Module-level `let _` (cross-tenant state — must be moved to RequestScope)

| File | Line | Var | Class | Action |
|---|---|---|---|---|
| `decision/canonical-state-invariants.ts` | 60 | `_authoritativeContext` | Per-turn auth context | **Move to scope** (Task 2) |
| `decision/canonical-state-invariants.ts` | 61 | `_confirmedDiagnosis` | Per-turn diagnosis | **Move to scope** (Task 2) |
| `decision/canonical-state-invariants.ts` | 62 | `_answeredClarifications` | Per-turn answers | **Move to scope** (Task 2) |
| `agents/clarification-strategy.ts` | 185 | `_lockedStageContext` | Per-turn stage lock | **Move to scope** (Task 2 extension) |
| `agents/intent-classifier.ts` | 30 | `_validIntentCodes` | Global intent-code lookup | **Leave** — global read-only data, no tenant scope |
| `agents/intent-classifier.ts` | 31 | `_validIntentCodesPromise` | In-flight loader promise | **Leave** — same |
| `agents/next-crop-recommender.ts` | 109 | `_cachedRules` | TTL rule cache | **Leave** — global lookup, TTL-bounded |
| `agents/next-crop-recommender.ts` | 110 | `_cachedAt` | TTL timestamp | **Leave** — same |

## Module-level singleton wrappers (must become factories)

| File | Line | Var | Type | Action |
|---|---|---|---|---|
| `agents/audit-logger.ts` | 711 | `auditLoggerInstance` | A (holds DB client) | **Convert** (Task 3) |
| `decision/symbolic-reasoner.ts` | 1619 | `reasonerInstance` | A | **Convert** (Task 3) |
| `decision/context-validator.ts` | 494 | `validatorInstance` | TBD — verify in Task 3 | Inspect |
| `decision/confidence-calculator.ts` | 432 | `calculatorInstance` | TBD | Inspect |
| `decision/fact-extractor.ts` | 275 | `extractorInstance` | TBD | Inspect |
| `decision/clarification-validator.ts` | 324 | `validatorInstance` | TBD | Inspect |
| `agents/layered-rule-evaluator.ts` | 85 | `symbolicReasonerInstance` | A (extra, not in spec) | **Convert** |
| `decision/response-generator.ts` | 303 | `generatorInstance` | A (extra, not in spec) | **Convert** |

## `createClient(` sites (16 total — must consolidate on `scope.db`)

agents: audit-logger, canonical-observation-loader, feedback-learning,
intent-classifier, next-crop-recommender, orchestrator, safety-guardian.
decision: authoritative-state-loader, db-observation-validator,
intent-resolver, observation-code-mapper, symbolic-reasoner.
Other: bundled-rules/loader.ts, index.ts.

## Other confirmed defects

- `utils/context-tracer.ts:64` — module-level `Map<string, ContextTracePoint[]>` — **memory leak** (Task 4)
- `decision/intent-resolver.ts:138` — HOTFIX disabling crop/DAS filter — **restore** (Task 5)
- `decision/intent-resolver.ts:262` — HOTFIX disabling crop/DAS filter — **restore** (Task 5)

## Explicitly out of scope for this PR

- DB migrations (columns already present per spec)
- Any rule, hypothesis, observation, or mapping content
- `llm-response-generator.ts:230, :417` and `llm-response-formatter.ts:1386` (W3)
- Gate code reading `rule.action_type` (W2)
- `agents/safety-guardian.ts` (class, no singleton wrapper — verified)
