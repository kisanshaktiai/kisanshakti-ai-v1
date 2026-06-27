/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION CONTRACT — Single enforcement point for farmer-observation
 *                           clarification options.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURAL OWNERSHIP (immutable):
 *   intent_observation_mapping  → ONLY source of clarification candidates
 *   observation_master          → metadata validator (active, farmer_observable)
 *   observation_translations    → label lookup
 *   decision_rules / conditions_json / observable_characteristics
 *                               → INTERNAL rule predicates — NEVER UI options
 *
 * CANONICAL SYMBOL FORMAT: lower_snake_case across the entire platform.
 * No `.toUpperCase()` on observation codes anywhere in the clarification path.
 *
 * Per-turn complexity: O(k) where k = candidates for the (intent, crop,
 * stage, das) cell. Three indexed `.in()` lookups, no full-table scans.
 * Safe for millions of concurrent users.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ClarificationOption {
  observation_key: string;   // canonical lower_snake_case
  label: string;             // language-localized display text
  confidence_rank: number;
}

export interface ClarificationCandidateInput {
  supabase: any;
  intent_code: string;
  crop_code: string;
  growth_stage?: string | null;
  das?: number | null;
  language: string;
  max?: number;
}

// ─── Canonical key helper ──────────────────────────────────────────────────
export function canonicalizeObservationKey(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ─── Stage synonyms (biologically equivalent stages) ──────────────────────
const STAGE_SYNONYMS: Record<string, string[]> = {
  seedling:     ['seedling', 'nursery', 'germination', 'emergence'],
  nursery:      ['nursery', 'seedling', 'germination'],
  germination:  ['germination', 'nursery', 'seedling', 'emergence'],
  emergence:    ['emergence', 'germination', 'seedling', 'nursery'],
  vegetative:   ['vegetative', 'tillering'],
  tillering:    ['tillering', 'vegetative'],
  flowering:    ['flowering', 'reproductive', 'grand_growth'],
  reproductive: ['reproductive', 'flowering', 'grand_growth'],
  grand_growth: ['grand_growth', 'flowering', 'reproductive'],
  maturity:     ['maturity', 'ripening', 'maturation'],
  ripening:     ['ripening', 'maturity', 'maturation'],
  maturation:   ['maturation', 'maturity', 'ripening'],
  harvest:      ['harvest', 'harvesting'],
};

function expandStageSynonyms(stage?: string | null): string[] {
  if (!stage) return ['all'];
  const key = String(stage).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return Array.from(new Set([...(STAGE_SYNONYMS[key] || [key]), 'all']));
}

// ─── Main candidate loader ────────────────────────────────────────────────
/**
 * Generate farmer clarification options from the curated farmer-observation
 * ontology. This is the ONLY allowed source of clarification options for
 * REFINE_OBSERVATION scope.
 *
 * Pipeline:
 *   1. intent_observation_mapping (intent + crop + stage-synonym + DAS)
 *   2. observation_master gate (is_active=true, is_farmer_observable=true)
 *   3. observation_translations (language → fallback en)
 *
 * Returns [] on any failure. NEVER synthesizes options. NEVER humanizes codes.
 */
export async function loadClarificationCandidates(
  input: ClarificationCandidateInput,
): Promise<ClarificationOption[]> {
  const {
    supabase, intent_code, crop_code, growth_stage, das, language, max = 3,
  } = input;

  const intentUpper = String(intent_code || '').trim().toUpperCase();
  const cropLower   = String(crop_code   || '').trim().toLowerCase();
  const langLower   = String(language    || 'en').trim().toLowerCase();

  if (!intentUpper) {
    console.warn('[CLARIFICATION_CONTRACT] missing intent_code — returning []');
    return [];
  }
  if (!supabase) {
    console.error('[CLARIFICATION_CONTRACT] missing supabase client — returning []');
    return [];
  }

  const cropVariants  = Array.from(new Set([cropLower, 'all', 'universal'].filter(Boolean)));
  const stageVariants = expandStageSynonyms(growth_stage);

  try {
    // ── Stage 1: IOM lookup ──────────────────────────────────────────────
    const { data: iomRows, error: iomErr } = await supabase
      .from('intent_observation_mapping')
      .select('observation_code, confidence_rank, das_min, das_max')
      .eq('is_active', true)
      .eq('intent_code', intentUpper)
      .in('crop_code', cropVariants)
      .in('growth_stage', stageVariants)
      .order('confidence_rank', { ascending: true });

    if (iomErr) {
      console.error(`[CLARIFICATION_CONTRACT] IOM error: ${iomErr.message}`);
      return [];
    }

    const dasFiltered = (iomRows || []).filter((r: any) => {
      if (das == null || !isFinite(das as number)) return true;
      const lo = typeof r.das_min === 'number' ? r.das_min : 0;
      const hi = typeof r.das_max === 'number' ? r.das_max : 9999;
      return (das as number) >= lo && (das as number) <= hi;
    });

    // Dedupe by canonical key, keep lowest (best) confidence_rank
    const candidateRank = new Map<string, number>();
    for (const r of dasFiltered) {
      const key = canonicalizeObservationKey(r.observation_code);
      if (!key) continue;
      const rank = typeof r.confidence_rank === 'number' ? r.confidence_rank : 99;
      const prev = candidateRank.get(key);
      if (prev == null || rank < prev) candidateRank.set(key, rank);
    }

    if (candidateRank.size === 0) {
      console.log(
        `[CLARIFICATION_CONTRACT] no IOM candidates for intent=${intentUpper} crop=${cropLower} stage=${growth_stage} das=${das}`,
      );
      return [];
    }

    const candidateKeys = Array.from(candidateRank.keys());

    // ── Stage 2: observation_master gate ─────────────────────────────────
    const { data: masterRows, error: masterErr } = await supabase
      .from('observation_master')
      .select('observation_code, is_active, is_farmer_observable')
      .in('observation_code', candidateKeys);

    if (masterErr) {
      console.error(`[CLARIFICATION_CONTRACT] master error: ${masterErr.message}`);
      return [];
    }

    const validKeys = new Set<string>();
    for (const m of masterRows || []) {
      const key = canonicalizeObservationKey(m.observation_code);
      if (!key) continue;
      const active = m.is_active !== false;
      const fo = m.is_farmer_observable !== false; // default-on if null
      if (active && fo) validKeys.add(key);
    }

    const gatedKeys = candidateKeys.filter((k) => validKeys.has(k));
    if (gatedKeys.length === 0) {
      console.warn(
        `[CLARIFICATION_CONTRACT] all ${candidateKeys.length} IOM candidates dropped by observation_master gate`,
      );
      return [];
    }

    // ── Stage 3: translations (language → en fallback) ──────────────────
    const { data: trRows, error: trErr } = await supabase
      .from('observation_translations')
      .select('observation_code, display_text, description_text, language_code')
      .in('observation_code', gatedKeys)
      .in('language_code', Array.from(new Set([langLower, 'en'])));

    if (trErr) {
      console.error(`[CLARIFICATION_CONTRACT] translation error: ${trErr.message}`);
    }

    const labelByKey = new Map<string, string>();
    const fallbackByKey = new Map<string, string>();
    for (const t of trRows || []) {
      const key = canonicalizeObservationKey(t.observation_code);
      if (!key) continue;
      const text = (t.display_text || t.description_text || '').trim();
      if (!text) continue;
      if (t.language_code === langLower) labelByKey.set(key, text);
      else if (t.language_code === 'en') fallbackByKey.set(key, text);
    }

    // ── Assemble ranked, deduped options ────────────────────────────────
    const ranked = gatedKeys
      .map((k) => ({ key: k, rank: candidateRank.get(k) ?? 99 }))
      .sort((a, b) => a.rank - b.rank);

    const out: ClarificationOption[] = [];
    for (const { key, rank } of ranked) {
      const label = labelByKey.get(key) || fallbackByKey.get(key);
      if (!label) continue; // no translated label → cannot show
      out.push({ observation_key: key, label, confidence_rank: rank });
      if (out.length >= max) break;
    }

    console.log(
      `[CLARIFICATION_CONTRACT] intent=${intentUpper} crop=${cropLower} stage=${growth_stage} das=${das} ` +
      `→ iom=${candidateKeys.length} gated=${gatedKeys.length} returned=${out.length} ` +
      `keys=[${out.map((o) => o.observation_key).join(',')}]`,
    );

    return out;
  } catch (e) {
    console.error('[CLARIFICATION_CONTRACT] exception:', e);
    return [];
  }
}

// ─── Outbound contract assertion ─────────────────────────────────────────
/**
 * Final outbound guard. Removes any option that violates the contract.
 * Pass an `allowedKeys` set produced by `loadClarificationCandidates` (or
 * pre-validated IOM allowlist) to enforce ontology ownership at serialize
 * time. Returns the surviving options and logs every drop.
 */
export function assertClarificationContract<
  T extends { observation_key?: string; label?: string }
>(
  options: T[],
  allowedKeys: Set<string>,
  ctx: { intent?: string; crop?: string; stage?: string | null; das?: number | null } = {},
): T[] {
  if (!Array.isArray(options) || options.length === 0) return [];
  const kept: T[] = [];
  for (const opt of options) {
    const key = canonicalizeObservationKey(opt?.observation_key || '');
    if (!key) {
      console.warn(`[CONTRACT_VIOLATION] missing observation_key dropped`, { ctx, label: opt?.label });
      continue;
    }
    if (!allowedKeys.has(key)) {
      console.warn(`[CONTRACT_VIOLATION] key not in allowlist dropped`, { ctx, key, label: opt?.label });
      continue;
    }
    kept.push(opt);
  }
  return kept;
}
