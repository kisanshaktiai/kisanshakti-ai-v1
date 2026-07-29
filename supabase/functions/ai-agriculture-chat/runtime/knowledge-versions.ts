// PHASE Y — knowledge-versions probe.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const TTL_MS = 5 * 60 * 1000;
let _cache: { ts: number; value: Record<string, string | null> } | null = null;

const SOURCES: Array<{ table: string; column?: string; key: string }> = [
  { table: 'decision_rules',             column: 'updated_at', key: 'decision_rules_version' },
  { table: 'observation_master',         column: 'updated_at', key: 'observation_master_version' },
  { table: 'intent_observation_mapping', column: 'updated_at', key: 'intent_mapping_version' },
  { table: 'crop_stage_knowledge',       column: 'updated_at', key: 'stage_knowledge_version' },
  { table: 'observation_translations',   column: 'updated_at', key: 'translation_version' },
];

export async function getKnowledgeVersions(): Promise<Record<string, string | null>> {
  const now = Date.now();
  if (_cache && now - _cache.ts < TTL_MS) return _cache.value;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const out: Record<string, string | null> = {};
  if (!url || !key) {
    _cache = { ts: now, value: out };
    return out;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  await Promise.all(SOURCES.map(async (s) => {
    try {
      // @ts-ignore
      const { data } = await sb.from(s.table).select(s.column!).order(s.column!, { ascending: false }).limit(1).maybeSingle();
      out[s.key] = (data as any)?.[s.column!] ?? null;
    } catch {
      out[s.key] = null;
    }
  }));
  out['canonical_context_version'] = 'sv-2026.06.Y';

  _cache = { ts: now, value: out };
  return out;
}
