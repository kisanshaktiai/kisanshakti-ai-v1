
# Phase Y — Runtime Trace & Decision Forensics (No New Tables)

Pure observability upgrade. Zero changes to agronomic logic, rules, decisions, or the symbolic graph. Reuses `ai_decision_log` and `ai_chat_audit_logs` as the permanent forensic store.

---

## Current state (verified)

`ai_decision_log` already has: `tenant_id, farmer_id, land_id, schedule_id, decision_type, model_version, input_data, output_data, reasoning, confidence_score, execution_time_ms, weather_data, ndvi_data, soil_data, success, error_message, top_5_rejected_rules, evaluation_trace, missing_data_fields, prompt_version, hypothesis_id, hypothesis_score, hypothesis_decision_path, variety_resistance_applied`.

`ai_chat_audit_logs` already has: `turn_id, session_id, farmer_id, tenant_id, trace_id, intent_label, observations, nlu_confidence, locked_intent, allowed_scopes, forbidden_actions, symbolic_decision_id, rules_fired, actions_returned, actions_filtered_out, observation_mapping, validation_passed, validation_errors, response_source, llm_model_used, processing_time_ms, agents_used, land_id, crop_code, growth_stage, gate_decisions`.

Persistence today lives in `supabase/functions/ai-agriculture-chat/agents/audit-logger.ts` and the in-request `EvidenceLedger` / `ConfidenceChain` already in `decision/`. The forensic columns `hypothesis_id`, `hypothesis_score`, `hypothesis_decision_path`, and `symbolic_decision_id` exist but are not being written.

---

## Database changes — single additive migration

Extend the two existing tables only (no new tables, no column drops, no type changes).

```sql
ALTER TABLE public.ai_decision_log
  ADD COLUMN IF NOT EXISTS runtime_trace          jsonb,
  ADD COLUMN IF NOT EXISTS graph_snapshot         jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_metrics       jsonb,
  ADD COLUMN IF NOT EXISTS context_snapshot       jsonb,
  ADD COLUMN IF NOT EXISTS clarification_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS observation_snapshot   jsonb,
  ADD COLUMN IF NOT EXISTS rule_snapshot          jsonb,
  ADD COLUMN IF NOT EXISTS hypothesis_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS decision_snapshot      jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_versions     jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version       text,
  ADD COLUMN IF NOT EXISTS graph_version          text,
  ADD COLUMN IF NOT EXISTS runtime_version        text,
  ADD COLUMN IF NOT EXISTS execution_mode         text,
  ADD COLUMN IF NOT EXISTS trace_level            text,
  ADD COLUMN IF NOT EXISTS created_runtime_ms     integer,
  ADD COLUMN IF NOT EXISTS trace_id               text,
  ADD COLUMN IF NOT EXISTS execution_id           text;

ALTER TABLE public.ai_chat_audit_logs
  ADD COLUMN IF NOT EXISTS execution_id     text,
  ADD COLUMN IF NOT EXISTS pipeline_version text,
  ADD COLUMN IF NOT EXISTS graph_version    text,
  ADD COLUMN IF NOT EXISTS runtime_version  text;

-- Indices for replay queries (small, payload-free)
CREATE INDEX IF NOT EXISTS idx_adl_trace_id        ON public.ai_decision_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_adl_execution_id    ON public.ai_decision_log(execution_id);
CREATE INDEX IF NOT EXISTS idx_adl_land_created    ON public.ai_decision_log(land_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acal_execution_id   ON public.ai_chat_audit_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_acal_symbolic_dec   ON public.ai_chat_audit_logs(symbolic_decision_id);
```

No RLS changes (existing policies still apply). No grants needed (no new tables).

---

## Code changes (forensic only, agronomic-neutral)

All work confined to `supabase/functions/ai-agriculture-chat/`.

### 1. New module — `runtime/runtime-trace-collector.ts`

Single per-request collector. Owns `trace_id`, `execution_id`, a stage stack, and the nine snapshot buffers.

API:
- `RuntimeTraceCollector.start(req)` → returns collector seeded with `trace_id`, `execution_id`, `pipeline_version`, `graph_version`, `runtime_version`, `execution_mode`, `trace_level`.
- `collector.beginStage(name, owner)` / `collector.endStage(name, {inputs, outputs, confidence, warnings, errors})` — records start/end/latency.
- Typed setters: `setContext()`, `setClarification()`, `setObservations()`, `setRules()`, `setHypotheses()`, `setDecision()`, `setBuilderOutput()`, `setKnowledgeVersions()`.
- Wraps the existing `EvidenceLedger` + `ConfidenceChain` (does not replace them) so the ledger snapshot and confidence chain become two fields of `graph_snapshot` instead of separate state.
- `collector.finish()` → returns the full `RuntimeTraceRecord` and emits one `[RUNTIME_TRACE]` line (no per-stage console spam).

Snapshot shapes match the user's spec exactly (`graph_snapshot`, `pipeline_metrics`, `context_snapshot`, `clarification_snapshot`, `observation_snapshot`, `rule_snapshot`, `hypothesis_snapshot`, `decision_snapshot`, `knowledge_versions`).

### 2. Knowledge version probe — `runtime/knowledge-versions.ts`

One read per request (cached for the lifetime of the edge instance, ~5 min TTL). Pulls a cheap `max(updated_at)` per source: `decision_rules`, `observation_master`, `intent_observation_mapping`, `crop_stage_knowledge`, `observation_translations`. Returns hashes used as `knowledge_versions`.

### 3. Wiring — single edit per pipeline stage

For each existing stage call site, wrap with `beginStage`/`endStage`. No logic changes. Stages and owners:

```text
INTENT_CLASSIFY        owner=intent-classifier
CANONICAL_CONTEXT      owner=land-context
HYPOTHESIS_EVAL        owner=hypothesis-evaluator
CAUSAL_ENGINE          owner=causal-hypothesis-engine
DISCRIMINATOR          owner=hypothesis-discriminator
CLARIFICATION          owner=clarification-generator
OBSERVATION_AUTHORITY  owner=observation-authority
SEMANTIC_GATE          owner=semantic-validator
SCIENTIFIC_GATE        owner=scientific-validator
RULE_EVAL              owner=rule-evaluator
DECISION_BUILDER       owner=decision-builder
LLM_FORMAT             owner=llm-response-formatter
```

Files touched (wrap-only): `agents/orchestrator.ts`, `decision/hypothesis-evaluator.ts`, `decision/causal-hypothesis-engine.ts`, `decision/discriminator.ts`, `agents/clarification-generator.ts`, `decision/observation-authority.ts`, `decision/semantic-validator.ts`, `decision/scientific-validator.ts`, `decision/rule-evaluator.ts`, `decision/decision-builder.ts`, `narration/llm-response-formatter.ts`.

### 4. Persistence — `agents/audit-logger.ts`

Replace the existing direct write with one `collector.finish()` → one insert into `ai_decision_log` populating:

- existing columns unchanged,
- new snapshot columns,
- `hypothesis_id`, `hypothesis_score`, `hypothesis_decision_path` set from `hypothesis_snapshot.winner`,
- `land_id`, `schedule_id` set from `context_snapshot` (never null when present in request),
- `trace_id`, `execution_id`, `pipeline_version`, `graph_version`, `runtime_version`, `execution_mode`, `trace_level`, `created_runtime_ms` set from collector header.

Same call site also updates the matching `ai_chat_audit_logs` row by `trace_id` to populate `symbolic_decision_id` (= inserted `ai_decision_log.id::text`), `execution_id`, `pipeline_version`, `graph_version`, `runtime_version`. If the audit row hasn't been inserted yet, append these fields to the insert payload instead.

### 5. Single runtime log line

`finish()` emits exactly one structured line — replaces the existing scattered `[BRAIN_TRACE]` summary already in `runtime/brain-trace.ts`:

```text
[RUNTIME_TRACE] trace=… exec=… pv=… gv=… latency_ms=… intent=… winner_rule=… winner_hyp=… clarification_owner=… candidates=… matched=… decision=… confidence=…
```

Per-stage `[BRAIN_TRACE][LEDGER]` lines from `evidence-ledger.ts` stay (they are already gated to one line per ledger mutation, not per stage entry).

---

## Replay contract (acceptance test)

Given a `trace_id`, the following query reproduces a full request end-to-end:

```sql
SELECT runtime_trace, graph_snapshot, pipeline_metrics, context_snapshot,
       clarification_snapshot, observation_snapshot, rule_snapshot,
       hypothesis_snapshot, decision_snapshot, knowledge_versions,
       hypothesis_id, hypothesis_score, hypothesis_decision_path
FROM ai_decision_log
WHERE trace_id = $1;
```

Plus the matching audit row:

```sql
SELECT symbolic_decision_id, execution_id, gate_decisions
FROM ai_chat_audit_logs
WHERE trace_id = $1;
```

`symbolic_decision_id = ai_decision_log.id::text` must be true for every request that produced a symbolic decision.

---

## Acceptance criteria (mirrors the spec)

1. Exactly one `RuntimeTraceCollector` per request.
2. `ai_decision_log` populates: `hypothesis_id`, `hypothesis_score`, `hypothesis_decision_path`, `runtime_trace`, `graph_snapshot`, `pipeline_metrics`, plus all snapshot fields.
3. `ai_chat_audit_logs.symbolic_decision_id` never null when a symbolic decision exists.
4. `land_id` is non-null on `ai_decision_log` whenever the request carried land context.
5. Pipeline stages all show `start_ms`, `end_ms`, `latency_ms`, `owner` in `runtime_trace.stages[]`.
6. Knowledge versions captured per request; identical inputs against the same versions reproduce the same decision.
7. No new tables; no schema removals; no logic, rule, decision, or graph changes.

---

## Risk & rollout

- All new columns are `NULLABLE`; backfill is unnecessary. Old rows continue to read fine.
- Collector failures are wrapped in `try/catch`; an instrumentation crash never blocks a farmer response.
- `trace_level` defaults to `'standard'`; setting it to `'minimal'` via env (`RUNTIME_TRACE_LEVEL`) skips the large snapshots and keeps only header + metrics, giving an instant kill-switch if payload size becomes a concern.
- One migration → wire `RuntimeTraceCollector` in orchestrator → wrap stages → flip `audit-logger.ts` to consume the collector → verify on one live trace.

## Out of scope (explicit)

- No edits to rule evaluation, hypothesis scoring, clarification logic, semantic/scientific gates, or LLM prompts.
- No new tables, no RLS changes, no edge-function ACL changes.
- No frontend changes.
