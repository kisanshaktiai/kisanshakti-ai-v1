
# First-Run Experience Overhaul

Replace the two popup cards (`VoiceHowToCard`, `ReadAloudCard`) with a proper Android-style **first-install permission flow** + a **voice-guided walkthrough** that teaches rural farmers how to use the app in their selected language.

## Goals

1. On first install, request the standard mobile permissions the same way every Android app does — clear, sequential, with rationale (no random popup cards later).
2. After permissions, run a short voice-narrated walkthrough so non-literate / low-literacy farmers understand what each feature does.
3. Persist completion so this runs **once per install**, never again unless reset.

## New Flow (one-time, first install)

```text
Splash
  → Language Selection (existing)
     → [NEW] PermissionOnboarding screen     ← takes Location, Mic, Camera, Notifications
        → Auth (mobile + PIN)  (existing)
           → [NEW] FeatureWalkthrough overlay ← voice-narrated 5–6 step coach-marks on /app
              → Home (normal app)
```

The two old cards (`VoiceHowToCard`, `ReadAloudCard`) and `FirstRunOnboardingController` are removed.

## 1. Permission Onboarding screen

New route `/permissions` shown after language selection on first run only.

- One full-screen page, one permission per "slide" (swipe / Next button), big icons, large native-language text + a built-in **Speak** button that narrates the rationale via existing `useTextToSpeech`.
- Order matches the standard rural-farmer-app flow:
  1. **Location** — "for accurate weather, mandi prices, and crop advice for your village"
  2. **Microphone** — "to talk to the app in your language"
  3. **Camera** — "to scan crops, pests, and diseases"
  4. **Notifications** — "to alert you about rain, pests, and your crop schedule"
- Each slide: `Allow` (calls existing `PermissionManager.requestPermission`) and `Skip` (records denial, lets user continue — never blocks the app).
- A persistent footer shows progress dots (1/4 … 4/4).
- After last slide, set `localStorage['ks_permissions_onboarded'] = 'true'` and navigate to `/auth`.
- If user revisits later (already onboarded), the route redirects to `/auth` or `/app`.

Uses `Capacitor` permission plugins when `isNativeApp()` is true; falls back to web `PermissionManager` otherwise. No behavior change to permission-request mechanics — only adds an upfront, batched UX.

## 2. Voice-guided Feature Walkthrough

New component `FeatureWalkthrough` mounted once inside `AppLayout` and shown only on first authenticated visit.

- Tooltip / coach-mark overlay (semi-transparent backdrop with a highlighted "spotlight" cutout on the target element) using existing motion + tailwind tokens.
- 6 steps targeted at real DOM elements (via `data-tour` attributes added to existing UI):
  1. Top header — "This is your home. Tap here anytime."
  2. Weather card — "Today's weather for your farm."
  3. AI Chat tile — "Ask any farming question by voice or text."
  4. Crop scan tile — "Take a photo of your crop to identify pests/disease."
  5. Mic button (`NativeVoiceButton`) — "Press and hold to speak in your language."
  6. Bottom nav — "Switch between Home, Weather, Market, and more."
- Each step **auto-speaks** its narration in the user's selected `i18n.language` using `useTextToSpeech` (already wired). A `Speak again` and `Mute` button is shown.
- Buttons: `Next`, `Back`, `Skip tour`. Pulsing ring on the highlighted element. Big touch targets, high contrast, no jargon.
- Persists `localStorage['ks_walkthrough_complete'] = 'true'` on finish or skip; never shown again.
- Reset entry in Profile → Help (reuses existing `window.__resetOnboarding` pattern but with new keys).

## 3. Removals / cleanup

- Delete `src/components/onboarding/VoiceHowToCard.tsx`, `ReadAloudCard.tsx`, `FirstRunOnboardingController.tsx`.
- Remove `<FirstRunOnboardingController />` from `src/App.tsx`.
- Remove storage keys `ks_seen_voice_card`, `ks_seen_readaloud_card`, `ks_onboarding_complete` (orphaned — no migration needed; they only blocked the old popups).
- `VoiceDownloadCard.tsx` stays (different purpose — model download).

## 4. Files touched

```text
NEW   src/pages/PermissionOnboarding.tsx
NEW   src/components/onboarding/FeatureWalkthrough.tsx
NEW   src/components/onboarding/WalkthroughStep.tsx
NEW   src/hooks/useFeatureWalkthrough.ts
EDIT  src/App.tsx                     ← add /permissions route, mount walkthrough, remove old controller
EDIT  src/pages/LanguageSelection.tsx ← navigate('/permissions') instead of '/auth' on first run
EDIT  src/components/AppLayout.tsx    ← render <FeatureWalkthrough/> once auth ready
EDIT  src/components/home/* + BottomNavigation.tsx + NativeVoiceButton.tsx
      ← add data-tour="weather|chat|scan|mic|nav" anchors (no visual change)
DEL   src/components/onboarding/VoiceHowToCard.tsx
DEL   src/components/onboarding/ReadAloudCard.tsx
DEL   src/components/onboarding/FirstRunOnboardingController.tsx
```

## 5. Storage keys (new)

| Key | Purpose |
|---|---|
| `ks_permissions_onboarded` | Set after PermissionOnboarding completes (allow or skip) |
| `ks_walkthrough_complete` | Set after FeatureWalkthrough finishes or is skipped |

## 6. Out of scope

- Changing how individual features request permissions later (contextual `usePermission` stays for re-prompts).
- Subscription/entitlement UX (already handled in prior work).
- TTS engine changes — reuses `useTextToSpeech` as-is.
- i18n keys for new copy: added to `en` + `hi` + `mr`; other locales fall back to `en` and can be filled later.

## Acceptance

- Fresh install → Splash → Language → 4-step Permission screen → Auth → first `/app` visit shows voice-narrated 6-step walkthrough → completes and never reappears.
- Existing installed users (have language but no `ks_permissions_onboarded`) see the permission screen once on next launch, then the walkthrough once.
- No more random popup cards appearing on Home.
