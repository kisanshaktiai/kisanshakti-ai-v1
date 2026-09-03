export interface ScheduleTaskPresentation {
  what: string;
  how: string[];
  howMuch: string[];
  hasVerifiedAmount: boolean;
  /** Provenance / agronomic-audit lines. Shown only under "details", never as headline text. */
  technicalDetails: string[];
  /** True when the edge narration could not rewrite this task into the farmer's language. */
  needsTranslation: boolean;
}

const SOURCE_PREFIX = /^(?:source|evidence)\s*:/i;
const MACHINE_CONDITION_PREFIX = /^[a-z0-9_]+\s*:/i;
const INTERNAL_INSTRUCTION_PREFIX = /^(?:critical\s+soil\s+moisture)\s*:/i;
const cleanText = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null' && value.trim().toLowerCase() !== 'undefined' ? value.trim() : null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function quantityText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return cleanText(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (v.value !== null && v.value !== undefined) {
      const unit = cleanText(v.unit) ?? '';
      return `${String(v.value)}${unit ? ` ${unit}` : ''}`.trim();
    }
  }
  return null;
}

function taskTypeLabelKey(taskType: string): string {
  const key = String(taskType || '').trim().toLowerCase();
  const map: Record<string, string> = {
    irrigation: 'schedule.task_type.irrigation', nutrition: 'schedule.task_type.nutrition', micronutrient: 'schedule.task_type.micronutrient',
    pesticide: 'schedule.task_type.pest_management', pest_management: 'schedule.task_type.pest_management', disease_management: 'schedule.task_type.disease_management',
    weed_management: 'schedule.task_type.weed_management', intercultural: 'schedule.task_type.intercultural', sowing: 'schedule.task_type.sowing',
    seed_treatment: 'schedule.task_type.seed_treatment', land_preparation: 'schedule.task_type.land_preparation', monitoring: 'schedule.task_type.monitoring',
    harvest: 'schedule.task_type.harvest', post_harvest: 'schedule.task_type.post_harvest'
  };
  return map[key] || 'schedule.task_type.generic';
}

/**
 * Presentation-only adapter. It uses only persisted task data and never invents agronomy.
 * Irrigation is special: the generator's `water_mm` is a field/stage depth, not a farmer
 * delivery quantity. The farmer card therefore shows litres ONLY when a litres value is
 * explicitly present in the persisted task; it never converts mm→litres without an
 * explicit DB-provided conversion/input.
 */
export function buildScheduleTaskPresentation(task: Record<string, unknown>, t: (key: string, fallback?: any) => string): ScheduleTaskPresentation {
  const resources = task.resources && typeof task.resources === 'object' && !Array.isArray(task.resources) ? task.resources as Record<string, unknown> : {};
  const taskType = String(task.task_type ?? '').trim().toLowerCase();
  const rawName = cleanText(task.task_name);
  const what = rawName || t(taskTypeLabelKey(taskType));
  const detailedSteps = asArray(task.detailed_steps).map(cleanText).filter((x): x is string => Boolean(x));
  const technicalDetails = asArray(resources.technical_details).map(cleanText).filter((x): x is string => Boolean(x));
  const legacyTechnical: string[] = [];
  const instructions = asArray(task.instructions)
    .map(cleanText)
    .filter((x): x is string => Boolean(x))
    .filter((x) => {
      const isTechnical = SOURCE_PREFIX.test(x) || MACHINE_CONDITION_PREFIX.test(x) || INTERNAL_INSTRUCTION_PREFIX.test(x);
      if (isTechnical) legacyTechnical.push(x);
      return !isTechnical;
    });
  const desc = cleanText(task.task_description);
  const how = [...detailedSteps, ...instructions];
  if (!how.length && desc && desc !== what) how.push(desc);

  const howMuch: string[] = [];
  const seen = new Set<string>();
  const pushAmount = (labelKey: string, raw: unknown) => {
    const q = quantityText(raw);
    if (!q) return;
    const value = `${t(labelKey)}: ${q}`;
    if (!seen.has(value)) { seen.add(value); howMuch.push(value); }
  };

  // Farmer-facing irrigation quantity: do not display the stage-depth `mm` value as if
  // it were a litres delivery amount. Accept only an explicit litres value from the task
  // or its resources. The DB `water_required_liters` field is the canonical litre value.
  if (taskType === 'irrigation') {
    pushAmount('schedule.amount.water', task.water_required_liters ?? resources.water_required_liters ?? resources.water_liters);
  } else {
    pushAmount('schedule.amount.task_quantity', task.quantity ?? resources.quantity);
    pushAmount('schedule.amount.water', task.water_required_liters);
  }
  pushAmount('schedule.amount.fertilizer', resources.fertilizer_kg);
  pushAmount('schedule.amount.pesticide', resources.pesticide_ml);
  pushAmount('schedule.amount.fungicide', resources.fungicide_gm);
  pushAmount('schedule.amount.herbicide', resources.herbicide_ml);
  pushAmount('schedule.amount.bio_pesticide', resources.bio_pesticide_ml);
  pushAmount('schedule.amount.seed', resources.seed_quantity_kg);

  return {
    what,
    how,
    howMuch,
    hasVerifiedAmount: howMuch.length > 0,
    technicalDetails: [...new Set([...technicalDetails, ...legacyTechnical])],
    needsTranslation: resources.needs_translation === true,
  };
}
