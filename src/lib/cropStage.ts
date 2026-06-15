/**
 * Pure helpers for deriving DAS + expected harvest from a sowing date.
 *
 * IMPORTANT — agronomic source of truth:
 *   • Sowing date  ← crop_schedules.sowing_date (DB)
 *   • Stage windows ← crop_stage_master (DB, resolved on the backend by
 *     resolveCropTimeline). We DO NOT invent a stage from frontend code.
 *
 * deriveCropCycle therefore returns the raw timeline (DAS, expected harvest,
 * progress) and exposes an optional `stageOverride` callers should pass when
 * they already have the server-resolved growth stage (e.g. from landContext
 * or a `crop_stage_master` lookup). When no override is given, the stage
 * label is returned as 'Unknown' — never guessed.
 */

export interface CropStageResult {
  stage: string;             // canonical stage label, or 'Unknown'
  stageKey: string;          // i18n key suffix
  expectedHarvestDate: string | null; // ISO yyyy-mm-dd
  daysSinceSowing: number;
  progressPercent: number;   // 0..100
}

export function deriveCropCycle(
  sowingDateIso: string | null | undefined,
  durationDays: number | null | undefined,
  landPrepDaysEarlier: number = 0,
  stageOverride?: { stage: string; stageKey: string } | null,
): CropStageResult & {
  plantingDate: string | null;
  cultivationDate: string | null;
  lastSowingDate: string | null;
} {
  if (!sowingDateIso) {
    return {
      stage: stageOverride?.stage ?? '—',
      stageKey: stageOverride?.stageKey ?? 'unknown',
      expectedHarvestDate: null,
      daysSinceSowing: 0,
      progressPercent: 0,
      plantingDate: null,
      cultivationDate: null,
      lastSowingDate: null,
    };
  }
  const sowing = new Date(sowingDateIso + 'T00:00:00Z');
  const now = new Date();
  const dayMs = 86400000;
  const daysSinceSowing = Math.max(0, Math.floor((now.getTime() - sowing.getTime()) / dayMs));

  let expectedHarvestDate: string | null = null;
  let progress = 0;
  if (durationDays && durationDays > 0) {
    const harvest = new Date(sowing.getTime() + durationDays * dayMs);
    expectedHarvestDate = harvest.toISOString().slice(0, 10);
    progress = Math.min(1.2, daysSinceSowing / durationDays);
  }

  // No code-side stage guess. If the caller hasn't supplied a server-resolved
  // stage we surface 'Unknown' explicitly so missing data is visible.
  const stage = stageOverride?.stage ?? 'Unknown';
  const stageKey = stageOverride?.stageKey ?? 'unknown';

  // cultivation = land preparation date (sowing − N days).
  const cultivation = new Date(sowing.getTime() - Math.max(0, landPrepDaysEarlier) * dayMs);

  return {
    stage,
    stageKey,
    expectedHarvestDate,
    daysSinceSowing,
    progressPercent: Math.min(100, Math.round(progress * 100)),
    plantingDate: sowingDateIso,
    lastSowingDate: sowingDateIso,
    cultivationDate: cultivation.toISOString().slice(0, 10),
  };
}

/**
 * Convert a coarse season chip ("kharif" / "rabi" / "summer") into a sensible
 * default sowing date for the current Indian agronomic year.
 */
export function seasonToSowingDate(season: 'kharif' | 'rabi' | 'summer'): string {
  const y = new Date().getFullYear();
  const m =
    season === 'kharif' ? 6 :
    season === 'rabi'   ? 10 :
                          2;
  const d = 15;
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}
