## Verified root cause (NOT a single bug — 4 compounding suppressors)

Live trace `trace_mqkt905p` for `"भात अजून उगवले नाही"` ("rice hasn't germinated") on Rice DAS=11:

```
User symptom query
   │
   ▼  IntentClassifier v4.0 → GENERAL_CROP_INFO @ 90%   ← MISCLASSIFICATION (should be CROP_PROBLEM_REPORT)
   ▼  DIRECT_MODE gate: advisoryIntent=true             ← SUPPRESSOR 1 (skips clarification)
   ▼  UnderstandingChecker: score=53% → REQUIRED=true   ← flag raised but never honored
   ▼  CropDamageDetector v4 → MINOR → DiagnosisOnlyMode ← SUPPRESSOR 2 (PERMANENTLY skips clarification, even at 53% confidence)
   ▼  EnforcedAuthority(CROP) → NLU gating DISABLED     ← SUPPRESSOR 3
   ▼  PrescriptionGate: LOW conf OVERRIDDEN             ← SUPPRESSOR 4
   ▼  Rule engine: 5 weak Rice matches, none for germination → ConflictResolver picks irrelevant rule
   ▼  index.ts catch-all → state = "no_action_needed"   → template fallback, 276 chars, 0 actions
```

Plus a silent crash: `CropTimeline SSOT: cache.has is not a function` (plain `{}` used as `Map`) — masks every stale-cache read.

## Verified DB case audit (vs. earlier proposed Scope A)

| Table.column                                            | UPPER / total | Action |
|---------------------------------------------------------|--------------:|--------|
| `cultural_strategies.crop_code`                         | **20 / 20**   | lowercase |
| `emergency_observation_codes.observation_code`          | **12 / 38**   | lowercase |
| `observation_differential_questions.observation_code`   | **3 / 3**     | lowercase |
| `direct_advisory_routes.route_code`                     | 4 / 4         | leave (no consumer mismatch found) |
| `observation_master.observation_code`                   | 0 / 2540      | clean |
| `decision_rules.rule_id`                                | 1852 / 1852 UPPER | **DO NOT TOUCH** (shadow `rule_id_lc` + dual-read shim already in place; flipping canonical is Phase 9 / Stage 4 — needs coordinated freeze) |
| `hypothesis_master.hypothesis_id`                       | 345 / 346 UPPER | same — leave to Phase 9 |

The CROT_* "missing action_type" claim from one subagent is **wrong** — DB shows 24/24 populated. Removed from fix list.

---

## Fix set (one migration + 6 targeted code edits)

### 1. DB migration — Scope A lowercase (39 rows, zero FK risk)
Single migration:
- `UPDATE public.cultural_strategies SET crop_code = lower(crop_code)`
- `UPDATE public.emergency_observation_codes SET observation_code = lower(observation_code)`
- `UPDATE public.observation_differential_questions SET observation_code = lower(observation_code)`
- Add CHECK constraints so future inserts cannot regress to UPPER on these 3 columns.

### 2. `decision/diagnosis-only-mode.ts` — confidence-gate the permanent lock
Only activate `DiagnosisOnlyMode` when damage confidence ≥ `HIGH` (≥ 0.70). At `VERY_LOW`/`LOW`, allow exactly one clarification round (governed by `UnderstandingChecker` output). This is Suppressor 2 — the single biggest cause of generic responses on ambiguous queries.

### 3. `agents/orchestrator.ts` — DIRECT_MODE must not bypass when symptoms present
In the `advisoryIntent` short-circuit (~L3030 area), add: `if (inductionResult.symptoms.length > 0 || hasMeaningfulCodes(mappedCodes)) → do NOT take DIRECT_MODE`. Symptom-bearing intent always wins over generic advisory route. Also add `'EMERGENCE_FAILURE'` to `DIAGNOSTIC_INTENTS` (~L3419).

### 4. `agents/orchestrator.ts` — pendingClarification escape hatch
When `shouldRunSymbolicBrain=true` AND zero rules fire AND understanding completeness < 60%, fall back to a clarification question instead of `DECISION_PROVIDED` with empty actions. Fixes the "fires a wrong proactive rule because nothing else matched" path.

### 5. `index.ts` catch-all guard (~L2507)
Replace the bare `else { computedDecisionState = 'no_action_needed' }` with: if `type === 'DECISION_PROVIDED'` AND `actions_returned.length === 0` AND intent is symptom-based → emit `clarification_needed`, not `no_action_needed`.

### 6. `agents/intent-classifier.ts` — germination vocabulary
Add explicit pre-routing rule: messages containing `उगवले नाही`, `उगवण होत नाही`, `germination failure`, `not germinated`, `अंकुर नाही`, `अंकुरण` → force intent `CROP_PROBLEM_REPORT` (or `EMERGENCE_FAILURE`) with high confidence, bypassing the LLM's tendency to return `GENERAL_CROP_INFO`.

### 7. CropTimeline SSOT — `cache.has` crash
Fix the cache holder: change the plain object literal to `new Map<string, …>()` (or use `Object.prototype.hasOwnProperty.call`). Currently silently swallowed → falls back to direct DB query every turn (perf + correctness risk).

### 8. `agents/response-validation-gate.ts` — Check 5 stage drift
Read `growth_stage` from the same locked canonical context the rest of the turn used, not an independent copy. Trace showed pipeline locked `SEEDLING` but validator read `ACTIVE_TILLERING`.

---

## Verification after apply
- New Deno test `_tests/generic_response_regression_test.ts`: run the exact reproducer payload (`भात अजून उगवले नाही`, Rice DAS=11) and assert the response is **either** a clarification **or** carries ≥1 rule-backed action — never `no_action_needed` with 0 actions.
- Re-run existing `rule_id_lc_contract_test.ts` to confirm no regression in dual-read.
- DB-side smoke: `SELECT count(*) FILTER (WHERE crop_code ~ '[A-Z]') FROM cultural_strategies` etc. must all be 0.

## Explicitly out of scope (and why)
- Mass-lowercase `decision_rules.rule_id` / `hypothesis_master.hypothesis_id` — requires Phase-9 shadow-column flip in a single transaction with code dual-read freeze. Doing it ad-hoc breaks 1852 + 346 lookups. Tests already in place to enforce the contract until then.
- `intent_observation_mapping` / `observation_intent_master` mass renames — internally consistent; renaming requires coordinated code change across 14k rows.

Approve and I'll execute the migration + 7 code edits + regression test in one pass.
