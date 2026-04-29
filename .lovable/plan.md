## Root Cause Analysis

### Issue 1 — Save & Back buttons hidden behind bottom navigation
The route `/app/lands/add` is rendered inside `AppLayout`, which always shows the global `BottomNavigation` (~64px tall, `fixed bottom-0`). The map drawer's controls in `MapControls.tsx` use `absolute bottom-0 left-0 right-0`, so they're pinned to the **map container's** bottom — which sits behind the global bottom nav. The header (`fixed top-0`) similarly overlaps the map's "Back" arrow. Result: Save Boundary, Undo, Clear, and Back are all clipped by/under the home–community–scan–analytics–profile bar shown in the screenshot.

`AppLayout.tsx` only treats `ai-chat` and `community` as `isFullScreenRoute` — `lands/add` is not in that list, so nav and header still render.

### Issue 2 — Boundary points not draggable / not editable
In `GoogleMapBoundaryDrawer.tsx`:
- The corner markers (lines 644–656) are plain `<Marker>` components with **no `draggable` prop** and no `onDragEnd` handler.
- The `<Polygon>` itself (line 660) is created with `editable: false, draggable: false` (lines 442–443 of `polygonOptions`). Google Maps therefore renders no edit handles, and farmers cannot move points to refine the field shape.

There is also no "long-press to delete a single point" or visual hit-area large enough for a fingertip (current marker `scale: 6` ≈ 12px diameter — below the 44px touch target standard).

---

## Fix Plan — Mobile-First 2030-Ready Map UI

### A. Make Add-Land a true full-screen route
1. In `src/components/AppLayout.tsx`, extend `isFullScreenRoute` to also include `/app/lands/add` and `/app/lands/:id/edit` (when in the boundary-draw step). This hides the global header + bottom navigation while drawing, giving the map the entire viewport.
2. Add a small safety: in `AddLand.tsx`, while `showMap === true`, set `document.body.dataset.fullscreen = 'map'` so any residual overlays (FAB, voice button) can be CSS-hidden via `body[data-fullscreen='map']`.

### B. Reposition map chrome above safe areas (defense-in-depth)
Even with full-screen mode, account for iOS notch / home-indicator:
- `MapControls` bottom container: change to `absolute bottom-0 ... pb-[max(env(safe-area-inset-bottom),12px)]`.
- Back button: `top-[max(env(safe-area-inset-top),16px)]`.
- Floating "center on me" + zoom: shift to `bottom-[calc(env(safe-area-inset-bottom)+96px)]` so they sit above the action bar.

### C. Make boundary points draggable + the polygon editable
In `GoogleMapBoundaryDrawer.tsx`:
1. Add a new handler:
   ```ts
   const handleMarkerDragEnd = (index: number, e: google.maps.MapMouseEvent) => {
     if (!e.latLng) return;
     const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
     setBoundary(prev => prev.map((p, i) => (i === index ? next : p)));
   };
   ```
2. Update the corner `<Marker>` (lines 644–656):
   - `draggable={mode === 'draw'}`
   - `onDragEnd={(e) => handleMarkerDragEnd(index, e)}`
   - Increase `scale` from 6 → 11 (≈22px) and add a transparent 44×44 hit-area via a custom SVG `path` so fingertips can grab it.
3. Update `polygonOptions` (lines 435–446):
   - `editable: true` once `boundary.length >= 3` (memo dependency added).
   - Listen for `onMouseUp` on the polygon to read the path back into `boundary` state — this enables drag-to-add midpoint vertices, which is the standard Google Maps editable-polygon UX.
4. Long-press on a point → remove it: add `onRightClick` (Google Maps maps right-click to long-press on touch) calling `setBoundary(prev => prev.filter((_, i) => i !== index))`.

### D. 2030-ready visual polish (mobile-first)
1. Replace the gradient action bar with a glass card pinned to bottom: rounded-t-2xl, `bg-background/80 backdrop-blur-xl`, soft shadow, 16px padding, `pb-safe`.
2. Larger primary CTA: full-width "Save Boundary" pill (h-12, font-semibold), with a subtle pulse when `canSave && !validationError`.
3. Add a slim top pill showing `4 बिंदू • 0.430 एकर` always visible (currently hidden behind the AreaDisplay card overlapping the back button — see screenshot). Move `AreaDisplay` from top-left to a centred top pill below the safe area.
4. Add haptic feedback on point-add, point-drag-end, undo, and save (`navigator.vibrate?.(10)` — already used elsewhere via `@/lib/haptics`).
5. Mode switcher → segmented control style (single rounded container, sliding indicator) instead of two separate buttons.

### E. Files to edit
- `src/components/AppLayout.tsx` — extend `isFullScreenRoute`.
- `src/pages/AddLand.tsx` — set body fullscreen flag while map is open.
- `src/components/land/GoogleMapBoundaryDrawer.tsx` — draggable markers, editable polygon, polygon path sync, reposition AreaDisplay/center button with safe-area insets.
- `src/components/land/MapControls.tsx` — glass card, segmented mode switch, safe-area padding, larger CTA, haptics.
- `src/components/land/AreaDisplay.tsx` — restyle to centred top pill.

### Acceptance criteria
- Save Boundary, Undo, Clear, Back are fully visible and tappable on iPhone (notch + home indicator) and Android.
- Tapping and dragging any numbered point smoothly updates the polygon and recalculates area live.
- Dragging an edge midpoint inserts a new vertex (Google's native editable-polygon behaviour).
- Long-press on a vertex removes it.
- Bottom navigation does NOT appear while the map is open.
- All controls respect `env(safe-area-inset-*)`.
