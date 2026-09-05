# Tenant-owned theme and compact schedule plan

## Goal
Make the farmer app a true multi-tenant SaaS shell: every tenant supplies the visual theme, every farmer-facing screen consumes semantic theme roles, and the schedule setup fits the phone cleanly with its next action always available.

## Confirmed current state
- The tenant configuration service already reads and merges `theme_colors` and `mobile_theme`; the app applies the merged values as CSS variables and caches them for offline startup.
- The global stylesheet still contains fixed brand-like gradients, farming-mode colors, chat colors, shadows, chart/map/weather defaults, and dark-theme values that can visually override or outlive tenant choices.
- The source audit found hardcoded palette/hex usage across multiple farmer-facing files; therefore fixing only the schedule screen would not meet the tenant-owned-theme requirement.
- The schedule setup already has a fixed action footer, but the variety grid and planting controls create a tall internal flow. Selected crop information is repeated in two horizontal bands, using valuable phone height.
- The backdated consent action still contains a fixed `text-white` class instead of the semantic foreground supplied by the tenant status token.

## Implementation

### 1. Make tenant theming authoritative
- Consolidate theme normalization and DOM application into one reusable tenant-theme contract.
- Map all supported tenant namespaces to semantic variables: brand, surfaces, text, borders, status, navigation, farming modes, charts, maps, weather, chat, overlays, gradients, shadows, typography, and radii.
- Derive missing tonal roles such as hover, soft, dim, and readable foreground from the tenant’s supplied base colors instead of fixed hues.
- Validate incoming color formats before applying them, reject unsafe CSS values, and clear stale variables when tenants change.
- Preserve neutral fallback values only for the brief pre-theme/loading state; no farmer-facing brand identity will depend on those defaults.

### 2. Fix the fresh-load and offline theme paths
- Ensure the live API response, local cache, IndexedDB cache, and fallback database reads all preserve the same merged theme structure.
- Apply the cached tenant theme before the farmer UI becomes visible, then revalidate without a flash of another tenant’s colors.
- Synchronize browser/PWA/status-bar colors from the active tenant rather than fixed values.

### 3. Replace theme bypasses across the farmer app
- Replace hardcoded Tailwind palette classes, raw hex/rgb/hsl values, fixed gradients, and fixed visual inline styles with semantic tenant tokens.
- Cover shared controls first, then schedule, land, chat, notifications/toasts, weather, market, community/reels, profile, onboarding, and authentication screens.
- Keep only scientifically meaningful palettes where color itself conveys measured data (for example NDVI); document and allow-list those exceptions.
- Replace fixed `text-white`/`bg-black` assumptions with the matching semantic foreground/background role so light tenant colors remain legible.

### 4. Compact the schedule creation screen
- Combine the selected crop and selection summary into one compact, tenant-primary strip.
- Keep variety choice in a bounded list/grid inside a single phone-height layout; keep the Next button visible without page scrolling.
- Reduce duplicated labels and decorative spacing while maintaining touch targets and multilingual wrapping.
- On the planting step, group quick dates, exact-date selection, farming method, and optional transplant/intercrop details by priority; optional details expand only when selected.
- Keep the final action anchored above safe-area navigation and verify the 394×691 layout shown in the screenshot.

### 5. Add enforcement and regression checks
- Expand the color audit into a failing project check for hardcoded visual colors in farmer UI.
- Maintain a narrow exception list for scientific maps/charts and provider-required brand colors only.
- Add tests for theme merging, derived roles, tenant switching, cached startup, and readable foreground contrast.
- Add schedule layout checks for action visibility, no overlap, multilingual text, and selected-state coloring.
- Verify representative light, dark, low-contrast, and unusual tenant palettes on mobile and desktop.

### 6. Preserve schedule reliability during the UI work
- Add a deterministic same-language fallback for schedule narration when the external narrator exhausts its time budget, while retaining the rule that no mixed-language schedule is persisted.
- Cover full, partial, timeout, and rate-limit narration paths with focused tests.

## Technical scope
Primary areas: tenant configuration service, tenant context/theme application, global semantic tokens, Tailwind token aliases, shared UI controls, farmer-facing color call sites, schedule setup components, the color audit script, and targeted tests. No agronomic rule logic or database schema changes are planned.

## Persistent project rule
Record this as a core project constraint: this is a multi-tenant SaaS farmer-app shell; tenant configuration is the sole authority for visual theme colors, and farmer-facing code must use semantic tokens rather than hardcoded colors.
