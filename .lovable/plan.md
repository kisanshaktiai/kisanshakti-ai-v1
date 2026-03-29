

# Proactive Alerts Visibility + Notification + WhatsApp Fix Plan

## Issues Found

### 1. ProactiveAlerts page has no header/back navigation
The page is a raw content component with no way to navigate back. Farmers reaching it via the bell icon have no way to return except browser back.

### 2. Bell icon competes with floating weather card
The bell is `fixed top-[72px] right-5 z-40` while the weather card is `fixed top-16 left-4 right-4 z-30`. On small screens, the bell may be obscured or visually lost.

### 3. No in-app toast/notification when new alerts arrive
The realtime subscription in `useProactiveAlerts` updates state silently. When a new alert arrives, the farmer sees nothing unless they're already on the alerts page or notice the badge count change.

### 4. No WhatsApp alert delivery exists
No WhatsApp integration anywhere. The farmer's `mobile_number` is available in the `farmers` table.

---

## Execution Plan

### Fix 1: Add proper header to ProactiveAlerts page
**File**: `src/pages/ProactiveAlerts.tsx`

Add a sticky header with back button (same pattern as `NotificationSettingsPage.tsx`):
- Back arrow → navigates to `/app/home`
- Title: localized "Proactive Alerts"
- Subtitle: localized "AI-powered farm intelligence"
- Adjust content padding for header

### Fix 2: Make bell icon more prominent on Home
**File**: `src/pages/Home.tsx`

Move the bell icon to be part of the header row instead of a fixed overlay competing with the weather card. Or increase its visual prominence with a colored background when `alertUnreadCount > 0`.

### Fix 3: In-app toast notification on new alert arrival
**File**: `src/hooks/useProactiveAlerts.ts`

When the realtime INSERT listener fires, show a toast notification with:
- Alert title (in farmer's language)
- Priority badge color
- Tap action → navigate to `/app/proactive-alerts`

This gives immediate feedback even when the farmer is on any other page.

### Fix 4: WhatsApp alert sharing via `wa.me` deep link
**File**: `src/pages/ProactiveAlerts.tsx`
**File**: `src/components/proactive/AlertEvidenceSection.tsx`

Add a "Share on WhatsApp" button on each alert card that:
- Composes a message with: alert title + message + action text (in farmer's language)
- Opens `https://wa.me/?text=...` (self-share) or `https://api.whatsapp.com/send?text=...`
- This uses the farmer's own WhatsApp app — no API key needed
- Works on both mobile (opens WhatsApp app) and desktop (opens web.whatsapp.com)

**Note**: Auto-sending WhatsApp messages without user action is NOT possible without a WhatsApp Business API (paid service requiring Meta verification). The `wa.me` deep link approach is the best option — it pre-fills the message and the farmer taps "Send".

### Fix 5: Auto-compose WhatsApp for critical alerts
**File**: `src/hooks/useProactiveAlerts.ts`

When a CRITICAL priority alert arrives via realtime, show a toast with a "Send to WhatsApp" action button that opens the pre-composed `wa.me` link. This nudges farmers to share critical alerts with family/advisors.

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/ProactiveAlerts.tsx` | Add sticky header with back button, add WhatsApp share button per alert |
| `src/pages/Home.tsx` | Improve bell icon visibility |
| `src/hooks/useProactiveAlerts.ts` | Add toast notification on new alert arrival |
| `src/components/proactive/AlertEvidenceSection.tsx` | No changes needed |

## What This Does NOT Change
- No changes to AI Chat pipeline
- No changes to crop schedule system
- No changes to the proactive evaluator edge function
- No new database tables or API keys needed
- No WhatsApp Business API required — uses native `wa.me` deep links

