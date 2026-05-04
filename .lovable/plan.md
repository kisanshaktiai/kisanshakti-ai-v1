# Login regression — root-cause audit and fix plan

## What I verified

### Bug 1 — `validate_farmer_pin` RPC returns 404 / SQL error
Network log of the live login attempt shows:
```
POST /rpc/validate_farmer_pin → 404
{"code":"42883","message":"function digest(text, unknown) does not exist"}
```
The new RPC body uses `digest(p_pin || 'kisan_shakti_2024', 'sha256')`, but `pgcrypto` is installed in the `extensions` schema, while the function's `search_path` is set to `'public'` only. Postgres can't resolve `digest`, so the RPC always errors. The client then falls into its hash-compare fallback, which works for most farmers — but on this account the stored value is wrong (Bug 2), so the user sees "Incorrect PIN".

### Bug 2 — 2 farmers have plaintext (4-char) PINs in `pin_hash`
```
SELECT id, mobile_number, pin_hash, length(pin_hash) FROM farmers
 WHERE length(pin_hash) <> 64;
-- 155588c4… 9860989495  pin_hash='1234'  (the user logging in right now)
-- fca5a67d… 8485019495  pin_hash='9898'
```
These two rows were created/updated by an old code path that wrote the raw PIN into `pin_hash`. The salted-SHA256 client compare can never match, so login is permanently broken for them until the value is re-hashed.

The console log confirms it for the affected user:
```
Farmer search result: { mobile_number: "9860989495", pin_hash: "1234" }
Error verifying PIN: "Incorrect PIN"
```
(The leftover `pin_hash` selection in the log comes from `AuthScreen` — informational only, login itself reads the row again inside `offlineAuthService.performOnlineAuth`.)

### Bug 3 — `/forgot-pin` route does not exist → 404 page
`PinAuth.tsx:309` calls `navigate('/forgot-pin')`, but `src/App.tsx` has no such route, so React Router falls through to the catch-all NotFound page (the screenshot you sent). There is also no ForgotPin component anywhere in the codebase.

## Fixes

### A. Repair the RPC so it actually executes
Migration — replace the 3-arg `validate_farmer_pin` so it can resolve `digest`:

```sql
CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id uuid, p_pin text, p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_hash text;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM public.farmers
  WHERE id = p_farmer_id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = encode(
    extensions.digest((p_pin || 'kisan_shakti_2024')::bytea, 'sha256'),
    'hex'
  );
END $$;
```
Two changes vs current: include `extensions` on `search_path`, and cast the input to `bytea` so the `digest(bytea,text)` overload matches unambiguously.

### B. Re-hash the 2 plaintext PINs in place
Same migration (one-time data fix) — only touches rows whose `pin_hash` is not 64 chars, so it's idempotent and safe:

```sql
UPDATE public.farmers
SET pin_hash = encode(
  extensions.digest((pin_hash || 'kisan_shakti_2024')::bytea, 'sha256'),
  'hex'
),
    pin_updated_at = now()
WHERE pin_hash IS NOT NULL AND length(pin_hash) <> 64;
```
After this, farmer `9860989495` logs in with PIN `1234`, farmer `8485019495` with PIN `9898` — exactly what they originally set. No farmer is forced to reset.

### C. Build the missing `/forgot-pin` page
1. New file `src/pages/ForgotPin.tsx` — mobile-only screen that:
   - Pre-fills the mobile from `localStorage.authMobile`.
   - Confirms identity by re-checking the farmer row exists for that mobile + active tenant (same query as `AuthScreen`).
   - Sends the user to `/set-pin` with `localStorage.farmerId` and `localStorage.tenantId` set, in **reset mode** (a flag like `localStorage.setItem('pinResetMode','1')`).
   - `SetPin.tsx` already supports updating an existing farmer (line 160 path); it just needs to read the reset flag, skip the "create new farmer" branch, and clear the flag after success.
   - Clear cached offline auth (`offlineAuthService.clearCachedAuth()`) on success so the new PIN takes effect immediately offline too.
2. Register the route in `src/App.tsx` next to `/pin-auth`:
   ```tsx
   { path: "/forgot-pin",
     element: <Suspense fallback={<PageLoader/>}><ForgotPin/></Suspense>,
     errorElement: <RouteErrorBoundary/> }
   ```
3. Use existing i18n keys (`auth.forgotPin`, `auth.contactSupport`, `auth.createPin`, etc.) — no new translations needed.

## Out of scope (per your standing instructions)
- Custom farmer auth model (mobile + PIN + `pin_hash`) — unchanged.
- Supabase Auth for SaaS admin / tenant — untouched.
- PIN masking, plaintext column drop, RLS — already shipped in the previous round.

## Files / objects touched
1. Migration: replace `validate_farmer_pin(uuid,text,uuid)` body + one-row UPDATE for the 2 stale hashes.
2. `src/pages/ForgotPin.tsx` — new component.
3. `src/pages/SetPin.tsx` — honour `pinResetMode` flag (skip insert branch, clear cached offline auth on save).
4. `src/App.tsx` — register `/forgot-pin` route + lazy import.

## Verification after deploy
1. Login as `9860989495` with PIN `1234` → success via RPC (no more "Incorrect PIN").
2. Login as `8485019495` with PIN `9898` → success.
3. All other farmers (already 64-char hashed) continue to log in normally.
4. Wrong PIN → "Incorrect PIN" + attempt counter, no 500.
5. Tap "Forgot PIN?" → `/forgot-pin` renders (no 404), reset flow lands on `/set-pin`, new PIN works on next login.
