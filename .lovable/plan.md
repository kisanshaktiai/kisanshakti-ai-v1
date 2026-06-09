
## Goal
Make every screen that reads `soil_types`, `water_sources`, `irrigation_types`, `crop_groups`, `crops`, `districts` (and `states/talukas/villages` once they get translation columns) render labels in the farmer's currently selected language, with a clean English fallback. Today most components only read `label` / `name` and ignore the new `label_hi`, `label_mr`, `label_pa`, `label_ta`, `label_te`, `label_bn`, `label_gu`, `label_kn`, `label_ml`, `label_or`, `label_as`, `label_ur`, `label_sa` / `group_name_*` / `name_*` columns.

## Audit findings (DB)
Localized columns present today:
- `soil_types.label_*` — 12 languages ✅
- `water_sources.label_*` — 12 languages ✅
- `crop_groups.group_name_*` — 12 languages ✅
- `crops.label_*` — 12 languages ✅
- `districts.name_*` — 12 languages ✅
- `irrigation_types` — only `label`, `description` (no `label_*` yet) ⚠️
- `states`, `talukas`, `villages` — only `name` (no `name_*` yet) ⚠️

I will treat the four ⚠️ tables as "fallback to English `label`/`name` until translation columns exist" — code will be written to pick up `*_<lang>` columns automatically the moment they're added, with no further app change needed.

## Audit findings (code call sites)
Reference-table reads that currently ignore localized columns:

Reference forms (soil/water/irrigation):
- `src/hooks/useLandFormData.ts` — selects `*`, returns raw `label`. Consumed by AddLand / EditLand / ModernLandWizard / SmartLandConfirmCard.

Crops & crop groups:
- `src/components/crops/SimpleCropSelector.tsx`
- `src/components/crops/CropSelector.tsx`
- `src/components/crops/EnhancedCropSelector.tsx`
- `src/components/crops/CentralizedCropSelector.tsx`
- `src/components/crops/CropSelectionDialog.tsx`
- `src/components/crops/CropSelectionButton.tsx`
- `src/components/crops/CropInput.tsx`
- `src/components/crops/SmartCropInput.tsx`
- `src/components/land/CropSelectionCard.tsx`
- `src/components/land/CropManagementDialog.tsx`
- `src/hooks/useCommunityGroups.ts`
- `src/services/syncService.ts` (offline cache — must store all `label_*` so offline UI is also localized)

Districts / states (locations):
- `src/hooks/useUnifiedLocation.ts`
- `src/hooks/useLocationPreloader.ts`
- `src/components/land/ModernLandWizard.tsx`
- `src/components/land/EditLandWizard.tsx`

Edge functions (so AI-generated content also speaks the farmer's language):
- `supabase/functions/ai-smart-schedule/index.ts` (only reads `label, label_hi, label_mr`)
- `supabase/functions/ai-smart-schedule/variety-aware-planner.ts`
- `supabase/functions/lands-api/index.ts`

## Implementation plan

### 1. New shared helper — `src/lib/i18nRef.ts`
A tiny, framework-agnostic resolver:
```ts
export const SUPPORTED_REF_LANGS = ['hi','mr','pa','ta','te','bn','gu','kn','ml','or','as','ur','sa'] as const;
export function pickLocalized<T extends Record<string, any>>(
  row: T, baseField: 'label'|'name'|'group_name'|'description', lang: string
): string {
  const code = (lang || 'en').split('-')[0];
  return row?.[`${baseField}_${code}`] || row?.[baseField] || '';
}
```
Plus a small hook `useLocalizedRef()` that reads `i18n.language` and returns a memoized `(row, base) => string`.

### 2. New shared hook — `src/hooks/useReferenceData.ts`
One React-Query hook per table (`useSoilTypes`, `useWaterSources`, `useIrrigationTypes`, `useCropGroups`, `useCrops`, `useDistricts(stateId)`). Each:
- Selects every column including all `*_<lang>` siblings.
- Re-keys the query by language so labels react instantly to language switches without a refetch (using `select` to map).
- Returns rows already augmented with a resolved `displayLabel`.

This replaces the per-component ad-hoc selects.

### 3. Refactor `useLandFormData.ts`
Switch to the new hook stack, return `{ soilTypes, waterSources, irrigationTypes }` where each item has `displayLabel` (localized) and `displayDescription` (when present). All AddLand / EditLand / wizard screens automatically pick up the localized text.

### 4. Refactor crop selectors
Replace inline selects in all 12 crop selector files to use `useCropGroups()` + `useCrops()` from the new hook. Render `displayLabel` everywhere a hardcoded `crop.label` / `group.group_name` is shown today. Search/filter logic updated to match against all language variants so a farmer typing "गेहूं" or "wheat" both work.

### 5. Refactor location reads
`useUnifiedLocation`, `useLocationPreloader`, `ModernLandWizard`, `EditLandWizard`: select `name, name_hi, name_mr, …, name_sa` from `districts`; resolve via `pickLocalized`. For `states/talukas/villages` we keep `name` (DB has no translations yet) — but the helper is already there for the day those columns land.

### 6. Sync / offline cache
`src/services/syncService.ts` extended to cache all `label_*` columns for crops so the offline UI is also localized.

### 7. Edge functions
- `ai-smart-schedule/index.ts`: replace the two-language `label, label_hi, label_mr` select with the full set and resolve via a small shared helper at the top of the file (mirrors the existing `getLanguageName` util).
- `ai-smart-schedule/variety-aware-planner.ts` and `lands-api/index.ts`: same select-and-resolve treatment so prompts and stored land snapshots carry the farmer-language crop / district name.

### 8. Defensive fallbacks
Every resolver falls back: `row[base_<lang>]` → `row[base]` → `''`. No screen will ever go blank if a translation row is missing.

### 9. Verification
- AddLand, EditLand, Profile, AI Crop Schedule, Community group picker, Crop selection dialogs — toggle language between en / hi / mr / pa / ta and confirm labels switch instantly.
- React-Query devtools: no duplicate fetches per language switch (cached + remapped).
- Build passes; no TS errors against regenerated `types.ts`.

## Out of scope (flagged for follow-up migration)
- Adding `label_*` columns to `irrigation_types`.
- Adding `name_*` columns to `states`, `talukas`, `villages`.
Tell me to include these as a migration and I'll add them in the same pass.

## Files touched (summary)
- new: `src/lib/i18nRef.ts`, `src/hooks/useReferenceData.ts`
- edit: `src/hooks/useLandFormData.ts`, `src/hooks/useUnifiedLocation.ts`, `src/hooks/useLocationPreloader.ts`, `src/hooks/useCommunityGroups.ts`, `src/services/syncService.ts`
- edit: 8 files under `src/components/crops/*`
- edit: `src/components/land/{ModernLandWizard,EditLandWizard,CropSelectionCard,CropManagementDialog,SmartLandConfirmCard}.tsx`
- edit: `supabase/functions/ai-smart-schedule/index.ts`, `supabase/functions/ai-smart-schedule/variety-aware-planner.ts`, `supabase/functions/lands-api/index.ts`
