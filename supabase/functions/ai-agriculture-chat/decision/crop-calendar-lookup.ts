/**
 * CHANGE LOG
 * 2026-07-29 10:55 UTC — FIX C1-b: optional cultivationMethod on calculateGrowthStageFromDAS/hasICARCalendar, forwarded to getStageByDAS/getStageRow; omitted → request-scoped lane.
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CALENDAR LOOKUP — DB-driven Growth Stage Determination
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PR-3: This module is now a thin, DB-backed shim over StageKnowledgeCache.
 * The previous ~460-line `ICAR_CALENDARS` object and `calculateGenericStage`
 * fallback (5 hardcoded crops × 4-8 stages × per-locale name × pest/disease
 * watch lists) have been DELETED. The database is the single source of truth:
 *
 *   - `public.crop_stage_master`     → DAS → growth_stage (via getStageByDAS)
 *   - `public.crop_stage_knowledge`  → pest_watch / disease_watch / actions
 *   - `public.crops`                 → multilingual stage-adjacent crop labels
 *
 * Callers MUST invoke `loadStageKnowledge(supabase)` at request boot
 * (orchestrator already does this). All accessors here are sync and
 * cache-backed. On cache miss they return a `'UNKNOWN'` result with
 * confidence 0 — never a hardcoded agronomic guess.
 *
 * VERSION: 2.0.0 — DB SSOT
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  getStageByDAS,
  getStageKnowledge,
  getStageRow,
  isStageKnowledgeLoaded,
} from '../utils/stage-knowledge-cache.ts';

// TYPE DEFINITIONS (kept for backward compatibility)

export interface GrowthStageInfo {
  stage: string;
  stage_mr: string;
  stage_hi: string;
  stage_en: string;
  min_days: number;
  max_days: number;
  critical_actions: string[];
  pest_watch: string[];
  disease_watch: string[];
  nutrient_focus: string[];
}

export interface StageCalculationResult {
  stage: string;
  stage_name: {
    mr: string;
    hi: string;
    en: string;
  };
  days_since_sowing: number;
  days_in_stage: number;
  days_remaining_in_stage: number;
  percent_complete_stage: number;
  /** 'DB_STAGE_MASTER' when found in cache; 'UNKNOWN' otherwise. */
  source: 'DB_STAGE_MASTER' | 'UNKNOWN';
  confidence: number;
  stage_info: GrowthStageInfo | null;
}

// INTERNAL HELPERS

function toGrowthStageInfo(
  crop: string,
  stageCode: string,
  dasMin: number,
  dasMax: number,
): GrowthStageInfo {
  const knowledge = getStageKnowledge(crop, stageCode);
  return {
    stage: stageCode.toUpperCase(),
    // Stage-name translations are NOT stored in crop_stage_master today.
    stage_en: stageCode.toUpperCase(),
    stage_mr: stageCode.toUpperCase(),
    stage_hi: stageCode.toUpperCase(),
    min_days: dasMin,
    max_days: dasMax,
    critical_actions: (knowledge?.critical_actions as string[]) ?? [],
    pest_watch: (knowledge?.pest_watch as string[]) ?? [],
    disease_watch: (knowledge?.disease_watch as string[]) ?? [],
    nutrient_focus: [], // not modelled in crop_stage_knowledge; leave empty
  };
}

function unknownResult(daysSinceSowing: number, reason: string): StageCalculationResult {
  console.warn(`[CROP_CALENDAR_MISS] ${reason} das=${daysSinceSowing}`);
  return {
    stage: 'UNKNOWN',
    stage_name: { mr: '', hi: '', en: 'UNKNOWN' },
    days_since_sowing: daysSinceSowing,
    days_in_stage: 0,
    days_remaining_in_stage: 0,
    percent_complete_stage: 0,
    source: 'UNKNOWN',
    confidence: 0,
    stage_info: null,
  };
}

// PUBLIC API — DB-backed replacements for the deleted ICAR_CALENDARS helpers

// DB-driven stage lookup from days since sowing.
export function calculateGrowthStageFromDAS(
  cropCode: string,
  daysSinceSowing: number,
  // FIX C1-b: explicit lane wins; omitted → request-scoped lane (ALS).
  cultivationMethod?: string | null,
): StageCalculationResult {
  if (!isStageKnowledgeLoaded()) {
    return unknownResult(daysSinceSowing, 'stage_knowledge_cache_not_loaded');
  }
  const crop = (cropCode || '').toLowerCase().trim();
  const row = getStageByDAS(crop, daysSinceSowing, cultivationMethod);
  if (!row || !row.growth_stage) {
    return unknownResult(daysSinceSowing, `no_stage_row crop=${crop}`);
  }
  const dasMin = row.das_min ?? 0;
  const dasMax = row.das_max ?? daysSinceSowing;
  const daysInStage = Math.max(0, daysSinceSowing - dasMin);
  const stageDuration = Math.max(1, dasMax - dasMin);
  const daysRemaining = Math.max(0, dasMax - daysSinceSowing);
  const percentComplete = Math.min(100, Math.round((daysInStage / stageDuration) * 100));

  return {
    stage: row.growth_stage.toUpperCase(),
    stage_name: {
      // Multilingual stage names are the LLM narration layer's job.
      // We emit the canonical code so downstream translation is deterministic.
      en: row.growth_stage.toUpperCase(),
      mr: row.growth_stage.toUpperCase(),
      hi: row.growth_stage.toUpperCase(),
    },
    days_since_sowing: daysSinceSowing,
    days_in_stage: daysInStage,
    days_remaining_in_stage: daysRemaining,
    percent_complete_stage: percentComplete,
    source: 'DB_STAGE_MASTER',
    confidence: 0.95,
    stage_info: toGrowthStageInfo(crop, row.growth_stage, dasMin, dasMax),
  };
}

// Get pest / disease / action watch lists for a crop-stage.
export function getStageWatchLists(
  cropCode: string,
  stage: string,
): { pests: string[]; diseases: string[]; nutrients: string[] } | null {
  const knowledge = getStageKnowledge(cropCode, stage);
  if (!knowledge) return null;
  return {
    pests: (knowledge.pest_watch as string[]) ?? [],
    diseases: (knowledge.disease_watch as string[]) ?? [],
    // crop_stage_knowledge does not track a dedicated nutrient_focus list;
    nutrients: [],
  };
}

// True when at least one crop_stage_master row exists for the crop.
export function hasICARCalendar(cropCode: string, cultivationMethod?: string | null): boolean {
  const crop = (cropCode || '').toLowerCase().trim();
  // Probe the SSOT — any DAS window covers a stage row.
  return !!getStageByDAS(crop, 0, cultivationMethod) || !!getStageRow(crop, 'GERMINATION', cultivationMethod);
}
