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

/** A nutrient card may only be advanced by a verified decision; prefer it over any WATCH request. */
export function pickNutrientDecision<T extends { status: string; action_code: string | null }>(decisions: T[]): T | null {
  return decisions.find((d) => canAdvanceNutrient(d)) ?? decisions.find((d) => d.status === "DUE" || d.status === "WATCH") ?? null;
}

/**
 * 2026-11-12 — thermal evidence for a calendar-resolved (provisional) stage.
 * Compares the land's accumulated GDD with the resolved stage's OWN thermal window from
 * crop_stage_master. It never moves a task: a provisional stage stays non-authoritative, but the
 * ledger now states whether weather-derived thermal time agrees with the calendar, so a
 * disagreement is visible instead of every run reading "provisional_stage_source".
 */
export type ThermalEvidence = "no_thermal_window" | "no_gdd" | "corroborated" | "gdd_ahead_of_stage" | "gdd_behind_stage";
export function thermalStageEvidence(currentGdd: unknown, gddMin: unknown, gddMax: unknown): ThermalEvidence {
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const min = num(gddMin), max = num(gddMax), gdd = num(currentGdd);
  if (min == null || max == null || max < min) return "no_thermal_window";
  if (gdd == null) return "no_gdd";
  return gdd < min ? "gdd_behind_stage" : gdd > max ? "gdd_ahead_of_stage" : "corroborated";
}

/** What the adjusted task's audit row records about how fresh each evidence stream was. */
export function evidenceFreshness(snapshot: Record<string, unknown> | null, todayIso: string): Record<string, unknown> {
  const obj = (v: unknown) => (v && typeof v === "object" ? v as Record<string, unknown> : null);
  const age = (d: unknown) => {
    const t = Date.parse(String(d ?? "").slice(0, 10) + "T00:00:00Z"), now = Date.parse(todayIso + "T00:00:00Z");
    return Number.isFinite(t) && Number.isFinite(now) ? Math.round((now - t) / 86400000) : null;
  };
  const water = obj(snapshot?.water), canopy = obj(snapshot?.canopy);
  const observations = Array.isArray(snapshot?.observations) ? snapshot!.observations as unknown[] : [];
  return {
    state_age_days: age(snapshot?.state_date),
    water_age_days: water ? age(water.metric_date) : null,
    satellite_age_days: canopy ? age(canopy.date) : null,
    farmer_observations: observations.length,
    gaps: Array.isArray(snapshot?.gaps) ? snapshot!.gaps : [],
  };
}
