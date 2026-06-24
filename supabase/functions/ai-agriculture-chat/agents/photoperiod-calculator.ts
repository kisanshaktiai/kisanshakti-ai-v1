/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTOPERIOD CALCULATOR (GAP 1.3)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Day length calculation for photoperiod-sensitive crops:
 * - Onion bulbing (13+ hours)
 * - Rice flowering (photoperiod-sensitive varieties)
 * - Soybean reproductive transition
 * 
 * Reference: ICAR-DOGR, ICAR-CRRI
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type PhotoperiodSensitivity = 'SHORT_DAY' | 'LONG_DAY' | 'DAY_NEUTRAL';

export interface PhotoperiodData {
  latitude: number;
  date: Date;
  day_length_hours: number;
  sunrise: string;
  sunset: string;
}

export interface CropPhotoperiodProfile {
  crop_code: string;
  sensitivity: PhotoperiodSensitivity;
  critical_day_length_hours: number;
  response_description: string;
  affected_stage: string;
}

export interface PhotoperiodAnalysis {
  current_day_length: number;
  crop_sensitivity: PhotoperiodSensitivity;
  critical_threshold: number;
  threshold_met: boolean;
  days_until_threshold?: number;
  recommendation: string;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP PHOTOPERIOD DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_PHOTOPERIOD_PROFILES: Record<string, CropPhotoperiodProfile> = {
  // Long-day plants (need >12-14 hours for flowering/bulbing)
  ONION: {
    crop_code: 'ONION',
    sensitivity: 'LONG_DAY',
    critical_day_length_hours: 13.0,
    response_description: 'Bulb formation requires 13+ hours day length',
    affected_stage: 'BULBING'
  },
  GARLIC: {
    crop_code: 'GARLIC',
    sensitivity: 'LONG_DAY',
    critical_day_length_hours: 13.5,
    response_description: 'Bulb formation requires 13.5+ hours day length',
    affected_stage: 'BULBING'
  },
  WHEAT_SPRING: {
    crop_code: 'WHEAT',
    sensitivity: 'LONG_DAY',
    critical_day_length_hours: 12.0,
    response_description: 'Flowering accelerated by longer days',
    affected_stage: 'HEADING'
  },
  
  // Short-day plants (need <12 hours for flowering)
  RICE_SD: {
    crop_code: 'RICE',
    sensitivity: 'SHORT_DAY',
    critical_day_length_hours: 12.0,
    response_description: 'Flowering delayed if day length >12 hours',
    affected_stage: 'PANICLE_INITIATION'
  },
  SOYBEAN_SD: {
    crop_code: 'SOYBEAN',
    sensitivity: 'SHORT_DAY',
    critical_day_length_hours: 13.0,
    response_description: 'Flowering requires short days (<13 hours)',
    affected_stage: 'FLOWERING'
  },
  COTTON: {
    crop_code: 'COTTON',
    sensitivity: 'SHORT_DAY',
    critical_day_length_hours: 12.5,
    response_description: 'Boll formation favored by shorter days',
    affected_stage: 'FLOWERING'
  },
  
  // Day-neutral plants
  TOMATO: {
    crop_code: 'TOMATO',
    sensitivity: 'DAY_NEUTRAL',
    critical_day_length_hours: 0,
    response_description: 'Flowering not affected by day length',
    affected_stage: 'FLOWERING'
  },
  MAIZE: {
    crop_code: 'MAIZE',
    sensitivity: 'DAY_NEUTRAL',
    critical_day_length_hours: 0,
    response_description: 'Mostly day-neutral, slight short-day preference',
    affected_stage: 'TASSELING'
  },
  POTATO: {
    crop_code: 'POTATO',
    sensitivity: 'DAY_NEUTRAL',
    critical_day_length_hours: 0,
    response_description: 'Tuber formation not significantly affected',
    affected_stage: 'TUBER_INITIATION'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate day length for a given latitude and date
 * Using simplified astronomical formula
 */
export function calculateDayLength(latitude: number, date: Date): PhotoperiodData {
  // Convert latitude to radians
  const latRad = latitude * (Math.PI / 180);
  
  // Day of year
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Solar declination (simplified)
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));
  const declinationRad = declination * (Math.PI / 180);
  
  // Hour angle at sunrise/sunset
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declinationRad);
  
  // Clamp to valid range for polar regions
  const clampedCos = Math.max(-1, Math.min(1, cosHourAngle));
  const hourAngle = Math.acos(clampedCos) * (180 / Math.PI);
  
  // Day length in hours
  const dayLengthHours = (2 * hourAngle) / 15;
  
  // Calculate sunrise/sunset times
  const noon = 12;
  const halfDay = dayLengthHours / 2;
  const sunriseHour = noon - halfDay;
  const sunsetHour = noon + halfDay;
  
  const formatTime = (hour: number): string => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };
  
  return {
    latitude,
    date,
    day_length_hours: Math.round(dayLengthHours * 100) / 100,
    sunrise: formatTime(sunriseHour),
    sunset: formatTime(sunsetHour)
  };
}

/**
 * Get photoperiod profile for a crop
 */
export function getCropPhotoperiodProfile(cropCode: string): CropPhotoperiodProfile | null {
  const normalized = cropCode.toUpperCase().replace(/\s+/g, '_');
  return CROP_PHOTOPERIOD_PROFILES[normalized] || null;
}

/**
 * Analyze photoperiod conditions for a crop
 */
export function analyzePhotoperiod(
  cropCode: string,
  latitude: number,
  date: Date = new Date(),
  variety?: string
): PhotoperiodAnalysis {
  const photoperiod = calculateDayLength(latitude, date);
  const profile = getCropPhotoperiodProfile(cropCode);
  
  if (!profile || profile.sensitivity === 'DAY_NEUTRAL') {
    return {
      current_day_length: photoperiod.day_length_hours,
      crop_sensitivity: 'DAY_NEUTRAL',
      critical_threshold: 0,
      threshold_met: true,
      recommendation: 'This crop is day-neutral. Photoperiod does not significantly affect development.',
      confidence: 0.95
    };
  }
  
  const dayLength = photoperiod.day_length_hours;
  const threshold = profile.critical_day_length_hours;
  
  let thresholdMet: boolean;
  let recommendation: string;
  
  if (profile.sensitivity === 'LONG_DAY') {
    thresholdMet = dayLength >= threshold;
    if (thresholdMet) {
      recommendation = `✅ Day length (${dayLength.toFixed(1)}h) meets ${profile.affected_stage} requirement (≥${threshold}h). ` +
        `${profile.response_description}`;
    } else {
      recommendation = `⏳ Day length (${dayLength.toFixed(1)}h) below ${profile.affected_stage} threshold (${threshold}h). ` +
        `Wait for longer days or consider this timing in your planning.`;
    }
  } else {
    // Short-day plant
    thresholdMet = dayLength <= threshold;
    if (thresholdMet) {
      recommendation = `✅ Day length (${dayLength.toFixed(1)}h) suitable for ${profile.affected_stage} (<${threshold}h). ` +
        `${profile.response_description}`;
    } else {
      recommendation = `⏳ Day length (${dayLength.toFixed(1)}h) too long for ${profile.affected_stage} (need <${threshold}h). ` +
        `${cropCode} ${profile.affected_stage.toLowerCase()} may be delayed.`;
    }
  }
  
  // Calculate days until threshold met
  let daysUntilThreshold: number | undefined;
  if (!thresholdMet) {
    for (let d = 1; d <= 180; d++) {
      const futureDate = new Date(date);
      futureDate.setDate(futureDate.getDate() + d);
      const futureDayLength = calculateDayLength(latitude, futureDate).day_length_hours;
      
      if (profile.sensitivity === 'LONG_DAY' && futureDayLength >= threshold) {
        daysUntilThreshold = d;
        break;
      } else if (profile.sensitivity === 'SHORT_DAY' && futureDayLength <= threshold) {
        daysUntilThreshold = d;
        break;
      }
    }
  }
  
  return {
    current_day_length: dayLength,
    crop_sensitivity: profile.sensitivity,
    critical_threshold: threshold,
    threshold_met: thresholdMet,
    days_until_threshold: daysUntilThreshold,
    recommendation,
    confidence: 0.88
  };
}

/**
 * Check if current conditions favor crop development stage
 */
export function isPhotoperiodFavorable(
  cropCode: string,
  targetStage: string,
  latitude: number,
  date: Date = new Date()
): boolean {
  const analysis = analyzePhotoperiod(cropCode, latitude, date);
  return analysis.threshold_met;
}

/**
 * Get optimal sowing window based on photoperiod
 */
export function getOptimalSowingWindow(
  cropCode: string,
  latitude: number,
  targetHarvestMonth: number
): { start_month: number; end_month: number; reason: string } {
  const profile = getCropPhotoperiodProfile(cropCode);
  
  if (!profile || profile.sensitivity === 'DAY_NEUTRAL') {
    return {
      start_month: 10,
      end_month: 11,
      reason: 'Day-neutral crop - sow based on temperature and rainfall'
    };
  }
  
  // For India (typical latitudes 8-35°N)
  // Longest days: June (14-15h in North India)
  // Shortest days: December (10-11h)
  
  if (profile.sensitivity === 'LONG_DAY') {
    // Long-day crops need to bulb/flower in long days (March-September)
    return {
      start_month: 10,  // October
      end_month: 12,    // December
      reason: `Sow in Oct-Dec so ${profile.affected_stage} occurs during long days (Mar-May)`
    };
  } else {
    // Short-day crops need short days for flowering
    return {
      start_month: 6,   // June
      end_month: 8,     // August
      reason: `Sow in Jun-Aug so ${profile.affected_stage} occurs during short days (Oct-Dec)`
    };
  }
}

/**
 * Integration function for orchestrator - called during phenology calculation
 */
export function integratePhotoperiodWithPhenology(
  cropCode: string,
  currentStage: string,
  latitude: number,
  das: number
): {
  photoperiod_suitable: boolean;
  day_length_hours: number;
  warning?: string;
  adjustment?: string;
} {
  const analysis = analyzePhotoperiod(cropCode, latitude);
  
  // Check if current stage is photoperiod-sensitive
  const profile = getCropPhotoperiodProfile(cropCode);
  if (!profile || profile.sensitivity === 'DAY_NEUTRAL') {
    return {
      photoperiod_suitable: true,
      day_length_hours: analysis.current_day_length
    };
  }
  
  // Check if approaching sensitive stage
  const sensitiveStageApproaching = 
    (cropCode.includes('ONION') && das >= 60 && das <= 90) ||  // Bulbing
    (cropCode.includes('RICE') && das >= 45 && das <= 70) ||   // Panicle initiation
    (cropCode.includes('SOYBEAN') && das >= 30 && das <= 50);  // Flowering
  
  if (sensitiveStageApproaching && !analysis.threshold_met) {
    return {
      photoperiod_suitable: false,
      day_length_hours: analysis.current_day_length,
      warning: `⚠️ Day length (${analysis.current_day_length.toFixed(1)}h) not optimal for ${profile.affected_stage}`,
      adjustment: analysis.days_until_threshold 
        ? `Favorable conditions expected in ${analysis.days_until_threshold} days`
        : 'Consider this in your planning'
    };
  }
  
  return {
    photoperiod_suitable: true,
    day_length_hours: analysis.current_day_length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED ALIAS FOR ORCHESTRATOR COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alias for checkPhotoperiodTrigger - used by orchestrator
 * Checks if photoperiod conditions trigger stage transition
 */
export function checkPhotoperiodTrigger(
  cropCode: string,
  latitude: number,
  das: number,
  currentStage?: string
): PhotoperiodResult {
  const analysis = analyzePhotoperiod(cropCode, latitude);
  const integration = integratePhotoperiodWithPhenology(cropCode, currentStage || '', latitude, das);
  
  return {
    crop_code: cropCode,
    latitude,
    current_day_length_hours: analysis.current_day_length,
    sensitivity: analysis.crop_sensitivity,
    critical_threshold_hours: analysis.critical_threshold,
    threshold_met: analysis.threshold_met,
    days_until_threshold: analysis.days_until_threshold,
    recommendation: analysis.recommendation,
    photoperiod_suitable: integration.photoperiod_suitable,
    warning: integration.warning,
    adjustment: integration.adjustment,
    confidence: analysis.confidence
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPE FOR ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoperiodResult {
  crop_code: string;
  latitude: number;
  current_day_length_hours: number;
  sensitivity: PhotoperiodSensitivity;
  critical_threshold_hours: number;
  threshold_met: boolean;
  days_until_threshold?: number;
  recommendation: string;
  photoperiod_suitable: boolean;
  warning?: string;
  adjustment?: string;
  confidence: number;
}
