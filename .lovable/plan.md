
## Root cause (verified)

The bug has three independent layers, all confirmed against the live DB:

**1. No expiration job.** `farmer_subscriptions` has 27 rows; 24 of them have `end_date < now()` but `status = 'active'`. There is no `pg_cron` job to flip expired rows to `status = 'expired'` or downgrade them to Free. Existing cron jobs cover NDVI, tiles, proactive evaluator, governance — nothing for billing.

**2. `resolve_farmer_entitlements` (SSOT RPC) silently grants everything when no active plan exists.** The query at lines 129-138 only selects a subscription where status is active/trial/trialing AND end_date in the future (or expired+in-grace). When the row is expired and out of grace, `_farmer_sub_plan_id` is `NULL`. The features loop then runs `LEFT JOIN tenant_farmer_plan_features … AND tfpf.plan_id = _farmer_sub_plan_id`, which produces NULL rows, and the `enabled` field falls through `COALESCE(..., tfpf.enabled, tfg.enabled, true)` to `true`. Result: expired farmers get **every feature enabled with unlimited quota** — the exact symptom reported.

**3. Client `AppBootGate` only blocks on `tenant.suspended`** and `useEntitlements` only marks features unallowed via `quota_exceeded`/`feature_disabled`. Because the RPC returns `enabled:true` for all features (bug #2), the client never sees the farmer as downgraded. There is no "farmer subscription expired → force Free plan" branch on the client.

## Fix plan

### A. Database — auto-downgrade on expiry

Migration that:

1. Creates `expire_farmer_subscriptions()` SECURITY DEFINER function that:
   - For rows with `status IN ('active','trial','trialing')` and `end_date < now()` and `(grace_period_ends_at IS NULL OR grace_period_ends_at < now())` → set `status='expired'`, stamp `updated_at`.
   - For rows already `status='expired'` with grace ended (or null) → insert a new row pointing the farmer at the Free plan (`e1c484ff-ad87-4f09-a174-8eec05981ebb`) with `status='active'`, `end_date=NULL`, and log to `subscription_change_history`.
   - Idempotent: skip farmers who already have an active Free-plan row.
2. Schedules it hourly via `pg_cron` (`0 * * * *`).
3. Runs it once inline to clean the current 24 stale rows.

### B. Database — fix `resolve_farmer_entitlements` to fall back to Free

Replace the function so that:

- If no eligible farmer subscription row is found, look up the Free plan (`name='Free' AND is_active`) and use **its** `id`, `features`, `limits` as the baseline.
- The features loop's `COALESCE(..., true)` fallback is changed to `COALESCE(..., (_features ? f.code))` — i.e. a feature is only enabled when explicitly granted by tenant master / tenant plan override / tenant grant / plan base. No more "default true".
- Quotas similarly fall back to the Free plan's `limits` JSON instead of NULL (NULL today means "unlimited" on the client).
- Return `farmer.status = 'expired_downgraded'` and `farmer.plan_name = 'Free'` so the UI can show a banner.

### C. Frontend — defense in depth

- `src/hooks/useEntitlements.ts`: treat `data.farmer.status === 'expired'` (and not in grace) as a hard signal — `canUse()` returns `allowed:false, reason:'subscription_expired'` for any feature not in the Free plan's allowlist (derived from the RPC payload, no hardcoding).
- `src/components/subscription/AppBootGate.tsx`: in addition to `tenant.suspended`, when `farmer.status === 'expired'` and not in grace, render `SubscriptionStatusBanner` at the top (already exists) and continue rendering children — gating happens per-feature.
- `src/contexts/SubscriptionContext.tsx` `hasFeature()`: stop returning `true` while loading once we have stale cached data showing expired — currently it grants optimistic access which masks the downgrade after a refresh.
- `src/pages/AIChat.tsx` and `LandLimitGuard`: already route to `/app/subscription` when `canUse` is false — no change needed once the hook is fixed.

### D. Verification

After migration:

```sql
SELECT status, COUNT(*) FROM farmer_subscriptions GROUP BY status;
-- expect: active (Free plan rows), expired (old rows), zero "active + end_date<now"
SELECT resolve_farmer_entitlements('<expired-farmer>','<tenant>')->'farmer'->>'plan_name';
-- expect: "Free"
SELECT resolve_farmer_entitlements('<expired-farmer>','<tenant>')->'features'->'ai_chat'->>'enabled';
-- expect: matches Free plan setting, not "true"
```

Then reload the mobile app as one of the 24 affected farmers and confirm AI Chat / land-add / premium tiles show the upgrade prompt instead of working.

## Files touched

- new migration: expire job + cron + RPC replacement
- `src/hooks/useEntitlements.ts`
- `src/contexts/SubscriptionContext.tsx`
- `src/components/subscription/AppBootGate.tsx`

No changes to tenant/admin portals (separate codebases) — only the shared RPC, which they also consume correctly once fixed.
