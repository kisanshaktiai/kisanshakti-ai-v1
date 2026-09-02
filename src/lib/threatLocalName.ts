import { supabase } from '@/integrations/supabase/client';

/**
 * DB-backed local (vernacular) names for pest / disease threats shown on
 * variety-resistance chips.
 *
 * SSOT:
 *   - public.pest_master        (pest_name_en / pest_name_hi / pest_name_mr)
 *   - public.disease_risk_model (disease_name_en / disease_name_hi / disease_name_mr)
 *
 * HARD RULE: never invent a translation. When no DB row matches the threat,
 * the cleaned English name is displayed as-is.
 */

export interface ThreatDisplayName {
  /** Text to render on the chip (local name when known, else cleaned English). */
  label: string;
  /** Scientific/binomial part extracted from the raw threat name, if any. */
  scientific: string | null;
  /** True when `label` came from a DB local-name column. */
  localized: boolean;
}

type NameRow = { en: string; hi: string | null; mr: string | null };

let cache: Map<string, NameRow> | null = null;
let inflight: Promise<Map<string, NameRow>> | null = null;

/** Matching key only — never rendered. */
export function normalizeThreatKey(raw: string): string {
  return stripScientific(raw)
    .toLowerCase()
    .replace(/^(mr|ms|r|s)\s+to\s+/i, '')
    .replace(/^(resistant|tolerant|susceptible)\s+to\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Removes "(Magnaporthe oryzae)"-style parentheticals from a display name. */
function stripScientific(raw: string): string {
  return (raw || '').replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function extractScientific(raw: string): string | null {
  const matches = (raw || '').match(/\(([^)]*)\)/g);
  if (!matches || matches.length === 0) return null;
  const inner = matches
    .map((m) => m.slice(1, -1).trim())
    .filter(Boolean)
    .join(' · ');
  return inner || null;
}

async function loadNames(): Promise<Map<string, NameRow>> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const map = new Map<string, NameRow>();

    const [pests, diseases] = await Promise.all([
      supabase
        .from('pest_master')
        .select('pest_name_en, pest_name_hi, pest_name_mr')
        .eq('is_active', true),
      supabase
        .from('disease_risk_model')
        .select('disease_name_en, disease_name_hi, disease_name_mr')
        .eq('is_active', true),
    ]);

    if (pests.error) console.error('[threatLocalName] pest_master', pests.error);
    if (diseases.error) console.error('[threatLocalName] disease_risk_model', diseases.error);

    for (const r of pests.data ?? []) {
      const en = (r as any).pest_name_en as string | null;
      if (!en) continue;
      const key = normalizeThreatKey(en);
      if (!key || map.has(key)) continue;
      map.set(key, { en, hi: (r as any).pest_name_hi ?? null, mr: (r as any).pest_name_mr ?? null });
    }

    for (const r of diseases.data ?? []) {
      const en = (r as any).disease_name_en as string | null;
      if (!en) continue;
      const key = normalizeThreatKey(en);
      if (!key || map.has(key)) continue;
      map.set(key, {
        en,
        hi: (r as any).disease_name_hi ?? null,
        mr: (r as any).disease_name_mr ?? null,
      });
    }

    cache = map;
    inflight = null;
    return map;
  })();

  return inflight;
}

/** Preload the lookup table (safe to call repeatedly). */
export function preloadThreatNames(): Promise<unknown> {
  return loadNames();
}

/**
 * Resolves the farmer-facing name for a raw `variety_resistance.threat_name`.
 * Synchronous against the in-memory cache; call `preloadThreatNames()` first
 * (the hook below does that) so the cache is warm.
 */
export function resolveThreatName(raw: string, lang: string): ThreatDisplayName {
  const cleaned = stripScientific(raw) || (raw || '').trim();
  const scientific = extractScientific(raw);
  const key = normalizeThreatKey(raw);
  const row = cache?.get(key);

  const local =
    row && lang === 'mr' ? row.mr : row && lang === 'hi' ? row.hi : null;

  if (local && local.trim()) {
    return { label: local.trim(), scientific, localized: true };
  }
  return { label: cleaned, scientific, localized: false };
}
