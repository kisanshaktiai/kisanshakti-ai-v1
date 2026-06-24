/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CODE NORMALIZER — canonical lower_snake_case for observation/crop/condition
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The database stores observation_code, crop_code, crop_group, category, and
 * hypothesis condition_key in lower_snake_case (post-2026-06 migration).
 * Stages, severity tokens, and intent codes remain a separate UPPER vocabulary
 * and must NOT be lowercased — use stage-normalizer for those.
 *
 * Use these helpers at every edge that interacts with DB row codes or that
 * hands codes back into the symbolic engine, so we never compare across
 * casing and never re-introduce drift.
 */

export const toCanonicalCode = (s: unknown): string =>
  String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const toCanonicalCrop = (s: unknown): string =>
  String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Best-effort: does this string look like an observation-style code already? */
export const isCanonicalCode = (s: string): boolean =>
  !!s && s === s.toLowerCase() && !/[\s-]/.test(s);
