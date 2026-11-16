# Market page: correct distances and readable market names

## What is wrong today
- Distance is a straight line, not a road distance, so it does not match travel or transport cost.
- Each market is placed at the average point of all villages in its taluka (or district), not at the market town itself. A market like Vadgaon or Palus can be placed many km away from its real location, so the numbers are wrong (e.g. 53 km shown for nearby markets from Kodoli).
- The farmer's point comes from the land's saved center, which is correct; the error is on the market side and the straight-line method.
- Market name on each price card is small and hard to read.

## What will change
1. **Market placed at its real town**: match the market name to the actual town/village coordinates in the same district first; use taluka/district only as a last fallback, and mark those as "approximate".
2. **Road distance by map**: compute driving distance and travel time from the selected land's center to each market using Google Maps routes. Show "32 km road · 45 min" on cards and sort nearby markets by road distance.
3. **Cost and speed safety**: one batched request per land per day, results saved and reused (land + market pairs), capped number of markets per request, only for signed-in farmers. Straight-line distance is used only if maps are unavailable, labeled "approx".
4. **Readable cards**: market name larger and bolder (theme colors only), distance and time shown as a clear chip under the name.
5. **Optional transport hint**: show estimated trip cost only if a per-km rate exists in your data; no invented rates.

## Needs from you
- Connecting Google Maps (a connect card will appear). Usage is metered by Google; caching keeps calls low.

## Technical details
- `marketGeo.ts`: resolution order village-in-district -> taluka seat village -> taluka centroid -> district; return `via` for precision flag.
- New `roadDistance.ts` in market-price-intelligence: POST `/routes/distanceMatrix/v2:computeRouteMatrix` via connector gateway, field mask `originIndex,destinationIndex,status,condition,distanceMeters,duration`, max 25 destinations, rebuild by indices, in-memory cache keyed by rounded land point + market. No DB changes.
- Response fields: `distance` (road km), `durationMin`, `distanceKind: 'road'|'approx'`.
- `MarketPriceCard.tsx`: name `text-sm font-semibold text-foreground`, distance chip with i18n strings (en/hi/mr).
- Tests: matrix index rebuild, fallback labeling, sort by road distance. Deploy market-price-intelligence; verify Kodoli land against Vadgaon/Kolhapur/Palus values.
