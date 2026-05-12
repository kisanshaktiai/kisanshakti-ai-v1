# Fix: New farmers are not auto-enrolled in the Free plan

## Root cause (forensic findings)

1. **`subscription_plans`** has the global Free farmer plan (id `e1c484ff-…`, `tenant_id = NULL`, `plan_category = 'farmer'`, price 0). Three other farmer plans exist (Kisan / Shakti / AI PRO). No per-tenant Free plan rows exist yet.
2. **`farmers` table** has only one AFTER INSERT trigger that fires user-creation logic: `on_farmer_created → handle_farmer_creation()`. That function only writes to `user_profiles` — it never inserts into `farmer_subscriptions`.
3. There is **no other trigger, edge function, or client-side path** that creates a row in `farmer_subscriptions` at signup. Signup paths (`PinAuth`, `MobileAuth`, `SetPin`) only insert into `farmers` and call profile RPCs.
4. Result: new farmers exist with **zero subscription row**, so `check_farmer_subscription` / `resolve_farmer_entitlements` return `valid:false` (or fall through to defaults), and the AI chat / land guards either deny outright or behave inconsistently. Confirmed in DB: 27 farmers, only 24 have subscriptions → **3 farmers stranded** without a plan.
5. The recent tenant-portal change that "added the Free plan for all tenants" only seeded `subscription_plans` rows; nothing wired the auto-enrollment side.

## Fix (DB-only — keeps SSOT in Postgres)

### 1. New SECURITY DEFINER function `auto_enroll_farmer_free_plan(NEW farmers)`
Logic:
- Skip if a row already exists in `farmer_subscriptions` for `(farmer_id, status IN ('active','trial'))`.
- Resolve plan in this priority:
  1. Tenant-scoped Free plan: `subscription_plans WHERE tenant_id = NEW.tenant_id AND plan_category='farmer' AND lower(name)='free' AND is_active`
  2. Global Free plan: same filter with `tenant_id IS NULL`
- If no Free plan found → `RAISE WARNING` and return (do not block farmer insert).
- Insert into `farmer_subscriptions` with:
  - `farmer_id = NEW.id`, `tenant_id = NEW.tenant_id`, `plan_id = <resolved>`,
  - `status = 'active'`, `start_date = now()`, `end_date = NULL` (Free is perpetual),
  - `auto_renew = false`, `billing_interval = 'monthly'`,
  - `metadata = { source: 'auto_enroll_signup', plan_name: 'Free' }`.
- Optionally link to a `tenant_subscriptions` row if one exists for the tenant (lookup `paying_tenant_id`).

### 2. New AFTER INSERT trigger on `public.farmers`
`on_farmer_subscription_autoenroll` runs after `on_farmer_created`, calls the function above. Wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so a subscription failure never blocks farmer creation.

### 3. Backfill migration (one-shot)
For every `farmers` row without an active/trial `farmer_subscriptions` row, insert the Free plan using the same resolution rules. Will recover the 3 currently-stranded farmers and any future cases caught between deploys.

### 4. Cache invalidation on the client
After signup completes, the existing `useEntitlements` query (key `[ENTITLEMENTS_QUERY_KEY, farmerId, tenantId]`) is enabled only once `user.id` and `tenantId` are populated, so the first fetch already sees the auto-enrolled row — no client change strictly required. But to be safe, add a one-line `queryClient.invalidateQueries({ queryKey: [ENTITLEMENTS_QUERY_KEY] })` after the farmer-insert step in `MobileAuth` / `PinAuth` signup success path.

## What is intentionally NOT changed

- `handle_farmer_creation` stays focused on `user_profiles` (single responsibility).
- No changes to plans, features, RLS, RPCs, or edge functions — only an additive trigger + backfill.
- No tenant-portal code touched.

## Verification after migration

```sql
SELECT COUNT(*) FROM farmers f
LEFT JOIN farmer_subscriptions s
  ON s.farmer_id = f.id AND s.status IN ('active','trial')
WHERE s.id IS NULL;
-- expected: 0
```

Plus a smoke test: register a new farmer from the app → confirm `resolve_farmer_entitlements` returns `valid:true`, `plan_name:'Free'`, AI chat allowed with Free-plan limits.
