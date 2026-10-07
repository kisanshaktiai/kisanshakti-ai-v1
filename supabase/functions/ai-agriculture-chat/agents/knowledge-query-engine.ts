/**
 * KNOWLEDGE QUERY ENGINE
 *
 * Deterministic, DB-backed Knowledge Plane for the land-specific brain.
 *
 * Contract:
 *   - This module never calls an LLM.
 *   - It never executes the observation → hypothesis → rule decision graph.
 *   - It only serves facts from explicitly approved / agronomist-reviewed SSOT rows.
 *   - Unsupported facts fail closed with an evidence-gap response.
 *
 * The orchestrator decides WHEN this plane is eligible (currently the DB's
 * GENERAL intent category with zero real symptom evidence). This module owns
 * ONLY deterministic fact resolution and provenance.
 */

import { normalizeCropCode, getFullCropName } from '../utils/crop-code-normalizer.ts';

export type KnowledgeResponseType =
  | 'CROP_INFO'
  | 'CROP_STAGE_KNOWLEDGE'
  | 'FERTILIZER_KNOWLEDGE'
  | 'PEST_KNOWLEDGE'
  | 'WEED_KNOWLEDGE'
  | 'CHEMICAL_STATUS'
  | 'KNOWLEDGE_GAP';

export interface KnowledgeLandContext {
  current_crop?: string | null;
  growth_stage?: string | null;
  days_since_sowing?: number | null;
  state?: string | null;
  soil_type?: string | null;
  cultivation_method?: string | null;
}

export interface KnowledgeQueryInput {
  farmer_message: string;
  language: string;
  intent_code: string;
  intent_category?: string | null;
  land_context: KnowledgeLandContext | null;
  supabase: any;
}

export interface KnowledgeQueryOutput {
  handled: boolean;
  response?: string;
  response_type?: KnowledgeResponseType;
  provider?: string;
  authority_status?: 'VERIFIED' | 'EVIDENCE_GAP';
  authority?: string | null;
  confidence: number;
  facts?: Record<string, unknown>;
  provenance?: Array<Record<string, unknown>>;
  processing_time_ms: number;
  reason?: string;
}

const FERTILIZER_TERMS = [
  'fertilizer', 'fertiliser', 'fertilizers', 'fertilisers',
  'urea', 'dap', 'npk', 'potash', 'nutrient', 'nutrients',
  'खत', 'खाद', 'उर्वरक', 'पोषक', 'युरिया', 'यूरिया', 'डीएपी', 'पोटॅश',
  'khat', 'khaad', 'khad', 'urea', 'poshak', 'urvarak',
];

const WEED_TERMS = [
  'weed', 'weeds', 'weed management', 'weed control', 'herbicide', 'weedicide',
  'तण', 'तणनाशक', 'खरपतवार', 'निंदानाशक',
  'tan', 'tan nashak', 'kharpatwar',
];

const PEST_TERMS = [
  'pest', 'pests', 'insect', 'insects', 'bug', 'bugs', 'borer',
  'कीड', 'किडा', 'किडे', 'कीटक', 'कीट', 'अळी',
  'kida', 'kide', 'kitak', 'ali',
];

const STAGE_TERMS = [
  'stage', 'growth stage', 'growth', 'flowering', 'tillering', 'booting',
  'maturity', 'crop cycle', 'crop stage',
  'टप्पा', 'वाढीची अवस्था', 'अवस्था', 'फुलोरा', 'फुलणे', 'कणस',
  'अवस्था', 'फसल की अवस्था', 'फूल', 'बालियाँ',
];

const KNOWLEDGE_OPERATION_TERMS = [
  'what is', 'what are', 'which are', 'tell me about', 'explain', 'meaning',
  'information', 'types of', 'common', 'usually', 'generally', 'about',
  'काय आहे', 'काय आहेत', 'कोणते', 'कोणकोणते', 'माहिती', 'सांगा', 'समजावून',
  'म्हणजे काय', 'कशासाठी', 'किती प्रकार',
  'क्या है', 'क्या हैं', 'कौन से', 'कौन-कौन', 'जानकारी', 'बताइए', 'समझाइए',
  'मतलब क्या', 'किस लिए',
];

function textContainsAny(text: string, terms: string[]): boolean {
  const value = String(text ?? '').toLowerCase();
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function hasKnowledgeOperation(message: string): boolean {
  return textContainsAny(message, KNOWLEDGE_OPERATION_TERMS);
}

function detectTopic(message: string): KnowledgeResponseType {
  if (textContainsAny(message, WEED_TERMS)) return 'WEED_KNOWLEDGE';
  if (textContainsAny(message, FERTILIZER_TERMS)) return 'FERTILIZER_KNOWLEDGE';
  if (textContainsAny(message, PEST_TERMS)) return 'PEST_KNOWLEDGE';
  if (textContainsAny(message, STAGE_TERMS)) return 'CROP_STAGE_KNOWLEDGE';
  return 'CROP_INFO';
}

function canonicalCrop(input: KnowledgeQueryInput): string {
  const fromLand = normalizeCropCode(input.land_context?.current_crop ?? '');
  if (fromLand) return fromLand;
  return normalizeCropCode(input.farmer_message);
}

function localLabel(row: any, language: string): string {
  const lang = String(language || 'en').toLowerCase();
  if (lang === 'mr' && row?.label_mr) return String(row.label_mr);
  if (lang === 'hi' && row?.label_hi) return String(row.label_hi);
  return String(row?.label || row?.local_name || row?.value || '');
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function cropProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const { data, error } = await input.supabase
    .from('crops')
    .select('value,label,label_hi,label_mr,label_local,description,season,duration_days,is_active')
    .eq('value', crop)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const label = localLabel(data, input.language) || getFullCropName(crop);
  const pieces: string[] = [];
  if (label) pieces.push('Crop: ' + label);
  if (data.description) pieces.push('Description: ' + String(data.description));
  if (data.season) pieces.push('Season: ' + String(data.season));
  if (data.duration_days != null) pieces.push('Typical duration recorded in the crop master: ' + String(data.duration_days) + ' days.');

  return {
    handled: true,
    response: pieces.join('\n'),
    response_type: 'CROP_INFO',
    provider: 'CropKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: 'crops master',
    confidence: 0.98,
    facts: {
      crop_code: crop,
      label,
      description: data.description ?? null,
      season: data.season ?? null,
      duration_days: data.duration_days ?? null,
    },
    provenance: [{ table: 'crops', row_id: data.value, authority: 'structured SSOT' }],
    processing_time_ms: performance.now() - started,
  };
}

async function stageProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const stage = String(input.land_context?.growth_stage ?? '').trim();

  if (stage) {
    const { data, error } = await input.supabase
      .from('crop_stage_knowledge')
      .select('id,crop_code,growth_stage,water,fertilizer,pest_watch,disease_watch,critical_actions,avoid_actions,source,reviewed_by_agronomist')
      .eq('crop_code', crop)
      .ilike('growth_stage', stage)
      .eq('reviewed_by_agronomist', true)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const pieces: string[] = [
        'Crop: ' + getFullCropName(crop),
        'Stage: ' + String(data.growth_stage),
      ];
      if (data.water) pieces.push('Water: ' + String(data.water));
      if (data.fertilizer) pieces.push('Fertilizer note: ' + String(data.fertilizer));
      const pestWatch = cleanStringArray(data.pest_watch);
      const diseaseWatch = cleanStringArray(data.disease_watch);
      const critical = cleanStringArray(data.critical_actions);
      const avoid = cleanStringArray(data.avoid_actions);
      if (pestWatch.length) pieces.push('Pest watch: ' + pestWatch.join('; '));
      if (diseaseWatch.length) pieces.push('Disease watch: ' + diseaseWatch.join('; '));
      if (critical.length) pieces.push('Critical actions: ' + critical.join('; '));
      if (avoid.length) pieces.push('Avoid: ' + avoid.join('; '));

      return {
        handled: true,
        response: pieces.join('\n'),
        response_type: 'CROP_STAGE_KNOWLEDGE',
        provider: 'CropStageKnowledgeProvider',
        authority_status: 'VERIFIED',
        authority: String(data.source || 'agronomist reviewed crop_stage_knowledge'),
        confidence: 0.99,
        facts: {
          crop_code: crop,
          growth_stage: data.growth_stage,
          water: data.water ?? null,
          fertilizer: data.fertilizer ?? null,
          pest_watch: pestWatch,
          disease_watch: diseaseWatch,
          critical_actions: critical,
          avoid_actions: avoid,
        },
        provenance: [{
          table: 'crop_stage_knowledge',
          row_id: data.id,
          source: data.source ?? null,
          reviewed_by_agronomist: true,
        }],
        processing_time_ms: performance.now() - started,
      };
    }
  }

  const { data, error } = await input.supabase
    .from('crop_stage_master')
    .select('id,crop_code,growth_stage,stage_code,das_min,das_max,stage_description,phenology_index,is_active')
    .eq('crop_code', crop)
    .eq('is_active', true)
    .order('phenology_index', { ascending: true })
    .limit(50);

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const stages = uniqueStrings(data.map((row: any) => String(row.growth_stage || row.stage_code || '')));
  if (!stages.length) return null;

  const stageRows = data.map((row: any) => ({
    growth_stage: row.growth_stage ?? row.stage_code ?? null,
    das_min: row.das_min ?? null,
    das_max: row.das_max ?? null,
    description: row.stage_description ?? null,
  }));

  return {
    handled: true,
    response: 'Verified crop stages for ' + getFullCropName(crop) + ':\n' + stageRows
      .map((row: any) => {
        const das = row.das_min != null || row.das_max != null
          ? ' (' + String(row.das_min ?? '?') + '–' + String(row.das_max ?? '?') + ' DAS)'
          : '';
        return '- ' + String(row.growth_stage) + das + (row.description ? ': ' + String(row.description) : '');
      }).join('\n'),
    response_type: 'CROP_STAGE_KNOWLEDGE',
    provider: 'CropStageKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: 'crop_stage_master',
    confidence: 0.97,
    facts: { crop_code: crop, stages: stageRows },
    provenance: data.map((row: any) => ({
      table: 'crop_stage_master',
      row_id: row.id,
      source: 'structured SSOT',
    })),
    processing_time_ms: performance.now() - started,
  };
}

async function fertilizerProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const { data, error } = await input.supabase
    .from('fertilizer_recommendation_master')
    .select('id,crop_code,region_code,soil_fertility_class,n_kg_ha,p2o5_kg_ha,k2o_kg_ha,split_schedule,cultivation_context,source,authority,publication_year,confidence,review_status')
    .eq('crop_code', crop)
    .eq('review_status', 'approved')
    .limit(50);

  if (error || !Array.isArray(data) || data.length === 0) return null;

  // A general fact may only be served when the approved corpus is unambiguous
  // for the current scope. Region-specific competing rows are never guessed.
  const rows = data as any[];
  const state = String(input.land_context?.state ?? '').toLowerCase();
  const explicitStateRow = state
    ? rows.filter((r) => String(r.region_code ?? '').toLowerCase().includes(state))
    : [];
  const candidates = explicitStateRow.length === 1 ? explicitStateRow : rows.length === 1 ? rows : [];

  if (candidates.length !== 1) return null;

  const row = candidates[0];
  const pieces = [
    'Verified fertilizer recommendation for ' + getFullCropName(crop) + ':',
    'N: ' + String(row.n_kg_ha) + ' kg/ha',
    'P2O5: ' + String(row.p2o5_kg_ha) + ' kg/ha',
    'K2O: ' + String(row.k2o_kg_ha) + ' kg/ha',
  ];
  if (row.split_schedule) pieces.push('Split schedule: ' + String(row.split_schedule));
  if (row.cultivation_context) pieces.push('Cultivation context: ' + String(row.cultivation_context));

  return {
    handled: true,
    response: pieces.join('\n'),
    response_type: 'FERTILIZER_KNOWLEDGE',
    provider: 'FertilizerKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: String(row.authority || row.source || 'approved fertilizer master'),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.95,
    facts: {
      crop_code: crop,
      region_code: row.region_code ?? null,
      soil_fertility_class: row.soil_fertility_class ?? null,
      n_kg_ha: row.n_kg_ha,
      p2o5_kg_ha: row.p2o5_kg_ha,
      k2o_kg_ha: row.k2o_kg_ha,
      split_schedule: row.split_schedule ?? null,
      cultivation_context: row.cultivation_context ?? null,
    },
    provenance: [{
      table: 'fertilizer_recommendation_master',
      row_id: row.id,
      source: row.source ?? null,
      authority: row.authority ?? null,
      publication_year: row.publication_year ?? null,
      review_status: 'approved',
    }],
    processing_time_ms: performance.now() - started,
  };
}

async function weedProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const { data, error } = await input.supabase
    .from('weed_master')
    .select('weed_code,scientific_name,common_names,weed_type,lifecycle,season,crop_associations,resistance_notes,management_note,source,authority,confidence,review_status')
    .eq('review_status', 'approved')
    .limit(100);

  if (error || !Array.isArray(data)) return null;

  const rows = (data as any[]).filter((row) =>
    cleanStringArray(row.crop_associations).some((association) =>
      association.toLowerCase() === crop.toLowerCase() ||
      association.toLowerCase() === 'all crops' ||
      association.toLowerCase() === 'vegetables' && crop === 'brinjal',
    ),
  );

  if (!rows.length) return null;

  const facts = rows.map((row) => ({
    weed_code: row.weed_code,
    scientific_name: row.scientific_name,
    common_names: cleanStringArray(row.common_names),
    weed_type: row.weed_type,
    lifecycle: row.lifecycle,
    season: row.season,
    resistance_notes: row.resistance_notes,
    management_note: row.management_note,
  }));

  const response = 'Verified weeds recorded for ' + getFullCropName(crop) + ':\n' +
    facts.map((row) => {
      const names = uniqueStrings([row.scientific_name, ...(row.common_names || [])]).join(' / ');
      const note = row.management_note ? ' — ' + String(row.management_note) : '';
      const resistance = row.resistance_notes ? ' Resistance note: ' + String(row.resistance_notes) : '';
      return '- ' + names + note + resistance;
    }).join('\n');

  return {
    handled: true,
    response,
    response_type: 'WEED_KNOWLEDGE',
    provider: 'WeedKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: String(rows[0].authority || rows[0].source || 'approved weed master'),
    confidence: 0.97,
    facts: { crop_code: crop, weeds: facts },
    provenance: rows.map((row) => ({
      table: 'weed_master',
      row_id: row.weed_code,
      source: row.source ?? null,
      authority: row.authority ?? null,
      review_status: 'approved',
    })),
    processing_time_ms: performance.now() - started,
  };
}

async function pestProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  let query = input.supabase
    .from('crop_stage_knowledge')
    .select('id,crop_code,growth_stage,pest_watch,source,reviewed_by_agronomist')
    .eq('crop_code', crop)
    .eq('reviewed_by_agronomist', true);

  const stage = String(input.land_context?.growth_stage ?? '').trim();
  if (stage) query = query.ilike('growth_stage', stage);

  const { data, error } = await query.limit(50);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const watches = uniqueStrings(
    data.flatMap((row: any) => cleanStringArray(row.pest_watch)),
  );
  if (!watches.length) return null;

  return {
    handled: true,
    response: 'Verified pest-watch records for ' + getFullCropName(crop) + ':' + (stage ? ' at ' + stage + ' stage' : '') + '\n' +
      watches.map((item) => '- ' + item).join('\n'),
    response_type: 'PEST_KNOWLEDGE',
    provider: 'PestKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: 'agronomist-reviewed crop_stage_knowledge',
    confidence: 0.96,
    facts: { crop_code: crop, growth_stage: stage || null, pest_watch: watches },
    provenance: data.map((row: any) => ({
      table: 'crop_stage_knowledge',
      row_id: row.id,
      source: row.source ?? null,
      reviewed_by_agronomist: true,
    })),
    processing_time_ms: performance.now() - started,
  };
}

async function chemicalStatusProvider(input: KnowledgeQueryInput): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const { data, error } = await input.supabase
    .from('chemical_regulatory_status')
    .select('id,chemical_name,status,regulatory_body,ban_date,reason,source_ref,effective_from')
    .limit(200);

  if (error || !Array.isArray(data)) return null;

  const message = String(input.farmer_message || '').toLowerCase();
  const matches = (data as any[]).filter((row) => {
    const name = String(row.chemical_name ?? '').trim().toLowerCase();
    return name && message.includes(name);
  });

  if (matches.length !== 1) return null;
  const row = matches[0];
  const status = String(row.status ?? '').toLowerCase();
  if (!['banned', 'restricted', 'watch_list'].includes(status)) return null;

  const pieces = [
    'Verified regulatory status for ' + String(row.chemical_name) + ': ' + String(row.status),
  ];
  if (row.regulatory_body) pieces.push('Regulatory body: ' + String(row.regulatory_body));
  if (row.ban_date) pieces.push('Ban date: ' + String(row.ban_date));
  if (row.effective_from) pieces.push('Effective from: ' + String(row.effective_from));
  if (row.reason) pieces.push('Reason: ' + String(row.reason));

  return {
    handled: true,
    response: pieces.join('\n'),
    response_type: 'CHEMICAL_STATUS',
    provider: 'ChemicalStatusProvider',
    authority_status: 'VERIFIED',
    authority: String(row.regulatory_body || row.source_ref || 'regulatory status master'),
    confidence: 0.99,
    facts: {
      chemical_name: row.chemical_name,
      status: row.status,
      regulatory_body: row.regulatory_body ?? null,
      ban_date: row.ban_date ?? null,
      effective_from: row.effective_from ?? null,
      reason: row.reason ?? null,
    },
    provenance: [{
      table: 'chemical_regulatory_status',
      row_id: row.id,
      source_ref: row.source_ref ?? null,
      status: row.status,
    }],
    processing_time_ms: performance.now() - started,
  };
}

function evidenceGap(input: KnowledgeQueryInput, crop: string, topic: KnowledgeResponseType, started: number): KnowledgeQueryOutput {
  const subject = crop ? getFullCropName(crop) : 'the requested crop';
  return {
    handled: true,
    response: 'I do not have a verified fact for this question in the current agricultural knowledge SSOT. I will not invent an answer.',
    response_type: 'KNOWLEDGE_GAP',
    provider: 'KnowledgePlaneAuthorityGate',
    authority_status: 'EVIDENCE_GAP',
    authority: null,
    confidence: 0,
    facts: {
      crop_code: crop || null,
      requested_topic: topic,
      evidence_gap: true,
      subject,
    },
    provenance: [],
    processing_time_ms: performance.now() - started,
    reason: 'NO_VERIFIED_KNOWLEDGE_MATCH',
  };
}

export async function queryKnowledgePlane(input: KnowledgeQueryInput): Promise<KnowledgeQueryOutput> {
  const started = performance.now();

  if (!input.supabase || !input.farmer_message?.trim()) {
    return {
      handled: false,
      confidence: 0,
      processing_time_ms: performance.now() - started,
      reason: 'MISSING_INPUT',
    };
  }

  if (input.intent_category && String(input.intent_category).toUpperCase() !== 'GENERAL') {
    return {
      handled: false,
      confidence: 0,
      processing_time_ms: performance.now() - started,
      reason: 'INTENT_NOT_GENERAL',
    };
  }

  const crop = canonicalCrop(input);
  const topic = detectTopic(input.farmer_message);

  // A general knowledge turn should normally be phrased as a fact/explanation
  // query. When the semantic classifier has already supplied the GENERAL intent,
  // we still allow the provider because that classifier is the authority on
  // multilingual meaning. These terms are used only to disambiguate the
  // structured provider, never to grant a decision.
  const knowledgeOperation = hasKnowledgeOperation(input.farmer_message);

  // Regulatory status is safe to resolve directly only when a chemical name is
  // actually present in the farmer's message.
  const chemical = await chemicalStatusProvider(input);
  if (chemical) {
    chemical.processing_time_ms = performance.now() - started;
    return chemical;
  }

  if (!crop) {
    return evidenceGap(input, '', topic, started);
  }

  let result: KnowledgeQueryOutput | null = null;

  if (topic === 'FERTILIZER_KNOWLEDGE') {
    result = await fertilizerProvider(input, crop);
  } else if (topic === 'WEED_KNOWLEDGE') {
    result = await weedProvider(input, crop);
  } else if (topic === 'PEST_KNOWLEDGE') {
    result = await pestProvider(input, crop);
  } else if (topic === 'CROP_STAGE_KNOWLEDGE') {
    result = await stageProvider(input, crop);
  } else {
    result = await cropProvider(input, crop);
    if (!result) result = await stageProvider(input, crop);
  }

  if (result) {
    result.processing_time_ms = performance.now() - started;
    return result;
  }

  // Knowledge intent without a verified provider match: terminate cleanly
  // instead of falling into the diagnostic/observation graph.
  const gap = evidenceGap(input, crop, topic, started);
  if (!knowledgeOperation) {
    gap.reason = 'GENERAL_INTENT_NO_STRUCTURED_MATCH';
  }
  return gap;
}

export default { queryKnowledgePlane };
