// ============= COMPRESSED CONTEXT BUILDER =============
// Builds ultra-compact context based on query intent

import { QueryIntent } from './query-classifier.ts';

interface ContextData {
  land: any;
  areaInAcres: string | number;
  daysSinceSowing: number | null;
  latestSoilHealth: any;
  latestNDVI: any;
  ndviData: any[];
  queryIntent: QueryIntent;
  cropSchedule?: any;
  currentGrowthStage?: string;
  daysToHarvest?: number | null;
  historicalWeather?: any[]; // ✅ NEW: Last 30 days weather
  weatherTrend?: string; // ✅ NEW: Weather trend analysis
}

export function buildCompressedContext(data: ContextData): string {
  const { 
    land, areaInAcres, daysSinceSowing, latestSoilHealth, latestNDVI, ndviData, 
    queryIntent, cropSchedule, currentGrowthStage, daysToHarvest,
    historicalWeather, weatherTrend 
  } = data;
  
  let context = '';
  
  // ============= ALWAYS INCLUDE BASIC INFO =============
  const cropName = cropSchedule?.crop_name || land.current_crop || 'Unknown';
  const cropVariety = cropSchedule?.crop_variety ? ` (${cropSchedule.crop_variety})` : '';
  const areaGunta = land.area_gunta || Math.round(Number(areaInAcres) * 40);
  
  context += `Land: ${areaInAcres}ac (${areaGunta}g)`;
  
  if (cropName !== 'Unknown') {
    context += ` | ${cropName}${cropVariety}`;
    if (daysSinceSowing) {
      context += ` (${daysSinceSowing}d)`;
    }
    if (currentGrowthStage) {
      context += ` - ${currentGrowthStage}`;
    }
    if (cropSchedule?.sowing_date) {
      const sowingDate = new Date(cropSchedule.sowing_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      context += ` [Sown: ${sowingDate}]`;
    }
    if (daysToHarvest && daysToHarvest > 0) {
      context += ` [Harvest in ${daysToHarvest}d]`;
    }
  }
  
  // ============= QUERY-SPECIFIC DATA =============
  
  if (queryIntent.type === 'watering') {
    // 🌾 Watering: irrigation type, crop stage, area
    context += ` | ${land.irrigation_type || 'No irrig'} | ${land.water_source || 'No source'}`;
    if (land.soil_type) {
      context += ` | ${compressSoilType(land.soil_type)}`;
    }
  }
  
  else if (queryIntent.type === 'fertilizer') {
    // 🌱 Fertilizer: Soil NPK, crop, area
    if (latestSoilHealth) {
      const n = latestSoilHealth.nitrogen_kg_per_ha || '-';
      const p = latestSoilHealth.phosphorus_kg_per_ha || '-';
      const k = latestSoilHealth.potassium_kg_per_ha || '-';
      const ph = latestSoilHealth.ph_level || '-';
      const oc = latestSoilHealth.organic_carbon || '-';
      
      context += `\nNPK: N:${n} P:${p}${getStatusSymbol(p, 'P')} K:${k} | pH:${ph} | OC:${oc}%`;
      
      // Add test date if recent
      if (latestSoilHealth.test_date) {
        const testDate = new Date(latestSoilHealth.test_date);
        const daysAgo = Math.floor((Date.now() - testDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo < 180) {
          context += ` (${daysAgo}d ago)`;
        }
      }
    } else {
      context += '\nNPK: No soil test data';
    }
  }
  
  else if (queryIntent.type === 'pest') {
    // 🐛 Pest: crop, stage, NDVI, last spray
    if (latestNDVI) {
      const ndviVal = latestNDVI.ndvi_value || latestNDVI.mean_ndvi;
      context += `\nNDVI: ${ndviVal}${getNDVISymbol(ndviVal)} | Health: ${getNDVIStatus(ndviVal)}`;
    }
    if (land.soil_type) {
      context += ` | ${compressSoilType(land.soil_type)}`;
    }
  }
  
  else if (queryIntent.type === 'health') {
    // 📊 Health: NDVI trend, soil moisture, crop stage
    if (latestNDVI) {
      const ndviVal = latestNDVI.ndvi_value || latestNDVI.mean_ndvi;
      context += `\nNDVI: ${ndviVal}${getNDVISymbol(ndviVal)}`;
      
      // Calculate trend if we have history
      if (ndviData && ndviData.length >= 2) {
        const oldestNDVI = ndviData[ndviData.length - 1].ndvi_value || ndviData[ndviData.length - 1].mean_ndvi;
        const trend = Number(ndviVal) - Number(oldestNDVI);
        if (trend > 0.05) context += ' ↑';
        else if (trend < -0.05) context += ' ↓';
        else context += ' →';
        context += ` (${trend > 0 ? '+' : ''}${trend.toFixed(2)})`;
      }
    }
    
    if (land.soil_moisture) {
      context += ` | Moisture: ${land.soil_moisture}%`;
    }
  }
  
  else if (queryIntent.type === 'market') {
    // 💰 Market: crop, area, expected harvest from schedule
    if (daysToHarvest && daysToHarvest > 0) {
      context += ` | Harvest in: ${daysToHarvest}d`;
    } else if (cropSchedule?.expected_harvest_date) {
      const harvestDate = new Date(cropSchedule.expected_harvest_date).toLocaleDateString('en-IN');
      context += ` | Expected: ${harvestDate}`;
    } else if (land.cultivation_date && daysSinceSowing) {
      // Fallback: Estimate harvest date
      const estimatedCropDuration = getCropDuration(cropName);
      const fallbackDaysToHarvest = estimatedCropDuration - daysSinceSowing;
      if (fallbackDaysToHarvest > 0) {
        context += ` | Est. harvest: ${fallbackDaysToHarvest}d`;
      } else {
        context += ` | Ready for harvest`;
      }
    }
  }
  
  else if (queryIntent.type === 'general') {
    // ❓ General: minimal info
    if (land.location || land.village) {
      context += ` | ${land.village || land.location}`;
    }
  }
  
  // ============= HISTORICAL WEATHER ANALYSIS (NEW) =============
  if (historicalWeather && historicalWeather.length > 0 && queryIntent.type !== 'general') {
    const avgTemp = historicalWeather.reduce((sum, w) => sum + (w.temp_avg || w.temp || 0), 0) / historicalWeather.length;
    const totalRain = historicalWeather.reduce((sum, w) => sum + (w.total_rain || w.rainfall || 0), 0);
    const avgHumidity = historicalWeather.reduce((sum, w) => sum + (w.avg_humidity || w.humidity || 0), 0) / historicalWeather.length;
    
    context += `\nWeather (30d): Temp ${avgTemp.toFixed(1)}°C | Rain ${totalRain}mm | Humid ${avgHumidity.toFixed(0)}%`;
    if (weatherTrend) context += ` | ${weatherTrend}`;
  }
  
  // ============= SOIL HEALTH TRENDS (NEW) =============
  if (queryIntent.type === 'fertilizer' && latestSoilHealth) {
    const testAge = latestSoilHealth.test_date 
      ? Math.floor((Date.now() - new Date(latestSoilHealth.test_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    if (testAge && testAge > 90) {
      context += `\n⚠️ Soil test ${testAge}d old - results may be outdated`;
    }
  }
  
  // ============= NDVI HISTORICAL TREND (NEW) =============
  if (queryIntent.type === 'health' && ndviData && ndviData.length >= 3) {
    const recent = ndviData.slice(0, 3).map(d => Number(d.ndvi_value || d.mean_ndvi));
    const trend = recent[0] > recent[2] ? 'Improving↑' : recent[0] < recent[2] ? 'Declining↓' : 'Stable→';
    context += `\nNDVI Trend (3 readings): ${trend} [${recent.map(v => v.toFixed(2)).join(', ')}]`;
  }
  
  return context;
}

// ============= HELPER FUNCTIONS =============

function compressSoilType(soilType: string): string {
  const map: Record<string, string> = {
    'Black Soil': 'Black',
    'Red Soil': 'Red',
    'Alluvial Soil': 'Alluvial',
    'Laterite Soil': 'Laterite',
    'Sandy Soil': 'Sandy',
    'Clay Soil': 'Clay',
    'Loamy Soil': 'Loam'
  };
  return map[soilType] || soilType.split(' ')[0];
}

function getStatusSymbol(value: string | number, nutrient: 'N' | 'P' | 'K'): string {
  if (value === '-' || !value) return '';
  
  const num = Number(value);
  // Standard NPK thresholds (kg/ha)
  const thresholds = {
    N: { low: 200, high: 400 },
    P: { low: 15, high: 30 },
    K: { low: 150, high: 300 }
  };
  
  const t = thresholds[nutrient];
  if (num < t.low) return '↓';
  if (num > t.high) return '↑';
  return '✓';
}

function getNDVISymbol(ndvi: number | string): string {
  const val = Number(ndvi);
  if (val >= 0.7) return '✓';
  if (val >= 0.5) return '→';
  return '↓';
}

function getNDVIStatus(ndvi: number | string): string {
  const val = Number(ndvi);
  if (val >= 0.8) return 'Excellent';
  if (val >= 0.7) return 'Healthy';
  if (val >= 0.5) return 'Moderate';
  if (val >= 0.3) return 'Stressed';
  return 'Poor';
}

function getCropDuration(cropName: string): number {
  // Rough crop duration estimates in days
  const durations: Record<string, number> = {
    'wheat': 120,
    'rice': 120,
    'cotton': 180,
    'sugarcane': 365,
    'soybean': 100,
    'maize': 90,
    'tomato': 75,
    'potato': 90,
    'onion': 120,
    'chilli': 150,
    'groundnut': 120
  };
  
  const normalized = cropName.toLowerCase();
  for (const [crop, duration] of Object.entries(durations)) {
    if (normalized.includes(crop)) return duration;
  }
  
  return 120; // Default duration
}
