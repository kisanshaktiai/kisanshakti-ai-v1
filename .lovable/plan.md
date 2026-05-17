# NDVI System — Forensic Audit & 2030-Ready Upgrade Plan

## 1. Audit Findings (Root-Cause Map)

### A. Architecture & Data Flow
- **No ingestion in this repo.** `supabase/functions/` contains zero NDVI/Sentinel processors. The 2,381 rows in `ndvi_data` (33 lands, latest 2026-05-17) come from an external admin pipeline. The farmer app is purely a **consumer** — confirm and document this boundary.
- `useNDVIAnalysis` queries `ndvi_data` directly via `supabaseWithAuth` (custom-token client). Add defensive `tenant_id = tenantId` scoping (parity with `useProactiveAlerts` hardening).
- `useNDVIComparison` exists but is **dead code**. Remove.
- `NDVIAnalysis.tsx` reads `boundary_polygon_old` / `center_point_old` (legacy column names). DB uses `boundary_polygon` / `center_point`. **Map boundary silently breaks.**

### B. Database (Schema Drift & Bloat)
`ndvi_data` has duplicate/conflicting columns from successive migrations:
- `cloud_cover` vs `cloud_coverage`
- `min_ndvi` vs `ndvi_min`, `max_ndvi` vs `ndvi_max`
- `coverage` vs `coverage_percentage`
- `metadata` JSONB overlaps with first-class columns

Related tables:
- `ndvi_data` — primary time-series (keep, dedupe columns).
- `ndvi_micro_tiles` — per-acquisition thumbnails + stats (link via `(land_id, acquisition_date)`).
- `ndvi_spatial_analytics` — confirm orphan; candidate to drop.
- `ndvi_processing_logs`, `ndvi_request_queue`, `satellite_*` — backend/ops only; farmer app must **never** query these.
- `ndvi_full_view`, `ndvi_coverage_stats` — re-point to canonical columns after cleanup.

### C. Scientific Accuracy
- `getScientificRiskLevel` uses trend units (`< -0.005`) without a defined contract. Define explicitly: **trend = ΔNDVI per day** over last N reliable observations.
- `calculatePrediction` does linear extrapolation with a fabricated confidence formula. **Hallucination risk** — relabel as "Indicative Projection", not "AI Prediction"; require `valid_observations >= 4` AND ≥4 reliable rows.
- **Cloud-contamination filter missing** — predictions/current must ignore rows where `cloud_coverage > 30%` OR `quality_score < threshold` OR `coverage_percentage < 60%`.
- **No crop-stage awareness** — 0.45 NDVI is "moderate" generically but excellent for sugarcane germination. Add stage-aware overlay using `crop_stages` + land's `current_growth_stage`.

### D. UI / UX (current 778-line file)
- 5 tabs (`Health/Predict/Map/Trends/Advice`) — too heavy at 390px.
- Land selector is a full-screen list; doesn't match the horizontal `LandCard` rail used in AI Chat & Proactive Alerts.
- "AI Recommendations" / "AI Prediction" badges are misleading (no LLM in flow).
- Hard-coded `text-emerald-500`, `text-blue-500` — violates design-token rule.

### E. AI / Anti-Hallucination
- No LLM involved. All "AI" labels are rule-based — rename to "Trend Projection" / "Guided Actions".
- Advice strings hardcoded in English in `useNDVIAnalysis`. Move to i18n keys (`en/hi/mr`).

### F. Performance
- `refetchInterval: 60000` on satellite data (revisit every 3–5 days) is wasteful. Switch to `staleTime: 6h`, `refetchOnWindowFocus: false`, manual refresh only.
- Map tab loads Google Maps even when no boundary exists — guard.
- Wire `localDB` as offline fallback (already synced).

### G. Security
- Direct `client.from('ndvi_data')` relies entirely on RLS. Add explicit `.eq('tenant_id', tenantId)`; verify the RLS policy includes tenant + land-ownership join.

---

## 2. NDVI MAP VIEW — World-Class Scientific Heatmap (NEW)

The current `NDVIMapView` is a basic Google Maps boundary + marker. Replace with a **scientifically accurate, mobile-first, pixel-level NDVI heatmap** that farmers can read instantly and scientists can trust.

### 2.1 Rendering Engine
- Use **MapLibre GL JS** (vector, free, no Mapbox key) on top of an **ESRI World Imagery** satellite base raster. Reasons:
  - Hardware-accelerated WebGL → smooth 60fps pan/zoom on Android mid-range.
  - Vector tiles + custom raster layers in a single canvas (Google Maps cannot composite custom rasters cleanly).
  - Open-source, MIT-aligned, no per-tile billing.
- Keep `GoogleMapsScriptProvider` only for places search / geocoding; map rendering moves to MapLibre.

### 2.2 Data Source for the Heatmap
Three rendering modes, picked automatically based on data availability per land:

| Mode | Data source | Visual | When used |
|---|---|---|---|
| **A. Pixel raster** | `ndvi_micro_tiles.ndvi_thumbnail_url` (PNG/GeoTIFF) clipped to `boundary_polygon` | True per-pixel NDVI heatmap at 10–20m resolution | Latest reliable acquisition exists |
| **B. Zonal mosaic** | `ndvi_micro_tiles.{ndvi_min, ndvi_mean, ndvi_max, ndvi_std_dev}` → render boundary as a single fill with the **standard NDVI color ramp** | Field-level health fill | Stats exist but no thumbnail |
| **C. Boundary only** | `boundary_polygon` only | Outlined polygon + "No satellite data yet" overlay | No reliable data |

The renderer auto-detects per land which mode to use; never invents pixels.

### 2.3 Scientific Color Ramp (single SSOT)
Use the **standardized NDVI palette** (NASA/ESA convention), defined once as HSL design tokens in `index.css`:

```text
< 0.0    : #B25C2C   bare soil / built-up / water
0.0–0.2  : #D9B26E   critical (dead/very sparse)
0.2–0.35 : #FFD166   poor
0.35–0.50: #C7E27A   moderate
0.50–0.65: #5DBB63   healthy
0.65–0.80: #2E8B3D   excellent
>= 0.80  : #1B5E20   peak vegetation
```
Render as continuous gradient (not bucketed) so subtle differences are visible. The same ramp is used everywhere (legend, ring, badges, sparkline, thumbnail) — single source of truth, no drift.

### 2.4 Map UI / UX (mobile-first, 2030)
- **Full-bleed map** (top: 30px header peek, bottom: 96px overlay sheet, edges: 0).
- **Bottom glass overlay sheet** (draggable, snaps at 96px / 220px / 70vh):
  - Snap 1 (peek): land name · latest reliable date · mean NDVI pill · cloud/quality micro-badges.
  - Snap 2 (mid): adds inline 30-day sparkline (same color ramp), stage-aware status line, primary CTA "Open AI Chat".
  - Snap 3 (expand): Field Statistics (min/mean/max), per-pixel histogram, valid-pixel %, advice list.
- **Top-right vertical toolbar** (44px tap targets):
  - Layer toggle: NDVI / NDWI / EVI / SAVI (only enabled when data exists for that index).
  - Opacity slider (heatmap transparency over satellite base).
  - Compare slider: drag to compare two dates side-by-side using a Mapbox/MapLibre swipe-compare.
  - Locate-me (uses `useLocation`).
  - Fullscreen.
- **Date scrubber** above the bottom sheet: horizontal timeline of reliable acquisition dates (chips). Tapping a chip swaps the raster instantly; unreliable dates rendered grey/disabled with cloud icon. This is the time-series-aware NDVI comparison the audit demands.
- **Anomaly markers**: small pulse dots on the map where `(pixel_ndvi - mean_ndvi) < -2 * ndvi_std_dev` (only when raster mode A is active). Tap → mini popover with coordinate, value, deviation. Pure math; no AI guess.
- **Legend**: small bottom-left chip; tap expands a vertical gradient bar with thresholds and a one-line scientific explanation pulled from `NDVI_INTERPRETATION`.

### 2.5 Strict Accuracy Rules (zero hallucination)
- **Never** display NDVI values from rows that fail the reliability filter (cloud > 30 OR coverage < 60 OR quality_score below floor). Show "Stale: last clean reading X days ago" banner instead.
- **Never** interpolate between dates. If the user picks a date with no data, the heatmap is empty + a clear "No clean observation on this date" message.
- **Never** show predictive overlays on the map (predictions live only in the Trend view, clearly labelled "Indicative Projection").
- **Always** display data provenance on tap: satellite_source, scene_id, processing_level, spatial_resolution, computed_at.
- **Always** clip rendered raster strictly to the land polygon (no neighbouring land's pixels visible).
- **Always** show the legend so a farmer/agronomist can decode any color on screen.

### 2.6 Performance
- Lazy-load MapLibre + heatmap shaders only on Map tab.
- Raster textures cached in IndexedDB via existing `localDB` (offline-first; rural networks).
- Limit to last 12 reliable acquisitions in scrubber by default; "Load older" on demand.
- Use `requestIdleCallback` for histogram/anomaly computation.

---

## 3. Database Migration (single migration)

```text
1. Canonicalise ndvi_data columns:
     keep cloud_coverage, min_ndvi/max_ndvi/mean_ndvi/median_ndvi/ndvi_std, coverage_percentage
2. Backfill from deprecated columns (UPDATE ... COALESCE ...).
3. Drop: cloud_cover, ndvi_min, ndvi_max, coverage.
4. Create view ndvi_data_clean = rows passing reliability filter.
5. Index: (tenant_id, land_id, date DESC) — confirm or create.
6. Verify RLS policy on ndvi_data enforces tenant + land ownership.
7. Drop ndvi_spatial_analytics if zero references confirmed.
```
(Confirm with user before destructive drops.)

---

## 4. Code Changes

### 4.1 `src/lib/ndviScience.ts`
- Add `isObservationReliable(row)`, `computeTrendPerDay(history)`, `getStageAwareStatus(ndvi, crop, stageDays)`.
- Add NDVI color ramp utilities (HSL tokens + gradient stops) — single SSOT for map, ring, badges.
- Document units everywhere.

### 4.2 `src/hooks/useNDVIAnalysis.ts`
- Defensive `.eq('tenant_id', tenantId)`.
- Filter unreliable rows; `current` = most recent reliable.
- Return advice as i18n keys, not English.
- Remove `useNDVIComparison`.
- `refetchInterval: false`, `staleTime: 6h`.
- Gate `prediction` on `valid_observations >= 4` AND `history.length >= 4`.
- Offline fallback via `localDB.getNDVIByLand(landId)`.
- Add `useNDVIMicroTiles(landId)` hook returning reliable acquisitions with `bbox`, `ndvi_thumbnail_url`, stats — feeds the new map.

### 4.3 `src/pages/NDVIAnalysis.tsx` — 2030 Redesign
- Replace land selector with horizontal `LandCard` rail (matches AI Chat / Proactive Alerts).
- Collapse 5 tabs → **3 segments**: `Now` | `Trend` | `Map`. Advice merges into `Now`; Prediction merges into `Trend` as "Indicative Projection".
- 32px header; compact 96px hero ring; vital strip (NDVI · NDWI · Quality · Cloud%) using only semantic tokens.
- Reliability banner when latest fails filter.
- Stage-aware interpretation line under ring.

### 4.4 `src/components/land/NDVIMapView.tsx` — Rebuild
- Swap Google Maps → **MapLibre GL JS** + ESRI World Imagery base.
- Implement the three render modes (raster / zonal / boundary-only).
- Bottom glass sheet (3 snap points), top-right toolbar, date scrubber, legend, anomaly markers, compare-swipe.
- Strict accuracy rules from §2.5.

### 4.5 i18n
- Extend `ndvi.json` (en/hi/mr): `map.*`, `reliability.*`, `stage_aware.*`, `projection.*`, `actions.*`, `legend.*`, `provenance.*`, `data_trust.*`.

### 4.6 Memory
- Add `mem://ndvi/ndvi-system-contract`: app is consumer-only; canonical columns; reliability filter rule; single NDVI color ramp SSOT; map render-mode auto-selection; never interpolate; never show predictive overlays on map; provenance always available on tap.

### 4.7 Dependencies
- Add `maplibre-gl` and `@maplibre/maplibre-gl-style-spec`. Lazy-loaded in Map view only.

---

## 5. Out of Scope
- Satellite ingestion edge function (lives in admin app).
- RLS structural changes beyond verification.
- Real ML forecasting (projection stays linear + clearly labelled).

---

## 6. Verification
- 390x688 viewport: rail switches lands, map renders raster when available else zonal fill else boundary-only; legend matches ramp; reliability banner appears on stale data; date scrubber switches rasters without flicker.
- Compare-swipe shows two dates correctly clipped to boundary.
- Console: no reads of legacy columns (`ndvi_min`, `cloud_cover`).
- Offline: cached rasters render from IndexedDB; no crash.
- Build passes; i18n keys present in en/hi/mr.

---

## 7. Open Questions
1. Confirm admin pipeline writes `cloud_coverage` going forward — safe to drop `cloud_cover`?
2. Is `ndvi_spatial_analytics` consumed elsewhere — safe to drop?
3. Priority crops for stage-aware thresholds in v1 (sugarcane only, or top 3)?
4. Are `ndvi_micro_tiles.ndvi_thumbnail_url` images publicly accessible (CDN/Storage public bucket) or do they need a signed-URL edge function?
