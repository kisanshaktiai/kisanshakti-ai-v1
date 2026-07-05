# Step 7 — Legacy Phenology/Safety Engine Deletion

## Files to delete
1. `supabase/functions/ai-agriculture-chat/agents/gdd-phenology-engine.ts`
2. `supabase/functions/ai-agriculture-chat/agents/photoperiod-calculator.ts`
3. `supabase/functions/ai-agriculture-chat/agents/phi-enforcement-guardian.ts`
4. `supabase/functions/ai-agriculture-chat/agents/pollinator-protection-rules.ts`

Rationale: all four are hardcoded TS constants (`CROP_GDD_CONFIG`, `CROP_PHOTOPERIOD_PROFILES`, `PHI_DATABASE`, `POLLINATOR_TOXICITY_DB`) that duplicate DB owners (`crop_stage_master`, `variety_phenology_profile`, `chemical_regulatory_status`, `master_products`). Successors already in tree: `runtime/phenology-reconciler.ts` and `agents/safety-guardian.ts`.

## Orchestrator rewire (`agents/orchestrator.ts`)

### Imports (lines 327–388)
Drop the four import blocks and the `blockStageWriteIfLocked` GDD write-guard tag usage.

### Phenology block (lines ~5498–5545, 6196–6199, 7009)
- Remove `calculatePhenologicalStage(...)` call, `dayLengthResult`, `checkPhotoperiodTrigger(...)`.
- `phenologyResult` variable removed. `landContext.growth_stage` is already set upstream by `resolve_crop_phenology` + the new `reconcilePhenology()` — keep those, drop the GDD override branch.
- `landContext.gdd_phenology = null` (retain field to preserve response contract; downstream narration tolerates null — verified in Step 6 typecheck).
- `gddResultForCanonical` → `null`.

### PHI block (lines ~7880–7900, 8324–8355, 10810–10836)
- Remove local `enforcePHI(...)` calls and `applyPHIBlocking(...)` private method.
- PHI is already evaluated inside `SafetyGuardian.verify()` via `PHI_DATABASE` in `safety-guardian-types.ts` + `chemical_regulatory_status`. Its verdict flows through `SafetyVerificationResult.blocked_decision` which the orchestrator already respects.

### Pollinator block (lines ~7901–7930, 8358–8395, 10839–10870)
- Remove `isFloweringStage(...)` / `enforcePollinatorProtection(...)` calls and `applyPollinatorBlocking(...)` method.
- Pollinator risk is covered by `SafetyGuardian` Gate 4 (`EnvironmentalCheck.POLLINATOR_RISK`).

### Types
- Remove `phiEnforcement` / `pollinatorEnforcement` locals and any downstream payload fields; `SafetyVerificationResult` replaces both.

## Verification
1. `bunx tsgo --noEmit` clean.
2. `rg` confirms zero remaining references to the four deleted modules.
3. Confirm `SafetyGuardian` still gates chemical outputs by reading its `verify()` call site.

## Non-goals (deferred to later steps)
- Removing `PHI_DATABASE` const from `safety-guardian-types.ts` (Step 8 — DB-backed regulatory reads).
- Deleting `applyPHIBlocking` / `applyPollinatorBlocking` helper types if referenced by unrelated modules (grep shows none, but re-check during edit).
- Any DB migrations.
