## Audit findings

DB shape (single source of truth — `white_label_configs`):
- `mobile_theme` holds: `core`, `neutral`, `status`, `support`, `typography`, `border_radius`, `shadows`, `spacing`.
- `theme_colors` holds: `core`, `navigation`, `charts`, `maps`, `weather`, `gradients`, `dark_mode`.
- `brand_identity` holds the flat hex fallbacks.
- New columns from the recent migration: `last_deployed_at` (bumped by trigger on any theme group change) and `theme_history` (snapshots).

Critical bug — only half the colors ever reach the mobile app:

1. **Edge function `tenant-config/index.ts` line 161** picks `mobile_theme || theme_colors`. Because `mobile_theme` exists, `theme_colors` is dropped entirely → `navigation`, `charts`, `maps`, `weather`, `gradients`, `dark_mode` are never sent to the client. That is why the partner's preset save looks "stuck" on the mobile app even after the backfill aligned the DB rows.
2. **Frontend `TenantContext.tsx` lines 156, 672, 736, 825** has the same `mobile_theme || theme_colors` pattern in every fallback path.
3. The 60-min localStorage cache (`tenant_config_cache`) ignores `last_deployed_at`. Even after the DB trigger bumps it, the app keeps showing the stale theme until the cache TTL expires.
4. `WhiteLabelService.ts` runs its own 2-min auto-refresh on a different cache key (`white_label_config`) that the `TenantContext` never reads — two parallel theme pipelines, neither aware of the other.
5. ~1,400 hardcoded Tailwind palette classes already migrated by the prior codemod; remaining files flagged by `scripts/audit-hardcoded-colors.mjs` still need conversion (Weather, InstaScan, video reels, a handful of chat/schedule cards).

## Plan

### 1 — Merge both JSONB groups (edge function + frontend)

Deep-merge with `theme_colors` as the base and `mobile_theme` overlaying it, so every namespace survives:

```text
theme = deepMerge(theme_colors ?? {}, mobile_theme ?? {})
```

Apply this in:
- `supabase/functions/tenant-config/index.ts` `buildTenantConfig` (replace line 161 logic and expand the typed response to include `support`, `border_radius`, `shadows`, `spacing`).
- `src/contexts/TenantContext.tsx` in the offline-cache path (line 156), the dev-mode direct DB path (line 672), the prod domain-lookup path (line 736), and the default-tenant fallback (line 825).
- Re-export the merged shape so `applyThemeToDOM` (already handles every namespace) actually gets fed all of them.

### 2 — Honor `last_deployed_at` for instant cache invalidation

- Edge function: select `last_deployed_at`, include it in the returned `metadata`, and fold it into the ETag input so the ETag changes the moment the trigger fires.
- Frontend cache: store `last_deployed_at` alongside the cached payload. On every load (and on `visibilitychange`), do a lightweight `If-None-Match` request to `tenant-config`; on 200 (new ETag) swap the theme in place, on 304 keep the cache. Shorten the in-memory TTL to 5 min for the "free" path and rely on ETag for correctness.
- Remove the duplicate cache in `WhiteLabelService.ts` (or make it a thin wrapper around `TenantContext`) so there is one cache key only.
- Drop the localStorage `tenant_config_cache` entry whenever the new ETag differs from the cached one.

### 3 — Add a real-time push (optional, low cost)

Subscribe (via the existing Supabase Realtime singleton in `AppLayout`) to `UPDATE` events on `white_label_configs` filtered by current `tenant_id`. On event, call `refetch()` so partners see preset changes within seconds instead of waiting for the next ETag poll.

### 4 — Finish the hardcoded-color migration

Run `node scripts/audit-hardcoded-colors.mjs` and convert the remaining offenders to semantic tokens (`bg-success-soft`, `text-warning`, `bg-info`, `bg-weather-*`, `bg-chart-*`, `bg-map-*`, `bg-nav-active`, etc.). Keep NDVI / GoogleMapBoundaryDrawer / `ndviScience.ts` on their domain palettes (allow-list already in the audit script).

Specific files still flagged (from the audit script + plan.md notes):
- `src/components/weather/WeatherCard.tsx` — replace `text-red-500`, `text-blue-500` with `text-destructive` / `text-info`.
- `src/components/weather/SevenDayForecast.tsx`, `src/pages/Weather.tsx` — weather palette → `bg-weather-*`.
- `src/components/InstaScan/InstaScanCamera.tsx`, `src/components/video/VideoReelsViewer.tsx`, `src/pages/ReelsPage.tsx`.
- Any remaining schedule/chat cards surfaced by the audit script.

### 5 — Guardrails

- Add the ESLint `no-restricted-syntax` rule for raw `text-/bg-/border-/from-/to-/via-/ring-/fill-/stroke-/shadow-<palette>-<shade>` outside the allow-list (already planned in `.lovable/plan.md`, not yet wired).
- Add a tiny Vitest that asserts the merged theme contains every namespace given a fixture row mirroring the current DB layout, so the `mobile_theme || theme_colors` regression cannot come back.

## Technical details

```text
Order of color resolution on first paint:
  index.css :root defaults
  ← brand_identity flat hex (auto-contrast foreground)
  ← theme_colors namespaces (navigation/charts/maps/weather/gradients/dark_mode)
  ← mobile_theme namespaces (core/neutral/status/support/typography/radius/shadows)
  ← .dark scope from theme_colors.dark_mode.colors (injected <style>)
```

```text
Cache freshness:
  page load → read cached payload
            → fire `If-None-Match: <etag>` to tenant-config
            → 304: keep cache;  200: replace + reapply theme + persist
  realtime UPDATE on white_label_configs → refetch() (skips ETag, forces 200)
```

### Files touched
- `supabase/functions/tenant-config/index.ts`
- `src/contexts/TenantContext.tsx`
- `src/services/WhiteLabelService.ts` (slim down or remove)
- `src/components/AppLayout.tsx` (add realtime subscription for white_label_configs)
- ~10-15 remaining component files for the color-token migration
- `eslint.config.js` (palette-class restriction)
- `tests/unit/theme-merge.test.ts` (new)

### Out of scope
- Schema changes — DB already has everything we need (`last_deployed_at`, `theme_history`).
- Admin / tenant portals.
- NDVI scientific palettes.
