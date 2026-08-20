/**
 * CHANGE LOG (newest first)
 *   2026-08-19 09:10 UTC — FIX 4: snapshot TTL 5min → 30min so warm invocations
 *     skip the ~15s decision_rules load.
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE:      supabase/functions/ai-agriculture-chat/data/rule-repository.ts
 * ROLE:      Single in-memory snapshot of public.decision_rules (PERF ONLY).
 * AUTHORITY: Data access only. NO agronomic logic lives here.
 * STATUS:    ACTIVE
 *
 * CHANGE LOG (newest first):
 *   2026-08-02 16:30 UTC — Created. Collapses 4 duplicate decision_rules
 *       reads per turn into ONE snapshot with an in-flight concurrency lock
 *       (pattern copied from utils/crop-vocabulary-cache.ts), pre-bucketed
 *       crop / canonical_group maps, version_hash invalidation + TTL backstop.
 *       Raw rows are served verbatim so no consumer loses a column and no
 *       consumer receives different normalization than before.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

// FIX-4 (P1-6, 2026-08-09): typed error so orchestrate() can distinguish
// "knowledge DB unavailable" (fail CLOSED) from "no matching rules" (legitimate).
// Name-based check mirrors the existing SafetyCacheUnavailableError pattern.
export class KnowledgeLoadError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'KnowledgeLoadError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION — moved verbatim out of bundled-rules/loader.ts (no rewrite).
// ─────────────────────────────────────────────────────────────────────────────

export const normalizeActionType = (action: string | null): string => {
  if (!action) return 'RECOMMEND';
  const upper = action.toUpperCase().trim();
  const VALID_DB_TYPES = ['RECOMMEND', 'MONITOR', 'BLOCK', 'NO_ACTION_REQUIRED', 'URGENT_ACTION'];
  if (VALID_DB_TYPES.includes(upper)) return upper;
  const legacyMapping: Record<string, string> = {
    'treatment': 'RECOMMEND', 'monitoring': 'MONITOR', 'safety_gate': 'BLOCK',
    'advisory': 'NO_ACTION_REQUIRED', 'urgent_treatment': 'URGENT_ACTION',
    'APPLY_TREATMENT': 'RECOMMEND', 'prevention': 'RECOMMEND',
    'diagnosis': 'MONITOR', 'clarification': 'MONITOR',
  };
  return legacyMapping[action] || legacyMapping[upper] || 'RECOMMEND';
};

export const normalizeCanonicalGroup = (group: string | null): string => {
  if (!group) return '12_monitoring';
  const g = group.toLowerCase();

  if (g.startsWith('sc_pest_') || g.startsWith('ct_pest_')) return '03_pest';
  if (g.startsWith('sc_disease_') || g.startsWith('ct_disease_')) return '04_disease';
  if (g.startsWith('sc_nutrient_') || g.startsWith('ct_nutrient_')) return '05_nutrition';
  if (g.startsWith('sc_stress_') || g.startsWith('ct_stress_')) return '08_stress';
  if (g.startsWith('sc_irrigation_') || g.startsWith('ct_irrigation_')) return '10_irrigation';
  if (g.startsWith('sc_safety_') || g.startsWith('ct_safety_')) return '11_safety';
  if (g.startsWith('sc_weather_') || g.startsWith('ct_weather_')) return '09_weather';

  const mapping: Record<string, string> = {
    'pest': '03_pest',
    'disease': '04_disease',
    'nutrition': '05_nutrition',
    'nutrient': '05_nutrition',
    'weed': '06_weed',
    'clarification': '07_clarification',
    'stress': '08_stress',
    'weather': '09_weather',
    'weather_alert': '09_weather',
    'irrigation': '10_irrigation',
    'safety': '11_safety',
    'monitoring': '12_monitoring',
    'treatment': '13_treatment',
    'identity': '01_crop_identity',
    'crop_identity': '01_crop_identity',
    'growth_stage': '02_growth_stage',
  };

  return mapping[g] || (g.match(/^\d{2}_/) ? g : '12_monitoring');
};

export const normalizeStages = (stages: string[] | null): string[] => {
  if (!stages || !Array.isArray(stages)) return ['ALL'];
  const stageMapping: Record<string, string> = {
    'PLANTING': 'GERMINATION',
    'RATOON': 'POST_HARVEST',
    'CANE_FORMATION': 'GRAND_GROWTH',
    'EARLY_GROWTH': 'SEEDLING',
    'RATOON_INIT': 'POST_HARVEST',
  };
  return stages.map(s => {
    const upper = s.toUpperCase();
    return stageMapping[upper] || upper;
  });
};

export const normalizeObservableChars = (chars: unknown): string[] | null => {
  if (!chars) return null;
  if (Array.isArray(chars)) return chars.map(c => String(c).toUpperCase());
  if (typeof chars === 'object') {
    return Object.keys(chars as Record<string, unknown>).map(k => k.toUpperCase());
  }
  return null;
};

export const normalizeBeeToxicity = (val: string | null): string | null => {
  if (!val) return null;
  const upper = val.toUpperCase();
  if (['HIGH', 'MODERATE', 'LOW', 'SAFE'].includes(upper)) return upper;
  if (upper === 'NONE') return 'SAFE';
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT
// ─────────────────────────────────────────────────────────────────────────────

export type RawRuleRow = Record<string, any>;

interface RuleSnapshot {
  rows: RawRuleRow[];
  byCrop: Map<string, RawRuleRow[]>;                        // lower(crop_code) -> rows
  byCropGroup: Map<string, Map<string, RawRuleRow[]>>;      // lower(crop_code) -> canonical_group -> rows
  byRuleId: Map<string, RawRuleRow>;                        // lower(rule_id) -> row
  versionFingerprint: string;
  loadedAt: number;
}

interface CacheState {
  snapshot: RuleSnapshot | null;
  loadingPromise?: Promise<RuleSnapshot>;
}

// FIX 4 (2026-08-19): 30 min backstop — warm invocations skip the 15s rule load.
// A3 (2026-08-20): TTL now configurable via env RULE_SNAPSHOT_TTL_MS.
const SNAPSHOT_TTL_MS = (() => {
  const raw = Deno.env.get('RULE_SNAPSHOT_TTL_MS');
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1_800_000;
})();
const cache: CacheState = { snapshot: null };

function client(explicit?: any): any {
  if (explicit) return explicit;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildSnapshot(rows: RawRuleRow[], fingerprint: string): RuleSnapshot {
  const byCrop = new Map<string, RawRuleRow[]>();
  const byCropGroup = new Map<string, Map<string, RawRuleRow[]>>();
  const byRuleId = new Map<string, RawRuleRow>();

  for (const row of rows) {
    const crop = String(row.crop_code ?? '').toLowerCase();
    const group = normalizeCanonicalGroup(row.canonical_group ?? null);

    let cropBucket = byCrop.get(crop);
    if (!cropBucket) { cropBucket = []; byCrop.set(crop, cropBucket); }
    cropBucket.push(row);

    let groupMap = byCropGroup.get(crop);
    if (!groupMap) { groupMap = new Map<string, RawRuleRow[]>(); byCropGroup.set(crop, groupMap); }
    let groupBucket = groupMap.get(group);
    if (!groupBucket) { groupBucket = []; groupMap.set(group, groupBucket); }
    groupBucket.push(row);

    if (row.rule_id) byRuleId.set(String(row.rule_id).toLowerCase(), row);
  }

  return { rows, byCrop, byCropGroup, byRuleId, versionFingerprint: fingerprint, loadedAt: Date.now() };
}

// A3 (2026-08-20): fingerprint = count(*) + max(updated_at) over active rules.
// max(version_hash) missed edits to non-hashed columns; any mismatch forces a reload.
async function readVersionFingerprint(sb: any): Promise<string> {
  try {
    const [countRes, latestRes] = await Promise.all([
      sb.from('decision_rules').select('rule_id', { count: 'exact', head: true }).eq('is_active', true),
      sb.from('decision_rules')
        .select('updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (countRes?.error || latestRes?.error) return '';
    const count = countRes?.count ?? null;
    if (count == null) return '';
    const maxUpdatedAt = String((latestRes?.data as any)?.updated_at ?? '');
    return `${count}|${maxUpdatedAt}`;
  } catch {
    return '';
  }
}

async function fetchRows(sb: any): Promise<RawRuleRow[]> {
  // Column set = SELECT * (superset of every consumer's previous projection).
  const PAGE = 1000;
  const MAX_PAGES = 5;
  const all: RawRuleRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await sb
      .from('decision_rules')
      .select('*')
      .eq('is_active', true)
      .order('rule_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`❌ [RuleRepo] Database error on page ${page}:`, error.message);
      if (all.length === 0) throw new Error(error.message);
      break;
    }
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

/** Load (or reuse) the single rule snapshot. In-flight lock: N concurrent cold
 *  callers trigger exactly ONE database read. */
export async function getRuleSnapshot(supabaseClient?: any): Promise<RuleSnapshot> {
  const now = Date.now();
  const current = cache.snapshot;

  if (current && (now - current.loadedAt) < SNAPSHOT_TTL_MS) return current;
  if (cache.loadingPromise) return cache.loadingPromise;

  const loadPromise = (async (): Promise<RuleSnapshot> => {
    const sb = client(supabaseClient);
    if (!sb) {
      console.warn('⚠️ [RuleRepo] Missing Supabase credentials');
      // FIX-4 (P1-6): no credentials + no warm snapshot = fail closed.
      if (current) return current;
      throw new KnowledgeLoadError('Missing Supabase credentials for decision_rules snapshot');
    }
    try {
      // version_hash invalidation: unchanged fingerprint -> extend TTL, skip refetch.
      const fingerprint = await readVersionFingerprint(sb);
      if (current && fingerprint && fingerprint === current.versionFingerprint) {
        current.loadedAt = Date.now();
        console.log(`✅ [RuleRepo] Snapshot reused (version_hash unchanged, ${current.rows.length} rules)`);
        return current;
      }

      const rows = await fetchRows(sb);
      const snap = buildSnapshot(rows, fingerprint);
      console.log(`✅ [RuleRepo] Snapshot loaded: ${rows.length} active rules, ${snap.byCrop.size} crop buckets`);
      return snap;
    } catch (e) {
      if ((e as Error)?.name === 'KnowledgeLoadError') throw e;
      console.error('❌ [RuleRepo] Snapshot load failed:', e);
      // FIX-4 (P1-6): serve a STALE snapshot if one exists (availability);
      // never a silently-empty rulebook on cold-start failure (fail closed).
      if (current) {
        console.warn(`⚠️ [RuleRepo] Serving STALE snapshot (${current.rows.length} rules) after load failure`);
        return current;
      }
      throw new KnowledgeLoadError(`decision_rules snapshot load failed: ${(e as Error)?.message ?? String(e)}`);
    }
  })();

  cache.loadingPromise = loadPromise;
  try {
    const snap = await loadPromise;
    cache.snapshot = snap;
    return snap;
  } finally {
    delete cache.loadingPromise;
  }
}

// FIX 6 (2026-08-08) — TENANT SCOPING.
// public.decision_rules carries `owner_tenant_id`: NULL = platform-global rule,
// non-NULL = a rule authored by (and only valid for) that tenant. The snapshot
// is shared across tenants for performance, so scoping MUST happen on read.
// Callers that pass no tenantId receive GLOBAL rules only — fail-closed, so a
// missing tenant can never leak another tenant's private agronomy.
function scopeToTenant<T extends RawRuleRow>(rows: T[], tenantId?: string | null): T[] {
  const tid = tenantId ? String(tenantId).trim().toLowerCase() : null;
  let dropped = 0;
  const out = rows.filter((r) => {
    const owner = (r as any)?.owner_tenant_id;
    if (owner === null || owner === undefined || owner === '') return true; // global
    const keep = !!tid && String(owner).toLowerCase() === tid;
    if (!keep) dropped++;
    return keep;
  });
  if (dropped > 0) {
    console.log(`[RULE_TENANT_SCOPE] tenant=${tid ?? 'GLOBAL_ONLY'} kept=${out.length} dropped_foreign=${dropped}`);
  }
  return out;
}

/** All active rules (raw rows, verbatim DB shape), scoped to `tenantId`. */
export async function getAllRules(supabaseClient?: any, tenantId?: string | null): Promise<RawRuleRow[]> {
  return scopeToTenant((await getRuleSnapshot(supabaseClient)).rows, tenantId);
}

/** Rows whose lower(crop_code) matches ANY supplied variant.
 *  Semantically identical to the previous `.or(crop_code.ilike.<v>)` filter
 *  (ILIKE without wildcards == case-insensitive equality). */
export async function getRulesForCrop(
  cropCode: string | string[],
  supabaseClient?: any,
  tenantId?: string | null
): Promise<RawRuleRow[]> {
  const snap = await getRuleSnapshot(supabaseClient);
  const variants = (Array.isArray(cropCode) ? cropCode : [cropCode])
    .filter(Boolean)
    .map(v => String(v).toLowerCase().trim());
  const seen = new Set<string>();
  const out: RawRuleRow[] = [];
  for (const v of variants) {
    if (seen.has(v)) continue;
    seen.add(v);
    const bucket = snap.byCrop.get(v);
    if (bucket) out.push(...bucket);
  }
  return scopeToTenant(out, tenantId);
}

/** Rows for a crop (or crop variants) restricted to one canonical_group. */
export async function getRulesForCropAndGroup(
  cropCode: string | string[],
  canonicalGroup: string,
  supabaseClient?: any,
  tenantId?: string | null
): Promise<RawRuleRow[]> {
  const snap = await getRuleSnapshot(supabaseClient);
  const group = normalizeCanonicalGroup(canonicalGroup ?? null);
  const variants = (Array.isArray(cropCode) ? cropCode : [cropCode])
    .filter(Boolean)
    .map(v => String(v).toLowerCase().trim());
  const seen = new Set<string>();
  const out: RawRuleRow[] = [];
  for (const v of variants) {
    if (seen.has(v)) continue;
    seen.add(v);
    const bucket = snap.byCropGroup.get(v)?.get(group);
    if (bucket) out.push(...bucket);
  }
  return scopeToTenant(out, tenantId);
}

/** Single active rule by rule_id (case-insensitive, same as DB unique index). */
export async function getRuleById(
  ruleId: string,
  supabaseClient?: any,
  tenantId?: string | null
): Promise<RawRuleRow | null> {
  if (!ruleId) return null;
  const snap = await getRuleSnapshot(supabaseClient);
  const row = snap.byRuleId.get(String(ruleId).toLowerCase()) ?? null;
  if (!row) return null;
  return scopeToTenant([row], tenantId)[0] ?? null;
}

/** Force-drop the snapshot (tests / explicit invalidation). */
export function invalidateRuleSnapshot(): void {
  cache.snapshot = null;
}
