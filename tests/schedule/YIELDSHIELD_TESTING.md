# Test YieldShield without touching production

The existing application hardcodes production Supabase in two places; the
YieldShield test mode in this PR overrides both places and rejects production
credentials. It is used ONLY with Vite `--mode yieldshield-test`.

## Prerequisites

- GitHub branch `feature/yieldshield-surgical-fixes-20261108`
- Isolated Supabase project or preview branch (schema migrated, test data seeded)
- Staging-only Edge Functions deployed there OR local Supabase CLI stack
- A test farmer session (custom `x-session-token`) and synthetic crop/land/variety data
- Staging secrets for functions that depend on them (never copy production secrets)

## Frontend test setup

1. Copy `.env.yieldshield-test.example` to `.env.yieldshield-test.local`.
2. Set *only* the isolated project's URL, project ref and publishable/anon key.
3. Run `bun install --frozen-lockfile`.
4. Run `bun run dev --mode yieldshield-test`.
5. Open the Vite local URL and check Network requests: calls to
   `schedules-api`, `ai-smart-schedule` and PostgREST MUST use the test host.
6. Use a staging farmer/land/crop setup; production user sessions are not reused.

The app throws at startup if test configuration is omitted or points to the
known production project. Other legacy components may contain production
hardcoded URLs; do not test unrelated features until those are also audited
or isolated. Never input real farmer credentials or use production data.

## Local function testing (without ANY hosted deployment)

Run the project-local Supabase stack with Docker: `supabase start`.
With local migrations and representative fixtures applied, execute:
`supabase functions serve ai-smart-schedule`,
`supabase functions serve schedules-api`, and
`supabase functions serve schedule-reconciler` as supported by your CLI.
Use local URL `http://127.0.0.1:54321` and the local anon key in
`.env.yieldshield-test.local`. Obtain keys from `supabase status`.

Some existing historical migrations contain hardcoded remote production
HTTP URLs and periodic jobs. Inspect and disable external cron/HTTP calls
in the isolated test database before enabling migrations or schedules.
DO NOT run `supabase db push`, `supabase db reset --remote`,
`supabase functions deploy`, or `supabase secrets set` while linked
to the production project.

## Staging/preview branch testing

- A GitHub code branch does NOT automatically imply a Supabase preview branch.
- Supabase branches are isolated, usually data-less by default; seed
  approved synthetic agronomy fixtures and test farmer sessions.
- Review the staging migration and cron configuration. Scheduled HTTP tasks
  with production hostnames MUST be disabled/repointed before use.
- Deploy or sync `ai-smart-schedule`, `schedules-api`,
  `schedule-reconciler` to the staging project only.
- Confirm test endpoints are selected in the browser network panel before
  testing a schedule generation.
- Test that the original baseline is immutable; weather/GDD changes move
  only eligible future tasks; repeated recurrence completions are idempotent.
- Do not merge the PR or change the production Supabase project until the
  full staging end-to-end suite and agronomy approvals pass.

## Remaining limitations

The new SQL migration has only passed parser checks; it has NOT been run on
an isolated database or end-to-end tested. Local database replay may require
reconciling migration history and creating approved synthetic reference data.
A frontend build is NOT an agronomic certification.
