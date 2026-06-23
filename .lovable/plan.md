## Goal

Restore the neuro-symbolic decision brain so that observation selections fire rules, and stop treatment text from reaching the farmer when `rules_fired = 0`. All behavior stays DB-driven — no new agronomy in code.

## Root causes (confirmed against current code)

- **P0-A — Observation→rule bridge is dead.** `agents/layered-rule-evaluator.ts:376` `matchesConditions()` only checks the typed `state.visual_symptom` enum and never inspects `conditions_json.observations`. Combined with `agents/canonical-state-builder.ts` `symptomMap` (lines ~600-655) which has no entry for `obs_*` keys, the selected `OBS_RICE_NO_EMERGENCE` becomes `visual_symptom = UNKNOWN` → 201 evaluated / 0 matched.
- **P0-B — Diagnosis-first uses hypothesis `cause` as the option label.** `agents/orchestrator.ts:4903` maps `opt.label` straight from `clarificationFormat.options`, where `formatForClarificationUI` derives label from the hypothesis `cause` (a decision narrative). The translation dictionary then expands it into the Marathi prescription.
- **P0-C — Unified-gate "young crop SAFE rule" bypass emits `action_text` with zero fired rules.** `decision/unified-decision-gate.ts:686-722` returns `PASS` + `OBSERVATION` mode whenever `input.confirmed_observation_has_safe_rule` is set (precomputed in `index.ts:1604`+ via `observation-rule-lookup.ts:183` `source: 'rule_action_text'`).
- **P1 — `agents/crop-stage-advisor.ts`** contains hardcoded RICE/COTTON/etc. stage advice used as `STAGE_FALLBACK`.

## Fix plan

### Fix 1 — observation-aware rule matching (P0-A, primary)

File: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

In `matchesConditions()` (line 370), after the existing `visual_symptom` check, add an observation gate using the same normalization already used at lines 1058-1090:

- Read declared observation set from `rule.when.observations`, `rule.conditions_json?.observations`, and `rule.raw?.conditions_json?.observations` (whichever the loader populates).
- Normalize via `String(x).toUpperCase().replace(/[\s-]/g,'_')`.
- Build a `stateSymbolSet` from `state.confirmed_observations`, `state.visual_symptoms`, plus `state.visual_symptom` if it is a real value (not `NONE`/`UNKNOWN`).
- If the rule declares observations AND none intersect the state set → return `false`.
- If the rule has NO `visual_symptom` declared but DOES declare observations and ≥1 intersects → allow match (the `visual_symptom=UNKNOWN` short-circuit at line 376 only triggers when the rule itself requires a `visual_symptom`, so it already won't block — but we add a guard: skip the `visual_symptom` short-circuit when `state.visual_symptom` is `UNKNOWN` and at least one declared observation matches).
- Crop-agnostic, no symptom dictionary, no rule-id allowlists.

This single change makes `RICE_GERMINATION_RESOW_DECISION_001` fire legitimately via the existing DB row — no schema, no agronomy in code.

### Fix 2 — clarification labels = observation labels only (P0-B)

File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~lines 4894-4920)

- Replace `label: opt.label` with a label derived from `opt.observation_key` via the existing `getObservationTranslation` / `observation_translations` overlay used by `diagnostic-differential-enricher.ts`.
- If no localized observation label exists, fall back to `observation_master.is_farmer_observable` text or the raw `observation_code` humanized — **never** `cause`, `action_text`, `recommendation`, or translated cause.
- Keep `description` empty (or set from observation description) so the translation dictionary cannot expand `cause` into the prescription.
- Add an assertion-style guard in `formatForClarificationUI` / `diagnosis-first-generator.ts`: strip any option whose label fails the existing `NON_OBSERVABLE_RE` / matches a treatment-token regex (`carbendazim|trichoderma|resow|पुनर्पेरणी|कार्बेन्डाझिम` etc., sourced from a small DB-backed deny list or the existing observable-chip contract — no new agronomy).

### Fix 3 — "no rule, no recommendation" invariant (P0-C)

Files:
- `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` (lines 686-722)
- `supabase/functions/ai-agriculture-chat/index.ts` (lines ~1604-1830, and the `rule_action_text` emission path)
- `supabase/functions/ai-agriculture-chat/decision/observation-rule-lookup.ts:183`

Changes:
- Remove the `confirmed_observation_has_safe_rule` bypass branch. Replace with: if `isYoungCrop && !hasConfirmedDiagnosis && !isProactiveUrgent` → return `CLARIFICATION_NEEDED` (current default path) regardless of whether an observation→rule lookup exists. The lookup is informational only.
- Add a final invariant in `index.ts` right before the response is shipped: `if (rules_fired === 0) { strip products, dosages, action_text, prescriptions; force ResponseMode.OBSERVATION or CLARIFICATION; }`. Log `SYMBOLIC_CONTRACT_VIOLATION` when stripping.
- In `observation-rule-lookup.ts`, keep the lookup but change `source` semantics: callers must use it ONLY to enrich observation chips (label + ruleId for telemetry), not to emit `action_text`. Remove direct `action_text` propagation into the response payload.

Because Fix 1 makes the rule fire correctly, Fix 3 becomes defense-in-depth: the same `action_text` will still reach the farmer — but via `rules_fired ≥ 1`, not via the bypass.

### Fix 4 — neutralize hardcoded stage advisor (P1)

File: `supabase/functions/ai-agriculture-chat/agents/crop-stage-advisor.ts`

- Replace the hardcoded `RICE_STAGE_ADVISOR` / `COTTON_*` tables with a thin loader that queries `crop_stage_master` / `crop_baseline_guidelines_v2`. If nothing returned → return `null` and let the orchestrator emit a neutral "no rule matched" clarification.
- Remove `STAGE_FALLBACK` agronomic strings; keep only the structural fallback shell.

### Fix 5 — decision logger constraint (P2)

`runtime/decision-logger.ts`: map outgoing `decision_type` to the canonical enum allowed by `ai_decision_log_decision_type_check` (read once via `supabase--read_query`). Default to `'OBSERVATION_CLARIFICATION'` (already in enum) when emitting clarifications.

## Validation

Add Deno tests under `_tests/`:

1. `obs_rule_match_test.ts` — build a `CanonicalState` with `confirmed_observations: ['OBS_RICE_NO_EMERGENCE']` and `visual_symptom = UNKNOWN`; load `RICE_GERMINATION_RESOW_DECISION_001` from a fixture; assert `matchesConditions` returns `true` and `evaluateRulesLayered` returns ≥1 matched.
2. `clarification_label_purity_test.ts` — feed a hypothesis with `cause = "...Resow...Carbendazim..."`; assert generated option labels contain none of the treatment tokens.
3. `no_rule_no_action_invariant_test.ts` — orchestrator run with `rules_fired = 0`; assert response has no `products`, `dosages`, `action_text`, `prescriptions`.
4. Live trace: rerun `पिक अद्याप उगवले नाही` → expect turn-1 chip label `भात अजून उगवले नाही`, turn-2 logs `Rules matched ≥ 1`, no `RULE_DATA_INTEGRITY_ERROR`, no `source=rule_action_text`.

## Data flow after fix

```text
Farmer query
  → intent (DB)
  → intent_observation_mapping
  → clarification chips (label = observation_translations only)
  → farmer selects OBS_*
  → CanonicalState.confirmed_observations = [OBS_*]
  → matchesConditions: visual_symptom OR conditions_json.observations  ← NEW
  → rules fire (≥1)
  → unified gate: PASS only because rules_fired ≥ 1
  → decision_rules.action_text → narration
  → farmer response
```

## Out of scope (explicit)

- No DB schema changes.
- No new agronomy constants, no per-crop branches, no rule allowlists.
- No changes to hypothesis tables, observation tables, or rule rows.
- LLM layer unchanged (still translation/formatting only).

## Deliverables

1. Edits to 5 files listed above + neutralized `crop-stage-advisor.ts`.
2. 3 new Deno tests + 1 manual trace validation.
3. Short `docs/ws13/wave-q-symbolic-bridge-restoration.md` with before/after log snippets and the `rules_fired > 0` invariant.
4. Memory rule: `mem://logic/observation-rule-match-and-no-action-without-rule` to lock the invariant.
