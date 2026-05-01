
# Fix Location Pickers + Use Existing Crop Group Selector

Two confirmed bugs on `/app/lands/add`:

## Problem 1 — Pickers show nothing when tapped

`LocationPickerSection` only fetches the next admin level when the parent `*_id` exists:
```ts
useEffect(() => { if (value.state_id) loadDistricts(value.state_id); }, [value.state_id]);
```
And `openPicker('district')` early-returns when `!value.state_id`, so tapping the District chip silently does nothing. This happens whenever AI prefills the *name* but cannot resolve the canonical `*_id` (very common — Google returns "Pune Division" → no district_id).

Tapping **State** also feels broken because the section is mounted lazily inside the `ReviewCard`. On first open the `loadStates` effect has just kicked off, the sheet appears, the `items` array is still empty, and the empty state takes over before data arrives.

## Problem 2 — Crop picker is a flat list

The current `picker === 'crop'` sheet renders `crops` (only the AI-suggested 5–10) in a flat 2-column grid. The codebase already ships `CentralizedCropSelector` (`src/components/crops/CentralizedCropSelector.tsx`) which is the documented two-step **Crop Group → Crop** UX (loads `crop_groups` then `crops` from Supabase, with search, localized labels, popular badges).

## Fix

### A. `LocationPickerSection.tsx` — always allow opening the picker

1. **Remove the gating in `openPicker`.** Tapping any chip must always open the sheet. The hint becomes inline guidance inside the sheet, not a silent no-op.
2. **Auto-load on picker open**, not only when `*_id` is set:
   - `state` picker → `loadStates` already runs on mount; if `states` is empty when sheet opens, show a `Loader2` spinner instead of "No matches".
   - `district` picker → if `value.state_id` exists, ensure `loadDistricts(state_id)` is called when the sheet opens. If `value.state_id` is missing but `value.state` (name) is set, **resolve state_id from the loaded `states` list by name match (case-insensitive)** and trigger `loadDistricts` with that id. Same pattern for `taluka` and `village`.
   - If still no parent id resolvable, render a clear in-sheet message: *"Select State first to see districts"* with a button **"Pick State"** that switches the picker to `state`. No silent close.
3. **Preserve loading state in the empty UI** (already half-done — extend so the spinner shows during the very first load even when `loading.states` is briefly false).
4. Keep the 350ms tap-arm guard, sticky search, and free-text fallback for District/Taluka/Village.

### B. `SmartLandConfirmCard.tsx` — wire the existing CentralizedCropSelector

1. When `picker === 'crop'` (or `'previous_crop'`), render `<CentralizedCropSelector>` inside the existing `Sheet` instead of the flat grid. Use `variant="modal"` and `selectedCropId={form.current_crop_id}`.
2. `onSelect(cropId, englishLabel, localizedLabel) =>` set `current_crop` (english label, since downstream rules key off it), `current_crop_id`, and look up `duration_days` from the existing `crops` (AI inference) array — fallback `null` if not in the AI list (rules engine can fetch later).
3. Drop the `pickerItems` branch for `'crop'`/`'previous_crop'`; keep soil/water/irrigation flat grids unchanged.
4. Keep the AI-suggested crops visible as a **"Suggested for your field"** strip at the top of the crop sheet (chips from `crops` array) so farmers get one-tap selection without drilling into groups, but the full Group→Crop browser is right below.

### C. Minor — keep cascading reset semantics
When farmer changes State via the picker, existing logic clears district/taluka/village. Keep. Same for District → clears taluka/village, etc. Confirm `apply()` still does this after the new auto-load logic runs.

## Files to edit

- `src/components/land/LocationPickerSection.tsx` — remove gating, add name→id resolution, add "Pick State" CTA in empty state, clearer loading.
- `src/components/land/SmartLandConfirmCard.tsx` — replace crop sheet body with `CentralizedCropSelector` + suggested chips strip.

## Out of scope
- Editing the `CentralizedCropSelector` itself (it works as-is).
- Adding new entries to states/districts/talukas/villages tables (free-text fallback already exists for D/T/V).
- Changing the AI inference / classifier in `lands-api` (already shipped last round).
