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

/**
 * Pure display palette. Values are presentation anchors, not agronomic bands.
 *
 * These are the colours the NDVI pipeline paints into the field picture
 * (raster_io.NDVI_STOPS, declared there as a verbatim copy of this list). A
 * legend drawn from any other colours does not describe the picture, so this
 * list must stay identical to the pipeline's. They are picture colours, not
 * theme colours: a tenant theme must not change them.
 */
export const NDVI_COLOR_STOPS: Array<{ value: number; hex: string }> = [
  { value: -0.2, hex: '#7C3F1C' },
  { value: 0, hex: '#B25C2C' },
  { value: 0.1, hex: '#D9B26E' },
  { value: 0.2, hex: '#E8C170' },
  { value: 0.35, hex: '#FFD166' },
  { value: 0.5, hex: '#C7E27A' },
  { value: 0.65, hex: '#5DBB63' },
  { value: 0.8, hex: '#2E8B3D' },
  { value: 1, hex: '#1B5E20' },
];

/**
 * The three classes of the zone picture, exactly as the pipeline paints them
 * (raster_io.ZONE_COLOURS: lower / normal / higher than this field's own median).
 */
export const ZONE_CLASS_COLOURS = {
  lower: 'rgb(192, 57, 43)',
  normal: 'rgb(244, 208, 63)',
  higher: 'rgb(39, 174, 96)',
} as const;

/** A left-to-right CSS gradient across a list of colour stops, spaced by their values. */
export function colourRampCss(stops: Array<{ value: number; hex: string }>): string | null {
  if (!stops || stops.length < 2) return null;
  const lo = stops[0].value, hi = stops[stops.length - 1].value;
  if (!(hi > lo)) return null;
  return `linear-gradient(to right, ${stops.map((s) => `${s.hex} ${(((s.value - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;
}

export const NDVI_GRADIENT_CSS = colourRampCss(NDVI_COLOR_STOPS) ?? '';

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
  const v = Math.max(NDVI_COLOR_STOPS[0].value, Math.min(1, Number.isFinite(ndvi) ? ndvi : 0));
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
