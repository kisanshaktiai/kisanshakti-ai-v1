import { soilNumber, type SoilSourceKey, type SoilSources } from '@/services/soil/soilReport';

export interface SoilMetric { key: string; value: number | string | null; unit: string | null; level: string | null; text: string | null; source?: SoilSourceKey | null }

/** Presentation-only: list saved soil values; missing values stay null (never defaulted to 0). */
export function soilMetrics(row: Record<string, any> | null | undefined): SoilMetric[] {
  const r = row ?? {};
  const num = (k: string) => soilNumber(r[k]);
  return [
    { key: 'ph', value: num('ph_level'), unit: null, level: null, text: r.ph_text ?? null },
    { key: 'organicCarbon', value: num('organic_carbon'), unit: '%', level: null, text: r.organic_carbon_text ?? null },
    { key: 'nitrogen', value: num('nitrogen_kg_per_ha'), unit: 'kg/ha', level: r.nitrogen_level ?? null, text: r.nitrogen_text ?? null },
    { key: 'phosphorus', value: num('phosphorus_kg_per_ha'), unit: 'kg/ha', level: r.phosphorus_level ?? null, text: r.phosphorus_text ?? null },
    { key: 'potassium', value: num('potassium_kg_per_ha'), unit: 'kg/ha', level: r.potassium_level ?? null, text: r.potassium_text ?? null },
    { key: 'moisture', value: num('soil_moisture_surface_percent') ?? num('soil_moisture_rootzone_percent'), unit: '%', level: r.moisture_status ?? null, text: null },
    { key: 'texture', value: r.texture || r.soil_type || null, unit: null, level: null, text: null },
  ];
}

// Which report types may supply each value. A soil map estimates pH, carbon and
// texture, but not plant-available N, P or K and not today's moisture, so those
// come only from a lab test or a soil device. Order = preference.
const ALLOWED: Record<string, SoilSourceKey[]> = {
  ph: ['lab', 'device', 'satellite'],
  organicCarbon: ['lab', 'device', 'satellite'],
  nitrogen: ['lab', 'device'],
  phosphorus: ['lab', 'device'],
  potassium: ['lab', 'device'],
  moisture: ['device'],
  texture: ['lab', 'device', 'satellite'],
};

/** One value per metric, each taken from the best report type that has it, with its source. */
export function bestSoilMetrics(sources: SoilSources): SoilMetric[] {
  const per = {
    lab: soilMetrics(sources.lab),
    device: soilMetrics(sources.device),
    satellite: soilMetrics(sources.satellite),
  };
  return per.lab.map((base, i) => {
    for (const key of ALLOWED[base.key] ?? []) {
      if (!sources[key]) continue;
      const m = per[key][i];
      if (m.value !== null && m.value !== '') return { ...m, source: key };
    }
    return { ...base, value: null, level: null, text: null, source: null };
  });
}

export const measuredCount = (m: SoilMetric[]) => m.filter((x) => x.value !== null && x.value !== '').length;
