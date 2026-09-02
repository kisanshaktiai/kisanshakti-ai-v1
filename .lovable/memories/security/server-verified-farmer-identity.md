---
name: Server-verified farmer identity
description: Farmer/tenant identity comes only from an x-session-token verified against user_sessions; farmer-auth core is served by both farmer-auth and tenant-config; PIN reset is SMS-OTP only.
type: feature
---

- `public.get_current_farmer_id()` / `get_current_tenant_id()` resolve **only** through
  `public.verified_session_context()`, which hashes the `x-session-token` request header
  (`hash_session_token` = SHA-256 hex) and matches an active, unexpired `public.user_sessions` row.
  The old `x-farmer-id` / `x-tenant-id` header fallbacks were spoofable and are removed — never re-add them.
- All farmer credential operations (lookup, register, verifyPin, changePin, logout,
  requestPinReset, verifyPinReset) live in `supabase/functions/_shared/farmer-auth-core.ts`.
  PIN hash = `SHA256(pin + "kisan_shakti_2024")` (legacy-compatible). No endpoint returns `pin_hash`.
- Forgot-PIN recovery is **SMS OTP only**: `requestPinReset` stores only a SHA-256 hash of a
  6-digit code in `public.pin_reset_codes` (10-min TTL, max 5 attempts, 3/hour, 60s between sends)
  and `verifyPinReset` rewrites the PIN and kills all sessions. Never ask for the current PIN in the
  forgot-PIN flow; `changePin` still requires the current PIN or a live session.
- SMS delivery uses MSG91 (`MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_OTP_TEMPLATE_ID`).
  Those secrets are NOT set yet, so `requestPinReset` returns `sms_not_configured` (503) today.
- `farmerAuthService.call()` throws `FarmerAuthError('transport_unavailable')` when every endpoint
  fails without an HTTP status; `offlineAuthService` rethrows that code so cached offline PIN
  validation runs. Credential errors stay terminal — never conflate the two.
- The core is mounted on two slugs: `farmer-auth` and, as an always-reachable transport,
  `tenant-config` (POST bodies carrying an `action`). `src/services/farmerAuthService.ts` prefers
  `tenant-config`; the `farmer-auth` slug currently returns 404 (edge-function slot cap).
- The client stores the token in `localStorage['ks_session_token']` and sends it on every
  PostgREST request via `src/integrations/supabase/client.ts` (`setSessionToken`).
