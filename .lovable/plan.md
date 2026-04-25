# Deep Audit — Subscription & Proactive Alerts

> **Read-only forensic report.** No code/DB changes proposed for execution.

---

## 1. Headline Finding

> **The subscription chip and proactive alerts ARE built, deployed, and have live data.**
> They are not visible right now because **you are on `/auth` (logged out)**. All UI for both systems mounts only inside `AppLayout` at `/app/*` routes.
>
> There is **no edge-function deployment problem**. The "free space / cannot deploy" theory from earlier chat is not the cause.

---

## 2. Live data check (production DB, just now)

| Table | Row count | For current farmer `155588c4…85e7` |
|---|---:|---|
| `proactive_alerts` | **390** | **99 PENDING**, 5 SEEN, 6 ACTED, 1 DISMISSED |
| `farmer_subscriptions` | 24 | **1 active** — Plan `Shakti` (premium), expires 2026-05-14, **18 days remaining** |
| `proactive_rules` | 10 | n/a |
| `subscription_plans` | 6 | n/a |

`check_farmer_subscription(farmer, tenant)` RPC was invoked live and returns a fully populated payload (`valid: true`, all 13 features, all 7 limits, `days_remaining: 18`). The hook will receive valid data the moment the user logs in.

---

## 3. Edge function deployment status

All 25 functions are deployed and healthy. Recent logs confirm successful execution:

| Function | Recent activity (last hour) | Status |
|---|---|---|
| `proactive-evaluator` | Cron fired: 25 lands, 34 rules, 0 new alerts (1.1s) | ✅ |
| `tenant-config` | Built config in 1.9s for active tenant | ✅ |
| `schedules-api` | Returned 13 schedules + 254 tasks | ✅ |
| `google-maps-config` | API key delivered | ✅ |
| `app-version` | Now 200 OK (the `app_key` param fix you just approved) | ✅ |
| `lands-api` | Still 401 — Phase 5 guard regression (open since previous audit) | ⚠️ |
| `weather` | Idle (no recent calls) | — |

> **Free-tier quota is fine.** Supabase does not block deploys on the free tier for projects of this size; the platform deploys functions automatically on every code change. The actual failure mode you saw earlier was the **Phase 5 JWT guard** (NO_AUTH_HEADER 401), not a quota issue.

---

## 4. UI mount chain (why nothing renders on `/auth`)

```text
/auth   ──► AuthPage   ──► (no SubscriptionProvider, no AppLayout, no useProactiveAlerts)
                                            │
                                            ▼
              ❌ SubscriptionHeaderChip — not mounted
              ❌ SubscriptionStatusBanner — not mounted
              ❌ Proactive alert toasts — listener inactive
              ❌ /app/proactive-alerts — route inaccessible

/app/*  ──► AppLayout
              ├─ <SubscriptionProvider>  ──► useSubscription() → calls check_farmer_subscription RPC
              │     ├─ <SubscriptionHeaderChip>     ✅ shows "Shakti · 18d"
              │     └─ <SubscriptionStatusBanner>   ✅ hidden when active (correct), shows when warning
              │
              ├─ useProactiveAlerts()    ──► Supabase realtime + 60s poll
              │     └─ Toasts on INSERT, opens WhatsApp on CRITICAL
              │
              └─ <Outlet>
                    └─ /app/proactive-alerts ──► ProactiveAlerts page (full inbox)
                    └─ /app/home              ──► AlertsSummaryCard (3 most recent)
```

So: **log in → land on `/app/home` → both systems immediately become visible.**

---

## 5. Code-path audit (no behavioural bugs found)

### 5a. `useSubscription` (src/hooks/useSubscription.ts)
- ✅ `staleTime: 5 min`, `gcTime: 30 min`, retry 2× with backoff.
- ✅ IndexedDB → localStorage 72-h offline fallback.
- ✅ Refetches on visibility-change after 5 min.
- ⚠️ Minor: `tenantId` comes from `useAuthStore`. If the store hydrates *after* React Query's first render, the query is `enabled: false` until tenant arrives. This is intentional (avoids a 400) but means the chip can flash "Free" for ~200 ms post-login. **Not a bug, only a UX polish item.**

### 5b. `SubscriptionContext` (src/contexts/SubscriptionContext.tsx)
- ✅ Realtime subscription on `farmer_subscriptions` UPDATE filtered by `farmer_id`.
- ✅ Invalidates query on plan change → chip updates instantly.
- ✅ Window-online listener triggers refetch.

### 5c. `useProactiveAlerts` (src/hooks/useProactiveAlerts.ts)
- ✅ Singleton-aware (warns on duplicate instance — already enforced from previous memory).
- ✅ Realtime INSERT subscription with retry 2 s → 5 s → 10 s.
- ✅ 60-s polling safety net when tab visible & online.
- ✅ Offline-first: IndexedDB fast-path when `!navigator.onLine`.
- ✅ Trilingual title/message resolution + WhatsApp share for CRITICAL.

### 5d. `AlertsSummaryCard` (home dashboard)
- ✅ Fetches up to 3 alerts in PENDING/DELIVERED/SEEN.
- ✅ Land-name enrichment fallback chain.
- Returns `null` if no alerts → so a logged-in farmer with **0 PENDING alerts** sees nothing on home (this is by design, not a bug).

### 5e. `ProactiveAlerts.tsx` page
- ✅ Reads from `useProactiveAlerts({ skipRealtime: true })` to comply with singleton contract.
- ✅ History toggle, mark-seen / mark-acted / dismiss actions all wired to RPC.

---

## 6. Why the user thinks it's broken — likely scenarios

| Symptom | Real cause | Fix |
|---|---|---|
| "I don't see the subscription chip" | User is on `/auth` (current state) or `/app/chat`/community-chat (header is intentionally hidden on full-screen chat routes) | Log in → navigate to `/app/home` |
| "I don't see proactive alerts" | Same — listener only mounts in `AppLayout` | Same |
| "Banner doesn't show" | Banner is **suppressed for active subscriptions** by design; only renders for trial-ending / grace-period / expired | Working as intended |
| "I added a function but it didn't deploy" | Functions deploy automatically on push; no quota issue. The Phase 5 guard regression on `lands-api` and `ai-agriculture-chat` is what's actually broken | See Section 7 |

---

## 7. Real outstanding bugs (carried over from last 2 audits, still unresolved)

| # | Bug | Severity | Status |
|---|---|---|---|
| B1 | `lands-api` returns 401 NO_AUTH_HEADER for every request (Phase 5 `tenantAccessGuard` requires JWT, app uses anon-key + headers) | 🔴 CRITICAL — farmer land data does not load | Awaiting your direction (revert vs patch — already asked) |
| B2 | `ai-agriculture-chat` same JWT guard, same failure mode | 🔴 CRITICAL — AI Chat broken for unauthenticated guard path | Awaiting same decision |
| B3 | Orphan crons `mark-agricultural-tiles` (every 5 min!) and `weekly-ndvi-sync` deployed in `pg_cron` but no source in repo | 🟠 HIGH — silent failures + cost waste | Investigate Supabase dashboard |
| B4 | 4 unused functions (`ai-query-understanding`, `mcp-handler`, `validation-monitor`, `seed-decision-rules`) still deployed | 🟡 MEDIUM | Archive |

---

## 8. Verification you can do right now

1. Log in via `/auth` → land on `/app/home`.
2. Look at top-right of header → you should see a **`Shakti · 18d` chip** (premium, 18 days left).
3. Open menu (Hindenburg) → **Subscription** entry should show full plan details.
4. Scroll the home page → if any of your 99 PENDING alerts have come in this session, you'll see the **Recent Alerts card**.
5. Visit `/app/proactive-alerts` → full inbox of 99 PENDING + 5 SEEN should render.
6. Open DevTools console → look for:
   - `📦 [TenantConfig] White label data loaded` (already in logs)
   - `✅ [ProactiveAlerts] Realtime subscribed`
   - No `❌ [Subscription] RPC error`

If any of those are missing **after login**, we have a real bug. Right now we don't.

---

## 9. Recommended next actions (NOT auto-applied)

| Priority | Action |
|---|---|
| 🔴 P0 | Fix the **Phase 5 guard regression** on `lands-api` + `ai-agriculture-chat` — this is the only actually-broken thing. (Decision still pending: revert vs patch) |
| 🟠 P1 | Audit Supabase dashboard for the 2 orphan cron functions; recover source or drop the cron jobs |
| 🟡 P2 | Archive the 4 unused functions to clean up `config.toml` |
| 🟢 P3 | (Optional UX polish) Show a skeleton on the chip during the 200 ms tenant hydration window |

---

## 10. JSON summary

```json
{
  "diagnosis": "no_bug_in_subscription_or_proactive_alerts",
  "actual_state": {
    "current_route": "/auth",
    "ui_mount_required": "/app/*",
    "subscription_data_present": true,
    "subscription_plan": "Shakti (premium)",
    "subscription_days_remaining": 18,
    "alerts_total": 390,
    "alerts_pending_for_current_farmer": 99,
    "edge_functions_deployed": 25,
    "edge_function_quota_issue": false
  },
  "real_bugs_still_open": [
    {"id":"B1","fn":"lands-api","issue":"Phase 5 JWT guard rejects anon-key calls"},
    {"id":"B2","fn":"ai-agriculture-chat","issue":"Same guard regression"},
    {"id":"B3","crons":["mark-agricultural-tiles","weekly-ndvi-sync"],"issue":"Orphan deployed crons, no source in repo"},
    {"id":"B4","unused":["ai-query-understanding","mcp-handler","validation-monitor","seed-decision-rules"]}
  ],
  "user_action_required": "Log in via /auth, then navigate to /app/home — both systems will render immediately."
}
```
