# Header Modernization Plan — 2030-Ready Mobile-First

## Issues Audited
1. **SubscriptionHeaderChip** — Inner text uses tinted text on tinted background (`bg-success/10 text-success`, `bg-warning/10 text-warning`) → low contrast, hard to read on light/dark.
2. **Static label** — Chip only shows plan name OR days; user wants it to **rotate** between plan name and days remaining over time.
3. **HeaderActionsSheet** — A `MoreHorizontal` button opens a **bottom drawer** for Connection / Sync / Language. This is two clicks for a single dropdown choice and is not "2030-ready". Should be **inline icons with native dropdowns** opening directly from the header.
4. **Duplicate sync logic** — `ConnectionStatusIcon` and `SyncButton` both poll `localDB.getSyncMetadata()` every 5 s, both render online/offline/sync state. Two competing sources of truth.
5. **Online status hidden** — Connection icon is buried inside the bottom drawer. Should be **always visible on the top bar** as a small live status dot.

## Changes

### 1. `SubscriptionHeaderChip.tsx` — readability + rotating label
- **Contrast fix**: Replace `bg-x/10 text-x` with **solid filled pill** using foreground tokens:
  - Free → `bg-success text-success-foreground`
  - Shakti → `bg-gradient-to-r from-primary to-accent text-primary-foreground`
  - Pro → `bg-warning text-warning-foreground`
  - Expired → `bg-destructive text-destructive-foreground`
  - Warn (grace/expiring) → `bg-warning text-warning-foreground`
- **Rotating label**: Add a `useEffect` interval (4 s) that alternates between two states:
  - State A: plan name + tier icon (e.g., "Shakti" + Sparkles)
  - State B: days remaining (e.g., "23d left" + Clock icon)
  - Use `AnimatePresence` + slide/fade for smooth swap (motion-safe only).
  - Only rotate when there's meaningful days info (`daysRemaining > 0` and active/grace). For Free or Expired, show static label.
- Keep ring gradient + warning dot; bump font to `text-[11px]` and `h-7` for clarity.

### 2. New `src/components/header/HeaderStatusDot.tsx` — always-visible online indicator
- Tiny 8 px pulsing dot + tooltip on tap (popover) showing: Online/Offline, Last sync, Pending changes.
- Colors: `bg-success` online, `bg-muted-foreground` offline, `bg-warning animate-spin` syncing.
- Replaces `ConnectionStatusIcon` for header use (existing component stays for backward compat, but no longer mounted).

### 3. New `src/components/header/UnifiedSyncButton.tsx` — merge Connection + Sync
- **Single icon button** on the header (RefreshCw + small status dot overlay).
- Opens **DropdownMenu** (not drawer) directly from the header — anchored, inline, mobile-first.
- Menu items:
  - 🔄 Quick Sync
  - 🗄️ Full Reload
  - ───
  - Status block: "● Online · Last sync: 5m ago · 2 pending"
- Reuses sync logic from current `SyncButton.tsx` (extract handler into `useSyncAction()` hook so we don't fork code).
- Eliminates the duplicate `localDB.getSyncMetadata()` poller — single shared hook `useSyncMetadata()`.

### 4. New `src/hooks/useSyncMetadata.ts` and `src/hooks/useSyncAction.ts`
- `useSyncMetadata`: single 5 s poll, returns `{ lastSyncTime, pendingChanges, syncInProgress }`. Used by both the header status dot and the dropdown.
- `useSyncAction`: extracts the `handleSync(forceFull)` logic from `SyncButton.tsx` so it can be reused without duplicating ~100 lines.

### 5. `LanguageSelector` — keep as-is (already a proper dropdown)
- Just mount it inline in the header instead of inside the drawer. Hide the text label on mobile (`<sm`) → icon-only with native dropdown opening from anchor.

### 6. `AppLayout.tsx` — header layout swap
Replace:
```tsx
<SubscriptionHeaderChip />
<HeaderActionsSheet />
```
With:
```tsx
<SubscriptionHeaderChip />            {/* rotating, high-contrast */}
<HeaderStatusDot />                   {/* always-visible online dot */}
<UnifiedSyncButton />                 {/* sync dropdown, inline */}
<LanguageSelector />                  {/* lang dropdown, inline icon-only */}
```
- Use `gap-1.5` to keep all four within the 390 px viewport.
- Remove `HeaderActionsSheet` import (file kept for now in case of rollback; can be deleted in follow-up).

## Files
- ✏️ `src/components/subscription/SubscriptionHeaderChip.tsx` — solid colors + rotating label
- 🆕 `src/components/header/HeaderStatusDot.tsx`
- 🆕 `src/components/header/UnifiedSyncButton.tsx`
- 🆕 `src/hooks/useSyncMetadata.ts`
- 🆕 `src/hooks/useSyncAction.ts`
- ✏️ `src/components/sync/SyncButton.tsx` — refactor to use `useSyncAction` (no behavior change for other callers)
- ✏️ `src/components/LanguageSelector.tsx` — icon-only on mobile
- ✏️ `src/components/AppLayout.tsx` — swap drawer for inline icons

## Out of Scope
- Deleting `HeaderActionsSheet.tsx` and `ConnectionStatusIcon.tsx` — kept for any other callers; can be cleaned up after verification.
- i18n keys for the new "23d left" / "Online" / "Last sync" strings will be added in `en/sync.json` + `hi/sync.json` + `mr/sync.json` (small, ~6 keys each).

## Result
Top bar (single row, 390 px): `[Logo + name]  [🌟 Shakti / 23d left ⇄]  [● dot]  [⟳]  [🌐]` — every action one tap, dropdowns open inline (no bottom sheet), high-contrast labels, and a single source of truth for sync state.
