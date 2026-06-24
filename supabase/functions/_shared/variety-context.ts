// ═══════════════════════════════════════════════════════════════════════
// VARIETY CONTEXT LOADER
// ───────────────────────────────────────────────────────────────────────
// Resolves a free-text variety label (e.g. "Co 86032", "MTU-1010")
// against the master_products variety registry (product_type='seed')
// enriched in Phase 1 + Phase 2 backfill.
//
// SSOT: master_products + variety_resistance + variety_translations
// View: v_crop_varieties is used ONLY for the initial lookup convenience.
// ═══════════════════════════════════════════════════════════════════════

export interface VarietyProfile {
  variety_id: string;
  name: string;
  label_hi?: string | null;
  label_mr?: string | null;
  variety_code?: string | null;
  maturity_days_min?: number | null;
  maturity_days_max?: number | null;
  yield_potential_qtl_per_acre?: number | null;
  season?: string | null;
  seed_rate_kg_per_acre?: number | null;
  spacing?: string | null;
  disease_resistance?: any;
  pest_tolerance?: any;
  released_by?: string | null;
  agro_ecological_suitability?: any;
  data_confidence_score?: number | null;
  recommendation_priority?: number | null;
  availability_status?: string | null;
  state_suitability?: string[] | null;
  state_suitability_ids?: string[] | null;
  resistance?: Array<{
    pathogen: string;
    threat_type?: string | null;
    level: string;
    notes?: string | null;
    observation_code?: string | null;
    canonical_observation_code?: string | null;
  }>;
  state_match: boolean;
  source: "exact" | "fuzzy" | "code" | "fallback_crop_default" | "none";
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();

export async function loadVarietyProfile(
  supabase: any,
  opts: {
    cropName: string;
    cropVariety?: string | null;
    stateName?: string | null;
    landVarietyId?: string | null;
  }
): Promise<VarietyProfile | null> {
  const { cropName, cropVariety, stateName, landVarietyId } = opts;
  if (!cropVariety && !landVarietyId) return null;

  // Resolve state UUID from name (for state-match flag)
  let stateId: string | null = null;
  if (stateName) {
    const { data: st } = await supabase
      .from("states")
      .select("id")
      .ilike("name", stateName.trim())
      .maybeSingle();
    stateId = st?.id ?? null;
  }

  // ── Lookup path A: explicit variety_id from land
  let row: any = null;
  let source: VarietyProfile["source"] = "none";

  if (landVarietyId) {
    const { data } = await supabase
      .from("master_products")
      .select("*")
      .eq("id", landVarietyId)
      .eq("product_type", "seed")
      .maybeSingle();
    if (data) { row = data; source = "exact"; }
  }

  // ── Lookup path B: text match against name / variety_code
  if (!row && cropVariety) {
    const target = norm(cropVariety);

    // Exact name or code match
    const { data: byCode } = await supabase
      .from("master_products")
      .select("*")
      .eq("product_type", "seed")
      .or(`variety_code.ilike.${cropVariety.trim()},name.ilike.%${cropVariety.trim()}%`)
      .limit(20);

    if (byCode && byCode.length) {
      // Pick best: state match > priority > confidence
      const ranked = byCode
        .map((r: any) => {
          const stMatch = stateId && Array.isArray(r.state_suitability_ids)
            && r.state_suitability_ids.includes(stateId);
          const nameMatch = norm(r.name || "") === target
            || norm(r.variety_code || "") === target;
          return {
            r,
            score:
              (stMatch ? 100 : 0) +
              (nameMatch ? 50 : 0) +
              (r.recommendation_priority || 0) * 0.5 +
              (r.data_confidence_score || 0) * 0.3,
          };
        })
        .sort((a: any, b: any) => b.score - a.score);
      row = ranked[0].r;
      source = norm(row.name || "") === target || norm(row.variety_code || "") === target
        ? "exact"
        : "fuzzy";
    }
  }

  if (!row) return null;

  // ── Load resistance child table
  // Schema columns: threat_name, threat_type, resistance_level, notes
  const { data: resRaw } = await supabase
    .from("variety_resistance")
    .select("threat_name, threat_type, resistance_level, notes, observation_code, canonical_observation_code")
    .eq("variety_id", row.id);
  const res = (resRaw || []).map((r: any) => ({
    pathogen: r.threat_name || r.threat_type || "unknown",
    threat_type: r.threat_type ?? null,
    level: r.resistance_level || "unknown",
    notes: r.notes ?? null,
    observation_code: r.observation_code ?? null,
    canonical_observation_code: r.canonical_observation_code ?? null,
  }));


  const state_match = !!(stateId && Array.isArray(row.state_suitability_ids)
    && row.state_suitability_ids.includes(stateId));

  return {
    variety_id: row.id,
    name: row.name,
    label_hi: row.label_hi,
    label_mr: row.label_mr,
    variety_code: row.variety_code,
    maturity_days_min: row.maturity_days_min,
    maturity_days_max: row.maturity_days_max,
    yield_potential_qtl_per_acre: row.yield_potential_qtl_per_acre,
    season: row.season,
    seed_rate_kg_per_acre: row.seed_rate_kg_per_acre,
    spacing: row.spacing,
    disease_resistance: row.disease_resistance,
    pest_tolerance: row.pest_tolerance,
    released_by: row.released_by,
    agro_ecological_suitability: row.agro_ecological_suitability,
    data_confidence_score: row.data_confidence_score,
    recommendation_priority: row.recommendation_priority,
    availability_status: row.availability_status,
    state_suitability: row.state_suitability,
    state_suitability_ids: row.state_suitability_ids,
    resistance: res || [],
    state_match,
    source,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Build a deterministic VARIETY PROFILE block injected into the LLM prompt.
// All facts come from DB; LLM is restricted to narration (per project Core rule).
// ───────────────────────────────────────────────────────────────────────
export function formatVarietyProfileForPrompt(
  v: VarietyProfile | null,
  language: string = "en"
): string {
  if (!v) return "";

  const localName =
    language === "hi" ? v.label_hi :
    language === "mr" ? v.label_mr : null;

  const maturity =
    v.maturity_days_min && v.maturity_days_max
      ? `${v.maturity_days_min}-${v.maturity_days_max} days`
      : v.maturity_days_max ? `~${v.maturity_days_max} days`
      : "unspecified";

  const yieldPot = v.yield_potential_qtl_per_acre
    ? `${v.yield_potential_qtl_per_acre} qtl/acre`
    : "unspecified";

  const resistanceLines = (v.resistance || [])
    .filter(r => r && r.pathogen && r.level)
    .map(r => `   - ${r.pathogen}: ${r.level}${r.notes ? ` (${r.notes})` : ""}`)
    .join("\n");

  const irrigation =
    v.agro_ecological_suitability?.irrigation_regime || "unspecified";

  const stateLabel = Array.isArray(v.state_suitability) && v.state_suitability.length
    ? v.state_suitability.slice(0, 6).join(", ")
    : "—";

  const warn = v.availability_status && v.availability_status !== "available"
    ? `\n⚠ AVAILABILITY: ${v.availability_status.toUpperCase()} — flag to farmer before recommending.\n`
    : "";

  const stateGate = v.state_match
    ? ""
    : `\n⚠ STATE FIT: variety is NOT in this state's official suitability list (${stateLabel}). Calibrate timing windows defensively.\n`;

  return `
VARIETY PROFILE (authoritative, DB-sourced — do NOT invent or override):
- Name: ${v.name}${localName ? ` / ${localName}` : ""}${v.variety_code ? ` [${v.variety_code}]` : ""}
- Released by: ${v.released_by || "unknown"} | Data confidence: ${v.data_confidence_score ?? "?"}/100
- Maturity: ${maturity} | Yield potential: ${yieldPot}
- Season: ${v.season || "—"} | Irrigation regime: ${irrigation}
- Seed rate: ${v.seed_rate_kg_per_acre ?? "—"} kg/acre | Spacing: ${v.spacing || "—"}
- Officially suitable states: ${stateLabel}
${resistanceLines ? `- Resistance profile:\n${resistanceLines}` : "- Resistance profile: not catalogued"}
${warn}${stateGate}
SCHEDULING DIRECTIVES (variety-specific):
1. Maturity-day windows above OVERRIDE generic crop defaults.
2. Use the variety's seed rate and spacing verbatim.
3. Skip preventive sprays for pathogens marked R/HR in the resistance profile.
4. Add a targeted preventive task for any pathogen marked S/MS.
5. If irrigation regime = "irrigated", schedule critical-stage irrigations; if "rainfed_or_irrigated", make irrigation conditional on rainfall forecast.
`.trim();
}
