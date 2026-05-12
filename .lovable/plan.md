## Goal

Make plan-based feature gating **uniform across every subscription plan** (Free, Kisan, Shakti, AI PRO, and any future plan). Whatever the active plan disables in `resolve_farmer_entitlements` must render as a **visibly locked tile** in the home grid + bottom-nav quick-actions, and tapping it must go **directly to `/app/subscription`** — the single source of truth for plan selection. No more "navigate into the page → see a separate upgrade card".

This is a **plan-agnostic UX contract**: the same locked styling and redirect apply whether the user is on Free, Kisan, Shakti, or AI PRO.

## Root cause

- `useFeatures` currently flips `enabled: false` for plan-disabled features, and the `enabledFeatures` filter then **hides them entirely**. The user can still reach the page via deep link / nav state, lands on `AIChat.tsx`, and sees a second upsell surface (`SubscriptionGate` + `UpgradePrompt`) — duplicate UX, breaks SSOT.
- Behavior must be identical for every plan: any entitlement with `enabled === false` → locked tile → `/app/subscription`.

## Fix (frontend only — no DB, no entitlement-logic change)

### 1. `src/config/featureConfig.ts`
- Add `locked?: boolean` to `FeatureItem`.

### 2. `src/hooks/useFeatures.ts` — plan-agnostic overlay
- In the entitlements overlay (runs for **every** plan, not just Free):
  - When `ent.enabled === false` → set `locked: true` and **keep `enabled: true`** so the tile stays visible.
  - When `ent.enabled === true` → ensure `locked: false`.
- Tenant-level disables (existing behavior) still fully hide the feature — only **plan** disables become "locked & visible".
- `enabledFeatures` filter unchanged (it already keeps `enabled || comingSoon`).

### 3. `src/components/home/HomeFeaturesGrid.tsx` — locked card rendering
- Add `locked?: boolean` to `HomeFeatureCard`.
- If `feature.locked`:
  - Replace outer `<Link to={path}>` with `<Link to="/app/subscription">` (or a `<button>` that navigates).
  - Apply muted styles: `opacity-60`, `grayscale`, no hover scale-up.
  - Top-right `Lock` icon badge (small, themed).
  - Replace `stats/trend` line with a small "Upgrade" pill (use existing `PlanBadge` styling/tokens).

### 4. `src/pages/Home.tsx`
- Pass `locked` through when mapping `useFeatures()` → `HomeFeatureCard[]` (both main + secondary grids).

### 5. `src/components/BottomNavigation.tsx` — quick-actions grid
- For `item.locked`:
  - Do **not** disable the button. `onClick` → `navigate('/app/subscription')`.
  - Apply muted style + small `Lock` overlay on the icon tile.
  - Keep `comingSoon` behavior unchanged (still disabled, no redirect).

### 6. `src/pages/AIChat.tsx` (and any future gated page) — remove redundant upsell
- Remove the `SubscriptionGate` + `UpgradePrompt` wrapper.
- Defense-in-depth: if a user still reaches the page (deep link), check `useEntitlements().canUse('ai_chat').allowed` and `navigate('/app/subscription', { replace: true })` when not allowed. **No card, no second screen.**
- Audit confirms only `AIChat.tsx` uses this pattern today; document the contract for future gated pages.

### 7. SSOT confirmation
- `/app/subscription` is the **only** plan-upgrade surface, regardless of which plan the user is on.
- `UpgradePrompt.tsx` is left in place (no longer referenced) for possible future reuse; safe to delete in a follow-up.

## Files to change

- `src/config/featureConfig.ts` — add `locked?: boolean` to `FeatureItem`
- `src/hooks/useFeatures.ts` — set `locked` (not `enabled:false`) for plan disables; applies to all plans
- `src/components/home/HomeFeaturesGrid.tsx` — locked card visuals + redirect to `/app/subscription`
- `src/pages/Home.tsx` — pass `locked` through to `HomeFeatureCard`
- `src/components/BottomNavigation.tsx` — locked styling + redirect in quick-actions grid
- `src/pages/AIChat.tsx` — drop `SubscriptionGate`/`UpgradePrompt`, add silent redirect when not entitled

## Out of scope

- DB / RPC / `resolve_farmer_entitlements` — already correct, used as-is for every plan
- Tenant-level disables — still hide entirely (unchanged)
- `/app/subscription` page UI — already SSOT
- Any plan-specific copy or theming (one consistent locked treatment for all plans)
