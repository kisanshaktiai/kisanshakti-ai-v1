// The composer carries the whole resolved field context into every task. buildSelectedContext is the
// pure builder: it copies what is resolved and marks what is absent, and it invents nothing.
import { describe, expect, it } from "vitest";
import { buildSelectedContext } from "../../supabase/functions/ai-smart-schedule/generator/selected-context";
import type { ResolvedInputs } from "../../supabase/functions/ai-smart-schedule/db/resolve-inputs";

const inputs = (over: Partial<ResolvedInputs> = {}): ResolvedInputs => ({
  cropCode: "rice", cropId: "c1", cropLabel: "Rice", cropLabelLocal: "भात",
  varietyId: "v1", varietyName: "Rice Indrayani", varietyNameLocal: "इंद्रायणी",
  cultivationMethod: "transplanted", stageClockMethod: "transplanted", cropCycle: "universal",
  landAreaAcres: 3.51, landAreaHa: 1.4204, state: "Maharashtra", district: "Kolhapur", regionCode: "IN-MH",
  soilFertilityClass: null, soilTestId: null, sowingDate: "2026-05-25", transplantDate: "2026-06-20",
  gaps: [], provenance: {}, ...over,
});

describe("buildSelectedContext", () => {
  it("carries the field the farmer picked: crop, variety, land size and region", () => {
    const c = buildSelectedContext({ inputs: inputs() })!;
    expect(c.crop).toEqual({ code: "rice", label: "Rice", label_local: "भात" });
    expect(c.variety).toEqual({ name: "Rice Indrayani", name_local: "इंद्रायणी" });
    expect(c.cultivation_method).toBe("transplanted");
    expect(c.land).toEqual({ area_acres: 3.51, area_ha: 1.4204, region: { state: "Maharashtra", district: "Kolhapur" } });
    expect(c.dates).toEqual({ sowing: "2026-05-25", transplanting: "2026-06-20" });
  });

  it("marks soil, moisture and NDVI as absent for this field instead of inventing them", () => {
    const c = buildSelectedContext({ inputs: inputs(), land: { soil: null, weather: null, ndvi: null } })!;
    expect(c.soil).toMatchObject({ tested: false, type: null, ph: null });
    expect(c.soil_moisture_pct).toBeNull();
    expect(c.ndvi).toBeNull();
    expect(c.not_available_for_this_field).toEqual(["soil_test", "soil_moisture", "satellite_ndvi"]);
  });

  it("uses a real soil test, a moisture reading and an NDVI pass when the land has them", () => {
    const c = buildSelectedContext({
      inputs: inputs({ soilFertilityClass: "medium" }),
      land: {
        soil: { source: "soil_health", soil_type: "clay loam", soil_ph: 6.4 },
        weather: { source: "land_weather_state", soil_moisture_pct: 42 },
        ndvi: { source: "ndvi_data", ndvi_value: 0.58, date: "2026-10-30" },
      },
    })!;
    expect(c.soil).toEqual({ tested: true, type: "clay loam", ph: 6.4, fertility_class: "medium" });
    expect(c.soil_moisture_pct).toBe(42);
    expect(c.ndvi).toEqual({ value: 0.58, date: "2026-10-30" });
    expect(c.not_available_for_this_field).toEqual([]);
  });

  it("labels the season programme as whole-season totals and by its evidence basis", () => {
    const approved = buildSelectedContext({ inputs: inputs(), totals: { n_kg: 142, p_kg: 71, k_kg: 71 }, releaseStatus: "approved" })!;
    expect(approved.season_fertilizer_programme).toEqual({ available: true, basis: "approved", season_totals_not_one_application: { n_kg: 142, p_kg: 71, k_kg: 71 } });
    const provisional = buildSelectedContext({ inputs: inputs(), totals: { n_kg: 142, p_kg: null, k_kg: null }, releaseStatus: "provisional" })!;
    expect(provisional.season_fertilizer_programme).toMatchObject({ available: true, basis: "provisional" });
    const none = buildSelectedContext({ inputs: inputs(), totals: { n_kg: null, p_kg: null, k_kg: null } })!;
    expect(none.season_fertilizer_programme).toEqual({ available: false, basis: "unavailable", season_totals_not_one_application: null });
  });

  it("is crop-agnostic — it names whatever crop and variety were chosen, with no rice-specific logic", () => {
    const c = buildSelectedContext({ inputs: inputs({ cropCode: "wheat", cropLabel: "Wheat", cropLabelLocal: "गहू", varietyName: "Lok-1", varietyNameLocal: null, cultivationMethod: "direct_seeded" }) })!;
    expect(c.crop).toMatchObject({ code: "wheat", label: "Wheat" });
    expect(c.variety).toEqual({ name: "Lok-1", name_local: null });
    expect(c.cultivation_method).toBe("direct_seeded");
  });

  it("reflects the seed quantity only when the baseline resolved one (never fabricated)", () => {
    expect(buildSelectedContext({ inputs: inputs(), totals: { seed_kg: null } })!.season_seed_quantity_kg).toBeNull();
    expect(buildSelectedContext({ inputs: inputs(), totals: { seed_kg: 51.25 } })!.season_seed_quantity_kg).toBe(51.25);
  });
});
