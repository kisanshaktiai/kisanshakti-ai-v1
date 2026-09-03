# Crop Schedule flow — 2030-ready mobile UI + farming-method wiring

## What the audit found (verified in code and database)

1. **Farming method (Organic / Balanced / High Yield) is collected but never used.**
   `CropDateInput` → `Schedule.tsx` sends `farmingType` to `ai-smart-schedule`, but inside the function it appears exactly twice: read from the body and written to `crop_schedules.farming_type`. It is never passed into `generateBaseline`, so an organic farmer and a high-yield farmer get the identical task list. The database already carries the fields needed to differentiate: `decision_rules.ipm_level` (1,588 of 1,974 rows populated) and `decision_rules.organic_alternative` (1,263 rows populated).
2. **The backdated-consent screen is effectively Marathi/Hindi/English only.** `BackdatedConsentDialog.tsx` hardcodes an inline `translations` object with `en`, `hi`, `mr`. Any other app language silently falls back to English. `FarmingTypeDialog.tsx` has the same pattern with `en, hi, mr, pa, ta` inline.
3. **The date is rendered in English regardless of app language.** `format(sowingDate, "PPP")` is called without a date-fns locale, so a Marathi user sees "September 3rd, 2026" (visible in the screenshot). Date entry is a single popover calendar with no fast path for the common cases ("today", "a week ago", "last month").
4. **The planting step wastes over half the screen.** On the 393px preview the planting step shows date + intercrop + variety chip and then ~300px of empty space above a floating action bar, while the farming-method choice is hidden in a small centred dialog that looks like a different app.
5. **Farming method is a modal afterthought.** It fires only after the submit button, so the farmer cannot see or change the choice before generating, and it is not shown anywhere in the summary.

## Changes

### 1. Wire the farming method into schedule generation (backend)
- Thread `farmingType` from `index.ts` → `resolve-inputs.ts` → `generateBaseline` as a resolved `farmingPolicy` of `organic_only | organic_fertilizer | fertilizer_pesticide`.
- Apply it as a DB-driven filter/preference on rule and product selection, no hardcoded agronomy:
  - `organic_only`: drop rules whose only action is synthetic; where `organic_alternative` exists use it as the action text; keep `ipm_level` low-intervention rules.
  - `organic_fertilizer`: keep both, prefer `organic_alternative` for plant-protection tasks, allow chemical nutrition tasks.
  - `fertilizer_pesticide`: current behaviour (no restriction).
- Record every applied/suppressed rule in `generation_params` and push a `gaps[]` entry when a policy suppresses a task with no organic substitute — never invent a substitute.
- Persist the choice on `land_crops.farming_type` in addition to `crop_schedules.farming_type`.

### 2. Multi-language consent and method screens
- Move all `BackdatedConsentDialog` and `FarmingTypeDialog` strings into the `schedule` i18n namespace (`en`, `hi`, `mr` locale files), delete the inline translation maps, and let i18next fall back to English for the remaining languages instead of silently rendering Marathi/English mixes.
- Localise the day count and crop name through interpolation, not string concatenation.

### 3. Easy, farmer-friendly date selection
- Replace the popover-only picker with an inline date block:
  - large quick chips: Today, Yesterday, 1 week ago, 15 days ago, 1 month ago (localised);
  - the full calendar still reachable via a "Choose date" button;
  - selected date rendered with the date-fns locale matching the app language, plus a plain-language line ("X days ago") in the farmer's language.
- Same treatment for the transplanting date field.

### 4. Mobile-first 2030 layout using the free space
- Planting step becomes a single scrollable column of full-width cards that fills the viewport: crop+variety summary card → date card (with chips) → nursery/transplant card (only when relevant) → **farming method card inline** (three tappable options, previously the small dialog) → intercrop card → sticky bottom generate bar.
- The farming-method dialog is retained only as an edit sheet from the summary; the primary selection is inline, so nothing is hidden behind the submit button.
- Consistent tokens: opaque surfaces (no backdrop-blur, per the project mobile-FPS rule), `rounded-2xl` cards, minimum 48px touch targets, semantic colour tokens only.

## Technical notes
- Frontend: `CropDateInput.tsx`, `FarmingTypeDialog.tsx`, `BackdatedConsentDialog.tsx`, locale files under `src/i18n/locales/{en,hi,mr}`.
- Backend: `ai-smart-schedule/index.ts`, `db/resolve-inputs.ts`, `generator/baseline-generator.ts` (policy filtering only — no constant maps, keeping `no-hardcoded-agronomy_test.ts` green), then redeploy the function.
- No schema changes; `land_crops.farming_type` and `decision_rules.organic_alternative`/`ipm_level` already exist.
- Verification: schedule edge tests + `tsgo` typecheck, then a Marathi browser pass of the whole flow and one generated schedule per farming method to confirm the task lists differ.
