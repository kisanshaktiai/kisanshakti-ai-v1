

## Root Cause Analysis

From console logs + code audit, the subscription chip and proactive alerts intermittently fail to appear because of **Supabase Realtime channel saturation and dropouts**, not data issues. DB has 10+ pending alerts and an active Shakti subscription — both are healthy.

### Confirmed issues

1. **Realtime channel storm** — At least 5 separate channels open simultaneously per session:
   - `realtime-{tenant}-lands-{user}` (useRealtimeData)
   - `realtime-{tenant}-crop_schedules-{user}` (useRealtimeData)
   - `realtime-{tenant}-schedule_tasks-{user}` (useRealtimeData)
   - `subscription:{farmerId}` (SubscriptionContext)
   - `proactive_alerts:{user.id}` (useProactiveAlerts in AppLayout)
   
   Console shows repeated `CHANNEL_ERROR`, `TIMED_OUT` for all of them. When a channel times out, its hook silently stops receiving updates → chip/alerts go blank on next state change.

2. **No realtime fallback for proactive alerts** — `useProactiveAlerts` only fetches once on mount. If the user opens the app while alerts exist but the channel times out, they show on mount but never refresh. There is no polling fallback, no visibility-based refetch, no offline cache.

3. **Subscription chip blank during reconnect** — `SubscriptionHeaderChip` returns `null` while `isLoading`. If RPC call fails during a network blip and offline IndexedDB has nothing yet (first login), chip shows pulsing skeleton forever.

4. **Proactive alerts not mirrored offline** — Unlike subscriptions (now in IndexedDB), `proactive_alerts` is not synced to localDB. Going offline = empty alerts page even if 10 alerts exist on server.

5. **Channel name collision risk** — `useProactiveAlerts` is called twice: once in `AppLayout` (with realtime) and once in `ProactiveAlerts` page (with `skipRealtime: true`). Safe, but if user navigates fast, AppLayout's channel can leak before remount.

6. **No retry on `CHANNEL_ERROR`** — `useRealtimeData` and SubscriptionContext just log the error. No reconnection logic. Once dropped, channel stays dead until full page reload.

---

## Fix Plan (5 targeted changes)

### Phase 1 — Realtime resilience (`useRealtimeData.ts`, `SubscriptionContext.tsx`, `useProactiveAlerts.ts`)
- On `CHANNEL_ERROR` / `TIMED_OUT` → exponential backoff retry (3 attempts: 2s, 5s, 10s), then give up and rely on polling.
- Single shared cleanup pattern (use `removeChannel` + null the ref before retry).

### Phase 2 — Polling fallback when realtime fails
- `useProactiveAlerts`: 60s `setInterval` refetch as safety net (cheap, only when tab visible).
- `useSubscription`: visibility-change refetch is already there → keep, plus invalidate on window `online` event.
- `SubscriptionHeaderChip`: when `isLoading && !data` for >5s, fall back to "Free" tone instead of skeleton.

### Phase 3 — Offline mirror for proactive alerts
- Add `proactiveAlerts` store to `localDB.ts` (schema bump v9 → v10).
  - Indexes: `farmer_id`, `status`, `created_at`.
  - Methods: `saveProactiveAlerts(alerts[])`, `getProactiveAlerts(farmerId, includeHistory)`.
- `syncService.downloadServerData()`: add proactive alerts download (last 100 per farmer) right after subscription data.
- `useProactiveAlerts.fetchAlerts`: if Supabase query fails OR `navigator.onLine === false`, fall back to `localDB.getProactiveAlerts(user.id, showHistory)`.

### Phase 4 — Header chip visibility hardening (`SubscriptionHeaderChip.tsx`)
- Replace infinite skeleton with: after 3s loading and no data → render compact "Free" chip optimistically (will reconcile on data arrival).
- Add tooltip showing last-sync time on hover/tap so user knows why a stale value might display.

### Phase 5 — Channel consolidation (defensive)
- `useProactiveAlerts` in `AppLayout`: keep realtime ON.
- Document that any other mount of `useProactiveAlerts` MUST pass `skipRealtime: true` (already done in `ProactiveAlerts.tsx`).
- Add a console warn if a second realtime instance is created in the same session.

---

## Files to modify

| File | Change |
|---|---|
| `src/hooks/useRealtimeData.ts` | Add retry-with-backoff on error/timeout |
| `src/hooks/useProactiveAlerts.ts` | Polling fallback + offline read + retry on channel error |
| `src/contexts/SubscriptionContext.tsx` | Retry on channel error |
| `src/components/subscription/SubscriptionHeaderChip.tsx` | Loading-timeout → optimistic "Free" chip |
| `src/services/localDB.ts` | Add `proactiveAlerts` store, bump schema, add getters/savers |
| `src/services/syncService.ts` | Download proactive alerts after subscription data |

## No changes to

- DB schema, RLS, edge functions
- Subscription RPC / payment webhook
- Existing localDB stores for subscriptions (already in place)
- UI structure of pages

## Risk & rollback

- Schema bump wipes only `proactiveAlerts` store (new) → no data loss.
- Retry logic is additive: if it fails, behaviour is identical to current (silent dead channel).
- Polling at 60s adds ~1 read/min per user (RLS-scoped, indexed) — negligible cost.

