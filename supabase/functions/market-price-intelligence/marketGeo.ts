// CHANGE LOG (newest first)
// 2026-11-11 — Markets resolve to their own town (district-scoped village / taluka seat) before
//   taluka centroids; GeoPoint.via flags precision.
// 2026-11-10 — New. Data-driven market gazetteer: market names in market_prices are resolved to
//   coordinates from the DB location tables (villages → taluka centroids, districts.name_mr),
//   using a script-agnostic consonant skeleton. No hand-coded market coordinates.
// deno-lint-ignore-file no-explicit-any

const DEV: Record<string, string> = {
  'क':'k','ख':'k','ग':'g','घ':'g','ङ':'n','च':'c','छ':'c','ज':'j','झ':'j','ञ':'n',
  'ट':'t','ठ':'t','ड':'d','ढ':'d','ण':'n','त':'t','थ':'t','द':'d','ध':'d','न':'n',
  'प':'p','फ':'p','ब':'b','भ':'b','म':'m','य':'y','र':'r','ल':'l','ळ':'l','व':'v',
  'श':'s','ष':'s','स':'s','ह':'','ऋ':'r','ृ':'r',
};
const LABIAL = new Set(['प','फ','ब','भ','म']);

/** Consonant skeleton shared by Devanagari and Latin spellings of a place name. */
export function skeleton(input: string): string {
  const s = (input || '').normalize('NFC').trim();
  let out = '';
  if (/[\u0900-\u097F]/.test(s)) {
    const chars = [...s];
    chars.forEach((ch, i) => {
      if (ch === 'ं' || ch === 'ँ') out += LABIAL.has(chars[i + 1]) ? 'm' : 'n';
      else if (DEV[ch] !== undefined) out += DEV[ch];
    });
  } else {
    out = s.toLowerCase().replace(/gaon\b/g, 'gav').replace(/aon\b/g, 'av')
      .replace(/ch/g, 'c').replace(/sh/g, 's').replace(/ph/g, 'p')
      .replace(/f/g, 'p').replace(/w/g, 'v').replace(/z/g, 'j').replace(/x/g, 'ks').replace(/q/g, 'k')
      .replace(/h/g, '').replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
  }
  return out.replace(/(.)\1+/g, '$1') + finalVowel(s);
}

const DEV_FINAL: Record<string, string> = {
  'ा':'a','आ':'a','ि':'i','ी':'i','इ':'i','ई':'i','ु':'u','ू':'u','उ':'u','ऊ':'u',
  'े':'e','ए':'e','ै':'i','ो':'o','ओ':'o','ौ':'u',
};
/** Final vowel class: separates names with one consonant frame (e.g. "-li" vs "-la"). */
function finalVowel(s: string): string {
  const t = s.replace(/[^\u0900-\u097Fa-zA-Z]+$/, '');
  if (/[\u0900-\u097F]/.test(t)) return DEV_FINAL[[...t].pop() || ''] ? ':' + DEV_FINAL[[...t].pop()!] : '';
  const m = t.toLowerCase().match(/(ee|oo|[aeiouy])$/);
  if (!m) return '';
  const v = m[1] === 'ee' || m[1] === 'y' ? 'i' : m[1] === 'oo' ? 'u' : m[1];
  return ':' + v;
}

export interface GeoPoint { lat: number; lon: number; district?: string; via: string }
interface Gazetteer { scoped: Map<string, GeoPoint | null>; taluka: Map<string, GeoPoint | null>; village: Map<string, GeoPoint | null>; district: Map<string, GeoPoint>; districtMr: Map<string, GeoPoint> }

let cache: { at: number; g: Gazetteer } | null = null;
const TTL = 6 * 60 * 60 * 1000;
const resolved = new Map<string, GeoPoint | null>();

function putUnique(m: Map<string, GeoPoint | null>, k: string, v: GeoPoint) {
  if (!k || k.length < 2) return;
  m.set(k, m.has(k) ? null : v); // null = ambiguous, never guessed
}

async function pageAll(db: any, table: string, cols: string, filter: (q: any) => any, max = 60000): Promise<any[]> {
  const size = 1000;
  const first = await filter(db.from(table).select(cols, { count: 'exact' })).range(0, size - 1);
  if (first.error) throw first.error;
  const total = Math.min(first.count ?? 0, max);
  const rows = [...(first.data || [])];
  const pages: Promise<any>[] = [];
  for (let from = size; from < total; from += size) pages.push(filter(db.from(table).select(cols)).range(from, from + size - 1));
  for (const r of await Promise.all(pages)) { if (r.error) throw r.error; rows.push(...(r.data || [])); }
  return rows;
}

async function load(db: any, stateName: string): Promise<Gazetteer> {
  if (cache && Date.now() - cache.at < TTL) return cache.g;
  const { data: states } = await db.from('states').select('id').ilike('name', stateName);
  const stateIds = (states || []).map((s: any) => s.id);
  const { data: dists } = await db.from('districts').select('id,name,name_mr').in('state_id', stateIds);
  const distById = new Map((dists || []).map((d: any) => [d.id, d]));
  const talukas = await pageAll(db, 'talukas', 'id,name,district_id', (q) => q.in('district_id', [...distById.keys()]));
  const talById = new Map(talukas.map((t: any) => [t.id, t]));
  // Chunk the taluka ids (one id list would overflow the URL; a join filter times out).
  const tIds = [...talById.keys()];
  const chunks: string[][] = [];
  for (let k = 0; k < tIds.length; k += 30) chunks.push(tIds.slice(k, k + 30));
  const villages: any[] = [];
  for (let k = 0; k < chunks.length; k += 4) {
    const res = await Promise.all(chunks.slice(k, k + 4).map((c) => pageAll(db, 'villages', 'name,taluka_id,center_lat,center_lon',
      (q) => q.in('taluka_id', c).not('center_lat', 'is', null).order('taluka_id').order('id'))));
    for (const r of res) villages.push(...r);
  }

  const tSum = new Map<string, { lat: number; lon: number; n: number }>();
  const seat = new Map<string, GeoPoint>();
  const hq = new Map<string, GeoPoint>();
  const g: Gazetteer = { scoped: new Map(), taluka: new Map(), village: new Map(), district: new Map(), districtMr: new Map() };
  for (const v of villages) {
    const lat = Number(v.center_lat), lon = Number(v.center_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const acc = tSum.get(v.taluka_id) || { lat: 0, lon: 0, n: 0 };
    acc.lat += lat; acc.lon += lon; acc.n++; tSum.set(v.taluka_id, acc);
    const t: any = talById.get(v.taluka_id); const d: any = t && distById.get(t.district_id);
    const vp = { lat, lon, district: d?.name, via: 'village' };
    putUnique(g.village, skeleton(v.name), vp);
    if (d) putUnique(g.scoped, `${skeleton(d.name)}|${skeleton(v.name)}`, vp);
    if (t && skeleton(v.name) === skeleton(t.name) && !seat.has(v.taluka_id)) seat.set(v.taluka_id, vp);
    if (d && skeleton(v.name) === skeleton(d.name) && !hq.has(d.id)) hq.set(d.id, vp);
  }
  const dSum = new Map<string, { lat: number; lon: number; n: number }>();
  for (const [tid, a] of tSum) {
    const t: any = talById.get(tid); const d: any = distById.get(t.district_id);
    const p = { lat: a.lat / a.n, lon: a.lon / a.n, district: d?.name, via: 'taluka' };
    // The taluka's own seat town is where its market sits; the centroid is only a fallback.
    putUnique(g.taluka, skeleton(t.name), seat.get(tid) || p);
    const ds = dSum.get(t.district_id) || { lat: 0, lon: 0, n: 0 };
    ds.lat += p.lat; ds.lon += p.lon; ds.n++; dSum.set(t.district_id, ds);
  }
  for (const [did, a] of dSum) {
    const d: any = distById.get(did);
    const p = hq.get(did) ? { ...hq.get(did)!, via: 'district-hq' } : { lat: a.lat / a.n, lon: a.lon / a.n, district: d.name, via: 'district' };
    g.district.set(skeleton(d.name), p);
    if (d.name_mr) g.districtMr.set(String(d.name_mr).trim(), p);
  }
  cache = { at: Date.now(), g };
  resolved.clear();
  return g;
}

/** Name parts, most specific first: "जुन्नर -ओतूर" → ["ओतूर","जुन्नर"]. */
function parts(name: string): string[] {
  const p = name.split(/[-–()/,.]+/).map((x) => x.trim()).filter(Boolean);
  return [...p.slice(1).reverse(), p[0]].filter(Boolean);
}

export async function resolveMarkets(db: any, names: string[], stateName = 'Maharashtra', districts: Map<string, string> = new Map()): Promise<Map<string, GeoPoint | null>> {
  const g = await load(db, stateName);
  const out = new Map<string, GeoPoint | null>();
  for (const name of names) {
    if (!name) continue;
    if (resolved.has(name)) { out.set(name, resolved.get(name)!); continue; }
    let hit: GeoPoint | null = null;
    const ps = parts(name);
    const dk = skeleton(districts.get(name) || '');
    // The market town itself, inside the market's own district.
    if (dk) for (const p of [...ps].reverse()) { hit = g.scoped.get(`${dk}|${skeleton(p)}`) || null; if (hit) break; }
    // Prefer the market's own town (taluka seat), then the district, then a unique village name.
    if (!hit) for (const p of [...ps].reverse()) { const k = skeleton(p); const t = g.taluka.get(k) || null; if (t && (!dk || !t.district || skeleton(t.district) === dk)) { hit = t; break; } }
    if (!hit) for (const p of [...ps].reverse()) {
      hit = g.districtMr.get(p) || g.district.get(skeleton(p)) || null;
      if (!hit) for (const [mr, pt] of g.districtMr) if (mr.startsWith(p) || p.startsWith(mr)) { hit = pt; break; }
      if (hit) break;
    }
    if (!hit) for (const p of ps) { const k = skeleton(p); hit = g.village.get(k) || null; if (hit) break; }
    resolved.set(name, hit); out.set(name, hit);
  }
  return out;
}
