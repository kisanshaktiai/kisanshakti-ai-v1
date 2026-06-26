
# Phase H + Phase I — Land SSOT and Graph SSOT (Unified Refactor)

The auditor is right: removing `lockedCropContext` / `last_crop` only fixes the **context** divergence. The logs (`trace_mqun0wzd_aqt2zr`: 76 rules loaded → 0 matched, `option_selected="🔍 TUNGRO YELLOW STUNT"`, label re-entering the symbolic stream) prove the **graph state itself** is fragmented across modules. We need one immutable per-request runtime graph that every module reads and only appends to.

This plan is now two phases delivered together. Scope stays inside the existing edge function — no new agents, no schema change, no LLM prompt change.

---

## Phase H — Land SSOT (unchanged from prior plan, recap only)

Same as previously approved:
- Make `CanonicalContext` (already built in `orchestrator.ts:1274` via `buildCanonicalContextContract`) the **only** authoritative reader of `crop_code` / `growth_stage` / `days_since_sowing` / `ndvi` / `soil` / `weather`.
- Remove every read of `lockedCropContext` / `sessionState.last_crop` / `sessionState.previousCrop` as authoritative inputs in `orchestrator.ts` (~25 sites: 1717, 1788–1799, 2062, 2310, 2328, 2345, 2419, 2457, 2479–2486, 3305–3333, 3379, 4046–4047, 4466, 5524) and in `index.ts` (orchestrator-input builder at 891–898; dataAudit compose at 1282–1319).
- Keep writing `lockedCropContext` to the wire `decision_output.metadata` for backward compatibility, derived from `CanonicalContext`, never read back.
- Three fail-fast invariants reusing existing helpers in `decision/canonical-context-contract.ts`:
  - INV-1 after Phase-1 build: `assertCanonicalContextLocked`.
  - INV-2 before rule-eval: `assertNoContextDrift(canonical, land)`.
  - INV-3 before deterministic builder: `decision_output.metadata.lockedCropContext` (if emitted) equals `CanonicalContext`.
- New `[SSOT_TRACE]` log in `index.ts` and `[CANONICAL_FREEZE]` log in `orchestrator.ts` once per turn.

## Phase I — Graph SSOT (new)

### I-1. Introduce `GraphRuntimeState` (one object per request)

New file: `supabase/functions/ai-agriculture-chat/runtime/graph-runtime-state.ts`.
Single immutable container, built once at `orchestrator.ts:~1117` next to `requestCtx`:

```text
GraphRuntimeState (frozen shell, append-only slots)
├─ trace_id, request_id, started_at
├─ canonical_context        (CanonicalContext, frozen)
├─ snapshot_versions        (ontology, IOM, rules bundle, translations, language) — Phase D.5
├─ observation_ledger       (append-only, ObservationNode[])
├─ intent_node              (set once, never re-derived)
├─ hypothesis_graph         (RuleCandidate[] with evolving scores, no rebuilds)
├─ decision_node            (set once by Decision Authority)
└─ presentation_node        (set once by the single builder)
```

The shell object is `Object.freeze`d; each slot is a typed setter that **throws** if already written (except the append-only ledger). This is the Graph Blackboard the auditor asked for, implemented as plain data — no new agents.

### I-2. Per-request runtime snapshot (Phase D.5)

In `GraphRuntimeState.snapshot_versions`, capture once before reasoning starts:
- `ontology_version` (latest `observation_master.updated_at` max)
- `iom_version` (latest `intent_observation_mapping.updated_at` max)
- `rules_bundle_version` (from `bundled-rules/loader.ts` already-exposed bundle hash)
- `translation_version` (latest `observation_translations.updated_at` max for the active language)
- `canonical_context_hash`
- `language`

One DB round-trip using a single `SELECT max(updated_at)` per table, cached for 60 s. Stored on the response `decision_output.metadata.snapshot` for full replayability. No new tables.

### I-3. Append-only `ObservationLedger`

Replace the current pattern where extractor → mapper → validator → authority → clarification each **return new arrays** with a single ledger:

```text
ObservationNode = {
  observation_code,           // canonical, the only ID carried
  source: 'LLM'|'IOM'|'CLARIFICATION'|'INFERRED',
  confidence,
  confirmed: boolean,
  rejected: boolean,
  semantic_class,
  crop_applicability,
  validator_trail: string[],  // who touched it
  created_at
}
```

API: `ledger.append(node)`, `ledger.confirm(code)`, `ledger.reject(code, reason)`, `ledger.view()` returns a frozen snapshot. **No rename, no replace, no drop.** Modules wanting to "transform" must append a derived node referencing the parent. This is exactly what stops the `POOR_GERMINATION → GERMINATION_FAILURE → UNKNOWN → TUNGRO` drift the auditor cited.

Wired into: `observation-extractor.ts`, `observation-key-mapper.ts`, `db-observation-validator.ts`, `clarification-generator.ts`, `layered-rule-evaluator.ts`. Each currently mutates its own array; switch them to read `graph.observation_ledger.view()` and append.

### I-4. Evolving `RuleCandidate` graph (one list, scored in place)

Currently `bundled-rules/loader.ts`, `layered-rule-evaluator.ts`, `semantic-validator.ts`, `scientific-validator.ts`, and `unified-decision-gate.ts` each produce a new candidate list. Replace with one `graph.hypothesis_graph: RuleCandidate[]` where each candidate accumulates scores:

```text
RuleCandidate {
  rule_id,
  semantic_score, authority_score, scientific_score, completeness_score,
  matched_observations: string[], missing_observations: string[],
  ranking, status: 'CANDIDATE'|'WINNER'|'DROPPED', drop_reason
}
```

Validators set scores via `candidate.score('semantic', n)` — no list rebuilds. The winner is selected once by Decision Authority. This directly resolves the `Rules evaluated: 76` / `Rules matched: 0` divergence in `trace_mqun0wzd_aqt2zr` (today the rule loader, semantic gate, and authority gate run against three different in-memory lists keyed off three different crop strings).

### I-5. Single deterministic builder (terminal renderer)

Today the orchestrator has at least five build paths: clarification builder, diagnosis-first builder, fallback builder, rule builder, stage-fallback builder. Consolidate to **one** entry point:

```text
buildPresentation(graph: GraphRuntimeState) → UIResponse
```

Implemented in `agents/deterministic-response-builder.ts` (already exists). All other builders become **input adapters** that write to `graph.decision_node`; they no longer emit `UIResponse` directly. Then `buildPresentation` is the only function that reads `decision_node` + `observation_ledger.view()` + `canonical_context` and emits `UIResponse`. The LLM formatter receives the already-built `UIResponse` strings for narration only.

### I-6. Eliminate Presentation→Logic backflow (the OPTION_SELECTED leak)

Root of the `"🔍 TUNGRO YELLOW STUNT"` symptom:
1. **Hard contract on the wire**: `ClarificationOption` must carry `{ id: observation_code, label }`. The client must echo back `{ option_id: observation_code }`, never the label.
2. Update `agents/clarification-renderer.ts` and the client `ClarificationSelect` to send `option_id`.
3. In `index.ts` OPTION_SELECTED branch and `orchestrator.ts:~1788`, **reject** any `option_selected` payload that does not resolve to a known `observation_code` in `pendingClarificationObservationKeys` for the active conversation. No heuristic label → code mapping. On rejection, emit a deterministic re-clarification.
4. Delete `mapOptionToObservation()` (heuristic) and any label-string mapping in the OPTION_SELECTED path.

### I-7. Runtime graph validator (drift guard between every phase)

New helper `runtime/graph-runtime-state.ts#assertNoGraphDrift(graph, previousSnapshot, stage)`. Called at the boundary of each phase. It throws `GRAPH_STATE_DRIFT` with `{stage, field, before, after}` if any of these change after their slot is set:
- `canonical_context.crop_code | growth_stage | days_since_sowing | language`
- `intent_node.intent_code`
- `observation_ledger` shrinks (must be append-only)
- `hypothesis_graph` loses a candidate without a `drop_reason`

Compared to existing scattered guards, this is one helper called from the existing 7 stage boundaries the orchestrator already has.

### I-8. Activate the dark EvidenceLedger

`decision/evidence-ledger.ts` exists and is instantiated at `orchestrator.ts:1117` but the auditor proved it is rarely written. Make it the **only** place that records evidence wins/losses, and route the new `ObservationLedger` confirmations through it (`ledger.win('OBSERVATION_CONFIRMED', code, source)` / `ledger.lose(...)`). All current ad-hoc `console.log("[EVIDENCE] …")` lines call the ledger instead. Output is attached to `decision_output.metadata.evidence_ledger` for traceability.

### I-9. Canonical-IDs invariant

Add a lint-style runtime check in `assertNoGraphDrift`: any value pushed into `observation_ledger`, `hypothesis_graph`, or `decision_node` whose `observation_code` / `rule_id` / `intent_code` is missing or does not match `/^[A-Z0-9_]+$/` throws `SYMBOLIC_ID_LEAK`. This makes label leakage a fail-fast error, not a silent fallback.

---

## Files touched (build-mode scope)

```text
NEW   supabase/functions/ai-agriculture-chat/runtime/graph-runtime-state.ts
EDIT  supabase/functions/ai-agriculture-chat/agents/orchestrator.ts            (~60 small edits across 7 phases)
EDIT  supabase/functions/ai-agriculture-chat/index.ts                          (SSOT trace + reject session reads + option_id contract)
EDIT  supabase/functions/ai-agriculture-chat/agents/observation-extractor.ts   (ledger.append)
EDIT  supabase/functions/ai-agriculture-chat/agents/observation-key-mapper.ts  (ledger.append, no replace)
EDIT  supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts (read ledger, write option_id)
EDIT  supabase/functions/ai-agriculture-chat/agents/clarification-renderer.ts  ({id, label} contract)
EDIT  supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts  (in-place RuleCandidate scoring)
EDIT  supabase/functions/ai-agriculture-chat/decision/semantic-validator.ts    (score in place)
EDIT  supabase/functions/ai-agriculture-chat/decision/scientific-validator.ts  (score in place)
EDIT  supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts (select winner, write decision_node)
EDIT  supabase/functions/ai-agriculture-chat/agents/deterministic-response-builder.ts (single buildPresentation)
EDIT  supabase/functions/ai-agriculture-chat/db-observation-validator.ts        (ledger.reject with reason)
EDIT  client: components/chat ClarificationSelect → send {option_id}
```

No DB schema change. No new tables. No new edge function. No LLM prompt change. Existing request/response wire shape preserved (additive: `decision_output.metadata.snapshot` and `evidence_ledger`).

---

## Validation plan

1. **Replay `trace_mqun0wzd_aqt2zr`**:
   - Expect non-zero matched rules for RICE/SEEDLING/18 DAS.
   - Expect no `RULE_DATA_INTEGRITY_ERROR`.
   - Expect `decision_output.metadata.snapshot.rules_bundle_version` populated.
2. **Label-leak fuzz**: POST `option_selected="🔍 TUNGRO YELLOW STUNT"` with empty `pendingClarificationObservationKeys` → expect HTTP 200 with deterministic re-clarification and a `SYMBOLIC_ID_LEAK`-prevented branch (no heuristic accept).
3. **Drift fuzz**: clear `sessionState.last_crop` mid-conversation → identical decision (land is SSOT).
4. **Graph drift fuzz**: inject a mutated `crop_code` between Phase-2 and Phase-3 → expect `GRAPH_STATE_DRIFT` thrown with `{stage, field, before, after}`.
5. **Observation immutability fuzz**: try to shrink the ledger → expect throw.
6. **Snapshot replay**: take `decision_output.metadata.snapshot` from a failed prod request, re-run the pipeline against the same snapshot versions → identical output.
7. **Edge log assertions per turn**: exactly one `[CANONICAL_FREEZE]`, exactly one `[GRAPH_FREEZE]`, zero `CANONICAL_CONTEXT_DRIFT`, zero `GRAPH_STATE_DRIFT`, zero `SYMBOLIC_ID_LEAK`.

---

## Explicitly out of scope

- No schema changes, no migrations, no new tables.
- No new AI agents, no LLM prompt changes.
- No replacement of rule-loader logic, hypothesis evaluator math, or clarification strategy — only their **state surface** changes (read graph, append, score in place).
- Backward-compat fields on the wire (`lockedCropContext` inside `decision_output.metadata`) preserved as derived values; reads removed.
