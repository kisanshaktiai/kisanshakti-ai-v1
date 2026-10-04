/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCIENTIFIC METHOD REGISTRY LOADER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for every coefficient / threshold used by the
 * agricultural science module. Coefficients live in public.sci_method_registry
 * (created by the Environmental Intelligence migration); code NEVER hardcodes
 * them in a formula body.
 *
 * Contract:
 *   - ONE database read per edge-function invocation (`loadSciMethods`).
 *   - The resulting `MethodsMap` is passed by value into every calculation.
 *   - Never call the DB from inside a calculation.
 *
 * VERSION: 1.0.0
 * CREATED: 2026-08-07
 */

export interface SciMethod {
  method_id: string;
  version: string;
  method_kind?: string | null;
  equation_ref?: string | null;
  authoritative_source?: string | null;
  params: Record<string, any>;
  review_status?: string | null;
}

/** method_id -> newest approved row */
export type MethodsMap = Record<string, SciMethod>;

/**
 * Last-resort mirror of the approved registry rows, used ONLY when the
 * registry read fails (network/permission). Values are byte-identical to the
 * seeded rows so behaviour never silently diverges. Any use is flagged with
 * qc_flag REGISTRY_FALLBACK by the callers that care.
 */
export const REGISTRY_FALLBACK: MethodsMap = {
  ET0_FAO56_PM: {
    method_id: "ET0_FAO56_PM", version: "1.0",
    params: { albedo: 0.23, G_daily: 0, angstrom_a: 0.25, angstrom_b: 0.50, wind_10_to_2_factor: 0.748 },
  },
  ET0_HARGREAVES: {
    method_id: "ET0_HARGREAVES", version: "1.0",
    params: { k: 0.0023, t_offset: 17.8 },
  },
  VPD_TETENS: {
    method_id: "VPD_TETENS", version: "1.0",
    params: { a: 0.6108, b: 17.27, c: 237.3 },
  },
  GDD_MODIFIED: { method_id: "GDD_MODIFIED", version: "1.0", params: {} },
  LWD_RH_THRESHOLD: {
    method_id: "LWD_RH_THRESHOLD", version: "1.0",
    params: { rh_wet_pct: 87, dpd_wet_c: 2 },
  },
  HEAT_STRESS_FLOWERING: {
    method_id: "HEAT_STRESS_FLOWERING", version: "1.0",
    params: { rice_c: 37.2, wheat_c: 27.3, maize_c: 37.9, cotton_c: 35.0, generic_c: 35.0 },
  },
  SPRAY_SUITABILITY: {
    method_id: "SPRAY_SUITABILITY", version: "1.0",
    params: {
      wind_ok_ms: [1.4, 3.6], wind_block_ms: 4.5,
      deltaT_ok_c: [2, 8], deltaT_block_c: 10,
      rh_min_pct: 45, rh_max_pct: 90, temp_max_c: 30,
      rain_free_hours: 2, rain_prob_block_pct: 60,
    },
  },
  SOIL_WATER_BALANCE_FAO56: {
    method_id: "SOIL_WATER_BALANCE_FAO56", version: "1.0",
    params: { p_default: 0.5 },
  },
  SAXTON_RAWLS_PTF: { method_id: "SAXTON_RAWLS_PTF", version: "1.0", params: {} },
  KC_NDVI_ADJUST: { method_id: "KC_NDVI_ADJUST", version: "1.0", params: { a: 0.3, b: 1.2 } },
  KC_FAO56_TABLE12: {
    method_id: "KC_FAO56_TABLE12", version: "1.0",
    params: {
      rice: { ini: 1.05, mid: 1.20, end: 0.90 },
      wheat: { ini: 0.30, mid: 1.15, end: 0.40 },
      maize: { ini: 0.30, mid: 1.20, end: 0.60 },
      cotton: { ini: 0.35, mid: 1.18, end: 0.60 },
      soybean: { ini: 0.40, mid: 1.15, end: 0.50 },
      sugarcane: { ini: 0.40, mid: 1.25, end: 0.75 },
      chickpea: { ini: 0.40, mid: 1.00, end: 0.35 },
      tomato: { ini: 0.60, mid: 1.15, end: 0.80 },
    },
  },
  FROST_COMPOSITE: {
    method_id: "FROST_COMPOSITE", version: "1.0",
    params: { wind_calm_ms: 2, cloud_clear_pct: 30, dpd_amplify_c: 5 },
  },
  CONFIDENCE_MODEL: {
    method_id: "CONFIDENCE_MODEL", version: "1.0",
    params: {
      w_agreement: 0.35, w_freshness: 0.20, w_leadtime: 0.25, w_skill: 0.20,
      sigma_ref: { AIR_TEMP: 2, RH: 10, WIND_2M: 2 },
      leadtime_factors: { d0_1: 1.0, d2_3: 0.85, d4_7: 0.65, d8p: 0.4 },
      precip_multiplier: 0.8, neutral_skill: 0.7,
    },
  },
  GDD_BASE_TEMPS: {
    method_id: "GDD_BASE_TEMPS", version: "1.0",
    params: {
      rice: { base: 10, upper: 35 }, wheat: { base: 5, upper: 32 },
      maize: { base: 10, upper: 30 }, cotton: { base: 15.6, upper: 32 },
      soybean: { base: 10, upper: 32 }, chickpea: { base: 4.79, upper: 40 },
      tomato: { base: 6, upper: 35 },
    },
  },
  SOIL_TYPE_EFFECTIVE_RAIN: {
    method_id: "SOIL_TYPE_EFFECTIVE_RAIN", version: "1.0",
    params: {
      black: 0.60, black_cotton: 0.60, vertisol: 0.60,
      red: 0.75, laterite: 0.75, alfisol: 0.75,
      sandy: 0.85, sandy_loam: 0.85, entisol: 0.85,
      alluvial: 0.70, loamy: 0.70, inceptisol: 0.70,
      clay: 0.55, clayey: 0.55, default: 0.70,
    },
  },
  EVENT_HEATWAVE_IMD: {
    method_id: "EVENT_HEATWAVE_IMD", version: "1.0",
    params: {
      tmax_min_c: 40, departure_c: 4.5, severe_departure_c: 6.4,
      absolute_c: 45, severe_absolute_c: 47, min_days: 2,
    },
  },
};

/**
 * Load the approved scientific method registry. ONE read per invocation.
 * Falls back to REGISTRY_FALLBACK (identical values) if the read fails.
 */
export async function loadSciMethods(
  supabase: { from: (t: string) => any },
  log?: (level: string, event: string, data?: Record<string, unknown>) => void,
): Promise<MethodsMap> {
  try {
    const { data, error } = await supabase
      .from("sci_method_registry")
      .select("method_id, version, method_kind, equation_ref, authoritative_source, params, review_status")
      .eq("review_status", "approved");

    if (error || !data?.length) {
      log?.("warn", "sci_registry_fallback", { error: error?.message ?? "empty" });
      return { ...REGISTRY_FALLBACK };
    }

    const map: MethodsMap = { ...REGISTRY_FALLBACK };
    for (const row of data as SciMethod[]) {
      const existing = map[row.method_id];
      if (!existing || compareVersion(row.version, existing.version) >= 0) {
        map[row.method_id] = { ...row, params: row.params ?? {} };
      }
    }
    log?.("info", "sci_registry_loaded", { methods: data.length });
    return map;
  } catch (e) {
    log?.("warn", "sci_registry_exception", { error: String(e) });
    return { ...REGISTRY_FALLBACK };
  }
}

function compareVersion(a: string, b: string): number {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Resolve `method_id@version` label for provenance stamping. */
export function methodTag(methods: MethodsMap | undefined, id: string): string {
  const m = methods?.[id] ?? REGISTRY_FALLBACK[id];
  return `${id}@${m?.version ?? "1.0"}`;
}

/** Read the params object of a method (never throws; falls back to mirror). */
export function methodParams(methods: MethodsMap | undefined, id: string): Record<string, any> {
  return methods?.[id]?.params ?? REGISTRY_FALLBACK[id]?.params ?? {};
}

/** Read a single numeric parameter of a method. */
export function methodParam(methods: MethodsMap | undefined, id: string, key: string, fallback: number): number {
  const v = methodParams(methods, id)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
