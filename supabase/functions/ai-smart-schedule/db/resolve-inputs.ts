// CHANGE LOG
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

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface ResolvedInputs {
  cropCode: string | null;
  cropId: string | null;
  cropLabel: string | null;
  cropLabelLocal: string | null;
  varietyId: string | null;
  varietyName: string | null;
  varietyNameLocal: string | null;
  cultivationMethod: string | null;
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

/** Resolve a farmer-typed crop name (any language) to a DB crop row. */
async function resolveCrop(supabase: SupabaseClient, cropName: string) {
  const q = norm(cropName);
  if (!q) return null;

  // 1. Exact match on any label column in the crops SSOT
  const { data: crops } = await supabase
    .from("crops")
    .select("id, value, label, local_name, label_hi, label_mr, label_pa, label_ta, label_te, label_bn, label_gu, label_kn, label_ml, label_or, label_as, label_ur, label_sa")
    .eq("is_active", true);

  const rows = crops || [];
  const exact = rows.find((c: Record<string, unknown>) =>
    Object.entries(c).some(([k, v]) => k !== "id" && norm(v) === q)
  );
  if (exact) return { row: exact, matchedVia: "crops.label_exact" };

  // 2. Synonym table (multilingual aliases)
  const { data: syn } = await supabase
    .from("crop_synonyms")
    .select("*")
    .limit(2000);
  const synHit = (syn || []).find((s: Record<string, unknown>) =>
    Object.values(s).some((v) => typeof v === "string" && norm(v) === q)
  );
  if (synHit) {
    const code = norm((synHit as Record<string, unknown>).crop_code ?? "");
    const byCode = rows.find((c: Record<string, unknown>) => norm(c.value) === code);
    if (byCode) return { row: byCode, matchedVia: "crop_synonyms" };
  }

  // 3. Contains match (last resort, still DB-sourced)
  const partial = rows.find((c: Record<string, unknown>) =>
    Object.entries(c).some(([k, v]) => k !== "id" && typeof v === "string" && norm(v).includes(q))
  );
  if (partial) return { row: partial, matchedVia: "crops.label_partial" };

  return null;
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
  );
  if (!cultivationMethod) gaps.push("cultivation_method_unresolved");

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
    else cropCycle = distinctNonUniversal.find((c) => c.toLowerCase() === "plant") || distinctNonUniversal[0] || "universal";
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

  // Region code from the district → agro-climatic zone mapping
  let regionCode: string | null = null;
  if (land?.district) {
    const { data: dz } = await supabase
      .from("district_zone_mapping")
      .select("*")
      .limit(1000);
    const hit = (dz || []).find((d: Record<string, unknown>) =>
      Object.values(d).some((v) => typeof v === "string" && norm(v) === norm(land.district))
    );
    if (hit) {
      const z = (hit as Record<string, unknown>).zone_code ?? (hit as Record<string, unknown>).zone_id;
      regionCode = z ? String(z) : null;
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
