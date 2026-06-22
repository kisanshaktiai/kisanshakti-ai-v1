# Observation Contamination — Forensic Fix Plan

## Phase 1 — Forensic Trace (root cause, file + line)

Input `भात अद्याप उगवले नाही` → intent `EMERGENCE_FAILURE`, single farmer symptom `OBS_RICE_NO_EMERGENCE`. The pool then grows to 12 because **three independent sources merge candidates into the confirmed lane**:

| # | Source | File | Line | Defect |
|---|---|---|---|---|
| C1 | DB intent→observation injector | `agents/orchestrator.ts` | 3017–3041 | `resolveIntentToObservations()` returns up to **25** rows from `intent_observation_mapping` (hypothesis space for the intent) and unions them directly into `expandedObservationCodes`. These are candidates, never farmer-asserted. |
| C2 | Hardcoded "RICE_EMERGENCE_GUARD" | `agents/orchestrator.ts` | 3049–3064 | Hardcoded array (`OBS_RICE_NO_EMERGENCE`, `PATCHY_EMERGENCE`, `POOR_GERMINATION`, `GAPS_IN_FIELD`, `SEEDLING_DIED`) merged into the same confirmed list. Violates "no hardcoded logic". |
| C3 | Bidirectional alias expander | `decision/observation-code-mapper.ts` 541–589 | `expandObservationVocabularyViaAliases()` is symmetric (alias↔canonical). When used on hypothesis codes it expands the candidate space further into confirmed. |
| C4 | Single-bucket merge into `inductionResult.symptoms` | `agents/orchestrator.ts` 3256–3322 | All `expandedObservationCodes` are pushed as `{symbol, confidence: intent_confidence, source: 'LLM_SEMANTIC_EXTRACTOR'}` regardless of origin — provenance is lost and confidence is inherited from intent, not evidence. |
| C5 | No `confirmed/candidate` split in canonical state | `agents/canonical-state-builder.ts`, `decision/observation-rule-lookup.ts` 52 | Downstream consumers read a single `confirmedObservations[]`; clarification + rule lookup + hypothesis evaluator treat the whole list as evidence. |

Resulting violation: candidate (`OBS_RICE_SEED_ROTTED`, `OBS_SOIL_CRUST_FORMED`, `OBS_RICE_SEEDLING_DAMPING_OFF`, …) reach `confirmedObservations` → clarification generator builds questions out of *causes*, not *observables*.

## Phase 2 — Architectural fix (evidence separation)

Introduce a strict two-lane contract everywhere observations flow.

```text
RAW_USER_MESSAGE
  │
  ▼
semanticExtraction.observation_codes        ──► CONFIRMED  (farmer-asserted only)
                                                  │
intent_observation_mapping (DB)             ──► CANDIDATE  (provenance=INTENT_MAP)
observation_aliases (canonical-only side)   ──► applied per-lane, never cross-lane
hypothesis_master expansion (DB)            ──► CANDIDATE  (provenance=HYPOTHESIS)
land/sensor/photo-vision verified facts     ──► CONFIRMED  (provenance=SENSOR|VISION_VERIFIED)
                                                  │
                                                  ▼
                                       EvidenceGraph { confirmed, candidate }
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                  HypothesisEvaluator    ClarificationGenerator   RuleEngine
                  (reads candidate+      (asks observables to     (fires only on
                   confirmed)             promote candidate→       confirmed)
                                          confirmed)
```

### Files to change

1. **New** `decision/evidence-graph.ts`
   - Types: `ObservationProvenance = 'FARMER_ASSERTED'|'SENSOR'|'VISION_VERIFIED'|'INTENT_MAP'|'ALIAS_EXPAND'|'HYPOTHESIS'|'CLARIFICATION_CONFIRMED'`
   - `EvidenceGraph { confirmed: Map<code, EvidenceNode>, candidate: Map<code, EvidenceNode> }`
   - `addConfirmed()` rejects provenance ∈ {INTENT_MAP, ALIAS_EXPAND, HYPOTHESIS} → throws `ObservationIntegrityViolation` (caught + logged `OBSERVATION_CONTAMINATION_ERROR`, stripped before promotion).
   - `promoteToConfirmed(code, reason)` — only call site is clarification answer handler.

2. **Edit** `agents/orchestrator.ts`
   - L2975–3036: keep only `semanticExtraction.observation_codes` in `confirmedCodes`. Move DB-intent injection (L3017–3041) into `candidateCodes` with provenance `INTENT_MAP`.
   - L3049–3064: **delete** the hardcoded `RICE_EMERGENCE_GUARD` array. Replace with DB lookup of `intent_observation_mapping` filtered by `intent_code='EMERGENCE_FAILURE'` + crop — those rows go to the candidate lane like any other intent.
   - L3256–3322: split merge — confirmed codes → `inductionResult.symptoms` with their real source; candidate codes go to a new `inductionResult.candidate_symptoms` field. Update `symbol_coverage` to use only confirmed.

3. **Edit** `decision/observation-code-mapper.ts` 541–589
   - Add `direction: 'alias→canonical'|'canonical→alias'|'both'` param (default `'alias→canonical'` for confirmed lane: only normalization, no candidate fan-out).
   - Confirmed lane calls it with `alias→canonical`. Candidate-lane expansion (if used) calls with `both` and tags results `ALIAS_EXPAND`.

4. **Edit** `agents/canonical-state-builder.ts`
   - Add `confirmedObservations` + `candidateObservations` to canonical state. Existing single field becomes a derived getter that returns confirmed only (back-compat for consumers we don't touch this PR).

5. **Edit** `decision/observation-rule-lookup.ts` 52
   - Accept `{ confirmedObservations, candidateObservations }`. Rule firing uses confirmed only; candidate codes contribute to hypothesis scoring but cannot trigger a prescription.

6. **Edit** `decision/hypothesis-evaluator.ts`
   - Read both lanes; weight candidate evidence at ≤ 0.3× confirmed weight (DB-driven via existing `confidence_calculator` weights, no new magic numbers).

7. **Edit** `agents/clarification-generator.ts` + `agents/dynamic-clarification-generator.ts`
   - Source of clarification options = `candidateObservations` ∪ `hypothesis_master.differentiating_observations` (DB), restricted to rows where `observation_master.is_farmer_observable = true`. Order by `observation_master.evidence_rank ASC` (DB-driven). This produces observable questions ("water standing after sowing?") instead of cause questions ("seed rotted?").
   - If `observation_master.is_farmer_observable` / `evidence_rank` columns don't exist, plan adds a read-only **DB integrity report** in `.lovable/audits/` listing what's missing — no schema change in this PR. Coverage gaps for rice emergence (`OBS_DEEP_SOWING`, `OBS_EXCESS_WATER`, `OBS_WATERLOGGING_AFTER_SOWING`, `OBS_DRY_SEEDBED`, `OBS_POOR_SEED_VIGOR`, `OBS_SEED_WASHED_AWAY`, `OBS_BIRD_DAMAGE`, `OBS_RODENT_DAMAGE`, `OBS_TERMITE_SEED_DAMAGE`, `OBS_SOIL_HARDPAN`, `OBS_SALINITY_IN_SEEDBED`) reported as content tickets, not hardcoded.

8. **Edit** `index.ts` L1563–1598
   - Replace single `mergedSymptomKeys` with `{confirmed, candidate}`. `confirmedObservations` passed to bypass/safety only contains confirmed.

9. **Edit** `decision/safety-gates.ts`, `decision/unified-decision-gate.ts`
   - Decisions cannot be suppressed/escalated based on a candidate-only observation; logged with `bypass_reason='CANDIDATE_ONLY'` if attempted.

## Phase 3 — Runtime invariants

- `canonical-state-invariants.ts`: assert `confirmed ∩ candidate = ∅`; assert every code in `confirmed` has provenance ∈ {FARMER_ASSERTED, SENSOR, VISION_VERIFIED, CLARIFICATION_CONFIRMED}; on violation emit `OBSERVATION_CONTAMINATION_ERROR` (structured log) and **drop the offending code from confirmed** rather than crash.
- Add scope.emit event `evidence_lane_assignment` with `{code, lane, provenance, source_module}` for every add.

## Phase 4 — Regression tests

New `_tests/observation_integrity_test.ts`:
1. `भात अद्याप उगवले नाही` (rice, DAS 14) → `confirmed = ['OBS_RICE_NO_EMERGENCE']`; candidate ⊇ {`OBS_RICE_SEED_ROTTED`, `OBS_SOIL_CRUST_FORMED`, `OBS_RICE_SEEDLING_DAMPING_OFF`} and disjoint from confirmed.
2. Property: for 50 sampled intents from `intent_observation_mapping`, no row reaches `confirmedObservations` without a clarification-confirmed event.
3. Hardcoded-list scan: `rg "OBS_RICE_NO_EMERGENCE|OBS_RICE_PATCHY_EMERGENCE" supabase/functions/ai-agriculture-chat/agents/` must return zero matches (guard against re-introduction).
4. Clarification generator must not surface any option whose canonical code is in `confirmedObservations`.

## Phase 5 — Deploy + live verification

1. Deploy `ai-agriculture-chat`.
2. Re-run the Marathi rice emergence scenario, capture `evidence_lane_assignment` events + final canonical state.
3. Append findings + before/after lane tables to `.lovable/audits/system-audit-2026-06-22.md`.

## Out of scope (handed off as content tickets)

- Adding missing observation rows (`OBS_DEEP_SOWING`, `OBS_WATERLOGGING_AFTER_SOWING`, etc.) and missing `intent_observation_mapping` rows — DB content work, not code.
- Adding `is_farmer_observable` / `evidence_rank` columns if absent — separate migration PR.
- Frontend changes — none.

## Technical guarantees

- Zero new hardcoded observation lists. The deleted `RICE_EMERGENCE_GUARD` is replaced by `intent_observation_mapping` lookup.
- All ranking driven by DB columns (`confidence_rank`, `evidence_rank`); no inline magic numbers added.
- Backward-compatible: legacy single-field readers receive `confirmedObservations` only, so they cannot accidentally consume candidates.
