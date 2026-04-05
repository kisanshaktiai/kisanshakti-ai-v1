

# Production Audit & Fix Plan: KisanShaktiAI V6

## Critical Findings

### Finding 1: Circular Chunk `ui-forms -> ui-vendor -> ui-forms` (P0 — Build/Runtime)

**Root Cause**: The `manualChunks` function routes `@radix-ui/*` to `ui-vendor` and `lucide-react` to `lucide`. But `src/components/ui/checkbox.tsx` and `src/components/ui/radio-group.tsx` import BOTH. Rollup can't place these source files in either chunk, so it creates a phantom `ui-forms` chunk that cross-references both — causing the circular dependency warning and potential runtime crashes.

**Fix**: Add explicit routing for `src/components/ui/checkbox`, `src/components/ui/radio-group`, `src/components/ui/switch`, and `src/components/ui/slider` source files into `ui-vendor` in the `manualChunks` function. This collapses the phantom chunk.

```typescript
manualChunks(id) {
  // Route UI form wrapper components into ui-vendor to prevent circular chunks
  if (id.includes('src/components/ui/checkbox') ||
      id.includes('src/components/ui/radio-group') ||
      id.includes('src/components/ui/switch') ||
      id.includes('src/components/ui/slider')) return 'ui-vendor';
  if (id.includes('@radix-ui/')) return 'ui-vendor';
  // ... rest unchanged
}
```

### Finding 2: No ScrollToTop Component (P0 — Mobile UX)

**Root Cause**: `createBrowserRouter` with `RouterProvider` does NOT auto-scroll to top on navigation. No `ScrollToTop` component exists anywhere in the codebase. When a farmer scrolls down on Home and navigates to Weather, the scroll position carries over — appearing as "can't scroll" or broken scrolling.

**Fix**: Since `createBrowserRouter` doesn't support a `ScrollToTop` child component the way `BrowserRouter` does, we need to add scroll restoration inside `AppLayout` using `useLocation`:

```typescript
// Inside AppLayout, after useLocation()
useEffect(() => {
  window.scrollTo({ top: 0, left: 0 });
}, [location.pathname]);
```

### Finding 3: `PullRefreshController` Blocks Touch Scroll (P1 — Mobile)

**Root Cause**: In `PullRefreshController.tsx` line 130, `touchmove` is registered with `{ passive: false }`. The `e.preventDefault()` on line 115 fires whenever `diff > 0 && container.scrollTop === 0`. On mobile, this blocks the browser's native scroll when the user starts at the top — even if they intend to scroll down normally. The condition is too aggressive.

**Fix**: Add a minimum threshold (e.g., 10px) before calling `preventDefault`, so small downward touches still allow normal scroll:

```typescript
if (diff > 10 && container.scrollTop === 0) {
  e.preventDefault();
  setPullDistance(Math.min(diff, threshold + 20));
}
```

### Finding 4: `mobile-scroll-container` CSS Has No Height Context (P1)

**Root Cause**: The `.mobile-scroll-container` class sets `height: 100%` + `overflow-y: auto`. But the parent `<main>` in AppLayout has no explicit height — it's inside a `min-h-mobile-screen` div. `height: 100%` on a child of `min-height` parent resolves to `auto`, making `overflow-y: auto` ineffective. The scroll container never constrains, so on some pages content may not scroll properly.

**Fix**: Change the AppLayout structure so the main content area uses flex layout with overflow:

```css
.mobile-scroll-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}
```

And update the parent div in AppLayout to use `flex flex-col h-mobile-screen` instead of `min-h-mobile-screen`.

### Finding 5: 84 Files Use `backdrop-blur` (P2 — Performance)

**Root Cause**: `backdrop-blur` forces GPU compositing of all underlying layers on every frame. On low-end Android devices (farmer primary devices), this causes frame drops during scroll, especially on Home page with weather cards, glassmorphism nav, and animated content.

**Impact**: Scroll jank on budget Android phones. Not a blocker but degrades "world-class" feel.

**Fix (Quick Win)**: Replace `backdrop-blur` with solid semi-transparent backgrounds on the most performance-critical elements — the bottom nav and fixed header. These are painted on every scroll frame. Keep `backdrop-blur` on modals/overlays (painted once).

Specifically in `AppLayout.tsx` header (line 54): replace `bg-card` with explicit solid color (already solid, good). In `index.css` `.glassmorphism-nav` (line 616): replace `backdrop-blur-2xl` with a solid `bg-background/95`.

## Files to Change

| File | Change |
|---|---|
| `vite.config.ts` | Add src/components/ui form files to ui-vendor manualChunks |
| `src/components/AppLayout.tsx` | Add `useEffect` for scroll-to-top on pathname change; change container to flex layout |
| `src/index.css` | Fix `.mobile-scroll-container` to use `flex: 1` instead of `height: 100%`; reduce `backdrop-blur` on `.glassmorphism-nav` |
| `src/components/weather/PullRefreshController.tsx` | Add 10px minimum threshold before `preventDefault` |

## What Does NOT Change

- Decision brain / symbolic engine — zero changes
- Data pipeline / sync service — zero changes
- Multi-tenant isolation — zero changes
- Route structure — zero changes
- Any edge functions — zero changes

## Expected Outcome

- Circular chunk warning eliminated → clean production build
- Mobile scroll works on all pages (scroll-to-top + proper container)
- Pull-to-refresh no longer blocks normal scroll
- Smoother scroll on low-end devices (reduced backdrop-blur on fixed elements)

