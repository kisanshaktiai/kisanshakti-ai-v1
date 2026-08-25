# Rewire Variety Selection to master_products (Crop Schedule)

## Forensic audit findings (verified)

1. **The master_products-driven variety dropdown exists but is dead code.** `src/components/schedule/ScheduleGenerator.tsx` (lines 86-138, 472-494) queries `crops` → `master_products` (`crop_id`, `variety_code not null`) and renders a proper `<Select>` — but **no file imports `ScheduleGenerator`** (grep confirms zero importers). The `/app/schedule` page never renders it.

2. **The live component has no DB wiring.** `src/pages/Schedule.tsx` (line 484) renders `src/components/schedule/CropDateInput.tsx`, whose variety UI is:
   - a plain free-text `<Input>` (lines 278-287), and
   - a **hardcoded** auto-suggest: rice→"IR-64", wheat→"HD-2967", cotton→"BT Cotton" (lines 207-210) — a DB-SSOT violation.

3. **Database side is healthy — no fix needed there.** `master_products` has 210 rows, 127 with `variety_code` + `crop_id` (Rice 36, Groundnut 11, Sugarcane 9, Wheat 9, …). RLS policies allow public read of active products; a live PostgREST test with the anon key returned variety rows correctly. `resolve-inputs.ts` on the backend already resolves the submitted variety name against `master_products` + `variety_translations`, so only the frontend wiring is missing.

4. `CropDateInput` already receives `cropId` from `CentralizedCropSelector`, so the variety query can key directly on `crop_id` (no fragile label lookup like the dead component used).

## Changes

### 1. `src/components/schedule/CropDateInput.tsx` (the live component)
- Add state: `varieties: Array<{id, name}>`, `varietiesLoading`.
- Add a `useEffect` on `[cropId, land.id]`:
  - If no `cropId`, clear the list.
  - Query `master_products`: `select('id, name').eq('crop_id', cropId).not('variety_code','is', null).order('name').limit(200)`.
  - Pre-select the variety matching `lands.current_crop_variety_id`; else pre-select when exactly one variety exists.
- Replace the free-text variety `<Input>` with:
  - a `<Select>` dropdown when `varieties.length > 0` (values = variety name, matching the existing `onSubmit(cropVariety)` contract), and
  - the current free-text `<Input>` as fallback when a crop has no DB varieties.
- **Delete the hardcoded auto-suggest block** (lines 207-210: IR-64 / HD-2967 / BT Cotton) — gap-not-guess; suggestions must come from `master_products` only.

### 2. Dead code (housekeeping, optional but recommended)
- Delete `src/components/schedule/ScheduleGenerator.tsx` (orphaned, zero importers) to prevent the two wizards from drifting again. Verify no lazy/dynamic import references remain before deleting; keep `FarmingMode` export source (`FarmingTypeDialog.tsx`) untouched.

## Verification
- `tsgo` typecheck passes.
- Browser check on `/app/schedule`: pick a land → select "Rice" → variety dropdown lists DB varieties (e.g. Pusa Basmati 1121, MTU-1010) → generate schedule succeeds; pick a crop with no varieties → free-text input still appears.
- Confirm no console errors from the `master_products` query.
