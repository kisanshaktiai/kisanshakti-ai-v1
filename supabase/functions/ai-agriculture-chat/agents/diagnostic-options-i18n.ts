/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC OPTIONS — DB-driven farmer clarification loader
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * v3.0 — 2026-07-04
 *
 * HARD RULE:
 *   No hardcoded diagnostic option sets, no crop / stage / observation names
 *   in TypeScript. Farmer UI candidates originate from:
 *
 *     hypothesis_master + hypothesis_conditions ── graph-owned evidence
 *     observation_master                         ── farmer_observable gate
 *     observation_translations                   ── language-specific label
 *
 * `intent_observation_mapping` is allowed only as a discovery seed inside the
 * graph builder; it must never directly emit farmer UI options.
 *
 * Already-confirmed observations are filtered out so we never re-ask what
 * the farmer has already stated.
 *
 * This file previously carried hardcoded per-crop/per-stage option sets.
 * Those were symbolic-brain violations (agronomy in code) and have been
 * deleted. The exported names below are the runtime API only; there is
 * no static option registry.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { loadClarificationCandidates, type ClarificationOption } from '../runtime/clarification-contract.ts';

export const DIAGNOSTIC_OPTIONS_VERSION = '3.0.0';

export interface DiagnosticOptionOut {
  label: string;
  observation_key: string;
  i18n_key: string;         // == observation_key (kept for legacy consumers)
  diagnostic_power: string; // derived from confidence_rank
  icon?: string;            // reserved; UI resolves via observation_master.icon in future
}

export interface LoadDiagnosticOptionsInput {
  supabase: any;
  intent_code: string;
  crop_code: string;
  growth_stage?: string | null;
  das?: number | null;
  language: string;
  confirmed?: ReadonlyArray<string>;
  max?: number;
}

/**
 * Load farmer-facing clarification options from the DB ontology.
 * Returns [] if no ontology rows match — never synthesises defaults.
 */
export async function loadDiagnosticOptions(
  input: LoadDiagnosticOptionsInput,
): Promise<DiagnosticOptionOut[]> {
  const candidates: ClarificationOption[] = await loadClarificationCandidates({
    supabase: input.supabase,
    intent_code: input.intent_code,
    crop_code: input.crop_code,
    growth_stage: input.growth_stage ?? null,
    das: input.das ?? null,
    language: input.language,
    confirmed: input.confirmed ?? [],
    max: input.max ?? 5,
  });

  return candidates.map((c) => ({
    label: c.label,
    observation_key: c.observation_key,
    i18n_key: c.observation_key,
    diagnostic_power: rankToPower(c.confidence_rank),
  }));
}

function rankToPower(rank: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (rank <= 2) return 'HIGH';
  if (rank <= 5) return 'MEDIUM';
  return 'LOW';
}

// ─── Legacy shim ─────────────────────────────────────────────────────────
// Older call-sites imported `getDiagnosticOptionsForCropStage(supabase, crop,
// stage, language)` and had no intent context. Route them through the DB
// loader with `intent_code=''`; the contract returns [] on missing intent
// which is the correct symbolic behaviour (no intent → no farmer question).
export async function getDiagnosticOptionsForCropStage(
  supabaseClient: any,
  cropCode: string,
  stage: string,
  language: string,
): Promise<DiagnosticOptionOut[]> {
  console.warn(
    '[diagnostic-options-i18n] getDiagnosticOptionsForCropStage() is a legacy shim. ' +
    'Call loadDiagnosticOptions({ intent_code, crop_code, growth_stage, das, language, confirmed }) instead.',
  );
  return loadDiagnosticOptions({
    supabase: supabaseClient,
    intent_code: '',
    crop_code: cropCode,
    growth_stage: stage,
    language,
  });
}

/**
 * SYNC LEGACY SHIM — retained for import-compat only. The symbolic brain
 * must not synthesise farmer options without DB access. Returns [] and
 * emits a warning; callers should migrate to `loadDiagnosticOptions`.
 */
export function getDiagnosticOptionsForCropStageSync(
  _cropCode: string,
  _stage: string,
  _language: string,
): DiagnosticOptionOut[] {
  console.warn(
    '[diagnostic-options-i18n] getDiagnosticOptionsForCropStageSync() is deprecated and returns []. ' +
    'DB ontology is required for farmer clarification options.',
  );
  return [];
}

export default {
  DIAGNOSTIC_OPTIONS_VERSION,
  loadDiagnosticOptions,
  getDiagnosticOptionsForCropStage,
  getDiagnosticOptionsForCropStageSync,
};
