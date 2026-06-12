## Goal
Make every land-attribute "tiny card" (soil_type, water_source, irrigation_type, ownership_type) render in the farmer's selected language across the schedule flow, land cards, land details, and chat — using the inline DB translations (soil_types / water_sources / irrigation_types) and i18n keys for ownership.

## Root-cause audit (what's broken)

| Location | Bug |
|---|---|
| `ModernLandCard.tsx` L317-321 | `{land.ownership_type}` rendered raw (always English: "owned"/"leased") |
| `LandCard.tsx` L124-128 | Same raw `ownership_type` |
| `LandManagement.tsx` L170 | Raw `ownership_type \|\| 'Owned'` |
| `LandDetails.tsx` L460-464, L546, L551, etc. | `irrigation_source`, `water_source`, `soil_type`, `ownership_type` rendered raw — no `refLabels.display()` and no i18n for ownership |
| `LandContextCard.tsx` L38-39 | Raw `soil_type` |
| `LandSpecificChatTab.tsx` L87 | Raw `soil_type` |
| Schedule cards on `/app/schedule` (`ModernScheduleCard.tsx`) | Shows crop/dates only — never surfaces the land's soil/water/irrigation/ownership tiny chips that the user expects |
| `CropScheduleView.tsx` header (L429-467) | Only shows landName + crop variety; no localized soil/water/irrigation/ownership chips |
| i18n `lands.wizard.ownership.*` | Only `owned/leased/shared` keys exist; **`contract` is missing** and only `en/hi/mr` are populated. User needs all 14 languages + 4th type |
| `ModernLandWizard.tsx` L487-491 + zod enum L37 + `LandFormDialog.tsx` L59, L102 | Hard-codes 3 ownership enum values — need to add `contract` |

DB confirmation: `lands.ownership_type` is a single `text` column (no array). We treat it as the canonical key (`owned|leased|shared|contract`) and translate via `t('lands.wizard.ownership.<value>')`. No DB migration needed.

## Plan

### 1. Add a reusable ownership label helper
Create `src/lib/ownershipLabel.ts`:
```ts
export const OWNERSHIP_TYPES = ['owned','leased','shared','contract'] as const;
export type OwnershipType = typeof OWNERSHIP_TYPES[number];
export function useOwnershipLabel() {
  const { t } = useTranslation();
  return (v?: string | null) => {
    if (!v) return t('lands.wizard.ownership.unspecified', { defaultValue: '—' });
    const key = String(v).toLowerCase().trim();
    return t(`lands.wizard.ownership.${key}`, { defaultValue: t(`lands.wizard.ownership.${key}_default`, { defaultValue: key.charAt(0).toUpperCase() + key.slice(1) }) });
  };
}
```

### 2. i18n keys — add `lands.wizard.ownership` block to ALL 14 locales
For every locale folder (`en, hi, mr, pa, ta, te, bn, gu, kn, ml, or, as, ur, sa`) ensure `lands.json → wizard.ownership` contains:
```
label, owned, leased, shared, contract, unspecified
```
For non-existent locale folders (pa/ta/te/…) — they currently fall back to English; we will add only the `lands.json` `wizard.ownership` snippet (creating the file if missing is out of scope; if no folder exists, English keys cover them via i18next fallback).

### 3. Add `contract` to the ownership enum/dropdowns
- `ModernLandWizard.tsx` (state type L37, default L79, options array L489-491, review label L835).
- `LandFormDialog.tsx` (zod enum L59, default L102, cast L124).
- `EditLandWizard.tsx` review render L570 already uses raw value — switch to `useOwnershipLabel()`.

### 4. Wire `useLandRefLabels` + `useOwnershipLabel` everywhere ownership/soil/water/irrigation/source render raw
Files to update (presentation only):
- `src/components/land/ModernLandCard.tsx` — wrap ownership badge with helper.
- `src/components/land/LandCard.tsx` — same.
- `src/pages/LandManagement.tsx` L170 — same.
- `src/pages/LandDetails.tsx` — switch all 4 raw attribute renders to `refLabels.display(...)` + ownership helper; add localized chip row near the top (compact tiny-card group) mirroring `LandSelector`.
- `src/components/chat/LandContextCard.tsx` & `LandSpecificChatTab.tsx` — soil chip via `refLabels.soil(...)`.

### 5. Surface tiny chips on schedule cards (the user's main complaint on `/app/schedule`)
- `src/components/schedule/ModernScheduleCard.tsx`: accept optional `land` prop and, when provided, render a localized chip row (soil / water / irrigation / ownership) under the header using `useLandRefLabels` + `useOwnershipLabel`. Pure presentational addition.
- `src/pages/Schedule.tsx` (and `AIScheduleDashboard.tsx` if it instantiates the card): pass the resolved land object through to `ModernScheduleCard`.
- `src/components/schedule/CropScheduleView.tsx` header (L429-467): add a one-row chip strip below the landName/variety line using the same helpers, scoped to the currently-selected land.

### 6. Cache invalidation
`useLandRefLabels` already uses TanStack Query with a `staleTime`; no change needed. Language switch triggers re-render automatically via `useTranslation`.

## Out of scope
- No DB migrations (DB already stores localized columns for soil/water/irrigation; ownership stays text).
- No business-logic changes to schedule generation, AI, or backend.
- No new wizards or new fields beyond adding the `contract` option.

## Verification
- Switch language to Marathi → open `/app/schedule` and `/app/lands` → every tiny chip (soil/water/irrigation/ownership) renders in Marathi.
- Add land → choose "Contract" → save → card shows localized "करार" (mr) / "अनुबंध" (hi) / "Contract" (en).
- LandDetails page: all four attributes localized; no raw `owned`/`drip`/UUID leaks.