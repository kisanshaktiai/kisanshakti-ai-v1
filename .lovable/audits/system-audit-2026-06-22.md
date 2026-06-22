# KisanShaktiAI — System Deep Audit Report
**Date:** 2026-06-22  
**Scope:** ai-agriculture-chat edge function — full decision brain  
**Trigger:** Recurring `URGENT_ACTION → DIAGNOSTIC_ESCALATION → no_action_needed` collapse, multi-crop

---

## 0. Executive Summary

The platform's decision brain has the right architecture but is being silently undermined at **three boundary layers**:

1. **Clarification round-trip** — canonical observation codes are *dropped* between the question emitter and the option-selected handler. Multilingual labels (Marathi/Hindi/Tamil) then fail to re-map. **(P0-1, fixed this turn.)**
2. **Authority/Gate suppression** — Unified Decision Gate and Safety Gate downgrade valid `URGENT_ACTION` / proactive decisions when authority returns `NONE/UNCONFIRMED` for symbolic-but-non-pest categories. **(P0-2 / P0-3, partially fixed in prior turns; verification pending.)**
3. **Stage authority drift** — GDD / phenology / calendar-lookup mutate stage even when `crop_stage_master` is SSOT. **(P1-1, partial fix already shipped; one path remains.)**

The DB layer is largely sound: 1,846 active rules across 12 crops (sugarcane 523, rice 137, brinjal 134, potato 132, tomato 130, onion 128, cotton 121, maize 120, soybean 120, chilli 120, wheat 117, all 64). Coverage gaps exist for early-stage crops (NURSERY/GERMINATION) — see Phase 4.

---

## 1. Architecture Map (Phase 1)

```
Farmer query
  → index.ts (request validation, session load, crop-isolation)
  → orchestrator.handleQuery
      → NLU pipeline (observation-extractor, semantic-extractor, nlu-agent)
      → Observation expansion (observation_aliases via DB)
      → Hypothesis evaluation (decision/hypothesis-evaluator)
      → Layered rule eval (agents/layered-rule-evaluator + bundled-rules)
      → Primary decision selection
      → Authority resolution (decision/authority-resolver)
      → Unified Decision Gate (decision/unified-decision-gate)
      → Safety Gates (decision/safety-gates, weather-safety-gate)
      → Response formatter (LLM narration; DB-driven content)
  → index.ts session-state persistence + reply
```

Confidence-delta sinks: `clarification-strategy` (-15 to -35%), `ConfidenceGate` (60% threshold), authority downgrade (variable), safety override (variable).

Suppression points: Unified Gate (5 gates), Safety Gate (CLARIFY override), Prescription Gate, ETL Gate, Confidence Gate.

---

## 2. Observation Survival Matrix (Phase 2 — from live trace `trace_mqo64i4p_r49yuv`)

| Stage              | Count | Notes |
|--------------------|-------|-------|
| raw_text           | 112   | OK    |
| nlu_extracted      | null  | Skipped (option-selected path bypasses NLU) |
| semantic_mapped    | null  | Skipped |
| alias_resolved     | null  | Skipped |
| **expanded**       | **1** | ← `AFFECTED_PART_WHOLE` (default) — the canonical code was lost |
| confirmed          | null  | (not emitted on this path) |
| rules_matched      | **0** | ← 201 rice rules evaluated, none matched a "whole plant" generic obs |
| primary_decision   | null  | ← downstream collapse begins here |
| response_obs       | null  | DIAGNOSTIC_ESCALATION fallback |

**Death point:** between `pending_clarification_options` persistence (`index.ts:2476`) and re-entry (`orchestrator.ts:2122`). Canonical `observation_code` was emitted on the option object but persisted as `o.label` only.

---

## 3. Clarification Flow Audit (Phase 3) — P0-1 FIXED

### Evidence (DB row IDs from session `bb9c239e-...`)
- Assistant msg `89d8051b…` content: `"पेरणीनंतर रोपे दिसत नाहीत… [obs_keys:OBS_RICE_NO_EMERGENCE]"` ✅ code present in chat content
- Farmer reply: `"पेरणीनंतर रोपे दिसत नाहीत…"` (stripped `[obs_keys:...]` by frontend display)
- `pendingClarificationOptions` in session: array of plain Marathi labels (no `[obs_keys:...]`) ❌

### Root cause
`index.ts:2476` constructed `clarificationOptions` as `options.map(o => o.label)`, discarding `o.observation_code`. The orchestrator's recovery path expected `pendingOpt.observation_code` (object form) or an `[obs_keys:...]` embed — neither was present.

### Fix shipped (this turn)
- **`supabase/functions/ai-agriculture-chat/index.ts:2476`** — Persist as `"<label> [obs_keys:<observation_code>]"`. Idempotent (no double-embed).
- **`supabase/functions/ai-agriculture-chat/agents/orchestrator.ts:2144`** — Defense-in-depth: also extract `[obs_keys:...]` from `matchResult.matched_option` before falling back to English-keyword `mapOptionToObservation`.

### Verification
After deploy, the orchestrator log should show `📋 Recovered ObservationKey from matched_option embed: "OBS_RICE_NO_EMERGENCE"` and the rule engine should match >0 rules for rice NURSERY germination-failure.

---

## 4. Rule Coverage (Phase 4 — read-only)

| Crop      | Active Rules | NURSERY/GERMINATION rules | Notes |
|-----------|-------------:|--------------------------:|-------|
| sugarcane | 523 | 12 | strong coverage |
| rice      | 137 | 9  | NURSERY thin — most rules target TILLERING+ |
| brinjal   | 134 | 6  | |
| potato    | 132 | 5  | |
| tomato    | 130 | 7  | |
| onion     | 128 | 4  | |
| cotton    | 121 | 6  | |
| maize     | 120 | 8  | |
| soybean   | 120 | 7  | |
| chilli    | 120 | 5  | |
| wheat     | 117 | 6  | |
| all       | 64  | 14 | cross-crop early-stage safety net |

**Coverage gaps (P2):** NURSERY/GERMINATION rules are < 10% of total per crop. Several crops (onion, chilli) under-represent emergence-failure rules. *Content gap, not code defect.* Recommend a focused rule-content sprint for early-stage diagnostics.

---

## 5. DB Integrity (Phase 5 — sampled)

- `decision_rules`: 1,852 total / 1,846 active (6 disabled — expected).
- `observation_master`: 1,997 codes (pagination verified in loader memory rule).
- `crop_stage_master`: column `growth_stage` (not `stage`) — code already uses correct name.
- No broken FKs observed in spot checks of rice/sugarcane/cotton (full audit deferred to a follow-up read-only SQL pass; will be exported under `.lovable/audits/db-integrity/`).

---

## 6. Stage Authority (Phase 6)

Prior turns shipped:
- `orchestrator.ts:1311` — persists `stage_source='crop_stage_master'` on landContext.
- `orchestrator.ts:5077` — GDD result becomes advisory when `stage_source==='crop_stage_master'`.

**Remaining stage-mutation sites (P1):**
- `decision/crop-calendar-lookup.ts` L83/153/211/235 — implicit TILLERING default when `stage` missing. Should require `stage` param.
- `agents/canonical-state-builder.ts` L530-537 — keyword-regex stage override; should skip when `stage_source==='crop_stage_master'`.
- `decision/authority-resolver.ts` — minor stage inference path; mark advisory only.

---

## 7. Authority / Unified Gate / Safety Gate (Phase 7)

Prior turns shipped:
- `decision/unified-decision-gate.ts` — `PROACTIVE-URGENT BYPASS` for proactive rules with treatments.
- `decision/authority-resolver.ts` — `PROACTIVE_*` categories return `CLIMATE/CONFIRMED, treatments_allowed=true`.

**Remaining suppression paths (P1):**
- Safety Gate (`decision/safety-gates.ts`) still calls `OVERRIDE=CLARIFY` even when a SAFE rule was bypassed-as-allow. Wire `bypass_reason='confirmed_safe_rule_exists'` into safety-gate return so it does not re-downgrade.
- `index.ts:1843-1868` still rewrites `orchestratorResponse.type='DIAGNOSTIC_ESCALATION'` on partial gate. Guard with `bypass_reason` check.
- `index.ts:2522-2546` coerces `session_decision_state='no_action_needed'` when `actions_returned.length===0` — should respect `primary_decision.action_type==='URGENT_ACTION'`.

---

## 8. Confidence Pipeline (Phase 8)

Observed in live trace: `50% → 15%` post-clarification (penalty of -35%). The blanket -35% is applied in `clarification-strategy` when no rule fires — but rule-firing failure was itself caused by P0-1 (lost observation code). With P0-1 fixed, this confidence drop should disappear naturally.

`ConfidenceGate` 60% threshold is correct per `calibrated-confidence-thresholds` memory; no change needed.

---

## 9. Fallback Inventory (Phase 9)

Entry points:
- `[STAGE_FALLBACK]` (orchestrator.ts:~2716) — when `option-selected` returns 0 rules. **Was firing because of P0-1; should largely cease post-fix.**
- `[PHOTO_FALLBACK]` — gated on photo absence + visual ambiguity. OK.
- Generic clarification fallback (`clarification-strategy` failure-class fallback). OK.

---

## 10. Production Simulation (Phase 10)

Deferred to a follow-up turn. **Recommendation:** after deploying the P0-1 fix, run the original failing scenario (rice NURSERY germination failure, Marathi) and confirm the survival matrix shows `rules_matched > 0` and a `URGENT_ACTION` / `RECOMMENDATION` primary decision. Then expand to the seven-scenario × multi-crop matrix from the plan.

---

## Bug Ledger

| ID    | Sev | Title | File:Line | Status |
|-------|-----|-------|-----------|--------|
| P0-1  | P0  | Clarification options drop canonical observation_code; multilingual labels fail re-mapping | `index.ts:2476` + `orchestrator.ts:2144` | **FIXED this turn** |
| P0-2  | P0  | Unified Gate suppresses URGENT_ACTION for proactive categories | `unified-decision-gate.ts:595` | Fixed prior turn |
| P0-3  | P0  | Authority Resolver returns NONE for PROACTIVE_* | `authority-resolver.ts` | Fixed prior turn |
| P1-1  | P1  | Stage drift: calendar-lookup implicit TILLERING default | `crop-calendar-lookup.ts:83,153,211,235` | OPEN |
| P1-2  | P1  | Stage drift: canonical-state-builder keyword regex | `canonical-state-builder.ts:530` | OPEN |
| P1-3  | P1  | Safety Gate ignores bypass_reason='confirmed_safe_rule_exists' | `safety-gates.ts` | OPEN |
| P1-4  | P1  | index.ts rewrites DIAGNOSTIC_ESCALATION ignoring bypass_reason | `index.ts:1843-1868` | OPEN |
| P1-5  | P1  | index.ts coerces no_action_needed when URGENT_ACTION present | `index.ts:2522-2546` | OPEN |
| P2-1  | P2  | NURSERY/GERMINATION rule coverage thin (<10%) | DB content | OPEN (content sprint) |
| P2-2  | P2  | mapOptionToObservation is English-only — language fragility | `clarification-generator.ts:691` | OPEN (made moot by P0-1 fix; deprecate) |

---

## 11. Forensic Re-audit Addendum — trace `trace_mqotnztd_y4si6j`

### New source-of-truth finding
The P0 code-preservation fix worked: the log now shows `Using EMBEDDED ObservationKey: "OBS_RICE_NO_EMERGENCE"` and final rule input `[obs_rice_no_emergence]`. The remaining suppression was **inside rule evaluation and bypass propagation**, not label mapping.

### Root cause chain
1. In the prescription-blocked branch, matching DB rules produced `matched_responses=2` but `rules_matched` and `rules_applied` stayed `0`, causing the decision gate to log `NO_RULES_MATCHED` even when DB rules had matched.
2. Primary arbitration then selected unrelated universal crop-rotation rule `CROT_AFTER_RICE_CHICKPEA_007` because priority sorting used higher numeric priority first; `decision_rules.priority=1` must outrank `9`.
3. `index.ts` only looked for uppercase `OBS_`, so lowercase canonical codes from the 2026-06-21 migration skipped the safe-rule bypass.
4. Safety bypass depended on a free-text `reason` prefix instead of structured gate fields, making confirmed observation bypass fragile.

### Fixes applied in this addendum
- `layered-rule-evaluator.ts` — increments `rules_matched/rules_applied` when prescription rules match while prescriptions are blocked, preserves `conditions_json`, and sorts lower `priority` as higher urgency.
- `observation-rule-lookup.ts` — extracts `OBS_` codes case-insensitively, preserving lower_snake_case canonical codes.
- `index.ts` — includes `confirmed_observations` / `confirmed_observation_codes` in gate symptom keys and uses structured `gate_action + response_mode` for safety bypass.

### DB verification
- `decision_rules` contains 2 active rice rules for `obs_rice_no_emergence`.
- At DAS 14, `RICE_GERMINATION_RESOW_DECISION_001` is valid (`das_range 8–14`, `urgent_action`, priority `1`, farmer safety `caution`).
- `crop_stage_master` has authoritative rice `nursery` window `DAS 0–25`; no code may overwrite it.

### Validation note
Edge-function deployment succeeded. The focused Deno test runner is currently blocked by pre-existing unrelated TypeScript errors in `clarification-strategy.ts` and `diagnostic-escalation-generator.ts`; those failures occur before the changed regression test executes.

---

## Next steps (proposed for follow-up turns)

1. Deploy + live-verify P0-1 against the failing Marathi rice scenario, capture survival matrix.
2. Apply P1-1 / P1-2 stage-drift hardening.
3. Apply P1-3 / P1-4 / P1-5 suppression hardening.
4. Run the full 7-scenario × multi-crop live simulation matrix.
5. Run full read-only DB integrity SQL pass and export CSVs under `.lovable/audits/db-integrity/`.
6. Open content ticket for NURSERY/GERMINATION rule expansion.
