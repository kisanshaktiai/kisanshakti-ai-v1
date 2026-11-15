# Schedule page: expanded task fits the screen + no English words in Marathi

## Task 1 — Opened task card fills exactly the free screen area
Today, tapping a task opens it in place: its top may hide under the top bar and its bottom runs under the bottom icons, so the farmer has to hunt for it.

New behaviour (Basic and Graphical views):
- On tap, the page smoothly scrolls so the card's top sits just below the top bar.
- The opened card is sized to the space between the top bar and the bottom icons (measured live, safe-area aware, adjusts on rotation / keyboard).
- Header (task name, tick button, collapse arrow) stays pinned at the top of the card; the details (how much, steps, precautions, photo/edit/video buttons) scroll inside the card.
- When the farmer reaches the end of the card's details, continued scrolling moves the page on to the next task (natural hand-off, no scroll trap).
- Only one card open at a time (already the case); closing returns to the normal list. Reduced-motion users get an instant jump instead of a smooth scroll.

## Task 2 — Every word in the farmer's chosen app language
Confirmed in saved Marathi tasks: text like "पेरणीनंतर day 0 ते day 24 पर्यंत…", and amounts shown with raw units ("49.72 kg", "50 mm"). Some labels also fall back to English because their Marathi/Hindi keys are missing (Photo, Mark complete, Refresh schedule, No tasks, voice/irrigation hints). The weekday heading ("Monday") is also English.

Fix (display only — numbers and agronomic values never change):
- Add a small language-neutral display step that swaps leftover English time/unit words (day/days, every day, daily, week, kg, g, ml, L, mm, acre…) for the farmer's language using translation files, keeping every number exactly as saved.
- Show amount units through translation keys (e.g. "49.72 किलो", "50 मिमी").
- Weekday/date headings use the app language's date format.
- Add all missing Marathi and Hindi labels used on the schedule page.
- Stage day windows on the Graphical rail show a translated "दिवस" label.

## Technical details
- `FarmerTaskTimeline.tsx`: per-card ref; on `onOpenChange(true)` → `requestAnimationFrame` + `scrollIntoView`/`window.scrollTo` with offset = measured header bottom; expanded `<article>` gets `max-height: calc(100dvh - var(--sched-top) - var(--sched-bottom))` with `CollapsibleContent` as `overflow-y-auto overscroll-auto`; vars set from `ResizeObserver` on the app header and bottom nav (fallback to safe-area insets).
- New `src/lib/localizeDisplayUnits.ts`: token map driven entirely by i18n keys `schedule.units.*` / `schedule.frequency.*`; regex only on whole ASCII tokens adjacent to digits; no-op for `en`; numbers asserted unchanged. Applied in `scheduleTaskPresentation.ts` to `what/how/howMuch` and in `quantityText` units.
- `date-fns` `format` with locale from `i18n.language` (mr/hi/en).
- Fill missing keys in `src/i18n/locales/{mr,hi}/schedule.json` (+ `cropGrowth.takePhoto`).
- Tests: `tests/schedule/localize_display_units.test.ts` — Marathi "day 0 ते day 24" → "0 दिवस ते 24 दिवस"-style output, numbers identical, English unchanged, unknown tokens untouched.
- No database, edge function or agronomy changes. (Root cause of "day N" in saved text is the schedule narration step; can be tightened separately on request.)
