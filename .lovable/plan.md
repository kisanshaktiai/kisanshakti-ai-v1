
# Clarification Graph Forensic Audit + Single-Phase Surgical Repair

Scope: `supabase/functions/ai-agriculture-chat/**` clarification path only. No new files. No agronomy in TS. No crop-specific code. DB remains SSOT.

---

## 1. Verified Runtime Flow (with line numbers)

```
agents/clarification-generator.ts:268
  loadClarificationCandidates(max: 3)                     ← HARD CAP #1
    → runtime/clarification-contract.ts:85
        loadClarificationCandidates(max=3)
        → decision/hypothesis-clarification-builder.ts:63
            buildHypothesisClarificationOptions(max)
              1. resolveObservationSymbols(confirmed)     line 74
              2. seedCodes = confirmed OR loadIOMAllowed  line 79-89
              3. resolveHypothesesFromObservations        line 101
                 → hypothesis-graph-evaluator (stage/DAS HARD gates)
              4. hypothesisIds = matched OR nearest       line 108-111
              5. loadConditions (OBSERVATION only)        line 138-139
              6. extractObservationCodes per condition    line 143-148
              7. DEDUP by code, keep MAX weight edge      line 150-155 ← LINEAGE LOSS
              8. loadObservationMaster gate               line 157
              9. sort by weight desc, break at >= max     line 161,177 ← HARD CAP #2
```

## 2. Verified Defects (evidence only, no assumptions)

### D1 — Hypothesis lineage discarded at dedup (hypothesis-clarification-builder.ts:150-155)
`dedup` keeps a single `{code, condition}` per observation code, keyed only by `code.toLowerCase()`. All other hypotheses that share the same observation edge are silently dropped from the option set. Consequence: the graph collapses `Observation → Hypothesis → Observation` (one edge per code) instead of preserving `Hypothesis₁, Hypothesis₂, … → competing observation edges`.

### D2 — First-N truncation before diversification (line 161-177 + line 71 `max = 5`, caller `max: 3`)
Options are sorted purely by `condition.weight` and cut at `max`. When one hypothesis has three highest-weighted edges, ALL three options come from the same hypothesis. No round-robin across `hypothesis_id`. Graph search behaves as retrieval, not as competing-hypothesis discrimination.

### D3 — `is_discriminator` selected from DB but never used for ranking (line 195)
`hypothesis_conditions.is_discriminator` and `is_required` are loaded, then ignored. Information-gain ranking (discriminator > shared symptom) is not applied. Runtime picks "highest weight" instead of "highest discrimination", which are different (Phase 9 of audit brief).

### D4 — `max=3` propagated end-to-end (clarification-generator.ts:275, contract.ts:89, builder caller `max: 3`)
Farmer never sees enough competing options to discriminate hypotheses. Combined with D1+D2, output is 1–2 near-identical options for the same hypothesis, matching the reported production symptom (single/repetitive observation returned).

### D5 — Only exact-match hypotheses expanded; nearest-hypothesis expansion is all-or-nothing (line 108-127)
When `resolver.hypotheses` returns non-empty, `nearest_hypotheses` are ignored entirely. Competing but weaker hypotheses (which is precisely what a discrimination question exists to separate) never contribute observation edges.

### D6 — Graph does not include second-hop conditions from `hypothesis_master` neighbours
Loader queries `hypothesis_conditions` only for the pre-matched `hypothesisIds`. There is no expansion via `hypothesis_master`/`hypothesis_condition` graph to sibling hypotheses whose activation would be tested by the same discriminator. Graph search terminates after one hop.

## 3. Where information disappears

```
IOM seeds (~18)
    │  resolveObservationSymbols            ok
    ▼
Canonical symbols (~6–10)
    │  hypothesis-graph-evaluator: stage/DAS HARD gate
    ▼
Matched hypotheses (~2–5)   nearest_hypotheses (~3–6) ── DROPPED when matched>0  (D5)
    │  loadConditions
    ▼
OBSERVATION conditions (~10–25)
    │  dedup by code, keep max-weight edge only                                   (D1)
    ▼
Unique codes (~6–12)
    │  sort by weight, take first `max`=3                                          (D2)
    ▼
UI options (1–3, often same hypothesis)                                            (D4)
```

## 4. Root Causes (one sentence each)

- D1: dedup key = observation code, so all but the top-weight hypothesis edge for that code is deleted before ranking.
- D2: single-sort + cut at N eliminates hypothesis diversity when one hypothesis dominates by weight.
- D3: `is_discriminator` / `is_required` are queried but never contribute to score.
- D4: `max = 3` default is enforced at three layers; graph never explores wider.
- D5: `nearest_hypotheses` are only used as fallback, never merged with matched set.
- D6: no BFS over `hypothesis_master` neighbours → graph is one-hop.

## 5. Single-Phase Surgical Repair (files & functions only)

All edits are inside `decision/hypothesis-clarification-builder.ts` and thin config plumbing in `runtime/clarification-contract.ts` + `agents/clarification-generator.ts`. No new files. No DB schema change. No agronomy.

### Patch A — Preserve hypothesis lineage (`hypothesis-clarification-builder.ts`)
- Change `dedup: Map<code, edge>` to `edgesByCode: Map<code, Edge[]>` where `Edge = {condition, hypothesis_id, weight, is_discriminator, is_required}`.
- Compute per-code aggregate score = `max(weight)` + `discrimination_bonus` (from `is_discriminator=true`) + `required_bonus` (from `is_required=true`). Values come from DB via `system_config` keys (`clarification_discriminator_bonus`, `clarification_required_bonus`), default 0.25 / 0.15 — configurable, not agronomic.
- Retain `hypothesis_ids: string[]` per code for downstream telemetry and diversification.

### Patch B — Round-robin diversification + information-gain ranking
- Replace the "sort by weight, break at max" loop with a two-stage selector:
  1. Rank codes by aggregate score (Patch A).
  2. Emit options in a per-hypothesis round-robin: for each rank pass, pick the top remaining code whose primary hypothesis has not yet contributed an option; only after every candidate hypothesis has contributed do we allow a second option from the same hypothesis.
- Stops when either `options.length >= max` **or** `hypotheses_covered === hypothesisIds.length` (whichever is later, so competing hypotheses are always represented).

### Patch C — Union matched + nearest hypotheses (D5, D6 partial)
- Replace `if (matched===0) use nearest` with `hypothesisIds = union(matched, nearest.slice(0, N))` where `N` is `system_config.clarification_nearest_expansion` (default 3). This is graph completeness, not agronomy.
- Guarded by `resolver.nearest_hypotheses.length > 0` and stage/DAS soft-filter already produced upstream (no re-derivation here).

### Patch D — Raise `max` and split "collect" from "return"
- `loadClarificationCandidates` (contract.ts) and caller (clarification-generator.ts) pass a `collect_max` (default 12 via DB `system_config.clarification_collect_max`) to the builder, and a separate `render_max` (default 4) used only at final serialization.
- Builder does global ranking over `collect_max`, then returns `render_max` post-diversification. Collect-then-rank replaces first-N truncation.

### Patch E — Structured trace at every hop
Extend the existing `[HYP_CLARIFICATION]` log with counters: `iom_seeds`, `resolved_symbols`, `hypotheses_matched`, `hypotheses_nearest`, `hypotheses_used`, `edges_pre_dedup`, `edges_post_dedup`, `codes_ranked`, `options_emitted`, `options_by_hypothesis`. Reuses `graph-node-trace.ts::emitNodeTrace('HYPOTHESIS', …)` — no new file.

## 6. Impact Analysis

| Layer | Effect |
|---|---|
| Intent | none — unchanged inputs |
| Observation | none — same `observation_master` gate |
| Hypothesis | competing hypotheses now survive to UI stage |
| Rule | none — clarification is pre-rule |
| Treatment | none |
| Clarification | 3-4 diverse options, one per top hypothesis, ranked by discriminator power |
| GraphRuntime | one extra `.in()` query is avoided — same DB round-trips |
| CanonicalContext | untouched, still passed by reference |
| Performance | O(k log k) sort over ≤12 codes; per-turn cost unchanged |
| Scalability | no new tables, no full-scan queries, safe for millions QPS |

## 7. Regression Analysis

- GraphTruth preserved — no changes to `hypothesis-graph-evaluator` or predicate resolution.
- CanonicalContext preserved — still immutable, passed by reference.
- DB remains SSOT — new tunables read from `system_config`, defaults only when key absent.
- LLM unchanged — clarification renderer still consumes `{label, observation_key}` objects; shape unchanged (Patch B enriches the array, doesn't rename fields).
- Existing empty-result path (`graph_gap = NO_STAGE_VALID_HYPOTHESES`) untouched.
- Confirmed-observation dedup (line 141-145) untouched — we still never re-ask a confirmed code.
- Outbound `assertClarificationContract` allowlist logic untouched.

## 8. Verification Checklist (crop-agnostic — DB drives behaviour)

For each scenario the repaired graph must return ≥ 2 discriminator-ranked options drawn from ≥ 2 distinct hypotheses (assuming DB has ≥ 2 hypotheses for the cell):

- [ ] Emergence failure (rice DSR DAS 17 — production trigger)
- [ ] Poor germination (any crop, DAS ≤ 30)
- [ ] Establishment failure (any transplanted crop)
- [ ] Pest diagnosis with ≥ 2 candidate pests
- [ ] Disease diagnosis with ≥ 2 candidate pathogens
- [ ] Nutrient deficiency (N vs K vs micro)
- [ ] Irrigation stress vs drought vs waterlogging
- [ ] Abiotic stress (heat / cold / salinity)
- [ ] Weather-triggered damage (post-rain, post-hail)
- [ ] Mixed observations (biotic + abiotic co-present)

## 9. Files to change

- `supabase/functions/ai-agriculture-chat/decision/hypothesis-clarification-builder.ts` (Patches A, B, C, E)
- `supabase/functions/ai-agriculture-chat/runtime/clarification-contract.ts` (Patch D — plumb `collect_max`)
- `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts` (Patch D — pass `collect_max` from `system_config`)

No new files. No DB migration. No crop / stage / symptom string added to TypeScript.

## 10. Deploy

Redeploy `ai-agriculture-chat` edge function after edits. Verify with a single Marathi emergence-failure query and confirm `[HYP_CLARIFICATION]` shows `hypotheses_used ≥ 2`, `options_by_hypothesis` shows round-robin distribution, and UI returns ≥ 2 distinct options.
