
## Market Page — Farmer-First Redesign

Goal: make `/app/market` feel like one cohesive, big-thumb, low-literacy-friendly screen that uses the full mobile viewport, while keeping the 4 main tabs (Prices, Shop, Orders, Sell) equally accessible. Density target: ~3–4 price cards visible per phone screen.

### Scope

Everything under `src/pages/Market.tsx` and `src/components/market-intelligence/*` plus `src/components/marketplace/MarketplaceHeader.tsx`, `CategoryFilter.tsx`, and the `MarketPriceCard`. No business logic / data hooks change — purely presentation.

### Design system (semantic tokens only)

- Use existing `--primary`, `--accent`, `--success`, `--card`, `--muted`, `--border` tokens. No hex / `bg-white`.
- Replace `backdrop-blur-xl` with opaque `bg-card` (core memory: opaque BGs on mobile for FPS).
- Type scale: crop name `text-lg font-bold`, price `text-2xl font-extrabold tabular-nums`, meta `text-xs text-muted-foreground`.
- Spacing: `px-4` page gutter on mobile, `px-6 md:px-8` ≥768px. Edge-to-edge filter rails use horizontal scroll with `-mx-4 px-4` bleed.
- Touch targets: minimum `h-12` for primary chips/buttons; price card whole-card tappable.

### Page shell (`src/pages/Market.tsx`)

1. Sticky top bar (`sticky top-0 z-30 bg-background/95`) holding compact title + cart icon + search-toggle icon. Search collapses into a sheet to reclaim space.
2. The 4-tab nav becomes a **segmented icon+label pill bar** under the header, full-width, equal flex, `h-14`, with bottom-aligned active indicator (no glassy gradient). All four tabs equally weighted.
3. Tab content area expands to `w-full max-w-screen-md mx-auto` so layouts breathe on tablet but stay edge-to-edge on phone.

### Prices tab redesign (`MarketPriceIntelligence.tsx`)

- Drop the inner 4-tab sub-nav. Replace with a **single scrollable feed** containing stacked sections:
  - Filter rail (chips for crop group + market, horizontal scroll, sticky under header).
  - Selected-crop summary card (big price, trend arrow, district, AI advice button if crop selected).
  - "Today's prices" list (grouped by date, large readable cards).
  - "Markets near me" horizontal card carousel (uses existing `NearbyMarketsSection` data).
  - "Price trend" mini chart (uses `PriceComparisonChart` data, collapsed by default).
  - "AI selling advice" panel (uses `AISellingAdvisor`, surfaces only when crop selected).
- Removes filter accordion noise; chips ARE the filter.
- Floating action button: "AI Advice" anchored bottom-right above bottom nav, only when crop selected.

### Price card redesign (`MarketPriceCard.tsx`)

Two-row layout, edge-to-edge:

```text
┌────────────────────────────────────────┐
│ 🌾 कांदा (Onion)              ↑ +4%   │
│ ₹2,450 / क्विंटल                       │
│ पुणे APMC • 25 मे                      │
└────────────────────────────────────────┘
```

- `rounded-2xl`, `p-4`, `bg-card`, hairline `border-border/60`.
- Trend badge color uses `success` / `destructive` tokens.
- Whole card is a button — taps open detail/comparison.

### Filter components

- `CropGroupButtons` / `MarketLocationButtons`: convert to single-row horizontal scroll chips, `snap-x`, `h-12`, large icon + Devanagari label above small English. Active state = filled primary; inactive = `bg-muted`.
- `CropChips`: same chip styling, wrap on tablet, scroll on mobile.

### Shop / Orders / Sell tabs

- `MarketplaceHeader`: collapse to slim sticky search bar (icon-only cart + bell), drop oversized padding. Becomes optional — only shown on Shop tab.
- `CategoryFilter`: switch to chip row matching crop-group chips for visual consistency.
- `ProductGrid`: keep, just verify it uses `grid-cols-2` on mobile, `grid-cols-3 md:grid-cols-4` from `sm`.
- Empty states (Orders/Sell when logged out, Shop when no products): use the existing `EmptyStateCard` but with larger illustration area and a single primary CTA button (`h-12 rounded-2xl`).

### Files to edit

- `src/pages/Market.tsx` — shell, sticky header, tab bar, layout container.
- `src/components/market-intelligence/MarketPriceIntelligence.tsx` — flatten inner tabs into one scroll feed.
- `src/components/market-intelligence/MarketPriceCard.tsx` — typography + layout rewrite.
- `src/components/market-intelligence/CropGroupButtons.tsx` — chip rail.
- `src/components/market-intelligence/MarketLocationButtons.tsx` — chip rail.
- `src/components/market-intelligence/CropChips.tsx` — chip styling alignment.
- `src/components/market-intelligence/NearbyMarketsSection.tsx` — horizontal carousel variant for embedded use.
- `src/components/market-intelligence/PriceComparisonChart.tsx` — collapsible card wrapper.
- `src/components/market-intelligence/AISellingAdvisor.tsx` — embedded card style (no own tab).
- `src/components/marketplace/MarketplaceHeader.tsx` — slim search bar.
- `src/components/marketplace/CategoryFilter.tsx` — chip styling parity.

### Non-goals

- No data, hook, RPC, or edge-function changes.
- No new translations keys beyond reusing existing `market.intelligence.*`.
- No subscription/entitlement changes.

### Verification

- View `/app/market` at 390×688 (current viewport) — confirm header + tabs + first 3 price cards visible without scroll.
- Confirm horizontal chip rails don't overflow page gutters.
- Switch each of the 4 top tabs and confirm content layout consistency.
- Confirm no `backdrop-blur` remains on price surfaces (FPS rule).
