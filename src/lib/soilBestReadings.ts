import type { SoilRating, SoilSourceKey, SoilSources } from '@/services/soil/soilReport';
import { bestSoilMetrics } from '@/lib/soilSummary';
import { readSoil, type SoilParameter, type SoilReading } from '@/lib/soilInterpretation';

const METRIC_PARAMETER: Record<string, SoilParameter> = {
  ph: 'ph', organicCarbon: 'organic_carbon', nitrogen: 'available_nitrogen', phosphorus: 'available_phosphorus', potassium: 'available_potassium',
};

/** Each value from the best report that has it, read against the governed bands for that report type. */
export function bestReadings(sources: SoilSources, ratings: SoilRating[] | undefined) {
  const metrics = Object.fromEntries(bestSoilMetrics(sources).map((m) => [m.key, m]));
  const read = (key: string): { reading: SoilReading; source: SoilSourceKey | null } => {
    const m = metrics[key];
    const source = m?.source ?? null;
    return { reading: readSoil(METRIC_PARAMETER[key], m?.value ?? null, ratings, source ?? 'lab'), source };
  };
  return { ph: read('ph'), oc: read('organicCarbon'), n: read('nitrogen'), p: read('phosphorus'), k: read('potassium') };
}
