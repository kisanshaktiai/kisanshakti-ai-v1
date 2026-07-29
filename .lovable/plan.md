## Forensic Audit — Actual Runtime Data Pipeline (read-only, no code changed)

Scope: `supabase/functions/ai-agriculture-chat/`. Every claim below has a file:line from the code, not the schema.

---

### 1. Actual call graph

| Step | Intended | Actual entry point (file:line / fn) |
|---|---|---|
| 0 | HTTP | `index.ts:394` `Deno.serve` → `index.ts:1119` `orch.orchestrate()` |
| 1–2 | Native text → normalize/translate | `agents/orchestrator.ts:3792` `normalizeLanguage()` → `agents/language-normalizer.ts` |
| 3 | Intent + confidence | `orchestrator.ts:3848` `extractSemanticMeaning()` → `agents/semantic-extractor.ts:117` → `classifyFarmerIntent()` (`agents/intent-classifier.ts`, imported `semantic-extractor.ts:22`). Intent chosen at `orchestrator.ts:7545-7548` |
| 4 | Candidate observations | `orchestrator.ts:7932` `loadClarificationCandidates()` → `runtime/clarification-contract.ts:100` → `decision/hypothesis-clarification-builder.ts` (queries `hypothesis_conditions`/`hypothesis_master` at `:319,:335,:475,:653`) |
| 5 | Farmer selects | `orchestrator.ts:2569-2578` (`option_selected=true`, `awaiting_clarification → decision_in_progress`) → `orchestrator.ts:2840` `resolveHypothesesFromObservations()` |
| 6 | Confidence update | `decision/evidence-confidence.ts:159` `scoreEvidenceSet` (wired `orchestrator.ts:824`) |
| 7 | hypothesis_conditions → hypothesis_master | `decision/hypothesis-graph-evaluator.ts:855,906,944` |
| 8 | Biological gates | `hypothesis-graph-evaluator.ts:367` (BIO_STAGE_AUTHORITY), `:421` soft/hard stage gate, APPLICABILITY_GATE |
| 9 | hypothesis_rule_mapping → decision_rules | `hypothesis-graph-evaluator.ts:997` and `agents/layered-rule-evaluator.ts:1957` |
| 10 | Conflict resolution / decision | `agents/conflict-resolver.ts`, `decision/unified-decision-gate.ts:531`, `agents/deterministic-response-builder.ts` |
| 11 | LLM narration | `index.ts:2297` → `agents/llm-response-formatter.ts:286` `formatRecommendationsWithLLM()` |

The intended flow does exist end-to-end. The problems are everything running *beside* it.

---

### 2. Divergences from the intended pipeline

**D1 — Step 3 has two competing intent producers.** `agents/nlu-agent.ts` is declared pure perception (`nlu-agent.ts:52`, always emits `primary_intent:'UNKNOWN'` at `:572`) yet still computes its own confidence (`nlu-agent.ts:391-427`), and the orchestrator calls it (`orchestrator.ts:7429`, `:11278`) before preferring `semanticExtraction.intent_code`. A third scorer, `agents/query-router.ts:297-425`, assigns hardcoded intent confidences (0.95/0.85/0.7/0.5) with no DB backing.

**D2 — Step 4 does not use `observation_intent_master` + `intent_observation_mapping` + `intent_assertion_pattern` as the generator.** Candidates are synthesized from `hypothesis_conditions`; IOM is only a "discovery seed" (`runtime/clarification-contract.ts:14-16`) and, per the current architecture, a weight not a filter. `intent_assertion_pattern` is read in exactly **one** place — `runtime/contradiction-engine.ts:133` — and that file states the compatibility columns it wants are absent, so the intended assertion-pattern gating is effectively inert.

**D3 — Step 11 gating is post-hoc, not preventive.** `llm-response-formatter.ts:1625` takes the deterministic path only when `primary && primary.rule_id && hasAdequateRuleContent(richData)`. Otherwise it still builds an LLM prompt; the only protection is the SOURCE VALIDATION GATE after the call (`index.ts:2308-2317`), which downgrades to a template only if `validation_passed === false`.

**D4 — Hardcoded confidence floor at the exit.** Final `metadata.confidence` = `diagnosticState.hypotheses?.[0]?.confidence || 0.7` (`orchestrator.ts:11232`). A graph that produced nothing still reports 0.7.

---

### 3. Duplicate / parallel execution paths

- **Three live hypothesis producers.** (a) `decision/hypothesis-graph-evaluator.ts` (DB graph, authoritative); (b) `decision/causal-hypothesis-engine.ts` — *is* live, imported at `orchestrator.ts:441` as `runCausalHypothesisArbitration`, and independently queries `hypothesis_master`/`hypothesis_conditions`/`hypothesis_rule_mapping` (`:244,:270,:276`); (c) `decision/symbolic-reasoner.ts` — *is* live as a value import in `agents/layered-rule-evaluator.ts:62` and `layers/rule-evaluation-layer.ts:18`, and derives its own hypothesis map from fired rules (`symbolic-reasoner.ts:1619,1679`) with no `hypothesis_conditions` read at all. That third path is the one that can produce a hypothesis the graph never authorized.
- **Two rule loaders.** `bundled-rules/loader.ts:129` bulk-loads the whole active `decision_rules` table into memory, which `layered-rule-evaluator` then filters — in parallel with the HRM-scoped path.
- **Two decision-graph entries.** `agents/decision-graph-bridge.ts` `evaluateDecisionGraph` is reached from `agents/diagnostic-flow-controller.ts:460,519` and `agents/rule-engine-executor.ts:152`, independently of the graph evaluator.

---

### 4. Modules bypassing `hypothesis_rule_mapping`

Only two call sites honor the edge (`hypothesis-graph-evaluator.ts:997`, `layered-rule-evaluator.ts:1957`). These reach `decision_rules` without it:

- `agents/orchestrator.ts:2773` (confirmed-rule lookup), `agents/orchestrator.ts:10740` (universal fallback)
- `decision/symbolic-reasoner.ts:682`
- `decision/hypothesis-evaluator.ts:850` (bulk paginated load)
- `agents/generic-multi-match-detector.ts:179,400`
- `agents/canonical-observation-loader.ts:396` (crop/stage filter)
- `agents/biological-state.ts:340` (category filter only)
- `bundled-rules/loader.ts:129` (whole table)
- Non-decisional, acceptable: `i18n/translation-loader.ts:263`, `utils/llm-output-validator.ts:209`, `decision/pipeline-self-check.ts:88`

Note `agents/layered-rule-evaluator.ts:1913` explicitly forbids the `decision_rules.hypothesis_code` fallback — but the loaders above sidestep the edge by filtering on crop/stage/rule_id instead, achieving the same masking of curation gaps.

---

### 5. Confidence computation / overwrite / reset points

| Site | Behaviour |
|---|---|
| `agents/nlu-agent.ts:391-427,522` | perception confidence seeded at 0.5, heuristically raised by script/word counts |
| `agents/intent-classifier.ts:273,287` | LLM confidence, defaults 0.6 / 0.5 on retry |
| `agents/query-router.ts:297-425` | hardcoded ladder, terminal `result.confidence = 0.5` |
| `agents/nlp-agriculture-validator.ts:587` | hard **reset** `result.confidence = 0.1` |
| `decision/evidence-confidence.ts:159` | intended Step-6 stage: product of five weights |
| `decision/hypothesis-graph-evaluator.ts:593-594` | graph score; `:691` hard **reset** `c.confidence = 0` on elimination |
| `decision/symbolic-reasoner.ts:1619,1679` | **overwrites** graph confidence: `+= conf*0.2`, then `Math.max(confidence, hypotheses[0].confidence)` |
| `decision/confidence-calculator.ts:210,214` | recomputes from fired-rule count, then `Math.max` with diagnosis |
| `agents/multimodal-fusion.ts:276-339` | re-derives from text understanding |
| `index.ts:1999-2004` | ConfidenceBridge maps symbolic → decision confidence; logs an invariant breach rather than failing |
| `agents/orchestrator.ts:11232` | final **fallback 0.7** |

`decision/confidence-chain.ts` / `decision/request-context.ts` exist as the intended single backbone but are only consumed as optional fields in `semantic-validator.ts:44` and `scientific-validator.ts:49` — they do not gate anything.

---

### Proposed follow-up (not executed)

If you want repairs, I'd batch them: **B1** collapse the three hypothesis producers to graph-only (behaviour-preserving under logging first); **B2** make `hypothesis_rule_mapping` mandatory for every decisional `decision_rules` read; **B3** make `ConfidenceChain` the only writer and delete the 0.7/0.5/0.1 constants; **B4** turn the formatter gate preventive. Tell me which batches to run.
