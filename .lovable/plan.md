# Lands UI Layout Audit & Fix Plan

## Root cause
`src/pages/LandManagement.tsx` builds a **nested scroll container** that conflicts with the global `<main>` scroller in `AppLayout.tsx`:

```
<div className="flex flex-col h-full overflow-hidden">   ← locks page to viewport
  <StatsBar />                                            ← flex-shrink-0
  <div className="flex-1 overflow-y-auto"> … cards …      ← inner scroller
  </div>
  <div className="… py-6 mb-20"> Add Land Button </div>   ← sibling OUTSIDE scroller
</div>
```

Because the outer wrapper is `h-full overflow-hidden` and the cards scroll inside the middle div, the **Add Land button is pinned to the bottom of the viewport** while the cards scroll behind it. On a 390×688 phone this exactly produces the reported symptom — top half shows stat/score chips + cards, bottom half shows the floating "Add Land" button.

`AppLayout.tsx` already provides the correct page scroller (`<main className="pt-14 pb-nav-safe mobile-scroll-container">`), so the page should NOT create its own.

Audit confirmed only `LandManagement.tsx` uses this `flex flex-col h-full overflow-hidden` pattern — no other pages were changed/regressed.

## Fix (single file: `src/pages/LandManagement.tsx`)

1. **Remove the nested scroll wrapper.** Replace the outer `<div className="flex flex-col h-full overflow-hidden">` with a normal block `<div className="pb-6">` that lets `<main>` scroll the whole page naturally.
2. **Drop the inner `<div className="flex-1 overflow-y-auto">`** and render the offline indicator, sticky search bar, and lands grid as direct children of the page.
3. **Keep the search/filter bar sticky** with `sticky top-14 z-10 bg-background/95 backdrop-blur-sm` (top-14 to sit just under the global header) so it remains accessible while the user scrolls.
4. **Make the "Add Land" button flow inline after the last card** — render it inside the same content column directly below the grid/list (remove the trailing `mb-20`; bottom-nav clearance is already handled by `pb-nav-safe` on `<main>`). Keep the centered pill style.
5. **Keep the existing FAB / bottom navigation untouched** — no other components are involved.

## Verification checklist
- On 390×688: stats bar → search → land cards → "Add Land" button all flow in one scroll, button appears under the last card, not pinned mid-screen.
- Bottom nav still clears the button (no overlap) thanks to `pb-nav-safe`.
- Sticky search bar still works while scrolling.
- Desktop grid (`sm:grid-cols-2 lg:grid-cols-3`) unaffected.
- No other pages touched (audit confirmed pattern is unique to this file).
