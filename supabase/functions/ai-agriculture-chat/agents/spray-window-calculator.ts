/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPRAY WINDOW CALCULATOR (GAP 7.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Hourly weather-based spray window identification:
 * - Rain probability check (4-6 hours minimum dry)
 * - Wind speed limits (optimal <15 km/h)
 * - Temperature ranges (avoid extremes)
 * - Humidity considerations
 * 
 * Reference: FAO Pesticide Application Manual
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HourlyForecast {
  hour: number;  // 0-23
  temperature: number;
  humidity: number;
  rain_probability: number;  // 0-100
  wind_speed_kmh: number;
  cloud_cover?: number;
  uv_index?: number;
}

export interface SprayWindow {
  start_hour: number;
  end_hour: number;
  start_time: string;  // "17:00"
  end_time: string;    // "19:00"
  safety_score: number;  // 0-100
  concerns: string[];
  best_for: string[];  // ['INSECTICIDE', 'FUNGICIDE', 'HERBICIDE']
}

export interface SprayWindowAnalysis {
  date: Date;
  safe_windows: SprayWindow[];
  best_window: SprayWindow | null;
  overall_spray_day_score: number;  // 0-100
  recommendation: string;
  next_good_day?: Date;
  warnings: string[];
}

export interface SprayConditionLimits {
  max_wind_kmh: number;
  max_rain_probability: number;
  min_temp: number;
  max_temp: number;
  min_humidity: number;
  max_humidity: number;
  min_dry_hours_after: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRAY CONDITION LIMITS BY PRODUCT TYPE
// ═══════════════════════════════════════════════════════════════════════════

export const SPRAY_LIMITS: Record<string, SprayConditionLimits> = {
  INSECTICIDE_CONTACT: {
    max_wind_kmh: 15,
    max_rain_probability: 20,
    min_temp: 10,
    max_temp: 35,
    min_humidity: 40,
    max_humidity: 85,
    min_dry_hours_after: 4
  },
  INSECTICIDE_SYSTEMIC: {
    max_wind_kmh: 20,
    max_rain_probability: 30,
    min_temp: 15,
    max_temp: 32,
    min_humidity: 50,
    max_humidity: 80,
    min_dry_hours_after: 6
  },
  FUNGICIDE_CONTACT: {
    max_wind_kmh: 12,
    max_rain_probability: 15,
    min_temp: 10,
    max_temp: 30,
    min_humidity: 40,
    max_humidity: 90,
    min_dry_hours_after: 4
  },
  FUNGICIDE_SYSTEMIC: {
    max_wind_kmh: 18,
    max_rain_probability: 25,
    min_temp: 12,
    max_temp: 30,
    min_humidity: 50,
    max_humidity: 85,
    min_dry_hours_after: 6
  },
  HERBICIDE_PRE_EMERGENCE: {
    max_wind_kmh: 12,
    max_rain_probability: 40,  // Some moisture helpful
    min_temp: 15,
    max_temp: 30,
    min_humidity: 50,
    max_humidity: 90,
    min_dry_hours_after: 2  // Less critical
  },
  HERBICIDE_POST_EMERGENCE: {
    max_wind_kmh: 10,  // Drift very critical
    max_rain_probability: 20,
    min_temp: 15,
    max_temp: 28,
    min_humidity: 60,
    max_humidity: 90,
    min_dry_hours_after: 6
  },
  BIOLOGICAL: {
    max_wind_kmh: 15,
    max_rain_probability: 25,
    min_temp: 18,
    max_temp: 32,
    min_humidity: 60,
    max_humidity: 95,
    min_dry_hours_after: 2
  },
  DEFAULT: {
    max_wind_kmh: 15,
    max_rain_probability: 20,
    min_temp: 12,
    max_temp: 35,
    min_humidity: 40,
    max_humidity: 90,
    min_dry_hours_after: 4
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a specific hour is suitable for spraying
 */
export function checkHourSuitability(
  hour: HourlyForecast,
  nextHours: HourlyForecast[],  // For checking dry period after
  productType: string = 'DEFAULT'
): { suitable: boolean; score: number; concerns: string[] } {
  const limits = SPRAY_LIMITS[productType] || SPRAY_LIMITS.DEFAULT;
  const concerns: string[] = [];
  let score = 100;
  
  // Wind check
  if (hour.wind_speed_kmh > limits.max_wind_kmh) {
    concerns.push(`Wind too high (${hour.wind_speed_kmh} km/h > ${limits.max_wind_kmh})`);
    score -= 30;
  } else if (hour.wind_speed_kmh > limits.max_wind_kmh * 0.8) {
    concerns.push(`Wind borderline (${hour.wind_speed_kmh} km/h)`);
    score -= 10;
  }
  
  // Rain probability check
  if (hour.rain_probability > limits.max_rain_probability) {
    concerns.push(`Rain likely (${hour.rain_probability}% > ${limits.max_rain_probability}%)`);
    score -= 40;
  } else if (hour.rain_probability > limits.max_rain_probability * 0.7) {
    concerns.push(`Some rain risk (${hour.rain_probability}%)`);
    score -= 15;
  }
  
  // Temperature check
  if (hour.temperature < limits.min_temp) {
    concerns.push(`Too cold (${hour.temperature}°C < ${limits.min_temp}°C)`);
    score -= 25;
  } else if (hour.temperature > limits.max_temp) {
    concerns.push(`Too hot (${hour.temperature}°C > ${limits.max_temp}°C)`);
    score -= 30;
  }
  
  // Humidity check
  if (hour.humidity < limits.min_humidity) {
    concerns.push(`Humidity too low (${hour.humidity}% < ${limits.min_humidity}%)`);
    score -= 15;
  } else if (hour.humidity > limits.max_humidity) {
    concerns.push(`Humidity too high (${hour.humidity}% > ${limits.max_humidity}%)`);
    score -= 10;
  }
  
  // Check dry period after spray
  const dryHoursNeeded = limits.min_dry_hours_after;
  let dryHoursAvailable = 0;
  for (let i = 0; i < Math.min(dryHoursNeeded, nextHours.length); i++) {
    if (nextHours[i].rain_probability < 30) {
      dryHoursAvailable++;
    } else {
      break;
    }
  }
  
  if (dryHoursAvailable < dryHoursNeeded) {
    concerns.push(`Insufficient dry period after (${dryHoursAvailable}h < ${dryHoursNeeded}h needed)`);
    score -= 35;
  }
  
  return {
    suitable: score >= 60,
    score: Math.max(0, score),
    concerns
  };
}

/**
 * Calculate spray windows for a day
 */
export function calculateSprayWindows(
  hourlyForecasts: HourlyForecast[],
  productType: string = 'DEFAULT'
): SprayWindowAnalysis {
  const windows: SprayWindow[] = [];
  const warnings: string[] = [];
  
  // Prefer early morning (5-9 AM) or evening (4-7 PM)
  const preferredMorning = [5, 6, 7, 8, 9];
  const preferredEvening = [16, 17, 18, 19];
  const avoidHours = [10, 11, 12, 13, 14, 15];  // Midday - too hot, high evaporation
  
  let currentWindow: { start: number; end: number; scores: number[]; concerns: string[] } | null = null;
  
  for (let i = 0; i < hourlyForecasts.length; i++) {
    const hour = hourlyForecasts[i];
    const nextHours = hourlyForecasts.slice(i + 1, i + 7);
    const check = checkHourSuitability(hour, nextHours, productType);
    
    // Apply time-of-day preference
    let adjustedScore = check.score;
    if (preferredMorning.includes(hour.hour) || preferredEvening.includes(hour.hour)) {
      adjustedScore = Math.min(100, adjustedScore + 10);
    } else if (avoidHours.includes(hour.hour)) {
      adjustedScore = Math.max(0, adjustedScore - 15);
      if (check.suitable) {
        check.concerns.push('Midday spray - higher evaporation');
      }
    }
    
    if (adjustedScore >= 60) {
      if (currentWindow && hour.hour === currentWindow.end + 1) {
        // Extend current window
        currentWindow.end = hour.hour;
        currentWindow.scores.push(adjustedScore);
        currentWindow.concerns = [...new Set([...currentWindow.concerns, ...check.concerns])];
      } else {
        // Start new window
        if (currentWindow) {
          windows.push(formatWindow(currentWindow, productType));
        }
        currentWindow = {
          start: hour.hour,
          end: hour.hour,
          scores: [adjustedScore],
          concerns: check.concerns
        };
      }
    } else {
      // Close current window
      if (currentWindow) {
        windows.push(formatWindow(currentWindow, productType));
        currentWindow = null;
      }
    }
  }
  
  // Close final window
  if (currentWindow) {
    windows.push(formatWindow(currentWindow, productType));
  }
  
  // Find best window
  const bestWindow = windows.length > 0
    ? windows.reduce((best, w) => w.safety_score > best.safety_score ? w : best)
    : null;
  
  // Calculate overall day score
  const avgScore = windows.length > 0
    ? windows.reduce((sum, w) => sum + w.safety_score, 0) / windows.length
    : 0;
  
  // Build recommendation
  let recommendation: string;
  if (bestWindow && bestWindow.safety_score >= 80) {
    recommendation = `✅ Good spray day. Best window: ${bestWindow.start_time} - ${bestWindow.end_time} (${bestWindow.safety_score}% safe)`;
  } else if (bestWindow && bestWindow.safety_score >= 60) {
    recommendation = `⚠️ Marginal spray conditions. Window: ${bestWindow.start_time} - ${bestWindow.end_time}. ${bestWindow.concerns.join(', ')}`;
  } else {
    recommendation = `❌ Poor spray day. Consider postponing if possible.`;
    warnings.push('No safe spray windows found today');
  }
  
  // Check for general day warnings
  const avgRain = hourlyForecasts.reduce((s, h) => s + h.rain_probability, 0) / hourlyForecasts.length;
  if (avgRain > 50) {
    warnings.push('High rain probability throughout the day');
  }
  
  const maxWind = Math.max(...hourlyForecasts.map(h => h.wind_speed_kmh));
  if (maxWind > 25) {
    warnings.push(`Strong winds expected (up to ${maxWind} km/h)`);
  }
  
  return {
    date: new Date(),
    safe_windows: windows,
    best_window: bestWindow,
    overall_spray_day_score: Math.round(avgScore),
    recommendation,
    warnings
  };
}

/**
 * Format window object
 */
function formatWindow(
  window: { start: number; end: number; scores: number[]; concerns: string[] },
  productType: string
): SprayWindow {
  const avgScore = window.scores.reduce((a, b) => a + b, 0) / window.scores.length;
  
  const formatHour = (h: number): string => `${h.toString().padStart(2, '0')}:00`;
  
  // Determine what products are suitable
  const bestFor: string[] = [];
  if (avgScore >= 80) {
    bestFor.push('INSECTICIDE', 'FUNGICIDE', 'HERBICIDE', 'BIOLOGICAL');
  } else if (avgScore >= 70) {
    bestFor.push('INSECTICIDE', 'FUNGICIDE');
  } else {
    bestFor.push('EMERGENCY_ONLY');
  }
  
  return {
    start_hour: window.start,
    end_hour: window.end,
    start_time: formatHour(window.start),
    end_time: formatHour(window.end + 1),
    safety_score: Math.round(avgScore),
    concerns: window.concerns,
    best_for: bestFor
  };
}

/**
 * Quick check: Can farmer spray now?
 */
export function canSprayNow(
  currentHour: HourlyForecast,
  nextHours: HourlyForecast[],
  productType: string = 'DEFAULT'
): { can_spray: boolean; reason: string; wait_hours?: number } {
  const check = checkHourSuitability(currentHour, nextHours, productType);
  
  if (check.suitable && check.score >= 70) {
    return {
      can_spray: true,
      reason: `✅ Safe to spray now (${check.score}% safety score)`
    };
  } else if (check.suitable) {
    return {
      can_spray: true,
      reason: `⚠️ Marginal conditions but acceptable. ${check.concerns[0] || ''}`
    };
  } else {
    // Find next good hour
    let waitHours = 0;
    for (let i = 0; i < nextHours.length; i++) {
      const futureCheck = checkHourSuitability(nextHours[i], nextHours.slice(i + 1), productType);
      if (futureCheck.suitable && futureCheck.score >= 70) {
        waitHours = i + 1;
        break;
      }
    }
    
    return {
      can_spray: false,
      reason: `❌ Not recommended now. ${check.concerns.join('. ')}`,
      wait_hours: waitHours > 0 ? waitHours : undefined
    };
  }
}

/**
 * Get spray timing recommendation in farmer-friendly language
 */
export function getSprayTimingAdvice(
  analysis: SprayWindowAnalysis,
  language: string = 'en'
): string {
  const messages: Record<string, Record<string, string>> = {
    good: {
      mr: `✅ आज फवारणीसाठी चांगला दिवस आहे. सर्वोत्तम वेळ: ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time}`,
      hi: `✅ आज छिड़काव के लिए अच्छा दिन है। सबसे अच्छा समय: ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time}`,
      en: `✅ Good spray day. Best time: ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time}`
    },
    marginal: {
      mr: `⚠️ फवारणीसाठी सरासरी परिस्थिती. शक्य असल्यास ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time} दरम्यान करा.`,
      hi: `⚠️ छिड़काव के लिए औसत स्थिति। ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time} के बीच करें।`,
      en: `⚠️ Marginal spray conditions. If needed, spray between ${analysis.best_window?.start_time} - ${analysis.best_window?.end_time}`
    },
    poor: {
      mr: `❌ आज फवारणी टाळा. ${analysis.warnings[0] || 'हवामान अनुकूल नाही.'}`,
      hi: `❌ आज छिड़काव से बचें। ${analysis.warnings[0] || 'मौसम अनुकूल नहीं है।'}`,
      en: `❌ Avoid spraying today. ${analysis.warnings[0] || 'Weather not suitable.'}`
    }
  };
  
  if (analysis.best_window && analysis.best_window.safety_score >= 80) {
    return messages.good[language];
  } else if (analysis.best_window && analysis.best_window.safety_score >= 60) {
    return messages.marginal[language];
  } else {
    return messages.poor[language];
  }
}

/**
 * Integration with orchestrator - check spray conditions before recommending
 */
export function validateSprayConditions(
  hourlyForecasts: HourlyForecast[],
  chemicalType: string,
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
): {
  approved: boolean;
  spray_window: SprayWindow | null;
  advice: string;
  delay_days?: number;
} {
  const analysis = calculateSprayWindows(hourlyForecasts, chemicalType);
  
  // Critical urgency - spray even in marginal conditions
  if (urgency === 'CRITICAL' && analysis.best_window) {
    return {
      approved: true,
      spray_window: analysis.best_window,
      advice: `⚠️ Urgent spray needed. Best available window: ${analysis.best_window.start_time} - ${analysis.best_window.end_time}`
    };
  }
  
  // High urgency - spray if score >= 60
  if (urgency === 'HIGH' && analysis.best_window && analysis.best_window.safety_score >= 60) {
    return {
      approved: true,
      spray_window: analysis.best_window,
      advice: analysis.recommendation
    };
  }
  
  // Normal urgency - spray if score >= 70
  if (analysis.best_window && analysis.best_window.safety_score >= 70) {
    return {
      approved: true,
      spray_window: analysis.best_window,
      advice: analysis.recommendation
    };
  }
  
  // Low urgency or no good window - recommend delay
  return {
    approved: false,
    spray_window: null,
    advice: `❌ Weather not suitable for spraying today. ${analysis.warnings.join('. ')}`,
    delay_days: urgency === 'LOW' ? 2 : 1
  };
}
