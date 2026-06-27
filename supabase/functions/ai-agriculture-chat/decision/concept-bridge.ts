/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCEPT BRIDGE — extractor vocabulary → crop-specific IOM canonical codes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY
 *   The NLU layer extracts generic codes (poor_germination, germination_failure)
 *   semantic_class=physiology. The rice IOM allowlist uses
 *   obs_rice_no_emergence / obs_rice_patchy_emergence / obs_rice_seedling_damping_off
 *   semantic_class=phenology. No alias bridges them today, so even with
 *   IOM enforced the extractor's output cannot select the right rice rows.
 *
 * SCOPE
 *   This is the *quick* code-side bridge. The durable form is a data-driven
 *   canonical_group / concept_id in observation_master + a small migration
 *   to add the bridge as observation_aliases rows. That migration is listed
 *   in the PR as "needs human approval" and is NOT applied here.
 *
 * USAGE
 *   const bridged = bridgeToCropVocab('rice', 'poor_germination');
 *   // → 'obs_rice_no_emergence'
 *
 *   apply this to each extracted observation BEFORE matching against the IOM
 *   allowlist returned by loadIOMAllowed().
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CONCEPT_BRIDGE: Record<string, Record<string, string>> = {
  rice: {
    poor_germination:        'obs_rice_no_emergence',
    germination_failure:     'obs_rice_no_emergence',
    seed_not_germinated:     'obs_rice_no_emergence',
    no_emergence:            'obs_rice_no_emergence',
    emergence_failure:       'obs_rice_no_emergence',
    patchy_germination:      'obs_rice_patchy_emergence',
    uneven_germination:      'obs_rice_patchy_emergence',
    patchy_emergence:        'obs_rice_patchy_emergence',
    damping_off:             'obs_rice_seedling_damping_off',
    seedling_damping_off:    'obs_rice_seedling_damping_off',
  },
  // Sugarcane already uses generic codes; add other crops as their obs_*
  // vocab is curated and verified against intent_observation_mapping.
};

/**
 * Map a generic extractor code to the crop's canonical IOM code, when a
 * concept bridge exists. Returns the original code if no bridge applies.
 *
 * Comparison is case-insensitive; the returned canonical code is the
 * lowercase form stored in `intent_observation_mapping.observation_code`.
 */
export function bridgeToCropVocab(cropCode: string | null | undefined, code: string): string {
  if (!code) return code;
  const crop = String(cropCode || '').toLowerCase().trim();
  if (!crop) return code;
  const lookup = CONCEPT_BRIDGE[crop];
  if (!lookup) return code;
  const lowered = String(code).toLowerCase().trim();
  return lookup[lowered] ?? code;
}

/**
 * Bridge a list of codes in-place to the crop's canonical IOM vocabulary,
 * de-duplicating. Preserves the order of the first occurrence.
 */
export function bridgeCodes(cropCode: string | null | undefined, codes: string[]): string[] {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    const bridged = bridgeToCropVocab(cropCode, c);
    const key = bridged.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bridged);
  }
  return out;
}
