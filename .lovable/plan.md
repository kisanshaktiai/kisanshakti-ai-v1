## Surgical production fix plan

### Goal
Protect the Neuro-Symbolic Decision Brain contract:

```text
Database knowledge graph
→ deterministic graph runtime
→ LLM narration only
```

No schema changes, no rice-specific logic, no hardcoded pest/disease mappings, no chatbot fallback.

### Confirmed target files
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-graph-evaluator.ts`
- `supabase/functions/ai-agriculture-chat/decision/observation-hypothesis-resolver.ts`
- `supabase/functions/ai-agriculture-chat/decision/symbol-resolver.ts`
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-clarification-builder.ts`
- `supabase/functions/ai-agriculture-chat/runtime/evidence-classifier.ts`
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- `supabase/functions/ai-agriculture-chat/tests/graph-integrity_test.ts`
- New: `supabase/functions/ai-agriculture-chat/decision/stage-symbol-resolver.ts`

### What will change

#### 1. Add a DB-backed stage symbol resolver
Create `decision/stage-symbol-resolver.ts` to normalize stage identity through existing stage data:
- Resolve raw stage inputs like `TRANSPLANTING`, `transplanting_stage`, `rice_transplanting`, `establishment` into canonical lowercase graph stage symbols.
- Use `crop_stage_master` and `crop_stage_graph`/stage cache when available.
- Expose:
  - `resolveStageSymbol()`
  - `sameStageNode()`
  - `sameStageFamily()`
  - `stageCompatibility()` returning `{ exact, family, mismatch, unknown }`
- Keep it generic: no crop-specific branches, no rice-only family map.

#### 2. Convert stage/DAS from early hard elimination to evidence-aware scoring
Update `hypothesis-graph-evaluator.ts`:
- If a hypothesis has real observation evidence (`requiredMatched > 0` or positive observation match), `STAGE` mismatch must not eliminate it.
- Required `STAGE` mismatch becomes:
  - warning: `STAGE_CONTEXT_CONFLICT(...)`
  - confidence penalty: `0.15`
  - status trace: `SURVIVED_WITH_STAGE_WARNING`
- Required `DAS_RANGE` mismatch follows the same evidence-aware principle with a smaller penalty (`0.10`) when real observations exist.
- Only true contradictions still eliminate:
  - `CONTRADICTORY_OBSERVATION`
  - `IMPOSSIBLE_CROP`
  - `NO_REQUIRED_MATCH`
- Preserve fail-closed behavior when there is no observation evidence.

#### 3. Make observation node matching fully canonical
Update `symbol-resolver.ts` and graph matching calls:
- Resolve both farmer observations and `hypothesis_conditions` observation values through `observation_aliases` then `observation_master`.
- Compare graph nodes with canonical node identity, not `condition_key === observation_code` or raw lowercase strings.
- Keep exact DB authority: if DB has no alias/master relationship, return unresolved with traceable reason.

#### 4. Filter context symbols before Observation → Hypothesis
Extend `runtime/evidence-classifier.ts`:
- Treat context/meta symbols as non-symptoms:
  - `ACTION_NONE`
  - `PHOTO_NOT_PROVIDED`
  - `CROP_IDENTIFIED`
  - `STAGE_IDENTIFIED`
  - `SEVERITY_*`
  - `CONTEXT_*`
- Ensure only `REAL_OBSERVATION` codes enter `resolveHypothesesFromObservations()` and `evaluateHypothesisGraph()`.
- Preserve ignored codes in trace metadata for auditability.

#### 5. Enforce illegal-state recovery through hypothesis graph clarification
Update `observation-hypothesis-resolver.ts`, `hypothesis-clarification-builder.ts`, and orchestrator graph-failure branches:
- Illegal state:
  - `real_observation_count > 0`
  - `candidate_hypotheses = 0`
  - `observation_required = false`
- Replace it with:
  - `GRAPH_NEEDS_DISAMBIGUATION` or `GRAPH_KNOWLEDGE_GAP`
  - `CLARIFICATION_QUESTION`
  - options sourced only from `hypothesis_graph`
- Use nearest surviving/soft-scored hypotheses to ask missing discriminator observations instead of empty UI.
- Never continue to proactive rules or LLM agronomic diagnosis from this state.

#### 6. Update trace contract
Add/adjust logs so edge output shows:
- `real_observations=<n>`
- `ignored_context_symbols=<n>`
- `candidate_hypotheses>0` when observation evidence anchors graph edges
- `stage_penalty_applied=true` when stage mismatch survives as warning
- `clarification_source=hypothesis_graph`
- `observation_options>0` when more evidence is needed

#### 7. Regression tests
Add/modify tests in `graph-integrity_test.ts`:
1. Rice/transplanting/poor-emergence survives stage mismatch:
   - `candidate_hypotheses > 0`
   - stage warning/penalty applied
   - not eliminated by `REQUIRED_STAGE_FAILED`
2. Symbol identity equivalence:
   - `POOR_EMERGENCE`
   - `poor_emergence`
   - `OBS_RICE_NO_EMERGENCE`
   resolve via DB/fake DB alias path when relationship exists.
3. Illegal state guard:
   - real observations present + zero hypotheses cannot produce `observation_required=false`.
4. Context symbols ignored:
   - `ACTION_NONE`, `PHOTO_NOT_PROVIDED`, `CROP_IDENTIFIED`, `SEVERITY_MEDIUM` never enter hypothesis matching.
5. Structural guard:
   - no live graph path reintroduces raw stage hard filtering before observation evidence scoring.

### Boundaries
- No database schema migration.
- No seed data edits unless explicitly requested later.
- No rice-specific TypeScript patch.
- No hardcoded agronomic diagnosis.
- No LLM fallback for agronomy.
- IOM remains only a discovery seed; farmer options remain hypothesis-graph-owned.