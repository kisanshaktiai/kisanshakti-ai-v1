// AGRO-CLIMATIC ZONE CACHE v1.0.0

export const AGRO_ZONE_CACHE_VERSION = '1.0.0';

export interface AgroZoneThresholds {
  zone_code: string;
  name: string;
  spray_wind_threshold_kmph: number | null;
  spray_temp_max: number | null;
  spray_humidity_min: number | null;
  avg_rainfall_mm: number | null;
  temp_max_summer: number | null;
  temp_min_winter: number | null;
  climate_type: string | null;
  rainfall_pattern: string | null;
}

interface ZoneCache {
  zones: Map<string, AgroZoneThresholds>;
  loadedAt: number;
  loadingPromise?: Promise<Map<string, AgroZoneThresholds>>;
}

let cache: ZoneCache | null = null;
const CACHE_TTL = 600_000; // 10 minutes

// Load all active agro-climatic zones with spray thresholds.
export async function loadAgroZones(supabase: any): Promise<Map<string, AgroZoneThresholds>> {
  const now = Date.now();
  
  if (cache && (now - cache.loadedAt) < CACHE_TTL) {
    return cache.zones;
  }
  
  if (cache?.loadingPromise) {
    return cache.loadingPromise;
  }

  const loadPromise = (async (): Promise<Map<string, AgroZoneThresholds>> => {
    try {
      const { data, error } = await supabase
        .from('agro_climatic_zones')
        .select('zone_code, name, spray_wind_threshold_kmph, spray_temp_max, spray_humidity_min, avg_rainfall_mm, temp_max_summer, temp_min_winter, climate_type, rainfall_pattern')
        .eq('is_active', true);
      
      if (error) {
        console.error(`[AGRO_ZONE] Load failed: ${error.message}`);
        return cache?.zones || new Map();
      }
      
      const map = new Map<string, AgroZoneThresholds>();
      for (const row of (data || []) as AgroZoneThresholds[]) {
        if (row.zone_code) {
          map.set(row.zone_code, row);
        }
      }
      
      console.log(`[AGRO_ZONE] Loaded ${map.size} agro-climatic zones from DB`);
      cache = { zones: map, loadedAt: Date.now() };
      return map;
    } catch (e) {
      console.error(`[AGRO_ZONE] Cache error:`, e instanceof Error ? e.message : 'unknown');
      return cache?.zones || new Map();
    }
  })();
  
  cache = {
    zones: cache?.zones || new Map(),
    loadedAt: cache?.loadedAt || 0,
    loadingPromise: loadPromise
  };
  
  const result = await loadPromise;
  if (cache) delete cache.loadingPromise;
  return result;
}

// Get zone-specific spray thresholds for the weather safety gate.
export function getZoneSprayThresholds(
  zoneCode: string | undefined,
  zones: Map<string, AgroZoneThresholds>
): { max_wind: number; max_temp: number; min_humidity: number } | null {
  if (!zoneCode) return null;
  
  const zone = zones.get(zoneCode);
  if (!zone) return null;
  
  // Only return if at least one threshold is defined
  if (!zone.spray_wind_threshold_kmph && !zone.spray_temp_max && !zone.spray_humidity_min) {
    return null;
  }
  
  return {
    max_wind: zone.spray_wind_threshold_kmph ?? 15, // safe default
    max_temp: zone.spray_temp_max ?? 35,
    min_humidity: zone.spray_humidity_min ?? 20
  };
}
