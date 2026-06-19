/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DB-DRIVEN LOOKUPS — Phase 3 SSOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Replaces the hardcoded knowledge constants that previously lived in the
 * orchestrator, symbolic-reasoner, and decision-graph-bridge-data files.
 *
 * Every lookup table is now read from Postgres so the AI agriculture brain
 * has a single source of truth that agronomy editors can update without
 * a code deploy.
 *
 *  • emergency_observation_codes   → emergency-path triggers
 *  • direct_advisory_routes        → routes that skip clarification
 *  • observation_master(semantic_class IN ('pest','disease')) → biotic codes
 *  • cultural_strategies           → per-crop cultural farming tips
 *
 * Caches use a module-level WeakMap keyed by the SupabaseClient instance.
 * The cache is therefore scoped to the warm isolate's lifetime and is
 * invalidated automatically when the client is reconstructed (e.g. in tests
 * or after a cold start).
 * ═══════════════════════════════════════════════════════════════════════════
 */

type SupaLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq?: (col: string, val: unknown) => any;
      in?: (col: string, vals: unknown[]) => any;
    };
  };
};

interface LookupCacheEntry<T> {
  promise: Promise<T>;
  loadedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes — tiny lookup tables, refresh occasionally

const emergencyCache = new WeakMap<object, LookupCacheEntry<Set<string>>>();
const directRoutesCache = new WeakMap<object, LookupCacheEntry<Set<string>>>();
const bioticCache = new WeakMap<object, LookupCacheEntry<Set<string>>>();
const culturalCache = new WeakMap<object, LookupCacheEntry<Map<string, string[]>>>();

function fresh(entry: LookupCacheEntry<unknown> | undefined): boolean {
  return !!entry && Date.now() - entry.loadedAt < TTL_MS;
}

// ────────────────────────────────────────────────────────────────────────
// 1. EMERGENCY OBSERVATION CODES
// ────────────────────────────────────────────────────────────────────────
export async function loadEmergencyObservationCodes(
  supabase: SupaLike,
): Promise<Set<string>> {
  const cached = emergencyCache.get(supabase as object);
  if (fresh(cached)) return cached!.promise;

  const promise = (async () => {
    const { data, error } = await (supabase as any)
      .from('emergency_observation_codes')
      .select('observation_code');
    if (error) {
      console.error('[db-lookups] emergency_observation_codes load failed:', error);
      return new Set<string>();
    }
    return new Set<string>((data || []).map((r: any) => r.observation_code));
  })();

  emergencyCache.set(supabase as object, { promise, loadedAt: Date.now() });
  return promise;
}

// ────────────────────────────────────────────────────────────────────────
// 2. DIRECT ADVISORY ROUTES
// ────────────────────────────────────────────────────────────────────────
export async function loadDirectAdvisoryRoutes(
  supabase: SupaLike,
): Promise<Set<string>> {
  const cached = directRoutesCache.get(supabase as object);
  if (fresh(cached)) return cached!.promise;

  const promise = (async () => {
    const { data, error } = await (supabase as any)
      .from('direct_advisory_routes')
      .select('route_code');
    if (error) {
      console.error('[db-lookups] direct_advisory_routes load failed:', error);
      return new Set<string>();
    }
    return new Set<string>((data || []).map((r: any) => r.route_code));
  })();

  directRoutesCache.set(supabase as object, { promise, loadedAt: Date.now() });
  return promise;
}

// ────────────────────────────────────────────────────────────────────────
// 3. BIOTIC OBSERVATION CODES (semantic_class ∈ {pest,disease})
// ────────────────────────────────────────────────────────────────────────
export async function loadBioticObservationCodes(
  supabase: SupaLike,
): Promise<Set<string>> {
  const cached = bioticCache.get(supabase as object);
  if (fresh(cached)) return cached!.promise;

  const promise = (async () => {
    // observation_master may exceed PostgREST's 1000-row default — paginate.
    const pageSize = 1000;
    const codes: string[] = [];
    let from = 0;
    // Hard ceiling so a corrupted table cannot spin forever.
    for (let i = 0; i < 20; i++) {
      const { data, error } = await (supabase as any)
        .from('observation_master')
        .select('observation_code')
        .in('semantic_class', ['pest', 'disease'])
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('[db-lookups] biotic observation_master load failed:', error);
        return new Set<string>();
      }
      const rows = (data || []) as Array<{ observation_code: string }>;
      codes.push(...rows.map((r) => r.observation_code));
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return new Set<string>(codes);
  })();

  bioticCache.set(supabase as object, { promise, loadedAt: Date.now() });
  return promise;
}

// ────────────────────────────────────────────────────────────────────────
// 4. CULTURAL STRATEGIES PER CROP
// ────────────────────────────────────────────────────────────────────────
async function loadAllCulturalStrategies(
  supabase: SupaLike,
): Promise<Map<string, string[]>> {
  const cached = culturalCache.get(supabase as object);
  if (fresh(cached)) return cached!.promise;

  const promise = (async () => {
    const { data, error } = await (supabase as any)
      .from('cultural_strategies')
      .select('crop_code, strategy, priority')
      .order('priority', { ascending: true });
    if (error) {
      console.error('[db-lookups] cultural_strategies load failed:', error);
      return new Map<string, string[]>();
    }
    const map = new Map<string, string[]>();
    for (const row of (data || []) as Array<{ crop_code: string; strategy: string }>) {
      const key = (row.crop_code || 'GENERAL').toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row.strategy);
    }
    return map;
  })();

  culturalCache.set(supabase as object, { promise, loadedAt: Date.now() });
  return promise;
}

export async function getCulturalAdviceFromDB(
  supabase: SupaLike,
  crop: string,
): Promise<string[]> {
  const all = await loadAllCulturalStrategies(supabase);
  const normCrop = (crop || 'GENERAL').toUpperCase();
  // Exact match first
  if (all.has(normCrop)) return all.get(normCrop)!;
  // Substring match (e.g. caller passes "SUGARCANE_RATOON")
  for (const [key, strategies] of all.entries()) {
    if (key !== 'GENERAL' && normCrop.includes(key)) return strategies;
  }
  return all.get('GENERAL') || [];
}
