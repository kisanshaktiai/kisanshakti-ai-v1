## Root Cause — verified against latest edge logs

The query "या शेतातील पिक अजून उगवले नाही" (rice not germinated) trace in the latest deploy:

```
Intent: GENERAL_CROP_INFO
PHASE 3 SKIPPED — symbolic/advisory path active (rules=5, symptom_free=true, bypass=true)
Layer 3 → 0/31 rules fired
SymbolicBridge matchRulesByKeywords → 26 rules matched
selectBestAction → "No rules with action_type - using fallback"
convertToPrimaryDecision → Rule CROT_AFTER_SUGARCANE_SOYBEAN_003 missing action_type — deriving from product_type → URGENT_ACTION
[INVARIANT] PRIMARY_DECISION valid → returns immediately
Validation: FAILED  → UI sees final fallback msg
[ObservationContract] BLOCKED 1 non-canonical entries at audit boundary: भात अजून उगवले नाही
```

So **the recent translation fix is not what removed the chips** — the chips never had a chance to render because:

1. Intent classifier maps the germination question to `GENERAL_CROP_INFO`.
2. Intent contract for `GENERAL_CROP_INFO` is `clarification_mode=DIRECT, max_clarification_rounds=0` → `directHardBypass=true` (orchestrator L3170-3182).
3. `DIRECT_MODE_VETO` (L4061) refuses to lift `directHardBypass` even when informative symptom observations are present.
4. The chip-producing path `DIAGNOSIS-FIRST MODE` (L4336) is explicitly gated `&& !directHardBypass`, so it is skipped.
5. The IOM hard-seed (L4072) drops 5 canonical obs codes into the rule input, but Layer 3 matches zero rules.
6. `SymbolicBridge.matchRulesByKeywords` then matches 26 generic rules (flood prep, crop rotation), conflict-resolver finds **no rule has an `action_type`**, falls back to the first rule, `convertToPrimaryDecision` synthesises `URGENT_ACTION` from `product_type`.
7. The HARD INVARIANT at L7330-7341 sees `primaryRuleId && primaryActionType` and returns immediately — bypassing the deferred-clarification gate at L6870 that would have shown chips.
8. Downstream validation rejects the synthesized decision and the UI shows the final fallback message.

Secondary leak: a raw Marathi sentence "भात अजून उगवले नाही" is being inserted into the observations array (audit logger blocks it). This means some upstream extractor is treating user text as an observation key — needs fixing so the audit isn't reporting drift on every turn.

## Fix Plan — minimal, behind named guards, no UI work

### 1. Stop synthesising PRIMARY_DECISION from rules with no real `action_type` (orchestrator.ts L7330-7341, conflict-resolver.ts `selectBestAction` / `convertToPrimaryDecision`)

- In `conflict-resolver.ts`, when `selectBestAction` falls into the "no rules with action_type" branch, return `null` (or `{ status: 'NO_ACTIONABLE_RULE' }`) instead of forcing the first symbolic-bridge rule through `convertToPrimaryDecision`. Remove the `derive action_type from product_type` heuristic when the original rule had none — that is the source of the bogus `URGENT_ACTION`.
- In the orchestrator HARD INVARIANT (L7334), additionally require:
  - `decisionOutput.primary_decision.weighted_confidence >= 0.5`, AND
  - the winner's rule had at least one matched observation (`primary_decision.application_details?.matched_observations?.length > 0` or `layeredRuleResult.rules_matched > 0`).
- If any of those fail, do **not** return; fall through to the existing deferred-clarification path (L6870 / L4336).

### 2. Allow chips to surface for symptom-laden `GENERAL_CROP_INFO` queries (orchestrator.ts L4060-4106, L4336)

Two scoped changes, both gated to "DIRECT-hard intent + informative observations present + no real rule fired":

- **DIRECT_HARD_BYPASS soft-VETO**: in the block at L4059-4067, when `directHardBypass=true` AND `informativeNow.length > 0` AND the bridged IOM seed produced ≥ 2 canonical observations, set a new flag `directHardClarify=true` (do NOT clear `directHardBypass` — keep advisory routing intact for genuine "tell me about my crop" queries).
- Change the `else if (diagnosisWithOptionalClarification && !directHardBypass)` gate at L4336 to also fire when `directHardClarify=true`. This lets the DIAGNOSIS-FIRST hypothesis-driven chip path (which already calls `loadIOMAllowed`, `evaluateCandidateHypotheses`, `formatForClarificationUI` and routes through `translateClarificationOptions` → DB labels) render the chips for ungerminated/poor-emergence queries.

### 3. Defensive fallback at the deferred-clarification gate (orchestrator.ts L6870)

When `pendingClarificationResponse` is null but `totalRulesMatched === 0` AND IOM seed produced ≥ 2 observations, build a minimal `pendingClarificationResponse` on the fly from the IOM allowed list (already loaded above as `iomSeed.allowedRanked`). Run those codes through `translateClarificationOptions` so labels stay DB-sourced (`display_text` per the recent BUG A/B fix). This is the safety net that guarantees a chip is shown instead of the URGENT_ACTION fallback even if a future routing change re-introduces a similar bypass.

### 4. Stop the Marathi-text observation leak (audit log noise)

`[ObservationContract] BLOCKED ... भात अजून उगवले नाही` shows raw farmer text is being added to the observations array somewhere. Grep `allObservationsForPreAuth.add(`, `confirmed_observations.push(`, `state.visual_symptoms.push(`, `authoredObservations.add(` for any path that pushes `farmerMessage` / `nluOutput.raw_text` / `intent.matched_text`. Reject anything that isn't `/^[A-Z][A-Z0-9_]+$/` at the source; do not just rely on the audit-time filter.

### 5. `[SELECTION_TRACE]` for the new path

Add one log line at the new `directHardClarify` branch so the next forensic trace shows: `[DIRECT_HARD_CLARIFY] intent=<x> informative_obs=<n> iom_seed=<n> chips_emitted=<n>`.

## Verification

- Replay "या शेतातील पिक अजून उगवले नाही" in mr.
- Edge logs should show `[DIRECT_HARD_CLARIFY]` then `[DIAGNOSIS-FIRST]` then `Returning clarification with N options`.
- UI receives a `CLARIFICATION_QUESTION` with chips whose labels come from `observation_translations.display_text` in Marathi (e.g. `भात उगवले नाही`, `अंकुरण कमी`, `रोपवाटिकेत मर`), not raw codes or fabricated URGENT_ACTION text.
- `[ObservationContract] BLOCKED ...` no longer fires on this turn.
- The "PRIMARY_DECISION RECOVERY: Using layered_rule_result.primary_decision" / `convertToPrimaryDecision missing action_type — deriving from product_type` log lines no longer appear for this query.
- A normal advisory query like "मेरे खेत की मिट्टी कैसी है" still goes through DIRECT-hard advisory (no chips, no regression).

### Files touched

- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (sections 1–3, 5)
- `supabase/functions/ai-agriculture-chat/agents/conflict-resolver.ts` (section 1)
- One extractor file located by the grep in section 4 (likely `runtime/observation-ledger.ts` or `agents/intent-resolver.ts`)

No DB migration. No UI changes. No edits to the recent BUG A/B label-loader fix.
