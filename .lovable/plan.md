## Why the current form still feels wrong for rural farmers

The plumbing landed (location is editable, country saved, fuzzy ID resolver), but the **UX is built for a city user filling a long form**, not a farmer in a field on a 390-wide phone. Concrete problems:

1. **Wall of text after a visual map step.** The farmer just drew their boundary on a satellite image, then suddenly stares at 6 sections of chips. The visual link to "the field I just drew" is gone.
2. **Country chip is dead weight.** Locked to India, takes a full row.
3. **Confidence dots and "%" are technical UI** rural farmers don't decode. They need a clear "AI guess — is this right?" interaction.
4. **Native `<input type="date">`** for sowing/harvest dates is brutal for low-literacy users — farmers think in *seasons and months*, not "2025-06-14".
5. **Voice mic is buried** next to Save instead of being a primary input mode.
6. **All-fields-flat** — no progressive disclosure. A farmer who only knows their crop + sowing month must still scroll past Soil/Water/Irrigation/Previous-cycle just to find Save.
7. **Edit affordance is weak** — chevron is small; nothing says "tap me to change". Need an explicit pencil + pressed-state animation.

## Goals (2030-ready, mobile-first, farmer-first)

- **One thumb, one screen at a time.** Each section fits in a single 390×688 viewport.
- **Confirm-by-tap.** AI guesses appear as cards with a big ✓ Correct / ✎ Change pair.
- **Voice-first.** Mic is a primary FAB, always visible while scrolling.
- **Seasons over dates.** "Kharif 2025 — June" beats "2025-06-14".
- **Map context never disappears.** A small persistent thumbnail of the drawn polygon stays at the top.
- **Everything is editable in ≤2 taps**, with explicit ✎ icons.

## Plan — UI redesign of `SmartLandConfirmCard`

No new edge functions. No new database columns. Reuses the existing
`lands-api?action=infer-context` + `landsApi.createLand` (already country-aware) and the
existing `LocationPickerSection`. Pure frontend refactor.

### 1. New layout: 3 stacked "review cards" + persistent footer

```text
┌─────────────────────────────────────────┐
│ ←  Confirm your land   ●●●● 2.45 ac     │  sticky header
├─────────────────────────────────────────┤
│ ┌──────── MAP THUMB ────────┐           │  60×60 polygon preview
│ │  satellite + green outline │  Land name│  + inline name input
│ └────────────────────────────┘  [_____] │
├─────────────────────────────────────────┤
│ 📍 Where is it?              [✎ Edit]   │  Card 1 — Location
│ Mahabaleshwar · Satara · MH · India     │  one-line summary
│ AI guessed this. Looks right? [✓][✎]    │  confirm-by-tap
├─────────────────────────────────────────┤
│ 🌾 What's growing?           [✎ Edit]   │  Card 2 — Crop & dates
│ Sugarcane · Sowed June 2025             │
│ Kharif 2025  →  Harvest ~Mar 2026       │
│ AI guessed this. Looks right? [✓][✎]    │
├─────────────────────────────────────────┤
│ 🌱 Land character (optional)  [▼]       │  Card 3 — collapsed by default
│ Tap to add soil, water, irrigation       │
└─────────────────────────────────────────┘
[ 🎤 Voice ]                 [ Save Land ]   sticky footer
```

Each card has 3 states:
- **AI-suggested** (yellow border, "AI guessed this. Looks right?" with ✓/✎ buttons)
- **Confirmed** (green check badge, no prompts)
- **Empty** (dashed border, "Tap to add")

Tapping ✓ flips confidence to 1.0 + source to `farmer` (already wired). Tapping ✎ opens
the existing `LocationPickerSection` / crop picker inline (full-screen sheet, not the
tiny bottom drawer).

### 2. Drop the country chip from the visible UI

- Country defaults to India and is **stored silently**. No chip in the location section.
- Add a tiny "Outside India?" link at the very bottom of "More details" that swaps the
  country picker in. 99% of farmers never see it.

### 3. Replace `<input type=date>` with a SeasonMonthPicker

New component `SeasonMonthPicker.tsx`:
- Two-row picker — **Year** (current ± 2) and **Month** (12 tiles with crop-season tint).
- Stores ISO date as `YYYY-MM-15` (mid-month) so downstream stage math keeps working.
- Optional "Exact date" toggle reveals the native date input for power users.
- Used for both `sowing_date` and `last_harvest_date`. Removes the duplicated
  `SeasonPicker` + `<input type=date>` stack.

### 4. Voice mic as a floating primary action

- Move the mic out of the bottom bar into a **floating circular FAB** at bottom-right
  (above the safe-area). 56px, primary color, with a pulsing ring while recording.
- Bottom bar becomes only `[ Save Land ]` — full-width, big, unmissable.
- Wire the existing `LandVoiceCapture` + `handleVoiceTranscript` (no logic change).

### 5. Persistent map thumbnail

- New component `LandMapThumb.tsx` — renders the drawn `boundary` as an SVG polygon over
  a static Google Maps satellite tile (we already have the API key). 80×80, rounded.
- Sits in the sticky header next to the land name input. Tap = jump back to the map
  drawer to redraw (calls `onCancel` which the parent already handles to re-open the map).

### 6. Simplify the chip vocabulary

- `FieldChip` gets a new `state: 'ai' | 'confirmed' | 'empty' | 'manual'` prop.
- AI state shows: amber left border, sparkle icon, and an inline "✓ Yes" mini-button on
  the right edge (tap = confirm, no sheet). The full chip tap still opens the picker.
- Confidence dots are **removed from view** — kept in `data-confidence` for QA only.
  Replaced by a single tiny "AI" pill when source is not `farmer`.

### 7. Progressive disclosure of secondary fields

Reorder + collapse:
- Always visible: Land name, Location summary, Crop + Sowing month, Save.
- Collapsed by default ("Tap to add" affordance):
  - Land character (soil / water / irrigation)
  - Survey number + ownership tiles
  - Previous cycle
  - Notes / marketplace
- Each collapsed section shows a one-line preview of any AI-prefilled values so the
  farmer knows there's something inside without having to open it.

### 8. Edit-everywhere parity for `EditLand`

- Extract the new layout into `LandReviewCard.tsx` (location card),
  `CropReviewCard.tsx`, `LandCharacterCard.tsx` so `EditLand` can reuse the exact
  same UI. Today `EditLand` falls back to the old `EditLandWizard` — out of scope to
  rip that out, but the new cards are designed reusable for the next iteration.

### 9. Accessibility & rural-farmer specifics

- Min tap target 56px everywhere (already mostly true).
- Every interactive element gets an emoji + a translated label (works around
  illiteracy — icons are the primary cue, text is secondary).
- Every input has a `aria-label` in the active language.
- Haptic ping on every confirm tap (already wired via `navigator.vibrate`).
- All copy goes through `t()` with `defaultValue` so existing translations keep working.

## Files to touch

- **edit** `src/components/land/SmartLandConfirmCard.tsx` — new 3-card layout, drop
  country chip from the visible flow, use new components.
- **edit** `src/components/land/FieldChip.tsx` — add `state` prop + inline ✓ button,
  remove visible confidence dots.
- **edit** `src/components/land/LocationPickerSection.tsx` — hide the Country row by
  default, expose via `showCountry` prop (used only inside the "Outside India?" toggle).
- **new** `src/components/land/SeasonMonthPicker.tsx` — Year × Month tile picker with
  optional exact-date toggle.
- **new** `src/components/land/LandMapThumb.tsx` — SVG polygon over static satellite tile.
- **new** `src/components/land/ReviewCard.tsx` — generic AI/confirmed/empty wrapper used
  by Location, Crop, Character cards.

## Out of scope (intentionally)

- No new edge functions (existing `lands-api` already handles country + fuzzy IDs).
- No new database columns.
- No changes to `EditLandWizard` internals — new cards are designed for reuse but the
  swap is a follow-up to keep this PR focused.
- No translation file edits — all new strings ship with `defaultValue`.

## Rollback

`localStorage.setItem('smartLandConfirm', 'off')` already reverts to the legacy wizard.
