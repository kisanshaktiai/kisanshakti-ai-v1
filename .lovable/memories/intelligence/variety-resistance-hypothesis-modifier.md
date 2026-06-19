---
name: Variety Resistance Hypothesis Modifier
description: PHASE-4 — variety_resistance table re-ranks hypothesis candidates by multiplying total_score with a level-based factor (HR 0.55, R 0.70, MR 0.88, MS 1.10, S 1.25). Never hard-filters.
type: feature
---

# Variety-Resistance Confidence Modifier (Phase 4)

## Where
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` — `computeVarietyResistanceMatch()` applied inside the scoring loop.
- Input shape: `HypothesisEvaluationInput.variety_resistance: VarietyResistanceEntry[]`.
- Output shape: `CandidateHypothesis` gains optional `variety_modifier`, `variety_resistance_level`, `variety_resistance_match`.

## Multipliers (single source of truth)
| level | multiplier | meaning                         |
|-------|------------|---------------------------------|
| HR    | 0.55       | highly resistant — strong down  |
| R     | 0.70       | resistant                       |
| MR    | 0.88       | moderately resistant            |
| MS    | 1.10       | moderately susceptible          |
| S     | 1.25       | susceptible                     |
| other | 1.00       | no-op                           |

Strongest-effect entry wins when multiple resistance rows match the same candidate.

## Matching logic
1. UPPER-case code match on `observation_code` and `canonical_observation_code` against candidate's `cause`, `canonical_group`, `observable_characteristics.observation_key`, and `matched_conditions`.
2. Fallback: normalized substring match of `pathogen` against normalized cause / labels (≥4 chars).

## Data flow
1. `_shared/variety-context.ts::loadVarietyProfile` reads `variety_resistance` (incl. `canonical_observation_code`) and attaches `resistance[]` to `landContext.variety_profile`.
2. Orchestrator forwards `variety_resistance` to:
   - `evaluateCandidateHypotheses(...)` direct call.
   - `RuleDrivenClarificationInput` → `fetchRuleDrivenClarificationOptions` → evaluator.

## Invariants
- NEVER hard-filters a candidate; treatment safety gates remain authoritative.
- score is clamped to `[0, 1]` after multiplication.
- No-op when `variety_resistance` is empty/undefined — Phase 4 is backward compatible with the 89 crops that have no varieties seeded.
- Modifier log line: `🧬 [VarietyResistance] <rule_id> (<cause>) matched <key> → <LEVEL> ×<mult>`.
