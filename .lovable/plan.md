# Step 2 — Harvest Engine without burning an edge-function slot

We will NOT create a new `harvest-engine` edge function. Instead we mount the engine as a new action inside the existing **`schedules-api`** edge function (the natural owner of `crop_schedules` / `lands` / `harvest_confirmation_requests`), and drive it via `pg_cron` → `pg_net`. Zero new deploy slots used.

## Why schedules-api (not ai-smart-schedule)

| Candidate | Fit | Verdict |
|---|---|---|
| `schedules-api` | Already uses service-role, already routes by `?action=`, already reads/writes `crop_schedules` + `lands`, already imports variety helpers. | ✅ Host here |
| `ai-smart-schedule` | LLM-heavy, per-request farmer-scoped, 4623 LOC, expensive cold start — wrong tool for a background sweep. | ❌ |
| `proactive-evaluator` | Already busy every 15 min on a different domain (alerts), tenant-loop pattern differs. | ❌ Keep isolated |

## Engine responsibilities (matches the Step-1 schema)

The Step-1 migration (`20260606150014_*.sql`) already installed:
- enums + lifecycle columns on `lands` / `crop_schedules`
- `harvest_confirmation_requests` table with unique partial index `uniq_hcr_open_per_schedule`
- triggers `fn_cascade_harvest_completion` + `fn_block_double_active_schedule`
- audit table `crop_lifecycle_events`

So the cron engine only needs to do the **time-based transitions and notifications** the DB cannot do on its own:

1. **MATURITY DETECTION** — for each active schedule where `expected_harvest_date <= today` AND `harvest_status='NOT_STARTED'` AND `lifecycle_status IN ('GROWING','SOWN','PLANNED')`:
   - update `crop_schedules.lifecycle_status='MATURITY_REACHED'`
   - update `lands.lifecycle_status='WAITING_HARVEST_CONFIRMATION'`
   - INSERT into `harvest_confirmation_requests` (the partial unique index dedupes)
   - INSERT `crop_lifecycle_events` row (`MATURITY_REACHED`)
   - emit a row in existing `notifications` table (farmer push/inbox)

2. **REMINDERS** — for `harvest_confirmation_requests` rows where `status='PENDING'` AND `last_reminded_at < now() - interval '2 days'` AND `reminder_count < 5`:
   - `reminder_count += 1`, `last_reminded_at=now()`
   - emit notification

3. **EXPIRY** — `status='PENDING'` AND (`due_at < now()` OR `reminder_count >= 5`):
   - `status='EXPIRED'`
   - audit event `HARVEST_REQUEST_EXPIRED` (land stays in `WAITING_HARVEST_CONFIRMATION` so farmer can still confirm manually; we do NOT auto-release)

Every step is wrapped in tenant-scoped service-role queries, batched in pages of 200 schedules per tick to keep CPU bounded.

## Multi-tenant safety

- Engine queries are scoped per `tenant_id` (loop over distinct tenants found in the candidate set) — same pattern as `proactive-evaluator`.
- Service-role only; never trusts client headers in this code path.
- The unique partial index `uniq_hcr_open_per_schedule` makes the INSERT idempotent across cron ticks and concurrent invocations.
- All writes go through the existing triggers, so `fn_block_double_active_schedule` and `fn_cascade_harvest_completion` continue to be the single source of truth for state transitions.

## Auth model for the cron call

`schedules-api` today requires `x-tenant-id`/`x-farmer-id` headers and would reject a cron call. We add an early branch:

```
if request.url has ?action=harvest-engine AND req.header['x-service-token'] === Deno.env.HARVEST_ENGINE_TOKEN:
    run engine (service role), return summary
```

The token is stored as a Supabase secret and embedded in the pg_cron call.

## Cron wiring

Inserted via the Supabase insert tool (not a migration — contains project URL + secret), every 30 minutes:

```sql
select cron.schedule(
  'harvest-engine-every-30min',
  '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/schedules-api?action=harvest-engine',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'x-service-token', current_setting('app.harvest_engine_token', true)
       ),
       body := '{}'::jsonb
     ); $$
);
```

The token is also exported to Postgres via `ALTER DATABASE … SET app.harvest_engine_token = '…'` so the cron SQL can read it without inlining the secret.

## File changes

1. **`supabase/functions/schedules-api/harvest-engine.ts`** (new, ~250 LOC) — pure module exporting `runHarvestEngine(supabase): Promise<EngineSummary>` with the three steps above. Co-located inside the same function folder so it ships with `schedules-api` (no separate deploy).
2. **`supabase/functions/schedules-api/index.ts`** — small additions:
   - import `runHarvestEngine`
   - early-return branch for `action=harvest-engine` + `x-service-token` check
   - returns `{ ok, matured, reminders_sent, expired, duration_ms }`
3. **Secret** `HARVEST_ENGINE_TOKEN` — added via secrets tool.
4. **Cron + GUC** — inserted via `supabase--insert` tool (not a migration, per instructions for user-specific URLs/keys).

No changes to `ai-smart-schedule`, `proactive-evaluator`, RLS, or any client code.

## Verification after build

- `supabase--curl_edge_functions` POST to `schedules-api?action=harvest-engine` with the token → expect JSON summary.
- `select * from cron.job where jobname='harvest-engine-every-30min'` → confirm row.
- `supabase--read_query` on `harvest_confirmation_requests` to confirm PENDING rows appear for matured schedules in test data.
- Re-run the engine; same set yields `matured=0` (idempotency proof).

## Rollback

- `select cron.unschedule('harvest-engine-every-30min')`
- Revert the two `schedules-api` files (action branch + new module).
- Step-1 schema stays — it's harmless without the engine.

Approve to switch to build mode and execute.
