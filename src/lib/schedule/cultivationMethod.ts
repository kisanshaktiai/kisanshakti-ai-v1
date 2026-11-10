/** DB-derived crop establishment methods, never input/organic farming policies. */
export interface CropStageEvidence {
  cultivation_method: string | null;
  crop_cycle: string | null;
  stage_code: string | null;
  growth_stage: string | null;
}
export interface CropMethodMaster {
  method_code: string;
  method_name_en: string | null;
  method_name_hi: string | null;
  method_name_mr: string | null;
  requires_nursery: boolean | null;
  is_active: boolean;
  parent_method_code: string | null;
}
export interface CropMethodLink { method_code: string; is_primary: boolean; }
export interface CultivationOption {
  code: string;
  nameEn: string;
  nameHi: string | null;
  nameMr: string | null;
  requiresNursery: boolean;
  primary: boolean;
  stageClockMethod: string | null;
  stageCount: number;
  hasCompleteCalendar: boolean;
}
const TERMINAL = /(HARVEST|MATUR|RIPEN|CUTTING|PICKING)/i;
const norm = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

export function getCultivationOptions(
  master: CropMethodMaster[], links: CropMethodLink[],
  stages: CropStageEvidence[], selectedCycle: string | null
): CultivationOption[] {
  const cycle = norm(selectedCycle) || 'universal';
  const methods = new Map(master.filter(m => m.is_active).map(m => [norm(m.method_code), m]));
  return [...links].sort((a,b) => Number(b.is_primary)-Number(a.is_primary) ||
      a.method_code.localeCompare(b.method_code)).flatMap(link => {
    const method = methods.get(norm(link.method_code));
    if (!method) return [];
    let current: CropMethodMaster | undefined = method;
    let clock: string | null = null;
    const visited = new Set<string>();
    while (current && !visited.has(norm(current.method_code))) {
      visited.add(norm(current.method_code));
      const code = norm(current.method_code);
      const matching = stages.filter(s =>
        (norm(s.crop_cycle) === cycle || norm(s.crop_cycle) === 'universal') &&
        (!norm(s.cultivation_method) || norm(s.cultivation_method) === code));
      if (matching.length) { clock = current.method_code; break; }
      current = current.parent_method_code ? methods.get(norm(current.parent_method_code)) : undefined;
    }
    const scoped = clock ? stages.filter(s =>
      (norm(s.crop_cycle) === cycle || norm(s.crop_cycle) === 'universal') &&
      (!norm(s.cultivation_method) || norm(s.cultivation_method) === norm(clock))) : [];
    return [{
      code: method.method_code,
      nameEn: method.method_name_en || method.method_code,
      nameHi: method.method_name_hi,
      nameMr: method.method_name_mr,
      requiresNursery: method.requires_nursery === true,
      primary: link.is_primary === true,
      stageClockMethod: clock,
      stageCount: scoped.length,
      hasCompleteCalendar: scoped.some(s =>
        TERMINAL.test(s.stage_code || '') || TERMINAL.test(s.growth_stage || '')),
    }];
  });
}

/** Minimal shape of a variety_cultivation_agronomy row needed for method suitability. */
export interface MethodSuitabilityRow { id: string; cultivation_method: string; is_suitable: boolean; }
export type MethodSuitabilityState = 'recommended' | 'not_recommended' | 'unknown';

/**
 * Mirrors the schedule service gate: a method is unsuitable when any active DB row for the
 * method itself or its stage-clock parent says is_suitable=false. Crop/variety agnostic.
 */
export function methodSuitabilityFor<T extends MethodSuitabilityRow>(
  option: Pick<CultivationOption, 'code' | 'stageClockMethod'>, rows: T[]
): { state: MethodSuitabilityState; unsuitable: T[] } {
  const candidates = new Set([norm(option.code), norm(option.stageClockMethod)].filter(Boolean));
  const matching = rows.filter(r => candidates.has(norm(r.cultivation_method)));
  const unsuitable = matching.filter(r => r.is_suitable === false);
  if (unsuitable.length) return { state: 'not_recommended', unsuitable };
  if (matching.some(r => r.is_suitable === true && norm(r.cultivation_method) === norm(option.code)))
    return { state: 'recommended', unsuitable: [] };
  return { state: 'unknown', unsuitable: [] };
}
