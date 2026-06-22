
# KisanShakti Neuro-Symbolic Brain — Forensic Audit v2 (Read-Only, Phase 1)

## CRITICAL INSTRUCTION (top-level)
**Do NOT begin proposing fixes.** Phase 1 is forensic investigation only.
For every finding, the report MUST contain, in order:
1. **Proof the defect exists** (file:line, table+row, log entry, or trace ID)
2. **Quantified impact** (count, %, farmers affected, $/risk)
3. **Evidence artifact** (SQL output, log dump, rg hit, replay trace — saved under `/mnt/documents/audit/evidence/`)
4. **Root cause** (which layer, which contract violation)

Any recommendation without all four is invalid and must be removed. No fixes, no migrations, no edge redeploys, no `mem://` writes. Refactor proposals are deferred to Phase 2 (separate plan).

## Mandate
Independently verify every layer. DB is single source of truth. LLM is restricted to translation/narration. Existing implementation is suspect until proven correct. Scope: all 12 crops, all gates, all rules, all hypotheses, all observations.

## Audit Workstreams (run in parallel via subagents where possible)

### Tier A — Structural Audits
- **WS1 — Database Integrity & Coverage.** Tables: `observation_master`, `observation_aliases/translations/differential_questions`, `observation_intent_master`, `intent_observation_mapping`, `intent_assertion_pattern`, `hypothesis_master/conditions/rule_mapping/contradictions`, `decision_rules`, `crop_stage_master`, `crops`, `crop_baseline_guidelines_v2`, `lands`, `land_crops`, `soil_health`, weather_*, ndvi_*, `proactive_rules`, `ai_chat_*`, `master_products`, `chemical_regulatory_status`. Checks: orphan FKs, dead rows, duplicate/contradictory mappings, missing translations, coverage matrix (crop × stage × zone × intent), `_fa_*` residue.
- **WS2 — Symbolic Reasoning Graph Reconstruction.** Trace Query → Intent → Observation Extraction → Validation → Observation Graph → Hypothesis Gen → Scoring → Differential → Rule Match → Gate → Safety → Recommendation → Narration across `supabase/functions/ai-agriculture-chat/**`. Output drop-point + gate-override + contradiction maps.
- **WS3 — Neuro-Symbolic Architecture Benchmark.** Score 0–10 vs gold-standard NS systems on KR, Observation Graph, Hypothesis Graph, Rule Graph, Contradiction Handling, Confidence Propagation, Explainability, Causal, Temporal, Multi-turn.
- **WS4 — Land Intelligence Flow.** Land → Crop → Variety → Sowing → DAS → Soil → NDVI → Weather → Schedule → History. Per input: source table, retrieval file:line, transformation, consumption, decision impact. Flag unused fields.
- **WS5 — Observation System Reachability.** Per `observation_master` row: alias/translation/diff-question/intent/hypothesis/rule linkage + production usage (`ai_chat_messages`, `ai_decision_log`). Dead/unreachable/unused lists.
- **WS6 — Hypothesis Engine.** Per hypothesis: conditions, observation links, rule mappings, contradiction mappings, confidence model. Ranked dead/unreachable/duplicate/weak/contradictory lists.
- **WS7 — Decision Rules.** Per rule: executable, reachable, agronomically valid, ICAR-compliant, stage/crop/weather/soil-aware. Cross-check `decision_rules.category` ↔ `mapBundledCategory` (per core memory) + `rule_quality_metrics`, `rule_conflict_matrix`, `rule_lineage`.
- **WS8 — AI Chat Trace Analysis.** From `ai_chat_messages` + `ai_decision_log` + `ai_chat_audit_logs` + `hallucination_detection_logs`: reconstruct Query → Intent → Observations → Hypotheses → Rules → Gate → Response for recent failures. Symbolic pipeline blamed first, LLM last.
- **WS9 — Proactive Alert Engine.** Verify alerts derive from Land+Weather+Stage+NDVI+Soil+Schedule+Rule engine. Scan `proactive_rules`, `proactive_evaluation_log`, `proactive_events`, `proactive_alerts`, `supabase/functions/proactive-*/**` for hardcoded thresholds/text.
- **WS10 — Hardcoded Logic Sweep.** `rg` across `supabase/functions/**` + `src/**` for hardcoded crop/disease/pest/fertilizer names, weather/NDVI/stage thresholds, hardcoded advisory copy. Every hit = defect.
- **WS11 — World-Class Gap Analysis.** Score KG completeness, Observation/Hypothesis/Rule graph quality, Explainability, Multi-turn, Temporal, Proactive, Confidence, Contradiction.

### Tier B — Behavioural & Runtime Audits (NEW — added per v2 feedback)
- **WS13 — Runtime Reachability Audit.** For every observation/hypothesis/rule/contradiction/gate measure the funnel:
  ```text
  Exists in DB → Loaded into memory → Participates in reasoning → Produces decision impact → Appears in farmer response
  ```
  Cross-join DB inventory against `ai_decision_log`, edge-function logs, and orchestrator instrumentation over last 30–90 days. Output: **Observation/Hypothesis/Rule/Gate Reachability %** + per-entity funnel-drop table. This is the single most important audit — many DB rows never execute.
- **WS14 — Confidence Propagation Audit.** Trace `Intent Conf → Observation Conf → Hypothesis Conf → Differential Conf → Rule Conf → Decision Conf → Response Conf` across a sampled set of real traces. Detect **inflation, collapse, reset, override** events at each boundary. Output: **Top 20 confidence-corruption points** with file:line + trace IDs. Cross-reference with `mem://logic/confidence-scoring-and-migration-standard` and `mem://architecture/symbolic-confidence-ssot-authority`.
- **WS15 — Crop Coverage & Bias Audit.** Per crop (all 12): counts of observations, hypotheses, rules, proactive alerts, schedules, varieties, NDVI models, soil logic. Compute **Crop Readiness Score 0–10** and surface dominance/bias (e.g., sugarcane over-indexing, wheat under-indexing). Output crop-readiness CSV + heatmap.
- **WS16 — Gate Dominance Analysis.** For every gate (`decision-readiness-gate`, `unified-decision-gate`, `prescription-gate`, `etl-gate`, `weather-gate`, `safety-gate`, `clarification-invariant-gate` if present): count rules allowed / blocked / downgraded / overridden, plus false-positive and false-negative rates derived from WS19 golden cases. Output: **Gate Impact Matrix**.
- **WS17 — Knowledge Graph Connectivity Audit.** Treat the brain as a graph: Observation → Hypothesis → Rule → Rule → Gate → Action. Build adjacency from `intent_observation_mapping`, `hypothesis_conditions`, `hypothesis_rule_mapping`, `hypothesis_contradictions`, `rule_conflict_matrix`. Compute orphan nodes, weakly-connected nodes, dead clusters, isolated subgraphs, single-point-of-failure nodes (high betweenness). Output: **Knowledge Graph Health Score** + Mermaid + `.graphml` artifact.
- **WS18 — Proactive Intelligence Validation.** Replay last 90 days of weather/NDVI/soil/stage against `proactive_rules`. For each (land × day): should-have-alerted vs did-alert. Output **Precision, Recall, False-Alert Rate, Missed-Alert Rate** per rule and per crop. Cross-check `proactive_evaluation_log` for silent failures.
- **WS19 — Golden Dataset Construction.** Build **200–500 verified farmer cases** spanning all 12 crops × all stages × all major intents (emergence-failure, nutrient, biotic, abiotic, harvest, market). Each case: query (multilingual), authoritative observations, expected hypothesis, expected rule, expected decision, expected clarification path. Source from real `ai_chat_messages` + agronomist-curated synthetic cases. Persist to `/mnt/documents/audit/golden-corpus/` as JSONL. Becomes the permanent regression benchmark.
- **WS20 — Reference Architecture Comparison.** Score the brain against five explicit reference architectures: Clinical Decision Support (e.g., DXplain/Isabel), IBM Watson-style evidence graphs, Industrial Fault Diagnosis engines, Causal Bayesian networks, classical Knowledge Graph expert systems. Dimensions: Reasoning Depth, Explainability, Temporal Logic, Contradiction Resolution, Scalability.

### Tier C — Synthesis
- **WS12 — Root Cause Synthesis.** Merge WS1–WS11 + WS13–WS20 into **Top 20 Root Causes**, ranked by Farmer Impact × Agronomic Risk × Frequency × Production Severity. Each entry carries the mandatory four-part evidence packet. No generic refactors. No solution mode.

## Tooling
- `supabase--read_query` — coverage matrices, orphan joins, dead-rule/hypothesis/observation detection, reachability funnels.
- `supabase--analytics_query` + `supabase--edge_function_logs` — runtime reachability (WS13), confidence propagation (WS14), gate dominance (WS16), proactive validation (WS18).
- `supabase--linter` — security/config flags.
- `rg` — hardcoded-logic sweep (WS10).
- `acp_subagent--explore` — parallelize WS2, WS4–WS7, WS10, WS13, WS14, WS17.
- Python (networkx) under `/mnt/documents/audit/scripts/` — WS17 graph metrics + WS19 corpus generation.

## Deliverables (`/mnt/documents/audit/`)
1. `01-current-architecture.md` (+ `.mmd`)
2. `02-data-flow.md` (+ `.mmd`)
3. `03-knowledge-graph.md` (+ `.mmd`, + `.graphml` from WS17)
4. `04-root-cause-analysis.md` (Top 20, evidence-backed)
5. `05-gap-analysis.md` (WS11 + WS20 scores 0–10)
6. `06-top-20-defects.md`
7. `07-agronomic-risk-assessment.md`
8. `08-production-readiness-score.md` — Agronomic Accuracy, NS Architecture, Explainability, Reliability, Scalability, AI Chat Quality, Proactive Alert Quality, **Runtime Reachability % (WS13)**, **Confidence Integrity (WS14)**, **Crop Readiness per-crop (WS15)**, **Gate Health (WS16)**, **Graph Health (WS17)**, **Proactive Precision/Recall (WS18)**, Overall.
9. `09-refactor-blueprint.md` — proposal only, deferred to Phase 2 approval.
10. `10-target-architecture.md` — future-state brain for 1M+ farmers.

**Evidence appendix (`/mnt/documents/audit/evidence/`)**: SQL outputs, trace dumps, rg hit lists, coverage CSVs, reachability funnels, confidence-trace JSON, gate matrices, graph metrics, proactive replay results, golden corpus JSONL.

## Out of Scope (Phase 1)
- No file edits, no migrations, no edge redeploys, no `mem://` writes.
- No fix proposals outside `09-refactor-blueprint.md`, and even those are proposals — never executed in Phase 1.
- No solution-mode commentary anywhere in WS1–WS20 outputs.

## Acceptance
You receive all 10 reports + complete evidence appendix + golden corpus. Production Readiness Score includes the seven new dimensions (Runtime Reachability, Confidence Integrity, Crop Readiness, Gate Health, Graph Health, Proactive Precision/Recall, Reference-Architecture Parity). You then approve Phase 2 refactors in a separate plan.
