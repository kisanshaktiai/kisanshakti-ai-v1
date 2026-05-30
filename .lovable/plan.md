# Schedule UI Modernization + i18n Audit Fix

## Scope (UI + i18n only — no logic, data, or theme-color changes)

The /app/schedule page currently stacks two headers (Schedule.tsx outer header with steps/progress + CropScheduleView inner header with crop/land/badge) — wasting ~25% of mobile viewport. Several i18n keys (24 in hi, 24 in mr) are missing, causing raw keys like `schedule.schedule_view.ai_schedule` to render in the UI (visible in user screenshot). `pa.json` and `ta.json` are missing the `schedule.schedule_view` and `schedule.crop_input` namespaces entirely. Two hardcoded English strings exist in `AIScheduleDashboard.tsx` and one in `Schedule.tsx` ("Try Again").

## 1. Unify the nested top bar (mobile-first 2030 design)

**Problem:** `Schedule.tsx` renders a sticky header (lines 354–419) AND `CropScheduleView.tsx` renders its own sticky header (lines 374–398, 443–490). On the schedule-view step both appear stacked.

**Fix:** Single compact header.
- Remove the inner sticky header from `CropScheduleView.tsx` when `onBack` is provided by parent (it always is in the schedule flow).
- Redesign the outer `stickyHeader` in `Schedule.tsx` to become a single **context-aware compact bar** (~56px total height vs current ~80px) that on the `schedule-view` step inlines the crop chip + land subtitle + harvest countdown badge — replacing the inner header's content.
- Layout: `[← back] [crop icon + crop name + variety] [right: progress dots OR harvest badge]`. Step subtitle text moves into a 4px-tall progress bar with current-step label only, not all three.
- All colors via existing semantic tokens (`bg-background/80`, `text-primary`, `bg-primary-soft`, `border-border/50`) — no hex/RGB.

**Files touched:**
- `src/pages/Schedule.tsx` — rewrite `stickyHeader` JSX (lines 354–419) to be step-aware and pull crop/land context when in schedule-view.
- `src/components/schedule/CropScheduleView.tsx` — remove the duplicate sticky header block (lines 374–398 for empty state, 443–490 for active state). Replace with lightweight inline summary chip inside the scroll area (no sticky), or remove entirely when parent header handles it.

## 2. Fill missing i18n keys

Add the 24 missing keys to **every** language file. Keys live under `schedule.schedule_view.*`, `schedule.crop_input.*`, `schedule.toast.*` (full list extracted from EN).

**Files touched:**
- `src/i18n/locales/hi/schedule.json` — add 24 keys (Hindi translations)
- `src/i18n/locales/mr/schedule.json` — add 24 keys (Marathi translations)
- `src/i18n/locales/pa.json` — add `schedule.schedule_view`, `schedule.crop_input`, `schedule.toast` blocks (Punjabi)
- `src/i18n/locales/ta.json` — same, ensure `schedule_view` + `crop_input` blocks exist (Tamil)
- `src/i18n/locales/en/schedule.json` — already has them; no change

The 24 missing keys (sample, full set added):
- `schedule_view`: ai_schedule, generate_schedule, loading, no_active_schedule, no_schedule_available, no_schedule_description, standard_variety
- `crop_input`: generate_ai_schedule, generating, pick_date, planting_date, please_select_crop, please_select_date, ready_made_description, ready_made_plant, select_crop, select_date, sowing_date, variety_label, variety_placeholder, water
- `toast`: changes_saved, task_updated, update_failed

## 3. Remove hardcoded English strings on Schedule page

- `src/pages/Schedule.tsx` line ~280: `"Try Again"` → `t('common.try_again')` (key exists in common.json, verify; add if missing).
- `src/pages/AIScheduleDashboard.tsx` lines 27–34 (`"AI Crop Intelligence"`, subtitle, card titles): replace with i18n keys under new `schedule.dashboard.*` namespace in all 5 languages. (Scope contained — single page.)

## 4. Verification

- After edits, reload `/app/schedule` in mr/hi/en/pa/ta — confirm no raw `schedule.*` keys render, single top bar visible (~56px), crop+land context shows on schedule-view step.
- Run `rg "schedule\\." src/i18n/locales/en/schedule.json` key list against hi/mr/pa/ta to confirm parity (script-style check).

## Out of scope (explicitly NOT changing)

- Edge function logic (`ai-smart-schedule`)
- Data fetching, React Query, Supabase calls
- Theme tokens / `index.css` / `tailwind.config.ts`
- Other pages' i18n (only Schedule + AIScheduleDashboard)
- Decision brain / orchestrator / rules
