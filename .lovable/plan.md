# 🛠 Scroll Architecture + 2030 UX Refresh — Master Plan

## Phase 1 — Establish the Single Scroll Contract (foundation)

**Rule (to be enforced everywhere):**
> The ONLY scroll container is `<main className="mobile-scroll-container">` in `AppLayout.tsx`.  
> Pages render natural-height content. **No** `h-screen`, `min-h-screen`, `h-full overflow-y-auto`, or `fixed inset-0 overflow-y-auto` inside pages.

### 1a. Fix scroll restoration in `AppLayout.tsx`
- Replace `window.scrollTo` (broken — window doesn't scroll) with a ref to `<main>` and `mainRef.current?.scrollTo({top:0})` on route change.
- Add `scroll-pt-14` so anchored sections respect the fixed header.

### 1b. Add a reusable `<PageShell>` component
- `src/components/layout/PageShell.tsx` providing `bg-gradient`, optional `sticky` sub-header slot, consistent `px-4 py-4 space-y-4`, and `pb-nav-safe`.
- Migrate every page to use it (eliminates the `min-h-screen` copy-paste).

---

## Phase 2 — Page-by-Page Fixes

| # | File | Change |
|---|---|---|
| 1 | `src/pages/Weather.tsx` | Remove `h-screen ... overflow-hidden flex flex-col`. Wrap content in `PageShell`. Keep `PullRefreshController` but let it inherit page scroll instead of owning it. |
| 2 | `src/pages/Home.tsx` | Replace `min-h-screen` with `PageShell`. Convert `fixed top-16` weather card to `sticky top-14` so it scrolls with content (no longer overlaps cards). |
| 3 | `src/pages/Schedule.tsx` | Remove both `fixed inset-0 pt-14 pb-16 overflow-y-auto` blocks (lines 324 & 466). Use `PageShell` with `pb-nav-safe`. |
| 4 | `src/pages/Profile.tsx` | Replace `h-full overflow-y-auto` with `PageShell`. Eliminates nested scroller. |
| 5 | `src/pages/ProfileEdit.tsx` | Same as Profile. Re-anchor sticky header to `<main>`. |
| 6 | `src/pages/Market.tsx` | Replace `min-h-screen` with `PageShell`. Standardize search bar to `sticky top-0`. |
| 7 | `src/pages/CommunityPage.tsx` | Replace `min-h-screen` with `PageShell` (note: `/app/community/*/chat` keeps full-screen behavior). |
| 8 | `src/pages/SubscriptionPage.tsx`, `ProactiveAlerts.tsx`, `NDVIAnalysis.tsx`, `Analytics.tsx`, `SoilHealthReport.tsx`, `NotificationSettingsPage.tsx`, `AIScheduleDashboard.tsx`, `CropGrowthTracking.tsx`, `LandDetails.tsx`, `InstallPWA.tsx`, `Schemes.tsx`, `VideoReels.tsx` | Replace `min-h-screen` with `PageShell`. Remove redundant `pb-20` (handled by `pb-nav-safe`). |
| 9 | `src/pages/SplashScreen.tsx`, `AuthScreen.tsx`, `MobileAuth.tsx`, `PinAuth.tsx`, `SetPin.tsx`, `LanguageSelection.tsx`, `NotFound.tsx` | These render OUTSIDE `AppLayout` — keep `min-h-screen` but switch to `min-h-mobile-screen` (uses `100dvh`) so iOS dynamic chrome doesn't clip them. |

---

## Phase 3 — 2030 UX Upgrades (No-1 UX-expert recommendations)

### 3a. Motion & Feedback
- Capacitor `Haptics.impact({style: Light})` on all primary actions, nav taps, and toggles (graceful no-op on web).
- Page-transition shared layout with `framer-motion` `<AnimatePresence mode="wait">` in `AppLayout` (slide-fade per route).
- Replace skeletons with **shimmer + content-shape morph** (skeleton blocks transition to real components in place).

### 3b. Header & Navigation
- Make the glass header **adaptive**: shrinks brand to icon when scrolled >40px (more screen real-estate).
- Add a **scroll-to-top FAB** that appears when user scrolls past 400px.
- Bottom nav: add subtle **scroll-aware hide-on-down / show-on-up** (Instagram-style) for max content visibility.

### 3c. Content Patterns
- **Universal `<EmptyState />` component**: illustration + 1-line + CTA. Roll into Schemes, VideoReels, Analytics, Saved posts, etc.
- **Universal `<PullRefresh />` wrapper** baked into `PageShell` (opt-out via prop). Reuses Weather logic.
- **Sticky filter chips** standardization: every page that has filters uses the same `sticky top-0 z-10 bg-background/95 backdrop-blur-md` pattern.
- **Section headers** unified: `text-sm font-semibold uppercase tracking-wide text-muted-foreground` with optional "See all" link.

### 3d. Accessibility & Inputs
- Force all `<input>` `font-size: 16px` minimum to stop iOS auto-zoom.
- Add visible focus rings (`focus-visible:ring-2 ring-primary ring-offset-2`) on all icon buttons.
- Add `aria-label` audit pass for icon-only buttons across nav, header, action menus.
- Respect `prefers-reduced-motion` everywhere we use `framer-motion` (already partial in Home — extend).

### 3e. Theming polish (multi-tenant ready)
- Audit gradient overuse (`from-primary/10 via-background to-accent/10` repeated 12× across auth pages) → centralize as `bg-auth-gradient` semantic class so each tenant theme automatically restyles.
- Add `data-theme` attribute on `<html>` so per-tenant CSS variable overrides cascade cleanly without re-rendering.

---

## Phase 4 — Verification

- TypeScript compile + Vite build.
- Manual scroll test on every route at 390x688 (current preview viewport).
- Confirm: (a) only one scrollbar per page, (b) bottom-nav never overlaps content, (c) sticky elements stick to top of `<main>`, (d) route changes scroll-to-top.
- Verify Marathi/Hindi translations still render across the redesigned shells (no regression from prior work).

---

## Files Touched (estimate)
- **New**: `src/components/layout/PageShell.tsx`, `src/components/layout/EmptyState.tsx`, `src/components/layout/ScrollToTopFab.tsx`
- **Modified**: `src/components/AppLayout.tsx` + all 24 pages listed above
- **CSS**: minor additions to `src/index.css` (`bg-auth-gradient`, focus utilities)

No DB changes. No edge-function changes. Pure frontend layout/UX refactor.
