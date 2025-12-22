/**
 * Scientific NDVI Standards based on:
 * - NASA Earth Observations
 * - ESA Sentinel-2 Guidelines
 * - ICAR (Indian Council of Agricultural Research)
 * - FAO Guidelines
 * 
 * NDVI Range: -1.0 to +1.0
 * Typical Vegetation Range: 0.0 to 1.0
 */

export type NDVIHealthLevel = 'excellent' | 'healthy' | 'moderate' | 'poor' | 'critical';

export interface NDVIHealthStatus {
  level: NDVIHealthLevel;
  label: string;
  labelKey: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  strokeColor: string;
}

/**
 * Scientific NDVI thresholds for agricultural crop health
 * Based on NASA/ESA/ICAR/FAO standards
 */
export const NDVI_THRESHOLDS = {
  EXCELLENT: 0.65,  // Dense, healthy vegetation
  HEALTHY: 0.50,    // Moderately healthy vegetation
  MODERATE: 0.35,   // Sparse/stressed vegetation
  POOR: 0.20,       // Very sparse/highly stressed vegetation
  // Below 0.20 = Critical (bare soil, water, or dead vegetation)
};

/**
 * NASA/ESA Standard NDVI Color Palette
 */
export const NDVI_COLORS = {
  excellent: {
    primary: '#228B22',      // Forest Green
    bg: 'from-green-600/20 to-green-600/5',
    text: 'text-green-600',
    border: 'border-green-600/30',
    stroke: 'stroke-green-600',
    badge: 'bg-green-600 text-white',
  },
  healthy: {
    primary: '#32CD32',      // Lime Green
    bg: 'from-emerald-500/20 to-emerald-500/5',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
    stroke: 'stroke-emerald-500',
    badge: 'bg-emerald-500 text-white',
  },
  moderate: {
    primary: '#FFD700',      // Gold/Yellow
    bg: 'from-amber-500/20 to-amber-500/5',
    text: 'text-amber-500',
    border: 'border-amber-500/30',
    stroke: 'stroke-amber-500',
    badge: 'bg-amber-500 text-white',
  },
  poor: {
    primary: '#FF8C00',      // Dark Orange
    bg: 'from-orange-500/20 to-orange-500/5',
    text: 'text-orange-500',
    border: 'border-orange-500/30',
    stroke: 'stroke-orange-500',
    badge: 'bg-orange-500 text-white',
  },
  critical: {
    primary: '#DC143C',      // Crimson Red
    bg: 'from-red-600/20 to-red-600/5',
    text: 'text-red-600',
    border: 'border-red-600/30',
    stroke: 'stroke-red-600',
    badge: 'bg-red-600 text-white',
  },
};

/**
 * Get health status based on NDVI value using scientific thresholds
 */
export function getScientificHealthStatus(ndvi: number): NDVIHealthStatus {
  if (ndvi >= NDVI_THRESHOLDS.EXCELLENT) {
    return {
      level: 'excellent',
      label: 'Excellent',
      labelKey: 'ndvi.health_status.excellent',
      description: 'Dense, healthy vegetation with optimal photosynthesis',
      color: NDVI_COLORS.excellent.primary,
      bgColor: NDVI_COLORS.excellent.bg,
      borderColor: NDVI_COLORS.excellent.border,
      textColor: NDVI_COLORS.excellent.text,
      strokeColor: NDVI_COLORS.excellent.stroke,
    };
  }
  if (ndvi >= NDVI_THRESHOLDS.HEALTHY) {
    return {
      level: 'healthy',
      label: 'Healthy',
      labelKey: 'ndvi.health_status.healthy',
      description: 'Good vegetation cover with healthy growth',
      color: NDVI_COLORS.healthy.primary,
      bgColor: NDVI_COLORS.healthy.bg,
      borderColor: NDVI_COLORS.healthy.border,
      textColor: NDVI_COLORS.healthy.text,
      strokeColor: NDVI_COLORS.healthy.stroke,
    };
  }
  if (ndvi >= NDVI_THRESHOLDS.MODERATE) {
    return {
      level: 'moderate',
      label: 'Moderate',
      labelKey: 'ndvi.health_status.moderate',
      description: 'Sparse vegetation or early stress signs',
      color: NDVI_COLORS.moderate.primary,
      bgColor: NDVI_COLORS.moderate.bg,
      borderColor: NDVI_COLORS.moderate.border,
      textColor: NDVI_COLORS.moderate.text,
      strokeColor: NDVI_COLORS.moderate.stroke,
    };
  }
  if (ndvi >= NDVI_THRESHOLDS.POOR) {
    return {
      level: 'poor',
      label: 'Poor',
      labelKey: 'ndvi.health_status.poor',
      description: 'Very sparse vegetation or significant stress',
      color: NDVI_COLORS.poor.primary,
      bgColor: NDVI_COLORS.poor.bg,
      borderColor: NDVI_COLORS.poor.border,
      textColor: NDVI_COLORS.poor.text,
      strokeColor: NDVI_COLORS.poor.stroke,
    };
  }
  return {
    level: 'critical',
    label: 'Critical',
    labelKey: 'ndvi.health_status.critical',
    description: 'Bare soil, water, or dead vegetation',
    color: NDVI_COLORS.critical.primary,
    bgColor: NDVI_COLORS.critical.bg,
    borderColor: NDVI_COLORS.critical.border,
    textColor: NDVI_COLORS.critical.text,
    strokeColor: NDVI_COLORS.critical.stroke,
  };
}

/**
 * Get risk level based on NDVI value and trend (scientific approach)
 */
export function getScientificRiskLevel(ndvi: number, trend: number): 'low' | 'medium' | 'high' | 'critical' {
  // Critical: NDVI below poor threshold or rapidly declining
  if (ndvi < NDVI_THRESHOLDS.POOR || (ndvi < NDVI_THRESHOLDS.MODERATE && trend < -0.005)) {
    return 'critical';
  }
  // High: NDVI in poor range or moderate with declining trend
  if (ndvi < NDVI_THRESHOLDS.MODERATE || (ndvi < NDVI_THRESHOLDS.HEALTHY && trend < -0.003)) {
    return 'high';
  }
  // Medium: NDVI in moderate range or healthy with slight decline
  if (ndvi < NDVI_THRESHOLDS.HEALTHY || trend < -0.001) {
    return 'medium';
  }
  // Low: Healthy or excellent
  return 'low';
}

/**
 * Format NDVI value for scientific display
 * Shows the actual 0-1 value with 2-3 decimal places
 */
export function formatNDVI(ndvi: number, decimals: number = 2): string {
  return ndvi.toFixed(decimals);
}

/**
 * Get trend direction from trend value
 */
export function getTrendDirection(trend: number): 'improving' | 'declining' | 'stable' {
  if (trend > 0.001) return 'improving';
  if (trend < -0.001) return 'declining';
  return 'stable';
}

/**
 * Scientific NDVI interpretation guide
 */
export const NDVI_INTERPRETATION = {
  ranges: [
    { min: 0.65, max: 1.0, label: 'Excellent', description: 'Dense healthy vegetation, forests, irrigated crops at peak growth' },
    { min: 0.50, max: 0.65, label: 'Healthy', description: 'Healthy cropland, grassland with good water availability' },
    { min: 0.35, max: 0.50, label: 'Moderate', description: 'Shrubland, sparse vegetation, crops in early/late stages' },
    { min: 0.20, max: 0.35, label: 'Poor', description: 'Very sparse vegetation, stressed crops, semi-arid conditions' },
    { min: -1.0, max: 0.20, label: 'Critical', description: 'Bare soil, water bodies, snow, built-up areas, dead vegetation' },
  ],
  sources: [
    'NASA Earth Observations (NEO)',
    'ESA Sentinel-2 L2A Guidelines',
    'ICAR Crop Health Monitoring Standards',
    'FAO Agricultural Remote Sensing',
  ],
};
