# Mask Farmer PIN Input + Safely Remove Plaintext PIN Column

## Audit findings (verified)

### 1. PIN digits visible on screen
`src/pages/PinAuth.tsx` and `src/pages/SetPin.tsx` use `<InputOTPSlot>` from `src/components/ui/input-otp.tsx`, which renders the raw typed character in a `<div>`. As the farmer types the 4-digit PIN, real digits like `1·2·3·4` appear on screen — a shoulder-surfing risk.

### 2. How farmer login actually works (custom auth — NOT changing it)
- **Set/Reset PIN** (`SetPin.tsx`): computes `pinHash = SHA256(pin + 'kisan_shakti_2024')` and writes BOTH `pin_hash` (the salted hash) AND `pin` (plaintext, labelled "remove in production").
- **Login** (`PinAuth.tsx` → `offlineAuthService.performOnlineAuth`):
  1. Fetches farmer row by id+tenant.
  2. Calls RPC `validate_farmer_pin(p_farmer_id, p_pin, p_tenant_id)`.
  3. **Fallback**: if RPC fails/false, compares `farmer.pin_hash !== this.hashPin(pin)` (salted SHA256). If that also mismatches, it last-resorts to `farmer.pin !== pin` plaintext.
- **Offline login** (`offlineAuthService.authenticateOffline`): uses ONLY the salted `pin_hash` from IndexedDB.

### 3. Database state (verified via `SELECT`)
- All 24 farmer rows have `pin_hash` populated (64-char SHA256). 23/24 also have plaintext `pin`.
- The salted-hash login path **already works for every farmer** — no farmer depends on the plaintext column to log in.

### 4. Risk of dropping `pin` column blindly (must fix first)
- `validate_farmer_pin(uuid, text, uuid)` RPC selects `pin` and `pin_hash`, then checks `v_stored_pin = p_pin` OR `v_stored_hash = encode(digest(p_pin,'sha256'),'hex')` (unsalted). Neither branch matches our client's *salted* hash → today this RPC effectively returns true only via the plaintext branch. If we drop `pin` without rewriting the RPC, the function will error (`column "pin" does not exist`).
- `src/services/syncService.ts:534` writes `pin: f.pin` into IndexedDB during pull-sync. Will produce undefined column on the server SELECT once dropped (the `select('*')` is fine, but the local mapping just stores `undefined` — harmless, but we'll clean it up).
- `src/services/offlineAuthService.ts:278` has the `farmer.pin !== pin` plaintext fallback — needs removal.
- `src/pages/AuthScreen.tsx:89` selects `pin` in its column list — will error after drop; remove from the select.
- `src/pages/SetPin.tsx:105,160` writes `pin: pin` on insert/update — will error after drop; remove.

## Changes (ordered — code first, DB last)

### A. Mask PIN slots visually
`src/components/ui/input-otp.tsx` — extend `InputOTPSlot` props with optional `mask?: boolean`. When true, render `•` in place of the typed char. Value flowing through `OTPInput.onChange` is unchanged, so verification logic is untouched.

```tsx
{char ? (mask ? <span aria-hidden className="text-2xl leading-none">•</span> : char) : null}
```

Apply `mask` to:
- `src/pages/PinAuth.tsx` — 4 slots.
- `src/pages/SetPin.tsx` — both "create PIN" and "confirm PIN" groups.

(Existing OTP usages elsewhere keep digits visible — opt-in.)

### B. Stop writing & reading plaintext `pin` in app code
- `src/pages/SetPin.tsx` (lines 105 & 160): remove the `pin: pin,` field from both insert and update payloads. Keep `pin_hash` and `pin_updated_at`.
- `src/pages/AuthScreen.tsx` (line 89): change select list from `'id, mobile_number, pin, pin_hash, tenant_id, farmer_code'` to drop `pin`.
- `src/services/offlineAuthService.ts` (lines 274–286): remove the `if (farmer.pin !== pin)` plaintext fallback. Final check is just `farmer.pin_hash !== pinHash` → return Incorrect PIN.
- `src/services/syncService.ts` (line 534): remove `pin: f.pin,` from the bulkSave mapping.

### C. Rewrite `validate_farmer_pin` RPC to match client's salted scheme
The client uses `SHA256(pin + 'kisan_shakti_2024')`. Update the 3-arg RPC so it checks only `pin_hash` against the same salted scheme; drop the plaintext branch:

```sql
CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id uuid, p_pin text, p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hash text;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM public.farmers
  WHERE id = p_farmer_id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = encode(digest(p_pin || 'kisan_shakti_2024', 'sha256'), 'hex');
END $$;
```

Net effect on login flow: identical to the client-side fallback that already works for all 24 farmers.

### D. Drop the plaintext column (last step)
```sql
ALTER TABLE public.farmers DROP COLUMN IF EXISTS pin;
```

Pre-flight verified: every farmer's `pin_hash` is present and matches the salted scheme that both `SetPin.tsx` and `offlineAuthService.hashPin` use, so login continues to work for every existing farmer after the drop.

## Login regression test (manual, after deploy)
1. Existing farmer logs in with their current 4-digit PIN → success via `pin_hash` (RPC or client fallback).
2. New farmer registers via `SetPin` → row inserted with `pin_hash` only; immediately logs out and back in → success.
3. Offline login (airplane mode) using cached IndexedDB `pin_hash` → success (already only uses hash).
4. Wrong PIN → "Incorrect PIN" + attempt counter increments.
5. PIN slots render `•` instead of digits while typing on both screens.

## Out of scope (per user instruction)
- Custom farmer auth model untouched (mobile + PIN + `pin_hash`).
- Supabase Auth (SaaS admin / tenant) untouched.
- No RLS, store, or routing changes.

## Files touched
1. `src/components/ui/input-otp.tsx` — add `mask` prop.
2. `src/pages/PinAuth.tsx` — pass `mask` on 4 slots.
3. `src/pages/SetPin.tsx` — pass `mask` on 8 slots; remove `pin: pin` from 2 payloads.
4. `src/pages/AuthScreen.tsx` — drop `pin` from one select list.
5. `src/services/offlineAuthService.ts` — remove plaintext fallback.
6. `src/services/syncService.ts` — drop `pin: f.pin` from bulkSave map.
7. Migration: replace `validate_farmer_pin(uuid,text,uuid)` body, then `ALTER TABLE farmers DROP COLUMN pin`.
