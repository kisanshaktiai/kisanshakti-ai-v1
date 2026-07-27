/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION CONTRACT — Single enforcement point for farmer-observation
 *                           clarification options.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURAL OWNERSHIP (immutable):
 *   hypothesis_master + hypothesis_conditions → ONLY source of farmer UI
 *   intent_observation_mapping                → discovery seed only
 *   observation_master                        → metadata validator
 *   observation_translations                  → label lookup
 *
 * CANONICAL SYMBOL FORMAT: lower_snake_case across the entire platform.
 * No `.toUpperCase()` on observation codes anywhere in the clarification path.
 *
 * Per-turn complexity: O(k) where k = candidates for the (intent, crop,
 * stage, das) cell. Three indexed `.in()` lookups, no full-table scans.
 * Safe for millions of concurrent users.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { buildHypothesisClarificationOptions } from '../decision/hypothesis-clarification-builder.ts';

export interface ClarificationOption {
  observation_key: string;   // canonical lower_snake_case
  label: string;             // language-localized display text
  confidence_rank: number;
  value?: string;
  observation_id?: string;
  observation_code?: string;
  hypothesis_id?: string;
  hypothesis_condition_id?: string;
  source?: 'hypothesis_graph';
}

export interface ClarificationCandidateInput {
  supabase: any;
  intent_code: string;
  crop_code: string;
  growth_stage?: string | null;
  das?: number | null;
  language: string;
  max?: number;
  /**
   * Observation codes already confirmed for this conversation (from
   * ConversationState.confirmed). Any candidate whose canonical key matches
   * one of these is dropped BEFORE label rendering so we never re-ask
   * something the farmer has already stated.
   */
  confirmed?: ReadonlyArray<string>;
  /**
   * FIX 3 — observation keys still pending farmer confirmation from a
   * previous turn (session.pending_clarification_observation_keys). Excluded
   * from the candidate pool so the same option is never re-offered.
   */
  pending?: ReadonlyArray<string>;
}



// ─── Canonical key helper ──────────────────────────────────────────────────
export function canonicalizeObservationKey(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ─── Stage expansion (DB is authority) ────────────────────────────────────
// The old hardcoded STAGE_SYNONYMS map (seedling↔nursery↔germination…,
// tillering↔vegetative, flowering↔reproductive↔grand_growth, …) was
// agronomy-in-code and has been deleted. Cross-stage equivalence MUST be
// curated in `intent_observation_mapping.growth_stage` rows: data owners
// insert one IOM row per biologically-equivalent stage. Runtime only
// normalises the key and always includes the `all` bucket.
function expandStageSynonyms(stage?: string | null): string[] {
  if (!stage) return ['all'];
  const key = String(stage).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return Array.from(new Set([key, 'all']));
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
    supabase, intent_code, crop_code, growth_stage, das, language, max = 4, confirmed = [], pending = [],
  } = input;

  try {
    const graph = await buildHypothesisClarificationOptions({
      supabase,
      intent_code,
      crop_code,
      crop_stage: growth_stage,
      DAS: das ?? null,
      language,
      max,
      confirmed_observations: confirmed,
      pending_obs_keys: pending,
    });

    return graph.options.map((o, idx) => ({
      observation_key: o.observation_key,
      label: o.label,
      value: o.value,
      confidence_rank: idx + 1,
      observation_id: o.observation_id,
      observation_code: o.observation_code,
      hypothesis_id: o.hypothesis_id,
      hypothesis_condition_id: o.hypothesis_condition_id,
      source: 'hypothesis_graph',
    }));
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

  // PATCH 4 (BUG 4) — DB is the authority for admissibility. If the caller
  // supplied an empty allowlist it means the DB-derived candidate set was not
  // resolved for this (intent, crop, stage) cell. Fail OPEN and log once so
  // we never silently drop farmer-visible options that the DB brain already
  // vetted (e.g. photo_upload / water_stress_check / pest_check that live in
  // clarification_fallback_questions). Hardcoded TS allowlists are forbidden.
  if (!allowedKeys || allowedKeys.size === 0) {
    console.warn(
      `[CLARIFICATION_CONTRACT] empty allowlist — fail-open ` +
      `intent=${ctx.intent ?? '?'} crop=${ctx.crop ?? '?'} stage=${ctx.stage ?? '?'} ` +
      `passthrough=${options.length}`,
    );
    return options.filter((opt) => !!canonicalizeObservationKey(opt?.observation_key || ''));
  }

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

// ─── buildOptions — vocabulary + i18n only, consumed by the Decision Graph
//     Navigator. The ONLY allowed emitter of ClarificationOption[] from
//     navigator-ranked evidence keys. No humanization, no template fallback.
// ──────────────────────────────────────────────────────────────────────────
export interface BuildOptionsInput {
  supabase: any;
  evidence_keys: string[];           // canonical lower_snake_case, navigator-ordered
  language: string;
  max?: number;
}

export async function buildOptions(
  input: BuildOptionsInput,
): Promise<ClarificationOption[]> {
  const { supabase, evidence_keys, language, max = 3 } = input;
  if (!supabase || !Array.isArray(evidence_keys) || evidence_keys.length === 0) return [];

  const langLower = String(language || 'en').trim().toLowerCase();
  const keys = Array.from(new Set(
    evidence_keys.map(canonicalizeObservationKey).filter(Boolean),
  ));
  if (keys.length === 0) return [];

  try {
    // observation_master gate (defence-in-depth — navigator already filtered)
    const { data: masterRows, error: masterErr } = await supabase
      .from('observation_master')
      .select('observation_code, is_active, is_farmer_observable')
      .in('observation_code', keys);
    if (masterErr) {
      console.error(`[CLARIFICATION_CONTRACT.buildOptions] master error: ${masterErr.message}`);
      return [];
    }
    const valid = new Set<string>();
    for (const m of masterRows || []) {
      const k = canonicalizeObservationKey(m.observation_code);
      if (k && m.is_active !== false && m.is_farmer_observable !== false) valid.add(k);
    }
    const gated = keys.filter(k => valid.has(k));
    if (gated.length === 0) {
      console.warn(`[CLARIFICATION_CONTRACT.buildOptions] all ${keys.length} keys dropped by master gate`);
      return [];
    }

    const { data: trRows, error: trErr } = await supabase
      .from('observation_translations')
      .select('observation_code, display_text, description_text, language_code')
      .in('observation_code', gated)
      .in('language_code', Array.from(new Set([langLower, 'en'])));
    if (trErr) {
      console.error(`[CLARIFICATION_CONTRACT.buildOptions] translation error: ${trErr.message}`);
    }
    const labelByKey = new Map<string, string>();
    const fallbackByKey = new Map<string, string>();
    for (const t of trRows || []) {
      const k = canonicalizeObservationKey(t.observation_code);
      if (!k) continue;
      const text = (t.display_text || t.description_text || '').trim();
      if (!text) continue;
      if (t.language_code === langLower) labelByKey.set(k, text);
      else if (t.language_code === 'en') fallbackByKey.set(k, text);
    }

    const out: ClarificationOption[] = [];
    let rank = 0;
    for (const k of gated) {
      const label = labelByKey.get(k) || fallbackByKey.get(k);
      if (!label) continue;
      out.push({ observation_key: k, label, confidence_rank: rank++ });
      if (out.length >= max) break;
    }
    console.log(
      `[CLARIFICATION_CONTRACT.buildOptions] in=${keys.length} gated=${gated.length} ` +
      `returned=${out.length} keys=[${out.map(o => o.observation_key).join(',')}]`,
    );
    return out;
  } catch (e) {
    console.error('[CLARIFICATION_CONTRACT.buildOptions] exception:', e);
    return [];
  }
}


// ─── DB-driven fallback prompts — REMOVED 2026-07-27 ─────────────────────
// `clarification_fallback_questions` (8 rows, column-per-language schema)
// was retired. The single farmer-visible label schema is now
// observation_master + observation_translations (row-per-language).
// The intent-scoped safety net lives in
// runtime/observation-selector-contract.ts::loadIntentGroupOptions().
