/**
 * KNOWLEDGE QUERY ENGINE
 *
 * CHANGE LOG (newest first)
 *   2026-10-10 — accuracy + language-agnostic pass (live audit of v102):
 *     • Removed the hardcoded Marathi/Hindi/romanized term lists. The provider is
 *       chosen only from the NLU knowledge_subject (the multilingual authority);
 *       subject NONE/CROP → crop facts. No target-language words remain here.
 *     • Stage provider: the stage list is filtered to the land's cultivation lane
 *       (rice has direct_seeded AND transplanted rows in crop_stage_master; the old
 *       list mixed both, e.g. two different "tillering" DAS windows) and the
 *       answer always carries the full stage list with the current stage marked,
 *       plus the agronomist-reviewed guidance for the current stage.
 *     • Pest provider: crop pest list and named-pest facts come from etl_standards
 *       (ICAR ETL, sampling method, stages, localized names); crop_stage_knowledge
 *       pest_watch stays as the fallback, merged across all reviewed stages
 *       instead of only the current stage.
 *     • Fertilizer split_schedule rendered as readable splits instead of raw JSON.
 *     • Weed crop-association regex had double-escaped tokens (matched literal
 *       backslashes) — fixed.
 *     • Crop label reads label_<language> for all 14 app languages.
 *     • CHEMICAL subject with no chemical named in the message → evidence gap,
 *       never crop facts.
 *   2026-10-09 12:30 UTC — TDZ fix: `started` was declared below the try block in
 *   pestProvider but read inside it — ReferenceError on the named-pest path.
 *   Hoisted the declaration above the try.
 *
 * Deterministic, DB-backed Knowledge Plane for the land-specific brain.
 *
 * Contract:
 *   - This module never calls an LLM.
 *   - It never executes the observation → hypothesis → rule decision graph.
 *   - It only serves facts from explicitly approved / agronomist-reviewed SSOT rows.
 *   - Unsupported facts fail closed with an evidence-gap response.
 *
 * The orchestrator decides WHEN this plane is eligible (NLU execution_mode=KNOWLEDGE
 * with zero real symptom evidence). This module owns only deterministic fact
 * resolution and provenance.
 */

import { normalizeCropCode, getFullCropName } from '../utils/crop-code-normalizer.ts';

export type KnowledgeResponseType =
  | 'CROP_INFO'
  | 'CROP_STAGE_KNOWLEDGE'
  | 'FERTILIZER_KNOWLEDGE'
  | 'PEST_KNOWLEDGE'
  | 'WEED_KNOWLEDGE'
  | 'CHEMICAL_STATUS'
  | 'HERBICIDE_KNOWLEDGE'
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
  execution_mode?: 'KNOWLEDGE' | 'DECISION' | 'MIXED';
  knowledge_subject?: 'CROP' | 'STAGE' | 'FERTILIZER' | 'PEST' | 'WEED' | 'CHEMICAL' | 'NONE';
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

function detectTopic(subject?: KnowledgeQueryInput['knowledge_subject']): KnowledgeResponseType {
  // The NLU knowledge_subject is the only topic authority: it reads the
  // farmer's meaning in any language. No keyword lists live in this module.
  if (subject === 'FERTILIZER') return 'FERTILIZER_KNOWLEDGE';
  if (subject === 'PEST') return 'PEST_KNOWLEDGE';
  if (subject === 'WEED') return 'WEED_KNOWLEDGE';
  if (subject === 'STAGE') return 'CROP_STAGE_KNOWLEDGE';
  if (subject === 'CHEMICAL') return 'CHEMICAL_STATUS';
  return 'CROP_INFO';
}

function canonicalCrop(input: KnowledgeQueryInput): string {
  const fromLand = normalizeCropCode(input.land_context?.current_crop ?? '');
  if (fromLand) return fromLand;
  return normalizeCropCode(input.farmer_message);
}

function localLabel(row: any, language: string): string {
  const lang = String(language || 'en').toLowerCase().split('-')[0];
  const localized = lang && lang !== 'en' ? row?.['label_' + lang] : null;
  if (localized) return String(localized);
  return String(row?.label || row?.local_name || row?.value || '');
}

/** DB vocabulary codes (snake_case) → readable words; free text is unchanged. */
function readable(value: unknown): string {
  return String(value ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function sameStage(a: unknown, b: unknown): boolean {
  const x = String(a ?? '').trim().toLowerCase();
  const y = String(b ?? '').trim().toLowerCase();
  return !!x && x === y;
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
    .select('*')
    .eq('value', crop)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const label = localLabel(data, input.language) || getFullCropName(crop);
  const pieces: string[] = [];
  if (label) pieces.push('Crop: ' + label);
  // The land record is the SSOT for "which crop is in this field": when the
  // question is about the farmer's own land crop, state its live position too.
  const landCrop = normalizeCropCode(input.land_context?.current_crop ?? '');
  const landStage = String(input.land_context?.growth_stage ?? '').trim();
  const landDas = input.land_context?.days_since_sowing;
  if (landCrop && landCrop === crop && landStage) {
    pieces.push(
      'Your field: ' + readable(landStage) + ' stage' +
      (typeof landDas === 'number' ? ' (' + String(landDas) + ' days after sowing)' : '') + '.',
    );
  }
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
      field_stage: landCrop === crop ? (landStage || null) : null,
      field_das: landCrop === crop && typeof landDas === 'number' ? landDas : null,
    },
    provenance: [{ table: 'crops', row_id: data.value, authority: 'structured SSOT' }],
    processing_time_ms: performance.now() - started,
  };
}

async function stageProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  const started = performance.now();
  const stage = String(input.land_context?.growth_stage ?? '').trim();
  const lane = String(input.land_context?.cultivation_method ?? '').trim().toLowerCase();

  // 1) Full stage list from crop_stage_master (crop stage SSOT), one lane only.
  const { data: masterRows, error: masterErr } = await input.supabase
    .from('crop_stage_master')
    .select('id,crop_code,growth_stage,stage_code,das_min,das_max,stage_description,phenology_index,cultivation_method,is_active')
    .eq('crop_code', crop)
    .eq('is_active', true)
    .limit(100);

  let laneRows: any[] = [];
  let laneUsed: string | null = null;
  if (!masterErr && Array.isArray(masterRows) && masterRows.length > 0) {
    const lanes = uniqueStrings(masterRows.map((r: any) => String(r.cultivation_method ?? '').toLowerCase()));
    if (lane && masterRows.some((r: any) => String(r.cultivation_method ?? '').toLowerCase() === lane)) {
      laneRows = masterRows.filter((r: any) => String(r.cultivation_method ?? '').toLowerCase() === lane);
      laneUsed = lane;
    } else if (lanes.length <= 1) {
      laneRows = masterRows;
      laneUsed = lanes[0] || null;
    }
    // Several lanes and the land's lane is unknown: a merged list would give
    // contradictory DAS windows for the same stage name, so no list is served.
    laneRows = laneRows
      .filter((r: any) => r.phenology_index != null || r.das_min != null)
      .sort((x: any, y: any) =>
        (Number(x.phenology_index ?? 999) - Number(y.phenology_index ?? 999)) ||
        (Number(x.das_min ?? 9999) - Number(y.das_min ?? 9999)));
  }

  // 2) Agronomist-reviewed guidance for the land's current stage.
  let knowledgeRow: any = null;
  if (stage) {
    const { data: ksRows, error: ksErr } = await input.supabase
      .from('crop_stage_knowledge')
      .select('id,crop_code,growth_stage,water,fertilizer,pest_watch,disease_watch,critical_actions,avoid_actions,source,reviewed_by_agronomist')
      .eq('crop_code', crop)
      .eq('reviewed_by_agronomist', true)
      .limit(100);
    if (!ksErr && Array.isArray(ksRows)) {
      knowledgeRow = ksRows.find((r: any) => sameStage(r.growth_stage, stage)) ?? null;
    }
  }

  if (laneRows.length === 0 && !knowledgeRow) return null;

  const pieces: string[] = [];
  const provenance: Array<Record<string, unknown>> = [];
  const stageFacts = laneRows.map((row: any) => ({
    growth_stage: row.growth_stage ?? row.stage_code ?? null,
    das_min: row.das_min ?? null,
    das_max: row.das_max ?? null,
    description: row.stage_description ?? null,
    is_current: sameStage(row.growth_stage, stage),
  }));

  if (stageFacts.length > 0) {
    pieces.push(
      'Crop stages of ' + getFullCropName(crop) +
      (laneUsed ? ' (' + readable(laneUsed) + ')' : '') + ':',
    );
    for (const row of stageFacts) {
      const das = row.das_min != null || row.das_max != null
        ? ' (' + String(row.das_min ?? '?') + '–' + String(row.das_max ?? '?') + ' days)'
        : '';
      pieces.push(
        '- ' + readable(row.growth_stage) + das +
        (row.is_current ? ' ← your crop is here now' : '') +
        (row.description ? ': ' + String(row.description) : ''),
      );
    }
    for (const row of laneRows) provenance.push({ table: 'crop_stage_master', row_id: row.id, source: 'structured SSOT' });
  }

  const pestWatch = cleanStringArray(knowledgeRow?.pest_watch).map(readable);
  const diseaseWatch = cleanStringArray(knowledgeRow?.disease_watch).map(readable);
  const critical = cleanStringArray(knowledgeRow?.critical_actions).map(readable);
  const avoid = cleanStringArray(knowledgeRow?.avoid_actions).map(readable);
  if (knowledgeRow) {
    const das = input.land_context?.days_since_sowing;
    pieces.push(
      (pieces.length ? '\n' : '') + 'Current stage: ' + readable(knowledgeRow.growth_stage) +
      (typeof das === 'number' ? ' (' + String(das) + ' days after sowing)' : ''),
    );
    if (knowledgeRow.water) pieces.push('Water: ' + String(knowledgeRow.water));
    if (knowledgeRow.fertilizer) pieces.push('Fertilizer note: ' + String(knowledgeRow.fertilizer));
    if (pestWatch.length) pieces.push('Pest watch: ' + pestWatch.join('; '));
    if (diseaseWatch.length) pieces.push('Disease watch: ' + diseaseWatch.join('; '));
    if (critical.length) pieces.push('Critical actions: ' + critical.join('; '));
    if (avoid.length) pieces.push('Avoid: ' + avoid.join('; '));
    provenance.push({
      table: 'crop_stage_knowledge',
      row_id: knowledgeRow.id,
      source: knowledgeRow.source ?? null,
      reviewed_by_agronomist: true,
    });
  }

  return {
    handled: true,
    response: pieces.join('\n'),
    response_type: 'CROP_STAGE_KNOWLEDGE',
    provider: 'CropStageKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: knowledgeRow
      ? String(knowledgeRow.source || 'agronomist reviewed crop_stage_knowledge')
      : 'crop_stage_master',
    confidence: knowledgeRow ? 0.99 : 0.97,
    facts: {
      crop_code: crop,
      cultivation_method: laneUsed,
      stages: stageFacts,
      current_stage: stage || null,
      water: knowledgeRow?.water ?? null,
      fertilizer: knowledgeRow?.fertilizer ?? null,
      pest_watch: pestWatch,
      disease_watch: diseaseWatch,
      critical_actions: critical,
      avoid_actions: avoid,
    },
    provenance,
    processing_time_ms: performance.now() - started,
  };
}

/**
 * split_schedule is stored as JSON text: [{stage, nutrient, percent}, …].
 * Render it as "N 50% at transplanting; …" grouped by stage, in stored order.
 * Unparseable text is returned unchanged (never guessed).
 */
function renderSplitSchedule(raw: unknown): string {
  if (raw == null || raw === '') return '';
  let items: any[] | null = null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* free text — keep as is */ }
  if (!items) return String(raw);
  const byStage = new Map<string, string[]>();
  for (const it of items) {
    const stage = readable(it?.stage);
    const nutrient = String(it?.nutrient ?? '').trim();
    const pct = it?.percent;
    if (!stage || !nutrient || pct == null) continue;
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)!.push(nutrient + ' ' + String(pct) + '%');
  }
  if (byStage.size === 0) return String(raw);
  return Array.from(byStage.entries()).map(([stage, parts]) => 'at ' + stage + ': ' + parts.join(', ')).join('; ');
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
  const splitText = renderSplitSchedule(row.split_schedule);
  if (splitText) pieces.push('Split schedule: ' + splitText);
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
    .select('weed_code,scientific_name,common_names,weed_type,lifecycle,season,crop_associations,resistance_notes,management_note,source,authority,confidence,review_status,is_active')
    .eq('review_status', 'approved')
    .eq('is_active', true)
    .limit(100);

  if (error || !Array.isArray(data)) return null;

  // crop_associations hold crop codes, 'all crops', or a qualified form such
  // as 'all crops (edge ingress)' / '<crop> (<note>)' — the parenthetical note
  // never changes which crop the weed belongs to.
  const rows = (data as any[]).filter((row) =>
    cleanStringArray(row.crop_associations).some((association) => {
      const base = association.toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
      return base === crop.toLowerCase() || base === 'all crops';
    }),
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

function pestDisplayName(row: any, language: string): string {
  const lang = String(language || 'en').toLowerCase().split('-')[0];
  const en = String(row?.pest_name_en ?? '').trim();
  const local = lang && lang !== 'en' ? String(row?.['pest_name_' + lang] ?? '').trim() : '';
  const base = en || readable(row?.pest_code);
  return local && local !== base ? base + ' (' + local + ')' : base;
}

function pestNameVariants(row: any): string[] {
  return [row?.pest_code, row?.pest_name_en, row?.pest_name_hi, row?.pest_name_mr]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter((v) => v.length >= 2);
}

async function pestProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  // TDZ FIX (2026-10-09): `started` was declared below the try block but read
  // inside it — ReferenceError on the named-pest path. Hoisted above the try.
  const started = performance.now();
  const stage = String(input.land_context?.growth_stage ?? '').trim();
  const message = String(input.farmer_message || '').toLowerCase();

  // etl_standards is the crop-scoped, ICAR-sourced pest record (economic
  // threshold, sampling method, susceptible stages, localized names).
  let etlRows: any[] = [];
  try {
    const { data } = await input.supabase
      .from('etl_standards')
      .select('id,pest_code,pest_name_en,pest_name_hi,pest_name_mr,crop_code,growth_stage,etl_value,etl_unit,sampling_unit,action_threshold,sampling_method,icar_source,is_active')
      .eq('crop_code', crop)
      .eq('is_active', true)
      .limit(200);
    etlRows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[PestKnowledgeProvider] etl_standards lookup failed:', (e as Error).message);
  }

  // 1) A pest named in the message (any script) — DB vocabulary only.
  let named: any[] = etlRows.filter((row) => pestNameVariants(row).some((v) => message.includes(v)));
  if (named.length === 0) {
    try {
      const { data: pestRows } = await input.supabase
        .from('pest_master')
        .select('pest_code,pest_name_en,pest_name_hi,pest_name_mr')
        .eq('is_active', true)
        .limit(500);
      named = (pestRows || []).filter((row: any) => pestNameVariants(row).some((v) => message.includes(v)));
    } catch (e) {
      console.warn('[PestKnowledgeProvider] name lookup failed:', (e as Error).message);
    }
  }
  const namedCodes = uniqueStrings(named.map((r: any) => String(r.pest_code ?? '').toUpperCase()));
  if (namedCodes.length === 1) {
    const row = named[0];
    const etl = etlRows.find((r) => String(r.pest_code ?? '').toUpperCase() === namedCodes[0]) ?? null;
    const pieces = ['Pest: ' + pestDisplayName(etl ?? row, input.language) + ' (' + String(row.pest_code) + ')'];
    if (etl) {
      const stages = cleanStringArray(etl.growth_stage);
      if (stages.length) {
        pieces.push(
          'Attacks ' + getFullCropName(crop) + ' at: ' + stages.map(readable).join(', ') +
          (stage && stages.some((st) => sameStage(st, stage)) ? ' — this includes your crop\'s current stage.' : ''),
        );
      }
      const unit = String(etl.sampling_unit || readable(etl.etl_unit) || '').trim();
      if (etl.etl_value != null) pieces.push('Economic threshold level (ETL): ' + String(etl.etl_value) + (unit ? ' ' + unit : ''));
      if (etl.action_threshold != null) pieces.push('Action threshold: ' + String(etl.action_threshold) + (unit ? ' ' + unit : ''));
      if (etl.sampling_method) pieces.push('How to check: ' + String(etl.sampling_method));
    }
    return {
      handled: true,
      response: pieces.join('\n'),
      response_type: 'PEST_KNOWLEDGE',
      provider: 'PestKnowledgeProvider',
      authority_status: 'VERIFIED',
      authority: etl ? String(etl.icar_source || 'etl_standards') : 'pest_master',
      confidence: 0.99,
      facts: {
        pest_code: row.pest_code,
        name_en: row.pest_name_en ?? null,
        name_hi: row.pest_name_hi ?? null,
        name_mr: row.pest_name_mr ?? null,
        crop_code: crop,
        stages: etl ? cleanStringArray(etl.growth_stage) : [],
        etl_value: etl?.etl_value ?? null,
        etl_unit: etl?.sampling_unit ?? etl?.etl_unit ?? null,
        action_threshold: etl?.action_threshold ?? null,
      },
      provenance: etl
        ? [{ table: 'etl_standards', row_id: etl.id, source: etl.icar_source ?? null }]
        : [{ table: 'pest_master', row_id: row.pest_code, source: 'structured SSOT' }],
      processing_time_ms: performance.now() - started,
    };
  }

  // 2) Pest list for the crop, current-stage pests first.
  if (etlRows.length > 0) {
    const isNow = (r: any) => !!stage && cleanStringArray(r.growth_stage).some((st) => sameStage(st, stage));
    const ordered = [...etlRows].sort((x, y) => Number(isNow(y)) - Number(isNow(x)));
    const lines = ordered.map((r) => {
      const unit = String(r.sampling_unit || readable(r.etl_unit) || '').trim();
      const etl = r.etl_value != null ? ' — ETL ' + String(r.etl_value) + (unit ? ' ' + unit : '') : '';
      return '- ' + pestDisplayName(r, input.language) + etl + (isNow(r) ? ' (watch now at ' + readable(stage) + ')' : '');
    });
    return {
      handled: true,
      response: 'Main pests of ' + getFullCropName(crop) + ' (economic threshold level per ICAR standards):\n' + lines.join('\n'),
      response_type: 'PEST_KNOWLEDGE',
      provider: 'PestKnowledgeProvider',
      authority_status: 'VERIFIED',
      authority: 'etl_standards (ICAR)',
      confidence: 0.97,
      facts: {
        crop_code: crop,
        growth_stage: stage || null,
        pests: ordered.map((r) => ({
          pest_code: r.pest_code,
          name_en: r.pest_name_en ?? null,
          stages: cleanStringArray(r.growth_stage),
          etl_value: r.etl_value ?? null,
          etl_unit: r.sampling_unit ?? r.etl_unit ?? null,
          current_stage: isNow(r),
        })),
      },
      provenance: ordered.map((r) => ({ table: 'etl_standards', row_id: r.id, source: r.icar_source ?? null })),
      processing_time_ms: performance.now() - started,
    };
  }

  // 3) Fallback: agronomist-reviewed pest-watch across all stages of the crop.
  const { data, error } = await input.supabase
    .from('crop_stage_knowledge')
    .select('id,crop_code,growth_stage,pest_watch,source,reviewed_by_agronomist')
    .eq('crop_code', crop)
    .eq('reviewed_by_agronomist', true)
    .limit(100);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const nowRow = stage ? data.find((r: any) => sameStage(r.growth_stage, stage)) : null;
  const nowWatch = uniqueStrings(cleanStringArray(nowRow?.pest_watch).map(readable));
  const allWatch = uniqueStrings(data.flatMap((row: any) => cleanStringArray(row.pest_watch).map(readable)));
  if (!allWatch.length) return null;

  const pieces = ['Pest-watch records for ' + getFullCropName(crop) + ':', ...allWatch.map((item) => '- ' + item)];
  if (nowWatch.length) pieces.push('At your current stage (' + readable(stage) + ') watch for: ' + nowWatch.join('; '));

  return {
    handled: true,
    response: pieces.join('\n'),
    response_type: 'PEST_KNOWLEDGE',
    provider: 'PestKnowledgeProvider',
    authority_status: 'VERIFIED',
    authority: 'agronomist-reviewed crop_stage_knowledge',
    confidence: 0.96,
    facts: { crop_code: crop, growth_stage: stage || null, pest_watch: allWatch, current_stage_watch: nowWatch },
    provenance: data.map((row: any) => ({
      table: 'crop_stage_knowledge',
      row_id: row.id,
      source: row.source ?? null,
      reviewed_by_agronomist: true,
    })),
    processing_time_ms: performance.now() - started,
  };
}

async function herbicideKnowledgeProvider(input: KnowledgeQueryInput, crop: string): Promise<KnowledgeQueryOutput | null> {
  // No dedicated approved herbicide knowledge master exists in the verified
  // schema. Do not repurpose conditional treatment rules as static facts.
  // Named regulatory status questions are still answered by chemicalStatusProvider.
  return null;
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
    // Farmer-facing: plain words, no internal terms (translated downstream).
    response: 'I do not have verified information for this question yet, so I will not give a guessed answer.',
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

  if (String(input.execution_mode || '').toUpperCase() !== 'KNOWLEDGE') {
    return {
      handled: false,
      confidence: 0,
      processing_time_ms: performance.now() - started,
      reason: 'EXECUTION_MODE_NOT_KNOWLEDGE',
    };
  }

  const crop = canonicalCrop(input);
  const topic = detectTopic(input.knowledge_subject);

  // Regulatory status is safe to resolve directly only when a chemical name is
  // actually present in the farmer's message.
  const chemical = await chemicalStatusProvider(input);
  if (chemical) {
    chemical.processing_time_ms = performance.now() - started;
    return chemical;
  }

  // A chemical-subject question with no registered chemical named in it has
  // no verified fact to serve here (product choice is a field decision).
  if (topic === 'CHEMICAL_STATUS') {
    const gap = evidenceGap(input, crop, topic, started);
    gap.reason = 'NO_NAMED_CHEMICAL_IN_REGISTRY';
    return gap;
  }

  if (!crop) {
    return evidenceGap(input, '', topic, started);
  }

  let result: KnowledgeQueryOutput | null = null;

  if (topic === 'HERBICIDE_KNOWLEDGE') {
    result = await herbicideKnowledgeProvider(input, crop);
  } else if (topic === 'FERTILIZER_KNOWLEDGE') {
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
  return evidenceGap(input, crop, topic, started);
}

export default { queryKnowledgePlane };
