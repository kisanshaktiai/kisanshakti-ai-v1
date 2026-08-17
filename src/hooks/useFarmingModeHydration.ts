/**
 * useFarmingModeHydration
 *
 * The farming-mode chip (organic / mixed / chemical) used to stay "unset" until
 * the farmer sent a message, because the mode only arrived inside the chat
 * response metadata. This hook hydrates it the moment the chat room opens:
 *
 *   1. Instant paint from a per-land localStorage mirror (no spinner, no wait).
 *   2. Authoritative refresh from the same SSOT chain the edge function uses:
 *        land_crops.farming_type  →  farmers.farming_preference  →  unset
 *
 * DB stays the only author — the cache is a mirror for offline / first paint.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import type { FarmingMode } from '@/components/chat/FarmingModeBadge';

const CACHE_PREFIX = 'kisan.farming_mode.';

const normalizeMode = (value: unknown): FarmingMode => {
  const v = (value ?? '').toString().trim().toLowerCase();
  return v === 'fertilizer_pesticide' || v === 'organic_fertilizer' || v === 'organic_only'
    ? (v as FarmingMode)
    : 'unset';
};

/** farmers.farming_preference → land-mode taxonomy (fallback leg of the chain). */
const preferenceToMode = (pref: unknown): FarmingMode => {
  switch ((pref ?? '').toString().trim().toLowerCase()) {
    case 'organic': return 'organic_only';
    case 'integrated': return 'organic_fertilizer';
    case 'conventional': return 'fertilizer_pesticide';
    default: return 'unset';
  }
};

const readCache = (key: string): FarmingMode => {
  try {
    return normalizeMode(localStorage.getItem(CACHE_PREFIX + key));
  } catch {
    return 'unset';
  }
};

const writeCache = (key: string, mode: FarmingMode) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, mode);
  } catch {
    /* storage disabled — cache is best-effort only */
  }
};

export function useFarmingModeHydration(params: {
  landId: string | null;
  farmerId?: string | null;
  tenantId?: string | null;
}) {
  const { landId, farmerId, tenantId } = params;
  const cacheKey = landId ?? `farmer:${farmerId ?? 'anon'}`;

  const [farmingMode, setFarmingModeState] = useState<FarmingMode>(() => readCache(cacheKey));
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  /** Setter that also mirrors to cache (used by response metadata + taps). */
  const setFarmingMode = useCallback((mode: FarmingMode) => {
    setFarmingModeState(mode);
    writeCache(cacheKeyRef.current, mode);
  }, []);

  // Instant paint when switching tabs.
  useEffect(() => {
    setFarmingModeState(readCache(cacheKey));
  }, [cacheKey]);

  // Authoritative refresh.
  useEffect(() => {
    if (!farmerId || !tenantId) return;
    let cancelled = false;

    (async () => {
      try {
        const client = supabaseWithAuth(farmerId, tenantId);
        let resolved: FarmingMode = 'unset';

        if (landId) {
          const { data } = await client
            .from('land_crops')
            .select('farming_type, updated_at')
            .eq('land_id', landId)
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .limit(1);
          resolved = normalizeMode(data?.[0]?.farming_type);
        }

        if (resolved === 'unset') {
          const { data: farmer } = await client
            .from('farmers')
            .select('farming_preference')
            .eq('id', farmerId)
            .maybeSingle();
          resolved = preferenceToMode((farmer as any)?.farming_preference);
        }

        if (cancelled || cacheKeyRef.current !== cacheKey) return;
        setFarmingModeState(resolved);
        writeCache(cacheKey, resolved);
      } catch (err) {
        console.warn('[FarmingMode] hydration failed:', (err as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [landId, farmerId, tenantId, cacheKey]);

  return { farmingMode, setFarmingMode };
}
