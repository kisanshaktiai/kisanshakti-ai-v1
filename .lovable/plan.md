# KisanShaktiAI — UX Plan v3 (Land-Boundary-First, Voice-Assisted)

> Persona lock: **Amarsinh, 48, Solapur — cracked screen, intermittent 3G, limited Marathi reading, one muddy hand.**
> Architecture lock: **This is an AI agronomic advisory app. Without an accurate land boundary + crop + irrigation + soil context, every downstream prediction (NDVI, weather micro-forecast, irrigation liters, disease risk, schedule, advisory) is invalid. Onboarding cannot be shortcut.**

---

## ⚠ Critical Correction to v2 — Section 3 (Voice-First Onboarding)

The previous plan implied a farmer could speak "साडे सात एकर ऊस" and have a land created. **That is wrong for this app.** All proactive intelligence (`proactive-evaluator`, NDVI tiles, weather micro-forecasting at the polygon centroid, irrigation liter calculations, soil_health joins) requires:

1. **Polygon boundary on the map** — not just an acre count. NDVI/satellite, weather centroid, area calc, neighbor-disease modeling all key off this.
2. **Current crop + variety + sowing date** — drives stage-aware decision rules, schedule, IPM windows.
3. **Irrigation system** (drip / flood / sprinkler / rainfed) — drives liter calculations and irrigation rule arms.
4. **Soil type / last crop** — drives nutrient baseline and rotation logic.

These are **not optional fields**. Voice **assists** the form, it does not **replace** it. Fix below in §3.

---

## 0. P0 — Ship Today (no design review)

### 0.1 `social.json` namespace fix
Wrap each of `src/i18n/locales/{en,hi,mr}/social.json` content under top-level `"social": { … }` (keep `__meta` outside). Kills raw `social.header.title` rendering across Community/Schedule/Market/Alerts.

### 0.2 Subscription banner overlap
Banner publishes its measured height to CSS var `--banner-h` (`0px` ↔ `36px`). `<main>` uses `paddingTop: 'calc(56px + var(--banner-h, 0px))'`. No clipped first card.

### 0.3 Remove duplicate scroll-to-top FAB
Delete `ScrollToTopFab` mount in `AppLayout`. Mic FAB is the only persistent floating control. Replace with a slim "back to top" pill that fades in under the header after 800px scroll.

---

## 1. Bottom Navigation — final
```text
[ 🏠 Home ] [ 🌾 My Land ] [ 🎤 MIC ] [ 👥 Community ] [ 👤 Profile ]
                              ^ center FAB, 64×64, always-on
```
- Market → Home card + Land-detail tile (NOT in nav).
- AI Chat → IS the mic (tap = ask, long-press = "ask about this screen").
- Community stays — peer trust drives retention.
- Hindenburg hamburger removed; its items become tiles on Home or Land Detail Hub.

---

## 2. Land Switcher — first-class surface

- **Header chip:** `[ 🌾 Mala 7.59ac ▾ ]` — active land, persistent, never UUID.
- **Home top section:** horizontal swipeable land carousel — one card per land showing crop emoji, area, ONE priority action ("पाणी द्या · 2,436L"). Swipe = global context switch.
- AI urgency = small amber/red dot on the card. **Never reshuffle order** (breaks muscle memory).
- New `<LandRef land={…} />` is the only sanctioned way to render a land identifier. UUID slip → `🌾 (unknown)` + dev `console.warn`.

---

## 3. Onboarding — Land-Boundary-Mandatory, Voice-Assisted (REVISED)

### 3.1 Hard contract: a farmer cannot reach the Home dashboard without at least one fully-qualified land.

The "fully-qualified" record requires every field below. Each is a separate, non-skippable step in the wizard:

| Step | Field | Source of truth | Voice assist |
|---|---|---|---|
| 1 | **Polygon boundary** (≥3 vertices) on Google Map | `lands.boundary_polygon_old` + `center_lat/lon` (auto) + `area_acres` (auto-calc from polygon) | Voice: "draw boundary" → opens map with mic-narrated instructions; farmer walks the perimeter (GPS-walk mode) OR taps vertices |
| 2 | **Land name** | `lands.name` | Voice → STT → field |
| 3 | **Current crop + variety** | `lands.current_crop`, `crop_variety` | Voice → STT → matched against `crop_synonyms` (193 aliases) |
| 4 | **Sowing date / DAS** | `lands.sowing_date` | Voice ("दोन महिन्यापूर्वी लावलं") → date picker pre-filled |
| 5 | **Irrigation system** | `lands.irrigation_type` (drip / flood / sprinkler / rainfed) | Visual icons + voice — single tap |
| 6 | **Soil type** | `lands.soil_type` (auto-prefilled from `soil_health` if available) | Confirm/override |
| 7 | **Last crop** | `lands.previous_crop` | Voice → STT → `crop_synonyms` |

**Rules:**
- No "skip for now" on any step. The wizard refuses to commit a partial record.
- Boundary step is the gate — until a polygon is closed and area is calculated, steps 2–7 are visually locked.
- Voice **fills** fields; the farmer must still **see and confirm** each value before proceeding (literacy-safe — visual icons + TTS readback).
- For low-literacy users, every step has a "🔊 हे ऐका" button that reads the field label, hint, and current value.

### 3.2 GPS-Walk boundary mode (high-leverage feature)
Farmer taps "मी शेताच्या बांधावर चालतो" → app records GPS points every 2 m → auto-closes polygon when farmer returns within 5 m of start point. Solves the "tap-on-tiny-map" problem for cracked screens and muddy fingers. Falls back to vertex-tap mode if location accuracy >15 m.

### 3.3 Empty-state voice prompts (revised wording)
- Home with zero lands: large CTA card "तुमची पहिली जमीन नकाशावर काढूया" → opens the 7-step wizard at Step 1 (boundary). The voice prompt tells the farmer this will take ~3 minutes and explains why each field matters in one line.
- **Voice does NOT create a land record.** It only helps fill the wizard.

### 3.4 Edit land
Same wizard, same fields, same validation. Boundary edit re-triggers area recalculation and invalidates cached NDVI/weather for that polygon.

---

## 4. Header — StatusPill consolidation

```text
┌──────────────────────────────────────────────────────────┐
│ 🌾 KS  [🌱 Mala 7.59ac ▾]    [🔊]  [文]  [Shakti·17d·●] │
└──────────────────────────────────────────────────────────┘
```
- **StatusPill** merges `SubscriptionHeaderChip` + `HeaderStatusDot` + `UnifiedSyncButton`. Static label `Shakti · 17d · ●` — no rotation. Tap → popover (subscription, online/offline, last-sync, pending count, Sync now / Full reload).
- **🔊 Speak-this-page** as permanent header control (uses `useTTSFacade`) — biggest accessibility win for non-Devanagari readers.
- **Language** stays icon-only.
- Header height **14 → 56 px** to meet 44×44 tap targets.

---

## 5. Voice-First Elevation (input modality, not feature)

- Mic FAB **64×64**, always-on, center-bottom, above bottom-nav. Idle = ambient pulse. Press-and-hold = record (haptic on start). Release = transcribe → AI Chat with screen context.
- "Speak this page" header button reads the visible viewport in active language.
- Voice notes record to local IndexedDB first, sync when online — never block on network.
- **Voice assists land wizard** (§3) but never replaces map drawing.

---

## 6. Offline & Low-Bandwidth (first-class)

- Skeletons only — no spinners.
- Honest staleness: `📡 ऑफलाइन · 2 तासांपूर्वीची माहिती` per affected card.
- StatusPill popover lists queue in plain language ("3 आवाज नोट्स · 1 जमीन अपडेट प्रतीक्षेत").
- Boundary capture works fully offline — polygon + GPS track stored locally, synced on reconnect.
- Network-aware media: low-quality image placeholders; voice notes preload only on Wi-Fi.

---

## 7. Accessibility for 50+ Farmers

- Body min **16 px**, headings 18–24 px, Marathi/Hindi line-height **1.55**.
- **Large Text mode** toggle in Profile → `data-large-text="true"` on `<html>`, base 16→18.
- Contrast ≥ 4.5:1 — flatten gradients on text-bearing containers; gradient survives only as page background.
- Touch targets: standard 44×44, primary (mic, land switcher, speak-page, active nav) **56×56**.

---

## 8. Card Design Tokens (semantic four)

| Token | Use | Visual |
|---|---|---|
| `card-data` | NDVI, soil moisture, weather metrics | Flat, `bg-card border border-border/40 rounded-xl` |
| `card-action` | "Today's irrigation", "Pending advisory" | `shadow-sm border-l-4 border-primary rounded-xl` |
| `card-content` | Community posts, articles, schemes | `bg-card rounded-2xl shadow-sm` |
| `card-alert` | Proactive warnings | `border-l-4 border-warning/destructive bg-card` |

Ban: triple-nested Card + `rounded-3xl` + `shadow-2xl` + gradient backgrounds (current NDVI/Schedule). One gradient per screen, page-bg only.

---

## 9. PageShell migration
`NDVIAnalysis`, `ProactiveAlerts`, `CommunityPage`, `Market` → wrap in `<PageShell variant="gradient-soft">`. No scroll-behavior change.

---

## 10. Land Detail = the hub (2×3 grid with live data)
```text
┌──────────┬──────────┐
│ ☀ Weather│ 🛰 NDVI   │
├──────────┼──────────┤
│ 🌱 Soil   │ 📅 Schedule│
├──────────┼──────────┤
│ ⚠ Alerts │ 🛒 Market │
└──────────┴──────────┘
```
Each tile shows a live data point (NDVI 0.62 ↑, soil moisture 42 %, etc.).

---

## 11. Screen-Specific Fixes

| Screen | Fix |
|---|---|
| Community | social.json fix; remove inner Home/Community/Trending duplicate IA; collapse composer to mic + single text row |
| Schedule | `<LandRef>` replaces UUID; "AI वेळापत्रक तयार" chip → single-line truncate; flatten triple Cards; thin segmented progress bar |
| Market | PageShell; 4-up 88px crop tiles, virtualized; sticky filter chip row |
| Proactive Alerts | PageShell + banner-aware padding; "Mark all read" inline; severity filter chips |
| NDVI | One flat `card-data` per metric, 16px gap, inline sparkline; kill `shadow-2xl rounded-3xl` |
| Home | Above-the-fold = greeting + land carousel + AI hero; weather/market/tutorials as collapsible sections |
| Profile | Account / Subscription / Preferences (Large Text toggle) / Support |
| **Land Wizard** (NEW) | 7-step mandatory; GPS-walk boundary mode; voice-assist on every step; offline-capable |

---

## 12. Execution Order (locked)

### Today — P0
1. `social.json` namespace fix
2. Banner CSS-var height push
3. Remove duplicate `ScrollToTopFab`

### This week — P1
4. Build `StatusPill` (consolidate 3 header components)
5. Migrate 4 pages to `PageShell`
6. Build `<LandRef>`, replace every UUID render site
7. Flatten triple-nested cards on NDVI + Schedule
8. Header height 14→56px; Speak-this-page button

### Next sprint — P2 (visual sign-off first)
9. Bottom nav refactor (Home · My Land · Mic · Community · Profile)
10. Land Switcher header chip + Home carousel
11. Land Detail hub (2×3 live grid)
12. Remove Hindenburg hamburger

### Sprint after — P3 (Land Wizard hardening — HIGH IMPACT)
13. **7-step mandatory Add/Edit Land wizard** with hard validation gates
14. **GPS-Walk boundary capture** mode + offline storage
15. **Voice-assist on every wizard step** (STT → field, TTS readback, no auto-commit)
16. Empty-state voice-aware CTAs (mic helps fill the wizard, never bypasses it)

### Final — P4 (polish)
17. Offline staleness banners + honest sync queue language
18. Accessibility pass: Large Text toggle, contrast audit, 56×56 primary targets
19. Four-token card system rollout

---

## 13. What we explicitly are NOT doing

- No voice-only land creation (boundary + crop + irrigation + soil are mandatory).
- No "skip for now" on wizard steps.
- No 4-second rotating chip animation.
- No bottom-drawer header sheets.
- No reshuffling land order based on urgency.
- No spinners.
- No hidden offline state.
- No UUIDs in UI.
- No Market in bottom nav.
- No AI Chat as a tab.

---

## Technical Notes (engineers)

- **i18n fix:** wrap each `{en,hi,mr}/social.json` content under top-level `"social"` key; no component changes.
- **Banner var:** `SubscriptionStatusBanner` sets `document.documentElement.style.setProperty('--banner-h', visible ? '36px' : '0px')` on mount/unmount; `AppLayout`'s `<main>` uses `style={{ paddingTop: 'calc(56px + var(--banner-h, 0px))' }}`.
- **StatusPill:** `src/components/header/StatusPill.tsx` wrapping `useSubscription`, `useSyncMetadata`, `useOfflineStatus`, `useSyncAction`.
- **`<LandRef>`:** `src/components/land/LandRef.tsx`, falls back to `🌾 (unknown)` + warn.
- **Land Wizard rebuild:** extend existing `AddLand.tsx` + `EditLandWizard.tsx` to a 7-step state machine; persist draft to IndexedDB after each step (resilient to app kill / network drop). Validation enforced server-side too (lands insert RLS + check constraint on required columns).
- **GPS-Walk:** new `src/services/gpsWalkRecorder.ts` using `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`; auto-close polygon when distance to start <5 m and points ≥10. Smoothing via Ramer-Douglas-Peucker (epsilon 1.5 m). Fallback to vertex-tap when accuracy >15 m.
- **Voice-assist:** wrap each wizard field in a `<VoiceField>` primitive that opens `nativeSpeechRecognition`, fills the field, then calls TTS readback before the user taps "पुढे".
- **Crop matching:** STT result → query `crop_synonyms` (existing 193-alias table) for fuzzy match; show top 3 suggestions for tap-confirm.
- **Card tokens:** four utility classes in `src/index.css` `@layer components`.
- **Large Text mode:** `data-large-text="true"` on `<html>` + Tailwind variant.

Awaiting approval to begin **P0 today**, **P1 this week**, and confirmation that the **mandatory 7-step Land Wizard with GPS-Walk + voice-assist (P3)** is the right shape before we build it.
