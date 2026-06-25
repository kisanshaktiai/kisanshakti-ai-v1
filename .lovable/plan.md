# Single-Phase Runtime Repair Plan — Neuro-Symbolic Decision Brain

Scope: Tasks 1–7 from the Master Forensic Audit Prompt, executed as ONE surgical
phase ("Phase G — Runtime Hardening"). No schema, contract, agent, or
architectural changes. Edits are confined to existing files in
`supabase/functions/ai-agriculture-chat/**` plus `decision/**` modules already
created during Phases A–F.

──────────────────────────────────────────────────────────────────────────────
## Guiding Order of Authority (locked, applies to every fix)
1. Intent Match (rule_intent == active intent)
2. Semantic Match (observation/diagnosis category match)
3. Hypothesis Match (causal hypothesis ↔ rule)
4. Scientific Validation (baseline bounds)
5. Generic rule (allowed only if 1–3 all empty)

──────────────────────────────────────────────────────────────────────────────
## Work Items (executed atomically in one phase)

### G1 — Rule Ranking (Task 1, P0)
File: `agents/layered-rule-evaluator.ts`, `agents/orchestrator.ts`,
`bundled-rules/loader.ts`.
- Before argmax, partition `scored[]` into 3 tiers:
  tier-0 = intent-matched & semantic-matched,
  tier-1 = intent-matched OR semantic-matched,
  tier-2 = generic (`_genericPenalty===true`).
- Argmax runs ONLY in the highest non-empty tier. Generic rules cannot beat
  intent-specific even with higher evidence score.
- Emit `[BRAIN_TRACE][RULE_TIER]` log: candidates per tier, winner tier.
- Increase generic penalty floor: if active intent is `EMERGENCE_FAILURE`,
  exclude any rule whose `rule_intent` ∈ {`CYCLONE_RECOVERY`,`STRESS_RECOVERY`}
  outright (intent-incompatibility list driven by data already present in
  decision_rules; no hardcoded agronomy beyond intent IDs).

Acceptance: Marathi "भात अजून उगवले नाही" never selects
`RICE_STRESS_CYCLONE_RECOVERY_001`.

### G2 — Action Extraction (Task 2, P0)
Files: `agents/deterministic-response-builder.ts`,
`agents/orchestrator.ts` (response projection block), `agents/response-shaper.ts`
(if present).
- Audit the path `primary_decision → builder → actions[]`. Identify the
  serialization stage that drops actions when `best.action_text` is non-null
  but action object is empty.
- Guarantee: if `primary_decision.rule_id` is set, builder MUST emit at least
  one `RecommendedAction` derived from `action_text`/`action_code`. Add a
  defensive coalescer that wraps `action_text` into a minimal action object
  when the structured projection yields zero items.
- Emit `[BRAIN_TRACE][BUILDER] approved=<n> actions=<n>` and a
  `[BRAIN_TRACE][ACTION_LOSS]` warning when approved>0 but actions=0.

Acceptance: zero `Actions Returned = 0` for approved rules.

### G3 — Scientific Baseline Validation (Task 3)
Files: `utils/baseline-guidelines-cache.ts`,
`decision/scientific-validator.ts`, `agents/orchestrator.ts` preload block.
- Make preload **fail-loud, not silent**: surface
  `[BASELINE] ❌ Load failed` with row count = 0 to ledger.
- In `scientific-validator.ts` `pickBaseline`: log the fallback reason
  (`NO_CACHE`, `NO_CROP_KEY`, `STAGE_MISS`, `DAS_MISS`, `FIRST_AVAILABLE`).
- Remove the `cropMinAge=120` hardcoded default from any caller; route through
  `getBaselineForCrop` and only fall back when ledger records
  `NO_BASELINE_FOR_CROP`.

Acceptance: `crop_baseline_guidelines_v2` rows participate in every
recommendation; fallbacks always log a reason.

### G4 — Knowledge Loader Failure (Task 4)
Files: `agents/orchestrator.ts` preload block, `utils/agro-zone-cache.ts`,
`utils/crop-synonyms-cache.ts`.
- Replace the swallow-all try/catch with `Promise.allSettled` so a single
  failed cache does not mask others.
- For each rejection, emit
  `[KNOWLEDGE_PRELOAD] <module> FAILED: <message>` AND record a ledger
  entry; remaining caches still load.
- Verify `agro-zone-cache.ts` import path + exported symbol `loadAgroZones`
  matches the dynamic import; fix path mismatch (`.ts` extension consistency).

Acceptance: all 4 caches initialize; partial failures isolated and visible.

### G5 — Market Product SQL Bug (Task 5)
File: `services/market-product-lookup.ts` (or equivalent under
`agents/recommendation/`).
- Remove the `ilike` filter on a `jsonb` column (`jsonb ~~*` error).
- Two-step query: select candidate rows by indexed scalar columns, then
  filter the JSONB payload in-memory with a case-insensitive substring
  check (`String(v).toLowerCase().includes(q)`).
- No schema or RPC changes.

Acceptance: product lookup completes without `operator does not exist` errors.

### G6 — Stage Provenance (Task 6)
Files: `utils/stage-normalizer.ts`, `utils/stage-knowledge-cache.ts`,
`agents/orchestrator.ts` (canonical state assembly).
- One authority: `stage-knowledge-cache` → `crop_stage_master`.
- Remove the legacy `Stage Source: UNKNOWN` log path; replace with the cache
  result. When cache miss, emit ONE log:
  `[STAGE_SSOT] source=crop_stage_master result=MISS fallback=<reason>`.
- `canonicalState.stage_source` is set exactly once and propagated.

Acceptance: each request reports a single stage provenance value.

### G7 — Runtime Verification & Brain Trace (Task 7 + logging)
File: `agents/orchestrator.ts`.
- Add a single emit point at end-of-pipeline that prints
  `[BRAIN_TRACE]` with: Intent, Semantic count, Hypothesis, Rule candidate
  count per tier, winning rule + score, scientific approved/rejected,
  authority decision, builder action count, translation status, total ms.
- Add lightweight regression harness file `scripts/regression-fixtures.md`
  listing 7 canonical conversations (emergence, germination, irrigation,
  pest, disease, nutrient, weather) and the expected winning rule family.
  No code execution required at deploy; harness is for QA reference.

──────────────────────────────────────────────────────────────────────────────
## Sequenced Edit Order (single phase, top-down)
1. `utils/baseline-guidelines-cache.ts` — fallback reason logging.
2. `decision/scientific-validator.ts` — pickBaseline reason emission.
3. `utils/agro-zone-cache.ts` import sanity + `orchestrator.ts` preload →
   `Promise.allSettled` + per-cache logs.
4. `services/market-product-lookup.ts` — JSONB query rewrite.
5. `utils/stage-normalizer.ts` + `orchestrator.ts` — single provenance.
6. `agents/layered-rule-evaluator.ts` — tiered argmax + intent-incompat list.
7. `agents/deterministic-response-builder.ts` + orchestrator projection —
   action coalescer + ACTION_LOSS guard.
8. `agents/orchestrator.ts` — final `[BRAIN_TRACE]` emit block.
9. `scripts/regression-fixtures.md` — QA list.

## Non-Goals (explicit)
- No new tables, columns, RPCs, agents, or API fields.
- No LLM re-routing of decisions.
- No hardcoded agronomic constants beyond intent-incompatibility IDs.

## Acceptance Gate (all must be true before sign-off)
- [ ] EMERGENCE_FAILURE → never cyclone recovery.
- [ ] Intent-specific rules outrank generic stress rules.
- [ ] Every approved rule yields ≥1 action.
- [ ] Zero `Actions Returned = 0` on approved.
- [ ] `crop_baseline_guidelines_v2` actively consulted; fallbacks logged.
- [ ] All knowledge caches load (or fail loudly + isolated).
- [ ] Market product lookup error-free.
- [ ] Exactly one stage source per request.
- [ ] `[BRAIN_TRACE]` present for every request.
- [ ] No schema / contract / architecture changes.
