## Root-cause findings (deep audit)

### 1. Land name shows as "code" (UUID fragment)
In `src/pages/ProactiveAlerts.tsx` line 150, the land chip falls back to `a.land_id.slice(0, 6)` whenever `land_name` is null. `land_name` becomes null when the secondary `lands` lookup in `useProactiveAlerts.ts` returns nothing — which happens when:
- The land was deleted/archived but the alert still references its `land_id`.
- RLS on `lands` filters the row (tenant/farmer mismatch, soft-deleted).
- `trigger_data.land_name` is also missing (older alerts pre-name-mirror).

Result: chips and the alert footer display strings like `a2a595` — looks like a code.

Additionally the alert card body (line 311) only shows `MapPin + land_name` when `alert.land_name` is truthy, so half the cards have no land label at all even though the chip shows something.

### 2. Clicking a land doesn't load related alerts "instantly"
Two distinct paths, both broken:

- **From `AlertsSummaryCard` (home):** every alert row links to `/app/proactive-alerts` with **no** `?landId=` param. The destination page has no URL → state sync, so it always opens the full list — the user must scroll, find the chip, and tap it again.
- **In-page chips:** filtering is instant client-side, but each `motion.div` uses `transition={{ delay: index * 0.05 }}` for entry animation — so when the filter changes and the list re-mounts, 12 items stagger over ~600 ms, *feeling* like a load. There's also no `layoutId` so cards "jump" instead of cross-fading.

### 3. UI is not 2030-ready mobile-first
- Hardcoded tailwind palettes (`bg-blue-50`, `text-red-600`, `border-orange-200`) — violate the design-token rule and break dark mode.
- Card has 4 nested rows with inconsistent spacing on 390 px; action buttons wrap to a second line on the smallest viewport.
- No per-land summary header (count of CRITICAL / HIGH / MEDIUM, "last updated"), no empty-state for filtered land.
- Sticky header uses `backdrop-blur-md` — violates the Core memory rule for Android FPS.

---

## Plan

### A. Fix the land-name leak (data layer)

`src/hooks/useProactiveAlerts.ts`
- Extend the secondary lands lookup to also pull `area_acres, current_crop` so we can render a proper `LandRef`.
- Attach a structured `land` object on each alert: `{ id, name, area_acres, current_crop }` (null if unresolved). Keep `land_name` for backwards compat.
- When the lands query returns nothing for a referenced id, mark `land = null` and add a one-time `console.warn` (don't fabricate a slice of the UUID).

`src/pages/ProactiveAlerts.tsx`
- Replace `a.land_id.slice(0, 6)` fallback with the localized literal "Unnamed land" / "अनामिक शेत" / "अनाम भूमि".
- Replace inline `MapPin + land_name` rows with the existing `<LandRef land={alert.land} />` component (already enforces "🌾 (unknown)" + dev warn — see `src/components/land/LandRef.tsx`).
- Filter out alerts whose `land_id` is set but unresolved → group them under an "Other lands" chip instead of leaking UUIDs.

### B. Instant per-land loading

`src/components/home/AlertsSummaryCard.tsx`
- Change each row's `to="/app/proactive-alerts"` to `to={`/app/proactive-alerts?landId=${alert.land_id}`}` when `land_id` is present.

`src/pages/ProactiveAlerts.tsx`
- Read `landId` from `useSearchParams` on mount; seed `selectedLandId` from it; keep URL in sync via `setSearchParams` when the user taps a chip (so back-button restores the filter).
- Remove the per-item entry `delay: index * 0.05` and replace with `LayoutGroup` + `layout` prop so filter changes animate via FLIP cross-fade (≤120 ms) instead of staggered re-entry.
- When filter is active and result is empty, render a compact "No alerts for this land" block instead of nothing.

### C. 2030-ready mobile-first redesign

`src/pages/ProactiveAlerts.tsx` (visual layer only)
- **Tokens:** swap every `bg-blue-50 / text-red-600 / border-orange-200` etc. for semantic tokens (`bg-card`, `text-foreground`, `border-border`, `bg-destructive/10 text-destructive`, `bg-warning/10`, `bg-primary/10`). Move category color map to `CATEGORY_TOKEN` returning `{ icon, tone: 'destructive'|'warning'|'primary'|'success'|'info' }`.
- **Header:** drop `backdrop-blur-md` (use opaque `bg-background/95` per the Core mobile-FPS rule). Add a 2-row mini "report" summary: "12 alerts · 2 critical · 4 lands" with tiny donut of priority distribution (SVG, no chart lib).
- **Land chips:** become pill cards with crop emoji + name + count + tiny priority-dot stack. Selected state uses gradient ring (`from-primary to-primary/60`) — no blur.
- **Alert card:** single 3-region layout — left rail (4 px priority bar + 36 px icon), middle column (title + LandRef + relative time), right column (round speak button). Message expanded by default; evidence + actions collapse into one row of 32 px chips (`Ask AI`, `Done`, `Share`, `Dismiss`) using `bg-card border border-border` — no per-action color clutter.
- **Critical alerts:** add subtle `ring-1 ring-destructive/40` + 1× soft pulse on first paint (no continuous animation — saves battery).
- **Empty/loading skeletons:** match new card shape; remove generic grey blocks.
- Keep page under 700 lines; no new deps.

### Technical notes
- All new color usage routed through `index.css` tokens; no raw hex.
- Realtime/polling logic untouched (memory: singleton subscription contract).
- No DB / RLS / edge-function changes — purely client read-shape + UI.
- `LandRef` reused as the single sanctioned land renderer.

### Out of scope
- Schema or migration changes.
- Alert generation pipeline.
- Notifications/WhatsApp deep-link payload format.
- Onboarding walkthrough (already redesigned).

### Files touched
- `src/hooks/useProactiveAlerts.ts` — attach resolved `land` object, drop UUID fallback.
- `src/pages/ProactiveAlerts.tsx` — URL-sync filter, `LandRef` usage, layout animation, full visual rebuild with semantic tokens.
- `src/components/home/AlertsSummaryCard.tsx` — deep-link `?landId=` per row.
