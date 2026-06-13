## Pre-flight inventory (verified against the codebase)

All targets exist. Counts differ slightly from the spec — flagging here so we agree before coding.

### Module-level `let _` (8 declarations across 5 files — spec only named 1)
- `decision/canonical-state-invariants.ts:60-62` — `_authoritativeContext`, `_confirmedDiagnosis`, `_answeredClarifications` *(spec target)*
- `agents/clarification-strategy.ts:185` — `_lockedStageContext` *(extra — same leakage class)*
- `agents/intent-classifier.ts:30-31` — `_validIntentCodes`, `_validIntentCodesPromise` *(extra — but this is a read-mostly code cache, safe to share across tenants since intent codes are global)*
- `agents/next-crop-recommender.ts:109-110` — `_cachedRules`, `_cachedAt` *(extra — TTL rule cache, global data, safe to keep)*

### Singletons (8 files — spec named 6)
| File | Variable | Action |
|---|---|---|
| `agents/audit-logger.ts:711` | `auditLoggerInstance` | Convert (Type A) |
| `decision/symbolic-reasoner.ts:1619` | `reasonerInstance` | Convert (Type A) |
| `decision/context-validator.ts:494` | `validatorInstance` | Verify, likely convert |
| `decision/confidence-calculator.ts:432` | `calculatorInstance` | Verify, likely Type B (stateless) |
| `decision/fact-extractor.ts:275` | `extractorInstance` | Verify |
| `decision/clarification-validator.ts:324` | `validatorInstance` | Verify |
| `agents/layered-rule-evaluator.ts:85` | `symbolicReasonerInstance` | **Extra** — convert |
| `decision/response-generator.ts:303` | `generatorInstance` | **Extra** — convert |

### Other confirmations
- `createClient(` sites: **16** (spec said ~15) — listed and ready to thread through `scope.db`
- `utils/context-tracer.ts:64` module-level `Map` — confirmed
- `decision/intent-resolver.ts:138` and `:262` HOTFIX comments disabling crop/DAS filters — confirmed verbatim
- `agents/safety-guardian.ts` — class, no singleton wrapper — leave alone (per spec)
- `agents/orchestrator.ts` = 9,860 LOC, `index.ts` = 4,247 LOC — staged refactor is mandatory
- Tests live under `tests/` at repo root (`chat/`, `e2e/`, `pwa/`, `unit/`, `voice/`) — new Deno tests will go in `supabase/functions/ai-agriculture-chat/_tests/` with `*_test.ts` naming so they don't pollute the Vitest tree

### Questions before I touch anything
1. **Scope creep in Task 2**: the spec only names `canonical-state-invariants.ts`, but `clarification-strategy.ts:185` (`_lockedStageContext`) has identical cross-tenant leakage semantics. Include it in Task 2 (recommended) or defer?
2. **Singleton scope creep**: spec lists 6, I found 8. Include `layered-rule-evaluator.ts` and `response-generator.ts` in Task 3 (recommended — same defect)?
3. **Read-only global caches** (`intent-classifier.ts`, `next-crop-recommender.ts`): leave alone? They hold global lookup data, not per-tenant state — converting them would force a DB round-trip per request and hurt p95 latency. My recommendation: leave, add a comment documenting why.

Assuming **yes / yes / leave-with-comment**, here is the plan.

---

## Implementation plan

### Stage 0 — Inventory artifact
- Write `supabase/functions/ai-agriculture-chat/_audit/2026-06-13-leakage-inventory.md` with the table above so the next auditor sees exactly what was touched and what was deliberately not.

### Task 1 — `runtime/request-scope.ts` + test
- Create `supabase/functions/ai-agriculture-chat/runtime/request-scope.ts` exactly as specified, with the `AuthoritativeContext.source` enum widened to `'CROP_SCHEDULE' | 'OBSERVATION' | 'FARMER_INPUT' | 'NDVI' | 'INFERRED' | 'LAND_STATE' | 'CONFIRMED'` so it is a superset of the existing enum in `canonical-state-invariants.ts` (prevents breaking call sites).
- Create `supabase/functions/ai-agriculture-chat/_tests/cross-tenant-leakage_test.ts` with the two `Deno.test` cases from the spec.
- Run `deno test` via `supabase--test_edge_functions` — both must pass before Task 2.

### Task 2 — Refactor `decision/canonical-state-invariants.ts` (+ `clarification-strategy.ts` if approved)
- Delete the three module-level `let _` declarations.
- Add `scope: RequestScope` as first param to: `lockAuthoritativeContext`, `getAuthoritativeContext`, `setConfirmedDiagnosis`, `getConfirmedDiagnosis`, `markClarificationAnswered`, `wasClarificationAnswered`, and any invariant-check helper that reads them. Re-read the full file first to get the exact list.
- Update every call site (grep `lockAuthoritativeContext\|getAuthoritativeContext\|markClarificationAnswered\|wasClarificationAnswered\|setConfirmedDiagnosis\|getConfirmedDiagnosis` across `agents/` and `decision/`).
- If Q1 = yes: same treatment for `_lockedStageContext` in `clarification-strategy.ts`.
- Acceptance: `grep -n "^let _" decision/canonical-state-invariants.ts` returns empty; existing tests still pass.

### Task 3 — Convert singletons to factories
For each of the 6 confirmed + 2 extra Type-A singletons:
1. Read the class — confirm it holds a DB client or per-request state. If it's pure-function-with-cache (Type B), leave and document.
2. Replace `getXxx()` with `buildXxx(scope: RequestScope)` returning `new Xxx(scope)`.
3. Constructor takes `scope`, uses `this.scope.db` instead of its own `createClient`.
4. Delete the module-level `let xxxInstance` line.
5. Update every caller to pass `scope`.

Acceptance: the two `grep` commands in the spec return zero matches.

### Task 4 — `utils/context-tracer.ts` memory leak
- Delete `let currentTraceId` and `const tracePoints: Map<string, ...>`.
- Rewrite `initializeTrace`, `addTracePoint`, `getTracePoints`, `clearTrace` to be no-ops or thin wrappers over `scope.emit(...)` / `scope.events.filter(...)`.
- Update every caller (grep `addTracePoint\|initializeTrace\|getTracePoints\|clearTrace`).

### Task 5 — Restore `intent-resolver.ts` filters
- At both `:138` and `:262`, replace the HOTFIX query with the filtered query from the spec (`crop_code IN [crop, 'ALL']`, `das_min <= das`, `das_max >= das`, optional `growth_stage`).
- Add `scope: RequestScope` param; use `scope.db`.
- Replace `return []` on DB error with `throw new IntentResolutionError(...)`.
- Delete the HOTFIX comment blocks entirely.
- Update callers (intent-classifier, agronomic-observation-validator, anything else surfaced by grep).

### Task 6 — Eliminate silent `return []`
- Grep for `return \[\];` preceded within 3 lines by `catch` or DB error check.
- For each: throw a typed error (`InvariantViolation` or new `EngineDataError`) — but ONLY in decision/agents code paths. Leave `return []` in genuinely empty-result cases (`if (!data?.length) return []` is not a bug).
- Each conversion gets a `scope.emit({ kind: 'error', ... })` before the throw.

### Task 7 — Wire scope through `index.ts` → `orchestrator.ts` (staged)
- **7a**: `index.ts` creates `scope = createRequestScope({...})`, wraps the orchestrator call in try/catch as specified, returns `{ error, trace_id }` 500 on throw. Keep all existing auth/parse logic unchanged.
- **7b**: `runOrchestrator(scope, ...)` accepts scope; thread through Phase 1 (NLU + intent resolution). Run tests.
- **7c**: thread through Phase 2 (hypothesis evaluation). Run tests.
- **7d**: thread through Phase 3 (rule firing). Run tests.
- **7e**: thread through Phase 4 (gates + response generation). Run tests.

Each sub-stage is a separate edit pass with test verification before moving on. If any existing test breaks, fix before continuing.

### Task 8 — Guardrails
- Extend `supabase/functions/ai-agriculture-chat/deno.json` lint config (already exists) — add `no-undef` to `include`.
- Add `supabase/functions/ai-agriculture-chat/_audit/FORBIDDEN_PATTERNS.md` listing the regex patterns that must not reappear in `decision/` or `agents/`:
  - `^let _\w+` (module-level mutable state)
  - `let \w+Instance` (singleton wrapper)
  - `return \[\];` directly after a `catch` or `if (error)` (silent fail-open)
  - `Map<.*>\s*=\s*new Map\(\)` at module scope
- Add a Deno test `_tests/no-forbidden-patterns_test.ts` that walks `decision/` + `agents/`, asserts none of these regex hit. This is the regression dam.

---

## Risks and how they're mitigated

| Risk | Mitigation |
|---|---|
| Threading `scope` through 9,860-LOC orchestrator breaks something subtle | Stage 7 in 5 substages with test runs between each |
| Re-enabling crop/DAS filter in intent-resolver suddenly returns 0 rows for some intents and breaks live traffic | Before deploy: dry-run on a representative sample of intent codes via `supabase--read_query` to confirm filtered counts > 0. If any intent goes empty, surface to user as a rule-data issue (not a code rollback). |
| Singleton conversion forces new object per request → GC pressure | Acceptable; objects are tiny and scope-lifetime. Confirmed by spec. |
| `Object.seal` on scope blocks legitimate dynamic property addition somewhere | Run full test suite after Task 1; if a test fails because something tried to add a property, that's the bug we want to find. |

## Deferred / out of scope (explicitly NOT touched)
- All DB rules, hypotheses, observations, mappings (per constraint)
- DB migrations (`crop_code`/`das_min`/`das_max` already exist per spec — confirmed by the fact that the HOTFIX comment talks about re-enabling, and you've verified the columns are present)
- `llm-response-generator.ts:230, :417` and `llm-response-formatter.ts:1386` (W3)
- Any gate code reading `rule.action_type` (W2)
- `intent-classifier.ts` / `next-crop-recommender.ts` global lookup caches (read-only global data, not tenant-scoped)

---

**Please confirm Q1, Q2, Q3 above, then say "go" and I'll execute Stage 0 → Task 1 → tests, and pause for your review before Task 2.**