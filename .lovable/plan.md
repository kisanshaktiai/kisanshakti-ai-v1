# Crop Stage SSOT — Forensic Investigation Plan

Read-only investigation. No code or database changes. Deliverable is a single evidence-backed report at the repo root: `STAGE_SSOT_FORENSIC_AUDIT.md`.

## Scope

One farmer query traced end-to-end through `supabase/functions/ai-agriculture-chat/*` and supporting DB tables. Every claim must cite file + function + line, or SQL + table + column. Missing evidence is recorded as "Not Found" — never inferred.

## Investigation phases

### Phase 1 — Code inventory (ripgrep sweeps, no edits)
Run targeted searches across `supabase/functions/`, `src/`, and `.lovable/memories/` for:
- Identifiers: `crop_stage`, `growth_stage`, `current_crop_stage`, `resolved_stage`, `canonical_stage`, `runtime_stage`, `stageContext`, `cropStage`, `growthStage`, `stage_code`, `stage_name`, `active_stage`, `locked_stage`, `persisted_stage`
- Time-derived: `DAS`, `days_after_sowing`, `days_since_sowing`, `planting_date`, `sowing_date`, `crop_age`
- Functions: `calculateStage`, `deriveStage`, `resolveStage`, `computeStage`, `determineStage`, `getStageByDAS`, `getStageCategoryFromDB`, `getCropStageFromDAS`, `deriveCropCycle`, `stageFromProgress`
- Hardcoded stage literals: `GERMINATION`, `SEEDLING`, `EMERGENCE`, `VEGETATIVE`, `TILLERING`, `ACTIVE_TILLERING`, `FLOWERING`, `REPRODUCTIVE`, `MATURITY`, `HARVEST`, `POST_HARVEST`
- Read/write hot spots: `.eq("crop_stage"`, `.eq("growth_stage"`, `canonicalContext.stage`, `conversationState.stage`, `metadata.stage`, `STAGE_FAMILIES`

For each hit: file, function, line, role (read | write | constant | comparison).

### Phase 2 — Database surface map (read-only SQL)
Use `supabase--read_query` to enumerate stage-bearing columns and recent values:
- `lands` (`current_crop_stage`, `planting_date`, `last_sowing_date`, `cultivation_date`, `expected_harvest_date`)
- `land_crops` (stage/date columns)
- `crop_schedules` (stage columns, 111 cols — confirm which)
- `crop_stage_master` (`crop_code`, `growth_stage`, `das_min`, `das_max`)
- `crop_stage_knowledge`
- `crop_baseline_guidelines`, `crop_baseline_guidelines_v2`
- `ai_chat_sessions.conversation_state` (JSON path probes)
- `ai_chat_messages` / `ai_chat_audit_logs` / `ai_decision_log` (stage fields in metadata)
- `decision_rules` (stage-applicability columns)
- `intent_observation_mapping`, `observation_master` (stage scoping if any)

Per table: stage columns, writers (file:function), readers (file:function), update cadence, JSON shape where applicable.

### Phase 3 — Pipeline trace (one canonical query)
Walk the live runtime for a single farmer query through:
```
index.ts (handler)
  → orchestrator.processQuery
    → context builder / land resolution
    → stage-knowledge-cache (getStageRow / getStageByDAS / getStageCategoryFromDB)
    → canonical-context-contract (buildCanonicalContextContract)
    → conversation-state (buildConversationState)
    → bundled-rules/loader + layered-rule-evaluator (STAGE_FAMILIES)
    → hypothesis-evaluator
    → clarification-contract / decision-graph-navigator
    → unified gate
    → response builder + transformOrchestratorResponse
    → ai_decision_log / ai_chat_audit_logs writes
    → frontend payload (metadata.stage)
```
For every hop record: incoming `stage`, outgoing `stage`, mutator (file:function:line), reason, evidence (log line or code).

### Phase 4 — Authority & duplication analysis
Identify every component that *decides* stage vs. every component that *consumes* it. Build the Ownership Matrix and flag any path where two components compute stage independently (e.g. `lands.current_crop_stage` vs. `getStageByDAS(planting_date)` vs. `conversation_state.stage` vs. `STAGE_FAMILIES` expansion).

### Phase 5 — Mutation, cache, override, staleness
- Cache TTL in `stage-knowledge-cache.ts` (10-min TTL — confirm impact).
- Session persistence: `ai_chat_sessions.conversation_state.stage` reuse across turns.
- Runtime overwrites: search `stage =`, `growth_stage =`, `Object.assign`, spreads on context objects.
- `STAGE_FAMILIES` equivalence (GERMINATION ↔ EMERGENCE etc.) — record where it widens vs. replaces stage.

### Phase 6 — Hardcoded constants & client-side derivation
- `src/constants/crops.ts` `CROP_STAGE_DURATIONS` + `getCropStageFromDAS`
- `src/lib/cropStage.ts` `deriveCropCycle` / `stageFromProgress`
- Any edge-function fallback lists in `stage-normalizer.ts`, orchestrator defaults

Determine whether frontend-derived stage ever round-trips into the edge function.

### Phase 7 — Live evidence
- `supabase--edge_function_logs` for the most recent `ai-agriculture-chat` invocations: extract every `stage`, `growth_stage`, `[SSOT_TRACE]`, `STAGE_FAMILIES` log line.
- `supabase--read_query` on `ai_decision_log` (last 50 rows) and `ai_chat_audit_logs` to compare persisted stage vs. land stage vs. derived DAS stage for the same session.

## Deliverable: `STAGE_SSOT_FORENSIC_AUDIT.md`

Sections (in order):
1. Executive summary (one paragraph; no fixes)
2. Stage Source Inventory — table of every origin with file/line or table/column
3. Stage Ownership Matrix — owner / writers / readers
4. Stage Mutation Timeline — per-hop table for the traced query
5. Database Dependency Graph — ASCII diagram of stage-bearing tables and their writers/readers
6. Code Dependency Graph — ASCII diagram of edge-function modules touching stage
7. Hardcoded Stage Report — every literal stage occurrence
8. Duplicate SSOT Report — concrete conflicting authorities with side-by-side evidence
9. Runtime evidence appendix — log excerpts + SQL result snippets
10. Root Cause — exact file/function/line(s) where divergence originates, with runtime proof
11. Production Risk Assessment — Critical / High / Medium / Low ranking

Explicitly **no** remediation, refactor, or code-change recommendations until the audit conclusively names the single authoritative source and every divergence point.

## Constraints
- Tools used: `code--exec` (rg/grep only, no writes), `code--view`, `supabase--read_query`, `supabase--edge_function_logs`. No migrations, no edits, no deploys.
- Any item lacking direct evidence is recorded as **Not Found**.
- Report committed only as the single new markdown file above; no other files touched.
