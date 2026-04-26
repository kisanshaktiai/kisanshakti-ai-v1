# Deep Audit: Post-Login "Old View / No Farmer Data" Bug

## 🔴 Root Causes Found (confirmed from code + edge logs)

### Bug #1 — `src/utils/supabase.ts` uses the WRONG env var name (CRITICAL)
```ts
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';   // ❌ undefined
// .env actually exports VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(...) : null;  // ⇒ null
```
**Effect:** `supabase` exported from `@/utils/supabase` is **`null`** in production.

### Bug #2 — `landsApi.getHeaders()` crashes on that null client
```ts
// src/services/landsApi.ts line 56
const { data: { session } } = await supabase.auth.getSession();
//                                    ^^^^^^^^^^^^^ TypeError: null
```
The `try/catch` at line 70 swallows the TypeError as "context error", retries 10× over ~5s, then throws **"Session expired. Please log in again to manage lands."** Result: `useLands` falls back to **empty localDB** (first login has nothing cached) → home shows zero lands → user sees "old view / no data".

This is asymmetric with `schedulesApi` (which doesn't import `@/utils/supabase` and doesn't try `getSession()` — that's why **schedules work but lands don't**, exactly as the edge logs prove: schedules-api succeeds, lands-api logs `NO_AUTH_HEADER`.)

### Bug #3 — Edge auth log noise: `403: invalid claim: missing sub claim`
This is the Supabase Auth REST endpoint (`/auth/v1/user`) being called with the **anon key** as a Bearer (anon JWT has no `sub`). Source: `landsApi.ts` falling back to `bearer = ANON_KEY` and Supabase JS internally sometimes calling `getUser()` with it. Harmless once Bug #1 is fixed because we'll stop calling auth at all from landsApi.

### Bug #4 — `useLands` enabled gate is too tight after restoration race
`enabled: !!(user?.id && tenantId)` — fine, but on a fresh login the React Query may fire **before** `setGlobalAuthData` has been observed by `dataIsolation.getIsolationContext()`. Then `landsApi.getHeaders()` throws. We add a small "headers-ready" gate.

### Bug #5 — `PinAuth` navigates with `setTimeout(100)` and `replace: true` AFTER `setUser` triggered a partial re-render
This works most of the time, but the navigation sometimes lands on `/app` while the `useLands` query is already mid-flight with stale (logged-out) state, producing the "old view" flash. We'll await one tick and let the global headers settle.

---

## ✅ The Fix (4 small, surgical changes)

### Fix 1 — Repair `src/utils/supabase.ts` so the fallback client is real
- Read `VITE_SUPABASE_PUBLISHABLE_KEY` (current env name) with `VITE_SUPABASE_ANON_KEY` as a backwards-compat fallback.
- Re-export the **same singleton** from `@/integrations/supabase/client` instead of creating a parallel client. This eliminates the "Multiple GoTrueClient instances" warning forever and removes the `null` failure mode.

### Fix 2 — Stop calling `supabase.auth.getSession()` in `landsApi.getHeaders()`
The app uses **custom auth** (x-farmer-id / x-tenant-id headers). The edge guard already has a fast-path for anon-key Bearer (`isAnonKeyRequest()` in `tenantAccessGuard.ts`). So we just send `Bearer ${ANON_KEY}` unconditionally — exactly what `schedulesApi` does (which works). No reason to involve `auth.getSession()` at all.

### Fix 3 — Make `landsApi` symmetrical with `schedulesApi`
- Same retry budget (5 attempts × 300 ms instead of 10 × variable).
- Same headers shape.
- Throw a clearer error after exhaustion.

### Fix 4 — Tighten the post-login navigation in `PinAuth.tsx`
Replace the `setTimeout(100)` + `navigate(replace)` with an `await waitForHeaders()` immediately after `setUser/setSession`, then `navigate('/app', { replace: true })` synchronously. This guarantees the next render of `Home` sees the correct user and `useLands` fires with valid headers on the first attempt.

### Fix 5 — Invalidate React Query cache on login
After `setUser` in `PinAuth`, call `queryClient.invalidateQueries()` so any stale cache from a previous user/session is purged. This eliminates the "old view" flash entirely.

### Fix 6 — Add a `useAuthReady()` selector and gate `useLands`/`useSchedules` on it
A tiny zustand selector that returns `isAuthenticated && !!user?.id && !!user?.tenantId && globalHeadersReady`. Wires into the `enabled` flag of every authenticated query. Prevents queries from firing in the gap between `setSession` and `setGlobalAuthData`.

---

## Files to change (6 total — all small, all surgical)

1. `src/utils/supabase.ts` — re-export singleton, fix env name
2. `src/services/landsApi.ts` — drop `auth.getSession()`, mirror schedulesApi
3. `src/pages/PinAuth.tsx` — await `waitForHeaders`, `invalidateQueries`, drop setTimeout
4. `src/hooks/useAuthReady.ts` — **new** tiny hook (10 lines)
5. `src/hooks/useLands.ts` — gate `enabled` on `useAuthReady()`
6. `src/hooks/useSchedules.ts` — same gate (defensive — already mostly OK)

## Out of scope (already correct)
- `tenantAccessGuard.ts` — the anon-key bypass works correctly; schedules-api proves it
- `authStore.checkAuth()` — restoration is synchronous and sets headers immediately
- `TenantContext` — loads cleanly per logs
- Edge functions — no changes needed, no redeploy needed

## Verification after fix
1. Hard refresh, log in fresh → `Home` shows lands within ~1s, no "old view" flash
2. Edge logs: `lands-api` calls succeed (200) instead of `NO_AUTH_HEADER` (401)
3. No more "Multiple GoTrueClient instances" warning
4. No more "invalid claim: missing sub claim" auth log spam

## Production-scale notes (1M+ users)
- Single Supabase client singleton (memory + WebSocket savings)
- Anon-key Bearer + custom headers means **zero round-trips to /auth/v1/user** per request
- React Query stale-time of 5 min + realtime invalidation already in place
- No additional indexes/migrations needed for this fix
