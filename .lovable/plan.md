

## Goal
Redesign the `AppLayout` header for a 2030-ready, mobile-first experience. The current 390px header is overcrowded after adding the subscription chip — brand text gets squeezed and right-side actions (chip + connection + sync + language) collide.

## New header design (mobile-first, 56px tall)

```text
┌──────────────────────────────────────────────────┐
│ [Logo] Brand          [Plan●][⋯ Actions Sheet] │  ← compact bar
│        Hi, Ramesh ▾                              │  ← greeting row (1 line)
└──────────────────────────────────────────────────┘
```

Single-row layout, 3 zones with strict width budget:

1. **Brand zone (left, flex-shrink)** — Logo (28px) + brand name (truncate, max 1 line). Greeting moves under it as a tiny pill (`Hi, {name}`) only if space allows (`hidden xs:block` at >360px).
2. **Plan pill (center-right, fixed)** — Compact subscription chip; tier-themed gradient ring; haptic micro-animation; status dot when expiring/grace/expired; tap → `/app/subscription`.
3. **Actions cluster (right, fixed 32px button)** — A single **"More" glass button** opens a bottom sheet containing: Connection status, Sync, Language. Replaces 3 stacked icons with 1 → frees ~100px on 390px screens.

### Visual upgrades (2030-ready)
- Glassmorphism header (`backdrop-blur-xl bg-card/70 border-b border-border/40`) with subtle gradient line accent in primary color.
- Logo with soft glow ring (`shadow-[0_0_12px_hsl(var(--primary)/0.25)]`).
- Plan pill: micro gradient + animated shimmer when status = active; pulsing dot when expiring/grace; destructive ring when expired.
- Touch targets ≥40×40 (WCAG 2.2 AAA).
- Safe-area aware (`pt-safe`), 56px height (was 56px — same), respects iOS notch/Android cutout.
- Reduced-motion: disable shimmer/pulse via `motion-safe:` prefix.
- No `backdrop-blur` on low-end Android (per project memory): use opaque `bg-card/95` fallback via a CSS feature query.

### New micro-components
- `HeaderActionsSheet.tsx` — bottom sheet (uses existing `Drawer`) holding Connection / Sync / Language with labels for accessibility.
- `BrandBlock.tsx` — logo + name + greeting; handles fallback to `Leaf` icon and truncates company name.
- `SubscriptionHeaderChip.tsx` — restyled: smaller (h-7), tier gradient ring, status dot, shimmer for active PRO/Shakti, shrink to icon-only when viewport < 340px.

## Files to change

| File | Change |
|---|---|
| `src/components/AppLayout.tsx` | Replace inline header with new compact layout: `<BrandBlock />` + `<SubscriptionHeaderChip />` + `<HeaderActionsSheet />` |
| `src/components/header/BrandBlock.tsx` (new) | Logo + brand name + greeting, truncation + fallback |
| `src/components/header/HeaderActionsSheet.tsx` (new) | Drawer-based menu wrapping `ConnectionStatusIcon`, `SyncButton`, `LanguageSelector` with labels |
| `src/components/subscription/SubscriptionHeaderChip.tsx` | Restyle: gradient ring, status dot, shimmer, icon-only mode <340px |
| `src/index.css` | Add `.glass-header` utility + `@supports not (backdrop-filter:blur(8px))` opaque fallback |

## What stays unchanged
- Subscription data flow, business logic, AI engine, sync, realtime — untouched.
- All existing actions (connection, sync, language) preserved, just relocated into a sheet.
- Header height 56px → no layout shift in `main` padding.
- AI Chat / Community Chat header-hidden behavior preserved.

## Acceptance
- 390×688 viewport: brand never truncates before 18 chars; plan pill always visible; no horizontal scroll.
- 320×568 viewport: plan chip becomes icon-only; actions sheet remains a single tap target.
- Reduced-motion users: no shimmer/pulse.
- Low-end Android (no backdrop-filter): opaque header, FPS-safe.
- Lighthouse a11y ≥95, all interactive elements have `aria-label`.

