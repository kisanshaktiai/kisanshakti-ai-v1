/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO → CANONICAL OBSERVATION MAPPER
 * CHANGE LOG (audit trail — newest first, keep entries short)
 * 2026-07-29 — RESTORED. agents/orchestrator.ts dynamically imports this module
 *   on every photo-bearing request; the file was missing, so every photo turn
 *   threw at `await import(...)`. Rebuilt DB-first: Vision AI keys resolve to
 *   canonical observation codes ONLY through the preloaded observation index
 *   (observation_master + observation_aliases). No hardcoded agronomy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { canonicalObsCode } from '../utils/canonical-code.ts';
import {
  observationIndexReady,
  resolveAliasCanonical,
  getObservationMaster,
} from '../utils/db-ssot/observation-index.ts';
import { getConfigNumber } from '../utils/db-ssot/system-config-cache.ts';

export interface PhotoMappedCodes {
  observation_codes: string[];
  severity_code: string | null;
  affected_part_code: string | null;
  confidence: number;
  unresolved_keys: string[];
  index_ready: boolean;
}

/**
 * Resolve one Vision AI key to a canonical observation_master code.
 * Order: canonical form is already a master row → alias table → unresolved.
 */
function resolveOne(rawKey: unknown): string | null {
  const canon = canonicalObsCode(rawKey);
  if (!canon) return null;
  if (getObservationMaster(canon)) return canon;
  const viaAlias = resolveAliasCanonical(canon) ?? resolveAliasCanonical(String(rawKey ?? ''));
  if (!viaAlias) return null;
  const aliasCanon = canonicalObsCode(viaAlias);
  return getObservationMaster(aliasCanon) ? aliasCanon : null;
}

/**
 * Map a PhotoAnalysisOutput onto canonical observation codes.
 * Anything the DB cannot resolve is reported in `unresolved_keys` and dropped —
 * a photo may never inject a symbolic identity that observation_master does not own.
 */
export function mapPhotoToObservationKeys(photoAnalysis: any): PhotoMappedCodes {
  const indexReady = observationIndexReady();
  const observations: any[] = Array.isArray(photoAnalysis?.observations)
    ? photoAnalysis.observations
    : [];

  const codes: string[] = [];
  const seen = new Set<string>();
  const unresolved: string[] = [];

  for (const obs of observations) {
    const raw = obs?.key ?? obs?.observation_code ?? obs?.symbol;
    const resolved = indexReady ? resolveOne(raw) : null;
    if (!resolved) {
      if (raw) unresolved.push(String(raw));
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    codes.push(resolved);
  }

  // Affected part comes from observation_master.affected_plant_part of the
  // highest-confidence resolved observation — never inferred in TS.
  let affectedPart: string | null = null;
  let bestConf = -1;
  for (const obs of observations) {
    const resolved = indexReady ? resolveOne(obs?.key) : null;
    if (!resolved) continue;
    const conf = typeof obs?.confidence === 'number' ? obs.confidence : 0;
    const part = getObservationMaster(resolved)?.affected_plant_part ?? null;
    if (part && conf > bestConf) {
      bestConf = conf;
      affectedPart = part;
    }
  }

  const severity = photoAnalysis?.severity_assessment?.overall_severity;

  return {
    observation_codes: codes,
    severity_code: typeof severity === 'string' && severity ? severity : null,
    affected_part_code: affectedPart,
    confidence: typeof photoAnalysis?.confidence === 'number' ? photoAnalysis.confidence : 0,
    unresolved_keys: unresolved,
    index_ready: indexReady,
  };
}

/**
 * Whether the photo alone carries enough resolved evidence to skip clarification.
 * Thresholds are system_config values, not literals baked into the brain.
 */
export function photoProvidesSufficientData(mapped: PhotoMappedCodes | null | undefined): boolean {
  if (!mapped || !mapped.index_ready) return false;
  const minCodes = getConfigNumber('photo.sufficient.min_observation_codes', 3);
  const minConfidence = getConfigNumber('photo.sufficient.min_confidence', 0.75);
  return mapped.observation_codes.length >= minCodes && mapped.confidence >= minConfidence;
}
