
# AI Chat Latency Forensic Audit (read-only, no code changed)

## 0. Measured regression (hard evidence, `ai_chat_audit_logs.processing_time_ms`)

| Day | turns | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| 2026-06-24 | 18 | 10,142 | 16,456 | 16,710 |
| 2026-07-05 | 40 | 9,344 | 14,168 | 33,811 |
| 2026-07-09 | 38 | 29,472 | 43,867 | 46,712 |
| 2026-07-25 | 17 | 30,903 | 60,385 | 66,194 |
| 2026-07-27 | 13 | 46,598 | 67,807 | 69,609 |
| 2026-07-28 | 9 | 44,498 | 82,641 | 87,681 |
| 2026-07-29 | 2 | 68,608 | 70,969 | 71,231 |

~5-7x regression, stepping up around Jul 8-9 and again Jul 25-27 (the graph-gate / SSOT patch series).

Split by response source, last 7 days:
- `CLARIFICATION` — 35 turns, **avg 44.8 s**
- `SYMBOLIC_TEMPLATE` — 36 turns, **avg 37.7 s**, `llm_model_used = NULL`

This is decisive: **clarification turns run no narration LLM yet still cost 45 s**, and every "final answer" turn in the window fell back to the template (LLM formatter produced nothing). So the slowdown is **not** in narration quality — it is symbolic-path work plus burned LLM timeout budget.

## 1. Real request path
`index.ts:394 serve()` → `runPipelineSelfCheck` (`index.ts:408`) → auth/quota (`549`) → session resolve (`589/638/724`) → history load (`790`) → `orch.orchestrate()` (`index.ts:1119`) → cache preloads (`orchestrator.ts:1367,1371,1687,1696`) → land context (`1816`) → semantic extraction (`3851`) → observation bridge/alias (`2809, 3874, 6234`) → `resolveHypothesesFromObservations` (`2843`) → `evaluateHypothesisGraph` (`6363`) → `runGraphRuntime` (`6722`) → rules (`3114, 8767, 10743`) → clarification builders (`2931, 3015, 6911, 7151, 7836`) → return → `ensureObservationSelectorContract` (`index.ts:1177`, again `2183`) → `formatRecommendationsWithLLM` (`index.ts:2302`) → persist (`2571/2597`).

## 2. Bottlenecks, ordered by latency impact

**B1 — LLM formatter tier cascade (up to ~56 s, currently mostly wasted).**
`agents/llm-response-formatter.ts:610-650`: OpenAI 20 s timeout → sleep 3 s → Gemini 18 s → sleep 3 s → Lovable 12 s → template fallback (`656`). The 36 `SYMBOLIC_TEMPLATE` rows with `llm_model_used = NULL` prove the full cascade is being paid and then discarded. `index.ts:2302` races it against `remainingTime-2000`, so the turn simply burns until the outer budget expires.

**B2 — Repeated full graph traversals inside one turn.**
`evaluateHypothesisGraph` is invoked from `orchestrator.ts:6363`, from `runGraphRuntime` (`6722`), and again inside `hypothesis-clarification-builder.ts:291`; `resolveHypothesesFromObservations` runs at `orchestrator.ts:2843` and `builder:274`. Each traversal is 6+ sequential DB round-trips (`hypothesis-graph-evaluator.ts:341,357,360,373,376,660,905,943,969,996`). Clarification turns therefore pay the graph 2-3x.

**B3 — Full-table `decision_rules` reads, 13 call sites.**
`pg_stat_statements`: `SELECT decision_rules.*` — 402 calls @ **334 ms**, and an unfiltered variant 339 calls @ **338 ms** (~250 s total). Sites: `bundled-rules/loader.ts:129`, `symbolic-reasoner.ts:682`, `hypothesis-graph-evaluator.ts:970`, `hypothesis-evaluator.ts:850`, `orchestrator.ts:2776,10743`, `canonical-observation-loader.ts:396`, `generic-multi-match-detector.ts:179,400`, `llm-output-validator.ts:209`, `biological-state.ts:340`, `translation-loader.ts:263`, `pipeline-self-check.ts:88`. `getAllRulesWithBundled` (`layered-rule-evaluator.ts:1305`) is called twice per turn (`orchestrator.ts:3114`, `8767`) and re-maps every rule into closures each call — no converted-rule cache (`cachedConvertedRules` declared at `:1297` but never used).

**B4 — Duplicated alias/index warmups across four independent caches.**
`observation_aliases` is loaded by `bundled-rules/loader.ts:1212` (14 paged reads of ~14k rows), `observation-code-mapper.ts:505`, `observation-classification-cache.ts:193`, and `utils/db-ssot/observation-index.ts`. pg_stat: 2,835 + 2,250 + 1,005 calls @ 14-29 ms. TTLs differ (1 h vs 10 min vs 15 min), so refreshes are staggered and land on random farmer turns.

**B5 — Cold-start tax on every isolate.**
`index.ts:408` self-check + `orchestrator.ts:1367-1371,1687-1696` preloads + `stage-knowledge-cache.ts:136-185` (four queries, limits 5k-10k rows) run before any farmer work. With 10-min TTLs and low traffic, most turns are effectively cold.

**B6 — Clarification loop multiplies everything.**
Session `bb9c239e`: **71 turns, 35 of them CLARIFICATION**, avg 41 s. Wall-clock cost to the farmer is loop_length x 45 s, which is the actual perceived slowness. Loop-guard/rescue paths add work: `ensureObservationSelectorContract` runs twice (`index.ts:1177`, `2183`), plus `attemptDbClarificationRescue` (`2081`).

**B7 — NLU retry budget.** `agents/nlu-agent.ts:96-146` — `gpt-4o` (not a mini/flash model), 5 s timeout x 2 attempts + backoff ≈ up to 13 s before `processNLU` (`orchestrator.ts:7432`) returns.

**B8 — Tiered seed expansion re-runs the graph.** `observation-hypothesis-resolver.ts:151-200`: on empty candidates, alias closure runs the graph again, then intent-peers runs it a third time — exactly the path taken on the looping clarification turns.

**B9 — Dynamic imports on the hot path.** ~18 `await import()` inside `orchestrate()` (e.g. `5001, 5760, 6175, 6233, 6338, 6797, 7217, 8647, 9371, 10775`) despite `orchestrator.ts:417` stating static imports only.

## 3. Answers to the specific questions
- **Where is the slowdown?** Not narration quality, not serialization. It is (a) burned LLM timeout budget in the formatter cascade, (b) repeated hypothesis-graph traversal + rule loading per turn, (c) clarification looping multiplying both.
- **Duplicate paths that don't change the answer:** three graph-traversal producers (B2), two rule loaders (B3), four alias caches (B4), double observation-contract pass (B6), shadow-diff loop in `observation-code-mapper.ts:527`.
- **Repeated reads / recomputation in one turn:** `fetchComprehensiveLandContext` at `orchestrator.ts:1816, 2632, 11352`; `fetchWeatherData` at `8119, 8291, 11132`; `getCropVocabulary` at `2046, 2049, 3822, 3825`; `getAllRulesWithBundled` at `3114, 8767`.
- **State leakage / fallback loops:** confirmed loop behavior in B6; no cross-request leak observed after the C1/C2 module-scope removal.
- **Over-broad rule evaluation:** yes — unfiltered `decision_rules` selects (339 calls) and per-call closure rebuild in `convertBundledToRule`.

## 4. Minimal fix batches, ordered by latency impact (not implemented)

**Batch L1 — formatter budget (expected -15 to -35 s/turn).** Single-tier narration with one 8 s timeout; drop the 3 s sleeps; skip the formatter entirely when `response_source` will be CLARIFICATION.

**Batch L2 — one graph traversal per turn (-5 to -12 s).** Memoize `evaluateHypothesisGraph` by `(observation_set, crop, stage, das)` for the turn; have the clarification builder consume the orchestrator's snapshot instead of re-running.

**Batch L3 — rule-load consolidation (-1.5 to -3 s).** Single crop-scoped rule cache; activate `cachedConvertedRules`; remove unfiltered `SELECT decision_rules.*` from non-boot paths.

**Batch L4 — collapse the four alias/observation caches into `utils/db-ssot/observation-index.ts` with one TTL; delete the shadow-diff loop (-0.5 to -2 s, plus fewer TTL-refresh spikes).**

**Batch L5 — per-turn memo for land context, weather, crop vocabulary; make hot-path imports static (-0.5 to -1.5 s).**

**Batch L6 — clarification-loop cap.** Terminate to a decision or structured no-decision after N rounds; this is the largest *perceived* win since it removes whole 45 s turns.

**Batch L7 — swap NLU to a flash/mini model, 1 retry (-3 to -8 s on retry paths).**

Suggested execution order: L1 → L6 → L2 → L3 → L4 → L5 → L7, with `processing_time_ms` p50/p95 re-measured after each batch.
