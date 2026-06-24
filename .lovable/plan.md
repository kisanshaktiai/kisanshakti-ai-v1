
# Critical Bug Fix — "Diagnostic-Entry" Observations Trapped by Terminal-Damage + Understanding Gate

## 1. Confirmed root cause (single bug expressed in 4 places)

The Marathi query "पिक अद्याप उगवले नाही" extracts six valid observations (`GERMINATION_FAILURE`, `DELAYED_GERMINATION`, `OBS_RICE_NO_EMERGENCE`, `GERMINATION_CONCERN`, `POOR_GERMINATION_PERCENT`, `OBS_RICE_PATCHY_EMERGENCE`) yet the runtime decision is `CLARIFY` / `UNDERSTANDING_GATE`. The symbolic decision brain is never reached. Four code defects collude:

| # | File | Line | Defect |
|---|------|------|--------|
| 1 | `decision/diagnosis-only-mode.ts` | 86 | `GERMINATION_FAILURE` is in `TERMINAL_DAMAGE_OBSERVATION_KEYS`. It is a diagnostic *entry*, not a terminal verdict. Causes downstream routes to demand confirmation / freeze diagnosis. |
| 2 | `utils/observation-authority.ts` | 183 | `GERMINATION_FAILURE` is in `TERMINAL_CODES_BLOCKED_FROM_INJECTION`. Blocks the symbolic brain from accepting the observation as confirmed evidence. |
| 3 | `agents/understanding-completeness-checker.ts` | 99-138, 359-385 | Demands `affected_part / symptom_distribution / severity_words / time_reference`, none of which apply to "crop never emerged". Score lands at ~53%, threshold 60% → `clarification_required=true`. |
| 4 | `decision/decision-readiness-gate.ts` | 99-150 | Returns `ready=false` when `hypothesis_master` has no entries for the GERMINATION canonical group. The orchestrator then falls through to the Understanding Gate. |
| 5 | `decision/hypothesis-evaluator.ts` | ~960-1080 | No stage-bias suppression. Leaf/rust/borer hypotheses dilute the germination causes; relevant causes (`SEED_ROT`, `WATERLOGGING`, `SOIL_CRUST`, `DEEP_SOWING`, `TERMITE_DAMAGE`, `BIRD_DAMAGE`, `POOR_SEED_VIABILITY`) get no priority. |

## 2. Fix (surgical, only the 5 files above — no DB changes, no graph refactor)

### File 1 — `decision/diagnosis-only-mode.ts`
- Introduce a new set `DIAGNOSTIC_ENTRY_OBSERVATION_KEYS` containing:
  ```
  GERMINATION_FAILURE, NO_EMERGENCE, OBS_RICE_NO_EMERGENCE,
  DELAYED_GERMINATION, POOR_GERMINATION, POOR_GERMINATION_PERCENT,
  UNEVEN_EMERGENCE, OBS_RICE_PATCHY_EMERGENCE, GERMINATION_CONCERN,
  ESTABLISHMENT_FAILURE (when DAS < 25)
  ```
- **Remove `GERMINATION_FAILURE` from `TERMINAL_DAMAGE_OBSERVATION_KEYS`**. Add it (and the other entry codes) to a new exported set `DIAGNOSTIC_ENTRY_OBSERVATION_KEYS`.
- Update `CROP_DAMAGE_OBSERVATION_KEYS` semantics so entry codes route to the diagnostic engine, not the terminal-damage lane.
- Export a helper `isDiagnosticEntryObservation(code: string): boolean`.

### File 2 — `utils/observation-authority.ts`
- Remove `GERMINATION_FAILURE` from `TERMINAL_CODES_BLOCKED_FROM_INJECTION`. The other death codes (`PLANT_DEATH`, `SEEDLING_DEATH`, `CROP_FAILURE`, `PLANT_DIED`, `SEEDLING_DIED`, `DEAD_SEEDLINGS`, `COMPLETE_DRYING`) stay — they ARE terminal.
- Add a short comment explaining why germination/emergence codes are excluded: *"diagnostic entry, not terminal verdict"*.

### File 3 — `agents/understanding-completeness-checker.ts`
- Add a **diagnostic-entry short-circuit** at the top of `checkUnderstandingCompleteness()`. If `extracted_observations` contains any code matched by `isDiagnosticEntryObservation`, then:
  - Skip the `affected_part / symptom_distribution / severity_words / time_reference` penalties.
  - Treat them as N/A (do not count their weights into `maxScore`).
  - Set `understanding_confidence = HIGH` and `clarification_required = false` if crop context is present (either `obs.crop_mentioned` or `landContext.current_crop`).
  - Push `diagnostic_entry_bypass` into a new debug field and log: `[UnderstandingChecker] DIAGNOSTIC_ENTRY bypass — crop="…" entry_codes=[…]`.
- Keep the existing vague-symptom ambiguity check, but exclude entry codes from triggering it.
- Bump `UNDERSTANDING_CHECKER_VERSION` to `2.1.0`.

### File 4 — `decision/decision-readiness-gate.ts`
- Add a **diagnostic-entry pre-check** at the very top of `runHypothesisReadinessProbe`, before calling `evaluateCandidateHypotheses`:
  ```ts
  const ENTRY = new Set([
    'GERMINATION_FAILURE','NO_EMERGENCE','OBS_RICE_NO_EMERGENCE',
    'DELAYED_GERMINATION','POOR_GERMINATION','POOR_GERMINATION_PERCENT',
    'UNEVEN_EMERGENCE','OBS_RICE_PATCHY_EMERGENCE','GERMINATION_CONCERN'
  ]);
  const hasEntry = input.known_observations.some(o => ENTRY.has(o.toUpperCase()));
  if (hasEntry && input.crop_code && input.crop_code !== 'UNKNOWN') {
    // still call evaluator so we get candidates, but force ready=true
    // regardless of score — the symbolic brain MUST run.
  }
  ```
- After the evaluator returns, if `hasEntry` is true, override `ready=true` with `reason='DIAGNOSTIC_ENTRY_OBSERVATION'` even when `top_score < 0.55`. The downstream rule engine + targeted clarifier will compete the germination causes; the gate must not short-circuit to CLARIFY.
- Bump `READINESS_GATE_VERSION` to `1.1.0`.

### File 5 — `decision/hypothesis-evaluator.ts`
- Add a **stage-bias adjustment** after the per-rule score is computed (~ around line 967 where `stageRelevance` is calculated):
  ```ts
  const STAGE_BIAS: Record<string, { promote: Set<string>; suppress: Set<string> }> = {
    GERMINATION: {
      promote: new Set(['SEED_ROT','POOR_SEED_VIABILITY','WATERLOGGING',
                        'DEEP_SOWING','SOIL_CRUST','TERMITE_DAMAGE',
                        'BIRD_DAMAGE','SEED_TREATMENT_FAILURE']),
      suppress: new Set(['LEAF_DISEASE','RUST','BLAST','SHEATH_BLIGHT',
                         'BORER','BOLLWORM','NUTRIENT_DEFICIENCY_LATE_STAGE']),
    },
    SEEDLING: { /* same — germination + seedling share entry causes */
      promote: new Set([...]), suppress: new Set([...]),
    },
    EMERGENCE: { /* alias */ },
    ESTABLISHMENT: { /* alias */ },
  };
  ```
- Apply `× 1.25` to scores whose `canonical_group ∈ promote`, `× 0.4` to those in `suppress`. Clamp to `[0,1]`.
- Log the bias decision per candidate: `[HypothesisEval] StageBias stage=GERMINATION cause=SEED_ROT ×1.25`.
- Do NOT change DB queries or canonical-group filters.

## 3. Trace verification (manual, no test infra needed)

Re-run the same Marathi message after deploy. Expected new edge log sequence:

```
[UnderstandingChecker v2.1.0] DIAGNOSTIC_ENTRY bypass — crop="RICE" entry_codes=[GERMINATION_FAILURE, OBS_RICE_NO_EMERGENCE, ...]
  → confidence=HIGH, clarification_required=false
[ReadinessGate v1.1.0] DIAGNOSTIC_ENTRY_OBSERVATION — forcing ready=true
[HypothesisEval] StageBias stage=GERMINATION promote=SEED_ROT,WATERLOGGING,SOIL_CRUST,DEEP_SOWING
[BRAIN_TRACE] DECISION: RESPOND (DIAGNOSTIC_ENTRY_OBSERVATION)
```

No `Decision: CLARIFY from UNDERSTANDING_GATE` for this query. Either a targeted clarification (e.g. "did you irrigate after sowing? was there a crust?") or a deterministic response is produced.

## 4. Out of scope (explicit — per user's instruction)

Not touched:
- `observation_master`, `intent_observation_mapping`, `hypothesis_master`, `hypothesis_rule_mapping`, `decision_rules`, `crop_stage_knowledge`
- Any ontology / graph / 2030 redesign work
- The 10k-line orchestrator (only consumes the corrected outputs of files 1–5)
- Frontend, DB schema, RLS, edge-function plumbing

## 5. Risk

- Removing `GERMINATION_FAILURE` from `TERMINAL_CODES_BLOCKED_FROM_INJECTION` means it can now be injected via cross-crop synonyms. That is the intended behavior; other guards (variety/stage filters in `hypothesis-evaluator`) still apply.
- Stage-bias multipliers are conservative (`×1.25` / `×0.4`) and clamped to `[0,1]`, preventing score blow-up.
- Diagnostic-entry bypass in the readiness gate cannot accidentally bypass other intents because it requires a code from a closed allowlist AND a non-UNKNOWN crop.

Approve and I will implement files 1–5 exactly as above in a single edit pass.
