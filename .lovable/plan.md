
# 100% Accurate Fix Plan — Neuro-Symbolic Brain: Rice EMERGENCE_FAILURE regression

Ordered by architectural gravity, not by log-visibility. The user's cross-audit is correct: **the previous plan optimized clarification cosmetics before fixing the OBSERVATION → HYPOTHESIS authority collapse**. This plan reverses that order and removes every hardcoded agronomy leak the previous plan re-introduced.

Target invariant, non-negotiable:

```
DB  = Agriculture Brain
TS  = Graph Runtime  (routing + guards only, zero enums, zero crop/pest/stage/symptom literals)
LLM = Farmer Language Narrator
```

---

## Priority 1 — Make `HypothesisGraphLoader` the SSOT for hypothesis retrieval

**Files:** `agents/orchestrator.ts` (L522, L4808–L4934), `decision/hypothesis-evaluator.ts`, `decision/hypothesis-graph-evaluator.ts` (ghost dynamic import at L4814), `graph/HypothesisGraphLoader.ts`, new `graph/GraphRuntime.ts`.

Today's runtime has three parallel hypothesis code paths (`evaluateCandidateHypotheses`, dynamically-imported `evaluateHypothesisGraph`, and the inert `HypothesisGraphLoader`). Any patch that targets only one of them will keep bleeding.

Steps:
1. Introduce `graph/GraphRuntime.ts` — a thin facade that owns `createGraphLoaders(supabase)` and exposes `run({ intent, crop, stage, das, observations, variety_id, session_state })` returning `{ candidates, winner, evidence_gaps, trace }`.
2. Migrate the retrieval body of `hypothesis-evaluator.ts` into `HypothesisGraphLoader.getCandidates(...)` — no scoring rewrite, no algorithm change; move the SQL only. Every other module continues calling `evaluateCandidateHypotheses`, which now delegates to `GraphRuntime`.
3. Delete `decision/hypothesis-graph-evaluator.ts` and its dynamic-import branch at `orchestrator.ts:4814`.
4. Emit `[GRAPH_RUNTIME] loader=HypothesisGraphLoader candidates=<n> ms=<n>` per call so the next audit sees one number, not two.

Result: one path, one authority, one trace line.

---

## Priority 2 — Structural invariant: **clarification cannot fire before the hypothesis graph has executed**

**Files:** `agents/orchestrator.ts` (L5216–L5220, L4488–L4493), `runtime/clarification-authority.ts`.

The previous plan's condition `informative_count >= 1` is fragile (the user is right — one vague symptom is not sufficient evidence). Replace the ad-hoc merge with a hard runtime invariant:

```
If  intent ∈ {DIAGNOSIS, MIXED}  AND  evidence_frozen == true  AND  graph_executed == false
Then  clarification is FORBIDDEN this turn.
       run GraphRuntime.
       clarification, if any, is decided from GraphRuntime.evidence_gaps only.
```

Implementation:
1. Add a per-request boolean `graphExecuted` on the orchestrator's request context, set to `true` only after `GraphRuntime.run(...)` returns.
2. In `decideClarification(state, ctx)` refuse `required=true` whenever `mode !== 'ADVISORY' && !ctx.graphExecuted` — throw a structured `SYMBOLIC_CONTRACT_VIOLATION` (logged, then downgrade to "run graph now" instead of returning to the farmer). This kills every shadow-authority path (UnderstandingChecker, Stage 4, direct-return branches).
3. `UnderstandingChecker` becomes purely advisory: it can annotate the response for the narrator but MUST NOT set `clarification_required`. Its call sites that mutate the flag are removed.
4. Trace `[CLARIFY_AUTHORITY] source=CONVERSATION_STATE|GRAPH_GAPS required=<bool> reason=<r>` at the single decision point.

This is the correction to the previous Patch A and closes every "shadow gate" at once, without special-casing UnderstandingChecker.

---

## Priority 3 — Remove all TypeScript enums from clarification eligibility; move the decision into the DB

**Files:** `runtime/clarification-contract.ts` (Stage 2 hardcoded `OBSERVABLE_TYPES`, fallback allow-list ~L297), new migration on `observation_master`, new table `clarification_fallback_questions`.

The current allow-list `{SYMPTOM, OBSERVATION, SIGN, FARMER_OBSERVATION}` has zero overlap with the curator vocabulary (`GENERIC, PRIMARY, SECONDARY`). Even the previous plan's replacement (`is_diagnostic` toggled by IOM `assertion_strength`) is still business logic in TS.

Migration (schema-only, additive, `service_role` grant included):

```sql
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS can_generate_question boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.observation_master.can_generate_question IS
  'When true, this observation is eligible as a farmer-facing clarification option.';

CREATE TABLE IF NOT EXISTS public.clarification_fallback_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_code text UNIQUE NOT NULL,
  intent_family text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clarification_fallback_questions TO anon, authenticated;
GRANT ALL    ON public.clarification_fallback_questions TO service_role;
ALTER TABLE public.clarification_fallback_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fallback questions" ON public.clarification_fallback_questions FOR SELECT USING (true);
```

Runtime change in `clarification-contract.ts`:
1. Delete `OBSERVABLE_TYPES`. Stage 2 becomes: `active=true AND is_farmer_observable=true AND can_generate_question=true`.
2. Delete the hardcoded fallback allow-list. When IOM returns zero candidates, load rows from `clarification_fallback_questions` filtered by the current intent family, order by priority. This directly closes the user's rejection of the previous Patch C.
3. Trace `[CONTRACT_GATE_V3] kept=<n> dropped_inactive=<n> dropped_not_farmer=<n> dropped_not_askable=<n>` and `[CONTRACT_FALLBACK_DB] intent_family=<f> loaded=<n>`.

Data backfill (separate insert step, not this migration): set `can_generate_question=true` for every row where `is_farmer_observable=true AND is_diagnostic=false`, and for IOM `LITERAL` members where `is_diagnostic=true`. Curator can then tune. Seed the four generic fallbacks (`photo_upload`, `water_stress_check`, `pest_check`, `nutrient_check`) into `clarification_fallback_questions`, one per intent family.

---

## Priority 4 — DB-driven canonical observation expansion; delete the terminal guard

**Files:** `agents/orchestrator.ts` (L4114 TERMINAL GUARD, L4125 CrossCropFix, and the site around L4670 named in `OBSERVATION_GRAPH_AUDIT.md §5`), new `graph/ObservationAuthorityService.ts`.

The current `TERMINAL GUARD` and `CrossCropFix` are hardcoded lists dressed up as guards. They are the exact anti-pattern the target architecture forbids.

Steps:
1. Implement `ObservationAuthorityService.expand({ intent, crop, confirmed_codes })`:
   - Query `intent_observation_mapping WHERE intent_code=$intent AND crop_code IN ($crop,'universal') AND assertion_strength='LITERAL' AND is_active=true`.
   - If any input code is a LITERAL peer, union the entire LITERAL peer set into the evidence set as `INFERRED / source=IOM_LITERAL_PEER`.
   - Return `{ evidence, peers, blocked: [] }` — the service never blocks based on hardcoded lists; blocking, if needed, is derived from `intent_observation_mapping.is_active=false` rows only.
2. Delete both branches at `orchestrator.ts:4114` (`TERMINAL GUARD Blocked cross-crop terminal code`) and `L4125` (`CrossCropFix BLOCKED`). Any code the DB says is a LITERAL peer for `(intent, crop)` is admissible; nothing else needs to be block-listed at runtime.
3. Trace `[OBSERVATION_CANONICAL_RESOLVE] crop=<c> intent=<i> literal_peers=[…] source=intent_observation_mapping`.
4. Feed the expanded set into `GraphRuntime.run(...)` (Priority 1) so `hypothesis_conditions` for `RICE_GERMINATION_FAILURE` can finally match. This is the missing edge that the last two audits both pointed at.

---

## Priority 5 — Real exit-site instrumentation

**Files:** `agents/orchestrator.ts`, `agents/clarification-generator.ts`, `runtime/clarification-contract.ts`.

The 11 previously-tagged sites never fire because the actual clarification is emitted from `understandingResult.clarification_required` (~L5220), from `clarification-generator.ts` entry points, and from the two `no-IOM-candidates` branches in `clarification-contract.ts`.

Steps:
1. `grep -n "response_type\s*[:=]\s*['\"]CLARIFICATION_QUESTION['\"]"` and tag every write with `[CLARIFY_EXIT] site=<EXIT_NN_NAME> trace=<t> intent=<i> crop=<c> stage=<s>` immediately before the return.
2. Add `[CLARIFY_EXIT] site=CONTRACT_EMPTY_IOM reason=all_dropped drop_reasons=<json>` and `[CLARIFY_EXIT] site=CONTRACT_NO_CANDIDATES` inside `clarification-contract.ts`.
3. Do the same in `clarification-generator.ts` for the two builder branches.

Pure logging; zero behavior change.

---

## Cross-audit corrections applied

- **Rejected previous Patch A trigger `informative_count>=1`** — replaced with the structural invariant "graph before clarification" (Priority 2).
- **Rejected previous Patch B `is_diagnostic ↔ LITERAL` toggle in TS** — replaced with `observation_master.can_generate_question` DB flag (Priority 3).
- **Rejected previous Patch C hardcoded fallback allow-list** — replaced with `clarification_fallback_questions` table (Priority 3).
- **Rejected previous Patch D "scope the guard"** — the guard itself is the anti-pattern; deleted entirely and replaced with `ObservationAuthorityService` (Priority 4).
- **Kept previous Patch E** at the lowest priority — good hygiene, not a brain fix.

## Explicit non-goals

- No LLM prompt changes.
- No hardcoded crop/pest/stage/symptom/nutrient string anywhere in TS.
- No UI change on `/app/chat`.
- No new hypothesis rows seeded until Priority 1–4 land and the next failing-query log confirms whether `hyp>0` is still zero (matches Lovable's earlier deferral, but now measurable).

## Verification signals in the next `भात अजून उगवले नाही` log

```
[GRAPH_RUNTIME] loader=HypothesisGraphLoader candidates=>0 ms=<n>
[CLARIFY_AUTHORITY] source=GRAPH_GAPS required=false reason=sufficient_from_graph
[OBSERVATION_CANONICAL_RESOLVE] crop=rice intent=EMERGENCE_FAILURE literal_peers=[poor_germination, germination_failure, obs_rice_no_emergence, obs_rice_patchy_emergence, seed_not_germinated, germination_concern, delayed_germination]
[CONTRACT_GATE_V3] kept=>0 …
[BRAIN_TRACE][POST_RULE] trace=… candidates=>0 eligible=>0 winner=<rule_id>
```

Any `SYMBOLIC_CONTRACT_VIOLATION` line pinpoints the exact remaining shadow authority in one grep.

## Build-mode execution order

1. Priority 1 (Graph SSOT) — code only, no migration.
2. Priority 2 (Clarification invariant) — code only.
3. Priority 3 — migration first (`can_generate_question` + `clarification_fallback_questions`), backfill inserts second, contract rewrite third.
4. Priority 4 — code + delete guard.
5. Priority 5 — instrumentation.
6. Fire the failing Marathi query, attach fresh log, verify all five verification signals.
