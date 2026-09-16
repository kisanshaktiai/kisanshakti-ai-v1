/**
 * NDVI presentation/evidence compatibility layer.
 *
 * IMPORTANT: this module intentionally contains NO agronomic thresholds,
 * crop/stage tables, risk logic, treatment logic, or trend inference.
 * Agronomic interpretation is owned by the server-side Decision Brain/SSOT.
 *
 * Kept under the historical filename temporarily so older presentation
 * imports remain source-compatible while all intelligence is removed.
 */

export type NDVIHealthLevel = 'observed';

export interface NDVIHealthStatus {
  level: NDVIHealthLevel;
  label: string;
  labelKey: string;
  descriptionKey: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  strokeColor: string;
}

/** Pure display palette. Values are presentation anchors, not agronomic bands. */
export const NDVI_COLOR_STOPS: Array<{ value: number; hex: string }> = [
  { value: -1, hex: '#6B7280' },
  { value: -0.5, hex: '#9CA3AF' },
  { value: 0, hex: '#D1D5DB' },
  { value: 0.5, hex: '#86EFAC' },
  { value: 1, hex: '#166534' },
];

export const NDVI_GRADIENT_CSS = `linear-gradient(to top, ${NDVI_COLOR_STOPS
  .map((s) => `${s.hex} ${((s.value + 1) / 2) * 100}%`)
  .join(', ')})`;

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

export function ndviToColor(ndvi: number): string {
  const v = Math.max(-1, Math.min(1, Number.isFinite(ndvi) ? ndvi : 0));
  for (let i = 0; i < NDVI_COLOR_STOPS.length - 1; i++) {
    const a = NDVI_COLOR_STOPS[i];
    const b = NDVI_COLOR_STOPS[i + 1];
    if (v >= a.value && v <= b.value) {
      return lerpHex(a.hex, b.hex, (v - a.value) / (b.value - a.value));
    }
  }
  return NDVI_COLOR_STOPS[NDVI_COLOR_STOPS.length - 1].hex;
}

/** Neutral compatibility response: no agronomic interpretation is derived. */
export function getScientificHealthStatus(_ndvi: number): NDVIHealthStatus {
  return {
    level: 'observed',
    label: 'Observed',
    labelKey: 'ndvi.observed',
    descriptionKey: 'ndvi.observed_description',
    color: ndviToColor(_ndvi),
    bgColor: 'from-muted/20 to-muted/5',
    borderColor: 'border-border/40',
    textColor: 'text-foreground',
    strokeColor: 'stroke-foreground',
  };
}

/** Evidence freshness only; all decision-grade semantics come from the DB view. */
export interface ReliabilityInput {
  is_fresh?: boolean | null;
  measurement_status?: string | null;
}

export function isObservationReliable(row: ReliabilityInput | null | undefined): boolean {
  return !!row && row.is_fresh === true && row.measurement_status !== 'INSUFFICIENT_SPATIAL_SUPPORT';
}

export function formatNDVI(ndvi: number, decimals = 2): string {
  return Number.isFinite(ndvi) ? ndvi.toFixed(decimals) : '—';
}

/** Visual-only interpretation bands for a legend; not health/status bands. */
export const NDVI_INTERPRETATION = {
  ranges: [
    { min: -1, max: -0.5, level: 'low', label: 'Low signal', descriptionKey: 'ndvi.range.low_signal' },
    { min: -0.5, max: 0, level: 'lower', label: 'Lower signal', descriptionKey: 'ndvi.range.lower_signal' },
    { min: 0, max: 0.5, level: 'mid', label: 'Mid signal', descriptionKey: 'ndvi.range.mid_signal' },
    { min: 0.5, max: 1, level: 'high', label: 'Higher signal', descriptionKey: 'ndvi.range.high_signal' },
  ],
} as const;

/** Compatibility export for any presentation code that only needs UI colors. */
export const NDVI_COLORS = {
  observed: {
    primary: '#166534',
    bg: 'from-muted/20 to-muted/5',
    text: 'text-foreground',
    border: 'border-border/40',
    stroke: 'stroke-foreground',
    badge: 'bg-muted text-foreground',
  },
} as const;
