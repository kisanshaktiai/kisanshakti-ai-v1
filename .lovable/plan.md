# Restore a working "Forgot PIN" recovery path

## Confirmed problem

A farmer who forgets their PIN currently has no way back into the app:

- `ForgotPin` only verifies the mobile number exists, sets `requiresCurrentPin = true`, and sends the farmer to `/set-pin`.
- `SetPin` then blocks submission until a 4-digit **current** PIN is entered — the very thing the farmer forgot.
- Server side, `changePin` accepts only: matching current PIN, a live session token for that farmer, or a farmer with no PIN set. None applies, so the request returns 401.

Result: permanent lockout, with no OTP or support-driven reset anywhere in the codebase.

## Proposed fix: SMS OTP reset

1. **Server (`_shared/farmer-auth-core.ts`)**
   - New action `requestPinReset`: validates mobile + tenant, rate-limits per mobile (e.g. 3 per hour, 60s between sends), generates a 6-digit code, stores only its SHA-256 hash with a 10-minute expiry in a new `pin_reset_codes` table, and dispatches the SMS via the existing SMS provider secret.
   - New action `verifyPinReset`: checks the code hash, expiry and attempt count (max 5), then sets the new PIN, issues a session, invalidates the code and all other active sessions for that farmer.
   - `changePin` stays exactly as-is (still requires current PIN or live session).

2. **Database migration**
   - `pin_reset_codes` (id, farmer_id, tenant_id, code_hash, expires_at, attempts, consumed_at, created_at), no client grants (edge-function/service-role only), RLS enabled with no permissive policies.

3. **Client**
   - `farmerAuthService`: add `requestPinReset` and `verifyPinReset`.
   - `ForgotPin`: after lookup, send the OTP and show a code + new-PIN + confirm-PIN step; on success store the returned session and go to `/app`. Stop setting `requiresCurrentPin`.
   - `SetPin`: keep the `requiresCurrentPin` branch for the *signed-in* "change my PIN" case only.
   - Add i18n keys (en/hi/mr) for OTP send, resend timer, invalid/expired code, and rate-limit messages.

4. **Verification**
   - Adversarial checks: wrong code rejected, expired code rejected, code reuse rejected, cross-tenant mobile rejected, rate limit enforced, and `changePin` still refuses without proof.

## Requires from you

Confirmation of which SMS provider/secret to use for OTP delivery (an existing provider secret, if one is already configured, otherwise a new one to add).

## Interim option

If OTP delivery is not available soon, the fallback is to change `ForgotPin` to state plainly that PIN reset requires contacting support, rather than routing farmers into a dead end that demands the forgotten PIN.
