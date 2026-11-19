// =====================================================
// v133 — CROP-CYCLE GATE (2026-11-19)
//
// A crop alert is about a crop that is in the field now. The rule is the same
// everywhere (SQL public.land_has_active_crop_cycle, the satellite screen
// useFieldSky.ts, the NDVI pipeline db.py):
//   the land is in a crop-on-field lifecycle state AND has an ACTIVE crop
//   schedule with a sowing date (buildScheduleMap in index.ts keeps only those).
//
// The database keeps lands.lifecycle_status in step with the schedule:
//   fn_block_double_active_schedule        new active schedule -> CROP_ACTIVE (resume)
//   fn_release_land_on_schedule_deactivate schedule closed / cancelled -> AVAILABLE
//   fn_cascade_harvest_completion          harvest confirmed -> AVAILABLE
//   run_daily_crop_cycle_close (20261119)  harvest window passed + grace, farmer
//                                          never confirmed -> schedule closed -> AVAILABLE
//
// What the land row keeps after a crop ends (current_crop, last_sowing_date,
// cultivation_date, expected_harvest_date, stage cache) is the finished crop's
// history. Audit 2026-11-19: 22 of 23 released lands still carried a crop name
// and 21 of 28 pending alerts sat on released lands, with crop ages of up to
// 800 days ("Time to water", "Crop Under Stress!" on fields with no crop).
//
// crop_schedules.lifecycle_status is NOT used: on 2026-11-19, 3 of the 8 crops
// really growing still read PLANNED, so a GROWING check would silence true
// alerts on standing crops.
//
// The values below are the land_lifecycle_status enum's own labels, not agronomy.
// =====================================================

/** Land lifecycle states that mean "a crop is on this land now" (land_lifecycle_status enum). */
export const CROP_ON_FIELD_LIFECYCLES: ReadonlySet<string> = new Set(['CROP_ACTIVE', 'READY_FOR_HARVEST', 'WAITING_HARVEST_CONFIRMATION']);

/** Why a land's crop alerts are on hold. */
export type CropCycleHoldReason =
  /** no active schedule with a sowing date: the crop ended, was closed or cancelled, or is not sown yet */
  | 'no_active_sown_schedule'
  /** an active schedule exists but the land is not in a crop-on-field state — the two disagree, so nothing is said */
  | 'land_released';

export type CropCycleGate<S> =
  | { active: true; schedule: S }
  | { active: false; reason: CropCycleHoldReason };

/**
 * The crop cycle the evaluator may speak about, or why it must stay quiet.
 * The schedule is the only source of crop identity, sowing date and expected
 * harvest for an active crop — never the land row's leftovers.
 */
export function cropCycleGate<S>(landLifecycle: string | null | undefined, activeSownSchedule: S | null | undefined): CropCycleGate<S> {
  if (!activeSownSchedule) return { active: false, reason: 'no_active_sown_schedule' };
  if (!CROP_ON_FIELD_LIFECYCLES.has(String(landLifecycle ?? '').trim().toUpperCase())) {
    return { active: false, reason: 'land_released' };
  }
  return { active: true, schedule: activeSownSchedule };
}
