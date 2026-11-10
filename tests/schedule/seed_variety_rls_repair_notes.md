# Seed variety selection fix — 2026-11-10

## Confirmed production root cause
- `master_products` already held 694 active seeds across 66 crops; rice had
  52 active varieties.
- As `anon`, the original crop variety SELECT failed with
  `42501: permission denied for function has_tenant_access`.
- `useCropVarieties` converted the query error into `[]`, so the farmer UI
  replaced actual cards with the manual variety fallback.
- The app uses the Supabase anon API role plus a custom verified
  `x-session-token`, not necessarily a Supabase `authenticated` JWT.
- Security-definer functions `has_tenant_access(uuid)` and
  `is_admin_user(uuid)` are NOT executable as anon, nor should they be
  made callable by every anon user as a shortcut.

## Database resolution
The migration `20261110110542_repair_seed_variety_catalog_rls_verified_tenant_scope.sql`
was applied on the connected Supabase production database using
`repair_seed_variety_catalog_rls_verified_tenant_scope`. It changes only
three existing SELECT RLS policies (does not alter seeds or task data):
1. Public global seed records must be active, AI-recommendable, globally
   visible, with no tenant owner.
2. Generic authenticated catalogue access no longer bypasses seed-scoping.
3. Tenant seed access requires an active, recommendable seed and equality
   to the existing `public.get_current_tenant_id()`, backed by
   `verified_session_context()`.

## Verified after applying
- Anonymous rice varieties = 52
- Anonymous active seed varieties = 694
- Authenticated active seed varieties = 694
- Pending-approval seed varieties visible = 0
- Anonymous `has_tenant_access` and `is_admin_user` EXECUTE = false
- Anonymous `v_variety_offerings` query executes without permission error
  (the view has zero offering records at present)

## Frontend fix
`useCropVarieties` now distinguishes `error` from an authentic empty result,
exposes a retry action, and resets stale crop data when crop selection changes.
`CropDateInput` displays a load failure with Retry and blocks continuing
on a failed catalogue request. Preselection of previous land variety requires
membership in the current crop's already loaded varieties.

## Deployment and rollback
No Edge Function redeployment is required for the RLS repair. To fix error
rendering and retry UI, merge the frontend branch and deploy the updated
Lovable frontend. The original frontend should already be able to load the
varieties after a full page refresh; verify in browser before merging.

For emergency manual policy restoration, review
`tests/schedule/seed_variety_rls_manual_rollback.sql`. Do NOT execute the
rollback as a forward migration. A rollback restores the former failure;
it is not a substitute for access policy validation.

## Future tests
When tenant-scoped seed records exist in staging, verify:
- no session -> no tenant seed visibility;
- valid tenant A session -> A seeds only;
- invalid/expired tenant A session -> no tenant seeds;
- valid tenant B session -> B seeds only;
- historical pending seeds always excluded.
These paths are not empirically exercised by the current global-only seed data.
