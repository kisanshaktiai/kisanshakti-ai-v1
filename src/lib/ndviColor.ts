/**
 * Continuous NDVI colour ramp (red → yellow → green) built only from tenant
 * semantic tokens. No hex / raw tailwind palette colours, so tenant theming
 * keeps working.
 *
 * Low NDVI  (weak crop)    -> destructive (red)
 * Mid NDVI                 -> warning (yellow/amber)
 * High NDVI (healthy crop) -> success (green)
 */

export const NDVI_RED_AT = 0.2;
export const NDVI_GREEN_AT = 0.65;

export type NdviRiskBand = 'critical' | 'high' | 'attention' | 'moderate' | 'low';

export interface NdviTone {
  /** Full-strength ramp colour (rail, dots, progress bars). */
  color: string;
  /** Card background wash. */
  surface: string;
  /** Slightly stronger wash for inner panels / icon bubbles. */
  softSurface: string;
  /** Border colour. */
  border: string;
  /** Equivalent coarse band, for components that still think in bands. */
  band: NdviRiskBand;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 0 = fully red, 0.5 = yellow, 1 = fully green. */
export function ndviRatio(ndvi: number): number {
  return clamp01((ndvi - NDVI_RED_AT) / (NDVI_GREEN_AT - NDVI_RED_AT));
}

export function ndviRampColor(ndvi: number): string {
  const t = ndviRatio(ndvi);
  if (t <= 0.5) {
    const p = Math.round((t / 0.5) * 100);
    return `color-mix(in oklab, hsl(var(--warning)) ${p}%, hsl(var(--destructive)))`;
  }
  const p = Math.round(((t - 0.5) / 0.5) * 100);
  return `color-mix(in oklab, hsl(var(--success)) ${p}%, hsl(var(--warning)))`;
}

export function ndviBand(ndvi: number): NdviRiskBand {
  if (ndvi < 0.25) return 'critical';
  if (ndvi < 0.35) return 'high';
  if (ndvi < 0.5) return 'attention';
  if (ndvi < 0.6) return 'moderate';
  return 'low';
}

export function ndviTone(ndvi: number): NdviTone {
  const color = ndviRampColor(ndvi);
  return {
    color,
    surface: `color-mix(in oklab, ${color} 12%, hsl(var(--card)))`,
    softSurface: `color-mix(in oklab, ${color} 22%, hsl(var(--card)))`,
    border: `color-mix(in oklab, ${color} 45%, hsl(var(--border)))`,
    band: ndviBand(ndvi),
  };
}

/** Formats the reading shown next to the colour, e.g. "0.42". */
export function formatNdviValue(ndvi: number): string {
  return ndvi.toFixed(2);
}
