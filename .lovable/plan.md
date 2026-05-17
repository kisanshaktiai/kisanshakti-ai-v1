# 2030-Ready Feature Walkthrough Redesign

Redesign `src/components/onboarding/FeatureWalkthrough.tsx` (and supporting hook) into a premium, mobile-first, voice-narrated coach experience built for rural Indian farmers on low-end Android devices.

## Design Direction

**Aesthetic:** Glassmorphic, depth-rich, agri-futuristic. Soft organic gradients (sunrise → field green), frosted glass coach card, animated aurora/particle backdrop behind the spotlight, premium typography, haptic-feel motion.

**Mobile-first:** Built for 360–414px width, one-thumb reachable controls, big tap targets (≥56px), bottom-sheet style coach card with a drag handle, safe-area aware.

**Farmer-friendly:** Big icons, simple Devanagari/Marathi/English typography, persistent voice narration with visible "speaker pulse" indicator while talking, large LISTEN button, simple Next/Back chevrons.

## New Visual Components

```text
┌─────────────────────────────────────┐
│   ◉ ◉ ● ○ ○ ○   ✕ Skip             │ ← top: progress segments + skip
│                                      │
│      [aurora gradient blur]          │
│                                      │
│         ╭──────────╮                 │ ← animated spotlight ring
│         │ TARGET   │                 │   with corner brackets +
│         ╰──────────╯                 │   rotating dashed halo
│           ▼ pointer                   │
│  ╭─────────────────────────────╮     │
│  │  ▬▬                          │    │ ← drag handle
│  │  🌾  Step 2 of 6             │    │
│  │  Today's Weather             │    │
│  │  ─────────────────           │    │
│  │  आज के मौसम की जानकारी...    │    │
│  │                              │    │
│  │  [🔊 Listen]  ·  pulse ●●●  │    │ ← speaking indicator
│  │                              │    │
│  │  ←  Back        Next  →     │    │
│  ╰─────────────────────────────╯     │ ← glass bottom-sheet card
└─────────────────────────────────────┘
```

## Features

1. **Spotlight v2** — SVG mask cutout with feathered edge (gaussian blur), animated corner brackets (top-left/right, bottom-left/right) that "lock on" the element, slow rotating dashed halo, and a subtle finger-tap ripple on the target.
2. **Aurora backdrop** — Three soft blurred radial gradients (primary/accent/success) drifting via framer-motion to make the dark overlay feel alive without hurting FPS.
3. **Bottom-sheet coach card** — Glass card (`bg-card/85 backdrop-blur-xl`) anchored bottom on mobile, with drag handle, swipe-down-to-dismiss gesture, and swipe-left/right between steps. Auto-flips above target if target is in lower half.
4. **Speaking indicator** — 3-bar animated equalizer that pulses while TTS is speaking; tap to replay; long-press to mute.
5. **Progress segments** — Filled bar segments (not dots) with smooth fill animation, current segment shimmering.
6. **Step icon + chip** — Each step has a themed icon (Sun, Cloud, MessageCircle, Camera, Mic, LayoutGrid) inside a gradient chip; chip color matches step accent.
7. **Haptics** — `src/lib/haptics.ts` light tick on Next/Back; success pattern on Done.
8. **Reduced-motion respect** — uses `useReducedMotion` to disable aurora/halo/ripple.
9. **Accessibility** — `role="dialog"`, `aria-live="polite"` for narration text, focus trap, ESC to skip, large 56px buttons.
10. **Performance** — Throttled `getBoundingClientRect` via `ResizeObserver` + `scroll` listener instead of RAF loop (lower battery use on entry-level Android). Per project memory: opaque backgrounds where blur is too costly is acceptable, but coach card uses GPU-friendly single blur layer only.

## Files

- **Edit** `src/components/onboarding/FeatureWalkthrough.tsx` — full rewrite with new layout, sub-components inline (`Spotlight`, `CoachCard`, `Aurora`, `SpeakingIndicator`, `ProgressSegments`).
- **Edit** `src/hooks/useFeatureWalkthrough.ts` — add `isSpeaking` state exposure (subscribe to TTS), small DOM-ready wait (poll `[data-tour]` presence up to 3s before showing) to prevent flicker when targets render late.
- **No changes** to `data-tour` anchors, `PermissionOnboarding`, `AppLayout`, routing, TTS service, i18n keys, or any business logic.

## Technical Details

- Uses framer-motion `AnimatePresence`, `motion.div`, `useDragControls` for swipe.
- Spotlight position via `ResizeObserver` on `document.body` + window `scroll`/`resize` + a 60fps RAF only while the target is animating in (first 600ms after step change), then idle.
- Coach card position: `target.bottom + 16 < vh - 280 ? below : above`. On very small screens (<360px) always bottom-sheet.
- All colors via semantic tokens (`--primary`, `--accent`, `--card`, `--background`, `--success`); no hardcoded hex.
- TTS narration unchanged (same `useTextToSpeech` hook, same per-step `narrations[lang]` map).
- Bundle impact: ~3KB gzip (no new deps).

## Out of Scope

- Permission flow UI, language selection, TTS engine, data-tour element positions, business logic, subscription gating, copy/i18n keys (we keep the same narration strings).
