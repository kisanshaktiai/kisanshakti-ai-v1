// OBSERVATION CLASSIFICATION CACHE — DB-backed SSOT

export type FailureClassEnum =
  | 'ESTABLISHMENT_FAILURE'
  | 'VEGETATIVE_STRESS'
  | 'PEST_DAMAGE'
  | 'DISEASE_SYMPTOM'
  | 'NUTRIENT_DEFICIENCY'
  | 'WEED_COMPETITION'
  | 'UNKNOWN';

export type AuthorityDomainEnum = 'CROP' | 'LAND' | 'CLIMATE' | 'SYSTEM' | 'SAFETY' | 'UNKNOWN';

export interface ObservationClassification {
  observation_code: string;
  semantic_class: string | null;
  canonical_group: string | null;
  observation_category: string | null;
  is_diagnostic: boolean;
  clarity_score: number | null;
  applies_to_stages: string[] | null;
  failure_class: FailureClassEnum;
  authority_domain: AuthorityDomainEnum;
  is_vague: boolean;
}

interface Cache {
  loadedAt: number;
  byCanonical: Map<string, ObservationClassification>;
  aliasToCanonical: Map<string, string>;
}

let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;

function norm(v: string | null | undefined): string {
  return String(v ?? '').toLowerCase();
}

function deriveFailureClass(row: {
  semantic_class: string | null;
  canonical_group: string | null;
  observation_category: string | null;
}): FailureClassEnum {
  const sc = norm(row.semantic_class);
  const cg = norm(row.canonical_group);
  const oc = norm(row.observation_category);

  if (cg.includes('_weather') || cg.includes('stress_weather') || cg.endsWith('_weather')) {
    return 'VEGETATIVE_STRESS';
  }
  if (sc === 'weather_damage' && !cg.includes('_soil')) return 'VEGETATIVE_STRESS';
  if (sc === 'pest') return 'PEST_DAMAGE';
  if (sc === 'disease') return 'DISEASE_SYMPTOM';
  if (sc === 'nutrient') return 'NUTRIENT_DEFICIENCY';
  if (sc === 'weed' || cg.includes('_weed') || cg.endsWith('weed')) return 'WEED_COMPETITION';
  if (sc === 'phenology' || oc === 'establishment' || cg.includes('_stage')) {
    return 'ESTABLISHMENT_FAILURE';
  }
  if (sc === 'physiology') return 'VEGETATIVE_STRESS';
  return 'UNKNOWN';
}

function deriveAuthorityDomain(row: {
  semantic_class: string | null;
  canonical_group: string | null;
}): AuthorityDomainEnum {
  const sc = norm(row.semantic_class);
  const cg = norm(row.canonical_group);
  if (cg.includes('_soil')) return 'LAND';
  if (sc === 'weather_damage') return 'CLIMATE';
  if (['pest', 'disease', 'nutrient', 'weed', 'physiology', 'phenology'].includes(sc)) return 'CROP';
  return 'UNKNOWN';
}

interface OMRow {
  observation_code: string;
  semantic_class: string | null;
  canonical_group: string | null;
  observation_category: string | null;
  is_diagnostic: boolean | null;
  clarity_score: number | null;
  applies_to_stages: string[] | null;
}

interface AliasRow {
  alias_code: string | null;
  canonical_code: string | null;
  active: boolean | null;
}

export async function loadObservationClassification(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;

  const byCanonical = new Map<string, ObservationClassification>();
  const aliasToCanonical = new Map<string, string>();

  // Paginate observation_master (2540 rows > 1000 default cap).
  const PAGE = 1000;
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('observation_master')
        .select(
          'observation_code, semantic_class, canonical_group, observation_category, is_diagnostic, clarity_score, applies_to_stages'
        )
        .eq('is_active', true)
        .order('observation_code', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_CLASSIFICATION_CACHE] observation_master @${offset}:`, error.message);
        break;
      }
      const rows = (data as OMRow[] | null) ?? [];
      for (const r of rows) {
        if (!r?.observation_code) continue;
        const key = norm(r.observation_code);
        const failure_class = deriveFailureClass(r);
        const authority_domain = deriveAuthorityDomain(r);
        const clarity = typeof r.clarity_score === 'number' ? r.clarity_score : null;
        const is_diag = r.is_diagnostic !== false; // treat null as diagnostic to avoid false vagueness
        const is_vague = !is_diag || (clarity !== null && clarity < 30);
        byCanonical.set(key, {
          observation_code: r.observation_code,
          semantic_class: r.semantic_class,
          canonical_group: r.canonical_group,
          observation_category: r.observation_category,
          is_diagnostic: is_diag,
          clarity_score: clarity,
          applies_to_stages: r.applies_to_stages,
          failure_class,
          authority_domain,
          is_vague,
        });
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    console.warn('[OBS_CLASSIFICATION_CACHE] observation_master load failed', e);
  }

  // Aliases — bridge ALL_CAPS upstream tokens to lowercase canonical codes.
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('observation_aliases')
        .select('alias_code, canonical_code, active')
        .eq('active', true)
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_CLASSIFICATION_CACHE] observation_aliases @${offset}:`, error.message);
        break;
      }
      const rows = (data as AliasRow[] | null) ?? [];
      for (const r of rows) {
        if (!r?.alias_code || !r?.canonical_code) continue;
        aliasToCanonical.set(norm(r.alias_code), norm(r.canonical_code));
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    console.warn('[OBS_CLASSIFICATION_CACHE] observation_aliases load failed', e);
  }

  cache = { loadedAt: now, byCanonical, aliasToCanonical };
  console.log(
    `[OBS_CLASSIFICATION_CACHE] loaded observations=${byCanonical.size} aliases=${aliasToCanonical.size}`
  );
}

// Resolve any upstream token (uppercase alias OR lowercase canonical) to its
export function classifyObservation(token: string): ObservationClassification | null {
  if (!cache || !token) return null;
  const n = norm(token);
  const direct = cache.byCanonical.get(n);
  if (direct) return direct;
  const canonical = cache.aliasToCanonical.get(n);
  if (canonical) {
    const row = cache.byCanonical.get(canonical);
    if (row) return row;
  }
  return null;
}

/** DB-classified failure class. UNKNOWN if token not classifiable. */
export function classifyFailureClass(token: string): FailureClassEnum {
  return classifyObservation(token)?.failure_class ?? 'UNKNOWN';
}

/** DB-classified authority domain. UNKNOWN if token not classifiable. */
export function classifyAuthorityDomain(token: string): AuthorityDomainEnum {
  return classifyObservation(token)?.authority_domain ?? 'UNKNOWN';
}

/** True iff DB marks the token as low-signal (non-diagnostic OR clarity<30). */
export function isVagueObservation(token: string): boolean {
  const c = classifyObservation(token);
  if (!c) return false; // unknown ≠ vague; keep conservative
  return c.is_vague;
}

// DB-driven stage compatibility. Uses `observation_master.applies_to_stages`.
export function observationAppliesToStage(token: string, stage: string): boolean {
  const c = classifyObservation(token);
  if (!c || !c.applies_to_stages || c.applies_to_stages.length === 0) return true;
  const s = norm(stage);
  if (!s) return true;
  return c.applies_to_stages.some((x) => norm(x) === s);
}

export function isObservationClassificationLoaded(): boolean {
  return !!cache && cache.byCanonical.size > 0;
}

// HYPOTHESIS TYPE CACHE — SSOT for cause-code → authority classification

type HypothesisTypeEnum = 'PEST' | 'DISEASE' | 'DEFICIENCY' | 'STRESS' | 'ENVIRONMENTAL' | 'UNKNOWN';

interface HypothesisTypeCache {
  loadedAt: number;
  byId: Map<string, HypothesisTypeEnum>;
}

let hypoCache: HypothesisTypeCache | null = null;

export async function loadHypothesisTypes(supabase: any): Promise<void> {
  const now = Date.now();
  if (hypoCache && now - hypoCache.loadedAt < TTL_MS) return;
  const byId = new Map<string, HypothesisTypeEnum>();
  const PAGE = 1000;
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('hypothesis_master')
        .select('hypothesis_id, hypothesis_type, is_active')
        .eq('is_active', true)
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[HYPOTHESIS_TYPE_CACHE] @${offset}:`, error.message);
        break;
      }
      const rows = (data as Array<{ hypothesis_id: string; hypothesis_type: string }> | null) ?? [];
      for (const r of rows) {
        if (!r?.hypothesis_id) continue;
        const t = String(r.hypothesis_type ?? '').toUpperCase() as HypothesisTypeEnum;
        byId.set(norm(r.hypothesis_id), t || 'UNKNOWN');
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    console.warn('[HYPOTHESIS_TYPE_CACHE] load failed', e);
  }
  hypoCache = { loadedAt: now, byId };
  console.log(`[HYPOTHESIS_TYPE_CACHE] loaded hypotheses=${byId.size}`);
}

/** Returns hypothesis_type from DB (PEST/DISEASE/DEFICIENCY/STRESS/ENVIRONMENTAL) or null on miss. */
export function getHypothesisType(causeCode: string): HypothesisTypeEnum | null {
  if (!hypoCache || !causeCode) return null;
  return hypoCache.byId.get(norm(causeCode)) ?? null;
}

export function isHypothesisTypeCacheLoaded(): boolean {
  return !!hypoCache && hypoCache.byId.size > 0;
}
