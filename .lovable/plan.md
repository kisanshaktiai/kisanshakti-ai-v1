

# Updated Subscription System Implementation Plan

## Changes from Previous Plan

Two critical gaps added, performance strategy updated, and phase ordering revised per your findings.

---

## Revised Phase Ordering (8 Phases)

| Phase | Name | Priority |
|---|---|---|
| 1 | Seed farmer_subscriptions for existing farmers | Data foundation |
| 2 | useSubscription hook + SubscriptionContext (with caching) | Frontend core |
| 3 | Payment webhook edge function (Razorpay/PhonePe) | **NEW - Payment activation** |
| 4 | Backend subscription middleware for edge functions | API enforcement |
| 5 | Realtime subscription sync | **NEW - Live plan updates** |
| 6 | Usage metering | Limit enforcement |
| 7 | Offline HMAC validation (72h TTL) | Security |
| 8 | Grace period + degradation UI | UX polish |

---

## Phase 1: Seed Existing Farmers (Migration)

Create migration to assign all existing farmers a default subscription (Shakti plan as baseline):
- INSERT into `farmer_subscriptions` for each farmer in `farmers` table
- Set `status = 'active'`, `start_date = now()`, `end_date = now() + interval '30 days'`
- Link to the correct `plan_id` from `subscription_plans`
- Set `tenant_id` from the farmer's tenant

## Phase 2: useSubscription Hook + SubscriptionContext

**New file: `src/hooks/useSubscription.ts`**
- Fetch `farmer_subscriptions` joined with `subscription_plans` to get features/limits
- **5-minute stale-while-revalidate caching** via React Query `staleTime: 5 * 60 * 1000`
- Persist subscription state to `localDB` on every successful fetch for offline fallback
- Invalidate cache on: payment events, Realtime changes, app foreground after 5+ min background
- Expose: `hasFeature(name)`, `isWithinLimit(name)`, `subscriptionStatus`, `daysRemaining`, `planName`

**New file: `src/contexts/SubscriptionContext.tsx`**
- Wraps app with subscription state from the hook
- Provides `<SubscriptionGate feature="ai_chat">` component for declarative gating
- Shows upgrade prompt for gated features instead of hiding them

## Phase 3: Payment Webhook Edge Function (NEW)

**New file: `supabase/functions/payment-webhook/index.ts`**
- Support Razorpay and PhonePe webhook signatures (Indian payment providers for rural farmers)
- Verify HMAC signature from payment provider using stored webhook secret
- On successful payment:
  - UPDATE `farmer_subscriptions` SET `status = 'active'`, `start_date = now()`, `end_date` based on plan interval
  - Record in `payment_records` table
  - Send push notification to farmer via existing `notificationService` pattern
- On failed/refund:
  - UPDATE status accordingly, trigger grace period if needed
- Security: Validate `x-razorpay-signature` / PhonePe checksum before any DB write
- Idempotency: Use payment `order_id` as idempotency key to prevent double-activation

**New secret required**: `RAZORPAY_WEBHOOK_SECRET` (or `PHONEPE_SALT_KEY`)

**Migration**: Add `payment_provider` and `payment_order_id` columns to `farmer_subscriptions` if not present; add `payment_records` table if not present.

## Phase 4: Backend Subscription Middleware

**New file: `supabase/functions/_shared/subscriptionMiddleware.ts`**
- `validateSubscription(farmerId, tenantId)` RPC that returns plan features + status + expiry
- Cross-tenant safeguard: RPC enforces `farmer.tenant_id = provided_tenant_id`
- Returns 402 Payment Required for expired subscriptions
- Add to: `ai-chat-enhanced`, `proactive-evaluator`, `schedules-api`

## Phase 5: Realtime Subscription Sync (NEW)

**In `SubscriptionContext.tsx`**:
```text
Subscribe to postgres_changes on farmer_subscriptions
filtered by farmer_id=eq.${currentFarmerId}
On UPDATE event -> refetchSubscription() + invalidate React Query cache
```
- Handles tenant admin upgrades/downgrades in real-time without requiring re-login
- Auto-unsubscribe on unmount and logout

## Phase 6: Usage Metering

The `subscription_usage_logs` table already exists with correct schema (metric_name, quantity, billing_period_start/end).

- Create `increment_usage` RPC: atomic increment of usage counter per metric per billing period
- Add usage check before AI chat calls (`ai_queries_per_month`) and land creation (`land_limit`)
- Frontend: show usage indicator in settings ("15/100 AI queries used this month")

## Phase 7: Offline HMAC Validation

- Server signs subscription claim with HMAC using edge function secret on every fetch
- Cache signed claim in `localDB` with 72-hour TTL (not 24h -- rural areas may have multi-day outages)
- On offline access: validate HMAC signature locally, check TTL
- After TTL expires offline: degrade to read-only mode (view existing data, no new AI chats)
- Force re-validation on reconnect

## Phase 8: Grace Period + Degradation

- 7-day grace period after subscription expires
- During grace: read-only access (view lands, schedules, weather) but no new AI chats or NDVI requests
- Show countdown banner: "Your plan expires in X days"
- After grace: restrict to free-tier features only (basic weather, land list)
- Never fully lock out -- farmers need weather data regardless of plan

---

## Files Created/Modified

| File | Action |
|---|---|
| `supabase/migrations/xxx_seed_subscriptions.sql` | Seed farmer_subscriptions |
| `src/hooks/useSubscription.ts` | New hook with caching |
| `src/contexts/SubscriptionContext.tsx` | New context + SubscriptionGate |
| `supabase/functions/payment-webhook/index.ts` | New edge function |
| `supabase/functions/_shared/subscriptionMiddleware.ts` | New middleware |
| `src/contexts/SubscriptionContext.tsx` | Add Realtime channel |
| `supabase/functions/ai-chat-enhanced/index.ts` | Add subscription check |
| `supabase/functions/proactive-evaluator/index.ts` | Add subscription check |
| `supabase/functions/schedules-api/index.ts` | Add subscription check |

## No Changes To
- Existing tenant isolation architecture
- RLS policies (already correct on farmer_subscriptions)
- Decision brain / symbolic engine
- Multi-tenant middleware
- Existing localDB or syncService architecture

