// CHANGE LOG
// 2026-09-03 06:15 UTC — NEW. Reads the land-level SSOT context that day-0 generation
//   previously ignored (verified live: input_soil_data / input_weather_data /
//   input_land_coordinates / agro_climatic_zone were NULL on every generated schedule
//   even when the land had soil_health, land_weather_state and ndvi_data rows).
//   Values are READ AND RECORDED ONLY — no agronomic derivation happens here, and any
//   missing source becomes an explicit gap. Nothing is defaulted or invented.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface LandContext {
  soil: Record<string, unknown> | null;
  weather: Record<string, unknown> | null;
  coordinates: { lat: number; lon: number } | null;
  agroClimaticZone: string | null;
  ndvi: Record<string, unknown> | null;
  gaps: string[];
}

export async function loadLandContext(
  supabase: SupabaseClient,
  landId: string,
): Promise<LandContext> {
  const gaps: string[] = [];

  const [{ data: land }, { data: soilRow }, { data: weatherRow }, { data: ndviRow }] = await Promise.all([
    supabase
      .from("lands")
      .select("id, center_lat, center_lon, soil_type, soil_ph, soil_data_source, soil_confidence_level, last_soil_test_date")
      .eq("id", landId)
      .maybeSingle(),

    supabase
      .from("soil_health")
      .select("*")
      .eq("land_id", landId)
      .order("test_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("land_weather_state")
      .select("*")
      .eq("land_id", landId)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ndvi_data")
      .select("date, ndvi_value, mean_ndvi, min_ndvi, max_ndvi")
      .eq("land_id", landId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Soil: the soil test when present, else the land's own recorded soil attributes.
  let soil: Record<string, unknown> | null = null;
  if (soilRow) {
    soil = { source: "soil_health", ...soilRow };
  } else if (land?.soil_type || land?.soil_ph != null) {
    soil = {
      source: "lands",
      soil_type: land.soil_type ?? null,
      soil_ph: land.soil_ph ?? null,
      soil_data_source: land.soil_data_source ?? null,
      soil_confidence_level: land.soil_confidence_level ?? null,
      last_soil_test_date: land.last_soil_test_date ?? null,
    };
    gaps.push("soil_test_missing_using_land_attributes");
  } else {
    gaps.push("soil_context_missing");
  }

  const weather = weatherRow ? { source: "land_weather_state", ...weatherRow } : null;
  if (!weather) gaps.push("land_weather_state_missing");

  const coordinates =
    land?.center_lat != null && land?.center_lon != null
      ? { lat: Number(land.center_lat), lon: Number(land.center_lon) }
      : null;
  if (!coordinates) gaps.push("land_coordinates_missing");

  const ndvi = ndviRow ? { source: "ndvi_data", ...ndviRow } : null;
  if (!ndvi) gaps.push("ndvi_context_missing");

  // Agro-climatic zone: public.agro_climatic_zones carries no land/state linkage in the
  // live data (zone_code and states_covered are NULL on every row), so the zone CANNOT be
  // resolved from the land without inventing a mapping. Recorded as an explicit gap.
  const agroClimaticZone: string | null = null;
  gaps.push("agro_climatic_zone_unmappable");


  return { soil, weather, coordinates, agroClimaticZone, ndvi, gaps };
}
