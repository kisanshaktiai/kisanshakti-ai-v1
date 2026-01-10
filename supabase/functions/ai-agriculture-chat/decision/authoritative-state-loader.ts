/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE STATE LOADER - SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module loads land state from AUTHORITATIVE database tables,
 * NOT from JSONB context fields in chat messages.
 * 
 * This ensures:
 * 1. Temporal consistency (always current data, not stale snapshots)
 * 2. Single source of truth (joins to actual tables, not copies)
 * 3. Complete data (all signals from soil, ndvi, weather, schedule)
 * 
 * ARCHITECTURE: Database-first, with calculated derived metrics
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
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
  
  // Derived Metrics
  derived: {
    water_stress_level: 'none' | 'mild' | 'moderate' | 'severe' | 'unknown';
    crop_health_status: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'unknown';
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
// FRESHNESS THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const FRESHNESS_THRESHOLDS = {
  SOIL_TEST_DAYS: 90,      // Soil test valid for 90 days
  NDVI_DAYS: 7,            // NDVI should be <7 days old
  WEATHER_HOURS: 6,        // Weather should be <6 hours old
  SCHEDULE_DAYS: 365       // Schedule valid for current season
};

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
      weatherResult
    ] = await Promise.all([
      // 1. Land base data
      supabase
        .from('lands')
        .select('id, name, area_hectares, latitude, longitude, farmer_id, tenant_id, district_id, state_id')
        .eq('id', landId)
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId)
        .single(),
      
      // 2. Crop schedule (active season)
      supabase
        .from('crop_schedules')
        .select('crop_name, crop_code, current_stage, sowing_date, expected_harvest_date, status')
        .eq('land_id', landId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // 3. Soil health (latest test)
      supabase
        .from('soil_health')
        .select('ph_level, organic_carbon, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, soil_texture, test_date, created_at')
        .eq('land_id', landId)
        .order('test_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // 4. NDVI data (recent readings)
      supabase
        .from('ndvi_readings')
        .select('ndvi_value, observation_date, created_at')
        .eq('land_id', landId)
        .order('observation_date', { ascending: false })
        .limit(10),
      
      // 5. Weather data (from weather cache or current readings)
      supabase
        .from('weather_data')
        .select('temperature, humidity, rainfall, rain_probability, wind_speed, fetched_at')
        .eq('land_id', landId)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()
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
    // PROCESS NDVI DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const ndviReadings = ndviResult.data || [];
    let ndviLatest: number | null = null;
    let ndviLatestDate: string | null = null;
    let ndviAgeDays: number | null = null;
    let ndviTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
    let ndviDataFresh = false;
    
    if (ndviReadings.length > 0) {
      ndviLatest = ndviReadings[0].ndvi_value;
      ndviLatestDate = ndviReadings[0].observation_date;
      
      if (ndviLatestDate) {
        const latestDate = new Date(ndviLatestDate);
        ndviAgeDays = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
        ndviDataFresh = ndviAgeDays <= FRESHNESS_THRESHOLDS.NDVI_DAYS;
      }
      
      // Calculate trend if we have multiple readings
      if (ndviReadings.length >= 2) {
        const recentAvg = ndviReadings.slice(0, 3).reduce((sum, r) => sum + (r.ndvi_value || 0), 0) / Math.min(3, ndviReadings.length);
        const olderAvg = ndviReadings.slice(3, 6).reduce((sum, r) => sum + (r.ndvi_value || 0), 0) / Math.min(3, ndviReadings.length - 3);
        
        if (olderAvg > 0) {
          const change = (recentAvg - olderAvg) / olderAvg;
          if (change > 0.05) ndviTrend = 'improving';
          else if (change < -0.05) ndviTrend = 'declining';
          else ndviTrend = 'stable';
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESS WEATHER DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const weather = weatherResult.data;
    let weatherAgeHours: number | null = null;
    let weatherDataFresh = false;
    
    if (weather?.fetched_at) {
      const fetchedAt = new Date(weather.fetched_at);
      weatherAgeHours = Math.floor((now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60));
      weatherDataFresh = weatherAgeHours <= FRESHNESS_THRESHOLDS.WEATHER_HOURS;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CALCULATE DERIVED METRICS
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
    
    // Water stress calculation
    let waterStressLevel: 'none' | 'mild' | 'moderate' | 'severe' | 'unknown' = 'unknown';
    if (ndviLatest !== null && weather?.rainfall !== undefined) {
      if (ndviLatest < 0.3 && (weather.rainfall || 0) < 5) {
        waterStressLevel = 'severe';
      } else if (ndviLatest < 0.4 && (weather.rainfall || 0) < 10) {
        waterStressLevel = 'moderate';
      } else if (ndviLatest < 0.5) {
        waterStressLevel = 'mild';
      } else {
        waterStressLevel = 'none';
      }
    }
    
    // Crop health status
    let cropHealthStatus: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'unknown' = 'unknown';
    if (ndviLatest !== null) {
      if (ndviLatest >= 0.7) cropHealthStatus = 'excellent';
      else if (ndviLatest >= 0.55) cropHealthStatus = 'good';
      else if (ndviLatest >= 0.4) cropHealthStatus = 'moderate';
      else if (ndviLatest >= 0.25) cropHealthStatus = 'poor';
      else cropHealthStatus = 'critical';
    }
    
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
    const authoritativeState: AuthoritativeLandState = {
      land_id: land.id,
      tenant_id: tenantId,
      farmer_id: farmerId,
      land_name: land.name,
      area_hectares: land.area_hectares || 0,
      area_acres: (land.area_hectares || 0) * 2.471,
      latitude: land.latitude,
      longitude: land.longitude,
      district: null, // Would need join to districts table
      state: null,    // Would need join to states table
      
      crop: {
        current_crop: cropSchedule?.crop_name || null,
        crop_code: cropSchedule?.crop_code || null,
        growth_stage: cropSchedule?.current_stage || null,
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
        texture: soilHealth?.soil_texture ?? null,
        test_date: soilHealth?.test_date ?? null,
        test_age_days: soilTestAgeDays,
        data_fresh: soilDataFresh
      },
      
      ndvi: {
        latest_value: ndviLatest,
        latest_date: ndviLatestDate,
        trend: ndviTrend,
        age_days: ndviAgeDays,
        history: ndviReadings.slice(0, 5).map(r => ({
          value: r.ndvi_value,
          date: r.observation_date
        })),
        data_fresh: ndviDataFresh
      },
      
      weather: {
        temperature: weather?.temperature ?? null,
        humidity: weather?.humidity ?? null,
        rainfall_last_24h: weather?.rainfall ?? null,
        rain_probability: weather?.rain_probability ?? null,
        wind_speed: weather?.wind_speed ?? null,
        data_timestamp: weather?.fetched_at ?? null,
        data_age_hours: weatherAgeHours,
        data_fresh: weatherDataFresh
      },
      
      derived: {
        water_stress_level: waterStressLevel,
        crop_health_status: cropHealthStatus,
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
    console.log(`   Completeness: ${dataCompletenessScore.toFixed(0)}% | Freshness: ${dataFreshnessScore.toFixed(0)}%`);
    
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
// When data is insufficient, generate structured questions
// ═══════════════════════════════════════════════════════════════════════════

export interface StructuredQuestion {
  fact_type: string;
  question_mr: string;
  question_hi: string;
  question_en: string;
  options: { value: string; label_mr: string; label_hi: string; label_en: string }[];
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
      question_mr: 'कोणते पीक लावले आहे?',
      question_hi: 'कौन सी फसल लगाई है?',
      question_en: 'Which crop is planted?',
      options: [
        { value: 'sugarcane', label_mr: 'ऊस', label_hi: 'गन्ना', label_en: 'Sugarcane' },
        { value: 'wheat', label_mr: 'गहू', label_hi: 'गेहूं', label_en: 'Wheat' },
        { value: 'cotton', label_mr: 'कापूस', label_hi: 'कपास', label_en: 'Cotton' },
        { value: 'rice', label_mr: 'भात', label_hi: 'धान', label_en: 'Rice' }
      ],
      why_needed: 'Required to provide crop-specific recommendations',
      priority: 'critical'
    });
  }
  
  // Soil moisture not known
  if (!state?.soil.ph || missingFacts.includes('soil_moisture')) {
    questions.push({
      fact_type: 'soil_moisture',
      question_mr: 'माती कशी वाटते? (ओलावा)',
      question_hi: 'मिट्टी कैसी लग रही है? (नमी)',
      question_en: 'How does the soil feel? (moisture)',
      options: [
        { value: 'dry', label_mr: 'कोरडी', label_hi: 'सूखी', label_en: 'Dry' },
        { value: 'moist', label_mr: 'ओलसर', label_hi: 'नम', label_en: 'Moist' },
        { value: 'wet', label_mr: 'ओली', label_hi: 'गीली', label_en: 'Wet' },
        { value: 'waterlogged', label_mr: 'पाणी साचलेले', label_hi: 'जलभराव', label_en: 'Waterlogged' }
      ],
      why_needed: 'Required for irrigation and fertilizer recommendations',
      priority: 'important'
    });
  }
  
  // Symptom severity not known
  if (missingFacts.includes('severity')) {
    questions.push({
      fact_type: 'symptom_severity',
      question_mr: 'किती पीक प्रभावित झाले आहे?',
      question_hi: 'कितनी फसल प्रभावित है?',
      question_en: 'How much of the crop is affected?',
      options: [
        { value: 'few_plants', label_mr: 'काही झाडे', label_hi: 'कुछ पौधे', label_en: 'Few plants (<5%)' },
        { value: 'one_patch', label_mr: 'एक भाग', label_hi: 'एक हिस्सा', label_en: 'One patch (5-20%)' },
        { value: 'many_patches', label_mr: 'अनेक भाग', label_hi: 'कई हिस्से', label_en: 'Many patches (20-50%)' },
        { value: 'entire_field', label_mr: 'संपूर्ण शेत', label_hi: 'पूरा खेत', label_en: 'Entire field (>50%)' }
      ],
      why_needed: 'Required to determine urgency and treatment intensity',
      priority: 'critical'
    });
  }
  
  // Days since sowing not known
  if (!state?.crop.days_since_sowing || missingFacts.includes('crop_age')) {
    questions.push({
      fact_type: 'days_since_sowing',
      question_mr: 'पीक किती दिवसांपूर्वी लावले?',
      question_hi: 'फसल कितने दिन पहले लगाई?',
      question_en: 'How long ago was the crop planted?',
      options: [
        { value: '0-15', label_mr: '0-15 दिवस', label_hi: '0-15 दिन', label_en: '0-15 days' },
        { value: '15-30', label_mr: '15-30 दिवस', label_hi: '15-30 दिन', label_en: '15-30 days' },
        { value: '30-60', label_mr: '30-60 दिवस', label_hi: '30-60 दिन', label_en: '30-60 days' },
        { value: '60-90', label_mr: '60-90 दिवस', label_hi: '60-90 दिन', label_en: '60-90 days' },
        { value: '90+', label_mr: '90+ दिवस', label_hi: '90+ दिन', label_en: '90+ days' }
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
