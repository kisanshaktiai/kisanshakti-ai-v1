# NDVI & satellite visibility — forensic findings and fix plan

All findings below were confirmed by direct queries against the live database and storage, and by reading the app code. No assumptions.

## What I verified (evidence)

**1. Satellite pictures can never be shown to a logged-in farmer — permission rule is broken.**
The read rule on the private image stores (`ndvi-thumbnails`, `ndvi-rasters`) checks the field list using the *field's own name* instead of the *file's folder path*. Tested live: that condition is false for every row in the table (`buggy_branch_ever_true = false`), and the rule's only other branch requires "no farmer signed in". So a signed-in farmer is refused every image. This alone blanks the map picture, the water-trace picture, and any thumbnail.

**2. The water-trace picture exists but the record never points at it.**
For this farmer's fields, every `surface_water_trace` row has an empty image reference, while the matching PNG file is present in storage (2 files per field per date, e.g. `.../30197c15.../water/2026-09-12_..._surface_water_trace.png`). The companion "canopy moisture" rows do carry the reference. So the panel says "evidence exists but the image is unavailable" even though the image is right there.

**3. Field thumbnails are not stored on the field record.**
All three fields have an empty `ndvi_thumbnail_url`, although `ndvi_data` rows for 2026-09-12 and 2026-09-05 do carry valid image paths. The map's preferred picture source is therefore usually empty.

**4. "No data" is shown even when data exists.**
The NDVI page opens on the first field in the list. `NewLand` has zero satellite readings, so the page shows an empty state while Shinghan Mal (NDVI 0.772, 2026-09-12) and Kodoli Mala (0.474, 2026-09-05) do have fresh readings.

**5. Trend can never render.**
Within the 45-day window each field has 2 readings but only 1 passes the freshness gate, and the trend view needs at least 2 — so it permanently reports "not enough observations".

**6. Pest trace imagery does not exist anywhere.**
`satellite_imagery` and `satellite_alerts` are empty (0 rows). The layer catalogue contains only `surface_water_trace`, `canopy_moisture_signal`, `radar_moisture_change_signal` — there is no pest layer, no pest images, no producer writing them. A pest map cannot be shown from satellite data today; I will not fabricate one.

## Fixes

1. **Repair the image permission rule** (migration): rewrite the `ndvi-thumbnails` and `ndvi-rasters` read policies so the tenant and field are taken from the file's own folder path, keeping the same isolation intent — a farmer may read only files under their own tenant folder and their own field folder, tenant must be active. No other policy touched.

2. **Reconnect the water-trace images** (migration, data only): fill the missing image reference on `surface_water_trace` rows from the matching file already in storage (exact tenant/field/date/scene/layer name match). Rows with no matching file stay empty.

3. **Keep the field record in sync**: fill `lands.ndvi_thumbnail_url` / date from each field's latest reading that has an image, so the map has a reliable fallback.

4. **One easy map view with layer switching** (`NDVIMapView`): add a small layer switcher on the map — Crop health (NDVI), Surface water trace, Canopy moisture — each drawn as an overlay clipped to the field boundary, with the existing opacity slider and date strip applying to the selected layer. Selecting a layer with no image for that date shows a plain "no image for this date" note instead of a blank map.

5. **Honest pest panel**: in place of a fake pest layer, the map's pest entry shows the field's existing pest/disease findings from the crop-scan and alert records, and states clearly when no satellite pest layer is available.

6. **Field selection and empty states** (`NDVIAnalysis`): open on the most recent field that actually has a reading, mark fields without data in the picker, and change the empty state to name which of the farmer's fields do have readings.

7. **Trend**: build the trend from all reliable readings in a 90-day window rather than the 45-day slice, so two-point trends appear where the data supports them.

## Technical notes

- Migrations: one policy-repair migration, one idempotent backfill (water `image_path`, `lands.ndvi_thumbnail_url`). No schema changes, no new tables.
- Frontend: `src/components/land/NDVIMapView.tsx`, `src/pages/NDVIAnalysis.tsx`, `src/hooks/useNDVIAnalysis.ts`, `src/hooks/useSatelliteWaterLayers.ts` (switch to the authenticated client used elsewhere, add layer-code parameter).
- No edge function deployment is required for these fixes; no change to schedule generation, agronomy rules, or thresholds.
- Verification: re-run the storage-policy predicate against real object paths, confirm signed URLs mint for this farmer's files, confirm the water rows resolve, then typecheck.
