# 2030 Walkthrough Redesign — Compact Coach + 10 Features

## Problem with current UI

Reviewing the screenshots and `src/components/onboarding/FeatureWalkthrough.tsx`:

- The bottom-sheet coach card occupies ~45% of viewport height — on the Step 2 screenshot the highlighted "Today's Weather" card is almost fully **covered by the sheet itself**, so users can't actually see what's being explained.
- Heavy aurora + dark mask + halo + rotating dashed ring → visually noisy, looks like a generic tutorial overlay, not 2030.
- Only 6 steps; missing key features the user listed (crop schedule, NDVI, market, community).
- Listen-again row + giant gradient Next button add another tall band, pushing the sheet even taller.

## New design direction — "Floating Mini-Coach"

```text
┌──────────────────────────────┐
│ ●●●○○○○○○○         ✕ Skip   │ ← thin top progress
│                              │
│   ┌──────────────┐           │
│   │  TARGET      │◀━━━━┐    │ ← spotlight stays clean
│   │   (visible)  │     ┃    │   element 100% visible
│   └──────────────┘     ┃    │
│                        ┃    │
│         ╭──────────────┸──╮ │ ← small floating pill
│         │ 🌦  Today's      │ │   (auto-anchors near
│         │     Weather      │ │   target, never covers it)
│         │ ─────────────── │ │
│         │ आजचे हवामान...   │ │
│         │ 🔊  ← 2/10  →   │ │ ← inline controls
│         ╰──────────────────╯ │
└──────────────────────────────┘
```

Key changes:

1. **Compact pill coach card** (max-width 320px, ~160px tall) instead of full-width bottom sheet. Auto-positions: below target if room, else above, else floats top-right — never overlaps the spotlight rect.
2. **Smart anti-overlap**: compute target rect, choose the screen quadrant farthest from it; add 12px arrow/connector pointing to target.
3. **Cleaner spotlight**: remove rotating dashed halo + aurora blobs (per memory: "opaque backgrounds, no backdrop-blur for FPS"). Keep single soft mask + 2px primary ring + subtle pulse only.
4. **Inline controls** — speak/back/index/next collapsed into one 44px row inside the pill; remove the separate "Listen again" band and giant gradient CTA.
5. **Glass-lite styling** — single `bg-card/95` (opaque-leaning), 1px primary border, soft shadow. No backdrop-blur on the pill (Android FPS rule from project memory).
6. **Top progress dots → thin segmented bar** with current segment shimmering; right-side Skip pill stays.
7. **Cinematic micro-motion only**: spotlight scales in (spring), pill slides 8px + fades in. No infinite rotations.

## Expanded step list (10 steps, all use `data-tour`)

| # | Target | Title | Narration covers |
|---|--------|-------|------------------|
| 1 | (none, centered) | Welcome | greeting + how to use tour |
| 2 | `weather` | Today's Weather | live forecast for your farm |
| 3 | `schedule` | Crop Schedule | AI-generated daily tasks |
| 4 | `ndvi` | NDVI Health | satellite crop health % |
| 5 | `chat` | Ask AI | voice/text farming questions |
| 6 | `scan` | Scan Crop | pest & disease photo ID |
| 7 | `market` | Market Prices | live mandi rates near you |
| 8 | `community` | Community | chat with nearby farmers |
| 9 | `mic` | Voice Button | press-and-hold to speak |
| 10 | `nav` | Bottom Menu | navigate between sections |

Each step has hi / mr / en narration (preserve current bilingual quality).

## Files to edit

- **`src/components/onboarding/FeatureWalkthrough.tsx`** — full rewrite: remove Aurora / Halo / CornerBrackets / drag-controls / bottom-sheet; add `MiniCoach` pill with smart positioning hook; expand STEPS to 10.
- **`src/components/home/HomeFeaturesGrid.tsx`** — extend `tourTag` mapping so `schedule`, `ndvi`, `market`, `community` paths also receive `data-tour` attributes (currently only weather + chat).
- **`src/hooks/useFeatureWalkthrough.ts`** — no logic change; bump storage key to `ks_walkthrough_v2` so existing users see the new tour once.

No changes to: routing, TTS, i18n keys, business logic, BottomNavigation, NativeVoiceButton (their `data-tour` anchors already exist for nav/scan/mic).

## Technical details

- Positioning function `computeCoachPos(rect, vw, vh)` returns `{ top, left, arrow: 'up'|'down'|'left'|'right' }`. Algorithm: prefer below target if `vh - rect.bottom >= 180`, else above if `rect.top >= 180`, else right/left side if narrow; fallback bottom-center pill never larger than 320×170.
- Spotlight padding 8px, radius 16px; mask uses single `<rect>` cutout, fill `rgba(0,0,0,0.7)` (lighter than current 0.82 so surrounding context stays readable).
- Use `ResizeObserver` + scroll listener (existing pattern) — no infinite RAF.
- Respect `useReducedMotion` for entrance animations only.
- All colors via semantic tokens (`--primary`, `--card`, `--border`, `--muted-foreground`).
- Pill uses `pointer-events-auto`; backdrop mask uses `pointer-events-none` so users can tap through to nothing (prevents accidental skip via click-outside, which they reported).
- Bundle impact: −1 KB (removing drag controls + aurora) +0.5 KB (positioning logic).

## Out of scope

Auth flow, TTS engine, copy beyond the 4 new narrations, anchor element styling.
