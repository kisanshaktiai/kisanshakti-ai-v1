/**
 * Canonical soil_type normalization (SSOT for client writes AND reads).
 *
 * The agronomy layer (sci_method_registry keys, SOIL_TYPE_EFFECTIVE_RAIN,
 * SOIL_INFILTRATION_CAPS, soil-water factors) is keyed on lowercase,
 * underscore-joined soil codes. Free-form UI values like "Red Soil" silently
 * missed every lookup and fell back to defaults — normalize before save so it
 * cannot be reintroduced through the land-registration UI.
 *
 * IMPORTANT: any <Select> bound to soil_type must use these canonical codes
 * as option values (via SOIL_TYPES below) and normalize DB values on load,
 * otherwise the stored code (e.g. "black") won't match any option and the
 * dropdown renders empty. Use soilTypeLabel() for display.
 */
export function normalizeSoilType(s: string | null | undefined): string | null {
  if (!s) return null;
  const base = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  if (!base) return null;
  const MAP: Record<string, string> = {
    black_soil: 'black',
    red_soil: 'red',
    // "Black cotton soil" is a colloquial synonym for black/regur soil
    // (Vertisol) — same soil, one canonical code. Engine keys black and
    // black_cotton carry identical coefficients, so this loses nothing.
    black_cotton: 'black',
    black_cotton_soil: 'black',
    // soil_types reference-table legacy values
    alluvial_soil: 'alluvial',
    laterite_soil: 'laterite',
    clay_soil: 'clay',
    sandy_soil: 'sandy',
    loamy_soil: 'loamy',
    saline_alkaline_soil: 'saline',
    organic_peaty_soil: 'peaty',
    desert_soil: 'desert',
    mountain_soil: 'mountain',
    // common free-form variants
    regur: 'black',
    regur_soil: 'black',
    clayey: 'clay',
    sandy_loam_soil: 'sandy_loam',
  };
  return MAP[base] ?? base;
}

/**
 * Canonical soil types for UI dropdowns: value = agronomy code, label = friendly.
 * Keep codes aligned with SOIL_TYPE_EFFECTIVE_RAIN / SOIL_INFILTRATION_CAPS keys.
 */
export const SOIL_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'black', label: 'Black Soil' },
  { value: 'red', label: 'Red Soil' },
  { value: 'alluvial', label: 'Alluvial Soil' },
  { value: 'laterite', label: 'Laterite Soil' },
  { value: 'clay', label: 'Clay Soil' },
  { value: 'sandy', label: 'Sandy Soil' },
  { value: 'loamy', label: 'Loamy Soil' },
  { value: 'saline', label: 'Saline / Alkaline Soil' },
  { value: 'peaty', label: 'Organic / Peaty Soil' },
  { value: 'other', label: 'Other' },
];

/** Friendly display label for a stored soil_type code (accepts legacy values too). */
export function soilTypeLabel(s: string | null | undefined): string {
  const code = normalizeSoilType(s);
  if (!code) return '';
  const found = SOIL_TYPES.find((t) => t.value === code);
  if (found) return found.label;
  // Unknown code — humanize it rather than showing raw snake_case
  return code
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
