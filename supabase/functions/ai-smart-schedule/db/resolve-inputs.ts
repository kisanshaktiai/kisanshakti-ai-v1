// CHANGE LOG
// 2026-08-28 — P0 counter-audit fixes (verified live 2026-08-28):
//   (1) REGION: district_zone_mapping scan removed — the live table is (id, district_id,
//       zone_id) with ZERO rows and no name/zone_code columns, so the scan resolved nothing.
//       Real root cause: wrong table family. fertilizer_recommendation_master.region_code
//       holds state-region codes ('IN-MH'), i.e. the established v_land_region derivation
//       (lands.state_id → states.code → 'IN-'||code). Region now reads v_land_region by land_id.
//   (2) CROP CYCLE: the 'plant' guess is gone. Multiple real cycles with no explicit choice
//       now return AMBIGUOUS_CROP_CYCLE (sugarcane: sett_planted plant vs ratoon are distinct
//       phenologies) — surfaced as 422 CROP_CYCLE_REQUIRED with DB-derived options, exactly
//       like the cultivation-method pattern.
//   (3) READY-MADE PLANT: the literal 'transplanted' mapping moved out of index.ts; the flag
//       now resolves through cultivation_method_master.requires_nursery ∩ the crop's own
//       stage-graph methods — DB metadata, unique match only, else the ambiguity path.
// 2026-08-28 — P0-A: DB-driven stage-clock resolution. New ResolvedInputs.stageClockMethod
//   resolved via the EXISTING public.fn_effective_method(crop, method) — a recursive walk of
//   cultivation_method_master.parent_method_code that returns the nearest ancestor (or self)
//   with an active crop_stage_master graph. Declared hierarchy only: no string matching, no
//   cross-family fallback (transplanted and direct_seeded have separate roots), NULL when no
//   declared ancestor has stages (surfaced as a gap, never guessed).
// 2026-08-24 17:47 UTC — P0: resolveCultivationMethod returns "__AMBIGUOUS__" when the crop's
//   stage graph defines >1 method and nothing resolved one, so index.ts can 422 instead of
//   generating a schedule that merges two phenologies.
// 2026-08-22 06:10 UTC — cropCycle fallback fix (cycle-aware). The prior fallback ('plant',
//   added 2026-08-19) zeroed out getStages for the 23/24 crops whose crop_stage_master rows are
//   all crop_cycle='universal' (rice, wheat, cotton, maize, …) → empty schedules. Switching the
//   fallback to 'universal' fixes those crops but BREAKS sugarcane, whose stages are tagged
//   'plant'(21)+'ratoon'(3) with no 'universal' rows (verified: 0 stages, crop_stage_master_no_rows).
//   Sugarcane has 2 distinct non-universal cycles so the distinct-cycle inference can't pick one.
//   Resolution: cycle-aware fallback that reuses the already-fetched stage cycles — 'universal'
//   when the crop has any universal stage, else the crop's primary real cycle ('plant' when
//   present, which is how sugarcane resolves to plant). The single-cycle inference is retained.
// 2026-08-19 18:10 UTC — cropCycle fix: exclude 'universal' from the stage-graph distinct-cycle
//   check (it means "applies to any cycle", not a real cycle) and default to 'plant' when no
//   single non-universal cycle can be inferred. Prevents NOT NULL violation on
//   crop_schedules.crop_cycle for crops like rice (plant/ratoon/universal).
// 2026-08-17 13:55 UTC — Phase 1: created server-side input resolver. Resolves farmer free-text
//   crop/variety/cultivation inputs to database IDs. ZERO hardcoded agronomy.

// 2026-08-25 18:55 UTC — P0-2B: resolveCrop now delegates to the SHARED DB-backed
//   canonical crop resolver (_shared/crop-resolver.ts) so the weather derive pipeline
//   and the schedule resolver use ONE lookup algorithm (crops SSOT + crop_synonyms).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveCropCanonical } from "../../_shared/crop-resolver.ts";

export interface ResolvedInputs {
  cropCode: string | null;
  cropId: string | null;
  cropLabel: string | null;
  cropLabelLocal: string | null;
  varietyId: string | null;
  varietyName: string | null;
  varietyNameLocal: string | null;
  cultivationMethod: string | null;
  /** Canonical method whose crop_stage_master graph clocks this schedule (fn_effective_method).
   *  Equals cultivationMethod when that method has its own stage graph; NULL when no declared
   *  ancestor has one. Persist THIS on crop_schedules.cultivation_method — the DB phenology
   *  resolvers (resolve_crop_phenology & co.) exact-match the stored method as SSOT. */
  stageClockMethod: string | null;
  cropCycle: string | null;
  landAreaAcres: number | null;
  landAreaHa: number | null;
  state: string | null;
  district: string | null;
  regionCode: string | null;
  soilFertilityClass: string | null;
  soilTestId: string | null;
  sowingDate: string | null;
  transplantDate: string | null;
  gaps: string[];
  provenance: Record<string, unknown>;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Sentinel: the crop defines several cultivation methods and none could be resolved. */
export const AMBIGUOUS_CULTIVATION_METHOD = "__AMBIGUOUS__";

/** Sentinel: the crop's stage graph defines several real cycles and none could be resolved. */
export const AMBIGUOUS_CROP_CYCLE = "__AMBIGUOUS_CYCLE__";

/** Distinct non-universal crop cycles the crop's active stage graph defines (DB-derived options). */
export async function getCropCycleOptions(
  supabase: SupabaseClient,
  cropCode: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("crop_stage_master")
    .select("crop_cycle")
    .eq("crop_code", cropCode)
    .eq("is_active", true);
  return [
    ...new Set(
      (data || [])
        .map((r: Record<string, unknown>) => String(r.crop_cycle ?? "").trim())
        .filter((c) => c && c.toLowerCase() !== "universal"),
    ),
  ];
}

/** Distinct non-null cultivation methods a crop's stage graph defines. */
export async function getCultivationMethodOptions(
  supabase: SupabaseClient,
  cropCode: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("crop_stage_master")
    .select("cultivation_method")
    .eq("crop_code", cropCode)
    .eq("is_active", true);
  return [
    ...new Set(
      (data || [])
        .map((r: Record<string, unknown>) => r.cultivation_method)
        .filter(Boolean)
        .map(String),
    ),
  ].sort();
}

/**
 * Resolve a farmer-typed crop name (any language) to a DB crop row.
 * Delegates to the shared canonical resolver — do NOT re-add a local copy of
 * the lookup algorithm here (single resolver invariant, P0-2B).
 */
async function resolveCrop(supabase: SupabaseClient, cropName: string) {
  const match = await resolveCropCanonical(supabase, cropName);
  return match ? { row: match.row, matchedVia: match.matchedVia } : null;
}

/** Resolve a variety name to master_products (the variety SSOT). */
async function resolveVariety(
  supabase: SupabaseClient,
  cropId: string | null,
  varietyName: string | null,
  language: string,
) {
  if (!varietyName || !varietyName.trim()) return null;
  const q = norm(varietyName);

  let query = supabase
    .from("master_products")
    .select("id, name, variety_code, label_hi, label_mr, crop_id")
    .not("variety_code", "is", null)
    .limit(500);
  if (cropId) query = query.eq("crop_id", cropId);
  const { data } = await query;

  const rows = data || [];
  const hit =
    rows.find((v: Record<string, unknown>) => norm(v.name) === q || norm(v.variety_code) === q || norm(v.label_hi) === q || norm(v.label_mr) === q) ||
    rows.find((v: Record<string, unknown>) => norm(v.name).includes(q));
  if (!hit) return null;

  const { data: tr } = await supabase
    .from("variety_translations")
    .select("display_name, language_code")
    .eq("variety_id", (hit as Record<string, unknown>).id as string);
  const local = (tr || []).find((t: Record<string, unknown>) => norm(t.language_code) === norm(language));

  return {
    id: (hit as Record<string, unknown>).id as string,
    name: (hit as Record<string, unknown>).name as string,
    localName: (local?.display_name as string) || null,
  };
}

/** Resolve the cultivation method the farmer actually uses, from DB masters only. */
async function resolveCultivationMethod(
  supabase: SupabaseClient,
  cropCode: string | null,
  requested: string | null,
  varietyId: string | null,
  isReadyMadePlant: boolean,
): Promise<string | null> {
  const q = norm(requested);

  const { data: methods } = await supabase
    .from("cultivation_method_master")
    .select("*")
    .limit(200);

  if (q && methods) {
    const hit = methods.find((m: Record<string, unknown>) =>
      Object.values(m).some((v) => typeof v === "string" && norm(v) === q)
    );
    if (hit) {
      const code = (hit as Record<string, unknown>).method_code ?? (hit as Record<string, unknown>).code ?? (hit as Record<string, unknown>).value;
      if (code) return String(code);
    }
  }

  // "Ready-made plant" resolves through DB metadata, never a literal method code:
  // the candidate set is the crop's OWN active stage-graph methods, filtered to
  // cultivation_method_master rows declaring requires_nursery = true. A unique
  // survivor wins (rice: {direct_seeded, transplanted} ∩ nursery ⇒ transplanted).
  // Zero or several survivors fall through to the ambiguity logic below, which
  // surfaces the DB-derived options instead of guessing.
  if (!q && isReadyMadePlant && cropCode && methods) {
    const { data: graphRows } = await supabase
      .from("crop_stage_master")
      .select("cultivation_method")
      .eq("crop_code", cropCode)
      .eq("is_active", true);
    const graphMethods = new Set(
      (graphRows || [])
        .map((r: Record<string, unknown>) => norm(r.cultivation_method))
        .filter(Boolean),
    );
    const nursery = methods.filter(
      (m: Record<string, unknown>) =>
        m.is_active !== false &&
        m.requires_nursery === true &&
        graphMethods.has(norm(m.method_code)),
    );
    if (nursery.length === 1) return String((nursery[0] as Record<string, unknown>).method_code);
  }

  // If the variety only supports one method, use it (DB-derived, not assumed)
  if (varietyId) {
    const { data: vca } = await supabase
      .from("variety_cultivation_agronomy")
      .select("cultivation_method")
      .eq("variety_id", varietyId)
      .eq("is_active", true)
      .eq("is_suitable", true);
    const distinct = [...new Set((vca || []).map((r: Record<string, unknown>) => String(r.cultivation_method)))];
    if (distinct.length === 1) return distinct[0];
  }

  // If the crop's stage graph only defines one method, use it. If it defines MORE than
  // one and nothing above resolved a method, the schedule is structurally ambiguous
  // (rice would merge transplanted + DSR phenologies) — surface it, never guess.
  if (cropCode) {
    const { data: stages } = await supabase
      .from("crop_stage_master")
      .select("cultivation_method")
      .eq("crop_code", cropCode)
      .eq("is_active", true);
    const distinct = [...new Set((stages || []).map((r: Record<string, unknown>) => r.cultivation_method).filter(Boolean).map(String))];
    if (distinct.length === 1) return distinct[0];
    if (!requested && distinct.length > 1) return AMBIGUOUS_CULTIVATION_METHOD;
  }

  return requested ? String(requested) : null;
}


export async function resolveInputs(
  supabase: SupabaseClient,
  params: {
    landId: string;
    cropName: string;
    cropVariety?: string | null;
    cultivationMethod?: string | null;
    isReadyMadePlant?: boolean;
    cropCycle?: string | null;
    sowingDate?: string | null;
    transplantDate?: string | null;
    language: string;
  },
): Promise<ResolvedInputs> {
  const gaps: string[] = [];
  const provenance: Record<string, unknown> = {};

  const { data: land } = await supabase
    .from("lands")
    .select("id, area_acres, area_guntas, state, district, taluka, soil_type, crop_cycle, transplant_date, cultivation_date, planting_date")
    .eq("id", params.landId)
    .maybeSingle();

  if (!land) gaps.push("land_not_found");

  // Land area — never silently defaults to 1 acre
  let landAreaAcres: number | null = null;
  if (land?.area_acres && Number(land.area_acres) > 0) landAreaAcres = Number(land.area_acres);
  else if (land?.area_guntas && Number(land.area_guntas) > 0) landAreaAcres = Number(land.area_guntas) / 40;
  if (landAreaAcres == null) gaps.push("land_area_missing");

  const cropMatch = await resolveCrop(supabase, params.cropName);
  if (!cropMatch) gaps.push("crop_unresolved");
  const cropRow = (cropMatch?.row || {}) as Record<string, unknown>;
  provenance.crop_match = cropMatch?.matchedVia || null;

  const cropCode = cropRow.value ? String(cropRow.value) : null;
  const langKey = `label_${params.language}`;
  const cropLabelLocal =
    (cropRow[langKey] as string) || (cropRow.local_name as string) || (cropRow.label as string) || null;

  const variety = await resolveVariety(supabase, (cropRow.id as string) || null, params.cropVariety || null, params.language);
  if (params.cropVariety && !variety) gaps.push("variety_unresolved");

  const cultivationMethod = await resolveCultivationMethod(
    supabase,
    cropCode,
    params.cultivationMethod || null,
    variety?.id || null,
    params.isReadyMadePlant === true,
  );
  if (!cultivationMethod) gaps.push("cultivation_method_unresolved");

  // ── P0-A: stage-clock method via the DB's own hierarchy (fn_effective_method) ──
  // Verified live: rice/direct_seeded_dry → direct_seeded; unknown method → null.
  // The walk follows ONLY parent_method_code links declared in cultivation_method_master,
  // so incompatible phenologies (transplanted vs direct-seeded families) can never merge.
  let stageClockMethod: string | null = null;
  if (cropCode && cultivationMethod && cultivationMethod !== AMBIGUOUS_CULTIVATION_METHOD) {
    const { data: eff, error: effErr } = await supabase.rpc("fn_effective_method", {
      p_crop_code: cropCode,
      p_method_code: cultivationMethod,
    });
    if (effErr) {
      gaps.push(`stage_clock_lookup_failed:${effErr.message}`);
    } else if (typeof eff === "string" && eff) {
      stageClockMethod = eff;
      if (stageClockMethod !== cultivationMethod) {
        provenance.stage_clock = {
          table: "cultivation_method_master",
          note: `stage clock inherited from declared parent: ${cultivationMethod} -> ${stageClockMethod}`,
        };
      }
    } else {
      // No ancestor in the declared hierarchy has an active stage graph. Surface it;
      // downstream this becomes an explicit STAGE_COVERAGE_MISSING error, never a
      // silent stage-free schedule.
      gaps.push(`stage_clock_unresolved_for_method:${cultivationMethod}`);
    }
  }

  // Crop cycle resolution. Priority: explicit param → land record → inferred from the
  // crop's stage graph → cycle-aware fallback. getStages filters
  // `crop_cycle.eq.<cycle>,crop_cycle.is.null`, so the resolved cycle MUST match at least
  // one row's crop_cycle or the stage list is zeroed out (→ empty schedule).
  //
  // Two real cases:
  //  - Most crops (rice, wheat, cotton, maize, …) tag every stage crop_cycle='universal'.
  //    The distinct-cycle inference finds zero non-universal cycles, so the fallback must
  //    be 'universal' or getStages returns nothing.
  //  - Sugarcane tags stages 'plant' (21) and 'ratoon' (3) — no 'universal' rows — so the
  //    distinct-cycle inference sees 2 distinct cycles and cannot pick one. The fallback
  //    must be a real cycle that exists for the crop; 'universal' would zero out sugarcane.
  // The cycle-aware fallback below handles both: prefer 'universal' when the crop has any
  // universal stage, otherwise the crop's primary non-universal cycle ('plant' when present),
  // falling back to 'universal' only when no stage rows exist at all (DB default).
  let cropCycle = params.cropCycle || (land?.crop_cycle as string) || null;
  let stageCycles: string[] = [];
  if (cropCode) {
    const { data: cycles } = await supabase
      .from("crop_stage_master")
      .select("crop_cycle")
      .eq("crop_code", cropCode)
      .eq("is_active", true);
    stageCycles = (cycles || [])
      .map((c: Record<string, unknown>) => c.crop_cycle)
      .filter(Boolean)
      .map(String);
  }
  const distinctNonUniversal = [
    ...new Set(stageCycles.filter((c) => c.toLowerCase() !== "universal")),
  ];
  const hasUniversal = stageCycles.some((c) => c.toLowerCase() === "universal");

  // When the crop's stage graph is exclusively 'universal', that IS the crop's cycle —
  // an inherited land/param value like 'plant' would resolve to zero stages.
  if (stageCycles.length && !distinctNonUniversal.length) {
    cropCycle = "universal";
  }

  if (!cropCycle) {
    // A crop with exactly one real cycle infers it directly.
    if (distinctNonUniversal.length === 1) cropCycle = distinctNonUniversal[0];
    else if (hasUniversal) cropCycle = "universal";
    else if (distinctNonUniversal.length > 1) cropCycle = AMBIGUOUS_CROP_CYCLE;
    else cropCycle = distinctNonUniversal[0] || "universal";
  }

  // Soil fertility class from the latest soil test (never assumed)
  let soilFertilityClass: string | null = null;
  let soilTestId: string | null = null;
  const { data: soil } = await supabase
    .from("soil_health")
    .select("id, fertility_class, test_date")
    .eq("land_id", params.landId)
    .order("test_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (soil?.fertility_class) {
    soilFertilityClass = String(soil.fertility_class);
    soilTestId = String(soil.id);
  } else {
    gaps.push("soil_fertility_class_missing");
  }

  // Region code: the established state-region derivation, via the v_land_region view
  // (lands.state_id → states.code → 'IN-'||code). This is the SAME code family that
  // fertilizer_recommendation_master.region_code stores (live value: 'IN-MH'), so the
  // fertilizer resolver's region dimension can actually match. district_zone_mapping is
  // NOT used: the live table is (id, district_id, zone_id) with zero rows — a different,
  // unpopulated concept.
  let regionCode: string | null = null;
  {
    const { data: reg } = await supabase
      .from("v_land_region")
      .select("region_code, state_code")
      .eq("land_id", params.landId)
      .maybeSingle();
    if (reg?.region_code) {
      regionCode = String(reg.region_code);
      provenance.region = { table: "v_land_region", source: `state_code:${reg.state_code ?? ""}` };
    }
  }
  if (!regionCode) gaps.push("region_code_unresolved");

  return {
    cropCode,
    cropId: (cropRow.id as string) || null,
    cropLabel: (cropRow.label as string) || null,
    cropLabelLocal,
    varietyId: variety?.id || null,
    varietyName: variety?.name || null,
    varietyNameLocal: variety?.localName || null,
    cultivationMethod,
    stageClockMethod,
    cropCycle,
    landAreaAcres,
    landAreaHa: landAreaAcres != null ? landAreaAcres * 0.404686 : null,
    state: (land?.state as string) || null,
    district: (land?.district as string) || null,
    regionCode,
    soilFertilityClass,
    soilTestId,
    sowingDate: params.sowingDate || (land?.planting_date as string) || (land?.cultivation_date as string) || null,
    transplantDate: params.transplantDate || (land?.transplant_date as string) || null,
    gaps,
    provenance,
  };
}
