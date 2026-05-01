# Add Land — fix edit affordance, picker UX, and AI admin-level mismatch

Three confirmed problems on `/app/lands/add` after AI prefill:

1. **Pen icon does nothing.** On the Location `ReviewCard`, when AI fills the values the card renders in `state='ai'` collapsed, so only "Yes / Change" appear — tapping the pen on individual fields (State / District / Taluka / Village) is impossible until the farmer first presses "Change". Worse: inside `FieldChip` the `<Pencil />` is purely decorative (the whole chip is the button). Farmers tap the pen, see no visual feedback, and conclude the form is broken.
2. **Picker has no clear Search + no "Select manually" path** for State / District / Taluka. Only Village has a free-text fallback. The search input is also visually undersized.
3. **AI mis-labels admin levels.** Google reverse-geocode returns:
   - `administrative_area_level_1` → State (mostly correct)
   - `administrative_area_level_2` → District **OR Division** (e.g., "Pune Division")
   - `administrative_area_level_3` → Taluka **OR District** (varies by region)
   For many rural centroids the form ends up showing a *Division* in the State chip and a *District* name in the Taluka chip. The current `resolveId` only does name lookup; it never reclassifies when a value belongs to a different table.

## What we'll change

### A. Picker UX (`LocationPickerSection.tsx`)
- Always render a sticky **Search** input at the top of the bottom-sheet (already there, but enlarge to 48px and pin under the title).
- When `items.length === 0` after a search, show a clear empty state:
  - "No matches for *xyz*"
  - A primary button **"Use 'xyz' as <level>"** (free-text path, sets the typed value, leaves `*_id` undefined). Today this only exists for Village; extend it to **District** and **Taluka** as well so a farmer can override an AI mistake even when the local DB is incomplete.
  - State stays DB-only (we have all 36 states; free-text would corrupt downstream joins).
- Keep the 350ms tap-arm guard.
- Add a small "Select manually" hint chip under the AI-prefilled chip when `source !== 'farmer'`, so the farmer sees an explicit invitation to override.

### B. Edit affordance
- `FieldChip.tsx`: convert the trailing `<Pencil>` into a real focusable affordance — bigger (h-5 w-5), wrapped in a 44px hit area, `aria-label="Edit"`. Tapping it calls the same `onClick` (the chip already does, but the icon now reads as the explicit edit handle).
- `ReviewCard.tsx` (Location card path): when `state === 'ai'` and the section contains required sub-fields (Location only), auto-expand the body alongside the "Yes / Change" row, so individual State/District/Taluka/Village chips are always reachable. Add a new prop `alwaysShowChildrenWhenAi?: boolean` and set it true on the Location card. This eliminates the "tap pen → nothing happens" perception.
- `SmartLandConfirmCard.tsx`: pass `alwaysShowChildrenWhenAi` for Location, and ensure `defaultOpen=true` for Location whenever any of state/district/taluka came from AI (not just when empty).

### C. AI admin-level reclassification (`supabase/functions/lands-api/index.ts`)
Replace the naive level→field mapping with a **canonical-DB-first** classifier:

```
candidates from Google: { l1, l2, l3, locality, sublocality, area_l4 }
1. state := first candidate that matches a row in states (ilike). Fallback l1.
2. district := first candidate that matches districts WHERE state_id = stateId (ilike).
   - excludes anything containing "Division".
3. taluka := first remaining candidate matching talukas WHERE district_id = districtId.
4. village := first remaining candidate matching villages WHERE taluka_id = talukaId,
   else locality / sublocality as free-text village.
```

This way, if Google returns "Pune Division" at l2 and "Pune" at l3, we correctly classify Pune as the district. If l3 is actually the taluka name ("Haveli"), it lands in taluka. The classifier runs once with one query per level, server-side. Confidence drops to 0.5 for any value that didn't resolve to a canonical row, so the UI still flags it as needing review.

### D. i18n strings (added to `en.json` only; other locales use defaultValue)
- `lands.location.noMatches` — "No matches for "{q}""
- `lands.location.useAsDistrict` / `useAsTaluka` / `useAsVillage`
- `lands.location.selectManually` — "Select manually"
- `lands.smartConfirm.aiPickedWrong` — "AI picked the wrong one? Tap to change"

## Files to edit
- `src/components/land/LocationPickerSection.tsx` — picker empty state, free-text for District/Taluka, larger search, "Select manually" hint.
- `src/components/land/FieldChip.tsx` — real Edit hit-area on the pen icon.
- `src/components/land/ReviewCard.tsx` — `alwaysShowChildrenWhenAi` prop.
- `src/components/land/SmartLandConfirmCard.tsx` — pass new prop, force Location card open when AI-prefilled.
- `supabase/functions/lands-api/index.ts` — canonical-DB-first admin-level classifier (replace lines 82-145).
- `src/i18n/locales/en.json` — new picker strings.

## Out of scope
- Voice editing of admin levels (already handled by free-text + speech).
- Adding new villages to the DB (the 8-row villages table is intentionally sparse; free-text already works).
- EditLand page (same components are reused; fix carries over automatically).
