
# KisanShakti AI Chat — Forensic Audit & Remediation Plan

Scope per your answers: **full audit + full remediation in one pass, no touch-zone restrictions, use existing trace logs only**. Architecture is preserved — only repair, harden, stabilize.

---

## A. Smoking-gun findings already proven (during plan exploration)

### A1. CRITICAL — UI confidence collapses to 0/0.5 due to a precedence bug
File: `supabase/functions/ai-agriculture-chat/utils/ui-response-builder.ts:195`

```ts
const confidence = safeMeta.confidence ?? safeGate.confidence_level
  ? parseConfidenceLevel(safeGate.confidence_level) : 0.5;
```

Operator precedence parses this as `(safeMeta.confidence ?? safeGate.confidence_level) ? parse(gate) : 0.5`. The **numeric** `safeMeta.confidence` is **never** propagated. The UI confidence is always derived from `safeGate.confidence_level` (a text bucket like LOW/MEDIUM/HIGH) **or hard-falls to 0.5**. When the gate hasn't set `confidence_level`, the field is `0`, `null`, or unknown → final confidence = `0` / `0.5`. This is the primary cause of "confidence = 0" in farmer-visible bubbles and CanonicalAdvisoryCard.

### A2. CRITICAL — DB column mismatch & confidence persistence drift
`ai_decision_log` real columns include `confidence_score numeric` and `hypothesis_score numeric`. There is **no `symbolic_confidence` column** even though `index.ts` repeatedly references that name in logs/invariants. Persistence writes (need to verify in audit) likely target the wrong field or pass `0` — confirming the DB-side "0" you observed.

### A3. CRITICAL — Confidence floor only patches UnifiedGate input, not metadata
`index.ts:1368-1372`: the invariant detects `primary_decision exists && symbolicConfidence === 0` and forces `unifiedGateInput.decision_confidence = 50`, but it does **not** update `symbolicConfidence` (used later for metadata, persistence, and UI). So the gate sees 50 while the rest of the system still ships 0.

### A4. HIGH — Confidence aggregation reads two possibly-missing fields
`index.ts:1334-1338` reads `layered_rule_result.primary_decision.weighted_confidence ?? .confidence_score ?? 0`. If the layered rule evaluator writes `rule_confidence` / `score` / `normalized_confidence` (common drift across the codebase), value silently becomes 0 and the invariant log fires (matching the "every response confidence=0" symptom).

---

## B. Phase-by-phase audit deliverables

For each phase: **inputs/outputs traced, evidence captured, RCA, severity, fix, validation**.

| # | Phase | Primary output |
|---|---|---|
| 1 | System inventory | Edge function module map + `src/components/chat/*` map + DB tables dependency graph |
| 2 | End-to-end data flow | Query → response trace with field-level inputs/outputs at every stage |
| 3 | Intent pipeline | NLU → canonical-intent mapping; mr/hi/en/Hinglish coverage matrix |
| 4 | Symbolic graph | Node/edge map for `orchestrator → llm-understanding → observation-code-mapper → symbolic-reasoner → hypothesis-evaluator → rule-evaluation-layer → unified-decision-gate → diagnosis-first-generator → response-generator`; dead/orphan/bypass nodes flagged |
| 5 | Rule engine | Coverage report from `bundled-rules/` + DB `decision_rules`; conflict/duplicate detection |
| 6 | **Confidence** (highest) | Field-by-field trace: rule.confidence_score → reasoner.confidence → evaluator.weighted_confidence → orchestrator.metadata.confidence → ui-response-builder.confidence → DB column → frontend props |
| 7 | Land context | Verify `lands → crop_schedules → variety → growth_stage` loading; missing/stale fields surfaced |
| 8 | Crop schedule | Active-vs-harvested mismatch RCA (the bug from your previous Khari report); status override invariant |
| 9 | Database | Real column names vs. code references (already found `symbolic_confidence` drift); nullables, FKs, orphans |
| 10 | LLM boundary | Verify LLM does not author products/dosages; `validateLLMOutputIntegrity` coverage |
| 11 | Multi-tenant | `tenant_id` propagation across orchestrator → DB; cache key isolation |
| 12 | Reliability | Logging, retries, error envelopes, rate guard, observability holes |
| 13 | Agronomic accuracy | Spot-check against ICAR/SAU norms for sugarcane (your primary crop) |
| 14 | RCA report | Issue / Evidence / Root cause / Impact / Severity / Fix / Validation table |
| 15 | Remediation | Code + (when needed) migration changes implemented; existing architecture preserved |

Output document tree (added to repo):
```
docs/audit-2026-06-07/
├── 00-executive-summary.md
├── 01-inventory.md
├── 02-data-flow-trace.md
├── 03-intent-pipeline.md
├── 04-symbolic-graph-map.md
├── 05-rule-engine-coverage.md
├── 06-confidence-pipeline.md          ← deepest, with field-level trace
├── 07-land-context.md
├── 08-crop-schedule.md
├── 09-database-audit.md
├── 10-llm-boundary.md
├── 11-multi-tenant.md
├── 12-reliability.md
├── 13-agronomic-accuracy.md
├── 14-root-cause-report.md            ← canonical RCA table
└── 15-production-readiness-checklist.md
```

---

## C. Remediation (implemented in build mode, architecture preserved)

### C1. Confidence pipeline repair (fixes Critical #1 in full)
1. **`ui-response-builder.ts:195`** — rewrite with explicit precedence and numeric-first resolution:
   ```ts
   const confidence =
     typeof safeMeta.confidence === 'number' ? safeMeta.confidence :
     safeGate.confidence_level ? parseConfidenceLevel(safeGate.confidence_level) :
     typeof safeDecision.confidence_score === 'number' ? safeDecision.confidence_score :
     0.5;
   ```
2. **`index.ts:1334-1372`** — read confidence with full fallback chain (`weighted_confidence ?? confidence_score ?? rule_confidence ?? hypothesis_score ?? primary_decision.score`) and, when the invariant fires, mutate the **single source** `symbolicConfidence` (not just gate input) so metadata + DB + UI all carry the floor.
3. **Persistence** — locate every writer to `ai_decision_log` (search `decision_type`, `confidence_score`, audit-logger usage) and ensure each one writes `confidence_score` (0–1 float per the standard memory). Add a DB-side guard: write `hypothesis_score` separately for hypothesis-evaluator output.
4. **Frontend** — verify `DecisionBrainCards.tsx:347`, `FarmerMessageCard`, `CanonicalAdvisoryCard` consume the same shape. Existing test (`__tests__/CanonicalAdvisoryCard.test.tsx`) is the contract; extend with cases for missing `confidence` and `confidence_level=null` so this regresses if reintroduced.
5. **Migration (additive, no destructive change)** — add `symbolic_confidence numeric` to `ai_decision_log` as an alias-write (or backfill from `confidence_score`) so log queries that already use that name continue to work. Skipped if you tell me to keep schema frozen for confidence; pure code path will still ship correct values.

### C2. Crop-schedule / active-state hardening (fixes Critical #2 root cause class)
1. In `decision/authoritative-state-loader.ts`, when `crop_schedules.status IN ('HARVESTED','COMPLETED')` or `actual_harvest_date IS NOT NULL`, force `LandContext.status = 'NO_ACTIVE_CROP'` and expose `last_harvested_schedule` (some of this work already exists from the prior fix — verify and complete).
2. In `agents/orchestrator.ts`, before entering diagnostic path, short-circuit on `NO_ACTIVE_CROP` and route to static-data-gate's last-harvest responder. Block rule-engine execution for harvested lands except for `POST_HARVEST_*` rule categories.
3. Add invariant: `cropContextStatus === 'NO_ACTIVE_CROP' && rulesFired.some(category !== 'POST_HARVEST_*')` → log `SYMBOLIC_CONTRACT_VIOLATION` and force monitoring response.

### C3. Intent classifier coverage
Extend `agents/intent-classifier.ts` + `bundled-rules/canonical/` with the regex/lexicon expansion identified in the earlier audit (mr/hi past-tense crop-lookup, romanized variants), plus add `LAND_INFO` and `POST_HARVEST_INFO` as first-class intents that bypass diagnostic flow.

### C4. LLM boundary tightening
`agents/llm-response-formatter.ts` already has `validateLLMOutput`. Add unit tests for: (a) LLM output mentioning a product not in `symbolic_decision.products` → reject; (b) LLM output overriding dosage → reject; (c) LLM inventing `confidence` → strip. Wire the rejection path to fall back to deterministic builder, not to a generic message.

### C5. Multi-tenant guard
Add a single `assertTenantScope(tenantId, query)` helper used by every direct DB call in `ai-agriculture-chat`. Verify `tenant_id` filter present on `lands`, `crop_schedules`, `ai_chat_sessions`, `ai_decision_log`, `farmer_alerts`.

### C6. Observability
Add a single structured log line at the end of every chat request: `{ trace_id, intent, route, rules_fired, confidence_raw, confidence_final, gate_mode, response_mode, persisted_confidence_score, ms }`. This is the audit-grade signal we currently lack.

---

## D. Validation suite (added under `tests/chat/`)

1. `confidence-bridge.test.ts` — feeds 6 representative `decision_output` shapes, asserts each surface (UI, gate input, persisted row, metadata) carries the same non-zero confidence.
2. `precedence-regression.test.ts` — guards the `ui-response-builder.ts:195` fix.
3. `harvested-land.test.ts` — schedule with `actual_harvest_date` set → diagnostic path forbidden, last-harvest answer returned.
4. `intent-coverage.test.ts` — mr/hi/en/Hinglish crop-lookup, pest-id, fertilizer-question, weather-question classify to expected intents.
5. `multi-tenant.test.ts` — query with foreign tenant_id returns empty / 403.
6. `llm-boundary.test.ts` — LLM output containing unauthorized product is rejected and deterministic fallback wins.
7. `tests/db/ai-decision-log.test.ts` — every writer persists `confidence_score` in 0..1 and `hypothesis_score` when available.

---

## E. Risk & rollback

- Migration (C1.5) is additive; no destructive change. Roll back by dropping the new column.
- All code fixes are localized (no orchestrator architecture change). Rollback = single revert.
- Frontend already exists with the same field names — no breaking contract change.

---

## F. Success criteria (matches your "Success Criteria" section)

| Goal | How verified |
|---|---|
| Confidence populated correctly across UI/DB/logs | `confidence-bridge.test.ts` + manual trace on next live query |
| No response with false `confidence=0` | INVARIANT log silent; production readiness checklist green |
| Correct land context loading | `harvested-land.test.ts` + land-context-resolution log trace |
| Correct crop lifecycle understanding | `harvested-land.test.ts` + DB invariant probe |
| Correct symbolic rule execution | `05-rule-engine-coverage.md` shows 100% rule reachability |
| No LLM-generated decisions | `llm-boundary.test.ts` green; LLM output validation gate logs zero overrides |
| No tenant leakage | `multi-tenant.test.ts` green |
| Full traceability | Single structured log line per request, plus `evaluation_trace` jsonb |

---

## G. Out of scope (explicit)

- No replacement of the symbolic engine, graph topology, or orchestrator. No new framework.
- No frontend redesign — only `ui-response-builder.ts` (backend) and component test additions.
- No rule data edits in `decision_rules` / `observation_master` rows; engine code changes only. (Per your boundary answer.)

---

## H. What I'll do in build mode (in order)

1. Land the audit doc skeleton (`docs/audit-2026-06-07/*`) populated from this exploration.
2. Run the deeper traces for Phases 2–9 and fill those docs from live code + recent log signals.
3. Apply C1 → C2 → C3 → C4 → C5 → C6 fixes in that order, deploying the edge function after each step and capturing before/after evidence in `14-root-cause-report.md`.
4. Add the tests in §D.
5. Produce `15-production-readiness-checklist.md` with the final readiness score.

Approve to proceed; the audit docs and fixes land in the order above.
