import { soilNumber, type SoilRating, type SoilSourceKey } from '@/services/soil/soilReport';

/**
 * Soil readings → farmer-facing meaning. Pure; no thresholds live here.
 * Every low / medium / high verdict comes from a governed soil_test_interpretation
 * row (served by lands-api). A row that is not yet confirmed, or a value whose
 * method does not match the row's lab method, gets no verdict — the value is
 * still shown, never a guessed band.
 */
export type SoilBand = 'low' | 'medium' | 'high';
export type SoilParameter = 'ph' | 'organic_carbon' | 'available_nitrogen' | 'available_phosphorus' | 'available_potassium' | 'electrical_conductivity';

/** Review states under which a rating row may label a farmer's value. */
const CONFIRMED = new Set(['confirmed_convention', 'approved']);

export interface SoilReading {
  parameter: SoilParameter;
  value: number | null;
  /** governed bands for drawing the scale, present only when the verdict may be shown */
  bands: { lowBelow: number; highAbove: number } | null;
  band: SoilBand | null;
  /** why there is no verdict, when there is a value but no band */
  noVerdictReason: 'no_rating' | 'rating_under_review' | 'method_differs' | null;
  rating: SoilRating | null;
}

/**
 * Satellite (soil-map) values are not the lab's extraction: soil-map carbon is
 * total organic carbon, the lab band is Walkley-Black; soil maps give no
 * plant-available N, P, K. So bands never label a satellite value.
 */
function methodMatches(parameter: SoilParameter, kind: SoilSourceKey): boolean {
  if (kind !== 'satellite') return true;
  return parameter === 'ph';
}

export function readSoil(parameter: SoilParameter, rawValue: unknown, ratings: SoilRating[] | null | undefined, kind: SoilSourceKey): SoilReading {
  const value = soilNumber(rawValue);
  const rating = (ratings || []).find((r) => r.parameter === parameter) ?? null;
  const empty: SoilReading = { parameter, value, bands: null, band: null, noVerdictReason: null, rating };
  if (value === null) return empty;
  if (!rating) return { ...empty, noVerdictReason: 'no_rating' };
  if (!CONFIRMED.has(String(rating.review_status))) return { ...empty, noVerdictReason: 'rating_under_review' };
  if (!methodMatches(parameter, kind)) return { ...empty, noVerdictReason: 'method_differs' };
  const lowBelow = soilNumber(rating.low_below);
  const highAbove = soilNumber(rating.high_above) ?? soilNumber(rating.medium_high);
  if (lowBelow === null || highAbove === null) return { ...empty, noVerdictReason: 'no_rating' };
  const band: SoilBand = value < lowBelow ? 'low' : value > highAbove ? 'high' : 'medium';
  return { parameter, value, bands: { lowBelow, highAbove }, band, noVerdictReason: null, rating };
}

/** Where a pH sits against chemistry's neutral point 7 — a fact, not an agronomic band. */
export function phSide(ph: number | null): 'below' | 'at' | 'above' | null {
  if (ph === null) return null;
  const rounded = Math.round(ph * 10) / 10;
  return rounded < 7 ? 'below' : rounded > 7 ? 'above' : 'at';
}

/** Sand / silt / clay as shares of their own total (sources do not always sum to exactly 100). */
export function textureShares(sand: unknown, silt: unknown, clay: unknown): { sand: number; silt: number; clay: number } | null {
  const s = soilNumber(sand), si = soilNumber(silt), c = soilNumber(clay);
  if (s === null || si === null || c === null) return null;
  const total = s + si + c;
  if (total <= 0) return null;
  return { sand: (s / total) * 100, silt: (si / total) * 100, clay: (c / total) * 100 };
}

/** Position of a value on a scale [min, max] as 0–100, clamped. */
export function scalePosition(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}
