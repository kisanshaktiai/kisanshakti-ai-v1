

# Fix: White Screen on Hostinger/Mobile — Remaining Root Causes

## Findings

### 1. `vitest.config.ts` Still Imports Removed Package (Build Interference)

**File**: `vitest.config.ts` line 2
```
import react from "@vitejs/plugin-react-swc";
```

`@vitejs/plugin-react-swc` was removed from `package.json` but `vitest.config.ts` still imports it. While this file is only for tests, some build tooling may resolve it during `npm ci`, causing install failures or phantom resolution in the GitHub Actions pipeline.

**Fix**: Change to `@vitejs/plugin-react` (the one that's actually installed).

### 2. `manualChunks` Splitting Radix UI Causes Shared Context Duplication (PRIMARY CRASH CAUSE)

The `ui-forms` chunk isolates 4 Radix packages (`checkbox`, `radio-group`, `switch`, `slider`) away from `ui-vendor` (`dialog`, `dropdown-menu`, `select`, `tooltip`). All Radix packages share internal dependencies:
- `@radix-ui/react-primitive`
- `@radix-ui/react-compose-refs`
- `@radix-ui/react-context`

When Rollup splits them into separate manual chunks, these shared internals can be **duplicated** across chunks, each getting their own React reference. In minified production output, the duplicated React reference becomes `re` — and if it resolves to the wrong copy, `re is not a function`.

**Fix**: Merge `ui-forms` into `ui-vendor` as a single chunk, so all Radix packages share one copy of internal primitives.

### 3. GitHub Actions `.htaccess` Has Broken Indentation

The deploy workflow (lines 61-92) creates `.htaccess` with a heredoc that has leading whitespace on every directive line. Apache may silently ignore malformed directives, causing JS files to be served without proper MIME types or caching headers — which on some setups causes the browser to reject the script.

**Fix**: Use `<<-'EOF'` (dash heredoc) or remove leading whitespace.

### 4. Old Service Worker Serving Stale Chunks

The PWA service worker precaches all `*.js` files (`globPatterns: ['**/*.{js,css,html,...}']`). After a new deploy, if the old SW is still active, it may serve a cached `ui-forms-OldHash.js` that doesn't match the new `index.html`'s import map — causing `undefined` function references.

The `navigateFallbackDenylist` doesn't include `/~oauth`, which is also a PWA best practice gap.

**Fix**: Add `skipWaiting: true` and `clientsClaim: true` to workbox config; add `/~oauth` to denylist.

## Fix Plan

### Fix 1 — Merge `ui-forms` into `ui-vendor` chunk

**File**: `vite.config.ts`
- Remove the `'ui-forms'` manual chunk entry entirely
- Add its 4 packages to the `'ui-vendor'` chunk

```typescript
'ui-vendor': [
  '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-select', '@radix-ui/react-tooltip',
  '@radix-ui/react-checkbox', '@radix-ui/react-radio-group',
  '@radix-ui/react-switch', '@radix-ui/react-slider'
],
```

### Fix 2 — Fix `vitest.config.ts` import

**File**: `vitest.config.ts`
- Change `import react from "@vitejs/plugin-react-swc"` → `import react from "@vitejs/plugin-react"`

### Fix 3 — Fix GitHub Actions `.htaccess` indentation

**File**: `.github/workflows/deploy-hostinger.yml`
- Remove leading whitespace from heredoc content (lines 62-92)
- Use proper heredoc without indentation

### Fix 4 — Force service worker update on deploy

**File**: `vite.config.ts` (VitePWA workbox config)
- Add `skipWaiting: true` and `clientsClaim: true`
- Add `/~oauth` to `navigateFallbackDenylist`

## Files Changed

| File | Change |
|---|---|
| `vite.config.ts` | Merge ui-forms into ui-vendor; add skipWaiting + clientsClaim to workbox |
| `vitest.config.ts` | Fix import to use `@vitejs/plugin-react` |
| `.github/workflows/deploy-hostinger.yml` | Fix `.htaccess` heredoc indentation |

## Expected Outcome

- Single Radix UI chunk eliminates shared-context duplication crash
- Service worker auto-updates on deploy, no stale chunk serving
- Correct `.htaccess` on Hostinger ensures proper MIME types
- No more white screen on mobile or any browser

