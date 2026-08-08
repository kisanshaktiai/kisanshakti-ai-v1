/**
 * Canonical soil_type normalization (SSOT for client writes).
 *
 * The agronomy layer (sci_method_registry keys, SOIL_TYPE_EFFECTIVE_RAIN,
 * SOIL_INFILTRATION_CAPS, soil-water factors) is keyed on lowercase,
 * underscore-joined soil codes. Free-form UI values like "Red Soil" silently
 * missed every lookup and fell back to defaults — normalize before save so it
 * cannot be reintroduced through the land-registration UI.
 */
export function normalizeSoilType(s: string | null | undefined): string | null {
  if (!s) return null;
  const base = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  if (!base) return null;
  const MAP: Record<string, string> = {
    black_soil: 'black',
    red_soil: 'red',
    black_cotton_soil: 'black_cotton',
  };
  return MAP[base] ?? base;
}
