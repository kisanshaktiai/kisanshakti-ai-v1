# Make the NDVI map image visible and farmer-friendly

## What will change
- Keep the existing NDVI, water, and pest data sources unchanged.
- Add a reliable on-screen image layer so the downloaded crop-health PNG remains visible even when the phone cannot render the interactive map canvas.
- Clip the crop-health image to the saved field boundary and retain the real satellite basemap underneath when available.
- Simplify map controls into large, clearly labelled touch targets and prevent controls from covering the field image.
- Preserve the current three choices: Crop health, Water, and Pest.

## Verification
- Confirm the signed image request succeeds and the image element has loaded dimensions.
- Check the map at the current mobile size and on desktop.
- Confirm field switching, layer switching, centering, details, and fullscreen remain usable.

## Technical details
- Frontend-only change in the NDVI map presentation and its existing translations.
- No database, agronomy, threshold, schedule, or edge-function changes.
