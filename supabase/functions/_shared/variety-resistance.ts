// ════════════════════════════════════════════════════════════════════
// VARIETY RESISTANCE HELPERS (shared by chat / proactive / schedules)
// ────────────────────────────────────────────────────────────────────
// Loads variety_resistance rows for a given variety and exposes:
//   - loadResistanceMap()        — canonical_observation_code → row
//   - computeResistanceMultiplier — confidence multiplier for a hypothesis
//   - shouldSuppressChemical     — prescription-gate gate (with emergency
//                                  bypass per safety/agronomic-safety-and
//                                  -regulatory-gating)
// ════════════════════════════════════════════════════════════════════

export interface ResistanceRow {
  variety_id: string;
  observation_code: string;          // legacy/raw code as stored
  canonical_observation_code: string | null;
  resistance_level: string | null;   // 'RESISTANT' | 'MODERATELY_RESISTANT' | 'SUSCEPTIBLE' | ...
  source?: string | null;
  notes?: string | null;
}

export type ResistanceMap = Map<string, ResistanceRow>;

const LEVEL_WEIGHTS: Record<string, number> = {
  HIGHLY_RESISTANT: 0.2,
  RESISTANT: 0.4,
  MODERATELY_RESISTANT: 0.7,
  TOLERANT: 0.85,
  SUSCEPTIBLE: 1.2,
  HIGHLY_SUSCEPTIBLE: 1.4,
};

/** Load resistance rows keyed by canonical_observation_code (fallback raw code). */
export async function loadResistanceMap(
  supabase: any,
  varietyId: string | null | undefined
): Promise<ResistanceMap> {
  const map: ResistanceMap = new Map();
  if (!varietyId) return map;
  const { data, error } = await supabase
    .from('variety_resistance')
    .select('variety_id, observation_code, canonical_observation_code, resistance_level, source, notes')
    .eq('variety_id', varietyId);
  if (error || !data) return map;
  for (const r of data as ResistanceRow[]) {
    const key = (r.canonical_observation_code || r.observation_code || '').toUpperCase();
    if (key) map.set(key, r);
  }
  return map;
}

/** Multiplier in [0.2, 1.4] applied to a hypothesis confidence score
 * when the planted variety has a recorded resistance for the observation.
 * Returns 1.0 (neutral) when no record exists. */
export function computeResistanceMultiplier(
  observationCode: string,
  resistance: ResistanceMap
): { multiplier: number; matched: ResistanceRow | null } {
  if (!observationCode) return { multiplier: 1, matched: null };
  const row = resistance.get(observationCode.toUpperCase());
  if (!row) return { multiplier: 1, matched: null };
  const lvl = (row.resistance_level || '').toUpperCase().replace(/\s+/g, '_');
  const m = LEVEL_WEIGHTS[lvl] ?? 1;
  return { multiplier: m, matched: row };
}

/** Whether to suppress chemical prescription because the variety is
 * resistant/tolerant. Emergency-pest bypass: caller passes isEmergency=true
 * (e.g. shoot borer) and we never suppress. */
export function shouldSuppressChemical(
  observationCode: string,
  resistance: ResistanceMap,
  isEmergency = false
): { suppress: boolean; reason: string | null; matched: ResistanceRow | null } {
  if (isEmergency) return { suppress: false, reason: null, matched: null };
  const { multiplier, matched } = computeResistanceMultiplier(observationCode, resistance);
  if (!matched) return { suppress: false, reason: null, matched: null };
  if (multiplier <= 0.4) {
    return {
      suppress: true,
      reason: `Variety is ${matched.resistance_level} to ${observationCode}; chemical prescription suppressed by resistance gate.`,
      matched,
    };
  }
  return { suppress: false, reason: null, matched };
}

/** Resolve a land's planted variety_id with a fallback to the active schedule. */
export async function resolveLandVarietyId(
  supabase: any,
  landId: string
): Promise<string | null> {
  const { data: land } = await supabase
    .from('lands')
    .select('current_crop_variety_id')
    .eq('id', landId)
    .maybeSingle();
  if (land?.current_crop_variety_id) return land.current_crop_variety_id;
  const { data: sched } = await supabase
    .from('crop_schedules')
    .select('variety_id')
    .eq('land_id', landId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return sched?.variety_id ?? null;
}
