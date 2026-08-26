/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WATER-EVENT HELPERS (P0 water-state repairs)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, testable helpers for the daily derive pipeline:
 *   - resolving IRRIGATION_APPLIED crop_lifecycle_events payloads to mm
 *   - runoff from the persisted infiltration capacity
 *   - the root-zone irrigation authority decision
 *   - the depletion-ceiling QC guard
 *
 * INVARIANTS
 * - Never estimate or invent a missing discharge / area / infiltration value.
 *   Unresolvable events are SKIPPED with an explicit reason string.
 * - No new QC system: reasons are plain strings appended to the existing
 *   derive outcome reasons (qc trace).
 * - Urgency bands come from sci_method_registry (SWSI_STAGE_SENSITIVITY
 *   class_breaks) — the project's existing approved breaks; the label set
 *   (LOW/MEDIUM/HIGH/CRITICAL) is the existing irrigation_urgency column
 *   domain consumed by the UI. No new scale is invented.
 */

import type { MethodsMap } from "./sci-methods.ts";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

/** m² per acre (exact definition of the international acre). */
const M2_PER_ACRE = 4046.8564224;

export const REASON_IRRIG_NO_AREA = "IRRIG_EVENT_NO_AREA";
export const REASON_IRRIG_NO_DISCHARGE = "IRRIG_EVENT_NO_DISCHARGE";
export const REASON_IRRIG_MALFORMED = "IRRIG_EVENT_MALFORMED";
export const REASON_RUNOFF_UNMODELLED = "RUNOFF_UNMODELLED";
export const REASON_DEPLETION_UNVERIFIED_CEILING = "DEPLETION_UNVERIFIED_CEILING";
export const cropUnresolvedReason = (label: string) =>
  `CROP_CODE_UNRESOLVED:${label || "EMPTY"}`;
export const kcUnresolvedReason = (crop: string) => `KC_UNRESOLVED:${crop}`;

export interface IrrigationEventResolution {
  depthMm: number | null;
  reason: string | null;
}

/**
 * Resolve ONE irrigation event payload to an applied depth in mm.
 * Priority (exact):
 *   1. payload.applied_depth_mm            — used directly when finite and > 0
 *   2. payload.volume_litres               — depth = litres / (acres · 4046.8564224)
 *   3. payload.duration_minutes + pump_discharge_lph — litres = min/60 · lph
 * Missing area / discharge are NEVER estimated — the event is skipped with a
 * reason. Malformed / non-finite / negative values are ignored.
 */
export function resolveIrrigationEventDepthMm(
  payload: unknown,
  areaAcres: number | null,
): IrrigationEventResolution {
  const p = (payload ?? {}) as Record<string, unknown>;

  const depth = num(p.applied_depth_mm);
  if (depth !== null && depth > 0) return { depthMm: depth, reason: null };

  let litres = num(p.volume_litres);
  if (litres === null || litres <= 0) {
    const minutes = num(p.duration_minutes);
    const discharge = num(p.pump_discharge_lph);
    if (minutes !== null && minutes > 0) {
      if (discharge === null || discharge <= 0) {
        // DO NOT estimate a default discharge.
        return { depthMm: null, reason: REASON_IRRIG_NO_DISCHARGE };
      }
      litres = (minutes / 60) * discharge;
    }
  }

  if (litres !== null && litres > 0) {
    if (areaAcres === null || !(areaAcres > 0)) {
      return { depthMm: null, reason: REASON_IRRIG_NO_AREA };
    }
    // 1 mm over 1 m² = 1 litre → depth_mm = litres / area_m²
    return { depthMm: litres / (areaAcres * M2_PER_ACRE), reason: null };
  }

  return { depthMm: null, reason: REASON_IRRIG_MALFORMED };
}

export interface IrrigationSummary {
  /** Total resolved irrigation depth (mm). 0 when no event resolved. */
  irrigationMm: number;
  /** Number of successfully resolved events. 0 when none resolved. */
  eventsUsed: number;
  /** One reason per skipped event (never hidden). */
  reasons: string[];
}

/** Sum a day's irrigation event payloads into a total applied depth. */
export function summarizeIrrigationEvents(
  payloads: unknown[],
  areaAcres: number | null,
): IrrigationSummary {
  let irrigationMm = 0;
  let eventsUsed = 0;
  const reasons: string[] = [];
  for (const payload of payloads ?? []) {
    const r = resolveIrrigationEventDepthMm(payload, areaAcres);
    if (r.depthMm !== null) {
      irrigationMm += r.depthMm;
      eventsUsed++;
    } else if (r.reason) {
      reasons.push(r.reason);
    }
  }
  return { irrigationMm, eventsUsed, reasons };
}

export interface RunoffResult {
  runoffMm: number;
  reason: string | null;
}

/**
 * Runoff from the already-derived/persisted infiltration capacity:
 *   runoff = max(0, rain − infiltration_cap)
 * Null infiltration capacity → runoff 0 + RUNOFF_UNMODELLED (never invented).
 */
export function computeRunoffMm(
  rainMm: number,
  infiltrationCapMm: number | null,
): RunoffResult {
  if (infiltrationCapMm === null || !Number.isFinite(infiltrationCapMm)) {
    return { runoffMm: 0, reason: REASON_RUNOFF_UNMODELLED };
  }
  return { runoffMm: Math.max(0, rainMm - infiltrationCapMm), reason: null };
}

/**
 * P0-3B — the ONLY irrigation authority.
 * irrigation_needed = root_depletion_mm > raw_mm.
 * NULL when either side is unavailable: absence of computation is NOT the
 * absence of irrigation need (never write false when unavailable).
 */
export function rootZoneIrrigationDecision(
  rootDepletionMm: number | null,
  rawMm: number | null,
): boolean | null {
  if (rootDepletionMm === null || rawMm === null) return null;
  return rootDepletionMm > rawMm;
}

export type IrrigationUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Urgency from the depletion/TAW ratio through the project's EXISTING approved
 * breaks (sci_method_registry SWSI_STAGE_SENSITIVITY.class_breaks —
 * mild/moderate/severe), mapped onto the irrigation_urgency column's existing
 * label domain (LOW/MEDIUM/HIGH/CRITICAL). Null when the ratio cannot be
 * computed or the registry breaks are absent — never an invented scale.
 */
export function irrigationUrgencyFromDepletion(
  rootDepletionMm: number | null,
  tawMm: number | null,
  methods?: MethodsMap,
): IrrigationUrgency | null {
  if (rootDepletionMm === null || tawMm === null || !(tawMm > 0)) return null;
  const breaks = (methods?.SWSI_STAGE_SENSITIVITY?.params?.class_breaks ?? {}) as Record<string, unknown>;
  const mild = num(breaks.mild);
  const moderate = num(breaks.moderate);
  const severe = num(breaks.severe);
  if (mild === null || moderate === null || severe === null) return null;
  const ratio = rootDepletionMm / tawMm;
  if (ratio >= severe) return "CRITICAL";
  if (ratio >= moderate) return "HIGH";
  if (ratio >= mild) return "MEDIUM";
  return "LOW";
}

/**
 * P0-1E — saturation / unverified-state guard.
 * True when depletion sits at the ceiling (>= 98% of TAW) with no irrigation
 * applied today AND no IRRIGATION_APPLIED event in the previous 21 days —
 * i.e. the bucket may have ratcheted without ground truth. This is a
 * confidence/QC signal, never a calculation override.
 */
export function isDepletionUnverifiedCeiling(
  depletionMm: number | null,
  tawMm: number | null,
  irrigationMm: number,
  hadIrrigationEventLast21d: boolean,
): boolean {
  if (depletionMm === null || tawMm === null || !Number.isFinite(tawMm)) return false;
  return (
    depletionMm >= 0.98 * tawMm &&
    irrigationMm === 0 &&
    !hadIrrigationEventLast21d
  );
}

/** Cap applied to the WATER confidence component when the ceiling guard fires. */
export const DEPLETION_UNVERIFIED_CONFIDENCE_CAP = 0.3;
