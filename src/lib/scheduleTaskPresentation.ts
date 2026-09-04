export interface ScheduleTaskPresentation {
  what: string;
  how: string[];
  howMuch: string[];
  hasVerifiedAmount: boolean;
  technicalDetails: string[];
  needsTranslation: boolean;
}

const SOURCE_PREFIX = /^(?:source|evidence)\s*:/i;
const MACHINE_CONDITION_PREFIX = /^[a-z0-9_]+\s*:/i;
const INTERNAL_INSTRUCTION_PREFIX = /^(?:critical\s+soil\s+moisture)\s*:/i;
const ENGLISH_TECHNICAL_PREFIX = /^(?:temperature|humidity|conditions|instructions|precautions)\s*:/i;
const cleanText = (value: unknown): string | null => typeof value === 'string' && value.trim() && !['null', 'undefined'].includes(value.trim().toLowerCase()) ? value.trim() : null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function quantityText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return cleanText(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (v.value !== null && v.value !== undefined) return `${String(v.value)}${cleanText(v.unit) ? ` ${cleanText(v.unit)}` : ''}`.trim();
  }
  return null;
}

function taskTypeLabelKey(taskType: string): string {
  const map: Record<string, string> = {
    irrigation: 'schedule.stages.irrigation', fertilizer: 'schedule.task_card.product_details', nutrition: 'schedule.task_card.product_details',
    pesticide: 'schedule.stages.pest_control', pest_management: 'schedule.stages.pest_control', disease_management: 'schedule.stages.pest_control',
    weed_management: 'schedule.stages.weeding', intercultural: 'schedule.stages.weeding', sowing: 'schedule.stages.sowing',
    seed_treatment: 'schedule.stages.sowing', land_preparation: 'schedule.stages.land_prep', monitoring: 'schedule.task_card.description',
    harvest: 'schedule.stages.harvest', post_harvest: 'schedule.stages.harvest'
  };
  return map[String(taskType || '').trim().toLowerCase()] || 'schedule.task_card.description';
}

function looksUntranslated(value: string, currentLanguage: string): boolean {
  if (currentLanguage === 'en' || !value) return false;
  const letters = value.match(/[A-Za-z]/g) || [];
  const nonAsciiLetters = value.match(/[^\x00-\x7F]/g) || [];
  return letters.length >= 4 && letters.length >= nonAsciiLetters.length * 2;
}

export function buildScheduleTaskPresentation(
  task: Record<string, unknown>,
  t: (key: string, fallback?: any) => string,
  currentLanguage = 'en',
): ScheduleTaskPresentation {
  const resources = task.resources && typeof task.resources === 'object' && !Array.isArray(task.resources) ? task.resources as Record<string, unknown> : {};
  const taskType = String(task.task_type ?? '').trim().toLowerCase();
  const rawName = cleanText(task.task_name);
  const rawDescription = cleanText(task.task_description);
  const localizedName = cleanText(task.localized_task_name ?? resources.localized_task_name);
  const localizedDescription = cleanText(task.localized_task_description ?? resources.localized_task_description);
  const sourceLanguage = cleanText(task.language ?? resources.source_language);
  const nameUnsafe = currentLanguage !== 'en' && !localizedName && (sourceLanguage ? sourceLanguage.toLowerCase() !== currentLanguage.toLowerCase() : looksUntranslated(rawName ?? '', currentLanguage));

  // Prefer an authoritative localized value. If it is unavailable, retain the stored
  // source-language value instead of deleting the task's useful content. Translation is
  // presentation enrichment and must never make an existing schedule appear empty.
  const what = currentLanguage === 'en'
    ? (rawName || t(taskTypeLabelKey(taskType)))
    : (localizedName || rawName || t(taskTypeLabelKey(taskType)));

  const technicalDetails = asArray(resources.technical_details).map(cleanText).filter((x): x is string => Boolean(x));
  const legacyTechnical: string[] = [];
  const instructions = asArray(task.instructions).map(cleanText).filter((x): x is string => Boolean(x)).filter((x) => {
    const technical = SOURCE_PREFIX.test(x) || MACHINE_CONDITION_PREFIX.test(x) || INTERNAL_INSTRUCTION_PREFIX.test(x) || ENGLISH_TECHNICAL_PREFIX.test(x);
    if (technical) legacyTechnical.push(x);
    return !technical;
  });
  const detailedSteps = asArray(task.detailed_steps).map(cleanText).filter((x): x is string => Boolean(x));
  const rawHow = [...detailedSteps, ...instructions];

  // Do not hide authoritative source-language steps. This is the safe fallback for
  // legacy schedules and for newly generated schedules when the LLM is rate-limited.
  const how = localizedDescription && rawHow.length === 0 ? [localizedDescription] : [...rawHow];
  const descriptionUnsafe = currentLanguage !== 'en' && !localizedDescription && (sourceLanguage ? sourceLanguage.toLowerCase() !== currentLanguage.toLowerCase() : looksUntranslated(rawDescription ?? '', currentLanguage));
  const safeDescription = localizedDescription || rawDescription;
  if (!how.length && safeDescription && safeDescription !== what) how.push(safeDescription);

  const howMuch: string[] = [];
  const seen = new Set<string>();
  const pushAmount = (labelKey: string, raw: unknown) => {
    const q = quantityText(raw); if (!q) return;
    const value = `${t(labelKey)}: ${q}`;
    if (!seen.has(value)) { seen.add(value); howMuch.push(value); }
  };
  if (taskType === 'irrigation') pushAmount('schedule.amount.water', task.water_required_liters ?? resources.water_required_liters ?? resources.water_liters);
  else {
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
    what, how, howMuch, hasVerifiedAmount: howMuch.length > 0,
    technicalDetails: [...new Set([...technicalDetails, ...legacyTechnical])],
    needsTranslation: resources.needs_translation === true || nameUnsafe || descriptionUnsafe,
  };
}