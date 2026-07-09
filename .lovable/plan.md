# KisanShakti Neuro-Symbolic Decision Brain — Refactor Plan

## Guiding Invariant (locked by user 2026-07-09)

> **We are building a 2030-ready medical-grade agriculture decision brain for rural Indian farmers.**
> A purely DB-driven OR purely confidence-driven clarification policy is NOT scalable and does NOT
> meet world-standard neuro-symbolic decision-brain architecture.
> Clarification authority MUST remain a hybrid:
>   1. **Symbolic layer** — DB contracts (`observation_intent_master`, `intent_observation_mapping`,
>      `crop_stage_graph`, hypothesis graph, rules) provide the ontology + budget + allowlist.
>   2. **Graph-navigator layer** — `DecisionGraphNavigator` decides ASK vs RUN via graph pruning.
>   3. **TS heuristic residuals** — differential-diagnosis, hypothesis-clarification-builder,
>      clarification-strategy, and the orchestrator's structured ASK branches are RETAINED as
>      capability enrichers, NOT removed. They add farmer-facing question framing, safety
>      escalation triggers, and cross-signal reasoning the DB alone cannot express.
>
> Consequence: **Phase D (removal of residual TS clarification policy) is CANCELLED.**
> Any future work in this area must *enrich* graph nodes, not delete reasoning surface.

## Phases

### Phase A — Evidence-round freeze  ✅ shipped
- `EvidenceRoundSnapshot` in `GraphRuntimeState`, freeze-once semantics, canonical-code leak guard.
- Orchestrator gatekeeper on `CLARIFICATION_QUESTION` re-ask sites honors DB-supplied
  `max_clarification_rounds` (default 1).
- Tests: `tests/evidence-round-freeze_test.ts` (7 passing).

### Phase B — Promote `DecisionGraphNavigator` to authority  ✅ shipped
- `navigator-flag.ts` default = `ACTIVE` (shadow still enabled for trace comparison).
- `DECISION_GRAPH_NAVIGATOR_TENANTS_OFF` env allowlist for surgical rollback.
- Legacy clarification producers now feed the navigator; ASK vs RUN is the navigator's call.

### Phase C.1 — GraphRuntimeState SSOT consolidation  ✅ shipped
- Four legacy orchestrator fields (`_graphHypothesisIds`, `_graphHypothesisRuleIds`,
  `_graphObsToHypEdges`, `_lastRealObservations`) mirrored into `GraphRuntimeState` as
  first-class typed accessors with dedupe + leak guards + freeze semantics.
- `orchestrator.__graphRuntimeState` exposed for outer-scope reads.
- Tests: `tests/graph-runtime-state-authority_test.ts`.

### Phase C.2 — Legacy field retirement  🟡 deferred
- Once outer-scope readers migrate to `__graphRuntimeState`, delete legacy field writes.
- Purely mechanical; no policy change.

### Phase D — ~~Remove residual TS clarification policy~~  ❌ CANCELLED
- Violates the medical-grade hybrid invariant above.
- Do NOT reopen without explicit user reversal.

### Phase E — Enrich graph nodes (NEW, replaces D)
Goal: make the graph *more* capable so the DB, navigator, and TS layers each contribute
what only they can. All edits additive; no deletion of reasoning surface.

1. **Edge typing on `hypothesis_conditions`** — surface `condition_kind`
   (STAGE / DAS_RANGE / OBS_REQUIRED / OBS_BLOCKS / ENV / SAFETY_ESCALATION) into
   `GraphNode.requires` / `.blocks` / new `.escalates` so the navigator can distinguish
   discriminators from safety triggers.
2. **Farmer-facing predicate metadata** — carry `question_key`, `answer_shape`,
   `safety_severity`, `farmer_observable`, and localized labels from
   `observation_master` / `observation_translations` onto navigator candidates so
   ranked evidence requests render directly.
3. **Hypothesis-cluster nodes** — introduce derived cluster nodes so pathognomonic
   hypotheses (e.g. terminal damage, systemic disease) short-circuit graph pruning
   with a single confirming predicate.
4. **Cross-signal predicates** — allow `requires` to reference environmental,
   satellite, and weather-derived facts (already in tenant context) so the navigator
   can consume more evidence classes without new tables.
5. **Explainability lineage** — every navigator decision writes a lineage node
   `{node_id, decision, contributing_predicates[], confidence, source_layer}` to
   the runtime trace for post-hoc audit and regulator review (medical-grade req).
6. **TS residuals stay** — `clarification-strategy`, `differential-diagnosis-clarifier`,
   `hypothesis-clarification-builder` become **adapters** that consume navigator
   output and add framing/safety wrappers. Their agronomic heuristics are preserved.

Deliverables per item: additive types → loader update → navigator scoring extension →
trace stamp → regression test. Ship one at a time; each is independently revertable.

## Architecture (locked)

```text
Farmer
  │
  ▼
RequestScope → LandAuthority(SSOT) → Semantic → Observation Ontology (DB)
  │
  ▼
Obs→Hyp Graph (DB curated) ── enriched by Phase E ──►
  │
  ▼
DecisionGraphNavigator (authority: ASK vs RUN, graph pruning + margin)
  │           ▲
  │           │ TS residual adapters (framing, safety wrapping, differential
  │           │  diagnosis, cluster short-circuits) — retained, additive only
  ▼
Hypothesis Validation → Hypothesis→Rules → Symbolic Engine → Safety Gates
  │
  ▼
ContractEnforcer (degrades on curator gap, never 500s)
  │
  ▼
LLM Narrator (translation / narration ONLY — never agronomic decision)
  │
  ▼
Farmer
```

## Non-Negotiables

- No DB schema changes without explicit request.
- No crop-specific logic in orchestrator or navigator.
- No LLM agronomic diagnosis fallback — narration only.
- No removal of TS clarification reasoning surface (Phase D cancelled).
- Every navigator decision must be traceable via lineage stamps (Phase E.5).
- Rollback path: `navigator-flag.ts` default flip + env allowlist.
