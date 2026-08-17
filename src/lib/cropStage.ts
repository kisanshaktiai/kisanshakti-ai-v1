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

// ─────────────────────────────────────────────────────────────────────────────
// Honest stage display (FIX 6)
//
// The ONLY source of boundary-zone signals is the resolver
// (`resolve_crop_phenology`) evidence array. Never compute grace days on the
// client. `boundary_grace_days` is agronomist-populated in crop_stage_master;
// until it is set the resolver emits nothing and this returns no framing.
// ─────────────────────────────────────────────────────────────────────────────

/** Resolver sources that are calendar inferences, not observations. */
export const PROVISIONAL_STAGE_SOURCES = [
  'das_provisional',
  'das_ledger_provisional',
  'gate_constrained_calendar',
] as const;

export type StageBoundaryZone = 'approaching_next_stage' | 'recently_entered' | null;

export interface StageDisplayDescriptor {
  /** Raw stage name from the resolver (never derived client-side). */
  stage: string | null;
  /** Boundary framing signalled by the resolver's evidence array. */
  boundaryZone: StageBoundaryZone;
  /** True when the stage came from a calendar inference, not an observation. */
  isEstimated: boolean;
}

interface PhenologyLike {
  growth_stage?: string | null;
  stage_code?: string | null;
  source?: string | null;
  evidence?: unknown;
  evidence_sources?: unknown;
}

function evidenceList(phen: PhenologyLike | null | undefined): string[] {
  const raw = (phen?.evidence ?? phen?.evidence_sources) as unknown;
  if (Array.isArray(raw)) return raw.filter((e): e is string => typeof e === 'string');
  return [];
}

export function describeResolvedStage(
  phen: PhenologyLike | null | undefined,
): StageDisplayDescriptor {
  const stage = phen?.growth_stage ?? phen?.stage_code ?? null;
  const zoneEntry = evidenceList(phen).find((e) => e.startsWith('boundary_zone:'));
  const zoneValue = zoneEntry ? zoneEntry.slice('boundary_zone:'.length).trim() : null;
  const boundaryZone: StageBoundaryZone =
    zoneValue === 'approaching_next_stage' || zoneValue === 'recently_entered' ? zoneValue : null;
  const source = (phen?.source ?? '').toLowerCase();
  const isEstimated = (PROVISIONAL_STAGE_SOURCES as readonly string[]).includes(source);
  return { stage, boundaryZone, isEstimated };
}

/**
 * Render the descriptor into farmer-facing text. `t` is the i18next translator
 * so every string stays translatable; defaults are English fallbacks only.
 * Never emits day-precision phrasing for calendar-derived stages.
 */
export function formatResolvedStage(
  phen: PhenologyLike | null | undefined,
  t: (key: string, opts?: any) => string,
): string | null {
  const { stage, boundaryZone, isEstimated } = describeResolvedStage(phen);
  if (!stage) return null;

  let text: string;
  if (boundaryZone === 'approaching_next_stage') {
    text = t('stage.approachingNext', {
      defaultValue: '{{stage}} (transitioning to the next stage around now)',
      stage,
    });
  } else if (boundaryZone === 'recently_entered') {
    text = t('stage.recentlyEntered', {
      defaultValue: 'Recently entered {{stage}}',
      stage,
    });
  } else {
    text = stage;
  }

  if (isEstimated) {
    text = t('stage.estimatedPrefix', { defaultValue: 'Estimated: {{text}}', text });
  }
  return text;
}
