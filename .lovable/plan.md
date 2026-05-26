## Audit findings

**Single source of truth (DB)**
- `white_label_configs.mobile_theme` + `white_label_configs.theme_colors` (JSONB) — the rich, modern theme used by tenant + admin portals. Contains `core`, `neutral`, `status`, `navigation`, `charts`, `maps`, `weather`, `gradients`, `dark_mode`, `typography`.
- `tenant_branding` (flat hex columns: `primary_color`, `secondary_color`, `accent_color`, `background_color`, `text_color`, `font_family`) — legacy/fallback table.
- Edge function `tenant-config` returns a merged `{ branding, theme, pwa, ... }` payload.

**Frontend (TenantContext.applyThemeToDOM)**
- Already maps `theme.core/neutral/status/typography` → CSS variables on `:root`, and falls back to `branding.*_color` → `--primary/--secondary/--accent`. Good foundation.
- Gaps:
  1. Does NOT apply `theme.navigation`, `theme.charts`, `theme.maps`, `theme.weather`, `theme.gradients`, or `theme.dark_mode.colors`.
  2. Hardcodes `--primary-foreground: 0 0% 100%` — ignores `core.primary_foreground` from DB.
  3. No automatic contrast computation for fallback path (`tenant_branding` only has hex colors, no `*_foreground`).
  4. Does not write `--radius` from `mobile_theme.border_radius`, nor shadow/spacing tokens.
  5. Does not switch dark-mode tokens when `dark_mode.enabled = true`.
  6. `index.css` `:root` ships KisanShakti defaults that win on first paint and never get cleared if tenant has fewer keys.

**Hardcoded colors in components (822 occurrences across ~120 files)**
Worst offenders (raw Tailwind palette classes like `bg-red-500`, `text-emerald-600`, `from-amber-500`, etc.):
- `src/components/schedule/*` — ModernTaskCard, ProductRecommendationCard, TaskTimeline, ScheduleGenerator, CropScheduleView, FarmingTypeDialog, MultiIntercropSelector, TaskPhotoUploadDialog, BackdatedConsentDialog.
- `src/components/chat/*` — RecommendationCards, ProductCard, EnhancedColorCodedCard, ColorCodedCard, FollowUpQuestions, LandSpecificChatTab, DiagnosticResponseCard, SuggestionTypeSelector, LandContextCard, WorldClassCamera.
- `src/components/weather/*` + `src/pages/Weather.tsx` — SevenDayForecast, WeatherWidget.
- `src/components/proactive/AlertEvidenceSection.tsx`.
- `src/components/video/VideoReelsViewer.tsx`, `src/pages/ReelsPage.tsx`.
- `src/components/InstaScan/InstaScanCamera.tsx`.
- Hex strings in `NDVIMapView.tsx`, `NDVITrendChart.tsx`, `GoogleMapBoundaryDrawer.tsx`, `LandThumbnail.tsx`, `ndviScience.ts`, `chatImageStorage.ts`.

NDVI map gradient stays a domain palette (it represents vegetation index, not brand) — those hex values are intentional and stay.

## Plan

### Phase 1 — Strengthen central theme pipeline (no breaking changes)

1. **Extend `TenantContext.applyThemeToDOM`** to apply every namespace from `white_label_configs.mobile_theme` / `theme_colors`:
   - `core.*` (incl. `*_foreground` pairs, `ring`, `muted`, `card`, `popover`, `destructive`)
   - `neutral.*`, `status.*`, `support.*`
   - `navigation.*` → `--nav-active`, `--nav-background`, `--nav-border`, `--nav-inactive`
   - `charts.*` → `--chart-1..5`
   - `maps.*` → `--map-marker`, `--map-polygon-fill`, `--map-polygon-stroke`, `--map-tracking-fill`, `--map-tracking-stroke`
   - `weather.*` → `--weather-sunny`, `--weather-cloudy`, `--weather-rainy`, `--weather-stormy`, `--weather-night`
   - `gradients.*` → `--gradient-primary`, `--gradient-sunrise`, `--gradient-earth` (full CSS gradient string)
   - `border_radius.*` → `--radius-sm/md/lg/full`
   - `shadows.*` → `--shadow-sm/md/lg/xl`
   - `spacing.*` → keep informational (Tailwind already drives spacing)
   - `typography.*` → `--font-sans`, `--font-size-base`, `--font-weight-*`
2. **Dark-mode honor**: when `theme.dark_mode.enabled` is true, write its colors to a `.dark` scope using a `<style id="tenant-dark-tokens">` injection, and apply `.dark` class based on user preference / system.
3. **Auto-contrast fallback**: when only flat `branding.primary_color` exists, compute readable `--primary-foreground` via luminance instead of hardcoding white.
4. **Reset stale tokens**: before applying, clear the previous tenant's inline `style.setProperty` keys we set last time (track in a ref) so a tenant with fewer keys doesn't inherit the prior tenant's overrides.
5. **Index.css cleanup**: keep only neutral light/dark fallbacks for `--primary/--secondary/--accent/--background/--foreground`; remove any KisanShakti-specific hex defaults from `:root`/`.dark` so the tenant theme always wins.

### Phase 2 — Add semantic tokens for the colors components actually need

Add these tokens to `tailwind.config.ts` (mapped to CSS variables) and to `index.css` defaults, so components have a tenant-driven alternative to raw palette classes:
- `nav`, `weather-sunny/cloudy/rainy/stormy/night`, `chart-1..5`, `map-*` (already partly present — extend).
- Semantic status families with subtle tints: `success/warning/destructive/info` + `*-foreground` + `*-soft` (10–15% tint) for badges and chips. Currently many components hand-roll `bg-amber-50 text-amber-700`; replace with `bg-warning-soft text-warning`.
- Crop-stage tokens already exist (`--crop-stage-*`) — keep and document.

### Phase 3 — Migrate hardcoded colors to tokens (file-by-file)

Convert raw palette classes to semantic tokens. Mapping:
- `bg-red-500/600`, `text-red-600` → `bg-destructive`, `text-destructive`.
- `bg-amber-*`, `text-yellow-*`, `bg-orange-*` for warnings → `bg-warning-soft`, `text-warning`.
- `bg-green-*`, `text-emerald-*` for success → `bg-success-soft`, `text-success`.
- `bg-blue-*`, `text-sky-*` for info → `bg-info-soft`, `text-info`.
- Brand accents (`bg-purple-*`, `bg-violet-*`, `bg-indigo-*`) → `bg-primary`/`bg-accent` per intent.
- Weather palettes → `bg-weather-*` tokens.
- Card backgrounds `bg-white`, `bg-gray-50` → `bg-card`, `bg-muted`.
- Borders `border-gray-200` → `border-border`.

Execution order (highest-impact first, batches of related files):
1. `components/schedule/*` (≈240 occurrences)
2. `components/chat/*` (≈220)
3. `components/weather/*` + `pages/Weather.tsx` (≈75)
4. `components/proactive/*`, `components/video/*`, `pages/ReelsPage.tsx` (≈70)
5. `components/InstaScan/*`, remaining stragglers (≈70)
6. Long-tail components flagged by the audit script.

### Phase 4 — Guardrails

- Add an ESLint rule (`no-restricted-syntax`) that fails on raw Tailwind palette classes in `src/**` (allowlist: `NDVI*`, `GoogleMapBoundaryDrawer.tsx`, `ndviScience.ts`, where domain palettes are intentional).
- Add a tiny audit script `scripts/audit-hardcoded-colors.mjs` printing remaining occurrences, run in CI later.
- Document the token contract in `docs/THEMING.md` (which DB columns map to which CSS variable, and how to add a new tenant-driven token).

### Out of scope
- DB schema changes — current `white_label_configs.mobile_theme/theme_colors` shape is sufficient.
- Admin/tenant portals — only the farmer app is in scope.
- NDVI/vegetation hex palettes — scientifically meaningful, not brand.

### Files touched (high level)
- `src/contexts/TenantContext.tsx` — extended theme application + dark-mode + reset logic.
- `src/index.css` — pruned hardcoded defaults, added semantic `-soft` tokens.
- `tailwind.config.ts` — register new tokens (`success-soft`, `warning-soft`, `info-soft`, `nav-*`, `weather-*`, `chart-*`, `map-*`).
- ~120 component/page files — palette → token replacement.
- `eslint.config.js` — palette-class restriction.
- `scripts/audit-hardcoded-colors.mjs` (new), `docs/THEMING.md` (new).
