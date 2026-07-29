/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL CODE SSOT — the ONLY normalizer for symbolic identifiers
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-07-26 (RC-2) — Added `canonicalRuleId` / `canonicalHypothesisId`
 *     (UPPER_SNAKE) after DB verification proved rule/hypothesis identifiers
 *     are uppercase, contradicting this file's original header. Deprecated
 *     `canonicalSymbolCode`.
 *   2026-07-26 — CREATED. Forensic audit F3: `canonicalizeObservationKey`
 *     existed in `runtime/clarification-contract.ts` but was imported by only
 *     4 files. Every other matching layer re-implemented its own normalizer
 *     with a DIFFERENT shape (`.toUpperCase()`, `/[\s-]/g` without `+`, or no
 *     separator folding at all). Any comparison where one side was uppercased
 *     and the other was DB-lowercase silently returned no match — the
 *     "rules blocked by normalization" defect.
 *
 * DB-VERIFIED CANONICAL FORMS (re-queried 2026-07-26):
 *   observation_master.observation_code     2549 rows / 0 upper → lower_snake
 *   observation_translations.observation_code 5172 rows / 0 upper → lower_snake
 *   hypothesis_conditions.condition_key      736 rows / 0 upper → lower_snake
 *   decision_rules.rule_id                  1853 rows / all upper → UPPER_SNAKE
 *   hypothesis_rule_mapping.rule_id         1820 rows / all upper → UPPER_SNAKE
 *   intent_observation_mapping.intent_code   all uppercase        → UPPER_SNAKE
 *   intent_observation_mapping.crop_code     all lowercase        → lower_snake
 *   intent_observation_mapping.growth_stage  all lowercase        → lower_snake

 *
 * This file contains ZERO agronomy. It is pure string framework.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function foldSnake(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .trim()
    .replace(/[\s\-.]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Canonical observation / hypothesis-condition code → lower_snake_case. */
export function canonicalObsCode(s: unknown): string {
  return foldSnake(s).toLowerCase();
}

/** Canonical intent code → UPPER_SNAKE_CASE. */
export function canonicalIntentCode(s: unknown): string {
  return foldSnake(s).toUpperCase();
}

/** Canonical crop code → lower_snake_case. */
export function canonicalCropCode(s: unknown): string {
  return foldSnake(s).toLowerCase();
}

/** Canonical growth-stage key → lower_snake_case. */
export function canonicalStageKey(s: unknown): string {
  return foldSnake(s).toLowerCase();
}

// Canonical rule / hypothesis identifier.
export function canonicalRuleId(s: unknown): string {
  return foldSnake(s).toUpperCase();
}

/** Canonical hypothesis identifier → UPPER_SNAKE_CASE (DB truth). */
export function canonicalHypothesisId(s: unknown): string {
  return foldSnake(s).toUpperCase();
}

// @deprecated Use `canonicalRuleId` / `canonicalHypothesisId` for DB
export function canonicalSymbolCode(s: unknown): string {
  return foldSnake(s).toLowerCase();
}


/** True when two observation codes are the same symbol under canonical form. */
export function sameObsCode(a: unknown, b: unknown): boolean {
  const ca = canonicalObsCode(a);
  return !!ca && ca === canonicalObsCode(b);
}

/** Canonical Set of observation codes (empty strings dropped). */
export function obsCodeSet(list: ReadonlyArray<unknown> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const item of list ?? []) {
    const c = canonicalObsCode(item);
    if (c) out.add(c);
  }
  return out;
}

/** Canonical, de-duplicated array preserving first-seen order. */
export function obsCodeList(list: ReadonlyArray<unknown> | null | undefined): string[] {
  return Array.from(obsCodeSet(list));
}

// Drift probe. Logs `[CODE_NORM_MISMATCH]` when the legacy uppercase form
export function assertNoNormDrift(site: string, code: unknown, pool: ReadonlyArray<unknown>): void {
  const canon = canonicalObsCode(code);
  if (!canon) return;
  const canonPool = obsCodeSet(pool);
  const legacy = String(code ?? '').toUpperCase().replace(/[\s-]/g, '_');
  const legacyPool = new Set((pool ?? []).map((p) => String(p ?? '').toUpperCase().replace(/[\s-]/g, '_')));
  const canonHit = canonPool.has(canon);
  const legacyHit = legacyPool.has(legacy);
  if (canonHit !== legacyHit) {
    console.warn(
      `[CODE_NORM_MISMATCH] site=${site} code=${String(code)} canonical_hit=${canonHit} legacy_hit=${legacyHit}`,
    );
  }
}
