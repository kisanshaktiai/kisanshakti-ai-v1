/**
 * Scientific NDVI Standards (SSOT for the farmer app)
 *
 * References:
 * - NASA Earth Observations (NEO)
 * - ESA Sentinel-2 L2A Guidelines
 * - ICAR Crop Health Monitoring Standards
 * - FAO Agricultural Remote Sensing
 *
 * Unit contracts:
 * - NDVI value      : dimensionless, range [-1.0, +1.0], vegetation typically [0, 1]
 * - trend           : ΔNDVI per day (float). Positive = improving, negative = declining.
 * - cloud_coverage  : percent [0..100]
 * - coverage_percent: percent of land polygon covered by valid pixels [0..100]
 * - quality_score   : provider-specific [0..1] (Sentinel-2 SCL-derived)
 */

export type NDVIHealthLevel = 'excellent' | 'healthy' | 'moderate' | 'poor' | 'critical';

export interface NDVIHealthStatus {
  level: NDVIHealthLevel;
  label: string;
  labelKey: string;
  descriptionKey: string;
  /** Hex color from the standard ramp */
  color: string;
  /** Tailwind gradient classes (legacy, kept for back-compat) */
  bgColor: string;
  borderColor: string;
  textColor: string;
  strokeColor: string;
}

/**
 * Scientific NDVI thresholds for agricultural crop health.
 * Aligned with NASA/ESA/ICAR/FAO standards.
 */
export const NDVI_THRESHOLDS = {
  EXCELLENT: 0.65,
  HEALTHY: 0.50,
  MODERATE: 0.35,
  POOR: 0.20,
} as const;

/**
 * RELIABILITY GATES — any reading failing these is NEVER shown as "current" or used in projections.
 */
export const NDVI_RELIABILITY = {
  MAX_CLOUD_COVERAGE: 40,    // percent — Sentinel-2 realistic for partly cloudy fields
  MIN_COVERAGE_PERCENT: 15,  // percent — small Indian fields rarely exceed 30% polygon-pixel coverage
  MIN_QUALITY_SCORE: 0.3,    // when present
} as const;

/**
 * Standard NDVI color ramp (NASA / USGS convention) used as single SSOT for
 * the map heatmap, the ring, the legend, sparklines and badges.
 * Continuous; stops are interpolated by the renderer.
 */
export const NDVI_COLOR_STOPS: Array<{ value: number; hex: string }> = [
  { value: -0.20, hex: '#7C3F1C' }, // bare soil / built-up
  { value:  0.00, hex: '#B25C2C' },
  { value:  0.10, hex: '#D9B26E' },
  { value:  0.20, hex: '#E8C170' }, // critical → poor
  { value:  0.35, hex: '#FFD166' }, // poor → moderate
  { value:  0.50, hex: '#C7E27A' }, // moderate → healthy
  { value:  0.65, hex: '#5DBB63' }, // healthy → excellent
  { value:  0.80, hex: '#2E8B3D' },
  { value:  1.00, hex: '#1B5E20' }, // peak vegetation
];

/** CSS linear-gradient string for legends. */
export const NDVI_GRADIENT_CSS = `linear-gradient(to top, ${NDVI_COLOR_STOPS
  .map((s) => `${s.hex} ${((s.value + 0.2) / 1.2) * 100}%`)
  .join(', ')})`;

/** Linear interpolation between two hex colors. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const ar = parseInt(pa.slice(0, 2), 16);
  const ag = parseInt(pa.slice(2, 4), 16);
  const ab = parseInt(pa.slice(4, 6), 16);
  const br = parseInt(pb.slice(0, 2), 16);
  const bg = parseInt(pb.slice(2, 4), 16);
  const bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** Map an NDVI value to its scientifically-standard color. */
export function ndviToColor(ndvi: number): string {
  const v = Math.max(NDVI_COLOR_STOPS[0].value, Math.min(1, ndvi));
  for (let i = 0; i < NDVI_COLOR_STOPS.length - 1; i++) {
    const a = NDVI_COLOR_STOPS[i];
    const b = NDVI_COLOR_STOPS[i + 1];
    if (v >= a.value && v <= b.value) {
      const t = (v - a.value) / (b.value - a.value);
      return lerpHex(a.hex, b.hex, t);
    }
  }
  return NDVI_COLOR_STOPS[NDVI_COLOR_STOPS.length - 1].hex;
}

/**
 * Legacy Tailwind class palette (kept so existing components compile while
 * we migrate to ndviToColor + design tokens).
 */
export const NDVI_COLORS = {
  excellent: { primary: '#1B5E20', bg: 'from-green-700/20 to-green-700/5',  text: 'text-green-700',  border: 'border-green-700/30',  stroke: 'stroke-green-700',  badge: 'bg-green-700 text-white' },
  healthy:   { primary: '#2E8B3D', bg: 'from-emerald-600/20 to-emerald-600/5', text: 'text-emerald-600', border: 'border-emerald-600/30', stroke: 'stroke-emerald-600', badge: 'bg-emerald-600 text-white' },
  moderate:  { primary: '#FFD166', bg: 'from-amber-500/20 to-amber-500/5',  text: 'text-amber-500',  border: 'border-amber-500/30',  stroke: 'stroke-amber-500',  badge: 'bg-amber-500 text-white' },
  poor:      { primary: '#FF8C00', bg: 'from-orange-500/20 to-orange-500/5', text: 'text-orange-500', border: 'border-orange-500/30', stroke: 'stroke-orange-500', badge: 'bg-orange-500 text-white' },
  critical:  { primary: '#B25C2C', bg: 'from-red-600/20 to-red-600/5',     text: 'text-red-600',    border: 'border-red-600/30',    stroke: 'stroke-red-600',    badge: 'bg-red-600 text-white' },
};

export function getScientificHealthStatus(ndvi: number): NDVIHealthStatus {
  const pick = (level: NDVIHealthLevel, label: string): NDVIHealthStatus => {
    const c = NDVI_COLORS[level];
    return {
      level,
      label,
      labelKey: `ndvi.health_status.${level}`,
      descriptionKey: `ndvi.health_description.${level}`,
      color: ndviToColor(ndvi),
      bgColor: c.bg,
      borderColor: c.border,
      textColor: c.text,
      strokeColor: c.stroke,
    };
  };
  if (ndvi >= NDVI_THRESHOLDS.EXCELLENT) return pick('excellent', 'Excellent');
  if (ndvi >= NDVI_THRESHOLDS.HEALTHY)   return pick('healthy',   'Healthy');
  if (ndvi >= NDVI_THRESHOLDS.MODERATE)  return pick('moderate',  'Moderate');
  if (ndvi >= NDVI_THRESHOLDS.POOR)      return pick('poor',      'Poor');
  return pick('critical', 'Critical');
}

/**
 * Risk level from current NDVI + trend per day.
 * Trend is in ΔNDVI/day units.
 */
export function getScientificRiskLevel(ndvi: number, trendPerDay: number): 'low' | 'medium' | 'high' | 'critical' {
  if (ndvi < NDVI_THRESHOLDS.POOR || (ndvi < NDVI_THRESHOLDS.MODERATE && trendPerDay < -0.005)) return 'critical';
  if (ndvi < NDVI_THRESHOLDS.MODERATE || (ndvi < NDVI_THRESHOLDS.HEALTHY && trendPerDay < -0.003)) return 'high';
  if (ndvi < NDVI_THRESHOLDS.HEALTHY || trendPerDay < -0.001) return 'medium';
  return 'low';
}

export function formatNDVI(ndvi: number, decimals: number = 2): string {
  return ndvi.toFixed(decimals);
}

export function getTrendDirection(trendPerDay: number): 'improving' | 'declining' | 'stable' {
  if (trendPerDay > 0.001) return 'improving';
  if (trendPerDay < -0.001) return 'declining';
  return 'stable';
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  RELIABILITY                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ReliabilityInput {
  cloud_coverage?: number | null;
  cloud_cover?: number | null;
  coverage_percentage?: number | null;
  coverage?: number | null;
  quality_score?: number | null;
}

/** Returns true if the observation passes scientific reliability gates. */
export function isObservationReliable(row: ReliabilityInput | null | undefined): boolean {
  if (!row) return false;
  const cloud = row.cloud_coverage ?? row.cloud_cover;
  if (cloud != null && cloud > NDVI_RELIABILITY.MAX_CLOUD_COVERAGE) return false;
  const cov = row.coverage_percentage ?? row.coverage;
  if (cov != null && cov < NDVI_RELIABILITY.MIN_COVERAGE_PERCENT) return false;
  if (row.quality_score != null && row.quality_score < NDVI_RELIABILITY.MIN_QUALITY_SCORE) return false;
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  TREND COMPUTATION (ΔNDVI / day)                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export interface TrendPoint {
  date: string;          // ISO date
  ndvi_value: number;
}

/**
 * Compute trend as ΔNDVI/day via simple linear regression over the last `n`
 * reliable observations. Returns null if fewer than 2 points.
 *
 * Deterministic, no AI. Used for scientific projection + risk levelling.
 */
export function computeTrendPerDay(points: TrendPoint[], n: number = 6): { trend: number; n: number } | null {
  const series = points.slice(0, n);
  if (series.length < 2) return null;
  const t0 = new Date(series[series.length - 1].date).getTime();
  const xs = series.map((p) => (new Date(p.date).getTime() - t0) / 86_400_000); // days since first sample
  const ys = series.map((p) => p.ndvi_value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return { trend: num / den, n: xs.length };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  STAGE-AWARE INTERPRETATION                                                */
/*  Thresholds shift with crop and days-from-sowing.                          */
/* ────────────────────────────────────────────────────────────────────────── */

type CropKey = 'sugarcane' | 'maize' | 'wheat' | 'cotton' | 'rice' | 'generic';

interface StageBand {
  /** Days from sowing/transplant inclusive of start */
  start: number;
  end: number;
  /** Expected healthy NDVI band for this stage */
  healthyMin: number;
  excellentMin: number;
  stageKey: string; // i18n key suffix
}

const STAGE_TABLE: Record<CropKey, StageBand[]> = {
  sugarcane: [
    { start: 0,   end: 45,  healthyMin: 0.20, excellentMin: 0.35, stageKey: 'germination' },
    { start: 45,  end: 120, healthyMin: 0.35, excellentMin: 0.55, stageKey: 'tillering' },
    { start: 120, end: 270, healthyMin: 0.55, excellentMin: 0.75, stageKey: 'grand_growth' },
    { start: 270, end: 365, healthyMin: 0.45, excellentMin: 0.60, stageKey: 'maturation' },
  ],
  maize: [
    { start: 0,   end: 20,  healthyMin: 0.15, excellentMin: 0.30, stageKey: 'emergence' },
    { start: 20,  end: 60,  healthyMin: 0.40, excellentMin: 0.60, stageKey: 'vegetative' },
    { start: 60,  end: 110, healthyMin: 0.60, excellentMin: 0.75, stageKey: 'tasseling' },
    { start: 110, end: 150, healthyMin: 0.40, excellentMin: 0.60, stageKey: 'maturation' },
  ],
  wheat: [
    { start: 0,   end: 30,  healthyMin: 0.20, excellentMin: 0.35, stageKey: 'emergence' },
    { start: 30,  end: 90,  healthyMin: 0.45, excellentMin: 0.65, stageKey: 'tillering' },
    { start: 90,  end: 130, healthyMin: 0.60, excellentMin: 0.75, stageKey: 'heading' },
    { start: 130, end: 160, healthyMin: 0.35, excellentMin: 0.55, stageKey: 'maturation' },
  ],
  cotton: [
    { start: 0,   end: 40,  healthyMin: 0.20, excellentMin: 0.35, stageKey: 'emergence' },
    { start: 40,  end: 100, healthyMin: 0.45, excellentMin: 0.60, stageKey: 'squaring' },
    { start: 100, end: 160, healthyMin: 0.55, excellentMin: 0.70, stageKey: 'flowering' },
    { start: 160, end: 220, healthyMin: 0.35, excellentMin: 0.55, stageKey: 'boll_open' },
  ],
  rice: [
    { start: 0,   end: 30,  healthyMin: 0.25, excellentMin: 0.40, stageKey: 'transplant' },
    { start: 30,  end: 80,  healthyMin: 0.50, excellentMin: 0.70, stageKey: 'tillering' },
    { start: 80,  end: 120, healthyMin: 0.60, excellentMin: 0.75, stageKey: 'panicle' },
    { start: 120, end: 160, healthyMin: 0.35, excellentMin: 0.55, stageKey: 'maturation' },
  ],
  generic: [
    { start: 0,   end: 9999, healthyMin: NDVI_THRESHOLDS.HEALTHY, excellentMin: NDVI_THRESHOLDS.EXCELLENT, stageKey: 'generic' },
  ],
};

export interface StageAwareStatus {
  cropKey: CropKey;
  stageKey: string;
  stageDays: number | null;
  /** verdict relative to the expected band at this stage */
  verdict: 'excellent' | 'healthy' | 'below_expected' | 'critical';
  /** generic (non-stage) status, for the ring */
  generic: NDVIHealthStatus;
}

function normalizeCropKey(crop?: string | null): CropKey {
  if (!crop) return 'generic';
  const c = crop.toLowerCase();
  if (c.includes('sugarcane') || c.includes('गन्ना') || c.includes('ऊस')) return 'sugarcane';
  if (c.includes('maize') || c.includes('corn') || c.includes('मक्का') || c.includes('मका')) return 'maize';
  if (c.includes('wheat') || c.includes('गेहूं') || c.includes('गहू')) return 'wheat';
  if (c.includes('cotton') || c.includes('कपास') || c.includes('कापूस')) return 'cotton';
  if (c.includes('rice') || c.includes('paddy') || c.includes('धान') || c.includes('भात')) return 'rice';
  return 'generic';
}

export function getStageAwareStatus(
  ndvi: number,
  crop?: string | null,
  stageDays?: number | null,
): StageAwareStatus {
  const cropKey = normalizeCropKey(crop);
  const bands = STAGE_TABLE[cropKey];
  const days = stageDays ?? null;
  const band = days != null ? bands.find((b) => days >= b.start && days < b.end) : null;
  const generic = getScientificHealthStatus(ndvi);

  if (!band) {
    return { cropKey, stageKey: 'unknown', stageDays: days, verdict: generic.level === 'critical' ? 'critical' : (generic.level === 'poor' ? 'below_expected' : (generic.level === 'excellent' ? 'excellent' : 'healthy')), generic };
  }
  let verdict: StageAwareStatus['verdict'];
  if (ndvi >= band.excellentMin) verdict = 'excellent';
  else if (ndvi >= band.healthyMin) verdict = 'healthy';
  else if (ndvi >= band.healthyMin * 0.6) verdict = 'below_expected';
  else verdict = 'critical';
  return { cropKey, stageKey: band.stageKey, stageDays: days, verdict, generic };
}

/** Scientific reference text used by the legend and About panel. */
export const NDVI_INTERPRETATION = {
  ranges: [
    { min: 0.65, max: 1.0,  level: 'excellent', label: 'Excellent', descriptionKey: 'ndvi.range.excellent' },
    { min: 0.50, max: 0.65, level: 'healthy',   label: 'Healthy',   descriptionKey: 'ndvi.range.healthy' },
    { min: 0.35, max: 0.50, level: 'moderate',  label: 'Moderate',  descriptionKey: 'ndvi.range.moderate' },
    { min: 0.20, max: 0.35, level: 'poor',      label: 'Poor',      descriptionKey: 'ndvi.range.poor' },
    { min: -1.0, max: 0.20, level: 'critical',  label: 'Critical',  descriptionKey: 'ndvi.range.critical' },
  ],
  sources: [
    'NASA Earth Observations (NEO)',
    'ESA Sentinel-2 L2A Guidelines',
    'ICAR Crop Health Monitoring Standards',
    'FAO Agricultural Remote Sensing',
  ],
};
