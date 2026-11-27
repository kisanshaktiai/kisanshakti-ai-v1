import { describe, it, expect } from 'vitest';
import { buildSlab, DEFAULT_RING, insideRing, normaliseRing, ringFromBoundary, SCENE_H, SCENE_W, sunProgress } from './fieldGeometry';

const square = { type: 'Polygon', coordinates: [[[74.1, 16.8], [74.102, 16.8], [74.102, 16.802], [74.1, 16.802], [74.1, 16.8]]] };

describe('fieldGeometry', () => {
  it('reads the outer ring of a GeoJSON polygon and drops the closing point', () => {
    expect(ringFromBoundary(square)).toHaveLength(4);
  });

  it('returns null for a missing or broken boundary', () => {
    expect(ringFromBoundary(null)).toBeNull();
    expect(ringFromBoundary({ coordinates: [[[1, 2], [3, 4]]] })).toBeNull();
    expect(ringFromBoundary({ coordinates: 'x' })).toBeNull();
  });

  it('normalises any ring into the unit square with north up', () => {
    const ring = normaliseRing(ringFromBoundary(square)!);
    ring.forEach((p) => { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1); });
    // the first point is the south-west corner, so it sits low (large y) and left (small x)
    expect(ring[0].y).toBeGreaterThan(ring[2].y);
    expect(ring[0].x).toBeLessThan(ring[2].x);
  });

  it('keeps the whole block inside the scene for a long thin field', () => {
    const thin = normaliseRing([[74.1, 16.8], [74.11, 16.8], [74.11, 16.8005], [74.1, 16.8005]]);
    const slab = buildSlab(thin, 0.3);
    const nums = slab.top.split(/[ ,]/).map(Number);
    for (let i = 0; i < nums.length; i += 2) { expect(nums[i]).toBeGreaterThanOrEqual(0); expect(nums[i]).toBeLessThanOrEqual(SCENE_W); expect(nums[i + 1]).toBeLessThanOrEqual(SCENE_H); }
  });

  it('draws no water band when the water state is unknown', () => {
    const slab = buildSlab(DEFAULT_RING, null);
    expect(slab.sides.every((s) => s.water === null && s.waterLine === null)).toBe(true);
    expect(buildSlab(DEFAULT_RING, 0.3).sides.every((s) => s.water !== null)).toBe(true);
  });

  it('places pins and plants inside the field', () => {
    const slab = buildSlab(DEFAULT_RING, null);
    expect(slab.anchors.length).toBeGreaterThan(0);
    expect(slab.plants.length).toBeGreaterThan(10);
    expect(insideRing(DEFAULT_RING, 0.5, 0.5)).toBe(true);
    expect(insideRing(DEFAULT_RING, 0.01, 0.01)).toBe(false);
  });

  it('gives the sun position only between sunrise and sunset, in seconds or milliseconds', () => {
    const rise = 1_700_000_000, set = rise + 12 * 3600;
    expect(sunProgress((rise + 6 * 3600) * 1000, rise, set)).toBeCloseTo(0.5, 5);
    expect(sunProgress((rise + 6 * 3600) * 1000, rise * 1000, set * 1000)).toBeCloseTo(0.5, 5);
    expect(sunProgress((rise - 60) * 1000, rise, set)).toBeNull();
    expect(sunProgress((set + 60) * 1000, rise, set)).toBeNull();
    expect(sunProgress(Date.now(), null, undefined)).toBeNull();
  });
});
