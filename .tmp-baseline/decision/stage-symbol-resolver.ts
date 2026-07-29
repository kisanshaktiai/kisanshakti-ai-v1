// DB-backed stage symbol resolver.

import { normalizeStageForDB } from '../utils/stage-normalizer.ts';
import { normalizeStageKey, stageFamily, stagesEquivalent } from '../runtime/stage-family-shim.ts';

export interface ResolvedStageSymbol {
  raw: string;
  canonical: string | null;
  family: readonly string[];
  resolved: boolean;
  source: 'crop_stage_graph' | 'normalized' | 'unknown';
}

export interface StageCompatibility {
  exact: boolean;
  family: boolean;
  mismatch: boolean;
  unknown: boolean;
  input: ResolvedStageSymbol;
  expected: ResolvedStageSymbol[];
}

function canonicalize(raw: unknown): string | null {
  const s = normalizeStageKey(normalizeStageForDB(String(raw ?? '')));
  if (!s || s === 'unknown' || s === 'null' || s === 'undefined') return null;
  return s
    .replace(/^stage_/, '')
    .replace(/_stage$/, '')
    .replace(/^growth_stage_/, '');
}

export function resolveStageSymbol(
  raw: unknown,
  crop?: string | null,
): ResolvedStageSymbol {
  const canonical = canonicalize(raw);
  const rawText = String(raw ?? '').trim();
  if (!canonical) {
    return { raw: rawText, canonical: null, family: [], resolved: false, source: 'unknown' };
  }
  const family = stageFamily(canonical, crop ?? null);
  const dbHit = family.length > 1 || family.includes(canonical);
  return {
    raw: rawText,
    canonical,
    family,
    resolved: true,
    source: dbHit ? 'crop_stage_graph' : 'normalized',
  };
}

export function sameStageNode(a: unknown, b: unknown): boolean {
  const ra = resolveStageSymbol(a);
  const rb = resolveStageSymbol(b);
  return !!ra.canonical && !!rb.canonical && ra.canonical === rb.canonical;
}

export function sameStageFamily(
  a: unknown,
  b: unknown,
  crop?: string | null,
): boolean {
  const ra = resolveStageSymbol(a, crop);
  const rb = resolveStageSymbol(b, crop);
  if (!ra.canonical || !rb.canonical) return true;
  if (ra.canonical === rb.canonical) return true;
  return stagesEquivalent(ra.canonical, rb.canonical, crop ?? null);
}

export function stageCompatibility(
  stage: unknown,
  allowed: ReadonlyArray<unknown>,
  crop?: string | null,
): StageCompatibility {
  const input = resolveStageSymbol(stage, crop);
  const expected = allowed.map((s) => resolveStageSymbol(s, crop));
  if (!input.canonical || expected.length === 0) {
    return { exact: false, family: false, mismatch: false, unknown: true, input, expected };
  }

  const exact = expected.some((e) => !!e.canonical && e.canonical === input.canonical);
  const family = exact || expected.some((e) => !!e.canonical && sameStageFamily(e.canonical, input.canonical, crop ?? null));
  return { exact, family, mismatch: !family, unknown: false, input, expected };
}
