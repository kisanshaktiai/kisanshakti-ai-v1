# Market Page — 2030-Ready Mobile Redesign

Redesign `/app/market` as a farmer-first bento-grid experience built on a centralized "Warm Earthy" agricultural theme. Lead with the farmer's own crop price and an AI Sell/Wait decision. Keep all existing data flows, subscription gates, and business logic untouched — this is a presentation-layer rebuild.

## Design direction

- Palette (added as semantic tokens in `index.css` + `tailwind.config.ts`):
  - Terracotta `#c4654a` → primary (action, prices up)
  - Sage `#87a878` → secondary (safe, growth)
  - Sand cream `#faf8f5` → background surface
  - Warm clay `#e8a87c` → accent / highlights
  - Plus semantic `success` (sage), `warning` (amber), `danger` (deep terracotta)
- Typography: keep current display font, bump base size to 16px, headings 22–28px for outdoor readability.
- Tap targets ≥48px; opaque cards (no backdrop-blur, per project core rule); rounded-3xl; soft warm shadows.
- Bilingual labels everywhere (Devanagari first, English secondary) — farmer-friendly, low-literacy safe.

## New layout (bento, mobile-first)

```text
+--------------------------------------------+
| Greeting + location + voice mic            |  Sticky header
+--------------------------------------------+
| HERO: My Crop Today                        |  2x full-width
|  Sugarcane • Nashik Mandi                  |
|  ₹3,250/qtl   +4.2% ↑                      |
|  [ SELL NOW ]  (or WAIT / HOLD)            |
|  AI reasoning chip + confidence            |
+--------------------------------------------+
| Nearby Mandis   | Price Trend              |  2 tiles
| 5 within 50km   | 7-day sparkline          |
+--------------------------------------------+
| Shop Inputs     | My Orders                |  2 tiles
| Seeds/Fert/Pest | 2 active                 |
+--------------------------------------------+
| Sell My Produce (wide CTA tile)            |  Full width
+--------------------------------------------+
| All Crop Prices ticker (horizontal scroll) |
+--------------------------------------------+
```

Tabs (Prices / Shop / Orders / Sell) become deep-link routes opened from tiles instead of a top tab bar — home stays a single scrollable bento.

## What gets built

1. **Theme tokens** — add Warm Earthy HSL tokens to `src/index.css` and `tailwind.config.ts` (semantic only; no hex in components).
2. **`MarketHome.tsx`** — new bento landing component containing the tiles above.
3. **Tile components** (`src/components/marketplace/tiles/`):
   - `MyCropPriceHero` (reuses `useMarketPriceIntelligence` + farmer's primary land/crop)
   - `NearbyMandisTile`
   - `PriceTrendTile` (mini sparkline via recharts already in project)
   - `ShopInputsTile`, `MyOrdersTile`, `SellProduceTile`
   - `PriceTickerStrip` (horizontal scroll of top crops)
4. **`Market.tsx` refactor** — render `MarketHome` by default; existing Shop/Orders/Sell views moved to sub-routes (`/app/market/shop`, `/orders`, `/sell`) reusing current `ProductGrid`, `OrderManagement`, `SellerDashboard` components untouched.
5. **`MarketplaceHeader`** — replaced by a slimmer farmer header with location, language chip, cart icon, and voice mic.
6. **Empty/loading states** — bilingual `EmptyStateCard` reused; skeletons updated to bento shape.
7. **Subscription gating** — `marketplace` and `weather_forecast`/`market` entitlements already enforced by `FeatureRouteGate`; locked tiles show a lock badge linking to `/app/subscription`.

## Out of scope

- No DB schema changes, no edge function changes, no subscription/entitlement logic changes.
- No changes to `MarketPriceIntelligence` internal logic — it's reused inside the hero + tiles.
- Hindi/Marathi/English strings reuse existing `i18n/locales/*/market.json`; new keys added where needed.

## Technical notes

- Use `useLands` to pick farmer's primary crop for the hero; fall back to top mandi crop if none.
- Cache hero price for 5 min via existing edge function pattern; show "Updated 2 min ago" pill.
- All animations via `framer-motion` already in project; respect `useReducedMotion`.
- Files touched: `src/index.css`, `tailwind.config.ts`, `src/pages/Market.tsx`, `src/components/marketplace/MarketplaceHeader.tsx`, new `src/components/marketplace/home/*` and `tiles/*`, `src/i18n/locales/{en,hi,mr}/market.json`.
