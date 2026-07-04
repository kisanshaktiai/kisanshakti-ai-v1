# OBSERVATION → HYPOTHESIS GRAPH AUDIT
Date: 2026-07-04
Scope: Marathi query `भात अजून उगवले नाही` on a rice land, DAS ~26.

## 1. Raw pipeline (as-is)

| Stage | Producer | Value observed in current runtime |
|---|---|---|
| Farmer text | NLU / extractor | `POOR_GERMINATION` |
| Alias resolver | `observation_aliases` (concept-bridge.ts → `bridgeCodesDb`) | `poor_germination` |
| Hypothesis condition | `hypothesis_conditions.value_json` for `RICE_GERMINATION_FAILURE` | `[obs_rice_no_emergence, obs_rice_patchy_emergence, obs_rice_seed_rotted, obs_rice_seedling_damping_off]` |
| Match? | `causal-hypothesis-engine.ts` OBSERVATION.CONTAINS | **NO** — `poor_germination` ∉ condition set → hypothesis PRUNED |

The `observation_aliases` table has ONLY the identity row `POOR_GERMINATION → poor_germination`. There is no per-crop row bridging a universal observation to a crop-specific canonical node, and adding one per crop×symptom would explode combinatorially and is not the correct ontology location.

## 2. Where the actual ontology lives

`intent_observation_mapping` already curates the crop-scoped equivalence class:

```
intent_code=EMERGENCE_FAILURE, crop_code=rice, is_active=true
  LITERAL      poor_germination
  LITERAL      poor_germination_percent
  LITERAL      germination_failure
  LITERAL      germination_concern
  LITERAL      delayed_germination
  LITERAL      obs_rice_no_emergence          ← required by hypothesis_conditions
  LITERAL      obs_rice_patchy_emergence      ← required by hypothesis_conditions
  LITERAL      seed_not_germinated
  DIFFERENTIAL obs_rice_seed_rotted
  DIFFERENTIAL obs_rice_seedling_damping_off
  DIFFERENTIAL gap_formation | uneven_emergence | germination_patchy | seedling_died | obs_soil_crust_formed
```

For a given `(intent_code, crop_code)`, all `LITERAL` rows are semantically equivalent evidence. This is the missing graph edge: if the farmer confirmed one LITERAL member, its crop-specific LITERAL peers must be treated as inferred evidence so hypothesis conditions authored against crop-specific codes can fire.

## 3. Root cause of the break

* Alias bridge is generic → generic (`POOR_GERMINATION → poor_germination`). Correct.
* Hypothesis authors correctly write crop-specific canonical codes (`obs_rice_no_emergence`).
* No runtime step promotes a generic LITERAL to its crop-specific LITERAL peers via `intent_observation_mapping`.

## 4. Fix (DB-driven, no hardcoded agronomy)

Add `resolveCropCanonicalObservations(supabase, intentCode, cropCode, canonicalCodes)`:

1. Load `intent_observation_mapping` rows for `(intent_code, crop_code IN (cropCode, 'universal'), assertion_strength='LITERAL', is_active=true)`.
2. If ANY input canonical code is a LITERAL member for `(intent, crop)`, union the entire LITERAL member set into the evidence.
3. Register each newly injected code in the observation ledger as `INFERRED` with source `IOM_LITERAL_PEER`.
4. Emit `[OBSERVATION_CANONICAL_RESOLVE]` trace.

No mapping tables added. No hardcoded crop / stage / symptom / pest / disease list added. The ontology stays in `intent_observation_mapping` where curators already maintain it.

## 5. Wiring

`orchestrator.ts` (~line 4670–4693): after `bridgeCodesDb`, call `resolveCropCanonicalObservations` before `evaluateCandidateHypotheses`. Freeze the resulting `canonical_observation_codes` set.

## 6. Regression expectation

Query `भात अजून उगवले नाही` and paraphrase `या शेतातील पिक अजून उगवले नाही` both produce:

```
[OBSERVATION_EXTRACTED]      raw=POOR_GERMINATION
[OBSERVATION_BRIDGE]         raw=POOR_GERMINATION generic=poor_germination source=observation_aliases
[OBSERVATION_CANONICAL_RESOLVE] crop=rice intent=EMERGENCE_FAILURE
                             literal_peers=[poor_germination, germination_failure, delayed_germination, obs_rice_no_emergence, obs_rice_patchy_emergence, seed_not_germinated, ...]
                             source=intent_observation_mapping
[HYPOTHESIS_TRACE]           RICE_GERMINATION_FAILURE condition=PASS
```
