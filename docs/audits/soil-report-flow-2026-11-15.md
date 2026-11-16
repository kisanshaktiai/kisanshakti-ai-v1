# Soil report flow audit — 2026-11-15

Scope: farmer app `kisanshakti-ai-update` at c1d4115; Soil button, route,
entitlement gate, report components, authenticated client, and read-only inspection
of the connected Supabase soil schema. No production writes or deployment.

## Findings

- ModernLandCard already routes the selected land to `/app/lands/:id/soil`,
  and App.tsx already mounts SoilHealthReport. No new page or route is needed.
- FeatureRouteGate enforces the `soil_health` entitlement. This is retained.
- SoilHealthReport previously queried on mount without waiting for authentication
  readiness; absent rows triggered a destructive toast and `navigate(-1)`.
  Failed reads then rendered the same generic empty screen with no retry.
- Requests were not isolated by active farmer/tenant in the page and a late response
  could replace the report after navigation. Existing RLS remains authoritative;
  explicit filters are added as defense in depth.
- Optional profile lookups did not check their error. The primary report should
  remain available without decoration.
- pH/organic-carbon formatting assumed numeric JavaScript values. Numeric-string
  responses now render safely; missing values remain missing and zero is preserved.
- Current production soil_health has 36 rows (26 soilgrid, 10 manual), covering
  36 lands; seven lands have no row. Existing rows have consistent farmer IDs.
- The soil-source evidence table is service-only and separate from soil_health.
  It must not be queried directly by the browser or relabelled as a parcel report.
- The dedicated engine has no deployed farmer fetch-and-save contract. Its draft
  service provides sampling diagnostics only. A frontend-only change cannot make
  first-time fetching work. No fake endpoint, credential, generated report, or
  successful-job state has been introduced.

## Changes

Reuse the existing route and components. Load through supabaseWithAuth after header
readiness, require a server session token, check selected-land ownership, scope
report/profile reads, and reject responses after session replacement. Query state
is keyed by land/farmer/tenant/session creation time, with no retained inactive cache.
Read the latest dated report, then creation time and ID for deterministic ties.
Show distinct empty/error/loading states and a manual read retry. Back returns to
that land explicitly. Added English, Hindi and Marathi state messages and a clear
map-estimate notice for source `soilgrid`.

## Verification

- 19 regression tests passed: loader authorization/ownership, query failures,
  no-row case, session changes, numeric formatting, rendered empty/error/retry,
  authentication readiness and modelled-report display.
- Production Vite/PWA build and repository prebuild guards passed.
- Frontend TypeScript check and changed-file ESLint passed.
- No authenticated farmer browser session was exercised. The exact error seen on
  the user's device has not been captured, so the identified defects must not be
  presented as a reproduced device-specific stack trace.

## Remaining integration

Owner-checked backend request, durable Python worker, report/evidence persistence,
lab-result precedence, source/depth/unit-safe consumer contract, and first-time
fetch integration tests in staging are still required. The existing soil_health
triggers and schema are unchanged; this PR does not solve their provenance issues.
