/**
 * Pure helpers for deriving crop stage and expected harvest date from a
 * sowing date + crop duration. Used by SmartLandConfirmCard so that we
 * always store crop_stage, planting_date, last_sowing_date, cultivation_date
 * and expected_harvest_date together — a hard requirement called out by the
 * user ("the last cultivation date and the current new crop addition with
 * date is also most important").
 */

export interface CropStageResult {
  stage: string;             // canonical stage label
  stageKey: string;          // i18n key suffix
  expectedHarvestDate: string | null; // ISO yyyy-mm-dd
  daysSinceSowing: number;
  progressPercent: number;   // 0..100
}

/**
 * Map normalised progress (0..1) to a coarse generic stage. Crop-specific
 * tuning happens server-side; this is only a UX hint for the confirm card.
 */
function stageFromProgress(progress: number): { stage: string; stageKey: string } {
  if (progress < 0) return { stage: 'Pre-sowing', stageKey: 'pre_sowing' };
  if (progress < 0.1) return { stage: 'Germination', stageKey: 'germination' };
  if (progress < 0.3) return { stage: 'Vegetative', stageKey: 'vegetative' };
  if (progress < 0.55) return { stage: 'Tillering / Branching', stageKey: 'tillering' };
  if (progress < 0.75) return { stage: 'Flowering', stageKey: 'flowering' };
  if (progress < 0.95) return { stage: 'Grand growth', stageKey: 'grand_growth' };
  return { stage: 'Maturity', stageKey: 'maturity' };
}

export function deriveCropCycle(
  sowingDateIso: string | null | undefined,
  durationDays: number | null | undefined,
  landPrepDaysEarlier: number = 0,
): CropStageResult & {
  plantingDate: string | null;
  cultivationDate: string | null;
  lastSowingDate: string | null;
} {
  if (!sowingDateIso) {
    return {
      stage: '—',
      stageKey: 'unknown',
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

  const { stage, stageKey } = stageFromProgress(progress);

  // cultivation = land preparation date (sowing − N days). If no offset
  // provided, cultivation_date == planting_date so all three columns stay
  // consistent and downstream pipelines never see NULL.
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
  // Conservative defaults — farmer can pick exact date if they want.
  const m =
    season === 'kharif' ? 6 :   // June
    season === 'rabi'   ? 10 :  // October
                          2;    // March (summer)
  const d = season === 'kharif' ? 15 : 15;
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}
