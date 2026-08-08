// =====================================================
// irrigation.ts — GOVERNED IRRIGATION QUANTITIES (F2)
// Volume:   land_weather_state.water_deficit_mm  (FAO-56 ETc chain, per land)
// Params:   sci_method_registry IRRIGATION_METHOD_PARAMS (efficiency/flow/cycle)
// Cap:      derived.infiltration_cap  (SOIL_INFILTRATION_CAPS, per soil)
// Floor:    SOIL_INFILTRATION_CAPS.min_actionable_depth_mm
// Urgency:  ALERT_URGENCY_THRESHOLDS (SWSI primary; temp/NDVI may escalate
//           ONE level, never create urgency alone)
// Returns null when governed inputs are missing — never an invented value.
// The ONLY numeric literal here is a unit conversion, not agronomy.
// =====================================================

import type { MethodParams } from './config.ts';
import type { DerivedState } from './env-derived.ts';

export const ACRE_M2_MM_TO_LITERS = 4047; // 1 mm depth over 1 acre = 4047 L (unit conversion)

export interface IrrigationInput {
  derived: DerivedState;
  weather: { temp: number | null };
  ndvi: number | null;
  irrigation_type: string | null;
  area_acres: number | null;
}

export interface IrrigationPlan {
  water_liters_per_acre: number;
  water_liters_total: number;
  duration_hours: number;
  urgency: string;
  applications: number;
  per_application_mm: number;
  frequency_days: number;
  method: string;
  source: string;
}

export function calculateIrrigationForLand(ctx: IrrigationInput, methods: MethodParams): IrrigationPlan | null {
  const deficit = ctx.derived.water_deficit;
  if (deficit == null || deficit <= 0) return null;
  const ip = methods.irrigation;
  if (!ip || !ip.efficiency) {
    console.warn('[IRRIGATION] IRRIGATION_METHOD_PARAMS not approved/available — no irrigation quantity emitted');
    return null;
  }

  const method = (ctx.irrigation_type || '').toUpperCase() || 'default';
  const efficiency = Number(ip.efficiency[method] ?? ip.efficiency.default);
  if (!Number.isFinite(efficiency) || efficiency <= 0) return null;
  const flowRate = Number(ip.flow_rate_lph?.[method] ?? ip.flow_rate_lph?.default ?? 0);
  const cycleDays = Number(ip.cycle_days?.[method] ?? ip.cycle_days?.default ?? 1);

  const minActionable = Number(methods.infiltration?.min_actionable_depth_mm ?? 0);
  const appliedMm = deficit / efficiency;
  if (minActionable > 0 && appliedMm < minActionable) return null; // carry to next cycle

  // Infiltration cap: split large depths on heavy soils (waterlogging prevention).
  let applications = 1;
  let perApplicationMm = appliedMm;
  const cap = ctx.derived.infiltration_cap;
  if (cap != null && cap > 0 && appliedMm > cap) {
    applications = Math.ceil(appliedMm / cap);
    perApplicationMm = Math.round((appliedMm / applications) * 10) / 10;
  }

  const area = ctx.area_acres || 1;
  const litersPerAcre = Math.round(appliedMm * ACRE_M2_MM_TO_LITERS);
  const totalLiters = Math.round(litersPerAcre * area);
  const durationHours = flowRate > 0 ? Math.round((totalLiters / flowRate) * 10) / 10 : 0;

  // Urgency from ALERT_URGENCY_THRESHOLDS: SWSI primary.
  let urgency = 'MONITOR';
  const ut = methods.urgency;
  const swsi = ctx.derived.swsi;
  if (ut && swsi != null) {
    if (ut.immediate?.swsi_gte != null && swsi >= Number(ut.immediate.swsi_gte)) urgency = 'IMMEDIATE';
    else if (ut.today?.swsi_gte != null && swsi >= Number(ut.today.swsi_gte)) urgency = 'TODAY';
    else if (ut.tomorrow?.swsi_gte != null && swsi >= Number(ut.tomorrow.swsi_gte)) urgency = 'TOMORROW';
    // Secondary signals escalate at most one level, never create urgency alone.
    const esc = ut.secondary_escalation || {};
    const secondaryHit =
      (esc.temp_c_gte != null && ctx.weather.temp != null && ctx.weather.temp >= Number(esc.temp_c_gte)) ||
      (esc.ndvi_lte != null && ctx.ndvi != null && ctx.ndvi <= Number(esc.ndvi_lte));
    if (secondaryHit) {
      if (urgency === 'TOMORROW') urgency = 'TODAY';
      else if (urgency === 'TODAY') urgency = 'IMMEDIATE';
    }
  }

  return {
    water_liters_per_acre: litersPerAcre,
    water_liters_total: totalLiters,
    duration_hours: durationHours,
    urgency,
    applications,
    per_application_mm: perApplicationMm,
    frequency_days: cycleDays,
    method,
    source: 'fao56:water_deficit_mm + IRRIGATION_METHOD_PARAMS@approved' + (cap != null ? ' + SOIL_INFILTRATION_CAPS@approved' : ''),
  };
}
