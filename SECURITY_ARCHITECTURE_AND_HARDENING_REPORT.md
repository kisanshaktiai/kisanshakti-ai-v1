# SECURITY_ARCHITECTURE_AND_HARDENING_REPORT

## Scope
Branch baseline: `kisanshakti-ai-update`.
This hardening branch makes only surgical changes to authentication storage and the farmer offline-sync boundary. Agronomy, crop scheduling, AI decision logic, and tenant business behavior are intentionally unchanged.

## Implemented changes

### 1. Offline authentication credential boundary
- Removed the plaintext `localStorage` backup/fallback for `offline_auth_data`.
- Offline credentials remain in IndexedDB metadata only.
- New offline PIN enrollment uses Web Crypto PBKDF2 with a random per-record salt and 100,000 iterations.
- Added local failed-attempt tracking and a 15-minute lock after five failed attempts.
- New cached farmer/profile objects are sanitized to remove PIN/session/reset credential fields.
- Existing legacy offline records without the new verifier are not accepted; the farmer must authenticate online once to re-enroll.

### 2. Generic farmer sync boundary
- Removed authentication fields from the `FarmerData` offline projection.
- Generic farmer uploads strip PIN/login security fields.
- Server-to-device farmer mapping no longer copies PIN hash or login-attempt state into localDB.

### 3. Client-generated credential cleanup
- Removed `Math.random()` from the client flow identifier.
- The client-generated value is explicitly non-authoritative; server-issued farmer-auth sessions remain the only online authentication credential.
- Removed timestamp-derived offline token generation.

### 4. Logout boundary
- Logout now clears the offline credential cache in addition to clearing the in-memory and server-session state.

## Remaining high-priority items requiring environment-aware implementation

### A. Server session token persistence
The current server-issued opaque session token is still persisted by the existing client session architecture. Replacing this safely requires the project's actual Capacitor/native secure-storage dependency and runtime configuration. It was not guessed or added in this surgical patch to avoid breaking login persistence.

Recommended target:
- Native: OS Keychain / Android Keystore-backed storage abstraction.
- Web/PWA: explicitly document the browser-storage threat model and require PIN re-verification after app restart when a protected native store is unavailable.

### B. Database SECURITY DEFINER and legacy functions
`set_app_session` and historical PIN helper functions require a live Supabase schema/function inventory before revoke/drop changes. Do not blindly remove them from source migrations because deployed dependencies may still exist.

Required live audit:
- list current functions and EXECUTE grants
- inspect `SECURITY DEFINER` functions
- verify `search_path`
- revoke anonymous access where not required
- verify no legacy PIN function is reachable from the client

### C. Edge Function authorization classification
`verify_jwt = false` remains deliberate for compatibility with the custom farmer session architecture, but each function still needs a function-by-function classification:
- PUBLIC
- AUTHENTICATED (server session required)
- INTERNAL (not directly callable by farmer clients)

### D. Service-role review
Every `SUPABASE_SERVICE_ROLE_KEY` consumer still requires a function-level check proving authorization and tenant ownership before privileged data access.

### E. CORS
The shared wildcard CORS policy remains unchanged in this patch because changing it globally can break existing web/native deployment origins. It should be split by endpoint class after confirming deployed origins.

## Security invariants after this patch

- Server-issued session remains the authority for online access.
- Generic sync never carries farmer PIN hashes or login counters.
- Offline PIN verification uses a separate local credential record.
- Offline credentials are not copied to localStorage.
- Client-generated IDs are not authentication credentials.
- Logout removes the local offline credential.

## Verification required before merge

Run on this branch:
1. TypeScript/build.
2. Existing unit/integration tests.
3. Login and logout smoke test.
4. Offline login after one successful online enrollment.
5. Wrong offline PIN five times -> local lockout.
6. Online login after legacy offline cache -> new credential re-enrollment.
7. Confirm localDB contains no `pin_hash`.
8. Confirm sync payloads contain no farmer authentication fields.
9. Tenant A/B cross-access regression tests.
10. Bearer SAST and secrets scan.

Do not claim production security sign-off until the remaining environment-aware database, service-role, endpoint-classification, and token-storage reviews are completed.
