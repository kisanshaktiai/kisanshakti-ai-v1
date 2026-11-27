/**
 * Field drawing geometry (Living Farm home).
 *
 * Pure functions: a land's saved boundary (lands.boundary_polygon_old, a GeoJSON
 * Polygon in [lng, lat]) becomes a tilted block that is drawn as inline SVG.
 * Nothing here reads the network and nothing here decides agronomy.
 */

export interface Pt { x: number; y: number }

export const SCENE_W = 390;
export const SCENE_H = 330;
const SLAB_DEPTH = 42;

/** Outer ring of a GeoJSON Polygon, without the closing point. Null when there is no usable ring. */
export function ringFromBoundary(boundary: unknown): Array<[number, number]> | null {
  const coords = (boundary as { coordinates?: unknown } | null | undefined)?.coordinates;
  const ring = Array.isArray(coords) ? coords[0] : null;
  if (!Array.isArray(ring)) return null;
  const pts = ring
    .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
  if (pts.length > 1) {
    const [fx, fy] = pts[0];
    const [lx, ly] = pts[pts.length - 1];
    if (fx === lx && fy === ly) pts.pop();
  }
  return pts.length >= 3 ? pts : null;
}

/** Ring in a 0..1 square, north up, true shape kept (longitude scaled by the latitude). */
export function normaliseRing(ring: Array<[number, number]>): Pt[] {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) || 1;
  const xs = ring.map((p) => p[0] * kx);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const offX = (1 - (maxX - minX) / span) / 2;
  const offY = (1 - (maxY - minY) / span) / 2;
  return ring.map((p, i) => ({ x: offX + (xs[i] - minX) / span, y: offY + (maxY - ys[i]) / span }));
}

/** A plain square plot, used when a land has no saved boundary. */
export const DEFAULT_RING: Pt[] = [{ x: 0.12, y: 0.12 }, { x: 0.88, y: 0.12 }, { x: 0.88, y: 0.88 }, { x: 0.12, y: 0.88 }];

export function project(p: Pt, dz = 0): Pt {
  return { x: SCENE_W / 2 + (p.x - 0.5) * 318 + (0.5 - p.y) * 52, y: 214 + (p.y - 0.5) * 150 + dz };
}

export function insideRing(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const f = (n: number) => n.toFixed(1);
const poly = (pts: Pt[]) => pts.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');

export interface SlabSide { soil: string; water: string | null; waterLine: [Pt, Pt] | null; facingLeft: boolean }
export interface Slab {
  top: string;
  sides: SlabSide[];
  rows: Array<[Pt, Pt]>;
  plants: Pt[];
  /** screen points on the field where pins stand, most central first */
  anchors: Pt[];
  /** screen point at the lowest corner of the block, for the moisture label */
  lowest: Pt;
}

/**
 * @param waterFraction share of the soil edge drawn as the water band (0..1), or null for no band
 */
export function buildSlab(ring: Pt[], waterFraction: number | null): Slab {
  const P = ring.map((p) => project(p));
  const edges = P.map((a, i) => ({ a, b: P[(i + 1) % P.length] })).sort((e1, e2) => e1.a.y + e1.b.y - (e2.a.y + e2.b.y));
  const sides: SlabSide[] = edges.map(({ a, b }) => {
    const quad = (d1: number, d2: number) => poly([{ x: a.x, y: a.y + d1 }, { x: b.x, y: b.y + d1 }, { x: b.x, y: b.y + d2 }, { x: a.x, y: a.y + d2 }]);
    const top = waterFraction == null ? null : SLAB_DEPTH * (1 - Math.max(0, Math.min(1, waterFraction)));
    return {
      soil: quad(0, SLAB_DEPTH),
      water: top == null ? null : quad(top, SLAB_DEPTH),
      waterLine: top == null ? null : [{ x: a.x, y: a.y + top }, { x: b.x, y: b.y + top }],
      facingLeft: b.x < a.x,
    };
  });

  const rows: Array<[Pt, Pt]> = [];
  const plants: Pt[] = [];
  for (let y = 0.06; y < 1; y += 0.105) {
    rows.push([project({ x: -0.1, y }), project({ x: 1.1, y })]);
    for (let x = 0.04; x < 1; x += 0.066) {
      const py = y + 0.05;
      if (insideRing(ring, x, py) && insideRing(ring, x + 0.02, py) && insideRing(ring, x - 0.02, py)) plants.push(project({ x, y: py }));
    }
  }
  plants.sort((p1, p2) => p1.y - p2.y);

  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
  const candidates: Pt[] = [
    { x: cx - 0.17, y: cy - 0.1 }, { x: cx + 0.2, y: cy + 0.14 }, { x: cx, y: cy },
  ].filter((p) => insideRing(ring, p.x, p.y));
  const anchors = (candidates.length ? candidates : [{ x: cx, y: cy }]).map((p) => project(p));

  const lowest = P.reduce((m, p) => (p.y > m.y ? p : m), P[0]);
  return { top: poly(P), sides, rows, plants, anchors, lowest: { x: lowest.x, y: lowest.y + SLAB_DEPTH } };
}

/** Where the sun is on its path: 0 at sunrise, 1 at sunset, null before sunrise, after sunset or when the times are unknown. */
export function sunProgress(nowMs: number, sunrise: number | null | undefined, sunset: number | null | undefined): number | null {
  const ms = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v < 1e12 ? v * 1000 : v);
  const up = ms(sunrise), down = ms(sunset);
  if (up == null || down == null || down <= up) return null;
  const t = (nowMs - up) / (down - up);
  return t < 0 || t > 1 ? null : t;
}

/** Point on the drawn sun path for a progress value. */
export function sunPoint(t: number): Pt {
  const u = 1 - t;
  return { x: u * u * 24 + 2 * u * t * 195 + t * t * 366, y: u * u * 120 + 2 * u * t * -60 + t * t * 120 };
}
