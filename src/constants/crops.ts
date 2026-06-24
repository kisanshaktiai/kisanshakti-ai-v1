/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CONSTANTS — Phase 3 SSOT shim
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The legacy `CROP_NAME_TO_CODE` lookup table was removed in Phase 3.
 * Crop name → canonical code mapping is now sourced from the database
 * (`public.crop_synonyms`) and resolved server-side by the AI brain.
 *
 * Any frontend code that genuinely needs to normalize a free-text crop name
 * should call the schedules-api / lands-api which hit the DB. The async
 * helper below is retained as a stub so legacy imports keep type-checking.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '@/integrations/supabase/client';

const inMemoryCache = new Map<string, string>();

/**
 * Resolve a crop name (English / Hindi / Marathi / regional) to its
 * canonical UPPERCASE crop code via `public.crop_synonyms`.
 *
 * Returns `null` if the input is empty, the lowercased input as-is when
 * the DB lookup fails so callers degrade gracefully.
 */
export async function normalizeCropName(
  cropName: string | undefined | null,
): Promise<string | null> {
  if (!cropName) return null;
  const key = cropName.trim().toLowerCase();
  if (!key) return null;

  if (inMemoryCache.has(key)) return inMemoryCache.get(key)!;

  try {
    const { data, error } = await supabase
      .from('crop_synonyms')
      .select('canonical_crop')
      .eq('is_active', true)
      .ilike('variant_name', key)
      .limit(1);

    if (!error && data && data.length > 0) {
      const code = data[0].canonical_crop as string;
      inMemoryCache.set(key, code);
      return code;
    }
  } catch (err) {
    console.warn('[crops] normalizeCropName DB lookup failed:', err);
  }

  // Degrade gracefully — return the lowercased input so callers can still
  // pattern-match. The server-side brain has the authoritative resolver.
  return key;
}

/**
 * NOTE: stage windows (DAS ranges per crop) are NOT hardcoded any more.
 * SSOT is `public.crop_stage_master` in the database; the backend
 * `resolveCropTimeline` helper derives the growth stage from
 * `crop_schedules.sowing_date` + `crop_stage_master` + variety
 * `maturity_days_max` and returns it on `landContext.growth_stage`.
 */
export type CropStage =
  | 'PLANNING'
  | 'GERMINATION'
  | 'VEGETATIVE'
  | 'REPRODUCTIVE'
  | 'MATURITY'
  | 'HARVEST'
  | 'POST_HARVEST'
  | 'UNKNOWN';
