/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCEPT BRIDGE — extractor vocabulary → canonical IOM observation codes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * v2.0 — 2026-07-04
 *
 * NEUTRALISED. All hardcoded crop-specific bridges (previously
 * CONCEPT_BRIDGE.rice = { poor_germination → obs_rice_no_emergence, … })
 * have been deleted. Concept aliasing MUST live in the DB:
 *
 *     public.observation_aliases
 *         (crop_code, alias_code, canonical_observation_code)
 *
 * The runtime functions below are pass-throughs so existing imports keep
 * working. They perform NO ontology decisions — bridging is now a DB
 * lookup executed by the observation resolver at extraction time.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Empty registry — placeholder kept for structural compatibility.
// DO NOT re-populate. Curate `observation_aliases` in the DB instead.
const CONCEPT_BRIDGE: Record<string, Record<string, string>> = {};

/**
 * Pass-through. Returns the input code unchanged. If a caller depends on
 * concept bridging, wire it to `observation_aliases` at the load site.
 */
export function bridgeToCropVocab(_cropCode: string | null | undefined, code: string): string {
  // Symbolic transport — no agronomy in code.
  void CONCEPT_BRIDGE; // silence unused warning; retained intentionally
  return code;
}

/**
 * Deduplicate a list of observation codes (case-insensitive, order-preserving).
 * Performs NO aliasing — bridging must be resolved from DB before this call.
 */
export function bridgeCodes(_cropCode: string | null | undefined, codes: string[]): string[] {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    if (!c) continue;
    const key = String(c).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
