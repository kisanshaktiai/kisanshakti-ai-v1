/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM CONFIG CACHE (M2) - DB-SSOT for tunable thresholds
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-07-24 — Initial. Loads all rows from public.system_config into an
 *     in-memory map. TTL 10 min, single-flight preload. Synchronous typed
 *     accessors (`getConfigNumber`, `getConfigJson`) for hot-path callers.
 *     Callers pass a `legacyFallback` used ONLY when the cache is not yet
 *     ready (cold-boot) OR the key is missing. Once the cache has loaded
 *     successfully, missing keys log a `[SYSCFG_MISS]` warning and return the
 *     provided legacy value so behavior stays identical to the pre-migration
 *     baseline. No safety-hard-fail semantics here — these are tunables, not
 *     regulatory truth.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Supa = any;

interface SysCfgState {
  loadedAt: number | null;
  loading: Promise<void> | null;
  values: Map<string, unknown>;
}

const TTL_MS = 10 * 60 * 1000;

const state: SysCfgState = {
  loadedAt: null,
  loading: null,
  values: new Map(),
};

export function systemConfigReady(): boolean {
  return state.loadedAt !== null;
}

function isFresh(): boolean {
  return state.loadedAt !== null && Date.now() - state.loadedAt < TTL_MS;
}

// Preload every row from system_config. Idempotent + single-flight.
export async function preloadSystemConfig(
  supabase: Supa,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force && isFresh()) return;
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const started = Date.now();
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('config_key, config_value');

      if (error) {
        console.warn(`[SYSCFG_CACHE_MISS] preload_failed err=${error.message}`);
        return;
      }

      const next = new Map<string, unknown>();
      for (const row of data ?? []) {
        const k = String(row.config_key ?? '').trim();
        if (!k) continue;
        next.set(k, row.config_value);
      }

      // Atomic swap only if non-empty; otherwise retain last-good.
      if (next.size === 0) {
        console.warn('[SYSCFG_CACHE_MISS] empty_result action=keep_previous');
      } else {
        state.values = next;
        state.loadedAt = Date.now();
      }

      console.log(
        `[SYSCFG_CACHE] loaded_ms=${Date.now() - started} keys=${next.size}`,
      );
    } catch (e) {
      console.error(`[SYSCFG_CACHE_MISS] preload_threw err=${(e as Error).message}`);
    } finally {
      state.loading = null;
    }
  })();

  return state.loading;
}

function missWarn(key: string): void {
  if (!systemConfigReady()) return; // cold-boot silent
  console.warn(`[SYSCFG_MISS] key=${key} action=legacy_fallback`);
}

export function getConfigRaw<T = unknown>(key: string, legacyFallback: T): T {
  if (state.values.has(key)) return state.values.get(key) as T;
  missWarn(key);
  return legacyFallback;
}

export function getConfigNumber(key: string, legacyFallback: number): number {
  const v = state.values.get(key);
  if (v === undefined || v === null) {
    missWarn(key);
    return legacyFallback;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) {
    console.warn(`[SYSCFG_MISS] key=${key} reason=not_a_number value=${JSON.stringify(v)}`);
    return legacyFallback;
  }
  return n;
}

export function getConfigJson<T extends object>(key: string, legacyFallback: T): T {
  const v = state.values.get(key);
  if (v === undefined || v === null) {
    missWarn(key);
    return legacyFallback;
  }
  if (typeof v !== 'object') {
    console.warn(`[SYSCFG_MISS] key=${key} reason=not_json_object value=${JSON.stringify(v)}`);
    return legacyFallback;
  }
  return v as T;
}

/** For diagnostics / tests. */
export function _systemConfigSnapshot() {
  return { loadedAt: state.loadedAt, keys: state.values.size };
}
