/**
 * Canonical task_type taxonomy (schedule_tasks_task_type_check) → legacy UI icon keys.
 *
 * The DB migration renamed task types (fertilizer→nutrition, pest→pest_management,
 * planting→sowing, soil_preparation→land_preparation, weeding→weed_management, ...).
 * The schedule UI icon maps still key on the older names, so this module resolves a
 * task_type to the first key that actually exists in a given config map.
 */

/** Ordered fallback candidates per canonical task_type. */
const TASK_TYPE_ALIASES: Record<string, string[]> = {
  land_preparation: ['land_preparation', 'soil_preparation', 'sowing'],
  seed_treatment: ['seed_treatment', 'sowing'],
  nursery: ['nursery', 'sowing'],
  sowing: ['sowing', 'planting', 'soil_preparation'],
  planting: ['sowing', 'planting'],
  gap_filling: ['gap_filling', 'sowing'],
  nutrition: ['nutrition', 'fertilizer'],
  fertilizer: ['fertilizer', 'nutrition'],
  micronutrient: ['micronutrient', 'nutrition', 'fertilizer'],
  irrigation: ['irrigation'],
  weed_management: ['weed_management', 'weeding'],
  weeding: ['weeding', 'weed_management'],
  intercultural: ['intercultural', 'weed_management', 'weeding'],
  pest_management: ['pest_management', 'pesticide', 'pest_control'],
  pest_control: ['pest_control', 'pest_management', 'pesticide'],
  pesticide: ['pesticide', 'pest_management', 'pest_control'],
  disease_management: ['disease_management', 'pesticide', 'pest_management'],
  growth_regulation: ['growth_regulation', 'nutrition', 'fertilizer'],
  monitoring: ['monitoring', 'advisory'],
  harvest: ['harvest', 'harvesting'],
  harvesting: ['harvesting', 'harvest'],
  post_harvest: ['post_harvest', 'harvest'],
  residue_management: ['residue_management', 'land_preparation', 'soil_preparation'],
  planning: ['planning', 'advisory'],
  advisory: ['advisory'],
};

/**
 * Picks the config entry for a task_type from an icon/colour map, falling back
 * through canonical aliases before landing on the map's `other` entry.
 */
export function resolveTaskTypeConfig<T extends Record<string, any>>(
  config: T,
  taskType: string | null | undefined,
  fallbackKey: keyof T = 'other' as keyof T,
): T[keyof T] {
  const raw = (taskType ?? '').trim().toLowerCase();
  if (raw && raw in config) return config[raw as keyof T];
  for (const candidate of TASK_TYPE_ALIASES[raw] ?? []) {
    if (candidate in config) return config[candidate as keyof T];
  }
  return config[fallbackKey];
}

/** Resolves a task_type to a key present in the given record (or null). */
export function resolveTaskTypeKey(
  keys: Record<string, unknown>,
  taskType: string | null | undefined,
): string | null {
  const raw = (taskType ?? '').trim().toLowerCase();
  if (raw && raw in keys) return raw;
  for (const candidate of TASK_TYPE_ALIASES[raw] ?? []) {
    if (candidate in keys) return candidate;
  }
  return null;
}
