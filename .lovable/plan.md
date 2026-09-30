# Correct My Land thumbnail wiring

## Findings
- The My Land grid passes `lands.ndvi_thumbnail_url` into the general land thumbnail component.
- That database field points to vegetation-analysis PNGs in the `ndvi-thumbnails` bucket, so an NDVI image can replace the normal land view.
- The component already has the correct non-NDVI path: a satellite map centered on the saved boundary, with the exact parcel outline and an offline boundary fallback.

## Surgical fix
1. Stop supplying `ndvi_thumbnail_url` from My Land cards.
2. Keep NDVI imagery restricted to NDVI/analytics screens; do not change NDVI records, storage, processing, or land data.
3. Update misleading thumbnail comments/types so this incorrect wiring is not reintroduced.
4. Verify the My Land grid uses each parcel's saved boundary/center and check the mobile view and build diagnostics.

## Technical scope
- Expected files: `src/components/land/ModernLandCard.tsx` and, only if needed for accurate documentation, `src/components/land/LandThumbnail.tsx`.
- No database migration, edge-function deployment, visual redesign, or agronomy change.
