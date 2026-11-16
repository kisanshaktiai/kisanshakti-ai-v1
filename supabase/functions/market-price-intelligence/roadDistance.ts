// CHANGE LOG (newest first)
// 2026-11-11 — New. Driving distance/time from the farmer's land to market towns via the
//   project's existing GOOGLE_MAPS_API_KEY (Routes computeRouteMatrix). Bounded (25 markets
//   per call), cached per rounded land point + market, falls back to straight-line on failure.
// deno-lint-ignore-file no-explicit-any

export interface Road { km: number; min: number }
const cache = new Map<string, { at: number; v: Road | null }>();
const TTL = 24 * 60 * 60 * 1000;
export const MAX_DESTINATIONS = 25;

/** Parse Routes duration strings such as "1234.5s" to minutes. */
export function durationMinutes(d: unknown): number | null {
  const m = String(d ?? '').match(/^([\d.]+)s$/);
  return m ? Math.round(Number(m[1]) / 60) : null;
}

/** Rebuild matrix cells by destination index (omitted index = 0); failed cells stay unavailable. */
export function parseMatrix(cells: any[], count: number): (Road | null)[] {
  const out: (Road | null)[] = new Array(count).fill(null);
  for (const c of cells || []) {
    const i = Number(c?.destinationIndex ?? 0);
    if (!(i >= 0 && i < count)) continue;
    if (c?.condition !== 'ROUTE_EXISTS' || (c?.status && c.status.code)) continue;
    const min = durationMinutes(c.duration);
    if (min === null) continue;
    out[i] = { km: Math.round(Number(c.distanceMeters ?? 0) / 1000), min };
  }
  return out;
}

export async function roadDistances(
  origin: { lat: number; lon: number },
  dests: { key: string; lat: number; lon: number }[],
): Promise<Map<string, Road>> {
  const out = new Map<string, Road>();
  const key = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get('GOOGLE_MAPS_API_KEY');
  const ok = `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}`;
  const todo: typeof dests = [];
  for (const d of dests.slice(0, MAX_DESTINATIONS)) {
    const c = cache.get(`${ok}|${d.key}`);
    if (c && Date.now() - c.at < TTL) { if (c.v) out.set(d.key, c.v); } else todo.push(d);
  }
  if (!key || todo.length === 0) return out;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } } }],
        destinations: todo.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lon } } } })),
        travelMode: 'DRIVE',
      }),
    });
    clearTimeout(t);
    if (!res.ok) { console.warn(`[roadDistance] ${res.status}: ${(await res.text()).slice(0, 300)}`); return out; }
    const cells = parseMatrix(await res.json(), todo.length);
    todo.forEach((d, i) => {
      cache.set(`${ok}|${d.key}`, { at: Date.now(), v: cells[i] });
      if (cells[i]) out.set(d.key, cells[i]!);
    });
  } catch (e) { console.warn('[roadDistance] failed', (e as Error).message); }
  return out;
}
