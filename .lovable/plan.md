

# Fix: White Screen Crash — `re is not a function` in `ui-forms` Chunk

## Root Cause Analysis

**Three issues found in `vite.config.ts` and `package.json`:**

### 1. Dual React Vite Plugins (PRIMARY CAUSE)

Both are installed simultaneously:
- `@vitejs/plugin-react` (`^4.3.0`) — in **dependencies**, used in `vite.config.ts`
- `@vitejs/plugin-react-swc` (`^4.3.0`) — in **devDependencies**

Both transform JSX, but use different runtimes (Babel vs SWC). In production builds, the SWC plugin can interfere with how React primitives are compiled. When Rollup splits the `ui-forms` chunk (Checkbox, RadioGroup, Switch, Slider), the JSX runtime reference (`re` in minified code = `React.createElement` or `jsxRuntime`) resolves to `undefined` because the two plugins conflict on which JSX transform to use.

**This is the exact `re is not a function` crash.**

### 2. `vite-plugin-pwa` Version Mismatch

`vite-plugin-pwa: ^1.0.3` is for **Vite 6**. The project uses `vite: ^5.4.19`. This version mismatch can cause build-time warnings and subtle runtime issues with the generated service worker and precache manifest.

### 3. Dangerous `external` Rollup Option

The `external` function in `rollupOptions` tells Vite to NOT bundle certain modules. If any code path (even through a transitive dependency) imports from a matching path, the import resolves to `undefined` at runtime. While current `src/` code doesn't directly import these paths, this is a ticking time bomb.

## Fix Plan

### Fix 1 — Remove Duplicate React Plugin (P0)

**File**: `package.json`
- Remove `@vitejs/plugin-react-swc` from `devDependencies`
- Keep `@vitejs/plugin-react` (Babel-based, used in `vite.config.ts`)

### Fix 2 — Downgrade vite-plugin-pwa to Vite 5 Compatible Version

**File**: `package.json`
- Change `"vite-plugin-pwa": "^1.0.3"` → `"vite-plugin-pwa": "^0.21.1"`

### Fix 3 — Remove Dangerous `external` Rollup Option

**File**: `vite.config.ts`
- Remove the entire `external: (id) => { ... }` block (lines 51-57)
- These rule files don't exist in `src/` imports anyway (confirmed by search), so this config does nothing useful but poses risk

### Fix 4 — Move test dependencies to devDependencies

**File**: `package.json`
- `@testing-library/jest-dom` and `jsdom` are in both `dependencies` and `devDependencies` — remove from `dependencies`

## Files Changed

| File | Change |
|---|---|
| `package.json` | Remove `@vitejs/plugin-react-swc` from devDeps; downgrade `vite-plugin-pwa` to `^0.21.1`; clean up duplicate test deps |
| `vite.config.ts` | Remove `external` rollup option (lines 49-57) |

## Expected Outcome

- The `ui-forms` chunk compiles with a single consistent JSX runtime
- `re is not a function` crash eliminated
- App loads correctly on production/Hostinger deployment
- No white screen

