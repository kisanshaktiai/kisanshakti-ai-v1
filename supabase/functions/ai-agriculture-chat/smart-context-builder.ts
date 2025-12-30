// ============= SMART CONTEXT BUILDER =============
// Query-aware context injection - only include relevant data

interface LandData {
  id?: string;
  name?: string;
  current_crop?: string;
  area_acres?: number;
  soil_type?: string;
  irrigation_type?: string;
  water_source?: string;
  village?: string;
  district?: string;
  state?: string;
}

interface SoilData {
  nitrogen_kg_per_ha?: number;
  phosphorus_kg_per_ha?: number;
  potassium_kg_per_ha?: number;
  ph_level?: number;
  organic_carbon_percent?: number;
  soil_moisture_percent?: number;
  tested_at?: string;
}

interface NDVIData {
  ndvi_value?: number;
  mean_ndvi?: number;
  health_status?: string;
  captured_at?: string;
}

interface WeatherData {
  temperature?: number;
  humidity?: number;
  rain_probability?: number;
  wind_speed?: number;
  condition?: string;
}

interface ContextConfig {
  queryType: string;
  land?: LandData;
  soil?: SoilData;
  ndvi?: NDVIData;
  weather?: WeatherData;
  daysSinceSowing?: number;
  cropSchedule?: any;
}

// Query-specific context fields
const contextStrategy: Record<string, string[]> = {
  watering: ['crop', 'area', 'irrigation_type', 'water_source', 'soil_type', 'soil_moisture', 'rain_forecast', 'stage'],
  fertilizer: ['crop', 'area', 'npk', 'ph', 'organic_carbon', 'stage', 'soil_test_age'],
  pest: ['crop', 'stage', 'ndvi', 'humidity', 'soil_type'],
  health: ['crop', 'ndvi', 'stage', 'soil_moisture'],
  market: ['crop', 'area', 'expected_harvest', 'location'],
  harvest: ['crop', 'area', 'location', 'soil_type', 'last_crop'],
  general: ['crop', 'area', 'location'],
  weather: ['location']
};

export function buildSmartContext(config: ContextConfig): string {
  const { queryType, land, soil, ndvi, weather, daysSinceSowing, cropSchedule } = config;
  const fields = contextStrategy[queryType] || contextStrategy['general'];
  
  const parts: string[] = [];
  const cropName = cropSchedule?.crop_name || land?.current_crop || 'Unknown';
  const variety = cropSchedule?.crop_variety || '';
  
  // Always include crop info (minimal)
  if (fields.includes('crop')) {
    const stage = getGrowthStage(daysSinceSowing, cropName);
    parts.push(`🌾 ${cropName}${variety ? ` (${variety})` : ''}${stage ? ` [${stage}]` : ''}`);
    if (daysSinceSowing) parts[parts.length - 1] += ` ${daysSinceSowing}d`;
  }
  
  // Area
  if (fields.includes('area') && land?.area_acres) {
    parts.push(`📐 ${land.area_acres}ac`);
  }
  
  // Location (compact)
  if (fields.includes('location') && land?.district) {
    parts.push(`📍 ${land.village || ''} ${land.district}`);
  }
  
  // Irrigation (for watering queries)
  if (fields.includes('irrigation_type') && land?.irrigation_type) {
    parts.push(`💧 ${compactIrrigation(land.irrigation_type)}`);
  }
  
  if (fields.includes('water_source') && land?.water_source) {
    parts.push(`🚰 ${land.water_source}`);
  }
  
  // Soil type
  if (fields.includes('soil_type') && land?.soil_type) {
    parts.push(`🏜️ ${compactSoil(land.soil_type)}`);
  }
  
  // NPK (for fertilizer queries)
  if (fields.includes('npk') && soil) {
    const n = soil.nitrogen_kg_per_ha || '?';
    const p = soil.phosphorus_kg_per_ha || '?';
    const k = soil.potassium_kg_per_ha || '?';
    parts.push(`NPK: N:${n}${getSymbol(n, 'N')} P:${p}${getSymbol(p, 'P')} K:${k}${getSymbol(k, 'K')}`);
  }
  
  // pH
  if (fields.includes('ph') && soil?.ph_level) {
    const phStatus = soil.ph_level < 6.5 ? '(अम्लीय)' : soil.ph_level > 7.5 ? '(क्षारीय)' : '✓';
    parts.push(`pH: ${soil.ph_level}${phStatus}`);
  }
  
  // Organic carbon - CRITICAL FIX: Schema uses 'organic_carbon' not 'organic_carbon_percent'
  if (fields.includes('organic_carbon') && soil?.organic_carbon) {
    parts.push(`OC: ${soil.organic_carbon}%`);
  }
  
  // Soil moisture - Note: Schema does NOT have soil_moisture_percent, skip this check
  // This field is computed from NDVI/satellite data, not stored in soil_health
  
  // Soil test age - CRITICAL FIX: Schema uses 'test_date' not 'tested_at'
  if (fields.includes('soil_test_age') && soil?.test_date) {
    const daysAgo = Math.floor((Date.now() - new Date(soil.test_date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo > 180) parts.push(`⚠️ पुरानी मिट्टी जांच (${Math.floor(daysAgo/30)}महीने)`);
  }
  
  // NDVI (for health/pest queries)
  if (fields.includes('ndvi') && ndvi) {
    const val = ndvi.ndvi_value || ndvi.mean_ndvi;
    if (val) {
      const status = getNDVIStatus(val);
      parts.push(`NDVI: ${val.toFixed(2)}(${status})`);
    }
  }
  
  // Rain forecast (for watering)
  if (fields.includes('rain_forecast') && weather?.rain_probability) {
    if (weather.rain_probability > 50) {
      parts.push(`🌧️ बारिश: ${weather.rain_probability}%`);
    }
  }
  
  // Humidity (for pest)
  if (fields.includes('humidity') && weather?.humidity) {
    parts.push(`💨 ${weather.humidity}%`);
  }
  
  // Expected harvest (for market)
  if (fields.includes('expected_harvest') && daysSinceSowing && cropSchedule) {
    const duration = getCropDuration(cropName);
    const daysToHarvest = duration - daysSinceSowing;
    if (daysToHarvest > 0) {
      parts.push(`🗓️ कटाई: ~${daysToHarvest}दिन`);
    }
  }
  
  // Growth stage
  if (fields.includes('stage') && daysSinceSowing) {
    const stage = getGrowthStage(daysSinceSowing, cropName);
    if (stage && !parts[0]?.includes(stage)) {
      parts.push(`📊 ${stage}`);
    }
  }
  
  return parts.join(' | ');
}

// Helper functions
function compactIrrigation(type: string): string {
  const map: Record<string, string> = {
    'drip': 'ड्रिप', 'sprinkler': 'स्प्रिंकलर', 'flood': 'बाढ़',
    'furrow': 'नाली', 'canal': 'नहर', 'well': 'कुआं', 'borewell': 'बोरवेल'
  };
  return map[type.toLowerCase()] || type;
}

function compactSoil(type: string): string {
  const map: Record<string, string> = {
    'black': 'काली', 'red': 'लाल', 'alluvial': 'जलोढ़', 'sandy': 'रेतीली',
    'clay': 'चिकनी', 'loamy': 'दोमट', 'laterite': 'लैटेराइट'
  };
  return map[type.toLowerCase()] || type;
}

function getSymbol(value: number | string, nutrient: 'N' | 'P' | 'K'): string {
  if (value === '?') return '';
  const v = Number(value);
  const thresholds = { N: [140, 280], P: [10, 25], K: [110, 280] };
  const [low, high] = thresholds[nutrient];
  if (v < low) return '↓';
  if (v > high) return '↑';
  return '✓';
}

function getNDVIStatus(ndvi: number): string {
  if (ndvi >= 0.7) return 'स्वस्थ✓';
  if (ndvi >= 0.5) return 'ठीक→';
  if (ndvi >= 0.3) return 'तनाव↓';
  return 'खराब⚠️';
}

function getGrowthStage(days: number | null, crop: string): string {
  if (!days) return '';
  
  // Crop-specific stages (simplified)
  if (days <= 15) return 'अंकुरण';
  if (days <= 30) return 'वनस्पति';
  if (days <= 60) return 'वृद्धि';
  if (days <= 90) return 'फूल/फल';
  return 'पकाव';
}

function getCropDuration(crop: string): number {
  const durations: Record<string, number> = {
    'wheat': 120, 'गेहूं': 120, 'rice': 120, 'धान': 120, 'चावल': 120,
    'cotton': 180, 'कपास': 180, 'soybean': 100, 'सोयाबीन': 100,
    'maize': 90, 'मक्का': 90, 'sugarcane': 360, 'गन्ना': 360,
    'potato': 90, 'आलू': 90, 'onion': 120, 'प्याज': 120,
    'tomato': 90, 'टमाटर': 90, 'chilli': 120, 'मिर्च': 120
  };
  return durations[crop.toLowerCase()] || 120;
}

// Token estimation
export function estimateContextTokens(context: string): number {
  return Math.ceil(context.length / 3);
}
