/**
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-07-27 — Track A: removed `loadFallbackQuestions` +
 *   `clarification_fallback_questions` reads. Single farmer-label schema is
 *   observation_master × observation_translations.
 */

// CLARIFICATION CONTRACT — Single enforcement point for farmer-observation

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
  // Observation codes already confirmed for this conversation (from
  confirmed?: ReadonlyArray<string>;
  // FIX 3 — observation keys still pending farmer confirmation from a
  pending?: ReadonlyArray<string>;
  // 2026-08-04 — lane/context threading so the applicability gate can enforce.
  trace_id?: string | null;
  cultivation_method?: string | null;
  canonical_context?: any;
  session_ssot?: any;
  biological_state?: any;
}



// ─── Canonical key helper ──────────────────────────────────────────────────
export function canonicalizeObservationKey(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ─── Stage expansion (DB is authority) ────────────────────────────────────
function expandStageSynonyms(stage?: string | null): string[] {
  if (!stage) return ['all'];
  const key = String(stage).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return Array.from(new Set([key, 'all']));
}

// ─── Main candidate loader ────────────────────────────────────────────────
// Generate farmer clarification options from the curated farmer-observation
export async function loadClarificationCandidates(
  input: ClarificationCandidateInput,
): Promise<ClarificationOption[]> {
  const {
    supabase, intent_code, crop_code, growth_stage, das, language, max = 4, confirmed = [], pending = [],
    trace_id, cultivation_method, canonical_context, session_ssot, biological_state,
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
      trace_id: trace_id ?? null,
      cultivation_method: cultivation_method ?? null,
      canonical_context: canonical_context ?? null,
      session_ssot: session_ssot ?? null,
      biological_state: biological_state ?? null,
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
    // FIX-B5b (P2, 2026-08-09): infrastructure failure, not "no candidates".
    // Returning [] is SAFE here — verified consumer behaviour: the orchestrator
    // refuses NLU fallback on empty candidates and emits an option-less
    // clarification (a question, never an answer). Log is marked INFRA_FAILURE
    // so audit can separate DB outages from legitimately-empty candidate sets.
    console.error('[CLARIFICATION_CONTRACT] INFRA_FAILURE — fail-safe to option-less clarification:', e);
    return [];
  }
}

// ─── Outbound contract assertion ─────────────────────────────────────────
// Final outbound guard. Removes any option that violates the contract.
export function assertClarificationContract<
  T extends { observation_key?: string; label?: string }
>(
  options: T[],
  allowedKeys: Set<string>,
  ctx: { intent?: string; crop?: string; stage?: string | null; das?: number | null } = {},
): T[] {
  if (!Array.isArray(options) || options.length === 0) return [];

  // PATCH 4 (BUG 4) — DB is the authority for admissibility. If the caller
  // FIX-B5a (P1, 2026-08-09): fail CLOSED. An empty allowlist means the DB
  // admissibility set could not be established; passing options through
  // unvalidated let un-vetted questions reach farmers. Returning [] routes the
  // turn to the orchestrator's existing safe option-less clarification path
  // (verified: it "refus[es] NLU fallback" and asks a generic observation
  // question). ROLLBACK: restore the passthrough filter.
  if (!allowedKeys || allowedKeys.size === 0) {
    console.error(
      `[CLARIFICATION_CONTRACT] empty allowlist — FAIL-CLOSED ` +
      `intent=${ctx.intent ?? '?'} crop=${ctx.crop ?? '?'} stage=${ctx.stage ?? '?'} ` +
      `dropped=${options.length}`,
    );
    return [];
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
