
## Root cause (verified against live DB)

For land `Shinghan Mal` (`30197c15-…`), the chat turn has:
- `lands.planting_date = NULL`
- `lands.last_sowing_date = NULL`
- `lands.current_crop = 'Rice'`, `crop_stage = 'Germination'`
- `crop_schedules` (active) has `sowing_date = 2026-06-08` — but **the RPC never reads this table**.

`public.resolve_crop_phenology()` line 40 computes:
```
v_sow_date := coalesce(v_land.planting_date, v_land.last_sowing_date);
```
then short-circuits at line 44 (`IF v_sow_date IS NULL THEN RETURN;`).

Empty rowset returned → `phenology = null` in `orchestrator.ts:8517` → `buildBiologicalState()` returns `null` → `[BIO_STATE_LOCKED]` and `[PHENOLOGY_SSOT]` log lines are never emitted → `context.source` at `orchestrator.ts:8609` falls through to `'CROP_SCHEDULES'` or `'LAND_DATA'` → `GRAPH_FREEZE` captures the wrong authority.

This is a data-plumbing bug, **not** a stage-calculation bug. Every other land with a `crop_schedules` row but no `lands.planting_date` has the same silent failure.

## Scope (surgical, per user constraints)

- Do NOT touch decision rules, observations, IOM, crop_stage_master, or client stage writers.
- Only fix the one condition that prevents BiologicalState from being created, and make every failure loud + attributable.

## Changes

### 1. Migration — extend `resolve_crop_phenology` sowing-date source chain

Add `crop_schedules.sowing_date` (active row, latest) as a third fallback for `v_sow_date`, and record which source was used in `evidence_sources`. Signature unchanged; body edit only.

```sql
-- inside resolve_crop_phenology, replace the v_sow_date computation
SELECT cs.sowing_date
  INTO v_schedule_sow_date
  FROM public.crop_schedules cs
 WHERE cs.land_id = p_land_id
   AND cs.is_active = true
 ORDER BY cs.sowing_date DESC
 LIMIT 1;

v_sow_date := coalesce(
  v_land.planting_date,
  v_land.last_sowing_date,
  v_schedule_sow_date
);

IF v_sow_date IS NOT NULL THEN
  v_evidence := v_evidence || ARRAY['sowing_source:' ||
    CASE
      WHEN v_land.planting_date     IS NOT NULL THEN 'lands.planting_date'
      WHEN v_land.last_sowing_date  IS NOT NULL THEN 'lands.last_sowing_date'
      ELSE 'crop_schedules.sowing_date'
    END];
END IF;

IF v_crop_code = '' OR v_sow_date IS NULL THEN RETURN; END IF;
```

No new tables, no data mutation, no schema change beyond function body. Table alias `cs` avoids the OUT-parameter collision pattern that bit us before.

### 2. `orchestrator.ts` — mandatory traces around BiologicalState build (fetchComprehensiveLandContext, ~lines 8500–8545)

Add three new log lines with the exact prefixes the user asked for. Every branch must emit exactly one `[BIO_STATE_CREATE_RESULT]`.

```ts
// BEFORE RPC
console.log(
  `🌱 [BIO_STATE_START] land_id=${landId} ` +
    `crop=${land.current_crop ?? 'null'} ` +
    `das=${daysSinceSowing ?? 'null'} ` +
    `sowing_date=${cropSchedule?.sowing_date ?? land.last_sowing_date ?? land.planting_date ?? 'null'}`
);

// AFTER RPC (both success and error paths)
if (phenErr) {
  console.error(
    `❌ [BIO_STATE_RPC_RESULT] success=false land=${landId} ` +
      `returned_stage=null error_code=${(phenErr as any).code ?? 'n/a'} ` +
      `error_msg=${phenErr.message}`
  );
} else if (phenology) {
  console.log(
    `✅ [BIO_STATE_RPC_RESULT] success=true land=${landId} ` +
      `returned_stage=${phenology.growth_stage} das=${phenology.current_das} ` +
      `source=${phenology.source} v${phenology.resolver_version}`
  );
} else {
  console.warn(
    `⚠️ [BIO_STATE_RPC_RESULT] success=false land=${landId} ` +
      `returned_stage=null error=NO_ROW_RETURNED ` +
      `reason=resolver_short_circuited(likely_sowing_or_crop_missing)`
  );
}

// BEFORE returning landContext
if (biological_state) {
  console.log(
    `🧬 [BIO_STATE_CREATE_RESULT] created=true land=${landId} ` +
      `stage=${biological_state.growth_stage} das=${biological_state.das}`
  );
} else {
  const failureReason =
    phenErr ? `rpc_error:${(phenErr as any).code ?? phenErr.message}`
    : !phenology ? 'rpc_returned_no_row'
    : 'buildBiologicalState_null';
  console.error(
    `🧬 [BIO_STATE_CREATE_RESULT] created=false land=${landId} ` +
      `failure_reason=${failureReason} ` +
      `sow_present=${!!(cropSchedule?.sowing_date || land.last_sowing_date || land.planting_date)} ` +
      `crop_present=${!!land.current_crop}`
  );
}
```

`phenErr` must be lifted out of the try-block scope so the trailing log can read it (small refactor of the existing try/catch).

### 3. `orchestrator.ts` — remove the silent LAND_DATA fallback in `context.source`

Current line 8609:
```ts
source: biological_state ? 'BIOLOGICAL_STATE' : (cropSchedule ? 'CROP_SCHEDULES' : 'LAND_DATA'),
```

Change to make failure explicit (no silent demotion). When biological_state is missing, tag the source with the reason so `GRAPH_FREEZE` / `[STAGE_AUTHORITY_VIOLATION]` can attribute it:

```ts
source: biological_state
  ? 'BIOLOGICAL_STATE'
  : 'BIOLOGICAL_STATE_UNAVAILABLE',   // never silently 'LAND_DATA'
source_fallback_reason: biological_state
  ? null
  : (phenErr ? 'rpc_error' : 'no_row'),
source_fallback_used: biological_state ? null : (cropSchedule ? 'crop_schedules' : 'lands'),
```

`canonical-context-contract.ts` already accepts `'BIOLOGICAL_STATE'` in the source union; add `'BIOLOGICAL_STATE_UNAVAILABLE'` to the same union so the contract builder preserves the attribution instead of coercing to `'LAND_DATA'`. `[STAGE_AUTHORITY_VIOLATION]` (already present at line ~1391) will then correctly fire whenever the biological SSOT was unavailable, with a machine-readable reason attached.

No behavior downstream changes — heuristics still fall back functionally — but the fallback is no longer silent and no longer masquerades as `LAND_DATA`.

### 4. Verification

After deploy, one land-specific chat turn against `Shinghan Mal` must emit, in order:
```
🌱 [BIO_STATE_START] land_id=30197c15… crop=Rice das=null sowing_date=2026-06-08
✅ [BIO_STATE_RPC_RESULT] success=true returned_stage=<resolved> …
✅ [PHENOLOGY_SSOT] stage=<resolved> …
🔒 [BIO_STATE_LOCKED] land_id=30197c15… crop=RICE stage=<resolved> …
🧬 [BIO_STATE_CREATE_RESULT] created=true …
[GRAPH_FREEZE] … source=BIOLOGICAL_STATE
[PIPELINE_RULE_STAGE] … stage=<same>
Rule Engine Input … stage=<same>
```

For any land where both `lands.planting_date`, `lands.last_sowing_date`, AND `crop_schedules.sowing_date` are all null, we must instead see:
```
🧬 [BIO_STATE_CREATE_RESULT] created=false failure_reason=rpc_returned_no_row sow_present=false crop_present=true
⚠️ [STAGE_AUTHORITY_VIOLATION] canonical.source=BIOLOGICAL_STATE_UNAVAILABLE …
```
— i.e. the failure is loud and attributable, never silent.

## Files touched

- `supabase/migrations/<new>.sql` — extend `resolve_crop_phenology` sowing-date source chain (function body only).
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — three new trace lines (BIO_STATE_START / BIO_STATE_RPC_RESULT / BIO_STATE_CREATE_RESULT), lift `phenErr` scope, replace silent `'LAND_DATA'` fallback in `context.source` with explicit `'BIOLOGICAL_STATE_UNAVAILABLE'` + reason fields.
- `supabase/functions/ai-agriculture-chat/decision/canonical-context-contract.ts` — add `'BIOLOGICAL_STATE_UNAVAILABLE'` to the `source` union type and pass-through in the contract builder.

## Explicitly out of scope

- No changes to decision rules, observations, IOM, crop_stage_master, variety_phenology_profile, stage_transition_conditions.
- No changes to client-side stage writers (`SmartLandConfirmCard`, `src/lib/cropStage.ts`).
- No changes to GDD engine, morphology reconciler, or rule engine normalisation.
- No new tables or columns.
