
# Lands Feature — Deep Audit & Fix Plan

## Audit Findings

### Bug 1 — Sticky search bar overlaps land cards
File: `src/pages/LandManagement.tsx` (line 247)

```tsx
<div className="sticky top-14 z-10 bg-background/95 backdrop-blur-sm py-3 px-4">
```

`top-14` is correct relative to the global header **only** when the page is the body scroller. But `AppLayout` wraps `<Outlet />` in `<main className="pt-14 pb-nav-safe mobile-scroll-container">`, which is itself the scroll container (`overflow-y: auto`). Inside that scroller, `sticky top-14` measures from the top of the scroller, not from the header — so the search bar sticks 56px **below** the visible top, hiding the first land card behind it as the user scrolls.

**Fix:** Change to `sticky top-0` (relative to the `<main>` scroller, which already has `pt-14`). The bar will pin flush to the top of the scroll viewport, directly under the global header. Also add `-mx-4 px-4` is unnecessary; keep `px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border/40` so the bar fully covers the cards beneath it (no transparency leak).

### Bug 2 — Add Land wizard cannot scroll
File: `src/components/land/ModernLandWizard.tsx` (line 393)

```tsx
<div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
```

The wizard is rendered inside `<main className="… mobile-scroll-container">` (which is `overflow-y: auto; flex: 1`). `min-h-screen` forces height to 100vh but the global header is `pt-14`, so the wizard renders 56px **taller** than the available viewport. On Step 3 (Land Details has 7 fields + crop cards) and Step 4 (Review with 5 cards), the bottom navigation buttons fall below the fold and the inner scroll cannot reach them because the parent flex container clips.

**Fix:** Replace `min-h-screen` with `min-h-full` and remove the artificial overflow. Let the natural document flow + `<main>`'s scroller handle scrolling. Also add `pb-24` to the wrapper so the sticky nav buttons clear the bottom navigation bar.

### Bug 3 — ModernLandWizard hardcoded in English (Marathi shows English)
File: `src/components/land/ModernLandWizard.tsx`

All 4 steps use **hardcoded English strings** instead of `t()`. Examples:
- Line 359-363: `steps` array → `'Basic Info'`, `'Location'`, `'Land Details'`, `'Review & Save'`
- Line 366-390: `soilTypes`, `waterSources`, `irrigationTypes` arrays → English `label` literals
- Line 418: `Step {currentStep} of 4: {steps[currentStep - 1].title}`
- Line 441, 457, 470, 483, 487-489, 519, 534, 551, 564, 580, 593, 607, 620, 631, 652, 667, 673, 686, 692, 705, 711, 750, 763, 783, 801, 805, 809, 813, 821, 824, 828, 832, 840, 843, 847, 851, 855, 863, 866, 870, 874, 884, 887, 904, 916, 926, 930
- Voice guide messages (lines 446, 524, 657, 788) — English only

The translation **keys already exist** in `mr/lands.json` under `lands.wizard.*`:
- `lands.wizard.steps.basic_info`, `.location`, `.land_details`, `.review_save`
- `lands.wizard.soil_types.alluvial|black|red|laterite|desert|mountain`
- `lands.wizard.water_sources.*`, `.irrigation_types.*`
- `lands.wizard.review.land_area|basic_info|location|land_details|boundary_points|points_captured`
- `lands.wizard.buttons.previous|next|cancel|save_land|saving|start_mapping`
- `lands.wizard.voice_guide`, `step_of_total`, `crop_selection`, `current_crop`, `previous_crop`

What's **missing** in MR (and HI/EN):
- `lands.wizard.fields.land_name`, `.survey_number`, `.cultivation_date`, `.last_harvest_date`, `.required`, `.land_name_placeholder`, `.survey_placeholder`
- `lands.wizard.ownership.owned|leased|shared`
- `lands.wizard.placeholders.select_state|select_district|select_taluka|select_village|select_soil|select_water|select_irrigation`
- `lands.wizard.voice_guides.basic_info|location|land_details|review`
- `lands.wizard.toast.validation_title|name_required|boundary_required|offline_title|offline_message|success_title|success_message|error_title|error_generic|error_timeout|error_session`

### Bug 4 — Missing Marathi crop_management & edit keys (32 keys)
The CropManagementDialog and EditLandWizard reference these keys but they're absent from `mr/lands.json`:
- `lands.crop_management.*` (20 keys: title, description, current/previous_crop, planting_date, expected_harvest, duration_days, save_changes, saving, back, select_*, toast.success/error/load_error, etc.)
- `lands.edit.*` (10 keys: title, basic_details, area_display, area_detail, basic_land_info, land_characteristics, review, toast.success/error/session_error)
- `lands.list_item.acres`, `lands.list_item.ownership_default`

## Fix Plan (3 files)

### 1. `src/pages/LandManagement.tsx`
- Line 247: change `sticky top-14` → `sticky top-0`, add `border-b border-border/40` to the sticky wrapper for visual separation and to prevent card bleed-through.

### 2. `src/components/land/ModernLandWizard.tsx`
- Line 393: replace `min-h-screen … p-4` → `min-h-full … p-4 pb-24` (allow natural scrolling inside `<main>`, clear bottom nav).
- Replace all hardcoded English strings with `t('lands.wizard.…')` calls. Specifically:
  - `steps` array → translated titles via `t('lands.wizard.steps.*')`
  - `soilTypes`, `waterSources`, `irrigationTypes` `label` → `t('lands.wizard.soil_types.*')`, etc.
  - All `<Label>` text, `<SelectValue placeholder>`, `<Input placeholder>`, section headings, review-card labels, voice-guide messages, navigation buttons (Previous/Next/Cancel/Save Land/Saving), and toast messages.
  - Step counter: `t('lands.wizard.step_of_total', { current: currentStep, total: 4, title: t(...) })`.
- Ownership cards (line 487-489): use `t('lands.wizard.ownership.owned|leased|shared')`.

### 3. Translation files — add missing keys to **all** locales (`en`, `hi`, `mr`, `pa`, `ta`)
Add a complete `lands.wizard` namespace covering:
- `fields.*` (land_name, land_name_placeholder, survey_number, survey_placeholder, cultivation_date, last_harvest_date, required)
- `ownership.owned|leased|shared`
- `placeholders.select_state|select_district|select_taluka|select_village|select_soil|select_water|select_irrigation`
- `voice_guides.basic_info|location|land_details|review`
- `toast.validation_title|name_required|boundary_required|offline_title|offline_message|success_title|success_message|error_title|error_generic|error_timeout|error_session`

Also backfill the **32 missing MR keys** under `lands.crop_management.*`, `lands.edit.*`, and `lands.list_item.*` so CropManagementDialog and EditLandWizard render fully in Marathi. Use the EN values as the source and translate to MR (mirror existing tone — Devanagari, conversational rural Marathi consistent with `mem://ui/farmer-centric-content-rules`).

## Verification Checklist
- 390×688 viewport: search bar pins flush under the global header; cards scroll cleanly underneath without being clipped; "Add Land" button still flows after the last card.
- Add Land wizard scrolls naturally on all 4 steps; Previous/Next/Save buttons are always reachable; on Step 3 and Step 4 nothing falls behind the bottom nav.
- Switch language to Marathi → every label, placeholder, button, voice-guide, toast, and review row in `ModernLandWizard`, `LandInstructionDialog`, `CropManagementDialog`, and `EditLandWizard` renders in Devanagari with no English fallback.
- Hindi/Punjabi/Tamil also receive the new keys (translated) so no English leakage in any language.
- No TypeScript errors; no console warnings about missing translation keys.

## Out of Scope (no changes needed)
- `LandManagement.tsx` outer layout (already fixed in previous turn — no nested scroll wrapper).
- `GoogleMapBoundaryDrawer.tsx` (uses `t()` already and runs full-screen).
- `LandInstructionDialog.tsx` (already fully translated via existing keys).
- Edge functions / DB / RLS — UI-only fixes.
