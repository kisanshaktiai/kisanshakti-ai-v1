/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP STAGE ADVISOR — Stage-Specific Advisory (DB-driven)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MIGRATED: all agronomic content previously hardcoded here now lives in
 * public.crop_stage_knowledge (SSOT). See utils/crop-stage-knowledge-cache.ts
 * for the cached DB lookup. This file is a thin re-export so existing
 * callers don't need to change their import path.
 *
 * Tagged: STAGE_ADVISORY_FALLBACK — used when zero rules fire from the
 * symbolic decision-rules engine for stage-specific queries.
 */

export type { StageAdvice } from '../utils/crop-stage-knowledge-cache.ts';
export {
  getStageSpecificAdvice,
  getAvailableCropAdvisors,
} from '../utils/crop-stage-knowledge-cache.ts';

export const CROP_STAGE_ADVISOR_VERSION = '2.0.0';
