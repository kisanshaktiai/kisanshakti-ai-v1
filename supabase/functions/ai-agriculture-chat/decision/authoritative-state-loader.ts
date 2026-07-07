// ✅ FORENSIC REFACTOR COMPLETE
// Authority: SINGLE SOURCE OF TRUTH for NDVI interpretation, soil interpretation, and land state assembly

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE STATE LOADER v2.0.0 - SSOT ENFORCED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ROLE: Single Source of Truth for all agronomic data interpretation
 * 
 * DOES:
 * - Load land state from authoritative database tables
 * - Interpret NDVI values → canonical status codes (ONCE, here only)
 * - Interpret soil nutrients → canonical level codes (ONCE, here only)
 * - Calculate derived metrics (water stress, crop health)
 * - Export canonical state object for all downstream consumers
 * 
 * DOES NOT:
 * - Generate language-specific text (→ LLM narration layer)
 * - Provide agronomic recommendations (→ symbolic decision brain)
 * - Classify queries or intents (→ LIL layer)
 * 
 * CONSUMERS MUST:
 * - Use this module's interpretation functions, NOT implement their own
 * - Consume AuthoritativeLandState.derived for all interpreted values
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export const AUTHORITATIVE_STATE_LOADER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL INTERPRETATION ENUMS - SINGLE SOURCE OF TRUTH
// These are the ONLY valid values for interpreted agronomic data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical NDVI status - SSOT interpretation
 * All NDVI interpretation in the system MUST use these values
 */
export enum NDVIStatus {
  EXCELLENT = 'EXCELLENT',      // >= 0.7
  GOOD = 'GOOD',                // 0.55 - 0.69
  MODERATE = 'MODERATE',        // 0.4 - 0.54
  POOR = 'POOR',                // 0.25 - 0.39
  CRITICAL = 'CRITICAL',        // < 0.25
  UNKNOWN = 'UNKNOWN'           // No data
}

/**
 * Canonical soil nutrient level - SSOT interpretation
 * All soil interpretation in the system MUST use these values
 */
export enum SoilNutrientLevel {
  HIGH = 'HIGH',
  ADEQUATE = 'ADEQUATE',
  LOW = 'LOW',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Canonical water stress level - derived from NDVI + rainfall
 */
export enum WaterStressLevel {
  NONE = 'NONE',
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Canonical NDVI trend - calculated from historical data
 */
export enum NDVITrend {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  DECLINING = 'DECLINING',
  UNKNOWN = 'UNKNOWN'
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERPRETATION THRESHOLDS - SINGLE SOURCE OF TRUTH
// These are the ONLY thresholds used for interpretation
// ═══════════════════════════════════════════════════════════════════════════

const NDVI_THRESHOLDS = {
  EXCELLENT: 0.7,
  GOOD: 0.55,
  MODERATE: 0.4,
  POOR: 0.25
  // Below POOR = CRITICAL
} as const;

const SOIL_THRESHOLDS = {
  NITROGEN: {
    HIGH: 350,      // kg/ha
    ADEQUATE: 250,
    LOW: 150
    // Below LOW = CRITICAL
  },
  PHOSPHORUS: {
    HIGH: 25,       // kg/ha
    ADEQUATE: 15,
    LOW: 8
  },
  POTASSIUM: {
    HIGH: 200,      // kg/ha
    ADEQUATE: 130,
    LOW: 80
  }
} as const;

const FRESHNESS_THRESHOLDS = {
  SOIL_TEST_DAYS: 90,      // Soil test valid for 90 days
  NDVI_DAYS: 7,            // NDVI should be <7 days old
  WEATHER_HOURS: 6,        // Weather should be <6 hours old
  SCHEDULE_DAYS: 365       // Schedule valid for current season
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SSOT INTERPRETATION FUNCTIONS
// These are the ONLY functions that interpret agronomic values
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interpret NDVI value to canonical status
 * THIS IS THE ONLY PLACE where NDVI is interpreted
 */
export function interpretNDVI(value: number | null | undefined): NDVIStatus {
  if (value === null || value === undefined || isNaN(value)) {
    return NDVIStatus.UNKNOWN;
  }
  
  if (value >= NDVI_THRESHOLDS.EXCELLENT) return NDVIStatus.EXCELLENT;
  if (value >= NDVI_THRESHOLDS.GOOD) return NDVIStatus.GOOD;
  if (value >= NDVI_THRESHOLDS.MODERATE) return NDVIStatus.MODERATE;
  if (value >= NDVI_THRESHOLDS.POOR) return NDVIStatus.POOR;
  return NDVIStatus.CRITICAL;
}

/**
 * Interpret nitrogen value to canonical level
 * THIS IS THE ONLY PLACE where nitrogen is interpreted
 */
export function interpretNitrogen(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  
  if (value >= SOIL_THRESHOLDS.NITROGEN.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= SOIL_THRESHOLDS.NITROGEN.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= SOIL_THRESHOLDS.NITROGEN.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

/**
 * Interpret phosphorus value to canonical level
 * THIS IS THE ONLY PLACE where phosphorus is interpreted
 */
export function interpretPhosphorus(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  
  if (value >= SOIL_THRESHOLDS.PHOSPHORUS.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= SOIL_THRESHOLDS.PHOSPHORUS.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= SOIL_THRESHOLDS.PHOSPHORUS.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

/**
 * Interpret potassium value to canonical level
 * THIS IS THE ONLY PLACE where potassium is interpreted
 */
export function interpretPotassium(value: number | null | undefined): SoilNutrientLevel {
  if (value === null || value === undefined || isNaN(value)) {
    return SoilNutrientLevel.UNKNOWN;
  }
  
  if (value >= SOIL_THRESHOLDS.POTASSIUM.HIGH) return SoilNutrientLevel.HIGH;
  if (value >= SOIL_THRESHOLDS.POTASSIUM.ADEQUATE) return SoilNutrientLevel.ADEQUATE;
  if (value >= SOIL_THRESHOLDS.POTASSIUM.LOW) return SoilNutrientLevel.LOW;
  return SoilNutrientLevel.CRITICAL;
}

/**
 * Calculate water stress level from NDVI and rainfall
 * THIS IS THE ONLY PLACE where water stress is calculated
 */
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

/**
 * Calculate NDVI trend from historical readings
 * THIS IS THE ONLY PLACE where NDVI trend is calculated
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - AUTHORITATIVE LAND STATE
// ═══════════════════════════════════════════════════════════════════════════

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
  
  // Crop Schedule (AUTHORITATIVE)
  crop: {
    current_crop: string | null;
    crop_code: string | null;
    growth_stage: string | null;
    days_since_sowing: number | null;
    sowing_date: string | null;
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOADER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

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
    // ═══════════════════════════════════════════════════════════════════════════
    // PARALLEL DATA LOADING - Query all authoritative tables simultaneously
    // ═══════════════════════════════════════════════════════════════════════════
    const [
      landResult,
      cropScheduleResult,
      soilHealthResult,
      ndviResult,
      weatherResult,
      phenologyResult
    ] = await Promise.all([
      // 1. Land base data — FIXED: use actual DB columns (area_acres, center_lat, center_lon)
      supabase
        .from('lands')
        .select('id, name, area_acres, center_lat, center_lon, farmer_id, tenant_id, district_id, state_id, soil_type, irrigation_type, water_source, cultivation_date')
        .eq('id', landId)
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId)
        .single(),
      
      // 2. Crop schedule (active season) — FIXED: removed non-existent crop_code, current_stage
      supabase
        .from('crop_schedules')
        .select('crop_name, crop_variety, sowing_date, expected_harvest_date, status, is_active')
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
      // resolve_crop_phenology(land_id) is the DB-side SSOT joining
      // crop_schedules + crop_stage_master + variety_phenology_profile.
      // Frontend already uses it (see useLandChatContext); backend MUST
      // consume the same row so LLM narration and rule scoping see the
      // exact same growth_stage the farmer sees on their land card.
      supabase.rpc('resolve_crop_phenology', { p_land_id: landId })
    ]);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATE LAND ACCESS
    // ═══════════════════════════════════════════════════════════════════════════
    if (landResult.error || !landResult.data) {
      console.error(`❌ [AuthoritativeStateLoader] Land not found or access denied: ${landId}`);
      return {
        success: false,
        state: null,
        error: 'Land not found or access denied',
        loading_time_ms: Date.now() - startTime
      };
    }
    
    const land = landResult.data;
    const now = new Date();
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESS CROP SCHEDULE
    // ═══════════════════════════════════════════════════════════════════════════
    const cropSchedule = cropScheduleResult.data;
    let daysSinceSowing: number | null = null;
    
    if (cropSchedule?.sowing_date) {
      const sowingDate = new Date(cropSchedule.sowing_date);
      daysSinceSowing = Math.floor((now.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESS SOIL HEALTH
    // ═══════════════════════════════════════════════════════════════════════════
    const soilHealth = soilHealthResult.data;
    let soilTestAgeDays: number | null = null;
    let soilDataFresh = false;
    
    if (soilHealth?.test_date) {
      const testDate = new Date(soilHealth.test_date);
      soilTestAgeDays = Math.floor((now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
      soilDataFresh = soilTestAgeDays <= FRESHNESS_THRESHOLDS.SOIL_TEST_DAYS;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESS NDVI DATA WITH SSOT INTERPRETATION
    // ═══════════════════════════════════════════════════════════════════════════
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
        ndviDataFresh = ndviAgeDays <= FRESHNESS_THRESHOLDS.NDVI_DAYS;
      }
    }
    
    // Calculate NDVI trend using SSOT function — FIXED: use .date
    const ndviHistory = ndviReadings.slice(0, 5).map(r => ({
      value: r.ndvi_value ?? r.mean_ndvi ?? 0,
      date: r.date
    }));
    const ndviTrend = calculateNDVITrend(ndviHistory);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESS WEATHER DATA
    // ═══════════════════════════════════════════════════════════════════════════
    // Primary: weather_observations by land_id
    // Fallback: weather_current by location_key (rounded lat/lon)
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
      weatherDataFresh = weatherAgeHours <= FRESHNESS_THRESHOLDS.WEATHER_HOURS;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CALCULATE DERIVED METRICS USING SSOT INTERPRETATION FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
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
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD AUTHORITATIVE STATE OBJECT
    // ═══════════════════════════════════════════════════════════════════════════
    // PR-1 · Growth stage comes from resolve_crop_phenology (SSOT), NOT a
    // crop-agnostic DAS ladder. The ladder below is retained ONLY as a
    // last-resort fallback when the RPC returns no row (e.g. crop lacks a
    // phenology profile). Any non-null RPC row wins.
    const phenologyRow: any = Array.isArray(phenologyResult?.data)
      ? (phenologyResult.data[0] ?? null)
      : (phenologyResult?.data ?? null);
    if (phenologyResult?.error) {
      console.warn('⚠️ [AuthoritativeStateLoader] resolve_crop_phenology RPC failed:', phenologyResult.error?.message);
    }

    let computedGrowthStage: string | null = phenologyRow?.growth_stage ?? phenologyRow?.stage_code ?? null;
    const stageSource: 'phenology_rpc' | 'das_fallback' | 'none' =
      computedGrowthStage ? 'phenology_rpc' : (daysSinceSowing !== null ? 'das_fallback' : 'none');
    if (!computedGrowthStage && daysSinceSowing !== null) {
      if (daysSinceSowing <= 15) computedGrowthStage = 'GERMINATION';
      else if (daysSinceSowing <= 35) computedGrowthStage = 'EARLY_VEGETATIVE';
      else if (daysSinceSowing <= 60) computedGrowthStage = 'VEGETATIVE';
      else if (daysSinceSowing <= 90) computedGrowthStage = 'GRAND_GROWTH';
      else if (daysSinceSowing <= 150) computedGrowthStage = 'MATURITY';
      else computedGrowthStage = 'HARVEST';
    }
    console.log(`🌱 [AuthoritativeStateLoader] growth_stage=${computedGrowthStage ?? 'null'} source=${stageSource} das=${daysSinceSowing ?? 'n/a'}`);

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
        current_crop: cropSchedule?.crop_name || null,
        crop_code: null, // FIXED: crop_code column doesn't exist in crop_schedules
        growth_stage: computedGrowthStage, // FIXED: computed from sowing_date
        days_since_sowing: daysSinceSowing,
        sowing_date: cropSchedule?.sowing_date || null,
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

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALCULATION - Based on data completeness and freshness
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED FOLLOW-UP QUESTION GENERATOR
// Returns language-neutral question codes, NOT text
// ═══════════════════════════════════════════════════════════════════════════

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
