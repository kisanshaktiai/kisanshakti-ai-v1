/**
 * Agronomic formula constants & helpers.
 * Values reflect commonly-used Indian agronomy references; they're applied to
 * REAL per-land data (NDVI, soil, weather, schedules) — they are NOT mock
 * outputs. Anything that can come from the DB does come from the DB; these
 * constants only fill agronomic conversion factors.
 */

export const ACRE_TO_HA = 0.404686;
export const HA_TO_ACRE = 1 / ACRE_TO_HA;
export const QUINTAL_TO_KG = 100;

/** Daily crop ETc baseline (litres / acre / day) by crop family. */
export const DAILY_WATER_L_PER_ACRE: Record<string, number> = {
  rice: 12000,
  paddy: 12000,
  sugarcane: 9000,
  cotton: 6500,
  wheat: 5000,
  maize: 5500,
  soybean: 4500,
  tomato: 6000,
  onion: 5500,
  potato: 6000,
  groundnut: 5000,
  default: 5500,
};

/** Expected yield (quintal/acre) when crop_schedules has no value. */
export const EXPECTED_YIELD_Q_PER_ACRE: Record<string, number> = {
  rice: 22,
  paddy: 22,
  sugarcane: 320, // ~32 t/acre
  cotton: 8,
  wheat: 18,
  maize: 25,
  soybean: 10,
  tomato: 180,
  onion: 140,
  potato: 110,
  groundnut: 9,
  default: 15,
};

/** Soil nutrient classification thresholds (kg/ha). */
export const SOIL_NUTRIENT_BANDS = {
  N: { low: 280, high: 560 },
  P: { low: 11, high: 22 },
  K: { low: 110, high: 280 },
};

export function cropKey(crop?: string | null): string {
  if (!crop) return 'default';
  const k = crop.toLowerCase().trim();
  return DAILY_WATER_L_PER_ACRE[k] ? k : 'default';
}

export function nutrientLevel(value: number | null | undefined, nutrient: 'N' | 'P' | 'K'): 'low' | 'medium' | 'high' | 'unknown' {
  if (value == null || Number.isNaN(value)) return 'unknown';
  const band = SOIL_NUTRIENT_BANDS[nutrient];
  if (value < band.low) return 'low';
  if (value > band.high) return 'high';
  return 'medium';
}

export function formatINR(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
}
