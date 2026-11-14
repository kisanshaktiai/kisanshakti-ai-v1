// 2026-11-14 — SELECTED-CONTEXT DOSSIER — pure, crop- and language-agnostic.
//
// The per-task farmer-text composer used to receive only the variety dossier (crop, variety,
// method, stage names). So every task was written without the land, its size, the soil status,
// the sowing/transplant dates or the season fertilizer programme — all of which the pipeline had
// ALREADY resolved and loaded. The farmer, who had picked his land, crop and variety, then saw
// generic cards ("take certified seed of this variety", "walk the field weekly"), which reads as
// the app not knowing his field.
//
// This module gathers the context that is already in hand into ONE background dossier the composer
// carries into every task. It INVENTS NOTHING: each field is copied from a resolved value or marked
// absent. It is background only — the composer's fact boundary still requires every dose, product
// and threshold to come from the task's own facts; this dossier sharpens naming (land, region,
// variety, stage) and lets the writer phrase around what is and is not known (e.g. "no soil test
// yet"), never a source of per-task numbers.
import type { ResolvedInputs } from "../db/resolve-inputs.ts";

/** The already-resolved pieces the dossier is built from. All optional; absent = recorded as absent. */
export interface SelectedContextSources {
  inputs: ResolvedInputs;
  /** The composer variety view (names, resistance, stage names) — merged in as-is when present. */
  varietyView?: Record<string, unknown> | null;
  /** Season programme totals from the baseline (whole-season sums, never a single application). */
  totals?: { seed_kg?: number | null; n_kg?: number | null; p_kg?: number | null; k_kg?: number | null } | null;
  /** Whether the agronomic programme is approved or still provisional (scientific release status). */
  releaseStatus?: string | null;
  /** The loaded land context: soil row, latest weather/moisture state, latest NDVI. */
  land?: { soil?: Record<string, unknown> | null; weather?: Record<string, unknown> | null; ndvi?: Record<string, unknown> | null } | null;
}

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s ? s : null; };
/** First present value among several possible column names (the moisture/weather schema varies). */
const pick = (row: Record<string, unknown> | null | undefined, keys: string[]): unknown => {
  if (!row) return null;
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return null;
};

/**
 * Build the background context dossier the composer carries into every task.
 * Pure: no I/O, no throw. Returns null only when there is genuinely nothing to say (no inputs).
 */
export function buildSelectedContext(src: SelectedContextSources): Record<string, unknown> | null {
  const { inputs, varietyView, totals, releaseStatus, land } = src;
  if (!inputs) return null;

  // Soil: a real test, the land's own recorded attributes, or none — stated plainly so the writer
  // can say "based on a soil test" or "no soil test yet, using general recommendations".
  const soilRow = land?.soil ?? null;
  const soilTested = str(pick(soilRow, ["source"])) === "soil_health";
  const soil = soilRow
    ? { tested: soilTested, type: str(pick(soilRow, ["soil_type"])), ph: num(pick(soilRow, ["soil_ph", "ph"])), fertility_class: str(inputs.soilFertilityClass) }
    : { tested: false, type: null, ph: null, fertility_class: str(inputs.soilFertilityClass) };

  // Soil moisture: read from the latest weather/moisture state under whichever column carries it.
  const moisturePct = num(pick(land?.weather, ["soil_moisture_pct", "soil_moisture", "moisture_pct", "surface_soil_moisture"]));

  // NDVI: the latest greenness reading, when a satellite pass exists for this land.
  const ndviVal = num(pick(land?.ndvi, ["ndvi_value", "mean_ndvi"]));

  // Season fertilizer programme: WHOLE-SEASON totals, never a single application. Basis tells the
  // writer whether these are approved or still provisional (and so not to lean on them).
  const programmeTotals = { n_kg: num(totals?.n_kg), p_kg: num(totals?.p_kg), k_kg: num(totals?.k_kg) };
  const hasProgramme = programmeTotals.n_kg != null || programmeTotals.p_kg != null || programmeTotals.k_kg != null;
  const programme = {
    available: hasProgramme,
    basis: hasProgramme ? (str(releaseStatus)?.toLowerCase() === "approved" ? "approved" : "provisional") : "unavailable",
    season_totals_not_one_application: hasProgramme ? programmeTotals : null,
  };

  return {
    // What the farmer picked — name these in the cards instead of "this crop / this variety".
    crop: { code: str(inputs.cropCode), label: str(inputs.cropLabel), label_local: str(inputs.cropLabelLocal) },
    variety: { name: str(inputs.varietyName), name_local: str(inputs.varietyNameLocal) },
    cultivation_method: str(inputs.cultivationMethod),
    crop_cycle: str(inputs.cropCycle),
    // The field itself — its size and where it is, so instructions can be concrete for THIS land.
    land: {
      area_acres: num(inputs.landAreaAcres),
      area_ha: num(inputs.landAreaHa),
      region: { state: str(inputs.state), district: str(inputs.district) },
    },
    soil,
    soil_moisture_pct: moisturePct,
    ndvi: ndviVal != null ? { value: ndviVal, date: str(pick(land?.ndvi, ["date"])) } : null,
    dates: { sowing: str(inputs.sowingDate), transplanting: str(inputs.transplantDate) },
    season_seed_quantity_kg: num(totals?.seed_kg),
    season_fertilizer_programme: programme,
    // Names, resistance and stage names from the variety dossier, kept as-is.
    ...(varietyView ? { variety_profile: varietyView } : {}),
    // One line of honesty for the writer: context that is genuinely missing for this field.
    not_available_for_this_field: [
      ...(soil.tested ? [] : ["soil_test"]),
      ...(moisturePct == null ? ["soil_moisture"] : []),
      ...(ndviVal == null ? ["satellite_ndvi"] : []),
    ],
  };
}
