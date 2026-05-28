## NDVI Map — Bugs Found (Deep Audit)

Inspected `src/pages/NDVIAnalysis.tsx`, `src/components/land/NDVIMapView.tsx`, `src/hooks/useNDVIAnalysis.ts`, the `ndvi_data` table, and the live screenshot.

### Bug 1 — Thumbnail never changes when farmer taps a different date
Root cause is in the data, not the code. `ndvi_data.image_url` for a single land is the **same PNG (`<land_id>.png`)** for every date row — the daily pipeline overwrites one file per land instead of producing one file per acquisition.

```
2026-05-28  ndvi 0.078  → e29658…dd9.png
2026-05-27  ndvi 0.078  → e29658…dd9.png   ← same URL
2026-05-26  ndvi 0.511  → 3b10c8…797.png   ← only changes when scene_id changes
2026-05-26  ndvi 0.078  → e29658…dd9.png
```

So the UI is technically correct (it re-binds the URL), but the URL string doesn't differ → image looks identical. Two related issues compound this:
- The browser caches the PNG (no cache-buster), so even when a different land row legitimately points to a different file, repeat visits look frozen.
- We have multiple `ndvi_data` rows per date (one per scene_id). We pick whichever comes first instead of the freshest, highest-quality scene for that day.

### Bug 2 — Bottom sheet covers the value chip
`sheetHeights = ['56px', '200px', '70vh']`. Peek (56px) only fits the drag handle; the value row (`0.46 · मध्यम आरोग्य · 10.95 ac · Sugar…`) is rendered inside that 56px region, so it gets vertically clipped at the bottom edge — visible in the screenshot.

### Bug 3 — Broken i18n placeholder on cloud badge
`hi/ndvi.json` → `"cloud": "बादल {{value}}%"`, but the code calls `t('ndvi.map.cloud', 'Cloud') + ' ' + cloud.toFixed(0) + '%'` with no interpolation, producing `ढग {{value}}% 0%` (visible top-right of the sheet).

---

## Fixes

### `src/components/land/NDVIMapView.tsx`
1. **Per-date thumbnail key** — derive a stable URL with a date-based cache-buster so the `<img>` and the MapLibre raster source actually re-mount when the user scrubs dates:
   ```ts
   const activeThumbnailUrl = useMemo(() => {
     const base = normalizeNdviAssetUrl(active?.raw?.image_url)
       ?? normalizeNdviAssetUrl(processingThumbnail?.url)
       ?? normalizeNdviAssetUrl(landThumbnailUrl);
     if (!base) return null;
     const v = active?.date ?? '';                      // forces re-fetch per date
     return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`;
   }, [active, processingThumbnail, landThumbnailUrl]);
   ```
2. **Force MapLibre source replacement** when activeDate changes (currently we only re-add if `activeThumbnailUrl` string differs; with the cache-buster the string now differs each tap).
3. **Bottom-sheet peek height** → `'92px'` so the value row, status label, and cloud badge are fully visible at rest. Sheet snaps become `['92px', '220px', '70vh']`.
4. **Cloud badge i18n** — pass interpolation value and drop the manual `%`:
   ```tsx
   {t('ndvi.map.cloud', 'Cloud {{value}}%', { value: Math.round(current.cloud_coverage ?? 0) })}
   ```
5. **Map container** — switch from `h-[calc(100vh-180px)]` to `h-[calc(100dvh-200px)]` and bump peek-aware bottom padding for the date scrubber so the scrubber rides above the new 92px peek without clipping pills.

### `src/hooks/useNDVIAnalysis.ts`
- **Deduplicate same-day rows** keeping the row with the highest `quality_score` (fallback to highest `coverage_percentage`, then lowest `cloud_coverage`). This ensures the date pill picks the *best* scene of that day, not a duplicate copy.
- Apply the same dedupe before building `history` (so the trend chart is one point per day).

### `src/i18n/locales/{en,hi,mr}/ndvi.json`
- Confirm `ndvi.map.cloud` keeps `{{value}}` placeholder — no string changes needed once interpolation is fixed.

### Out of scope (server side, do not touch in this UI fix)
The real long-term fix for "same PNG every day" lives in the satellite ingestion edge function — it should write `<land_id>/<acquisition_date>.png` (one PNG per scene) and store that URL in `ndvi_data.image_url`. I will flag this in the report but not modify backend code in this task.

---

## Short Report — How to Fine-Tune the Map for Farmer Accuracy

1. **One PNG per acquisition (backend).** Store `ndvi-thumbnails/<land_id>/<YYYY-MM-DD>_<scene_id>.png` so date scrubbing genuinely shows that day's satellite snapshot instead of the latest overwrite.
2. **Clip raster to polygon, not bbox.** Today we use a CSS clip-path on the `<img>` overlay (good) but the MapLibre raster source uses the bbox. Add a `fill` layer with the polygon as a mask layer (`raster` + `fill` with `fill-opacity: 1` outside the polygon in background color) so non-field pixels never bleed in.
3. **Same-day dedupe + best-scene selection.** Prefer rows with `quality_score ≥ 0.7`, `cloud_coverage ≤ 20%`, `coverage_percentage ≥ 80%`; collapse duplicates.
4. **Continuous NDVI palette enforced server-side.** Lock the PNG renderer to the NASA/ESA stops we use in `ndviScience.ts` so the legend matches pixels exactly (currently the PNG uses its own palette, the legend is approximate).
5. **Show pixel-true min/mean/max from `ndvi_std`, `min_ndvi`, `max_ndvi`** in the peek sheet — already wired, just always visible at snap 0 so farmers see the real range, not a single number.
6. **Stage-aware reference line.** Tag each reading with the crop stage (we already compute `stageAware`) and show ⚠️ when NDVI deviates > 0.10 from the stage-expected band — gives farmers an actionable signal, not just a color.
7. **Cloud / coverage gate.** Hide any pixel from rows where `cloud_coverage > 30%` or `coverage_percentage < 70%`; show the next clean date instead. (Today's `isObservationReliable` does this for stats but not for the raster.)
8. **Cache-bust + ETag.** Cache-bust by acquisition date (this fix) and have the storage object respect ETag so the second visit is fast but never stale.
9. **Tile pyramid for big fields.** For lands > 5 acres, switch from a single PNG to Sentinel-2 COGs served as `raster-dem`-style tiles → sub-meter sharpness on zoom.
10. **Confidence badge per date pill.** Color the date pill border by quality_score so the farmer instantly knows which dates are trustworthy.

After approval I will implement Bugs 1–3 only; items 1, 2, 4, 9 require backend changes I will surface but not execute in this round.
