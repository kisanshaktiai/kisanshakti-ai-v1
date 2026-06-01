
## Phase 1 — Reels page fixes

**File:** `src/pages/ReelsPage.tsx`

1. **Back button reliability**
   - `navigate(-1)` fails when Reels is the first history entry (deep link / PWA cold start / external open). Replace with a safe fallback:
     - If `window.history.length > 1` → `navigate(-1)`
     - Else → `navigate('/app/home', { replace: true })`
   - Increase touch target & z-index, ensure `type="button"` and `onTouchEnd` stopPropagation so the snap-scroll container doesn't swallow the tap (current issue on iOS — the absolute top bar sits above the scroller but the button is inside a `pointer-events`-clear gradient).
   - Restore body scroll explicitly inside the back handler before navigating, to prevent the next page from inheriting `overflow: hidden`.

2. **"Open on YouTube" CTA per current video**
   - Add a new pill button next to the back button in the top bar: red YouTube icon + label "YouTube" (i18n key `reels.open_on_youtube`).
   - Tapping opens the **currently active** reel on the official channel:
     - `https://www.youtube.com/watch?v=<reelId>` (mobile deep-links into the YouTube app automatically; falls back to web)
   - Log the action via `track(reel.id, 'open_youtube', { metadata: { source: 'header_cta', user_initiated: true } })`.
   - Also add the same CTA to the bottom info block ("Watch on YouTube channel") with `ExternalLink` icon so it's discoverable while watching.
   - Add i18n entries (`en`, `hi`, `mr`, `pa`, `ta`) for `reels.open_on_youtube` and `reels.watch_on_channel`.

No business-logic changes to engagement tracking (Option A in-app behaviour preserved).

---

## Phase 2 — Analytics: per-land, real-data, mobile-first redesign

### Problems found in `src/pages/Analytics.tsx`

- Shows a single aggregated farm report only — no per-land breakdown.
- Hardcoded magic numbers: `₹25,000/acre income`, `₹10,000/acre expenses`, `125L/acre water`, weather `{ temp: 28, humidity: 65, rainChance: 40 }`, market price seed arrays `[2200, 2250, 2180, 2300, ...]`, soil health string `'Good'`.
- Crop chart uses raw hex/HSL colours, not theme tokens.
- No use of real data already in DB: `schedules`, `weather_current`, `weather_forecast`, `soil_health`, `ndvi_data`, `expense_records`, `market_prices`, `farmer_transactions`.

### New architecture

1. **New data hook** `src/hooks/useAnalyticsData.ts`
   - Inputs: `farmerId`, `tenantId`, `selectedLandId | 'all'`, `dateRange`.
   - Pulls in parallel from real tables (no hardcoded constants):
     - `lands` (area, crop, sowing date, irrigation type) — from `useLands`
     - `schedules` — completion rate, on-time vs delayed, by stage
     - `expense_records` (or `farmer_transactions`) — actual expenses by category
     - `crop_health_assessments` + latest `ndvi_data` — vegetation index trend per land
     - `weather_current` + `weather_forecast` (already cached per land/area) — rainfall & temp trend
     - `soil_health` — pH, N/P/K, organic carbon (per land)
     - `market_prices` — last 30 days for the crops the farmer actually grows
     - `crop_yields` (where present) for revenue estimation; fall back to `market_prices.modal_price × expected_yield_per_acre` from `crops_master` agronomic data, never a flat ₹25k.
   - Returns a typed `LandAnalytics[]` plus a derived `FarmAggregate`. All numbers are computed, never hardcoded.

2. **New report engine** `src/lib/analytics/reportEngine.ts`
   - Pure functions: `computeYieldEstimate(land, ndvi, weather, soil)`, `computeWaterRequirement(crop, stage, area, recentRainfall)`, `computeProfitProjection(expenses, marketPrice, yieldEstimate)`, `computeRiskScore(weather, soil, ndvi)`.
   - Formulas based on real agronomic constants stored in `crops_master` (water requirement L/ha/day, expected yield q/acre, growth duration). No literals in components.

3. **Redesigned page** `src/pages/Analytics.tsx`
   - **Top bar (sticky, compact):** title + date-range chip (7d / 30d / season / year) + export.
   - **Land selector (new):** horizontal scroll of land chips with thumbnail (from `ndvi_data.thumbnail_url` if available) + name + crop + area. First chip = "All Farm". Selecting a land filters every section below. Persisted in URL (`?land=<id>`).
   - **Hero KPI strip:** 4 swipeable cards — Total Area, Active Crops, Projected Revenue, Net Profit (with real ↑/↓ vs previous period).
   - **Sections (collapsible bento cards, theme tokens only):**
     1. *Crop & Stage* — current stage, days-to-harvest, NDVI gauge.
     2. *Water & Weather* — 7-day rainfall bar + irrigation requirement vs actual.
     3. *Soil Health* — N/P/K radar from `soil_health`, last test date.
     4. *Task Performance* — completion %, delayed tasks list with deep links.
     5. *Financial* — expense pie by category (real), revenue projection band, break-even chart.
     6. *Market Pulse* — actual `market_prices` line for the land's crop in the farmer's mandi.
     7. *Recommendations* — derived from `reportEngine` risk score (e.g. "irrigate within 2 days", "spray window closing").
   - **Mobile-first (390px baseline):** single column, snap-scroll horizontal carousels for KPIs, native pull-to-refresh, skeleton states per card (not whole page), reduced-motion respected, all colours via `bg-primary`, `text-foreground`, `bg-card`, `border-border`, `bg-muted` — zero hex/HSL literals.
   - **i18n:** extend existing `analytics.json` (en/hi/mr) with new keys: `analytics.land_selector.*`, `analytics.kpi.*`, `analytics.recommendations.*`, `analytics.empty_land`, units (`unit.acre`, `unit.litre`, `unit.quintal`).

4. **Empty / partial states** — per land, if a data source is missing (e.g. no NDVI yet), the card shows a meaningful empty state with the next action ("Run NDVI scan") instead of fake numbers.

5. **Caching & performance**
   - Use `@tanstack/react-query` keyed by `(farmerId, landId, dateRange)`, `staleTime: 5 min`.
   - Parallel queries via `Promise.all`; lazy-load heavy charts with `lazyWithRetry`.

### Technical details

**New files**
- `src/hooks/useAnalyticsData.ts`
- `src/lib/analytics/reportEngine.ts`
- `src/lib/analytics/formulas.ts` (agronomic formulas, unit conversions)
- `src/components/analytics/LandSelectorRail.tsx`
- `src/components/analytics/KpiStrip.tsx`
- `src/components/analytics/sections/{CropStageCard,WaterWeatherCard,SoilHealthCard,TaskPerfCard,FinancialCard,MarketPulseCard,RecommendationsCard}.tsx`

**Modified**
- `src/pages/Analytics.tsx` — thin composition, no business logic.
- `src/components/skeletons/AnalyticsSkeleton.tsx` — per-card skeletons.
- `src/pages/ReelsPage.tsx` — back button + YouTube CTA.
- `src/i18n/locales/{en,hi,mr,pa,ta}/analytics.json` — new keys.
- `src/i18n/locales/{en,hi,mr,pa,ta}/reels.json` (or merge into existing file) — `reels.open_on_youtube`, `reels.watch_on_channel`.

**Out of scope (will NOT touch)**
- DB schema, RLS, edge functions, theme tokens themselves, subscription gating, AI chat.
- Reels engagement model (still Option A).
- Any analytics calculation will read existing tables only — no migrations.

**Verification**
- Manual: switch lands, switch date range, verify numbers match raw DB rows; confirm back button works on deep-link cold start; YouTube CTA opens the correct video id.
- Type-check + existing tests must pass.
