/**
 * DIRECT CONTEXT GRAPH
 *
 * DB-authorized resolver for farmer turns whose intent contract is DIRECT.
 *
 * This is not a keyword router and not an LLM. It resolves the farmer's
 * request against DB-owned intent scope + decision_rules + field context.
 * Candidate observations from intent_observation_mapping are never treated
 * as farmer evidence.
 */

import { normalizeCropCode } from '../utils/crop-code-normalizer.ts';

export type DirectGraphMode = 'KNOWLEDGE' | 'DECISION' | 'MIXED';

export interface DirectContextGraphInput {
  intent_code: string;
  execution_mode: DirectGraphMode;
  farmer_message: string;
  language: string;
  crop_code: string;
  growth_stage?: string | null;
  days_since_sowing?: number | null;
  state?: string | null;
  soil_type?: string | null;
  cultivation_method?: string | null;
  confirmed_observations?: string[];
  perceived_observations?: string[];
  supabase: any;
  trace_id: string;
}

export interface DirectContextRule {
  rule_id: string;
  crop_code: string | null;
  category: string | null;
  priority: number;
  data_authority_rank: number;
  stage_applicable: string[];
  growth_stage: string | null;
  required_observation_category: string[];
  conditions_json: Record<string, unknown>;
  action_type: string | null;
  action_text: string | null;
  reason_text: string | null;
  knowledge_text: string | null;
  rule_intent: string | null;
  i18n_key: string | null;
}

export interface DirectContextGraphOutput {
  handled: boolean;
  status: 'READY' | 'NEEDS_MORE_EVIDENCE' | 'NO_MATCH';
  rules: DirectContextRule[];
  rule_ids: string[];
  missing_observation_codes: string[];
  missing_observation_categories: string[];
  response_facts: Record<string, unknown>;
  provenance: Array<Record<string, unknown>>;
  reason: string;
  processing_time_ms: number;
}

function token(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\\s-]+/g, '_');
}

function sameValue(a: unknown, b: unknown): boolean {
  const x = token(a);
  const y = token(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v ?? '').trim()).filter(Boolean);
}

function numeric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stageMatches(rule: any, stage: string | null | undefined): boolean {
  const allowed = [
    ...asStringArray(rule?.stage_applicable),
    ...asStringArray(rule?.growth_stage ? [rule.growth_stage] : []),
  ];
  if (allowed.length === 0) return true;
  const s = token(stage);
  if (!s) return false;
  return allowed.some(v => {
    const k = token(v);
    return k === 'all' || k === '*' || k === s;
  });
}

function contextMatches(rule: any, input: DirectContextGraphInput): boolean {
  const c = (rule?.conditions_json && typeof rule.conditions_json === 'object')
    ? rule.conditions_json as Record<string, unknown>
    : {};

  const conditionCrop = c.crop_code ?? c.crop;
  if (conditionCrop && !sameValue(conditionCrop, input.crop_code)) return false;

  const conditionState = c.state ?? c.state_name;
  if (conditionState) {
    if (!input.state || !sameValue(conditionState, input.state)) return false;
  }

  const conditionMethod =
    c.cultivation_method ??
    c.establishment_method ??
    c.method_code;
  if (conditionMethod) {
    if (!input.cultivation_method || !sameValue(conditionMethod, input.cultivation_method)) return false;
  }

  const das = input.days_since_sowing;
  const cDasMin = numeric(c.das_min ?? c.days_since_sowing_min);
  const cDasMax = numeric(c.das_max ?? c.days_since_sowing_max);
  if (cDasMin != null && (das == null || das < cDasMin)) return false;
  if (cDasMax != null && (das == null || das > cDasMax)) return false;

  const range = c.das_range;
  if (Array.isArray(range) && range.length >= 2) {
    const lo = numeric(range[0]);
    const hi = numeric(range[1]);
    if (lo != null && (das == null || das < lo)) return false;
    if (hi != null && (das == null || das > hi)) return false;
  }

  const conditionSoil = c.soil_type;
  if (conditionSoil && input.soil_type && !sameValue(conditionSoil, input.soil_type)) return false;

  return true;
}

function extractObservationCodes(rule: any): string[] {
  const c = (rule?.conditions_json && typeof rule.conditions_json === 'object')
    ? rule.conditions_json as Record<string, unknown>
    : {};
  const out: string[] = [];
  for (const key of ['observations', 'observation', 'symptoms', 'symptom', 'primary_symptom', 'required_symptoms']) {
    const value = c[key];
    if (Array.isArray(value)) out.push(...value.map(v => String(v ?? '').trim()).filter(Boolean));
    else if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return [...new Set(out.map(token).filter(Boolean))];
}

function hasFarmerEvidenceRequirement(rule: any, availableContextTokens: Set<string>): { required: boolean; codes: string[]; categories: string[] } {
  const codes = extractObservationCodes(rule);
  const categories = asStringArray(rule?.required_observation_category);

  if (codes.length > 0) {
    const missing = codes.filter(code => !availableContextTokens.has(token(code)));
    return { required: missing.length > 0, codes: missing, categories };
  }

  return {
    required: categories.length > 0,
    codes: [],
    categories,
  };
}

async function loadContextTokens(input: DirectContextGraphInput): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const crop = normalizeCropCode(input.crop_code);
    const { data: iom } = await input.supabase
      .from('intent_observation_mapping')
      .select('observation_code,crop_code,is_active,growth_stage,das_min,das_max')
      .eq('intent_code', input.intent_code)
      .eq('is_active', true)
      .in('crop_code', [crop, 'ALL', 'all']);
    const codes = [...new Set((iom || []).map((r: any) => String(r.observation_code ?? '').trim()).filter(Boolean))];
    if (!codes.length) return out;

    const { data: obs } = await input.supabase
      .from('observation_master')
      .select('observation_code,is_farmer_observable,is_active')
      .in('observation_code', codes);
    for (const row of (obs || [])) {
      if (row?.is_active !== false && row?.is_farmer_observable === false) {
        out.add(token(row.observation_code));
      }
    }
  } catch (e) {
    console.warn('[DIRECT_CONTEXT_GRAPH] context-token lookup failed:', (e as Error).message);
  }
  return out;
}

function sortRules(a: any, b: any): number {
  const authority = Number(b?.data_authority_rank ?? 0) - Number(a?.data_authority_rank ?? 0);
  if (authority !== 0) return authority;
  const priority = Number(b?.priority ?? 0) - Number(a?.priority ?? 0);
  if (priority !== 0) return priority;
  return String(a?.rule_id ?? '').localeCompare(String(b?.rule_id ?? ''));
}

export async function resolveDirectContextGraph(input: DirectContextGraphInput): Promise<DirectContextGraphOutput> {
  const started = performance.now();
  const crop = normalizeCropCode(input.crop_code);
  if (!crop || !input.intent_code || !input.supabase) {
    return {
      handled: false,
      status: 'NO_MATCH',
      rules: [],
      rule_ids: [],
      missing_observation_codes: [],
      missing_observation_categories: [],
      response_facts: {},
      provenance: [],
      reason: 'MISSING_GRAPH_CONTEXT',
      processing_time_ms: performance.now() - started,
    };
  }

  let scopeRows: any[] = [];
  try {
    const { data, error } = await input.supabase
      .from('direct_intent_rule_scope')
      .select('intent_code,rule_category,priority,is_active')
      .eq('intent_code', input.intent_code)
      .eq('is_active', true)
      .order('priority', { ascending: true });
    if (error) throw error;
    scopeRows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[DIRECT_CONTEXT_GRAPH] scope lookup failed:', (e as Error).message);
    return {
      handled: false,
      status: 'NO_MATCH',
      rules: [],
      rule_ids: [],
      missing_observation_codes: [],
      missing_observation_categories: [],
      response_facts: {},
      provenance: [],
      reason: 'DIRECT_SCOPE_UNAVAILABLE',
      processing_time_ms: performance.now() - started,
    };
  }

  const categories = [...new Set(scopeRows.map(r => String(r.rule_category ?? '').trim()).filter(Boolean))];
  if (!categories.length) {
    return {
      handled: false,
      status: 'NO_MATCH',
      rules: [],
      rule_ids: [],
      missing_observation_codes: [],
      missing_observation_categories: [],
      response_facts: {},
      provenance: [],
      reason: 'NO_DIRECT_SCOPE',
      processing_time_ms: performance.now() - started,
    };
  }

  const cropVariants = [crop, crop.toUpperCase(), 'ALL', 'all', '*', 'universal'];
  let rows: any[] = [];
  try {
    const { data, error } = await input.supabase
      .from('decision_rules')
      .select([
        'rule_id','crop_code','category','priority','data_authority_rank',
        'stage_applicable','growth_stage','required_observation_category',
        'conditions_json','action_type','action_text','reason_text',
        'knowledge_text','rule_intent','i18n_key','is_farmer_servable'
      ].join(','))
      .eq('is_active', true)
      .eq('is_farmer_servable', true)
      .in('category', categories)
      .in('crop_code', cropVariants)
      .limit(5000);
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[DIRECT_CONTEXT_GRAPH] rule lookup failed:', (e as Error).message);
    return {
      handled: false,
      status: 'NO_MATCH',
      rules: [],
      rule_ids: [],
      missing_observation_codes: [],
      missing_observation_categories: [],
      response_facts: {},
      provenance: [],
      reason: 'DIRECT_RULE_LOOKUP_FAILED',
      processing_time_ms: performance.now() - started,
    };
  }

  const contextTokens = await loadContextTokens(input);

  const candidates = rows
    .filter((r: any) => stageMatches(r, input.growth_stage))
    .filter((r: any) => contextMatches(r, input))
    .sort(sortRules);

  const availableEvidence = new Set([
    ...(input.confirmed_observations || []),
    ...(input.perceived_observations || []),
  ].map(token));

  const eligible: any[] = [];
  const evidenceBlocked: any[] = [];
  const missingCodes = new Set<string>();
  const missingCategories = new Set<string>();

  for (const rule of candidates) {
    const req = hasFarmerEvidenceRequirement(rule, contextTokens);
    const satisfied = req.required
      ? [...extractObservationCodes(rule).map(token)].some(code => availableEvidence.has(code))
      : true;

    if (input.execution_mode === 'KNOWLEDGE' || input.execution_mode === 'MIXED') {
      eligible.push(rule);
      continue;
    }

    if (!req.required || satisfied) {
      eligible.push(rule);
    } else {
      evidenceBlocked.push(rule);
      req.codes.forEach(c => missingCodes.add(c));
      req.categories.forEach(c => missingCategories.add(c));
    }
  }

  const top = eligible.slice(0, 5).map((r: any): DirectContextRule => ({
    rule_id: String(r.rule_id),
    crop_code: r.crop_code ?? null,
    category: r.category ?? null,
    priority: Number(r.priority ?? 0),
    data_authority_rank: Number(r.data_authority_rank ?? 0),
    stage_applicable: asStringArray(r.stage_applicable),
    growth_stage: r.growth_stage ?? null,
    required_observation_category: asStringArray(r.required_observation_category),
    conditions_json: (r.conditions_json && typeof r.conditions_json === 'object') ? r.conditions_json : {},
    action_type: r.action_type ?? null,
    action_text: r.action_text ?? null,
    reason_text: r.reason_text ?? null,
    knowledge_text: r.knowledge_text ?? null,
    rule_intent: r.rule_intent ?? null,
    i18n_key: r.i18n_key ?? null,
  }));

  const sourceRules = top.filter(r => (r.action_text || r.knowledge_text || r.reason_text));
  const ruleIds = sourceRules.map(r => r.rule_id);

  console.log(
    '[DIRECT_CONTEXT_GRAPH] trace=' + input.trace_id +
    ' intent=' + input.intent_code +
    ' crop=' + crop +
    ' stage=' + (input.growth_stage || 'null') +
    ' mode=' + input.execution_mode +
    ' scope=[' + categories.join(',') + ']' +
    ' candidates=' + candidates.length +
    ' eligible=' + sourceRules.length +
    ' blocked=' + evidenceBlocked.length,
  );

  if (sourceRules.length > 0) {
    return {
      handled: true,
      status: 'READY',
      rules: sourceRules,
      rule_ids: ruleIds,
      missing_observation_codes: [],
      missing_observation_categories: [],
      response_facts: {
        crop_code: crop,
        growth_stage: input.growth_stage ?? null,
        days_since_sowing: input.days_since_sowing ?? null,
        mode: input.execution_mode,
        rules: sourceRules.map(r => ({
          rule_id: r.rule_id,
          category: r.category,
          action_type: r.action_type,
          action_text: r.action_text,
          knowledge_text: r.knowledge_text,
          reason_text: r.reason_text,
          i18n_key: r.i18n_key,
        })),
      },
      provenance: sourceRules.map(r => ({
        table: 'decision_rules',
        row_id: r.rule_id,
        category: r.category,
        crop_code: r.crop_code,
        source: 'DB decision_rules',
      })),
      reason: input.execution_mode === 'KNOWLEDGE' ? 'DB_KNOWLEDGE_SCOPE_MATCH' : 'DB_DIRECT_RULE_MATCH',
      processing_time_ms: performance.now() - started,
    };
  }

  if (evidenceBlocked.length > 0) {
    return {
      handled: true,
      status: 'NEEDS_MORE_EVIDENCE',
      rules: evidenceBlocked.slice(0, 5).map((r: any) => ({
        rule_id: String(r.rule_id),
        crop_code: r.crop_code ?? null,
        category: r.category ?? null,
        priority: Number(r.priority ?? 0),
        data_authority_rank: Number(r.data_authority_rank ?? 0),
        stage_applicable: asStringArray(r.stage_applicable),
        growth_stage: r.growth_stage ?? null,
        required_observation_category: asStringArray(r.required_observation_category),
        conditions_json: (r.conditions_json && typeof r.conditions_json === 'object') ? r.conditions_json : {},
        action_type: r.action_type ?? null,
        action_text: r.action_text ?? null,
        reason_text: r.reason_text ?? null,
        knowledge_text: r.knowledge_text ?? null,
        rule_intent: r.rule_intent ?? null,
        i18n_key: r.i18n_key ?? null,
      })),
      rule_ids: evidenceBlocked.slice(0, 5).map((r: any) => String(r.rule_id)),
      missing_observation_codes: [...missingCodes],
      missing_observation_categories: [...missingCategories],
      response_facts: {
        crop_code: crop,
        growth_stage: input.growth_stage ?? null,
        missing_observation_codes: [...missingCodes],
        missing_observation_categories: [...missingCategories],
      },
      provenance: [],
      reason: 'DIRECT_RULES_REQUIRE_FARMER_EVIDENCE',
      processing_time_ms: performance.now() - started,
    };
  }

  return {
    handled: true,
    status: 'NO_MATCH',
    rules: [],
    rule_ids: [],
    missing_observation_codes: [],
    missing_observation_categories: [],
    response_facts: { crop_code: crop, growth_stage: input.growth_stage ?? null },
    provenance: [],
    reason: 'NO_CONTEXT_RULE_MATCH',
    processing_time_ms: performance.now() - started,
  };
}

export default { resolveDirectContextGraph };
