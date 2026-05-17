## Root cause (confirmed via DB + logs)

The DB has all 6 alert lands intact — same `farmer_id`/`tenant_id`, `deleted_at` is null. Yet `useProactiveAlerts` logs `Unresolved land ids (RLS-blocked)` for every single one. Reason:

- This app uses a **custom session-token auth** (not Supabase Auth). `auth.uid()` is therefore **NULL** in client requests.
- `proactive_alerts` has an open `Service select … qual: true` policy, so direct client reads still work.
- `lands` has only `auth.uid()`-based SELECT policies (`Users can view their own lands`, `lands_access_policy`). With `auth.uid()` NULL, the direct `supabase.from('lands').select().in('id', …)` in `useProactiveAlerts.ts` returns 0 rows → every alert is "unresolved" → no land buckets → the filter strip is empty / mixed.
- This is why the rest of the app sees lands fine: `useLands` / Home go through the `lands-api` edge function (server-side, service role), not direct PostgREST.

So the bug isn't the alerts query — it's that we're reading `lands` directly from the browser, which RLS correctly blocks for our custom-auth session.

## Fix plan

### 1. `src/hooks/useProactiveAlerts.ts` — resolve lands through the existing authoritative source
- Remove the direct `supabase.from('lands').select(...).in('id', landIds)` call.
- Resolve lands using the **same path the rest of the app uses**:
  - Primary: `landsApi.fetchLands()` (edge function, already used by `useLands`). Filter by ids that appear in alerts.
  - Secondary: read React Query cache `['lands', user.id]` if already populated, to avoid an extra request.
  - Offline / fallback: `localDB.getLands(user.id)` (already mirrored by `useLands`).
- Build the `landMap` from whichever source returned data, keep the same `ResolvedLand` shape (`id, name, area_acres, current_crop`).
- Keep the `trigger_data.land_name` text fallback only as a last-resort label (never as a real `land` object).
- Demote the `[ProactiveAlerts] Unresolved land ids …` warning to a single info log, since with the new resolver this should normally be empty.

### 2. `src/pages/ProactiveAlerts.tsx` — surface land cards at top (AI-chat style)
Replace the small horizontally-scrolling "FilterChip" strip with a proper **Land Cards row** modelled on the chat land selector:

```text
┌──────────────────────────────────────────────────────────┐
│ Report summary (unchanged)                               │
├──────────────────────────────────────────────────────────┤
│  ┌─All─┐ ┌─🎋 Mala─┐ ┌─🌾 Khari─┐ ┌─🌾 कोडोलि─┐ …       │
│  │ 24  │ │ 7.59ac  │ │ 4.20ac   │ │ 2.10ac    │         │
│  │ ●●● │ │ 12 ● ●  │ │  6 ●     │ │  3 ●      │         │
│  └─────┘ └─────────┘ └──────────┘ └───────────┘         │
└──────────────────────────────────────────────────────────┘
```

- Each card: crop emoji + land name + area + alert count + small priority dot stack (CRITICAL/HIGH/MEDIUM/LOW counts per land).
- Active card: ring + accent background using semantic tokens (`bg-primary/10 ring-primary`).
- Snap-x horizontal scroll, ≥ 44px tap target, `pb-safe` margins.
- Selecting a land instantly filters with `LayoutGroup` (already in place) and syncs `?landId=` in the URL (already in place).
- "All" card shows total + per-priority dots; "Other lands" card appears only when there are truly unresolved ids (should be rare after fix #1).
- Reuse `LandRef` for the label so emoji/area logic stays centralised.

### 3. Tenant scoping (defensive)
- The hook already filters by `farmer_id=eq.user.id`. Add a second filter `tenant_id=eq.user.tenantId` so cross-tenant rows can never leak even if a future RLS change widens the open `Service select` policy. No DB migration needed.

### 4. Out of scope (explicit)
- No RLS migration — the broader "custom-auth ↔ RLS" topic is a separate effort. We work around it for `lands` here by going through `lands-api` like every other screen.
- No changes to `proactive_alerts` schema, alert generation, edge functions, realtime, or the home `AlertsSummaryCard`.
- No changes to the chat land selector itself; we mirror its visual pattern only.

## Files to edit
- `src/hooks/useProactiveAlerts.ts` — swap direct `lands` query for `landsApi` + cache + localDB; add tenant filter.
- `src/pages/ProactiveAlerts.tsx` — replace `FilterChip` strip with `LandCard` row; per-land priority counts; keep URL/LayoutGroup behaviour.

## Verification
- After fix, console no longer logs "Unresolved land ids" for the current farmer (6/6 should resolve).
- Land cards row shows Mala (7.59ac), Khari, कोडोलि field, Mala- with correct per-land counts.
- Tapping a card filters alerts to that land only and updates `?landId=`.
- Tapping "All" restores the full list.
- Tenant switch (different `tenantId`) shows zero of the previous tenant's alerts.
