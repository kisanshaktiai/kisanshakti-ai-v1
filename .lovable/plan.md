# KisanShakti AI — Corrected Audit & Fix Plan (Farmer App, tenant-scoped)

Scope: current branch + live Supabase project. Multi-tenant SaaS; tenant scope is never bypassed. Target authorization chain:

```text
VALID SESSION TOKEN → ACTIVE SESSION → VERIFIED TENANT_ID → VERIFIED FARMER_ID
→ FARMER / LAND OWNERSHIP → RESOURCE ACCESS
```

Tenant filtering is not removed anywhere. It is made server-verified.

---

## SECTION 0 — Current-state certificate (live DB, verified this session)

Confirmed by direct query against the live project:

| Object | Verified state |
|---|---|
| `farmers` RLS | Enabled. 7 policies (listed in 1A/1E). |
| `get_current_tenant_id()` | `SECURITY DEFINER`; returns `request.headers ->> 'x-tenant-id'`, falling back to `current_setting('app.tenant_id')`. Client-controlled. |
| `get_current_farmer_id()` | Same pattern on `x-farmer-id`. Client-controlled. |
| `has_tenant_access(uuid)` | service_role → true; super admin → true; else `get_current_tenant_id() = check_tenant_id`. So it inherits the header trust. |
| Policies trusting headers | **62 policies across 34 tables** (`qual` references `has_tenant_access` / `get_current_tenant_id` / `request.headers`). |
| Open policies | **196 policies with `qual = true` across 162 tables** (mix of service_role-only, reference data, and farmer-owned — classification required, see 1D). |
| `active_sessions` | Columns: id, user_id, tenant_id, session_started_at, last_active_at, client_info, is_active, ip_address, user_agent, created_at, updated_at. **No token column, no expires_at. 0 rows.** |
| `user_sessions` | Columns include session_id, access_token_hash, refresh_token_hash, expires_at, is_active. **0 rows.** |
| `farmers` | 28 rows. |
| `x-session-token` | Read in `_shared/authMiddleware.ts:242`; only ever checked for *presence* (`requireSessionToken`, line 287). Never validated against any table. No call site sets `requireSessionToken: true`. |
| `ndvi_data` | RLS on. SELECT `has_tenant_access(tenant_id)`; INSERT permissive; UPDATE `has_tenant_access`. 2,736 rows, latest date 2026-08-27. |
| `ndvi_processing_logs` | RLS on. Exactly one SELECT policy: `admin_users.id = auth.uid()` — unreachable for farmer sessions. 5,961 rows. |
| `ndvi_micro_tiles` | RLS on. SELECT requires `user_tenants.user_id = auth.uid()` — unreachable for farmer sessions. 3 rows. |
| `ui_translations` | 780 rows. |

**Consequence that changes the sequencing:** there is currently **no server-side session store in use** (both session tables are empty and no code validates a token). A verified-identity resolver cannot be switched on until session issuance exists. Building that is therefore step P0-2, not an afterthought.

### Not yet proven (must be verified before the matching change lands)
- Whether every one of the 196 `qual = true` policies is unsafe — needs per-policy classification (1D).
- Whether farmer login currently issues any token at all, and where it would be written — needs a read of the auth/OTP/PIN flow (`src/stores/authStore.ts`, `src/pages/PinAuth.tsx`, `src/pages/MobileAuth.tsx`, `verify_otp_session`).
- The actual NDVI failure mode — unreproduced; see Part 3. No fix is committed to a cause yet.
- Whether community tables are tenant-local or cross-tenant by product design (1D).
- Whether any of the 186 "missing English keys" are in fact served by `ui_translations` at runtime.

---

## PART 1 — SECURITY P0

### 1A. PIN / account takeover — CONFIRMED
Live policy on `public.farmers`:

```text
"Allow pre-auth PIN setup by mobile and tenant"   UPDATE   TO public
USING (mobile_number IS NOT NULL AND tenant_id IS NOT NULL)
```

Any anonymous caller holding the public app key can update `pin_hash` for any farmer row and then log in as that farmer. This is a live account-takeover path.

Also live and public-writable on `farmers`: `"Allow tenant-scoped farmer registration"` (INSERT, `TO public`, WITH CHECK only requires the three fields to be non-null).

Fix:
- Drop the pre-auth PIN UPDATE policy. Farmers keep only the ownership-scoped UPDATE, which after P0-2 resolves identity from the verified session.
- Move PIN setup/reset into a server-controlled edge function: verify mobile ownership (OTP) → verified identity → verified tenant → service-role write of `pin_hash` for that farmer only.
- Constrain registration INSERT to the same server path rather than an open public policy.
- Confirm `pin_hash` is not selectable on any client-reachable path (audit the SELECT column exposure on `farmers`, and every view over it).

### 1B. Client-controlled identity headers — CONFIRMED
`supabaseWithAuth()` (`src/integrations/supabase/client.ts:144-154`) sets `x-farmer-id` / `x-tenant-id` from browser state; the DB identity functions read those headers back as truth. `_shared/tenantAccessGuard.ts:97-122` skips JWT/spoof validation entirely for anon-key callers (`jwtUserId` stays null, so the check at :139-145 never fires), leaving only "does this farmer belong to this tenant", which is true for every real farmer.

Required end state:

```text
x-session-token → verify active, unexpired session → session_id → tenant_id → farmer_id
→ VerifiedRequestContext
```

Implementation:
1. **Session issuance.** On successful PIN/OTP login, the server mints an opaque token, stores its hash in the session table with `farmer_id`, `tenant_id`, `expires_at`, `is_active`, and returns the raw token to the client once. Decide during implementation whether to use `user_sessions` (already has token-hash + expiry columns) or extend `active_sessions`; both are empty, so either is a clean start and no data migration is needed.
2. **Resolver.** A `SECURITY DEFINER` function `verified_session_context()` that hashes `request.headers ->> 'x-session-token'`, looks up the active unexpired row, and returns `(session_id, tenant_id, farmer_id)`. Thin wrappers `verified_tenant_id()` / `verified_farmer_id()` for policy use.
3. **Shadow validation.** For a defined window, resolve identity from the session *and* compare with the legacy headers, logging mismatches. The verified value is always the one used; a mismatch never authorizes anything and never falls back to the header.
4. **Cutover.** Re-point the 62 header-trusting policies at the verified functions, then enable `requireSessionToken: true` in the shared edge guard and reject anon-key calls carrying a farmer id without a valid token.
5. Remove the header path only after mismatch logs are clean.

No compatibility path leaves a forged header authoritative at any stage.

### 1C. Tenant-first authorization
Every tenant-owned resource enforces `resource.tenant_id = verified.tenant_id` first; farmer-owned resources add `farmer_id = verified.farmer_id`; land-derived resources resolve through an authorized `land_id` (verified tenant + farmer ownership) rather than trusting a client UUID.

Audit sweep across: farmers, lands, crop schedules, NDVI (all three tables), weather, GDD/env observations, soil, chat sessions/messages, alerts, recommendations, subscriptions, profile data. Output is a table per resource: verified tenant? land-authorized? farmer-owned? identity source? cross-tenant UUID reachable?

### 1D. Public / open policies — classification required
196 `qual = true` policies over 162 tables. Each is classified as: intentionally public and safe (reference/agronomy data — e.g. crops, crop_stage_master, chemical_regulatory_status), tenant-scoped but wrongly public, farmer-owned and unsafe, administrative, or unknown.

Known-suspect set to resolve first (these leak the farmer/tenant UUIDs that make 1B exploitable): `community_members`, `farmer_achievements`, `farmer_gamification` (also `FOR ALL USING (true)` — open writes), `farmer_follows`, `followers`, plus the community post/poll/like family.

The product question — are communities tenant-local or cross-tenant? — is answered before any policy change; the fix differs materially between the two models. Open writes on farmer-owned records are removed regardless.

### 1E. Mobile lookup — CONFIRMED
Live policy: `"Auth: lookup by mobile within tenant"` — SELECT `TO anon`, scoped only by the spoofable `get_current_tenant_id()`. This is a per-tenant PII dump of the `farmers` table to anonymous callers.

Replace with a narrow `SECURITY DEFINER` RPC that takes mobile + tenant and returns only `{ exists, requires_pin_setup }`. No farmer UUID, tenant UUID, pin_hash, profile, or metadata. Then drop the anon SELECT policy.

---

## PART 2 — Verified identity migration

Deliverables in order:
1. Current-state certificate extended with: the full 62-policy list, the full public-grant list, the session-issuance code path, and the classified 196-policy inventory. (Section 0 above is the verified core; the exhaustive lists are produced as the first implementation step.)
2. Session issuance + `verified_session_context()` resolver.
3. Shadow validation window with mismatch telemetry.
4. Policy cutover, table group by table group, starting with `farmers` and `lands`.
5. Edge guard cutover (`requireSessionToken: true`, anon-key farmer-id rejection).
6. Legacy header removal.

The existing custom session model is completed and hardened — no parallel auth architecture is introduced.

---

## PART 3 — NDVI

No cause is committed to yet. The two policy facts below are real but are not yet proven to be *the* error the user sees.

**Step 1 — reproduce.** With a real authorized farmer session, authorized tenant, authorized land, open the land card → NDVI and capture: console, network response, HTTP status, Supabase error payload, edge function logs, the failing query, and any MapLibre init error (`NDVIMapView.tsx` imports `maplibre-gl` at module scope, so a map failure is a live candidate alongside the query paths).

**Step 2 — UI states.** `NDVIAnalysis.tsx` currently renders loading and a `NoData` empty state but has **no error branch at all** — `useNDVIAnalysis` throws on a failed `ndvi_data` query (`useNDVIAnalysis.ts:196`) and nothing catches it. Add explicit loading / success / empty / error states with a farmer-readable message, retry, and safe fallback, plus a route-level error boundary as secondary protection only.

**Step 3 — per-path access audit.** Enumerate every query path over `ndvi_data`, `ndvi_processing_logs`, `ndvi_micro_tiles` and classify each individually as tenant-safe / land-safe / both / unsafe / service-role-only. Known paths: `useNDVIAnalysis.ts`, `useLandChatContext.ts`, `useAnalyticsData.ts`, `supabase/functions/lands-api/index.ts` (~358 and ~505, missing an explicit `tenant_id` filter on the NDVI reads), plus the weather/NDVI resolver. No blanket conclusion is drawn from one path.

**Step 4 — policy repair.** Verified findings to act on: `ndvi_processing_logs` SELECT is admin-only and `ndvi_micro_tiles` SELECT requires `auth.uid()`, so both are permanently empty for farmer sessions — the processing/thumbnail and micro-tile features cannot work today. Replace with verified-tenant + authorized-land predicates once the resolver from P0-2 exists.

**Step 5 — cross-tenant NDVI test** (Part 5).

---

## PART 4 — i18n

### 4A. Canonical key structure first
Resolve the path mismatches before any translation work: `chat.tts.*` vs `chat.messages.tts.*`, and `chat.messages.feedback_yes` vs `chat.messages.feedback_section.feedback_yes`. Pick one canonical structure, then update call sites and en/hi/mr (and pa/ta) together.

### 4B. Deterministic completeness audit
Build a script (not a one-off grep) that resolves `t()`, `i18n.t()`, namespace-aware calls, and static key references, and reports: missing English keys, missing keys per language, dynamic/unresolvable keys separately, and explicit false-positive exclusions. English is the baseline. It also checks `ui_translations` so DB-served keys are not miscounted as missing.

Indicative current numbers from the exploratory pass (to be replaced by the script's output, not treated as final): ~186 code-referenced keys with no English definition; mr missing 38 chat + 14 profile keys; hi missing 8 lands-wizard + 36 flat schedule keys.

### 4C. Language coverage
Audit pa and ta before touching the picker: registration, flat files, namespace files, fallback behaviour, real runtime coverage. Exploratory finding to verify: neither has the 27 namespace directories that en/hi/mr have. Then recommend one of — complete the namespaces, explicit temporary fallback, or temporarily hide. No language is removed on assumption.

### 4D. Hardcoded UI text
Deterministic inventory covering visible text, buttons, dialogs, errors, toasts, placeholders, and accessibility labels (the exploratory JSX-only sweep found 251 and explicitly missed the last three categories). Prioritized by farmer impact: Profile → Land create/edit → NDVI/crop health → Weather alerts → AI schedule → Subscription → Soil health → Marketplace → Marketing insights.

### 4E. CI enforcement
Fail the build when a `t()` call has no English key.

---

## PART 5 — Adversarial tests (definition of done for security work)

| # | Scenario | Required result |
|---|---|---|
| 1 | Tenant A session + Tenant B resource UUID | 0 rows / 403 |
| 2 | Farmer A session + Farmer B private resource UUID | 0 rows / 403 (unless explicitly shared) |
| 3 | Valid session + forged `x-tenant-id` | 403 or ignored; forged tenant never effective |
| 4 | Valid session + forged `x-farmer-id` | 403 or ignored; forged farmer never effective |
| 5 | Valid farmer + tenant UUIDs, no valid session | 401 / 403 |
| 6 | Anonymous credential (PIN) update attempt | 401 / 403 |
| 7 | Tenant A session + Tenant B `land_id` (NDVI) | 0 rows / 403 |

Run against REST and edge-function surfaces, before and after each cutover step.

---

## Implementation order

**P0 — release blocker**
1. Drop the public PIN-update policy; move PIN setup/reset server-side (1A).
2. Replace the anon mobile-lookup policy with the minimal RPC (1E).
3. Classify and repair unsafe open/write-open policies, starting with the UUID-leaking set (1D).
4. Build session issuance + `verified_session_context()` resolver (1B).
5. Shadow validation, then policy + edge-guard cutover (1B, 1C).
6. Adversarial tests 1–6.

**P1 — NDVI**
Reproduce → UI states + error boundary → per-path audit → policy repair on verified identity → test 7.

**P2 — i18n**
Canonical keys → deterministic audit → English baseline → hi/mr backfill → pa/ta decision → localize high-impact screens → CI gate.

---

## Risk, impact, rollback

- **Regression risk (highest):** the identity cutover touches every farmer-facing read. Mitigated by the shadow-validation window, per-table-group cutover, and running the adversarial suite between groups.
- **Tenant-isolation impact:** strictly tightening. No step widens access; tenant filters stay in place and gain a server-verified source.
- **Rollback:** each policy change ships as its own migration with an explicit inverse migration; the resolver functions are additive until the cutover migration re-points policies, so rollback is re-pointing them back. The edge-guard flag (`requireSessionToken`) is a single toggle.
- **Blocking dependency:** steps 5 and P1 step 4 require session issuance (step 4) to be live; they are not attempted before it.

Approve this and I will start with the current-state certificate extension and P0 step 1.
