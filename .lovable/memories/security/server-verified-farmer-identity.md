---
name: Server-verified farmer identity
description: Farmer/tenant identity comes only from an x-session-token verified against user_sessions; farmer-auth core is served by both farmer-auth and tenant-config.
type: feature
---

- `public.get_current_farmer_id()` / `get_current_tenant_id()` resolve **only** through
  `public.verified_session_context()`, which hashes the `x-session-token` request header
  (`hash_session_token` = SHA-256 hex) and matches an active, unexpired `public.user_sessions` row.
  The old `x-farmer-id` / `x-tenant-id` header fallbacks were spoofable and are removed — never re-add them.
- All farmer credential operations (lookup, register, verifyPin, changePin, logout) live in
  `supabase/functions/_shared/farmer-auth-core.ts`. PIN hash = `SHA256(pin + "kisan_shakti_2024")`
  (legacy-compatible). No endpoint returns `pin_hash`; there is **no** unauthenticated PIN reset —
  changing a PIN requires the current PIN or a live session for the same farmer.
- The core is mounted on two slugs: `farmer-auth` and, as an always-reachable transport,
  `tenant-config` (POST bodies carrying an `action`). `src/services/farmerAuthService.ts` tries
  `farmer-auth` first and falls back to `tenant-config` on 404.
- The Supabase project has a hard cap on edge-function slots: creating a new function fails
  ("Could not deploy") until an existing function is deleted.
- The client stores the token in `localStorage['ks_session_token']` and sends it on every
  PostgREST request via `src/integrations/supabase/client.ts` (`setSessionToken`).
