# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KisanShakti AI — a multi-tenant, white-label, offline-first PWA + Capacitor mobile app for Indian farmers. It provides AI crop scheduling, agronomic chat advisory, weather/NDVI intelligence, crop scanning, market-price insights, and community features, all localized into multiple Indian languages with voice/TTS.

Stack: Vite + React 18 + TypeScript + shadcn/ui + Tailwind, Supabase (Postgres + Deno edge functions) backend, Capacitor for Android/iOS. The repo is connected to **Lovable** — commits made in Lovable land here automatically, and `lovable-tagger` runs only in dev mode.

## Commands

```bash
npm run dev            # Vite dev server on port 8080
npm run build          # Runs prebuild guard (env-intelligence-guard) then vite build
npm run build:dev      # Development-mode build
npm run lint           # ESLint over the repo
npm run test           # Vitest run (jsdom)
npm run check          # env-intelligence-guard + eslint (use before pushing)
npm run guard          # Run the env-intelligence regression guard alone
npm run bundle-rules   # Bundle source-rules into the ai-agriculture-chat edge function
```

Run a single test file or by name:
```bash
npx vitest run src/components/chat/__tests__/CanonicalAdvisoryCard.test.tsx
npx vitest run -t "partial test name"
npx vitest            # watch mode
```

Tests live both under `src/**/__tests__/*.test.tsx` and top-level `tests/` (`e2e/`, `unit/`, `pwa/`, `voice/`, `edge/`). Setup file: `src/test/setup.ts`. Import alias `@/` → `src/`.

Note: both `bun.lock` and `package-lock.json` are committed; scripts are invoked with `npm`.

## The env-intelligence guard (build-blocking)

`scripts/env-intelligence-guard.mjs` runs on every `npm run build` (via `prebuild`) and **fails the build** if any of four regressions reappear in `supabase/functions/`. Do not reintroduce these patterns:
- **Fabricated diurnal spread** — synthesizing min/max temp by arithmetic on current temp (`temp + 3`, `temp - 5`) inside `weather/`. Values must come from a provider or a registry-backed method.
- **Constant confidence** — the literal `? 0.9 : 0.75`. Confidence must come from `CONFIDENCE_MODEL`.
- **Unregistered scientific method** — every `METHOD_ID@version` tag used in edge functions must exist in `scripts/sci-methods-manifest.json` (mirror of `public.sci_method_registry`).
- **Weather contract drift** — top-level keys recorded in `scripts/weather-contract-snapshot.json` must still be produced by `weather/index.ts`. Removing/renaming a key fails; adding is allowed. Regenerate the snapshot deliberately after an intentional contract change.

## Architecture

### Multi-tenant data isolation (critical)
Every tenant is a white-label deployment; all data is scoped by `tenant_id`. **Never** use the bare `supabase` client for tenant data — it is not tenant-scoped and will leak data across tenants. Instead:

```typescript
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const { user } = useAuthStore();
const client = supabaseWithAuth(user.id, user.tenantId);   // auto-filtered by tenant
const { data } = await client.from('lands').select('*');
```

`src/integrations/supabase/client.ts` also holds a global-auth-data pattern (`setGlobalAuthData` / `waitForHeaders`) that breaks a circular dependency with the auth store and prevents queries running before auth headers are ready. Tenant resolution flows through `TenantProvider`/`useTenant` (`src/contexts/TenantContext.tsx`) and `tenantIsolationService`. In dev, tenant is chosen via `VITE_DEFAULT_TENANT_ID` → localStorage → `is_default` tenant; in prod it's resolved from the custom domain. See `MULTI_TENANT_DEVELOPER_GUIDE.md` / `MULTI_TENANT_QUICK_START.md`. Edge functions enforce the same boundary via `_shared/tenantAccessGuard.ts`, `tenantMiddleware.ts`, and `authMiddleware.ts`.

### App shell (`src/App.tsx`)
Router is `createBrowserRouter` with all pages lazy-loaded through `lazyWithRetry` (auto-retries and recovers from stale PWA chunks). Providers nest: `QueryClientProvider` → `I18nextProvider` → `TenantProvider` → auth/subscription/voice contexts. `ProtectedRoute` gates authed pages; `ErrorBoundary`/`RouteErrorBoundary` wrap the tree. Global realtime sync runs via `useGlobalRealtimeSync`.

### AI edge functions (`supabase/functions/`, Deno)
Backend AI runs as Supabase edge functions (JWT verification per-function in `supabase/config.toml`). Key functions: `ai-agriculture-chat` (the large neuro-symbolic advisory chat), `ai-smart-schedule`, `ai-crop-scan`, `ai-marketing-insights`, `weather`, `env-intelligence`, plus `lands-api`/`schedules-api` and community/TTS/translate functions. Shared middleware lives in `_shared/`.

`ai-agriculture-chat` is orchestrator-driven (`agents/orchestrator.ts`) with a mandatory graph gate, layered clarification/decision pipeline, an LLM understanding layer, and a large rules engine. Its **rules are authored in `source-rules/` and must be bundled** into `bundled-rules/` via `npm run bundle-rules` before they take effect at runtime — editing source rules alone is not enough. The function carries a top-of-file CHANGE LOG and `BUILD_TAG` marker; preserve those conventions when editing.

### Decision graph (`src/decision-graph/`)
Frontend `@/decision-graph` exports **types only** — all rule-evaluation logic was moved server-side into `ai-agriculture-chat/source-rules/` for security. Do not add rule logic to the frontend module.

### Offline-first / PWA
- `src/services/localDB.ts` — IndexedDB (via `idb`) whose interfaces mirror Supabase tables exactly; tenant-scoped through `tenantIsolationService`.
- `syncService.ts`, `offlineDataService.ts`, `chatSyncService.ts`, `networkStatusService.ts`, `offlineAuthService.ts` handle sync and offline auth.
- Service worker: `vite-plugin-pwa` (`generateSW`) with a **static** `public/manifest.json` (`manifest: false`), custom SW registration in `main.tsx` (`injectRegister: false`), and `src/sw-custom.ts`. Supabase API is `NetworkFirst`, images `CacheFirst`. `vite.config.ts` injects a unique `BUILD_HASH` per build for cache invalidation and defines manual vendor chunks — keep that chunking in mind when adding heavy deps.

### Voice, TTS & i18n
Multilingual via `i18next` (`src/i18n/`). Voice/TTS is layered across native (Capacitor), Kokoro (`kokoro-js`), and web providers behind `universalTTSService` / `hybridTTSService`, with Zustand stores (`ttsStore`, `voiceNavigationStore`, `languageStore`) and the `ModernVoiceContext`.

### State
Zustand stores in `src/stores/` (`authStore`, `languageStore`, weather, tts, voice). Server state via TanStack Query (query keys centralized in `src/utils/queryKeys.ts`). React contexts in `src/contexts/` for tenant, subscription, maps, and voice.

## Conventions & cautions
- Supabase `types.ts` and `client.ts` are generated — avoid hand-editing.
- `SUPABASE_CONFIG` anon key in `config/supabase.ts` and `client.ts` is the public anon key by design (RLS enforces security), not a secret.
- `_deadcode/` holds retired code; do not wire it back in without cause.
- There is an extensive set of top-level `*_AUDIT*.md` / `*_REPORT.md` design docs; consult the relevant one (weather, tenant isolation, crop-stage SSOT, sync) before large changes in those areas.
