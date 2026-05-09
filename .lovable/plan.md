## Deep Audit — Subscription / Tenant / Farmer schema

This is a 3-tier multi-tenant SaaS. The DB has **two parallel subscription systems** that are not currently reconciled in the farmer app, plus a tenant-level subscription that the farmer app never checks. Below is the full map.

### Tier 1 — Platform / Admin panel (catalog)
- **`subscription_plans`** — global catalog of plans. Discriminated by `plan_category`:
  - `plan_category='tenant'` → Starter / Growth / Enterprise (tenant pays platform). Limits like `max_farmers`, `max_dealers`, `max_storage_gb`.
  - `plan_category='farmer'` → **Kisan / Shakti / AI PRO**. Embedded `features` jsonb + `limits` jsonb (e.g. `ai_queries_per_month`, `land_limit`, `soil_reports_per_month`).
- **`features`** — global feature *catalog* with `code` + `quota_unit` (`per_day`, `per_month`, `tokens_per_day`, `count`). Codes like `ai_chat`, `ai_chat.image_scan`, `ai_chat.tokens`, `my_land`, `weather_forecast`, `marketplace`, `community`, `sms_alerts`.
- **`plan_features`** — `(plan_id, feature_code, enabled, quota)` — base quota per plan.
- **`subscription_addons` / `subscription_addon_assignments`** — paid add-ons.

### Tier 2 — Tenant panel (overrides + tenant's own billing)
- **`tenant_subscriptions`** — tenant's *own* plan with the platform (admin → tenant). Holds `status`, `current_period_end`, `grace_period_ends_at`. **If this is `cancelled`/`past_due`, the entire tenant should be read-only — farmers downgraded to free tier or blocked.** Today the farmer app never reads this.
- **`tenant_farmer_pricing`** — tenant customizes a base farmer plan: `custom_price_*`, `custom_features` jsonb, `custom_limits` jsonb (overrides `subscription_plans.features/limits`).
- **`tenant_farmer_plan_features`** — `(tenant_id, plan_id, feature_code, enabled, quota)` — per-feature override at tenant level. **`check_farmer_quota` reads this**.
- **`tenant_features`** — wide row of booleans per tenant (`ai_chat`, `weather_forecast`, `marketplace`, `whatsapp_integration`...). Tenant-level on/off master switch.
- **`tenant_feature_overrides`** — time-bound overrides with `expires_at`.
- **`tenant_feature_grants`** — `(tenant_id, feature_code, enabled, quota, expires_at)` — tenant-wide grants.
- **`subscription_settings`** — per-tenant billing/usage policy (`usage_quotas`, `feature_limits`, `cancellation_settings`).

### Tier 3 — Farmer app
- **`farmer_subscriptions`** — `(farmer_id, tenant_id, tenant_subscription_id, plan_id, status, end_date, grace_period_ends_at, billing_interval, ...)`. Linked to parent `tenant_subscription_id`.
- **`farmer_feature_usage`** — `(farmer_id, tenant_id, feature_code, period, count, tokens)`. Atomic counter consumed by `check_farmer_quota`.

### RPC layer
- **`check_farmer_subscription(p_farmer, p_tenant)`** → returns `subscription_plans.features` + `subscription_plans.limits` (the **base** values). **Does NOT apply tenant overrides**, **does NOT check `tenant_features`**, **does NOT check `tenant_subscription` status**.
- **`check_farmer_quota(_farmer, _feature, _delta, _tokens, _commit)`** → reads `tenant_farmer_plan_features` for the override quota, locks `farmer_feature_usage` row, optionally commits. Period: `CURRENT_DATE` (UTC) for `per_day`. **Already correct for AI chat 20/day enforcement** — but currently unused on the client.

### Critical gaps
1. **Two SSOTs for limits** that don't reconcile: `subscription_plans.limits.land_limit` (e.g. 3) vs `tenant_farmer_plan_features.quota` for `feature_code='my_land'`. The client only reads the first; the server-atomic enforcement only knows the second. A migration must mirror or pick one.
2. **Tenant-level entitlement chain ignored.** Farmer app never validates: `tenant_subscriptions.status='active'` → `tenant_features.<flag>=true` → `tenant_feature_overrides not expired` → farmer's plan features. A farmer on Shakti plan can use AI chat even if the tenant disabled `tenant_features.ai_chat` or the tenant's own subscription expired.
3. **No client quota enforcement.** AI chat sends without calling `check_farmer_quota`; AddLand inserts without checking `land_limit`.
4. **Boot does not gate UI** on tenant theme + subscription resolution → flash of un-themed / un-gated content.
5. **Timezone**: `check_farmer_quota` uses UTC `CURRENT_DATE`. Indian farmers expect midnight IST reset.
6. **Scalability**: every app open hits both `check_farmer_subscription` RPC and (after fix) `check_farmer_quota`. At 1M users this is hot.

---

## Plan

### Phase 0 — Schema unification (DB migration)

1. **Add unified RPC `resolve_farmer_entitlements(p_farmer, p_tenant)`** (SECURITY DEFINER, STABLE, single round-trip) that returns a single jsonb:
   ```
   {
     tenant: { id, status, suspended, in_grace, plan_name, period_end },
     farmer: { id, plan_id, plan_name, status, end_date, in_grace },
     features: { <feature_code>: { enabled, quota, used_today, used_month, resets_at } },
     limits:   { land_limit, ai_queries_per_day, ... },   // canonical numeric caps
     source:   { <feature_code>: 'tenant_override'|'tenant_pricing'|'plan_base'|'global_grant' }
   }
   ```
   Resolution cascade per feature_code:
   - Block if `tenant_subscriptions.status NOT IN ('active','trial')` AND past `grace_period_ends_at` → return `{ blocked: true, reason: 'tenant_suspended' }`.
   - Block if `tenant_features.<feature>=false` (master tenant switch).
   - Apply unexpired `tenant_feature_overrides`, then `tenant_feature_grants`, then `tenant_farmer_plan_features`, then `tenant_farmer_pricing.custom_features/limits`, then `subscription_plans.features/limits`.
   - Join current-day + current-month rows from `farmer_feature_usage` so the client gets `used_today` for free.

2. **Mirror `subscription_plans.limits.land_limit` into `plan_features('my_land', quota=N)`** for every farmer plan via one-time backfill, so `check_farmer_quota('my_land')` becomes the single enforcement path.

3. **Timezone-aware quota**: extend `check_farmer_quota(_tz text DEFAULT 'Asia/Kolkata')`; compute `_period := (now() AT TIME ZONE _tz)::date` for `per_day` units. Add `farmers.timezone TEXT DEFAULT 'Asia/Kolkata'`.

4. **Hard server enforcement (defense-in-depth)**:
   - `BEFORE INSERT` trigger on `lands` → `PERFORM check_farmer_quota(NEW.farmer_id, 'my_land', 1, 0, true)`; raise on `allowed=false`.
   - `ai-agriculture-chat` edge function calls `check_farmer_quota('ai_chat', 1, 0, true)` and returns 402 on exceeded.

5. **Indexes** (verify/add): `farmer_feature_usage(farmer_id, feature_code, period)` UNIQUE, `farmer_subscriptions(farmer_id, tenant_id, status)`, `tenant_features(tenant_id)` PK, `tenant_farmer_plan_features(tenant_id, plan_id, feature_code)` PK.

### Phase 1 — Boot gate (tenant + entitlements before first paint)

- New `src/providers/AppBootGate.tsx` — keeps `<SplashScreen />` visible until **both**:
  (a) `TenantContext.isLoading === false` (theme/branding applied to CSS vars + favicon set), and
  (b) `useEntitlements().isLoading === false` (or offline cache resolved).
- Soft timeout 4s → proceed with cached values; hard fail (no network + no cache) → "Reconnect" screen with retry.
- Hoist `SubscriptionProvider` (rename to `EntitlementsProvider`) **above** `AppLayout` in `App.tsx`.

### Phase 2 — `useEntitlements` SSOT hook

`src/hooks/useEntitlements.ts` wraps the new `resolve_farmer_entitlements` RPC. Replaces `useSubscription` for gating. Returns:
```ts
{
  tenant: { active, suspended, planName },
  farmer: { planName, status, daysRemaining, inGracePeriod },
  canUse(featureCode): { allowed, reason, used, limit, remaining, resetsAt },
  aiChat: { allowed, used, limit, remaining, resetsAt },     // shorthand for 'ai_chat'
  lands:  { allowed, used, limit, remaining },               // shorthand for 'my_land'
  isLoading, isError, refresh()
}
```
Refactor `useFeatures` to consult `useEntitlements` so home tiles auto-disable based on resolved entitlements (not raw `tenant.features`). `SubscriptionGate` reads from `useEntitlements`.

### Phase 3 — AI Chat 20/day cap (IST midnight reset)

In `EnhancedAIChatInterface`:
1. Render `<ChatQuotaHeader>` showing `{used}/{limit} chats today · resets in {hh:mm}` (use existing `useMinuteTick`).
2. Before sending: if `entitlements.aiChat.allowed === false` → block input + show `<ChatQuotaBanner>` with countdown to `resetsAt` and "Upgrade" CTA → `/app/subscription`.
3. On send: edge function `ai-agriculture-chat` performs the atomic `check_farmer_quota('ai_chat', 1, 0, true)` and returns 402 if exceeded — client never decrements locally before server confirms.
4. After successful response, refetch entitlements (or update React Query cache optimistically with the `used+1` value the RPC returned).
5. Tenant-disabled case: if `tenant_features.ai_chat=false` → show "AI Chat is not enabled for your organisation" instead of upgrade prompt.

### Phase 4 — Land limit (e.g. 3 lands)

1. `useEntitlements.lands` exposes `{ allowed, used, limit, remaining }`.
2. Disable every "Add Land" entry point project-wide:
   - `Home.tsx` quick action / FAB
   - `LandManagement.tsx` header CTA
   - Bottom-nav `+` if it routes to AddLand
   - `LandInstructionDialog` Start button
   - `Lands.tsx` empty-state CTA
3. Disabled buttons render with tooltip + tap toast: *"You've used {used}/{limit} lands on the {planName} plan. Upgrade to add more."* with "Upgrade" CTA.
4. **Route guard**: `AddLand.tsx` first effect — if `!entitlements.lands.allowed` → `navigate('/app/lands')` + toast.
5. **Server defense**: trigger from Phase 0.5 raises on overflow; `landsApi.create` translates the error into the same toast.

### Phase 5 — Tenant-suspension awareness

- If `entitlements.tenant.suspended === true` → render full-screen `<TenantSuspendedScreen>` from `AppBootGate` (only `/app/subscription` and contact-support routes accessible).
- Subscription page shows "Your organisation's plan needs renewal — contact admin".

### Phase 6 — Scalability (1M+ users)

1. **Edge cache layer**: new edge function `entitlements` wrapping `resolve_farmer_entitlements` with `Cache-Control: private, max-age=300, stale-while-revalidate=600`, keyed by `(farmerId, tenantId)`. Invalidated by webhooks on `farmer_subscriptions`, `tenant_subscriptions`, `tenant_features`, `tenant_farmer_plan_features` updates (use existing `payment-webhook` pattern + new `tenant-config-webhook`).
2. **Drop per-farmer realtime channel** for `farmer_subscriptions` from global mount. Subscribe only on `/app/subscription` page. Fallback: visibility-based 5-min refetch (already implemented).
3. **Coalesce localStorage writes** in entitlements cache (debounce 1s).
4. **Single-flight** the entitlements query across hooks via React Query (already free with shared queryKey).
5. **Optimistic UI**: chat send shows `used+1` immediately; server response with the truth reconciles.
6. **Rate limit** `_shared/rateLimiter.ts` already exists — apply 60 req/min/farmer to `ai-agriculture-chat`, `lands-api` mutations, `entitlements`.
7. **Realtime fanout** for tenant-wide changes: single channel `tenant:{tenantId}:config` published from server when admin/tenant updates branding/features — clients invalidate `['tenant']` and `['entitlements']` once.
8. **Index review** (Phase 0.5) plus partial index `farmer_feature_usage(farmer_id, feature_code) WHERE period = CURRENT_DATE` for hot path.

### Phase 7 — Tests

- Unit: `useEntitlements` cascade matrix (tenant suspended, tenant feature off, override active/expired, plan base, custom pricing, usage exhausted).
- E2E `tests/e2e/subscription-gating.test.ts`:
  - Free / 20-chat / 3-land scenario: chat blocks at 20, IST midnight unblocks, AddLand disabled at 3, deep-link to `/app/lands/add` redirects.
  - Tenant suspended → all gated routes redirect to suspension screen.
  - Boot gate: no flash of un-themed UI; entitlements resolved before first home paint.
- Edge tests for `resolve_farmer_entitlements` (matrix of tenant_subscription × tenant_features × tenant_overrides × plan_features).

---

## Technical details

**Files to add**
- `src/providers/AppBootGate.tsx`
- `src/contexts/EntitlementsContext.tsx` (rename from SubscriptionContext)
- `src/hooks/useEntitlements.ts`
- `src/components/subscription/ChatQuotaBanner.tsx`
- `src/components/subscription/ChatQuotaHeader.tsx`
- `src/components/subscription/LandLimitGuard.tsx`
- `src/components/subscription/TenantSuspendedScreen.tsx`
- `supabase/functions/entitlements/index.ts`
- `supabase/functions/tenant-config-webhook/index.ts`
- `tests/e2e/subscription-gating.test.ts`

**Files to modify**
- `src/App.tsx` — wrap routes in `AppBootGate`; hoist `EntitlementsProvider`.
- `src/components/AppLayout.tsx` — drop provider; consume entitlements.
- `src/hooks/useFeatures.ts` — read from `useEntitlements`.
- `src/hooks/useSubscription.ts` — keep as thin compatibility shim or remove call sites.
- `src/components/chat/EnhancedAIChatInterface.tsx` — quota banner/header + edge enforcement.
- `src/pages/AddLand.tsx` + every Add-Land CTA — entitlement guard + disabled state.
- `src/services/landsApi.ts` — translate 402 / trigger errors into UX toast.
- `supabase/functions/ai-agriculture-chat/index.ts` — server-side `check_farmer_quota('ai_chat', commit:true)` + 402 on exceeded.

**DB migrations**
- `farmers.timezone TEXT DEFAULT 'Asia/Kolkata'`.
- `check_farmer_quota` accepts `_tz` and computes period in tenant timezone.
- New RPC `resolve_farmer_entitlements(p_farmer, p_tenant)` (SECURITY DEFINER, STABLE) implementing the cascade described above.
- Backfill `plan_features('my_land', quota = subscription_plans.limits->>'land_limit')` for farmer plans where missing.
- `BEFORE INSERT` trigger on `lands` calling `check_farmer_quota('my_land', 1, commit:true)`.
- Verify/create indexes listed in Phase 0.5.

**Rollout**
1. Phase 0 + 1 + 2 — shipped together (boot gate + entitlements RPC + hook). No farmer-visible behavior change for users on unlimited plans; eliminates flash.
2. Phase 3 + 4 + 5 — feature-flagged via `tenant_features.enforce_quotas` for staged rollout per tenant.
3. Phase 6 — perf hardening behind the same flag.
4. Phase 7 — tests last; CI gate before flag flip to all tenants.
