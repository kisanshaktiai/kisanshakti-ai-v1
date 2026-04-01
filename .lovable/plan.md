

# UX Fix: Remove Bell from Header + 3-Layer Alert System

## Problem

The bell icon is `fixed top-[18px] right-4 z-50` in `Home.tsx`, overlapping with the AppLayout header's right-side controls (Language, Sync, Connection). This:
- Hides the language selector (critical farmer control)
- Gives passive alerts prime header real estate
- Violates mobile UX hierarchy for farmer users

## Current State

```text
Header:  [Logo + Name]                    [Connection] [Sync] [Language]
Home:    [Bell icon overlapping header at z-50]  ← PROBLEM
```

## Fix Plan

### 1. Remove Bell Icon from Home Page Header

**File**: `src/pages/Home.tsx`
- Remove the entire `<Link to="/app/proactive-alerts">` bell icon block (lines 270-290)
- Remove the `Bell` import from lucide-react (line 29)
- Remove `useProactiveAlerts` import and usage from Home.tsx (line 43, 72) — alert listening moves to AppLayout

### 2. Move Real-Time Alert Listener to AppLayout (Global)

**File**: `src/components/AppLayout.tsx`
- Import and call `useProactiveAlerts()` at the layout level so real-time toast notifications work on ALL pages, not just Home
- This ensures the realtime Supabase listener + toast + WhatsApp critical nudge fires globally
- No bell icon rendered — alerts come TO the user via toast

### 3. Add Alerts Summary Section in Home Page (Inside Recent Activity Area)

**File**: `src/pages/Home.tsx`
- After the "Recent Activity" card (line ~846), add an "Alerts Summary" card
- Shows latest 2-3 alerts inline with priority badges, land name, and "View All" link
- Tapping opens `/app/proactive-alerts`
- Only renders if `alertUnreadCount > 0`

### 4. Restore Clean Header

**File**: `src/components/AppLayout.tsx` — already correct:
```text
[Logo + Name]          [Connection] [Sync] [Language]
```
No changes needed here — removing the z-50 bell overlay fixes it.

## Architecture After Fix

```text
Layer 1 — Push Notification:  (existing PWA/browser notification via notificationService)
Layer 2 — In-App Toast:       useProactiveAlerts() in AppLayout → sonner toast on INSERT
Layer 3 — Alerts History:     Home page "Recent Alerts" card + /app/proactive-alerts page
```

## Files Changed

| File | Change |
|---|---|
| `src/pages/Home.tsx` | Remove bell icon block; add alerts summary card in content area |
| `src/components/AppLayout.tsx` | Add `useProactiveAlerts()` for global real-time listening |

## What Does NOT Change
- `useProactiveAlerts.ts` hook — already has toast + WhatsApp logic
- `ProactiveAlerts.tsx` page — remains the full alerts center
- `proactive-evaluator` edge function — no changes
- AppLayout header structure — already correct without the bell overlay

