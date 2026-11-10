/** Schedule decision contract. Pure functions, shared by the reconciler and tests.
 * A WATCH/measurement request cannot authorize applying a fertilizer quantity.
 */
export const WATER_KEYS = {
  irrigate: "water:irrigate",
  noIrrigation: "water:ok",
  unknown: "water:no_data",
} as const;

export function isNoIrrigationDecision(key: string | null | undefined): boolean {
  return key === WATER_KEYS.noIrrigation || key === "water:no_irrigation";
}

export function canAdvanceNutrient(decision: {
  status: string;
  action_code: string | null;
} | null): boolean {
  return !!decision && decision.status === "DUE" &&
    decision.action_code === "APPLY_NUTRIENT_VERIFIED";
}

export function irrigationDeferralWithinStage(
  nextDate: string,
  sowingDate: string | null,
  windowEndDas: number | null,
): boolean {
  if (!sowingDate || windowEndDas == null || !Number.isFinite(windowEndDas)) return false;
  const ms = new Date(sowingDate + "T00:00:00Z").getTime() + windowEndDas * 86400000;
  const endIso = new Date(ms).toISOString().slice(0, 10);
  return nextDate <= endIso;
}
