# YieldShield staging-only release preparation

## Safety boundary

This branch is a staging release candidate, **not** a production deployment.
Current production project ref (DENYLIST): `qfklkkzxemsbeniyugiz`.
Never use the repository's `supabase/config.toml` project id as a deploy fallback.

## Authentication hardening
- `schedule-reconciler/internal-auth.ts` accepts only a valid service-role
  bearer or the configured Vault-backed `schedule_reconciler_key` bearer.
- Anon keys, fabricated `x-farmer-id` and `x-tenant-id` headers, missing
  bearer, whitespace injection and Vault RPC failures do not authorize calls.
- Cron key is retrieved through the service-role-only `get_sweep_key` RPC,
  after a candidate bearer was supplied. Its value is never logged.
- Only `POST` and preflight `OPTIONS` are accepted.
- Dry-run monitoring logging no longer mutates `schedule_monitoring`, so it
  can be used for read-only reconciliation smoke testing.

## Version-compatible staging group
1. `ai-smart-schedule` (data access, source-clock validation, atomic persistence)
2. `schedules-api` (verified farmer sessions, explicit atomic task completion)
3. `schedule-reconciler` (service-role sweep auth, idempotent event decisions)
These must be deployed from the same exact Git SHA.

## Release steps

1. Create an **isolated** Supabase project in an organization selected by the
   owner, in an appropriate region. Do not clone identifiable farmer data.
2. Populate staging with **anonymized fixtures only**, via reviewed migrations
   and explicitly approved agronomy sources. Never run production SQL writes.
3. Populate organization-level GitHub Actions values:
   - Environment `yieldshield-staging` with required reviewers.
   - Environment variable `STAGING_SUPABASE_PROJECT_REF` — staging ref only.
   - Environment secret `STAGING_SUPABASE_ACCESS_TOKEN` — least-privileged
     token capable of managing staging only.
   - Optional `STAGING_SUPABASE_ANON_KEY` for read-only smoke checks.
   Never add production service keys or production auth data.
4. Use the **manual** `YieldShield staging deployment (manual only)` Action.
   Enter exact expected Git SHA and staging project ref. The workflow validates
   both, blocks the production project ref, and deploys only three functions.
5. Verify the three deployed sources correspond to the approved Git SHA.
   Use Supabase MCP `get_edge_function` or function bundle inspection; the
   CLI deployment exit code alone does not prove source parity.
6. On staging, test unknown bearer returns 401 before accessing schedules,
   authorized cron `dryRun:true` returns without writing ledger or monitoring,
   tested farmer owns its tasks, completion is atomic/idempotent, and a
   deliberately unverified Indrayani maturity returns
   `AGRONOMY_REVIEW_REQUIRED` without persisting a schedule.
7. Perform a **separate approved** controlled production rollout only after
   documented scientific review, proof of backend parity, no missing RLS/RPC
   prerequisites, and rollback plan.

## Explicit blockers
- Only production Supabase project is presently visible to the connector.
  No isolated staging database exists in the connected account.
- No staging end-to-end HTTP or database integration tests have run.
- The crop reference catalogue does not have verified method/variety/maturity
  data for every crop, and the RAG retrieval RPC contract is incomplete.
- Tests verify source/API invariants; they cannot certify ICAR approval,
  crop-wise yield performance, or actual reconciler side effects.

## Manual triage
If no staging project is connected: **stop**. Do not substitute production.
If schema migrations cannot be applied cleanly to staging: **stop**.
If field-readiness returns 200 with review_required=true, treat this as
a *blocked plan*, not a successful schedule activation.
