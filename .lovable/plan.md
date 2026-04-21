

## Audit Findings

The `subscription_plans` table is correctly modeled for multi-tenant SaaS:
- 3 farmer plans: **Kisan / Shakti / AI PRO** (`plan_category='farmer'`, ₹99–₹299/mo)
- 3 tenant plans: **Starter / Growth / Enterprise** (`plan_category='tenant'`, ₹2,999–₹24,999/mo) — these are SaaS plans for organizations subscribing to the platform, NOT for end-farmers

The bug: `SubscriptionPage.tsx` filters only `is_active=true` and shows ALL 6 plans → farmers see ₹24,999/mo "Enterprise" which is meant for tenant admins on the SaaS portal.

This also has security/scale implications: client-side filter alone is bypassable, and at 1M users every page load fetches all plans → wasteful.

---

## Plan: Multi-Tenant Plan Isolation + 1M-User Hardening

### 1. Frontend filter (immediate fix) — `src/pages/SubscriptionPage.tsx`
- Add `.eq('plan_category', 'farmer')` to the plans query.
- Add `.is('tenant_id', null)` (global farmer plans) OR `.eq('tenant_id', user.tenantId)` (tenant-custom farmer plans) using `.or(...)` so future white-label plans work.
- Add `.eq('is_public', true)` to hide internal/grandfathered plans.
- Sort by `sort_order ASC, price_monthly ASC`.

### 2. Database hardening (additive only — safe for tenant portal & SaaS admin)

**RPC for catalog (replaces direct table read):**
```sql
CREATE OR REPLACE FUNCTION public.get_farmer_subscription_plans(p_tenant_id uuid)
RETURNS SETOF public.subscription_plans
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.subscription_plans
  WHERE is_active = true
    AND is_public = true
    AND plan_category = 'farmer'
    AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY sort_order ASC NULLS LAST, price_monthly ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_farmer_subscription_plans(uuid) TO anon, authenticated;
```

**Defense-in-depth RLS (additive policy — does not touch existing tenant/admin policies):**
```sql
-- Farmer-app scoped read policy. Tenant portal & SaaS admin keep their own policies.
CREATE POLICY IF NOT EXISTS "farmer_app_read_farmer_plans"
ON public.subscription_plans FOR SELECT
TO authenticated
USING (
  is_active = true
  AND is_public = true
  AND plan_category = 'farmer'
);
```

**Additive index for hot path:**
```sql
CREATE INDEX IF NOT EXISTS idx_subscription_plans_farmer_catalog
ON public.subscription_plans(plan_category, is_active, is_public, sort_order)
WHERE plan_category = 'farmer';
```

### 3. 1M-user scalability layer
- **React Query catalog cache**: `staleTime: 30 min`, `gcTime: 1 h`, queryKey `['plans','farmer',tenantId]`. Reduces DB hits by ~99% at scale.
- **IndexedDB fallback**: persist plans into existing `localDB` for offline + cold-start.
- **Edge cache header** on the RPC (set `Cache-Control: public, max-age=1800` via wrapper edge function) — optional Phase 2.
- **Prevent N+1**: usage + payment queries already scoped to `farmer_id` and benefit from indexes added in last migration.

### 4. Defensive UI guards
- After fetch, drop any row where `plan_category !== 'farmer'` (belt-and-suspenders).
- If catalog empty (RLS misconfig / network), show friendly empty state, not stale tenant plans.
- Hide billing-cycle selector for plans missing `price_quarterly` / `price_annually`.

### 5. Files to change

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | RPC + additive RLS policy + additive index (Section 2) |
| `src/pages/SubscriptionPage.tsx` | Use RPC via `client.rpc('get_farmer_subscription_plans', {p_tenant_id})`, React Query caching, defensive filter |
| `src/hooks/useFarmerPlans.ts` (new) | React Query hook wrapping the RPC + IndexedDB fallback |
| `src/services/localDB.ts` | Add `subscriptionPlans` store (additive bump) |

### Out of scope (protects other apps)
- ❌ No change to existing tenant-portal RLS policies.
- ❌ No change to SaaS-admin queries / views.
- ❌ No drops/alters on shared columns or tenant plan rows.
- ❌ No business-logic changes to subscription gating, payments, or AI engine.

### Acceptance
- Farmer app shows ONLY Kisan / Shakti / AI PRO at any tenant.
- Tenant portal & SaaS admin continue to see all categories (unchanged).
- Plan list served from cache after first load (1 DB query / user / 30 min).
- Even if frontend filter is bypassed, RLS prevents farmer reads of tenant plans.

