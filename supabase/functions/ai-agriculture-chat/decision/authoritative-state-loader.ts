// ✅ FORENSIC REFACTOR COMPLETE
// Authority: SINGLE SOURCE OF TRUTH for NDVI interpretation, soil interpretation, and land state assembly

// AUTHORITATIVE STATE LOADER v2.0.0 - SSOT ENFORCED

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getConfigJson, getConfigNumber } from '../utils/db-ssot/system-config-cache.ts';

export const AUTHORITATIVE_STATE_LOADER_VERSION = '2.1.0';

// CHANGE LOG (newest first)
// 2026-07-24 — P7: NDVI status bands, soil nutrient bands, and freshness

// CANONICAL INTERPRETATION ENUMS - SINGLE SOURCE OF TRUTH

// Canonical NDVI status - SSOT interpretation
export enum NDVIStatus {
  EXCELLENT = 'EXCELLENT',      // >= 0.7
  GOOD = 'GOOD',                // 0.55 - 0.69
  MODERATE = 'MODERATE',        // 0.4 - 0.54
  POOR = 'POOR',                // 0.25 - 0.39
  CRITICAL = 'CRITICAL',        // < 0.25
  UNKNOWN = 'UNKNOWN'           // No data
}

// Canonical soil nutrient level - SSOT interpretation
export enum SoilNutrientLevel {
  HIGH = 'HIGH',
  ADEQUATE = 'ADEQUATE',
  LOW = 'LOW',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

// Canonical water stress level - derived from NDVI + rainfall
export enum WaterStressLevel {
  NONE = 'NONE',
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  UNKNOWN = 'UNKNOWN'
}

// Canonical NDVI trend - calculated from historical data
export enum NDVITrend {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  DECLINING = 'DECLINING',
  UNKNOWN = 'UNKNOWN'
}

// INTERPRETATION THRESHOLDS - SINGLE SOURCE OF TRUTH

// Cold-boot legacy fallbacks. Values are byte-identical to seeded DB rows.
// Do NOT tune here — edit system_config rows instead.
const _LEGACY_NDVI_THRESHOLDS = {
  EXCELLENT: 0.7,
  GOOD: 0.55,
  MODERATE: 0.4,
  POOR: 0.25,
} as const;

const _LEGACY_SOIL_THRESHOLDS = {
  NITROGEN:   { HIGH: 350, ADEQUATE: 250, LOW: 150 },
  PHOSPHORUS: { HIGH: 25,  ADEQUATE: 15,  LOW: 8  },
  POTASSIUM:  { HIGH: 200, ADEQUATE: 130, LOW: 80 },
} as const;

// F5 (2026-07-29): NOT externalized to system_config by design.
// weather_current / weather_observations / weather_aggregates are the ONLY
// weather SSOT — a second weather config source is forbidden. These are pure
// staleness windows applied to the SSOT rows, kept in code.
const FRESHNESS_THRESHOLDS = {
  WEATHER_HOURS: 6,
  SCHEDULE_DAYS: 365,
} as const;
function weatherFreshnessHours(): number {
  return FRESHNESS_THRESHOLDS.WEATHER_HOURS;
}
export function scheduleFreshnessDays(): number {
  return FRESHNESS_THRESHOLDS.SCHEDULE_DAYS;
}

function ndviThresholds() {
  return getConfigJson('ndvi_status_thresholds', _LEGACY_NDVI_THRESHOLDS);
}
function soilThresholds() {
  return getConfigJson('soil_nutrient_thresholds', _LEGACY_SOIL_THRESHOLDS);
}
function soilFreshnessDays() {
  return getConfigNumber('soil_data_freshness_days', 90);
}
function ndviFreshnessDays() {
  // Kharif window is the tighter and current default; a per-season selector
  // can be layered on top later without touching this loader.
  return getConfigNumber('ndvi_staleness_days_kharif', 7);
}

// SSOT INTERPRETATION FUNCTIONS

// Interpret NDVI value to canonical status
export function interpretNDVI(value: number | null | undefined): NDVIStatus {
  if (value === null || value === undefined || isNaN(value)) {
    return NDVIStatus.UNKNOWN;
  }
  const t = ndviThresholds() as typeof _LEGACY_NDVI_THRESHOLDS;
  if (value >= t.EXCELLENT) return NDVIStatus.EXCELLENT;
  if (value >= t.GOOD) return NDVIStatus.GOOD;
  if (value >= t.MODERATE) return NDVIStatus.MODERATE;
  if (value >= t.POOR) return NDVIStatus.POOR;
  return NDVIStatus.CRITICAL;
}

// Interpret nitrogen value to canonical level
export function interpretNitrogen(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  const t = (soilThresholds() as typeof _LEGACY_SOIL_THRESHOLDS).NITROGEN;
  if (value >= t.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= t.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= t.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

// Interpret phosphorus value to canonical level
export function interpretPhosphorus(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  const t = (soilThresholds() as typeof _LEGACY_SOIL_THRESHOLDS).PHOSPHORUS;
  if (value >= t.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= t.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= t.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

// Interpret potassium value to canonical level
export function interpretPotassium(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  const t = (soilThresholds() as typeof _LEGACY_SOIL_THRESHOLDS).POTASSIUM;
  if (value >= t.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= t.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= t.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

// Calculate water stress level from NDVI and rainfall
export function calculateWaterStress(
  ndviValue: number | null | undefined,
  recentRainfall: number | null | undefined
): WaterStressLevel {
  if (ndviValue === null || ndviValue === undefined) {
    return WaterStressLevel.UNKNOWN;
  }
  
  const rainfall = recentRainfall ?? 0;
  
  if (ndviValue < 0.3 && rainfall < 5) return WaterStressLevel.SEVERE;
  if (ndviValue < 0.4 && rainfall < 10) return WaterStressLevel.MODERATE;
  if (ndviValue < 0.5) return WaterStressLevel.MILD;
  return WaterStressLevel.NONE;
}

// Calculate NDVI trend from historical readings
export function calculateNDVITrend(
  readings: { value: number; date: string }[]
): NDVITrend {
  if (!readings || readings.length < 2) {
    return NDVITrend.UNKNOWN;
  }
  
  const recentAvg = readings.slice(0, 3).reduce((sum, r) => sum + (r.value || 0), 0) / Math.min(3, readings.length);
  const olderCount = Math.min(3, readings.length - 3);
  
  if (olderCount <= 0) return NDVITrend.UNKNOWN;
  
  const olderAvg = readings.slice(3, 6).reduce((sum, r) => sum + (r.value || 0), 0) / olderCount;
  
  if (olderAvg <= 0) return NDVITrend.UNKNOWN;
  
  const change = (recentAvg - olderAvg) / olderAvg;
  
  if (change > 0.05) return NDVITrend.IMPROVING;
  if (change < -0.05) return NDVITrend.DECLINING;
  return NDVITrend.STABLE;
}

// TYPE DEFINITIONS - AUTHORITATIVE LAND STATE

export interface AuthoritativeLandState {
  // Identity
  land_id: string;
  tenant_id: string;
  farmer_id: string;
  
  // Land Properties
  land_name: string;
  area_hectares: number;
  area_acres: number;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  state: string | null;
  
  // Crop Schedule (AUTHORITATIVE) — PR-4d: extended with canonical identity
  crop: {
    current_crop: string | null;
    crop_code: string | null;
    crop_id: string | null;               // lands.current_crop_id (uuid, canonical)
    variety_id: string | null;            // lands.current_crop_variety_id or crop_schedules.variety_id
    variety_name: string | null;          // crop_schedules.crop_variety
    growth_stage: string | null;
    stage_uuid: string | null;            // phenology RPC > lands.stage_uuid (F4)
    cultivation_method: string | null;    // F1: crop_schedules.cultivation_method lane
    stage_source_authoritative: string | null; // lands.stage_source ('phenology_ssot' | 'planting_date' | ...)
    stage_resolved_at: string | null;     // lands.stage_resolved_at
    days_since_sowing: number | null;     // precomputed lands.das when present, else computed
    precomputed_das: number | null;       // raw lands.das (null when not persisted)
    sowing_date: string | null;
    planting_date: string | null;         // lands.planting_date
    last_sowing_date: string | null;      // lands.last_sowing_date
    transplant_date: string | null;       // lands.transplant_date ?? crop_schedules.transplant_date
    crop_cycle: string | null;            // lands.crop_cycle
    current_gdd: number | null;           // lands.current_gdd
    expected_harvest_date: string | null;
    schedule_status: string | null;
  };
  
  // Soil Health (AUTHORITATIVE)
  soil: {
    ph: number | null;
    organic_carbon: number | null;
    nitrogen_kg_per_ha: number | null;
    phosphorus_kg_per_ha: number | null;
    potassium_kg_per_ha: number | null;
    texture: string | null;
    test_date: string | null;
    test_age_days: number | null;
    data_fresh: boolean;
  };
  
  // NDVI / Satellite (AUTHORITATIVE)
  ndvi: {
    latest_value: number | null;
    latest_date: string | null;
    trend: NDVITrend;
    age_days: number | null;
    history: { value: number; date: string }[];
    data_fresh: boolean;
  };
  
  // Weather (AUTHORITATIVE)
  weather: {
    temperature: number | null;
    humidity: number | null;
    rainfall_last_24h: number | null;
    rain_probability: number | null;
    wind_speed: number | null;
    data_timestamp: string | null;
    data_age_hours: number | null;
    data_fresh: boolean;
    data_source?: string | null;
  };
  
  // Derived Metrics - SSOT INTERPRETATIONS
  derived: {
    // NDVI interpretation - SSOT
    ndvi_status: NDVIStatus;
    
    // Soil interpretation - SSOT
    nitrogen_level: SoilNutrientLevel;
    phosphorus_level: SoilNutrientLevel;
    potassium_level: SoilNutrientLevel;
    
    // Water stress - SSOT
    water_stress_level: WaterStressLevel;
    
    // Legacy fields for backward compatibility
    crop_health_status: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'unknown';
    
    // Data quality
    data_completeness_score: number; // 0-100
    data_freshness_score: number; // 0-100
    critical_missing: string[];
  };
  
  // Metadata
  loaded_at: string;
  sources_available: string[];
  sources_missing: string[];
}

export interface StateLoadingResult {
  success: boolean;
  state: AuthoritativeLandState | null;
  error?: string;
  loading_time_ms: number;
}

// MAIN LOADER FUNCTION

export async function loadAuthoritativeLandState(
  landId: string,
  farmerId: string,
  tenantId: string
): Promise<StateLoadingResult> {
  const startTime = Date.now();
  
  console.log(`📊 [AuthoritativeStateLoader] Loading state for land: ${landId}`);
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  try {
    // PARALLEL DATA LOADING - Query all authoritative tables simultaneously
    const [
      landResult,
      cropScheduleResult,
      soilHealthResult,
      ndviResult,
      weatherResult,
      phenologyResult
    ] = await Promise.all([
      // 1. Land base data — PR-4d: pull the authoritative SSOT columns
      supabase
        .from('lands')
        .select(
          'id, name, area_acres, center_lat, center_lon, farmer_id, tenant_id, ' +
          'district_id, state_id, soil_type, irrigation_type, water_source, cultivation_date, ' +
          'das, stage_uuid, crop_stage, stage_source, stage_resolved_at, ' +
          'current_crop, current_crop_id, current_crop_variety_id, ' +
          'planting_date, last_sowing_date, transplant_date, crop_cycle, current_gdd'
        )
        .eq('id', landId)
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId)
        .single(),

      // 2. Crop schedule (active season) — PR-4d: include variety_id,
      supabase
        .from('crop_schedules')
        .select('crop_name, crop_variety, variety_id, cultivation_method, sowing_date, transplant_date, stages_covered, expected_harvest_date, status, is_active')
        .eq('land_id', landId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // 3. Soil health (latest test) — FIXED: soil_texture → texture
      supabase
        .from('soil_health')
        .select('ph_level, organic_carbon, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, texture, test_date, created_at')
        .eq('land_id', landId)
        .order('test_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // 4. NDVI data — FIXED: ndvi_readings → ndvi_data, observation_date → date
      supabase
        .from('ndvi_data')
        .select('ndvi_value, mean_ndvi, date, min_ndvi, max_ndvi, quality_score')
        .eq('land_id', landId)
        .order('date', { ascending: false })
        .limit(10),
      
      // 5. Weather data — Try weather_observations first, fallback to weather_current
      supabase
        .from('weather_observations')
        .select('temperature_celsius, humidity_percent, rainfall_mm, wind_speed_kmh, metadata, observation_date, land_id')
        .eq('land_id', landId)
        .order('observation_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 6. PR-1 · Crop-stage SSOT — variety-aware phenology resolver.
      supabase.rpc('resolve_crop_phenology_for_land', { p_land_id: landId })
    ]);
    
    // VALIDATE LAND ACCESS
    if (landResult.error || !landResult.data) {
      console.error(`❌ [AuthoritativeStateLoader] Land not found or access denied: ${landId}`);
      return {
        success: false,
        state: null,
        error: 'Land not found or access denied',
        loading_time_ms: Date.now() - startTime
      };
    }
    
    // Supabase generated types may lag newly-added lands SSOT columns and
    const land: any = landResult.data as any;
    const now = new Date();
    
    // PROCESS CROP SCHEDULE
    const cropSchedule = cropScheduleResult.data;
    const precomputedDas: number | null =
      typeof (land as any)?.das === 'number' ? (land as any).das : null;
    const anchorSowingDate: string | null =
      (land as any)?.planting_date ??
      (land as any)?.last_sowing_date ??
      cropSchedule?.transplant_date ??
      (land as any)?.transplant_date ??
      cropSchedule?.sowing_date ??
      null;

    let daysSinceSowing: number | null = precomputedDas;
    if (daysSinceSowing === null && anchorSowingDate) {
      const sowingDate = new Date(anchorSowingDate);
      daysSinceSowing = Math.floor((now.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // PROCESS SOIL HEALTH
    const soilHealth = soilHealthResult.data;
    let soilTestAgeDays: number | null = null;
    let soilDataFresh = false;
    
    if (soilHealth?.test_date) {
      const testDate = new Date(soilHealth.test_date);
      soilTestAgeDays = Math.floor((now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
      soilDataFresh = soilTestAgeDays <= soilFreshnessDays();
    }
    
    // PROCESS NDVI DATA WITH SSOT INTERPRETATION
    const ndviReadings = ndviResult.data || [];
    let ndviLatest: number | null = null;
    let ndviLatestDate: string | null = null;
    let ndviAgeDays: number | null = null;
    let ndviDataFresh = false;
    
    if (ndviReadings.length > 0) {
      ndviLatest = ndviReadings[0].ndvi_value ?? ndviReadings[0].mean_ndvi ?? null;
      ndviLatestDate = ndviReadings[0].date; // FIXED: observation_date → date
      
      if (ndviLatestDate) {
        const latestDate = new Date(ndviLatestDate);
        ndviAgeDays = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
        ndviDataFresh = ndviAgeDays <= ndviFreshnessDays();
      }
    }
    
    // Calculate NDVI trend using SSOT function — FIXED: use .date
    const ndviHistory = ndviReadings.slice(0, 5).map(r => ({
      value: r.ndvi_value ?? r.mean_ndvi ?? 0,
      date: r.date
    }));
    const ndviTrend = calculateNDVITrend(ndviHistory);
    
    // PROCESS WEATHER DATA
    let weather = weatherResult.data;
    let weatherAgeHours: number | null = null;
    let weatherDataFresh = false;
    let weatherSource = 'weather_observations';
    
    // If no weather_observations for this land, fallback to weather_current via location_key
    if (!weather && land.center_lat && land.center_lon) {
      const lat = Number(land.center_lat);
      const lon = Number(land.center_lon);
      const locationKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      console.log(`🌤️ [AuthoritativeStateLoader] No weather_observations for land ${landId}, falling back to weather_current (location_key: ${locationKey})`);
      
      // Strategy 1: Exact location_key match
      let { data: currentWeather } = await supabase
        .from('weather_current')
        .select('temperature_celsius, humidity_percent, wind_speed_kmh, rain_1h_mm, rain_24h_mm, weather_main, uv_index, observation_time')
        .eq('location_key', locationKey)
        .order('observation_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Strategy 2: Proximity search - find nearest within ~50km
      if (!currentWeather) {
        console.log(`⚠️ [AuthoritativeStateLoader] No exact match for ${locationKey}, searching nearby...`);
        const latRange = 0.5;
        const lonRange = 0.5;
        const { data: nearbyRecords } = await supabase
          .from('weather_current')
          .select('temperature_celsius, humidity_percent, wind_speed_kmh, rain_1h_mm, rain_24h_mm, weather_main, uv_index, observation_time, latitude, longitude')
          .gte('latitude', lat - latRange)
          .lte('latitude', lat + latRange)
          .gte('longitude', lon - lonRange)
          .lte('longitude', lon + lonRange)
          .order('observation_time', { ascending: false })
          .limit(5);
        
        if (nearbyRecords && nearbyRecords.length > 0) {
          let closest = nearbyRecords[0];
          let minDist = Infinity;
          for (const rec of nearbyRecords) {
            const d = Math.sqrt(Math.pow((rec.latitude || 0) - lat, 2) + Math.pow((rec.longitude || 0) - lon, 2));
            if (d < minDist) { minDist = d; closest = rec; }
          }
          currentWeather = closest;
          console.log(`✅ [AuthoritativeStateLoader] Found nearby weather (dist: ${(minDist * 111).toFixed(1)}km)`);
        }
      }
      
      if (currentWeather) {
        weatherSource = 'weather_current';
        weather = {
          temperature_celsius: currentWeather.temperature_celsius,
          humidity_percent: currentWeather.humidity_percent,
          rainfall_mm: currentWeather.rain_24h_mm ?? currentWeather.rain_1h_mm ?? 0,
          wind_speed_kmh: currentWeather.wind_speed_kmh,
          observation_date: currentWeather.observation_time?.split('T')[0] ?? null,
          land_id: landId,
          metadata: {
            humidity: currentWeather.humidity_percent,
            rainfall: currentWeather.rain_24h_mm ?? currentWeather.rain_1h_mm ?? 0,
            rainfall_last_24h: currentWeather.rain_24h_mm ?? 0,
            rain_probability: null,
            wind_speed: currentWeather.wind_speed_kmh,
            uv_index: currentWeather.uv_index,
            weather_main: currentWeather.weather_main,
            source: 'weather_current_proximity'
          }
        } as any;
        console.log(`✅ [AuthoritativeStateLoader] Got weather from weather_current: ${currentWeather.temperature_celsius}°C, ${currentWeather.humidity_percent}% humidity`);
      }
    }
    
    // Parse metadata for humidity, rainfall, wind etc. if available
    const weatherMeta = (weather as any)?.metadata as any || {};
    
    if ((weather as any)?.observation_date) {
      const fetchedAt = new Date((weather as any).observation_date);
      weatherAgeHours = Math.floor((now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60));
      weatherDataFresh = weatherAgeHours <= weatherFreshnessHours();
    }
    
    // CALCULATE DERIVED METRICS USING SSOT INTERPRETATION FUNCTIONS
    const sourcesAvailable: string[] = [];
    const sourcesMissing: string[] = [];
    
    if (cropSchedule) sourcesAvailable.push('crop_schedule'); else sourcesMissing.push('crop_schedule');
    if (soilHealth) sourcesAvailable.push('soil_health'); else sourcesMissing.push('soil_health');
    if (ndviReadings.length > 0) sourcesAvailable.push('ndvi'); else sourcesMissing.push('ndvi');
    if (weather) sourcesAvailable.push('weather'); else sourcesMissing.push('weather');
    
    const dataCompletenessScore = (sourcesAvailable.length / 4) * 100;
    
    // Freshness score (average of fresh data points)
    const freshnessPoints = [
      soilDataFresh ? 1 : 0,
      ndviDataFresh ? 1 : 0,
      weatherDataFresh ? 1 : 0,
      cropSchedule ? 1 : 0 // Schedule is either current or not
    ];
    const dataFreshnessScore = (freshnessPoints.reduce((a, b) => a + b, 0) / 4) * 100;
    
    // SSOT INTERPRETATION: Use interpretation functions
    const ndviStatus = interpretNDVI(ndviLatest);
    const nitrogenLevel = interpretNitrogen(soilHealth?.nitrogen_kg_per_ha);
    const phosphorusLevel = interpretPhosphorus(soilHealth?.phosphorus_kg_per_ha);
    const potassiumLevel = interpretPotassium(soilHealth?.potassium_kg_per_ha);
    const waterStressLevel = calculateWaterStress(ndviLatest, weatherMeta?.rainfall ?? weatherMeta?.rainfall_last_24h ?? null);
    
    // Legacy crop health status mapping
    const cropHealthMap: Record<NDVIStatus, 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'unknown'> = {
      [NDVIStatus.EXCELLENT]: 'excellent',
      [NDVIStatus.GOOD]: 'good',
      [NDVIStatus.MODERATE]: 'moderate',
      [NDVIStatus.POOR]: 'poor',
      [NDVIStatus.CRITICAL]: 'critical',
      [NDVIStatus.UNKNOWN]: 'unknown'
    };
    
    // Critical missing data
    const criticalMissing: string[] = [];
    if (!cropSchedule) criticalMissing.push('No active crop schedule');
    if (!soilDataFresh && soilHealth) criticalMissing.push('Soil test outdated');
    if (!ndviDataFresh && ndviReadings.length > 0) criticalMissing.push('NDVI data stale');
    if (!weatherDataFresh && weather) criticalMissing.push('Weather data stale');
    if (!soilHealth) criticalMissing.push('No soil test data');
    
    // BUILD AUTHORITATIVE STATE OBJECT
    const phenologyRow: any = Array.isArray(phenologyResult?.data)
      ? (phenologyResult.data[0] ?? null)
      : (phenologyResult?.data ?? null);
    if (phenologyResult?.error) {
      console.warn('⚠️ [AuthoritativeStateLoader] resolve_crop_phenology RPC failed:', phenologyResult.error?.message);
    }

    // PR-4d: stage precedence — RPC row > persisted lands.crop_stage.
    const computedGrowthStage: string | null =
      phenologyRow?.growth_stage
        ?? phenologyRow?.stage_code
        ?? (land as any)?.crop_stage
        ?? null;
    const stageSource: 'phenology_rpc' | 'lands_persisted' | 'UNKNOWN' =
      (phenologyRow?.growth_stage || phenologyRow?.stage_code)
        ? 'phenology_rpc'
        : ((land as any)?.crop_stage ? 'lands_persisted' : 'UNKNOWN');
    console.log(
      `🌱 [AuthoritativeStateLoader] growth_stage=${computedGrowthStage ?? 'null'} ` +
      `source=${stageSource} das=${daysSinceSowing ?? 'n/a'} ` +
      `precomputed_das=${precomputedDas ?? 'n/a'} ` +
      `stage_uuid=${(land as any)?.stage_uuid ?? 'n/a'} ` +
      `(PR-4d: SSOT-only; lands.das/stage_uuid preferred)`
    );


    const authoritativeState: AuthoritativeLandState = {
      land_id: land.id,
      tenant_id: tenantId,
      farmer_id: farmerId,
      land_name: land.name,
      // FIXED: area_acres is the DB column; compute hectares from it
      area_hectares: (land.area_acres || 0) / 2.471,
      area_acres: land.area_acres || 0,
      // FIXED: latitude/longitude → center_lat/center_lon
      latitude: land.center_lat ?? null,
      longitude: land.center_lon ?? null,
      district: null,
      state: null,
      
      crop: {
        // PR-4d: prefer canonical text label from phenology RPC / lands, fall back
        // to schedule mirror only when the FK-driven sources are absent.
        current_crop: phenologyRow?.crop_code ?? (land as any)?.current_crop ?? cropSchedule?.crop_name ?? null,
        crop_code: phenologyRow?.crop_code ?? null,
        crop_id: (land as any)?.current_crop_id ?? null,
        variety_id: (land as any)?.current_crop_variety_id ?? cropSchedule?.variety_id ?? null,
        variety_name: cropSchedule?.crop_variety ?? null,
        growth_stage: computedGrowthStage,
        // F4 (2026-07-29): phenology RPC is the stage authority; lands.stage_uuid
        // is only a persisted mirror and may lag a biological transition.
        stage_uuid: phenologyRow?.stage_uuid ?? (land as any)?.stage_uuid ?? null,
        // F1 (2026-07-29): cultivation lane is part of the authoritative state.
        cultivation_method: (
          phenologyRow?.cultivation_method
          ?? (cropSchedule as any)?.cultivation_method
          ?? null
        ) ? String(phenologyRow?.cultivation_method ?? (cropSchedule as any)?.cultivation_method).toLowerCase() : null,
        stage_source_authoritative: (land as any)?.stage_source ?? stageSource,
        stage_resolved_at: (land as any)?.stage_resolved_at ?? null,
        days_since_sowing: daysSinceSowing,
        precomputed_das: precomputedDas,
        sowing_date: anchorSowingDate ?? cropSchedule?.sowing_date ?? null,
        planting_date: (land as any)?.planting_date ?? null,
        last_sowing_date: (land as any)?.last_sowing_date ?? null,
        transplant_date: (land as any)?.transplant_date ?? cropSchedule?.transplant_date ?? null,
        crop_cycle: (land as any)?.crop_cycle ?? null,
        current_gdd: typeof (land as any)?.current_gdd === 'number' ? (land as any).current_gdd : null,
        expected_harvest_date: cropSchedule?.expected_harvest_date || null,
        schedule_status: cropSchedule?.status || null
      },
      
      soil: {
        ph: soilHealth?.ph_level ?? null,
        organic_carbon: soilHealth?.organic_carbon ?? null,
        nitrogen_kg_per_ha: soilHealth?.nitrogen_kg_per_ha ?? null,
        phosphorus_kg_per_ha: soilHealth?.phosphorus_kg_per_ha ?? null,
        potassium_kg_per_ha: soilHealth?.potassium_kg_per_ha ?? null,
        texture: soilHealth?.texture ?? null, // FIXED: soil_texture → texture
        test_date: soilHealth?.test_date ?? null,
        test_age_days: soilTestAgeDays,
        data_fresh: soilDataFresh
      },
      
      ndvi: {
        latest_value: ndviLatest,
        latest_date: ndviLatestDate,
        trend: ndviTrend,
        age_days: ndviAgeDays,
        history: ndviHistory,
        data_fresh: ndviDataFresh
      },
      
      weather: {
        temperature: (weather as any)?.temperature_celsius ?? weatherMeta?.temperature ?? null,
        humidity: (weather as any)?.humidity_percent ?? weatherMeta?.humidity ?? null,
        rainfall_last_24h: (weather as any)?.rainfall_mm ?? weatherMeta?.rainfall ?? weatherMeta?.rainfall_last_24h ?? null,
        rain_probability: weatherMeta?.rain_probability ?? null,
        wind_speed: (weather as any)?.wind_speed_kmh ?? weatherMeta?.wind_speed ?? null,
        data_timestamp: (weather as any)?.observation_date ?? null,
        data_age_hours: weatherAgeHours,
        data_fresh: weatherDataFresh,
        data_source: weatherSource
      },
      
      // SSOT INTERPRETATIONS
      derived: {
        ndvi_status: ndviStatus,
        nitrogen_level: nitrogenLevel,
        phosphorus_level: phosphorusLevel,
        potassium_level: potassiumLevel,
        water_stress_level: waterStressLevel,
        crop_health_status: cropHealthMap[ndviStatus],
        data_completeness_score: dataCompletenessScore,
        data_freshness_score: dataFreshnessScore,
        critical_missing: criticalMissing
      },
      
      loaded_at: now.toISOString(),
      sources_available: sourcesAvailable,
      sources_missing: sourcesMissing
    };
    
    const loadingTime = Date.now() - startTime;
    console.log(`✅ [AuthoritativeStateLoader] State loaded in ${loadingTime}ms`);
    console.log(`   Sources: ${sourcesAvailable.join(', ')} | Missing: ${sourcesMissing.join(', ')}`);
    console.log(`   NDVI: ${ndviLatest} → ${ndviStatus} | Water Stress: ${waterStressLevel}`);
    console.log(`   Soil N: ${nitrogenLevel}, P: ${phosphorusLevel}, K: ${potassiumLevel}`);
    
    return {
      success: true,
      state: authoritativeState,
      loading_time_ms: loadingTime
    };
    
  } catch (error) {
    console.error(`❌ [AuthoritativeStateLoader] Error loading state:`, error);
    return {
      success: false,
      state: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      loading_time_ms: Date.now() - startTime
    };
  }
}

// CONFIDENCE CALCULATION - Based on data completeness and freshness

export function calculateDecisionConfidence(
  state: AuthoritativeLandState,
  rulesMatched: number,
  ruleConfidenceSum: number
): { 
  final_confidence: number; 
  confidence_breakdown: {
    data_completeness: number;
    data_freshness: number;
    rule_strength: number;
  };
  can_advise: boolean;
  reason?: string;
} {
  const dataCompleteness = state.derived.data_completeness_score / 100;
  const dataFreshness = state.derived.data_freshness_score / 100;
  const ruleStrength = rulesMatched > 0 ? ruleConfidenceSum / rulesMatched : 0;
  
  // Weighted confidence calculation
  // 40% data completeness, 30% freshness, 30% rule match strength
  const finalConfidence = (dataCompleteness * 0.4) + (dataFreshness * 0.3) + (ruleStrength * 0.3);
  
  // Minimum thresholds for advice
  const canAdvise = dataCompleteness >= 0.25 && rulesMatched > 0;
  
  let reason: string | undefined;
  if (!canAdvise) {
    if (dataCompleteness < 0.25) {
      reason = 'Insufficient data to provide reliable advice';
    } else if (rulesMatched === 0) {
      reason = 'No applicable rules found for this situation';
    }
  }
  
  return {
    final_confidence: finalConfidence,
    confidence_breakdown: {
      data_completeness: dataCompleteness,
      data_freshness: dataFreshness,
      rule_strength: ruleStrength
    },
    can_advise: canAdvise,
    reason
  };
}

// STRUCTURED FOLLOW-UP QUESTION GENERATOR

export interface StructuredQuestion {
  fact_type: string;
  question_key: string;  // Language-neutral key for translation
  options: { value: string; label_key: string }[];  // Language-neutral keys
  why_needed: string;
  priority: 'critical' | 'important' | 'helpful';
}

export function generateMissingDataQuestions(
  state: AuthoritativeLandState | null,
  missingFacts: string[]
): StructuredQuestion[] {
  const questions: StructuredQuestion[] = [];
  
  // Crop not known
  if (!state?.crop.current_crop || missingFacts.includes('crop')) {
    questions.push({
      fact_type: 'current_crop',
      question_key: 'QUESTION_WHICH_CROP',
      options: [
        { value: 'sugarcane', label_key: 'CROP_SUGARCANE' },
        { value: 'wheat', label_key: 'CROP_WHEAT' },
        { value: 'cotton', label_key: 'CROP_COTTON' },
        { value: 'rice', label_key: 'CROP_RICE' }
      ],
      why_needed: 'Required to provide crop-specific recommendations',
      priority: 'critical'
    });
  }
  
  // Soil moisture not known
  if (!state?.soil.ph || missingFacts.includes('soil_moisture')) {
    questions.push({
      fact_type: 'soil_moisture',
      question_key: 'QUESTION_SOIL_MOISTURE',
      options: [
        { value: 'dry', label_key: 'SOIL_DRY' },
        { value: 'moist', label_key: 'SOIL_MOIST' },
        { value: 'wet', label_key: 'SOIL_WET' },
        { value: 'waterlogged', label_key: 'SOIL_WATERLOGGED' }
      ],
      why_needed: 'Required for irrigation and fertilizer recommendations',
      priority: 'important'
    });
  }
  
  // Symptom severity not known
  if (missingFacts.includes('severity')) {
    questions.push({
      fact_type: 'symptom_severity',
      question_key: 'QUESTION_SEVERITY',
      options: [
        { value: 'few_plants', label_key: 'SEVERITY_FEW' },
        { value: 'one_patch', label_key: 'SEVERITY_PATCH' },
        { value: 'many_patches', label_key: 'SEVERITY_MANY' },
        { value: 'entire_field', label_key: 'SEVERITY_ENTIRE' }
      ],
      why_needed: 'Required to determine urgency and treatment intensity',
      priority: 'critical'
    });
  }
  
  // Days since sowing not known
  if (!state?.crop.days_since_sowing || missingFacts.includes('crop_age')) {
    questions.push({
      fact_type: 'days_since_sowing',
      question_key: 'QUESTION_CROP_AGE',
      options: [
        { value: '0-15', label_key: 'AGE_0_15' },
        { value: '15-30', label_key: 'AGE_15_30' },
        { value: '30-60', label_key: 'AGE_30_60' },
        { value: '60-90', label_key: 'AGE_60_90' },
        { value: '90+', label_key: 'AGE_90_PLUS' }
      ],
      why_needed: 'Required for growth stage-specific recommendations',
      priority: 'important'
    });
  }
  
  // Sort by priority
  const priorityOrder = { 'critical': 0, 'important': 1, 'helpful': 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return questions.slice(0, 3); // Maximum 3 questions at a time
}

// Export version for consumers to verify SSOT compliance
export { AUTHORITATIVE_STATE_LOADER_VERSION as VERSION };
