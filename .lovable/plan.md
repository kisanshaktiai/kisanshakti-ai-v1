# v3 — Decision Graph Navigator Refactor (Neuro-Symbolic Brain)

Supersedes v1 (Evidence Planner) and v2 (Evidence Selection Engine). Adopts reviewer verdict: the brain is a **Decision Graph**, not a hypothesis engine with an evidence layer. Reuses existing modules — no parallel state, no adapters, no new schema.

## 1. Reuse map (do NOT create duplicates)

Existing files keep their identity; we extend them in place.

| Concern | Existing file | Change |
|---|---|---|
| Single runtime state | `runtime/graph-runtime-state.ts` | **Promote to sole `RuntimeGraphState`** (context + hypotheses + confirmed/denied + active rule nodes + history + confidence). Freeze per turn. Append-only `applyEvent`. |
| Conversation snapshot | `runtime/conversation-state.ts` | Demote to *view* over `RuntimeGraphState`; remove independent storage. |
| Hypothesis production | `decision/hypothesis-evaluator.ts` | Emit graph-native nodes `{ id, prior, posterior, predicates[], blocks[], requires[] }` directly. **No adapter file.** |
| Evidence ownership | `decision/evidence-ledger.ts` | Becomes the confirmed/denied store inside `RuntimeGraphState`. |
| Ontology gate | `runtime/farmer-observable-gate.ts` + `decision/iom-gate.ts` | Keep as-is (already lower_snake_case). |
| Clarification vocabulary | `runtime/clarification-contract.ts` | Add `buildOptions({ keys, ctx, language, supabase })`; keep `loadClarificationCandidates` + `assertClarificationContract`. |
| Intent | `decision/intent-resolver.ts` | Unchanged. |

New files (only two):

| New file | Role |
|---|---|
| `runtime/decision-graph-navigator.ts` | The brain's top-level reasoning owner. Pure function over `RuntimeGraphState`. |
| `runtime/contradiction-engine.ts` | Pre-navigation check: utterance vs locked context (stage/crop/DAS). |

Files demoted/deleted:

- `agents/clarification-strategy.ts::fetchRuleDrivenClarificationOptions` → `return null` + `[DEPRECATED]`.
- `agents/clarification-renderer.ts` → drop `BASE_TEMPLATES.options` for DIAGNOSIS/REFINE scopes.
- `agents/clarification-generator.ts::generateScopedClarification` REFINE branch → delegate to navigator+builder.
- `decision/diagnosis-first-generator.ts::humanizeCode` UI emission paths → removed.

## 2. Final pipeline (single owner = Decision Graph Navigator)

```text
Farmer
   → LLM Understanding
   → Canonical Context Lock (land → crop → stage → DAS → weather)
   → Contradiction Engine                ← halts on STAGE_MISMATCH etc.
   → RuntimeGraphState.applyEvent(USER_TURN)
   → Decision Graph Navigator            ← SOLE reasoning owner
        ├─ activate reachable nodes (stage/crop/intent gates)
        ├─ score hypotheses (existing evaluator, in-graph)
        ├─ enumerate candidate evidence from active node predicates
        ├─ rank by graph pruning power (#branches eliminated)
        ├─ stopping-criterion check
        └─ emit Decision ∈ { PROCEED | ASK | CONTEXT_CONTRADICTION | INSUFFICIENT_EVIDENCE }
   → Clarification Builder (vocabulary + i18n only, IOM-gated)
   → Outbound Contract Gate
   → UI
   → on farmer reply: RuntimeGraphState.applyEvent(OPTION_SELECTED) → loop
   → PROCEED → Rule Evaluation → Recommendation
```

## 3. `RuntimeGraphState` (single SSOT)

Extend `runtime/graph-runtime-state.ts`:

```ts
interface RuntimeGraphState {
  readonly turn: number;
  readonly context: CanonicalContext;            // frozen at lock
  readonly hypotheses: GraphNode[];              // { id, prior, posterior, predicates, blocks, requires, stage_scope }
  readonly confirmed: Map<string, EvidenceRecord>;
  readonly denied:    Map<string, EvidenceRecord>;
  readonly activeNodeIds: Set<string>;           // reachable given context + confirmed
  readonly history: TurnEvent[];                 // append-only
  readonly versions: SnapshotVersions;           // ontology/rules versions
}
applyEvent(prev, event): RuntimeGraphState      // pure, frozen result
```

Rule: **every reader (navigator, evaluator, narrator, audit) reads `RuntimeGraphState` only**. Delete any side caches in orchestrator that duplicate this.

## 4. Decision Graph Navigator (`runtime/decision-graph-navigator.ts`)

Pure, no DB IO at call time (knowledge pre-loaded into state):

```ts
interface NavigationResult {
  decision: 'PROCEED' | 'ASK' | 'CONTEXT_CONTRADICTION' | 'INSUFFICIENT_EVIDENCE';
  reason: string;
  ranked: EvidenceRequest[];   // explainable graph
  stopping: { confidence: number; margin: number; activeHypotheses: number; predicatesSatisfied: boolean };
}

interface EvidenceRequest {
  evidence_key: string;                    // canonical lower_snake_case
  prunes_hypotheses: string[];             // node IDs eliminated if denied
  confirms_hypotheses: string[];           // node IDs strongly supported if confirmed
  graph_pruning_score: number;             // primary ranker — see §4.2
  supporting: Array<{ hypothesis_id: string; reason: string }>;
}
```

### 4.1 Activation
`activeNodeIds = { h ∈ hypotheses | stage ∈ h.stage_scope ∧ crop ∈ h.crop_scope ∧ !violates(confirmed ∪ denied, h.blocks) ∧ satisfies(confirmed, h.requires) }`.

### 4.2 Ranking — graph pruning, not entropy
For each candidate `evidence_key e` referenced by any active node's `predicates`:

```text
prunes(e)   = |{ h ∈ active | e ∈ h.blocks   ∨ (e ∈ h.requires ∧ denial would falsify h) }|
confirms(e) = |{ h ∈ active | e ∈ h.requires ∧ confirmation would satisfy h }|
score(e)    = prunes(e) + confirms(e) − redundancy(e, confirmed)
```

Tie-break: lower elicitation cost via `observation_master.is_easy_to_observe` if present (no new column). Ontology-gate every candidate; drop those failing IOM/master.

### 4.3 Stopping criterion (`PROCEED`)
ALL of:
1. `|activeHypotheses| ≤ 1` OR `margin(top, second) ≥ θ_margin(stage)` (existing `stage_thresholds`).
2. `requires(top) ⊆ confirmed` AND `blocks(top) ⊆ denied ∪ unknown`.
3. Turn count ≤ `max_clarification_rounds(intent)`.

### 4.4 Other decisions
- `CONTEXT_CONTRADICTION`: returned only if Contradiction Engine flagged the turn (navigator skipped).
- `INSUFFICIENT_EVIDENCE`: `activeHypotheses` empty OR `ranked` empty after ontology gate → deterministic insufficient-evidence response; never invent options.
- `ASK`: otherwise. UI receives `ranked.slice(0, N)` via builder.

## 5. Contradiction Engine (`runtime/contradiction-engine.ts`)

Reads `intent_assertion_pattern.stage_compatibility` + `RuntimeGraphState.context`. Emits `CONTRADICTION { kind, assertion, context }` for mismatches (e.g., "hasn't germinated" with `stage=tillering`). Orchestrator surfaces deterministic reconciliation prompt **before** hypothesis activation. No symptom synthesis.

## 6. Orchestrator changes (`agents/orchestrator.ts`)

Replace the three competing producers with one path:

```text
state0 = RuntimeGraphState.fromTurn(canonicalContext, evaluator.preload(...))
contradiction = contradictionEngine.check(utterance, state0)
if contradiction: return reconciliationResponse(contradiction)
state1 = applyEvent(state0, USER_TURN(utterance))
nav   = decisionGraphNavigator.navigate(state1)
switch nav.decision:
  PROCEED               → existing rule evaluator on state1.hypotheses[0]
  ASK                   → opts = clarificationContract.buildOptions(nav.ranked.slice(0,N), ctx)
                          opts = assertClarificationContract(opts, allowed)
                          return clarificationResponse(opts)
  INSUFFICIENT_EVIDENCE → return insufficientEvidenceResponse()
  CONTEXT_CONTRADICTION → already handled above
```

Delete calls to: `fetchRuleDrivenClarificationOptions`, `generateScopedClarification` (REFINE), diagnosis-first IOM inline. Add single `[CLARIFICATION_OWNER] producer=DECISION_GRAPH_NAVIGATOR` log per turn.

## 7. Audit (`runtime/runtime-trace-collector.ts` + `audit-logger.ts`)

Persist per turn into existing `ai_decision_log`: `decision`, `reason`, `ranked` (full evidence graph JSON), `active_node_ids`, `stopping`. No schema migration — write into existing JSONB columns (`evidence_graph_json` already added in earlier Phase Y; reuse).

## 8. What is explicitly NOT done

- No new DB columns (`evidence_likelihood`, `elicitation_cost`) — defer until graph correctness is proven by replay.
- No `HypothesisGraph` adapter file — evaluator emits graph-native nodes.
- No entropy-only ranking — graph pruning is the primary signal (entropy retained as tie-break only if `posterior` is present).
- No second state object — `SymbolicState` and `ConversationState` collapse into `RuntimeGraphState`.
- No frontend, LLM-prompt, or rule-engine changes.

## 9. Migration order (graph-correctness first)

1. **Stabilize graph**: extend `graph-runtime-state.ts` to full `RuntimeGraphState`; route orchestrator through it (read-only at first, side caches kept for parity).
2. **Prove graph**: shadow log every turn's `RuntimeGraphState`; replay 100 historical turns; assert state-divergence == 0 vs current behavior.
3. **Ship navigator behind flag** `DECISION_GRAPH_NAVIGATOR=on` (default off). All three legacy producers still live.
4. **Replace clarification**: flip flag per tenant; verify acceptance §10; delete legacy producers when zero `[CONTRACT_VIOLATION]` for 24h.
5. **Add contradiction engine**: enable after step 4 stable.
6. **Optional enrichment**: only after §10 passes for 7 days, consider `evidence_likelihood` / `elicitation_cost` columns.

## 10. Acceptance criteria

1. Rice / "hasn't germinated" / SEEDLING DAS 17 → `ASK`, options ⊆ {`seed_not_germinated`,`germination_failure`,`obs_rice_no_emergence`,`poor_germination`}. Zero `CROP_STAGE` / `MANAGEMENT_PLANNING` / `TUNGRO_*` / `block_rule_triggered`.
2. Rice "hasn't germinated" with `stage=tillering` → `CONTEXT_CONTRADICTION`; reconciliation prompt; no hypothesis activation.
3. Three close hypotheses → top question is the one whose denial/confirmation prunes the most active nodes (graph-pruning rank, verified in `ranked` JSON).
4. One discriminating answer → `PROCEED`; no further clarification.
5. `ai_decision_log` contains `ranked`, `active_node_ids`, `decision`, `reason`, `stopping` per turn.
6. Grep checks: zero reads of `decision_rules.conditions_json` under `runtime/`; `fetchRuleDrivenClarificationOptions` returns `null` 100% of paths; no `BASE_TEMPLATES.options` reachable from REFINE/DIAGNOSIS scope.
7. 100-turn replay across rice/sugarcane/cotton: zero `[CONTRACT_VIOLATION]`, zero state-divergence between legacy and navigator paths during shadow window.

## 11. Scale notes (1M users)

- Navigator is pure in-memory over a frozen state; no DB IO.
- Knowledge preload at session start uses existing paginated loaders (rules, observation_master, IOM) — already cached per (crop, stage).
- `RuntimeGraphState` is per-turn allocation, freed after response; no global mutation.
- All DB reads remain indexed `.in()` lookups (IOM, master, translations) — unchanged from contract.
