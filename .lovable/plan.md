# KisanShaktiAI — Full System Deep Audit & P0/P1 Fix Plan

## Goals
Find the **system-wide root causes** (not Rice-specific) of: observation death, clarification-collapse, rule suppression, confidence collapse, stage corruption, and unified-gate/safety-gate overrides. Deliver a complete audit report and ship production-safe fixes for Critical (P0) and Major (P1) defects.

## Deliverables
1. **Audit report** at `.lovable/audits/system-audit-2026-06-22.md` containing:
   - Phase 1 — Architecture execution graph (node × file × function × inputs/outputs × confidence delta × suppression/fallback points)
   - Phase 2 — Observation Survival Matrix (`raw → extracted → mapped → expanded → hypothesis → rule_match → primary → response`) with death-point list
   - Phase 3 — Clarification flow trace and `clarification_selected=true ∧ rules_matched=0` failure inventory
   - Phase 4 — Rule coverage stats per crop (orphan observations / hypotheses, unreachable rules, stage/crop mismatch)
   - Phase 5 — DB integrity report (CSV in `.lovable/audits/db-integrity/`)
   - Phase 6 — Stage Authority Tree + mutation-point list
   - Phase 7 — Authority/Unified-Gate/Safety-Gate suppression trace
   - Phase 8 — Confidence pipeline trace with artificial-drop list
   - Phase 9 — Fallback entry-point inventory
   - Phase 10 — Live simulation results per crop × scenario
2. **Bug ledger** with P0/P1/P2 classification, root cause, impact, repro, fix, file:line.
3. **Implemented fixes** for every P0 and P1 (production-safe; no schema changes unless DB is the defect).

## Methodology

### Phase 1 — Architecture map (read-only)
Trace every node by reading: `index.ts`, `agents/orchestrator.ts`, `agents/nlu-agent.ts`, `agents/observation-extractor.ts`, `agents/observation-key-mapper.ts`, `decision/observation-code-mapper.ts`, `decision/observation-rule-lookup.ts`, `agents/layered-rule-evaluator.ts`, `decision/hypothesis-evaluator.ts`, `decision/symbolic-reasoner.ts`, `decision/authority-resolver.ts`, `decision/unified-decision-gate.ts`, `decision/safety-gates.ts`, `agents/llm-response-formatter.ts`. Output: ordered node table.

### Phase 2 — Observation Survival
Instrument-by-reading: confirm `OBS_SURVIVAL_MATRIX` emitter coverage (already present in `index.ts`). Cross-check every transformation stage for silent drops (lowercase normalisation, alias expansion, dedupe, pre-auth filtering, expansion-vs-confirmed split). Build matrix from live simulation runs.

### Phase 3 — Clarification flow
Trace `option-selected-handler` → `clarification-strategy` → `dynamic-clarification-generator` → re-entry to extractor → rule lookup. Verify the option payload carries the canonical observation code (not just the localised display text) all the way into `evaluateLayeredRules`. The current log shows `option_selected` arrives as a Marathi sentence and `rules_matched=0` — confirm whether the code is being lost between display and re-mapping.

### Phase 4 — Rule engine coverage (SQL, all crops)
For each crop in `crops` table run:
- Orphan observations: `observation_master` rows referenced by zero `decision_rules.observations` / `hypothesis_conditions`.
- Orphan hypotheses: `hypothesis_master` with no `hypothesis_rule_mapping` / no `decision_rules` consumer.
- Unreachable rules: `decision_rules` whose `observations` reference codes absent from `observation_master` ∪ `observation_aliases`.
- Stage / crop mismatch: rule stage ∉ `crop_stage_master[crop]`.
- Disabled / inactive rules still being loaded.
- Duplicate canonical codes (case-insensitive collision in `observation_master`, `hypothesis_master`, `decision_rules`).
- Per-crop coverage %.

### Phase 5 — DB integrity (all crops, read-only)
Run SQL across `observation_master`, `observation_aliases`, `observation_translations`, `hypothesis_master`, `hypothesis_conditions`, `decision_rules`, `crop_stage_master`, `crop_schedules`, `rule_graph_edges`. Export findings as CSV under `.lovable/audits/db-integrity/`. Categories: broken FKs, canonical-code mismatches, case mismatches, NULL stages, duplicates, inactive cascades.

### Phase 6 — Stage Authority Tree
Confirm `crop_stage_master → resolveCropTimeline → landContext.stage_source='crop_stage_master'` is honoured everywhere. Enumerate every stage write/overwrite in:
`canonical-state-builder.ts`, `gdd-phenology-engine.ts`, `crop-calendar-lookup.ts`, `authority-resolver.ts`, `crop-stage-advisor.ts`, `orchestrator.ts`. Any write that ignores `stage_source` is a P0.

### Phase 7 — Authority / Unified-Gate / Safety-Gate suppression
Trace each path that can flip `URGENT_ACTION/RECOMMENDATION → DIAGNOSTIC_ESCALATION → no_action_needed`. Confirm previous fix (PROACTIVE-URGENT bypass) covers all five action types (`URGENT_ACTION`, `IMMEDIATE_ACTION`, `RECOMMENDATION`, `MONITORING`, `INFO`). Verify safety-gate override does not discard a SAFE rule produced by bypass.

### Phase 8 — Confidence pipeline
Track confidence at: observation extraction, alias expansion, hypothesis match, rule score, decision selector, authority, unified gate, safety gate, response. Flag any non-evidence-based drop (e.g. blanket -35% on clarification, as seen in log `50% → 15%`). Verify `ConfidenceGate` threshold (60%) versus calibrated stage thresholds memory rule.

### Phase 9 — Fallback inventory
List every `[STAGE_FALLBACK]`, generic-fallback, clarification-fallback, photo-fallback entry. For each, determine whether the upstream had a valid path that was suppressed (= bug) or whether DB truly has no rule (= content gap).

### Phase 10 — Live production simulation
Invoke deployed `ai-agriculture-chat` via `supabase--curl_edge_functions` for the matrix below, capture `trace_id`, then pull `OBS_SURVIVAL_MATRIX` + suppression logs via `supabase--edge_function_logs`.

Scenarios × crops:
- Germination failure — Rice, Wheat, Maize, Cotton, Soybean
- Pest attack — Sugarcane (shoot borer), Cotton (bollworm), Rice (stem borer)
- Disease symptoms — Wheat (rust), Tomato (blight), Grape (downy)
- Nutrient deficiency — Rice (N), Banana (K), Citrus (Zn)
- Irrigation issues — Cotton (drought), Rice (flood)
- Weather damage — Wheat (hail), Mango (heatwave)
- Physiological — Tomato (BER), Banana (cracking)

Each scenario tested in English + one regional language (Hindi / Marathi / Tamil) to catch language-routing regressions.

## Fix policy
- DB is the authority. No schema changes unless a defect is in DB structure; data-only repairs go through `supabase--insert`.
- `crop_stage_master` is sole stage authority — any code path that overwrites a SSOT stage is rewritten to be advisory-only.
- No hypothesis without supporting observation evidence (synthetic-obs already gated; verify).
- No decision may be downgraded without an explicit structured log line carrying `bypass_reason` / `override_reason`.
- All fixes wrapped behind structured logs for post-deploy verification.

## Execution order (build mode)
1. Run all read-only phases (1–9) and live sims (10) → write audit report.
2. Apply P0 fixes first, deploy `ai-agriculture-chat`, re-run sims, confirm green.
3. Apply P1 fixes, deploy, re-run sims.
4. P2 list handed off in audit report (not implemented unless trivial).

## Technical scope (files likely touched)
Most edits expected in: `decision/unified-decision-gate.ts`, `decision/authority-resolver.ts`, `decision/safety-gates.ts`, `decision/hypothesis-evaluator.ts`, `decision/observation-rule-lookup.ts`, `agents/orchestrator.ts`, `agents/layered-rule-evaluator.ts`, `agents/observation-extractor.ts`, `agents/clarification-strategy.ts`, `agents/option-selected-handler` path, `agents/canonical-state-builder.ts`, `agents/gdd-phenology-engine.ts`, `decision/crop-calendar-lookup.ts`, `agents/llm-response-formatter.ts`, `index.ts`. Exact lines reported in the bug ledger before each edit.

## Out of scope
- DB schema migrations (read-only audit only; data repairs allowed via insert tool with explicit call-out).
- Frontend changes — preview UI behaviour is downstream of the edge function fixes.
- LLM prompt rewrites unrelated to decision-brain suppression.

## Risks & mitigations
- **Live sims consume edge-function compute** → batch scenarios, cap to ~25 invocations.
- **Large audit may exceed single response** → audit written to file, summary surfaced in chat.
- **Fix regressions** → each P0 fix verified by re-running its specific scenario before moving to next.
