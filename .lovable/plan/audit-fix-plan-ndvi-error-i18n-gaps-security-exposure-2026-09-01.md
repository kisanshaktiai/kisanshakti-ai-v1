# Audit + Fix Plan: NDVI error, i18n gaps, security exposure

Three audits are complete (codebase + live database). Findings below are verified against the live Supabase project unless marked "unconfirmed".

---

## 1. Security — critical, fix first

The live database was queried directly. Two confirmed holes let an attacker with nothing but the public app key read and modify other farmers' data.

### 1a. Anyone can overwrite any farmer's PIN (account takeover)
Live policy on `farmers`:

```text
"Allow pre-auth PIN setup by mobile and tenant"  UPDATE  TO public
USING (mobile_number IS NOT NULL AND tenant_id IS NOT NULL)
```

Any anonymous caller can send one HTTP request to the public REST endpoint and set `pin_hash` for any farmer row, then log in as that farmer. No session, OTP, or ownership check.

Fix: drop this policy and move PIN setup/reset into an edge function that runs with the service role and verifies OTP/session before writing `pin_hash`.

### 1b. Identity is taken from client-controlled headers
`get_current_tenant_id()` and `get_current_farmer_id()` read `x-tenant-id` / `x-farmer-id` out of `request.headers`. 62 policies across 34 tables (farmers, lands, ndvi_data, crop_schedules, chat, alerts, subscriptions) trust those functions. The browser sets those headers itself (`supabaseWithAuth` in `src/integrations/supabase/client.ts`), so an attacker can substitute any farmer/tenant UUID and read that farmer's data.

The edge-function guard has the same gap: `_shared/tenantAccessGuard.ts` skips the JWT-vs-header spoof check whenever the caller uses the anon key, and `requireSessionToken: true` is never used anywhere in the codebase.

Fix (staged, so nothing breaks):
1. Make the session token mandatory: verify `x-session-token` against `active_sessions` (unexpired, matching farmer+tenant) inside a security-definer function, and use that as the identity source instead of raw headers.
2. Turn on `requireSessionToken` in the shared edge guard and reject anon-key calls that carry a farmer id without a valid session token.
3. Only after 1–2 are live, re-point the header-trusting policies at the verified identity function.

### 1c. Public read surface leaks farmer UUIDs
`community_members`, `farmer_achievements`, `farmer_gamification`, `farmer_follows`, `followers` and similar have `SELECT USING (true)` to public — this hands an attacker the valid `farmer_id` / `tenant_id` pairs needed for 1a and 1b. `farmer_gamification` additionally has `FOR ALL USING (true)`, so anyone can write it.

Fix: scope these to the caller's tenant, and remove the write-open policy on `farmer_gamification`.

### 1d. Anon read on `farmers` by mobile
`"Auth: lookup by mobile within tenant"` allows anon SELECT on `farmers` scoped only by the spoofable tenant header — a full PII dump per tenant. Replace with a security-definer RPC that returns only "exists / needs PIN" for a given mobile number.

---

## 2. NDVI error on the land card

Chain: land card NDVI button → `/app/lands/:id/ndvi` → `NDVIAnalysis.tsx` → `useNDVIAnalysis` → tables `ndvi_data`, `ndvi_processing_logs`, `ndvi_micro_tiles`.

Verified against the live DB:
- All three tables and every column the hook selects exist. `ndvi_data` has 2,736 rows, latest 2026-08-27. No name mismatch.
- `ndvi_processing_logs` has exactly one SELECT policy: admins only (`admin_users.id = auth.uid()`). Farmers can never read it, so the thumbnail / processing-status half of the screen is permanently empty. It fails quietly today, but the page has no error state at all — `useNDVIAnalysis` throws on a failed `ndvi_data` query and `NDVIAnalysis.tsx` never renders that error, so a real failure surfaces as a crash or a blank screen rather than a message.
- `ndvi_micro_tiles` SELECT requires `auth.uid()` via `user_tenants` — also never true for farmer sessions (custom auth), so it always returns empty.

Plan:
1. Reproduce in the browser on a real land to capture the exact error (console + network), before changing anything. The page imports maplibre-gl at module scope, so a map-init failure is a second candidate cause alongside the query paths above.
2. Add a proper error state to `NDVIAnalysis.tsx` (message + retry) and wrap the route in an error boundary so a map/render failure never blanks the screen.
3. Fix the policies: give farmers tenant+land-scoped SELECT on `ndvi_processing_logs` and `ndvi_micro_tiles` using the verified-identity function from section 1, not the raw header.
4. Add the missing `tenant_id` filter on the `ndvi_data` reads inside `supabase/functions/lands-api/index.ts` (~lines 358 and 505).

---

## 3. i18n gaps

Two parallel systems: i18next (`src/i18n/locales/*.json` flat + 27 namespace files under `en/`, `hi/`, `mr/`) and the `ui_translations` DB table (780 rows).

Confirmed gaps:
- **186 keys are called in code but do not exist in English anywhere** — including `chat.tts.*` (23), `ndvi.banner|prediction|trend|health_score.*` (~18), `perm.*` (13), `common.*` (14), `quota.*` (10), `schemes.*` (10), `error.*` (5), `sync.*` (4), `reels.*` (7), plus a long tail. These render as raw keys or blank.
- **Punjabi and Tamil have no namespace files at all** — only the 381-key flat file, so most of the app falls back to English for those users.
- **Marathi missing 38 chat keys** (all of `chat.messages.tts.*`) and **14 profile keys** (`profile.tts.*`); Hindi missing 8 `lands.wizard.*` keys and 36 flat `schedule.*` keys.
- **Key-path mismatch from an old refactor**: code calls `chat.tts.*` while JSON defines `chat.messages.tts.*`; same for `chat.messages.feedback_yes` vs `chat.messages.feedback_section.feedback_yes`.
- **251+ hardcoded English strings** in user-facing JSX. Worst: `ProfileEdit.tsx` (29 — the entire form), `EditLandWizard.tsx` (16), `AIScheduleDashboard.tsx` (18), `WeatherAlerts.tsx` (11), `MarketingInsightsDashboard.tsx` (13), plus marketplace, voice onboarding, subscription, soil-health screens. This count excludes `placeholder`, `aria-label`, and toast strings, so the real number is higher.

Plan (ordered by farmer impact):
1. Reconcile the `chat.tts.*` / `feedback_section` path mismatches — pick one path and update call sites.
2. Add the 186 missing English keys, then translate into hi and mr.
3. Backfill the mr/hi per-namespace gaps (chat TTS, profile TTS, lands wizard, schedule toasts).
4. Localize the top hardcoded screens: ProfileEdit, EditLandWizard, WeatherAlerts, Subscription, SoilHealthReport, then the schedule dashboards.
5. Decide on pa/ta: either generate the 27 namespace files or drop them from the language picker rather than shipping a half-English experience.
6. Add a CI check script that fails when a `t()` call has no English key, so this cannot regress.

---

## Technical notes

- Policy changes go through migrations; no table schema changes are needed for the NDVI fix.
- The session-token identity change (1b) touches every farmer-facing query path — it must be shipped behind a compatibility window where both the old header path and the new verified path are accepted, then the header path removed.
- No service-role key was found in frontend code; the anon key is public by design. The problem is that the anon key alone is currently sufficient to impersonate a farmer.

## Suggested order

1. Section 1a + 1c + 1d (immediate, small, high impact)
2. Section 2 (NDVI repro + error state + policies)
3. Section 1b (staged session-token identity)
4. Section 3 (i18n, incremental)
