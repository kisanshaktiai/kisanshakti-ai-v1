# Soil fetch release contract

## Runtime flow

The existing land-card Soil route opens SoilHealthReport. GET
`lands-api?action=soil&land_id=<uuid>` authenticates using the existing verified
session guard and returns owned land metadata, saved laboratory/manual data,
model report, job state and worker readiness. The browser never receives a server
key or sends a trusted polygon/farmer identity in the request body.

The Get soil data action POSTs to that same route. `soil_enqueue` reads canonical
`lands.boundary_geom`, serializes requests per land, reuses an eligible complete
six-month report or active job, and rate-limits repeated starts. The Python worker
claims a ten-minute lease, fetches SoilGrids native pixels and a 4–20-position
zigzag plan, reports real layer progress, and commits using `soil_complete`.
The page polls every four seconds while the job is queued/running and recovers the
same job when reopened. It does not queue on every page visit.

## Storage and reuse

- `soil_fetch_jobs`: durable state, captured boundary, lease, retry count, progress.
- `soil_parcel_reports`: full per-depth report, source units, sample/pixel evidence,
  source/algorithm versions and six-month expiry. Service-only; read through Edge.
- `soil_health`: compatibility summary of a COMPLETE report's 0–5 cm values.
  The projection is skipped if ANY manual/lab row exists; no lab row is updated.
  Available N/P/K and fabricated fertility classifications are never generated.
  Old model-derived N/P/K values on the selected model summary are cleared.
  Existing readers (chat, analytics, scheduling, land details) continue to read
  this shared table. The full new report remains accessible even with a lab row.

Legacy `soil_health` triggers remain in place. Existing downstream environmental
observations from older imports are not rewritten by this migration. New map
estimates must not be presented as fresh laboratory samples. Compatibility values
are explicitly 0–5 cm, not a blended whole-profile laboratory test.

## Existing-server deployment

No server connection has been supplied to this session. Docker/Compose files in
`kisanshakti-soil-engine` prepare the runtime for the user's existing server.

1. Review both PRs and run the disposable PostgreSQL/worker and UI CI jobs.
2. Apply `20261116085603_soil_fetch_jobs.sql` to an isolated staging project.
3. On the existing server, check out the engine change. Copy `.env.example` to a
   private `.env`. Set staging SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and an
   operator-verified SOILGRIDS_SOURCE_VERSION. Run `docker compose up -d --build`.
4. Deploy the modified `lands-api` with the established auth configuration
   (`verify_jwt=false`, because the function verifies the custom farmer session).
5. Release the app branch pointed at the same staging project.
6. Sign in as a staging farmer, fetch a synthetic registered parcel, leave/reopen
   the page, verify job completion, full report and compatibility row, then verify
   a second click reuses the saved report. Test another farmer's land is denied.
7. Only after successful staging acceptance, deploy the same migration, worker,
   Edge route and UI to production with separately supplied production secrets.

Readiness uses worker heartbeat within two minutes. A service-only diagnostic
HTTP sampling endpoint is not sufficient; the continuously running queue worker
is required. No heartbeat → fetch button unavailable, saved reports still load.
No inbound worker HTTP port is needed. Worker crashes recover through lease expiry
(up to three attempts). Stale leases cannot commit. Changed land ownership or
boundaries are rejected at completion. Source-version changes invalidate cache.

## Rollback

Stop the worker and roll back the UI/Edge deployments; retain additive queue and
report tables for evidence. Do not drop tables with reports or attempt to reverse
old lab records. Database writes and production rollout are not performed by CI.

## Validation scope

Python tests cover provider/parser/sampling and worker behavior. Frontend tests
cover start/poll/error/read states. Edge tests cover ownership, no worker, model
summaries and lab precedence. Disposable PostgreSQL tests execute the actual
migration and Python worker with a fixture provider: enqueue, deduplication,
completion, persistence, cache, expired leases, boundary changes and permissions.
Responsive browser tests use synthetic fixtures; no real farmer records or keys.
A live registered-land deployment test is still required on the target server.
