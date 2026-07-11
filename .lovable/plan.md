
# All-Crop Neuro-Symbolic Reasoning Fix (v4 — Generic Graph Correction)

## Guiding Invariants (unchanged)

- **DB = Agriculture Brain / Knowledge Graph** (SSOT for all agronomy).
- **Runtime = deterministic graph executor** — carries context, resolves paths, ranks evidence. No agronomy.
- **LLM = language layer only** — no diagnosis, no invention.

The rice "भात अजून उगवले नाही → STUNTED_GROWTH / WILTING / LEAF_CURLING" bug is treated as a symptom of **six generic graph defects**, not a rice fix.

---

## Verdict on Previous Patch Set (v3)

| Old Patch | Verdict | Reason |
|---|---|---|
| P1 — Bio validation writes `validated_stage = NOT_ESTABLISHED` | **REJECTED — redesign** | Mixes stage dimension with condition dimension. `NOT_ESTABLISHED` is a biological *constraint*, not a stage. |
| P2 — Dotted-path resolver in condition evaluator | **ACCEPTED as-is** | Pure runtime plumbing, no agronomy. |
| P3 — "If intent = EMERGENCE_FAILURE then ignore stage" | **REJECTED — redesign** | Intent-specific branch = crop/intent agronomy in TS. Replace with generic stage-as-ranking. |
| P4 — Remove hardcoded VEGETATIVE_STRESS list | **ACCEPTED, widen scope** | Sweep ALL hardcoded symptom lists across 4 files, not just one. |
| P5 — Intent-guard fallback → WAITING_FOR_OBSERVATION | **ACCEPTED, generalized** | Applies to every intent when DB returns 0 candidates. Never guess. |
| — | **NEW P6** — Graph-order audit | Stage must be evidence, not controller. |
| — | **NEW P7** — Intent ≠ Observation safety | Intent opens graph; observations require evidence. |

---

## Target Graph Flow (locked)

```text
Farmer utterance
   │
   ▼
Intent classification            (LLM + DB intent ontology)
   │
   ▼
Canonical Field Twin build       (crop_schedules + biological_state + soil_health + weather_* + ndvi_data + lands)
   │
   ▼
Observation candidate load       (intent_observation_mapping — DB-driven; stage = ranking factor only)
   │
   ▼
Biological State (predicted + constraints)
   ├── predicted_stage            from resolve_crop_phenology (DAS/GDD/schedule)
   ├── predicted_stage_confidence
   ├── biological_evidence[]      from canonical_context signals
   └── biological_constraints[]   emitted by DB constraint rules (never by TS)
   │
   ▼
Hypothesis graph evaluation      (uses canonical_context via generic path resolver)
   │
   ▼
Decision rules
   │
   ▼
LLM farmer voice rendering
```

Stage is **evidence** on the graph, never a gate.

---

## Patch Set v4 (execute in order)

### Patch 1 (REDESIGNED) — Biological State: prediction + constraints, never overwrite stage

**File:** `supabase/functions/ai-agriculture-chat/agents/biological-state.ts`
**File:** `supabase/functions/ai-agriculture-chat/runtime/phenology-reconciler.ts`

Extend the frozen `BiologicalState` with two additive fields:

```ts
readonly predicted_stage_confidence: number;       // 0..1
readonly biological_constraints: readonly BiologicalConstraint[];
```

Where:

```ts
interface BiologicalConstraint {
  readonly code: string;               // e.g. EMERGENCE_NOT_CONFIRMED, LOW_TILLER_POPULATION
  readonly severity: 'INFO'|'WARN'|'BLOCK';
  readonly evidence: Readonly<Record<string, unknown>>;   // fields that triggered it
  readonly source: string;             // DB rule id — NEVER a TS literal
}
```

Rules:
1. `growth_stage` / `stage_code` / `stage_uuid` remain untouched — still authored by `resolve_crop_phenology`.
2. Constraints are produced by **DB constraint rules** (existing `decision_rules` table, filtered `category = 'BIOLOGICAL_CONSTRAINT'` — no schema change; rules seeded outside this patch).
3. `phenology-reconciler.ts` only *reads* constraint outputs from DB and packages them into the frozen state. **Zero literals in TS** — no `if rainfall === 0`, no crop names.
4. Confidence is multiplied by `1 − Σ severity_weights(constraint)` where weights come from a small runtime table `SEVERITY_WEIGHTS = {INFO:0, WARN:0.2, BLOCK:0.6}` — this is graph math, not agronomy.

Downstream consumers (hypothesis evaluator, orchestrator) read `predicted_stage`, `predicted_stage_confidence`, and `biological_constraints[]` — they must not fabricate any of these.

### Patch 2 (ACCEPTED) — Generic dotted-path condition resolver

**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`

Add pure utility:

```ts
function resolvePath(obj: unknown, path: string): unknown { /* a.b.c walker */ }
```

Replace the flat-key lookup in the condition resolver with `resolvePath(canonical_context, condition.key)`. DB conditions may now reference:

- `weather.rainfall_after_sowing_mm`
- `weather.forecast_7d[0].tmax`
- `soil.moisture_status`
- `soil.organic_carbon_percent`
- `ndvi.value`, `ndvi.reliability`
- `biological_state.predicted_stage`
- `biological_state.biological_constraints[*].code`
- `crop_schedule.transplant_date`

All resolution is generic. Missing paths return `undefined` and the condition evaluates per existing NULL semantics (no change to comparator logic).

### Patch 3 (REDESIGNED) — Stage as ranking factor, never a hard gate

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (observation candidate load, ~line 6957)

Replace the current stage `WHERE` filter on `intent_observation_mapping` with:

1. Query candidates by `crop_code + intent_code` only (drop `growth_stage` from the WHERE).
2. Rank candidates via a generic scoring function that combines DB-provided weights only:
   - `iom.stage_compatibility_score(candidate, predicted_stage)`  ← already available or defaulted to 0.5
   - `iom.assertion_strength` (existing)
   - constraint alignment: +bonus if candidate's `semantic_class` matches any active `biological_constraints[*].code`
3. Never drop a candidate for stage mismatch; low-score candidates simply sort lower.

This is crop/intent-agnostic. Removes the `EMERGENCE_FAILURE`-specific branch entirely.

### Patch 4 (ACCEPTED, widened) — Purge all hardcoded symptom lists

Sweep and remove hardcoded observation arrays (`STUNTED_GROWTH`, `WILTING`, `LEAF_CURLING`, `LEAF_YELLOWING`, and any per-`FailureClass` map) from:

1. `supabase/functions/ai-agriculture-chat/decision/failure-class-detector.ts` (`getFailureClassFallbackOptions`, lines 411–455)
2. `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` (`useHypothesisFallback` path ~line 734)
3. `supabase/functions/ai-agriculture-chat/agents/language-induction-layer.ts` (any symptom-list constants)
4. `supabase/functions/ai-agriculture-chat/agents/llm-understanding-layer.ts` (same)

Replacement: single DB lookup

```ts
selectObservationsByFailureClass(supabase, {
  crop_code, failure_class, limit
})
```

reading `observation_master` filtered by `semantic_class` mapped to `failure_class` via existing `intent_semantic_class_allowlist`. Language synonym normalization is retained (that's language, not agronomy).

### Patch 5 (ACCEPTED, generalized) — No-evidence path never guesses

**Files:** `clarification-strategy.ts`, `failure-class-detector.ts`

When the DB returns **zero** candidates for a valid `(crop, intent, failure_class)`:

- Do **not** fall back to any TS list.
- Return sentinel `WAITING_FOR_OBSERVATION` — `graph-runtime.ts` OBS_GATE already handles this and drives ASK-clarification.

Applies to every intent, every crop, every stage.

### Patch 6 (NEW) — Graph order correction

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

Audit and reorder the pipeline sections so stage is never consulted **before** observation candidate load. Current call order in orchestrator:

```text
build canonical_context → resolve_phenology → filter observations by stage → hypothesis eval
```

New order:

```text
build canonical_context (includes biological_state.predicted_stage) →
load observation candidates by (crop, intent) →
score with stage as one factor →
hypothesis evaluation with full canonical_context (Patch 2)
```

No new modules. Only reordering + removing the stage `WHERE` filter (already covered by Patch 3). Verify no other call site treats `growth_stage` as a hard filter (`rg "growth_stage" supabase/functions/ai-agriculture-chat` and audit each hit).

### Patch 7 (NEW) — Intent ≠ Observation safety

**Files (audit):** `orchestrator.ts`, `clarification-strategy.ts`, `language-induction-layer.ts`, `llm-understanding-layer.ts`

Sweep:

```bash
rg "confirmed_observations|known_observations\.push|inferred_observations\.push"
```

Rules enforced at each hit:

1. An **intent code** may never be pushed into `confirmed_observations` or `known_observations`.
2. Only outputs of the observation candidate loader, image classifier, or explicit farmer confirmation may enter these arrays.
3. Add a runtime invariant guard (single utility in `runtime/graph-runtime.ts`, no new file):

   ```ts
   assertNotAnIntentCode(obsCode)   // throws OBS_INTENT_LEAK if obsCode ∈ intent_master
   ```

   Called at every push site. Uses in-memory intent code set already loaded at boot.

---

## Files Touched (exact list, no new files)

1. `supabase/functions/ai-agriculture-chat/agents/biological-state.ts` (P1)
2. `supabase/functions/ai-agriculture-chat/runtime/phenology-reconciler.ts` (P1)
3. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` (P2)
4. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (P3, P6, P7)
5. `supabase/functions/ai-agriculture-chat/decision/failure-class-detector.ts` (P4, P5)
6. `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` (P4, P5, P7)
7. `supabase/functions/ai-agriculture-chat/agents/language-induction-layer.ts` (P4, P7)
8. `supabase/functions/ai-agriculture-chat/agents/llm-understanding-layer.ts` (P4, P7)
9. `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts` (P7 guard utility)
10. `supabase/functions/ai-agriculture-chat/tests/observation-state-contract_test.ts` (new assertions, no new file)

Each file gets a CHANGE LOG entry per project rule.

---

## Proofs

**Proof no agronomy enters TS:**
- No literal rainfall thresholds, no crop names, no stage-transition rules, no symptom lists remain (Patches 4, 5, 1).
- Constraint codes (`EMERGENCE_NOT_CONFIRMED`, etc.) originate in `decision_rules` rows only; TS carries strings opaquely.
- Stage scoring weights come from `intent_observation_mapping` columns; only `SEVERITY_WEIGHTS` is a runtime math constant (INFO/WARN/BLOCK), not agronomy.

**Proof DB remains SSOT:**
- No new tables, no schema changes.
- New behavior driven by existing tables: `decision_rules`, `intent_observation_mapping`, `observation_master`, `intent_semantic_class_allowlist`, `crop_stage_master`.
- Bio constraints seeded via DB rules outside this patch (out of scope; runtime just consumes them).

---

## Expected New Graph Flow — Rice example (illustrative only, logic is generic)

1. Farmer: "भात अजून उगवले नाही"
2. Intent = `EMERGENCE_FAILURE` (DB intent map).
3. Canonical field twin built; `biological_state.predicted_stage = TILLERING` (DAS/GDD), `predicted_stage_confidence = 0.35` after DB constraint rule fires `EMERGENCE_NOT_CONFIRMED` (rainfall=0, NDVI null, moisture DRY) with `severity = BLOCK`.
4. Observation candidates loaded by `(RICE, EMERGENCE_FAILURE)` — stage NOT filtered. DB returns germination-family observations. Ranking bonus from `EMERGENCE_NOT_CONFIRMED` constraint alignment lifts them further.
5. If DB returns zero candidates → `WAITING_FOR_OBSERVATION`, ASK clarification.
6. No TS ever pushed `STUNTED_GROWTH` etc.

Same flow applies to cotton (POOR_ESTABLISHMENT), sugarcane (LOW_TILLER_POPULATION), wheat (heat stress), fruit crops — because none of the logic is per-crop.

---

## Rollback

Each patch is independently revertible. Patch 1's additive fields are inert without Patch 2. Patches 3/6 are reordering + removing a WHERE clause — trivial revert. Patches 4/5 revert restores the deleted TS lists.
